/**
 * Dessin de l'herbe en traits avec WebGL, sans PIXI : aperçu de l'éditeur et image exportée.
 * Le calque de la scène Foundry dessine les mêmes brins avec PIXI (wind-layer.js).
 */
import {
  GRASS_VERT, GRASS_FRAG, BLADE_CORNERS, MAX_PUSHERS, windUniforms, lod, visibleChunks
} from "./grass-legacy.js";

const NO_PUSH = new Float32Array(MAX_PUSHERS * 4);

export class GrassRenderer {
  /**
   * @param {HTMLCanvasElement|OffscreenCanvas} canvas
   * @param {{preserve?:boolean}} [options]  preserve : garder l'image après le dessin (export)
   */
  constructor(canvas, { preserve = false } = {}) {
    this.canvas = canvas;
    const attrs = { antialias: true, premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: preserve };
    let gl = canvas.getContext("webgl2", attrs);
    this.instancing = null;
    if (gl) {
      this.instancing = { divisor: (i, d) => gl.vertexAttribDivisor(i, d), draw: (m, f, c, n) => gl.drawArraysInstanced(m, f, c, n) };
    } else {
      gl = canvas.getContext("webgl", attrs);
      const ext = gl?.getExtension("ANGLE_instanced_arrays");
      if (ext) this.instancing = { divisor: (i, d) => ext.vertexAttribDivisorANGLE(i, d), draw: (m, f, c, n) => ext.drawArraysInstancedANGLE(m, f, c, n) };
    }
    if (!gl || !this.instancing) throw new Error("WebGL indisponible");
    this.gl = gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, GRASS_VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, GRASS_FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    this.prog = prog;
    this.loc = {};
    for (const n of ["projectionMatrix", "translationMatrix", "uTime", "uStrength", "uSpeed", "uLength", "uWidth", "uSpread", "uWind", "uMode", "uPush", "uAlpha"]) {
      this.loc[n] = gl.getUniformLocation(prog, n === "uPush" ? "uPush[0]" : n);
    }
    this.aCorner = gl.getAttribLocation(prog, "aVertexPosition");
    this.aRoot = gl.getAttribLocation(prog, "aRoot");
    this.corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners);
    gl.bufferData(gl.ARRAY_BUFFER, BLADE_CORNERS, gl.STATIC_DRAW);
    this.buffers = [];
    this.field = null;
  }

  /** Nouveau champ de brins (bladeField) et nouveau vent. */
  setField(field, wind) {
    const gl = this.gl;
    for (const b of this.buffers) gl.deleteBuffer(b);
    this.buffers = field.chunks.map((c) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, c.roots, gl.STATIC_DRAW);
      return b;
    });
    this.field = field;
    this.wind = wind;
  }

  /**
   * Dessine le champ.
   * @param {object} o
   * @param {number} o.width, o.height   taille de la zone de dessin en pixels
   * @param {number} o.scale             pixels par case
   * @param {number} o.tx, o.ty          position de l'origine de la carte, en pixels
   * @param {number} o.time              secondes
   * @param {Float32Array} [o.push]      poussées (packPushers)
   * @param {number} [o.cap]             part maximale de brins (réglage léger)
   */
  render({ width, height, scale, tx, ty, time, push = NO_PUSH, cap = 1 }) {
    const gl = this.gl;
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.field?.count) return;
    const { fraction, widthScale } = lod(this.field.gap, scale, cap);
    const u = windUniforms(this.wind, this.field.gap, widthScale);
    gl.useProgram(this.prog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    // Cases → pixels → espace de découpe (y vers le bas).
    gl.uniformMatrix3fv(this.loc.translationMatrix, false, [scale, 0, 0, 0, scale, 0, tx, ty, 1]);
    gl.uniformMatrix3fv(this.loc.projectionMatrix, false, [2 / width, 0, 0, 0, -2 / height, 0, -1, 1, 1]);
    gl.uniform1f(this.loc.uTime, time);
    gl.uniform1f(this.loc.uStrength, u.uStrength);
    gl.uniform1f(this.loc.uSpeed, u.uSpeed);
    gl.uniform1f(this.loc.uLength, u.uLength);
    gl.uniform1f(this.loc.uWidth, u.uWidth);
    gl.uniform1f(this.loc.uSpread, u.uSpread);
    gl.uniform2fv(this.loc.uWind, u.uWind);
    gl.uniform1i(this.loc.uMode, u.uMode);
    gl.uniform4fv(this.loc.uPush, push);
    gl.uniform1f(this.loc.uAlpha, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners);
    gl.enableVertexAttribArray(this.aCorner);
    gl.vertexAttribPointer(this.aCorner, 2, gl.FLOAT, false, 0, 0);
    this.instancing.divisor(this.aCorner, 0);
    gl.enableVertexAttribArray(this.aRoot);
    this.instancing.divisor(this.aRoot, 1);
    const view = visibleChunks(this.field, -tx / scale, -ty / scale, (width - tx) / scale, (height - ty) / scale);
    for (const c of view) {
      const n = Math.max(1, Math.round(c.count * fraction));
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[this.field.chunks.indexOf(c)]);
      gl.vertexAttribPointer(this.aRoot, 2, gl.FLOAT, false, 0, 0);
      this.instancing.draw(gl.TRIANGLE_STRIP, 0, 4, n);
    }
    this.instancing.divisor(this.aRoot, 0);
  }

  destroy() {
    const gl = this.gl;
    for (const b of this.buffers) gl.deleteBuffer(b);
    gl.deleteBuffer(this.corners);
    gl.deleteProgram(this.prog);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

/**
 * Herbe figée (vent du moment t = 0) peinte sur une image déjà rendue, par tuiles : l'image
 * exportée peut être plus grande que ce qu'accepte la carte graphique d'un coup.
 * @param {CanvasRenderingContext2D} ctx  image de la carte
 * @param {object} field  bladeField
 * @param {object} wind   réglages normalisés
 * @param {number} scale  pixels par case de l'image
 */
export function paintStillGrass(ctx, field, wind, scale, { tile = 2048, ox = 0, oy = 0 } = {}) {
  // ox, oy : position (pixels de l'image entière) du coin de ce canvas, pour un fond découpé.
  if (!field?.count) return;
  const glCanvas = document.createElement("canvas");
  const r = new GrassRenderer(glCanvas, { preserve: true });
  try {
    r.setField(field, wind);
    const W = ctx.canvas.width, H = ctx.canvas.height;
    for (let y = 0; y < H; y += tile) {
      for (let x = 0; x < W; x += tile) {
        const w = Math.min(tile, W - x), h = Math.min(tile, H - y);
        r.render({ width: w, height: h, scale, tx: -(x + ox), ty: -(y + oy), time: 0 });
        ctx.drawImage(glCanvas, 0, 0, w, h, x, y, w, h);
      }
    }
  } finally {
    r.destroy();
  }
}

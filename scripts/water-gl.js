/**
 * Dessin de l'eau avec WebGL, sans PIXI : aperçu de l'éditeur et image exportée.
 * Le calque de la scène Foundry dessine la même eau avec PIXI (water-layer.js).
 */
import {
  SURFACE_VERT, SURFACE_FRAG, FLOAT_VERT, FLOAT_FRAG, QUAD_CORNERS, INSTANCE_FLOATS, fieldPixels, surfaceUniforms
} from "./water.js";

function program(gl, vs, fs) {
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

export class WaterRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{preserve?:boolean}} [options]  preserve : garder l'image après le dessin (export)
   */
  constructor(canvas, { preserve = false } = {}) {
    this.canvas = canvas;
    const attrs = { antialias: true, premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: preserve };
    let gl = canvas.getContext("webgl2", attrs);
    if (gl) {
      this.inst = { divisor: (i, d) => gl.vertexAttribDivisor(i, d), draw: (m, f, c, n) => gl.drawArraysInstanced(m, f, c, n) };
    } else {
      gl = canvas.getContext("webgl", attrs);
      const ext = gl?.getExtension("ANGLE_instanced_arrays");
      if (ext) this.inst = { divisor: (i, d) => ext.vertexAttribDivisorANGLE(i, d), draw: (m, f, c, n) => ext.drawArraysInstancedANGLE(m, f, c, n) };
    }
    if (!gl || !this.inst) throw new Error("WebGL indisponible");
    this.gl = gl;
    this.surface = program(gl, SURFACE_VERT, SURFACE_FRAG);
    this.floats = program(gl, FLOAT_VERT, FLOAT_FRAG);
    this.uS = {};
    for (const n of ["projectionMatrix", "translationMatrix", "uField", "uMapSize", "uTime", "uGlow", "uAlpha", "uMode", "uRocks", "uRockN"]) {
      this.uS[n] = gl.getUniformLocation(this.surface, n === "uRocks" ? "uRocks[0]" : n);
    }
    this.uF = {};
    for (const n of ["projectionMatrix", "translationMatrix", "uMinWidth", "uAlpha"]) this.uF[n] = gl.getUniformLocation(this.floats, n);
    this.aS = gl.getAttribLocation(this.surface, "aVertexPosition");
    this.aF = gl.getAttribLocation(this.floats, "aVertexPosition");
    this.aP0 = gl.getAttribLocation(this.floats, "aP0");
    this.aP1 = gl.getAttribLocation(this.floats, "aP1");
    this.rect = gl.createBuffer();
    this.corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_CORNERS, gl.STATIC_DRAW);
    this.instBuf = gl.createBuffer();
    this.tex = gl.createTexture();
    this.field = null;
  }

  /** Nouveau champ de courant (buildField) et nouveaux réglages. */
  setField(field, settings) {
    const gl = this.gl;
    this.field = field;
    this.settings = settings;
    this.uniforms = surfaceUniforms(field, settings);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, field.W, field.H, 0, gl.RGBA, gl.UNSIGNED_BYTE, fieldPixels(field));
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) {
      gl.texParameteri(gl.TEXTURE_2D, k, v);
    }
    const w = field.W / field.R, h = field.H / field.R;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rect);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0, h, w, 0, w, h]), gl.STATIC_DRAW);
  }

  /**
   * Dessine l'eau.
   * @param {object} o
   * @param {number} o.width, o.height  taille de la zone de dessin en pixels
   * @param {number} o.scale            pixels par case
   * @param {number} o.tx, o.ty         position de l'origine de la carte, en pixels
   * @param {number} o.time             secondes
   * @param {object} [o.sim]            WaterSim : traits et particules à dessiner
   */
  render({ width, height, scale, tx, ty, time, sim = null }) {
    const gl = this.gl;
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.field) return;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const trans = [scale, 0, 0, 0, scale, 0, tx, ty, 1];
    const proj = [2 / width, 0, 0, 0, -2 / height, 0, -1, 1, 1];

    // Surface.
    const u = this.uniforms;
    gl.useProgram(this.surface);
    gl.uniformMatrix3fv(this.uS.translationMatrix, false, trans);
    gl.uniformMatrix3fv(this.uS.projectionMatrix, false, proj);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.uS.uField, 0);
    gl.uniform2fv(this.uS.uMapSize, u.uMapSize);
    gl.uniform1f(this.uS.uTime, time);
    gl.uniform1f(this.uS.uGlow, u.uGlow);
    gl.uniform1f(this.uS.uAlpha, 1);
    gl.uniform1i(this.uS.uMode, u.uMode);
    gl.uniform3fv(this.uS.uRocks, u.uRocks);
    gl.uniform1i(this.uS.uRockN, u.uRockN);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rect);
    gl.enableVertexAttribArray(this.aS);
    gl.vertexAttribPointer(this.aS, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Traits et particules.
    if (!sim?.count) return;
    gl.useProgram(this.floats);
    gl.uniformMatrix3fv(this.uF.translationMatrix, false, trans);
    gl.uniformMatrix3fv(this.uF.projectionMatrix, false, proj);
    gl.uniform1f(this.uF.uMinWidth, 0.9 / scale);     // jamais plus fin qu'un pixel
    gl.uniform1f(this.uF.uAlpha, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners);
    gl.enableVertexAttribArray(this.aF);
    gl.vertexAttribPointer(this.aF, 2, gl.FLOAT, false, 0, 0);
    this.inst.divisor(this.aF, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, sim.instances.subarray(0, sim.count * INSTANCE_FLOATS), gl.DYNAMIC_DRAW);
    const stride = INSTANCE_FLOATS * 4;
    for (const [loc, off] of [[this.aP0, 0], [this.aP1, 16]]) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, stride, off);
      this.inst.divisor(loc, 1);
    }
    this.inst.draw(gl.TRIANGLE_STRIP, 0, 4, sim.count);
    this.inst.divisor(this.aP0, 0);
    this.inst.divisor(this.aP1, 0);
    gl.disableVertexAttribArray(this.aP0);
    gl.disableVertexAttribArray(this.aP1);
  }

  destroy() {
    const gl = this.gl;
    for (const b of [this.rect, this.corners, this.instBuf]) gl.deleteBuffer(b);
    gl.deleteTexture(this.tex);
    gl.deleteProgram(this.surface);
    gl.deleteProgram(this.floats);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

/**
 * Eau figée (t = 0) peinte sur une image déjà rendue, par tuiles.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} field     buildField
 * @param {object} settings  normalizeWater
 * @param {number} scale     pixels par case de l'image
 */
export function paintStillWater(ctx, field, settings, scale, { tile = 2048 } = {}) {
  if (!field?.cells?.length) return;
  const glCanvas = document.createElement("canvas");
  const r = new WaterRenderer(glCanvas, { preserve: true });
  try {
    r.setField(field, settings);
    const W = ctx.canvas.width, H = ctx.canvas.height;
    for (let y = 0; y < H; y += tile) {
      for (let x = 0; x < W; x += tile) {
        const w = Math.min(tile, W - x), h = Math.min(tile, H - y);
        r.render({ width: w, height: h, scale, tx: -x, ty: -y, time: 0 });
        ctx.drawImage(glCanvas, 0, 0, w, h, x, y, w, h);
      }
    }
  } finally {
    r.destroy();
  }
}

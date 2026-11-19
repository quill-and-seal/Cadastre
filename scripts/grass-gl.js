/**
 * Dessin de l'herbe en traits avec WebGL, sans PIXI : aperçu de l'éditeur et image exportée.
 * Le calque de la scène Foundry dessine les mêmes brins avec PIXI (wind-layer.js).
 */
import {
  grassVert, GRASS_FRAG, BLADE_CORNERS, BLADE_BYTES, MAX_PUSHERS, windUniforms, lod, visibleChunks,
  drawCount, pushersFor, gustGrid, gustRect, packPushers, GUST_MAX
} from "./grass.js";

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
    // Lire le vent dans une image depuis le programme des sommets : presque toutes les cartes le permettent.
    this.gustTexture = gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) > 0;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, grassVert(this.gustTexture)));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, GRASS_FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    this.prog = prog;
    this.loc = {};
    for (const n of ["projectionMatrix", "translationMatrix", "uOrigin", "uTime", "uStrength", "uSpeed", "uLength", "uWidth", "uSpread", "uWind", "uFade", "uMode", "uPush", "uPushN", "uGust", "uGustRect", "uAlpha"]) {
      this.loc[n] = gl.getUniformLocation(prog, n === "uPush" ? "uPush[0]" : n);
    }
    this.aCorner = gl.getAttribLocation(prog, "aVertexPosition");
    this.aPos = gl.getAttribLocation(prog, "aPos");
    this.aStat = gl.getAttribLocation(prog, "aStat");
    this.corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners);
    gl.bufferData(gl.ARRAY_BUFFER, BLADE_CORNERS, gl.STATIC_DRAW);
    this.gustTex = gl.createTexture();
    this.gust = null;
    /** Tampons des morceaux, par empreinte : un morceau inchangé garde le sien. */
    this.buffers = new Map();
    this.field = null;
    this.stats = { blades: 0, chunks: 0 };
  }

  /** Nouveau champ de brins (bladeField) et nouveau vent. */
  setField(field, wind) {
    const gl = this.gl;
    const next = new Map();
    for (const c of field.chunks) {
      let b = this.buffers.get(c.key);
      if (b && b.data === c.data) { this.buffers.delete(c.key); next.set(c.key, b); continue; }
      b = { buf: gl.createBuffer(), data: c.data };
      gl.bindBuffer(gl.ARRAY_BUFFER, b.buf);
      gl.bufferData(gl.ARRAY_BUFFER, c.data, gl.STATIC_DRAW);
      next.set(c.key, b);
    }
    for (const b of this.buffers.values()) gl.deleteBuffer(b.buf);
    this.buffers = next;
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
   * @param {{x:number,y:number,r:number,s?:number}[]} [o.pushers]  jetons qui écartent l'herbe
   * @param {number} [o.cap]             part maximale de brins (réglage léger)
   */
  render({ width, height, scale, tx, ty, time, pushers = [], cap = 1 }) {
    const gl = this.gl;
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.stats = { blades: 0, chunks: 0 };
    if (!this.field?.count) return;
    const x0 = -tx / scale, y0 = -ty / scale, x1 = (width - tx) / scale, y1 = (height - ty) / scale;
    const view = visibleChunks(this.field, x0, y0, x1, y1);
    if (!view.length) return;
    const l = lod(this.field.gap, scale, cap);
    const u = windUniforms(this.wind, this.field.gap, l);
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
    gl.uniform2fv(this.loc.uFade, u.uFade);
    gl.uniform1i(this.loc.uMode, u.uMode);
    gl.uniform4fv(this.loc.uPush, pushers.length ? packPushers(pushers) : NO_PUSH);
    gl.uniform1f(this.loc.uAlpha, 1);
    if (this.gustTexture) {
      // Vent de l'image, sur ce qui est visible (pointes des brins comprises).
      const [gx0, gy0, gx1, gy1] = gustRect(this.field, x0, y0, x1, y1, u.uLength * 1.5);
      this.gust = gustGrid(gx0, gy0, gx1, gy1, time, this.wind, this.gust);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.gustTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, GUST_MAX, GUST_MAX, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, this.gust.data);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      gl.uniform1i(this.loc.uGust, 0);
      gl.uniform4fv(this.loc.uGustRect, this.gust.rect);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners);
    gl.enableVertexAttribArray(this.aCorner);
    gl.vertexAttribPointer(this.aCorner, 2, gl.FLOAT, false, 0, 0);
    this.instancing.divisor(this.aCorner, 0);
    gl.enableVertexAttribArray(this.aPos);
    gl.enableVertexAttribArray(this.aStat);
    this.instancing.divisor(this.aPos, 1);
    this.instancing.divisor(this.aStat, 1);
    for (const c of view) {
      const n = drawCount(c, l);
      gl.uniform2f(this.loc.uOrigin, c.cx, c.cy);
      gl.uniform1i(this.loc.uPushN, pushersFor(c, pushers));
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.get(c.key).buf);
      gl.vertexAttribPointer(this.aPos, 2, gl.UNSIGNED_SHORT, true, BLADE_BYTES, 0);
      gl.vertexAttribPointer(this.aStat, 4, gl.UNSIGNED_BYTE, true, BLADE_BYTES, 4);
      this.instancing.draw(gl.TRIANGLES, 0, 3, n);
      this.stats.blades += n;
      this.stats.chunks++;
    }
    this.instancing.divisor(this.aPos, 0);
    this.instancing.divisor(this.aStat, 0);
    gl.disableVertexAttribArray(this.aPos);
    gl.disableVertexAttribArray(this.aStat);
  }

  destroy() {
    const gl = this.gl;
    for (const b of this.buffers.values()) gl.deleteBuffer(b.buf);
    gl.deleteBuffer(this.corners);
    gl.deleteTexture(this.gustTex);
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
export function paintStillGrass(ctx, field, wind, scale, { tile = 2048 } = {}) {
  if (!field?.count) return;
  const glCanvas = document.createElement("canvas");
  const r = new GrassRenderer(glCanvas, { preserve: true });
  try {
    r.setField(field, wind);
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

/**
 * Aperçu du vent dans l'éditeur : un canevas au-dessus de la carte qui montre le reflet des
 * rafales et les touffes qui se couchent ; le pointeur écarte l'herbe comme le ferait un jeton.
 */
import {
  windField, grassZone, tuftPositions, buildTuftAtlas, bendIndex, updatePush, bucketTufts, paintSheen, TUFT_SCALE
} from "./wind.js";
import { ringsPath } from "./render.js";

const FPS = 30;
/** Résolution du reflet des rafales, en pixels par case (étiré à l'affichage). */
const SHEEN_PPC = 4;
/** Taille d'une pose de touffe dans la planche, en pixels. */
const ATLAS_CELL = 56;
/** Rayon d'influence du pointeur, en cases. */
const POINTER_RADIUS = 0.9;

export class WindPreview {
  constructor(editor) {
    this.editor = editor;
    this.enabled = false;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "cad-wind";
    editor.el.viewport.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.sheen = document.createElement("canvas");
    this.mask = document.createElement("canvas");
    this.atlasCanvas = document.createElement("canvas");
    this.state = null;
    this.time = 0;
    this._frame = null;
    this._dirtyTimer = null;
  }

  setEnabled(on) {
    this.enabled = !!on;
    this.canvas.hidden = !this.enabled;
    if (this.enabled) { this.rebuild(); this._loop(); }
    else if (this._frame) { cancelAnimationFrame(this._frame); this._frame = null; }
  }

  /** La carte a changé : la zone d'herbe sera recalculée un peu plus tard (pas à chaque coup de pinceau). */
  invalidate() {
    if (!this.enabled) return;
    clearTimeout(this._dirtyTimer);
    this._dirtyTimer = setTimeout(() => this.rebuild(), 250);
  }

  rebuild() {
    const map = this.editor.map;
    const zone = grassZone(map);
    const field = windField(map.wind);
    const tufts = tuftPositions(zone, map.wind.density, { seed: 7 });
    if (this.state?.dir !== field.dir) this.atlas = buildTuftAtlas(this.atlasCanvas, ATLAS_CELL, field.dir);
    // Masque de la zone d'herbe à la résolution du reflet.
    for (const c of [this.sheen, this.mask]) { c.width = Math.ceil(map.width * SHEEN_PPC); c.height = Math.ceil(map.height * SHEEN_PPC); }
    const m = this.mask.getContext("2d");
    m.clearRect(0, 0, this.mask.width, this.mask.height);
    m.setTransform(SHEEN_PPC, 0, 0, SHEEN_PPC, 0, 0);
    m.fillStyle = "#fff";
    const path = ringsPath(zone);
    if (path) m.fill(new Path2D(path), "nonzero");
    this.state = {
      field, tufts, dir: field.dir,
      buckets: bucketTufts(tufts),
      amount: new Float32Array(tufts.length),
      sector: new Uint8Array(tufts.length),
      width: map.width, height: map.height
    };
  }

  _loop() {
    let last = performance.now(), acc = 0;
    const step = (now) => {
      if (!this.enabled) return;
      this._frame = requestAnimationFrame(step);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.time += dt;
      acc += dt;
      if (acc < 1 / FPS) return;
      this.draw(acc);
      acc = 0;
    };
    this._frame = requestAnimationFrame(step);
  }

  draw(dt) {
    const s = this.state;
    if (!s) return;
    const { canvas, ctx } = this;
    const vp = this.editor.el.viewport.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(vp.width * dpr), h = Math.round(vp.height * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const { s: scale, tx, ty } = this.editor.view;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * tx, dpr * ty);

    // Niveau 1 : reflet des rafales, limité à l'herbe.
    const sc = this.sheen.getContext("2d");
    sc.globalCompositeOperation = "source-over";
    paintSheen(sc, s.field, this.time, s.width, s.height, SHEEN_PPC);
    sc.globalCompositeOperation = "destination-in";
    sc.drawImage(this.mask, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.sheen, 0, 0, s.width, s.height);

    // Niveaux 2 et 3 : touffes couchées par le vent, écartées par le pointeur.
    const p = this.editor.pointer;
    updatePush(s.tufts, p ? [{ x: p[0], y: p[1], r: POINTER_RADIUS }] : [], s.amount, s.sector, dt, s.buckets);
    const x0 = -tx / scale - 1, y0 = -ty / scale - 1, x1 = x0 + vp.width / scale + 2, y1 = y0 + vp.height / scale + 2;
    const cell = this.atlas.cell;
    for (let i = 0; i < s.tufts.length; i++) {
      const t = s.tufts[i];
      if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
      const push = s.amount[i];
      const f = push > 0.15
        ? this.atlas.frame(t.v, "push", s.sector[i], push > 0.6 ? 1 : 0)
        : this.atlas.frame(t.v, "wind", bendIndex(s.field.at(t.x, t.y, this.time)));
      const size = t.k * TUFT_SCALE;
      ctx.drawImage(this.atlasCanvas, f.x, f.y, cell, cell, t.x - size / 2, t.y - size / 2, size, size);
    }
  }

  destroy() {
    this.setEnabled(false);
    clearTimeout(this._dirtyTimer);
    this.canvas.remove();
  }
}

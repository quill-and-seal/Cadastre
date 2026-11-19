/**
 * Eau de l'éditeur : un canevas WebGL au-dessus de la carte qui dessine la surface de l'eau,
 * l'écume, les feuilles et, si on les veut, les traits du courant. Le bouton vague de la barre
 * du haut met l'animation en pause : l'eau reste alors figée, comme dans l'image exportée.
 */
import { waterFlag, buildField, normalizeWater, WaterSim } from "./water.js";
import { WaterRenderer } from "./water-gl.js";
import { log } from "./constants.js";

export class WaterPreview {
  constructor(editor) {
    this.editor = editor;
    this.enabled = true;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "cad-wind cad-water-gl";
    // Entre l'eau dessinée et les chemins, objets et murs, qui passent par-dessus.
    editor.el.viewport.insertBefore(this.canvas, editor.el.svgMid ?? editor.el.svgTop ?? null);
    try {
      this.renderer = new WaterRenderer(this.canvas);
    } catch (error) {
      log("Eau animée indisponible (WebGL)", error);
      this.renderer = null;
      this.canvas.hidden = true;
    }
    this.sim = null;
    this.time = 0;
    this._key = "";
    this._dirtyTimer = null;
    this._frame = null;
    if (this.renderer) { this.rebuild(); this._loop(); }
  }

  setEnabled(on) {
    this.enabled = !!on;
    this._key = "";
  }

  /** La carte a changé : l'eau sera recalculée un peu plus tard (pas à chaque coup de pinceau). */
  invalidate() {
    if (!this.renderer) return;
    clearTimeout(this._dirtyTimer);
    this._dirtyTimer = setTimeout(() => this.rebuild(), 250);
  }

  rebuild() {
    if (!this.renderer) return;
    const flag = waterFlag(this.editor.map);
    if (!flag) { this.field = null; this.sim = null; this.renderer.field = null; this._key = ""; return; }
    const settings = normalizeWater(flag.water);
    this.field = buildField(flag);
    this.renderer.setField(this.field, settings);
    this.sim = new WaterSim(this.field, settings);
    // Quelques secondes d'avance : l'écume a déjà trouvé sa place derrière les rochers.
    for (let i = 0; i < 60; i++) this.sim.step(1 / 20);
    this._key = "";
  }

  _loop() {
    let last = performance.now();
    const step = (now) => {
      this._frame = requestAnimationFrame(step);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (this.enabled) { this.time += dt; this.sim?.step(dt); }
      this.draw();
    };
    this._frame = requestAnimationFrame(step);
  }

  draw() {
    const vp = this.editor.el.viewport.getBoundingClientRect();
    if (!vp.width || !vp.height) return;
    const dpr = window.devicePixelRatio || 1;
    const { s: scale, tx, ty } = this.editor.view;
    const key = `${vp.width}|${vp.height}|${dpr}|${scale}|${tx}|${ty}|${!!this.field}`;
    if (!this.enabled && key === this._key) return;
    this._key = key;
    this.renderer.render({
      width: Math.round(vp.width * dpr), height: Math.round(vp.height * dpr),
      scale: scale * dpr, tx: tx * dpr, ty: ty * dpr,
      time: this.time, sim: this.sim
    });
  }

  destroy() {
    if (this._frame) cancelAnimationFrame(this._frame);
    clearTimeout(this._dirtyTimer);
    this.renderer?.destroy();
    this.canvas.remove();
  }
}

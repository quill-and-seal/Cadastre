/**
 * Eau de l'éditeur : un canevas WebGL entre l'eau dessinée et les chemins, objets et murs, qui
 * dessine la surface de l'eau, l'écume, les feuilles et, si on les veut, les traits du courant.
 * Le bouton vague de la barre du haut met l'animation en pause : l'eau reste alors figée,
 * comme dans l'image exportée.
 *
 * Le calcul se fait en arrière-plan (water-worker.js) et seulement quand une retouche touche
 * l'eau : peindre de l'herbe ailleurs ne remet pas l'écume à zéro.
 */
import { waterFlag, buildField, normalizeWater, WaterSim, waterVisible } from "./water.js";
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
    this.field = null;
    this.sim = null;
    this.time = 0;
    this._key = "";
    this._dirtyTimer = null;
    this._frame = null;
    this._job = 0;
    this._busy = false;
    this._again = false;
    this._lastKey = null;
    try {
      this.worker = new Worker(new URL("./water-worker.js", import.meta.url), { type: "module" });
      this.worker.onmessage = (event) => this._received(event.data);
      this.worker.onerror = (error) => { log("Calcul de l'eau en arrière-plan impossible", error); this._dropWorker(); };
    } catch (error) {
      this.worker = null;
    }
    if (this.renderer) { this.rebuild(); this._loop(); }
  }

  setEnabled(on) {
    this.enabled = !!on;
    this._key = "";
  }

  /** La carte a changé : l'eau sera revue un peu plus tard (pas à chaque coup de pinceau). */
  invalidate() {
    if (!this.renderer) return;
    clearTimeout(this._dirtyTimer);
    this._dirtyTimer = setTimeout(() => this.rebuild(), 150);
  }

  rebuild() {
    if (!this.renderer) return;
    if (!this.worker) return this._rebuildHere();
    if (this._busy) { this._again = true; return; }
    this._busy = true;
    this.worker.postMessage({ id: ++this._job, map: this.editor.map });
  }

  /** Même calcul que l'arrière-plan, ici (si l'arrière-plan n'est pas disponible). */
  _rebuildHere() {
    const flag = waterFlag(this.editor.map);
    if (!flag) { this._lastKey = null; return this._received({ id: this._job, empty: true }, true); }
    const settings = normalizeWater(flag.water);
    const { water, ...shape } = flag;
    const key = JSON.stringify(shape) + JSON.stringify([settings.strokes, settings.particles, settings.density]);
    if (key === this._lastKey) return this._received({ id: this._job, same: true, settings }, true);
    this._lastKey = key;
    const field = buildField(flag);
    const sim = new WaterSim(field, settings);
    for (let i = 0; i < 60; i++) sim.step(1 / 20);
    this._received({ id: this._job, field, settings, state: sim.state() }, true);
  }

  _received(msg, here = false) {
    if (!here) this._busy = false;
    if (msg.error) { log("Calcul de l'eau en arrière-plan impossible", msg.error); this._dropWorker(); return; }
    if (msg.id === this._job) {
      if (msg.empty) {
        this.field = null; this.sim = null; this.renderer.field = null;
      } else if (msg.same) {
        // Seuls des réglages de rendu ont pu changer : l'eau et son écume restent.
        if (this.field) { this.renderer.setSettings(msg.settings); if (this.sim) this.sim.s = msg.settings; }
      } else {
        this.field = msg.field;
        this.renderer.setField(msg.field, msg.settings, this.editor.map.gridSize || 100);
        this.sim = new WaterSim(msg.field, msg.settings, { state: msg.state });
      }
      this._key = "";
    }
    if (!here && this._again) { this._again = false; this.rebuild(); }
  }

  _dropWorker() {
    this.worker?.terminate();
    this.worker = null;
    this._busy = false;
    this._rebuildHere();
  }

  _loop() {
    let last = performance.now();
    const step = (now) => {
      this._frame = requestAnimationFrame(step);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // Onglet caché : rien à faire.
      if (document.hidden) return;
      this.draw(dt);
    };
    this._frame = requestAnimationFrame(step);
  }

  draw(dt = 0) {
    const vp = this.editor.el.viewport.getBoundingClientRect();
    if (!vp.width || !vp.height) return;
    const dpr = window.devicePixelRatio || 1;
    const { s: scale, tx, ty } = this.editor.view;
    const view = { x0: -tx / scale, y0: -ty / scale, x1: (vp.width - tx) / scale, y1: (vp.height - ty) / scale, ppc: scale * dpr };
    // Pas d'eau à l'écran : ni simulation ni dessin (une image vide suffit).
    const seen = !!this.field && waterVisible(this.field, view.x0, view.y0, view.x1, view.y1);
    const key = `${vp.width}|${vp.height}|${dpr}|${scale}|${tx}|${ty}|${!!this.field}|${seen}`;
    if (seen && this.enabled) { this.time += dt; this.sim?.step(dt, view); }
    else if (key === this._key) return;
    // En pause, la vue a changé : on prépare ce qui flotte dans la nouvelle vue, sans le faire avancer.
    else if (seen) this.sim?.step(0, view);
    this._key = key;
    this.renderer.render({
      width: Math.round(vp.width * dpr), height: Math.round(vp.height * dpr),
      scale: scale * dpr, tx: tx * dpr, ty: ty * dpr,
      time: this.time, sim: seen ? this.sim : null
    });
  }

  destroy() {
    if (this._frame) cancelAnimationFrame(this._frame);
    clearTimeout(this._dirtyTimer);
    this.worker?.terminate();
    this.renderer?.destroy();
    this.canvas.remove();
  }
}

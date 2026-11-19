/**
 * Herbe de l'éditeur : un canevas WebGL au-dessus de la carte qui dessine les brins.
 * Le vent les anime quand l'aperçu est allumé (bouton du haut) ; sinon ils restent figés,
 * comme dans l'image exportée. Le pointeur écarte l'herbe comme le ferait un jeton.
 *
 * Les brins sont calculés en arrière-plan (grass-worker.js) et seuls les morceaux de champ
 * touchés par une retouche sont recalculés : peindre ne fait pas d'à-coup.
 */
import { grassZone, normalizeWind } from "./wind.js";
import { bladeField, PushTrail } from "./grass.js";
import { GrassRenderer } from "./grass-gl.js";
import { log } from "./constants.js";

/** Rayon d'influence du pointeur, en cases. */
const POINTER_RADIUS = 0.6;

export class WindPreview {
  constructor(editor) {
    this.editor = editor;
    this.enabled = false;            // vent animé
    this.canvas = document.createElement("canvas");
    this.canvas.className = "cad-wind";
    // Entre la carte et la grille : sélection, aperçus et grille restent au-dessus de l'herbe.
    editor.el.viewport.insertBefore(this.canvas, editor.el.svgTop ?? null);
    try {
      this.renderer = new GrassRenderer(this.canvas);
    } catch (error) {
      log("Herbe en traits indisponible (WebGL)", error);
      this.renderer = null;
      this.canvas.hidden = true;
    }
    this.trail = new PushTrail();
    this.time = 0;
    this._key = "";
    this._dirtyTimer = null;
    this._frame = null;
    this._job = 0;
    this._busy = false;
    this._again = false;
    /** Morceaux affichés, par empreinte : leurs octets servent quand un morceau n'a pas changé. */
    this._chunks = new Map();
    try {
      this.worker = new Worker(new URL("./grass-worker.js", import.meta.url), { type: "module" });
      this.worker.onmessage = (event) => this._received(event.data);
      this.worker.onerror = (error) => { log("Calcul de l'herbe en arrière-plan impossible", error); this._dropWorker(); };
    } catch (error) {
      this.worker = null;
    }
    if (this.renderer) { this.rebuild(); this._loop(); }
  }

  /** Allume ou coupe l'animation du vent. */
  setEnabled(on) {
    this.enabled = !!on;
    this._key = "";
  }

  /** La carte a changé : les brins seront recalculés un peu plus tard (pas à chaque coup de pinceau). */
  invalidate() {
    if (!this.renderer) return;
    clearTimeout(this._dirtyTimer);
    this._dirtyTimer = setTimeout(() => this.rebuild(), 120);
  }

  rebuild() {
    if (!this.renderer) return;
    if (!this.worker) return this._rebuildHere();
    // Un calcul à la fois ; la dernière retouche est reprise à la fin de celui en cours.
    if (this._busy) { this._again = true; return; }
    this._busy = true;
    const previous = [...this._chunks.values()].map((c) => ({ key: c.key, cx: c.cx, cy: c.cy }));
    this.worker.postMessage({ id: ++this._job, map: this.editor.map, previous });
  }

  _rebuildHere() {
    const map = this.editor.map;
    const wind = normalizeWind(map.wind);
    this._apply(bladeField(grassZone(map), wind, { previous: this._chunks }), wind);
  }

  _received(msg) {
    this._busy = false;
    if (msg.error) { log("Calcul de l'herbe en arrière-plan impossible", msg.error); this._dropWorker(); return; }
    if (msg.id === this._job) {
      // Morceaux inchangés : on reprend les octets déjà affichés.
      for (const c of msg.field.chunks) if (!c.data) c.data = this._chunks.get(c.key)?.data;
      if (msg.field.chunks.every((c) => c.data)) this._apply(msg.field, msg.wind);
      else { this._chunks.clear(); this._again = true; }
    }
    if (this._again) { this._again = false; this.rebuild(); }
  }

  _dropWorker() {
    this.worker?.terminate();
    this.worker = null;
    this._busy = false;
    this._rebuildHere();
  }

  _apply(field, wind) {
    this.renderer.setField(field, wind);
    this._chunks = new Map(field.chunks.map((c) => [c.key, c]));
    this._key = "";
  }

  _loop() {
    let last = performance.now();
    const step = (now) => {
      this._frame = requestAnimationFrame(step);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // Onglet caché : rien à dessiner.
      if (document.hidden) return;
      if (this.enabled) this.time += dt;
      this.draw(dt);
    };
    this._frame = requestAnimationFrame(step);
  }

  draw(dt) {
    const vp = this.editor.el.viewport.getBoundingClientRect();
    if (!vp.width || !vp.height) return;
    const dpr = window.devicePixelRatio || 1;
    const { s: scale, tx, ty } = this.editor.view;
    const p = this.enabled ? this.editor.pointer : null;
    const movers = p ? [{ id: "pointer", x: p[0], y: p[1], r: POINTER_RADIUS }] : [];
    const pushers = this.trail.update(movers, dt);
    // Rien ne bouge (vent coupé ou nul, pas de pointeur) et rien n'a changé : inutile de redessiner.
    const still = !this.enabled || !this.renderer.wind?.strength;
    const key = `${vp.width}|${vp.height}|${dpr}|${scale}|${tx}|${ty}|${this.renderer.field?.count}`;
    if (still && !pushers.length && key === this._key) return;
    this._key = key;
    this.renderer.render({
      width: Math.round(vp.width * dpr), height: Math.round(vp.height * dpr),
      scale: scale * dpr, tx: tx * dpr, ty: ty * dpr,
      time: this.time, pushers
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

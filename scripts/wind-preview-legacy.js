/**
 * Herbe de l'éditeur : un canevas WebGL au-dessus de la carte qui dessine les brins.
 * Le vent les anime quand l'aperçu est allumé (bouton du haut) ; sinon ils restent figés,
 * comme dans l'image exportée. Le pointeur écarte l'herbe comme le ferait un jeton.
 */
import { grassZone, normalizeWind } from "./wind.js";
import { bladeField, packPushers, PushTrail } from "./grass-legacy.js";
import { GrassRenderer } from "./grass-gl-legacy.js";
import { log } from "./constants.js";

/** Rayon d'influence du pointeur, en cases. */
const POINTER_RADIUS = 0.6;

export class WindPreviewLegacy {
  constructor(editor) {
    this.editor = editor;
    this.enabled = false;            // vent animé
    this.canvas = document.createElement("canvas");
    this.canvas.className = "cad-wind";
    // Sous les chemins, objets, arbres et murs (comme dans la scène), au-dessus du sol et de l'eau.
    editor.el.viewport.insertBefore(this.canvas, editor.el.svgMid ?? editor.el.svgTop ?? null);
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
    this._dirtyTimer = setTimeout(() => this.rebuild(), 250);
  }

  rebuild() {
    if (!this.renderer) return;
    const map = this.editor.map;
    const wind = normalizeWind(map.wind);
    const field = bladeField(grassZone(map), wind);
    this.renderer.setField(field, wind);
    this._key = "";
  }

  _loop() {
    let last = performance.now();
    const step = (now) => {
      this._frame = requestAnimationFrame(step);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
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
    // Figée et sans rien de changé : inutile de redessiner.
    const key = `${vp.width}|${vp.height}|${dpr}|${scale}|${tx}|${ty}`;
    if (!this.enabled && !pushers.length && key === this._key) return;
    this._key = key;
    this.renderer.render({
      width: Math.round(vp.width * dpr), height: Math.round(vp.height * dpr),
      scale: scale * dpr, tx: tx * dpr, ty: ty * dpr,
      time: this.time, push: packPushers(pushers)
    });
  }

  destroy() {
    if (this._frame) cancelAnimationFrame(this._frame);
    clearTimeout(this._dirtyTimer);
    this.renderer?.destroy();
    this.canvas.remove();
  }
}

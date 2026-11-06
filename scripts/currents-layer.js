/**
 * Courant animé dans Foundry : les scènes exportées par Cadastre gardent les lignes de courant
 * de leurs rivières (drapeau `cadastre.currents`). Ce calque les dessine par-dessus le fond,
 * sous les jetons, et les fait glisser. Réglage par joueur : « Animer le courant des rivières ».
 */
import { MODULE_ID, log } from "./constants.js";
import { dashesAt } from "./currents.js";

/** Images par seconde du courant : suffisant pour un mouvement doux, léger pour la machine. */
const FPS = 30;
/** Rang de dessin dans le groupe principal : au-dessus du fond de scène, sous les tuiles et les jetons. */
const SORT_LAYER = 100;

let state = null;

export function registerCurrents() {
  game.settings.register(MODULE_ID, "animateWater", {
    name: "CADASTRE.Settings.AnimateWater",
    hint: "CADASTRE.Settings.AnimateWaterHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => refresh()
  });
  Hooks.on("canvasReady", () => refresh());
  Hooks.on("canvasTearDown", () => teardown());
  Hooks.on("updateScene", (scene, changes) => {
    if (scene.id === canvas.scene?.id && foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`)) refresh();
  });
}

function teardown() {
  if (!state) return;
  canvas.app?.ticker?.remove(state.tick);
  if (!state.gfx.destroyed) state.gfx.destroy();
  state = null;
}

function refresh() {
  teardown();
  const data = canvas.scene?.getFlag(MODULE_ID, "currents");
  if (!data?.lines?.length || !game.settings.get(MODULE_ID, "animateWater")) return;
  try {
    const gfx = new PIXI.Graphics();
    gfx.eventMode = "none";
    // Propriétés lues par le tri du groupe principal de Foundry.
    Object.assign(gfx, { elevation: 0, sortLayer: SORT_LAYER, sort: 0 });
    const parent = canvas.primary ?? canvas.stage;
    parent.addChild(gfx);
    parent.sortDirty = true;

    const d = canvas.dimensions;
    const size = d.size, ox = d.sceneX ?? d.sceneRect?.x ?? 0, oy = d.sceneY ?? d.sceneRect?.y ?? 0;
    const px = ([x, y]) => [ox + x * size, oy + y * size];
    let time = 0, since = 0;

    const draw = () => {
      gfx.clear();
      for (const line of data.lines) {
        const width = Math.max(1, line.width * size);
        for (const dash of dashesAt(line, time)) {
          if (dash.alpha <= 0.01) continue;
          const pts = dash.points.map(px);
          if (typeof gfx.lineStyle === "function") {
            // PIXI 7
            gfx.lineStyle({ width, color: 0xe9fffb, alpha: dash.alpha, cap: "round", join: "round" });
            gfx.moveTo(...pts[0]);
            for (let i = 1; i < pts.length; i++) gfx.lineTo(...pts[i]);
          } else {
            // PIXI 8
            gfx.moveTo(...pts[0]);
            for (let i = 1; i < pts.length; i++) gfx.lineTo(...pts[i]);
            gfx.stroke({ width, color: 0xe9fffb, alpha: dash.alpha, cap: "round", join: "round" });
          }
        }
      }
    };

    const tick = () => {
      const dt = (canvas.app.ticker.deltaMS ?? 16) / 1000;
      time += dt;
      since += dt;
      if (since < 1 / FPS) return;
      since = 0;
      draw();
    };
    draw();
    canvas.app.ticker.add(tick);
    state = { gfx, tick };
  } catch (error) {
    log("Courant non affiché", error);
    teardown();
  }
}

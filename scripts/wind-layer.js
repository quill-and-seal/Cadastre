/**
 * Herbe au vent, dans Foundry. Les scènes exportées par Cadastre gardent leur zone d'herbe et
 * leur vent (drapeau `cadastre.wind`). Ce calque, au-dessus du fond et sous les jetons, dessine
 * les mêmes brins que l'image de fond, animés par le vent, selon le réglage de chaque joueur :
 *   1 : léger (moins de brins animés, pour un ordinateur peu puissant)
 *   2 : brins animés
 *   3 : en plus, l'herbe s'écarte au passage des jetons
 * Coupé (0), l'image de fond montre l'herbe figée.
 */
import { MODULE_ID, log } from "./constants.js";
import { normalizeWind, WIND_LEVELS } from "./wind.js";
import {
  bladeField, lod, windUniforms, packPushers, PushTrail, GRASS_VERT, GRASS_FRAG, BLADE_CORNERS
} from "./grass.js";

/** Rang de dessin dans le groupe principal : au-dessus du fond de scène, sous les tuiles et les jetons. */
const SORT_LAYER = 100;
/** Part maximale des brins au niveau léger. */
const LIGHT_CAP = 0.35;

let state = null;

export function registerWind() {
  game.settings.register(MODULE_ID, "windLevel", {
    name: "CADASTRE.Settings.WindLevel",
    hint: "CADASTRE.Settings.WindLevelHint",
    scope: "client",
    config: true,
    type: Number,
    choices: {
      0: "CADASTRE.Settings.WindLevels.0",
      1: "CADASTRE.Settings.WindLevels.1",
      2: "CADASTRE.Settings.WindLevels.2",
      3: "CADASTRE.Settings.WindLevels.3"
    },
    default: WIND_LEVELS.FULL,
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
  if (!state.root.destroyed) state.root.destroy({ children: true });
  state.shader?.destroy?.();
  state = null;
}

/** Rectangle visible de la scène, en cases, et pixels d'écran par case. */
function viewRect(size, ox, oy) {
  const r = canvas.app.renderer;
  const wt = canvas.stage.worldTransform;
  const inv = wt.clone().invert();
  const a = inv.apply(new PIXI.Point(0, 0)), b = inv.apply(new PIXI.Point(r.screen.width, r.screen.height));
  return {
    x0: (Math.min(a.x, b.x) - ox) / size, y0: (Math.min(a.y, b.y) - oy) / size,
    x1: (Math.max(a.x, b.x) - ox) / size, y1: (Math.max(a.y, b.y) - oy) / size,
    ppc: size * Math.abs(canvas.stage.scale.x) * (r.resolution ?? 1)
  };
}

function refresh() {
  teardown();
  const data = canvas.scene?.getFlag(MODULE_ID, "wind");
  const level = Number(game.settings.get(MODULE_ID, "windLevel"));
  // Les scènes exportées avant la 0.1.7 ont l'ancienne herbe dans leur fond : on n'y ajoute rien.
  if (!data?.zone?.length || !level || (data.v ?? 1) < 2) return;
  try {
    const d = canvas.dimensions;
    const size = d.size, ox = d.sceneX ?? d.sceneRect?.x ?? 0, oy = d.sceneY ?? d.sceneRect?.y ?? 0;
    const wind = normalizeWind(data.wind);
    const field = bladeField(data.zone, wind);
    if (!field.count) return;

    const root = new PIXI.Container();
    root.eventMode = "none";
    Object.assign(root, { elevation: 0, sortLayer: SORT_LAYER, sort: 1 });
    // Les brins sont en cases : une seule mise à l'échelle place tout le champ sur la scène.
    root.position.set(ox, oy);
    root.scale.set(size);
    const parent = canvas.primary ?? canvas.stage;
    parent.addChild(root);
    parent.sortDirty = true;

    const push = packPushers([]);
    const uniforms = { ...windUniforms(wind, field.gap), uTime: 0, uPush: push, uAlpha: 1 };
    const shader = PIXI.Shader.from(GRASS_VERT, GRASS_FRAG, uniforms);
    const corners = new PIXI.Buffer(BLADE_CORNERS, true, false);
    const meshes = field.chunks.map((c) => {
      const geometry = new PIXI.Geometry()
        .addAttribute("aVertexPosition", corners, 2)
        .addAttribute("aRoot", new PIXI.Buffer(c.roots, true, false), 2, false, PIXI.TYPES.FLOAT, 0, 0, true);
      geometry.instanced = true;
      geometry.instanceCount = c.count;
      const mesh = new PIXI.Mesh(geometry, shader, undefined, PIXI.DRAW_MODES.TRIANGLE_STRIP);
      root.addChild(mesh);
      return { mesh, geometry, chunk: c };
    });

    const cap = level === WIND_LEVELS.LIGHT ? LIGHT_CAP : 1;
    const trail = new PushTrail();
    const movers = () => {
      if (level < WIND_LEVELS.FULL) return [];
      const out = [];
      for (const token of canvas.tokens?.placeables ?? []) {
        if (!token.visible) continue;
        const c = token.center;
        out.push({ id: token.id, x: (c.x - ox) / size, y: (c.y - oy) / size, r: Math.max(token.w, token.h) / size / 2 + 0.3 });
      }
      return out;
    };

    let time = 0;
    const tick = () => {
      const dt = Math.min(0.1, (canvas.app.ticker.deltaMS ?? 16) / 1000);
      time += dt;
      const view = viewRect(size, ox, oy);
      const { fraction, widthScale } = lod(field.gap, view.ppc, cap);
      Object.assign(uniforms, windUniforms(wind, field.gap, widthScale));
      uniforms.uTime = time;
      packPushers(trail.update(movers(), dt), push);
      for (const m of meshes) {
        const c = m.chunk;
        m.mesh.visible = c.x1 >= view.x0 && c.x0 <= view.x1 && c.y1 >= view.y0 && c.y0 <= view.y1;
        m.geometry.instanceCount = Math.max(1, Math.round(c.count * fraction));
      }
    };
    tick();
    canvas.app.ticker.add(tick);
    state = { root, tick, shader };
  } catch (error) {
    log("Vent non affiché", error);
    teardown();
  }
}

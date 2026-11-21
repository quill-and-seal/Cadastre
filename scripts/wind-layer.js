/**
 * Herbe au vent, dans Foundry. Les scènes exportées par Cadastre gardent leur zone d'herbe et
 * leur vent (drapeau `cadastre.wind`). Ce calque, au-dessus du fond et sous les jetons, dessine
 * les mêmes brins que l'image de fond, animés par le vent, selon le réglage de chaque joueur :
 *   1 : léger (moins de brins animés, pour un ordinateur peu puissant)
 *   2 : brins animés
 *   3 : en plus, l'herbe s'écarte au passage des jetons
 * Coupé (0), l'image de fond montre l'herbe figée.
 *
 * Un compteur optionnel (réglage « Compteur de l'herbe ») affiche les brins dessinés et le temps
 * par image, pour comparer d'une version à l'autre.
 */
import { MODULE_ID, log } from "./constants.js";
import { startLegacyGrass, stopLegacyGrass } from "./wind-layer-legacy.js";
import { refreshTrees } from "./tree-layer.js";
import { refreshWater } from "./water-layer.js";
import { diagLine, diagLoaded, refreshDiagnostic } from "./diagnostic.js";
import { normalizeWind, WIND_LEVELS } from "./wind.js";
import {
  bladeField, lod, windUniforms, packPushers, PushTrail, grassVert, GRASS_FRAG, BLADE_CORNERS, BLADE_BYTES,
  drawCount, pushersFor, gustGrid, gustRect, GUST_MAX, windClock
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
    onChange: () => { refresh(); refreshTrees(); }
  });
  game.settings.register(MODULE_ID, "grassRender", {
    name: "CADASTRE.Settings.GrassRender",
    hint: "CADASTRE.Settings.GrassRenderHint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      optimized: "CADASTRE.Settings.GrassRenders.optimized",
      legacy: "CADASTRE.Settings.GrassRenders.legacy"
    },
    default: "optimized",
    onChange: () => refresh()
  });
  game.settings.register(MODULE_ID, "grassStats", {
    name: "CADASTRE.Settings.GrassStats",
    hint: "CADASTRE.Settings.GrassStatsHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => { refreshDiagnostic(); refresh(); refreshWater(); refreshTrees(); }
  });
  Hooks.on("canvasReady", () => refresh());
  Hooks.on("canvasTearDown", () => teardown());
  Hooks.on("updateScene", (scene, changes) => {
    if (scene.id === canvas.scene?.id && foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`)) refresh();
  });
}

/** Herbe « comme en 0.1.8 » choisie dans les réglages du module ? */
export const legacyGrass = () => { try { return game.settings.get(MODULE_ID, "grassRender") === "legacy"; } catch { return false; } };

/** Ligne du mode diagnostic qui dit pourquoi l'herbe n'est pas animée. */
let note = null;
function why(text) {
  note = diagLine("Herbe");
  if (note) note.textContent = `Herbe : ${text}`;
}

function teardown() {
  stopLegacyGrass();
  note?.remove();
  note = null;
  state?.stats?.remove();
  if (!state) return;
  canvas.app?.ticker?.remove(state.tick);
  if (!state.root.destroyed) state.root.destroy({ children: true });
  state.gustTexture?.destroy(true);
  state = null;
}

/** Rectangle visible de la scène, en cases, et pixels d'écran par case. */
function viewRect(size, ox, oy) {
  const r = canvas.app.renderer;
  const inv = canvas.stage.worldTransform.clone().invert();
  const a = inv.apply(new PIXI.Point(0, 0)), b = inv.apply(new PIXI.Point(r.screen.width, r.screen.height));
  return {
    x0: (Math.min(a.x, b.x) - ox) / size, y0: (Math.min(a.y, b.y) - oy) / size,
    x1: (Math.max(a.x, b.x) - ox) / size, y1: (Math.max(a.y, b.y) - oy) / size,
    ppc: size * Math.abs(canvas.stage.scale.x) * (r.resolution ?? 1)
  };
}

function refresh() {
  teardown();
  const start = performance.now();
  // Herbe « comme en 0.1.8 » : l'ancien calque, tel quel.
  if (legacyGrass()) return startLegacyGrass();
  const data = canvas.scene?.getFlag(MODULE_ID, "wind");
  const level = Number(game.settings.get(MODULE_ID, "windLevel"));
  // Les scènes exportées avant la 0.1.7 ont l'ancienne herbe dans leur fond : on n'y ajoute rien.
  if (!data?.zone?.length) return;
  if (!level) return why("coupée (réglage « Vent dans l'herbe »), seule l'herbe de l'image de fond reste");
  if ((data.v ?? 1) < 2) return why("scène exportée avant la 0.1.7, à réexporter");
  const wind = normalizeWind(data.wind);
  // Sans vent ni jetons, l'herbe ne bouge pas : l'image de fond suffit.
  if (!wind.strength && level < WIND_LEVELS.FULL) return why("immobile (carte sans vent), seule l'herbe de l'image de fond reste");
  try {
    const d = canvas.dimensions;
    const size = d.size, ox = d.sceneX ?? d.sceneRect?.x ?? 0, oy = d.sceneY ?? d.sceneRect?.y ?? 0;
    const field = bladeField(data.zone, wind);
    if (!field.count) return;

    const root = new PIXI.Container();
    root.eventMode = "none";
    // Vellum ne doit pas reprendre ces images : Cadastre gère lui-même leur netteté (des milliers
    // de morceaux d'arbres agrandis un par un figeaient l'affichage au zoom).
    root.vellumIgnore = true;
    root._vellumPatch = true;
    Object.assign(root, { elevation: 0, sortLayer: SORT_LAYER, sort: 1 });
    // Les brins sont en cases : une seule mise à l'échelle place tout le champ sur la scène.
    root.position.set(ox, oy);
    root.scale.set(size);
    const parent = canvas.primary ?? canvas.stage;
    parent.addChild(root);
    parent.sortDirty = true;

    // Vent lu dans une image depuis le programme des sommets, si la carte graphique le permet.
    const gl = canvas.app.renderer.gl;
    const useGust = !gl || gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) > 0;
    let gust = null, gustTexture = null;
    if (useGust) {
      gust = gustGrid(0, 0, 1, 1, 0, wind);
      gustTexture = PIXI.Texture.fromBuffer(gust.data, GUST_MAX, GUST_MAX, {
        format: PIXI.FORMATS.LUMINANCE, type: PIXI.TYPES.UNSIGNED_BYTE,
        alphaMode: PIXI.ALPHA_MODES?.NPM ?? 0, scaleMode: PIXI.SCALE_MODES?.LINEAR ?? 1, mipmap: PIXI.MIPMAP_MODES?.OFF ?? 0
      });
    }

    const push = packPushers([]);
    const common = PIXI.UniformGroup.from({
      ...windUniforms(wind, field.gap), uTime: 0, uPush: push, uAlpha: 1,
      ...(useGust ? { uGust: gustTexture, uGustRect: gust.rect } : {})
    });
    const program = PIXI.Program.from(grassVert(useGust), GRASS_FRAG);
    const corners = new PIXI.Buffer(BLADE_CORNERS, true, false);
    const meshes = field.chunks.map((c) => {
      const blades = new PIXI.Buffer(c.data, true, false);
      const geometry = new PIXI.Geometry()
        .addAttribute("aVertexPosition", corners, 2)
        .addAttribute("aPos", blades, 2, true, PIXI.TYPES.UNSIGNED_SHORT, BLADE_BYTES, 0, true)
        .addAttribute("aStat", blades, 4, true, PIXI.TYPES.UNSIGNED_BYTE, BLADE_BYTES, 4, true);
      geometry.instanced = true;
      geometry.instanceCount = c.count;
      const uniforms = { common, uOrigin: new Float32Array([c.cx, c.cy]), uPushN: 0 };
      const mesh = new PIXI.Mesh(geometry, new PIXI.Shader(program, uniforms), undefined, PIXI.DRAW_MODES.TRIANGLES);
      root.addChild(mesh);
      return { mesh, geometry, chunk: c, uniforms };
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

    // Compteur de l'herbe.
    const stats = diagLine("Herbe");
    let time = 0, frames = 0, frameMs = 0, cpuMs = 0, lastStats = performance.now(), drawn = 0, chunksDrawn = 0;

    const tick = () => {
      const t0 = performance.now();
      const dt = Math.min(0.1, (canvas.app.ticker.deltaMS ?? 16) / 1000);
      time = windClock();
      const view = viewRect(size, ox, oy);
      const pushers = trail.update(movers(), dt);
      const visible = meshes.filter((m) => {
        const c = m.chunk;
        return (m.mesh.visible = c.x1 >= view.x0 && c.x0 <= view.x1 && c.y1 >= view.y0 && c.y0 <= view.y1);
      });
      root.visible = visible.length > 0;
      drawn = 0; chunksDrawn = visible.length;
      if (visible.length) {
        const l = lod(field.gap, view.ppc, cap);
        const u = windUniforms(wind, field.gap, l);
        Object.assign(common.uniforms, u);
        common.uniforms.uTime = time;
        packPushers(pushers, push);
        if (useGust) {
          const [gx0, gy0, gx1, gy1] = gustRect(field, view.x0, view.y0, view.x1, view.y1, u.uLength * 1.5);
          gustGrid(gx0, gy0, gx1, gy1, time, wind, gust);
          gustTexture.baseTexture.update();
        }
        for (const m of visible) {
          m.geometry.instanceCount = drawCount(m.chunk, l);
          m.uniforms.uPushN = pushersFor(m.chunk, pushers);
          drawn += m.geometry.instanceCount;
        }
      }
      if (stats) {
        frames++; frameMs += canvas.app.ticker.elapsedMS ?? 16; cpuMs += performance.now() - t0;
        const now = performance.now();
        if (now - lastStats > 500) {
          stats.textContent = `Herbe : ${drawn.toLocaleString()} brins · ${chunksDrawn} morceaux · `
            + `${(frameMs / frames).toFixed(1)} ms/image (${Math.round(1000 / (frameMs / frames))} img/s) · calcul ${(cpuMs / frames).toFixed(2)} ms`
            + (useGust ? "" : " · vent calculé brin par brin");
          frames = 0; frameMs = 0; cpuMs = 0; lastStats = now;
        }
      }
    };
    tick();
    canvas.app.ticker.add(tick);
    state = { root, tick, gustTexture, stats };
    diagLoaded("herbe", start);
  } catch (error) {
    log("Vent non affiché", error);
    teardown();
  }
}

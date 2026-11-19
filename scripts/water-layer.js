/**
 * Eau vivante, dans Foundry. Les scènes exportées par Cadastre gardent leur eau (drapeau
 * `cadastre.water`). Ce calque, au-dessus du fond et sous les jetons, anime selon le réglage de
 * chaque joueur :
 *   1 : la surface (reflets, éclats, courant)
 *   2 : en plus, l'écume, les feuilles et, s'ils sont demandés, les traits du courant
 * Coupé (0), l'image de fond montre l'eau figée.
 *
 * Le fond (sable, galets, ombre des rochers) est calculé une fois au chargement de la scène ;
 * la surface n'est dessinée que sur les morceaux qui ont de l'eau ; quand l'eau n'est pas à
 * l'écran, rien n'est calculé. Le compteur de performances (réglage du module) affiche l'eau
 * sous l'herbe.
 */
import { MODULE_ID, log } from "./constants.js";
import {
  buildField, fieldPixels, normalizeWater, surfaceUniforms, bedUniforms, bedLayout, quadTriangles, waterVisible,
  WaterSim, WATER_LEVELS, SURFACE_VERT, SURFACE_FRAG, BED_FRAG, FLOAT_VERT, FLOAT_FRAG, QUAD_CORNERS, INSTANCE_FLOATS
} from "./water.js";

/** Rang de dessin dans le groupe principal : au-dessus du fond de scène, sous l'herbe et les jetons. */
const SORT_LAYER = 99;

let state = null;

export function registerWater() {
  game.settings.register(MODULE_ID, "waterLevel", {
    name: "CADASTRE.Settings.WaterLevel",
    hint: "CADASTRE.Settings.WaterLevelHint",
    scope: "client",
    config: true,
    type: Number,
    choices: {
      0: "CADASTRE.Settings.WaterLevels.0",
      1: "CADASTRE.Settings.WaterLevels.1",
      2: "CADASTRE.Settings.WaterLevels.2"
    },
    default: WATER_LEVELS.FULL,
    onChange: () => refresh()
  });
  Hooks.on("canvasReady", () => refresh());
  Hooks.on("canvasTearDown", () => teardown());
  Hooks.on("updateScene", (scene, changes) => {
    if (scene.id === canvas.scene?.id && foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`)) refresh();
  });
}

function teardown() {
  document.getElementById("cadastre-water-stats")?.remove();
  if (!state) return;
  canvas.app?.ticker?.remove(state.tick);
  if (!state.root.destroyed) state.root.destroy({ children: true });
  state.texture?.destroy(true);
  state.bed?.destroy(true);
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

const statsOn = () => { try { return !!game.settings.get(MODULE_ID, "grassStats"); } catch { return false; } };

function refresh() {
  teardown();
  const flag = canvas.scene?.getFlag(MODULE_ID, "water");
  const level = Number(game.settings.get(MODULE_ID, "waterLevel"));
  if (!flag?.rings?.length || !level) return;
  try {
    const d = canvas.dimensions;
    const size = d.size, ox = d.sceneX ?? d.sceneRect?.x ?? 0, oy = d.sceneY ?? d.sceneRect?.y ?? 0;
    const settings = normalizeWater(flag.water);
    // Objets et chemins sont dans l'image de fond, sous ce calque : l'eau animée s'efface
    // devant eux et laisse voir la même eau, figée dans l'image.
    const field = buildField(flag, { hideMasked: true });
    if (!field.cells.length) return;
    const renderer = canvas.app.renderer;

    const root = new PIXI.Container();
    root.eventMode = "none";
    Object.assign(root, { elevation: 0, sortLayer: SORT_LAYER, sort: 1 });
    // Tout est en cases : une seule mise à l'échelle place l'eau sur la scène.
    root.position.set(ox, oy);
    root.scale.set(size);
    const parent = canvas.primary ?? canvas.stage;
    parent.addChild(root);
    parent.sortDirty = true;

    // Données brutes (profondeur, vitesse) : surtout pas de prémultiplication par l'alpha.
    const texture = PIXI.Texture.fromBuffer(fieldPixels(field), field.W, field.H, {
      alphaMode: PIXI.ALPHA_MODES?.NPM ?? 0, scaleMode: PIXI.SCALE_MODES?.LINEAR ?? 1, mipmap: PIXI.MIPMAP_MODES?.OFF ?? 0
    });
    const quads = new PIXI.Geometry().addAttribute("aVertexPosition", quadTriangles(field), 2);

    // Fond de l'eau, une fois pour toutes, à la finesse de l'image de la scène.
    const layout = bedLayout(field, size);
    const bed = PIXI.RenderTexture.create({ width: layout.width, height: layout.height, scaleMode: PIXI.SCALE_MODES?.LINEAR ?? 1 });
    {
      const bakeState = new PIXI.State();
      bakeState.blend = false;
      const bake = new PIXI.Mesh(quads, PIXI.Shader.from(SURFACE_VERT, BED_FRAG, bedUniforms(field)), bakeState, PIXI.DRAW_MODES.TRIANGLES);
      const [x0, y0, w, h] = layout.rect;
      bake.scale.set(layout.width / w, layout.height / h);
      bake.position.set(-x0 * bake.scale.x, -y0 * bake.scale.y);
      renderer.render(bake, { renderTexture: bed, clear: true });
      bake.destroy();
    }

    const uniforms = { ...surfaceUniforms(field, settings, layout.rect), uField: texture, uBed: bed, uTime: 0 };
    const surface = new PIXI.Mesh(quads, PIXI.Shader.from(SURFACE_VERT, SURFACE_FRAG, uniforms), undefined, PIXI.DRAW_MODES.TRIANGLES);
    root.addChild(surface);

    // Écume, feuilles, traits : un quadrilatère par élément, positions recalculées à chaque image.
    let sim = null, floatGeo = null, instBuf = null, floatMesh = null;
    const floatUniforms = { uMinWidth: 0.9 / size, uAlpha: 1 };
    if (level >= WATER_LEVELS.FULL && (settings.particles || settings.strokes)) {
      sim = new WaterSim(field, settings);
      for (let i = 0; i < 60; i++) sim.step(1 / 20);
      if (sim.instances.length) {
        instBuf = new PIXI.Buffer(sim.instances, false, false);
        const stride = INSTANCE_FLOATS * 4;
        floatGeo = new PIXI.Geometry()
          .addAttribute("aVertexPosition", new PIXI.Buffer(QUAD_CORNERS, true, false), 2)
          .addAttribute("aP0", instBuf, 4, false, PIXI.TYPES.FLOAT, stride, 0, true)
          .addAttribute("aP1", instBuf, 4, false, PIXI.TYPES.FLOAT, stride, 16, true);
        floatGeo.instanced = true;
        floatGeo.instanceCount = 0;
        floatMesh = root.addChild(new PIXI.Mesh(floatGeo, PIXI.Shader.from(FLOAT_VERT, FLOAT_FRAG, floatUniforms), undefined, PIXI.DRAW_MODES.TRIANGLE_STRIP));
      }
    }

    // Compteur de performances.
    let stats = null;
    if (statsOn()) {
      stats = document.createElement("div");
      stats.id = "cadastre-water-stats";
      stats.style.cssText = "position:fixed;left:8px;bottom:34px;z-index:100;padding:4px 8px;border-radius:4px;background:rgba(0,0,0,.7);color:#def;font:12px/1.4 monospace;pointer-events:none";
      document.body.appendChild(stats);
    }
    let time = 0, frames = 0, cpuMs = 0, lastStats = performance.now();

    const tick = () => {
      const t0 = performance.now();
      const dt = Math.min(0.1, (canvas.app.ticker.deltaMS ?? 16) / 1000);
      const view = viewRect(size, ox, oy);
      // Pas d'eau à l'écran : rien à calculer ni à dessiner.
      const seen = waterVisible(field, view.x0, view.y0, view.x1, view.y1);
      root.visible = seen;
      if (seen) {
        time += dt;
        uniforms.uTime = time;
        uniforms.uPPC = view.ppc;
        // Jamais plus fin qu'un pixel d'écran.
        floatUniforms.uMinWidth = 0.9 / view.ppc * (renderer.resolution ?? 1);
        if (sim && floatGeo) {
          sim.step(dt, view);
          instBuf.update(sim.instances);
          floatGeo.instanceCount = Math.max(1, sim.count);
          floatMesh.visible = sim.count > 0;
        }
      }
      if (stats) {
        frames++; cpuMs += performance.now() - t0;
        const now = performance.now();
        if (now - lastStats > 500) {
          stats.textContent = seen
            ? `Eau : ${(sim?.stats.simulated ?? 0).toLocaleString()} particules simulées · ${(sim?.stats.drawn ?? 0).toLocaleString()} dessinées · calcul ${(cpuMs / frames).toFixed(2)} ms`
            : "Eau : hors de l'écran, rien à calculer";
          frames = 0; cpuMs = 0; lastStats = now;
        }
      }
    };
    tick();
    canvas.app.ticker.add(tick);
    state = { root, tick, texture, bed };
  } catch (error) {
    log("Eau non animée", error);
    teardown();
  }
}

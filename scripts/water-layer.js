/**
 * Eau vivante, dans Foundry. Les scènes exportées par Cadastre gardent leur eau (drapeau
 * `cadastre.water`). Ce calque, au-dessus du fond et sous les jetons, anime selon le réglage de
 * chaque joueur :
 *   1 : la surface (reflets, éclats, courant)
 *   2 : en plus, l'écume, les feuilles et, s'ils sont demandés, les traits du courant
 * Coupé (0), l'image de fond montre l'eau figée.
 */
import { MODULE_ID, log } from "./constants.js";
import {
  buildField, fieldPixels, normalizeWater, surfaceUniforms, WaterSim, WATER_LEVELS,
  SURFACE_VERT, SURFACE_FRAG, FLOAT_VERT, FLOAT_FRAG, QUAD_CORNERS, INSTANCE_FLOATS
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
  if (!state) return;
  canvas.app?.ticker?.remove(state.tick);
  if (!state.root.destroyed) state.root.destroy({ children: true });
  state.texture?.destroy(true);
  state = null;
}

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

    const root = new PIXI.Container();
    root.eventMode = "none";
    Object.assign(root, { elevation: 0, sortLayer: SORT_LAYER, sort: 1 });
    // Tout est en cases : une seule mise à l'échelle place l'eau sur la scène.
    root.position.set(ox, oy);
    root.scale.set(size);
    const parent = canvas.primary ?? canvas.stage;
    parent.addChild(root);
    parent.sortDirty = true;

    // Surface de l'eau : un rectangle de la taille de la carte, peint par le programme.
    // Données brutes (profondeur, vitesse) : surtout pas de prémultiplication par l'alpha.
    const texture = PIXI.Texture.fromBuffer(fieldPixels(field), field.W, field.H, {
      alphaMode: PIXI.ALPHA_MODES?.NPM ?? 0, scaleMode: PIXI.SCALE_MODES?.LINEAR ?? 1, mipmap: PIXI.MIPMAP_MODES?.OFF ?? 0
    });
    const w = field.W / field.R, h = field.H / field.R;
    const uniforms = { ...surfaceUniforms(field, settings), uField: texture, uTime: 0 };
    const rect = new PIXI.Geometry().addAttribute("aVertexPosition", new Float32Array([0, 0, 0, h, w, 0, w, h]), 2);
    const surface = new PIXI.Mesh(rect, PIXI.Shader.from(SURFACE_VERT, SURFACE_FRAG, uniforms), undefined, PIXI.DRAW_MODES.TRIANGLE_STRIP);
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

    let time = 0;
    const tick = () => {
      const dt = Math.min(0.1, (canvas.app.ticker.deltaMS ?? 16) / 1000);
      time += dt;
      uniforms.uTime = time;
      // Jamais plus fin qu'un pixel d'écran.
      floatUniforms.uMinWidth = 0.9 / (size * Math.abs(canvas.stage.scale.x || 1));
      if (sim && floatGeo) {
        sim.step(dt);
        instBuf.update(sim.instances);
        floatGeo.instanceCount = Math.max(1, sim.count);
        floatMesh.visible = sim.count > 0;
      }
    };
    tick();
    canvas.app.ticker.add(tick);
    state = { root, tick, texture };
  } catch (error) {
    log("Eau non animée", error);
    teardown();
  }
}

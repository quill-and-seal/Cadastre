/**
 * Vent dans l'herbe, dans Foundry. Les scènes exportées par Cadastre gardent leur zone d'herbe
 * et leur vent (drapeau `cadastre.wind`). Ce calque, au-dessus du fond et sous les jetons,
 * montre selon le réglage de chaque joueur :
 *   1 : l'ondulation (vagues de lumière des rafales)
 *   2 : en plus, des brins qui se couchent sous les rafales
 *   3 : en plus, l'herbe qui s'écarte au passage des jetons
 */
import { MODULE_ID, log } from "./constants.js";
import {
  windField, patchPositions, buildBladeAtlas, bendIndex, updatePush, bucketPatches, paintSheen,
  PATCH_SIZE, WIND_LEVELS
} from "./wind.js";
import { ringsPath } from "./render.js";

const FPS = 30;
const SHEEN_PPC = 4;
/** Résolution des brins, en pixels par case (étirés à la taille de la grille de la scène). */
const ATLAS_PPC = 96;
/** Rang de dessin dans le groupe principal : au-dessus du fond de scène, sous les tuiles et les jetons. */
const SORT_LAYER = 100;

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
    default: WIND_LEVELS.BLADES,
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
  for (const t of state.textures ?? []) t.destroy(true);
  state = null;
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

/** Texture PIXI à partir d'un canevas, mise à jour quand on redessine dessus (PIXI 7 et 8). */
function canvasTexture(c) {
  const tex = PIXI.Texture.from(c);
  return { tex, update: () => (tex.baseTexture ?? tex.source)?.update?.() };
}

function refresh() {
  teardown();
  const data = canvas.scene?.getFlag(MODULE_ID, "wind");
  const level = Number(game.settings.get(MODULE_ID, "windLevel"));
  if (!data?.zone?.length || !level) return;
  try {
    const d = canvas.dimensions;
    const size = d.size, ox = d.sceneX ?? d.sceneRect?.x ?? 0, oy = d.sceneY ?? d.sceneRect?.y ?? 0;
    const field = windField(data.wind);
    const root = new PIXI.Container();
    root.eventMode = "none";
    Object.assign(root, { elevation: 0, sortLayer: SORT_LAYER, sort: 1 });
    const parent = canvas.primary ?? canvas.stage;
    parent.addChild(root);
    parent.sortDirty = true;
    const textures = [];

    // Niveau 1 : reflet des rafales, peint à basse résolution et limité à l'herbe.
    const sheenCanvas = makeCanvas(Math.ceil(data.width * SHEEN_PPC), Math.ceil(data.height * SHEEN_PPC));
    const maskCanvas = makeCanvas(sheenCanvas.width, sheenCanvas.height);
    const m = maskCanvas.getContext("2d");
    m.setTransform(SHEEN_PPC, 0, 0, SHEEN_PPC, 0, 0);
    m.fillStyle = "#fff";
    m.fill(new Path2D(ringsPath(data.zone)), "nonzero");
    const sheen = canvasTexture(sheenCanvas);
    textures.push(sheen.tex);
    const sheenSprite = new PIXI.Sprite(sheen.tex);
    sheenSprite.position.set(ox, oy);
    sheenSprite.width = data.width * size;
    sheenSprite.height = data.height * size;
    root.addChild(sheenSprite);
    const sc = sheenCanvas.getContext("2d");

    // Niveau 2 : brins animés, un carré de brins par case d'herbe, dont la pose change avec le vent.
    let tufts = [], sprites = [], atlas = null, frameTex = null, buckets = null, amount = null, sector = null;
    if (level >= WIND_LEVELS.BLADES && data.wind.density > 0) {
      tufts = patchPositions(data.zone, { seed: 7 });
      const atlasCanvas = makeCanvas(1, 1);
      atlas = buildBladeAtlas(atlasCanvas, ATLAS_PPC, field.dir, data.wind.density);
      const base = PIXI.Texture.from(atlasCanvas);
      textures.push(base);
      const cache = new Map();
      frameTex = (f) => {
        const key = `${f.x},${f.y}`;
        if (!cache.has(key)) cache.set(key, new PIXI.Texture(base.baseTexture ?? base.source, new PIXI.Rectangle(f.x, f.y, atlas.cell, atlas.cell)));
        return cache.get(key);
      };
      const layer = PIXI.ParticleContainer && tufts.length
        ? new PIXI.ParticleContainer(tufts.length, { position: true, uvs: true, scale: false, rotation: false, tint: false })
        : new PIXI.Container();
      root.addChild(layer);
      for (const t of tufts) {
        const sp = new PIXI.Sprite(frameTex(atlas.frame(t.v, "wind", 0)));
        sp.anchor.set(0.5);
        sp.position.set(ox + t.x * size, oy + t.y * size);
        sp.scale.set((PATCH_SIZE * size) / atlas.cell);
        layer.addChild(sp);
        sprites.push(sp);
      }
      buckets = bucketPatches(tufts);
      amount = new Float32Array(tufts.length);
      sector = new Uint8Array(tufts.length);
    }

    // Niveau 3 : les jetons écartent l'herbe.
    const pushers = () => {
      if (level < WIND_LEVELS.FULL) return [];
      const out = [];
      for (const token of canvas.tokens?.placeables ?? []) {
        if (!token.visible) continue;
        const c = token.center;
        out.push({ x: (c.x - ox) / size, y: (c.y - oy) / size, r: Math.max(token.w, token.h) / size / 2 + 0.3 });
      }
      return out;
    };

    let time = 0, since = 0;
    const draw = (dt) => {
      sc.globalCompositeOperation = "source-over";
      paintSheen(sc, field, time, data.width, data.height, SHEEN_PPC);
      sc.globalCompositeOperation = "destination-in";
      sc.drawImage(maskCanvas, 0, 0);
      sheen.update();
      if (!sprites.length) return;
      updatePush(tufts, pushers(), amount, sector, dt, buckets);
      for (let i = 0; i < sprites.length; i++) {
        const t = tufts[i], push = amount[i];
        const f = push > 0.15
          ? atlas.frame(t.v, "push", sector[i], push > 0.6 ? 1 : 0)
          : atlas.frame(t.v, "wind", bendIndex(field.at(t.x, t.y, time)));
        const tex = frameTex(f);
        if (sprites[i].texture !== tex) sprites[i].texture = tex;
      }
    };
    const tick = () => {
      const dt = (canvas.app.ticker.deltaMS ?? 16) / 1000;
      time += dt;
      since += dt;
      if (since < 1 / FPS) return;
      draw(since);
      since = 0;
    };
    draw(0);
    canvas.app.ticker.add(tick);
    state = { root, tick, textures };
  } catch (error) {
    log("Vent non affiché", error);
    teardown();
  }
}

/**
 * Export d'une carte en scène Foundry : image de fond rendue depuis le SVG,
 * envoyée dans les données du monde, puis scène et murs natifs.
 */
import { MODULE_ID, MAX_TEXTURE, log } from "./constants.js";
import { renderSVG, defaultResolve } from "./render.js";
import { usedAssetSources } from "./library.js";
import { windFlag, grassZone, normalizeWind } from "./wind.js";
import { bladeField } from "./grass.js";
import { paintStillGrass } from "./grass-gl.js";
import { bladeField as bladeFieldLegacy } from "./grass-legacy.js";
import { paintStillGrass as paintStillGrassLegacy } from "./grass-gl-legacy.js";
import { legacyGrass } from "./wind-layer.js";
import { waterFlag, buildField, normalizeWater } from "./water.js";
import { paintStillWater } from "./water-gl.js";
import { buildWallData, textureScale } from "./walls.js";
import { isEmpty } from "./model.js";
import { TREE_BY_TYPE } from "./trees.js";
import { packTrees, TREE_PAGE, treePpc } from "./tree-pack.js";
import { makeCanvas } from "./tree-paint.js";
import { TERRAINS, BIOME_SOILS } from "./catalog.js";
import { loadGroundTile } from "./ground-tiles.js";
import { GROUND_PPC } from "./ground.js";
import { exportPyramid, vellumActive } from "./pyramid-export.js";

const FilePickerCls = () => foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
const SceneCls = () => CONFIG.Scene.documentClass;

/** Image d'un SVG, décodée par le navigateur. */
async function svgImage(svg) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Dessine des couches l'une sur l'autre dans un canvas et renvoie l'image (WebP, PNG si le
 * navigateur refuse). Une couche est un SVG, ou une fonction qui dessine dans le canvas
 * (eau et herbe animées, figées pour l'image). La taille est celle du premier SVG.
 * @param {string|(string|((ctx:CanvasRenderingContext2D)=>void))[]} layers
 */
export async function rasterize(layers) {
  const canvas = await rasterizeCanvas(layers);
  const toBlob = (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  const webp = await toBlob("image/webp", 0.92);
  if (webp?.type === "image/webp") return { blob: webp, ext: "webp" };
  return { blob: await toBlob("image/png"), ext: "png" };
}

/** Comme rasterize, mais renvoie le canvas (fond découpé en tuiles). */
export async function rasterizeCanvas(layers) {
  if (!Array.isArray(layers)) layers = [layers];
  let ctx = null;
  for (const layer of layers) {
    if (typeof layer === "string") {
      const img = await svgImage(layer);
      if (!ctx) {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx = canvas.getContext("2d");
      }
      ctx.drawImage(img, 0, 0);
    } else if (layer && ctx) {
      try {
        layer(ctx);
      } catch (error) {
        log("Couche animée non dessinée dans l'image", error);
      }
    }
  }
  return ctx.canvas;
}

/** Lit une image et la renvoie en data URI. */
async function toDataURI(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Un SVG transformé en image par le navigateur ne charge aucune ressource externe :
 * les images d'assets utilisées sont donc intégrées au SVG avant le rendu.
 * Une image introuvable est laissée vide (et signalée) plutôt que de bloquer l'export.
 * @returns {Promise<{resolve:(src:string)=>string, missing:string[]}>}
 */
export async function inlineAssets(map) {
  const table = new Map();
  const missing = [];
  await Promise.all(usedAssetSources(map).map(async (src) => {
    try {
      table.set(src, await toDataURI(defaultResolve(src)));
    } catch (error) {
      log("Image d'asset introuvable", src, error);
      missing.push(src);
    }
  }));
  return { resolve: (src) => table.get(src) ?? "", missing };
}

const slug = (s) => (s || "carte").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "carte";

/** Envoie l'image dans worlds/<monde>/cadastre/ ; un nom horodaté évite que le navigateur garde l'ancienne en cache. */
async function uploadImage(blob, ext, name, suffix = "") {
  const FP = FilePickerCls();
  const dir = `worlds/${game.world.id}/${MODULE_ID}`;
  try {
    await FP.createDirectory("data", dir);
  } catch {
    // Le dossier existe déjà.
  }
  const file = new File([blob], `${slug(name)}${suffix}-${Date.now()}.${ext}`, { type: blob.type });
  const res = await FP.upload("data", dir, file, {}, { notify: false });
  if (res === false || res?.status === "error") throw new Error(res?.message ?? "upload");
  return res?.path ?? `${dir}/${file.name}`;
}

/**
 * Pose le fond de scène. En v14 le fond appartient au niveau (Level) de la scène ;
 * les versions précédentes le gardent sur la scène elle-même.
 */
async function setBackground(scene, src) {
  const levels = scene.levels;
  if (levels) {
    const level = (scene.initialLevel && levels.get(scene.initialLevel)) ?? levels.contents?.[0];
    if (level) await level.update({ "background.src": src });
    else await scene.createEmbeddedDocuments("Level", [{ name: scene.name, background: { src } }]);
  } else {
    await scene.update({ "background.src": src });
  }
}

async function refreshThumbnail(scene) {
  try {
    const data = await scene.createThumbnail();
    if (data?.thumb) await scene.update({ thumb: data.thumb });
  } catch (error) {
    log("Vignette non générée", error);
  }
}

const canvasBlob = async (canvas, type, quality) => (canvas.convertToBlob
  ? canvas.convertToBlob({ type, quality })
  : new Promise((resolve) => canvas.toBlob(resolve, type, quality)));

/** Arbres générés, avec la progression affichée. */
async function exportTrees(map, scale) {
  const ppc = treePpc(map.gridSize);
  const total = map.props.filter((p) => TREE_BY_TYPE.get(p.type)?.proc).length;
  if (!total) return packTrees(map, ppc, { shadowPpc: scale });
  const label = (done) => game.i18n.format("CADASTRE.Export.Trees", { done, total });
  const note = ui.notifications?.info?.(label(0), { progress: true });
  try {
    return await packTrees(map, ppc, { shadowPpc: scale, onProgress: (done) => note?.update?.({ pct: done / total, message: label(done) }) });
  } finally {
    note?.remove?.();
  }
}

/** Envoie les pages d'arbres ; renvoie le drapeau de scène du calque des arbres. */
async function uploadTrees(map, trees) {
  const pages = [];
  for (const [i, p] of trees.pages.entries()) {
    // Seule la partie remplie de la page est gardée.
    const h = Math.max(1, p.used);
    const c = makeCanvas(TREE_PAGE, h);
    c.getContext("2d").drawImage(p.color, 0, 0);
    pages.push({ color: await uploadImage(await canvasBlob(c, "image/webp", 0.95), "webp", map.name, `-arbres${i}`), w: TREE_PAGE, h });
  }
  // Drapeau compact : un modèle par dessin (morceaux en tableaux), chaque plante n'en garde
  // que la position, le numéro de modèle et sa rotation d'affichage.
  const r2 = (n) => Math.round(n * 100) / 100;
  const models = trees.models.map((m) => ({ ...m, pieces: m.pieces.map((q) => [q.page, q.u, q.v, q.w, q.h, q.ox, q.oy, q.ax, q.ay, q.lx, q.ly, q.hz, q.id]) }));
  const items = trees.items.map((t) => [r2(t.x), r2(t.y), t.m, t.spin || 0]);
  return { v: 4, wind: normalizeWind(map.wind), pages, models, items };
}

/**
 * @param {object} map
 * @param {{scene?:Scene|null, sourceId?:string}} [options]  scene : scène à mettre à jour, sinon une nouvelle est créée
 * @returns {Promise<{scene:Scene, created:boolean, reduced:boolean, missing:string[]}>}
 */
export async function exportMap(map, { scene = null, sourceId = null } = {}) {
  if (isEmpty(map)) throw new Error(game.i18n.localize("CADASTRE.Export.Empty"));

  const { sceneWidth, sceneHeight, scale, reduced } = textureScale(map, MAX_TEXTURE);
  const { resolve, missing } = await inlineAssets(map);
  // L'herbe en traits, figée, est peinte par-dessus le rendu SVG : la même que le calque animé.
  const grassWind = normalizeWind(map.wind);
  const legacy = legacyGrass();
  const field = (legacy ? bladeFieldLegacy : bladeField)(grassZone(map), grassWind);
  // L'eau, figée, aussi : la même que celle que le calque anime.
  const water = waterFlag(map);
  const waterField = water ? buildField(water) : null;
  // Sols peints (litière, aiguilles) : leur tuile doit être prête avant le rendu.
  const biomeSoil = map.biome && BIOME_SOILS[map.biome.id];
  const grounds = TERRAINS.filter((t) => t.ground && (map.terrains[t.id]?.length || t.id === biomeSoil)).map((t) => t.ground);
  await Promise.all(grounds.map((g) => loadGroundTile(g)));
  // Arbres générés : animés dans la scène, hors de l'image de fond ; leur ombre y reste.
  const trees = await exportTrees(map, scale);
  // Sol, puis eau et herbe figées, puis chemins, objets et murs par-dessus. « view » : portion de
  // la carte (en cases) pour le fond découpé en tuiles, rendue à « s » pixels par case.
  const layersAt = (s, view = null, groundPpc = undefined) => {
    const ox = view ? view[0] * s : 0, oy = view ? view[1] * s : 0;
    const f = s / scale;
    return [
      renderSVG(map, { scale: s, resolve, part: "ground", view, groundPpc }),
      (ctx) => { if (waterField) paintStillWater(ctx, waterField, normalizeWater(water.water), s, { ox, oy }); },
      (ctx) => (legacy ? paintStillGrassLegacy : paintStillGrass)(ctx, field, grassWind, s, { ox, oy }),
      renderSVG(map, { scale: s, resolve, part: "top", treeArt: () => "", view, groundPpc }),
      (ctx) => {
        const W = ctx.canvas.width, H = ctx.canvas.height;
        for (const sh of trees.shadows) {
          const w = sh.img.width * f, h = sh.img.height * f, x = sh.x * s - sh.half * f - ox, y = sh.y * s - sh.half * f - oy;
          if (x + w < 0 || y + h < 0 || x > W || y > H) continue;
          ctx.drawImage(sh.img, x, y, w, h);
        }
      }
    ];
  };
  const preview = await rasterizeCanvas(layersAt(scale));

  // Fond fin découpé en tuiles (Vellum) : seulement s'il apporte plus que le fond habituel.
  let fine = 100;
  try { fine = Number(game.settings.get(MODULE_ID, "backgroundPpc")) || 100; } catch { /* réglage absent */ }
  let src;
  if (vellumActive() && fine > scale * 1.2) {
    const key = `${slug(map.name)}-${sourceId ?? scene?.id ?? foundry.utils.randomID()}`;
    const label = (done, total) => game.i18n.format("CADASTRE.Export.Tiles", { done, total });
    const note = ui.notifications?.info?.(label(0, "…"), { progress: true });
    try {
      src = await exportPyramid({
        map, ppc: fine, preview, previewScale: scale, key,
        render: async (s, view) => {
          // Motif des sols peints aussi fin que la bande rendue.
          const groundPpc = s <= GROUND_PPC ? undefined : Math.min(512, Math.ceil(s / GROUND_PPC) * GROUND_PPC);
          if (groundPpc) await Promise.all(grounds.map((g) => loadGroundTile(g, groundPpc)));
          return rasterizeCanvas(layersAt(s, view, groundPpc));
        },
        onProgress: (done, total) => note?.update?.({ pct: done / total, message: label(done, total) })
      });
    } finally {
      note?.remove?.();
    }
  } else {
    const webp = await new Promise((resolve) => preview.toBlob(resolve, "image/webp", 0.92));
    const { blob, ext } = webp?.type === "image/webp" ? { blob: webp, ext: "webp" }
      : { blob: await new Promise((resolve) => preview.toBlob(resolve, "image/png")), ext: "png" };
    src = await uploadImage(blob, ext, map.name);
  }
  preview.width = preview.height = 0;
  const treeFlag = trees.items.length ? await uploadTrees(map, trees) : null;

  const sceneData = {
    width: sceneWidth,
    height: sceneHeight,
    padding: 0,
    backgroundColor: map.background,
    grid: { size: map.gridSize, type: CONST.GRID_TYPES?.SQUARE ?? 1 }
  };

  let created = false;
  if (scene) {
    await scene.update(sceneData);
    const old = scene.walls.filter((w) => w.getFlag(MODULE_ID, "generated")).map((w) => w.id);
    if (old.length) await scene.deleteEmbeddedDocuments("Wall", old);
  } else {
    scene = await SceneCls().create({
      ...sceneData,
      name: map.name || game.i18n.localize("CADASTRE.Manager.Untitled"),
      navigation: false,
      flags: { [MODULE_ID]: { source: sourceId } }
    });
    created = true;
  }

  await setBackground(scene, src);
  const walls = buildWallData(map);
  if (walls.length) await scene.createEmbeddedDocuments("Wall", walls);
  // Eau vivante : animée dans la scène par le calque du module (water-layer.js).
  if (water) await scene.setFlag(MODULE_ID, "water", water);
  else if (scene.getFlag(MODULE_ID, "water")) await scene.unsetFlag(MODULE_ID, "water");
  // L'ancien courant (avant la 0.1.8) est remplacé par l'eau vivante.
  if (scene.getFlag(MODULE_ID, "currents")) await scene.unsetFlag(MODULE_ID, "currents");
  // Vent dans l'herbe : animé par le calque du module (wind-layer.js).
  const wind = windFlag(map);
  if (wind) await scene.setFlag(MODULE_ID, "wind", wind);
  else if (scene.getFlag(MODULE_ID, "wind")) await scene.unsetFlag(MODULE_ID, "wind");
  // Arbres générés : animés par le calque du module (tree-layer.js).
  if (treeFlag) await scene.setFlag(MODULE_ID, "trees", treeFlag);
  else if (scene.getFlag(MODULE_ID, "trees")) await scene.unsetFlag(MODULE_ID, "trees");
  await refreshThumbnail(scene);
  return { scene, created, reduced, missing };
}

/**
 * Export d'une carte en scène Foundry : image de fond rendue depuis le SVG,
 * envoyée dans les données du monde, puis scène et murs natifs.
 */
import { MODULE_ID, MAX_TEXTURE, log } from "./constants.js";
import { renderSVG } from "./render.js";
import { buildWallData, textureScale } from "./walls.js";
import { isEmpty } from "./model.js";

const FilePickerCls = () => foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
const SceneCls = () => CONFIG.Scene.documentClass;

/** Dessine le SVG dans un canvas et renvoie l'image (WebP, PNG si le navigateur refuse). */
export async function rasterize(svg) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d").drawImage(img, 0, 0);
    const toBlob = (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
    const webp = await toBlob("image/webp", 0.92);
    if (webp?.type === "image/webp") return { blob: webp, ext: "webp" };
    return { blob: await toBlob("image/png"), ext: "png" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const slug = (s) => (s || "carte").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "carte";

/** Envoie l'image dans worlds/<monde>/cadastre/ ; un nom horodaté évite que le navigateur garde l'ancienne en cache. */
async function uploadImage(blob, ext, name) {
  const FP = FilePickerCls();
  const dir = `worlds/${game.world.id}/${MODULE_ID}`;
  try {
    await FP.createDirectory("data", dir);
  } catch {
    // Le dossier existe déjà.
  }
  const file = new File([blob], `${slug(name)}-${Date.now()}.${ext}`, { type: blob.type });
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

/**
 * @param {object} map
 * @param {{scene?:Scene|null, sourceId?:string}} [options]  scene : scène à mettre à jour, sinon une nouvelle est créée
 * @returns {Promise<{scene:Scene, created:boolean, reduced:boolean}>}
 */
export async function exportMap(map, { scene = null, sourceId = null } = {}) {
  if (isEmpty(map)) throw new Error(game.i18n.localize("CADASTRE.Export.Empty"));

  const { sceneWidth, sceneHeight, scale, reduced } = textureScale(map, MAX_TEXTURE);
  const { blob, ext } = await rasterize(renderSVG(map, { scale }));
  const src = await uploadImage(blob, ext, map.name);

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
  await refreshThumbnail(scene);
  return { scene, created, reduced };
}

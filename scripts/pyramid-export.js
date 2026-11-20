/**
 * Fond de scène fin, découpé en tuiles au format des « cartes géantes » de Vellum (Deep Zoom) :
 * la carte est rendue à N pixels par case, bande par bande, et découpée en tuiles de 512 px à
 * tous les niveaux de détail. Vellum ne charge ensuite que les tuiles visibles, au niveau du zoom.
 *
 *   tuiles/<clé>.vellum.webp   aperçu, en fond de scène (aussi fin que le fond habituel)
 *   tuiles/<clé>.xml           description de la découpe (format Deep Zoom)
 *   tuiles/<clé>_files/N/i_j.webp
 *
 * Les noms sont fixes pour une carte : un réexport remplace ses tuiles au lieu de les empiler
 * (Vellum reprend le « ?v=… » de l'aperçu pour ne pas montrer d'anciennes tuiles en cache).
 */
import { MODULE_ID, log } from "./constants.js";

/** Taille des tuiles attendue par Vellum. */
export const PYRAMID_TILE = 512;
/** Bandes rendues d'un coup (8 × 8 tuiles) : assez grand pour limiter les rendus du SVG entier. */
const BAND = 4096;
const PARALLEL_UPLOADS = 6;
const QUALITY = 0.8;

/** Finesses proposées pour le fond (pixels par case). */
export const BACKGROUND_PPCS = [100, 200, 300, 400];

/** Vellum est-il actif (lui seul sait afficher les tuiles) ? */
export const vellumActive = () => !!game.modules.get("vellum")?.active;

/** Niveaux de la pyramide pour une image de W × H px, du plus fin au plus grossier. */
export function pyramidLevels(width, height, tile = PYRAMID_TILE) {
  const maxLevel = Math.ceil(Math.log2(Math.max(width, height, 1)));
  const out = [];
  for (let level = maxLevel; level >= 0; level--) {
    const k = 2 ** (maxLevel - level);
    const lw = Math.ceil(width / k), lh = Math.ceil(height / k);
    out.push({ level, k, lw, lh, cols: Math.ceil(lw / tile), rows: Math.ceil(lh / tile) });
  }
  return out;
}

const toBlob = (canvas, type = "image/webp", quality = QUALITY) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Rend et envoie la pyramide.
 * @param {object} o
 * @param {object} o.map
 * @param {number} o.ppc            finesse du niveau le plus fin (pixels par case)
 * @param {HTMLCanvasElement} o.preview  fond habituel déjà rendu (sert aux niveaux grossiers)
 * @param {number} o.previewScale   pixels par case de l'aperçu
 * @param {(scale:number, view:number[])=>Promise<HTMLCanvasElement>} o.render
 *   rend une portion de la carte (view en cases) à « scale » pixels par case
 * @param {string} o.key            nom de base des fichiers (fixe pour une carte)
 * @param {(done:number, total:number)=>void} [o.onProgress]
 * @returns {Promise<string>} chemin de l'aperçu, avec son paramètre de version
 */
export async function exportPyramid({ map, ppc, preview, previewScale, render, key, onProgress }) {
  const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
  const dir = `worlds/${game.world.id}/${MODULE_ID}/tuiles`;
  const mkdir = async (d) => { try { await FP.createDirectory("data", d); } catch { /* existe déjà */ } };
  const upload = async (d, file) => {
    const res = await FP.upload("data", d, file, {}, { notify: false });
    if (res === false || res?.status === "error") throw new Error(res?.message ?? "upload");
    return res?.path ?? `${d}/${file.name}`;
  };
  await mkdir(`worlds/${game.world.id}/${MODULE_ID}`);
  await mkdir(dir);
  const filesDir = `${dir}/${key}_files`;
  await mkdir(filesDir);

  const width = Math.round(map.width * ppc), height = Math.round(map.height * ppc);
  const levels = pyramidLevels(width, height);
  const total = levels.reduce((n, l) => n + l.cols * l.rows, 0);
  let done = 0;
  const pending = new Set();
  const send = async (d, file) => {
    while (pending.size >= PARALLEL_UPLOADS) await Promise.race(pending);
    const p = upload(d, file).catch((error) => log("Tuile non envoyée", file.name, error)).finally(() => pending.delete(p));
    pending.add(p);
  };

  const tile = document.createElement("canvas");
  const tx = tile.getContext("2d");
  const cut = async (src, sx, sy, sw, sh, w, h, levelDir, name) => {
    tile.width = w; tile.height = h;
    tx.imageSmoothingEnabled = true;
    tx.imageSmoothingQuality = "high";
    tx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    const blob = await toBlob(tile);
    await send(levelDir, new File([blob], name, { type: "image/webp" }));
    onProgress?.(++done, total);
  };

  for (const { level, k, lw, lh, cols, rows } of levels) {
    const levelDir = `${filesDir}/${level}`;
    await mkdir(levelDir);
    const s = ppc / k;
    if (s <= previewScale * 1.05) {
      // Niveau pas plus fin que l'aperçu : réduit depuis l'aperçu.
      const fx = preview.width / lw, fy = preview.height / lh;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const x = i * PYRAMID_TILE, y = j * PYRAMID_TILE;
        const w = Math.min(PYRAMID_TILE, lw - x), h = Math.min(PYRAMID_TILE, lh - y);
        await cut(preview, x * fx, y * fy, w * fx, h * fy, w, h, levelDir, `${i}_${j}.webp`);
      }
      continue;
    }
    // Niveau fin : rendu depuis la carte, bande par bande.
    for (let by = 0; by < lh; by += BAND) {
      for (let bx = 0; bx < lw; bx += BAND) {
        const bw = Math.min(BAND, lw - bx), bh = Math.min(BAND, lh - by);
        const band = await render(s, [bx / s, by / s, bw / s, bh / s]);
        for (let y = 0; y < bh; y += PYRAMID_TILE) for (let x = 0; x < bw; x += PYRAMID_TILE) {
          const w = Math.min(PYRAMID_TILE, bw - x), h = Math.min(PYRAMID_TILE, bh - y);
          await cut(band, x, y, w, h, w, h, levelDir, `${(bx + x) / PYRAMID_TILE}_${(by + y) / PYRAMID_TILE}.webp`);
        }
        band.width = band.height = 0;
      }
    }
  }
  tile.width = tile.height = 0;

  // Aperçu et description, une fois toutes les tuiles envoyées.
  await Promise.all(pending);
  const previewPath = await upload(dir, new File([await toBlob(preview, "image/webp", 0.92)], `${key}.vellum.webp`, { type: "image/webp" }));
  const dzi = `<?xml version="1.0" encoding="UTF-8"?>
<Image xmlns="http://schemas.microsoft.com/deepzoom/2008" Format="webp" Overlap="0" TileSize="${PYRAMID_TILE}">
  <Size Width="${width}" Height="${height}"/>
</Image>
`;
  // .xml et non .dzi : Foundry refuse d'envoyer les .dzi (Vellum 0.4.5 lit les deux).
  await upload(dir, new File([dzi], `${key}.xml`, { type: "application/xml" }));
  return `${previewPath}?v=${Date.now()}`;
}

/** Réglage : finesse du fond exporté (le découpage en tuiles demande Vellum). */
export function registerBackground() {
  game.settings.register(MODULE_ID, "backgroundPpc", {
    name: "CADASTRE.Settings.BackgroundPpc",
    hint: "CADASTRE.Settings.BackgroundPpcHint",
    scope: "world",
    config: true,
    type: Number,
    choices: Object.fromEntries(BACKGROUND_PPCS.map((n) => [n, `CADASTRE.Settings.BackgroundPpcs.${n}`])),
    default: 300
  });
}

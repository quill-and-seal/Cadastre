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
 * @param {((x0:number, y0:number, x1:number, y1:number)=>boolean)|null} [o.dirty]
 *   réexport partiel : la zone (en cases) a-t-elle changé depuis le dernier export ? Les tuiles
 *   des zones inchangées ne sont ni redessinées ni renvoyées. null : tout.
 * @returns {Promise<{src:string, failed:number, sent:number, skipped:number}>}
 *   chemin de l'aperçu (avec son paramètre de version), tuiles non envoyées, envoyées, gardées
 */
export async function exportPyramid({ map, ppc, preview, previewScale, render, key, onProgress, dirty = null }) {
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
  // Tuile (i, j) d'un niveau à « s » px par case : touchée par un changement ? (marge : bords lissés)
  const M = 0.3;
  const changed = (s, i, j, lw, lh) => {
    if (!dirty) return true;
    const x = i * PYRAMID_TILE, y = j * PYRAMID_TILE;
    const w = Math.min(PYRAMID_TILE, lw - x), h = Math.min(PYRAMID_TILE, lh - y);
    return dirty(x / s - M, y / s - M, (x + w) / s + M, (y + h) / s + M);
  };
  let total = 0, skipped = 0;
  for (const l of levels) {
    for (let j = 0; j < l.rows; j++) for (let i = 0; i < l.cols; i++) {
      if (changed(ppc / l.k, i, j, l.lw, l.lh)) total++;
      else skipped++;
    }
  }
  let done = 0, failed = 0;
  const pending = new Set();
  const send = async (d, file) => {
    while (pending.size >= PARALLEL_UPLOADS) await Promise.race(pending);
    const p = upload(d, file).catch((error) => { failed++; log("Tuile non envoyée", file.name, error); }).finally(() => pending.delete(p));
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
        if (!changed(s, i, j, lw, lh)) continue;
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
        // Seules les tuiles changées de la bande, rendues dans le plus petit rectangle qui les contient.
        const todo = [];
        for (let y = 0; y < bh; y += PYRAMID_TILE) for (let x = 0; x < bw; x += PYRAMID_TILE) {
          const i = (bx + x) / PYRAMID_TILE, j = (by + y) / PYRAMID_TILE;
          if (changed(s, i, j, lw, lh)) todo.push([x, y, i, j]);
        }
        if (!todo.length) continue;
        const rx0 = Math.min(...todo.map((t) => t[0])), ry0 = Math.min(...todo.map((t) => t[1]));
        const rx1 = Math.min(bw, Math.max(...todo.map((t) => t[0])) + PYRAMID_TILE);
        const ry1 = Math.min(bh, Math.max(...todo.map((t) => t[1])) + PYRAMID_TILE);
        const band = await render(s, [(bx + rx0) / s, (by + ry0) / s, (rx1 - rx0) / s, (ry1 - ry0) / s]);
        for (const [x, y, i, j] of todo) {
          const w = Math.min(PYRAMID_TILE, bw - x), h = Math.min(PYRAMID_TILE, bh - y);
          await cut(band, x - rx0, y - ry0, w, h, w, h, levelDir, `${i}_${j}.webp`);
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
  return { src: `${previewPath}?v=${Date.now()}`, failed, sent: total, skipped };
}

/* -------------------------------------------- */
/*  Réexport partiel : empreinte de la carte    */
/* -------------------------------------------- */

/** Finesse de l'empreinte (pixels par case) : assez pour voir un caillou bouger. */
export const PRINT_PPC = 16;
/** Change quand le rendu des tuiles change : toutes les tuiles sont alors refaites. */
export const TILES_VERSION = 1;

/**
 * Empreinte d'un rendu de la carte entière à PRINT_PPC : un nombre par case, calculé sur ses
 * pixels. Le rendu est le même à chaque export tant que rien ne change : deux empreintes qui
 * diffèrent sur une case disent que son dessin a changé (sol, objet, ombre, eau, herbe…).
 * @returns {string} base64 (4 octets par case)
 */
export function fingerprint(canvas, width, height) {
  const data = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
  const out = new Uint32Array(width * height);
  const cw = canvas.width;
  for (let cy = 0; cy < height; cy++) {
    for (let cx = 0; cx < width; cx++) {
      let h = 2166136261;
      for (let y = cy * PRINT_PPC; y < Math.min(canvas.height, (cy + 1) * PRINT_PPC); y++) {
        for (let x = cx * PRINT_PPC, o = (y * cw + x) * 4; x < Math.min(cw, (cx + 1) * PRINT_PPC); x++, o += 4) {
          h = Math.imul(h ^ data[o], 16777619);
          h = Math.imul(h ^ data[o + 1], 16777619);
          h = Math.imul(h ^ data[o + 2], 16777619);
        }
      }
      out[cy * width + cx] = h >>> 0;
    }
  }
  return encodePrint(out);
}

const encodePrint = (u32) => {
  const bytes = new Uint8Array(u32.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const decodePrint = (b64) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Uint32Array(bytes.buffer);
};

/**
 * Zones changées entre deux exports : fonction (x0, y0, x1, y1 en cases) → la zone touche-t-elle
 * une case changée ? null quand tout doit être refait (pas d'export précédent, autre réglage…).
 */
export function changedAreas(prev, next) {
  if (!prev || prev.version !== next.version || prev.key !== next.key || prev.ppc !== next.ppc
    || prev.width !== next.width || prev.height !== next.height || !prev.print) return null;
  const a = decodePrint(prev.print), b = decodePrint(next.print);
  if (a.length !== b.length) return null;
  const W = next.width, H = next.height;
  // Somme cumulée des cases changées : une zone se teste en temps constant.
  const sum = new Uint32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = a[y * W + x] !== b[y * W + x] ? 1 : 0;
    sum[(y + 1) * (W + 1) + x + 1] = v + sum[y * (W + 1) + x + 1] + sum[(y + 1) * (W + 1) + x] - sum[y * (W + 1) + x];
  }
  const count = sum[H * (W + 1) + W];
  const fn = (x0, y0, x1, y1) => {
    const ax = Math.max(0, Math.floor(x0)), ay = Math.max(0, Math.floor(y0));
    const bx = Math.min(W, Math.ceil(x1)), by = Math.min(H, Math.ceil(y1));
    if (bx <= ax || by <= ay) return false;
    return sum[by * (W + 1) + bx] - sum[ay * (W + 1) + bx] - sum[by * (W + 1) + ax] + sum[ay * (W + 1) + ax] > 0;
  };
  fn.count = count;
  return fn;
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

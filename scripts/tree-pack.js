/**
 * Arbres générés d'une carte, prêts pour la scène : chacun est dessiné (en arrière-plan) à la
 * taille voulue, en morceaux rigides (tree-paint.js) rangés dans des pages d'images que le calque
 * tree-layer.js fait pivoter au vent ; son ombre est rangée dans des pages à part, posées par le
 * même calque entre l'herbe et les arbres.
 */
import { TREE_BY_TYPE, treeRadius } from "./trees.js";
import { treeSprites } from "./tree-sprites.js";
import { makeCanvas } from "./tree-paint.js";

/** Finesse des ombres au plus (pixels par case) : leur bord est flou, inutile d'en garder plus. */
export const SHADOW_PPC = 96;

/** Taille d'une page d'images d'arbres, en pixels. */
export const TREE_PAGE = 4096;
/** Nombre de pages au plus pour tous les arbres d'une scène (mémoire de la carte graphique des joueurs). */
export const TREE_BUDGET = 4;

/**
 * Finesse des arbres dans la scène, en pixels par case : bien plus que l'image de fond, pour
 * qu'ils restent nets quand on zoome (jusqu'à 2,5× pour une case de 100 px).
 */
export const treePpc = (gridSize) => Math.min(320, Math.round(gridSize * 2.5));

/** Un morceau d'arbre tel que gardé dans la scène (positions relatives au pied du tronc, en pixels). */
export function pieceRecord(p, half) {
  const r1 = (n) => Math.round(n * 10) / 10;
  return { id: p.id, w: p.w, h: p.h, ox: r1(p.x0 - half), oy: r1(p.y0 - half), ax: r1(p.ax - half), ay: r1(p.ay - half), lx: r1(p.lx), ly: r1(p.ly), hz: r1(p.h3 * 100) / 100 };
}

/**
 * @param {object} map
 * @param {number} ppc  pixels par case des arbres (un très grand arbre est un peu moins fin, pour
 *   tenir dans une page)
 * @param {{sun?:number, onProgress?:(done:number)=>void}} [opts]  sun : allongement des ombres
 * @returns {Promise<{items:object[], pages:{color, used:number}[], shadowPages:{color, used:number}[], shadowPpc:number}>}
 *   models : { ppc, half, radius, kind, seed, rot, conifer, rigid, pieces:[{page, u, v, …pieceRecord}],
 *     s : [page, u, v, w, h, cx, cy] (ombre dans les pages d'ombres, pied du tronc en cx, cy) }
 *   items : { x, y (cases), m (modèle), spin, radius }
 */
export async function packTrees(map, ppc, { sun = 1, onProgress = null } = {}) {
  const props = map.props.filter((p) => TREE_BY_TYPE.get(p.type)?.proc);
  const out = { items: [], models: [], pages: [], shadowPages: [], shadowPpc: 0 };
  let done = 0;
  // Marge entre deux morceaux : assez pour que les réductions (mipmaps) ne mélangent pas leurs bords.
  const gap = 8;
  // Rangement en étagères, au fil des images qui arrivent : une suite de pages par sorte d'image.
  const shelves = (pages) => {
    let page = null, x = 0, y = 0, rowH = 0;
    return (w, h) => {
      if (page && x + w + gap > TREE_PAGE) { x = 0; y += rowH; rowH = 0; }
      if (!page || y + h + gap > TREE_PAGE) {
        page = { color: makeCanvas(TREE_PAGE, TREE_PAGE), used: 0 };
        pages.push(page);
        x = 0; y = 0; rowH = 0;
      }
      const at = { page: pages.indexOf(page), u: x, v: y };
      page.used = Math.max(page.used, y + h + gap);
      x += w + gap; rowH = Math.max(rowH, h + gap);
      return at;
    };
  };
  const place = shelves(out.pages), placeShadow = shelves(out.shadowPages);
  // Budget : toutes les images d'arbres tiennent dans TREE_BUDGET pages ; une grande forêt est
  // donc envoyée un peu moins fine (les arbres à l'écran se redessinent plus fins quand on zoome).
  const uniq = new Map();
  for (const p of props) {
    const def = TREE_BY_TYPE.get(p.type), radius = treeRadius(def, p.k);
    uniq.set(JSON.stringify([def.proc, p.s ?? 0, Math.round(radius * 100), def.spin ? 0 : Math.round(p.a ?? 0)]), radius);
  }
  let area = 0;
  for (const radius of uniq.values()) area += (2 * (radius + 0.5)) ** 2 * 1.5;
  ppc = Math.max(48, Math.min(ppc, Math.floor(Math.sqrt((TREE_BUDGET * TREE_PAGE * TREE_PAGE) / Math.max(1e-6, area)))));
  out.ppc = ppc;
  // Ombres : un peu moins fines que les arbres (leur bord est flou).
  const sppc = out.shadowPpc = Math.max(24, Math.min(SHADOW_PPC, Math.round(ppc * 0.7)));
  // Plantes identiques (mêmes essence, graine, taille et orientation : les variantes du
  // sous-bois) : dessinées une seule fois, et leurs morceaux partagés dans les pages.
  const groups = new Map();
  for (const p of props) {
    const def = TREE_BY_TYPE.get(p.type);
    const radius = treeRadius(def, p.k);
    const tp = Math.min(ppc, Math.floor((TREE_PAGE - 8) / (2 * (radius + 0.5))));
    const req = { kind: def.proc, seed: p.s ?? 0, radius: Math.round(radius * 100) / 100, rotation: def.spin ? 0 : Math.round(p.a ?? 0), ppc: tp, detail: 1, sun };
    const key = JSON.stringify(req);
    if (!groups.has(key)) groups.set(key, { req, props: [] });
    groups.get(key).props.push({ p, spin: def.spin ? Math.round(p.a ?? 0) : 0 });
  }
  await Promise.all([...groups.values()].map(async ({ req, props: same }) => {
    const r = await treeSprites.get(req);
    const pieces = [];
    for (const q of r.pieces) {
      if (q.w + gap <= TREE_PAGE && q.h + gap <= TREE_PAGE) {
        const at = place(q.w, q.h);
        out.pages[at.page].color.getContext("2d").drawImage(q.img, at.u, at.v);
        pieces.push({ ...at, ...pieceRecord(q, r.half) });
      }
      q.img?.close?.();
    }
    // L'ombre, réduite à la finesse des ombres, dans les pages d'ombres.
    const f = sppc / req.ppc;
    const sw = Math.max(1, Math.ceil(r.shadowW * f)), sh = Math.max(1, Math.ceil(r.shadowH * f));
    let s = null;
    if (r.shadow && sw + gap <= TREE_PAGE && sh + gap <= TREE_PAGE) {
      const at = placeShadow(sw, sh);
      out.shadowPages[at.page].color.getContext("2d").drawImage(r.shadow, at.u, at.v, sw, sh);
      const r1 = (n) => Math.round(n * 10) / 10;
      s = [at.page, at.u, at.v, sw, sh, r1(r.half * f), r1(r.half * f)];
    }
    r.shadow?.close?.();
    // Modèle : ce que partagent les plantes identiques ; kind, seed, radius, rot : de quoi le
    // redessiner plus fin quand on zoome (tree-layer.js).
    const m = out.models.length;
    out.models.push({ ppc: req.ppc, half: r.half, radius: req.radius, kind: req.kind, seed: req.seed, rot: req.rotation, conifer: r.conifer, rigid: r.rigid, pieces, ...(s ? { s } : {}),
      z: [Math.round((r.zlo ?? 0) * 100) / 100, Math.round((r.zhi ?? 0) * 100) / 100] });
    for (const { p, spin } of same) {
      // spin : rotation appliquée à l'affichage (petites plantes).
      out.items.push({ x: p.x, y: p.y, m, spin, radius: req.radius });
      onProgress?.(++done);
    }
  }));
  // Dans la scène, les plus petites plantes sont posées d'abord : le sous-bois reste sous les arbres.
  out.items.sort((a, b) => a.radius - b.radius);
  return out;
}

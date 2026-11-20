/**
 * Arbres générés d'une carte, prêts pour la scène : chacun est dessiné (en arrière-plan) à la
 * taille voulue, en morceaux rigides (tree-paint.js) rangés dans des pages d'images que le calque
 * tree-layer.js fait pivoter au vent ; son ombre est gardée à part pour l'image de fond.
 */
import { TREE_BY_TYPE, treeRadius } from "./trees.js";
import { treeSprites } from "./tree-sprites.js";
import { makeCanvas } from "./tree-paint.js";

/** Taille d'une page d'images d'arbres, en pixels. */
export const TREE_PAGE = 4096;

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
 * @param {{shadowPpc?:number, onProgress?:(done:number)=>void}} [opts]  shadowPpc : pixels par case
 *   de l'image de fond, où les ombres seront peintes
 * @returns {Promise<{items:object[], pages:{color, used:number}[], shadows:object[]}>}
 *   items : { x, y (cases), ppc, half, radius, kind, seed, rot, conifer, rigid, pieces:[{page, u, v, …pieceRecord}] }
 */
export async function packTrees(map, ppc, { shadowPpc = map.gridSize, onProgress = null } = {}) {
  const props = map.props.filter((p) => TREE_BY_TYPE.get(p.type)?.proc);
  const out = { items: [], pages: [], shadows: [] };
  let page = null, x = 0, y = 0, rowH = 0, done = 0;
  const gap = 2;
  const newPage = () => {
    page = { color: makeCanvas(TREE_PAGE, TREE_PAGE), used: 0 };
    out.pages.push(page);
    x = 0; y = 0; rowH = 0;
  };
  // Rangement en étagères, au fil des morceaux qui arrivent.
  const place = (w, h) => {
    if (page && x + w + gap > TREE_PAGE) { x = 0; y += rowH; rowH = 0; }
    if (!page || y + h + gap > TREE_PAGE) newPage();
    const at = { page: out.pages.indexOf(page), u: x, v: y };
    page.used = Math.max(page.used, y + h + gap);
    x += w + gap; rowH = Math.max(rowH, h + gap);
    return at;
  };
  await Promise.all(props.map(async (p) => {
    const def = TREE_BY_TYPE.get(p.type);
    const radius = treeRadius(def, p.k);
    const tp = Math.min(ppc, Math.floor((TREE_PAGE - 8) / (2 * (radius + 0.5))));
    const r = await treeSprites.get({ kind: def.proc, seed: p.s ?? 0, radius, rotation: p.a, ppc: tp, detail: 1 });
    const pieces = [];
    for (const q of r.pieces) {
      if (q.w + gap <= TREE_PAGE && q.h + gap <= TREE_PAGE) {
        const at = place(q.w, q.h);
        out.pages[at.page].color.getContext("2d").drawImage(q.img, at.u, at.v);
        pieces.push({ ...at, ...pieceRecord(q, r.half) });
      }
      q.img?.close?.();
    }
    // kind, seed, radius, rot : de quoi le redessiner plus fin quand on zoome (tree-layer.js).
    out.items.push({ x: p.x, y: p.y, ppc: tp, half: r.half, radius, kind: def.proc, seed: p.s ?? 0, rot: p.a, conifer: r.conifer, rigid: r.rigid, pieces });
    // L'ombre est gardée à la résolution de l'image de fond, où elle sera peinte.
    const f = shadowPpc / tp;
    const sw = Math.max(1, Math.ceil(r.shadowW * f)), sh = Math.max(1, Math.ceil(r.shadowH * f)), shadow = makeCanvas(sw, sh);
    shadow.getContext("2d").drawImage(r.shadow, 0, 0, sw, sh);
    out.shadows.push({ x: p.x, y: p.y, half: r.half * f, img: shadow });
    r.shadow?.close?.();
    onProgress?.(++done);
  }));
  // Dans la scène, les plus petites plantes sont posées d'abord : le sous-bois reste sous les arbres.
  out.items.sort((a, b) => a.radius - b.radius);
  return out;
}

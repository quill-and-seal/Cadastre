/**
 * Arbres générés d'une carte, prêts pour la scène : chacun est dessiné (en arrière-plan) à la
 * taille voulue ; l'arbre et sa carte du vent sont rangés dans des pages d'images (que le calque
 * tree-layer.js anime), son ombre est gardée à part pour être peinte dans l'image de fond.
 */
import { TREE_BY_TYPE, treeRadius } from "./trees.js";
import { treeSprites } from "./tree-sprites.js";
import { makeCanvas } from "./tree-paint.js";

/** Taille d'une page d'images d'arbres, en pixels. */
export const TREE_PAGE = 4096;
/** La carte du vent est lisse : elle est rangée à demi-résolution. */
export const DATA_SCALE = 0.5;

/**
 * Finesse des arbres dans la scène, en pixels par case : bien plus que l'image de fond, pour
 * qu'ils restent nets quand on zoome (jusqu'à 2,5× pour une case de 100 px).
 */
export const treePpc = (gridSize) => Math.min(320, Math.round(gridSize * 2.5));

/**
 * @param {object} map
 * @param {number} ppc  pixels par case des arbres (un très grand arbre est un peu moins fin, pour
 *   tenir dans une page)
 * @param {{shadowPpc?:number, onProgress?:(done:number)=>void}} [opts]  shadowPpc : pixels par case
 *   de l'image de fond, où les ombres seront peintes
 * @returns {Promise<{items:object[], pages:{color, data, used:number}[], shadows:object[]}>}
 *   items : { x, y (cases), page, u, v, size, half (pixels de la page de couleur), ppc, kind, seed, radius, rot }
 */
export async function packTrees(map, ppc, { shadowPpc = map.gridSize, onProgress = null } = {}) {
  const props = map.props.filter((p) => TREE_BY_TYPE.get(p.type)?.proc);
  const out = { items: [], pages: [], shadows: [] };
  let page = null, x = 0, y = 0, rowH = 0, done = 0;
  const D = DATA_SCALE;
  const newPage = () => {
    page = { color: makeCanvas(TREE_PAGE, TREE_PAGE), data: makeCanvas(TREE_PAGE * D, TREE_PAGE * D), used: 0 };
    out.pages.push(page);
    x = 0; y = 0; rowH = 0;
  };
  // Rangement en étagères, au fil des arbres qui arrivent ; 4 px de marge entre deux arbres.
  await Promise.all(props.map(async (p) => {
    const def = TREE_BY_TYPE.get(p.type);
    const radius = treeRadius(def, p.k);
    const tp = Math.min(ppc, Math.floor((TREE_PAGE - 8) / (2 * (radius + 0.5))));
    const r = await treeSprites.get({ kind: def.proc, seed: p.s ?? 0, radius, rotation: p.a, ppc: tp, detail: 1 });
    const size = r.half * 2, gap = 4;
    if (size + gap <= TREE_PAGE) {
      if (page && x + size + gap > TREE_PAGE) { x = 0; y += rowH; rowH = 0; }
      if (!page || y + size + gap > TREE_PAGE) newPage();
      page.color.getContext("2d").drawImage(r.color, x, y);
      page.data.getContext("2d").drawImage(r.data, x * D, y * D, size * D, size * D);
      page.used = Math.max(page.used, y + size + gap);
      // kind, seed, radius, rot : de quoi le redessiner plus fin quand on zoome (tree-layer.js).
      out.items.push({ x: p.x, y: p.y, page: out.pages.indexOf(page), u: x, v: y, size, half: r.half, ppc: tp, kind: def.proc, seed: p.s ?? 0, radius, rot: p.a });
      x += size + gap; rowH = Math.max(rowH, size + gap);
      // L'ombre est gardée à la résolution de l'image de fond, où elle sera peinte.
      const f = shadowPpc / tp;
      const sw = Math.max(1, Math.ceil(r.shadowW * f)), sh = Math.max(1, Math.ceil(r.shadowH * f)), shadow = makeCanvas(sw, sh);
      shadow.getContext("2d").drawImage(r.shadow, 0, 0, sw, sh);
      out.shadows.push({ x: p.x, y: p.y, half: r.half * f, img: shadow });
    }
    for (const b of [r.color, r.data, r.shadow]) b?.close?.();
    onProgress?.(++done);
  }));
  return out;
}

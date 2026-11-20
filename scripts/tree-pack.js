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

/**
 * @param {object} map
 * @param {number} ppc  pixels par case
 * @param {(done:number)=>void} [onProgress]
 * @returns {Promise<{items:object[], pages:{color, data, used:number}[], shadows:object[]}>}
 *   items : { x, y (cases), page, u, v (pixels dans la page), size, half (pixels) }
 */
export async function packTrees(map, ppc, onProgress = null) {
  const props = map.props.filter((p) => TREE_BY_TYPE.get(p.type)?.proc);
  const out = { items: [], pages: [], shadows: [] };
  let page = null, x = 0, y = 0, rowH = 0, done = 0;
  const newPage = () => {
    page = { color: makeCanvas(TREE_PAGE, TREE_PAGE), data: makeCanvas(TREE_PAGE, TREE_PAGE), used: 0 };
    out.pages.push(page);
    x = 0; y = 0; rowH = 0;
  };
  // Rangement en étagères, au fil des arbres qui arrivent ; 2 px de marge entre deux arbres.
  await Promise.all(props.map(async (p) => {
    const def = TREE_BY_TYPE.get(p.type);
    const r = await treeSprites.get({ kind: def.proc, seed: p.s ?? 0, radius: treeRadius(def, p.k), rotation: p.a, ppc, detail: 1 });
    const size = r.half * 2;
    if (size + 2 <= TREE_PAGE) {
      if (page && x + size + 2 > TREE_PAGE) { x = 0; y += rowH; rowH = 0; }
      if (!page || y + size + 2 > TREE_PAGE) newPage();
      page.color.getContext("2d").drawImage(r.color, x, y);
      page.data.getContext("2d").drawImage(r.data, x, y);
      page.used = Math.max(page.used, y + size + 2);
      out.items.push({ x: p.x, y: p.y, page: out.pages.indexOf(page), u: x, v: y, size, half: r.half });
      x += size + 2; rowH = Math.max(rowH, size + 2);
      // L'ombre est gardée à demi-résolution (elle est floue) jusqu'au rendu du fond.
      const sw = Math.ceil(r.shadowW / 2), sh = Math.ceil(r.shadowH / 2), shadow = makeCanvas(sw, sh);
      shadow.getContext("2d").drawImage(r.shadow, 0, 0, sw, sh);
      out.shadows.push({ x: p.x, y: p.y, half: r.half, w: r.shadowW, h: r.shadowH, img: shadow });
    }
    for (const b of [r.color, r.data, r.shadow]) b?.close?.();
    onProgress?.(++done);
  }));
  return out;
}

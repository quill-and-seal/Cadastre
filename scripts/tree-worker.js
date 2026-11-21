/**
 * Dessin des arbres en arrière-plan (un arbre feuillu compte des dizaines de milliers de
 * feuilles). Reçoit l'arbre voulu, renvoie ses images prêtes à poser : une image pour l'aperçu
 * de l'éditeur, ou ses morceaux rigides (et son ombre) pour la scène.
 */
import { buildTree } from "./tree-gen.js";
import { paintTree, previewImage } from "./tree-paint.js";

self.onmessage = async (event) => {
  const { id, kind, seed, radius, rotation, ppc, detail, preview, sun } = event.data;
  try {
    const sprite = paintTree(buildTree(kind, seed, radius, { detail, rotation }), ppc, { wind: !preview, sun });
    if (preview) {
      const blob = await previewImage(sprite).convertToBlob({ type: "image/webp", quality: 0.9 });
      self.postMessage({ id, half: sprite.half, shadowW: sprite.shadowW, shadowH: sprite.shadowH, blob });
      return;
    }
    const shadow = sprite.shadow.transferToImageBitmap();
    const pieces = sprite.pieces.map(({ canvas, ...p }) => ({ ...p, z: Number.isFinite(p.z) ? p.z : -1e9, img: canvas.transferToImageBitmap() }));
    self.postMessage({ id, half: sprite.half, shadowW: sprite.shadowW, shadowH: sprite.shadowH, shadow, pieces, conifer: sprite.conifer, rigid: sprite.rigid },
      [shadow, ...pieces.map((p) => p.img)]);
  } catch (error) {
    self.postMessage({ id, error: String(error?.stack ?? error) });
  }
};

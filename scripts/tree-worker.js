/**
 * Dessin des arbres en arrière-plan (un arbre feuillu compte des dizaines de milliers de
 * feuilles). Reçoit l'arbre voulu, renvoie ses images prêtes à poser.
 */
import { buildTree } from "./tree-gen.js";
import { paintTree, previewImage } from "./tree-paint.js";

self.onmessage = async (event) => {
  const { id, kind, seed, radius, rotation, ppc, detail, preview } = event.data;
  try {
    const sprite = paintTree(buildTree(kind, seed, radius, { detail, rotation }), ppc, { wind: !preview });
    if (preview) {
      const blob = await previewImage(sprite).convertToBlob({ type: "image/webp", quality: 0.9 });
      self.postMessage({ id, half: sprite.half, shadowW: sprite.shadowW, shadowH: sprite.shadowH, blob });
      return;
    }
    const color = sprite.color.transferToImageBitmap(), data = sprite.data.transferToImageBitmap(), shadow = sprite.shadow.transferToImageBitmap();
    self.postMessage({ id, half: sprite.half, shadowW: sprite.shadowW, shadowH: sprite.shadowH, color, data, shadow }, [color, data, shadow]);
  } catch (error) {
    self.postMessage({ id, error: String(error?.stack ?? error) });
  }
};

/** Peinture d'une tuile de sol en arrière-plan (des dizaines de milliers d'éléments). */
import { paintGround } from "./ground.js";

self.onmessage = async (event) => {
  const { id, kind, ppc, seed } = event.data;
  try {
    const blob = await paintGround(kind, ppc, seed).convertToBlob({ type: "image/webp", quality: 0.9 });
    self.postMessage({ id, blob });
  } catch (error) {
    self.postMessage({ id, error: String(error?.stack ?? error) });
  }
};

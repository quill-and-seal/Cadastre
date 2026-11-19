/**
 * Calcul des brins en arrière-plan, pour l'éditeur : retoucher la carte ne fait pas d'à-coup.
 * Reçoit la carte et les empreintes des morceaux déjà calculés ; renvoie le champ, sans les
 * octets des morceaux inchangés (l'éditeur garde les siens).
 */
import { grassZone, normalizeWind } from "./wind.js";
import { bladeField } from "./grass.js";

self.onmessage = (event) => {
  const { id, map, previous = [] } = event.data;
  try {
    const wind = normalizeWind(map.wind);
    const prev = new Map(previous.map((p) => [p.key, { cx: p.cx, cy: p.cy, data: null }]));
    const field = bladeField(grassZone(map), wind, { previous: prev });
    const transfer = field.chunks.filter((c) => c.data).map((c) => c.data.buffer);
    self.postMessage({ id, field, wind }, transfer);
  } catch (error) {
    self.postMessage({ id, error: String(error?.stack ?? error) });
  }
};

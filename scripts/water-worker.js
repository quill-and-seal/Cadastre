/**
 * Calcul de l'eau en arrière-plan, pour l'éditeur. Reçoit la carte ; si rien de ce qui touche
 * l'eau n'a changé (contours, rivières, objets posés dedans, nombre de particules), répond
 * « pareil » et l'éditeur garde son eau et son écume. Sinon renvoie le champ de courant et une
 * simulation déjà lancée depuis quelques secondes (l'écume a trouvé sa place).
 */
import { waterFlag, buildField, normalizeWater, WaterSim } from "./water.js";

let lastKey = null;

self.onmessage = (event) => {
  const { id, map, force = false } = event.data;
  try {
    const flag = waterFlag(map);
    if (!flag) { lastKey = null; self.postMessage({ id, empty: true }); return; }
    const settings = normalizeWater(flag.water);
    const { water, ...shape } = flag;
    const key = JSON.stringify(shape) + JSON.stringify([settings.strokes, settings.particles, settings.density, settings.texture]);
    if (!force && key === lastKey) { self.postMessage({ id, same: true, settings }); return; }
    lastKey = key;
    const field = buildField(flag);
    const sim = new WaterSim(field, settings);
    for (let i = 0; i < 60; i++) sim.step(1 / 20);
    const state = sim.state();
    const transfer = [field.n, field.vx, field.vy, field.a, field.block, field.cells, field.quads, state.P, state.Q].map((a) => a.buffer);
    self.postMessage({ id, field, settings, state }, transfer);
  } catch (error) {
    lastKey = null;
    self.postMessage({ id, error: String(error?.stack ?? error) });
  }
};

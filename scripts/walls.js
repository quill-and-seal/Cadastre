/**
 * Traduction des murs de la carte en données de murs Foundry (pur, testable).
 */
import { MODULE_ID } from "./constants.js";
import { wallPoints, doorEnds } from "./model.js";
import { cutIntervals, rdp } from "./curves.js";

/** Types de porte de Foundry (CONST.WALL_DOOR_TYPES). */
const DOOR = { NONE: 0, DOOR: 1, SECRET: 2 };

/** Écart maximal entre une courbe et les murs droits qui la suivent, en cases. */
export const EXPORT_TOLERANCE = 0.05;

/**
 * Données de murs pour une scène sans marge (padding 0), une case = `gridSize` px.
 * Les courbes sont découpées en segments droits ; chaque porte (ou porte secrète)
 * devient un mur à part, tendu entre ses deux bords. Tous portent un drapeau qui
 * permet de les remplacer à la mise à jour de la scène.
 */
export function buildWallData(map, { gridSize = map.gridSize, tolerance = EXPORT_TOLERANCE } = {}) {
  const px = ([x, y]) => [Math.round(x * gridSize * 10) / 10, Math.round(y * gridSize * 10) / 10];
  const out = [];
  const push = (a, b, door) => {
    const c = [...px(a), ...px(b)];
    if (c[0] === c[2] && c[1] === c[3]) return;
    out.push({ c, door, flags: { [MODULE_ID]: { generated: true } } });
  };

  for (const wall of map.walls) {
    const pts = wallPoints(wall, tolerance / 2);
    const cuts = map.doors.filter((d) => d.wall === wall.id).map((d) => [d.s - d.w / 2, d.s + d.w / 2]);
    for (const piece of cutIntervals(pts, wall.closed, cuts)) {
      const simple = rdp(piece, tolerance / 2);
      for (let k = 0; k + 1 < simple.length; k++) push(simple[k], simple[k + 1], DOOR.NONE);
    }
  }
  for (const door of map.doors) {
    const ends = doorEnds(map, door);
    if (ends) push(ends.a, ends.b, door.kind === "secret" ? DOOR.SECRET : DOOR.DOOR);
  }
  return out;
}

/**
 * Taille de l'image à produire : la scène fait `width × gridSize` px ; au-delà de `maxSide`,
 * l'image est réduite proportionnellement (Foundry l'étire à la taille de la scène).
 */
export function textureScale(map, maxSide) {
  const side = Math.max(map.width, map.height) * map.gridSize;
  const factor = side > maxSide ? maxSide / side : 1;
  return {
    sceneWidth: map.width * map.gridSize,
    sceneHeight: map.height * map.gridSize,
    scale: map.gridSize * factor,
    reduced: factor < 1
  };
}

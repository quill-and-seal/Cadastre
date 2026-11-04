/**
 * Traduction des murs de la carte en données de murs Foundry (pur, testable).
 */
import { MODULE_ID } from "./constants.js";
import { mergeSegments, edgesOfKind } from "./geometry.js";

/** Types de porte de Foundry (CONST.WALL_DOOR_TYPES). */
const DOOR = { NONE: 0, DOOR: 1, SECRET: 2 };

/**
 * Données de murs pour une scène sans marge (padding 0), une case = `gridSize` px.
 * Les murs pleins sont fusionnés en segments longs ; chaque porte reste un mur à part
 * pour s'ouvrir seule. Tous portent un drapeau qui permet de les remplacer à la mise à jour.
 */
export function buildWallData(map, gridSize = map.gridSize) {
  const px = ([x, y]) => [x * gridSize, y * gridSize];
  const flags = { [MODULE_ID]: { generated: true } };
  const wall = (a, b, door) => ({ c: [...px(a), ...px(b)], door, flags: structuredClone(flags) });

  return [
    ...mergeSegments(map.edges, ["wall"]).map((s) => wall(s.a, s.b, DOOR.NONE)),
    ...edgesOfKind(map.edges, "door").map((e) => wall(e.a, e.b, DOOR.DOOR)),
    ...edgesOfKind(map.edges, "secret").map((e) => wall(e.a, e.b, DOOR.SECRET))
  ];
}

/**
 * Taille de l'image à produire : la scène fait `cols × gridSize` px ; au-delà de `maxSide`,
 * l'image est réduite proportionnellement (Foundry l'étire à la taille de la scène).
 */
export function textureScale(map, maxSide) {
  const side = Math.max(map.cols, map.rows) * map.gridSize;
  const factor = side > maxSide ? maxSide / side : 1;
  return {
    sceneWidth: map.cols * map.gridSize,
    sceneHeight: map.rows * map.gridSize,
    scale: map.gridSize * factor,
    reduced: factor < 1
  };
}

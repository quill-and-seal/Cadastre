/**
 * Géométrie de la grille : repérage sous le pointeur et fusion des murs.
 * Coordonnées en cases ; aucun accès à Foundry ni au DOM.
 */
import { parseEdgeKey, edgeEnds } from "./model.js";

/** Case sous un point. */
export const pickCell = (px, py) => [Math.floor(px), Math.floor(py)];

/** Sommet (coin de case) le plus proche. */
export const pickVertex = (px, py) => [Math.round(px), Math.round(py)];

/**
 * Arête la plus proche d'un point, si elle est à moins de `tolerance` case.
 * @returns {{o:"h"|"v", x:number, y:number}|null}
 */
export function pickEdge(px, py, tolerance = 0.3) {
  const fx = px - Math.floor(px), fy = py - Math.floor(py);
  const dh = Math.min(fy, 1 - fy), dv = Math.min(fx, 1 - fx);
  if (Math.min(dh, dv) > tolerance) return null;
  return dh <= dv
    ? { o: "h", x: Math.floor(px), y: Math.round(py) }
    : { o: "v", x: Math.round(px), y: Math.floor(py) };
}

/**
 * Fusionne les arêtes alignées et contiguës dont le type est dans `kinds`
 * en segments aussi longs que possible.
 * @param {Record<string,string>} edges
 * @param {Set<string>|string[]} kinds
 * @returns {{a:[number,number], b:[number,number]}[]}
 */
export function mergeSegments(edges, kinds) {
  const wanted = kinds instanceof Set ? kinds : new Set(kinds);
  const rows = new Map(); // "h,y" → x[] ; "v,x" → y[]
  for (const [key, kind] of Object.entries(edges)) {
    if (!wanted.has(kind)) continue;
    const { o, x, y } = parseEdgeKey(key);
    const line = o === "h" ? `h,${y}` : `v,${x}`;
    if (!rows.has(line)) rows.set(line, []);
    rows.get(line).push(o === "h" ? x : y);
  }

  const segments = [];
  for (const [line, list] of rows) {
    const [o, fixedRaw] = line.split(",");
    const fixed = Number(fixedRaw);
    list.sort((p, q) => p - q);
    let start = list[0], end = list[0] + 1;
    const flush = () => segments.push(o === "h"
      ? { a: [start, fixed], b: [end, fixed] }
      : { a: [fixed, start], b: [fixed, end] });
    for (let i = 1; i < list.length; i++) {
      if (list[i] === end) end++;
      else { flush(); start = list[i]; end = list[i] + 1; }
    }
    flush();
  }
  // Ordre stable : utile pour les tests et pour des exports reproductibles.
  segments.sort((p, q) => p.a[1] - q.a[1] || p.a[0] - q.a[0] || p.b[1] - q.b[1] || p.b[0] - q.b[0]);
  return segments;
}

/** Arêtes individuelles d'un type donné, avec leurs extrémités. */
export function edgesOfKind(edges, kind) {
  const out = [];
  for (const [key, k] of Object.entries(edges)) {
    if (k !== kind) continue;
    const e = parseEdgeKey(key);
    const [a, b] = edgeEnds(e);
    out.push({ ...e, a, b });
  }
  out.sort((p, q) => p.a[1] - q.a[1] || p.a[0] - q.a[0] || (p.o < q.o ? -1 : 1));
  return out;
}

/** Valeur pseudo-aléatoire stable pour une case (variations de teinte du sol). */
export function cellHash(x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0);
}

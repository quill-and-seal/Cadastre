/**
 * Courant des rivières : lignes qui suivent le cours d'eau, découpées en traits qui glissent
 * dans le sens du courant. Données pures, sans Foundry ni DOM ; l'éditeur les anime en SVG,
 * la scène Foundry avec PIXI (currents-layer.js).
 *
 * Une ligne : { points: [[x, y], …] (cases, dans le sens du courant), dash, gap, speed, phase, alpha, width }
 *   dash, gap : longueur d'un trait et d'un intervalle (cases) ; speed : cases par seconde.
 */
import { flattenNodes, cumulative } from "./curves.js";
import { mulberry32 } from "./catalog.js";

/** Vitesse de base du courant, en cases par seconde. */
export const BASE_SPEED = 1.1;

function hash(str) {
  let h = 2166136261;
  for (const c of String(str)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
}

/** Courbe décalée de `off` cases sur le côté (normales lissées entre segments voisins). */
export function offsetPolyline(points, off) {
  const n = points.length;
  return points.map(([x, y], i) => {
    const [ax, ay] = points[Math.max(0, i - 1)], [bx, by] = points[Math.min(n - 1, i + 1)];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    return [x - (dy / len) * off, y + (dx / len) * off];
  });
}

/** Lignes de courant de toutes les rivières (chemins d'eau dont le courant n'est pas nul). */
export function currentLines(map) {
  const out = [];
  for (const q of map.paths ?? []) {
    if (q.terrain !== "water" || !q.flow) continue;
    let pts = flattenNodes(q.nodes, q.closed, 0.03);
    if (q.closed && pts.length) pts = [...pts, pts[0]];
    if (pts.length < 2) continue;
    if (q.flow < 0) pts = pts.slice().reverse();
    const rand = mulberry32(hash(q.id));
    // Plus la rivière est large, plus il y a de filets de courant ; ils restent loin des berges.
    const count = Math.max(2, Math.min(9, Math.round(q.width * 1.6)));
    for (let i = 0; i < count; i++) {
      const across = ((i + 0.5) / count - 0.5) * q.width * 0.7 + (rand() - 0.5) * 0.12;
      // Le courant est plus rapide au milieu qu'au bord.
      const centre = 1 - Math.abs(across) / (q.width / 2);
      out.push({
        points: offsetPolyline(pts, across).map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]),
        dash: Math.round((0.5 + rand() * 0.7) * 1000) / 1000,
        gap: Math.round((0.9 + rand() * 1.4) * 1000) / 1000,
        speed: Math.round(BASE_SPEED * q.speed * (0.65 + 0.45 * centre) * (0.9 + rand() * 0.2) * 1000) / 1000,
        phase: Math.round(rand() * 3000) / 1000,
        alpha: Math.round((0.22 + rand() * 0.2) * 1000) / 1000,
        width: Math.round((0.03 + rand() * 0.025) * 1000) / 1000
      });
    }
  }
  return out;
}

/**
 * Traits visibles d'une ligne à l'instant `time` (secondes) : morceaux de la polyligne,
 * chacun avec une opacité qui monte puis descend (le trait apparaît et s'efface).
 * @returns {{points:[number,number][], alpha:number}[]}
 */
export function dashesAt(line, time) {
  const pts = line.points;
  const acc = cumulative(pts, false);
  const total = acc.at(-1);
  const period = line.dash + line.gap;
  if (!(total > 0) || !(period > 0)) return [];
  const shift = ((line.phase + time * line.speed) % period + period) % period;
  const out = [];
  for (let start = shift - period; start < total; start += period) {
    const a = Math.max(0, start), b = Math.min(total, start + line.dash);
    if (b - a < 0.02) continue;
    // Fondu près des extrémités de la rivière.
    const edge = Math.min(1, Math.min(a, total - b) / 1.5);
    out.push({ points: slice(pts, acc, a, b), alpha: line.alpha * edge });
  }
  return out;
}

function slice(pts, acc, a, b) {
  const at = (s) => {
    let k = 0;
    while (k < acc.length - 2 && acc[k + 1] < s) k++;
    const len = acc[k + 1] - acc[k] || 1, t = (s - acc[k]) / len;
    return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t];
  };
  const out = [at(a)];
  for (let k = 0; k < pts.length; k++) if (acc[k] > a && acc[k] < b) out.push(pts[k]);
  out.push(at(b));
  return out;
}

/** Données enregistrées dans la scène à l'export (lignes en cases, taille d'une case). */
export function currentsFlag(map) {
  const lines = currentLines(map);
  return lines.length ? { v: 1, gridSize: map.gridSize, lines } : null;
}

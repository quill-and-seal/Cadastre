/**
 * Courbes : tracés à nœuds de Bézier, aplatissement en polylignes, mesures le long d'un tracé.
 * Unités : cases (1 = une case de grille). Aucun accès à Foundry ni au DOM.
 *
 * Un nœud : { x, y, i?: [dx, dy], o?: [dx, dy] }
 *   i : poignée d'entrée, o : poignée de sortie, relatives au nœud. Sans poignées : coin.
 */

export const round3 = (n) => Math.round(n * 1000) / 1000;
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

/** Copie propre d'un nœud (arrondi, poignées nulles retirées). */
export function cleanNode(n) {
  const out = { x: round3(n.x), y: round3(n.y) };
  if (n.i && (n.i[0] || n.i[1])) out.i = [round3(n.i[0]), round3(n.i[1])];
  if (n.o && (n.o[0] || n.o[1])) out.o = [round3(n.o[0]), round3(n.o[1])];
  return out;
}

/**
 * Polyligne d'un tracé. Fermé : le dernier point n'est pas répété.
 * @param {number} tol  écart maximal toléré entre la courbe et la polyligne, en cases
 * @returns {[number, number][]}
 */
export function flattenNodes(nodes, closed = false, tol = 0.02) {
  if (!nodes?.length) return [];
  const pts = [[nodes[0].x, nodes[0].y]];
  const count = closed ? nodes.length : nodes.length - 1;
  for (let k = 0; k < count; k++) {
    const a = nodes[k], b = nodes[(k + 1) % nodes.length];
    if (!a.o && !b.i) {
      pts.push([b.x, b.y]);
      continue;
    }
    const c1x = a.x + (a.o?.[0] ?? 0), c1y = a.y + (a.o?.[1] ?? 0);
    const c2x = b.x + (b.i?.[0] ?? 0), c2y = b.y + (b.i?.[1] ?? 0);
    // Nombre de pas : selon la flèche du polygone de contrôle.
    const flat = Math.max(
      Math.abs(a.x - 2 * c1x + c2x) + Math.abs(a.y - 2 * c1y + c2y),
      Math.abs(c1x - 2 * c2x + b.x) + Math.abs(c1y - 2 * c2y + b.y)
    );
    const n = Math.min(96, Math.max(2, Math.ceil(Math.sqrt((0.75 * flat) / tol))));
    for (let s = 1; s <= n; s++) {
      const t = s / n, u = 1 - t;
      const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
      pts.push([w0 * a.x + w1 * c1x + w2 * c2x + w3 * b.x, w0 * a.y + w1 * c1y + w2 * c2y + w3 * b.y]);
    }
  }
  if (closed && pts.length > 1) pts.pop(); // retour au premier nœud
  return pts;
}

/** Simplification de Ramer-Douglas-Peucker (polyligne ouverte). */
export function rdp(points, eps) {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const [ax, ay] = points[first], [bx, by] = points[last];
    const len = dist(ax, ay, bx, by);
    let maxD = -1, index = -1;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i];
      const d = len < 1e-12
        ? dist(ax, ay, px, py)
        : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > maxD) { maxD = d; index = i; }
    }
    if (maxD > eps) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Nœuds lissés passant par des points (Catmull-Rom converti en Bézier) :
 * sert à transformer un tracé à main levée en courbe douce et retouchable.
 */
export function smoothNodes(points, closed = false) {
  const n = points.length;
  return points.map(([x, y], k) => {
    const hasPrev = closed || k > 0, hasNext = closed || k < n - 1;
    if (!hasPrev || !hasNext || n < 3) return cleanNode({ x, y });
    const [px, py] = points[(k - 1 + n) % n], [nx, ny] = points[(k + 1) % n];
    const tx = (nx - px) / 6, ty = (ny - py) / 6;
    return cleanNode({ x, y, i: [-tx, -ty], o: [tx, ty] });
  });
}

/** Nœuds d'une ellipse (quatre arcs de Bézier). */
export function ellipseNodes(cx, cy, rx, ry) {
  const k = 0.5522847498;
  return [
    { x: cx + rx, y: cy, i: [0, -ry * k], o: [0, ry * k] },
    { x: cx, y: cy + ry, i: [rx * k, 0], o: [-rx * k, 0] },
    { x: cx - rx, y: cy, i: [0, ry * k], o: [0, -ry * k] },
    { x: cx, y: cy - ry, i: [-rx * k, 0], o: [rx * k, 0] }
  ].map(cleanNode);
}

export function rectNodes(x0, y0, x1, y1) {
  return [
    { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }
  ].map(cleanNode);
}

/* -------------------------------------------- */
/*  Mesures le long d'une polyligne             */
/* -------------------------------------------- */

/** Longueurs cumulées ; pour un tracé fermé, le segment de retour est compté. */
export function cumulative(points, closed = false) {
  const acc = [0];
  const n = points.length;
  const segs = closed ? n : n - 1;
  for (let k = 0; k < segs; k++) {
    const [ax, ay] = points[k], [bx, by] = points[(k + 1) % n];
    acc.push(acc[k] + dist(ax, ay, bx, by));
  }
  return acc;
}

export const polylineLength = (points, closed = false) => cumulative(points, closed).at(-1) ?? 0;

/** Point et direction à l'abscisse curviligne `s`. */
export function pointAt(points, closed, s, acc = cumulative(points, closed)) {
  const total = acc.at(-1);
  if (!points.length) return null;
  if (points.length === 1 || total <= 0) return { x: points[0][0], y: points[0][1], tx: 1, ty: 0 };
  s = closed ? ((s % total) + total) % total : Math.min(total, Math.max(0, s));
  let k = 0;
  while (k < acc.length - 2 && acc[k + 1] < s) k++;
  const [ax, ay] = points[k], [bx, by] = points[(k + 1) % points.length];
  const len = acc[k + 1] - acc[k] || 1;
  const t = (s - acc[k]) / len;
  return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, tx: (bx - ax) / len, ty: (by - ay) / len };
}

/** Projection d'un point sur une polyligne : abscisse, distance, point projeté. */
export function project(points, closed, px, py) {
  const acc = cumulative(points, closed);
  let best = { s: 0, d: Infinity, x: points[0]?.[0] ?? 0, y: points[0]?.[1] ?? 0 };
  const segs = closed ? points.length : points.length - 1;
  for (let k = 0; k < segs; k++) {
    const [ax, ay] = points[k], [bx, by] = points[(k + 1) % points.length];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
    const x = ax + dx * t, y = ay + dy * t, d = dist(px, py, x, y);
    if (d < best.d) best = { s: acc[k] + t * (acc[k + 1] - acc[k]), d, x, y };
  }
  if (points.length === 1) best.d = dist(px, py, points[0][0], points[0][1]);
  return best;
}

/** Morceau de polyligne entre deux abscisses (s0 < s1, sur un tracé fermé s1 peut dépasser la longueur). */
function slice(points, closed, acc, s0, s1) {
  const out = [];
  const total = acc.at(-1);
  const at = (s) => { const p = pointAt(points, closed, s, acc); return [p.x, p.y]; };
  out.push(at(s0));
  const n = points.length;
  const vertices = closed ? n : n;
  // Sommets strictement entre s0 et s1 (en tenant compte d'un tour complet).
  for (let lap = 0; lap <= (closed ? 1 : 0); lap++) {
    for (let k = 0; k < vertices; k++) {
      const s = acc[k] + lap * total;
      if (s > s0 + 1e-9 && s < s1 - 1e-9) out.push(points[k]);
    }
  }
  out.push(at(s1));
  return out;
}

/**
 * Découpe une polyligne en retirant des intervalles d'abscisse [début, fin] (les portes).
 * @returns {[number,number][][]} morceaux ouverts restants
 */
export function cutIntervals(points, closed, intervals) {
  const acc = cumulative(points, closed);
  const total = acc.at(-1);
  if (points.length < 2 || total <= 0) return [];
  const list = intervals
    .map(([a, b]) => [Math.max(closed ? -Infinity : 0, a), Math.min(closed ? Infinity : total, b)])
    .filter(([a, b]) => b > a)
    .map(([a, b]) => closed ? [((a % total) + total) % total, ((a % total) + total) % total + (b - a)] : [a, b])
    .sort((p, q) => p[0] - q[0]);

  if (!list.length) {
    return [closed ? [...points, points[0]] : points.map((p) => [...p])];
  }
  // Fusion des intervalles qui se chevauchent.
  const merged = [];
  for (const iv of list) {
    const last = merged.at(-1);
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else merged.push([...iv]);
  }

  const pieces = [];
  if (closed) {
    // Sur une boucle, on part de la fin d'un intervalle jusqu'au début du suivant.
    if (merged.length > 1 && merged.at(-1)[1] - total > merged[0][0]) {
      merged[0][0] = merged.at(-1)[0] - total;
      merged[0][1] = Math.max(merged[0][1], merged.at(-1)[1] - total);
      merged.pop();
    }
    for (let k = 0; k < merged.length; k++) {
      const start = merged[k][1];
      const end = k + 1 < merged.length ? merged[k + 1][0] : merged[0][0] + total;
      if (end - start > 1e-6) pieces.push(slice(points, true, acc, start, end));
    }
  } else {
    let cursor = 0;
    for (const [a, b] of merged) {
      if (a - cursor > 1e-6) pieces.push(slice(points, false, acc, cursor, a));
      cursor = b;
    }
    if (total - cursor > 1e-6) pieces.push(slice(points, false, acc, cursor, total));
  }
  return pieces;
}

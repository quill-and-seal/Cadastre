/**
 * Zones : opérations booléennes et découpe de tracés.
 *
 * Une zone est une liste d'anneaux ; un anneau est un tableau plat [x0, y0, x1, y1, …]
 * en cases. Règle de remplissage « non nul » : les trous tournent dans l'autre sens,
 * comme les rend Clipper2.
 */
import { Clipper, Paths64, Path64, Point64, FillRule } from "./vendor/clipper2.js";
import { rdp, round3 } from "./curves.js";

/** Clipper2 travaille en entiers : 1 case = 1000 unités, soit une précision de 0,001 case. */
const S = 1000;
/** Tolérance de simplification des contours, en cases. */
const SIMPLIFY = 0.006;
/** Aire minimale d'un anneau gardé, en cases². */
const MIN_AREA = 0.002;

/* -------------------------------------------- */
/*  Conversions                                 */
/* -------------------------------------------- */

export const ringPoints = (ring) => {
  const pts = [];
  for (let k = 0; k + 1 < ring.length; k += 2) pts.push([ring[k], ring[k + 1]]);
  return pts;
};

export const pointsRing = (points) => points.flatMap(([x, y]) => [round3(x), round3(y)]);

function toPaths(rings) {
  const paths = new Paths64();
  for (const ring of rings ?? []) {
    if (ring.length < 6) continue;
    const path = new Path64();
    for (let k = 0; k + 1 < ring.length; k += 2) path.push(new Point64(ring[k] * S, ring[k + 1] * S));
    paths.push(path);
  }
  return paths;
}

export function ringArea(ring) {
  let a = 0;
  for (let k = 0; k < ring.length; k += 2) {
    const j = (k + 2) % ring.length;
    a += ring[k] * ring[j + 1] - ring[j] * ring[k + 1];
  }
  return a / 2;
}

/** Simplifie un anneau fermé (RDP en coupant la boucle au point le plus éloigné du premier). */
function simplifyRing(points) {
  if (points.length < 4) return points;
  let far = 0, best = -1;
  for (let k = 1; k < points.length; k++) {
    const d = Math.hypot(points[k][0] - points[0][0], points[k][1] - points[0][1]);
    if (d > best) { best = d; far = k; }
  }
  const first = rdp(points.slice(0, far + 1), SIMPLIFY);
  const second = rdp([...points.slice(far), points[0]], SIMPLIFY);
  return [...first, ...second.slice(1, -1)];
}

function fromPaths(paths) {
  const rings = [];
  for (const path of paths) {
    const pts = simplifyRing(path.map((p) => [p.x / S, p.y / S]));
    if (pts.length < 3) continue;
    const ring = pointsRing(pts);
    if (Math.abs(ringArea(ring)) >= MIN_AREA) rings.push(ring);
  }
  return rings;
}

/* -------------------------------------------- */
/*  Booléens                                    */
/* -------------------------------------------- */

const empty = (rings) => !rings?.length;

export function union(a, b) {
  if (empty(a) && empty(b)) return [];
  return fromPaths(Clipper.Union(toPaths(a), toPaths(b), FillRule.NonZero));
}

export function difference(a, b) {
  if (empty(a)) return [];
  if (empty(b)) return a.map((r) => r.slice());
  return fromPaths(Clipper.Difference(toPaths(a), toPaths(b), FillRule.NonZero));
}

export function intersection(a, b) {
  if (empty(a) || empty(b)) return [];
  return fromPaths(Clipper.Intersect(toPaths(a), toPaths(b), FillRule.NonZero));
}

/** Remet d'aplomb une forme dessinée (boucles qui se croisent, sens de parcours). */
export const normalizeRings = (rings) => union(rings, []);

/*
 * Traits et décalages : le décalage de contour du portage JavaScript de Clipper2 est
 * défectueux, on construit donc la zone d'un trait comme l'union de « capsules »
 * (un rectangle par segment, un disque à chaque point), fusionnées par les booléens.
 */

/** Nombre de côtés d'un disque de rayon r, pour un écart à l'arc d'environ 0,004 case. */
const arcSteps = (r) => Math.min(64, Math.max(12, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - 0.004 / r)))));

/** Capsule autour du segment [a,b], en sens direct (aire positive), en entiers Clipper. */
function capsule([ax, ay], [bx, by], r) {
  const steps = arcSteps(r);
  const ang = Math.atan2(by - ay, bx - ax);
  const path = new Path64();
  // Demi-cercle autour de b (de -90° à +90° par rapport à la direction), puis autour de a.
  const half = Math.ceil(steps / 2);
  for (let k = 0; k <= half; k++) {
    const t = ang - Math.PI / 2 + (Math.PI * k) / half;
    path.push(new Point64((bx + r * Math.cos(t)) * S, (by + r * Math.sin(t)) * S));
  }
  for (let k = 0; k <= half; k++) {
    const t = ang + Math.PI / 2 + (Math.PI * k) / half;
    path.push(new Point64((ax + r * Math.cos(t)) * S, (ay + r * Math.sin(t)) * S));
  }
  return path;
}

function strokePaths(points, radius, closed = false) {
  const paths = new Paths64();
  const pts = rdp(points, Math.min(radius * 0.05, 0.01));
  if (pts.length === 1) pts.push([pts[0][0] + 1e-4, pts[0][1]]);
  const count = closed ? pts.length : pts.length - 1;
  for (let k = 0; k < count; k++) paths.push(capsule(pts[k], pts[(k + 1) % pts.length], radius));
  return paths;
}

/** Zone couverte par un trait de pinceau de rayon `radius` (bouts et angles arrondis). */
export function strokeRings(points, radius) {
  if (!points.length || radius <= 0) return [];
  return fromPaths(Clipper.Union(strokePaths(points, radius), new Paths64(), FillRule.NonZero));
}

/** Décalage d'une zone (négatif : rétrécit), en ajoutant ou retirant un trait le long des contours. */
export function offsetRings(rings, delta) {
  if (empty(rings) || !delta) return (rings ?? []).map((r) => r.slice());
  const border = new Paths64();
  for (const ring of rings) for (const p of strokePaths(ringPoints(ring), Math.abs(delta), true)) border.push(p);
  const base = toPaths(rings);
  return fromPaths(delta > 0
    ? Clipper.Union(base, border, FillRule.NonZero)
    : Clipper.Difference(base, border, FillRule.NonZero));
}

export function totalArea(rings) {
  return (rings ?? []).reduce((sum, r) => sum + ringArea(r), 0);
}

/* -------------------------------------------- */
/*  Points et tracés                            */
/* -------------------------------------------- */

/** Le point est-il dans la zone (règle non nulle) ? */
export function pointInRings(rings, x, y) {
  let w = 0;
  for (const ring of rings ?? []) {
    const n = ring.length;
    for (let k = 0; k < n; k += 2) {
      const ax = ring[k], ay = ring[k + 1], bx = ring[(k + 2) % n], by = ring[(k + 3) % n];
      const cross = (bx - ax) * (y - ay) - (x - ax) * (by - ay);
      if (ay <= y) { if (by > y && cross > 0) w++; }
      else if (by <= y && cross < 0) w--;
    }
  }
  return w !== 0;
}

/** Paramètre t sur [a,b] de l'intersection avec [c,d], ou null. */
function segmentHit(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / den;
  const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u >= 0 && u <= 1 ? t : null;
}

/**
 * Découpe une polyligne par une zone et garde les morceaux dehors (ou dedans).
 * Sert à la gomme et à la fusion des pièces : les murs coupés deviennent des morceaux ouverts.
 * @param {[number,number][]} points
 * @param {boolean} closed
 * @param {number[][]} rings
 * @param {{inside?:boolean}} [options]
 * @returns {[number,number][][]}
 */
export function clipPolyline(points, closed, rings, { inside = false } = {}) {
  if (points.length < 2) return [];
  const segs = splitSegments(points, closed, rings, inside);
  return assemble(segs, points, closed);
}

/** Sous-segments d'une polyligne coupée par une zone, marqués gardés ou non. */
function splitSegments(points, closed, rings, inside) {
  const segs = [];
  if (points.length < 2) return segs;
  const n = points.length;
  const count = closed ? n : n - 1;
  for (let k = 0; k < count; k++) {
    const [ax, ay] = points[k], [bx, by] = points[(k + 1) % n];
    const ts = [0, 1];
    for (const ring of rings) {
      const m = ring.length;
      for (let j = 0; j < m; j += 2) {
        const t = segmentHit(ax, ay, bx, by, ring[j], ring[j + 1], ring[(j + 2) % m], ring[(j + 3) % m]);
        if (t != null) ts.push(t);
      }
    }
    ts.sort((p, q) => p - q);
    for (let j = 0; j + 1 < ts.length; j++) {
      const t0 = ts[j], t1 = ts[j + 1];
      if (t1 - t0 < 1e-9) continue;
      const tm = (t0 + t1) / 2;
      const keep = pointInRings(rings, ax + (bx - ax) * tm, ay + (by - ay) * tm) === inside;
      segs.push({ a: [ax + (bx - ax) * t0, ay + (by - ay) * t0], b: [ax + (bx - ax) * t1, ay + (by - ay) * t1], keep });
    }
  }
  return segs;
}

/**
 * Comme clipPolyline, mais renvoie les intervalles gardés en abscisse curviligne
 * ([début, fin] ; sur une boucle, un intervalle qui passe par le départ dépasse la longueur).
 */
export function clipIntervals(points, closed, rings, { inside = false } = {}) {
  const segs = splitSegments(points, closed, rings, inside);
  const out = [];
  let s = 0;
  for (const seg of segs) {
    const len = Math.hypot(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]);
    if (seg.keep) {
      const last = out.at(-1);
      if (last && Math.abs(last[1] - s) < 1e-9) last[1] = s + len;
      else out.push([s, s + len]);
    }
    s += len;
  }
  if (closed && out.length > 1 && out[0][0] < 1e-9 && Math.abs(out.at(-1)[1] - s) < 1e-9) {
    const first = out.shift();
    out.at(-1)[1] = s + first[1];
  }
  if (closed && out.length === 1 && out[0][0] < 1e-9 && Math.abs(out[0][1] - s) < 1e-9) return [[0, s, "loop"]];
  return out;
}

function assemble(segs, points, closed) {
  // Assemble les sous-segments gardés consécutifs.
  const pieces = [];
  let current = null;
  for (const s of segs) {
    if (!s.keep) { current = null; continue; }
    if (!current) { current = [s.a]; pieces.push(current); }
    current.push(s.b);
  }
  // Boucle : le dernier morceau rejoint le premier s'ils se touchent au point de départ.
  if (closed && pieces.length > 1 && segs[0]?.keep && segs.at(-1)?.keep) {
    const last = pieces.pop();
    pieces[0] = [...last, ...pieces[0].slice(1)];
  }
  if (closed && pieces.length === 1 && segs.every((s) => s.keep)) {
    // Rien n'a été coupé : on garde la boucle fermée (dernier point = premier).
    return [[...points, points[0]].map((p) => [...p])];
  }
  return pieces
    .map((p) => p.filter((q, i) => i === 0 || Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) > 1e-6))
    .filter((p) => p.length > 1);
}

/** Rectangle englobant d'une zone. */
export function ringsBounds(rings) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings ?? []) {
    for (let k = 0; k + 1 < r.length; k += 2) {
      x0 = Math.min(x0, r[k]); x1 = Math.max(x1, r[k]);
      y0 = Math.min(y0, r[k + 1]); y1 = Math.max(y1, r[k + 1]);
    }
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

/** Zone rectangulaire (la carte entière, pour rogner). */
export const rectRings = (x0, y0, x1, y1) => [[x0, y0, x1, y0, x1, y1, x0, y1]];

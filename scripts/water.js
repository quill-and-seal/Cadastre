/**
 * Eau vivante, vue de dessus : texture de l'eau (fond, reflets, éclats), courant des rivières,
 * rochers qui l'arrêtent et la font tourbillonner, et ce qui flotte (écume, feuilles) ou les
 * traits du courant. Rien ici ne dépend de Foundry ni de PIXI : l'aperçu de l'éditeur, l'image
 * exportée et le calque de la scène s'en servent tous.
 *
 * Unités : cases. Les réglages fins ont été mis au point sur un prototype où une case faisait
 * PX pixels ; les constantes en « px » y sont divisées.
 *
 * Réglages d'une carte (map.water) :
 *   texture    : "clear" (fond de galets visible), "deep" (profonde), "muddy" (boueuse)
 *   glow       : reflets de lumière, 0 à 1
 *   strokes    : traits du courant affichés
 *   particles  : écume et feuilles portées par le courant
 *   density    : particules par case d'eau
 *   turbulence : remous, 0 à 1
 *   eddies     : tourbillons derrière les rochers, 0 à 1
 * Le sens et la vitesse du courant se règlent par rivière (outil Chemin, sol « eau »).
 */
import * as poly from "./poly.js";
import { flattenNodes } from "./curves.js";
import { waterRings } from "./render.js";
import { propDef } from "./model.js";
import { propRings } from "./wind.js";

export const WATER_DEFAULT = { texture: "clear", glow: 0.6, strokes: false, particles: true, density: 60, turbulence: 0.35, eddies: 0.6 };
export const WATER_TEXTURES = ["clear", "deep", "muddy"];
export const WATER_LIMITS = { glow: [0, 1], density: [0, 160], turbulence: [0, 1], eddies: [0, 1] };

/** Niveaux d'effet, choisis par chaque joueur. */
export const WATER_LEVELS = { OFF: 0, SURFACE: 1, FULL: 2 };

/** Pixels par case du prototype qui a servi à régler l'eau. */
export const PX = 50;
/** Vitesse du courant au plus fort d'une rivière de vitesse 1, en cases par seconde. */
export const BASE_SPEED = 1.4;
/** Échantillons du champ de courant par case. */
export const FIELD_RES = 8;
/** Taille des morceaux de carte où l'eau est dessinée, en cases. */
export const WATER_BLOCK = 4;
/** Côté maximal de l'image du fond précalculé, en pixels. */
export const BED_MAX = 4096;
/** Traits du courant par case d'eau. */
export const STROKE_DENSITY = 140;
/** Plafonds : une très grande carte reste fluide. */
export const MAX_STROKES = 30000;
export const MAX_FLOATERS = 20000;
/** Rochers dessinés par le programme de la surface (ombre portée). */
export const MAX_ROCKS = 32;
/** Données d'une particule pour la carte graphique : x, y, ax, ay, opacité, sorte, teinte, blanc. */
export const INSTANCE_FLOATS = 8;

const r3 = (n) => Math.round(n * 1000) / 1000;

export function normalizeWater(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {
    texture: WATER_TEXTURES.includes(src.texture) ? src.texture : WATER_DEFAULT.texture,
    strokes: typeof src.strokes === "boolean" ? src.strokes : WATER_DEFAULT.strokes,
    particles: typeof src.particles === "boolean" ? src.particles : WATER_DEFAULT.particles
  };
  for (const [key, [min, max]] of Object.entries(WATER_LIMITS)) {
    const n = Number(src[key]);
    out[key] = src[key] === null || src[key] === "" || !Number.isFinite(n) ? WATER_DEFAULT[key] : r3(Math.min(max, Math.max(min, n)));
  }
  return {
    texture: out.texture, glow: out.glow, strokes: out.strokes, particles: out.particles,
    density: Math.round(out.density), turbulence: out.turbulence, eddies: out.eddies
  };
}

/* -------------------------------------------- */
/*  Données de la scène                         */
/* -------------------------------------------- */

/** Rivière ré-échantillonnée tous les 0,1 case, dans le sens du courant. */
function riverLine(q) {
  let pts = flattenNodes(q.nodes, q.closed, 0.03);
  if (q.closed && pts.length) pts = [...pts, pts[0]];
  if (pts.length < 2) return null;
  if (q.flow < 0) pts = pts.slice().reverse();
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    let d = 0.1 - carry;
    while (d <= len) { out.push([ax + ((bx - ax) * d) / len, ay + ((by - ay) * d) / len]); d += 0.1; }
    carry = len - (d - 0.1);
  }
  if (Math.hypot(out.at(-1)[0] - pts.at(-1)[0], out.at(-1)[1] - pts.at(-1)[1]) > 0.02) out.push(pts.at(-1));
  return out.map(([x, y]) => [r3(x), r3(y)]);
}

/**
 * Ce qu'il faut à la scène pour animer l'eau ; null s'il n'y a pas d'eau.
 * Rivières : chemins d'eau dont le courant n'est pas nul. Rochers : objets posés dans l'eau.
 */
export function waterFlag(map) {
  const water = waterRings(map);
  if (!water.length) return null;
  const rivers = [];
  for (const q of map.paths ?? []) {
    if (q.terrain !== "water" || !q.flow) continue;
    const pts = riverLine(q);
    if (pts) rivers.push({ pts, half: q.width / 2, speed: q.speed });
  }
  let masks = [];
  const rocks = [];
  // Chemins (ponts, gués, quais) : par-dessus l'eau.
  for (const q of map.paths ?? []) {
    if (q.terrain === "water") continue;
    const pts = flattenNodes(q.nodes, q.closed, 0.03);
    if (pts.length >= 2) masks = masks.concat(poly.strokeRings(q.closed ? [...pts, pts[0]] : pts, q.width / 2 + (q.edge ? q.edgeWidth : 0)));
  }
  for (const p of map.props ?? []) {
    const rings = propRings(map, p);
    if (!rings.length) continue;
    masks = masks.concat(rings);
    const def = propDef(map, p.type);
    if (!def?.tree && poly.pointInRings(water, p.x, p.y)) {
      rocks.push({ x: r3(p.x), y: r3(p.y), r: r3(Math.max(def.w, def.h) * p.k * 0.45) });
    }
  }
  return { v: 1, width: map.width, height: map.height, water: normalizeWater(map.water), rings: water, rivers, masks, rocks };
}

/* -------------------------------------------- */
/*  Champ de courant                            */
/* -------------------------------------------- */

/** Index spatial de segments par case. */
function bucketSegments(segs) {
  const map = new Map();
  segs.forEach((s, i) => {
    const x0 = Math.floor(Math.min(s[0], s[2])), x1 = Math.floor(Math.max(s[0], s[2]));
    const y0 = Math.floor(Math.min(s[1], s[3])), y1 = Math.floor(Math.max(s[1], s[3]));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const k = x * 65536 + y;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(i);
    }
  });
  return map;
}
function* near(buckets, x, y, r) {
  for (let j = Math.floor(y - r); j <= Math.floor(y + r); j++) {
    for (let i = Math.floor(x - r); i <= Math.floor(x + r); i++) {
      const list = buckets.get(i * 65536 + j);
      if (list) yield* list;
    }
  }
}

/** Tangentes et courbures lissées d'une rivière : le courant tourne sans à-coups. */
function riverFrames(pts) {
  const n = pts.length;
  const tang = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return [dx / L, dy / L];
  });
  const raw = tang.map((_, i) => {
    const u = tang[Math.max(0, i - 1)], v = tang[Math.min(n - 1, i + 1)];
    return (u[0] * v[1] - u[1] * v[0]) / 0.2;
  });
  const curv = raw.map((_, i) => {
    let s = 0, k = 0;
    for (let j = i - 6; j <= i + 6; j++) if (j >= 0 && j < n) { s += raw[j]; k++; }
    return s / k;
  });
  return { tang, curv };
}

/**
 * Courant d'une rivière à un point : rapide au milieu, presque nul contre la berge ; dans un
 * virage, le plus fort du courant se déporte vers la rive extérieure.
 */
function riverSpeed(c, half, k, speed) {
  const shift = -Math.sign(k) * Math.min(0.4, Math.abs(k) * half * 2.2) * half;
  const n = c - shift > 0 ? (c - shift) / (half - shift) : (shift - c) / (half + shift);
  const prof = Math.max(0, 1 - Math.min(1, Math.abs(n)) ** 2.2);
  return BASE_SPEED * speed * (0.06 + 0.94 * prof);
}

/**
 * Champ de courant sur une grille de FIELD_RES échantillons par case :
 *   n  : profondeur relative (0 au milieu, 1 contre la berge)
 *   vx, vy : vitesse de l'eau (cases par seconde)
 *   a  : présence d'eau visible (0 hors de l'eau, sous un objet ou sur la berge)
 * Les rochers gardent le repère du courant qui les aborde.
 * @param {{hideMasked?:boolean}} [options]  hideMasked : l'eau ne se dessine pas sous les objets
 *   et les chemins (scène Foundry, où ils sont dans l'image de fond, sous le calque de l'eau)
 */
export function buildField(flag, { hideMasked = false } = {}) {
  const R = FIELD_RES;
  const W = Math.ceil(flag.width * R), H = Math.ceil(flag.height * R);
  const size = W * H;
  const field = { W, H, R, width: flag.width, height: flag.height, n: new Float32Array(size).fill(1), vx: new Float32Array(size), vy: new Float32Array(size), a: new Float32Array(size), block: new Uint8Array(size), cells: [] };

  // Berge : segments des contours de l'eau.
  const shore = [];
  for (const r of flag.rings) {
    const m = r.length / 2;
    for (let i = 0; i < m; i++) { const j = (i + 1) % m; shore.push([r[i * 2], r[i * 2 + 1], r[j * 2], r[j * 2 + 1]]); }
  }
  const shoreB = bucketSegments(shore);
  // Rivières.
  const segs = [];
  const frames = flag.rivers.map((rv) => riverFrames(rv.pts));
  flag.rivers.forEach((rv, ri) => {
    for (let i = 0; i + 1 < rv.pts.length; i++) segs.push([rv.pts[i][0], rv.pts[i][1], rv.pts[i + 1][0], rv.pts[i + 1][1], ri, i]);
  });
  const segB = bucketSegments(segs);
  const maxHalf = Math.max(0, ...flag.rivers.map((rv) => rv.half));

  /** Rivière la plus proche : position en travers relative, vitesse. */
  const riverAt = (x, y) => {
    let best = null;
    for (const si of new Set(near(segB, x, y, maxHalf + 0.2))) {
      const [ax, ay, bx, by, ri, i] = segs[si];
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
      const h = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
      const d = Math.hypot(x - ax - dx * h, y - ay - dy * h);
      const rv = flag.rivers[ri];
      if (d > rv.half * 1.05) continue;
      const rel = d / rv.half;
      if (best && rel >= best.rel) continue;
      const fr = frames[ri], t0 = fr.tang[i], t1 = fr.tang[i + 1];
      let tx = t0[0] + (t1[0] - t0[0]) * h, ty = t0[1] + (t1[1] - t0[1]) * h;
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const c = (x - ax - dx * h) * -ty + (y - ay - dy * h) * tx;
      const k = fr.curv[i] + (fr.curv[i + 1] - fr.curv[i]) * h;
      best = { rel, tx, ty, U: riverSpeed(c, rv.half, k, rv.speed) };
    }
    return best;
  };
  const shoreDist = (x, y) => {
    let d = 2;
    for (const si of near(shoreB, x, y, 2)) {
      const [ax, ay, bx, by] = shore[si];
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
      const h = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
      d = Math.min(d, Math.hypot(x - ax - dx * h, y - ay - dy * h));
    }
    return d;
  };
  const masks = flag.masks.map((ring) => ({ ring: [ring], box: poly.ringsBounds([ring]) }));
  const masked = (x, y) => masks.some((m) => x >= m.box.x0 && x <= m.box.x1 && y >= m.box.y0 && y <= m.box.y1 && poly.pointInRings(m.ring, x, y));

  // Lignes de la grille : intervalles dans l'eau (règle pair-impair sur les contours).
  for (let j = 0; j < H; j++) {
    const y = (j + 0.5) / R;
    const xs = [];
    for (const [ax, ay, bx, by] of shore) {
      if ((ay <= y) === (by <= y)) continue;
      xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((p, q) => p - q);
    for (let s = 0; s + 1 < xs.length; s += 2) {
      for (let i = Math.max(0, Math.ceil(xs[s] * R - 0.5)); i < W && (i + 0.5) / R < xs[s + 1]; i++) {
        const x = (i + 0.5) / R, o = j * W + i;
        const D = shoreDist(x, y);
        const rv = riverAt(x, y);
        field.n[o] = rv ? Math.min(1, rv.rel) : 1 - Math.min(1, D / 1.5);
        if (rv) { field.vx[o] = rv.tx * rv.U; field.vy[o] = rv.ty * rv.U; }
        // La berge dessinée dans le fond s'arrête au bord de l'eau : l'eau animée la rejoint.
        const vis = Math.min(1, Math.max(0, D / 0.08));
        const hidden = masked(x, y);
        field.block[o] = hidden ? 1 : 0;
        field.a[o] = hidden && hideMasked ? 0 : vis;
        if (!hidden && vis > 0.5 && field.n[o] < 0.95) field.cells.push(o);
      }
    }
  }
  field.rocks = flag.rocks.map((r, i) => {
    const rv = riverAt(r.x, r.y);
    return { ...r, tx: rv?.tx ?? 1, ty: rv?.ty ?? 0, U: rv?.U ?? 0, seed: (i * 7.31) % 10 };
  });
  field.area = field.cells.length / (R * R);
  field.cells = Int32Array.from(field.cells);
  // Morceaux de WATER_BLOCK cases qui contiennent de l'eau visible : seuls dessinés.
  const B = WATER_BLOCK * R, quads = [];
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (let j0 = 0; j0 < H; j0 += B) {
    for (let i0 = 0; i0 < W; i0 += B) {
      let any = false;
      for (let j = j0; j < Math.min(H, j0 + B) && !any; j++) {
        for (let i = i0; i < Math.min(W, i0 + B); i++) if (field.a[j * W + i] > 0.004 || field.n[j * W + i] < 1) { any = true; break; }
      }
      if (!any) continue;
      const x0 = i0 / R, y0 = j0 / R, x1 = Math.min(W, i0 + B) / R, y1 = Math.min(H, j0 + B) / R;
      quads.push(x0, y0, x1, y1);
      bx0 = Math.min(bx0, x0); by0 = Math.min(by0, y0); bx1 = Math.max(bx1, x1); by1 = Math.max(by1, y1);
    }
  }
  field.quads = Float32Array.from(quads);
  field.bounds = quads.length ? { x0: bx0, y0: by0, x1: bx1, y1: by1 } : { x0: 0, y0: 0, x1: 0, y1: 0 };
  return field;
}

/** Les morceaux d'eau en triangles (deux par morceau), pour la carte graphique. */
export function quadTriangles(field) {
  const q = field.quads, out = new Float32Array((q.length / 4) * 12);
  for (let k = 0, o = 0; k < q.length; k += 4, o += 12) {
    const [x0, y0, x1, y1] = [q[k], q[k + 1], q[k + 2], q[k + 3]];
    out.set([x0, y0, x1, y0, x0, y1, x0, y1, x1, y0, x1, y1], o);
  }
  return out;
}

/** Y a-t-il de l'eau dans ce rectangle (cases) ? */
export function waterVisible(field, x0, y0, x1, y1) {
  const q = field.quads;
  for (let k = 0; k < q.length; k += 4) if (q[k + 2] >= x0 && q[k] <= x1 && q[k + 3] >= y0 && q[k + 1] <= y1) return true;
  return false;
}

/**
 * Valeurs du champ en un point (interpolées), écrites dans `out` : profondeur, vitesse x et y,
 * eau visible, objet ou chemin par-dessus.
 */
export function sampleInto(f, x, y, out) {
  const gx = Math.max(0, Math.min(f.W - 1.001, x * f.R - 0.5)), gy = Math.max(0, Math.min(f.H - 1.001, y * f.R - 0.5));
  const i = Math.floor(gx), j = Math.floor(gy), u = gx - i, v = gy - j;
  const o = j * f.W + i, o1 = o + 1, o2 = o + f.W, o3 = o2 + 1;
  const w0 = (1 - u) * (1 - v), w1 = u * (1 - v), w2 = (1 - u) * v, w3 = u * v;
  out[0] = f.n[o] * w0 + f.n[o1] * w1 + f.n[o2] * w2 + f.n[o3] * w3;
  out[1] = f.vx[o] * w0 + f.vx[o1] * w1 + f.vx[o2] * w2 + f.vx[o3] * w3;
  out[2] = f.vy[o] * w0 + f.vy[o1] * w1 + f.vy[o2] * w2 + f.vy[o3] * w3;
  out[3] = f.a[o] * w0 + f.a[o1] * w1 + f.a[o2] * w2 + f.a[o3] * w3;
  const gi = Math.min(f.W - 1, Math.max(0, Math.floor(x * f.R))), gj = Math.min(f.H - 1, Math.max(0, Math.floor(y * f.R)));
  out[4] = f.block[gj * f.W + gi];
  return out;
}

/** Valeurs du champ en un point (interpolées). */
export function sampleField(f, x, y) {
  const o = sampleInto(f, x, y, new Float64Array(5));
  return { n: o[0], vx: o[1], vy: o[2], a: o[3], block: o[4] };
}

/**
 * Image du champ pour la carte graphique (RGBA, 8 bits) : profondeur, vitesse, eau visible.
 * Vitesses codées de -4 à 4 cases par seconde.
 */
export function fieldPixels(f) {
  const out = new Uint8Array(f.W * f.H * 4);
  for (let o = 0; o < f.W * f.H; o++) {
    out[o * 4] = Math.round(Math.min(1, Math.max(0, f.n[o])) * 255);
    out[o * 4 + 1] = Math.round(Math.min(1, Math.max(0, f.vx[o] / 8 + 0.5)) * 255);
    out[o * 4 + 2] = Math.round(Math.min(1, Math.max(0, f.vy[o] / 8 + 0.5)) * 255);
    out[o * 4 + 3] = Math.round(Math.min(1, Math.max(0, f.a[o])) * 255);
  }
  return out;
}

/* -------------------------------------------- */
/*  Vitesse de l'eau                            */
/* -------------------------------------------- */

function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Rochers rangés par zone (carrés de ROCK_CELL cases) selon la portée de leur effet : chaque
 * point ne regarde que les rochers dont l'effet peut l'atteindre.
 */
const ROCK_CELL = 2;
const NO_ROCKS = [];
export class RockGrid {
  constructor(rocks) {
    this.cells = new Map();
    for (const r of rocks) {
      if (r.U <= 0.05) continue;
      // Portée : de 8 rayons en amont à 40 en aval, 14 de chaque côté, dans le repère du courant.
      const R = r.r, xs = [], ys = [];
      for (const [a, b] of [[-8 * R, -14 * R], [-8 * R, 14 * R], [40 * R, -14 * R], [40 * R, 14 * R]]) {
        xs.push(r.x + r.tx * a - r.ty * b); ys.push(r.y + r.ty * a + r.tx * b);
      }
      const i0 = Math.floor(Math.min(...xs) / ROCK_CELL), i1 = Math.floor(Math.max(...xs) / ROCK_CELL);
      const j0 = Math.floor(Math.min(...ys) / ROCK_CELL), j1 = Math.floor(Math.max(...ys) / ROCK_CELL);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = i * 65536 + j;
        if (!this.cells.has(k)) this.cells.set(k, []);
        this.cells.get(k).push(r);
      }
    }
    // Pierres elles-mêmes (rondes), pour savoir si un point est dedans.
    this.solid = new Map();
    for (const r of rocks) {
      for (let j = Math.floor((r.y - r.r) / ROCK_CELL); j <= Math.floor((r.y + r.r) / ROCK_CELL); j++) {
        for (let i = Math.floor((r.x - r.r) / ROCK_CELL); i <= Math.floor((r.x + r.r) / ROCK_CELL); i++) {
          const k = i * 65536 + j;
          if (!this.solid.has(k)) this.solid.set(k, []);
          this.solid.get(k).push(r);
        }
      }
    }
  }
  near(x, y) { return this.cells.get(Math.floor(x / ROCK_CELL) * 65536 + Math.floor(y / ROCK_CELL)) ?? NO_ROCKS; }
  inside(x, y) {
    const list = this.solid.get(Math.floor(x / ROCK_CELL) * 65536 + Math.floor(y / ROCK_CELL));
    if (!list) return false;
    for (const r of list) if ((x - r.x) ** 2 + (y - r.y) ** 2 < r.r * r.r) return true;
    return false;
  }
}

/** Tourbillon (noyau adouci) ajouté à acc[0], acc[1], dans le repère du courant. */
function addVortex(acc, a, b, ca, cb, gamma, core) {
  const ra = a - ca, rb = b - cb, k = gamma / (2 * Math.PI * (ra * ra + rb * rb + core * core));
  acc[0] -= rb * k; acc[1] += ra * k;
}

/**
 * Tourbillons d'un rocher à l'instant t (repère du courant) : les deux fixes juste derrière,
 * puis l'allée de tourbillons détachés d'un côté puis de l'autre. Par groupes de 5 nombres :
 * position (a, b), force, rayon du noyau, inutilisé. Gardés tant que t ne change pas.
 */
function streetOf(r, t, e) {
  if (r._st && r._stT === t && r._stE === e) return r._st;
  const R = r.r, Uw = r.U, st = r._st ?? new Float64Array(9 * 5);
  const G0 = Uw * R * 2.6 * e;
  st.set([1.5 * R, 0.7 * R, -G0, 0.55 * R, 0, 1.5 * R, -0.7 * R, G0, 0.55 * R, 0]);
  const Ts = (5 * R) / Math.max(0.2, Uw), born = Math.floor((t + r.seed) / Ts);
  for (let j = 0; j < 7; j++) {
    const id = born - j, age = (t + r.seed) - id * Ts, side = id % 2 ? 1 : -1, o = 10 + j * 5;
    st[o] = 2.4 * R + 0.7 * Uw * age;
    st[o + 1] = side * 0.55 * R * (1 + 0.15 * age * Uw / R);
    st[o + 2] = -side * Uw * R * 1.3 * e * Math.exp(-age / (Ts * 4));
    st[o + 3] = R * (0.6 + 0.08 * age * Uw / R);
  }
  r._st = st; r._stT = t; r._stE = e;
  return st;
}

/**
 * Autour d'un rocher, ajouté au courant existant : devant, l'eau s'écrase, ralentit et glisse de
 * chaque côté ; elle contourne au ras de la pierre ; derrière, deux tourbillons fixes la ramènent
 * vers le rocher, puis des tourbillons se détachent d'un côté puis de l'autre ; plus loin, l'eau
 * reste hachée et deux rides en V s'ouvrent vers l'aval.
 * Écrit dans `out` : écart de vitesse (a, b), ralentissement, écume, coussin, eau hachée, rides.
 * @returns {boolean}  faux si le point est hors de portée du rocher
 */
export function rockFlowInto(r, x, y, t, U, eddies, out) {
  const rx = x - r.x, ry = y - r.y;
  const a = rx * r.tx + ry * r.ty, b = -rx * r.ty + ry * r.tx;
  const R = r.r, R2 = R * R;
  if (a < -8 * R || a > 40 * R || Math.abs(b) > 14 * R) return false;
  const d2 = Math.max(a * a + b * b, R2), d4 = d2 * d2;
  const near = Math.exp(-Math.max(0, Math.sqrt(d2) - R) / (0.45 * R));
  out[0] = -U * R2 * (a * a - b * b) / d4 * near; out[1] = -U * 2 * R2 * a * b / d4 * near;
  out[2] = 0; out[3] = 0; out[4] = 0; out[5] = 0; out[6] = 0;
  if (a < R * 0.3) {
    const ds = Math.sqrt(d2) - R;
    const front = Math.exp(-Math.max(0, ds) / (1.3 * R)) * Math.exp(-(b * b) / (1.6 * R2)) * Math.min(1, (R * 0.3 - a) / R);
    out[0] -= U * 0.9 * front;
    out[1] += Math.sign(b || 1) * U * 0.5 * front * Math.min(1, Math.abs(b) / (0.25 * R) + 0.2) * Math.exp(-Math.max(0, ds) / (0.7 * R));
    out[4] = front;
    if (a < 0) out[0] = Math.max(out[0], -0.95 * U);
  }
  if (a > 0) {
    const e = eddies, Uw = r.U;
    const half = R * (1.1 + a / (5 * R));
    const wake = Math.exp(-(b * b) / (half * half) - a / (18 * R)) * Math.min(1, a / R);
    out[2] = 0.85 * wake * e;
    out[0] *= 1 - 0.5 * wake * e; out[1] *= 1 - 0.5 * wake * e;
    // Tourbillons : leurs positions et forces ne dépendent que du rocher et de l'instant,
    // calculées une fois par image (streetOf) et non pour chaque point.
    const st = streetOf(r, t, e);
    for (let k = 0; k < st.length; k += 5) addVortex(out, a, b, st[k], st[k + 1], st[k + 2], st[k + 3]);
    out[3] = wake * e;
    const halfChop = R * (1.3 + a / (3.2 * R));
    out[5] = Math.exp(-(b * b) / (halfChop * halfChop) - a / (30 * R)) * Math.min(1, a / (2 * R)) * e;
    const arm = 0.9 * R + a * 0.33, off = Math.abs(b) - arm;
    out[6] = Math.exp(-(off * off) / (0.16 * R2) - a / (28 * R)) * Math.min(1, a / R) * e;
    out[1] += Math.sin(a / (0.9 * R) - t * 7) * U * 0.12 * out[6] * Math.sign(b || 1);
    const m = Math.hypot(out[0], out[1]), cap = 0.9 * Uw;
    if (m > cap) { out[0] *= cap / m; out[1] *= cap / m; }
  }
  return true;
}

/** Comme rockFlowInto, mais renvoie un tableau (null hors de portée). */
export function rockFlow(r, x, y, t, U, eddies) {
  const out = new Float64Array(7);
  return rockFlowInto(r, x, y, t, U, eddies, out) ? [...out] : null;
}

const SAMPLE = new Float64Array(5), ROCK = new Float64Array(7);

/**
 * Vitesse de l'eau en un point, avec ce qui la colore, écrite dans `out` :
 * vx, vy, profondeur relative, écume, coussin, eau hachée, rides en V, eau visible.
 * @param {RockGrid} [grid]  rochers rangés par zone (sinon tous les rochers sont regardés)
 */
export function waterVelocity(f, settings, x, y, t, out = new Float64Array(8), grid = null) {
  const s = sampleInto(f, x, y, SAMPLE);
  const svx = s[1], svy = s[2];
  const U = Math.hypot(svx, svy);
  const tx = U > 1e-4 ? svx / U : 1, ty = U > 1e-4 ? svy / U : 0;
  let foam = 0, cushion = 0, chop = 0, vee = 0, slow = 0, dvx = 0, dvy = 0, wakeU = 0;
  const rocks = grid ? grid.near(x, y) : f.rocks;
  for (let k = 0; k < rocks.length; k++) {
    const r = rocks[k];
    if (r.U <= 0.05 || !rockFlowInto(r, x, y, t, U, settings.eddies, ROCK)) continue;
    const du = ROCK[0], dv = ROCK[1];
    dvx += du * r.tx - dv * r.ty; dvy += du * r.ty + dv * r.tx;
    if (ROCK[2] > slow) slow = ROCK[2];
    if (ROCK[3] > foam) foam = ROCK[3];
    if (ROCK[4] > cushion) cushion = ROCK[4];
    if (ROCK[5] > chop) chop = ROCK[5];
    if (ROCK[6] > vee) vee = ROCK[6];
    if ((ROCK[3] > 0 || ROCK[5] > 0) && r.U > wakeU) wakeU = r.U;
  }
  let vx = svx * (1 - slow) + dvx, vy = svy * (1 - slow) + dvy;
  // Remous : petite turbulence qui dérive avec le courant (rotationnel d'un bruit).
  const drift = U / BASE_SPEED;
  if (settings.turbulence > 0 || foam > 0) {
    const sc = PX / 34, e = 0.04, ox = x * sc - t * 0.5 * drift * tx, oy = y * sc - t * 0.5 * drift * ty;
    const dny = (noise(ox, oy + e) - noise(ox, oy - e)) / (2 * e), dnx = (noise(ox + e, oy) - noise(ox - e, oy)) / (2 * e);
    const k = settings.turbulence * U * 0.45 + foam * settings.eddies * wakeU * 0.9;
    vx += dny * k; vy -= dnx * k;
  }
  if (chop > 0.02) {
    const sc = PX / 11, e = 0.05, ox = x * sc - t * 1.4 * drift * tx, oy = y * sc - t * 1.4 * drift * ty;
    const dny = (noise(ox + 31, oy + e) - noise(ox + 31, oy - e)) / (2 * e), dnx = (noise(ox + 31 + e, oy) - noise(ox + 31 - e, oy)) / (2 * e);
    const k = chop * wakeU * 0.35;
    vx += dny * k; vy -= dnx * k;
  }
  out[0] = vx; out[1] = vy; out[2] = s[0]; out[3] = foam; out[4] = cushion; out[5] = chop; out[6] = vee;
  // Sous un objet ou un chemin, l'eau n'est pas visible : ce qui flotte y disparaît.
  out[7] = s[4] ? 0 : s[3];
  return out;
}

/* -------------------------------------------- */
/*  Traits et particules                        */
/* -------------------------------------------- */

const F = 6; // x, y, âge, durée de vie, hasard, réservé
const LEAF = 0.012;
/** Hors de l'écran, une particule n'avance qu'une image sur OFFSCREEN_EVERY, par plus grands pas. */
const OFFSCREEN_EVERY = 4;
/** En dessous, un point d'écume est plus petit qu'un pixel : on en dessine moins, en fondu. */
const MIN_FOAM_PX = 0.7;
/** En dessous de tant de pixels par case, les traits du courant s'éclaircissent en fondu. */
const STROKE_FADE_PPC = 25;
/** Plus grand rayon d'un point d'écume, en cases. */
const FOAM_MAX = 2.7 / PX;

/** Seconde valeur au hasard tirée de la première (pour décider qui reste dessiné de loin). */
const pick = (rnd) => (rnd * 97.31) % 1;

/**
 * Simulation : traits du courant et particules portés par l'eau. step() avance d'un pas et
 * remplit `instances` (INSTANCE_FLOATS nombres par élément à dessiner) :
 *   sorte 0 : trait (x, y = tête ; ax, ay = queue relative), 1 : écume (ax = rayon),
 *   2 : feuille (ax, ay = direction), 3 : brindille (ax, ay = direction).
 * Hors de la vue, les particules avancent moins souvent et ne sont pas dessinées.
 */
export class WaterSim {
  /**
   * @param {object} field     buildField()
   * @param {object} settings  normalizeWater()
   * @param {{cap?:number, rand?:()=>number, state?:object}} [options]
   *   cap : part des particules (réglage léger) ; state : état repris d'une autre simulation (state())
   */
  constructor(field, settings, { cap = 1, rand = Math.random, state = null } = {}) {
    this.f = field;
    this.s = settings;
    this.rand = rand;
    this.t = state?.t ?? 0;
    this.frame = 0;
    const area = field.area;
    this.nStrokes = settings.strokes ? Math.min(MAX_STROKES, Math.round(area * STROKE_DENSITY * cap)) : 0;
    this.nFloat = settings.particles ? Math.min(MAX_FLOATERS, Math.round(area * settings.density * cap)) : 0;
    this.active = field.rocks.filter((r) => r.U > 0.05);
    this.grid = new RockGrid(field.rocks);
    this.rockShare = area > 0 ? Math.min(0.35, (3 * this.active.length) / area) : 0;
    if (state && state.P.length === this.nStrokes * F && state.Q.length === this.nFloat * F) {
      this.P = state.P; this.Q = state.Q;
    } else {
      this.P = new Float32Array(this.nStrokes * F);
      this.Q = new Float32Array(this.nFloat * F);
      for (let i = 0; i < this.nStrokes; i++) this._spawn(this.P, i, 2, 5);
      for (let i = 0; i < this.nFloat; i++) this._spawn(this.Q, i, 4, 8);
    }
    this.instances = new Float32Array((this.nStrokes + this.nFloat) * INSTANCE_FLOATS);
    this.count = 0;
    this.stats = { simulated: 0, drawn: 0 };
    this._v = new Float64Array(8);
    this._w = new Float64Array(8);
  }

  /** État à reprendre ailleurs (calcul en arrière-plan). */
  state() { return { t: this.t, P: this.P, Q: this.Q }; }

  _spawn(A, i, lifeMin, lifeRange) {
    const rand = this.rand, f = this.f;
    let x = 0, y = 0;
    if (this.active.length && rand() < this.rockShare) {
      // Contre un rocher et dans son sillage : l'eau y tourne sur place, il faut l'y semer.
      const r = this.active[Math.floor(rand() * this.active.length)];
      let a, b;
      if (rand() < 0.3) { a = -r.r * (1.0 + rand() ** 2 * 1.8); b = (rand() * 2 - 1) * r.r * 1.15; }
      else { a = r.r * (1.1 + rand() ** 1.3 * 22); b = (rand() * 2 - 1) * r.r * (1.2 + a / (5 * r.r)); }
      x = r.x + r.tx * a - r.ty * b; y = r.y + r.ty * a + r.tx * b;
    } else if (f.cells.length) {
      const o = f.cells[Math.floor(rand() * f.cells.length)];
      x = ((o % f.W) + rand()) / f.R; y = (Math.floor(o / f.W) + rand()) / f.R;
    }
    A[i * F] = x; A[i * F + 1] = y; A[i * F + 2] = 0; A[i * F + 3] = lifeMin + rand() * lifeRange; A[i * F + 4] = rand();
  }

  _gone(x, y) {
    // Hors de la carte aussi : une rivière qui en sort emporte ses particules.
    return x < 0 || y < 0 || x > this.f.width || y > this.f.height || this.grid.inside(x, y);
  }

  /** Avance une particule (pas en deux temps : elle suit bien les tourbillons). */
  _advance(A, o, dt, speedK, jitter) {
    const f = this.f, s = this.s, t = this.t, v = this._v, w = this._w;
    const x = A[o], y = A[o + 1];
    waterVelocity(f, s, x, y, t, v, this.grid);
    waterVelocity(f, s, x + v[0] * dt * 0.5, y + v[1] * dt * 0.5, t, w, this.grid);
    A[o] = x + w[0] * dt * speedK + (jitter ? (this.rand() - 0.5) * jitter * dt : 0);
    A[o + 1] = y + w[1] * dt * speedK + (jitter ? (this.rand() - 0.5) * jitter * dt : 0);
    A[o + 2] += dt;
  }

  /**
   * Avance de dt secondes et prépare les éléments à dessiner.
   * @param {number} dt
   * @param {{x0:number,y0:number,x1:number,y1:number,ppc:number}} [view]  vue (cases) et pixels
   *   d'écran par case : hors de la vue on simule moins souvent et on ne dessine rien
   */
  step(dt, view = null) {
    dt = Math.min(0.05, Math.max(0, dt));
    this.t += dt;
    this.frame++;
    const out = this.instances, v = this._v;  // _advance remplit _v et _w
    const m = 1;  // marge autour de la vue, en cases
    const vx0 = view ? view.x0 - m : -Infinity, vy0 = view ? view.y0 - m : -Infinity;
    const vx1 = view ? view.x1 + m : Infinity, vy1 = view ? view.y1 + m : Infinity;
    const ppc = view?.ppc ?? Infinity;
    let c = 0, simulated = 0;
    const put = (x, y, ax, ay, alpha, kind, tone, white) => {
      const o = c * INSTANCE_FLOATS;
      out[o] = x; out[o + 1] = y; out[o + 2] = ax; out[o + 3] = ay; out[o + 4] = alpha; out[o + 5] = kind; out[o + 6] = tone; out[o + 7] = white;
      c++;
    };
    // Une particule qui ne sera pas dessinée (hors de la vue, ou trop petite de loin) est
    // simulée au rythme ralenti.
    const run = (A, n, lifeMin, lifeRange, speedK, jitter, culled, draw) => {
      for (let i = 0; i < n; i++) {
        const o = i * F;
        const seen = A[o] >= vx0 && A[o] <= vx1 && A[o + 1] >= vy0 && A[o + 1] <= vy1 && !culled(A[o + 4]);
        if (!seen) {
          // Hors de la vue : une image sur OFFSCREEN_EVERY, par pas plus grands.
          if ((i + this.frame) % OFFSCREEN_EVERY) continue;
          this._advance(A, o, dt * OFFSCREEN_EVERY, speedK, jitter);
        } else this._advance(A, o, dt, speedK, jitter);
        simulated++;
        const x = A[o], y = A[o + 1];
        // _v : l'eau au départ du pas (profondeur, écume…), _w : sa vitesse au milieu du pas.
        if (A[o + 2] > A[o + 3] || v[2] > 0.97 || v[7] < 0.5 || this._gone(x, y)) { this._spawn(A, i, lifeMin, lifeRange); continue; }
        if (seen) draw(A, o, x, y, v, this._w);
      }
    };
    // Traits du courant (de loin, ils s'éclaircissent en fondu).
    const strokeK = Math.min(1, (ppc / STROKE_FADE_PPC) ** 2);
    // Écume : même au plus gros (bouillonnement), un point ne dépasse pas FOAM_MAX cases.
    const foamKeep = Math.min(1, ((FOAM_MAX * ppc) / MIN_FOAM_PX) ** 2);
    run(this.P, this.nStrokes, 2, 5, 1, 0, (rnd) => strokeK < 1 && pick(rnd) > strokeK, (A, o, x, y, vv, w) => {
      const age = A[o + 2], life = A[o + 3], rnd = A[o + 4];
      const wx = w[0], wy = w[1], foam = vv[3], cushion = vv[4], chop = vv[5], vee = vv[6];
      if (strokeK < 1 && pick(rnd) > strokeK) return;
      const fade = Math.min(1, age / 0.4, (life - age) / 0.6);
      const sp = Math.hypot(wx, wy);
      const lit = Math.max(0.35 + 0.65 * Math.min(1, sp / BASE_SPEED), 0.5 + 0.5 * foam, 0.5 + 0.3 * cushion, 0.45 + 0.35 * chop, 0.5 + 0.5 * vee);
      const bright = Math.min(7, Math.floor(fade * lit * (0.6 + 0.4 * rnd) * 8));
      if (bright <= 0) return;
      const wm = Math.max(foam, cushion * 0.55, vee * 0.8), white = wm > 0.3 && rnd < wm * 0.7;
      const lk = Math.max(0.16, 0.044 / Math.max(sp, 0.01));
      put(x, y, -wx * lk, -wy * lk, white ? 0.85 : (0.08 + bright * 0.08) * 0.7, 0, bright / 7, white ? 1 : 0);
    });
    // Écume, feuilles et brindilles.
    run(this.Q, this.nFloat, 4, 8, 0.92, 0.12, (rnd) => rnd >= LEAF && foamKeep < 1 && pick(rnd) > foamKeep, (A, o, x, y, vv, w) => {
      const age = A[o + 2], life = A[o + 3], rnd = A[o + 4];
      const wx = w[0], wy = w[1], foam = vv[3], cushion = vv[4], chop = vv[5], vee = vv[6];
      const fade = Math.min(1, age / 0.6, (life - age) / 1.0);
      if (rnd < LEAF) {
        if ((3.6 / PX) * ppc < 1.2) return;   // feuille plus petite qu'un pixel
        const twig = rnd < LEAF * 0.35;
        const ang = twig ? Math.atan2(wy, wx) : age * ((rnd * 977) % 1 - 0.5) * 1.2 + rnd * 50;
        put(x, y, Math.cos(ang), Math.sin(ang), fade, twig ? 3 : 2, Math.floor((rnd * 4) / LEAF) % 4 / 4, 0);
        return;
      }
      const white = Math.max(foam, cushion * 0.8, vee, chop * 0.6);
      const al = fade * (0.15 + 0.85 * white) * (0.5 + 0.5 * ((rnd * 7) % 1));
      if (al < 0.08) return;
      const size = (0.6 + ((rnd * 13) % 1) * 1.4 + white * 0.7) / PX;
      // De loin : moins de points d'écume, ceux qui restent en fondu.
      let lodK = 1;
      const px = size * ppc;
      if (px < MIN_FOAM_PX) {
        const keep = (px / MIN_FOAM_PX) ** 2, p = pick(rnd);
        if (p > keep) return;
        lodK = Math.min(1, (keep - p) / (keep * 0.3));
      }
      put(x, y, size, 0, (0.2 + Math.min(3, Math.floor(al * 4)) * 0.22) * lodK, 1, 0, 0);
    });
    this.count = c;
    this.stats = { simulated, drawn: c };
    return c;
  }
}

/* -------------------------------------------- */
/*  Programmes de carte graphique               */
/* -------------------------------------------- */

const COMMON = `
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }`;

/** Surface de l'eau : les morceaux de carte qui contiennent de l'eau (positions en cases). */
export const SURFACE_VERT = `
precision highp float;
attribute vec2 aVertexPosition;
uniform mat3 projectionMatrix;
uniform mat3 translationMatrix;
varying vec2 vPos;
void main() {
  vPos = aVertexPosition;
  gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
}`;

/**
 * Fond de l'eau, calculé une seule fois dans une image : sable et galets (rgb) et ombre portée
 * des rochers (a). La surface le relit à chaque image, décalé par l'ondulation.
 */
export const BED_FRAG = `
precision highp float;
varying vec2 vPos;
uniform vec3 uRocks[${MAX_ROCKS}];
uniform int uRockN;
${COMMON}
vec3 cells(vec2 p) {
  vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)), o = vec2(hash(i + g), hash(i + g + 19.7));
    vec2 r = g + o * 0.85 - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = hash(i + g + 3.1); } else if (d < d2) d2 = d;
  }
  return vec3(sqrt(d1), sqrt(d2) - sqrt(d1), id);
}
void main() {
  vec2 bp = vPos * ${PX.toFixed(1)};
  vec3 cl = cells(bp / 7.0);
  float peb = smoothstep(0.55, 0.38, cl.x);
  vec3 sand = mix(vec3(0.45, 0.40, 0.30), vec3(0.58, 0.52, 0.40), fbm(bp / 5.0));
  vec3 pebC = mix(vec3(0.33, 0.32, 0.28), vec3(0.60, 0.55, 0.46), cl.z) * (0.7 + 0.4 * (1.0 - cl.x * 1.8));
  vec3 bed = mix(sand, pebC, peb * 0.9) * (0.85 + 0.15 * smoothstep(0.0, 0.1, cl.y));
  float shade = 1.0;
  for (int i = 0; i < ${MAX_ROCKS}; i++) {
    if (i >= uRockN) break;
    vec3 r = uRocks[i];
    float d = length(vPos - r.xy - vec2(r.z * 0.25, r.z * 0.3)) - r.z;
    shade *= 1.0 - 0.4 * exp(-max(d, 0.0) / (0.45 * r.z));
  }
  gl_FragColor = vec4(bed, shade);
}`;

export const SURFACE_FRAG = `
precision highp float;
varying vec2 vPos;
uniform sampler2D uField;
uniform sampler2D uBed;
uniform vec2 uMapSize;
uniform vec4 uBedRect;
uniform float uTime, uGlow, uAlpha, uPPC;
uniform int uMode;
${COMMON}
float caustic(vec2 q, float fine) {
  float r1 = 1.0 - abs(noise(q / 15.0) * 2.0 - 1.0);
  float r2 = mix(0.75, 1.0 - abs(noise(q / 9.0 + 7.3) * 2.0 - 1.0), fine);
  return pow(r1 * r2, 5.0);
}
void main() {
  vec4 f = texture2D(uField, vPos / uMapSize);
  float a = f.a;
  if (a < 0.004) { gl_FragColor = vec4(0.0); return; }
  float n = f.r;
  vec2 vel = (f.gb - 0.5) * 8.0 * ${PX.toFixed(1)};
  vec2 px = vPos * ${PX.toFixed(1)};
  float depth = 1.0 - n * n;
  // Vu de loin, les détails plus fins que les pixels scintilleraient : ils s'effacent en fondu.
  float fine = smoothstep(8.0, 16.0, uPPC), tiny = smoothstep(25.0, 50.0, uPPC);
  // Reflets portés par le courant : deux phases qui se relaient, sans étirement.
  float T = 1.8, t = uTime;
  float ph0 = fract(t / T), ph1 = fract(t / T + 0.5);
  float w0 = 1.0 - abs(2.0 * ph0 - 1.0);
  vec2 q0 = px - vel * ph0 * T + floor(t / T) * vec2(37.0, 11.0);
  vec2 q1 = px - vel * ph1 * T + floor(t / T + 0.5) * vec2(53.0, 29.0);
  float cs = caustic(q0, fine) * w0 + caustic(q1, fine) * (1.0 - w0);
  float rip = (noise(q0 / 6.0) * w0 + noise(q1 / 6.0) * (1.0 - w0)) - 0.5;
  // Fond précalculé, vu à travers l'eau qui ondule.
  vec2 bp = px + vec2(rip) * 3.0 * depth;
  vec4 bedT = texture2D(uBed, (bp / ${PX.toFixed(1)} - uBedRect.xy) / uBedRect.zw);
  vec3 bed = bedT.rgb;
  vec3 deep, shallow; float absorb, causticK;
  if (uMode == 0) { deep = vec3(0.04, 0.20, 0.26); shallow = vec3(0.30, 0.55, 0.52); absorb = 0.04 + 0.62 * depth; causticK = 0.7; }
  else if (uMode == 1) { deep = vec3(0.02, 0.09, 0.15); shallow = vec3(0.12, 0.33, 0.38); absorb = 0.55 + 0.45 * depth; causticK = 0.25; }
  else { deep = vec3(0.22, 0.22, 0.13); shallow = vec3(0.40, 0.38, 0.24); absorb = 0.6 + 0.35 * depth; causticK = 0.12; }
  vec3 water = mix(shallow, deep, smoothstep(0.0, 1.0, depth));
  vec3 col = mix(bed * mix(vec3(0.85, 0.95, 0.92), vec3(1.0), 0.3), water, absorb);
  col += vec3(0.85, 1.0, 0.92) * cs * causticK * (1.0 - absorb * 0.7) * uGlow * 1.4;
  float sky = fbm(px / 140.0 + vec2(uTime * 0.01, 0.0));
  col += vec3(0.55, 0.70, 0.80) * 0.07 * sky * uGlow;
  float glint = pow(max(0.0, noise(q0 / 3.0 + 11.0) * w0 + noise(q1 / 3.0 + 11.0) * (1.0 - w0)), 9.0);
  col += vec3(1.0) * glint * 0.9 * uGlow * (0.4 + 0.6 * depth) * tiny;
  // Liseré d'eau claire et d'écume contre la berge.
  col = mix(col, shallow * 1.2, smoothstep(0.86, 0.98, n) * 0.5);
  col = mix(col, vec3(0.86, 0.92, 0.90), smoothstep(0.955, 0.995, n) * (0.35 + 0.4 * mix(0.5, noise(px / 4.0 - uTime * 3.0), tiny)));
  // Ombre portée des rochers (précalculée avec le fond).
  col *= bedT.a;
  float alpha = a * uAlpha;
  gl_FragColor = vec4(col * alpha, alpha);
}`;

/** Traits, écume et débris : un quadrilatère par élément, positions en cases. */
export const FLOAT_VERT = `
precision highp float;
attribute vec2 aVertexPosition;
attribute vec4 aP0;
attribute vec4 aP1;
uniform mat3 projectionMatrix;
uniform mat3 translationMatrix;
uniform float uMinWidth;
varying vec2 vLocal;
varying vec4 vColor;
varying float vKind;
const float PX = ${PX.toFixed(1)};
void main() {
  vec2 c = aVertexPosition, head = aP0.xy, ax = aP0.zw;
  float alpha = aP1.x, kind = aP1.y, tone = aP1.z, white = aP1.w;
  vec2 p;
  vec3 col;
  if (kind < 0.5) {
    // Trait : de la queue à la tête, bouts arrondis par le dégradé.
    float len = max(length(ax), 1e-4);
    vec2 dir = -ax / len, nrm = vec2(-dir.y, dir.x);
    float w = max(uMinWidth, white > 0.5 ? 1.3 / PX : (0.7 + tone * 0.56) / PX);
    p = head + ax * (1.0 - (c.x + 1.0) * 0.5) + dir * c.x * w * 0.5 + nrm * c.y * w * 0.5;
    col = white > 0.5 ? vec3(0.98, 0.99, 1.0) : vec3(200.0 + tone * 42.0, 230.0 + tone * 21.0, 255.0) / 255.0;
    vLocal = vec2(0.0, c.y);
  } else if (kind < 1.5) {
    // Écume : un point rond.
    p = head + c * max(ax.x, uMinWidth * 0.5) * 1.2;
    col = vec3(0.96, 0.98, 0.99);
    vLocal = c * 1.2;
  } else {
    // Feuille ou brindille, tournée selon sa direction.
    vec2 dir = ax, nrm = vec2(-dir.y, dir.x);
    bool twig = kind > 2.5;
    float L = (twig ? 5.0 : 3.6) / PX, Wd = (twig ? 0.6 : 1.9) / PX;
    p = head + dir * c.x * L + nrm * c.y * Wd;
    col = twig ? vec3(0.35, 0.27, 0.19)
      : (tone < 0.25 ? vec3(0.54, 0.42, 0.16) : tone < 0.5 ? vec3(0.64, 0.47, 0.18) : tone < 0.75 ? vec3(0.44, 0.48, 0.17) : vec3(0.58, 0.31, 0.16));
    vLocal = c;
  }
  vColor = vec4(col, alpha);
  vKind = kind;
  gl_Position = vec4((projectionMatrix * translationMatrix * vec3(p, 1.0)).xy, 0.0, 1.0);
}`;

export const FLOAT_FRAG = `
precision mediump float;
varying vec2 vLocal;
varying vec4 vColor;
varying float vKind;
uniform float uAlpha;
void main() {
  float m = 1.0;
  if (vKind < 0.5) m = smoothstep(1.0, 0.4, abs(vLocal.y));
  else if (vKind < 1.5) m = smoothstep(1.0, 0.7, length(vLocal));
  else if (vKind < 2.5) {
    m = smoothstep(1.0, 0.85, length(vLocal));
    if (abs(vLocal.y) < 0.09) { gl_FragColor = vec4(vec3(0.16, 0.12, 0.06) * vColor.a * m * uAlpha, vColor.a * m * uAlpha); return; }
  }
  float a = vColor.a * m * uAlpha;
  gl_FragColor = vec4(vColor.rgb * a, a);
}`;

/** Quadrilatère d'un élément (bande de 4 sommets). */
export const QUAD_CORNERS = new Float32Array([-1, -1, -1, 1, 1, -1, 1, 1]);

/** Uniformes du fond précalculé. */
export function bedUniforms(field) {
  const rocks = new Float32Array(MAX_ROCKS * 3);
  field.rocks.slice(0, MAX_ROCKS).forEach((r, i) => rocks.set([r.x, r.y, r.r], i * 3));
  return { uRocks: rocks, uRockN: Math.min(MAX_ROCKS, field.rocks.length) };
}

/**
 * Emprise et taille de l'image du fond : l'eau et ses abords (l'ondulation lit un peu à côté),
 * à la finesse demandée, sans dépasser BED_MAX pixels de côté.
 * @param {number} ppc  pixels par case voulus (ceux de l'image de fond de la scène)
 */
export function bedLayout(field, ppc) {
  const b = field.bounds, m = 0.25;
  const x0 = b.x0 - m, y0 = b.y0 - m, w = b.x1 - b.x0 + 2 * m, h = b.y1 - b.y0 + 2 * m;
  const k = Math.max(1, Math.min(ppc, BED_MAX / w, BED_MAX / h));
  return { rect: new Float32Array([x0, y0, w, h]), width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/** Uniformes de la surface pour des réglages donnés. */
export function surfaceUniforms(field, settings, bedRect) {
  return {
    uMapSize: new Float32Array([field.W / field.R, field.H / field.R]),
    uBedRect: bedRect,
    uGlow: settings.glow,
    uMode: WATER_TEXTURES.indexOf(settings.texture),
    uPPC: 100,
    uAlpha: 1
  };
}

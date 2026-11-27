/**
 * Ce que l'outil Eau ajoute à l'eau d'une carte (map.waterData), en plus de son étendue
 * (sol « eau » peint et rivières tracées) :
 *   depth    : profondeur retouchée au pinceau, par morceaux ; rien = profondeur automatique
 *              (le fond descend en s'éloignant du bord). Valeurs de -100 (beaucoup moins
 *              profond) à 100 (beaucoup plus profond), DEPTH_RES points par case.
 *   zones    : type d'eau peint par zones { type: anneaux } ; ailleurs, le type par défaut
 *              de la carte (map.water.texture).
 *   currents : courants tracés [{ id, pts: [[x, y]…], speed }] ; le courant se répartit
 *              entre les traits.
 *   calm     : zones d'eau calme (anneaux) : le courant s'y éteint.
 * Rien ici ne dépend de Foundry : éditeur, export et scène s'en servent.
 */
import * as poly from "./poly.js";

export const WATER_TYPES = ["clear", "deep", "muddy", "tropical"];
/** Points de profondeur par case, et taille d'un morceau en cases. */
export const DEPTH_RES = 4;
export const DEPTH_CHUNK = 8;
const N = DEPTH_RES * DEPTH_CHUNK;
/** Vitesse d'un courant tracé : bornes (comme les rivières). */
export const CURRENT_SPEED = [0.2, 3];

const r3 = (n) => Math.round(n * 1000) / 1000;

export const emptyWaterData = () => ({ depth: {}, zones: {}, currents: [], calm: [] });

function cleanRings(rings) {
  return (Array.isArray(rings) ? rings : [])
    .filter((r) => Array.isArray(r) && r.length >= 6 && r.length % 2 === 0 && r.every(Number.isFinite))
    .map((r) => r.map(r3));
}

/* -------------------------------------------- */
/*  Morceaux de profondeur (base64 d'Int8)      */
/* -------------------------------------------- */

const b64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] & 255); return btoa(s); };
const unb64 = (str) => { const s = atob(str); const out = new Int8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = (s.charCodeAt(i) << 24) >> 24; return out; };

export function decodeChunk(str) {
  try {
    const a = unb64(str);
    return a.length === N * N ? a : null;
  } catch {
    return null;
  }
}
export const encodeChunk = (arr) => b64(new Uint8Array(arr.buffer, arr.byteOffset, arr.length));

export function normalizeWaterData(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = emptyWaterData();
  for (const [key, str] of Object.entries(src.depth ?? {})) {
    if (!/^-?\d+,-?\d+$/.test(key) || typeof str !== "string") continue;
    const a = decodeChunk(str);
    if (a && a.some((v) => v)) out.depth[key] = encodeChunk(a);
  }
  for (const type of WATER_TYPES) {
    const rings = cleanRings(src.zones?.[type]);
    if (rings.length) out.zones[type] = rings;
  }
  let n = 0;
  for (const c of Array.isArray(src.currents) ? src.currents : []) {
    const pts = (Array.isArray(c?.pts) ? c.pts : []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).map(([x, y]) => [r3(x), r3(y)]);
    if (pts.length < 2) continue;
    const speed = Number(c.speed);
    out.currents.push({
      id: typeof c.id === "string" && c.id ? c.id : `k${++n}`,
      pts,
      speed: r3(Number.isFinite(speed) ? Math.min(CURRENT_SPEED[1], Math.max(CURRENT_SPEED[0], speed)) : 1),
      ...(c.b ? { b: true } : {}), ...(c.gen ? { gen: true } : {})
    });
  }
  out.calm = cleanRings(src.calm);
  return out;
}

/** Valeurs de profondeur (Int8) de toute la carte, à la demande : get(i, j) sur la grille. */
export function depthGrid(data) {
  const chunks = new Map();
  for (const [key, str] of Object.entries(data?.depth ?? {})) { const a = decodeChunk(str); if (a) chunks.set(key, a); }
  return {
    empty: !chunks.size,
    get(i, j) {
      const cx = Math.floor(i / N), cy = Math.floor(j / N), a = chunks.get(`${cx},${cy}`);
      return a ? a[(j - cy * N) * N + (i - cx * N)] : 0;
    },
    /** Retouche de profondeur en (x, y) cases, de -1 à 1, interpolée. */
    at(x, y) {
      if (!chunks.size) return 0;
      const gx = x * DEPTH_RES - 0.5, gy = y * DEPTH_RES - 0.5;
      const i = Math.floor(gx), j = Math.floor(gy), u = gx - i, v = gy - j;
      return (this.get(i, j) * (1 - u) * (1 - v) + this.get(i + 1, j) * u * (1 - v) + this.get(i, j + 1) * (1 - u) * v + this.get(i + 1, j + 1) * u * v) / 100;
    }
  };
}

/**
 * Pinceau de profondeur : creuse (amount > 0) ou remonte le fond autour de (x, y), en douceur
 * vers le bord du pinceau ; reset : rend la profondeur automatique. Renvoie vrai si quelque
 * chose a changé.
 */
export function paintDepth(data, x, y, r, amount, { width = Infinity, height = Infinity, reset = false } = {}) {
  let changed = false;
  const i0 = Math.max(0, Math.floor((x - r) * DEPTH_RES)), i1 = Math.min(Math.ceil(width * DEPTH_RES) - 1, Math.ceil((x + r) * DEPTH_RES));
  const j0 = Math.max(0, Math.floor((y - r) * DEPTH_RES)), j1 = Math.min(Math.ceil(height * DEPTH_RES) - 1, Math.ceil((y + r) * DEPTH_RES));
  const touched = new Map();
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const px = (i + 0.5) / DEPTH_RES, py = (j + 0.5) / DEPTH_RES, d = Math.hypot(px - x, py - y);
      if (d > r) continue;
      const k = 1 - (d / r) ** 2;
      const cx = Math.floor(i / N), cy = Math.floor(j / N), key = `${cx},${cy}`;
      let a = touched.get(key);
      if (!a) {
        a = (data.depth[key] && decodeChunk(data.depth[key])) || new Int8Array(N * N);
        touched.set(key, a);
      }
      const o = (j - cy * N) * N + (i - cx * N);
      // reset : ramène vers la profondeur automatique.
      const v = reset ? Math.round(a[o] * (1 - Math.min(1, Math.abs(amount) * k))) : Math.max(-100, Math.min(100, Math.round(a[o] + amount * 100 * k * k)));
      if (v !== a[o]) { a[o] = v; changed = true; }
    }
  }
  for (const [key, a] of touched) {
    if (a.some((v) => v)) data.depth[key] = encodeChunk(a);
    else delete data.depth[key];
  }
  return changed;
}

/* -------------------------------------------- */
/*  Zones de type, courants, eau calme          */
/* -------------------------------------------- */

/** Peint un type d'eau ; type null : retour au type par défaut. */
export function paintZone(data, rings, type) {
  const before = JSON.stringify(data.zones);
  for (const t of Object.keys(data.zones)) {
    if (t === type) continue;
    const rest = poly.difference(data.zones[t], rings);
    if (rest.length) data.zones[t] = rest; else delete data.zones[t];
  }
  if (type && WATER_TYPES.includes(type)) data.zones[type] = poly.union(data.zones[type] ?? [], rings);
  return JSON.stringify(data.zones) !== before;
}

export function paintCalm(data, rings, erase = false) {
  const before = JSON.stringify(data.calm);
  data.calm = erase ? poly.difference(data.calm, rings) : poly.union(data.calm, rings);
  return JSON.stringify(data.calm) !== before;
}

export function addCurrent(data, pts, speed = 1) {
  if (!Array.isArray(pts) || pts.length < 2) return null;
  let n = data.currents.length + 1;
  while (data.currents.some((c) => c.id === `k${n}`)) n++;
  const c = { id: `k${n}`, pts: pts.map(([x, y]) => [r3(x), r3(y)]), speed: r3(Math.min(CURRENT_SPEED[1], Math.max(CURRENT_SPEED[0], speed))) };
  data.currents.push(c);
  return c;
}

/** Gomme des courants : les traits touchés disparaissent, l'eau calme sous la gomme aussi. */
export function eraseCurrents(data, rings) {
  const before = data.currents.length;
  data.currents = data.currents.filter((c) => !c.pts.some(([x, y]) => poly.pointInRings(rings, x, y)));
  return paintCalm(data, rings, true) || data.currents.length !== before;
}

/** Points d'un courant tous les `step` cases, avec leur direction. */
export function currentSamples(c, step = 0.25) {
  const out = [];
  for (let i = 0; i + 1 < c.pts.length; i++) {
    const [ax, ay] = c.pts[i], [bx, by] = c.pts[i + 1], L = Math.hypot(bx - ax, by - ay);
    if (L < 1e-6) continue;
    const tx = (bx - ax) / L, ty = (by - ay) / L;
    for (let d = 0; d < L; d += step) out.push([ax + tx * d, ay + ty * d, tx, ty]);
  }
  const [lx, ly] = c.pts.at(-1), prev = out.at(-1);
  if (prev) out.push([lx, ly, prev[2], prev[3]]);
  return out;
}

/**
 * Génération de courants (bouton « Générer les courants » de l'outil Eau, et biome Marais) :
 * des courants tracés posés le long des chenaux de toute l'eau de la carte, peinte à la main ou
 * non. Ce sont des courants ordinaires (retouchables, effaçables), marqués gen pour que la
 * génération suivante les remplace sans toucher à ceux tracés à la main.
 *
 * Pour chaque étendue d'eau (morceau d'eau d'un seul tenant) :
 *  - elle sort de la carte par plusieurs endroits : courant de la sortie la plus en amont à la
 *    plus en aval (sens général tiré au hasard), puis un affluent depuis chaque autre sortie
 *    jusqu'au courant principal (ou depuis lui, si la sortie est en aval) ;
 *  - une seule sortie : de son point le plus éloigné jusqu'à elle (ou l'inverse) ;
 *  - aucune sortie : courant seulement si l'eau est un chenal allongé (un étang rond reste calme).
 * Les tracés suivent le milieu des chenaux : plus court chemin où chaque pas coûte plus cher près
 * des berges.
 */
import { waterRings } from "./render.js";
import { addCurrent } from "./water-data.js";

/** Cellules par case, longueur minimale d'un courant (cases). */
const RES = 2, MIN_LENGTH = 6;

/** Grille d'eau (1 = eau), règle pair-impair sur les contours. */
function wetGrid(rings, W, H) {
  const wet = new Uint8Array(W * H);
  const edges = [];
  for (const r of rings) {
    const m = r.length / 2;
    for (let k = 0; k < m; k++) { const q = (k + 1) % m; edges.push([r[k * 2], r[k * 2 + 1], r[q * 2], r[q * 2 + 1]]); }
  }
  for (let j = 0; j < H; j++) {
    const y = (j + 0.5) / RES, xs = [];
    for (const [ax, ay, bx, by] of edges) if ((ay <= y) !== (by <= y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
    xs.sort((a, b) => a - b);
    for (let s = 0; s + 1 < xs.length; s += 2) {
      for (let i = Math.max(0, Math.ceil(xs[s] * RES - 0.5)); i < W && (i + 0.5) / RES < xs[s + 1]; i++) wet[j * W + i] = 1;
    }
  }
  return wet;
}

/** Distance à la terre (cellules) ; le bord de la carte n'est pas une berge. */
function shoreDistance(wet, W, H) {
  const D = new Float32Array(W * H);
  for (let o = 0; o < W * H; o++) D[o] = wet[o] ? 1e6 : 0;
  const S = Math.SQRT2;
  const pass = (o, i, j, di, dj, c) => {
    const x = i + di, y = j + dj;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const v = D[y * W + x] + c;
    if (v < D[o]) D[o] = v;
  };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const o = j * W + i;
    if (!wet[o]) continue;
    pass(o, i, j, -1, 0, 1); pass(o, i, j, 0, -1, 1); pass(o, i, j, -1, -1, S); pass(o, i, j, 1, -1, S);
  }
  for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) {
    const o = j * W + i;
    if (!wet[o]) continue;
    pass(o, i, j, 1, 0, 1); pass(o, i, j, 0, 1, 1); pass(o, i, j, 1, 1, S); pass(o, i, j, -1, 1, S);
  }
  return D;
}

/** Tas binaire minimal (Dijkstra). */
class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop() {
    const k = this.k, v = this.v, top = v[0], last = k.length - 1;
    k[0] = k[last]; v[0] = v[last]; k.pop(); v.pop();
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let m = i;
      if (l < k.length && k[l] < k[m]) m = l;
      if (r < k.length && k[r] < k[m]) m = r;
      if (m === i) break;
      [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]];
      i = m;
    }
    return top;
  }
}

/**
 * Plus court chemin dans l'eau depuis des cellules de départ, chaque pas coûtant plus près des
 * berges (le tracé suit le milieu du chenal).
 * @returns {{dist:Float64Array, prev:Int32Array}}
 */
function dijkstra(sources, wet, cost, W, H) {
  const n = W * H, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), heap = new Heap();
  for (const s of sources) { dist[s] = 0; heap.push(0, s); }
  const S = Math.SQRT2;
  while (heap.size) {
    const o = heap.pop(), d = dist[o], i = o % W, j = (o - i) / W;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const x = i + di, y = j + dj;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const q = y * W + x;
      if (!wet[q]) continue;
      // En diagonale, pas à travers un coin de terre.
      if (di && dj && (!wet[j * W + x] || !wet[y * W + i])) continue;
      const nd = d + (di && dj ? S : 1) * cost[q];
      if (nd < dist[q]) { dist[q] = nd; prev[q] = o; heap.push(nd, q); }
    }
  }
  return { dist, prev };
}

const walk = (prev, o) => { const out = []; for (; o >= 0; o = prev[o]) out.push(o); return out; };

/** Cellules → points (cases), lissés, un point par case environ. */
function toPoints(cells, W) {
  let pts = cells.map((o) => [((o % W) + 0.5) / RES, (Math.floor(o / W) + 0.5) / RES]);
  for (let pass = 0; pass < 3; pass++) {
    pts = pts.map((p, k) => (k === 0 || k === pts.length - 1 ? p : [(pts[k - 1][0] + p[0] * 2 + pts[k + 1][0]) / 4, (pts[k - 1][1] + p[1] * 2 + pts[k + 1][1]) / 4]));
  }
  return pts.filter((_, k) => k % RES === 0 || k === pts.length - 1);
}

const lengthOf = (pts) => pts.reduce((a, p, k) => (k ? a + Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]) : 0), 0);

/**
 * Courants le long des chenaux de toute l'eau de la carte (ou de `water`, anneaux, si donné).
 * Les courants générés avant (gen) sont remplacés ; ceux tracés à la main restent.
 * @param {object} map
 * @param {() => number} rand
 * @param {{speed?:[number, number], water?:number[][], mark?:object}} [o]
 *   speed : vitesse tirée entre ces bornes ; mark : champs ajoutés à chaque courant (ex. { b: true })
 * @returns {number}  courants posés
 */
export function generateCurrents(map, rand, { speed = [0.4, 0.6], water = null, mark = {} } = {}) {
  if (!map.waterData) return 0;
  map.waterData.currents = map.waterData.currents.filter((c) => !c.gen);
  const rings = water ?? waterRings(map);
  if (!rings.length) return 0;
  const W = Math.max(1, Math.ceil(map.width * RES)), H = Math.max(1, Math.ceil(map.height * RES)), n = W * H;
  const wet = wetGrid(rings, W, H);
  const D = shoreDistance(wet, W, H);
  // Pas cher au milieu du chenal, cher contre la berge.
  const cost = new Float32Array(n);
  for (let o = 0; o < n; o++) if (wet[o]) cost[o] = 1 + 6 / (Math.min(D[o], 12) + 0.5) ** 2;
  // Sens général du courant.
  const a = rand() * Math.PI * 2, gx = Math.cos(a), gy = Math.sin(a);
  const along = (o) => ((o % W) + 0.5) * gx + (Math.floor(o / W) + 0.5) * gy;
  const comp = new Int32Array(n).fill(-1);
  let placed = 0;
  const put = (cells, downstream) => {
    let pts = toPoints(cells, W);
    if (pts.length < 2 || lengthOf(pts) < MIN_LENGTH) return;
    if (!downstream) pts = pts.reverse();
    const c = addCurrent(map.waterData, pts, speed[0] + rand() * (speed[1] - speed[0]));
    if (c) { Object.assign(c, { gen: true }, mark); placed++; }
  };
  for (let start = 0; start < n; start++) {
    if (!wet[start] || comp[start] >= 0) continue;
    // Étendue d'eau d'un seul tenant.
    const cells = [start];
    comp[start] = start;
    for (let k = 0; k < cells.length; k++) {
      const o = cells[k], i = o % W, j = (o - i) / W;
      for (const [x, y] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const q = y * W + x;
        if (wet[q] && comp[q] < 0) { comp[q] = start; cells.push(q); }
      }
    }
    if (cells.length < MIN_LENGTH * RES * 2) continue;
    // Sorties : groupes de cellules au bord de la carte, chacune réduite à sa cellule la plus au large.
    const border = cells.filter((o) => { const i = o % W, j = (o - i) / W; return i === 0 || j === 0 || i === W - 1 || j === H - 1; });
    const exits = [];
    const seen = new Set();
    for (const o of border) {
      if (seen.has(o)) continue;
      const group = [o];
      seen.add(o);
      for (let k = 0; k < group.length; k++) {
        const p = group[k], i = p % W, j = (p - i) / W;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const x = i + di, y = j + dj, q = y * W + x;
          if (x < 0 || y < 0 || x >= W || y >= H || seen.has(q) || !wet[q]) continue;
          if (!(x === 0 || y === 0 || x === W - 1 || y === H - 1)) continue;
          seen.add(q); group.push(q);
        }
      }
      if (group.length < 2) continue;
      exits.push(group.reduce((m, q) => (D[q] > D[m] ? q : m), group[0]));
    }
    if (exits.length >= 2) {
      // Principal : de la sortie la plus en amont à la plus en aval.
      exits.sort((p, q) => along(p) - along(q));
      const up = exits[0], down = exits.at(-1);
      const { prev } = dijkstra([up], wet, cost, W, H);
      const main = walk(prev, down).reverse();
      put(main, true);
      // Affluents (et défluents) : des autres sorties vers le principal.
      const onMain = new Set(main);
      const r = exits.length > 2 ? dijkstra(main, wet, cost, W, H) : null;
      for (const e of exits.slice(1, -1)) {
        const branch = walk(r.prev, e); // de la sortie jusqu'au principal
        if (!onMain.has(branch.at(-1))) continue;
        // Sortie en amont de son point d'arrivée : l'eau entre par elle (affluent).
        put(branch, along(e) < along(branch.at(-1)));
      }
    } else {
      // Plus long chenal : double balayage (le point le plus éloigné d'un point quelconque, puis
      // le plus éloigné de celui-là).
      const far = (src) => { const { dist, prev } = dijkstra([src], wet, cost, W, H); let m = src; for (const o of cells) if (dist[o] > dist[m] && dist[o] < Infinity) m = o; return { m, prev }; };
      const A = exits.length ? exits[0] : far(cells[0]).m;
      const { m: B, prev } = far(A);
      const path = walk(prev, B).reverse(); // de A à B
      if (!exits.length) {
        // Étendue fermée : seulement un chenal allongé.
        const area = cells.length / (RES * RES), len = path.length / RES;
        if (len < 8 || len / Math.sqrt(area) < 2) continue;
      }
      // Avec une sortie (A), l'eau en sort ou y entre, selon le sens général.
      put(path, along(B) > along(A));
    }
  }
  return placed;
}

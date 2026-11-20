/**
 * Côtes : là où l'eau borde du sable, une plage ; là où elle borde de la roche, une falaise.
 * Rien à dessiner à la main : le rivage se reconnaît au sol qui touche l'eau.
 *
 *   Plage   : l'eau monte sur le sable puis se retire au rythme des vagues, sans déferler ;
 *             l'écume vient avec chaque vague ; le sable reste mouillé jusqu'où les vagues
 *             montent, sèche un peu entre deux vagues, et la suivante le remouille.
 *   Falaise : une paroi de roche vue du dessus ; à chaque vague, des gerbes partent du pied,
 *             montent le long de la paroi et retombent ; l'écume repart vers le large (ressac).
 *             Les rochers posés dans l'eau ont leur propre gerbe.
 *
 * Les vagues avancent vers la côte à leur vitesse réelle (environ 6 m/s près du bord) : ce qui
 * avance le plus en mer est touché en premier. Elles viennent du large, déduit de l'orientation
 * moyenne des côtes.
 *
 * Unités : cases. Les réglages ont été mis au point sur un prototype où une case faisait PX
 * pixels ; les formules en « px » y sont gardées telles quelles et converties.
 * Rien ici ne dépend de Foundry ni de PIXI.
 */
import * as poly from "./poly.js";
import { flattenNodes } from "./curves.js";

const PX = 50;
/** Vitesse d'avance des vagues : 6 m/s, pour des cases de 1,5 m. */
export const WAVE_SPEED = 4;
/** Portée des effets de côte, de part et d'autre du rivage (cases). */
export const COAST_REACH = 2.2;
/** Sortes de côte, d'après le sol qui borde l'eau. */
export const COAST_KINDS = { sand: 1, rock: 2 };
/** Espacement des points d'où partent l'écume et les gerbes (cases). */
const SAMPLE_STEP = 0.1;

const r3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Rivages de sable et de roche : segments [ax, ay, bx, by, sorte, nx, ny] (n : vers la terre)
 * et direction d'où viennent les vagues (vers la terre). null s'il n'y en a pas.
 * Les berges des rivières (chemins d'eau) n'ont pas de vagues.
 * @param {number[][]} water  contours de l'eau (waterRings)
 */
export function coastSegments(map, water) {
  const lands = Object.entries(map.terrains ?? {})
    .filter(([id]) => COAST_KINDS[id])
    .map(([id, rings]) => ({ kind: COAST_KINDS[id], rings, box: poly.ringsBounds(rings) }));
  if (!lands.length || !water.length) return null;
  const rivers = (map.paths ?? []).filter((q) => q.terrain === "water")
    .map((q) => ({ pts: flattenNodes(q.nodes, q.closed, 0.05), half: q.width / 2 }));
  const nearRiver = (x, y) => rivers.some(({ pts, half }) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
      const h = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
      if (Math.hypot(x - ax - dx * h, y - ay - dy * h) < half + 0.2) return true;
    }
    return false;
  });
  const landAt = (x, y) => lands.find((l) => x >= l.box.x0 && x <= l.box.x1 && y >= l.box.y0 && y <= l.box.y1 && poly.pointInRings(l.rings, x, y))?.kind ?? 0;
  const segs = [];
  let sx = 0, sy = 0;
  for (const r of water) {
    const m = r.length / 2;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      const ax = r[i * 2], ay = r[i * 2 + 1], bx = r[j * 2], by = r[j * 2 + 1];
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 1e-6) continue;
      // Morceaux d'au plus une demi-case : un rivage peut changer de sol en chemin.
      const n = Math.ceil(len / 0.5);
      let nx = -(by - ay) / len, ny = (bx - ax) / len;
      const mx0 = (ax + bx) / 2, my0 = (ay + by) / 2;
      if (poly.pointInRings(water, mx0 + nx * 0.05, my0 + ny * 0.05)) { nx = -nx; ny = -ny; }
      for (let k = 0; k < n; k++) {
        const x0 = ax + ((bx - ax) * k) / n, y0 = ay + ((by - ay) * k) / n;
        const x1 = ax + ((bx - ax) * (k + 1)) / n, y1 = ay + ((by - ay) * (k + 1)) / n;
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        const kind = landAt(mx + nx * 0.3, my + ny * 0.3);
        if (!kind || nearRiver(mx, my)) continue;
        segs.push([r3(x0), r3(y0), r3(x1), r3(y1), kind, r3(nx), r3(ny)]);
        sx += nx * len / n; sy += ny * len / n;
      }
    }
  }
  if (!segs.length) return null;
  // Les vagues viennent du large : en moyenne, perpendiculaires aux côtes. Un lac entouré de
  // plage n'a pas de large : elles arrivent alors partout en même temps.
  const total = segs.reduce((s, q) => s + Math.hypot(q[2] - q[0], q[3] - q[1]), 0);
  const L = Math.hypot(sx, sy);
  const dir = L > total * 0.3 ? [r3(sx / L), r3(sy / L)] : [0, 0];
  return { segs, dir };
}

function bucket(segs, pad) {
  const map = new Map();
  segs.forEach((s, i) => {
    for (let y = Math.floor(Math.min(s[1], s[3]) - pad); y <= Math.floor(Math.max(s[1], s[3]) + pad); y++) {
      for (let x = Math.floor(Math.min(s[0], s[2]) - pad); x <= Math.floor(Math.max(s[0], s[2]) + pad); x++) {
        const k = x * 65536 + y;
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(i);
      }
    }
  });
  return map;
}
const segDist = (s, x, y) => {
  const dx = s[2] - s[0], dy = s[3] - s[1], L2 = dx * dx + dy * dy || 1e-9;
  const h = Math.max(0, Math.min(1, ((x - s[0]) * dx + (y - s[1]) * dy) / L2));
  return Math.hypot(x - s[0] - dx * h, y - s[1] - dy * h);
};

/** De combien un point dépasse le bout d'un segment, le long du segment (0 s'il est en face). */
const segBeyond = (s, x, y) => {
  const dx = s[2] - s[0], dy = s[3] - s[1], L = Math.hypot(dx, dy) || 1e-9;
  const u = ((x - s[0]) * dx + (y - s[1]) * dy) / L;
  return Math.max(0, -u, u - L);
};

/**
 * Données de côte sur la grille du champ de l'eau, près des rivages de sable et de roche :
 *   d    : distance signée au rivage (cases ; > 0 sur la terre)
 *   sand, rock : part de plage et de falaise (0 loin d'une côte, ou là où une autre berge est plus proche)
 * Ajoute aussi les points d'où partent l'écume et les gerbes, et rend l'eau opaque jusqu'au
 * rivage (la vague prend le relais de la berge dessinée).
 * @param {object} field   en cours de construction (buildField)
 * @param {object} coast   coastSegments()
 * @param {number[][]} shore  tous les segments du bord de l'eau
 * @param {Uint8Array} inWater  1 pour les échantillons dans l'eau
 */
export function buildCoast(field, coast, shore, inWater) {
  if (!coast?.segs?.length) return null;
  const { W, H, R } = field, size = W * H;
  const d = new Float32Array(size), sand = new Float32Array(size), rock = new Float32Array(size);
  for (let o = 0; o < size; o++) d[o] = inWater[o] ? -COAST_REACH : COAST_REACH;
  const segs = coast.segs;
  const cb = bucket(segs, COAST_REACH), sb = bucket(shore, COAST_REACH);
  const done = new Uint8Array(size);
  for (const s of segs) {
    const i0 = Math.max(0, Math.floor((Math.min(s[0], s[2]) - COAST_REACH) * R)), i1 = Math.min(W - 1, Math.ceil((Math.max(s[0], s[2]) + COAST_REACH) * R));
    const j0 = Math.max(0, Math.floor((Math.min(s[1], s[3]) - COAST_REACH) * R)), j1 = Math.min(H - 1, Math.ceil((Math.max(s[1], s[3]) + COAST_REACH) * R));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const o = j * W + i;
        if (done[o]) continue;
        done[o] = 1;
        const x = (i + 0.5) / R, y = (j + 0.5) / R, key = Math.floor(x) * 65536 + Math.floor(y);
        let dc = Infinity;
        const near = cb.get(key) ?? [];
        for (const k of near) dc = Math.min(dc, segDist(segs[k], x, y));
        if (dc > COAST_REACH) continue;
        // Sable et roche voisins se fondent l'un dans l'autre.
        let ws = 0, wr = 0, beyond = Infinity;
        for (const k of near) {
          const sd = segDist(segs[k], x, y);
          const w = Math.max(0, 1 - (sd - dc) / 0.3);
          if (segs[k][4] === COAST_KINDS.rock) wr += w; else ws += w;
          if (sd <= dc + 0.05) beyond = Math.min(beyond, segBeyond(segs[k], x, y));
        }
        let da = Infinity;
        for (const k of sb.get(key) ?? []) da = Math.min(da, segDist(shore[k], x, y));
        // Une autre berge (herbe, pavés…) plus proche : pas de vagues ici.
        // … et l'effet s'éteint en douceur avant la limite de portée (pas de bord net dans l'eau).
        let weight = Math.max(0, Math.min(1, 1 - (dc - da) / 0.35)) * smooth(COAST_REACH, COAST_REACH - 0.8, dc);
        // Sur la terre, au-delà du bout d'une plage (là où l'herbe reprend), rien.
        if (!inWater[o]) weight *= smooth(0.3, 0, beyond);
        const sum = ws + wr || 1;
        d[o] = inWater[o] ? -dc : dc;
        sand[o] = weight * ws / sum;
        rock[o] = weight * wr / sum;
        // Dans l'eau, près d'une côte, l'eau va jusqu'au rivage : c'est la vague qui fait le bord.
        if (inWater[o] && !field.block[o]) field.a[o] = Math.max(field.a[o], weight);
      }
    }
  }
  // Points d'où partent l'écume (plage) et les gerbes (falaise) : x, y, nx, ny, sorte.
  const pts = [];
  for (const s of segs) {
    const len = Math.hypot(s[2] - s[0], s[3] - s[1]), n = Math.max(1, Math.round(len / SAMPLE_STEP));
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n;
      pts.push(s[0] + (s[2] - s[0]) * u, s[1] + (s[3] - s[1]) * u, s[5], s[6], s[4]);
    }
  }
  return { d, sand, rock, dir: coast.dir, samples: Float32Array.from(pts) };
}

/** Données de côte pour la carte graphique (RGBA) : distance, plage, falaise, présence. */
export function coastPixels(field) {
  const c = field.coast, out = new Uint8Array(field.W * field.H * 4);
  if (!c) return out;
  for (let o = 0; o < field.W * field.H; o++) {
    out[o * 4] = Math.round(Math.min(1, Math.max(0, c.d[o] / 4 + 0.5)) * 255);
    out[o * 4 + 1] = Math.round(c.sand[o] * 255);
    out[o * 4 + 2] = Math.round(c.rock[o] * 255);
    out[o * 4 + 3] = c.sand[o] + c.rock[o] > 0 ? 255 : 0;
  }
  return out;
}

/** Côte en un point (interpolée) : distance, plage, falaise, et direction de la terre. */
export function coastSample(field, x, y, out = new Float64Array(5)) {
  const c = field.coast, f = field;
  const at = (arr, px, py) => {
    const gx = Math.max(0, Math.min(f.W - 1.001, px * f.R - 0.5)), gy = Math.max(0, Math.min(f.H - 1.001, py * f.R - 0.5));
    const i = Math.floor(gx), j = Math.floor(gy), u = gx - i, v = gy - j, o = j * f.W + i;
    return arr[o] * (1 - u) * (1 - v) + arr[o + 1] * u * (1 - v) + arr[o + f.W] * (1 - u) * v + arr[o + f.W + 1] * u * v;
  };
  const e = 1 / f.R;
  out[0] = at(c.d, x, y);
  out[1] = at(c.sand, x, y);
  out[2] = at(c.rock, x, y);
  const gx = at(c.d, x + e, y) - at(c.d, x - e, y), gy = at(c.d, x, y + e) - at(c.d, x, y - e), L = Math.hypot(gx, gy) || 1;
  out[3] = gx / L; out[4] = gy / L;
  return out;
}

/* -------------------------------------------- */
/*  Rythme des vagues (mêmes formules en GLSL)  */
/* -------------------------------------------- */

/** Abscisse le long des côtes, pour les petites variations d'un endroit à l'autre (px). */
const alongS = (x, y) => (x + 0.61 * y) * PX;
const along = (s) => 0.04 * Math.sin(s / 97 + 1.3) + 0.02 * Math.sin(s / 41 + 0.4);
export const pulse = (c) => c < 0.3 ? 0.5 - 0.5 * Math.cos(Math.PI * c / 0.3) : 0.5 + 0.5 * Math.cos(Math.PI * (c - 0.3) / 0.7);
const dpulse = (c) => c < 0.3 ? 0.5 * Math.PI / 0.3 * Math.sin(Math.PI * c / 0.3) : -0.5 * Math.PI / 0.7 * Math.sin(Math.PI * (c - 0.3) / 0.7);
/** Force de chaque vague, qui varie d'une vague et d'un endroit à l'autre (0,2 à 1). */
const waveF = (s, t) => 0.6 + 0.4 * Math.sin(s / 133 + t * 0.37) * Math.sin(t * 0.23 + s / 71);

/** Phase de la vague (0 à 1, 0 = elle arrive) au point du rivage (x, y). */
export function wavePhase(x, y, t, period, dir) {
  const v = (t - (x * dir[0] + y * dir[1]) / WAVE_SPEED) / period - along(alongS(x, y));
  return ((v % 1) + 1) % 1;
}

/** Remontée maximale de l'eau sur le sable (px du prototype), selon la force des vagues. */
const runPx = (waves) => 12 + waves * 0.9 * 70;

/** Exposition d'une paroi aux vagues : face au large, elle prend tout. */
const exposure = (nx, ny, dir) => (dir[0] || dir[1]) ? Math.max(0, nx * dir[0] + ny * dir[1]) ** 1.5 : 0.8;

const smooth = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Remous (px/s du prototype) : petit tourbillonnement qui suit l'eau. */
function curl(xpx, ypx, t, amount, out) {
  const sc = 1 / 30, e = 0.04, ox = xpx * sc + t * 0.2, oy = ypx * sc - t * 0.15;
  out[0] = (noise(ox, oy + e) - noise(ox, oy - e)) / (2 * e) * amount;
  out[1] = -(noise(ox + e, oy) - noise(ox - e, oy)) / (2 * e) * amount;
}

/* -------------------------------------------- */
/*  Écume, gerbes et ressac                     */
/* -------------------------------------------- */

const BF = 6;   // bulle de plage : x, y, âge, durée (< 0 : attend une vague), hasard, échouée
const GF = 10;  // goutte : x, y, z, vx, vy, vz, âge, durée, sorte (0 embrun, 1 brume, 2 écume du ressac), hasard

/**
 * Écume des plages et gerbes des falaises, en cases. step() ajoute ce qui est à dessiner par
 * la fonction put de WaterSim (points d'écume, sorte 1).
 */
export class CoastSim {
  constructor(field, settings, { rand = Math.random, rocks = [] } = {}) {
    this.f = field;
    this.s = settings;
    this.rand = rand;
    const S = field.coast.samples, n = S.length / 5;
    const sand = [], rock = [];
    for (let i = 0; i < n; i++) (S[i * 5 + 4] === COAST_KINDS.rock ? rock : sand).push(i);
    this.sand = Int32Array.from(sand);
    this.rockPts = Int32Array.from(rock);
    // Rochers posés dans l'eau près d'une côte : eux aussi reçoivent les vagues.
    this.rocks = rocks.filter((r) => { const c = coastSample(field, r.x, r.y); return c[1] + c[2] > 0.05; })
      .map((r) => { const c = coastSample(field, r.x, r.y); return { ...r, nx: c[3], ny: c[4] }; });
    this.nBubbles = Math.min(10000, sand.length * 14);
    this.B = new Float32Array(this.nBubbles * BF);
    for (let i = 0; i < this.nBubbles; i++) this.B[i * BF + 3] = -1;
    this.gMax = rock.length || this.rocks.length ? Math.min(20000, rock.length * 60 + this.rocks.length * 400 + 1000) : 0;
    this.G = new Float32Array(this.gMax * GF);
    this.nG = 0;
    this._c = new Float64Array(5);
    this._v = new Float64Array(2);
  }

  /** Éléments au plus dessinés à la fois. */
  get capacity() { return this.nBubbles + this.gMax; }

  _edge(x, y, t) {
    const s = this.s, dir = this.f.coast.dir, sa = alongS(x, y);
    const c = wavePhase(x, y, t, s.period, dir);
    const R = runPx(s.waves) * (0.8 + 0.2 * Math.sin(sa / 133 + t * 0.37) * Math.sin(t * 0.23 + sa / 71)) / PX;
    return { e: R * pulse(c), de: R * dpulse(c) / s.period, c };
  }

  /** L'écume naît où une vague arrive, au bord de l'eau ; sinon elle attend la suivante. */
  _spawnBubble(i, t, inView) {
    const B = this.B, o = i * BF, S = this.f.coast.samples;
    if (!this.sand.length) return;
    const k = this.sand[Math.floor(this.rand() * this.sand.length)] * 5;
    const x = S[k], y = S[k + 1], nx = S[k + 2], ny = S[k + 3];
    // Hors de la vue : rien à faire naître.
    if (!inView(x, y)) { B[o + 3] = -1; return; }
    const { e, c } = this._edge(x, y, t);
    if (c > 0.22) { B[o + 3] = -1; return; }
    const d = e - (this.rand() ** 2 * 25 + 1) / PX;
    // Un peu de côté aussi : pas de rangées de bulles alignées sur les points du rivage.
    const side = (this.rand() - 0.5) * SAMPLE_STEP * 1.6;
    B[o] = x + nx * d - ny * side; B[o + 1] = y + ny * d + nx * side;
    B[o + 2] = 0; B[o + 3] = 1.5 + this.rand() * 2.5; B[o + 4] = this.rand(); B[o + 5] = 0;
  }

  _addDrop(x, y, sx, sy, power, mist) {
    if (this.nG >= this.gMax) return;
    const G = this.G, o = this.nG++ * GF, rand = this.rand;
    const up = (60 + 170 * rand() ** 1.5) * power / PX;
    const out = (5 + 30 * rand()) / PX, side = (rand() - 0.5) * 55 / PX;
    G[o] = x; G[o + 1] = y; G[o + 2] = 0;
    G[o + 3] = sx * out - sy * side; G[o + 4] = sy * out + sx * side; G[o + 5] = mist ? up * 0.6 : up;
    G[o + 6] = 0; G[o + 7] = mist ? 1.4 + rand() : 3; G[o + 8] = mist ? 1 : 0; G[o + 9] = rand();
  }

  /**
   * @param {number} dt
   * @param {number} t
   * @param {{x0:number,y0:number,x1:number,y1:number}|null} view  hors de la vue (une case de marge), rien
   * @param {Function} put  (x, y, ax, ay, opacité, sorte, teinte, blanc)
   */
  step(dt, t, view, put) {
    const s = this.s;
    if (!(s.waves > 0)) { this.nG = 0; return; }
    const m = 1, inView = (x, y) => !view || (x >= view.x0 - m && x <= view.x1 + m && y >= view.y0 - m && y <= view.y1 + m);
    const cs = this._c, cv = this._v, B = this.B, rand = this.rand;
    const tur = s.turbulence;

    // Écume de plage, portée par le va-et-vient.
    for (let i = 0; i < this.nBubbles; i++) {
      const o = i * BF;
      if (B[o + 3] < 0) { if (rand() < 0.08) this._spawnBubble(i, t, inView); continue; }
      let x = B[o], y = B[o + 1];
      if (!inView(x, y)) { B[o + 3] = -1; continue; }
      coastSample(this.f, x, y, cs);
      const { e, de } = this._edge(x - cs[3] * cs[0], y - cs[4] * cs[0], t);
      const h = e - cs[0], k = Math.exp(-Math.max(0, h) * PX / 70);
      if (B[o + 5]) {
        // Échouée : elle ne bouge plus et s'efface vite, sauf si la vague suivante la reprend.
        B[o + 2] += dt * 3;
        if (h > 2 / PX) B[o + 5] = 0;
      } else {
        let vx = cs[3] * de * k, vy = cs[4] * de * k;
        if (tur > 0) { curl(x * PX, y * PX, t, tur * 22 * (0.4 + 0.6 * k) / PX, cv); vx += cv[0]; vy += cv[1]; }
        x += vx * dt; y += vy * dt;
        B[o] = x; B[o + 1] = y; B[o + 2] += dt;
        if (h < -1.5 / PX) B[o + 5] = 1;
      }
      const age = B[o + 2], life = B[o + 3], rnd = B[o + 4];
      if (age > life || h > 260 / PX || cs[1] + cs[2] < 0.02) { B[o + 3] = -1; continue; }
      const fade = Math.min(1, age / 0.6, (life - age) / 1.0);
      const al = fade * (1 - age / life) ** 0.6 * (0.3 + 0.7 * k) * (0.5 + 0.5 * ((rnd * 7) % 1));
      if (al < 0.08) continue;
      const size = (0.4 + ((rnd * 13) % 1) * 0.9 + k * 0.4) / PX;
      put(x, y, size, 0, 0.2 + Math.min(3, Math.floor(al * 4)) * 0.22, 1, 0, 0);
    }

    // Gerbes : au pied des falaises et contre les rochers, juste à l'arrivée de chaque vague.
    if (this.gMax && s.spray > 0) {
      const power0 = 0.25 + 0.9 * s.spray, dir = this.f.coast.dir, S = this.f.coast.samples;
      const emit = (x, y, nx, ny, px, py, gain) => {
        const c = wavePhase(px, py, t, s.period, dir);
        if (c > 0.1) return;
        const sa = alongS(px, py), wf = waveF(sa, t), ex = exposure(nx, ny, dir) * gain;
        // Chaque vague éclate par paquets, à des endroits différents d'une vague à l'autre.
        const wave = Math.floor((t - (px * dir[0] + py * dir[1]) / WAVE_SPEED) / s.period - along(sa));
        const clump = 0.2 + 0.8 * smooth(0.3, 0.7, noise(sa / 45 + wave * 7.3, wave * 3.1));
        const rate = 170 * ex * wf * clump * (1 - c / 0.1) * (0.4 + 0.6 * s.spray) * Math.min(1, s.waves / 0.6);
        let n = rate * dt; n = Math.floor(n) + (rand() < n % 1 ? 1 : 0);
        for (let j = 0; j < n; j++) {
          const jx = (rand() - 0.5) * SAMPLE_STEP;
          this._addDrop(x - ny * jx, y + nx * jx, -nx, -ny, power0 * (0.4 + 0.6 * wf) * (0.5 + 0.7 * Math.min(1.3, ex)), rand() < 0.18);
        }
      };
      for (const i of this.rockPts) {
        const k = i * 5, x = S[k], y = S[k + 1];
        if (!inView(x, y)) continue;
        const nx = S[k + 2], ny = S[k + 3], back = (1.5 + rand() * 2) / PX;
        emit(x - nx * back, y - ny * back, nx, ny, x, y, 1);
      }
      for (const r of this.rocks) {
        if (!inView(r.x, r.y)) continue;
        emit(r.x - r.nx * r.r * 0.95, r.y - r.ny * r.r * 0.95, r.nx, r.ny, r.x, r.y, 1.1 * Math.min(1.4, Math.max(0.6, 1.7 - r.r * PX / 12)));
      }
    }
    this._stepDrops(dt, t, put, inView);
  }

  _stepDrops(dt, t, put, inView) {
    const G = this.G, s = this.s, rand = this.rand, cs = this._c, cv = this._v;
    let w = 0;
    for (let i = 0; i < this.nG; i++) {
      const o = i * GF;
      const kind = G[o + 8];
      G[o + 6] += dt;
      if (kind < 2) {
        const g = (kind === 1 ? 140 : 420) / PX, drag = Math.exp(-dt * (kind === 1 ? 1.6 : 0.4));
        G[o + 3] *= drag; G[o + 4] *= drag;
        G[o] += G[o + 3] * dt; G[o + 1] += G[o + 4] * dt;
        G[o + 5] -= g * dt; G[o + 2] += G[o + 5] * dt;
        if (G[o + 2] <= 0 && G[o + 5] < 0) {
          // Retombée : dans l'eau, l'embrun devient de l'écume qui repart vers le large.
          coastSample(this.f, G[o], G[o + 1], cs);
          if (kind === 0 && cs[0] < -0.8 / PX && rand() < 0.55 + 0.4 * s.spray) {
            const sp = (12 + 26 * rand()) / PX;
            G[o + 2] = 0; G[o + 3] = -cs[3] * sp + (rand() - 0.5) * 0.2; G[o + 4] = -cs[4] * sp + (rand() - 0.5) * 0.2;
            G[o + 6] = 0; G[o + 7] = 2.5 + rand() * 3.5; G[o + 8] = 2;
          } else continue;
        }
        if (G[o + 6] > G[o + 7]) continue;
      } else {
        // Écume du ressac : poussée vers le large, freinée, brassée par les remous.
        const damp = Math.exp(-dt * 0.55);
        G[o + 3] *= damp; G[o + 4] *= damp;
        let vx = G[o + 3], vy = G[o + 4];
        if (s.turbulence > 0) { curl(G[o] * PX, G[o + 1] * PX, t, s.turbulence * 14 / PX, cv); vx += cv[0]; vy += cv[1]; }
        G[o] += vx * dt; G[o + 1] += vy * dt;
        coastSample(this.f, G[o], G[o + 1], cs);
        if (cs[0] > -0.8 / PX) { G[o] -= cs[3] * 0.02; G[o + 1] -= cs[4] * 0.02; G[o + 3] = -cs[3] * 0.16; G[o + 4] = -cs[4] * 0.16; }
        if (G[o + 6] > G[o + 7]) continue;
      }
      if (w !== i) G.copyWithin(w * GF, o, o + GF);
      w++;
      const q = w - 1, p = q * GF;
      const x0 = G[p], y0 = G[p + 1];
      if (!inView(x0, y0)) continue;
      const k2 = G[p + 8], rnd = G[p + 9], age = G[p + 6], life = G[p + 7], z = G[p + 2];
      // En montant, la gerbe grimpe le long de la paroi : vue du dessus, elle passe sur la falaise.
      let nx = 0, ny = 0;
      if (z > 0) { coastSample(this.f, x0, y0, cs); nx = cs[3]; ny = cs[4]; }
      const x = x0 + nx * z * 0.45, y = y0 + ny * z * 0.45;
      if (k2 === 1) {
        put(x, y, (4 + rnd * 7 + age * 6) / PX, 0, 0.13, 1, 0, 0);
      } else if (k2 === 0) {
        put(x, y, (0.8 + rnd * 1.5 + z * PX * 0.025) / PX, 0, 0.3 + Math.min(3, Math.floor(0.95 * Math.min(1, (life - age) / 0.4) * 4)) * 0.22, 1, 0, 0);
      } else {
        const al = Math.min(1, age / 0.3) * (1 - age / life) ** 0.9 * 0.85 * (0.5 + 0.5 * ((rnd * 7) % 1));
        if (al < 0.06) continue;
        put(x, y, (0.7 + ((rnd * 13) % 1) * 1.3) / PX, 0, 0.2 + Math.min(3, Math.floor(al * 4)) * 0.22, 1, 0, 0);
      }
    }
    this.nG = w;
  }
}

/* -------------------------------------------- */
/*  Carte graphique                             */
/* -------------------------------------------- */

/**
 * Fonctions de côte pour le programme de la surface de l'eau (mêmes formules qu'ici).
 * Attend uCoast, uMapSize, uTime, uWaves, uPeriod, uWaveDir, et les fonctions noise/fbm.
 */
export const COAST_GLSL = `
uniform sampler2D uCoast;
uniform float uWaves, uPeriod;
uniform vec2 uWaveDir;
float cPulse(float c) { return c < 0.3 ? 0.5 - 0.5 * cos(3.14159 * c / 0.3) : 0.5 + 0.5 * cos(3.14159 * (c - 0.3) / 0.7); }
float cAlongS(vec2 p) { return (p.x + 0.61 * p.y) * ${PX.toFixed(1)}; }
float cAlong(float s) { return 0.04 * sin(s / 97.0 + 1.3) + 0.02 * sin(s / 41.0 + 0.4); }
float cWaveF(float s, float t) { return 0.6 + 0.4 * sin(s / 133.0 + t * 0.37) * sin(t * 0.23 + s / 71.0); }
float cPhase(vec2 p, float t) { return fract((t - dot(p, uWaveDir) / ${WAVE_SPEED.toFixed(1)}) / uPeriod - cAlong(cAlongS(p))); }
float cRunPx(float s, float t) { return (12.0 + uWaves * 0.9 * 70.0) * (0.8 + 0.2 * sin(s / 133.0 + t * 0.37) * sin(t * 0.23 + s / 71.0)); }
float cExposure(vec2 n) { return (uWaveDir.x != 0.0 || uWaveDir.y != 0.0) ? pow(max(0.0, dot(n, uWaveDir)), 1.5) : 0.8; }
vec3 cCells(vec2 p) {
  vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)), o = vec2(hash(i + g), hash(i + g + 19.7));
    vec2 r = g + o * 0.85 - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = hash(i + g + 3.1); } else if (d < d2) d2 = d;
  }
  return vec3(sqrt(d1), sqrt(d2) - sqrt(d1), id);
}
/** Distance signée (cases, > 0 sur la terre), plage, falaise et direction de la terre. */
void coastAt(vec2 pos, out float d, out float sandW, out float rockW, out vec2 n) {
  vec2 uv = pos / uMapSize;
  vec4 c = texture2D(uCoast, uv);
  d = (c.r - 0.5) * 4.0;
  sandW = c.g; rockW = c.b;
  vec2 e = vec2(1.0 / ${8.0.toFixed(1)}) / uMapSize;
  float gx = texture2D(uCoast, uv + vec2(e.x, 0.0)).r - texture2D(uCoast, uv - vec2(e.x, 0.0)).r;
  float gy = texture2D(uCoast, uv + vec2(0.0, e.y)).r - texture2D(uCoast, uv - vec2(0.0, e.y)).r;
  vec2 g = vec2(gx, gy);
  n = dot(g, g) > 1e-8 ? normalize(g) : vec2(0.0, 1.0);
}`;

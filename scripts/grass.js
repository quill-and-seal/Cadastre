/**
 * Herbe en traits, vue de dessus. Rien ici ne dépend de Foundry ni de PIXI : l'aperçu de
 * l'éditeur, l'image exportée et le calque de la scène dessinent tous les mêmes brins avec
 * le même programme de carte graphique.
 *
 * L'herbe est une grille très serrée de brins (un trait chacun). Au repos, vu de dessus, un
 * brin ne montre qu'un bout court qui pointe au hasard ; sous le vent il se couche dans le sens
 * du vent (à un écart près, propre à chaque brin : ils se croisent et cachent le sol), plus
 * long et plus clair. Les vagues de vent font passer des bandes de brins couchés sur le champ.
 *
 * Unités : les positions sont en cases. Les longueurs réglées par l'utilisateur (espacement,
 * longueur des brins) sont en pixels pour une case de 100 px, comme dans le prototype.
 */
import { mulberry32 } from "./catalog.js";

/** Pixels par case auxquels les réglages « en px » sont donnés. */
export const REF_PPC = 100;
/** Taille des morceaux de champ, en cases : chacun est dessiné ou ignoré selon la vue. */
export const CHUNK = 8;
/** Au-delà, la grille est desserrée : une très grande carte reste dessinable. */
export const MAX_BLADES = 2_500_000;
/** Écart minimal entre deux brins à l'écran, en pixels : en dessous on en dessine moins, plus larges. */
export const MIN_SCREEN_GAP = 2.2;
/** Nombre de jetons (et de traces de jetons) qui écartent l'herbe. */
export const MAX_PUSHERS = 16;

export const WAVES = ["swell", "gusts", "mix"];

/** Contour d'un brin : 4 sommets (x : 0 pied → 1 pointe, y : côté -1 / 1). */
export const BLADE_CORNERS = new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]);

/** Couleur du sol entre les brins. */
export const GROUND = "#264519";

/* -------------------------------------------- */
/*  Pieds des brins                             */
/* -------------------------------------------- */

function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Arêtes des anneaux, rangées par ligne de la grille qu'elles traversent. */
function rowEdges(rings, gap, rows) {
  const byRow = Array.from({ length: rows }, () => []);
  for (const r of rings) {
    const n = r.length / 2;
    if (n < 3) continue;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x0 = r[i * 2], y0 = r[i * 2 + 1], x1 = r[j * 2], y1 = r[j * 2 + 1];
      if (y0 === y1) continue;
      const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
      const r0 = Math.max(0, Math.ceil(ya / gap - 0.5)), r1 = Math.min(rows - 1, Math.ceil(yb / gap - 0.5) - 1);
      for (let row = r0; row <= r1; row++) byRow[row].push(x0, y0, x1, y1);
    }
  }
  return byRow;
}

/**
 * Pieds des brins dans la zone d'herbe, rangés par morceaux de CHUNK cases. Dans chaque morceau
 * les brins sont mélangés : en dessiner les N premiers donne un semis régulier moins dense
 * (vue éloignée, ordinateur peu puissant).
 * @param {number[][]} zone  anneaux de la zone d'herbe (cases)
 * @param {object} wind      réglages normalisés (normalizeWind)
 * @returns {{gap:number, count:number, chunks:{x0:number,y0:number,x1:number,y1:number,roots:Float32Array,count:number}[]}}
 */
export function bladeField(zone, wind, { seed = 7, maxBlades = MAX_BLADES } = {}) {
  let gap = wind.gap / REF_PPC;
  const empty = { gap, count: 0, chunks: [] };
  if (!zone?.length) return empty;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, area = 0;
  for (const r of zone) {
    for (let k = 0; k + 1 < r.length; k += 2) {
      x0 = Math.min(x0, r[k]); x1 = Math.max(x1, r[k]); y0 = Math.min(y0, r[k + 1]); y1 = Math.max(y1, r[k + 1]);
    }
    let a = 0;
    for (let k = 0; k < r.length; k += 2) {
      const j = (k + 2) % r.length;
      a += r[k] * r[j + 1] - r[j] * r[k + 1];
    }
    area += a / 2;
  }
  if (!Number.isFinite(x0)) return empty;
  const estimate = Math.abs(area) / (gap * gap);
  if (estimate > maxBlades) gap *= Math.sqrt(estimate / maxBlades);

  const rows = Math.ceil(y1 / gap) + 1;
  const edges = rowEdges(zone, gap, rows);
  const jit = wind.jitter;
  const buckets = new Map();
  let count = 0;
  for (let row = Math.max(0, Math.floor(y0 / gap)); row < rows; row++) {
    const list = edges[row];
    if (!list.length) continue;
    const yc = (row + 0.5) * gap;
    const xs = [];
    for (let e = 0; e < list.length; e += 4) {
      const ax = list[e], ay = list[e + 1], bx = list[e + 2], by = list[e + 3];
      xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let s = 0; s + 1 < xs.length; s += 2) {
      for (let col = Math.ceil(xs[s] / gap - 0.5); (col + 0.5) * gap < xs[s + 1]; col++) {
        const x = (col + 0.5 + (hash2(col, row) - 0.5) * jit) * gap;
        const y = (row + 0.5 + (hash2(col + 9001, row) - 0.5) * jit) * gap;
        const key = Math.floor(x / CHUNK) * 65536 + Math.floor(y / CHUNK);
        let b = buckets.get(key);
        if (!b) buckets.set(key, (b = []));
        b.push(x, y);
        count++;
      }
    }
  }
  const rand = mulberry32(seed);
  const chunks = [];
  for (const [key, pts] of buckets) {
    const cx = Math.floor(key / 65536) * CHUNK, cy = (key % 65536) * CHUNK;
    const roots = new Float32Array(pts);
    // Mélange : les N premiers brins d'un morceau couvrent tout le morceau.
    for (let i = roots.length / 2 - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const ax = roots[i * 2], ay = roots[i * 2 + 1];
      roots[i * 2] = roots[j * 2]; roots[i * 2 + 1] = roots[j * 2 + 1];
      roots[j * 2] = ax; roots[j * 2 + 1] = ay;
    }
    // Les pointes débordent du morceau : marge d'une longueur de brin pour le tri à l'écran.
    const m = (wind.length / REF_PPC) * 1.3;
    chunks.push({ x0: cx - m, y0: cy - m, x1: cx + CHUNK + m, y1: cy + CHUNK + m, roots, count: roots.length / 2 });
  }
  chunks.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  return { gap, count, chunks };
}

/* -------------------------------------------- */
/*  Densité à l'écran                           */
/* -------------------------------------------- */

/**
 * Part des brins à dessiner et largeur compensée, selon la taille d'une case à l'écran :
 * vus de loin, les brins seraient plus serrés que les pixels, on en dessine moins, plus larges.
 * @param {number} gap        espacement des brins, en cases
 * @param {number} screenPPC  pixels d'écran par case
 * @param {number} [cap=1]    part maximale (réglage « léger »)
 */
export function lod(gap, screenPPC, cap = 1) {
  const screenGap = gap * screenPPC;
  const fraction = Math.max(0.02, Math.min(cap, (screenGap / MIN_SCREEN_GAP) ** 2));
  return { fraction, widthScale: 1 / Math.sqrt(fraction) };
}

/** Morceaux visibles dans un rectangle (cases). */
export function visibleChunks(field, x0, y0, x1, y1) {
  return field.chunks.filter((c) => c.x1 >= x0 && c.x0 <= x1 && c.y1 >= y0 && c.y0 <= y1);
}

/* -------------------------------------------- */
/*  Programme de carte graphique                */
/* -------------------------------------------- */

/**
 * Uniformes du programme pour un vent donné (hors temps, matrices et poussées).
 * @param {object} wind       réglages normalisés
 * @param {number} gap        espacement réel des brins, en cases (bladeField().gap)
 * @param {number} widthScale compensation de largeur (lod())
 */
export function windUniforms(wind, gap, widthScale = 1) {
  const a = (wind.dir * Math.PI) / 180;
  return {
    uWind: new Float32Array([Math.cos(a), Math.sin(a)]),
    uStrength: wind.strength,
    uSpeed: wind.speed,
    uLength: (wind.length / REF_PPC) * Math.max(1, gap / (wind.gap / REF_PPC)) ** 0.5,
    uWidth: gap * 0.4 * widthScale,
    uSpread: (wind.angle * Math.PI) / 180,
    uMode: WAVES.indexOf(wind.waves)
  };
}

/** Programme des sommets (GLSL ES 1.0 : WebGL 1 et 2, PIXI 7 et 8). Les positions sont en cases. */
export const GRASS_VERT = `
precision highp float;
attribute vec2 aVertexPosition;
attribute vec2 aRoot;
uniform mat3 projectionMatrix;
uniform mat3 translationMatrix;
uniform float uTime, uStrength, uSpeed, uLength, uWidth, uSpread;
uniform vec2 uWind;
uniform int uMode;
uniform vec4 uPush[${MAX_PUSHERS}];
varying vec3 vColor;

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec2 root = aRoot;
  vec2 id = root * 97.0;
  float h1 = hash12(id), h2 = hash12(id + 17.3), h3 = hash12(id + 41.7), h4 = hash12(id + 73.1);
  float phase = h2 * 6.2832;
  // Vagues : houle régulière, rafales qui avancent, ou les deux.
  float u = dot(root, uWind), v = dot(root, vec2(-uWind.y, uWind.x));
  float swell = 0.5 + 0.5 * sin(u / 0.38 - uTime * 2.2 * uSpeed + sin(v / 0.9 + uTime * 0.3) * 1.2);
  float gust = clamp(noise(vec2((u - uTime * 0.9 * uSpeed) / 1.2, v / 1.6)) * 1.7 - 0.45, 0.0, 1.0);
  float g = uMode == 0 ? swell : (uMode == 1 ? gust : swell * 0.45 + gust * 0.75);
  float bend = uStrength * (0.25 + 0.75 * g) + sin(uTime * 6.0 + phase) * 0.08 * uStrength;
  float L = uLength * (0.7 + 0.6 * h4);
  // Chaque brin s'écarte un peu du sens du vent : ils se croisent et cachent le sol.
  float dev = (h1 - 0.5) * 2.0 * uSpread + sin(uTime * 1.7 + phase) * 0.06;
  vec2 wd = vec2(uWind.x * cos(dev) - uWind.y * sin(dev), uWind.x * sin(dev) + uWind.y * cos(dev));
  float ra = h3 * 6.2832;
  vec2 b = vec2(cos(ra), sin(ra)) * L * 0.45 * (1.0 - bend) + wd * L * bend;
  // Jetons : l'herbe se couche en éventail autour d'eux.
  for (int i = 0; i < ${MAX_PUSHERS}; i++) {
    vec4 p = uPush[i];
    if (p.w <= 0.0) continue;
    vec2 m = root - p.xy;
    float d = length(m);
    if (d < p.z) {
      float f = (1.0 - d / p.z) * p.w;
      b = mix(b, m / max(d, 0.0001) * L * 1.1, f);
      bend = max(bend, f);
    }
  }
  vec2 dir = length(b) > 1e-5 ? normalize(b) : vec2(1.0, 0.0);
  vec2 n = vec2(-dir.y, dir.x);
  vec2 p = root + b * aVertexPosition.x + n * aVertexPosition.y * uWidth * 0.5 * (1.0 - aVertexPosition.x * 0.6);
  gl_Position = vec4((projectionMatrix * translationMatrix * vec3(p, 1.0)).xy, 0.0, 1.0);
  // Teinte : nappes à grande échelle, plus clair quand le brin est couché.
  float patch = noise(root / 1.4) * 0.6 + noise(root / 0.45) * 0.4;
  float tone = clamp(patch * 5.0 + (h1 - 0.5) * 2.5, 0.0, 5.0);
  float k = clamp((tone + bend * 4.0) / 9.0, 0.0, 1.0);
  vec3 dark = vec3(0.165, 0.302, 0.110), mid = vec3(0.384, 0.573, 0.204), light = vec3(0.690, 0.776, 0.380);
  vColor = (k < 0.5 ? mix(dark, mid, k * 2.0) : mix(mid, light, k * 2.0 - 1.0)) * mix(0.8, 1.0, aVertexPosition.x);
}`;

export const GRASS_FRAG = `
precision mediump float;
varying vec3 vColor;
uniform float uAlpha;
void main() { gl_FragColor = vec4(vColor * uAlpha, uAlpha); }`;

/**
 * Jetons et traces de jetons qui écartent l'herbe, en un tableau d'uniformes (x, y, rayon, force).
 * @param {{x:number,y:number,r:number,s?:number}[]} list
 */
export function packPushers(list, out = new Float32Array(MAX_PUSHERS * 4)) {
  out.fill(0);
  for (let i = 0; i < Math.min(MAX_PUSHERS, list.length); i++) {
    const p = list[i];
    out.set([p.x, p.y, p.r, p.s ?? 1], i * 4);
  }
  return out;
}

/**
 * Suivi des jetons : sous un jeton l'herbe est couchée ; quand il s'éloigne, une trace reste
 * derrière lui et l'herbe s'y redresse doucement.
 */
export class PushTrail {
  constructor() { this.last = new Map(); this.trail = []; }

  /**
   * @param {{id:string,x:number,y:number,r:number}[]} movers  positions actuelles (cases)
   * @param {number} dt  secondes écoulées
   */
  update(movers, dt) {
    const decay = dt * 1.4;
    this.trail = this.trail.map((t) => ({ ...t, s: t.s - decay })).filter((t) => t.s > 0);
    const seen = new Set();
    for (const m of movers) {
      seen.add(m.id);
      const prev = this.last.get(m.id);
      if (prev && Math.hypot(prev.x - m.x, prev.y - m.y) > m.r * 0.35) {
        this.trail.unshift({ x: prev.x, y: prev.y, r: prev.r, s: 1 });
        this.last.set(m.id, m);
      } else if (!prev) this.last.set(m.id, m);
    }
    for (const id of this.last.keys()) if (!seen.has(id)) this.last.delete(id);
    this.trail.length = Math.min(this.trail.length, MAX_PUSHERS);
    return [...movers.map((m) => ({ ...m, s: 1 })), ...this.trail].slice(0, MAX_PUSHERS);
  }
}

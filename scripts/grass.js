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
 * Pour la carte graphique, chaque brin tient en 8 octets : sa position dans son morceau de champ
 * (2 × 16 bits) et ce qui ne change jamais, calculé une fois pour toutes (écart au vent, angle
 * au repos, longueur, teinte : 4 × 8 bits). Le vent, lisse à l'échelle d'une case, est calculé
 * une fois par image sur une petite grille (gustGrid) que chaque brin lit.
 *
 * Unités : les positions sont en cases. Les longueurs réglées par l'utilisateur (espacement,
 * longueur des brins) sont en pixels pour une case de 100 px, comme dans le prototype.
 */

/** Pixels par case auxquels les réglages « en px » sont donnés. */
export const REF_PPC = 100;
/** Taille des morceaux de champ, en cases : chacun est dessiné ou ignoré selon la vue. */
export const CHUNK = 8;
/** Au-delà, la grille est desserrée : une très grande carte reste dessinable. */
export const MAX_BLADES = 2_500_000;
/** Écart minimal entre deux brins à l'écran, en pixels : en dessous on en dessine moins, plus larges. */
export const MIN_SCREEN_GAP = 2.5;
/** Nombre de jetons (et de traces de jetons) qui écartent l'herbe. */
export const MAX_PUSHERS = 16;
/** Octets par brin. */
export const BLADE_BYTES = 8;
/** Points de la grille du vent par case, et taille maximale de cette grille. */
export const GUST_RES = 4;
export const GUST_MAX = 256;

/**
 * Horloge du vent, commune à l'herbe et aux arbres : une rafale qui couche l'herbe passe dans
 * les arbres au même moment. En secondes, ramenée dans une plage où les cartes graphiques
 * gardent assez de précision.
 */
export const windClock = () => (performance.now() / 1000) % 3600;

export const WAVES = ["swell", "gusts", "mix"];

/** Contour d'un brin : un triangle (x : 0 pied → 1 pointe, y : côté -1 / 1). */
export const BLADE_CORNERS = new Float32Array([0, -1, 0, 1, 1, 0]);

/** Couleur du sol entre les brins. */
export const GROUND = "#264519";

/* -------------------------------------------- */
/*  Hasard et bruit                             */
/* -------------------------------------------- */

function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Bruit de valeur lissé. */
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Rang d'un brin dans son morceau, tiré de ses octets fixes (le programme de carte graphique
 * fait le même calcul) : les brins sont rangés par rang, si bien que les N premiers forment un
 * semis régulier et que la carte graphique sait lesquels faire apparaître en fondu.
 */
export function bladeRank(dev, angle, len) {
  const v = (dev / 255) * 17.31 + (angle / 255) * 31.73 + (len / 255) * 7.17;
  return v - Math.floor(v);
}

/* -------------------------------------------- */
/*  Pieds des brins                             */
/* -------------------------------------------- */

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

function zoneBounds(zone) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, area = 0;
  for (const r of zone) {
    let a = 0;
    for (let k = 0; k + 1 < r.length; k += 2) {
      x0 = Math.min(x0, r[k]); x1 = Math.max(x1, r[k]); y0 = Math.min(y0, r[k + 1]); y1 = Math.max(y1, r[k + 1]);
      const j = (k + 2) % r.length;
      a += r[k] * r[j + 1] - r[j] * r[k + 1];
    }
    area += a / 2;
  }
  return { x0, y0, x1, y1, area: Math.abs(area) };
}

/**
 * Empreinte de la zone dans chaque morceau : si elle n'a pas changé, le morceau non plus
 * (l'éditeur ne recalcule que les morceaux touchés par une retouche).
 */
function chunkKeys(zone, wind, gap) {
  const keys = new Map();
  const base = `${gap}|${wind.jitter}|${wind.length}`;
  for (const r of zone) {
    const n = r.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = r[i * 2], ay = r[i * 2 + 1], bx = r[j * 2], by = r[j * 2 + 1];
      const cx0 = Math.floor(Math.min(ax, bx) / CHUNK), cx1 = Math.floor(Math.max(ax, bx) / CHUNK);
      const cy0 = Math.floor(Math.min(ay, by) / CHUNK), cy1 = Math.floor(Math.max(ay, by) / CHUNK);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const k = cx * 65536 + cy;
        // Empreinte FNV des arêtes qui touchent le morceau, dans l'ordre.
        let h = keys.get(k) ?? 2166136261;
        for (const v of [ax, ay, bx, by]) { h ^= Math.round(v * 1000) | 0; h = Math.imul(h, 16777619); }
        keys.set(k, h);
      }
    }
  }
  const out = new Map();
  for (const [k, h] of keys) out.set(k, `${base}|${h >>> 0}`);
  return out;
}

/**
 * Pieds des brins dans la zone d'herbe, rangés par morceaux de CHUNK cases.
 * @param {number[][]} zone  anneaux de la zone d'herbe (cases)
 * @param {object} wind      réglages normalisés (normalizeWind)
 * @param {{seed?:number, maxBlades?:number, previous?:Map<string,object>}} [options]
 *   previous : morceaux d'un calcul précédent, par empreinte ; ceux qui n'ont pas changé sont repris tels quels
 * @returns {{gap:number, count:number, chunks:{cx:number,cy:number,x0:number,y0:number,x1:number,y1:number,data:Uint8Array,count:number,key:string,reused?:boolean}[]}}
 */
export function bladeField(zone, wind, { maxBlades = MAX_BLADES, previous = null } = {}) {
  let gap = wind.gap / REF_PPC;
  const empty = { gap, count: 0, chunks: [], bounds: { x0: 0, y0: 0, x1: 0, y1: 0 } };
  if (!zone?.length) return empty;
  const b = zoneBounds(zone);
  if (!Number.isFinite(b.x0)) return empty;
  const estimate = b.area / (gap * gap);
  if (estimate > maxBlades) gap *= Math.sqrt(estimate / maxBlades);

  const keys = chunkKeys(zone, wind, gap);
  // Les morceaux entièrement dans la zone n'ont pas d'arête : leur empreinte est celle de leur
  // voisinage complet, calculée plus bas une fois leurs brins connus.
  const rows = Math.ceil(b.y1 / gap) + 1;
  const edges = rowEdges(zone, gap, rows);
  const jit = wind.jitter;
  const buckets = new Map();
  for (let row = Math.max(0, Math.floor(b.y0 / gap)); row < rows; row++) {
    const list = edges[row];
    if (!list.length) continue;
    const yc = (row + 0.5) * gap;
    const xs = [];
    for (let e = 0; e < list.length; e += 4) {
      const ax = list[e], ay = list[e + 1], bx = list[e + 2], by = list[e + 3];
      xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((p, q) => p - q);
    for (let s = 0; s + 1 < xs.length; s += 2) {
      for (let col = Math.ceil(xs[s] / gap - 0.5); (col + 0.5) * gap < xs[s + 1]; col++) {
        const x = (col + 0.5 + (hash2(col, row) - 0.5) * jit) * gap;
        const y = (row + 0.5 + (hash2(col + 9001, row) - 0.5) * jit) * gap;
        const k = Math.floor(x / CHUNK) * 65536 + Math.floor(y / CHUNK);
        let bucket = buckets.get(k);
        if (!bucket) buckets.set(k, (bucket = { key: null, pts: [] }));
        bucket.pts.push(x, y, col, row);
      }
    }
  }

  const margin = (wind.length / REF_PPC) * 1.3;
  const chunks = [];
  let count = 0;
  for (const [k, bucket] of buckets) {
    const cx = Math.floor(k / 65536) * CHUNK, cy = (k % 65536) * CHUNK;
    const n = bucket.pts.length / 4;
    // Un morceau sans arête est plein : son empreinte est le nombre de brins (et les réglages).
    const key = `${cx},${cy}|` + (keys.get(k) ?? `${gap}|${wind.jitter}|${wind.length}|plein|${n}`);
    const old = previous?.get(key);
    const reused = !!old && old.cx === cx && old.cy === cy;
    // Repris : mêmes octets que la dernière fois (le calcul en arrière-plan renvoie alors null,
    // l'éditeur garde les siens).
    const data = reused ? old.data : encodeChunk(bucket.pts, cx, cy);
    chunks.push({ cx, cy, x0: cx - margin, y0: cy - margin, x1: cx + CHUNK + margin, y1: cy + CHUNK + margin, data, count: n, key, reused });
    count += n;
  }
  chunks.sort((p, q) => p.cy - q.cy || p.cx - q.cx);
  // Emprise de l'herbe (pointes comprises) : le vent n'est calculé que là.
  const bounds = { x0: b.x0 - margin, y0: b.y0 - margin, x1: b.x1 + margin, y1: b.y1 + margin };
  return { gap, count, chunks, bounds };
}

/**
 * Brins d'un morceau en octets : position relative (16 bits), écart au vent, angle au repos,
 * longueur, teinte (8 bits chacun), rangés par rang.
 */
function encodeChunk(pts, cx, cy) {
  const n = pts.length / 4;
  const items = new Array(n);
  for (let i = 0; i < n; i++) {
    const x = pts[i * 4], y = pts[i * 4 + 1], col = pts[i * 4 + 2], row = pts[i * 4 + 3];
    const dev = Math.floor(hash2(col + 17, row + 3) * 256) & 255;
    const angle = Math.floor(hash2(col + 41, row + 7) * 256) & 255;
    const len = Math.floor(hash2(col + 73, row + 11) * 256) & 255;
    // Teinte : nappes à grande échelle et variation propre au brin.
    const patch = noise2(x / 1.4, y / 1.4) * 0.6 + noise2(x / 0.45 + 31, y / 0.45 + 17) * 0.4;
    const tone = Math.max(0, Math.min(5, patch * 5 + (dev / 255 - 0.5) * 2.5));
    items[i] = { x, y, dev, angle, len, tone: Math.round((tone / 5) * 255), rank: bladeRank(dev, angle, len) };
  }
  items.sort((a, b) => a.rank - b.rank);
  const data = new Uint8Array(n * BLADE_BYTES);
  const view = new DataView(data.buffer);
  for (let i = 0; i < n; i++) {
    const it = items[i], o = i * BLADE_BYTES;
    view.setUint16(o, Math.round(Math.min(1, Math.max(0, (it.x - cx) / CHUNK)) * 65535), true);
    view.setUint16(o + 2, Math.round(Math.min(1, Math.max(0, (it.y - cy) / CHUNK)) * 65535), true);
    data[o + 4] = it.dev; data[o + 5] = it.angle; data[o + 6] = it.len; data[o + 7] = it.tone;
  }
  return data;
}

/** Position d'un brin (lecture d'un morceau, pour les tests). */
export function bladeAt(chunk, i) {
  const view = new DataView(chunk.data.buffer, chunk.data.byteOffset, chunk.data.byteLength);
  return [chunk.cx + (view.getUint16(i * BLADE_BYTES, true) / 65535) * CHUNK, chunk.cy + (view.getUint16(i * BLADE_BYTES + 2, true) / 65535) * CHUNK];
}

/* -------------------------------------------- */
/*  Densité à l'écran                           */
/* -------------------------------------------- */

/**
 * Part des brins à dessiner et largeur compensée, selon la taille d'une case à l'écran :
 * vus de loin, les brins seraient plus serrés que les pixels, on en dessine moins, plus larges.
 * Entre fadeLo et fadeHi (rangs), les brins apparaissent et disparaissent en fondu : pas de saut
 * quand on zoome.
 * @param {number} gap        espacement des brins, en cases
 * @param {number} screenPPC  pixels d'écran par case
 * @param {number} [cap=1]    part maximale (réglage « léger »)
 */
export function lod(gap, screenPPC, cap = 1) {
  const screenGap = gap * screenPPC;
  const fraction = Math.max(0.02, Math.min(cap, (screenGap / MIN_SCREEN_GAP) ** 2));
  if (fraction >= 1) return { fraction: 1, widthScale: 1, fadeLo: 1.01, fadeHi: 1.02 };
  return { fraction, widthScale: 1 / Math.sqrt(fraction), fadeLo: fraction * 0.7, fadeHi: Math.min(1, fraction * 1.3) };
}

/** Nombre de brins d'un morceau à envoyer à la carte graphique (les suivants sont invisibles). */
export const drawCount = (chunk, l) => Math.max(1, Math.min(chunk.count, Math.ceil(chunk.count * Math.min(1, l.fadeHi))));

/** Rectangle où calculer le vent : la vue, limitée à l'emprise de l'herbe. */
export function gustRect(field, x0, y0, x1, y1, margin) {
  const b = field.bounds;
  return [Math.max(x0 - margin, b.x0), Math.max(y0 - margin, b.y0), Math.min(x1 + margin, b.x1), Math.min(y1 + margin, b.y1)];
}

/** Morceaux visibles dans un rectangle (cases). */
export function visibleChunks(field, x0, y0, x1, y1) {
  return field.chunks.filter((c) => c.x1 >= x0 && c.x0 <= x1 && c.y1 >= y0 && c.y0 <= y1);
}

/** Nombre de poussées qui touchent un morceau (0 : le programme n'en teste aucune). */
export function pushersFor(chunk, pushers) {
  for (const p of pushers) {
    if (p.x + p.r >= chunk.x0 && p.x - p.r <= chunk.x1 && p.y + p.r >= chunk.y0 && p.y - p.r <= chunk.y1) return pushers.length;
  }
  return 0;
}

/* -------------------------------------------- */
/*  Vent                                        */
/* -------------------------------------------- */

/** Force du vent (0..1) en un point : houle, rafales ou les deux. */
export function gustAt(x, y, t, wind) {
  const a = (wind.dir * Math.PI) / 180, wx = Math.cos(a), wy = Math.sin(a);
  const u = x * wx + y * wy, v = -x * wy + y * wx, sp = wind.speed;
  const swell = 0.5 + 0.5 * Math.sin(u / 0.38 - t * 2.2 * sp + Math.sin(v / 0.9 + t * 0.3) * 1.2);
  const gust = Math.min(1, Math.max(0, noise2((u - t * 0.9 * sp) / 1.2, v / 1.6) * 1.7 - 0.45));
  if (wind.waves === "swell") return swell;
  if (wind.waves === "gusts") return gust;
  return swell * 0.45 + gust * 0.75;
}

/**
 * Grille du vent sur un rectangle (cases), une fois par image : chaque brin y lit la force du
 * vent au lieu de la recalculer. GUST_RES points par case au mieux ; la grille est rangée dans
 * une image fixe de GUST_MAX × GUST_MAX dont seul le coin utile est rempli.
 * @returns {{data:Uint8Array, w:number, h:number, rect:Float32Array}}  rect : origine et taille couvertes par l'image entière
 */
export function gustGrid(x0, y0, x1, y1, t, wind, out = null) {
  const step = Math.max(1 / GUST_RES, (x1 - x0) / (GUST_MAX - 2), (y1 - y0) / (GUST_MAX - 2));
  const w = Math.min(GUST_MAX, Math.ceil((x1 - x0) / step) + 2), h = Math.min(GUST_MAX, Math.ceil((y1 - y0) / step) + 2);
  const data = out?.data ?? new Uint8Array(GUST_MAX * GUST_MAX);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) data[j * GUST_MAX + i] = Math.round(gustAt(x0 + i * step, y0 + j * step, t, wind) * 255);
  }
  // Les points sont aux centres des texels.
  const rect = out?.rect ?? new Float32Array(4);
  rect[0] = x0 - step / 2; rect[1] = y0 - step / 2; rect[2] = GUST_MAX * step; rect[3] = GUST_MAX * step;
  return { data, w, h, rect };
}

/* -------------------------------------------- */
/*  Programme de carte graphique                */
/* -------------------------------------------- */

/**
 * Uniformes du programme pour un vent donné (hors temps, matrices, grille du vent et poussées).
 * @param {object} wind       réglages normalisés
 * @param {number} gap        espacement réel des brins, en cases (bladeField().gap)
 * @param {object} [l]        lod()
 */
export function windUniforms(wind, gap, l = lod(gap, 1e9)) {
  const a = (wind.dir * Math.PI) / 180;
  return {
    uWind: new Float32Array([Math.cos(a), Math.sin(a)]),
    uStrength: wind.strength,
    uSpeed: wind.speed,
    uLength: (wind.length / REF_PPC) * Math.max(1, gap / (wind.gap / REF_PPC)) ** 0.5,
    uWidth: gap * 0.4 * l.widthScale,
    uSpread: (wind.angle * Math.PI) / 180,
    uMode: WAVES.indexOf(wind.waves),
    uFade: new Float32Array([l.fadeLo, l.fadeHi])
  };
}

/**
 * Programme des sommets (GLSL ES 1.0 : WebGL 1 et 2, PIXI 7 et 8). Positions en cases.
 * @param {boolean} gustTexture  lire le vent dans la grille (sinon le calculer brin par brin,
 *   pour les rares cartes graphiques qui ne lisent pas d'image dans ce programme)
 */
export function grassVert(gustTexture = true) {
  return `${gustTexture ? "#define GUST_TEXTURE\n" : ""}precision highp float;
attribute vec2 aVertexPosition;
attribute vec2 aPos;
attribute vec4 aStat;
uniform mat3 projectionMatrix;
uniform mat3 translationMatrix;
uniform vec2 uOrigin;
uniform float uTime, uStrength, uSpeed, uLength, uWidth, uSpread;
uniform vec2 uWind, uFade;
uniform int uMode;
uniform vec4 uPush[${MAX_PUSHERS}];
uniform int uPushN;
#ifdef GUST_TEXTURE
uniform sampler2D uGust;
uniform vec4 uGustRect;
#endif
varying vec3 vColor;
varying float vAlpha;

#ifndef GUST_TEXTURE
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
#endif

void main() {
  // Brins au-delà du fondu : hors de l'écran, rien à dessiner.
  float rank = fract(dot(aStat.xyz, vec3(17.31, 31.73, 7.17)));
  vAlpha = 1.0 - smoothstep(uFade.x, uFade.y, rank);
  if (vAlpha <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vColor = vec3(0.0); return; }
  vec2 root = uOrigin + aPos * ${CHUNK.toFixed(1)};
  float phase = fract(dot(aStat.xyz, vec3(5.13, 11.71, 3.37))) * 6.2832;
#ifdef GUST_TEXTURE
  float g = texture2D(uGust, (root - uGustRect.xy) / uGustRect.zw).r;
#else
  float u = dot(root, uWind), v = dot(root, vec2(-uWind.y, uWind.x));
  float swell = 0.5 + 0.5 * sin(u / 0.38 - uTime * 2.2 * uSpeed + sin(v / 0.9 + uTime * 0.3) * 1.2);
  float gust = clamp(noise(vec2((u - uTime * 0.9 * uSpeed) / 1.2, v / 1.6)) * 1.7 - 0.45, 0.0, 1.0);
  float g = uMode == 0 ? swell : (uMode == 1 ? gust : swell * 0.45 + gust * 0.75);
#endif
  float bend = uStrength * (0.25 + 0.75 * g) + sin(uTime * 6.0 + phase) * 0.08 * uStrength;
  float L = uLength * (0.7 + 0.6 * aStat.z);
  // Chaque brin s'écarte un peu du sens du vent : ils se croisent et cachent le sol.
  float dev = (aStat.x - 0.5) * 2.0 * uSpread + sin(uTime * 1.7 + phase) * 0.06;
  float cd = cos(dev), sd = sin(dev);
  vec2 wd = vec2(uWind.x * cd - uWind.y * sd, uWind.x * sd + uWind.y * cd);
  float ra = aStat.y * 6.2832;
  vec2 b = vec2(cos(ra), sin(ra)) * L * 0.45 * (1.0 - bend) + wd * L * bend;
  // Jetons : l'herbe se couche en éventail autour d'eux (seulement dans les morceaux qu'ils touchent).
  for (int i = 0; i < ${MAX_PUSHERS}; i++) {
    if (i >= uPushN) break;
    vec4 p = uPush[i];
    if (p.w <= 0.0) continue;
    vec2 m = root - p.xy;
    float d = length(m);
    if (d < p.z) {
      float f = (1.0 - d / p.z) * p.w;
      // Un léger écart propre à chaque brin : pas de lignes droites dans la grille régulière.
      vec2 rd = m / max(d, 0.0001);
      float ja = (aStat.x - 0.5) * 0.6, cj = cos(ja), sj = sin(ja);
      b = mix(b, vec2(rd.x * cj - rd.y * sj, rd.x * sj + rd.y * cj) * L * 1.1, f);
      bend = max(bend, f);
    }
  }
  vec2 dir = length(b) > 1e-5 ? normalize(b) : vec2(1.0, 0.0);
  vec2 n = vec2(-dir.y, dir.x);
  vec2 p = root + b * aVertexPosition.x + n * aVertexPosition.y * uWidth * 0.5;
  gl_Position = vec4((projectionMatrix * translationMatrix * vec3(p, 1.0)).xy, 0.0, 1.0);
  // Teinte : nappes à grande échelle (précalculées), plus clair quand le brin est couché.
  float k = clamp((aStat.w * 5.0 + bend * 4.0) / 9.0, 0.0, 1.0);
  vec3 dark = vec3(0.165, 0.302, 0.110), mid = vec3(0.384, 0.573, 0.204), light = vec3(0.690, 0.776, 0.380);
  vColor = (k < 0.5 ? mix(dark, mid, k * 2.0) : mix(mid, light, k * 2.0 - 1.0)) * mix(0.8, 1.0, aVertexPosition.x);
}`;
}

export const GRASS_FRAG = `
precision mediump float;
varying vec3 vColor;
varying float vAlpha;
uniform float uAlpha;
void main() { float a = vAlpha * uAlpha; gl_FragColor = vec4(vColor * a, a); }`;

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

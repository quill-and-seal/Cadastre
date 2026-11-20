/**
 * Arbres générés : squelette en 3D (tronc, charpentières, branches, rameaux) puis feuilles à
 * leur taille et en quantité réelles, accrochées aux rameaux. Vu de dessus, la hauteur règle
 * l'ordre de dessin, la lumière, l'ombre portée et la souplesse au vent.
 *
 * Unités : cases (1 case = 1,5 m). z = hauteur. Rien ici ne dépend du navigateur ni de Foundry :
 * le dessin est dans tree-paint.js.
 */
import { mulberry32 } from "./catalog.js";

export const CASE_M = 1.5;
/** Au-delà, les feuilles sont trop nombreuses pour être dessinées en un temps raisonnable. */
export const MAX_LEAVES = 60000;

/**
 * Essences. form : « broad » (feuillu) ou « conifer ». lai : indice foliaire (m² de feuilles par
 * m² au sol sous la couronne, 3 à 6 en pleine feuille). leafM : longueur d'une feuille, en mètres.
 */
export const SPECIES = {
  oak: {
    form: "broad", depth: 5, fork: 2.6, spread: 0.62, lai: 4.5, leaf: "oak", leafM: 0.11, perTwig: 12,
    trunkH: 1.0, gnarl: 0.13, rise: 0.12, taper: 0.72, laterals: 2.5, rootL: 0.4, trunkW: 0.13,
    bark: ["#3a281a", "#6b4a2e"], leaves: { dark: "#1b4320", mid: "#337434", light: "#86c25a" }
  },
  birch: {
    form: "broad", depth: 6, fork: 2.2, spread: 0.45, lai: 3.5, leaf: "birch", leafM: 0.06, perTwig: 16,
    trunkH: 1.5, gnarl: 0.05, rise: 0.25, taper: 0.8, laterals: 3, rootL: 0.2, trunkW: 0.13, spreadK: 0.85,
    bark: ["#8d877c", "#e6e1d6"], leaves: { dark: "#2a5a22", mid: "#4a8a34", light: "#a4cf62" }, birchBark: true
  },
  bush: {
    form: "broad", depth: 4, fork: 2.8, spread: 0.95, lai: 4, leaf: "birch", leafM: 0.05, perTwig: 12,
    trunkH: 0.15, gnarl: 0.1, rise: 0.2, taper: 0.75, laterals: 2.5, rootL: 0, trunkW: 0.08,
    bark: ["#3b2a1d", "#634733"], leaves: { dark: "#1d4a22", mid: "#3a7d38", light: "#7fbb55" }
  },
  pine: {
    form: "conifer", depth: 3, fork: 2.4, spread: 0.5, lai: 1.2, leaf: "needle", leafM: 0.08,
    gnarl: 0, trunkW: 0.11,
    bark: ["#3b2618", "#7a5133"], leaves: { dark: "#123522", mid: "#1f5534", light: "#5c9a5a" }
  }
};

export const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const rotateAround = (dir, u, v, az, t) => {
  const side = [u[0] * Math.cos(az) + v[0] * Math.sin(az), u[1] * Math.cos(az) + v[1] * Math.sin(az), u[2] * Math.cos(az) + v[2] * Math.sin(az)];
  return [dir[0] * Math.cos(t) + side[0] * Math.sin(t), dir[1] * Math.cos(t) + side[1] * Math.sin(t), dir[2] * Math.cos(t) + side[2] * Math.sin(t)];
};
const basis = (dir) => {
  const any = Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = norm(cross(dir, any));
  return [u, cross(dir, u)];
};

/* -------------------------------------------- */
/*  Squelette                                   */
/* -------------------------------------------- */

/** Feuillu : tronc, contreforts, charpentières, fourches et branches latérales. */
function growBroadleaf(rand, sp) {
  const segs = [], tips = [];
  // Une branche n'est pas un bâton : plusieurs morceaux qui serpentent un peu, s'affinent
  // régulièrement et ploient sous leur poids quand elles sont longues et couchées.
  function branch(p, dir, len, w0, w1, d) {
    const N = d <= 2 ? 5 : d <= 3 ? 3 : 2;
    const [u, v] = basis(dir);
    let ou = 0, ov = 0, prev = p, last = dir;
    const pts = [p];
    const flat = 1 - Math.abs(dir[2]);
    for (let k = 1; k <= N; k++) {
      const t = k / N;
      ou += (rand() - 0.5) * sp.gnarl * len * 2 / N; ov += (rand() - 0.5) * sp.gnarl * len * 2 / N;
      const sag = -len * 0.06 * flat * t * t;
      const q = [p[0] + dir[0] * len * t + u[0] * ou + v[0] * ov, p[1] + dir[1] * len * t + u[1] * ou + v[1] * ov, p[2] + dir[2] * len * t + u[2] * ou + v[2] * ov + sag];
      segs.push({ a: prev, b: q, w: w0 + (w1 - w0) * (k - 1) / N, w2: w0 + (w1 - w0) * t, d });
      last = norm([q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]]);
      prev = q; pts.push(q);
    }
    return { pts, end: prev, dir: norm([dir[0] + last[0], dir[1] + last[1], dir[2] + last[2]]) };
  }
  const spreadK = sp.spreadK ?? 1;
  const lean = [(rand() - 0.5) * 0.15, (rand() - 0.5) * 0.15, 1];
  // Tronc (un peu évasé à la base) et contreforts des racines qui s'enfoncent dans le sol.
  const trunk = branch([0, 0, 0], norm(lean), sp.trunkH, 1, 0.82, 0);
  const top = trunk.end;
  if (sp.rootL > 0) {
    const nr = 4 + Math.floor(rand() * 3), ar = rand() * Math.PI * 2;
    for (let i = 0; i < nr; i++) {
      const a = ar + (i / nr) * Math.PI * 2 + (rand() - 0.5) * 0.7;
      const n0 = segs.length;
      branch([Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0.1], norm([Math.cos(a), Math.sin(a), -0.28]), sp.rootL * (0.7 + rand() * 0.6), 0.45, 0.28, 1);
      for (let k = n0; k < segs.length; k++) segs[k].root = true;
    }
  }
  function grow(p, dir, len, w, d) {
    const wEnd = w * sp.taper;
    const br = branch(p, dir, len, w, wEnd, d);
    const end = br.end; dir = br.dir;
    if (d >= sp.depth) { tips.push({ p: end, dir, d, len }); return; }
    const n = Math.max(2, Math.floor(sp.fork + rand()));
    const [u, v] = basis(dir);
    const az0 = rand() * Math.PI * 2;
    // Règle des tuyaux : la section de la branche mère se partage entre ses filles.
    const wc = wEnd * Math.pow(1 / n, 1 / 2.4);
    for (let i = 0; i < n; i++) {
      const az = az0 + (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.9;
      const t = sp.spread * (0.8 + rand() * 0.45) * spreadK;
      let nd = rotateAround(dir, u, v, az, t);
      // Vers la lumière, et en s'ouvrant vers l'extérieur.
      const out = norm([end[0], end[1], 0.0001]);
      nd = norm([nd[0] + out[0] * 0.25, nd[1] + out[1] * 0.25, nd[2] + sp.rise]);
      grow(end, nd, len * (0.68 + rand() * 0.2), wc * (0.88 + rand() * 0.24), d + 1);
    }
    // Branches latérales : un arbre ne se divise pas qu'au bout de ses branches, il en pousse
    // tout le long (plus courtes, plus fines).
    if (d + 2 <= sp.depth) {
      const nl = 1 + Math.floor(rand() * sp.laterals);
      for (let i = 0; i < nl; i++) {
        const sAt = 0.3 + 0.55 * ((i + rand() * 0.6) / nl);
        const k = sAt * (br.pts.length - 1), k0 = Math.floor(k), f = k - k0, A = br.pts[k0], B = br.pts[Math.min(k0 + 1, br.pts.length - 1)];
        const q = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f];
        let nd = rotateAround(dir, u, v, rand() * Math.PI * 2, sp.spread * (1.0 + rand() * 0.5));
        const out = norm([q[0], q[1], 0.0001]);
        nd = norm([nd[0] + out[0] * 0.3, nd[1] + out[1] * 0.3, nd[2] + sp.rise * 0.8]);
        grow(q, nd, len * (0.45 + rand() * 0.2), (w + (wEnd - w) * sAt) * 0.45 * (0.85 + rand() * 0.3), d + 2);
      }
    }
  }
  // Charpentières : 3 à 5 grosses branches tout autour du tronc, plus une flèche au centre.
  const n0 = 3 + Math.floor(rand() * 3), az0 = rand() * Math.PI * 2;
  const w0 = 0.82 * Math.pow(1 / (n0 + 0.5), 1 / 2.4);
  const limb = sp.trunkH > 1.2 ? 0.75 : 0.85;
  for (let i = 0; i < n0; i++) {
    const az = az0 + (i / n0) * Math.PI * 2 + (rand() - 0.5) * 0.6;
    const t = Math.min(1.3, sp.spread * (1.1 + rand() * 0.4));
    const nd = norm([Math.cos(az) * Math.sin(t) + lean[0], Math.sin(az) * Math.sin(t) + lean[1], Math.cos(t)]);
    grow(top, nd, limb * (0.85 + rand() * 0.3), w0 * (0.9 + rand() * 0.25), 1);
  }
  grow(top, norm([lean[0], lean[1], 1]), limb * 0.75, w0 * 0.75, 2);
  return { segs, tips };
}

/** Conifère : tronc jusqu'à la flèche, étages de branches, rameaux alternés sur trois niveaux. */
function growConifer(rand, sp) {
  const segs = [], tips = [];
  const H = 4.2;
  for (let k = 0; k < 6; k++) segs.push({ a: [0, 0, H * k / 6], b: [0, 0, H * (k + 1) / 6], w: 1 - k / 6 * 0.85, w2: 1 - (k + 1) / 6 * 0.85, d: 0 });
  function shoot(p, dir, L, w, level) {
    const end = [p[0] + dir[0] * L, p[1] + dir[1] * L, p[2] + dir[2] * L];
    segs.push({ a: p, b: end, w, w2: w * 0.45, d: level });
    tips.push({ p: end, dir, d: level + 1, len: L, base: p });
    if (level >= 3) return;
    const step = level === 1 ? 0.065 : 0.05;
    const m = Math.floor(L / step);
    const [u] = basis(dir);
    for (let j = 1; j <= m; j++) {
      const s = j / (m + 1);
      const q = [p[0] + (end[0] - p[0]) * s, p[1] + (end[1] - p[1]) * s, p[2] + (end[2] - p[2]) * s];
      const sg = j % 2 ? 1 : -1, ang = 0.75 + rand() * 0.35;
      const nd = norm([dir[0] * Math.cos(ang) + u[0] * sg * Math.sin(ang), dir[1] * Math.cos(ang) + u[1] * sg * Math.sin(ang), dir[2] * Math.cos(ang) + u[2] * sg * Math.sin(ang) - 0.12]);
      shoot(q, nd, (L * (1 - s) * (level === 1 ? 0.5 : 0.4) + 0.04) * (0.8 + rand() * 0.4), w * 0.35, level + 1);
    }
  }
  const whorls = 8 + sp.depth * 4, z0 = 0.6;
  for (let k = 0; k < whorls; k++) {
    const f = k / (whorls - 1), z = z0 + (H - z0) * f * 0.97;
    const Lmax = Math.pow(1 - f, 0.85) + 0.08;
    // Un verticille complet tous les deux étages, une ou deux branches isolées entre les deux.
    const n = k % 2 ? 1 + Math.floor(rand() * 2) : Math.max(5, Math.round(sp.fork * 2.5 + rand() * 2));
    const az0 = rand() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const az = az0 + (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.6;
      const dir = norm([Math.cos(az), Math.sin(az), -0.05 - sp.spread * 0.2 + f * 0.25]);
      shoot([0, 0, z], dir, Lmax * (0.72 + rand() * 0.38) * (k % 2 ? 0.8 : 1), 0.3 * (1 - f * 0.75), 1);
    }
  }
  tips.push({ p: [0, 0, H], dir: [0, 0, 1], d: 3, len: 0.15, base: [0, 0, H - 0.15] });
  return { segs, tips, pine: true };
}

/** Mise à l'échelle : la couronne a exactement le rayon voulu (en cases). */
function fit(tree, R) {
  let m = 0;
  for (const t of tree.tips) m = Math.max(m, Math.hypot(t.p[0], t.p[1]));
  for (const s of tree.segs) m = Math.max(m, Math.hypot(s.b[0], s.b[1]));
  const k = R / (m || 1);
  const seen = new Set();
  const sc = (p) => { if (p && !seen.has(p)) { seen.add(p); p[0] *= k; p[1] *= k; p[2] *= k; } };
  for (const s of tree.segs) { sc(s.a); sc(s.b); }
  for (const t of tree.tips) { sc(t.p); sc(t.base); if (t.len) t.len *= k; }
  tree.R = R;
  tree.zmax = tree.segs.reduce((z, s) => Math.max(z, s.b[2]), 0) || 1;
  return tree;
}

/* -------------------------------------------- */
/*  Feuillage                                   */
/* -------------------------------------------- */

/**
 * Feuilles à leur taille réelle, en quantité réelle (indice foliaire), chacune accrochée par
 * son pétiole à un rameau. `detail` < 1 : moins de feuilles, plus grandes (aperçu rapide).
 */
function foliage(tree, rand, sp, detail = 1) {
  const leaves = [];
  const R = tree.R, crown = Math.PI * R * R;
  const grow = 1 / Math.sqrt(detail);
  const Lc = (sp.leafM / CASE_M) * grow;
  if (tree.pine) {
    // Touffes de 5 aiguilles le long des rameaux.
    const needleArea = Lc * (0.0015 / CASE_M) * grow * 2.5;
    const target = Math.min(MAX_LEAVES, Math.round(sp.lai * crown / (needleArea * 5)));
    const total = tree.tips.reduce((a, t) => a + t.len, 0) || 1;
    let acc = 0;
    for (const t of tree.tips) {
      // Répartition au prorata de la longueur, sans perdre les restes (beaucoup de petits rameaux).
      acc += target * t.len / total;
      const n = Math.floor(acc), tp = rand();
      acc -= n;
      for (let i = 0; i < n; i++) {
        const s = 0.1 + 0.9 * rand(), off = 0.012 * rand(), a = rand() * Math.PI * 2;
        const p = [t.base[0] + (t.p[0] - t.base[0]) * s + Math.cos(a) * off, t.base[1] + (t.p[1] - t.base[1]) * s + Math.sin(a) * off, t.base[2] + (t.p[2] - t.base[2]) * s + 0.02 + rand() * 0.04];
        leaves.push({ needle: true, p, L: Lc * (0.8 + rand() * 0.4), ang: Math.atan2(t.dir[1], t.dir[0]) + (rand() - 0.5) * 0.8, seed: rand(), shade: rand(), tp });
      }
    }
    return leaves;
  }
  const W = sp.leaf === "oak" ? 0.42 : 0.34;
  const target = Math.min(MAX_LEAVES, Math.round(sp.lai * crown / (Lc * Lc * W * 1.2)));
  // Les rameaux (fins, dessinés) partent des branches des deux derniers niveaux ; les feuilles
  // s'y alternent de chaque côté, plus une au bout.
  const bearing = tree.segs.filter((g) => g.d >= sp.depth - 1);
  const segLen = (g) => Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1], g.b[2] - g.a[2]);
  const total = bearing.reduce((a, g) => a + segLen(g), 0) || 1;
  const reach = Math.max(0.12, R * 0.09);
  const perTwig = sp.perTwig;
  const twigCount = Math.max(1, Math.round(target / perTwig));
  const twigW = (0.008 / CASE_M) / (R * sp.trunkW);
  let acc = 0;
  for (const g of bearing) {
    acc += twigCount * segLen(g) / total;
    const n = Math.floor(acc);
    acc -= n;
    for (let i = 0; i < n; i++) {
      const s = 0.1 + 0.9 * rand();
      const a = [g.a[0] + (g.b[0] - g.a[0]) * s, g.a[1] + (g.b[1] - g.a[1]) * s, g.a[2] + (g.b[2] - g.a[2]) * s];
      let ox, oy, oz, r2;
      do { ox = rand() * 2 - 1; oy = rand() * 2 - 1; oz = rand() * 2 - 1; r2 = ox * ox + oy * oy + oz * oz; } while (r2 > 1 || r2 < 0.05);
      const dir = norm([ox, oy, oz * 0.5 + 0.35]);
      const L = reach * (0.55 + rand() * 0.6);
      tree.segs.push({ a, b: [a[0] + dir[0] * L, a[1] + dir[1] * L, a[2] + dir[2] * L], w: twigW * (1.2 + rand() * 0.6), w2: twigW, d: 99, twig: true });
      const tw = Math.atan2(dir[1], dir[0]), flat = Math.hypot(dir[0], dir[1]), tp = rand();
      const m = Math.max(1, Math.round(perTwig * (0.6 + rand() * 0.8)));
      for (let k = 0; k < m; k++) {
        const last = k === m - 1, t = last ? 1 : 0.12 + 0.88 * (k / Math.max(1, m - 1));
        const p = [a[0] + dir[0] * L * t, a[1] + dir[1] * L * t, a[2] + dir[2] * L * t + 0.004];
        const ang = flat < 0.3 ? rand() * Math.PI * 2 : last ? tw + (rand() - 0.5) * 0.3 : tw + (k % 2 ? 1 : -1) * (0.55 + rand() * 0.55);
        leaves.push({ p, ang, L: Lc * (0.75 + rand() * 0.5), W, f: 0.45 + rand() * 0.55, lobes: 3.5 + Math.floor(rand() * 2), shade: rand(), seed: rand(), tp });
      }
    }
  }
  return leaves;
}

/** Contour d'une feuille : points [x, y] (base en 0, pointe en 1, largeur relative). */
export function leafShape(l, kind, N = 36) {
  const top = [], bot = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    let w;
    if (kind === "oak") {
      const env = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.7);
      w = l.W * env * (0.58 + 0.42 * Math.pow(Math.abs(Math.cos(Math.PI * l.lobes * t)), 0.55));
    } else {
      w = l.W * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 0.95) * (1 + (i % 2 ? 0.06 : -0.03));
    }
    top.push([t, -w]); bot.push([t, w * (0.92 + 0.08 * Math.sin(t * 9))]);
  }
  return { top, bot };
}

/**
 * Un arbre complet : squelette (segs), feuilles, et ses dimensions.
 * @param {string} kind    essence (SPECIES)
 * @param {number} seed
 * @param {number} radius  rayon de la couronne, en cases
 * @param {{detail?:number, rotation?:number}} [opts]  rotation en degrés
 */
export function buildTree(kind, seed, radius, { detail = 1, rotation = 0 } = {}) {
  const sp = SPECIES[kind] ?? SPECIES.oak;
  const rand = mulberry32(seed >>> 0);
  const tree = fit(sp.form === "conifer" ? growConifer(rand, sp) : growBroadleaf(rand, sp), radius);
  for (const g of tree.segs) if (g.w2 === undefined) g.w2 = g.w * 0.75;
  const leaves = foliage(tree, mulberry32((seed ^ 0x9e3779b9) >>> 0), sp, detail);
  // L'arbre est tourné avant d'être dessiné : la lumière et l'ombre restent en haut à gauche.
  if (rotation) {
    const r = rotation * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r), seen = new Set();
    const rot = (p) => { if (p && !seen.has(p)) { seen.add(p); const x = p[0]; p[0] = x * c - p[1] * sn; p[1] = x * sn + p[1] * c; } };
    for (const g of tree.segs) { rot(g.a); rot(g.b); }
    for (const t of tree.tips) { rot(t.p); rot(t.base); rot(t.dir); }
    for (const l of leaves) { rot(l.p); l.ang += r; }
  }
  return { kind, sp, seed, tree, leaves };
}

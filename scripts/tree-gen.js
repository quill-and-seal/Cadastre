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
 * Essences. form : « broad » (feuillu) ou « conifer ». single : petite plante d'un seul morceau
 * (immobile au vent dans la scène : trop petite pour que ça se voie, et bien plus léger). lai : indice foliaire (m² de feuilles par
 * m² au sol sous la couronne, 3 à 6 en pleine feuille). leafM : longueur d'une feuille, en mètres.
 */
export const SPECIES = {
  oak: {
    form: "broad", depth: 5, fork: 2.6, spread: 0.62, lai: 4.5, leaf: "oak", leafM: 0.11, perTwig: 12,
    trunkH: 1.0, gnarl: 0.13, rise: 0.12, taper: 0.72, laterals: 2.5, rootL: 0.4, trunkW: 0.13, split: 2,
    bark: ["#3a281a", "#6b4a2e"], leaves: { dark: "#1b4320", mid: "#337434", light: "#86c25a" }
  },
  birch: {
    form: "broad", depth: 6, fork: 2.2, spread: 0.45, lai: 3.5, leaf: "birch", leafM: 0.06, perTwig: 16,
    trunkH: 1.5, gnarl: 0.05, rise: 0.25, taper: 0.8, laterals: 3, rootL: 0.2, trunkW: 0.13, spreadK: 0.85, split: 3,
    bark: ["#8d877c", "#e6e1d6"], leaves: { dark: "#2a5a22", mid: "#4a8a34", light: "#a4cf62" }, birchBark: true
  },
  bush: {
    form: "broad", single: true, depth: 4, fork: 2.8, spread: 0.95, lai: 4, leaf: "birch", leafM: 0.05, perTwig: 12,
    trunkH: 0.15, gnarl: 0.1, rise: 0.2, taper: 0.75, laterals: 2.5, rootL: 0, trunkW: 0.08,
    bark: ["#3b2a1d", "#634733"], leaves: { dark: "#1d4a22", mid: "#3a7d38", light: "#7fbb55" }
  },
  pine: {
    form: "conifer", depth: 3, fork: 2.4, spread: 0.5, lai: 1.2, leaf: "needle", leafM: 0.08,
    gnarl: 0, trunkW: 0.11,
    bark: ["#3b2618", "#7a5133"], leaves: { dark: "#123522", mid: "#1f5534", light: "#5c9a5a" }
  },
  // Hêtre : couronne en dôme très dense, écorce lisse et grise, feuilles ovales au bord ondulé.
  beech: {
    form: "broad", depth: 5, fork: 2.5, spread: 0.55, lai: 5.5, leaf: "beech", leafM: 0.08, perTwig: 14,
    trunkH: 1.2, gnarl: 0.06, rise: 0.16, taper: 0.76, laterals: 2.5, rootL: 0.35, trunkW: 0.12, split: 2,
    bark: ["#5e6264", "#a8aaa6"], leaves: { dark: "#1c4a1f", mid: "#2f7a2e", light: "#7cc04c" }, smoothBark: true
  },
  // Épicéa : plus sombre, étages serrés, branches qui retombent, aiguilles courtes.
  spruce: {
    form: "conifer", depth: 4, fork: 2.6, spread: 0.5, lai: 1.4, leaf: "needle", leafM: 0.025,
    gnarl: 0, trunkW: 0.1, droop: 0.22,
    bark: ["#3a2a20", "#6e5440"], leaves: { dark: "#0c2a1c", mid: "#17442d", light: "#3f7a52" }
  },
  // Myrtille : touffe basse de tiges fines, petites feuilles, baies bleues.
  bilberry: {
    form: "broad", single: true, depth: 3, fork: 2.4, spread: 1.0, lai: 3, leaf: "birch", leafM: 0.025, perTwig: 8,
    trunkH: 0.04, gnarl: 0.12, rise: 0.15, taper: 0.8, laterals: 2, rootL: 0, trunkW: 0.05, limbs: 9,
    bark: ["#3d5a2c", "#6f8f4a"], leaves: { dark: "#24521f", mid: "#3f8236", light: "#8fc45d" },
    fruit: { colors: ["#2c3a7a", "#3b4c9a", "#22305f"], m: 0.008, prob: 0.5, cluster: [1, 3] }
  },
  // Fougère : frondes en arceau partant du centre, folioles alternées.
  fern: { form: "fern", single: true, fronds: [8, 14], pinnaM: 0.12, trunkW: 0.02, bark: ["#3c5a24", "#6c8c3c"], leaves: { dark: "#1e5222", mid: "#3d8a32", light: "#93cc5a" } },
  // Souche : bois coupé, cernes, racines, un peu de mousse. Ne bouge pas au vent.
  stump: { form: "stump", trunkW: 0.32, rigid: true, bark: ["#3a2a1c", "#6a4c32"], wood: ["#b58a5c", "#d8b483"], leaves: { dark: "#2f5a22", mid: "#4f8a34", light: "#8cbf55" } },
  // Champignons : quelques chapeaux en grappe (cèpes bruns ou amanites rouges à points blancs).
  mushrooms: { form: "caps", rigid: true, trunkW: 0.1, bark: ["#5a4632", "#8a7050"], leaves: { dark: "#5a3a1c", mid: "#8a5a2c", light: "#c89a5c" } },

  /* Marais. Touffes (form « clump ») : tiges dressées, vues d'en haut, et feuilles en lanières. */
  // Roseau commun (Phragmites) : tiges de 2 à 3 m, feuilles grises-vertes qui partent de la tige,
  // plumeau violacé au sommet, penché.
  reed: {
    form: "clump", stems: [70, 100], height: 1.7, lean: 0.1, blades: [2, 4], bladeM: 0.3, bladeW: 0.08, basal: false, spreadR: 0.8,
    flower: { kind: "plume", m: 0.32, colors: ["#7a5a66", "#8c6a62", "#9c7e68"], prob: 0.7 }, trunkW: 0.012,
    bark: ["#6f7a4a", "#a8a46c"], leaves: { dark: "#3f5a32", mid: "#6a8a4a", light: "#b4c47c" }
  },
  // Massette (quenouille) : longues feuilles en lames qui retombent du pied, épis bruns en cigare.
  cattail: {
    form: "clump", stems: [8, 14], height: 1.4, lean: 0.14, blades: [0, 0], bladeM: 1.0, bladeW: 0.02, basal: [14, 22],
    flower: { kind: "spike", m: 0.26, colors: ["#4a2e1a", "#5a3820", "#3e2616"], prob: 0.9 }, trunkW: 0.012,
    bark: ["#5f7a3e", "#9cb06a"], leaves: { dark: "#2f5a2c", mid: "#5a8a3e", light: "#a2c46c" }
  },
  // Jonc : touffe serrée de tiges fines, vert sombre, qui s'ouvre en gerbe ; petites grappes brunes.
  rush: {
    form: "clump", stems: [0, 0], height: 0.7, lean: 0.4, blades: [0, 0], bladeM: 0.6, bladeW: 0.012, basal: [60, 90], gerbe: true,
    flower: { kind: "tuft", m: 0.03, colors: ["#6a4a26", "#7c5a30", "#5a3c1e"], prob: 0.25 }, trunkW: 0.01,
    bark: ["#3a5a2a", "#6a8a44"], leaves: { dark: "#1f4a24", mid: "#3c7032", light: "#7aa852" }
  },
  // Nénuphar : feuilles rondes fendues posées sur l'eau, quelques fleurs blanches ou roses. Immobile.
  lily: {
    form: "lily", rigid: true, pads: [12, 22], padM: [0.2, 0.42], flowers: [1, 3], trunkW: 0.01,
    bark: ["#3a5a2a", "#6a8a44"], leaves: { dark: "#24562a", mid: "#3f8236", light: "#8fc45d" },
    flowerColors: [["#f6f3ea", "#e9e2d0"], ["#f2c4d4", "#e494b0"]]
  },
  // Saule têtard : tronc court et trapu taillé en tête, gerbe de longues pousses droites, feuilles
  // étroites vert argenté.
  willow: {
    form: "broad", depth: 2, fork: 2, spread: 0.75, lai: 2.2, leaf: "willow", leafM: 0.09, perTwig: 10,
    trunkH: 1.25, gnarl: 0.02, rise: 0.15, taper: 0.9, laterals: 0, rootL: 0.3, trunkW: 0.22, limbs: 18, split: 1, pollard: true,
    bark: ["#4a4036", "#8a7a66"], leaves: { dark: "#3a563c", mid: "#6a8a60", light: "#bccfa6" }
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
  // Morceaux rigides pour le vent : chaque branche du niveau `split` (et tout ce qu'elle porte)
  // pivote autour de son point d'attache ; le tronc et les grosses branches restent le morceau 0.
  const pieces = [{ id: 0, at: null }];
  const split = sp.split ?? Math.max(1, sp.depth - 2);
  let cur = 0;
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
      segs.push({ a: prev, b: q, w: w0 + (w1 - w0) * (k - 1) / N, w2: w0 + (w1 - w0) * t, d, piece: cur });
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
  function grow(p, dir, len, w, d, piece = 0) {
    if (!piece && d >= split) { piece = pieces.length; pieces.push({ id: piece, at: p }); }
    cur = piece;
    const wEnd = w * sp.taper;
    const br = branch(p, dir, len, w, wEnd, d);
    const end = br.end; dir = br.dir;
    if (d >= sp.depth) { tips.push({ p: end, dir, d, len, piece }); return; }
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
      grow(end, nd, len * (0.68 + rand() * 0.2), wc * (0.88 + rand() * 0.24), d + 1, piece);
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
        grow(q, nd, len * (0.45 + rand() * 0.2), (w + (wEnd - w) * sAt) * 0.45 * (0.85 + rand() * 0.3), d + 2, piece);
      }
    }
  }
  // Charpentières : 3 à 5 grosses branches tout autour du tronc, plus une flèche au centre.
  const n0 = (sp.limbs ?? 3) + Math.floor(rand() * 3), az0 = rand() * Math.PI * 2;
  const w0 = 0.82 * Math.pow(1 / (n0 + 0.5), 1 / 2.4);
  const limb = sp.trunkH > 1.2 ? 0.75 : 0.85;
  for (let i = 0; i < n0; i++) {
    const az = az0 + (i / n0) * Math.PI * 2 + (rand() - 0.5) * 0.6;
    const t = Math.min(1.3, sp.spread * (1.1 + rand() * 0.4));
    const nd = norm([Math.cos(az) * Math.sin(t) + lean[0], Math.sin(az) * Math.sin(t) + lean[1], Math.cos(t)]);
    grow(top, nd, limb * (0.85 + rand() * 0.3), w0 * (0.9 + rand() * 0.25), 1);
  }
  grow(top, norm([lean[0], lean[1], 1]), limb * 0.75, w0 * 0.75, 2);
  return { segs, tips, pieces };
}

/** Conifère : tronc jusqu'à la flèche, étages de branches, rameaux alternés sur trois niveaux. */
function growConifer(rand, sp) {
  const segs = [], tips = [];
  // Morceaux : chaque branche d'étage (avec ses rameaux) ; le tronc est le morceau 0.
  const pieces = [{ id: 0, at: null }];
  const H = 4.2;
  for (let k = 0; k < 6; k++) segs.push({ a: [0, 0, H * k / 6], b: [0, 0, H * (k + 1) / 6], w: 1 - k / 6 * 0.85, w2: 1 - (k + 1) / 6 * 0.85, d: 0 });
  function shoot(p, dir, L, w, level, piece = 0) {
    const end = [p[0] + dir[0] * L, p[1] + dir[1] * L, p[2] + dir[2] * L];
    segs.push({ a: p, b: end, w, w2: w * 0.45, d: level, piece });
    tips.push({ p: end, dir, d: level + 1, len: L, base: p, piece });
    if (level >= 3) return;
    const step = level === 1 ? 0.065 : 0.05;
    const m = Math.floor(L / step);
    const [u] = basis(dir);
    for (let j = 1; j <= m; j++) {
      const s = j / (m + 1);
      const q = [p[0] + (end[0] - p[0]) * s, p[1] + (end[1] - p[1]) * s, p[2] + (end[2] - p[2]) * s];
      const sg = j % 2 ? 1 : -1, ang = 0.75 + rand() * 0.35;
      const nd = norm([dir[0] * Math.cos(ang) + u[0] * sg * Math.sin(ang), dir[1] * Math.cos(ang) + u[1] * sg * Math.sin(ang), dir[2] * Math.cos(ang) + u[2] * sg * Math.sin(ang) - 0.12 - (sp.droop ?? 0) * 1.5]);
      shoot(q, nd, (L * (1 - s) * (level === 1 ? 0.5 : 0.4) + 0.04) * (0.8 + rand() * 0.4), w * 0.35, level + 1, piece);
    }
  }
  const whorls = 8 + sp.depth * 4, z0 = 0.6;
  for (let k = 0; k < whorls; k++) {
    const f = k / (whorls - 1), z = z0 + (H - z0) * f * 0.97;
    const Lmax = Math.pow(1 - f, 0.85) + 0.08;
    // Un verticille complet tous les deux étages, une ou deux branches isolées entre les deux.
    const n = k % 2 ? 1 + Math.floor(rand() * 2) : Math.max(5, Math.round(sp.fork * 2.5 + rand() * 2));
    const az0 = rand() * Math.PI * 2;
    // Un morceau par étage : ses branches glissent ensemble sous le vent.
    const at = [0, 0, z], piece = pieces.length;
    pieces.push({ id: piece, at });
    for (let i = 0; i < n; i++) {
      const az = az0 + (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.6;
      const dir = norm([Math.cos(az), Math.sin(az), -0.05 - sp.spread * 0.2 - (sp.droop ?? 0) + f * 0.25]);
      shoot(at, dir, Lmax * (0.72 + rand() * 0.38) * (k % 2 ? 0.8 : 1), 0.3 * (1 - f * 0.75), 1, piece);
    }
  }
  tips.push({ p: [0, 0, H], dir: [0, 0, 1], d: 3, len: 0.15, base: [0, 0, H - 0.15], piece: 0 });
  return { segs, tips, pine: true, pieces };
}

/** Fougère : frondes en arceau, rachis (fin, dessiné) et folioles alternées de chaque côté. */
function growFern(rand, sp) {
  const segs = [], tips = [], leaves = [];
  const pieces = [{ id: 0, at: null }];
  const [f0, f1] = sp.fronds, n = f0 + Math.floor(rand() * (f1 - f0 + 1)), az0 = rand() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const az = az0 + (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.5;
    const Lf = 0.7 + rand() * 0.3, rise = 0.35 + rand() * 0.2, bend = (rand() - 0.5) * 0.25, tp = rand();
    const pt = (t) => {
      const a = az + bend * t * t, d = Lf * t;
      return [Math.cos(a) * d, Math.sin(a) * d, Lf * rise * Math.sin(Math.PI * Math.min(1, t * 0.85))];
    };
    const N = 8;
    let prev = pt(0);
    const piece = pieces.length;
    pieces.push({ id: piece, at: prev });
    for (let k = 1; k <= N; k++) {
      const q = pt(k / N);
      segs.push({ a: prev, b: q, w: 1 - 0.8 * (k - 1) / N, w2: 1 - 0.8 * k / N, d: 99, twig: true, piece });
      prev = q;
    }
    tips.push({ p: prev, dir: [Math.cos(az), Math.sin(az), 0], d: 1, len: Lf });
    // Folioles : plus longues au milieu de la fronde, alternées, inclinées vers la pointe.
    const m = 22;
    for (let k = 1; k < m; k++) {
      const t = k / m, p = pt(t), q = pt(Math.min(1, t + 0.02));
      const along = Math.atan2(q[1] - p[1], q[0] - p[0]);
      const side = k % 2 ? 1 : -1;
      const len = (sp.pinnaM / CASE_M) * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.6) * (0.9 + rand() * 0.2);
      leaves.push({ p: [p[0], p[1], p[2] + 0.003], ang: along + side * (1.15 - 0.45 * t), L: len, W: 0.22, f: 0.7 + rand() * 0.3, shape: "fern", off: 0, shade: rand(), seed: rand(), tp, piece });
    }
  }
  return { segs, tips, leaves, pieces };
}

/**
 * Touffe de marais (roseau, massette, jonc). Tiges dressées depuis une petite base, chacune
 * penchée vers l'extérieur ; feuilles en lanières (le long des tiges, ou au pied) ; fleurs au
 * sommet (plumeau, épi, grappe). Pour le vent : six secteurs qui ondulent chacun à son rythme.
 */
function growClump(rand, sp) {
  const segs = [], tips = [], leaves = [];
  const SECTORS = 6;
  const pieces = [{ id: 0, at: null }];
  for (let i = 1; i <= SECTORS; i++) pieces.push({ id: i, at: [0, 0, 0] });
  const sector = (az) => 1 + (Math.floor(((az / (Math.PI * 2)) % 1 + 1) % 1 * SECTORS) % SECTORS);
  const H = sp.height, Lb = sp.bladeM / CASE_M;
  const blade = (p, ang, L, W, piece, extra = {}) =>
    leaves.push({ p, ang, L, W, f: 0.8 + rand() * 0.4, shape: "blade", off: 0, shade: rand(), seed: rand(), tp: rand(), piece, ...extra });
  // Tiges.
  const [s0, s1] = sp.stems, n = s0 + Math.floor(rand() * (s1 - s0 + 1));
  const lean0 = rand() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2, d = rand() * (sp.spreadR ?? 0.55);
    const base = [Math.cos(a) * d, Math.sin(a) * d, 0];
    // Penchée vers l'extérieur, et un peu dans le sens commun (le vent dominant).
    const out = d > 0.05 ? a : rand() * Math.PI * 2;
    // Les tiges du bord s'ouvrent vers l'extérieur, celles du cœur restent droites : touffe pleine.
    const tilt = sp.lean * (0.6 + rand() * 0.8) * (0.25 + d / (sp.spreadR ?? 0.55));
    const h = H * (0.75 + rand() * 0.35);
    const dx = Math.cos(out) * tilt + Math.cos(lean0) * 0.08, dy = Math.sin(out) * tilt + Math.sin(lean0) * 0.08;
    const top = [base[0] + dx * h, base[1] + dy * h, h];
    const piece = sector(Math.atan2(top[1], top[0]));
    segs.push({ a: base, b: top, w: 1, w2: 0.6, d: 99, twig: true, piece });
    tips.push({ p: top, dir: norm([dx, dy, 1]), d: 1, len: h });
    // Feuilles le long de la tige, alternées, qui s'écartent à l'horizontale.
    const [b0, b1] = sp.blades, nb = b0 + Math.floor(rand() * (b1 - b0 + 1));
    for (let k = 0; k < nb; k++) {
      const t = 0.3 + 0.6 * (k + rand() * 0.5) / Math.max(1, nb);
      const q = [base[0] + dx * h * t, base[1] + dy * h * t, h * t];
      blade(q, out + (k % 2 ? 1 : -1) * (0.6 + rand() * 1.4), Lb * (0.7 + rand() * 0.5), sp.bladeW, piece);
    }
    // Fleur au sommet.
    const fl = sp.flower;
    if (fl && rand() < (fl.prob ?? 0.85)) {
      const color = fl.colors[Math.floor(rand() * fl.colors.length)], m = (fl.m / CASE_M) * (0.8 + rand() * 0.4);
      const droop = Math.atan2(dy, dx) + (rand() - 0.5) * 0.6;
      leaves.push({ [fl.kind]: true, p: [top[0], top[1], top[2] + 0.01], ang: droop, L: m, color, shade: rand(), seed: rand(), tp: rand(), piece });
    }
  }
  // Feuilles du pied : longues lames qui montent puis retombent tout autour (massette, jonc).
  if (sp.basal) {
    const [c0, c1] = sp.basal, nb = c0 + Math.floor(rand() * (c1 - c0 + 1));
    for (let i = 0; i < nb; i++) {
      const az = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 0.35;
      const p = [Math.cos(az) * d, Math.sin(az) * d, 0];
      const out = d > 0.05 ? az + (rand() - 0.5) * 0.8 : rand() * Math.PI * 2;
      // Vue d'en haut, une lame dressée paraît plus courte : sa longueur projetée.
      const rise = sp.gerbe ? 0.55 + rand() * 0.35 : 0.25 + rand() * 0.55;
      const L = Lb * (0.65 + rand() * 0.55) * Math.cos(rise);
      const z = H * (sp.gerbe ? 0.5 + rand() * 0.4 : 0.15 + rand() * 0.55);
      const piece = sector(out);
      blade([p[0], p[1], z], out, L, sp.bladeW / Math.max(0.3, Math.cos(rise)), piece);
      tips.push({ p: [p[0] + Math.cos(out) * L, p[1] + Math.sin(out) * L, z], dir: [Math.cos(out), Math.sin(out), 0], d: 1, len: L });
      // Jonc : petite grappe brune sur le côté de certaines tiges.
      const fl = sp.flower;
      if (sp.gerbe && fl && rand() < (fl.prob ?? 0.2)) {
        const t = 0.6 + rand() * 0.25;
        const color = fl.colors[Math.floor(rand() * fl.colors.length)];
        leaves.push({ tuft: true, p: [p[0] + Math.cos(out) * L * t, p[1] + Math.sin(out) * L * t, z + 0.01], ang: out, L: (fl.m / CASE_M) * (0.8 + rand() * 0.5), color, shade: rand(), seed: rand(), tp: rand(), piece });
      }
    }
  }
  return { segs, tips, leaves, pieces };
}

/** Nénuphars : feuilles rondes fendues, à plat sur l'eau, et quelques fleurs. */
function growLily(rand, sp) {
  const tips = [], leaves = [];
  const [p0, p1] = sp.pads, n = p0 + Math.floor(rand() * (p1 - p0 + 1));
  const placed = [];
  for (let i = 0; i < n * 4 && placed.length < n; i++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 0.85;
    const L = ((sp.padM[0] + rand() * (sp.padM[1] - sp.padM[0])) / CASE_M);
    const p = [Math.cos(a) * d, Math.sin(a) * d, 0.004 + rand() * 0.004];
    placed.push({ p, L });
    leaves.push({ pad: true, p, L, ang: rand() * Math.PI * 2, shade: rand(), seed: rand(), tp: 0 });
    tips.push({ p: [p[0], p[1], 0], dir: [1, 0, 0], d: 1, len: 0 });
  }
  const [f0, f1] = sp.flowers, nf = f0 + Math.floor(rand() * (f1 - f0 + 1));
  for (let i = 0; i < nf && placed.length; i++) {
    const host = placed[Math.floor(rand() * placed.length)];
    const c = sp.flowerColors[rand() < 0.75 ? 0 : 1];
    leaves.push({ flower: true, p: [host.p[0] + (rand() - 0.5) * host.L * 0.3, host.p[1] + (rand() - 0.5) * host.L * 0.3, 0.02], L: (0.09 + rand() * 0.04) / CASE_M, ang: rand() * Math.PI * 2, color: c[0], color2: c[1], shade: rand(), seed: rand(), tp: 0 });
  }
  return { segs: [], tips, leaves };
}

/** Souche : racines qui plongent tout autour, plateau de bois coupé au centre. */
function growStump(rand) {
  const segs = [], tips = [];
  const nr = 4 + Math.floor(rand() * 3), ar = rand() * Math.PI * 2;
  for (let i = 0; i < nr; i++) {
    const a = ar + (i / nr) * Math.PI * 2 + (rand() - 0.5) * 0.6, L = 0.3 + rand() * 0.3;
    let prev = [Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.25], wa = 1.1;
    for (let k = 1; k <= 4; k++) {
      const t = k / 4, ab = a + (rand() - 0.5) * 0.3;
      const q = [Math.cos(ab) * (0.2 + L * t), Math.sin(ab) * (0.2 + L * t), 0.25 * (1 - t)];
      const wb = 1.1 - 0.75 * t;
      segs.push({ a: prev, b: q, w: wa, w2: wb, d: 1, root: true });
      prev = q; wa = wb;
    }
    tips.push({ p: prev, dir: [Math.cos(a), Math.sin(a), 0], d: 1, len: L });
  }
  return { segs, tips, stumpR: 0.36 + rand() * 0.06 };
}

/** Champignons : quelques chapeaux serrés, une même espèce par grappe. */
function growCaps(rand) {
  const tips = [], leaves = [];
  const red = rand() < 0.35, n = 3 + Math.floor(rand() * 6);
  const colors = red ? ["#b8281c", "#c93a22", "#a51f18"] : ["#6e4422", "#8a5a2e", "#5c3a1e"];
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 0.8;
    const size = (0.04 + rand() * 0.07) / CASE_M;
    const p = [Math.cos(a) * d, Math.sin(a) * d, size * (0.5 + rand())];
    leaves.push({ cap: true, p, L: size, ang: rand() * Math.PI * 2, color: colors[Math.floor(rand() * 3)], dots: red, shade: rand(), seed: rand(), tp: 0 });
    tips.push({ p: [p[0], p[1], 0], dir: [1, 0, 0], d: 1, len: 0 });
  }
  return { segs: [], tips, leaves };
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
  for (const q of tree.pieces ?? []) sc(q.at);
  // Feuilles déjà posées (fougère, champignons) : leur position suit, leur taille reste réelle.
  for (const l of tree.leaves ?? []) sc(l.p);
  if (tree.stumpR) tree.stumpR *= k;
  tree.R = R;
  tree.k = k;
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
        leaves.push({ needle: true, p, L: Lc * (0.8 + rand() * 0.4), ang: Math.atan2(t.dir[1], t.dir[0]) + (rand() - 0.5) * 0.8, seed: rand(), shade: rand(), tp, piece: t.piece ?? 0 });
      }
    }
    return leaves;
  }
  const W = sp.leaf === "oak" ? 0.42 : sp.leaf === "beech" ? 0.36 : sp.leaf === "willow" ? 0.15 : 0.34;
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
      tree.segs.push({ a, b: [a[0] + dir[0] * L, a[1] + dir[1] * L, a[2] + dir[2] * L], w: twigW * (1.2 + rand() * 0.6), w2: twigW, d: 99, twig: true, piece: g.piece ?? 0 });
      const tw = Math.atan2(dir[1], dir[0]), flat = Math.hypot(dir[0], dir[1]), tp = rand();
      const m = Math.max(1, Math.round(perTwig * (0.6 + rand() * 0.8)));
      for (let k = 0; k < m; k++) {
        const last = k === m - 1, t = last ? 1 : 0.12 + 0.88 * (k / Math.max(1, m - 1));
        const p = [a[0] + dir[0] * L * t, a[1] + dir[1] * L * t, a[2] + dir[2] * L * t + 0.004];
        const ang = flat < 0.3 ? rand() * Math.PI * 2 : last ? tw + (rand() - 0.5) * 0.3 : tw + (k % 2 ? 1 : -1) * (0.55 + rand() * 0.55);
        leaves.push({ p, ang, L: Lc * (0.75 + rand() * 0.5), W, f: 0.45 + rand() * 0.55, lobes: 3.5 + Math.floor(rand() * 2), shade: rand(), seed: rand(), tp, piece: g.piece ?? 0 });
      }
      // Fruits : une petite grappe au bout de certains rameaux.
      if (sp.fruit && rand() < sp.fruit.prob) {
        const [c0, c1] = sp.fruit.cluster, n = c0 + Math.floor(rand() * (c1 - c0 + 1));
        const tip = [a[0] + dir[0] * L, a[1] + dir[1] * L, a[2] + dir[2] * L + 0.01];
        const d = sp.fruit.m / CASE_M;
        for (let k = 0; k < n; k++) {
          const q = [tip[0] + (rand() - 0.5) * d * 2, tip[1] + (rand() - 0.5) * d * 2, tip[2] + rand() * 0.004];
          leaves.push({ fruit: true, p: q, L: d * (0.85 + rand() * 0.3), ang: 0, color: sp.fruit.colors[Math.floor(rand() * sp.fruit.colors.length)], shade: rand(), seed: rand(), tp, piece: g.piece ?? 0 });
        }
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
    if (kind === "beech") {
      // Ovale pointue, bord légèrement ondulé.
      w = l.W * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.85) * (1 + 0.05 * Math.sin(t * 38));
    } else if (kind === "willow") {
      // Lancéolée, longue et étroite.
      w = l.W * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.9)), 1.1);
    } else if (kind === "blade") {
      // Lanière : large au pied, qui s'affine jusqu'à la pointe.
      w = l.W * Math.pow(1 - t, 0.55) * Math.min(1, t * 10 + 0.4);
    } else if (kind === "fern") {
      // Foliole étroite, dentée en peigne.
      w = l.W * Math.pow(1 - t, 0.7) * Math.min(1, t * 6) * (i % 2 ? 1 : 0.55);
    } else if (kind === "oak") {
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
export function buildTree(kind, seed, radius, { detail = 1, rotation = 0, cull = true } = {}) {
  const sp = SPECIES[kind] ?? SPECIES.oak;
  const rand = mulberry32(seed >>> 0);
  const grow = { conifer: growConifer, fern: growFern, stump: growStump, caps: growCaps, clump: growClump, lily: growLily }[sp.form] ?? growBroadleaf;
  const tree = fit(grow(rand, sp), radius);
  for (const g of tree.segs) if (g.w2 === undefined) g.w2 = g.w * 0.75;
  if (!tree.segs.length) tree.zmax = Math.max(0.05, ...(tree.leaves ?? []).map((l) => l.p[2]));
  const leaves = tree.leaves ?? foliage(tree, mulberry32((seed ^ 0x9e3779b9) >>> 0), sp, detail);
  delete tree.leaves;
  // L'arbre est tourné avant d'être dessiné : la lumière et l'ombre restent en haut à gauche.
  if (rotation) {
    const r = rotation * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r), seen = new Set();
    const rot = (p) => { if (p && !seen.has(p)) { seen.add(p); const x = p[0]; p[0] = x * c - p[1] * sn; p[1] = x * sn + p[1] * c; } };
    for (const g of tree.segs) { rot(g.a); rot(g.b); }
    for (const t of tree.tips) { rot(t.p); rot(t.base); rot(t.dir); }
    for (const q of tree.pieces ?? []) rot(q.at);
    for (const l of leaves) { rot(l.p); l.ang += r; }
  }
  const all = leaves.length;
  return { kind, sp, seed, tree, leaves: cull ? cullHidden(leaves) : leaves, all };
}

/**
 * Feuilles invisibles retirées. Vu de dessus, une feuille recouverte par au moins `layers`
 * épaisseurs de feuilles plus hautes ne se voit pas — même quand le vent fait bouger celles
 * du dessus, d'où la marge d'une épaisseur. On ne compte comme couvert que le cœur des
 * feuilles (le long de la nervure), et une feuille n'est retirée que si toute sa surface l'est :
 * dans le doute, elle reste.
 */
export function cullHidden(leaves, layers = 2) {
  if (!leaves.length) return leaves;
  const L = leaves.reduce((a, l) => a + l.L, 0) / leaves.length;
  const cell = L * 0.3;
  const cover = new Map();
  const key = (x, y) => Math.floor(x / cell) * 73856093 ^ Math.floor(y / cell) * 19349663;
  const order = leaves.map((l, i) => i).sort((a, b) => leaves[b].p[2] - leaves[a].p[2]);
  const keep = new Uint8Array(leaves.length);
  for (const i of order) {
    const l = leaves[i], ca = Math.cos(l.ang), sa = Math.sin(l.ang);
    if (l.fruit || l.cap) { keep[i] = 1; continue; }
    const W = l.needle ? 0.25 : l.W * (l.f ?? 1);
    const at = (u, v) => [l.p[0] + ((u + 0.14) * ca - v * sa) * l.L, l.p[1] + ((u + 0.14) * sa + v * ca) * l.L];
    // Surface de la feuille : quelques points jusqu'au bord.
    let hidden = true;
    for (const [u, v] of [[0, 0], [0.3, -W], [0.3, W], [0.55, -W], [0.55, W], [0.5, 0], [1, 0], [0.8, -W * 0.6], [0.8, W * 0.6]]) {
      const [x, y] = at(u, v);
      if ((cover.get(key(x, y)) ?? 0) < layers) { hidden = false; break; }
    }
    if (hidden) continue;
    keep[i] = 1;
    // Ce qu'elle couvre à coup sûr : son cœur, le long de la nervure.
    const core = l.needle ? [[0.3, 0], [0.6, 0]] : [[0.25, 0], [0.45, 0], [0.65, 0], [0.4, -W * 0.5], [0.4, W * 0.5], [0.55, -W * 0.45], [0.55, W * 0.45]];
    for (const [u, v] of core) { const k = key(...at(u, v)); cover.set(k, (cover.get(k) ?? 0) + 1); }
  }
  return leaves.filter((l, i) => keep[i]);
}

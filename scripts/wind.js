/**
 * Vent dans l'herbe, en vue de dessus. Rien ici ne dépend de Foundry : le calque de la scène
 * (wind-layer.js) et l'aperçu de l'éditeur s'en servent tous les deux.
 *
 * Vue de dessus, une touffe d'herbe est une petite étoile de brins. Au repos, les brins
 * pointent vers le ciel : on n'en voit qu'un bout court. Sous le vent, ils se couchent et
 * leurs pointes filent dans le sens du vent ; au passage d'un jeton, ils se couchent en
 * éventail autour de lui. Les rafales sont des fronts qui avancent dans le sens du vent.
 *
 * Réglages d'une carte (map.wind) :
 *   dir      : direction vers laquelle souffle le vent, en degrés (0 = vers l'est, 90 = vers le sud)
 *   strength : force, de 0 (calme) à 1 (tempête)
 *   gusts    : fréquence des rafales, de 0 (rares, longues) à 1 (serrées)
 *   density  : touffes par case (0 : pas de touffes)
 */
import * as poly from "./poly.js";
import { mulberry32 } from "./catalog.js";
import { waterRings } from "./render.js";
import { propDef } from "./model.js";
import { flattenNodes } from "./curves.js";

export const WIND_DEFAULT = { dir: 20, strength: 0.55, gusts: 0.5, density: 2.5 };
export const MAX_DENSITY = 4;
/** Au-delà, les touffes sont éclaircies : la scène reste fluide. */
export const MAX_TUFTS = 9000;

/** Niveaux d'effet, choisis par chaque joueur. */
export const WIND_LEVELS = { OFF: 0, SHEEN: 1, TUFTS: 2, FULL: 3 };

const clamp = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const r3 = (n) => Math.round(n * 1000) / 1000;

export function normalizeWind(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    dir: Number.isFinite(Number(src.dir)) && src.dir !== null && src.dir !== "" ? r3(((Number(src.dir) % 360) + 360) % 360) : WIND_DEFAULT.dir,
    strength: r3(clamp(src.strength, 0, 1, WIND_DEFAULT.strength)),
    gusts: r3(clamp(src.gusts, 0, 1, WIND_DEFAULT.gusts)),
    density: r3(clamp(src.density, 0, MAX_DENSITY, WIND_DEFAULT.density))
  };
}

/* -------------------------------------------- */
/*  Champ de vent                               */
/* -------------------------------------------- */

function hash1(i) {
  let h = Math.imul(i | 0, 374761393) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Bruit 1D lisse dans [0, 1]. */
function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash1(i) * (1 - u) + hash1(i + 1) * u;
}

/**
 * Champ de vent : force locale (0 à 1) en (x, y) cases à l'instant t secondes.
 * Une brise de fond, et des fronts de rafale étroits qui avancent dans le sens du vent,
 * irréguliers sur leur largeur.
 */
export function windField(wind) {
  const w = normalizeWind(wind);
  const a = (w.dir * Math.PI) / 180;
  const dx = Math.cos(a), dy = Math.sin(a);
  const speed = 1.4 + w.strength * 3.2;              // cases par seconde
  const wavelength = 5 + (1 - w.gusts) * 12;         // écart entre deux rafales, en cases
  const base = 0.18 + 0.22 * w.strength;
  const at = (x, y, t) => {
    if (w.strength <= 0) return 0;
    const s = x * dx + y * dy - speed * t;           // le long du vent
    const c = -x * dy + y * dx;                      // en travers
    const wobble = (noise1(c * 0.11 + 7.3) - 0.5) * wavelength * 0.9 + (noise1(s * 0.05 + c * 0.02) - 0.5) * 2;
    const phase = ((s + wobble) / wavelength) % 1;
    const p = phase < 0 ? phase + 1 : phase;
    // Front : montée rapide puis retombée douce.
    const front = p < 0.12 ? p / 0.12 : Math.max(0, 1 - (p - 0.12) / 0.45);
    const shaped = front * front * (3 - 2 * front);
    const along = 0.55 + 0.45 * noise1(c * 0.06 + s * 0.015 + 31.7);
    return Math.min(1, w.strength * (base + (1 - base) * shaped * along));
  };
  return { at, dir: a, dx, dy, speed, wind: w };
}

/* -------------------------------------------- */
/*  Zone d'herbe                                */
/* -------------------------------------------- */

/** Emprise d'un objet posé, tournée et à l'échelle (arbres : la couronne). */
function propRings(map, p) {
  const def = propDef(map, p.type);
  if (!def) return [];
  if (def.tree) {
    const r = (def.w * p.k) * 0.48;
    const pts = [];
    for (let i = 0; i < 16; i++) pts.push([p.x + Math.cos((i / 16) * Math.PI * 2) * r, p.y + Math.sin((i / 16) * Math.PI * 2) * r]);
    return [poly.pointsRing(pts)];
  }
  const a = (p.a * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const hw = (def.w * p.k) / 2, hh = (def.h * p.k) / 2;
  const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [p.x + x * c - y * s, p.y + x * s + y * c]);
  return [poly.pointsRing(corners)];
}

/**
 * Où pousse l'herbe qui bouge : le sol « herbe », moins l'eau, les chemins, les murs,
 * les pièces et tout ce qui est posé dessus (objets, arbres, tentes de la bibliothèque) :
 * ces éléments sont dans l'image de fond, les touffes ne doivent pas passer par-dessus.
 */
export function grassZone(map) {
  let zone = map.terrains?.grass ?? [];
  if (!zone.length) return [];
  const cut = (rings) => { if (rings.length && zone.length) zone = poly.difference(zone, rings); };
  // Marges : la berge déborde de 0,3 case autour de l'eau, une touffe d'une demi-case autour de son pied.
  const water = waterRings(map);
  if (water.length) cut(poly.offsetRings(water, 0.6));
  for (const q of map.paths ?? []) {
    const pts = flattenNodes(q.nodes, q.closed, 0.03);
    if (pts.length < 2) continue;
    cut(poly.strokeRings(q.closed ? [...pts, pts[0]] : pts, q.width / 2 + (q.edge ? q.edgeWidth : 0) + 0.4));
  }
  for (const wall of map.walls ?? []) {
    const pts = flattenNodes(wall.nodes, wall.closed, 0.03);
    if (pts.length >= 2) cut(poly.strokeRings(wall.closed ? [...pts, pts[0]] : pts, 0.5));
  }
  cut(map.rooms ?? []);
  let props = [];
  for (const p of map.props ?? []) props = props.concat(propRings(map, p));
  // Marge : une touffe déborde d'une demi-case autour de son pied.
  if (props.length) cut(poly.offsetRings(poly.union(props, []), 0.35));
  return zone;
}

/* -------------------------------------------- */
/*  Touffes                                     */
/* -------------------------------------------- */

/** Taille d'affichage d'une touffe, en cases (une pose de la planche fait une case). */
export const TUFT_SCALE = 0.8;

/** Nombre de variantes de touffes dessinées. */
export const TUFT_VARIANTS = 4;

/**
 * Touffes semées dans la zone : grille tremblée, même graine, mêmes touffes.
 * @returns {{x:number, y:number, v:number, k:number}[]}  position (cases), variante, échelle
 */
export function tuftPositions(zone, density, { seed = 1, maxCount = MAX_TUFTS } = {}) {
  if (!zone?.length || !(density > 0)) return [];
  const box = poly.ringsBounds(zone);
  if (!box) return [];
  const area = Math.abs(poly.totalArea(zone));
  // Éclaircit si la zone demande trop de touffes.
  const d = Math.min(density, maxCount / Math.max(area, 1e-6));
  const step = 1 / Math.sqrt(d);
  const rand = mulberry32(seed);
  const out = [];
  for (let y = box.y0 + step / 2; y < box.y1; y += step) {
    for (let x = box.x0 + step / 2; x < box.x1; x += step) {
      const px = x + (rand() - 0.5) * step * 0.9, py = y + (rand() - 0.5) * step * 0.9;
      const v = Math.floor(rand() * TUFT_VARIANTS), k = 0.8 + rand() * 0.4;
      if (poly.pointInRings(zone, px, py)) out.push({ x: r3(px), y: r3(py), v, k: r3(k) });
    }
  }
  return out;
}

/* -------------------------------------------- */
/*  Dessin des touffes (Canvas 2D)              */
/* -------------------------------------------- */

const BLADE_DARK = "#356f27", BLADE_MID = "#4f963a", BLADE_TIP = "#7fbd55";

/**
 * Dessine une touffe vue de dessus, centrée en (cx, cy), dans un contexte 2D.
 * @param {number} size      rayon de la touffe au repos, en pixels
 * @param {number} variant   forme de la touffe (nombre et angle des brins)
 * @param {number} bend      0 : debout, 1 : couchée
 * @param {number} bendAngle direction vers laquelle les brins se couchent (radians)
 */
export function drawTuft(ctx, cx, cy, size, variant, bend, bendAngle) {
  const rand = mulberry32(1000 + variant * 7919);
  const blades = 9 + Math.floor(rand() * 5);
  const bx = Math.cos(bendAngle), by = Math.sin(bendAngle);
  const list = [];
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + (rand() - 0.5) * 0.8;
    const len = size * (0.55 + rand() * 0.6);
    const rx = Math.cos(a), ry = Math.sin(a);
    // Pointe : courte quand le brin est debout, longue dans le sens du vent quand il se couche.
    const upright = len * 0.38 * (1 - 0.55 * bend);
    const lay = len * 1.05 * bend;
    const tx = cx + rx * upright + bx * lay, ty = cy + ry * upright + by * lay;
    const mx = cx + rx * len * 0.22 + bx * lay * 0.35, my = cy + ry * len * 0.22 + by * lay * 0.35;
    list.push({ tx, ty, mx, my, w: size * (0.07 + rand() * 0.04) });
  }
  // Les brins couchés dans le sens du vent passent devant : tri par avancée.
  list.sort((p, q) => (p.tx * bx + p.ty * by) - (q.tx * bx + q.ty * by));
  ctx.lineCap = "round";
  for (const pass of [[BLADE_DARK, 1.7], [BLADE_MID, 1], [BLADE_TIP, 0.5]]) {
    ctx.strokeStyle = pass[0];
    for (const b of list) {
      ctx.lineWidth = b.w * pass[1];
      ctx.beginPath();
      if (pass[0] === BLADE_TIP) {
        // Reflet clair sur la moitié haute du brin.
        ctx.moveTo((b.mx + b.tx) / 2, (b.my + b.ty) / 2);
        ctx.lineTo(b.tx, b.ty);
      } else {
        ctx.moveTo(cx, cy);
        ctx.quadraticCurveTo(b.mx, b.my, b.tx, b.ty);
      }
      ctx.stroke();
    }
  }
}

/** Niveaux de couchage pré-dessinés dans le sens du vent, et poussées des jetons. */
export const BEND_STEPS = 7;
export const PUSH_DIRS = 8;
export const PUSH_LEVELS = [0.55, 1];

/**
 * Planche de toutes les poses de touffes, pour un vent donné : par variante, BEND_STEPS
 * poses dans le sens du vent puis PUSH_DIRS × PUSH_LEVELS poses poussées par un jeton.
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas
 * @param {number} cell  taille d'une pose en pixels (une touffe tient dans une case)
 * @returns {{cell:number, cols:number, frame:(v:number, kind:"wind"|"push", i:number, level?:number)=>{x:number,y:number}}}
 */
export function buildTuftAtlas(canvas, cell, windAngle) {
  const cols = BEND_STEPS + PUSH_DIRS * PUSH_LEVELS.length;
  canvas.width = cols * cell;
  canvas.height = TUFT_VARIANTS * cell;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const size = cell * 0.3;
  for (let v = 0; v < TUFT_VARIANTS; v++) {
    for (let i = 0; i < BEND_STEPS; i++) {
      drawTuft(ctx, i * cell + cell / 2, v * cell + cell / 2, size, v, i / (BEND_STEPS - 1), windAngle);
    }
    PUSH_LEVELS.forEach((level, l) => {
      for (let d = 0; d < PUSH_DIRS; d++) {
        const col = BEND_STEPS + l * PUSH_DIRS + d;
        drawTuft(ctx, col * cell + cell / 2, v * cell + cell / 2, size, v, level, (d / PUSH_DIRS) * Math.PI * 2);
      }
    });
  }
  const frame = (v, kind, i, level = 0) => {
    const col = kind === "wind" ? Math.max(0, Math.min(BEND_STEPS - 1, i)) : BEND_STEPS + level * PUSH_DIRS + (((i % PUSH_DIRS) + PUSH_DIRS) % PUSH_DIRS);
    return { x: col * cell, y: v * cell };
  };
  return { cell, cols, frame };
}

/** Pose d'une touffe selon la force du vent (0 à 1). */
export const bendIndex = (force) => Math.max(0, Math.min(BEND_STEPS - 1, Math.round(force * (BEND_STEPS - 1))));

/** Secteur (0 à PUSH_DIRS - 1) d'une direction de poussée. */
export const pushSector = (dx, dy) => (Math.round((Math.atan2(dy, dx) / (Math.PI * 2)) * PUSH_DIRS) + PUSH_DIRS) % PUSH_DIRS;

/* -------------------------------------------- */
/*  Poussée des jetons                          */
/* -------------------------------------------- */

/**
 * Met à jour la poussée de chaque touffe : forte sous un jeton et autour, puis l'herbe se
 * redresse doucement quand il s'éloigne.
 * @param {{x,y}[]} tufts
 * @param {{x:number,y:number,r:number}[]} pushers  centres et rayons d'influence, en cases
 * @param {Float32Array} amount   poussée de chaque touffe (0 à 1), mise à jour sur place
 * @param {Uint8Array} sector     secteur de poussée de chaque touffe, mis à jour sur place
 * @param {number} dt             secondes écoulées
 * @param {Map<string, number[]>} [buckets]  index spatial (bucketTufts), pour ne tester que les touffes proches
 */
export function updatePush(tufts, pushers, amount, sector, dt, buckets = null) {
  const recover = Math.min(1, dt * 1.4);
  for (let i = 0; i < amount.length; i++) if (amount[i] > 0) amount[i] = Math.max(0, amount[i] - recover);
  for (const p of pushers) {
    const ids = buckets ? nearbyTufts(buckets, p.x, p.y, p.r) : tufts.keys();
    for (const i of ids) {
      const t = tufts[i];
      const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy);
      if (d > p.r) continue;
      const force = 1 - (d / p.r) ** 2;
      if (force >= amount[i]) {
        amount[i] = force;
        sector[i] = pushSector(d > 1e-6 ? dx : 1, d > 1e-6 ? dy : 0);
      }
    }
  }
}

/** Index spatial des touffes par case. */
export function bucketTufts(tufts) {
  const map = new Map();
  tufts.forEach((t, i) => {
    const key = `${Math.floor(t.x)},${Math.floor(t.y)}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(i);
  });
  return map;
}

export function* nearbyTufts(buckets, x, y, r) {
  for (let j = Math.floor(y - r); j <= Math.floor(y + r); j++) {
    for (let i = Math.floor(x - r); i <= Math.floor(x + r); i++) {
      const list = buckets.get(`${i},${j}`);
      if (list) yield* list;
    }
  }
}

/* -------------------------------------------- */
/*  Reflet des rafales (niveau 1)               */
/* -------------------------------------------- */

/**
 * Peint dans un contexte 2D le reflet des rafales sur l'herbe : une couche claire, plus forte
 * sur les fronts de rafale (l'herbe couchée montre le dessous plus pâle de ses brins).
 * @param {number} ppc  pixels par case de la couche (basse résolution, étirée à l'affichage)
 */
export function paintSheen(ctx, field, t, width, height, ppc) {
  const img = ctx.createImageData(Math.ceil(width * ppc), Math.ceil(height * ppc));
  const data = img.data;
  for (let py = 0; py < img.height; py++) {
    for (let px = 0; px < img.width; px++) {
      const f = field.at((px + 0.5) / ppc, (py + 0.5) / ppc, t);
      const a = Math.max(0, (f - 0.25) / 0.75);
      const o = (py * img.width + px) * 4;
      data[o] = 214; data[o + 1] = 240; data[o + 2] = 150;
      data[o + 3] = Math.round(a * a * 120);
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Données enregistrées dans la scène à l'export ; null s'il n'y a pas d'herbe. */
export function windFlag(map) {
  const zone = grassZone(map);
  if (!zone.length) return null;
  return { v: 1, width: map.width, height: map.height, wind: normalizeWind(map.wind), zone };
}

/**
 * Vent dans l'herbe, en vue de dessus. Rien ici ne dépend de Foundry : le calque de la scène
 * (wind-layer.js) et l'aperçu de l'éditeur s'en servent tous les deux.
 *
 * Vue de dessus, l'herbe est un tapis de brins. Au repos, les brins pointent vers le ciel :
 * on n'en voit qu'un bout court. Sous le vent, ils se couchent et leurs pointes filent dans
 * le sens du vent ; au passage d'un jeton, ils se couchent en éventail autour de lui.
 * Les rafales sont des fronts qui avancent dans le sens du vent.
 *
 * Réglages d'une carte (map.wind) :
 *   dir      : direction vers laquelle souffle le vent, en degrés (0 = vers l'est, 90 = vers le sud)
 *   strength : force, de 0 (calme) à 1 (tempête)
 *   gusts    : fréquence des rafales, de 0 (rares, longues) à 1 (serrées)
 *   density  : brins animés par case (0 : pas de brins animés, seulement l'ondulation)
 */
import * as poly from "./poly.js";
import { mulberry32, GRASS_LEAN } from "./catalog.js";
import { waterRings } from "./render.js";
import { propDef } from "./model.js";
import { flattenNodes } from "./curves.js";

export const WIND_DEFAULT = { dir: 20, strength: 0.55, gusts: 0.5, density: 45 };
export const MAX_DENSITY = 120;
/** Au-delà, les cases de brins animés sont plafonnées : la scène reste fluide. */
export const MAX_PATCHES = 12000;

/** Niveaux d'effet, choisis par chaque joueur. */
export const WIND_LEVELS = { OFF: 0, SHEEN: 1, BLADES: 2, FULL: 3 };

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
    // Avant la 0.1.6, la densité comptait des touffes (0 à 4) : on passe au réglage par défaut.
    density: Number(src.density) > 0 && Number(src.density) <= 4 ? WIND_DEFAULT.density : Math.round(clamp(src.density, 0, MAX_DENSITY, WIND_DEFAULT.density))
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
 * ces éléments sont dans l'image de fond, les brins ne doivent pas passer par-dessus.
 */
export function grassZone(map) {
  let zone = map.terrains?.grass ?? [];
  if (!zone.length) return [];
  const cut = (rings) => { if (rings.length && zone.length) zone = poly.difference(zone, rings); };
  // Marges : la berge déborde de 0,3 case autour de l'eau, un brin un peu autour de son pied.
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
  // Marge : un brin déborde un peu autour de son pied.
  if (props.length) cut(poly.offsetRings(poly.union(props, []), 0.35));
  return zone;
}

/* -------------------------------------------- */
/*  Brins animés                                */
/* -------------------------------------------- */

/**
 * La couche animée est faite de « carrés de brins » : un par case d'herbe, chacun avec des
 * dizaines de brins longs qui se couchent ensemble. Les pointes débordent sur les cases
 * voisines, si bien qu'on ne voit jamais de bord entre deux carrés.
 */
/** Côté d'un carré de brins affiché, en cases (pieds dans la case, pointes qui débordent). */
export const PATCH_SIZE = 1.8;
/** Nombre de variantes de carrés dessinées (choisies au hasard, case par case). */
export const PATCH_VARIANTS = 4;

/**
 * Cases qui reçoivent des brins animés : celles dont le centre est dans la zone, à une
 * demi-case du bord (les brins ne débordent ni sur la berge, ni sur les arbres).
 * @returns {{x:number, y:number, v:number}[]}  centre de la case, variante
 */
export function patchPositions(zone, { seed = 1, maxCount = MAX_PATCHES } = {}) {
  if (!zone?.length) return [];
  const inner = poly.offsetRings(zone, -0.45);
  const box = poly.ringsBounds(inner);
  if (!box) return [];
  const rand = mulberry32(seed);
  const out = [];
  for (let y = Math.floor(box.y0); y < box.y1; y++) {
    for (let x = Math.floor(box.x0); x < box.x1; x++) {
      const v = Math.floor(rand() * PATCH_VARIANTS);
      if (poly.pointInRings(inner, x + 0.5, y + 0.5)) out.push({ x: x + 0.5, y: y + 0.5, v });
      if (out.length >= maxCount) return out;
    }
  }
  return out;
}

/** Mêmes verts que le tapis de brins du sol, à peine plus clairs : la couche animée s'y fond. */
const BLADE_ROOTS = ["#336b28", "#3a752d"];
const BLADE_TIPS = ["#4f9039", "#599a3f", "#64a446"];

/**
 * Dessine un carré de brins vus de dessus, centré en (cx, cy), dans un contexte 2D.
 * @param {number} ppc       pixels par case
 * @param {number} variant   disposition des brins
 * @param {number} count     brins par case
 * @param {number} bend      0 : debout, 1 : couchés
 * @param {number} bendAngle direction vers laquelle les brins se couchent (radians)
 */
export function drawBladePatch(ctx, cx, cy, ppc, variant, count, bend, bendAngle) {
  const rand = mulberry32(5000 + variant * 7919);
  const bx = Math.cos(bendAngle), by = Math.sin(bendAngle);
  const blades = [];
  for (let i = 0; i < count; i++) {
    const x = cx + (rand() - 0.5) * ppc, y = cy + (rand() - 0.5) * ppc;
    // Peignés comme le sol : tous penchent à peu près du même côté au repos.
    const a = GRASS_LEAN + (rand() - 0.5) * 2.2;
    const len = ppc * (0.18 + rand() * 0.18);
    const stiff = 0.7 + rand() * 0.6;          // chaque brin plie un peu différemment
    const b = Math.min(1, bend * stiff);
    // Debout, le brin ne montre qu'un bout court ; couché, il file dans le sens du vent.
    const up = len * 0.55 * (1 - 0.6 * b);
    const lay = len * 1.05 * b;
    const ex = Math.cos(a) * up + bx * lay;
    const ey = Math.sin(a) * up + by * lay;
    const curl = len * (0.08 + rand() * 0.1);
    const mx = ex * 0.5 - Math.sin(a) * curl * (1 - b), my = ey * 0.5 + Math.cos(a) * curl * (1 - b);
    const shade = rand();
    blades.push({
      x, y, ex, ey, mx, my,
      root: BLADE_ROOTS[Math.floor(shade * BLADE_ROOTS.length)],
      // Les brins couchés montrent un peu plus leur dessus, plus clair.
      tip: BLADE_TIPS[Math.min(BLADE_TIPS.length - 1, Math.floor((shade * 0.6 + rand() * 0.25 + b * 0.35) * BLADE_TIPS.length))],
      w: ppc * (0.018 + rand() * 0.01)
    });
  }
  blades.sort((p, q) => p.y - q.y);
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.85;
  for (const bl of blades) {
    ctx.strokeStyle = bl.root;
    ctx.lineWidth = bl.w * 1.4;
    ctx.beginPath();
    ctx.moveTo(bl.x, bl.y);
    ctx.quadraticCurveTo(bl.x + bl.mx * 0.5, bl.y + bl.my * 0.5, bl.x + bl.mx, bl.y + bl.my);
    ctx.stroke();
    ctx.strokeStyle = bl.tip;
    ctx.lineWidth = bl.w;
    ctx.beginPath();
    ctx.moveTo(bl.x + bl.mx, bl.y + bl.my);
    ctx.quadraticCurveTo(bl.x + (bl.mx + bl.ex) / 2, bl.y + (bl.my + bl.ey) / 2, bl.x + bl.ex, bl.y + bl.ey);
    ctx.stroke();
  }
}

/** Niveaux de couchage pré-dessinés dans le sens du vent, et poussées des jetons. */
export const BEND_STEPS = 7;
export const PUSH_DIRS = 8;
export const PUSH_LEVELS = [0.55, 1];

/**
 * Planche de toutes les poses de carrés de brins, pour un vent donné : par variante,
 * BEND_STEPS poses dans le sens du vent, puis PUSH_DIRS × PUSH_LEVELS poses poussées par un jeton.
 * @param {number} ppc    pixels par case dans la planche
 * @param {number} count  brins par case
 * @returns {{cell:number, ppc:number, frame:(v:number, kind:"wind"|"push", i:number, level?:number)=>{x:number,y:number}}}
 */
export function buildBladeAtlas(canvas, ppc, windAngle, count) {
  const cell = Math.round(PATCH_SIZE * ppc);
  const cols = BEND_STEPS + PUSH_DIRS * PUSH_LEVELS.length;
  canvas.width = cols * cell;
  canvas.height = PATCH_VARIANTS * cell;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const draw = (col, v, bend, angle) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(col * cell, v * cell, cell, cell);
    ctx.clip();
    drawBladePatch(ctx, col * cell + cell / 2, v * cell + cell / 2, ppc, v, count, bend, angle);
    ctx.restore();
  };
  for (let v = 0; v < PATCH_VARIANTS; v++) {
    for (let i = 0; i < BEND_STEPS; i++) draw(i, v, i / (BEND_STEPS - 1), windAngle);
    PUSH_LEVELS.forEach((level, l) => {
      for (let d = 0; d < PUSH_DIRS; d++) draw(BEND_STEPS + l * PUSH_DIRS + d, v, level, (d / PUSH_DIRS) * Math.PI * 2);
    });
  }
  const frame = (v, kind, i, level = 0) => {
    const col = kind === "wind" ? Math.max(0, Math.min(BEND_STEPS - 1, i)) : BEND_STEPS + level * PUSH_DIRS + (((i % PUSH_DIRS) + PUSH_DIRS) % PUSH_DIRS);
    return { x: col * cell, y: v * cell };
  };
  return { cell, ppc, frame };
}

/** Pose d'un carré de brins selon la force du vent (0 à 1). */
export const bendIndex = (force) => Math.max(0, Math.min(BEND_STEPS - 1, Math.round(force * (BEND_STEPS - 1))));

/** Secteur (0 à PUSH_DIRS - 1) d'une direction de poussée. */
export const pushSector = (dx, dy) => (Math.round((Math.atan2(dy, dx) / (Math.PI * 2)) * PUSH_DIRS) + PUSH_DIRS) % PUSH_DIRS;

/* -------------------------------------------- */
/*  Poussée des jetons                          */
/* -------------------------------------------- */

/**
 * Met à jour la poussée de chaque carré de brins : forte sous un jeton et autour, puis
 * l'herbe se redresse doucement quand il s'éloigne.
 * @param {{x,y}[]} tufts  carrés de brins (centres, en cases)
 * @param {{x:number,y:number,r:number}[]} pushers  centres et rayons d'influence, en cases
 * @param {Float32Array} amount   poussée de chaque carré (0 à 1), mise à jour sur place
 * @param {Uint8Array} sector     secteur de poussée de chaque carré, mis à jour sur place
 * @param {number} dt             secondes écoulées
 * @param {Map<string, number[]>} [buckets]  index spatial (bucketPatches), pour ne tester que les carrés proches
 */
export function updatePush(tufts, pushers, amount, sector, dt, buckets = null) {
  const recover = Math.min(1, dt * 1.4);
  for (let i = 0; i < amount.length; i++) if (amount[i] > 0) amount[i] = Math.max(0, amount[i] - recover);
  for (const p of pushers) {
    const ids = buckets ? nearbyPatches(buckets, p.x, p.y, p.r) : tufts.keys();
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

/** Index spatial des carrés de brins par case. */
export function bucketPatches(tufts) {
  const map = new Map();
  tufts.forEach((t, i) => {
    const key = `${Math.floor(t.x)},${Math.floor(t.y)}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(i);
  });
  return map;
}

export function* nearbyPatches(buckets, x, y, r) {
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

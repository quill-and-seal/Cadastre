/**
 * Biomes : un sol et une végétation, posés ensemble par le pinceau Biome de l'éditeur.
 * Chaque strate a sa densité (plantes par case², 1 case = 1,5 m), ses essences, sa gamme de
 * tailles et son espacement (part de la somme des rayons sous laquelle deux plantes de la même
 * strate ne se touchent pas). Les petites strates sont semées d'abord : elles restent sous les arbres.
 * Rien ici ne dépend de Foundry.
 */
import * as poly from "./poly.js";
import * as M from "./model.js";
import { TREE_BY_TYPE, TREE_PREFIX, treeRadius } from "./trees.js";
import { BIOME_SOILS, mulberry32 } from "./catalog.js";
import { waterRings } from "./render.js";
import { flattenNodes } from "./curves.js";
import { paintZone } from "./water-data.js";
import { generateCurrents } from "./current-gen.js";

export const BIOMES = [
  {
    id: "broadleaf", soil: BIOME_SOILS.broadleaf, swatch: ["#7a5428", "#2f6a2c"],
    layers: [
      { kinds: [["mushrooms", 1]], density: 0.03, size: [0.8, 1.3], spacing: 1.5 },
      { kinds: [["stump", 1]], density: 0.008, size: [0.8, 1.2], spacing: 2 },
      { kinds: [["fern", 1]], density: 0.12, size: [0.7, 1.3], spacing: 0.75 },
      { kinds: [["bush", 1]], density: 0.03, size: [0.7, 1.3], spacing: 0.8 },
      { kinds: [["oak", 0.4], ["beech", 0.4], ["birch", 0.2]], density: 0.045, size: [0.8, 1.35], spacing: 0.72 }
    ]
  },
  {
    id: "conifer", soil: BIOME_SOILS.conifer, swatch: ["#6e4a28", "#17442d"],
    layers: [
      { kinds: [["mushrooms", 1]], density: 0.04, size: [0.8, 1.3], spacing: 1.5 },
      { kinds: [["stump", 1]], density: 0.012, size: [0.8, 1.2], spacing: 2 },
      { kinds: [["bilberry", 1]], density: 0.15, size: [0.7, 1.4], spacing: 0.6 },
      { kinds: [["fern", 1]], density: 0.03, size: [0.7, 1.2], spacing: 0.8 },
      { kinds: [["spruce", 0.6], ["pine", 0.4]], density: 0.06, size: [0.8, 1.5], spacing: 0.68 }
    ]
  },
  {
    // Marais : vase semée de flaques ; nénuphars sur l'eau, roseaux et massettes au bord de
    // l'eau, joncs partout dans la vase, quelques saules têtards.
    id: "marsh", soil: BIOME_SOILS.marsh, swatch: ["#5a5430", "#1e3a30"],
    // Eau : chenaux qui serpentent et s'élargissent en étangs, îlots de vase entre eux.
    puddles: { channels: true, cover: 0.4, type: "muddy", bridges: true },
    layers: [
      // Bois mort : genoux de cyprès dans l'eau, chicots au bord, troncs couchés.
      { kinds: [["knees", 1]], density: 0.025, size: [0.8, 1.3], spacing: 0.8, onWater: true },
      { kinds: [["snag", 1]], density: 0.012, size: [0.8, 1.3], spacing: 0.9, nearWater: 1.5 },
      { kinds: [["log", 1]], density: 0.006, size: [0.8, 1.3], spacing: 0.9 },
      { kinds: [["lily", 1]], density: 0.3, size: [0.8, 1.3], spacing: 0.75, onWater: true },
      { kinds: [["rush", 1]], density: 0.22, size: [0.7, 1.3], spacing: 0.7 },
      { kinds: [["cattail", 1]], density: 0.12, size: [0.8, 1.25], spacing: 0.6, nearWater: 2.5 },
      { kinds: [["reed", 1]], density: 0.14, size: [0.8, 1.3], spacing: 0.55, nearWater: 3.5 },
      { kinds: [["willow", 1]], density: 0.008, size: [0.8, 1.15], spacing: 0.85 }
    ]
  }
];
export const BIOME_BY_ID = new Map(BIOMES.map((b) => [b.id, b]));

/** Nombre de variantes de chaque plante du sous-bois, et leurs graines. */
const SMALL_VARIANTS = 10, SMALL_SEEDS = 7001;

const pickWeighted = (list, rand) => {
  let x = rand() * list.reduce((a, [, w]) => a + w, 0);
  for (const [id, w] of list) { if ((x -= w) <= 0) return id; }
  return list[0][0];
};

/**
 * Peint le sol du biome dans `rings` et y sème sa végétation (en plus de celle déjà là, en
 * respectant les espacements). density : multiplicateur des densités.
 * @returns {number}  nombre de plantes posées (-1 : biome inconnu)
 */
export function sowBiome(map, rings, biomeId, rand, { density = 1 } = {}) {
  const biome = BIOME_BY_ID.get(biomeId);
  if (!biome || !rings?.length) return -1;
  M.paintArea(map, rings, biome.soil);
  addPuddles(map, rings, biome, rand, density);
  return sowLayers(map, rings, biome, rand, density, false, rings);
}

/** Sols où rien ne pousse : eau, sols construits, plages et roche. */
const BARE = ["water", "stone", "wood", "cobble", "sand", "rock"];

/** Là où le biome de la carte peut semer : toute la carte, moins l'eau, les pièces, les chemins, les murs et les sols nus. */
export function biomeArea(map) {
  let blocked = [...waterRings(map), ...map.rooms, ...M.wallBarrier(map, 0.3)];
  for (const t of BARE) blocked.push(...(map.terrains[t] ?? []));
  for (const q of map.paths ?? []) {
    const pts = flattenNodes(q.nodes, q.closed, 0.05);
    blocked.push(...poly.strokeRings(q.closed ? [...pts, pts[0]] : pts, q.width / 2 + (q.planks ? 0.7 : 0.1)));
  }
  const all = poly.rectRings(0, 0, map.width, map.height);
  return blocked.length ? poly.difference(all, poly.union([], blocked)) : all;
}

/**
 * Retire les plantes semées par un biome (ou au pinceau Biome) qui se retrouvent là où rien ne
 * pousse : eau, pièce, chemin, sol nu peints après coup. Les arbres posés à la main sont retirés
 * seulement quand de l'eau vient d'être peinte sous leur pied (before : la carte avant le
 * changement) ; un arbre posé exprès dans l'eau reste. Les objets restent toujours.
 * @param {object} [before]  carte avant le changement
 * @returns {number}  plantes retirées
 */
export function pruneBiome(map, before = null) {
  const sown = map.props.some((p) => p.b);
  const manual = before ? map.props.filter((p) => !p.b && TREE_BY_TYPE.has(p.type)) : [];
  if (!sown && !manual.length) return 0;
  const area = sown ? biomeArea(map) : null;
  let drowned = null;
  if (manual.length) {
    const now = waterRings(map), was = waterRings(before);
    drowned = new Set(manual.filter((p) => !TREE_BY_TYPE.get(p.type)?.water && poly.pointInRings(now, p.x, p.y) && !poly.pointInRings(was, p.x, p.y)));
  }
  const n = map.props.length;
  // Plantes d'eau semées (nénuphars) : gardées sur l'eau, retirées ailleurs.
  let water = null;
  map.props = map.props.filter((p) => {
    if (!p.b) return !drowned?.has(p);
    if (TREE_BY_TYPE.get(p.type)?.water) return poly.pointInRings(water ??= waterRings(map), p.x, p.y);
    return poly.pointInRings(area, p.x, p.y);
  });
  return n - map.props.length;
}

/**
 * Toute la carte devient le biome : son sol en fond (sous les sols peints), sa végétation semée
 * partout où elle peut pousser. Les plantes d'un biome précédent sont retirées d'abord ; celles
 * posées à la main restent. Biome null : retire le biome et ses plantes.
 * @returns {number}  plantes posées
 */
export function applyBiome(map, biomeId, rand, { density = 1 } = {}) {
  map.props = map.props.filter((p) => !p.b);
  map.paths = (map.paths ?? []).filter((q) => !q.b);
  if (map.waterData) map.waterData.currents = map.waterData.currents.filter((c) => !c.b);
  const biome = BIOME_BY_ID.get(biomeId);
  if (!biome) { map.biome = null; return 0; }
  map.biome = { id: biome.id, density };
  addPuddles(map, biomeArea(map), biome, rand, density);
  return sowLayers(map, biomeArea(map), biome, rand, density, true, null);
}

/** Tache aux bords irréguliers (cases), autour de (cx, cy). */
function blob(cx, cy, r, rand, el = 0.6 + rand() * 0.4) {
  const ph = [rand() * 6.28, rand() * 6.28, rand() * 6.28], rot = rand() * 6.28, pts = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const q = r * (1 + 0.18 * Math.sin(a * 2 + ph[0]) + 0.12 * Math.sin(a * 3 + ph[1]) + 0.07 * Math.sin(a * 5 + ph[2]));
    const lx = Math.cos(a) * q, ly = Math.sin(a) * q * el;
    pts.push([cx + lx * Math.cos(rot) - ly * Math.sin(rot), cy + lx * Math.sin(rot) + ly * Math.cos(rot)]);
  }
  return poly.pointsRing(pts);
}

/**
 * Eau d'un marais : des chenaux qui serpentent à travers la zone, s'élargissent par endroits en
 * étangs, se rejoignent ; quelques îlots de vase dans les étangs. Jusqu'à `cover` de la zone.
 */
function marshWater(rings, b, rand, cover) {
  const W = b.x1 - b.x0, H = b.y1 - b.y0, area = poly.totalArea(rings);
  const target = area * cover;
  let water = [];
  // Part d'eau : la zone couvre presque toujours l'eau (les débords sur ses bords comptent peu).
  const wet = () => poly.totalArea(water);
  const channels = Math.max(1, Math.round(area / 220));
  for (let c = 0; c < channels * 3 && (c < channels || wet() < target * 0.7); c++) {
    // Départ sur un bord, cap vers l'intérieur ; largeur qui varie doucement.
    const side = Math.floor(rand() * 4);
    let x = side === 0 ? b.x0 : side === 1 ? b.x1 : b.x0 + rand() * W;
    let y = side === 2 ? b.y0 : side === 3 ? b.y1 : b.y0 + rand() * H;
    let head = Math.atan2(b.y0 + H / 2 - y, b.x0 + W / 2 - x) + (rand() - 0.5) * 1.2;
    const steps = Math.ceil(Math.hypot(W, H) * (0.6 + rand() * 0.5) / 0.8);
    const w0 = 0.7 + rand() * 0.6, ph = rand() * 6.28;
    const blobs = [], pts = [[x, y]];
    // Le chenal en tronçons de six pas, chacun de sa largeur (tracés épais, peu de sommets).
    const flush = (i) => {
      if (pts.length < 2) return;
      const r = w0 * (1 + 0.45 * Math.sin(i * 0.23 + ph) + 0.25 * Math.sin(i * 0.61 + ph * 2));
      blobs.push(...poly.strokeRings(pts.splice(0, pts.length - 1), Math.max(0.45, r)));
    };
    for (let i = 0; i < steps; i++) {
      head += (rand() - 0.5) * 0.5;
      x += Math.cos(head) * 0.8; y += Math.sin(head) * 0.8;
      if (x < b.x0 - 2 || y < b.y0 - 2 || x > b.x1 + 2 || y > b.y1 + 2) break;
      pts.push([x, y]);
      if (pts.length >= 6) flush(i);
      // Étang : le chenal s'élargit.
      if (rand() < 0.045) blobs.push(blob(x + (rand() - 0.5) * 2, y + (rand() - 0.5) * 2, 1.8 + rand() * 2.6, rand));
    }
    flush(steps);
    water = poly.union(water, blobs);
  }
  // Mares isolées, jusqu'à la part d'eau voulue.
  for (let i = 0; i < 40 && wet() < target; i++) {
    const add = [];
    for (let k = 0; k < 4; k++) add.push(blob(b.x0 + rand() * W, b.y0 + rand() * H, 1 + rand() * 2.4, rand));
    water = poly.union(water, add);
  }
  // Îlots de vase dans les grandes eaux.
  const isles = [];
  for (let i = 0; i < area / 90; i++) {
    const x = b.x0 + rand() * W, y = b.y0 + rand() * H, r = 0.8 + rand() * 1.6;
    if (poly.pointInRings(water, x, y) && poly.pointInRings(water, x + r * 1.6, y) && poly.pointInRings(water, x - r * 1.6, y)) isles.push(blob(x, y, r, rand));
  }
  if (isles.length) water = poly.difference(water, isles);
  return poly.intersection(water, rings);
}

/** Eau du biome (marais) : chenaux et étangs, ou flaques, dans la zone semée. */
function addPuddles(map, rings, biome, rand, density) {
  const pd = biome.puddles;
  const b = pd && poly.ringsBounds(rings);
  if (!b) return;
  let water;
  if (pd.channels) water = marshWater(rings, b, rand, Math.min(0.7, pd.cover * density));
  else {
    const blobs = [], want = Math.round(poly.totalArea(rings) * pd.density * density + rand() - 0.5);
    for (let i = 0, tries = 0; i < want && tries < want * 10; tries++) {
      const cx = b.x0 + rand() * (b.x1 - b.x0), cy = b.y0 + rand() * (b.y1 - b.y0);
      if (!poly.pointInRings(rings, cx, cy)) continue;
      blobs.push(blob(cx, cy, pd.size[0] + rand() * (pd.size[1] - pd.size[0]), rand));
      i++;
    }
    water = blobs.length ? poly.intersection(poly.union([], blobs), rings) : [];
  }
  if (!water.length) return;
  M.paintArea(map, water, "water");
  // Eau du biome (marais : boueuse, sombre et verte, lentilles d'eau).
  if (pd.type && map.waterData) paintZone(map.waterData, water, pd.type);
  // Courants lents le long des chenaux (de toute l'eau de la carte, qui se rejoignent).
  if (pd.channels) generateCurrents(map, rand, { speed: [0.3, 0.5], mark: { b: true } });
  if (pd.bridges) addBridges(map, rings, water, b, rand, density);
}

/**
 * Ponts de planches du marais : passerelles droites jetées par-dessus les chenaux étroits, d'une
 * rive à l'autre (eau traversée : 1,2 à 6 cases), espacées. Chemins « wood » marqués b (retirés
 * avec le biome) et planks (dessin en planches disjointes).
 */
function addBridges(map, rings, water, b, rand, density) {
  if (!M.isTerrain(map, "wood")) return;
  const res = 0.25, wet = waterDistance(water, b, res), zone = waterDistance(rings, b, res);
  if (!wet || !zone) return;
  const isWet = (x, y) => wet.at(x, y) === 0, isLand = (x, y) => zone.at(x, y) === 0 && !isWet(x, y);
  const want = Math.max(1, Math.round(poly.totalArea(rings) / 260 * density));
  const W = b.x1 - b.x0, H = b.y1 - b.y0, mids = [];
  for (let t = 0, n = 0; t < want * 120 && n < want; t++) {
    const x = b.x0 + rand() * W, y = b.y0 + rand() * H;
    // Départ : sur la terre, au bord de l'eau.
    if (!isLand(x, y) || wet.at(x, y) > 0.6) continue;
    let best = null;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + rand() * 0.2, dx = Math.cos(a), dy = Math.sin(a);
      // Avance jusqu'à l'eau, la traverse, retrouve la terre ferme.
      let s = 0, enter = -1, exit = -1;
      while (s < 8) {
        s += res;
        const px = x + dx * s, py = y + dy * s;
        if (enter < 0) { if (isWet(px, py)) enter = s; else if (s > 1) break; }
        else if (!isWet(px, py)) { exit = s; break; }
      }
      if (enter < 0 || exit < 0) continue;
      const span = exit - enter;
      if (span < 1.2 || span > 6) continue;
      // Rive d'arrivée : de la terre sur au moins 0,6 case.
      if (!isLand(x + dx * (exit + 0.6), y + dy * (exit + 0.6))) continue;
      if (!best || span < best.span) best = { span, a: [x + dx * (enter - 0.55), y + dy * (enter - 0.55)], b: [x + dx * (exit + 0.55), y + dy * (exit + 0.55)] };
    }
    if (!best) continue;
    const mx = (best.a[0] + best.b[0]) / 2, my = (best.a[1] + best.b[1]) / 2;
    if (mids.some(([ox, oy]) => Math.hypot(ox - mx, oy - my) < 7)) continue;
    const q = M.addPath(map, [{ x: best.a[0], y: best.a[1] }, { x: best.b[0], y: best.b[1] }], { width: 0.9 + rand() * 0.35, terrain: "wood" });
    if (!q) continue;
    q.planks = true; q.b = true;
    mids.push([mx, my]); n++;
  }
}

/**
 * Lucioles d'un marais : points d'ancrage (cases) au-dessus de l'eau et des rives, là où elles
 * tournoient dans la scène. null hors marais.
 */
export function fireflySpots(map, seed = 1) {
  if (map.biome?.id !== "marsh") return null;
  const water = waterRings(map);
  if (!water.length) return null;
  const b = { x0: 0, y0: 0, x1: map.width, y1: map.height };
  const dist = waterDistance(water, b, 0.5);
  if (!dist) return null;
  const rand = mulberry32(seed);
  const want = Math.min(260, Math.round((map.width * map.height) / 12 * (map.biome.density ?? 1)));
  const out = [];
  for (let t = 0; t < want * 8 && out.length < want; t++) {
    const x = rand() * map.width, y = rand() * map.height, d = dist.at(x, y);
    if (d > 2.5 || (d === 0 && rand() < 0.4)) continue;
    if (map.rooms.length && poly.pointInRings(map.rooms, x, y)) continue;
    out.push([Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
  }
  return out.length ? out : null;
}

function openWater(map) {
  const w = waterRings(map), deck = [];
  for (const q of map.paths ?? []) {
    if (q.terrain === "water") continue;
    const pts = flattenNodes(q.nodes, q.closed, 0.05);
    deck.push(...poly.strokeRings(q.closed ? [...pts, pts[0]] : pts, q.width / 2 + 0.15));
  }
  return deck.length && w.length ? poly.difference(w, deck) : w;
}

/**
 * scope : zone du pinceau (null : toute la carte) ; rings : là où le biome peut semer (sans l'eau).
 * Strates onWater : sur l'eau de la zone ; nearWater : à moins de tant de cases de l'eau.
 */
function sowLayers(map, rings, biome, rand, density, mark, scope) {
  let placed = 0, water = null, dist = null;
  // Eau libre : sans les ponts et passerelles posés dessus.
  const waterNow = () => (water ??= openWater(map));
  for (const layer of biome.layers) {
    if (layer.onWater) {
      placed += sowLayer(map, scope ? poly.intersection(waterNow(), scope) : waterNow(), biome, layer, rand, density, mark);
    } else if (layer.nearWater) {
      // Près de l'eau : distance à l'eau lue dans une grille (bien plus rapide qu'un décalage
      // des contours de l'eau, très découpés dans un marais).
      if (!waterNow().length) continue;
      dist ??= waterDistance(waterNow(), poly.ringsBounds(rings));
      if (!dist) continue;
      const d = layer.nearWater;
      placed += sowLayer(map, rings, biome, layer, rand, density, mark, (x, y) => dist.at(x, y) <= d, dist.areaWithin(d));
    } else {
      placed += sowLayer(map, rings, biome, layer, rand, density, mark);
    }
  }
  return placed;
}

/**
 * Distance à l'eau (cases), sur une grille d'un demi-case : contours remplis ligne par ligne,
 * puis distance de chanfrein en deux passes.
 * @returns {{at:(x:number,y:number)=>number, areaWithin:(d:number)=>number}|null}
 */
function waterDistance(water, b, res = 0.5) {
  if (!b) return null;
  const x0 = b.x0, y0 = b.y0, W = Math.max(1, Math.ceil((b.x1 - b.x0) / res)), H = Math.max(1, Math.ceil((b.y1 - b.y0) / res));
  const D = new Float32Array(W * H).fill(1e9), inW = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) {
    const y = y0 + (j + 0.5) * res, xs = [];
    for (const r of water) {
      const n = r.length / 2;
      for (let k = 0; k < n; k++) {
        const ax = r[k * 2], ay = r[k * 2 + 1], bx = r[((k + 1) % n) * 2], by = r[((k + 1) % n) * 2 + 1];
        if ((ay <= y) !== (by <= y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
      }
    }
    xs.sort((a, c) => a - c);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - x0) / res - 0.5)), i1 = Math.min(W - 1, Math.floor((xs[k + 1] - x0) / res - 0.5));
      for (let i = i0; i <= i1; i++) { D[j * W + i] = 0; inW[j * W + i] = 1; }
    }
  }
  const S2 = Math.SQRT2;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    let v = D[j * W + i];
    if (i > 0) v = Math.min(v, D[j * W + i - 1] + 1);
    if (j > 0) {
      v = Math.min(v, D[(j - 1) * W + i] + 1);
      if (i > 0) v = Math.min(v, D[(j - 1) * W + i - 1] + S2);
      if (i < W - 1) v = Math.min(v, D[(j - 1) * W + i + 1] + S2);
    }
    D[j * W + i] = v;
  }
  for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) {
    let v = D[j * W + i];
    if (i < W - 1) v = Math.min(v, D[j * W + i + 1] + 1);
    if (j < H - 1) {
      v = Math.min(v, D[(j + 1) * W + i] + 1);
      if (i < W - 1) v = Math.min(v, D[(j + 1) * W + i + 1] + S2);
      if (i > 0) v = Math.min(v, D[(j + 1) * W + i - 1] + S2);
    }
    D[j * W + i] = v;
  }
  return {
    at: (x, y) => {
      const i = Math.floor((x - x0) / res), j = Math.floor((y - y0) / res);
      return i < 0 || j < 0 || i >= W || j >= H ? 1e9 : D[j * W + i] * res;
    },
    // Surface de terre à moins de d de l'eau (cases²).
    areaWithin: (d) => {
      let n = 0;
      for (let k = 0; k < D.length; k++) if (!inW[k] && D[k] * res <= d) n++;
      return n * res * res;
    }
  };
}

function sowLayer(map, rings, biome, layer, rand, density, mark, accept = null, zoneArea = null) {
  const b = poly.ringsBounds(rings);
  if (!b) return 0;
  const { x0, y0, x1, y1 } = b;
  const area = zoneArea ?? poly.totalArea(rings);
  // Plantes déjà posées de la strate, pour l'espacement.
  const kindsOf = (l) => new Set(l.kinds.map(([k]) => `${TREE_PREFIX}${k}`));
  let placed = 0;
  {
    const types = kindsOf(layer);
    const near = map.props.filter((p) => types.has(p.type)).map((p) => ({ x: p.x, y: p.y, r: treeRadius(TREE_BY_TYPE.get(p.type), p.k) }));
    const want = Math.round(area * layer.density * density + rand() - 0.5);
    for (let tries = 0, n = 0; n < want && tries < want * 12; tries++) {
      const x = x0 + rand() * (x1 - x0), y = y0 + rand() * (y1 - y0);
      if (accept && !accept(x, y)) continue;
      if (!poly.pointInRings(rings, x, y)) continue;
      const kind = pickWeighted(layer.kinds, rand), type = `${TREE_PREFIX}${kind}`, def = TREE_BY_TYPE.get(type);
      // Sous-bois (fougères, myrtilles, buissons, souches, champignons) : quelques variantes
      // d'une même plante (graine, taille), dessinées une seule fois chacune et réutilisées,
      // tournées au hasard à l'affichage ; personne ne reconnaît deux fougères identiques et tournées.
      // Les arbres restent tous uniques.
      const small = layer !== biome.layers.at(-1);
      let k = layer.size[0] + rand() * (layer.size[1] - layer.size[0]);
      if (small) k = layer.size[0] + Math.round((k - layer.size[0]) / (layer.size[1] - layer.size[0]) * 3) / 3 * (layer.size[1] - layer.size[0]);
      const r = treeRadius(def, k);
      if (near.some((q) => Math.hypot(q.x - x, q.y - y) < (q.r + r) * layer.spacing)) continue;
      const angle = Math.round(rand() * 360);
      const seed = small ? SMALL_SEEDS + Math.floor(rand() * SMALL_VARIANTS) : Math.floor(rand() * 2 ** 32);
      const prop = M.addProp(map, type, x, y, angle, k, seed);
      if (!prop) continue;
      if (mark) prop.b = 1;
      near.push({ x, y, r });
      n++; placed++;
    }
  }
  return placed;
}

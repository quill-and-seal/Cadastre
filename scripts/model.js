/**
 * Modèle de carte vectoriel : données pures, sans Foundry ni DOM.
 * Unités : cases (une case = `gridSize` px dans la scène). La grille n'est qu'une aide.
 *
 *   terrains : { idDeSol: anneaux }   zones de sol, sans recouvrement entre sols
 *   rooms    : anneaux                emprise des pièces (non dessinée, sert à fusionner les pièces)
 *   walls    : [{ id, closed, nodes:[{x,y,i?,o?}] }]
 *   doors    : [{ id, wall, s, w, kind:"door"|"secret" }]   s : position du centre le long du mur
 *   props    : [{ id, type, x, y, a, k }]                   centre, angle en degrés, échelle
 *
 * Les fonctions de modification changent la carte sur place et renvoient true si
 * quelque chose a changé (pour ne pas encombrer l'historique).
 */
import {
  FORMAT_VERSION, MIN_CELLS, MAX_CELLS, DEFAULT_GRID_SIZE, MIN_GRID_SIZE, MAX_GRID_SIZE
} from "./constants.js";
import { TERRAIN_IDS, PROP_BY_ID } from "./catalog.js";
import { flattenNodes, cleanNode, project, polylineLength, round3, rdp } from "./curves.js";
import * as poly from "./poly.js";

export const DOOR_KINDS = ["door", "secret"];
export const WALL_TOLERANCE = 0.02;

const clamp = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const clampInt = (v, min, max, fallback) => Math.round(clamp(v, min, max, fallback));
const isPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

/* -------------------------------------------- */
/*  Création et validation                      */
/* -------------------------------------------- */

export function createMap({ name = "", width = 30, height = 20, gridSize = DEFAULT_GRID_SIZE, background = "#1d1b19" } = {}) {
  return {
    v: FORMAT_VERSION,
    name: String(name ?? ""),
    width: clampInt(width, MIN_CELLS, MAX_CELLS, 30),
    height: clampInt(height, MIN_CELLS, MAX_CELLS, 20),
    gridSize: clampInt(gridSize, MIN_GRID_SIZE, MAX_GRID_SIZE, DEFAULT_GRID_SIZE),
    background: /^#[0-9a-f]{6}$/i.test(background) ? background : "#1d1b19",
    terrains: {},
    rooms: [],
    walls: [],
    doors: [],
    props: [],
    seq: 0,
    sceneId: null
  };
}

const nextId = (map, prefix) => `${prefix}${++map.seq}`;

function cleanRings(rings) {
  return (Array.isArray(rings) ? rings : [])
    .filter((r) => Array.isArray(r) && r.length >= 6 && r.length % 2 === 0 && r.every(Number.isFinite))
    .map((r) => r.map(round3));
}

function cleanNodes(nodes) {
  return (Array.isArray(nodes) ? nodes : [])
    .filter((n) => n && Number.isFinite(n.x) && Number.isFinite(n.y))
    .map((n) => cleanNode({ x: n.x, y: n.y, i: isPoint(n.i) ? n.i : null, o: isPoint(n.o) ? n.o : null }));
}

/**
 * Remet en forme une carte venue de l'extérieur (sauvegarde, import) :
 * valeurs bornées, entrées inconnues ou abîmées écartées.
 */
export function normalizeMap(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const map = createMap(src);
  map.sceneId = typeof src.sceneId === "string" ? src.sceneId : null;
  map.seq = clampInt(src.seq, 0, Number.MAX_SAFE_INTEGER, 0);
  const ids = new Set();
  const uid = (id, prefix) => {
    let out = typeof id === "string" && id && !ids.has(id) ? id : nextId(map, prefix);
    while (ids.has(out)) out = nextId(map, prefix);
    ids.add(out);
    return out;
  };

  for (const [terrain, rings] of Object.entries(src.terrains ?? {})) {
    if (!TERRAIN_IDS.has(terrain)) continue;
    const clean = cleanRings(rings);
    if (clean.length) map.terrains[terrain] = clean;
  }
  map.rooms = cleanRings(src.rooms);

  for (const w of Array.isArray(src.walls) ? src.walls : []) {
    const nodes = cleanNodes(w?.nodes);
    if (nodes.length < 2) continue;
    map.walls.push({ id: uid(w.id, "w"), closed: !!w.closed && nodes.length > 2, nodes });
  }
  const wallIds = new Set(map.walls.map((w) => w.id));
  for (const d of Array.isArray(src.doors) ? src.doors : []) {
    if (!d || !wallIds.has(d.wall) || !Number.isFinite(d.s)) continue;
    map.doors.push({
      id: uid(d.id, "d"), wall: d.wall, s: round3(Math.max(0, d.s)),
      w: round3(clamp(d.w, 0.25, 8, 1)), kind: DOOR_KINDS.includes(d.kind) ? d.kind : "door"
    });
  }
  for (const p of Array.isArray(src.props) ? src.props : []) {
    if (!p || !PROP_BY_ID.has(p.type) || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    map.props.push({
      id: uid(p.id, "p"), type: p.type, x: round3(p.x), y: round3(p.y),
      a: round3(((Number(p.a) || 0) % 360 + 360) % 360), k: round3(clamp(p.k, 0.25, 4, 1))
    });
  }
  return map;
}

export const cloneMap = (map) => JSON.parse(JSON.stringify(map));

export function isEmpty(map) {
  return !Object.keys(map.terrains).length && !map.walls.length && !map.props.length;
}

/* -------------------------------------------- */
/*  Murs : géométrie                            */
/* -------------------------------------------- */

export const wallPoints = (wall, tol = WALL_TOLERANCE) => flattenNodes(wall.nodes, wall.closed, tol);

/** Mur le plus proche d'un point, à moins de `maxDist`. */
export function nearestWall(map, x, y, maxDist = Infinity) {
  let best = null;
  for (const wall of map.walls) {
    const pts = wallPoints(wall);
    const hit = project(pts, wall.closed, x, y);
    if (hit.d <= maxDist && (!best || hit.d < best.d)) best = { wall, ...hit, length: polylineLength(pts, wall.closed) };
  }
  return best;
}

/** Position des portes dans le plan (pour les raccrocher après une modification des murs). */
function doorAnchors(map) {
  const out = new Map();
  for (const door of map.doors) {
    const wall = map.walls.find((w) => w.id === door.wall);
    if (wall) out.set(door.id, pointOnWall(wall, door.s));
  }
  return out;
}

export function pointOnWall(wall, s) {
  const pts = wallPoints(wall);
  if (!pts.length) return null;
  // Abscisse → point : parcours simple.
  let acc = 0;
  const n = pts.length, segs = wall.closed ? n : n - 1;
  const total = polylineLength(pts, wall.closed);
  let target = wall.closed ? ((s % total) + total) % total : Math.min(total, Math.max(0, s));
  for (let k = 0; k < segs; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[(k + 1) % n];
    const len = Math.hypot(bx - ax, by - ay);
    if (acc + len >= target || k === segs - 1) {
      const t = len ? Math.min(1, (target - acc) / len) : 0;
      return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, tx: len ? (bx - ax) / len : 1, ty: len ? (by - ay) / len : 0 };
    }
    acc += len;
  }
  return { x: pts[0][0], y: pts[0][1], tx: 1, ty: 0 };
}

/** Raccroche chaque porte au mur le plus proche de sa position d'avant ; les portes orphelines disparaissent. */
function rebindDoors(map, anchors) {
  map.doors = map.doors.filter((door) => {
    const pos = anchors.get(door.id);
    if (!pos) return false;
    const hit = nearestWall(map, pos.x, pos.y, 0.05);
    if (!hit) return false;
    door.wall = hit.wall.id;
    door.s = round3(hit.s);
    return true;
  });
}

/* -------------------------------------------- */
/*  Sols                                        */
/* -------------------------------------------- */

/** Peint une zone avec un sol : elle remplace les autres sols à cet endroit. */
export function paintArea(map, rings, terrain) {
  if (!TERRAIN_IDS.has(terrain) || !rings?.length) return false;
  const clipped = poly.intersection(rings, poly.rectRings(0, 0, map.width, map.height));
  if (!clipped.length) return false;
  const before = JSON.stringify(map.terrains);
  for (const id of Object.keys(map.terrains)) {
    if (id === terrain) continue;
    const rest = poly.difference(map.terrains[id], clipped);
    if (rest.length) map.terrains[id] = rest;
    else delete map.terrains[id];
  }
  map.terrains[terrain] = poly.union(map.terrains[terrain] ?? [], clipped);
  return JSON.stringify(map.terrains) !== before;
}

/**
 * Gomme une zone.
 * @param {{floor?:boolean, walls?:boolean, props?:boolean}} what
 */
export function eraseArea(map, rings, { floor = true, walls = true, props = true } = {}) {
  if (!rings?.length) return false;
  let changed = false;
  if (floor) {
    for (const id of Object.keys(map.terrains)) {
      const before = map.terrains[id];
      const rest = poly.difference(before, rings);
      if (JSON.stringify(rest) !== JSON.stringify(before)) changed = true;
      if (rest.length) map.terrains[id] = rest;
      else delete map.terrains[id];
    }
    map.rooms = poly.difference(map.rooms, rings);
  }
  if (walls) changed = clipWalls(map, rings) || changed;
  if (props) {
    const n = map.props.length;
    map.props = map.props.filter((p) => !poly.pointInRings(rings, p.x, p.y));
    changed = changed || map.props.length !== n;
  }
  return changed;
}

/* -------------------------------------------- */
/*  Murs : modifications                        */
/* -------------------------------------------- */

export function addWall(map, nodes, closed = false) {
  const clean = cleanNodes(nodes);
  if (clean.length < 2) return null;
  const wall = { id: nextId(map, "w"), closed: !!closed && clean.length > 2, nodes: clean };
  map.walls.push(wall);
  return wall;
}

/** Polyligne → nœuds de coins, en retirant les points inutiles. */
function polylineNodes(points) {
  return rdp(points, 0.004).map(([x, y]) => cleanNode({ x, y }));
}

/**
 * Retire les parties de murs à l'intérieur d'une zone (ou à l'extérieur, `inside: true` les garde).
 * Un mur coupé devient un ou plusieurs murs à coins ; les portes suivent leur morceau.
 */
function clipWalls(map, rings, { keepInside = false } = {}) {
  const anchors = doorAnchors(map);
  let changed = false;
  const next = [];
  for (const wall of map.walls) {
    const pts = wallPoints(wall);
    const pieces = poly.clipPolyline(pts, wall.closed, rings, { inside: keepInside });
    const untouched = pieces.length === 1
      && Math.abs(polylineLength(pieces[0], false) - polylineLength(pts, wall.closed)) < 1e-6;
    if (untouched) { next.push(wall); continue; }
    changed = true;
    for (const piece of pieces) {
      if (polylineLength(piece, false) < 0.02) continue;
      next.push({ id: nextId(map, "w"), closed: false, nodes: polylineNodes(piece) });
    }
  }
  if (!changed) return false;
  map.walls = next;
  rebindDoors(map, anchors);
  return true;
}

export function removeWall(map, id) {
  const n = map.walls.length;
  map.walls = map.walls.filter((w) => w.id !== id);
  map.doors = map.doors.filter((d) => d.wall !== id);
  return map.walls.length !== n;
}

export function moveWall(map, id, dx, dy) {
  const wall = map.walls.find((w) => w.id === id);
  if (!wall || (!dx && !dy)) return false;
  for (const n of wall.nodes) { n.x = round3(n.x + dx); n.y = round3(n.y + dy); }
  return true;
}

/** Déplace un nœud ; les portes gardent leur position relative le long du mur. */
export function moveNode(map, id, index, x, y) {
  const wall = map.walls.find((w) => w.id === id);
  const node = wall?.nodes[index];
  if (!node) return false;
  const before = polylineLength(wallPoints(wall), wall.closed);
  node.x = round3(x); node.y = round3(y);
  rescaleDoors(map, wall, before);
  return true;
}

/** Change une poignée (`which` : "i" ou "o") ; `mirror` garde la poignée opposée alignée. */
export function moveHandle(map, id, index, which, dx, dy, mirror = true) {
  const wall = map.walls.find((w) => w.id === id);
  const node = wall?.nodes[index];
  if (!node || (which !== "i" && which !== "o")) return false;
  const before = polylineLength(wallPoints(wall), wall.closed);
  node[which] = [round3(dx), round3(dy)];
  const other = which === "i" ? "o" : "i";
  if (mirror && node[other]) {
    const len = Math.hypot(...node[other]) || Math.hypot(dx, dy);
    const k = len / (Math.hypot(dx, dy) || 1);
    node[other] = [round3(-dx * k), round3(-dy * k)];
  }
  Object.assign(node, cleanNode(node));
  if (!node.i) delete node.i;
  if (!node.o) delete node.o;
  rescaleDoors(map, wall, before);
  return true;
}

/** Coin ↔ courbe : un coin reçoit des poignées tangentes à ses voisins, une courbe les perd. */
export function toggleNodeSmooth(map, id, index) {
  const wall = map.walls.find((w) => w.id === id);
  const node = wall?.nodes[index];
  if (!node) return false;
  if (node.i || node.o) {
    delete node.i; delete node.o;
    return true;
  }
  const n = wall.nodes.length;
  const prev = wall.nodes[index - 1] ?? (wall.closed ? wall.nodes[n - 1] : null);
  const next = wall.nodes[index + 1] ?? (wall.closed ? wall.nodes[0] : null);
  const a = prev ?? node, b = next ?? node;
  const tx = (b.x - a.x) / 6 || 0.3, ty = (b.y - a.y) / 6;
  Object.assign(node, cleanNode({ x: node.x, y: node.y, i: [-tx, -ty], o: [tx, ty] }));
  return true;
}

export function removeNode(map, id, index) {
  const wall = map.walls.find((w) => w.id === id);
  if (!wall) return false;
  if (wall.nodes.length <= 2) return removeWall(map, id);
  wall.nodes.splice(index, 1);
  if (wall.nodes.length < 3) wall.closed = false;
  return true;
}

function rescaleDoors(map, wall, before) {
  const after = polylineLength(wallPoints(wall), wall.closed);
  if (!before || !after) return;
  for (const d of map.doors) if (d.wall === wall.id) d.s = round3((d.s / before) * after);
}

/* -------------------------------------------- */
/*  Pièces                                      */
/* -------------------------------------------- */

/**
 * Pièce : sol dans la forme, mur sur son contour. Les murs déjà là à l'intérieur
 * disparaissent et le contour s'arrête aux pièces existantes : deux pièces qui se
 * chevauchent n'en font qu'une. Les portes existantes restent sur ce qui reste de leur mur.
 */
export function addRoom(map, nodes, terrain) {
  const outline = flattenNodes(nodes, true, WALL_TOLERANCE);
  const shape = poly.normalizeRings([poly.pointsRing(flattenNodes(nodes, true, 0.005))]);
  if (!shape.length) return false;

  if (terrain) paintArea(map, shape, terrain);
  const inner = poly.offsetRings(shape, -0.03);
  if (inner.length) clipWalls(map, inner);

  const existing = poly.offsetRings(map.rooms, -0.03);
  if (!existing.length || !poly.intersection(existing, shape).length) {
    addWall(map, nodes, true);
  } else {
    for (const piece of poly.clipPolyline(outline, true, existing)) {
      if (polylineLength(piece, false) >= 0.02) addWall(map, polylineNodes(piece), false);
    }
  }
  map.rooms = poly.union(map.rooms, shape);
  return true;
}

/* -------------------------------------------- */
/*  Portes                                      */
/* -------------------------------------------- */

export function addDoor(map, wallId, s, w = 1, kind = "door") {
  const wall = map.walls.find((x) => x.id === wallId);
  if (!wall) return null;
  const door = { id: nextId(map, "d"), wall: wallId, s: round3(s), w: round3(clamp(w, 0.25, 8, 1)), kind: DOOR_KINDS.includes(kind) ? kind : "door" };
  map.doors.push(door);
  return door;
}

export function updateDoor(map, id, changes) {
  const door = map.doors.find((d) => d.id === id);
  if (!door) return false;
  if (changes.w != null) door.w = round3(clamp(changes.w, 0.25, 8, door.w));
  if (changes.kind && DOOR_KINDS.includes(changes.kind)) door.kind = changes.kind;
  if (changes.s != null) door.s = round3(Math.max(0, changes.s));
  return true;
}

export function removeDoor(map, id) {
  const n = map.doors.length;
  map.doors = map.doors.filter((d) => d.id !== id);
  return map.doors.length !== n;
}

/** Extrémités d'une porte (corde entre les deux bords, même sur un mur courbe). */
export function doorEnds(map, door) {
  const wall = map.walls.find((w) => w.id === door.wall);
  if (!wall) return null;
  const a = pointOnWall(wall, door.s - door.w / 2), b = pointOnWall(wall, door.s + door.w / 2);
  return a && b ? { a: [a.x, a.y], b: [b.x, b.y] } : null;
}

/* -------------------------------------------- */
/*  Objets                                      */
/* -------------------------------------------- */

export function addProp(map, type, x, y, a = 0, k = 1) {
  if (!PROP_BY_ID.has(type) || x < 0 || y < 0 || x > map.width || y > map.height) return null;
  const prop = { id: nextId(map, "p"), type, x: round3(x), y: round3(y), a: round3(((a % 360) + 360) % 360), k: round3(clamp(k, 0.25, 4, 1)) };
  map.props.push(prop);
  return prop;
}

export function updateProp(map, id, changes) {
  const p = map.props.find((q) => q.id === id);
  if (!p) return false;
  if (changes.x != null) p.x = round3(changes.x);
  if (changes.y != null) p.y = round3(changes.y);
  if (changes.a != null) p.a = round3(((changes.a % 360) + 360) % 360);
  if (changes.k != null) p.k = round3(clamp(changes.k, 0.25, 4, p.k));
  return true;
}

export function removeProp(map, id) {
  const n = map.props.length;
  map.props = map.props.filter((p) => p.id !== id);
  return map.props.length !== n;
}

/** Objet sous un point (le plus haut d'abord), en tenant compte de l'angle et de l'échelle. */
export function propAt(map, x, y) {
  for (let i = map.props.length - 1; i >= 0; i--) {
    const p = map.props[i];
    const def = PROP_BY_ID.get(p.type);
    const r = (-p.a * Math.PI) / 180;
    const dx = x - p.x, dy = y - p.y;
    const lx = (dx * Math.cos(r) - dy * Math.sin(r)) / p.k, ly = (dx * Math.sin(r) + dy * Math.cos(r)) / p.k;
    if (Math.abs(lx) <= def.w / 2 && Math.abs(ly) <= def.h / 2) return p;
  }
  return null;
}

/* -------------------------------------------- */
/*  Carte entière                               */
/* -------------------------------------------- */

/** Change la taille de la carte : ce qui dépasse est rogné. */
export function resizeMap(map, width, height) {
  const next = createMap({ width, height });
  if (next.width === map.width && next.height === map.height) return false;
  map.width = next.width;
  map.height = next.height;
  const bounds = poly.rectRings(0, 0, map.width, map.height);
  for (const id of Object.keys(map.terrains)) {
    const rest = poly.intersection(map.terrains[id], bounds);
    if (rest.length) map.terrains[id] = rest;
    else delete map.terrains[id];
  }
  map.rooms = poly.intersection(map.rooms, bounds);
  clipWalls(map, poly.offsetRings(bounds, 0.001), { keepInside: true });
  map.props = map.props.filter((p) => p.x <= map.width && p.y <= map.height);
  return true;
}

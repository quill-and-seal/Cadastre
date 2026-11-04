/**
 * Modèle de carte : données pures, sans Foundry ni DOM.
 *
 * Une carte est une grille de `cols`×`rows` cases :
 *   floor : { "x,y": idDeSol }                       sol de chaque case peinte
 *   edges : { "h,x,y" | "v,x,y": "wall"|"door"|"secret" }
 *           h,x,y : arête horizontale de (x,y) à (x+1,y)
 *           v,x,y : arête verticale   de (x,y) à (x,y+1)
 *   props : [{ id, type, x, y, r }]                  objet posé, case en haut à gauche, r = quarts de tour
 *
 * Les fonctions de modification changent la carte sur place et renvoient
 * true si quelque chose a changé (pour ne pas encombrer l'historique).
 */
import {
  FORMAT_VERSION, MIN_CELLS, MAX_CELLS,
  DEFAULT_GRID_SIZE, MIN_GRID_SIZE, MAX_GRID_SIZE
} from "./constants.js";
import { TERRAIN_IDS, PROP_BY_ID } from "./catalog.js";

export const EDGE_KINDS = ["wall", "door", "secret"];
const EDGE_KIND_SET = new Set(EDGE_KINDS);

const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export const cellKey = (x, y) => `${x},${y}`;
export const edgeKey = (o, x, y) => `${o},${x},${y}`;

export function parseCellKey(key) {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

export function parseEdgeKey(key) {
  const [o, x, y] = key.split(",");
  return { o, x: Number(x), y: Number(y) };
}

/** Extrémités d'une arête, en coordonnées de sommets. */
export function edgeEnds({ o, x, y }) {
  return o === "h" ? [[x, y], [x + 1, y]] : [[x, y], [x, y + 1]];
}

/* -------------------------------------------- */
/*  Création et validation                      */
/* -------------------------------------------- */

export function createMap({ name = "", cols = 24, rows = 18, gridSize = DEFAULT_GRID_SIZE, background = "#1d1b19" } = {}) {
  return {
    v: FORMAT_VERSION,
    name: String(name),
    cols: clampInt(cols, MIN_CELLS, MAX_CELLS, 24),
    rows: clampInt(rows, MIN_CELLS, MAX_CELLS, 18),
    gridSize: clampInt(gridSize, MIN_GRID_SIZE, MAX_GRID_SIZE, DEFAULT_GRID_SIZE),
    background: /^#[0-9a-f]{6}$/i.test(background) ? background : "#1d1b19",
    floor: {},
    edges: {},
    props: [],
    seq: 0,
    sceneId: null
  };
}

export const inBounds = (map, x, y) =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < map.cols && y < map.rows;

export function edgeInBounds(map, o, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (o === "h") return x >= 0 && x < map.cols && y >= 0 && y <= map.rows;
  if (o === "v") return x >= 0 && x <= map.cols && y >= 0 && y < map.rows;
  return false;
}

/** Taille d'un objet une fois tourné. */
export function propFootprint(type, r = 0) {
  const def = PROP_BY_ID.get(type);
  if (!def) return null;
  return r % 2 ? { w: def.h, h: def.w } : { w: def.w, h: def.h };
}

export function propFits(map, type, x, y, r = 0) {
  const fp = propFootprint(type, r);
  return !!fp && inBounds(map, x, y) && x + fp.w <= map.cols && y + fp.h <= map.rows;
}

/**
 * Remet en forme une carte venue de l'extérieur (sauvegarde, import) :
 * valeurs bornées, entrées inconnues ou hors de la grille écartées.
 */
export function normalizeMap(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const map = createMap(src);
  map.sceneId = typeof src.sceneId === "string" ? src.sceneId : null;

  for (const [key, terrain] of Object.entries(src.floor ?? {})) {
    const { x, y } = parseCellKey(key);
    if (inBounds(map, x, y) && TERRAIN_IDS.has(terrain)) map.floor[cellKey(x, y)] = terrain;
  }
  for (const [key, kind] of Object.entries(src.edges ?? {})) {
    const { o, x, y } = parseEdgeKey(key);
    if (edgeInBounds(map, o, x, y) && EDGE_KIND_SET.has(kind)) map.edges[edgeKey(o, x, y)] = kind;
  }
  let seq = clampInt(src.seq, 0, Number.MAX_SAFE_INTEGER, 0);
  for (const p of Array.isArray(src.props) ? src.props : []) {
    const r = clampInt(p?.r, 0, 3, 0);
    if (!p || !propFits(map, p.type, p.x, p.y, r)) continue;
    const id = typeof p.id === "string" && p.id ? p.id : `p${++seq}`;
    map.props.push({ id, type: p.type, x: p.x, y: p.y, r });
  }
  map.seq = Math.max(seq, map.props.length);
  return map;
}

export const cloneMap = (map) => JSON.parse(JSON.stringify(map));

/* -------------------------------------------- */
/*  Sols                                        */
/* -------------------------------------------- */

/** Cases couvertes par un pinceau carré de côté `size`, centré sur (x,y), dans la carte. */
export function brushCells(map, x, y, size = 1) {
  const half = Math.floor((size - 1) / 2);
  const cells = [];
  for (let j = y - half; j < y - half + size; j++) {
    for (let i = x - half; i < x - half + size; i++) {
      if (inBounds(map, i, j)) cells.push([i, j]);
    }
  }
  return cells;
}

/** Peint des cases ; terrain null efface le sol. */
export function paintCells(map, cells, terrain) {
  let changed = false;
  for (const [x, y] of cells) {
    if (!inBounds(map, x, y)) continue;
    const key = cellKey(x, y);
    if (terrain == null) {
      if (key in map.floor) { delete map.floor[key]; changed = true; }
    } else if (map.floor[key] !== terrain) {
      map.floor[key] = terrain;
      changed = true;
    }
  }
  return changed;
}

/** Remplissage par diffusion : toutes les cases reliées qui ont le même sol, sans traverser les murs. */
export function fillCells(map, x, y) {
  if (!inBounds(map, x, y)) return [];
  const target = map.floor[cellKey(x, y)] ?? null;
  const seen = new Set([cellKey(x, y)]);
  const out = [];
  const stack = [[x, y]];
  const steps = [
    [1, 0, "v", 1, 0], [-1, 0, "v", 0, 0],
    [0, 1, "h", 0, 1], [0, -1, "h", 0, 0]
  ];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    out.push([cx, cy]);
    for (const [dx, dy, o, ox, oy] of steps) {
      const nx = cx + dx, ny = cy + dy;
      const key = cellKey(nx, ny);
      if (seen.has(key) || !inBounds(map, nx, ny)) continue;
      if ((map.floor[key] ?? null) !== target) continue;
      if (map.edges[edgeKey(o, cx + ox, cy + oy)]) continue;
      seen.add(key);
      stack.push([nx, ny]);
    }
  }
  return out;
}

/* -------------------------------------------- */
/*  Murs et portes                              */
/* -------------------------------------------- */

export function setEdge(map, o, x, y, kind) {
  if (!edgeInBounds(map, o, x, y)) return false;
  const key = edgeKey(o, x, y);
  if (kind == null) {
    if (!(key in map.edges)) return false;
    delete map.edges[key];
    return true;
  }
  if (!EDGE_KIND_SET.has(kind) || map.edges[key] === kind) return false;
  map.edges[key] = kind;
  return true;
}

/** Outil porte : rien ou mur → porte → porte secrète → porte. */
export function cycleDoor(map, o, x, y) {
  const current = map.edges[edgeKey(o, x, y)];
  return setEdge(map, o, x, y, current === "door" ? "secret" : "door");
}

/**
 * Arêtes d'une ligne droite entre deux sommets. La ligne suit l'axe dominant
 * et part du premier sommet : un tracé un peu de travers reste droit.
 */
export function lineEdges([ax, ay], [bx, by]) {
  const edges = [];
  if (Math.abs(bx - ax) >= Math.abs(by - ay)) {
    for (let x = Math.min(ax, bx); x < Math.max(ax, bx); x++) edges.push({ o: "h", x, y: ay });
  } else {
    for (let y = Math.min(ay, by); y < Math.max(ay, by); y++) edges.push({ o: "v", x: ax, y });
  }
  return edges;
}

/** Point d'arrivée réel d'une ligne (projeté sur l'axe dominant). */
export function lineEnd([ax, ay], [bx, by]) {
  return Math.abs(bx - ax) >= Math.abs(by - ay) ? [bx, ay] : [ax, by];
}

/** Pose (kind) ou efface (null) les murs d'une ligne. Les portes ne sont écrasées que par la gomme. */
export function setLine(map, a, b, kind) {
  let changed = false;
  for (const { o, x, y } of lineEdges(a, b)) {
    const current = map.edges[edgeKey(o, x, y)];
    if (kind && current && current !== "wall") continue;
    changed = setEdge(map, o, x, y, kind) || changed;
  }
  return changed;
}

/** Rectangle de cases normalisé à partir de deux coins. */
export function normRect([ax, ay], [bx, by]) {
  return { x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) };
}

/** Arêtes du pourtour et de l'intérieur d'un rectangle de cases (bornes incluses). */
export function rectEdges({ x0, y0, x1, y1 }) {
  const perimeter = [], interior = [];
  for (let x = x0; x <= x1; x++) {
    perimeter.push({ o: "h", x, y: y0 }, { o: "h", x, y: y1 + 1 });
    for (let y = y0 + 1; y <= y1; y++) interior.push({ o: "h", x, y });
  }
  for (let y = y0; y <= y1; y++) {
    perimeter.push({ o: "v", x: x0, y }, { o: "v", x: x1 + 1, y });
    for (let x = x0 + 1; x <= x1; x++) interior.push({ o: "v", x, y });
  }
  return { perimeter, interior };
}

/**
 * Pièce : sol peint, murs sur le pourtour (les portes existantes restent),
 * murs intérieurs retirés pour que deux pièces qui se chevauchent n'en fassent qu'une.
 */
export function drawRoom(map, a, b, terrain) {
  const rect = normRect(a, b);
  rect.x0 = Math.max(0, rect.x0); rect.y0 = Math.max(0, rect.y0);
  rect.x1 = Math.min(map.cols - 1, rect.x1); rect.y1 = Math.min(map.rows - 1, rect.y1);
  if (rect.x0 > rect.x1 || rect.y0 > rect.y1) return false;

  const cells = [];
  for (let y = rect.y0; y <= rect.y1; y++) for (let x = rect.x0; x <= rect.x1; x++) cells.push([x, y]);
  let changed = paintCells(map, cells, terrain);

  const { perimeter, interior } = rectEdges(rect);
  for (const { o, x, y } of interior) changed = setEdge(map, o, x, y, null) || changed;
  for (const { o, x, y } of perimeter) {
    const current = map.edges[edgeKey(o, x, y)];
    if (current === "door" || current === "secret") continue;
    changed = setEdge(map, o, x, y, "wall") || changed;
  }
  return changed;
}

/* -------------------------------------------- */
/*  Objets                                      */
/* -------------------------------------------- */

export function addProp(map, type, x, y, r = 0) {
  if (!propFits(map, type, x, y, r)) return null;
  const prop = { id: `p${++map.seq}`, type, x, y, r: ((r % 4) + 4) % 4 };
  map.props.push(prop);
  return prop;
}

/** Objet le plus haut (le dernier posé) qui couvre une case. */
export function propAt(map, x, y) {
  for (let i = map.props.length - 1; i >= 0; i--) {
    const p = map.props[i];
    const fp = propFootprint(p.type, p.r);
    if (fp && x >= p.x && y >= p.y && x < p.x + fp.w && y < p.y + fp.h) return p;
  }
  return null;
}

export function removeProp(map, id) {
  const i = map.props.findIndex((p) => p.id === id);
  if (i < 0) return false;
  map.props.splice(i, 1);
  return true;
}

/** Quart de tour sur place ; refusé si l'objet tourné sortirait de la carte. */
export function rotateProp(map, id) {
  const p = map.props.find((q) => q.id === id);
  if (!p) return false;
  const r = (p.r + 1) % 4;
  if (!propFits(map, p.type, p.x, p.y, r)) return false;
  p.r = r;
  return true;
}

/* -------------------------------------------- */
/*  Carte entière                               */
/* -------------------------------------------- */

/** Change la taille de la grille : ce qui dépasse est retiré. */
export function resizeMap(map, cols, rows) {
  const next = normalizeMap({ ...map, cols, rows });
  const changed = next.cols !== map.cols || next.rows !== map.rows;
  Object.assign(map, next);
  return changed;
}

export function isEmpty(map) {
  return !Object.keys(map.floor).length && !Object.keys(map.edges).length && !map.props.length;
}

/**
 * Rendu SVG d'une carte. Le même rendu sert à l'éditeur et à l'image exportée.
 * Les coordonnées SVG sont en cases : une case = 1 unité.
 */
import { TERRAINS, PROP_BY_ID } from "./catalog.js";
import { parseCellKey, propFootprint } from "./model.js";
import { mergeSegments, edgesOfKind, cellHash } from "./geometry.js";

const COLORS = {
  wallOutline: "#141210",
  wallBody: "#3d3833",
  wallTop: "#6b645b",
  doorWood: "#7a5230",
  doorEdge: "#2d1b0d",
  secretMark: "#b06cff",
  grid: "#ffffff"
};

/** Teintes de variation du sol : une case sur cinq ne bouge pas, les autres s'assombrissent ou s'éclaircissent un peu. */
const SHADES = [null, ["#000", 0.035], ["#000", 0.065], ["#fff", 0.025], ["#fff", 0.045]];

const cellPath = (x, y) => `M${x} ${y}h1v1h-1z`;
const segPath = ({ a, b }) => `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`;

/** <defs> : motifs de sol et filtres d'ombre. */
export function renderDefs(map, prefix = "cad") {
  const region = `filterUnits="userSpaceOnUse" x="-2" y="-2" width="${map.cols + 4}" height="${map.rows + 4}"`;
  let out = "<defs>";
  for (const t of TERRAINS) {
    out += `<pattern id="${prefix}-t-${t.id}" patternUnits="userSpaceOnUse" width="${t.w}" height="${t.h}">`
      + `<rect width="${t.w}" height="${t.h}" fill="${t.base}"/>${t.pattern}</pattern>`;
  }
  out += `<filter id="${prefix}-blur" ${region}><feGaussianBlur stdDeviation="0.13"/></filter>`;
  out += `<filter id="${prefix}-drop" ${region}><feDropShadow dx="0.04" dy="0.06" stdDeviation="0.04" flood-color="#000" flood-opacity="0.55"/></filter>`;
  return out + "</defs>";
}

/** Sol : un chemin par type de sol, puis les variations de teinte case par case. */
export function renderFloor(map, prefix = "cad") {
  const byTerrain = new Map();
  const byShade = SHADES.map(() => "");
  for (const [key, terrain] of Object.entries(map.floor)) {
    const { x, y } = parseCellKey(key);
    byTerrain.set(terrain, (byTerrain.get(terrain) ?? "") + cellPath(x, y));
    byShade[cellHash(x, y) % SHADES.length] += cellPath(x, y);
  }
  let out = "";
  for (const t of TERRAINS) {
    const d = byTerrain.get(t.id);
    if (d) out += `<path d="${d}" fill="url(#${prefix}-t-${t.id})"/>`;
  }
  SHADES.forEach((shade, i) => {
    if (shade && byShade[i]) out += `<path d="${byShade[i]}" fill="${shade[0]}" fill-opacity="${shade[1]}"/>`;
  });
  return out;
}

/** Objets posés, avec une ombre portée. */
export function renderProps(map, prefix = "cad") {
  let out = "";
  for (const p of map.props) {
    const def = PROP_BY_ID.get(p.type);
    const fp = propFootprint(p.type, p.r);
    if (!def || !fp) continue;
    const cx = p.x + fp.w / 2, cy = p.y + fp.h / 2;
    out += `<g data-prop="${p.id}" transform="translate(${cx} ${cy}) rotate(${p.r * 90}) translate(${-def.w / 2} ${-def.h / 2})">${def.svg}</g>`;
  }
  return out ? `<g filter="url(#${prefix}-drop)">${out}</g>` : "";
}

/**
 * Murs et portes.
 * @param {"editor"|"export"} mode  à l'export, les portes secrètes sont dessinées comme des murs
 */
export function renderWalls(map, mode = "export", prefix = "cad") {
  const wallKinds = mode === "export" ? ["wall", "secret"] : ["wall"];
  const segments = mergeSegments(map.edges, wallKinds);
  const doors = edgesOfKind(map.edges, "door");
  const secrets = mode === "editor" ? edgesOfKind(map.edges, "secret") : [];

  let out = "";
  const wallD = segments.map(segPath).join("");
  const allD = wallD + doors.map(segPath).join("") + secrets.map(segPath).join("");

  // Ombre douce au pied des murs et des portes.
  if (allD) out += `<path d="${allD}" stroke="#000" stroke-opacity="0.5" stroke-width="0.45" stroke-linecap="square" fill="none" filter="url(#${prefix}-blur)"/>`;

  for (const e of doors) {
    const [ax, ay] = e.a;
    const t = e.o === "h" ? `translate(${ax} ${ay})` : `translate(${ax} ${ay}) rotate(90)`;
    out += `<g transform="${t}"><rect x="0.13" y="-0.09" width="0.74" height="0.18" fill="${COLORS.doorWood}" stroke="${COLORS.doorEdge}" stroke-width="0.03"/>`
      + `<path d="M0.15 0h0.7" stroke="${COLORS.doorEdge}" stroke-width="0.02"/></g>`;
  }

  const stroke = (d, color, width) =>
    `<path d="${d}" stroke="${color}" stroke-width="${width}" stroke-linecap="square" stroke-linejoin="miter" fill="none"/>`;
  const bodyD = mode === "editor" ? wallD + secrets.map(segPath).join("") : wallD;
  if (bodyD) {
    out += stroke(bodyD, COLORS.wallOutline, 0.3);
    out += stroke(bodyD, COLORS.wallBody, 0.22);
    out += `<path d="${bodyD}" stroke="${COLORS.wallTop}" stroke-width="0.06" stroke-linecap="butt" fill="none"/>`;
  }
  if (secrets.length) {
    out += `<path d="${secrets.map(segPath).join("")}" stroke="${COLORS.secretMark}" stroke-width="0.1" stroke-dasharray="0.12 0.1" fill="none"/>`;
  }
  return out;
}

/** Quadrillage (éditeur, ou export si demandé). */
export function renderGrid(map, opacity = 0.12) {
  let d = "";
  for (let x = 0; x <= map.cols; x++) d += `M${x} 0V${map.rows}`;
  for (let y = 0; y <= map.rows; y++) d += `M0 ${y}H${map.cols}`;
  return `<path d="${d}" stroke="${COLORS.grid}" stroke-opacity="${opacity}" stroke-width="0.02" fill="none"/>`;
}

/** Contenu complet (sans la balise <svg>). */
export function renderContent(map, { mode = "export", grid = false, prefix = "cad" } = {}) {
  return renderDefs(map, prefix)
    + `<rect x="0" y="0" width="${map.cols}" height="${map.rows}" fill="${map.background}"/>`
    + renderFloor(map, prefix)
    + renderProps(map, prefix)
    + renderWalls(map, mode, prefix)
    + (grid ? renderGrid(map) : "");
}

/**
 * Document SVG autonome, à la taille voulue en pixels.
 * @param {object} map
 * @param {{scale?:number, grid?:boolean, mode?:"editor"|"export"}} [options]  scale = pixels par case
 */
export function renderSVG(map, { scale = map.gridSize, grid = false, mode = "export" } = {}) {
  const w = Math.round(map.cols * scale), h = Math.round(map.rows * scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${map.cols} ${map.rows}" shape-rendering="geometricPrecision">`
    + renderContent(map, { mode, grid })
    + "</svg>";
}

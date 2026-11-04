/**
 * Rendu SVG d'une carte. Le même rendu sert à l'éditeur et à l'image exportée.
 * Coordonnées SVG en cases : une case = 1 unité.
 */
import { TERRAINS, PROP_BY_ID } from "./catalog.js";
import { wallPoints, doorEnds } from "./model.js";
import { cutIntervals } from "./curves.js";

const COLORS = {
  wallOutline: "#141210",
  wallBody: "#3d3833",
  wallTop: "#6b645b",
  doorWood: "#7a5230",
  doorEdge: "#2d1b0d",
  secretMark: "#b06cff",
  grid: "#ffffff"
};

/** Largeur du fondu entre deux sols, en cases. */
export const FEATHER = 0.22;

const f3 = (n) => Math.round(n * 1000) / 1000;

/** Anneaux → attribut d de chemin. */
export function ringsPath(rings) {
  let d = "";
  for (const r of rings ?? []) {
    if (r.length < 6) continue;
    d += `M${r[0]} ${r[1]}`;
    for (let k = 2; k + 1 < r.length; k += 2) d += `L${r[k]} ${r[k + 1]}`;
    d += "Z";
  }
  return d;
}

/** Polyligne → attribut d. */
export const polylinePath = (pts) => pts.length
  ? `M${f3(pts[0][0])} ${f3(pts[0][1])}` + pts.slice(1).map(([x, y]) => `L${f3(x)} ${f3(y)}`).join("")
  : "";

const region = (map) => `x="-2" y="-2" width="${map.width + 4}" height="${map.height + 4}"`;

/** <defs> : motifs de sol et filtres. */
export function renderDefs(map, prefix = "cad") {
  const r = `filterUnits="userSpaceOnUse" ${region(map)}`;
  let out = "<defs>";
  for (const t of TERRAINS) {
    out += `<pattern id="${prefix}-t-${t.id}" patternUnits="userSpaceOnUse" width="${t.w}" height="${t.h}">`
      + `<rect width="${t.w}" height="${t.h}" fill="${t.base}"/>${t.pattern}</pattern>`;
  }
  out += `<filter id="${prefix}-blur" ${r}><feGaussianBlur stdDeviation="0.13"/></filter>`;
  out += `<filter id="${prefix}-feather" ${r}><feGaussianBlur stdDeviation="${f3(FEATHER / 2.5)}"/></filter>`;
  out += `<filter id="${prefix}-drop" ${r}><feDropShadow dx="0.04" dy="0.06" stdDeviation="0.04" flood-color="#000" flood-opacity="0.55"/></filter>`;
  return out + "</defs>";
}

/**
 * Sols. Premier passage : chaque sol net, sans trou entre voisins. Second passage :
 * les sols naturels (herbe, terre, eau) sont redessinés un peu plus larges avec un bord
 * fondu qui déborde sur leurs voisins (l'herbe qui mange la terre). Les sols construits
 * (dalles, plancher, pavés) gardent un bord net.
 */
export function renderTerrains(map, prefix = "cad", { feather = true } = {}) {
  let base = "", soft = "";
  for (const t of TERRAINS) {
    const d = ringsPath(map.terrains[t.id]);
    if (!d) continue;
    const fill = `url(#${prefix}-t-${t.id})`;
    base += `<path d="${d}" fill="${fill}"/>`;
    if (!feather || !t.soft) continue;
    const mask = `${prefix}-m-${t.id}`;
    soft += `<mask id="${mask}" maskUnits="userSpaceOnUse" ${region(map)}>`
      + `<path d="${d}" fill="#fff" stroke="#fff" stroke-width="${FEATHER}" stroke-linejoin="round" filter="url(#${prefix}-feather)"/></mask>`
      + `<path d="${d}" fill="${fill}" stroke="${fill}" stroke-width="${FEATHER * 2}" stroke-linejoin="round" mask="url(#${mask})"/>`;
  }
  return base + soft;
}

/** Objets posés, avec une ombre portée. */
export function renderProps(map, prefix = "cad") {
  let out = "";
  for (const p of map.props) {
    const def = PROP_BY_ID.get(p.type);
    if (!def) continue;
    out += `<g data-prop="${p.id}" transform="translate(${p.x} ${p.y}) rotate(${p.a}) scale(${p.k}) translate(${-def.w / 2} ${-def.h / 2})">${def.svg}</g>`;
  }
  return out ? `<g filter="url(#${prefix}-drop)">${out}</g>` : "";
}

/**
 * Morceaux de murs à dessiner, portes retirées.
 * @param {"editor"|"export"} mode  à l'export, une porte secrète reste un mur sur l'image
 */
export function wallPieces(map, mode = "export") {
  const pieces = [];
  for (const wall of map.walls) {
    const pts = wallPoints(wall);
    const cuts = map.doors
      .filter((d) => d.wall === wall.id && (d.kind === "door" || mode === "editor"))
      .map((d) => [d.s - d.w / 2, d.s + d.w / 2]);
    pieces.push(...cutIntervals(pts, wall.closed, cuts));
  }
  return pieces;
}

export function renderWalls(map, mode = "export", prefix = "cad") {
  const pieces = wallPieces(map, mode);
  const doors = map.doors
    .filter((d) => d.kind === "door" || mode === "editor")
    .map((d) => ({ door: d, ends: doorEnds(map, d) }))
    .filter((x) => x.ends);

  const wallD = pieces.map(polylinePath).join("");
  const chordD = doors.map(({ ends }) => polylinePath([ends.a, ends.b])).join("");
  let out = "";
  if (wallD || chordD) {
    out += `<path d="${wallD}${chordD}" stroke="#000" stroke-opacity="0.5" stroke-width="0.45" stroke-linecap="round" stroke-linejoin="round" fill="none" filter="url(#${prefix}-blur)"/>`;
  }

  for (const { door, ends } of doors) {
    if (door.kind !== "door") continue;
    const [ax, ay] = ends.a, [bx, by] = ends.b;
    const len = Math.hypot(bx - ax, by - ay);
    const ang = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
    out += `<g transform="translate(${f3(ax)} ${f3(ay)}) rotate(${f3(ang)})">`
      + `<rect x="0.04" y="-0.09" width="${f3(Math.max(0.05, len - 0.08))}" height="0.18" fill="${COLORS.doorWood}" stroke="${COLORS.doorEdge}" stroke-width="0.03"/>`
      + `<path d="M0.06 0H${f3(len - 0.06)}" stroke="${COLORS.doorEdge}" stroke-width="0.02"/></g>`;
  }

  if (wallD) {
    const stroke = (color, width, extra = "") =>
      `<path d="${wallD}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" fill="none"${extra}/>`;
    out += stroke(COLORS.wallOutline, 0.3);
    out += stroke(COLORS.wallBody, 0.22);
    out += stroke(COLORS.wallTop, 0.06, ` stroke-opacity="0.8"`);
  }

  // Éditeur : la porte secrète est dessinée comme un mur, marquée en pointillé.
  const secrets = doors.filter(({ door }) => door.kind === "secret");
  if (secrets.length) {
    const d = secrets.map(({ ends }) => polylinePath([ends.a, ends.b])).join("");
    out += `<path d="${d}" stroke="${COLORS.wallOutline}" stroke-width="0.3" stroke-linecap="round" fill="none"/>`;
    out += `<path d="${d}" stroke="${COLORS.wallBody}" stroke-width="0.22" stroke-linecap="round" fill="none"/>`;
    out += `<path d="${d}" stroke="${COLORS.secretMark}" stroke-width="0.1" stroke-dasharray="0.12 0.1" fill="none"/>`;
  }
  return out;
}

/** Quadrillage (éditeur, ou export si demandé). */
export function renderGrid(map, opacity = 0.12) {
  let d = "";
  for (let x = 0; x <= map.width; x++) d += `M${x} 0V${map.height}`;
  for (let y = 0; y <= map.height; y++) d += `M0 ${y}H${map.width}`;
  return `<path d="${d}" stroke="${COLORS.grid}" stroke-opacity="${opacity}" stroke-width="0.02" fill="none"/>`;
}

/** Contenu complet (sans la balise <svg>). */
export function renderContent(map, { mode = "export", grid = false, prefix = "cad" } = {}) {
  return renderDefs(map, prefix)
    + `<rect x="0" y="0" width="${map.width}" height="${map.height}" fill="${map.background}"/>`
    + renderTerrains(map, prefix)
    + renderProps(map, prefix)
    + renderWalls(map, mode, prefix)
    + (grid ? renderGrid(map) : "");
}

/**
 * Document SVG autonome, à la taille voulue en pixels.
 * @param {{scale?:number, grid?:boolean, mode?:"editor"|"export"}} [options]  scale = pixels par case
 */
export function renderSVG(map, { scale = map.gridSize, grid = false, mode = "export" } = {}) {
  const w = Math.round(map.width * scale), h = Math.round(map.height * scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${map.width} ${map.height}" shape-rendering="geometricPrecision">`
    + renderContent(map, { mode, grid })
    + "</svg>";
}

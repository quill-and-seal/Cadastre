/**
 * Rendu SVG d'une carte. Le même rendu sert à l'éditeur et à l'image exportée.
 * Coordonnées SVG en cases : une case = 1 unité.
 */
import { TERRAINS, PROP_BY_ID } from "./catalog.js";
import { wallPoints, doorEnds } from "./model.js";
import { flattenNodes } from "./curves.js";
import { isAssetKey } from "./library.js";
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

const attr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * URL d'une image d'asset, par défaut : le chemin tel quel, encodé une seule fois
 * (les packs ont souvent des espaces dans leurs noms de fichiers).
 */
export function defaultResolve(src) {
  if (/^(data:|blob:)/i.test(src)) return src;
  try { return encodeURI(decodeURI(src)); } catch { return encodeURI(src); }
}

/** Identifiant SVG sûr d'un motif de sol (les clés d'assets contiennent « : »). */
const safeKey = (key) => String(key).replace(/[^\w-]/g, "_");
export const terrainPatternId = (prefix, key) => `${prefix}-t-${safeKey(key)}`;
export const terrainFill = (prefix, key) => `url(#${terrainPatternId(prefix, key)})`;

/** Sols de la carte dans l'ordre de dessin : catalogue intégré, puis textures de bibliothèque. */
export function terrainList(map) {
  const out = TERRAINS.map((t) => ({ key: t.id, def: t }));
  for (const [id, a] of Object.entries(map.assets ?? {})) {
    if (a.kind === "texture") out.push({ key: `asset:${id}`, def: a });
  }
  return out;
}

const region = (map) => `x="-2" y="-2" width="${map.width + 4}" height="${map.height + 4}"`;

/**
 * <defs> : motifs de sol et filtres.
 * @param {(src:string)=>string} [resolve]  URL d'une image d'asset
 */
export function renderDefs(map, prefix = "cad", resolve = defaultResolve) {
  const r = `filterUnits="userSpaceOnUse" ${region(map)}`;
  let out = "<defs>";
  for (const { key, def: t } of terrainList(map)) {
    const id = terrainPatternId(prefix, key);
    out += isAssetKey(key)
      ? `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${t.w}" height="${t.h}">`
        + `<image href="${attr(resolve(t.src))}" width="${t.w}" height="${t.h}" preserveAspectRatio="none"/></pattern>`
      : `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${t.w}" height="${t.h}">`
        + `<rect width="${t.w}" height="${t.h}" fill="${t.base}"/>${t.pattern}</pattern>`;
  }
  out += `<filter id="${prefix}-blur" ${r}><feGaussianBlur stdDeviation="0.13"/></filter>`;
  out += `<filter id="${prefix}-feather" ${r}><feGaussianBlur stdDeviation="${f3(FEATHER / 2.5)}"/></filter>`;
  out += `<clipPath id="${prefix}-clip"><rect width="${map.width}" height="${map.height}"/></clipPath>`;
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
  for (const { key, def: t } of terrainList(map)) {
    const d = ringsPath(map.terrains[key]);
    if (!d) continue;
    const fill = terrainFill(prefix, key);
    base += `<path d="${d}" fill="${fill}"/>`;
    if (!feather || !t.soft) continue;
    const mask = `${prefix}-m-${safeKey(key)}`;
    soft += `<mask id="${mask}" maskUnits="userSpaceOnUse" ${region(map)}>`
      + `<path d="${d}" fill="#fff" stroke="#fff" stroke-width="${FEATHER}" stroke-linejoin="round" filter="url(#${prefix}-feather)"/></mask>`
      + `<path d="${d}" fill="${fill}" stroke="${fill}" stroke-width="${FEATHER * 2}" stroke-linejoin="round" mask="url(#${mask})"/>`;
  }
  // Les bords fondus ne débordent pas hors de la carte.
  return base || soft ? `<g clip-path="url(#${prefix}-clip)">${base}${soft}</g>` : "";
}

/**
 * Chemins : bande texturée le long de la courbe, bordure de chaque côté (un trait plus
 * large dessous), ombre douce. Les textures restent fixes sur la carte : elles ne suivent
 * pas la courbe, comme des pavés posés sur le sol.
 */
export function renderPaths(map, prefix = "cad") {
  let shadow = "", body = "";
  for (const q of map.paths ?? []) {
    const pts = flattenNodes(q.nodes, q.closed, 0.01);
    if (pts.length < 2) continue;
    const d = polylinePath(q.closed ? [...pts, pts[0]] : pts) + (q.closed ? "Z" : "");
    const outer = q.width + (q.edge ? 2 * q.edgeWidth : 0);
    const cap = `stroke-linecap="round" stroke-linejoin="round" fill="none"`;
    shadow += `<path d="${d}" stroke="#000" stroke-opacity="0.35" stroke-width="${f3(outer + 0.12)}" ${cap}/>`;
    if (q.edge) {
      body += `<path d="${d}" stroke="${terrainFill(prefix, q.edge)}" stroke-width="${f3(outer)}" ${cap}/>`;
      body += `<path d="${d}" stroke="#000" stroke-opacity="0.45" stroke-width="${f3(q.width + 0.06)}" ${cap}/>`;
    }
    body += `<path data-path="${q.id}" d="${d}" stroke="${terrainFill(prefix, q.terrain)}" stroke-width="${f3(q.width)}" ${cap}/>`;
  }
  return shadow ? `<g clip-path="url(#${prefix}-clip)"><g filter="url(#${prefix}-blur)">${shadow}</g>${body}</g>` : "";
}

/** Dessin d'un type d'objet dans son rectangle w×h (catalogue : SVG, bibliothèque : image). */
export function propArt(def, resolve = defaultResolve) {
  return def.src
    ? `<image href="${attr(resolve(def.src))}" width="${def.w}" height="${def.h}" preserveAspectRatio="xMidYMid meet"/>`
    : def.svg;
}

/** Objets posés, avec une ombre portée. */
export function renderProps(map, prefix = "cad", resolve = defaultResolve) {
  let out = "";
  for (const p of map.props) {
    const def = PROP_BY_ID.get(p.type) ?? (isAssetKey(p.type) ? map.assets?.[p.type.slice(6)] : null);
    if (!def) continue;
    out += `<g data-prop="${p.id}" transform="translate(${p.x} ${p.y}) rotate(${p.a}) scale(${p.k}) translate(${-def.w / 2} ${-def.h / 2})">${propArt(def, resolve)}</g>`;
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
export function renderContent(map, { mode = "export", grid = false, prefix = "cad", resolve = defaultResolve } = {}) {
  return renderDefs(map, prefix, resolve)
    + `<rect x="0" y="0" width="${map.width}" height="${map.height}" fill="${map.background}"/>`
    + renderTerrains(map, prefix)
    + renderPaths(map, prefix)
    + renderProps(map, prefix, resolve)
    + renderWalls(map, mode, prefix)
    + (grid ? renderGrid(map) : "");
}

/**
 * Document SVG autonome, à la taille voulue en pixels.
 * @param {{scale?:number, grid?:boolean, mode?:"editor"|"export", resolve?:(src:string)=>string}} [options]
 *   scale = pixels par case ; resolve = URL de chaque image d'asset (à l'export : images intégrées)
 */
export function renderSVG(map, { scale = map.gridSize, grid = false, mode = "export", resolve = defaultResolve } = {}) {
  const w = Math.round(map.width * scale), h = Math.round(map.height * scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${map.width} ${map.height}" shape-rendering="geometricPrecision">`
    + renderContent(map, { mode, grid, resolve })
    + "</svg>";
}

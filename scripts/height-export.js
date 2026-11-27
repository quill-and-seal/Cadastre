/**
 * Carte des hauteurs des objets et des murs, exportée avec la scène : la scène en tire leurs
 * ombres au soleil de l'heure réglée (shade-layer.js). Image opaque, rouge = hauteur / MAX_HEIGHT.
 * Vert = intérieur d'une pièce : à l'abri du soleil, ni les murs ni les meubles n'y portent d'ombre.
 * Les arbres générés portent leur propre ombre (tree-layer.js) : ils n'y sont pas.
 */
import { PROP_BY_ID } from "./catalog.js";
import { isAssetKey } from "./library.js";
import { TREE_BY_TYPE } from "./trees.js";
import { wallPieces, propArt, polylinePath, ringsPath } from "./render.js";

/** Finesse (pixels par case), hauteur la plus grande codée, hauteur des murs (cases). */
export const HEIGHT_PPC = 12;
export const MAX_HEIGHT = 4;
export const WALL_HEIGHT = 2.2;
/** Objets plats, sans ombre (tapis, flaques…), d'après leur nom ou leurs étiquettes. */
const FLAT = /tapis|rug|carpet|decal|flaque|puddle|tache|stain|sol\b|floor/i;

/** Hauteur d'un objet posé (cases) : la moitié de son petit côté, bornée. */
export function propHeight(def, p) {
  const words = [def.name, ...(def.tags ?? [])].filter(Boolean).join(" ");
  if (FLAT.test(words)) return 0;
  return Math.max(0.15, Math.min(1.6, 0.5 * Math.min(def.w, def.h) * (p.k ?? 1)));
}

/**
 * SVG de la carte des hauteurs, ou null s'il n'y a ni objet ni mur.
 * @param {object} map
 * @param {(src:string)=>string} resolve  URL des images d'asset (images intégrées à l'export)
 */
export function heightSVG(map, resolve, ppc = HEIGHT_PPC) {
  const W = map.width, H = map.height;
  const level = (h) => Math.round((Math.min(MAX_HEIGHT, h) / MAX_HEIGHT) * 255);
  const used = new Set();
  let props = "";
  for (const p of map.props ?? []) {
    const def = PROP_BY_ID.get(p.type) ?? TREE_BY_TYPE.get(p.type) ?? (isAssetKey(p.type) ? map.assets?.[p.type.slice(6)] : null);
    if (!def || def.tree) continue;
    const h = propHeight(def, p);
    if (!h) continue;
    const v = level(h);
    used.add(v);
    props += `<g filter="url(#h${v})" transform="translate(${p.x} ${p.y}) rotate(${p.a ?? 0}) scale(${p.k ?? 1}) translate(${-def.w / 2} ${-def.h / 2})">${propArt(def, resolve, p.s)}</g>`;
  }
  const wallD = wallPieces(map, "export").map(polylinePath).join("");
  if (!props && !wallD) return null;
  // Pièces : marquées en vert par-dessus (« éclaircir » garde la hauteur en rouge).
  const rooms = map.rooms?.length ? `<path d="${ringsPath(map.rooms)}" fill="rgb(0,255,0)" fill-rule="evenodd" style="mix-blend-mode:lighten"/>` : "";
  // Chaque objet devient une silhouette pleine de la couleur de sa hauteur.
  const filters = [...used].map((v) => `<filter id="h${v}" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">`
    + `<feFlood flood-color="rgb(${v},0,0)"/><feComposite in2="SourceAlpha" operator="in"/></filter>`).join("");
  const walls = wallD ? `<path d="${wallD}" stroke="rgb(${level(WALL_HEIGHT)},0,0)" stroke-width="0.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${Math.round(W * ppc)}" height="${Math.round(H * ppc)}" viewBox="0 0 ${W} ${H}">`
    + `<defs>${filters}</defs><rect width="${W}" height="${H}" fill="#000"/>${props}${walls}${rooms}</svg>`;
}

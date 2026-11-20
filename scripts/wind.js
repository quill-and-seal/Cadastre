/**
 * Vent dans l'herbe, en vue de dessus : réglages d'une carte et zone où poussent les brins.
 * Rien ici ne dépend de Foundry. Le dessin des brins est dans grass.js.
 *
 * Réglages d'une carte (map.wind) :
 *   dir      : direction vers laquelle souffle le vent, en degrés (0 = vers l'est, 90 = vers le sud)
 *   strength : force, de 0 (calme) à 1 (tempête)
 *   waves    : forme des vagues : "swell" (houle régulière), "gusts" (rafales qui avancent), "mix"
 *   speed    : vitesse des vagues
 *   gap      : espacement des brins, en pixels pour une case de 100 px
 *   length   : longueur des brins, en pixels pour une case de 100 px
 *   angle    : écart des brins autour du sens du vent, en degrés
 *   jitter   : désordre de la grille des brins (0 : grille régulière, 1 : très désordonnée)
 */
import * as poly from "./poly.js";
import { waterRings } from "./render.js";
import { propDef } from "./model.js";
import { flattenNodes } from "./curves.js";
import { WAVES, REF_PPC } from "./grass.js";

export const WIND_DEFAULT = { dir: 40, strength: 0.6, waves: "mix", speed: 0.5, gap: 2.5, length: 24, angle: 25, jitter: 0 };

/** Bornes des réglages. */
export const WIND_LIMITS = {
  strength: [0, 1], speed: [0.1, 3], gap: [1.5, 12], length: [4, 40], angle: [0, 70], jitter: [0, 1]
};

/** Niveaux d'effet, choisis par chaque joueur. */
export const WIND_LEVELS = { OFF: 0, LIGHT: 1, BLADES: 2, FULL: 3 };

const r3 = (n) => Math.round(n * 1000) / 1000;

export function normalizeWind(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {
    dir: Number.isFinite(Number(src.dir)) && src.dir !== null && src.dir !== "" ? r3(((Number(src.dir) % 360) + 360) % 360) : WIND_DEFAULT.dir,
    waves: WAVES.includes(src.waves) ? src.waves : WIND_DEFAULT.waves
  };
  for (const [key, [min, max]] of Object.entries(WIND_LIMITS)) {
    const n = Number(src[key]);
    out[key] = src[key] === null || src[key] === "" || !Number.isFinite(n) ? WIND_DEFAULT[key] : r3(Math.min(max, Math.max(min, n)));
  }
  return { dir: out.dir, strength: out.strength, waves: out.waves, speed: out.speed, gap: out.gap, length: out.length, angle: out.angle, jitter: out.jitter };
}

/* -------------------------------------------- */
/*  Zone d'herbe                                */
/* -------------------------------------------- */

/** Emprise d'un objet posé, tournée et à l'échelle (arbres : la couronne). */
export function propRings(map, p) {
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
  // Les pointes des brins débordent de leur pied : marge d'une longueur de brin.
  const tip = normalizeWind(map.wind).length / REF_PPC;
  let zone = map.terrains?.grass ?? [];
  if (!zone.length) return [];
  const cut = (rings) => { if (rings.length && zone.length) zone = poly.difference(zone, rings); };
  // Marges : la berge déborde de 0,3 case autour de l'eau, un brin un peu autour de son pied.
  const water = waterRings(map);
  if (water.length) cut(poly.offsetRings(water, 0.3 + tip));
  for (const q of map.paths ?? []) {
    const pts = flattenNodes(q.nodes, q.closed, 0.03);
    if (pts.length < 2) continue;
    cut(poly.strokeRings(q.closed ? [...pts, pts[0]] : pts, q.width / 2 + (q.edge ? q.edgeWidth : 0) + 0.1 + tip * 0.5));
  }
  for (const wall of map.walls ?? []) {
    const pts = flattenNodes(wall.nodes, wall.closed, 0.03);
    if (pts.length >= 2) cut(poly.strokeRings(wall.closed ? [...pts, pts[0]] : pts, 0.2 + tip));
  }
  if (map.rooms?.length) cut(poly.offsetRings(map.rooms, tip * 0.6));
  let props = [];
  // Les arbres générés sont dessinés au-dessus de l'herbe (calque des arbres) : inutile de la trouer.
  for (const p of map.props ?? []) if (!propDef(map, p.type)?.proc) props = props.concat(propRings(map, p));
  // Marge : un brin déborde un peu autour de son pied.
  if (props.length) cut(poly.offsetRings(poly.union(props, []), tip));
  return zone;
}

/** Données enregistrées dans la scène à l'export ; null s'il n'y a pas d'herbe. */
export function windFlag(map) {
  const zone = grassZone(map);
  if (!zone.length) return null;
  return { v: 2, width: map.width, height: map.height, wind: normalizeWind(map.wind), zone };
}

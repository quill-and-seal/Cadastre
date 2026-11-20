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
import { BIOME_SOILS } from "./catalog.js";
import { waterRings } from "./render.js";
import { flattenNodes } from "./curves.js";

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
  return sowLayers(map, rings, biome, rand, density, false);
}

/** Sols où rien ne pousse : eau, sols construits, plages et roche. */
const BARE = ["water", "stone", "wood", "cobble", "sand", "rock"];

/** Là où le biome de la carte peut semer : toute la carte, moins l'eau, les pièces, les chemins, les murs et les sols nus. */
export function biomeArea(map) {
  let blocked = [...waterRings(map), ...map.rooms, ...M.wallBarrier(map, 0.3)];
  for (const t of BARE) blocked.push(...(map.terrains[t] ?? []));
  for (const q of map.paths ?? []) {
    const pts = flattenNodes(q.nodes, q.closed, 0.05);
    blocked.push(...poly.strokeRings(q.closed ? [...pts, pts[0]] : pts, q.width / 2 + 0.1));
  }
  const all = poly.rectRings(0, 0, map.width, map.height);
  return blocked.length ? poly.difference(all, poly.union([], blocked)) : all;
}

/**
 * Toute la carte devient le biome : son sol en fond (sous les sols peints), sa végétation semée
 * partout où elle peut pousser. Les plantes d'un biome précédent sont retirées d'abord ; celles
 * posées à la main restent. Biome null : retire le biome et ses plantes.
 * @returns {number}  plantes posées
 */
export function applyBiome(map, biomeId, rand, { density = 1 } = {}) {
  map.props = map.props.filter((p) => !p.b);
  const biome = BIOME_BY_ID.get(biomeId);
  if (!biome) { map.biome = null; return 0; }
  map.biome = { id: biome.id, density };
  return sowLayers(map, biomeArea(map), biome, rand, density, true);
}

function sowLayers(map, rings, biome, rand, density, mark) {
  const b = poly.ringsBounds(rings);
  if (!b) return 0;
  const { x0, y0, x1, y1 } = b;
  const area = poly.totalArea(rings);
  // Plantes déjà posées de chaque strate, pour l'espacement.
  const kindsOf = (layer) => new Set(layer.kinds.map(([k]) => `${TREE_PREFIX}${k}`));
  let placed = 0;
  for (const layer of biome.layers) {
    const types = kindsOf(layer);
    const near = map.props.filter((p) => types.has(p.type)).map((p) => ({ x: p.x, y: p.y, r: treeRadius(TREE_BY_TYPE.get(p.type), p.k) }));
    const want = Math.round(area * layer.density * density + rand() - 0.5);
    for (let tries = 0, n = 0; n < want && tries < want * 12; tries++) {
      const x = x0 + rand() * (x1 - x0), y = y0 + rand() * (y1 - y0);
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

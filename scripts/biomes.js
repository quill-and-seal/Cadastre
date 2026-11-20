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

export const BIOMES = [
  {
    id: "broadleaf", soil: "litter", swatch: ["#7a5428", "#2f6a2c"],
    layers: [
      { kinds: [["mushrooms", 1]], density: 0.03, size: [0.8, 1.3], spacing: 1.5 },
      { kinds: [["stump", 1]], density: 0.008, size: [0.8, 1.2], spacing: 2 },
      { kinds: [["fern", 1]], density: 0.12, size: [0.7, 1.3], spacing: 0.75 },
      { kinds: [["bush", 1]], density: 0.03, size: [0.7, 1.3], spacing: 0.8 },
      { kinds: [["oak", 0.4], ["beech", 0.4], ["birch", 0.2]], density: 0.045, size: [0.8, 1.35], spacing: 0.72 }
    ]
  },
  {
    id: "conifer", soil: "needles", swatch: ["#6e4a28", "#17442d"],
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
      const k = layer.size[0] + rand() * (layer.size[1] - layer.size[0]), r = treeRadius(def, k);
      if (near.some((q) => Math.hypot(q.x - x, q.y - y) < (q.r + r) * layer.spacing)) continue;
      if (!M.addProp(map, type, x, y, Math.round(rand() * 360), k, Math.floor(rand() * 2 ** 32))) continue;
      near.push({ x, y, r });
      n++; placed++;
    }
  }
  return placed;
}

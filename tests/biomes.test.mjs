import { test } from "node:test";
import assert from "node:assert/strict";
import { applyBiome, sowBiome, biomeArea, fireflySpots } from "../scripts/biomes.js";
import { createMap, addProp, paintArea, normalizeMap, isEmpty } from "../scripts/model.js";
import { rectRings, pointInRings } from "../scripts/poly.js";
import { mulberry32 } from "../scripts/catalog.js";
import { renderTerrains } from "../scripts/render.js";

test("biome de toute la carte : sol en fond, végétation hors de l'eau et des pièces", () => {
  const map = createMap({ width: 30, height: 20 });
  paintArea(map, rectRings(2, 2, 10, 10), "water");
  map.rooms = rectRings(18, 4, 26, 12);
  const manual = addProp(map, "tree-palm", 15, 15, 0, 1, 1);
  const n = applyBiome(map, "broadleaf", mulberry32(4));
  assert.ok(n > 40, `${n} plantes`);
  assert.equal(map.biome.id, "broadleaf");
  assert.match(renderTerrains(map), /<rect width="30" height="20" fill="url\(#cad-t-litter\)"/);
  for (const p of map.props.filter((q) => q.b)) {
    assert.ok(!pointInRings(rectRings(2, 2, 10, 10), p.x, p.y), "pas dans l'eau");
    assert.ok(!pointInRings(map.rooms, p.x, p.y), "pas dans la pièce");
  }
  // Réappliquer remplace les plantes du biome ; celles posées à la main restent.
  const before = map.props.filter((q) => q.b).length;
  applyBiome(map, "conifer", mulberry32(5));
  assert.ok(map.props.some((q) => q.type === "tree-spruce"));
  assert.ok(!map.props.some((q) => q.b && q.type === "tree-oak"));
  assert.ok(map.props.includes(manual));
  assert.ok(before > 0);
  // Le biome et ses plantes survivent à l'enregistrement.
  const again = normalizeMap(JSON.parse(JSON.stringify(map)));
  assert.deepEqual(again.biome, map.biome);
  assert.equal(again.props.filter((q) => q.b).length, map.props.filter((q) => q.b).length);
  // Retirer le biome.
  applyBiome(map, null, mulberry32(6));
  assert.equal(map.biome, null);
  assert.equal(map.props.filter((q) => q.b).length, 0);
  assert.ok(map.props.includes(manual));
});

test("une carte avec seulement un biome n'est pas vide ; le pinceau peint une zone", () => {
  const map = createMap({ width: 10, height: 10 });
  map.biome = { id: "conifer", density: 1 };
  assert.ok(!isEmpty(map));
  const m2 = createMap({ width: 20, height: 20 });
  assert.ok(sowBiome(m2, rectRings(2, 2, 12, 12), "broadleaf", mulberry32(1)) > 0);
  assert.ok(m2.terrains.litter?.length);
  assert.equal(m2.props.filter((q) => q.b).length, 0);
  assert.ok(biomeArea(m2).length);
});

test("eau peinte après le biome : la végétation semée dessous disparaît, pas celle posée à la main", async () => {
  const { pruneBiome } = await import("../scripts/biomes.js");
  const map = createMap({ width: 20, height: 14 });
  applyBiome(map, "broadleaf", mulberry32(3));
  const hand = addProp(map, "tree-oak", 5, 5);
  const inside = (p) => p.x > 4 && p.x < 10 && p.y > 4 && p.y < 10;
  assert.ok(map.props.some((p) => p.b && inside(p)));
  paintArea(map, rectRings(4, 4, 10, 10), "water");
  assert.ok(pruneBiome(map) > 0);
  assert.ok(!map.props.some((p) => p.b && inside(p)));
  assert.ok(map.props.some((p) => p.id === hand.id));
});

test("eau peinte sous un arbre posé à la main : retiré ; arbre posé exprès dans l'eau, objets : gardés", async () => {
  const { pruneBiome } = await import("../scripts/biomes.js");
  const map = createMap({ width: 20, height: 14 });
  paintArea(map, rectRings(12, 2, 18, 8), "water");
  const wet = addProp(map, "tree-oak", 15, 5);       // posé exprès dans l'eau
  const dry = addProp(map, "tree-oak", 5, 5);
  const before = JSON.parse(JSON.stringify(map));
  paintArea(map, rectRings(4, 4, 7, 7), "water");
  assert.equal(pruneBiome(map, before), 1);
  assert.ok(!map.props.some((p) => p.id === dry.id));
  assert.ok(map.props.some((p) => p.id === wet.id));
  // Sans la carte d'avant (ouverture d'une carte), rien n'est retiré à la main.
  const again = addProp(map, "tree-oak", 5.5, 5.5);
  assert.equal(pruneBiome(map), 0);
  assert.ok(map.props.some((p) => p.id === again.id));
});

test("marais : flaques d'eau, nénuphars sur l'eau seulement, roseaux près de l'eau", async () => {
  const { pruneBiome } = await import("../scripts/biomes.js");
  const { waterRings } = await import("../scripts/render.js");
  const P = await import("../scripts/poly.js");
  const map = createMap({ width: 30, height: 20 });
  const n = applyBiome(map, "marsh", mulberry32(9));
  assert.ok(n > 0);
  assert.equal(map.biome.id, "marsh");
  const water = waterRings(map);
  assert.ok(water.length > 0, "des flaques");
  const of = (k) => map.props.filter((p) => p.type === `tree-${k}`);
  assert.ok(of("lily").length > 0 && of("rush").length > 0);
  for (const p of of("lily")) assert.ok(P.pointInRings(water, p.x, p.y), "nénuphar sur l'eau");
  for (const p of of("rush")) assert.ok(!P.pointInRings(water, p.x, p.y), "jonc hors de l'eau");
  const shore = P.offsetRings(water, 3.6);
  for (const p of of("reed")) assert.ok(P.pointInRings(shore, p.x, p.y), "roseau près de l'eau");
  // Le nettoyage garde les nénuphars sur l'eau.
  const lilies = of("lily").length;
  pruneBiome(map);
  assert.equal(of("lily").length, lilies);
  // Bois mort, ponts de planches d'une rive à l'autre, lucioles.
  for (const p of of("knees")) assert.ok(P.pointInRings(water, p.x, p.y), "genoux de cyprès dans l'eau");
  const bridges = map.paths.filter((q) => q.planks && q.b);
  assert.ok(bridges.length > 0, "des ponts");
  for (const q of bridges) {
    const [a, b] = q.nodes;
    assert.ok(!P.pointInRings(water, a.x, a.y) && !P.pointInRings(water, b.x, b.y), "pont posé sur deux rives");
    assert.ok(P.pointInRings(water, (a.x + b.x) / 2, (a.y + b.y) / 2), "pont au-dessus de l'eau");
  }
  const flies = fireflySpots(map);
  assert.ok(flies.length > 20);
  // Réappliquer le biome remplace ses ponts.
  applyBiome(map, "marsh", mulberry32(10));
  assert.ok(map.paths.every((q) => !q.b || q.planks) && map.paths.filter((q) => q.b).length < bridges.length * 3);
  applyBiome(map, null, mulberry32(1));
  assert.equal(map.paths.filter((q) => q.b).length, 0);
});

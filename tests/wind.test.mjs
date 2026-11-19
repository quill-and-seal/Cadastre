import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeWind, grassZone, windFlag, WIND_DEFAULT } from "../scripts/wind.js";
import { bladeField, lod, visibleChunks, windUniforms, packPushers, PushTrail, CHUNK, MAX_PUSHERS, GRASS_VERT } from "../scripts/grass.js";
import { createMap, normalizeMap, paintArea, addPath, addProp, addRoom } from "../scripts/model.js";
import { rectRings, pointInRings, totalArea } from "../scripts/poly.js";
import { rectNodes } from "../scripts/curves.js";

test("réglages du vent : valeurs par défaut et bornes", () => {
  assert.deepEqual(normalizeWind(null), WIND_DEFAULT);
  assert.deepEqual(WIND_DEFAULT, { dir: 40, strength: 0.6, waves: "mix", speed: 0.5, gap: 2.5, length: 24, angle: 25, jitter: 0 });
  const w = normalizeWind({ dir: -90, strength: 3, waves: "tornade", speed: 0, gap: 100, length: 1, angle: 200, jitter: -1 });
  assert.deepEqual(w, { dir: 270, strength: 1, waves: "mix", speed: 0.1, gap: 12, length: 4, angle: 70, jitter: 0 });
  assert.equal(normalizeWind({ dir: 0 }).dir, 0);
  // Cartes d'avant la 0.1.7 : direction et force gardées, le reste par défaut.
  const old = normalizeWind({ dir: 90, strength: 0.3, gusts: 0.5, density: 45 });
  assert.deepEqual(old, { ...WIND_DEFAULT, dir: 90, strength: 0.3 });
  assert.deepEqual(createMap().wind, WIND_DEFAULT);
  assert.equal(normalizeMap({ wind: { dir: 45 } }).wind.dir, 45);
});

test("la zone d'herbe exclut l'eau, les chemins, les pièces et ce qui est posé dessus", () => {
  const map = createMap({ width: 30, height: 20 });
  paintArea(map, rectRings(0, 0, 30, 20), "grass");
  addPath(map, [{ x: 0, y: 10 }, { x: 30, y: 10 }], { width: 2, terrain: "water" });
  addPath(map, [{ x: 15, y: 0 }, { x: 15, y: 9 }], { width: 1.5, terrain: "dirt" });
  addRoom(map, rectNodes(2, 2, 6, 6), "wood");
  addProp(map, "tree-oak", 24, 4, 0, 1, 5);
  addProp(map, "table", 24, 15);
  const zone = grassZone(map);
  assert.ok(pointInRings(zone, 10, 3), "pré");
  for (const [x, y, what] of [[10, 10, "rivière"], [15, 4, "chemin"], [4, 4, "pièce"], [24, 4, "arbre"], [24, 15, "table"]]) {
    assert.ok(!pointInRings(zone, x, y), what);
  }
  assert.deepEqual(grassZone(createMap()), [], "pas d'herbe, pas de zone");
});

test("brins : une grille serrée dans la zone, par morceaux, toujours la même", () => {
  const wind = normalizeWind({ gap: 10, jitter: 0 });     // 10 brins par case de côté
  const zone = rectRings(0, 0, 20, 10);
  const field = bladeField(zone, wind);
  assert.equal(field.gap, 0.1);
  assert.equal(field.count, 200 * 100);
  assert.equal(field.chunks.reduce((n, c) => n + c.count, 0), field.count);
  assert.equal(field.chunks.length, Math.ceil(20 / CHUNK) * Math.ceil(10 / CHUNK));
  for (const c of field.chunks) {
    for (let i = 0; i < c.roots.length; i += 2) {
      const x = c.roots[i], y = c.roots[i + 1];
      assert.ok(x > 0 && x < 20 && y > 0 && y < 10);
      assert.ok(x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1);
    }
  }
  assert.deepEqual(bladeField(zone, wind).chunks[0].roots, field.chunks[0].roots);
  // Un trou dans la zone reste vide.
  const holed = bladeField([...rectRings(0, 0, 10, 10), ...rectRings(3, 3, 7, 7).reverse()], wind);
  assert.ok(Math.abs(holed.count - (100 - 16) * 100) < 200, `${holed.count}`);
  for (const c of holed.chunks) for (let i = 0; i < c.roots.length; i += 2) {
    assert.ok(!(c.roots[i] > 3.05 && c.roots[i] < 6.95 && c.roots[i + 1] > 3.05 && c.roots[i + 1] < 6.95));
  }
  assert.equal(bladeField([], wind).count, 0);
});

test("brins mélangés : les premiers d'un morceau couvrent tout le morceau", () => {
  const field = bladeField(rectRings(0, 0, 8, 8), normalizeWind({ gap: 5 }));
  const c = field.chunks[0];
  const quarters = [0, 0, 0, 0];
  for (let i = 0; i < 400; i++) quarters[(c.roots[i * 2] < 4 ? 0 : 1) + (c.roots[i * 2 + 1] < 4 ? 0 : 2)]++;
  assert.ok(quarters.every((q) => q > 60), quarters.join(" "));
});

test("très grande carte : la grille se desserre", () => {
  const field = bladeField(rectRings(0, 0, 100, 100), normalizeWind({ gap: 2.5 }), { maxBlades: 200_000 });
  assert.ok(field.count <= 210_000 && field.count > 150_000, `${field.count}`);
  assert.ok(field.gap > 0.025);
});

test("vu de loin, moins de brins mais plus larges", () => {
  assert.deepEqual(lod(0.025, 100), { fraction: 1, widthScale: 1 });
  const far = lod(0.025, 20);
  assert.ok(far.fraction < 0.1 && far.widthScale > 3);
  assert.equal(lod(0.025, 100, 0.35).fraction, 0.35, "réglage léger");
  const field = bladeField(rectRings(0, 0, 30, 30), normalizeWind({ gap: 10 }));
  assert.equal(visibleChunks(field, 0, 0, 5, 5).length, 1);
  assert.equal(visibleChunks(field, -100, -100, 100, 100).length, field.chunks.length);
});

test("uniformes du vent et poussées des jetons", () => {
  const u = windUniforms(normalizeWind({ dir: 90, waves: "gusts" }), 0.025);
  assert.ok(Math.abs(u.uWind[0]) < 1e-6 && Math.abs(u.uWind[1] - 1) < 1e-6);
  assert.equal(u.uMode, 1);
  assert.equal(u.uLength, 0.24);
  assert.ok(Math.abs(u.uWidth - 0.01) < 1e-9);
  const p = packPushers([{ x: 1, y: 2, r: 0.5 }]);
  assert.equal(p.length, MAX_PUSHERS * 4);
  assert.deepEqual([...p.slice(0, 5)], [1, 2, 0.5, 1, 0]);
  assert.match(GRASS_VERT, new RegExp(`uPush\\[${MAX_PUSHERS}\\]`));
});

test("un jeton laisse une trace où l'herbe se redresse", () => {
  const trail = new PushTrail();
  assert.equal(trail.update([{ id: "a", x: 5, y: 5, r: 0.8 }], 0.016).length, 1);
  let list = trail.update([{ id: "a", x: 7, y: 5, r: 0.8 }], 0.016);
  assert.equal(list.length, 2, "le jeton et sa trace");
  assert.equal(list[1].x, 5);
  list = trail.update([], 1);
  assert.ok(list.length === 0 || list[0].s < 0.5, "la trace s'efface");
});

test("données du vent pour la scène", () => {
  const map = createMap({ width: 10, height: 10 });
  assert.equal(windFlag(map), null);
  paintArea(map, rectRings(0, 0, 10, 10), "grass");
  const flag = windFlag(map);
  assert.equal(flag.v, 2);
  assert.ok(Math.abs(totalArea(flag.zone) - 100) < 0.01);
  assert.deepEqual(flag.wind, map.wind);
});

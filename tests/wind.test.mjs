import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeWind, grassZone, windFlag, WIND_DEFAULT } from "../scripts/wind.js";
import { bladeField, bladeAt, bladeRank, lod, drawCount, visibleChunks, pushersFor, windUniforms, gustAt, gustGrid, packPushers, PushTrail, grassVert, CHUNK, MAX_PUSHERS, BLADE_BYTES, GUST_MAX } from "../scripts/grass.js";
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
    assert.equal(c.data.length, c.count * BLADE_BYTES, "8 octets par brin");
    for (let i = 0; i < c.count; i++) {
      const [x, y] = bladeAt(c, i);
      assert.ok(x > 0 && x < 20 && y > 0 && y < 10);
      assert.ok(x >= c.cx - 1e-3 && x <= c.cx + CHUNK && y >= c.cy - 1e-3 && y <= c.cy + CHUNK);
    }
  }
  assert.deepEqual(bladeField(zone, wind).chunks[0].data, field.chunks[0].data);
  // Un trou dans la zone reste vide.
  const holed = bladeField([...rectRings(0, 0, 10, 10), ...rectRings(3, 3, 7, 7).reverse()], wind);
  assert.ok(Math.abs(holed.count - (100 - 16) * 100) < 200, `${holed.count}`);
  for (const c of holed.chunks) for (let i = 0; i < c.count; i++) {
    const [x, y] = bladeAt(c, i);
    assert.ok(!(x > 3.05 && x < 6.95 && y > 3.05 && y < 6.95));
  }
  assert.equal(bladeField([], wind).count, 0);
});

test("brins rangés par rang : les premiers d'un morceau couvrent tout le morceau", () => {
  const field = bladeField(rectRings(0, 0, 8, 8), normalizeWind({ gap: 5 }));
  const c = field.chunks[0];
  const quarters = [0, 0, 0, 0];
  let last = -1;
  for (let i = 0; i < c.count; i++) {
    const o = i * BLADE_BYTES, r = bladeRank(c.data[o + 4], c.data[o + 5], c.data[o + 6]);
    assert.ok(r >= last - 1e-9, "rangés par rang");
    last = r;
    if (i < 400) { const [x, y] = bladeAt(c, i); quarters[(x < 4 ? 0 : 1) + (y < 4 ? 0 : 2)]++; }
  }
  assert.ok(quarters.every((q) => q > 60), quarters.join(" "));
});

test("retouche : seuls les morceaux touchés sont recalculés", () => {
  const wind = normalizeWind({ gap: 10 });
  const before = bladeField(rectRings(0, 0, 32, 16), wind);
  const previous = new Map(before.chunks.map((c) => [c.key, c]));
  // On grignote un coin : seul le morceau de ce coin change.
  const after = bladeField([...rectRings(0, 0, 32, 16), ...rectRings(1, 1, 3, 3).reverse()], wind, { previous });
  const changed = after.chunks.filter((c) => !c.reused);
  assert.equal(changed.length, 1, after.chunks.map((c) => `${c.cx},${c.cy}:${c.reused}`).join(" "));
  assert.equal(changed[0].cx, 0);
  assert.equal(changed[0].cy, 0);
  for (const c of after.chunks.filter((k) => k.reused)) assert.equal(c.data, previous.get(c.key).data);
});

test("très grande carte : la grille se desserre", () => {
  const field = bladeField(rectRings(0, 0, 100, 100), normalizeWind({ gap: 2.5 }), { maxBlades: 200_000 });
  assert.ok(field.count <= 210_000 && field.count > 150_000, `${field.count}`);
  assert.ok(field.gap > 0.025);
});

test("vu de loin, moins de brins mais plus larges, en fondu", () => {
  assert.deepEqual(lod(0.025, 100), { fraction: 1, widthScale: 1, fadeLo: 1.01, fadeHi: 1.02 });
  const far = lod(0.025, 20);
  assert.ok(far.fraction < 0.1 && far.widthScale > 3);
  assert.ok(far.fadeLo < far.fraction && far.fadeHi > far.fraction, "fondu autour de la part dessinée");
  assert.equal(lod(0.025, 100, 0.35).fraction, 0.35, "réglage léger");
  const field = bladeField(rectRings(0, 0, 30, 30), normalizeWind({ gap: 10 }));
  assert.equal(visibleChunks(field, 0, 0, 5, 5).length, 1);
  assert.equal(visibleChunks(field, -100, -100, 100, 100).length, field.chunks.length);
  const c = field.chunks[0];
  assert.equal(drawCount(c, lod(0.025, 100)), c.count);
  assert.ok(drawCount(c, far) < c.count * 0.2);
});

test("vent : grille lue par les brins, jetons seulement là où ils sont", () => {
  const wind = normalizeWind(null);
  const g = gustGrid(0, 0, 10, 6, 1.5, wind);
  assert.equal(g.data.length, GUST_MAX * GUST_MAX);
  assert.ok(g.w >= 40 && g.h >= 24, "au moins 4 points par case");
  const step = g.rect[2] / GUST_MAX;
  assert.ok(Math.abs(g.data[3 * GUST_MAX + 5] / 255 - gustAt(5 * step, 3 * step, 1.5, wind)) < 0.01);
  assert.ok(gustGrid(0, 0, 1000, 1000, 0, wind).w <= GUST_MAX, "jamais plus grande que l'image");
  const field = bladeField(rectRings(0, 0, 30, 30), normalizeWind({ gap: 10 }));
  const pushers = [{ x: 2, y: 2, r: 0.8 }];
  assert.equal(pushersFor(field.chunks[0], pushers), 1);
  assert.equal(pushersFor(field.chunks.at(-1), pushers), 0);
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
  assert.match(grassVert(true), /#define GUST_TEXTURE/);
  assert.doesNotMatch(grassVert(false), /#define GUST_TEXTURE/);
  assert.match(grassVert(), new RegExp(`uPush\\[${MAX_PUSHERS}\\]`));
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

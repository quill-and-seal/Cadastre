import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWind, windField, grassZone, tuftPositions, bendIndex, pushSector, updatePush,
  bucketTufts, windFlag, WIND_DEFAULT, BEND_STEPS, PUSH_DIRS
} from "../scripts/wind.js";
import { createMap, normalizeMap, paintArea, addPath, addProp, addRoom } from "../scripts/model.js";
import { rectRings, pointInRings, totalArea } from "../scripts/poly.js";
import { rectNodes } from "../scripts/curves.js";

test("réglages du vent : valeurs par défaut et bornes", () => {
  assert.deepEqual(normalizeWind(null), WIND_DEFAULT);
  assert.deepEqual(normalizeWind({ dir: -90, strength: 3, gusts: -1, density: 99 }), { dir: 270, strength: 1, gusts: 0, density: 4 });
  assert.equal(normalizeWind({ dir: 0 }).dir, 0);
  assert.deepEqual(createMap().wind, WIND_DEFAULT);
  assert.equal(normalizeMap({ wind: { dir: 45 } }).wind.dir, 45);
});

test("le champ de vent reste entre 0 et 1, nul par temps calme, et avance dans le sens du vent", () => {
  const f = windField({ dir: 0, strength: 0.8, gusts: 0.5 });
  let min = 1, max = 0;
  for (let i = 0; i < 2000; i++) {
    const v = f.at(Math.random() * 40, Math.random() * 30, Math.random() * 20);
    min = Math.min(min, v); max = Math.max(max, v);
  }
  assert.ok(min >= 0 && max <= 1 && max - min > 0.4, `${min} → ${max}`);
  assert.equal(windField({ strength: 0 }).at(3, 3, 1), 0);
  // Le motif à l'instant t se retrouve plus loin dans le sens du vent (vers l'est) un peu plus tard.
  const dt = 0.5, shift = f.speed * dt;
  assert.ok(Math.abs(f.at(10, 7, 0) - f.at(10 + shift, 7, dt)) < 0.05);
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

test("touffes : dans la zone, denses comme demandé, toujours les mêmes, plafonnées", () => {
  const zone = rectRings(0, 0, 10, 10);
  const tufts = tuftPositions(zone, 1.5, { seed: 3 });
  assert.ok(tufts.length > 120 && tufts.length < 170, `${tufts.length}`);
  assert.ok(tufts.every((t) => pointInRings(zone, t.x, t.y)));
  assert.deepEqual(tuftPositions(zone, 1.5, { seed: 3 }), tufts);
  assert.ok(tuftPositions(rectRings(0, 0, 100, 100), 4, { maxCount: 2000 }).length <= 2100);
  assert.deepEqual(tuftPositions(zone, 0), []);
});

test("poses : couchage et secteur de poussée", () => {
  assert.equal(bendIndex(0), 0);
  assert.equal(bendIndex(1), BEND_STEPS - 1);
  assert.equal(pushSector(1, 0), 0);
  assert.equal(pushSector(0, 1), PUSH_DIRS / 4, "vers le sud (y vers le bas)");
  assert.equal(pushSector(-1, 0), PUSH_DIRS / 2);
});

test("un jeton couche l'herbe autour de lui, qui se redresse ensuite", () => {
  const tufts = [{ x: 5, y: 5 }, { x: 5.6, y: 5 }, { x: 9, y: 9 }];
  const amount = new Float32Array(3), sector = new Uint8Array(3);
  const buckets = bucketTufts(tufts);
  updatePush(tufts, [{ x: 5, y: 5, r: 1 }], amount, sector, 0.03, buckets);
  assert.ok(amount[0] > 0.9 && amount[1] > 0.4 && amount[2] === 0);
  assert.equal(sector[1], 0, "poussée vers l'est, loin du jeton");
  updatePush(tufts, [], amount, sector, 0.5, buckets);
  assert.ok(amount[0] < 0.4, "elle se redresse");
});

test("données du vent pour la scène", () => {
  const map = createMap({ width: 10, height: 10 });
  assert.equal(windFlag(map), null);
  paintArea(map, rectRings(0, 0, 10, 10), "grass");
  const flag = windFlag(map);
  assert.ok(Math.abs(totalArea(flag.zone) - 100) < 0.01);
  assert.deepEqual(flag.wind, map.wind);
});

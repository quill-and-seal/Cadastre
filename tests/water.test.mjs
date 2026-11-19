import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWater, waterFlag, buildField, sampleField, fieldPixels, waterVelocity, rockFlow, WaterSim,
  WATER_DEFAULT, INSTANCE_FLOATS, FIELD_RES, BASE_SPEED, SURFACE_FRAG, FLOAT_VERT
} from "../scripts/water.js";
import { createMap, normalizeMap, paintArea, addPath, addProp } from "../scripts/model.js";
import { rectRings } from "../scripts/poly.js";

const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

/** Rivière droite d'ouest en est, 3 cases de large, avec un rocher au milieu. */
function riverMap({ rock = true, flow = 1 } = {}) {
  const map = createMap({ width: 20, height: 10 });
  paintArea(map, rectRings(0, 0, 20, 10), "grass");
  addPath(map, [{ x: -1, y: 5 }, { x: 21, y: 5 }], { width: 3, terrain: "water", flow });
  if (rock) addProp(map, "barrel", 10, 5, 0, 1);
  return map;
}

test("réglages de l'eau : valeurs par défaut et bornes", () => {
  assert.deepEqual(normalizeWater(null), WATER_DEFAULT);
  assert.deepEqual(WATER_DEFAULT, { texture: "clear", glow: 0.6, strokes: false, particles: true, density: 60, turbulence: 0.35, eddies: 0.6 });
  assert.deepEqual(normalizeWater({ texture: "lave", glow: 3, strokes: "oui", density: -5, eddies: 2 }),
    { ...WATER_DEFAULT, glow: 1, density: 0, eddies: 1 });
  assert.equal(normalizeWater({ texture: "muddy" }).texture, "muddy");
  assert.deepEqual(createMap().water, WATER_DEFAULT);
  assert.equal(normalizeMap({ water: { strokes: true } }).water.strokes, true);
});

test("données de la scène : eau, rivières dans le sens du courant, rochers posés dans l'eau", () => {
  assert.equal(waterFlag(createMap()), null, "pas d'eau, rien");
  const flag = waterFlag(riverMap());
  assert.equal(flag.v, 1);
  assert.equal(flag.rivers.length, 1);
  const pts = flag.rivers[0].pts;
  assert.ok(pts[0][0] < pts.at(-1)[0], "d'ouest en est");
  assert.equal(flag.rocks.length, 1);
  assert.ok(flag.masks.length >= 1);
  assert.ok(waterFlag(riverMap({ flow: -1 })).rivers[0].pts[0][0] > 15, "courant inversé");
  assert.equal(waterFlag(riverMap({ flow: 0 })).rivers.length, 0, "eau calme : pas de courant");
  const bridge = riverMap({ rock: false });
  addPath(bridge, [{ x: 8, y: 2 }, { x: 8, y: 8 }], { width: 1.5, terrain: "wood" });
  assert.equal(waterFlag(bridge).masks.length > 0, true, "un pont passe par-dessus l'eau");
});

test("champ de courant : rapide au milieu, lent au bord, rien hors de l'eau ni sous un objet", () => {
  const field = buildField(waterFlag(riverMap()));
  assert.equal(field.W, 20 * FIELD_RES);
  const mid = sampleField(field, 4, 5), edge = sampleField(field, 4, 6.2), dry = sampleField(field, 4, 1);
  assert.ok(mid.vx > BASE_SPEED * 0.9 && Math.abs(mid.vy) < 0.05, `milieu ${mid.vx}`);
  assert.ok(edge.vx < mid.vx * 0.6, `bord ${edge.vx}`);
  assert.ok(mid.n < 0.1 && edge.n > 0.7);
  assert.ok(mid.a > 0.99 && dry.a === 0);
  assert.equal(sampleField(field, 10, 5).block, 1, "sous le tonneau, rien ne flotte");
  assert.ok(sampleField(field, 10, 5).a > 0.9, "l'eau passe sous le tonneau (éditeur, image)");
  const hidden = buildField(waterFlag(riverMap()), { hideMasked: true });
  assert.ok(sampleField(hidden, 10, 5).a < 0.01, "dans Foundry, l'eau animée s'efface sous le tonneau");
  assert.ok(field.area > 20 * 2 && field.area < 20 * 3, `${field.area}`);
  assert.equal(fieldPixels(field).length, field.W * field.H * 4);
  const rock = field.rocks[0];
  assert.ok(rock.U > 1 && Math.abs(rock.tx - 1) < 1e-6, "le rocher connaît le courant qui l'aborde");
});

test("autour d'un rocher : l'eau s'écrase devant sans repartir vers l'amont, tourbillonne derrière", () => {
  const field = buildField(waterFlag(riverMap()));
  const r = field.rocks[0], s = normalizeWater(null);
  const at = (a) => waterVelocity(field, { ...s, turbulence: 0 }, r.x + a * r.r, r.y, 3)[0];
  assert.ok(at(-6) > at(-2) && at(-2) > at(-1.2), "ralentit en approchant");
  assert.ok(at(-1.15) >= -0.01, "ne remonte pas le courant devant");
  assert.ok(at(1.3) < 0, "derrière, l'eau revient vers le rocher");
  assert.ok(at(12) > 0, "plus loin, elle repart");
  assert.equal(rockFlow(r, r.x + 100, r.y, 0, 1, 0.6), null, "loin du rocher, rien");
});

test("simulation : particules dans l'eau, traits seulement s'ils sont demandés", () => {
  const field = buildField(waterFlag(riverMap()));
  const sim = new WaterSim(field, normalizeWater(null), { rand: seeded(3) });
  assert.equal(sim.nStrokes, 0);
  assert.ok(sim.nFloat > 1000, `${sim.nFloat}`);
  for (let i = 0; i < 40; i++) sim.step(1 / 20);
  assert.ok(sim.count > 0 && sim.count <= sim.nFloat);
  for (let i = 0; i < sim.count; i++) {
    const o = i * INSTANCE_FLOATS, y = sim.instances[o + 1];
    assert.ok(y > 3.2 && y < 6.8, `dans la rivière : ${y}`);
  }
  const both = new WaterSim(field, normalizeWater({ strokes: true }), { rand: seeded(4) });
  assert.ok(both.nStrokes > 0);
  for (let i = 0; i < 20; i++) both.step(0.05);
  const kinds = new Set();
  for (let i = 0; i < both.count; i++) kinds.add(both.instances[i * INSTANCE_FLOATS + 5]);
  assert.ok(kinds.has(0) && kinds.has(1), [...kinds].join(","));
  assert.equal(new WaterSim(field, normalizeWater({ particles: false })).nFloat, 0);
  assert.ok(new WaterSim(field, normalizeWater(null), { cap: 0.3 }).nFloat < sim.nFloat * 0.4, "réglage léger");
});

test("programmes de carte graphique", () => {
  assert.match(SURFACE_FRAG, /uniform sampler2D uField/);
  assert.match(FLOAT_VERT, /attribute vec4 aP0/);
});

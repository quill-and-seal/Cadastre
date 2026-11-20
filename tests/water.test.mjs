import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWater, waterFlag, buildField, sampleField, fieldPixels, waterVelocity, rockFlow, WaterSim,
  WATER_DEFAULT, INSTANCE_FLOATS, FIELD_RES, BASE_SPEED, SURFACE_FRAG, BED_FRAG, FLOAT_VERT, BED_MAX,
  RockGrid, quadTriangles, waterVisible, bedLayout, coastPixels
} from "../scripts/water.js";
import { COAST_KINDS, wavePhase } from "../scripts/coast.js";
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
  assert.deepEqual(WATER_DEFAULT, { texture: "clear", glow: 0.6, strokes: false, particles: true, density: 60, turbulence: 0.35, eddies: 0.6, waves: 0.6, period: 7, spray: 0.6 });
  assert.deepEqual(normalizeWater({ texture: "lave", glow: 3, strokes: "oui", density: -5, eddies: 2, waves: 4, period: 1, spray: -1 }),
    { ...WATER_DEFAULT, glow: 1, density: 0, eddies: 1, waves: 1, period: 3, spray: 0 });
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

test("eau dessinée seulement là où elle est, fond précalculé à la finesse de la scène", () => {
  const field = buildField(waterFlag(riverMap()));
  const tri = quadTriangles(field);
  assert.equal(tri.length, (field.quads.length / 4) * 12);
  assert.ok(field.quads.length / 4 < (20 * 10) / 16, "pas toute la carte");
  assert.ok(field.bounds.y0 <= 3.5 && field.bounds.y1 >= 6.5);
  assert.ok(waterVisible(field, 0, 4, 2, 6));
  assert.ok(!waterVisible(field, 0, 8.5, 20, 10), "pas d'eau en bas de la carte");
  const lay = bedLayout(field, 100);
  assert.equal(lay.width, Math.round(lay.rect[2] * 100));
  const big = bedLayout(field, 10000);
  assert.ok(big.width <= BED_MAX && big.height <= BED_MAX, "jamais plus grande que BED_MAX");
});

test("simulation : rochers rangés par zone, rien de dessiné hors de la vue, état repris", () => {
  const field = buildField(waterFlag(riverMap()));
  const grid = new RockGrid(field.rocks);
  const r = field.rocks[0];
  assert.ok(grid.near(r.x + 3 * r.r, r.y).includes(r), "en aval, le rocher compte");
  assert.equal(grid.near(r.x - 200, r.y).length, 0);
  assert.ok(grid.inside(r.x, r.y) && !grid.inside(r.x + 2 * r.r, r.y));
  // Même vitesse avec ou sans le rangement.
  const s = normalizeWater(null);
  const a = waterVelocity(field, s, r.x + 3 * r.r, r.y + 0.1, 2), b = waterVelocity(field, s, r.x + 3 * r.r, r.y + 0.1, 2, undefined, grid);
  assert.ok(Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9);
  const sim = new WaterSim(field, s, { rand: seeded(5) });
  for (let i = 0; i < 30; i++) sim.step(1 / 20);
  sim.step(1 / 20, { x0: 0, y0: 0, x1: 5, y1: 10, ppc: 100 });
  for (let i = 0; i < sim.count; i++) assert.ok(sim.instances[i * INSTANCE_FLOATS] <= 6.3, "rien de dessiné hors de la vue (marge d'une case)");
  assert.ok(sim.stats.simulated < sim.nFloat, "hors de la vue, simulé moins souvent");
  const far = new WaterSim(field, s, { rand: seeded(5) });
  for (let i = 0; i < 30; i++) far.step(1 / 20);
  far.step(1 / 20, { x0: 0, y0: 0, x1: 20, y1: 10, ppc: 8 });
  const near = new WaterSim(field, s, { rand: seeded(5) });
  for (let i = 0; i < 30; i++) near.step(1 / 20);
  near.step(1 / 20, { x0: 0, y0: 0, x1: 20, y1: 10, ppc: 100 });
  assert.ok(far.count < near.count * 0.6, `de loin, moins d'écume : ${far.count} / ${near.count}`);
  const copy = new WaterSim(field, s, { state: sim.state() });
  assert.equal(copy.Q, sim.Q, "état repris tel quel");
  assert.equal(copy.t, sim.t);
});

test("programmes de carte graphique", () => {
  assert.match(SURFACE_FRAG, /uniform sampler2D uBed/);
  assert.match(BED_FRAG, /cells\(/);
  assert.doesNotMatch(SURFACE_FRAG, /cells\(/, "le fond n'est plus recalculé à chaque image");
  assert.match(SURFACE_FRAG, /uniform sampler2D uField/);
  assert.match(FLOAT_VERT, /attribute vec4 aP0/);
});

/* -------------------------------------------- */
/*  Plages et falaises                          */
/* -------------------------------------------- */

/** Mer en haut ; plage à gauche, falaise à droite, herbe ailleurs. */
function coastMap({ river = false } = {}) {
  const map = createMap({ width: 20, height: 10 });
  paintArea(map, rectRings(0, 0, 20, 10), "grass");
  paintArea(map, rectRings(0, 4, 10, 6), "sand");
  paintArea(map, rectRings(10, 4, 18, 7), "rock");
  paintArea(map, rectRings(0, 0, 20, 4), "water");
  if (river) addPath(map, [{ x: 4, y: 3 }, { x: 4, y: 9 }], { width: 1.5, terrain: "water", flow: 1 });
  addProp(map, "barrel", 14, 3.3, 0, 1);
  return map;
}

test("côtes : le sol qui borde l'eau fait une plage (sable) ou une falaise (roche)", () => {
  const flag = waterFlag(coastMap());
  const segs = flag.coast.segs;
  assert.ok(segs.some((q) => q[4] === COAST_KINDS.sand && q[0] < 10), "plage à gauche");
  assert.ok(segs.some((q) => q[4] === COAST_KINDS.rock && q[0] >= 10), "falaise à droite");
  assert.ok(!segs.some((q) => q[0] > 18.5 && q[2] > 18.5 && Math.abs(q[1] - 4) < 0.01), "herbe : pas de côte");
  for (const q of segs.filter((q) => Math.abs(q[1] - 4) < 0.01 && Math.abs(q[3] - 4) < 0.01)) assert.ok(q[6] > 0.99, "vers la terre");
  assert.ok(flag.coast.dir[1] > 0.9, `les vagues viennent du large : ${flag.coast.dir}`);
  assert.equal(waterFlag(riverMap()).coast, null, "pas de sable ni de roche : rien");
  const withRiver = waterFlag(coastMap({ river: true })).coast.segs;
  assert.ok(!withRiver.some((q) => Math.abs((q[0] + q[2]) / 2 - 4) < 0.6 && q[1] > 4.2), "berges d'une rivière : pas de vagues");
});

test("côtes : distance au rivage de part et d'autre, l'eau va jusqu'au bord", () => {
  const field = buildField(waterFlag(coastMap()));
  const c = field.coast, at = (x, y) => { const o = Math.floor(y * FIELD_RES) * field.W + Math.floor(x * FIELD_RES); return { d: c.d[o], sand: c.sand[o], rock: c.rock[o], a: field.a[o] }; };
  const sea = at(5, 3.5), beach = at(5, 4.6), cliff = at(14, 4.4), meadow = at(5, 7.5);
  assert.ok(sea.d < 0 && beach.d > 0, `${sea.d} ${beach.d}`);
  assert.ok(Math.abs(beach.d - 0.6) < 0.1);
  assert.ok(sea.sand > 0.9 && beach.sand > 0.9 && cliff.rock > 0.9);
  assert.equal(meadow.sand + meadow.rock, 0, "loin du rivage, rien");
  assert.ok(sea.a > 0.99, "près d'une côte, l'eau va jusqu'au rivage");
  // Le sable près de l'eau est dessiné (la vague y monte).
  assert.ok(waterVisible(field, 3, 4.5, 6, 5.5));
  assert.equal(coastPixels(field).length, field.W * field.H * 4);
  assert.ok(c.samples.length / 5 > 100, "points d'écume et de gerbes le long des côtes");
});

test("côtes : écume avec les vagues, gerbes contre la falaise, rien par temps calme", () => {
  const field = buildField(waterFlag(coastMap()));
  const sim = new WaterSim(field, normalizeWater({ particles: false }), { rand: seeded(9) });
  assert.ok(sim.coast && sim.coast.capacity > 0);
  let most = 0, drops = 0;
  for (let i = 0; i < 20 * 10; i++) { sim.step(1 / 20); most = Math.max(most, sim.count); drops = Math.max(drops, sim.coast.nG); }
  assert.ok(most > 50, `écume : ${most}`);
  assert.ok(drops > 50, `gerbes : ${drops}`);
  for (let i = 0; i < sim.count; i++) {
    const y = sim.instances[i * INSTANCE_FLOATS + 1];
    assert.ok(y > 0.5 && y < 6.5, `près du rivage (le ressac s’éloigne un peu) : ${y}`);
  }
  const calm = new WaterSim(field, normalizeWater({ particles: false, waves: 0 }), { rand: seeded(9) });
  for (let i = 0; i < 100; i++) calm.step(1 / 20);
  assert.equal(calm.count, 0, "pas de vagues : ni écume ni gerbes");
  // Les vagues arrivent d'abord sur ce qui avance le plus en mer.
  assert.ok(wavePhase(5, 3, 2.5, 7, [0, 1]) > wavePhase(5, 4, 2.5, 7, [0, 1]));
  assert.match(SURFACE_FRAG, /uniform sampler2D uCoast/);
});

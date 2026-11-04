import { test } from "node:test";
import assert from "node:assert/strict";
import {
  union, difference, intersection, strokeRings, offsetRings, totalArea, pointInRings,
  clipPolyline, rectRings, normalizeRings
} from "../scripts/poly.js";

const near = (a, b, eps) => Math.abs(a - b) < eps;

test("union et différence de rectangles", () => {
  const a = rectRings(0, 0, 4, 4), b = rectRings(2, 2, 6, 6);
  assert.ok(near(totalArea(union(a, b)), 28, 1e-6));
  assert.ok(near(totalArea(difference(a, b)), 12, 1e-6));
  assert.ok(near(totalArea(intersection(a, b)), 4, 1e-6));
});

test("un trou garde un sens inverse : l'aire totale le soustrait", () => {
  const ring = difference(rectRings(0, 0, 10, 10), rectRings(4, 4, 6, 6));
  assert.equal(ring.length, 2);
  assert.ok(near(totalArea(ring), 96, 1e-6));
  assert.ok(!pointInRings(ring, 5, 5));
  assert.ok(pointInRings(ring, 1, 1));
});

test("un trait de pinceau couvre une capsule", () => {
  const r = strokeRings([[0, 0], [4, 0]], 1);
  // Rectangle 4×2 + disque de rayon 1.
  assert.ok(near(totalArea(r), 8 + Math.PI, 0.03));
  assert.ok(pointInRings(r, -0.9, 0) && !pointInRings(r, -1.1, 0));
  assert.ok(near(totalArea(strokeRings([[2, 2]], 0.5)), Math.PI / 4, 0.02), "un simple clic fait un disque");
});

test("rétrécir une zone", () => {
  assert.ok(near(totalArea(offsetRings(rectRings(0, 0, 4, 4), -1)), 4, 1e-3));
});

test("une boucle qui se croise est remise d'aplomb", () => {
  const bow = [[0, 0, 2, 2, 2, 0, 0, 2]];
  assert.ok(totalArea(normalizeRings(bow)) > 1.9);
});

test("découper un mur par une zone, dehors ou dedans", () => {
  const square = rectRings(0, 0, 10, 10);
  assert.deepEqual(clipPolyline([[-5, 5], [15, 5]], false, square), [[[-5, 5], [0, 5]], [[10, 5], [15, 5]]]);
  assert.deepEqual(clipPolyline([[-5, 5], [15, 5]], false, square, { inside: true }), [[[0, 5], [10, 5]]]);
});

test("une boucle non touchée reste une boucle", () => {
  const loop = [[20, 20], [22, 20], [22, 22]];
  const out = clipPolyline(loop, true, rectRings(0, 0, 10, 10));
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], [[20, 20], [22, 20], [22, 22], [20, 20]]);
});

test("une boucle coupée une fois donne un seul morceau continu", () => {
  const loop = [[0, 0], [4, 0], [4, 4], [0, 4]];
  const out = clipPolyline(loop, true, rectRings(-1, 1, 1, 3));
  assert.equal(out.length, 1);
  assert.deepEqual(out[0][0], [0, 1]);
  assert.deepEqual(out[0].at(-1), [0, 3]);
});

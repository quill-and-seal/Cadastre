import { test } from "node:test";
import assert from "node:assert/strict";
import {
  flattenNodes, rdp, smoothNodes, ellipseNodes, rectNodes, polylineLength,
  pointAt, project, cutIntervals
} from "../scripts/curves.js";

const near = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

test("un tracé sans poignées reste fait de coins", () => {
  assert.deepEqual(flattenNodes(rectNodes(0, 0, 2, 1), true), [[0, 0], [2, 0], [2, 1], [0, 1]]);
  assert.deepEqual(flattenNodes([{ x: 0, y: 0 }, { x: 3, y: 4 }]), [[0, 0], [3, 4]]);
});

test("une ellipse aplatie a le bon périmètre", () => {
  const pts = flattenNodes(ellipseNodes(5, 5, 2, 2), true, 0.005);
  assert.ok(near(polylineLength(pts, true), 2 * Math.PI * 2, 0.02));
  for (const [x, y] of pts) assert.ok(near(Math.hypot(x - 5, y - 5), 2, 0.01));
});

test("RDP garde les coins, retire les points alignés", () => {
  assert.deepEqual(rdp([[0, 0], [1, 0.001], [2, 0], [2, 2]], 0.01), [[0, 0], [2, 0], [2, 2]]);
});

test("le lissage passe par les points et ajoute des poignées", () => {
  const nodes = smoothNodes([[0, 0], [1, 1], [2, 0], [3, 1]]);
  assert.deepEqual([nodes[1].x, nodes[1].y], [1, 1]);
  assert.ok(nodes[1].o && nodes[1].i);
  assert.equal(nodes[0].o, undefined, "pas de poignée aux extrémités d'un tracé ouvert");
});

test("point à une abscisse et projection", () => {
  const sq = [[0, 0], [4, 0], [4, 4], [0, 4]];
  assert.deepEqual(pointAt(sq, true, 6), { x: 4, y: 2, tx: 0, ty: 1 });
  assert.deepEqual(pointAt(sq, true, 18).y, 0, "la boucle repart du début");
  const hit = project(sq, true, 2, -0.5);
  assert.ok(near(hit.s, 2) && near(hit.d, 0.5));
  const back = project(sq, true, -0.2, 2);
  assert.ok(near(back.s, 14), "le segment de retour d'une boucle compte");
});

test("couper des portes dans un mur ouvert", () => {
  const pieces = cutIntervals([[0, 0], [10, 0]], false, [[2, 3], [8, 11]]);
  assert.deepEqual(pieces, [[[0, 0], [2, 0]], [[3, 0], [8, 0]]]);
});

test("couper une porte dans une boucle donne un seul morceau ouvert", () => {
  const sq = [[0, 0], [4, 0], [4, 4], [0, 4]];
  const pieces = cutIntervals(sq, true, [[1, 2]]);
  assert.equal(pieces.length, 1);
  assert.deepEqual(pieces[0][0], [2, 0]);
  assert.deepEqual(pieces[0].at(-1), [1, 0]);
  assert.ok(near(polylineLength(pieces[0], false), 15));
});

test("une porte à cheval sur le départ d'une boucle", () => {
  const sq = [[0, 0], [4, 0], [4, 4], [0, 4]];
  const pieces = cutIntervals(sq, true, [[-0.5, 0.5]]);
  assert.equal(pieces.length, 1);
  assert.ok(near(polylineLength(pieces[0], false), 15));
});

test("portion d'un tracé : coins et passage par le départ d'une boucle", async () => {
  const { subNodes } = await import("../scripts/curves.js");
  const pts = (nodes) => nodes.map((n) => [n.x, n.y]);
  assert.deepEqual(pts(subNodes(rectNodes(0, 0, 4, 4), true, 2, 6)), [[2, 0], [4, 0], [4, 2]]);
  assert.deepEqual(pts(subNodes(rectNodes(0, 0, 4, 4), true, 14, 18)), [[0, 2], [0, 0], [2, 0]]);
  assert.deepEqual(pts(subNodes([{ x: 0, y: 0 }, { x: 10, y: 0 }], false, 3, 7)), [[3, 0], [7, 0]]);
});

test("portion d'une ellipse : reste sur l'ellipse, avec des poignées", async () => {
  const { subNodes } = await import("../scripts/curves.js");
  const part = subNodes(ellipseNodes(0, 0, 3, 2), true, 1, 9);
  assert.ok(part.length >= 3 && part.length <= 5);
  assert.ok(part[0].o && part.at(-1).i);
  for (const [x, y] of flattenNodes(part, false, 0.005)) assert.ok(Math.abs((x / 3) ** 2 + (y / 2) ** 2 - 1) < 0.01);
});

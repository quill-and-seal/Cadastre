import { test } from "node:test";
import assert from "node:assert/strict";
import { pickCell, pickVertex, pickEdge, mergeSegments, edgesOfKind, cellHash } from "../scripts/geometry.js";

test("repérage de case et de sommet", () => {
  assert.deepEqual(pickCell(2.7, 0.1), [2, 0]);
  assert.deepEqual(pickVertex(2.7, 0.4), [3, 0]);
});

test("repérage d'arête : la plus proche, ou rien au centre d'une case", () => {
  assert.deepEqual(pickEdge(2.5, 3.1), { o: "h", x: 2, y: 3 });
  assert.deepEqual(pickEdge(2.5, 3.9), { o: "h", x: 2, y: 4 });
  assert.deepEqual(pickEdge(4.05, 1.5), { o: "v", x: 4, y: 1 });
  assert.equal(pickEdge(2.5, 3.5), null);
});

test("les murs alignés et contigus sont fusionnés", () => {
  const edges = {
    "h,0,0": "wall", "h,1,0": "wall", "h,2,0": "door", "h,3,0": "wall",
    "v,0,0": "wall", "v,0,1": "wall", "v,0,2": "secret"
  };
  assert.deepEqual(mergeSegments(edges, ["wall"]), [
    { a: [0, 0], b: [2, 0] },
    { a: [0, 0], b: [0, 2] },
    { a: [3, 0], b: [4, 0] }
  ]);
  // À l'export, la porte secrète se dessine comme un mur.
  assert.deepEqual(mergeSegments(edges, ["wall", "secret"]).find((s) => s.a[0] === 0 && s.b[1] === 3), { a: [0, 0], b: [0, 3] });
});

test("les portes restent une par arête", () => {
  const doors = edgesOfKind({ "h,1,2": "door", "h,2,2": "door", "v,0,0": "wall" }, "door");
  assert.equal(doors.length, 2);
  assert.deepEqual(doors[0].b, [2, 2]);
});

test("la variation de teinte est stable", () => {
  assert.equal(cellHash(3, 4), cellHash(3, 4));
  assert.notEqual(cellHash(3, 4), cellHash(4, 3));
});

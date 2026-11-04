import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createMap, normalizeMap, paintCells, brushCells, fillCells, setEdge, cycleDoor,
  lineEdges, lineEnd, setLine, drawRoom, rectEdges, addProp, propAt, rotateProp,
  removeProp, resizeMap, isEmpty, propFits
} from "../scripts/model.js";

const small = () => createMap({ name: "Test", cols: 8, rows: 6 });

test("une carte neuve est vide et bornée", () => {
  const map = createMap({ cols: 1000, rows: -3, gridSize: 7 });
  assert.equal(map.cols, 120);
  assert.equal(map.rows, 4);
  assert.equal(map.gridSize, 50);
  assert.ok(isEmpty(map));
});

test("le pinceau carré reste dans la carte", () => {
  const map = small();
  assert.deepEqual(brushCells(map, 0, 0, 3), [[0, 0], [1, 0], [0, 1], [1, 1]]);
  assert.equal(brushCells(map, 4, 3, 2).length, 4);
});

test("peindre puis effacer un sol", () => {
  const map = small();
  assert.ok(paintCells(map, [[1, 1], [2, 1]], "stone"));
  assert.equal(paintCells(map, [[1, 1]], "stone"), false, "aucun changement si le sol est déjà là");
  assert.deepEqual(map.floor, { "1,1": "stone", "2,1": "stone" });
  assert.ok(paintCells(map, [[1, 1]], null));
  assert.deepEqual(map.floor, { "2,1": "stone" });
});

test("le remplissage s'arrête aux murs et aux autres sols", () => {
  const map = small();
  drawRoom(map, [0, 0], [2, 2], "wood");
  paintCells(map, [[3, 0], [4, 0]], "wood");
  // Le mur de droite de la pièce sépare les deux zones de bois.
  const filled = fillCells(map, 1, 1);
  assert.equal(filled.length, 9);
  assert.ok(!filled.some(([x]) => x >= 3));
});

test("arêtes : bornes, pose, effacement", () => {
  const map = small();
  assert.ok(setEdge(map, "h", 7, 6, "wall"));
  assert.equal(setEdge(map, "h", 8, 0, "wall"), false, "hors de la carte");
  assert.equal(setEdge(map, "v", 9, 0, "wall"), false);
  assert.equal(setEdge(map, "h", 7, 6, "wall"), false, "déjà posé");
  assert.ok(setEdge(map, "h", 7, 6, null));
  assert.deepEqual(map.edges, {});
});

test("l'outil porte alterne porte et porte secrète", () => {
  const map = small();
  setEdge(map, "v", 2, 2, "wall");
  cycleDoor(map, "v", 2, 2);
  assert.equal(map.edges["v,2,2"], "door");
  cycleDoor(map, "v", 2, 2);
  assert.equal(map.edges["v,2,2"], "secret");
  cycleDoor(map, "v", 2, 2);
  assert.equal(map.edges["v,2,2"], "door");
});

test("une ligne suit l'axe dominant", () => {
  assert.deepEqual(lineEdges([1, 2], [4, 3]), [{ o: "h", x: 1, y: 2 }, { o: "h", x: 2, y: 2 }, { o: "h", x: 3, y: 2 }]);
  assert.deepEqual(lineEdges([3, 3], [2, 1]), [{ o: "v", x: 3, y: 1 }, { o: "v", x: 3, y: 2 }]);
  assert.deepEqual(lineEnd([1, 2], [4, 3]), [4, 2]);
});

test("tracer un mur ne remplace pas une porte, la gomme si", () => {
  const map = small();
  setEdge(map, "h", 2, 1, "door");
  setLine(map, [0, 1], [4, 1], "wall");
  assert.equal(map.edges["h,2,1"], "door");
  assert.equal(map.edges["h,0,1"], "wall");
  setLine(map, [0, 1], [4, 1], null);
  assert.deepEqual(map.edges, {});
});

test("pourtour et intérieur d'un rectangle", () => {
  const { perimeter, interior } = rectEdges({ x0: 0, y0: 0, x1: 1, y1: 1 });
  assert.equal(perimeter.length, 8);
  assert.equal(interior.length, 4);
});

test("deux pièces qui se chevauchent n'en font qu'une, les portes restent", () => {
  const map = small();
  drawRoom(map, [0, 0], [2, 2], "stone");
  cycleDoor(map, "h", 1, 3);
  drawRoom(map, [2, 0], [4, 2], "stone");
  // L'ancien mur de droite de la première pièce (x = 3) est à l'intérieur de la seconde : retiré.
  assert.equal(map.edges["v,3,1"], undefined);
  // La porte du bas, sur le pourtour, est conservée.
  assert.equal(map.edges["h,1,3"], "door");
  assert.equal(map.edges["v,5,1"], "wall");
  assert.equal(Object.keys(map.floor).length, 15);
});

test("une pièce qui déborde est coupée au bord de la carte", () => {
  const map = small();
  assert.ok(drawRoom(map, [6, 4], [12, 9], "dirt"));
  assert.equal(Object.keys(map.floor).length, 4);
  assert.equal(map.edges["v,8,5"], "wall");
});

test("objets : pose, recherche, rotation, retrait", () => {
  const map = small();
  assert.equal(addProp(map, "table", 7, 0), null, "une table de 2 cases ne tient pas au bord");
  const table = addProp(map, "table", 2, 2);
  assert.ok(table);
  assert.equal(propAt(map, 3, 2), table);
  assert.equal(propAt(map, 3, 3), null);
  assert.ok(rotateProp(map, table.id));
  assert.equal(propAt(map, 2, 3), table, "tournée, la table occupe 1×2");
  assert.ok(removeProp(map, table.id));
  assert.equal(map.props.length, 0);
  assert.ok(!propFits(map, "dragon", 0, 0));
});

test("une rotation qui sortirait de la carte est refusée", () => {
  const map = small();
  const bed = addProp(map, "bed", 7, 0);
  assert.ok(bed);
  rotateProp(map, bed.id);
  assert.equal(bed.r, 0);
});

test("la remise en forme écarte les données invalides", () => {
  const map = normalizeMap({
    name: "Vieille carte", cols: 5, rows: 5,
    floor: { "0,0": "stone", "9,9": "stone", "1,1": "lava", "x": "wood" },
    edges: { "h,0,0": "wall", "v,6,0": "wall", "h,1,1": "portail", "z,1,1": "wall" },
    props: [{ type: "barrel", x: 1, y: 1 }, { type: "table", x: 4, y: 0 }, null, { type: "crate", x: 2, y: 2, r: 9 }],
    sceneId: "abc"
  });
  assert.deepEqual(map.floor, { "0,0": "stone" });
  assert.deepEqual(map.edges, { "h,0,0": "wall" });
  assert.equal(map.props.length, 2);
  assert.equal(map.props[1].r, 3);
  assert.equal(new Set(map.props.map((p) => p.id)).size, 2);
  assert.equal(map.sceneId, "abc");
  assert.equal(normalizeMap(null).cols, 24);
});

test("réduire la carte retire ce qui dépasse", () => {
  const map = small();
  drawRoom(map, [0, 0], [7, 5], "stone");
  addProp(map, "barrel", 7, 5);
  map.sceneId = "s1";
  assert.ok(resizeMap(map, 4, 4));
  assert.equal(Object.keys(map.floor).length, 16);
  assert.equal(map.props.length, 0);
  assert.ok(Object.keys(map.edges).every((k) => !k.startsWith("v,8")));
  assert.equal(map.sceneId, "s1");
});

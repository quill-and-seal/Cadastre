import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createMap, normalizeMap, paintArea, eraseArea, addWall, addRoom, addDoor, doorEnds,
  removeWall, moveWall, moveNode, toggleNodeSmooth, removeNode, addProp, propAt, updateProp,
  resizeMap, isEmpty, nearestWall
} from "../scripts/model.js";
import { rectNodes, ellipseNodes, flattenNodes } from "../scripts/curves.js";
import { rectRings, strokeRings, totalArea, pointInRings } from "../scripts/poly.js";

const near = (a, b, eps = 1e-2) => Math.abs(a - b) < eps;
const area = (map, id) => totalArea(map.terrains[id] ?? []);

test("une carte neuve est vide et bornée", () => {
  const map = createMap({ width: 1000, height: -3, gridSize: 7 });
  assert.equal(map.width, 120);
  assert.equal(map.height, 4);
  assert.equal(map.gridSize, 50);
  assert.ok(isEmpty(map));
});

test("peindre un sol remplace les autres au même endroit", () => {
  const map = createMap({ width: 10, height: 10 });
  paintArea(map, rectRings(0, 0, 6, 6), "grass");
  paintArea(map, rectRings(4, 4, 8, 8), "stone");
  assert.ok(near(area(map, "grass"), 36 - 4));
  assert.ok(near(area(map, "stone"), 16));
  assert.ok(!pointInRings(map.terrains.grass, 5, 5));
});

test("la peinture est rognée au bord de la carte", () => {
  const map = createMap({ width: 5, height: 5 });
  paintArea(map, rectRings(-5, -5, 2, 2), "dirt");
  assert.ok(near(area(map, "dirt"), 4));
});

test("la gomme retire le sol, coupe les murs et enlève les objets", () => {
  const map = createMap({ width: 20, height: 20 });
  paintArea(map, rectRings(0, 0, 10, 10), "wood");
  addWall(map, [{ x: 0, y: 5 }, { x: 10, y: 5 }]);
  addProp(map, "barrel", 5, 5.5);
  assert.ok(eraseArea(map, strokeRings([[5, 5]], 1)));
  assert.equal(map.walls.length, 2, "le mur coupé en deux");
  assert.equal(map.props.length, 0);
  assert.ok(area(map, "wood") < 100 - 3);
});

test("la gomme peut ne viser que les murs", () => {
  const map = createMap({ width: 20, height: 20 });
  paintArea(map, rectRings(0, 0, 10, 10), "wood");
  addWall(map, [{ x: 0, y: 5 }, { x: 10, y: 5 }]);
  eraseArea(map, strokeRings([[5, 5]], 1), { floor: false, props: false });
  assert.ok(near(area(map, "wood"), 100));
  assert.equal(map.walls.length, 2);
});

test("une pièce : sol et mur fermé sur son contour, courbes conservées", () => {
  const map = createMap({ width: 20, height: 20 });
  addRoom(map, ellipseNodes(10, 10, 4, 3), "stone");
  assert.equal(map.walls.length, 1);
  assert.ok(map.walls[0].closed);
  assert.ok(map.walls[0].nodes[0].o, "les poignées de l'ellipse restent");
  assert.ok(near(area(map, "stone"), Math.PI * 12, 0.1));
});

test("deux pièces qui se chevauchent n'en font qu'une", () => {
  const map = createMap({ width: 20, height: 20 });
  addRoom(map, rectNodes(2, 2, 8, 8), "stone");
  addRoom(map, rectNodes(6, 4, 12, 10), "wood");
  // Plus aucun mur dans la partie commune.
  const inside = map.walls.some((w) => w.nodes.some((n) => n.x > 6.1 && n.x < 7.9 && n.y > 4.1 && n.y < 7.9));
  assert.ok(!inside);
  // Le contour de la seconde pièce s'arrête à la première : pas de mur en x = 6 entre y 4 et 8.
  assert.equal(nearestWall(map, 6, 6, 0.05), null);
  assert.ok(nearestWall(map, 12, 7, 0.05), "le mur extérieur de la seconde pièce existe");
  assert.ok(nearestWall(map, 2, 5, 0.05), "celui de la première aussi");
});

test("une porte reste sur son mur quand la pièce voisine le coupe", () => {
  const map = createMap({ width: 20, height: 20 });
  addRoom(map, rectNodes(2, 2, 8, 8), "stone");
  const wall = map.walls[0];
  addDoor(map, wall.id, 9, 1); // milieu du mur de droite (x = 8, y = 5)
  addRoom(map, rectNodes(8, 0, 12, 4), "wood"); // touche l'angle haut-droit, loin de la porte
  assert.equal(map.doors.length, 1);
  const ends = doorEnds(map, map.doors[0]);
  assert.ok(near(ends.a[0], 8) && near((ends.a[1] + ends.b[1]) / 2, 5, 0.05));
});

test("supprimer un mur supprime ses portes", () => {
  const map = createMap({ width: 10, height: 10 });
  const w = addWall(map, [{ x: 1, y: 1 }, { x: 5, y: 1 }]);
  addDoor(map, w.id, 2);
  removeWall(map, w.id);
  assert.equal(map.doors.length, 0);
});

test("déplacer un mur, un nœud ; coin ↔ courbe ; retirer un nœud", () => {
  const map = createMap({ width: 10, height: 10 });
  const w = addWall(map, [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 5, y: 1 }]);
  moveWall(map, w.id, 1, 2);
  assert.deepEqual([w.nodes[0].x, w.nodes[0].y], [2, 3]);
  const d = addDoor(map, w.id, 2);
  moveNode(map, w.id, 2, 10, 3); // le mur passe de 4 à 8 de long
  assert.ok(near(d.s, 4), "la porte garde sa place relative");
  toggleNodeSmooth(map, w.id, 1);
  assert.ok(w.nodes[1].o && w.nodes[1].i);
  toggleNodeSmooth(map, w.id, 1);
  assert.ok(!w.nodes[1].o);
  removeNode(map, w.id, 1);
  assert.equal(w.nodes.length, 2);
  removeNode(map, w.id, 0);
  assert.equal(map.walls.length, 0, "un mur de deux nœuds disparaît");
});

test("objets : angle, échelle, sélection par la forme tournée", () => {
  const map = createMap({ width: 10, height: 10 });
  const t = addProp(map, "table", 5, 5, 90);
  assert.equal(propAt(map, 5, 5.9), t, "la table tournée s'étend en hauteur");
  assert.equal(propAt(map, 5.9, 5), null);
  updateProp(map, t.id, { k: 2, a: -90 });
  assert.equal(t.a, 270);
  assert.equal(propAt(map, 5, 6.8), t);
  assert.equal(addProp(map, "dragon", 1, 1), null);
});

test("la remise en forme écarte les données invalides", () => {
  const map = normalizeMap({
    name: "Vieille", width: 10, height: 10, seq: 3,
    terrains: { stone: [[0, 0, 2, 0, 2, 2]], lava: [[0, 0, 1, 0, 1, 1]], wood: [[1, 2, 3]] },
    walls: [{ id: "w1", nodes: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }, { id: "w1", nodes: [{ x: 0, y: 0 }, { x: 0, y: 2 }], closed: true }, { nodes: [{ x: 1 }] }],
    doors: [{ wall: "w1", s: 0.5, w: 99 }, { wall: "zz", s: 1 }],
    props: [{ type: "barrel", x: 1, y: 1, a: 400 }, { type: "nope", x: 1, y: 1 }]
  });
  assert.deepEqual(Object.keys(map.terrains), ["stone"]);
  assert.equal(map.walls.length, 2);
  assert.notEqual(map.walls[0].id, map.walls[1].id, "identifiants uniques");
  assert.equal(map.walls[1].closed, false, "une boucle de deux nœuds n'est pas fermée");
  assert.equal(map.doors.length, 1);
  assert.equal(map.doors[0].w, 8);
  assert.equal(map.props[0].a, 40);
  assert.equal(map.props.length, 1);
  assert.equal(normalizeMap(null).width, 30);
});

test("réduire la carte rogne sols, murs et objets", () => {
  const map = createMap({ width: 20, height: 20 });
  paintArea(map, rectRings(0, 0, 20, 20), "grass");
  addWall(map, [{ x: 2, y: 5 }, { x: 18, y: 5 }]);
  addProp(map, "crate", 15, 15);
  resizeMap(map, 10, 10);
  assert.ok(near(area(map, "grass"), 100));
  assert.equal(map.walls.length, 1);
  assert.ok(map.walls[0].nodes.every((n) => n.x <= 10.01));
  assert.equal(map.props.length, 0);
});

test("insérer un nœud sur une courbe ne la déforme pas", async () => {
  const { insertNode, wallPoints } = await import("../scripts/model.js");
  const { flattenNodes } = await import("../scripts/curves.js");
  const map = createMap({ width: 20, height: 20 });
  addRoom(map, ellipseNodes(10, 10, 4, 4), null);
  const wall = map.walls[0];
  const before = wallPoints(wall, 0.005);
  const i = insertNode(map, wall.id, 14.2, 10.8);
  assert.equal(wall.nodes.length, 5);
  assert.ok(near(Math.hypot(wall.nodes[i].x - 10, wall.nodes[i].y - 10), 4, 0.01), "le nouveau nœud est sur le cercle");
  for (const [x, y] of flattenNodes(wall.nodes, true, 0.005)) assert.ok(near(Math.hypot(x - 10, y - 10), 4, 0.02));
  assert.ok(before.length > 0);
});

test("une porte glisse le long de son mur sans en sortir", async () => {
  const { slideDoor } = await import("../scripts/model.js");
  const map = createMap({ width: 20, height: 20 });
  const w = addWall(map, [{ x: 0, y: 0 }, { x: 6, y: 0 }]);
  const d = addDoor(map, w.id, 2, 1);
  slideDoor(map, d.id, 4, 3);
  assert.ok(near(d.s, 4));
  slideDoor(map, d.id, 50, 0);
  assert.ok(near(d.s, 5.5), "bloquée à une demi-largeur du bout");
});

test("dupliquer un mur emporte ses portes", async () => {
  const { duplicateWall } = await import("../scripts/model.js");
  const map = createMap({ width: 20, height: 20 });
  const w = addWall(map, [{ x: 0, y: 0 }, { x: 6, y: 0 }]);
  addDoor(map, w.id, 2, 1);
  const c = duplicateWall(map, w.id);
  assert.equal(map.doors.length, 2);
  assert.equal(map.doors[1].wall, c.id);
  assert.deepEqual([c.nodes[0].x, c.nodes[0].y], [1, 1]);
});

test("un mur courbe coupé garde de vraies courbes, sans déformation", () => {
  const map = createMap({ width: 30, height: 20 });
  addRoom(map, rectNodes(2, 2, 13, 9), "wood");
  addRoom(map, ellipseNodes(15, 5.5, 3, 2.5), "stone");
  const arc = map.walls.find((w) => w.nodes.some((n) => n.x > 17.9));
  assert.ok(arc, "l'arc de la tour existe");
  assert.equal(nearestWall(map, 13, 5.5, 0.05), null, "le mur de la pièce ne traverse plus la tour");
  assert.ok(nearestWall(map, 13, 8.5, 0.05) && nearestWall(map, 13, 2.5, 0.05), "il reste au-dessus et au-dessous");
  assert.ok(arc.nodes.length <= 6, `${arc.nodes.length} nœuds seulement`);
  assert.ok(arc.nodes.some((n) => n.o || n.i), "avec des poignées");
  for (const [x, y] of flattenNodes(arc.nodes, false, 0.005)) {
    const e = ((x - 15) / 3) ** 2 + ((y - 5.5) / 2.5) ** 2;
    assert.ok(Math.abs(e - 1) < 0.02, "chaque point reste sur l'ellipse");
  }
});

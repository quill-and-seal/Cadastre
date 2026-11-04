import { test } from "node:test";
import assert from "node:assert/strict";
import { createMap, addRoom, addDoor, addProp, paintArea } from "../scripts/model.js";
import { rectNodes, ellipseNodes } from "../scripts/curves.js";
import { rectRings } from "../scripts/poly.js";
import { renderSVG, renderWalls, wallPieces } from "../scripts/render.js";
import { buildWallData, textureScale } from "../scripts/walls.js";

function sample() {
  const map = createMap({ width: 12, height: 10, gridSize: 80 });
  paintArea(map, rectRings(0, 0, 12, 10), "grass");
  addRoom(map, rectNodes(2, 2, 8, 7), "stone");
  const wall = map.walls[0];
  addDoor(map, wall.id, 3, 1, "door");     // mur du haut
  addDoor(map, wall.id, 8.5, 1, "secret"); // mur de droite
  addProp(map, "table", 4, 4, 30);
  return map;
}

test("le SVG a la taille de la scène et une unité par case", () => {
  const svg = renderSVG(sample());
  assert.match(svg, /^<svg [^>]*width="960" height="800" viewBox="0 0 12 10"/);
  assert.match(svg, /url\(#cad-t-stone\)/);
  assert.match(svg, /mask="url\(#cad-m-grass\)"/, "bord fondu");
  assert.match(svg, /rotate\(30\)/);
});

test("à l'export, la porte secrète ne se voit pas", () => {
  const map = sample();
  assert.doesNotMatch(renderWalls(map, "export"), /#b06cff/);
  assert.match(renderWalls(map, "editor"), /#b06cff/);
  assert.equal(wallPieces(map, "export").length, 1, "seule la vraie porte coupe le mur sur l'image");
});

test("murs Foundry : morceaux droits, une porte, une porte secrète", () => {
  const walls = buildWallData(sample());
  assert.equal(walls.filter((w) => w.door === 1).length, 1);
  assert.equal(walls.filter((w) => w.door === 2).length, 1);
  const door = walls.find((w) => w.door === 1);
  assert.deepEqual(door.c, [360, 160, 440, 160]);
  // Rectangle 6×5 de périmètre 22, moins deux portes de 1 : 20 cases de murs pleins.
  const plain = walls.filter((w) => w.door === 0).reduce((s, w) => s + Math.hypot(w.c[2] - w.c[0], w.c[3] - w.c[1]), 0);
  assert.ok(Math.abs(plain - 20 * 80) < 1);
  assert.ok(walls.every((w) => w.flags.cadastre.generated));
});

test("un mur courbe devient des segments proches de la courbe", () => {
  const map = createMap({ width: 20, height: 20, gridSize: 100 });
  addRoom(map, ellipseNodes(10, 10, 5, 5), null);
  const walls = buildWallData(map);
  assert.ok(walls.length > 12 && walls.length < 120, `${walls.length} segments`);
  for (const w of walls) {
    const mx = (w.c[0] + w.c[2]) / 200, my = (w.c[1] + w.c[3]) / 200;
    assert.ok(Math.abs(Math.hypot(mx - 10, my - 10) - 5) < 0.06);
  }
});

test("l'image est réduite au-delà de la taille maximale, pas la scène", () => {
  const t = textureScale(createMap({ width: 100, height: 50, gridSize: 200 }), 8192);
  assert.equal(t.sceneWidth, 20000);
  assert.ok(t.reduced && Math.abs(t.scale * 100 - 8192) < 1e-9);
});

test("une carte vide se rend sans erreur", () => {
  assert.match(renderSVG(createMap({ width: 4, height: 4 })), /<\/svg>$/);
});

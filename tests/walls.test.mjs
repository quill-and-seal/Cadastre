import { test } from "node:test";
import assert from "node:assert/strict";
import { createMap, drawRoom, cycleDoor } from "../scripts/model.js";
import { buildWallData, textureScale } from "../scripts/walls.js";

test("une pièce avec une porte : murs fusionnés, coupés par la porte", () => {
  const map = createMap({ cols: 6, rows: 6, gridSize: 100 });
  drawRoom(map, [1, 1], [3, 2], "stone");
  cycleDoor(map, "h", 2, 3); // porte au milieu du mur du bas
  const walls = buildWallData(map);
  const doors = walls.filter((w) => w.door === 1);
  const plain = walls.filter((w) => w.door === 0);
  assert.equal(doors.length, 1);
  assert.deepEqual(doors[0].c, [200, 300, 300, 300]);
  // Haut, gauche, droite entiers ; bas en deux morceaux de part et d'autre de la porte.
  assert.equal(plain.length, 5);
  assert.ok(plain.some((w) => w.c.join() === "100,100,400,100"));
  assert.ok(walls.every((w) => w.flags.cadastre.generated === true));
});

test("les portes secrètes deviennent des portes secrètes Foundry", () => {
  const map = createMap({ cols: 4, rows: 4, gridSize: 50 });
  cycleDoor(map, "v", 2, 1);
  cycleDoor(map, "v", 2, 1);
  assert.deepEqual(buildWallData(map), [{ c: [100, 50, 100, 100], door: 2, flags: { cadastre: { generated: true } } }]);
});

test("l'image est réduite au-delà de la taille maximale, pas la scène", () => {
  const map = createMap({ cols: 100, rows: 50, gridSize: 200 });
  const t = textureScale(map, 8192);
  assert.equal(t.sceneWidth, 20000);
  assert.equal(t.sceneHeight, 10000);
  assert.ok(t.reduced);
  assert.ok(Math.abs(t.scale * 100 - 8192) < 1e-9);
  assert.equal(textureScale(createMap({ cols: 20, rows: 20 }), 8192).reduced, false);
});

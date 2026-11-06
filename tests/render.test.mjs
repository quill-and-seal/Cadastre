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

test("un chemin se dessine avec sa bordure, sous les objets", async () => {
  const { addPath } = await import("../scripts/model.js");
  const map = createMap({ width: 12, height: 10 });
  const q = addPath(map, [{ x: 1, y: 5 }, { x: 6, y: 2, i: [-2, 0], o: [2, 0] }, { x: 11, y: 5 }], { width: 2, terrain: "cobble", edge: "wood", edgeWidth: 0.4 });
  addProp(map, "barrel", 6, 2);
  const svg = renderSVG(map);
  assert.ok(q);
  assert.match(svg, /stroke="url\(#cad-t-wood\)" stroke-width="2.8"/);
  assert.match(svg, new RegExp(`data-path="${q.id}"[^>]*stroke="url\\(#cad-t-cobble\\)" stroke-width="2"`));
  assert.ok(svg.indexOf(`data-path="${q.id}"`) < svg.indexOf('data-prop="p'), "le chemin passe sous les objets");
});

test("l'eau : sol et rivières tracées forment une seule zone, rendue avec sa berge", async () => {
  const { addPath, paintArea } = await import("../scripts/model.js");
  const { waterRings, renderWater, renderPaths } = await import("../scripts/render.js");
  const { totalArea, rectRings } = await import("../scripts/poly.js");
  const map = createMap({ width: 20, height: 10 });
  assert.equal(renderWater(map), "", "pas d'eau, rien à dessiner");
  paintArea(map, rectRings(0, 0, 4, 10), "water");
  const river = addPath(map, [{ x: 4, y: 5 }, { x: 20, y: 5 }], { width: 2, terrain: "water" });
  assert.ok(river);
  const area = totalArea(waterRings(map));
  // Étang 4 × 10, rivière 16 × 2, et le demi-disque du bout arrondi (coupé au rendu par le bord de la carte).
  assert.ok(Math.abs(area - (40 + 16 * 2 + Math.PI / 2)) < 0.1, `étang + rivière : ${area}`);
  const svg = renderWater(map);
  assert.match(svg, /clipPath id="cad-wclip"/);
  assert.match(svg, /feDisplacementMap/, "berge irrégulière");
  assert.doesNotMatch(renderPaths(map), new RegExp(`data-path="${river.id}"`), "la rivière n'est pas redessinée en chemin");
});

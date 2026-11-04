import { test } from "node:test";
import assert from "node:assert/strict";
import { createMap, drawRoom, cycleDoor, addProp } from "../scripts/model.js";
import { renderSVG, renderWalls } from "../scripts/render.js";

function sample() {
  const map = createMap({ cols: 6, rows: 5, gridSize: 80 });
  drawRoom(map, [1, 1], [3, 3], "stone");
  cycleDoor(map, "h", 2, 4);          // porte
  cycleDoor(map, "v", 4, 2);
  cycleDoor(map, "v", 4, 2);          // porte secrète
  addProp(map, "table", 1, 1);
  return map;
}

test("le SVG a la taille de la scène et une unité par case", () => {
  const svg = renderSVG(sample());
  assert.match(svg, /^<svg [^>]*width="480" height="400" viewBox="0 0 6 5"/);
  assert.match(svg, /url\(#cad-t-stone\)/);
  assert.match(svg, /data-prop="p1"/);
});

test("à l'export, la porte secrète ne se distingue pas d'un mur", () => {
  const map = sample();
  assert.doesNotMatch(renderWalls(map, "export"), /#b06cff/);
  assert.match(renderWalls(map, "editor"), /#b06cff/);
});

test("le quadrillage n'apparaît que sur demande", () => {
  const map = sample();
  assert.doesNotMatch(renderSVG(map), /stroke-opacity="0.12"/);
  assert.match(renderSVG(map, { grid: true }), /stroke-opacity="0.12"/);
});

test("une carte vide se rend sans erreur", () => {
  const svg = renderSVG(createMap({ cols: 4, rows: 4 }));
  assert.match(svg, /<\/svg>$/);
});

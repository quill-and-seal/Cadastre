import assert from "node:assert/strict";
import { test } from "node:test";
import { pyramidLevels, PYRAMID_TILE } from "../scripts/pyramid-export.js";

test("niveaux Deep Zoom : du plus fin à 1 px, tailles arrondies au-dessus", () => {
  const levels = pyramidLevels(6000, 4200);
  assert.equal(levels[0].level, 13);
  assert.deepEqual([levels[0].lw, levels[0].lh, levels[0].cols, levels[0].rows], [6000, 4200, 12, 9]);
  assert.deepEqual([levels[1].lw, levels[1].lh], [3000, 2100]);
  assert.equal(levels.at(-1).level, 0);
  assert.deepEqual([levels.at(-1).lw, levels.at(-1).lh], [1, 1]);
  assert.equal(PYRAMID_TILE, 512);
});

test("une seule tuile quand l'image tient dans 512 px", () => {
  const l = pyramidLevels(512, 300)[0];
  assert.deepEqual([l.level, l.cols, l.rows], [9, 1, 1]);
});

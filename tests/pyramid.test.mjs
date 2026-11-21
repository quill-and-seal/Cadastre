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

test("réexport partiel : seules les zones touchant une case changée sont à refaire", async () => {
  const { changedAreas } = await import("../scripts/pyramid-export.js");
  const enc = (u32) => Buffer.from(u32.buffer).toString("base64");
  const a = new Uint32Array(20 * 10).fill(7), b = a.slice();
  b[3 * 20 + 12] = 8;                       // case (12, 3)
  const base = { version: 1, key: "k", ppc: 300, width: 20, height: 10 };
  const fn = changedAreas({ ...base, print: enc(a) }, { ...base, print: enc(b) });
  assert.equal(fn.count, 1);
  assert.equal(fn(11.8, 2.9, 12.2, 3.1), true);
  assert.equal(fn(0, 0, 11.9, 10), false);  // s'arrête avant la case 12
  assert.equal(fn(0, 0, 12.1, 10), true);   // l'entame
  assert.equal(fn(0, 0, 11, 10), false);
  assert.equal(fn(13, 0, 20, 10), false);
  assert.equal(changedAreas(null, { ...base, print: enc(b) }), null);
  assert.equal(changedAreas({ ...base, ppc: 400, print: enc(a) }, { ...base, print: enc(b) }), null);
});

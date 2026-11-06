import { test } from "node:test";
import assert from "node:assert/strict";
import { createMap, addPath, updatePath, normalizeMap } from "../scripts/model.js";
import { currentLines, dashesAt, offsetPolyline, currentsFlag } from "../scripts/currents.js";

const river = () => {
  const map = createMap({ width: 30, height: 10 });
  const q = addPath(map, [{ x: 1, y: 5 }, { x: 29, y: 5 }], { width: 3, terrain: "water" });
  return { map, q };
};

test("une rivière a des filets de courant, dans le sens du tracé, loin des berges", () => {
  const { map } = river();
  const lines = currentLines(map);
  assert.ok(lines.length >= 3);
  for (const l of lines) {
    assert.ok(l.points[0][0] < l.points.at(-1)[0], "de gauche à droite, comme le tracé");
    for (const [, y] of l.points) assert.ok(Math.abs(y - 5) < 1.5 * 0.75, `dans le lit : ${y}`);
    assert.ok(l.speed > 0 && l.dash > 0 && l.gap > 0);
  }
  assert.deepEqual(currentLines(map), lines, "même rivière, mêmes filets");
});

test("sens inverse, eau calme, chemins qui ne sont pas de l'eau", () => {
  const { map, q } = river();
  updatePath(map, q.id, { flow: -1 });
  assert.ok(currentLines(map).every((l) => l.points[0][0] > l.points.at(-1)[0]));
  updatePath(map, q.id, { flow: 0 });
  assert.equal(currentLines(map).length, 0);
  addPath(map, [{ x: 1, y: 1 }, { x: 9, y: 1 }], { terrain: "cobble" });
  assert.equal(currentsFlag(map), null);
});

test("les traits glissent avec le temps, dans le sens du courant", () => {
  const { map } = river();
  const line = currentLines(map)[0];
  const first = (t) => dashesAt(line, t).find((d) => d.points[0][0] > 6).points[0][0];
  const x0 = first(0), x1 = first(0.2);
  assert.ok(x1 > x0 && x1 - x0 < 1, `${x0} → ${x1}`);
  for (const d of dashesAt(line, 3.7)) assert.ok(d.alpha >= 0 && d.alpha <= 0.5);
});

test("décalage d'une ligne droite et sauvegarde du courant", () => {
  assert.deepEqual(offsetPolyline([[0, 0], [10, 0]], 1), [[0, 1], [10, 1]]);
  const { map, q } = river();
  updatePath(map, q.id, { flow: -1, speed: 9 });
  const back = normalizeMap(JSON.parse(JSON.stringify(map)));
  assert.equal(back.paths[0].flow, -1);
  assert.equal(back.paths[0].speed, 3);
  assert.equal(normalizeMap({ ...map, paths: [{ ...q, flow: undefined, speed: undefined }] }).paths[0].flow, 1);
});

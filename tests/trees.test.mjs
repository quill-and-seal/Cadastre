import { test } from "node:test";
import assert from "node:assert/strict";
import { TREES, TREE_BY_TYPE, pickTreeKind } from "../scripts/trees.js";
import { mulberry32 } from "../scripts/catalog.js";
import { createMap, addProp, normalizeMap, propAt, duplicateProp } from "../scripts/model.js";
import { renderSVG } from "../scripts/render.js";

test("chaque type d'arbre se dessine, différemment selon la graine, à l'identique pour la même", () => {
  for (const t of TREES) {
    const a = t.make(1), b = t.make(2);
    assert.ok(a.length > 200, t.id);
    assert.notEqual(a, b, `${t.id} : deux graines, deux arbres`);
    assert.equal(a, t.make(1), `${t.id} : même graine, même arbre`);
    assert.doesNotMatch(a, /NaN|undefined/, t.id);
  }
});

test("le dessin reste dans la case de l'arbre (ombre comprise)", () => {
  for (const t of TREES) {
    for (let seed = 0; seed < 30; seed++) {
      const nums = [...t.make(seed).matchAll(/(?:cx|cy)="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
      for (const n of nums) assert.ok(n >= -0.2 && n <= t.w + 0.4, `${t.id}#${seed} : ${n}`);
    }
  }
});

test("un arbre est un objet de la carte, avec sa graine", () => {
  const map = createMap({ width: 10, height: 10 });
  const oak = addProp(map, "tree-oak", 5, 5, 0, 1, 42);
  assert.equal(oak.s, 42);
  assert.equal(propAt(map, 6.2, 5), oak, "sélection sur la couronne (3 × 3)");
  const copy = duplicateProp(map, oak.id);
  assert.notEqual(copy.s, oak.s, "une copie n'est pas jumelle");
  const back = normalizeMap(JSON.parse(JSON.stringify(map)));
  assert.equal(back.props[0].s, 42);
  assert.ok(renderSVG(map).includes(TREE_BY_TYPE.get("tree-oak").make(42)));
});

test("le mélange tire surtout des feuillus", () => {
  const rand = mulberry32(5);
  const count = {};
  for (let i = 0; i < 2000; i++) { const k = pickTreeKind("mix", rand); count[k] = (count[k] ?? 0) + 1; }
  assert.ok(count.oak > count.palm && count.oak > count.pine);
  assert.equal(pickTreeKind("palm", rand), "palm");
});

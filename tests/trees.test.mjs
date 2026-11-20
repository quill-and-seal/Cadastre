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

/* -------------------------------------------- */
/*  Arbres générés                              */
/* -------------------------------------------- */
import { buildTree, SPECIES } from "../scripts/tree-gen.js";
import { treeRadius } from "../scripts/trees.js";
import { renderProps } from "../scripts/render.js";

test("arbre généré : même graine, même arbre ; la couronne a le rayon demandé", () => {
  for (const kind of Object.keys(SPECIES).filter((k) => ["broad", "conifer"].includes(SPECIES[k].form))) {
    const a = buildTree(kind, 5, 1.5, { detail: 0.3 }), b = buildTree(kind, 5, 1.5, { detail: 0.3 });
    assert.equal(a.leaves.length, b.leaves.length, kind);
    assert.deepEqual(a.leaves[10].p, b.leaves[10].p, kind);
    assert.ok(a.leaves.length > 500, `${kind} : ${a.leaves.length} feuilles`);
    let m = 0;
    for (const g of a.tree.segs) if (!g.twig) m = Math.max(m, Math.hypot(g.b[0], g.b[1]));
    assert.ok(m <= 1.5 + 1e-6 && m > 1.2, `${kind} : rayon ${m}`);
    for (const g of a.tree.segs) assert.ok([g.a, g.b, [g.w, g.w2]].flat().every(Number.isFinite), kind);
  }
});

test("arbre généré : la rotation tourne l'arbre sans le changer", () => {
  const a = buildTree("oak", 9, 2, { detail: 0.3 }), b = buildTree("oak", 9, 2, { detail: 0.3, rotation: 90 });
  const [x, y] = a.leaves[50].p, [bx, by] = b.leaves[50].p;
  assert.ok(Math.abs(bx + y) < 1e-9 && Math.abs(by - x) < 1e-9);
});

test("arbre généré : chaque feuille tient à un rameau (aucune en l'air)", () => {
  const { tree, leaves } = buildTree("birch", 3, 1.5, { detail: 0.3 });
  const twigs = tree.segs.filter((g) => g.twig);
  const near = (p) => twigs.some((g) => {
    const dx = g.b[0] - g.a[0], dy = g.b[1] - g.a[1], dz = g.b[2] - g.a[2], L2 = dx * dx + dy * dy + dz * dz;
    const t = Math.max(0, Math.min(1, ((p[0] - g.a[0]) * dx + (p[1] - g.a[1]) * dy + (p[2] - g.a[2]) * dz) / L2));
    return Math.hypot(g.a[0] + dx * t - p[0], g.a[1] + dy * t - p[1], g.a[2] + dz * t - p[2]) < 0.01;
  });
  for (let i = 0; i < leaves.length; i += 97) assert.ok(near(leaves[i].p), `feuille ${i}`);
});

test("rendu : un arbre généré peut être remplacé par son image, laissé de côté, ou dessiné simplement", () => {
  const map = createMap({ width: 10, height: 10 });
  addProp(map, "tree-oak", 5, 5, 0, 1, 42);
  addProp(map, "tree-palm", 2, 2, 0, 1, 7);
  assert.match(renderProps(map, "cad", undefined, { treeArt: () => "<image/>" }), /<image\/>/);
  const skipped = renderProps(map, "cad", undefined, { treeArt: () => "" });
  assert.doesNotMatch(skipped, /data-prop="[^"]*" transform="translate\(5 5\)/);
  assert.match(skipped, /translate\(2 2\)/, "le palmier reste dessiné");
  assert.match(renderProps(map, "cad", undefined, { treeArt: () => null }), /opacity="0.55"/);
  assert.ok(Math.abs(treeRadius(TREE_BY_TYPE.get("tree-oak"), 1) - 1.84) < 1e-9);
});

test("arbre généré : les feuilles cachées sous deux épaisseurs d'autres sont retirées, pas les autres", () => {
  const full = buildTree("oak", 4, 1.8, { cull: false }), cut = buildTree("oak", 4, 1.8);
  assert.equal(cut.all, full.leaves.length);
  assert.ok(cut.leaves.length < full.leaves.length * 0.8, `${cut.leaves.length} / ${full.leaves.length}`);
  // Les feuilles du dessus de la couronne restent toutes.
  const zTop = Math.max(...full.leaves.map((l) => l.p[2]));
  const top = (b) => b.leaves.filter((l) => l.p[2] > zTop - 0.05).length;
  assert.equal(top(cut), top(full));
});

test("fougère, souche et champignons : générés, déterministes, à leur taille", () => {
  for (const [kind, R] of [["fern", 0.6], ["stump", 0.5], ["mushrooms", 0.15]]) {
    const a = buildTree(kind, 3, R), b = buildTree(kind, 3, R);
    assert.deepEqual(a.leaves.map((l) => l.p), b.leaves.map((l) => l.p), kind);
    for (const l of a.leaves) assert.ok(Math.hypot(l.p[0], l.p[1]) <= R + 1e-6, kind);
  }
  assert.ok(buildTree("fern", 3, 0.6).leaves.length > 100);
  assert.ok(buildTree("stump", 3, 0.5).tree.stumpR > 0.1);
  assert.ok(buildTree("mushrooms", 3, 0.15).leaves.every((l) => l.cap));
});

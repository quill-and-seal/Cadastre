import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nameFromPath, sizeFromPath, guessKind, tagsFromPath, normalizeAsset, normalizeLibrary,
  assetFromFile, assetIdFor, mergeAssets, filterAssets, allTags, embedAsset, usedAssetSources,
  pruneAssets, refreshMapAssets, isImagePath
} from "../scripts/library.js";
import { createMap, normalizeMap, paintArea, addProp, propAt, isTerrain, removeProp } from "../scripts/model.js";
import { rectRings } from "../scripts/poly.js";
import { renderSVG } from "../scripts/render.js";

const FA = "assets/FA/Props/Furniture/Tables/Table_Wood_Long_A1_3x1.webp";

test("nom, taille et type devinés depuis le chemin", () => {
  assert.equal(nameFromPath(FA), "Table Wood Long A1");
  assert.deepEqual(sizeFromPath(FA), { w: 3, h: 1 });
  assert.equal(sizeFromPath("barrel.png"), null);
  assert.equal(guessKind(FA), "prop");
  assert.equal(guessKind("packs/Textures/Grass_01.jpg"), "texture");
  assert.equal(guessKind("mes sols/dalles.png"), "texture");
  assert.equal(nameFromPath("a/Mur%20de%20pierre.png"), "Mur de pierre");
  assert.ok(isImagePath("x.WEBP") && !isImagePath("x.mp3"));
});

test("étiquettes tirées des sous-dossiers du dossier importé", () => {
  assert.deepEqual(tagsFromPath(FA, "assets/FA/"), ["props", "furniture", "tables"]);
  assert.deepEqual(tagsFromPath("root/a.png", "root/"), []);
});

test("asset depuis un fichier : la taille du nom l'emporte, sinon pixels ÷ pixels par case", () => {
  const table = assetFromFile(FA, { width: 600, height: 200, root: "assets/FA/" });
  assert.equal(table.kind, "prop");
  assert.deepEqual([table.w, table.h], [3, 1]);
  const rug = assetFromFile("x/Rug_Red.png", { width: 300, height: 500, ppc: 100 });
  assert.deepEqual([rug.w, rug.h], [3, 5]);
  const grass = assetFromFile("x/Textures/grass.jpg", { width: 512, height: 512, ppc: 256 });
  assert.equal(grass.kind, "texture");
  assert.deepEqual([grass.w, grass.h], [2, 2]);
  assert.equal(assetFromFile(FA).id, assetIdFor(FA, "prop"), "id stable : réimporter met à jour");
});

test("normalisation : entrées invalides et doublons écartés, tailles bornées", () => {
  const lib = normalizeLibrary([
    { id: "a1", src: "a.png", w: 999, h: -2, tags: "Bois, bois , Meuble" },
    { id: "a1", src: "b.png" },
    { id: "a2", src: "a.png", kind: "prop" },
    { id: "bad id!", src: "c.png" },
    { id: "a3" },
    null
  ]);
  assert.equal(lib.length, 1);
  assert.deepEqual([lib[0].w, lib[0].h], [40, 0.1]);
  assert.deepEqual(lib[0].tags, ["bois", "meuble"]);
  assert.equal(normalizeAsset({ id: "t", src: "s.png", kind: "texture", soft: true }).soft, true);
  assert.equal(normalizeAsset({ id: "p", src: "s.png", kind: "prop", soft: true }).soft, undefined);
});

test("fusion, recherche et étiquettes", () => {
  let lib = mergeAssets([], [assetFromFile(FA, { root: "assets/FA/" }), assetFromFile("x/Textures/grass.jpg")]);
  lib = mergeAssets(lib, [{ ...lib[0], name: "Grande table" }]);
  assert.equal(lib.length, 2);
  assert.equal(lib[0].name, "Grande table");
  assert.equal(filterAssets(lib, { query: "table" }).length, 1);
  assert.equal(filterAssets(lib, { query: "furniture" }).length, 1, "les étiquettes comptent");
  assert.equal(filterAssets(lib, { kind: "texture" }).length, 1);
  assert.equal(filterAssets(lib, { tag: "tables" }).length, 1);
  assert.ok(allTags(lib).includes("furniture"));
});

test("une carte utilise des assets de bibliothèque comme sol et comme objet", () => {
  const map = createMap({ width: 10, height: 10 });
  const tex = assetFromFile("x/Textures/grass.jpg", { width: 400, height: 400 });
  const table = assetFromFile(FA);
  const tKey = embedAsset(map, tex), pKey = embedAsset(map, table);
  assert.ok(isTerrain(map, tKey));
  assert.ok(paintArea(map, rectRings(0, 0, 10, 10), tKey));
  const prop = addProp(map, pKey, 5, 5);
  assert.ok(prop);
  assert.equal(propAt(map, 6.4, 5), prop, "l'emprise 3×1 de l'asset sert à la sélection");
  assert.deepEqual(usedAssetSources(map).sort(), [FA, "x/Textures/grass.jpg"].sort());

  const svg = renderSVG(map, { resolve: (src) => `RES(${src})` });
  assert.match(svg, /<pattern id="cad-t-asset_[^"]+"[^>]*width="2"[^>]*><image href="RES\(x\/Textures\/grass.jpg\)"/);
  assert.match(svg, /<image href="RES\(assets\/FA\/[^"]+\)" width="3" height="1"/);
});

test("le chemin d'une image est encodé une seule fois", () => {
  const map = createMap({ width: 4, height: 4 });
  addProp(map, embedAsset(map, { id: "s", src: "a b/c%20d.png", kind: "prop" }), 1, 1);
  assert.match(renderSVG(map), /href="a%20b\/c%20d.png"/);
});

test("une carte enregistrée garde ses assets, même absents de la bibliothèque", () => {
  const map = createMap({ width: 10, height: 10 });
  const key = embedAsset(map, assetFromFile(FA));
  addProp(map, key, 2, 2);
  embedAsset(map, assetFromFile("x/unused.png"));
  const back = normalizeMap(JSON.parse(JSON.stringify(map)));
  assert.equal(back.props.length, 1);
  assert.deepEqual(Object.keys(back.assets), [key.slice(6)], "l'asset inutilisé est retiré");
  assert.equal(back.assets[key.slice(6)].tags, undefined);

  // Un objet dont l'asset a disparu de la carte est écarté au chargement.
  const broken = normalizeMap({ ...back, assets: {} });
  assert.equal(broken.props.length, 0);
});

test("les copies d'une carte suivent les changements de la bibliothèque", () => {
  const map = createMap({ width: 10, height: 10 });
  const asset = assetFromFile(FA);
  addProp(map, embedAsset(map, asset), 2, 2);
  assert.ok(refreshMapAssets(map, [{ ...asset, w: 4 }]));
  assert.equal(map.assets[asset.id].w, 4);
  assert.equal(refreshMapAssets(map, []), false, "un asset supprimé de la bibliothèque reste dans la carte");
  removeProp(map, map.props[0].id);
  assert.ok(pruneAssets(map));
  assert.deepEqual(map.assets, {});
});

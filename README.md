# Cadastre

**Foundry VTT v14** : un éditeur de cartes dans Foundry, de la pièce au monde.

Le cadastre, c'est le plan qui découpe le terrain, de la parcelle au territoire. Cadastre fait la même chose dans Foundry : tu peins les sols, tu traces pièces, murs et portes, tu poses le mobilier, et la carte devient une scène prête à jouer, avec ses murs déjà posés.

Un module de l'atelier [Quill & Seal](https://github.com/quill-and-seal).

> **État : 0.1.** Battlemaps à la main : sols, pièces, murs, portes, objets, export en scène avec murs natifs. La suite est dans [ROADMAP.md](ROADMAP.md).

## Installation

Dans Foundry, **Modules complémentaires → Installer un module**, puis colle ce lien de manifeste :

```
https://github.com/quill-and-seal/Cadastre/releases/latest/download/module.json
```

Active ensuite le module dans ton monde. Il fonctionne seul. [Palisade](https://github.com/quill-and-seal/Palisade) et [Vellum](https://github.com/quill-and-seal/Vellum) sont recommandés : Cadastre s'appuiera sur eux à partir de la 0.2.

## Ouvrir l'éditeur

Dans l'onglet **Scènes**, le bouton **Cadastre** (MJ seulement) ouvre la liste des cartes : nouvelle carte, ouvrir, dupliquer, supprimer. Chaque carte s'ouvre dans sa propre fenêtre, redimensionnable, à côté de la scène en cours.

Les cartes sont rangées comme des entrées de journal dans un dossier **Cadastre**, invisibles des joueurs. Elles voyagent donc avec le monde et peuvent aller dans un compendium.

## Outils

| Outil | Touche | Ce qu'il fait |
|---|---|---|
| Sol | 1 | Peint le sol en glissant. `[` et `]` changent la taille du pinceau (1, 2, 3, 5). |
| Remplir | 2 | Remplit la zone de même sol sous le clic, sans traverser les murs. |
| Pièce | 3 | Glisse d'un coin à l'autre : sol, murs tout autour. Deux pièces qui se chevauchent n'en font qu'une, et les portes déjà posées restent. |
| Mur | 4 | Glisse d'un coin de case à un autre : mur droit. Avec **Alt** : efface. Clic simple : pose ou retire le mur le plus proche. |
| Porte | 5 | Clic sur un bord de case : porte. Un second clic : porte secrète. |
| Objet | 6 | Tonneau, caisse, coffre, table, chaise, lit, pilier, escalier. **R** tourne d'un quart de tour. |
| Gomme | 7 | Efface tout, ou seulement les sols, les murs ou les objets. En taille 1 près d'un bord, n'efface que ce mur. |

Navigation : clic droit, molette enfoncée ou **Espace** + clic pour déplacer la vue, molette pour zoomer. **Ctrl+Z** / **Ctrl+Maj+Z** pour annuler et rétablir, **Ctrl+S** pour enregistrer.

Le panneau de droite règle la carte : nom, nombre de colonnes et de lignes, pixels par case dans la scène, couleur de fond.

Sols disponibles : dalles, plancher, pavés, terre, herbe, eau. Tout est dessiné en vectoriel par le module : aucune image à fournir.

## Exporter en scène

**Exporter en scène** rend la carte en image (WebP), l'enregistre dans `worlds/<ton monde>/cadastre/` et crée une scène :

- à la taille de la carte (colonnes × pixels par case), sans marge, grille carrée à la bonne taille ;
- avec les murs de Foundry déjà posés : murs fusionnés en longs segments, une porte par case de porte, portes secrètes en portes secrètes ;
- les portes secrètes sont dessinées comme des murs sur l'image : les joueurs ne les voient pas.

Une carte déjà exportée propose de **mettre à jour** sa scène : le fond et les murs posés par Cadastre sont remplacés, et tout ce que tu as ajouté à la main (jetons, lumières, murs, notes) reste en place. Tu peux aussi créer une nouvelle scène.

Au-delà de 8192 px de côté, l'image est réduite et Foundry l'étire à la taille de la scène : les murs, eux, restent exacts.

## API

```js
const cadastre = game.modules.get("cadastre").api;
cadastre.openManager();            // liste des cartes
cadastre.openMap(entryOrId);       // ouvre une carte
cadastre.renderSVG(map, { scale }); // rendu SVG d'une carte
await cadastre.exportMap(map, { scene }); // export (scene : scène à mettre à jour)
cadastre.model;                    // fonctions du modèle de carte
```

## Développement

- `node --test tests/*.test.mjs` : tests du modèle, de la géométrie, du rendu et des murs.
- `tools/editor-lab.html` : l'éditeur hors de Foundry. Depuis la racine du dépôt, `python3 -m http.server`, puis ouvrir `http://localhost:8000/tools/editor-lab.html`. Le bouton d'export y ouvre le SVG rendu.

## Licence

MIT.

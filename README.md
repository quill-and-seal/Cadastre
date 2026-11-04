# Cadastre

**Foundry VTT v14** : un éditeur de cartes dans Foundry, de la pièce au monde.

Le cadastre, c'est le plan qui découpe le terrain, de la parcelle au territoire. Cadastre fait la même chose dans Foundry : tu peins les sols à main levée, tu traces pièces et murs en courbes libres, tu poses portes et mobilier, et la carte devient une scène prête à jouer, avec ses murs déjà posés.

Un module de l'atelier [Quill & Seal](https://github.com/quill-and-seal).

> **État : 0.1.** Éditeur vectoriel libre : zones de sol, pièces, murs courbes, portes, objets, export en scène avec murs natifs. La suite est dans [ROADMAP.md](ROADMAP.md).

## Installation

Dans Foundry, **Modules complémentaires → Installer un module**, puis colle ce lien de manifeste :

```
https://github.com/quill-and-seal/Cadastre/releases/latest/download/module.json
```

Active ensuite le module dans ton monde. Il fonctionne seul. [Palisade](https://github.com/quill-and-seal/Palisade) et [Vellum](https://github.com/quill-and-seal/Vellum) sont recommandés : Cadastre s'appuiera sur eux à partir de la 0.2.

## Ouvrir l'éditeur

Dans l'onglet **Scènes**, le bouton **Cadastre** (MJ seulement) ouvre la liste des cartes : nouvelle carte, ouvrir, dupliquer, supprimer. Chaque carte s'ouvre dans sa propre fenêtre, redimensionnable, à côté de la scène en cours.

Les cartes sont rangées comme des entrées de journal dans un dossier **Cadastre**, invisibles des joueurs. Elles voyagent donc avec le monde et peuvent aller dans un compendium.

## Dessiner librement

Rien n'est calé sur la grille. Elle reste affichée comme repère, et l'aimant (bouton aimant, **Ctrl** pour l'inverser le temps d'un geste) cale les points à la demi-case quand tu le veux. Les extrémités de murs s'accrochent aussi aux nœuds des murs voisins, pour les relier.

| Outil | Touche | Ce qu'il fait |
|---|---|---|
| Sélection | 1 | Clic pour choisir un mur, une porte ou un objet, glisser pour le déplacer. Un mur sélectionné montre ses nœuds et poignées : glisse-les pour le déformer (**Alt** : poignées indépendantes). Double-clic sur un nœud : coin ↔ courbe. Double-clic sur le mur : nouveau nœud, sans changer la forme. **Suppr** efface, **Ctrl+D** duplique. |
| Pinceau de sol | 2 | Peint une zone à main levée. Le nouveau sol remplace les autres là où il passe. **Alt** : efface le sol. `[` et `]` changent la taille. |
| Forme | 3 | Rectangle, ellipse (**Maj** : carré, cercle) ou plume. Crée une **pièce** (sol + mur tout autour) ou **le sol seul**. Deux pièces qui se chevauchent n'en font qu'une : les murs à l'intérieur disparaissent, les courbes restent des courbes. |
| Mur | 4 | **Plume** : clic pour un coin, clic-glisser pour une courbe, **Entrée** ou double-clic pour finir, clic sur le premier point pour fermer. **Main levée** : le tracé est lissé en courbe retouchable. |
| Porte | 5 | Clic sur un mur, droit ou courbe : porte, ou porte secrète, de la largeur choisie. Avec la sélection, une porte glisse le long de son mur. |
| Objet | 6 | Tonneau, caisse, coffre, table, chaise, lit, pilier, escalier. Angle et échelle libres : **R** et **Maj+R** tournent de 15°. |
| Gomme | 7 | Efface en glissant : tout, ou seulement les sols, les murs ou les objets. Un mur gommé est coupé proprement. |

Navigation : clic droit, molette enfoncée ou **Espace** + clic pour déplacer la vue, molette pour zoomer. **Échap** annule le tracé en cours. **Ctrl+Z** / **Ctrl+Maj+Z** pour annuler et rétablir, **Ctrl+S** pour enregistrer.

Le panneau de droite règle l'outil en cours et la carte : nom, largeur et hauteur en cases, pixels par case dans la scène, couleur de fond.

Sols disponibles : dalles, plancher, pavés, terre, herbe, eau. Les sols naturels (herbe, terre, eau) se fondent dans leurs voisins, les sols construits gardent un bord net. Tout est dessiné en vectoriel par le module : aucune image à fournir.

## Exporter en scène

**Exporter en scène** rend la carte en image (WebP), l'enregistre dans `worlds/<ton monde>/cadastre/` et crée une scène :

- à la taille de la carte (largeur × pixels par case), sans marge, grille carrée à la bonne taille ;
- avec les murs de Foundry déjà posés : les courbes sont suivies par des segments droits (écart de 5 % de case au plus), chaque porte devient une porte, chaque porte secrète une porte secrète ;
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

- `node --test tests/*.test.mjs` : tests des courbes, des zones, du modèle, du rendu et de l'export des murs.
- `tools/editor-lab.html` : l'éditeur hors de Foundry. Depuis la racine du dépôt, `python3 -m http.server`, puis ouvrir `http://localhost:8000/tools/editor-lab.html`. Le bouton d'export y ouvre le SVG rendu.

## Licence

MIT. Cadastre embarque une partie de [Clipper2](https://github.com/AngusJohnson/Clipper2) (portage [clipper2-js](https://github.com/IRobot1/clipper2-ts)) pour les opérations sur les zones, sous licence Boost : voir `scripts/vendor/clipper2.LICENSE.txt`.

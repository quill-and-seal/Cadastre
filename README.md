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

Rien n'est calé sur la grille. Elle reste affichée comme repère, et l'aimant (bouton aimant, **Ctrl** pour l'inverser le temps d'un geste) cale les points à la demi-case quand tu le veux. Les extrémités de murs s'accrochent aussi aux nœuds et aux murs voisins : une cloison tracée jusqu'à un mur ferme bien sa pièce.

La façon la plus rapide de bâtir : pose l'emprise du bâtiment avec des **formes** en mode pièce (les rectangles qui se touchent fusionnent), trace les **cloisons** au mur, puis **remplis** chaque pièce d'un clic avec son sol. Finis avec les portes, le mobilier et le terrain autour.

| Outil | Touche | Ce qu'il fait |
|---|---|---|
| Sélection | 1 | Clic pour choisir un mur, un chemin, une porte ou un objet, glisser pour le déplacer. Un objet sélectionné a des poignées : les coins pour l'échelle, le rond au-dessus pour le faire tourner (par 15°, **Alt** pour une rotation libre). Un mur sélectionné montre ses nœuds et poignées : glisse-les pour le déformer (**Alt** : poignées indépendantes). Double-clic sur un nœud : coin ↔ courbe. Double-clic sur le mur : nouveau nœud, sans changer la forme. **Suppr** efface, **Ctrl+D** duplique. |
| Pinceau de sol | 2 | Peint une zone à main levée. Le nouveau sol remplace les autres là où il passe. **Alt** : efface le sol. `[` et `]` changent la taille. |
| Remplir une pièce | 3 | Clic dans une pièce : le sol est posé jusqu'aux murs, portes fermées comprises. Clic dehors : tout ce qui n'est pas enclos (pratique pour l'herbe autour d'un bâtiment). Le survol montre la zone avant de cliquer. |
| Forme | 4 | Rectangle, ellipse (**Maj** : carré, cercle) ou plume. Crée une **pièce** (sol + mur tout autour) ou **le sol seul**. Deux pièces qui se chevauchent n'en font qu'une : les murs à l'intérieur disparaissent, les courbes restent des courbes. |
| Chemin | 9 | Route, quai, rivière : une courbe tracée à la plume ou à main levée devient une bande de sol, avec une bordure optionnelle de chaque côté (un quai pavé bordé de planches, un chemin de terre sans bord). Largeur, sol et bordure se règlent dans le panneau, puis sur le chemin sélectionné. Avec la sélection, ses points et poignées se déplacent comme ceux d'un mur. |
| Mur | 5 | **Plume** : clic pour un coin, clic-glisser pour une courbe, **Entrée** ou double-clic pour finir, clic sur le premier point pour fermer. **Main levée** : le tracé est lissé en courbe retouchable. |
| Porte | 6 | Clic sur un mur, droit ou courbe : porte, ou porte secrète, de la largeur choisie. Avec la sélection, une porte glisse le long de son mur. |
| Objet | 7 | Tonneau, caisse, coffre, table, chaise, lit, pilier, escalier. Angle et échelle libres : **R** et **Maj+R** tournent de 15°. |
| Arbres | 0 | Arbres dessinés à la volée : feuillu, palmier, conifère, buisson, ou un mélange. Clic : un arbre ; glisser : sème des arbres dans la zone du pinceau, espacés selon la densité. Chaque arbre est unique (graine) et devient un objet : sélection, déplacement, rotation, taille. |
| Gomme | 8 | Efface en glissant : tout, ou seulement les sols, les murs ou les objets. Un mur gommé est coupé proprement. |

Navigation : clic droit, molette enfoncée ou **Espace** + clic pour déplacer la vue, molette pour zoomer. **Échap** annule le tracé en cours. **Ctrl+Z** / **Ctrl+Maj+Z** pour annuler et rétablir, **Ctrl+S** pour enregistrer.

Le panneau de droite règle l'outil en cours et la carte : nom, largeur et hauteur en cases, pixels par case dans la scène, couleur de fond.

Sols disponibles : dalles, plancher, pavés, terre, herbe, eau. L'herbe et la terre sont peintes (texture de bruit, sans répétition visible) et se fondent dans leurs voisins ; les sols construits gardent un bord net. L'eau a son propre rendu : eau profonde au centre, claire le long des rives, fond de galets, berge de terre irrégulière cerclée d'encre. Une rivière se peint au pinceau ou se trace avec l'outil Chemin et le sol « eau » : les deux se rejoignent en une seule eau. Tout est dessiné en vectoriel par le module : aucune image à fournir.

## Courant des rivières

Une rivière tracée avec l'outil **Chemin** et le sol **eau** a un courant : des filets blancs qui glissent le long de l'eau, plus vite au milieu que près des berges. Le courant suit le sens du tracé ; sur le chemin sélectionné (ou avant de tracer), tu peux l'inverser, régler sa vitesse ou le couper pour une eau calme. L'eau peinte au pinceau (étangs, lacs) reste calme.

Dans l'éditeur, le courant bouge déjà (bouton vague de la barre du haut pour le mettre en pause). Dans Foundry, la scène exportée l'anime par-dessus son fond, sous les jetons ; chaque joueur peut le couper dans les réglages du module (**Animer le courant des rivières**) si son ordinateur peine.

## Bibliothèque d'assets

Les sols et objets intégrés ne suffisent pas : la bibliothèque ajoute tes propres images, ou celles d'un pack d'assets (Forgotten Adventures, 2-Minute Tabletop…), comme **objets** ou comme **textures de sol** qui se répètent.

Elle s'ouvre depuis la liste des cartes (**Bibliothèque**), depuis la palette de l'éditeur (bouton livre à côté de « Bibliothèque ») ou dans les réglages du module. Trois façons d'ajouter des images :

- **Fichier** : une image déjà présente dans les données de Foundry ;
- **Dossier** : toutes les images d'un dossier et de ses sous-dossiers, d'un coup (5000 au plus) ; les sous-dossiers deviennent des étiquettes ;
- **Téléverser** : des images de ton ordinateur, envoyées dans `worlds/<ton monde>/cadastre/assets/`.

À l'import, Cadastre devine le type (un dossier ou un nom qui parle de « textures », « sols », « floors », « terrain »… donne une texture, le reste un objet) et calcule la taille en cases à partir des pixels par case des images (200 par défaut, la norme de la plupart des packs). Une taille écrite dans le nom du fichier, comme `Table_Long_3x1.webp`, l'emporte pour les objets. Tout se corrige ensuite asset par asset : nom, type, taille, étiquettes, bord fondu pour un sol naturel. Réimporter un fichier met à jour son asset au lieu de le dupliquer.

Dans l'éditeur, les assets apparaissent sous les sols et objets intégrés, avec une recherche par nom et étiquette. Une carte garde une copie des assets qu'elle utilise : elle reste affichable si l'asset est retiré de la bibliothèque, et suit ses changements de taille ou de nom tant qu'il y est. Les images elles-mêmes restent à leur place : déplacer ou supprimer un fichier le fait disparaître de la carte.

La liste se partage entre mondes avec **Exporter la liste** et **Importer une liste** (fichier JSON). Les images doivent être au même endroit dans les données de Foundry.

## Exporter en scène

**Exporter en scène** rend la carte en image (WebP), l'enregistre dans `worlds/<ton monde>/cadastre/` et crée une scène :

- à la taille de la carte (largeur × pixels par case), sans marge, grille carrée à la bonne taille ;
- images d'assets comprises, intégrées au rendu (une image introuvable est signalée et laissée vide) ;
- avec les murs de Foundry déjà posés : les courbes sont suivies par des segments droits (écart de 5 % de case au plus), chaque porte devient une porte, chaque porte secrète une porte secrète ;
- les portes secrètes sont dessinées comme des murs sur l'image : les joueurs ne les voient pas.

Une carte déjà exportée propose de **mettre à jour** sa scène : le fond et les murs posés par Cadastre sont remplacés, et tout ce que tu as ajouté à la main (jetons, lumières, murs, notes) reste en place. Tu peux aussi créer une nouvelle scène.

Au-delà de 8192 px de côté, l'image est réduite et Foundry l'étire à la taille de la scène : les murs, eux, restent exacts.

## API

```js
const cadastre = game.modules.get("cadastre").api;
cadastre.openManager();            // liste des cartes
cadastre.openMap(entryOrId);       // ouvre une carte
cadastre.openLibrary();            // bibliothèque d'assets
cadastre.library.get();            // liste des assets
await cadastre.library.add(["assets/pack/Barrel_1x1.webp"], { ppc: 200 });
await cadastre.library.importFolder("assets/pack", { kind: "prop" });
cadastre.renderSVG(map, { scale }); // rendu SVG d'une carte
await cadastre.exportMap(map, { scene }); // export (scene : scène à mettre à jour)
cadastre.model;                    // fonctions du modèle de carte
```

## Développement

- `node --test tests/*.test.mjs` : tests des courbes, des zones, du modèle, du rendu et de l'export des murs.
- `tools/editor-lab.html` : l'éditeur hors de Foundry. Depuis la racine du dépôt, `python3 -m http.server`, puis ouvrir `http://localhost:8000/tools/editor-lab.html`. Le bouton d'export y ouvre le SVG rendu. Pour la bibliothèque, glisse des images sur la page (ou bouton livre de la palette) : un nom qui contient « texture », « sol »… en fait une texture.

## Licence

MIT. Cadastre embarque une partie de [Clipper2](https://github.com/AngusJohnson/Clipper2) (portage [clipper2-js](https://github.com/IRobot1/clipper2-ts)) pour les opérations sur les zones, sous licence Boost : voir `scripts/vendor/clipper2.LICENSE.txt`.

# Feuille de route

Un seul modèle de carte vectoriel pour toutes les échelles : monde, région, ville, bâtiment, étage. Chaque niveau peut ouvrir une carte plus détaillée. Les maps sont produites par un générateur puis retouchées à la main dans l'éditeur, en courbes et zones libres.

## 0.1 — Éditeur vectoriel libre ✅

- Fenêtre d'édition dans Foundry, une par carte, liste des cartes depuis l'onglet Scènes.
- Zones de sol au pinceau et en formes, pièces qui fusionnent, murs courbes à la plume ou à main levée.
- Portes et portes secrètes sur n'importe quel mur ; objets à angle et échelle libres ; gomme.
- Retouche des nœuds et poignées, annulation, aimant optionnel.
- Export en scène : image de fond, grille, murs natifs ; mise à jour d'une scène déjà exportée.

## 0.2 — Bibliothèque, Palisade, Vellum, étages, zones retouchables

- Bibliothèque d'assets (en cours, branche `bibliotheque-assets`) : objets et textures venus de l'extérieur.

- Vellum actif : fond de scène exporté en SVG, net à tous les zooms.
- Palisade actif : murs exportés reliés comme s'ils avaient été tracés avec Palisade.
- Étages : plusieurs niveaux par carte, exportés vers les niveaux de scène de la v14.
- Zones de sol sélectionnables et déformables comme les murs ; un sol qui suit le mur de sa pièce.
- Calques : masquer, verrouiller, réordonner.

## 0.3 — Générateur de donjons et grottes

- Donjon : salles et couloirs (découpage BSP), portes placées automatiquement.
- Grottes : automate cellulaire, contours lissés.
- Graine et paramètres, puis retouche dans l'éditeur.

## 0.4 — Villes et villages

- Quartiers en Voronoï, réseau de rues, emprises de bâtiments.
- Un bâtiment s'ouvre en carte d'intérieur (étages compris).

## 0.5 — Régions et monde

- Relief, biomes et rivières générés.
- Descente d'une échelle à l'autre : monde → région → ville → bâtiment → étage.

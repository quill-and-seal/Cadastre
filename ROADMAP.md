# Feuille de route

Un seul modèle de carte vectoriel pour toutes les échelles : monde, région, ville, bâtiment, étage. Chaque niveau peut ouvrir une carte plus détaillée. Les maps sont produites par un générateur puis retouchées à la main dans l'éditeur, en courbes et zones libres.

## 0.1 — Éditeur vectoriel libre ✅

- Fenêtre d'édition dans Foundry, une par carte, liste des cartes depuis l'onglet Scènes.
- Zones de sol au pinceau et en formes, pièces qui fusionnent, murs courbes à la plume ou à main levée.
- Portes et portes secrètes sur n'importe quel mur ; objets à angle et échelle libres ; gomme.
- Retouche des nœuds et poignées, annulation, aimant optionnel.
- Export en scène : image de fond, grille, murs natifs ; mise à jour d'une scène déjà exportée.
- Bibliothèque d'assets : objets et textures venus de l'extérieur.
- 0.1.1 : remplissage d'une pièce d'un clic, cloisons accrochées aux murs.
- 0.1.2 : chemins (routes, quais, rivières) avec bordure, poignées de rotation et d'échelle sur les objets.
- 0.1.3 : style peint (herbe, terre, eau avec berges), arbres procéduraux.
- 0.1.4 : courant animé des rivières, dans l'éditeur et dans la scène.
- 0.1.5 : vent dans l'herbe, trois niveaux (ondulation, touffes, réaction aux jetons).
- 0.1.6 : herbe faite de brins, brins animés par le vent.
- 0.1.7 : herbe en grille de traits dessinée par la carte graphique, vagues de vent, jetons qui écartent l'herbe.
- 0.1.8 : eau vivante (texture, courant réaliste, obstacles et tourbillons, écume et feuilles).
- 0.1.9 : herbe optimisée (même rendu), calcul en arrière-plan dans l'éditeur, compteur de performances.
- 0.1.10 : eau optimisée (même rendu), calcul en arrière-plan dans l'éditeur.
- 0.1.11 : plages et falaises (sols sable et roche), vagues, gerbes et ressac.
- 0.1.12 : plages plus naturelles (écume, eau peu profonde, bords).
- 0.1.13 : correctif, animations de l'eau et de l'herbe dans les scènes sous Foundry v13 et v14.
- 0.1.14 : réglage « Herbe : rendu » pour retrouver l'herbe d'avant les optimisations.
- 0.1.15 : outil Eau (étendue, profondeur et type par zones, courants tracés et eau calme), jonctions des cours d'eau.
- 0.1.16 : le courant contourne les îles et glisse le long des berges.
- 0.1.17 : arbres générés branche par branche et feuille par feuille, animés par le même vent que l'herbe.
- 0.1.18 : arbres nets à tous les zooms (redessinés plus fins à la volée), feuilles cachées retirées.
- 0.1.19 : outil Biome (toute la carte ou une zone), forêts de feuillus et de conifères (plantes et sols peints élément par élément).

## Biomes (V1 : 20 biomes, un par issue)

- ✅ Forêt de feuillus, forêt de conifères (0.1.19).
- À venir : plaine, bocage, verger, terre de lavande, champs de blé, vignoble, marais, berges de rivière, mangrove, plaine rocheuse, garrigue, montagne, lande, savane, désert, oasis, jungle, toundra / taïga enneigée.

## 0.2 — Palisade, Vellum, étages, zones retouchables


- Vellum actif : fond de scène exporté en SVG, net à tous les zooms.
- Palisade actif : murs exportés reliés comme s'ils avaient été tracés avec Palisade.
- Étages : plusieurs niveaux par carte, exportés vers les niveaux de scène de la v14.
- Zones de sol sélectionnables et déformables comme les murs ; un sol qui suit le mur de sa pièce.
- Calques : masquer, verrouiller, réordonner.
- Sélection de plusieurs objets au rectangle, déplacés et tournés ensemble.
- Dénivelés à l'intérieur des terres ; écume et rapides sur les rivières.
- Arbres : saisons (printemps, automne, hiver nu), d'autres essences ; aperçu du vent dans les arbres dans l'éditeur.
- Eau : remous lus dans une table, simulation des particules sur la carte graphique.

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

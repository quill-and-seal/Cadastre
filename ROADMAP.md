# Feuille de route

Un seul modèle de carte pour toutes les échelles : monde, région, ville, bâtiment, étage. Chaque niveau peut ouvrir une carte plus détaillée. Les maps sont produites par un générateur puis retouchées à la main dans l'éditeur.

## 0.1 — Battlemaps à la main ✅

- Fenêtre d'édition dans Foundry, une par carte, liste des cartes depuis l'onglet Scènes.
- Sols (dalles, plancher, pavés, terre, herbe, eau), pinceau, remplissage.
- Pièces, murs, portes, portes secrètes, gomme.
- Objets : tonneau, caisse, coffre, table, chaise, lit, pilier, escalier.
- Annulation, zoom, déplacement, enregistrement.
- Export en scène : image de fond, grille, murs natifs ; mise à jour d'une scène déjà exportée sans toucher à ce qui a été ajouté à la main.

## 0.2 — Palisade, Vellum et étages

- Vellum actif : fond de scène exporté en SVG, net à tous les zooms.
- Palisade actif : murs exportés reliés comme s'ils avaient été tracés avec Palisade.
- Étages : plusieurs niveaux par carte, exportés vers les niveaux de scène de la v14.
- Murs en diagonale.

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

# Changelog

## 0.1.3

- **Style peint** : l'herbe et la terre sont peintes (bruit fractal, sans répétition visible), avec touches de couleur.
- **Eau** : eau profonde au centre, claire le long des rives, fond de galets, reflet sur le bord, berge de terre irrégulière cerclée d'encre. Eau peinte au pinceau et rivières tracées avec l'outil Chemin (sol « eau ») ne forment qu'une seule eau.
- **Arbres procéduraux** (outil Arbres, touche 0) : feuillu, palmier, conifère, buisson, ou un mélange. Clic pour un arbre, glisser pour en semer ; chaque arbre est unique et se retouche comme un objet.

## 0.1.2

- Outil **Chemin** (touche 9) : une courbe à la plume ou à main levée devient une bande de sol (route, quai, rivière), avec une bordure optionnelle de chaque côté. Largeur, sol et bordure réglables, puis modifiables sur le chemin sélectionné ; points et poignées retouchables comme un mur ; la gomme coupe les chemins.
- **Poignées de transformation** sur l'objet sélectionné : coins pour l'échelle, rond pour la rotation (par 15°, Alt : libre).
- Les raccourcis existants ne changent pas.

## 0.1.1

- Outil **Remplir une pièce** (touche 3) : un clic pose le sol jusqu'aux murs, portes fermées comprises ; dehors, il remplit tout ce qui n'est pas enclos. Aperçu de la zone au survol. Un petit écart entre une cloison et un mur compte comme fermé.
- Les murs tracés s'accrochent aux murs voisins, plus seulement à leurs nœuds.
- Raccourcis des outils renumérotés de 1 à 8.

## 0.1.0

Première version : un éditeur de cartes vectoriel, sans grille imposée.

- Liste des cartes (bouton **Cadastre** dans l'onglet Scènes) : nouvelle carte, ouvrir, dupliquer, supprimer. Cartes rangées en entrées de journal dans un dossier **Cadastre**.
- Éditeur dans sa propre fenêtre, en courbes et zones libres : pinceau de sol à main levée, formes (rectangle, ellipse, plume) en sol seul ou en pièce, murs à la plume ou à main levée, portes et portes secrètes sur n'importe quel mur, objets à angle et échelle libres, gomme.
- Retouche : sélection, déplacement, nœuds et poignées de Bézier, ajout de nœud sans déformer la courbe, coin ↔ courbe, duplication. Aimant à la grille et aux nœuds voisins, optionnel.
- Pièces qui se chevauchent fusionnées ; un mur coupé garde ses vraies courbes.
- Six sols et huit objets dessinés en vectoriel ; transitions fondues entre sols naturels.
- Export en scène : image WebP, scène sans marge à la taille de la carte, grille réglée, murs natifs (courbes suivies par des segments, portes et portes secrètes, ces dernières invisibles sur l'image). Mise à jour d'une scène déjà exportée en gardant ce qui a été ajouté à la main.
- Bibliothèque d'assets : images de l'extérieur (packs, fichiers du MJ) utilisées comme objets ou comme textures de sol. Ajout d'un fichier, d'un dossier entier (sous-dossiers en étiquettes) ou par téléversement ; type et taille devinés à l'import, modifiables ensuite ; recherche, filtres, export et import de la liste en JSON.
- Éditeur : assets de la bibliothèque dans les palettes de sols et d'objets, avec recherche. Les cartes gardent une copie des assets qu'elles utilisent.
- Export : images d'assets intégrées au rendu de la scène ; une image introuvable est signalée.

# Changelog

## 0.1.15

- **Outil Eau** (touche W) : toute l'eau se place avec un seul outil, en trois modes.
  - **Étendue** : pinceau, remplissage d'une zone close, forme (rectangle, ellipse, plume), tracé de rivière à main levée et gomme. Un lac, une mer et les rivières qui s'y jettent forment une seule eau. La gomme ne touche qu'à l'eau : elle efface l'eau peinte et coupe les rivières.
  - **Profondeur et type** : un pinceau creuse ou remonte le fond (Alt : l'inverse), ou rend la profondeur automatique ; une carte de couleurs montre la profondeur pendant qu'on peint. Le type d'eau se peint par zones (claire, profonde, boueuse, et la nouvelle eau tropicale) et les zones se fondent à leur limite ; ailleurs, l'eau garde le type par défaut de la carte. Peu profond : eau plus claire, courant plus vif, et les vagues montent plus loin sur une plage.
  - **Courants** : on trace des flèches dans le sens du courant, n'importe où sur l'eau ; il se répartit entre les traits et s'éteint contre les berges. Un pinceau d'eau calme coupe le courant sur une zone. Un clic sur une rivière règle son courant (sens, vitesse, largeur). Les flèches ne s'affichent qu'avec l'outil.
- **Jonctions des cours d'eau** :
  - À son embouchure, une rivière continue en jet dans le lac ou la mer, qui s'élargit et ralentit, au lieu de s'arrêter net au bout de son tracé.
  - À la sortie d'un lac, l'eau converge vers l'entrée de la rivière.
  - Le courant ne ralentit plus contre le bord d'une rivière là où ce bord s'ouvre sur d'autre eau : seulement contre une vraie berge.
  - Aux confluences, les courants se mêlent en douceur, sans saut de direction, et la rivière qui reçoit plus d'eau qu'elle n'en porte accélère (sa vitesse réglée sert de minimum).
- L'outil Chemin et les palettes de sol ne proposent plus l'eau : tout passe par l'outil Eau. Les cartes existantes n'ont rien à changer (eau peinte, rivières et type d'eau sont repris tels quels).

## 0.1.14

- **Herbe : rendu** (réglage du module, propre à chaque joueur) : « Optimisé » (par défaut) ou « Comme en 0.1.8 », l'herbe d'avant les optimisations, gardée telle quelle (brins en rectangles, vent calculé pour chaque brin, tous les brins dessinés même de loin). Plus lourd. Le choix vaut pour la scène, pour l'éditeur (à rouvrir) et pour l'image exportée.

## 0.1.13

- **Correctif important : l'eau et l'herbe s'animent enfin dans les scènes.** Sous Foundry v13 et v14, l'entrée « Bibliothèque » des réglages du module était refusée au démarrage, ce qui empêchait aussi d'enregistrer les réglages de l'eau et du vent : aucune animation dans les scènes exportées, et pas de section Cadastre dans les réglages du jeu. Chaque partie s'enregistre maintenant à part, et l'entrée de la bibliothèque est acceptée.

## 0.1.12

- **Plages, eau plus naturelle** :
  - L'écume n'est plus alignée en rangées perpendiculaires au rivage, et ses bulles sont plus fines.
  - Plus de bande d'eau terne au bord : l'eau peu profonde laisse voir le sable mouillé, de la même teinte de part et d'autre du rivage, et les reflets reviennent dès qu'elle s'approfondit un peu.
  - L'effet de la côte s'éteint en douceur dans l'eau, sans bord net.
  - Au bout d'une plage, là où l'herbe reprend, l'eau ne déborde plus sur l'herbe.
  - Plus de trait sombre le long du rivage d'une plage ou d'une falaise.

## 0.1.11

- **Plages et falaises** : deux nouveaux sols, **sable** et **roche**. Là où l'eau les borde, la côte s'anime d'elle-même, sans rien tracer de plus :
  - **Plage** : l'eau monte sur le sable puis se retire au rythme des vagues, sans déferler. L'écume ne vient qu'avec chaque vague. Le sable reste mouillé jusqu'où montent les vagues, sèche un peu, et la vague suivante le remouille. Au bord, l'eau n'est qu'une mince pellicule transparente, sans reflets ; ils apparaissent plus au large. La surface monte et redescend avec l'eau.
  - **Falaise** : une paroi de roche vue du dessus, fissurée, mouillée et couverte d'algues en bas. À chaque vague, des gerbes partent du pied, montent le long de la paroi et retombent en écume qui repart vers le large ; une dentelle d'écume s'étale puis se défait. Les gerbes éclatent par paquets, plus fortes là où la paroi fait face aux vagues. Les objets posés dans l'eau près d'une côte ont aussi leur gerbe.
  - Les vagues avancent à leur vitesse réelle (environ 6 m/s près du bord, soit 4 cases par seconde) : ce qui avance le plus en mer est touché en premier. Elles viennent du large, déduit de l'orientation des côtes.
  - Les berges des rivières et les rives d'herbe, de terre ou de pavés ne changent pas.
- **Réglages de l'eau** : force des vagues (0 : mer calme), secondes entre deux vagues, hauteur des gerbes.
- Sur une côte de sable ou de roche, l'eau peinte n'a plus de berge de terre ni de trait d'encre : c'est la vague qui fait le bord.

## 0.1.10

- **Eau plus légère, même rendu** :
  - Le fond de l'eau (sable, galets, ombre des rochers) est calculé une seule fois, à la finesse de l'image de la scène ; à chaque image, la surface n'ajoute que ce qui bouge.
  - La surface n'est dessinée que sur les morceaux de carte qui contiennent de l'eau.
  - Les calculs de vitesse de l'eau ne créent plus d'objets temporaires : plus de petits à-coups réguliers.
  - Chaque particule ne regarde que les rochers proches ; les tourbillons d'un rocher sont calculés une fois par image, et non pour chaque particule.
  - Hors de l'écran, ou trop petites pour être vues de loin, les particules sont simulées quatre fois moins souvent.
  - De loin, moins de points d'écume, en fondu, et les éclats trop fins pour l'écran s'effacent (ils scintillaient).
  - Sur une grande rivière (8 500 particules, 12 rochers), le calcul par image passe de 45 ms à 11 ms quand un tiers de la rivière est à l'écran, et à 25 ms quand elle y est entière.
- **Éditeur** : l'eau est calculée en arrière-plan, et seulement quand une retouche la touche ; peindre ailleurs ou changer les reflets ne remet plus l'écume à zéro.
- **Pause** : rien n'est calculé quand l'eau n'est pas à l'écran ou que l'onglet est caché.
- Le compteur de performances couvre maintenant l'herbe et l'eau.

## 0.1.9

- **Herbe plus légère, même rendu** :
  - Ce qui ne bouge jamais dans un brin (écart au vent, angle, longueur, teinte) est calculé une fois pour toutes. Chaque brin tient en 8 octets.
  - Le vent est calculé une fois par image sur une petite grille, que les brins lisent.
  - Les jetons ne sont testés que dans les morceaux de prairie qu'ils touchent.
  - Un brin est un triangle et non plus un rectangle.
- **Rien n'est dessiné pour rien** : sans vent ni jetons, la scène garde simplement l'herbe de son image de fond ; l'éditeur ne dessine pas quand l'onglet est caché ou que rien ne bouge.
- **Éditeur** : les brins sont calculés en arrière-plan, et seuls les morceaux touchés par une retouche sont recalculés, sans à-coup en peignant.
- **Vue de loin** : les brins en trop disparaissent en fondu, sans saut quand on zoome.
- **Compteur de l'herbe** (réglage du module, par joueur) : nombre de brins dessinés et temps par image, pour mesurer.
- L'eau ne déborde plus de la carte quand une rivière en sort.

## 0.1.8

- **Eau vivante** : l'eau est dessinée par la carte graphique, avec un fond de sable et de galets vu à travers l'eau, des reflets de lumière qui ondulent et suivent le courant, des éclats de soleil et un liseré d'écume contre la berge. Trois textures : claire, profonde, boueuse.
- **Courant réaliste** : rapide au milieu d'une rivière, presque nul contre les berges, déporté vers la rive extérieure dans les virages.
- **Obstacles** : un objet posé dans une rivière fait obstacle. L'eau s'écrase devant, passe de chaque côté, tourbillonne derrière, reste hachée en aval, avec des rides en V.
- **Écume et feuilles** portées par le courant ; traits du courant en option.
- Réglages par carte dans le panneau Carte (Eau) ; réglage par joueur dans Foundry (Eau vivante : aucune, surface, complète).
- L'image exportée contient la même eau, figée, sous les chemins, objets et murs.
- Remplace les filets de courant : réexporter les scènes créées avant cette version.

## 0.1.7

- **Nouvelle herbe** : une grille très serrée de brins, de simples traits dessinés par la carte graphique (des centaines de milliers sans ralentir). Le vent les couche dans sa direction, chacun avec un léger écart pour cacher le sol, et des vagues parcourent la prairie : houle régulière, rafales qui avancent, ou les deux.
- Réglages par carte dans le panneau Carte : direction (au degré), force, forme et vitesse des vagues, espacement, longueur et angle des brins, désordre de la grille.
- L'éditeur montre toujours cette herbe ; le bouton vent l'anime. L'image de la scène exportée contient la même herbe, figée.
- Dans Foundry : niveaux Aucun (herbe figée), Léger, Brins animés, Complet (l'herbe s'écarte au passage des jetons et se redresse derrière eux). Vus de loin, les brins sont moins nombreux et plus larges.
- Réexporter les scènes créées avant cette version pour avoir la nouvelle herbe.

## 0.1.6

- **Herbe en brins** : le sol herbe est un tapis serré de brins peignés, qui penchent tous à peu près du même côté, sur de grandes nappes de couleur douces ; y compris dans l'image de la scène.
- **Vent** : les touffes laissent place à des dizaines de brins animés par case, de la même palette que le sol, qui se couchent ensemble sous les rafales et s'écartent autour des jetons. Réglage « Brins animés par case » (0 à 120) dans le panneau Carte.

## 0.1.5

- **Vent dans l'herbe**, vu de dessus : des rafales avancent dans le sens du vent et l'herbe se couche sur leur passage. Direction, force, rafales et densité des touffes réglables par carte (panneau Carte de l'éditeur).
- Trois niveaux au choix de chaque joueur dans Foundry : ondulation (vagues de lumière), touffes qui se couchent, complet (l'herbe s'écarte au passage des jetons).
- Aperçu animé dans l'éditeur ; la souris y écarte l'herbe comme un jeton.
- Les touffes évitent l'eau et ses berges, les chemins, les pièces, les murs et tout ce qui est posé sur l'herbe.

## 0.1.4

- **Courant des rivières** : une rivière tracée avec l'outil Chemin et le sol « eau » a des filets de courant qui glissent dans le sens du tracé, plus vite au milieu. Sens, vitesse ou eau calme réglables par rivière.
- Dans Foundry, le courant est animé sur la scène exportée, au-dessus du fond et sous les jetons ; réglage par joueur pour le couper.
- Dans l'éditeur, le courant est animé ; bouton pour le mettre en pause.

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

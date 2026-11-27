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
| Arbres | 0 | Arbres générés branche par branche et feuille par feuille : chêne, hêtre, bouleau, sapin, épicéa, buisson, myrtilles, fougère, souche, champignons, palmier, ou un mélange. Clic : un arbre ; glisser : sème des arbres dans la zone du pinceau, espacés selon la densité. Chaque arbre est unique (graine) et devient un objet : sélection, déplacement, rotation, taille. Dans la scène, ils bougent avec le vent de l'herbe. |
| Biome | B | Fait de toute la carte un biome : son sol en fond et sa végétation semée partout où elle peut pousser ; glisser le peint sur une seule zone (voir **Biomes**). |
| Gomme | 8 | Efface en glissant : tout, ou seulement les sols, les murs ou les objets. Un mur gommé est coupé proprement. |

Navigation : clic droit, molette enfoncée ou **Espace** + clic pour déplacer la vue, molette pour zoomer. **Échap** annule le tracé en cours. **Ctrl+Z** / **Ctrl+Maj+Z** pour annuler et rétablir, **Ctrl+S** pour enregistrer.

Le panneau de droite règle l'outil en cours et la carte : nom, largeur et hauteur en cases, pixels par case dans la scène, couleur de fond.

Sols disponibles : dalles, plancher, pavés, terre, herbe, eau. L'herbe est une grille serrée de brins animés par le vent (voir plus bas), la terre est peinte, et toutes deux se fondent dans leurs voisins ; les sols construits gardent un bord net. L'eau a son propre rendu, vivant (voir plus bas), bordé d'une berge de terre irrégulière cerclée d'encre. Une rivière se peint au pinceau ou se trace avec l'outil Chemin et le sol « eau » : les deux se rejoignent en une seule eau. Tout est dessiné en vectoriel par le module : aucune image à fournir.

## Eau vivante

L'eau est dessinée par la carte graphique : fond de sable et de galets vu à travers l'eau, reflets de lumière qui ondulent sur le fond et suivent le courant, éclats de soleil sur les rides, liseré d'écume contre la berge.

### L'outil Eau (touche W)

Toute l'eau se place avec l'outil **Eau**, en trois modes :

- **Étendue** : où il y a de l'eau. Pinceau, remplissage d'une zone close, forme (rectangle, ellipse, plume), rivière tracée à main levée, gomme. Lacs, mer et rivières forment une seule eau ; la gomme n'efface que l'eau et coupe les rivières.
- **Profondeur et type** : un pinceau creuse ou remonte le fond (Alt : l'inverse) ou rend la profondeur automatique (le fond descend en s'éloignant du bord) ; une carte de couleurs la montre pendant qu'on peint. Le type d'eau (claire, profonde, boueuse, tropicale) se peint par zones qui se fondent à leur limite ; ailleurs, c'est le type par défaut du panneau **Carte**. Peu profond : eau plus claire, courant plus vif, vagues qui montent plus loin sur une plage.
- **Courants** : glisse dans le sens du courant pour tracer une flèche, n'importe où. Les flèches donnent l'élan, puis l'eau s'écoule comme un vrai fluide dans toute l'étendue d'eau : elle remplit le chenal, suit ses virages, accélère dans les passages étroits et ralentit dans les étangs, contourne les îlots, reste dormante dans les bras sans issue et tourne en rond dans un étang fermé (le long de la flèche, retour le long des rives). Le bord de la carte n'est pas une berge : l'eau y entre et en sort. **Générer les courants** en pose d'office le long des chenaux de toute l'eau (d'une sortie de la carte à l'autre, avec leurs affluents ; un étang rond reste calme), à la vitesse du curseur ; régénérer remplace ceux générés, **Retirer** les enlève, ceux tracés à la main restent. Un pinceau d'eau calme le coupe sur une zone. Une rivière a d'office un courant le long de son tracé, rapide au milieu, presque nul contre les berges, déporté vers la rive extérieure dans les virages : un clic dessus permet de l'inverser, de régler sa vitesse ou de le couper. À son embouchure, elle continue en jet qui s'élargit dans le lac ou la mer ; à la sortie d'un lac, l'eau converge vers elle ; aux confluences, les courants se mêlent et la rivière qui reçoit les autres accélère.

Tout objet posé dans une rivière (rocher de ta bibliothèque, tonneau, caisse…) fait obstacle : l'eau s'écrase devant, ralentit, passe de chaque côté, tourbillonne derrière, puis reste hachée sur une bonne distance, avec deux rides en V qui s'ouvrent vers l'aval. De l'écume et quelques feuilles flottent sur le courant ; l'écume se rassemble là où l'eau bouillonne.

### Plages et falaises

Peins du **sable** ou de la **roche** au bord de l'eau : la côte s'anime d'elle-même. Sur une plage, l'eau monte sur le sable puis se retire au rythme des vagues ; l'écume vient avec chaque vague et le sable reste mouillé jusqu'où elles montent. Contre une falaise, une paroi de roche apparaît au bord de l'eau ; à chaque vague, des gerbes partent du pied, montent le long de la paroi et retombent, puis l'écume repart vers le large. Les vagues avancent à leur vitesse réelle et touchent d'abord ce qui avance le plus en mer ; elles viennent du large, déduit de l'orientation des côtes. Les berges des rivières et les rives d'herbe ou de pavés ne changent pas.

Réglages par carte, dans le panneau **Carte** de l'éditeur (**Eau**) :

| Réglage | Par défaut | Rôle |
|---|---|---|
| Texture de l'eau | Claire | Claire (fond de galets visible), profonde ou boueuse. |
| Reflets de lumière | 60 % | |
| Traits du courant | non | Des milliers de traits qui suivent le courant. |
| Particules | oui | Écume, feuilles et brindilles portées par l'eau. |
| Particules par case d'eau | 60 | |
| Remous | 35 % | |
| Tourbillons derrière les rochers | 60 % | Force du sillage et des perturbations derrière les obstacles. |
| Force des vagues | 60 % | Plages et falaises ; 0 : mer calme. |
| Secondes entre deux vagues | 7 s | |
| Hauteur des gerbes | 60 % | Contre les falaises et les rochers. |

Dans l'éditeur, le bouton vague de la barre du haut met l'eau en pause. L'image de la scène exportée contient la même eau, figée, sous les chemins, objets et murs.

Dans Foundry, chaque joueur choisit son niveau dans les réglages du module (**Eau vivante**) : aucune (l'eau figée de l'image de fond), surface animée, ou complète (écume, feuilles et traits du courant). Une scène exportée avant la 0.1.8 doit être réexportée pour avoir la nouvelle eau.

## Vent dans l'herbe

L'herbe est une grille très serrée de brins, de simples traits dessinés par la carte graphique. Vus de dessus, au repos, les brins pointent au hasard ; le vent les couche dans sa direction, chacun avec un léger écart, et des vagues passent sur la prairie. Tout se règle par carte, dans le panneau **Carte** de l'éditeur (**Vent dans l'herbe**) :

| Réglage | Par défaut | Rôle |
|---|---|---|
| Souffle vers | 40° | Direction du vent (0° : est, 90° : sud). |
| Force | 60 % | De calme à tempête. |
| Vagues | Houle + rafales | Houle régulière, rafales qui avancent, ou les deux. |
| Vitesse des vagues | × 0,5 | |
| Espacement des brins | 2,5 px | Pour une case de 100 px. Plus petit : herbe plus dense. |
| Longueur des brins | 24 px | Pour une case de 100 px. |
| Angle des brins | ± 25° | Écart des brins autour du sens du vent : ils se croisent et cachent le sol. |
| Désordre de la grille | 0 % | |

Dans l'éditeur, l'herbe est toujours dessinée ; le bouton vent de la barre du haut l'anime, et la souris y écarte l'herbe comme le ferait un jeton. L'image de la scène exportée contient la même herbe, figée.

Dans Foundry, chaque joueur choisit son niveau dans les réglages du module (**Vent dans l'herbe**) :

| Niveau | Ce qu'on voit |
|---|---|
| Aucun | L'herbe figée de l'image de fond. |
| Léger | Les brins bougent, un peu moins nombreux : pour un ordinateur peu puissant. |
| Brins animés | Tous les brins bougent. |
| Complet (par défaut) | En plus, l'herbe s'écarte au passage des jetons et se redresse derrière eux. |

Les brins animés ne s'affichent que de près (plus de 180 pixels d'écran par case) : de plus loin, ils s'effacent en fondu et laissent l'herbe figée de l'image de fond, la même, nette à tous les zooms avec Vellum. Le réglage **Mode diagnostic (performances)** affiche en haut à gauche les images par seconde, les gels, le temps de chargement, la mémoire graphique et, pour les arbres, l'herbe et l'eau, ce qui est dessiné et le temps de calcul par image. Les brins ne poussent que sur le sol **herbe**, jamais sur l'eau, les chemins, les pièces ni sous ce qui est posé (arbres, objets, tentes de ta bibliothèque). Une scène prend son vent à l'export ; une scène exportée avant la 0.1.7 doit être réexportée pour avoir la nouvelle herbe.

Le réglage **Herbe : rendu** permet de revenir à l'herbe d'avant les optimisations (**Comme en 0.1.8** : brins en rectangles, vent calculé pour chaque brin, tous les brins dessinés même de loin). Plus lourd ; il vaut aussi pour l'éditeur (à rouvrir) et l'image exportée.

## Biomes

L'**outil Biome** (touche B) fait de toute la carte un biome : choisis-le puis **Appliquer à toute la carte**. Son sol devient le fond de la carte (sous les sols peints) et sa végétation est semée partout où elle peut pousser, espacée naturellement — pas dans l'eau, les pièces, les chemins, contre les murs ni sur les sols construits, les plages et la roche. Les petites plantes restent sous les arbres. Le curseur **Densité** en met plus ou moins. Réappliquer ressème la végétation (après avoir tracé de l'eau ou des chemins, par exemple), **Retirer** enlève le biome ; les plantes posées à la main restent, et celles du biome restent des objets retouchables. Glisser sur la carte peint le biome sur une seule zone.

| Biome | Sol | Végétation |
|---|---|---|
| Forêt de feuillus | Litière de forêt | Chênes, hêtres, bouleaux, buissons, fougères, souches, champignons |
| Forêt de conifères | Aiguilles et mousse | Sapins, épicéas, myrtilles, fougères, souches, champignons |
| Marais | Vase | Chenaux, étangs et îlots, courants lents le long des grands chenaux, nénuphars, joncs, massettes, roseaux, saules têtards, bois mort (chicots, genoux de cyprès, troncs couchés), ponts de planches, lucioles (celles d'Ember s'il est actif) |

Les sols de forêt sont peints élément par élément à taille réelle (feuilles mortes, brindilles, glands, mousse, aiguilles, pommes de pin…) ; leur tuile est calculée à la première utilisation.

## Arbres

Chêne, hêtre, bouleau, sapin, épicéa, buisson, myrtilles, fougère, souche et champignons sont générés comme de vrais arbres vus de dessus : un squelette en 3D (tronc, charpentières, branches, rameaux), puis des feuilles à leur taille et en quantité réelles, chacune accrochée à un rameau. La graine de l'arbre (tirée au hasard quand on le pose) donne sa forme : deux arbres ne se ressemblent jamais. Le palmier garde un dessin simple.

Dans l'éditeur, chaque arbre est calculé en arrière-plan ; sa silhouette s'affiche le temps du calcul. À l'export, les arbres et leurs ombres sont envoyés avec la scène, avec une carte des hauteurs des objets et des murs.

**Soleil et ombres.** Le réglage **Heure du soleil** (5 h à 21 h, changeable en pleine partie, appliqué en direct chez tous les joueurs) fait tourner et s'allonger toutes les ombres : arbres, objets et murs. Le soleil se lève à l'est, passe au sud à midi (ombres courtes vers le haut de la carte) et se couche à l'ouest ; à l'aube et au crépuscule, les ombres sont longues et plus pâles. Les ombres des arbres suivent leur balancement au vent. L'intérieur des pièces reste à l'abri du soleil. Sur l'eau animée, c'est l'eau qui se dessine à l'ombre (sans reflets, plus sombre). **Intensité des ombres** règle leur force. Macro : `game.modules.get("cadastre").api.setSunTime(18)`.

 Dans la scène, ils restent nets à tous les zooms : au-delà de la finesse envoyée avec la scène, les arbres à l'écran sont redessinés plus fins, à la volée, depuis leur graine.

Dans la scène, ils bougent avec **le même vent que l'herbe** (direction, force, vagues et rafales réglées dans **Vent dans l'herbe**), à la même horloge : une rafale qui couche l'herbe passe dans l'arbre au même moment. Chaque branche est un morceau rigide qui pivote autour de son point d'attache, avec du poids (retard, léger dépassement, retour) et son propre rythme ; rien n'est déformé. Le sapin plie d'un bloc. Avec le niveau **Aucun**, les arbres restent immobiles.

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

### Fond net de près (avec Vellum)

Avec [Vellum](https://github.com/quill-and-seal/Vellum) actif, le fond est en plus découpé en **tuiles fines** (réglage *Finesse du fond exporté* : 200, 300 ou 400 pixels par case, 300 par défaut). Vellum ne charge que les tuiles visibles, au niveau du zoom : le sol, les feuilles mortes, les aiguilles, les cailloux et les chemins restent nets de près. Le changement de scène n'est pas plus long : seul l'aperçu (aussi fin que le fond habituel) est chargé à l'ouverture.

- Les tuiles sont rangées dans `worlds/<ton monde>/cadastre/tuiles/` ; un réexport remplace celles de la carte.
- Compte ≈ 50 ko par case à 300 px/case pour une forêt (≈ 100 Mo pour 50 × 40 cases), et un export plus long (une à deux minutes pour une grande carte).
- Sans Vellum, ou avec la finesse « Normal », le fond habituel est exporté, sans tuiles.
- Il faut **Vellum 0.4.5** ou plus récent.
- Au réexport, seules les tuiles des zones modifiées sont redessinées (empreinte gardée dans la scène).
- Clic droit sur une scène → **Précharger chez les joueurs** (Vellum 0.4.4) : fond, premières tuiles et images des arbres partent chez les joueurs sans que la scène s'affiche.

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

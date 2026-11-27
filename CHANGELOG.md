# Changelog

## 0.2.2

- **Bouton « Générer les courants »** (outil Eau, mode Courants) : pose des courants le long des chenaux de toute l'eau de la carte, peinte à la main ou non. Une eau qui sort de la carte par plusieurs endroits reçoit un courant principal d'une sortie à l'autre, et un affluent depuis chaque autre sortie ; un chenal fermé et allongé reçoit un courant d'un bout à l'autre ; un étang rond reste calme. Les tracés suivent le milieu des chenaux, à la vitesse du curseur. Régénérer remplace les courants générés ; ceux tracés à la main restent. **Retirer** enlève les courants générés.
- Le marais utilise la même génération : ses courants sont posés de façon plus sûre (il arrivait qu'aucun ne le soit).
- **Le bord de la carte ne bloque plus l'eau** : là où l'eau touche le bord de la carte, il n'y a plus de berge (ni bande de terre, ni liseré clair, ni écume) ; le courant y file sans buter ni ralentir, et le fond ne remonte pas.

## 0.2.1

- **Courants plus réalistes.** Les courants tracés ne poussent plus seulement l'eau autour de la flèche : l'eau s'écoule comme un vrai fluide dans toute l'étendue d'eau. Elle remplit le chenal et suit ses virages, accélère dans les passages étroits et ralentit dans les étangs (le même débit passe partout), se partage devant un îlot et file plus vite sur ses côtés, reste dormante dans les bras sans issue, et tourne en rond dans un étang fermé (courant le long de la flèche, retour le long des rives). Le bord de la carte laisse l'eau entrer et sortir.
- **Le marais génère ses courants** : un courant lent le long de chaque grand chenal, tous dans le même sens général, qui se rejoignent aux croisements. Ce sont des courants tracés ordinaires (outil Eau) : on peut les retoucher ou les effacer. Réappliquer ou retirer le biome les remplace.
- Demande un réexport des scènes pour voir les nouveaux courants.

## 0.2.0

- **Nouveau biome : Marais** (issue #19). Sol de vase olive et kaki (flaques, mousse, brins de paille, bulles), grands chenaux d'eau sombre vert-bleu qui se rejoignent et s'élargissent en étangs, îlots de vase, lentilles d'eau en paquets le long des berges.
- Plantes du marais, générées comme les arbres : roseaux à plumeau, massettes, joncs, nénuphars en fleurs (sur l'eau seulement), saules têtards.
- **Bois mort** : chicots aux racines nues, genoux de cyprès qui sortent de l'eau, troncs couchés avec leur galette de racines.
- **Ponts de planches procéduraux** jetés au-dessus des chenaux étroits, d'une rive à l'autre : planches grises inégales, de biais, quelques-unes manquantes ou cassées, longerons et pieux. Réappliquer le biome les remplace. Tout chemin peut devenir une passerelle : case « Planches (passerelle) » quand il est sélectionné.
- **Interaction** : les jetons écartent les petites plantes (roseaux, joncs, fougères…) en passant, qui se redressent ensuite.
- **Lucioles** au-dessus des marais, plus nombreuses quand le soleil baisse ou que la scène est sombre ; elles s'écartent des jetons. Avec **Ember** actif, l'export pose des émetteurs Ember « lucioles » à la place (marqués Cadastre, remplacés à chaque réexport). Réglage « Lucioles » pour les couper.
- **Demande un réexport** des cartes de marais pour les lucioles.

## 0.1.38

- **Les ombres des arbres bougent vraiment** : chaque morceau d'arbre (tronc, branches) porte maintenant sa propre ombre, décalée selon sa hauteur le long des rayons du soleil et tournée comme lui quand le vent le balance. Les ombres des branches bougent avec les branches, et suivent l'heure du soleil.
- Ombres plus nettes et ajourées (on voit la lumière passer entre les branches), peintes d'une seule couleur par le calque des ombres.
- Fonctionne aussi sur les scènes exportées depuis la 0.1.27, sans réexport (les ombres des objets et des murs demandent toujours un export en 0.1.37 ou plus).

## 0.1.37

- **Soleil qui tourne : ombres dynamiques.** Nouveau réglage **Heure du soleil** (5 h à 21 h), changeable en pleine partie : toutes les ombres tournent et s'allongent en direct, chez tous les joueurs. Le soleil se lève à l'est, passe au sud à midi (ombres courtes vers le haut de la carte), se couche à l'ouest ; à l'aube et au crépuscule, ombres longues et plus pâles. Macro : `game.modules.get("cadastre").api.setSunTime(18)`. Remplace le réglage « Hauteur du soleil ».
- **Ombres des arbres au vent** : l'ombre de chaque arbre (pied, tronc, couronne projetée selon sa hauteur) suit son balancement.
- **Ombres des objets et des murs** : elles ne sont plus seulement une petite ombre fixe dans l'image de fond ; une carte des hauteurs exportée avec la scène les projette selon le soleil. L'intérieur des pièces reste à l'abri du soleil.
- Toutes les ombres sont dans un même calque (sur l'herbe, sous les arbres), aplaties pour ne pas s'additionner, et gommées sur l'eau animée, qui se dessine elle-même à l'ombre (masque mis à jour quand le soleil change).
- Réglage « Intensité des ombres » : s'applique aussi aux objets et aux murs.
- **Demande un réexport des cartes.** Une scène exportée avant garde ses ombres d'arbres fixes, posées telles quelles.

## 0.1.36

- **Éditeur : l'herbe animée ne passe plus au-dessus des arbres.** L'aperçu du vent était dessiné par-dessus les chemins, objets, arbres et murs ; il est maintenant entre le sol (et l'eau) et eux, comme dans la scène.

## 0.1.35

- **Nouvelle interface de l'éditeur** : la carte occupe toute la fenêtre et les commandes flottent par-dessus, dans des panneaux sombres translucides aux bords arrondis.
  - En haut à gauche : le nom de la carte, sa taille, et un point orange quand il reste des modifications non enregistrées.
  - En haut : annuler, rétablir, et les pastilles Grille, Aimant, Eau animée, Vent (vertes quand elles sont actives).
  - En haut à droite : Carte (réglages de la carte : nom, taille, vent, eau, ouverts à la demande), Bibliothèque, Enregistrer, Exporter.
  - En bas au centre : les outils dans une barre ronde, l'outil actif en blanc avec son nom au-dessus.
  - À droite : les options de l'outil choisi, avec son aide en bas.
  - En bas : coordonnées sous le curseur, et zoom (−, pourcentage à l'échelle de la scène, +, voir toute la carte).
  - « Voir toute la carte » range la carte entre les panneaux. Fenêtre étroite : les pastilles ne gardent que leur icône.
  - Police Manrope (fournie avec le module, licence SIL OFL), accent vert menthe. Fenêtre plus grande par défaut (1400 × 860).

## 0.1.34

- **Éditeur : peindre de l'eau sous un arbre posé à la main le retire**, comme les plantes semées par un biome. Un arbre posé exprès dans l'eau (eau déjà là quand on le pose) reste, et les objets (rochers, barques…) restent toujours. Annulable comme toute retouche.

## 0.1.33

- **Les ombres des arbres agissent sur l'eau** : sur l'eau animée, l'ombre n'est plus une couche sombre posée par-dessus ; c'est l'eau qui se dessine à l'ombre. Sans soleil, elle perd ses taches de lumière, ses reflets du ciel et ses éclats, s'assombrit en bleuissant, et laisse mieux voir le fond. L'écume et les feuilles qui flottent s'assombrissent aussi. Suit le réglage « Intensité des ombres des arbres ». Avec l'animation de l'eau coupée, l'ombre reste posée sur l'eau du fond comme avant. Pas besoin de réexporter.

## 0.1.32

- **L'eau ne se fige plus sous les arbres** : l'eau animée était masquée sous la couronne des arbres générés (comme du temps où ils étaient peints dans l'image de fond) ; on voyait l'eau figée du fond sous les branches. Les arbres générés étant dans leur propre calque, au-dessus de l'eau, elle continue maintenant de bouger dessous. Demande un réexport de la carte.

## 0.1.31

- **Herbe plus belle vue de loin** : les brins animés ne s'affichent plus que de près. Sous environ 180 pixels d'écran par case, ils s'effacent en fondu (complètement sous 120) et laissent l'herbe figée de l'image de fond, la même, nette à tous les zooms avec Vellum : plus d'aspect moquette floue qui scintille, et l'affichage est plus léger. Ils reviennent en fondu en zoomant. Pas besoin de réexporter.

## 0.1.30

- **Ombres encore plus sombres** : silhouette plus opaque et teinte plus foncée ; l'intensité par défaut passe à « Marquée ». Demande un réexport de la carte.
- **Mode diagnostic** : la ligne « Arbres » signale une scène dont les ombres sont encore les anciennes, peintes dans l'image de fond (à réexporter), et les dalles d'ombres pas encore peintes.

## 0.1.29

- **Ombres plus sombres et plus nettes** : bord plus net, plus foncées, et teintées d'un bleu-vert très sombre au lieu du noir. Une ombre sur l'herbe au soleil est froide : elle se lit comme une ombre, plus comme un sol foncé. L'intensité par défaut passe à « Normale » (0,8). Demande un réexport de la carte.
- **Ombres vues de loin** : elles sont peintes une fois dans des dalles fixes, sans se chevaucher, avec des réductions lissées. Elles gardent leur force au dézoom, ne coûtent plus rien à chaque image (plus de filtre de transparence) et les images d'ombres de chaque arbre sont rendues à la carte graphique une fois les dalles peintes.
- **Mode diagnostic** :
  - le temps de chargement d'un calque est compté depuis le début de son propre chargement (avant, un calque rechargé en cours de partie, par exemple en activant le mode diagnostic, était compté depuis l'ouverture de la scène : « arbres 26 s ») ;
  - quand l'herbe ou l'eau ne sont pas animées, le panneau dit pourquoi (carte sans vent, réglage coupé, scène à réexporter) au lieu de ne rien afficher.

## 0.1.28

- **Ombres des arbres sous les brins d'herbe** : dans Foundry, le calque des ombres pouvait passer sous l'herbe animée ; les brins restaient alors clairs dans l'ombre. Les ombres sont maintenant dessinées avec les arbres, juste avant eux : elles assombrissent toujours l'herbe. Pas besoin de réexporter une scène exportée en 0.1.27.

## 0.1.27

- **Ombres des arbres bien visibles** : elles ne sont plus peintes dans l'image de fond, où l'herbe animée les recouvrait, mais posées dans la scène, sur l'herbe et sous les arbres. Deux ombres qui se croisent ne s'additionnent pas. Au dézoom, elles sont regroupées avec les forêts.
- **Réglage « Intensité des ombres des arbres »** (monde) : légère (comme avant), normale, marquée ou très marquée. Appliqué tout de suite, sans réexport.
- **Réglage « Hauteur du soleil »** (monde) : haut, moyen ou bas. Plus le soleil est bas, plus les ombres s'allongent et sortent de sous les couronnes. Pris en compte au prochain export (et dans l'aperçu de l'éditeur).
- Les scènes exportées avant gardent leurs ombres dans l'image de fond : réexporter la carte pour profiter des nouvelles ombres.

## 0.1.26

- **Mode diagnostic** (réglage client, anciennement « Compteur de performances ») : un panneau en haut à gauche qui dit ce qui coûte, pour viser juste quand quelque chose rame :
  - images par seconde, temps moyen et pire temps d'une image ;
  - **gels** du navigateur (tâches de plus de 50 ms), quel que soit le module responsable ;
  - temps de chargement de la scène, des arbres, de l'herbe et de l'eau ;
  - mémoire graphique totale, et la part de Cadastre (images des arbres, arbres affinés, forêts regroupées) ;
  - une ligne par calque : arbres à l'écran, morceaux, arbres affinés ; brins d'herbe ; particules d'eau ; temps de calcul.
- **Réexport partiel des tuiles** : Cadastre garde une empreinte de la carte à chaque export (un petit rendu de toute la carte). Au réexport, seules les tuiles des cases dont le dessin a changé sont redessinées et renvoyées : une retouche ne prend plus que quelques secondes. Le premier export, un changement de finesse ou de taille, ou une tuile perdue en route refont tout.
- **Forêts regroupées au dézoom** : quand une case fait moins de 26 pixels à l'écran, le vent ne se voit plus ; les arbres sont alors dessinés une fois, par zones de 8 × 8 cases, dans quelques images fixes (préparées petit à petit, sans à-coup), et reviennent en rezoomant. Une grande forêt vue de loin coûte presque rien à afficher.

## 0.1.25

- **Export en tuiles impossible** (« File … has a disallowed extension ".dzi" ») : Foundry refuse d'envoyer les fichiers `.dzi`. La description de la découpe est maintenant envoyée en `.xml` ; il faut **Vellum 0.4.5**, qui sait la lire.
- **Végétation sous l'eau** : la végétation semée par un biome (ou au pinceau Biome) disparaît quand on peint de l'eau, une rivière, une pièce, un chemin, un mur ou un sol nu par-dessus après coup. Les plantes posées à la main restent. Les cartes existantes sont corrigées à leur ouverture dans l'éditeur.

## 0.1.24

- **Fond net de près, avec Vellum** : le fond exporté est en plus découpé en tuiles fines (200, 300 ou 400 pixels par case, 300 par défaut ; réglage *Finesse du fond exporté*), au format des cartes géantes de Vellum. Vellum ne charge que les tuiles visibles, au niveau du zoom : le sol (feuilles mortes, aiguilles), les cailloux, les chemins restent nets de près, au lieu d'un agrandissement flou de l'image à 100 px/case.
  - Les sols peints sont redessinés aussi fins que les tuiles ; l'herbe, l'eau et les ombres des arbres suivent.
  - Changement de scène pas plus long : seul l'aperçu (aussi fin que le fond habituel) est chargé à l'ouverture ; les tuiles arrivent en zoomant.
  - Tuiles dans `worlds/<monde>/cadastre/tuiles/`, remplacées à chaque réexport de la carte. ≈ 50 ko par case de forêt à 300 px/case.
  - Sans Vellum, ou en finesse « Normal », le fond habituel est exporté.
- Les images des arbres sont préchargées avec la scène par **Précharger chez les joueurs** (Vellum 0.4.4).

## 0.1.23

- **Plus de gel d'une minute au zoom avec Vellum** : Vellum prenait chacun des milliers de morceaux d'arbres de la scène pour une image à agrandir, et les retraitait un par un à chaque zoom. Les calques de Cadastre (arbres, herbe, eau) sont maintenant marqués pour que Vellum les laisse de côté : Cadastre gère déjà lui-même leur netteté. Fonctionne avec toutes les versions de Vellum ; Vellum 0.4.3 reconnaît en plus officiellement ce marquage.

## 0.1.22

- **Plus de gel au zoom** : en zoomant, les arbres à l'écran étaient tous redessinés plus fins en même temps, puis envoyés d'un bloc à la carte graphique (plusieurs centaines de Mo pour une forêt) : l'affichage se figeait. Désormais :
  - la mémoire des arbres affinés est plafonnée (≈ 130 Mo), les plus gros arbres sont affinés un peu moins (2 048 px au plus) ;
  - deux arbres au plus sont redessinés à la fois, en commençant par le centre de l'écran ;
  - les images sont envoyées à la carte graphique par petites portions, image après image, et l'arbre n'est remplacé qu'une fois prêt ;
  - en dézoomant, la mémoire est rendue tout de suite ;
  - sans worker disponible, les arbres ne sont plus affinés dans la page (c'est ce qui la bloquait) : ils gardent les images de la scène.
- **Arbres lissés au dézoom** : les images des arbres de la scène ont des versions réduites (mipmaps) et un filtrage anisotrope, les feuilles ne scintillent plus en mouvement ; les morceaux sont plus espacés dans les pages d'images pour que leurs bords ne se mélangent pas.
  - Pour en profiter sur une scène existante : la réexporter.

## 0.1.21

- **Beaucoup plus rapide** (éditeur, export, scène), surtout avec un biome sur toute la carte :
  - **Sous-bois en variantes** : fougères, myrtilles, buissons, souches et champignons existent en quelques variantes par plante (graine et taille), dessinées une seule fois et réutilisées, tournées au hasard à l'affichage. Sur une forêt de 80 × 60 cases (≈ 1 100 plantes), il ne reste que ≈ 360 dessins à faire au lieu de 1 100 ; les arbres, eux, restent tous uniques.
  - **Export** : les plantes identiques sont dessinées une fois et partagent leurs images dans la scène (envoi plus léger).
  - **Plus de calculs en parallèle** : jusqu'à 7 workers selon le processeur (4 avant).
  - **Scène** : moins de morceaux par arbre (chêne et hêtre ≈ 20, bouleau ≈ 50, sapins un par étage) ; le sous-bois est d'un seul tenant (immobile, trop petit pour qu'un balancement se voie) ; les arbres trop petits à l'écran ne sont pas animés.
  - **Chargement des scènes** : les images des arbres tiennent dans un budget de 4 pages au plus (elles pouvaient en faire une trentaine avec une grande forêt, que chaque joueur devait charger et envoyer à sa carte graphique). Une grande forêt est donc envoyée un peu moins fine ; quand on zoome, les arbres à l'écran se redessinent plus fins comme avant. Les données de la scène sont aussi bien plus compactes (les plantes identiques partagent leur description).
  - **Herbe** : elle n'est plus trouée sous chaque arbre généré (ils sont dessinés par-dessus) ; éditeur et export bien plus rapides sur les cartes boisées.
  - Pour en profiter sur une carte existante : réappliquer son biome (outil Biome), puis réexporter.

## 0.1.20

- **Nouveau vent dans les arbres** : l'arbre n'est plus une image que le vent déforme (les feuilles s'étiraient et la couronne ondulait comme de la gelée). Il est découpé en morceaux rigides : le tronc et les grosses branches d'un côté, chaque branche avec ses rameaux et ses feuilles de l'autre. Chaque branche pivote autour de son point d'attache, comme du bois : rien n'est déformé, chaque feuille garde sa forme.
  - Une branche de travers au vent est poussée sous le vent ; une branche dans l'axe du vent bouge à peine.
  - Chaque branche a du poids : elle suit la rafale avec un peu de retard, la dépasse légèrement et revient, et balance à son propre rythme (lent pour les grosses, plus vif pour les petites).
  - Le sapin plie d'un bloc : ses étages glissent sous le vent, d'autant plus qu'ils sont hauts.
  - Toujours le même vent que l'herbe, à la même horloge ; toujours nets à tous les zooms. Les scènes déjà exportées gardent leurs arbres, immobiles, jusqu'à leur prochain export.
- **Correctif** : « Export impossible : Cannot read properties of null (reading 'map') ». L'export était bien fait (la scène était à jour), mais si la fenêtre de l'éditeur avait été fermée pendant l'export (qui peut être long avec beaucoup d'arbres), l'enregistrement du lien vers la scène échouait à la fin. Il est maintenant enregistré même fenêtre fermée, sans toucher au reste de la carte.

## 0.1.19

- **Outil Biome** (touche B) : on choisit un biome et on clique **Appliquer à toute la carte**. Son sol devient le fond de toute la carte (sous les sols peints) et sa végétation est semée partout où elle peut pousser, espacée naturellement : arbres, sous-bois, souches, champignons. Rien ne pousse dans l'eau, les pièces, les chemins, contre les murs ni sur les sols construits, les plages et la roche. Les petites plantes restent sous les arbres (dans l'éditeur comme dans la scène). Un curseur règle la densité.
  - Réappliquer le biome (après avoir tracé de l'eau, des chemins ou des pièces) ressème sa végétation ; changer de biome remplace ses plantes ; **Retirer** enlève le biome et ses plantes. Les plantes posées à la main restent toujours, et celles du biome restent des objets retouchables.
  - Glisser sur la carte peint aussi le biome sur une seule zone.
- **Forêt de feuillus** : sol de litière, chênes, hêtres et bouleaux, buissons, fougères, souches, champignons.
- **Forêt de conifères** : sol d'aiguilles et de mousse, sapins et épicéas, myrtilles, fougères, souches, champignons.
- **Nouvelles plantes** (aussi dans l'outil Arbres) : hêtre (couronne dense, écorce lisse et grise), épicéa (sombre, branches qui retombent), myrtilles (baies bleues), fougère (frondes en arceau), souche (cernes, mousse, racines ; immobile au vent), champignons (cèpes ou amanites ; immobiles).
- Aperçus des arbres dans l'éditeur plus rapides à calculer.
- **Nouveaux sols peints élément par élément**, à taille réelle :
  - **Litière de forêt** : terre humide, trois couches de feuilles mortes (chêne, hêtre, bouleau ; les plus anciennes brunies et rongées), clairières de terre nue, brindilles, écorce, glands, faînes, cailloux, tapis de mousse, pousses et anémones des bois.
  - **Aiguilles et mousse** : tapis d'aiguilles doux, coussins de mousse, pommes de pin et d'épicéa, brindilles, cailloux, lichens, pousses de myrtille.
  - Chaque sol est une grande tuile (8 × 8 cases) qui se raccorde sur ses bords, calculée en arrière-plan à la première utilisation ; en attendant, un motif simple s'affiche.

## 0.1.18

- **Arbres nets dans la scène** : ils étaient dessinés à la résolution de l'image de fond (100 px par case) et devenaient flous dès qu'on zoomait. Ils sont maintenant envoyés avec 2,5 fois cette finesse (250 px par case pour une grille de 100 px). La carte du vent, qui est lisse, est gardée à demi-résolution pour ne pas alourdir la scène.
- **Nets à tous les zooms, comme avec Vellum** : quand on zoome plus loin, les arbres à l'écran sont redessinés plus fins en arrière-plan (jusqu'à 560 px par case), à partir de leur graine, puis remplacés au vol ; l'arbre est le même, feuille pour feuille. En dézoomant, ils reprennent leur image d'origine. Seize arbres au plus sont gardés affinés à la fois.
- **Moitié moins de feuilles, même image** : les feuilles recouvertes par au moins deux épaisseurs d'autres feuilles (invisibles de dessus, même quand le vent bouge celles du dessus) ne sont plus dessinées. Chêne −46 %, bouleau −58 %, buisson −42 % ; moins de 0,2 % des pixels changent, à peine. Arbres calculés plus vite dans l'éditeur et à l'export.
- Les scènes exportées en 0.1.17 sont à réexporter.

## 0.1.17

- **Arbres générés** : chêne, bouleau, sapin et buisson sont maintenant calculés branche par branche et feuille par feuille, comme de vrais arbres vus de dessus.
  - Squelette en 3D : tronc et contreforts, charpentières tout autour, branches qui serpentent, s'affinent et se partagent l'épaisseur à chaque fourche, branches latérales le long des autres ; sapin en étages, avec rameaux sur trois niveaux.
  - Feuilles à leur taille réelle (chêne 11 cm, bouleau 6 cm, aiguille de pin 8 cm) et en quantité réelle (des dizaines de milliers par arbre), chacune accrochée à un rameau ; feuille de chêne lobée, de bouleau dentée, aiguilles en touffes.
  - Écorce selon l'essence (crevasses du chêne, bouleau blanc marqué de noir, plaques du pin), lumière en haut à gauche, ombre portée au sol.
  - Nouvelle essence : **bouleau**. Le palmier garde son ancien dessin. Les arbres déjà posés sur les cartes prennent le nouveau rendu.
- **Les arbres bougent avec le vent**, dans la scène : la couronne se couche un peu sous le vent et balance, chaque grosse branche à son rythme, les feuilles frémissent, et le sapin plie d'un bloc. C'est **le même vent que l'herbe**, à la même horloge : une rafale qui couche l'herbe passe dans l'arbre au même moment. Avec l'effet du vent coupé, les arbres restent visibles, immobiles.
- Dans l'éditeur, chaque arbre est calculé en arrière-plan ; sa silhouette s'affiche le temps du calcul.
- À l'export, les arbres ne sont plus dans l'image de fond (seule leur ombre y reste) : ils sont envoyés avec la scène en pages d'images, que les joueurs n'ont pas à recalculer. L'export affiche sa progression. Une scène exportée avant la 0.1.17 garde ses anciens arbres tant qu'elle n'est pas réexportée.

## 0.1.16

- **Îles** : le courant contourne enfin les îles (trous dans l'eau). Il s'écrase devant en blanchissant, se partage de chaque côté, file plus vite le long des flancs et reste plus lent à l'abri, derrière. Plus généralement, l'eau ne traverse plus une berge : contre une rive en travers du courant, elle glisse le long du bord.

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

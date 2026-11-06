/**
 * Cadastre — éditeur de cartes pour Foundry VTT.
 * Point d'entrée : bouton dans l'onglet Scènes, rafraîchissements, API publique.
 *
 * API (game.modules.get("cadastre").api) :
 *   openManager()          : ouvre la liste des cartes
 *   openMap(entryOrId)     : ouvre une carte (entrée de journal ou son id)
 *   openLibrary()          : ouvre la bibliothèque d'assets
 *   library.get()          : assets de la bibliothèque
 *   library.add(paths, o)  : ajoute des images (chemins dans les données de Foundry ; o : { kind, ppc })
 *   library.importFolder(path, o) : importe toutes les images d'un dossier (o : { kind, ppc, source })
 *   exportMap(map, opts)   : exporte des données de carte en scène (voir export.js)
 *   renderSVG(map, opts)   : rendu SVG d'une carte
 *   model                  : fonctions du modèle de carte (voir model.js)
 */
import { MODULE_ID } from "./constants.js";
import { CadastreEditorApp, CadastreManagerApp } from "./app.js";
import {
  registerLibrarySettings, CadastreLibraryApp, getLibrary, saveLibrary, assetsFromPaths, scanFolder
} from "./library-app.js";
import { mergeAssets } from "./library.js";
import { registerCurrents } from "./currents-layer.js";
import { isMapEntry } from "./storage.js";
import { exportMap } from "./export.js";
import { renderSVG } from "./render.js";
import * as model from "./model.js";

Hooks.once("init", () => {
  registerLibrarySettings();
  registerCurrents();
  game.modules.get(MODULE_ID).api = {
    openManager: () => CadastreManagerApp.open(),
    openLibrary: () => CadastreLibraryApp.open(),
    library: {
      get: getLibrary,
      add: async (paths, options = {}) => {
        const assets = await assetsFromPaths(paths, options);
        await saveLibrary(mergeAssets(getLibrary(), assets));
        return assets;
      },
      importFolder: async (path, { source = "data", ...options } = {}) => {
        const { files } = await scanFolder(source, path);
        const root = path.endsWith("/") ? path : `${path}/`;
        const assets = await assetsFromPaths(files, { ...options, root });
        await saveLibrary(mergeAssets(getLibrary(), assets));
        return assets;
      }
    },
    openMap: (entryOrId) => {
      const entry = typeof entryOrId === "string" ? game.journal.get(entryOrId) : entryOrId;
      return entry && isMapEntry(entry) ? CadastreEditorApp.open(entry) : null;
    },
    exportMap,
    renderSVG,
    model
  };
});

/** Bouton « Cadastre » en tête de l'onglet Scènes (MJ seulement). */
Hooks.on("renderSceneDirectory", (app, html) => {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector(".cadastre-open")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cadastre-open";
  button.innerHTML = `<i class="fa-solid fa-map-location-dot"></i> ${game.i18n.localize("CADASTRE.OpenButton")}`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    CadastreManagerApp.open();
  });
  const actions = root.querySelector(".header-actions") ?? root.querySelector(".directory-header") ?? root;
  actions.append(button);
});

// La liste suit les créations, renommages et suppressions de cartes.
for (const hook of ["createJournalEntry", "updateJournalEntry", "deleteJournalEntry", "updateScene", "deleteScene"]) {
  Hooks.on(hook, (doc) => {
    if (doc.documentName === "Scene" || isMapEntry(doc)) CadastreManagerApp.refresh();
  });
}

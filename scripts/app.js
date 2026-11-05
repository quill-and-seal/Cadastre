/**
 * Fenêtres Foundry : la liste des cartes et la fenêtre d'édition d'une carte.
 */
import { MODULE_ID, MAX_TEXTURE } from "./constants.js";
import { MapEditor } from "./editor.js";
import { createMap, cloneMap } from "./model.js";
import { listMapEntries, readMap, createMapEntry, saveMap } from "./storage.js";
import { exportMap } from "./export.js";
import { getLibrary, CadastreLibraryApp, LIBRARY_HOOK } from "./library-app.js";

const { ApplicationV2, DialogV2 } = foundry.applications.api;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = (s) => foundry.utils.escapeHTML?.(String(s)) ?? String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/* -------------------------------------------- */
/*  Fenêtre d'édition                           */
/* -------------------------------------------- */

export class CadastreEditorApp extends ApplicationV2 {
  /** Une seule fenêtre par carte. */
  static instances = new Map();

  static DEFAULT_OPTIONS = {
    classes: ["cadastre-editor"],
    window: { icon: "fa-solid fa-map-location-dot", resizable: true },
    position: { width: 1180, height: 780 }
  };

  static open(entry) {
    if (!game.user.isGM) return ui.notifications.warn(t("CADASTRE.GMOnly"));
    const existing = this.instances.get(entry.id);
    if (existing?.rendered) return existing.bringToFront();
    const app = new this(entry);
    this.instances.set(entry.id, app);
    return app.render({ force: true });
  }

  constructor(entry, options = {}) {
    super({ ...options, id: `cadastre-editor-${entry.id}` });
    this.entry = entry;
    this.editor = null;
    this.busy = false;
  }

  get title() {
    return `${t("CADASTRE.Title")} : ${this.entry.name}`;
  }

  async _renderHTML() {
    if (!this.editorRoot) this.editorRoot = document.createElement("div");
    return this.editorRoot;
  }

  _replaceHTML(result, content) {
    if (result.parentElement !== content) content.replaceChildren(result);
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    if (this.editor) return;
    this.editor = new MapEditor(this.editorRoot, readMap(this.entry), {
      t,
      onSave: (map) => this.save(map),
      onExport: (map) => this.export(map),
      onDirty: () => {},
      library: getLibrary(),
      onOpenLibrary: () => CadastreLibraryApp.open()
    });
    this._libraryHook = Hooks.on(LIBRARY_HOOK, (library) => this.editor?.setLibrary(library));
  }

  _refreshTitle() {
    const el = this.element?.querySelector(".window-title");
    if (el) el.textContent = this.title;
  }

  async save(map = this.editor.getMap()) {
    if (this.busy) return;
    this.busy = true;
    try {
      await saveMap(this.entry, map);
      this.editor.markSaved(map);
      this._refreshTitle();
      ui.notifications.info(t("CADASTRE.Editor.Saved"));
    } finally {
      this.busy = false;
    }
  }

  async export(map = this.editor.getMap()) {
    if (this.busy) return;
    const existing = map.sceneId ? game.scenes.get(map.sceneId) : null;
    let target = null;
    if (existing) {
      const choice = await DialogV2.wait({
        window: { title: t("CADASTRE.Export.Title"), icon: "fa-solid fa-map" },
        content: `<p>${t("CADASTRE.Export.Choice", { scene: esc(existing.name) })}</p>`,
        buttons: [
          { action: "update", label: t("CADASTRE.Export.Update"), icon: "fa-solid fa-arrows-rotate", default: true },
          { action: "new", label: t("CADASTRE.Export.New"), icon: "fa-solid fa-plus" },
          { action: "cancel", label: t("Cancel"), icon: "fa-solid fa-xmark" }
        ],
        rejectClose: false
      });
      if (!choice || choice === "cancel") return;
      if (choice === "update") target = existing;
    }

    this.busy = true;
    ui.notifications.info(t("CADASTRE.Export.Working"));
    try {
      const { scene, created, reduced, missing } = await exportMap(map, { scene: target, sourceId: this.entry.id });
      if (reduced) ui.notifications.warn(t("CADASTRE.Export.Reduced", { size: MAX_TEXTURE }));
      if (missing?.length) ui.notifications.warn(t("CADASTRE.Export.Missing", { list: missing.map(esc).join(", ") }), { permanent: true });
      // Le lien vers la scène est enregistré avec la carte (et les modifications en cours avec lui).
      this.editor.map.sceneId = scene.id;
      const saved = this.editor.getMap();
      await saveMap(this.entry, saved);
      this.editor.markSaved(saved);
      this._refreshTitle();
      ui.notifications.info(t(created ? "CADASTRE.Export.Created" : "CADASTRE.Export.Updated", { scene: scene.name }));
    } catch (error) {
      console.error(`${MODULE_ID} | Export impossible`, error);
      ui.notifications.error(t("CADASTRE.Export.Failed", { error: error.message }));
    } finally {
      this.busy = false;
    }
  }

  async close(options = {}) {
    if (this.editor?.dirty && !options.force) {
      const choice = await DialogV2.wait({
        window: { title: t("CADASTRE.Close.Title") },
        content: `<p>${t("CADASTRE.Close.Content")}</p>`,
        buttons: [
          { action: "save", label: t("CADASTRE.Close.Save"), icon: "fa-solid fa-floppy-disk", default: true },
          { action: "discard", label: t("CADASTRE.Close.Discard"), icon: "fa-solid fa-trash" },
          { action: "cancel", label: t("Cancel"), icon: "fa-solid fa-xmark" }
        ],
        rejectClose: false
      });
      if (!choice || choice === "cancel") return this;
      if (choice === "save") await this.save();
    }
    Hooks.off(LIBRARY_HOOK, this._libraryHook);
    this.editor?.destroy();
    this.editor = null;
    CadastreEditorApp.instances.delete(this.entry.id);
    return super.close(options);
  }
}

/* -------------------------------------------- */
/*  Liste des cartes                            */
/* -------------------------------------------- */

export class CadastreManagerApp extends ApplicationV2 {
  static instance = null;

  static DEFAULT_OPTIONS = {
    id: "cadastre-manager",
    classes: ["cadastre-manager"],
    window: { title: "CADASTRE.Manager.Title", icon: "fa-solid fa-map-location-dot", resizable: true },
    position: { width: 420, height: 480 },
    actions: {
      newMap: CadastreManagerApp.#onNew,
      openMap: CadastreManagerApp.#onOpen,
      duplicateMap: CadastreManagerApp.#onDuplicate,
      deleteMap: CadastreManagerApp.#onDelete,
      openLibrary: () => CadastreLibraryApp.open()
    }
  };

  static open() {
    if (!game.user.isGM) return ui.notifications.warn(t("CADASTRE.GMOnly"));
    this.instance ??= new this();
    return this.instance.render({ force: true });
  }

  /** Rafraîchit la liste si elle est ouverte. */
  static refresh() {
    if (this.instance?.rendered) this.instance.render();
  }

  async _renderHTML() {
    const entries = listMapEntries();
    const items = entries.map((entry) => {
      const map = readMap(entry);
      const scene = map.sceneId ? game.scenes.get(map.sceneId) : null;
      const meta = [t("CADASTRE.Manager.Size", { width: map.width, height: map.height })];
      if (scene) meta.push(t("CADASTRE.Manager.Linked", { scene: esc(scene.name) }));
      return `<li class="cad-item" data-entry-id="${entry.id}">
        <div class="cad-item-main" data-action="openMap">
          <div class="cad-item-name">${esc(entry.name)}</div>
          <div class="cad-item-meta">${meta.join(" · ")}</div>
        </div>
        <button type="button" data-action="openMap" title="${esc(t("CADASTRE.Manager.Open"))}"><i class="fa-solid fa-pen-ruler"></i></button>
        <button type="button" data-action="duplicateMap" title="${esc(t("CADASTRE.Manager.Duplicate"))}"><i class="fa-solid fa-copy"></i></button>
        <button type="button" data-action="deleteMap" title="${esc(t("CADASTRE.Manager.Delete"))}"><i class="fa-solid fa-trash"></i></button>
      </li>`;
    }).join("");

    const root = document.createElement("div");
    root.className = "cad-manager-body";
    root.style.display = "contents";
    root.innerHTML = `
      <div class="cad-manager-bar">
        <button type="button" data-action="newMap"><i class="fa-solid fa-plus"></i> ${esc(t("CADASTRE.Manager.New"))}</button>
        <button type="button" data-action="openLibrary"><i class="fa-solid fa-book-atlas"></i> ${esc(t("CADASTRE.Panel.Library"))}</button>
      </div>
      ${items ? `<ul class="cad-list">${items}</ul>` : `<p class="cad-empty">${esc(t("CADASTRE.Manager.Empty"))}</p>`}`;
    return root;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  static #entryOf(target) {
    return game.journal.get(target.closest("[data-entry-id]")?.dataset.entryId);
  }

  static async #onNew() {
    const entry = await createMapEntry(createMap({ name: t("CADASTRE.Manager.Untitled") }));
    if (entry) CadastreEditorApp.open(entry);
  }

  static #onOpen(event, target) {
    const entry = CadastreManagerApp.#entryOf(target);
    if (entry) CadastreEditorApp.open(entry);
  }

  static async #onDuplicate(event, target) {
    const entry = CadastreManagerApp.#entryOf(target);
    if (!entry) return;
    const map = cloneMap(readMap(entry));
    map.name = t("CADASTRE.Manager.CopyOf", { name: entry.name });
    map.sceneId = null;
    await createMapEntry(map);
  }

  static async #onDelete(event, target) {
    const entry = CadastreManagerApp.#entryOf(target);
    if (!entry) return;
    const ok = await DialogV2.confirm({
      window: { title: t("CADASTRE.Manager.DeleteTitle") },
      content: `<p>${t("CADASTRE.Manager.DeleteConfirm", { name: esc(entry.name) })}</p>`
    });
    if (!ok) return;
    await CadastreEditorApp.instances.get(entry.id)?.close({ force: true });
    await entry.delete();
  }
}

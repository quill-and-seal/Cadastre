/**
 * Bibliothèque d'assets dans Foundry : stockage (réglage du monde), import de fichiers,
 * de dossiers entiers et de téléversements, et la fenêtre de gestion.
 */
import { MODULE_ID, log } from "./constants.js";
import {
  normalizeLibrary, normalizeAsset, mergeAssets, assetFromFile, filterAssets, allTags,
  isImagePath, normalizeTags, IMAGE_EXTENSIONS, DEFAULT_ASSET_PPC, ASSET_KINDS, MIN_ASSET_CELLS, MAX_ASSET_CELLS
} from "./library.js";
import { defaultResolve } from "./render.js";

const { ApplicationV2, DialogV2 } = foundry.applications.api;
const FilePickerCls = () => foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;

export const LIBRARY_HOOK = "cadastreLibraryChanged";

/** Limites de lecture d'un dossier : au-delà, l'import s'arrête (et le dit). */
const SCAN_MAX_FILES = 5000;
const SCAN_MAX_DEPTH = 8;
const MEASURE_PARALLEL = 8;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* -------------------------------------------- */
/*  Stockage                                    */
/* -------------------------------------------- */

export function registerLibrarySettings() {
  game.settings.register(MODULE_ID, "library", {
    scope: "world",
    config: false,
    type: Array,
    default: [],
    onChange: () => Hooks.callAll(LIBRARY_HOOK, getLibrary())
  });
  game.settings.registerMenu(MODULE_ID, "libraryMenu", {
    name: "CADASTRE.Library.MenuName",
    label: "CADASTRE.Library.MenuLabel",
    hint: "CADASTRE.Library.MenuHint",
    icon: "fa-solid fa-book-atlas",
    type: LibraryMenu,
    restricted: true
  });
}

/** Entrée des réglages : Foundry appelle render(). */
class LibraryMenu {
  render() {
    CadastreLibraryApp.open();
    return this;
  }
}

export function getLibrary() {
  try {
    return normalizeLibrary(game.settings.get(MODULE_ID, "library"));
  } catch {
    return [];
  }
}

export function saveLibrary(list) {
  return game.settings.set(MODULE_ID, "library", normalizeLibrary(list));
}

/* -------------------------------------------- */
/*  Import                                      */
/* -------------------------------------------- */

/** Taille en pixels d'une image (0 × 0 si elle ne se charge pas, ou pour un SVG sans taille). */
export function measureImage(url, timeout = 8000) {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (w, h) => { clearTimeout(timer); resolve({ width: w, height: h }); };
    const timer = setTimeout(() => done(0, 0), timeout);
    img.onload = () => done(img.naturalWidth, img.naturalHeight);
    img.onerror = () => done(0, 0);
    img.src = url;
  });
}

/** Assets à partir de chemins d'images : chaque image est mesurée pour en déduire sa taille en cases. */
export async function assetsFromPaths(paths, { ppc = DEFAULT_ASSET_PPC, kind = null, root = "" } = {}) {
  const out = [];
  const queue = paths.filter(isImagePath);
  async function worker() {
    while (queue.length) {
      const src = queue.shift();
      const size = await measureImage(defaultResolve(src));
      const asset = assetFromFile(src, { ...size, ppc, kind, root });
      if (asset) out.push(asset);
    }
  }
  await Promise.all(Array.from({ length: MEASURE_PARALLEL }, worker));
  return out.sort((a, b) => a.src.localeCompare(b.src));
}

/** Toutes les images d'un dossier et de ses sous-dossiers. */
export async function scanFolder(source, target, options = {}) {
  const FP = FilePickerCls();
  const extensions = IMAGE_EXTENSIONS.map((e) => `.${e}`);
  const files = [];
  let truncated = false;
  async function walk(dir, depth) {
    if (files.length >= SCAN_MAX_FILES) { truncated = true; return; }
    let res;
    try {
      res = await FP.browse(source, dir, { extensions, ...options });
    } catch (error) {
      log("Dossier illisible", dir, error);
      return;
    }
    for (const f of res.files ?? []) {
      if (files.length >= SCAN_MAX_FILES) { truncated = true; break; }
      if (isImagePath(f)) files.push(f);
    }
    if (depth < SCAN_MAX_DEPTH) for (const d of res.dirs ?? []) await walk(d, depth + 1);
  }
  await walk(target, 0);
  return { files, truncated };
}

/** Envoie des fichiers de l'ordinateur dans worlds/<monde>/cadastre/assets/. */
export async function uploadFiles(fileList) {
  const FP = FilePickerCls();
  const base = `worlds/${game.world.id}/${MODULE_ID}`;
  const dir = `${base}/assets`;
  for (const d of [base, dir]) {
    try { await FP.createDirectory("data", d); } catch { /* existe déjà */ }
  }
  const paths = [];
  for (const file of fileList) {
    if (!isImagePath(file.name)) continue;
    const res = await FP.upload("data", dir, file, {}, { notify: false });
    if (res && res.status !== "error") paths.push(res.path ?? `${dir}/${file.name}`);
  }
  return paths;
}

/** Fenêtre de réglage de l'import : type et pixels par case. */
async function askImportOptions(from) {
  const content = `
    <p>${t("CADASTRE.Library.ImportFrom", { path: esc(from) })}</p>
    <div class="form-group"><label>${esc(t("CADASTRE.Library.Kind"))}</label>
      <select name="kind">
        <option value="">${esc(t("CADASTRE.Library.KindAuto"))}</option>
        ${ASSET_KINDS.map((k) => `<option value="${k}">${esc(t(`CADASTRE.Library.Kinds.${k}`))}</option>`).join("")}
      </select></div>
    <div class="form-group"><label>${esc(t("CADASTRE.Library.Ppc"))}</label>
      <input type="number" name="ppc" value="${DEFAULT_ASSET_PPC}" min="10" max="2000" step="10"></div>
    <p class="hint">${esc(t("CADASTRE.Library.PpcHint"))}</p>`;
  return DialogV2.prompt({
    window: { title: t("CADASTRE.Library.ImportTitle"), icon: "fa-solid fa-file-import" },
    content,
    ok: {
      label: t("CADASTRE.Library.ImportTitle"),
      callback: (event, button) => {
        const form = button.form;
        return { kind: form.elements.kind.value || null, ppc: Math.max(10, Number(form.elements.ppc.value) || DEFAULT_ASSET_PPC) };
      }
    },
    rejectClose: false
  });
}

async function addAssets(assets) {
  if (!assets.length) {
    ui.notifications.warn(t("CADASTRE.Library.NothingFound"));
    return 0;
  }
  await saveLibrary(mergeAssets(getLibrary(), assets));
  ui.notifications.info(t("CADASTRE.Library.Imported", { n: assets.length }));
  return assets.length;
}

/* -------------------------------------------- */
/*  Fenêtre                                     */
/* -------------------------------------------- */

export class CadastreLibraryApp extends ApplicationV2 {
  static instance = null;

  static DEFAULT_OPTIONS = {
    id: "cadastre-library",
    classes: ["cadastre-library"],
    window: { title: "CADASTRE.Library.Title", icon: "fa-solid fa-book-atlas", resizable: true },
    position: { width: 760, height: 640 },
    actions: {
      addFile: CadastreLibraryApp.#onAddFile,
      addFolder: CadastreLibraryApp.#onAddFolder,
      upload: CadastreLibraryApp.#onUpload,
      exportJson: CadastreLibraryApp.#onExportJson,
      importJson: CadastreLibraryApp.#onImportJson,
      pick: CadastreLibraryApp.#onPick,
      saveAsset: CadastreLibraryApp.#onSaveAsset,
      deleteAsset: CadastreLibraryApp.#onDeleteAsset,
      closeEdit: CadastreLibraryApp.#onCloseEdit
    }
  };

  static open() {
    if (!game.user.isGM) return ui.notifications.warn(t("CADASTRE.GMOnly"));
    this.instance ??= new this();
    return this.instance.render({ force: true });
  }

  constructor(options = {}) {
    super(options);
    this.filters = { query: "", kind: "", tag: "" };
    this.editing = null;
    this._hook = Hooks.on(LIBRARY_HOOK, () => this.rendered && this.render());
  }

  async _renderHTML() {
    const library = getLibrary();
    const { query, kind, tag } = this.filters;
    const shown = filterAssets(library, { query, kind: kind || null, tag: tag || null });
    if (this.editing && !library.some((a) => a.id === this.editing)) this.editing = null;
    const tags = allTags(library);

    const root = document.createElement("div");
    root.className = "cad-libapp";
    root.innerHTML = `
      <div class="cad-libapp-bar">
        <button type="button" data-action="addFile" title="${esc(t("CADASTRE.Library.AddFileHint"))}"><i class="fa-solid fa-file-image"></i> ${esc(t("CADASTRE.Library.AddFile"))}</button>
        <button type="button" data-action="addFolder" title="${esc(t("CADASTRE.Library.AddFolderHint"))}"><i class="fa-solid fa-folder-tree"></i> ${esc(t("CADASTRE.Library.AddFolder"))}</button>
        <button type="button" data-action="upload" title="${esc(t("CADASTRE.Library.UploadHint"))}"><i class="fa-solid fa-upload"></i> ${esc(t("CADASTRE.Library.Upload"))}</button>
        <span style="flex:1"></span>
        <button type="button" data-action="importJson" title="${esc(t("CADASTRE.Library.ImportJson"))}"><i class="fa-solid fa-file-import"></i></button>
        <button type="button" data-action="exportJson" title="${esc(t("CADASTRE.Library.ExportJson"))}"><i class="fa-solid fa-file-export"></i></button>
      </div>
      <div class="cad-libapp-bar">
        <input type="search" name="query" placeholder="${esc(t("CADASTRE.Library.Search"))}" value="${esc(query)}">
        <select name="kind">
          <option value="">${esc(t("CADASTRE.Library.AllKinds"))}</option>
          ${ASSET_KINDS.map((k) => `<option value="${k}" ${k === kind ? "selected" : ""}>${esc(t(`CADASTRE.Library.Kinds.${k}`))}</option>`).join("")}
        </select>
        <select name="tag">
          <option value="">${esc(t("CADASTRE.Library.AllTags"))}</option>
          ${tags.map((g) => `<option value="${esc(g)}" ${g === tag ? "selected" : ""}>${esc(g)}</option>`).join("")}
        </select>
        <span class="cad-libapp-count">${esc(t("CADASTRE.Library.Count", { shown: shown.length, total: library.length }))}</span>
      </div>
      ${this.editing ? this.#editForm(library.find((a) => a.id === this.editing)) : ""}
      ${library.length
        ? `<div class="cad-libapp-grid">${shown.map((a) => this.#card(a)).join("")}</div>`
        : `<p class="cad-empty">${esc(t("CADASTRE.Library.Empty"))}</p>`}
      <input type="file" name="uploadFiles" accept="${IMAGE_EXTENSIONS.map((e) => `.${e}`).join(",")}" multiple hidden>
      <input type="file" name="importFile" accept=".json,application/json" hidden>`;
    return root;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const el = this.element;
    const search = el.querySelector('input[name="query"]');
    search?.addEventListener("input", foundry.utils.debounce(() => {
      this.filters.query = search.value;
      this.render().then(() => {
        const input = this.element.querySelector('input[name="query"]');
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      });
    }, 200));
    for (const name of ["kind", "tag"]) {
      el.querySelector(`select[name="${name}"]`)?.addEventListener("change", (e) => {
        this.filters[name] = e.target.value;
        this.render();
      });
    }
    el.querySelector("form.cad-libapp-edit")?.addEventListener("submit", (e) => e.preventDefault());
    el.querySelector('input[name="uploadFiles"]')?.addEventListener("change", (e) => this.#upload(e.target.files));
    el.querySelector('input[name="importFile"]')?.addEventListener("change", (e) => this.#importJson(e.target.files[0]));
  }

  async close(options) {
    Hooks.off(LIBRARY_HOOK, this._hook);
    CadastreLibraryApp.instance = null;
    return super.close(options);
  }

  #card(a) {
    const meta = `${t(`CADASTRE.Library.Kinds.${a.kind}`)} · ${a.w} × ${a.h}`;
    return `<div class="cad-asset ${a.id === this.editing ? "active" : ""}" data-action="pick" data-id="${a.id}" title="${esc(a.src)}">
      <span class="cad-thumb${a.kind === "texture" ? " tile" : ""}" style="background-image:url(&quot;${esc(defaultResolve(a.src))}&quot;)"></span>
      <span class="cad-asset-name">${esc(a.name)}</span>
      <span class="cad-asset-meta">${esc(meta)}</span>
    </div>`;
  }

  #editForm(a) {
    if (!a) return "";
    return `<form class="cad-libapp-edit" data-id="${a.id}">
      <span class="cad-thumb${a.kind === "texture" ? " tile" : ""}" style="background-image:url(&quot;${esc(defaultResolve(a.src))}&quot;)"></span>
      <div class="cad-fields">
        <label>${esc(t("CADASTRE.Library.Name"))}<input type="text" name="name" value="${esc(a.name)}"></label>
        <label>${esc(t("CADASTRE.Library.Kind"))}<select name="kind">${ASSET_KINDS.map((k) =>
          `<option value="${k}" ${k === a.kind ? "selected" : ""}>${esc(t(`CADASTRE.Library.Kinds.${k}`))}</option>`).join("")}</select></label>
        <label>${esc(t("CADASTRE.Library.Width"))}<input type="number" name="w" value="${a.w}" min="${MIN_ASSET_CELLS}" max="${MAX_ASSET_CELLS}" step="0.1"></label>
        <label>${esc(t("CADASTRE.Library.Height"))}<input type="number" name="h" value="${a.h}" min="${MIN_ASSET_CELLS}" max="${MAX_ASSET_CELLS}" step="0.1"></label>
      </div>
      <label>${esc(t("CADASTRE.Library.Tags"))}<input type="text" name="tags" value="${esc(a.tags.join(", "))}"></label>
      <label class="checkbox"><input type="checkbox" name="soft" ${a.soft ? "checked" : ""}> ${esc(t("CADASTRE.Library.Soft"))}</label>
      <span class="cad-src">${esc(a.src)}</span>
      <div class="cad-edit-actions">
        <button type="button" data-action="deleteAsset" title="${esc(t("CADASTRE.Library.DeleteHint"))}"><i class="fa-solid fa-trash"></i> ${esc(t("CADASTRE.Library.Delete"))}</button>
        <button type="button" data-action="closeEdit"><i class="fa-solid fa-xmark"></i></button>
        <button type="button" data-action="saveAsset"><i class="fa-solid fa-floppy-disk"></i> ${esc(t("CADASTRE.Library.Save"))}</button>
      </div>
    </form>`;
  }

  async #upload(files) {
    if (!files?.length) return;
    ui.notifications.info(t("CADASTRE.Library.Uploading", { n: files.length }));
    try {
      const paths = await uploadFiles([...files]);
      if (!paths.length) return ui.notifications.warn(t("CADASTRE.Library.NothingFound"));
      const opts = await askImportOptions(t("CADASTRE.Library.Upload"));
      if (!opts) return;
      await addAssets(await assetsFromPaths(paths, opts));
    } catch (error) {
      console.error(`${MODULE_ID} | Envoi impossible`, error);
      ui.notifications.error(error.message);
    }
  }

  async #importJson(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const list = normalizeLibrary(Array.isArray(data) ? data : data?.assets);
      await addAssets(list);
    } catch (error) {
      log("Liste illisible", error);
      ui.notifications.error(t("CADASTRE.Library.BadJson"));
    }
  }

  static #onAddFile() {
    const FP = FilePickerCls();
    new FP({
      type: "image",
      callback: async (path) => {
        const opts = await askImportOptions(path);
        if (opts) await addAssets(await assetsFromPaths([path], opts));
      }
    }).render(true);
  }

  static #onAddFolder() {
    const FP = FilePickerCls();
    new FP({
      type: "folder",
      callback: async (path, picker) => {
        const opts = await askImportOptions(path);
        if (!opts) return;
        ui.notifications.info(t("CADASTRE.Library.Scanning"));
        const source = picker?.activeSource ?? "data";
        const { files, truncated } = await scanFolder(source, path, picker?.sources?.[source]?.bucket ? { bucket: picker.sources[source].bucket } : {});
        if (truncated) ui.notifications.warn(t("CADASTRE.Library.Truncated", { n: files.length }));
        const root = path.endsWith("/") ? path : `${path}/`;
        await addAssets(await assetsFromPaths(files, { ...opts, root }));
      }
    }).render(true);
  }

  static #onUpload() {
    this.element.querySelector('input[name="uploadFiles"]')?.click();
  }

  static #onImportJson() {
    this.element.querySelector('input[name="importFile"]')?.click();
  }

  static #onExportJson() {
    const data = JSON.stringify({ module: MODULE_ID, assets: getLibrary() }, null, 2);
    const save = foundry.utils.saveDataToFile ?? globalThis.saveDataToFile;
    save(data, "application/json", `cadastre-bibliotheque-${game.world.id}.json`);
  }

  static #onPick(event, target) {
    this.editing = target.dataset.id === this.editing ? null : target.dataset.id;
    this.render();
  }

  static #onCloseEdit() {
    this.editing = null;
    this.render();
  }

  static async #onSaveAsset(event, target) {
    const form = target.closest("form");
    const library = getLibrary();
    const current = library.find((a) => a.id === form?.dataset.id);
    if (!current) return;
    const f = form.elements;
    const next = normalizeAsset({
      ...current,
      name: f.name.value,
      kind: f.kind.value,
      w: Number(f.w.value),
      h: Number(f.h.value),
      tags: normalizeTags(f.tags.value),
      soft: f.soft.checked
    });
    if (next) await saveLibrary(library.map((a) => (a.id === next.id ? next : a)));
  }

  static async #onDeleteAsset(event, target) {
    const id = target.closest("form")?.dataset.id;
    this.editing = null;
    await saveLibrary(getLibrary().filter((a) => a.id !== id));
  }
}

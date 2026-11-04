/**
 * Éditeur de carte : interface DOM autonome, sans dépendance à Foundry.
 * La fenêtre Foundry (app.js) l'héberge ; le banc d'essai (tools/editor-lab.html) aussi.
 */
import { TERRAINS, PROPS, PROP_BY_ID } from "./catalog.js";
import * as M from "./model.js";
import { pickCell, pickVertex, pickEdge } from "./geometry.js";
import { renderDefs, renderFloor, renderProps, renderWalls, renderGrid } from "./render.js";
import { HISTORY_LIMIT, MIN_CELLS, MAX_CELLS, MIN_GRID_SIZE, MAX_GRID_SIZE } from "./constants.js";

export const TOOLS = [
  { id: "brush", icon: "fa-paintbrush" },
  { id: "fill", icon: "fa-fill-drip" },
  { id: "room", icon: "fa-vector-square" },
  { id: "wall", icon: "fa-pen-ruler" },
  { id: "door", icon: "fa-door-open" },
  { id: "prop", icon: "fa-chair" },
  { id: "eraser", icon: "fa-eraser" }
];
const BRUSH_SIZES = [1, 2, 3, 5];
const ERASE_MODES = ["all", "floor", "walls", "props"];
const MIN_SCALE = 4, MAX_SCALE = 220;
const SVG_NS = "http://www.w3.org/2000/svg";

let instances = 0;

const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Cases traversées entre deux cases (pas de trous quand la souris va vite). */
function cellsBetween([ax, ay], [bx, by]) {
  const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
  const out = [];
  for (let i = 1; i <= n; i++) out.push([Math.round(ax + ((bx - ax) * i) / n), Math.round(ay + ((by - ay) * i) / n)]);
  return out;
}

export class MapEditor {
  /**
   * @param {HTMLElement} root
   * @param {object} map
   * @param {{t?:(key:string, data?:object)=>string, onSave?:(map)=>any, onExport?:(map)=>any, onDirty?:(dirty:boolean)=>void}} [options]
   */
  constructor(root, map, { t = (k) => k, onSave = null, onExport = null, onDirty = null } = {}) {
    this.root = root;
    this.map = M.normalizeMap(map);
    this.t = t;
    this.onSave = onSave;
    this.onExport = onExport;
    this.onDirty = onDirty;
    this.prefix = `cad${++instances}`;

    this.tool = "room";
    this.terrain = "stone";
    this.brushSize = 1;
    this.eraseMode = "all";
    this.propType = PROPS[0].id;
    this.propRot = 0;
    this.showGrid = true;

    this.undoStack = [];
    this.redoStack = [];
    this.dirty = false;
    this.view = { s: 32, tx: 0, ty: 0 };
    this.pointer = null;      // dernière position en cases
    this.drag = null;         // geste en cours
    this.spaceHeld = false;

    this._build();
    this.renderMap(true);
    this._renderPanel();
    this._syncMapFields();
    this._applyView();
    requestAnimationFrame(() => this.fit());
  }

  /* -------------------------------------------- */
  /*  Construction                                */
  /* -------------------------------------------- */

  _build() {
    const t = this.t;
    const btn = (action, icon, title, label = "") =>
      `<button type="button" data-action="${action}" title="${escapeHTML(title)}"><i class="fa-solid ${icon}"></i>${label ? `<span>${escapeHTML(label)}</span>` : ""}</button>`;

    this.root.classList.add("cad-editor");
    this.root.tabIndex = 0;
    this.root.innerHTML = `
      <header class="cad-topbar">
        ${btn("undo", "fa-rotate-left", t("CADASTRE.Editor.Undo"))}
        ${btn("redo", "fa-rotate-right", t("CADASTRE.Editor.Redo"))}
        <span class="cad-sep"></span>
        ${btn("grid", "fa-border-all", t("CADASTRE.Editor.Grid"))}
        ${btn("fit", "fa-expand", t("CADASTRE.Editor.Fit"))}
        <span class="cad-dirty" hidden>${escapeHTML(t("CADASTRE.Editor.Unsaved"))}</span>
        <span class="cad-spacer"></span>
        ${this.onSave ? btn("save", "fa-floppy-disk", t("CADASTRE.Editor.SaveHint"), t("CADASTRE.Editor.Save")) : ""}
        ${this.onExport ? btn("export", "fa-map", t("CADASTRE.Editor.Export"), t("CADASTRE.Editor.Export")) : ""}
      </header>
      <div class="cad-body">
        <nav class="cad-tools">
          ${TOOLS.map((tool) => `<button type="button" data-tool="${tool.id}" title="${escapeHTML(t(`CADASTRE.Tools.${tool.id}`))}"><i class="fa-solid ${tool.icon}"></i></button>`).join("")}
        </nav>
        <div class="cad-viewport">
          <svg class="cad-svg" xmlns="${SVG_NS}">
            <g class="cad-defs"></g>
            <g class="cad-world">
              <g class="cad-map"></g>
              <g class="cad-grid"></g>
              <rect class="cad-border" fill="none"></rect>
              <g class="cad-overlay"></g>
            </g>
          </svg>
        </div>
        <aside class="cad-panel">
          <section class="cad-tool-options"></section>
          <section class="cad-map-options">
            <h3>${escapeHTML(t("CADASTRE.Panel.Map"))}</h3>
            <label>${escapeHTML(t("CADASTRE.Panel.Name"))}<input type="text" name="name"></label>
            <div class="cad-row">
              <label>${escapeHTML(t("CADASTRE.Panel.Cols"))}<input type="number" name="cols" min="${MIN_CELLS}" max="${MAX_CELLS}"></label>
              <label>${escapeHTML(t("CADASTRE.Panel.Rows"))}<input type="number" name="rows" min="${MIN_CELLS}" max="${MAX_CELLS}"></label>
            </div>
            <div class="cad-row">
              <label>${escapeHTML(t("CADASTRE.Panel.GridSize"))}<input type="number" name="gridSize" min="${MIN_GRID_SIZE}" max="${MAX_GRID_SIZE}" step="10"></label>
              <label>${escapeHTML(t("CADASTRE.Panel.Background"))}<input type="color" name="background"></label>
            </div>
            <button type="button" data-action="apply-size" title="${escapeHTML(t("CADASTRE.Panel.ApplyHint"))}">${escapeHTML(t("CADASTRE.Panel.Apply"))}</button>
          </section>
        </aside>
      </div>
      <footer class="cad-status"><span class="cad-coords"></span><span class="cad-hint"></span></footer>`;

    const $ = (sel) => this.root.querySelector(sel);
    this.el = {
      viewport: $(".cad-viewport"), svg: $(".cad-svg"), defs: $(".cad-defs"), world: $(".cad-world"),
      map: $(".cad-map"), grid: $(".cad-grid"), border: $(".cad-border"), overlay: $(".cad-overlay"),
      toolOptions: $(".cad-tool-options"), mapOptions: $(".cad-map-options"),
      coords: $(".cad-coords"), hint: $(".cad-hint"), dirty: $(".cad-dirty")
    };

    this._listeners = [];
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      this._listeners.push([target, type, fn, opts]);
    };
    on(this.root, "click", (e) => this._onClick(e));
    on(this.root, "keydown", (e) => this._onKeyDown(e));
    on(this.root, "keyup", (e) => this._onKeyUp(e));
    on(this.el.viewport, "pointerdown", (e) => this._onPointerDown(e));
    on(this.el.viewport, "pointermove", (e) => this._onPointerMove(e));
    on(this.el.viewport, "pointerup", (e) => this._onPointerUp(e));
    on(this.el.viewport, "pointercancel", () => this._cancelDrag());
    on(this.el.viewport, "pointerleave", () => { this.pointer = null; this._renderOverlay(); });
    on(this.el.viewport, "wheel", (e) => this._onWheel(e), { passive: false });
    on(this.el.viewport, "contextmenu", (e) => e.preventDefault());
    on(this.el.mapOptions, "change", (e) => this._onMapField(e));
    on(window, "blur", () => { this.spaceHeld = false; });

    this._setTool(this.tool);
    this._updateTopbar();
  }

  destroy() {
    for (const [target, type, fn, opts] of this._listeners) target.removeEventListener(type, fn, opts);
    this._listeners = [];
  }

  /* -------------------------------------------- */
  /*  Rendu                                       */
  /* -------------------------------------------- */

  /** Redessine la carte ; `full` refait aussi les motifs (taille de carte changée). */
  renderMap(full = false) {
    const { map, prefix } = this;
    if (full) {
      this.el.defs.innerHTML = renderDefs(map, prefix);
      this.el.border.setAttribute("width", map.cols);
      this.el.border.setAttribute("height", map.rows);
      this.el.grid.innerHTML = renderGrid(map, 0.14);
    }
    this.el.map.innerHTML = `<rect width="${map.cols}" height="${map.rows}" fill="${map.background}"/>`
      + renderFloor(map, prefix) + renderProps(map, prefix) + renderWalls(map, "editor", prefix);
    this.el.grid.style.display = this.showGrid ? "" : "none";
    this._renderOverlay();
  }

  _applyView() {
    const { s, tx, ty } = this.view;
    this.el.world.setAttribute("transform", `translate(${tx} ${ty}) scale(${s})`);
    this.el.border.setAttribute("stroke-width", String(1.5 / s));
  }

  fit() {
    const r = this.el.viewport.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min((r.width - 32) / this.map.cols, (r.height - 32) / this.map.rows)));
    this.view = { s, tx: (r.width - this.map.cols * s) / 2, ty: (r.height - this.map.rows * s) / 2 };
    this._applyView();
  }

  /** Repères : survol, aperçu du geste en cours. */
  _renderOverlay() {
    const px = 1 / this.view.s;
    const p = this.pointer;
    let out = "";
    const rect = (x, y, w, h, cls) => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" stroke-width="${2 * px}"/>`;
    const line = (a, b, cls, w = 4) => `<path class="${cls}" d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" stroke-width="${w * px}"/>`;
    const edgeLine = (e, cls) => line(...M.edgeEnds(e), cls, 6);

    const drag = this.drag;
    if (drag?.kind === "room" && drag.end) {
      const r = M.normRect(drag.start, drag.end);
      out += `<rect x="${r.x0}" y="${r.y0}" width="${r.x1 - r.x0 + 1}" height="${r.y1 - r.y0 + 1}" fill="url(#${this.prefix}-t-${this.terrain})" fill-opacity="0.55"/>`;
      out += rect(r.x0, r.y0, r.x1 - r.x0 + 1, r.y1 - r.y0 + 1, "cad-hl");
      out += `<text class="cad-label" x="${r.x0}" y="${r.y0 - 6 * px}" font-size="${13 * px}">${r.x1 - r.x0 + 1} × ${r.y1 - r.y0 + 1}</text>`;
    } else if (drag?.kind === "wall" && drag.end) {
      const end = M.lineEnd(drag.start, drag.end);
      out += line(drag.start, end, drag.erase ? "cad-hl-erase" : "cad-hl-wall", 6);
      out += `<circle class="cad-hl-dot" cx="${drag.start[0]}" cy="${drag.start[1]}" r="${5 * px}"/>`;
      out += `<circle class="cad-hl-dot" cx="${end[0]}" cy="${end[1]}" r="${5 * px}"/>`;
    } else if (p) {
      const [cx, cy] = pickCell(p[0], p[1]);
      switch (this.tool) {
        case "brush":
          for (const [x, y] of M.brushCells(this.map, cx, cy, this.brushSize)) out += rect(x, y, 1, 1, "cad-hl");
          break;
        case "eraser": {
          const edge = this._eraserEdge(p);
          if (edge) out += edgeLine(edge, "cad-hl-erase");
          else for (const [x, y] of M.brushCells(this.map, cx, cy, this.brushSize)) out += rect(x, y, 1, 1, "cad-hl-erase-cell");
          break;
        }
        case "fill":
        case "room":
          if (M.inBounds(this.map, cx, cy)) out += rect(cx, cy, 1, 1, "cad-hl");
          break;
        case "wall": {
          const [vx, vy] = pickVertex(p[0], p[1]);
          out += `<circle class="cad-hl-dot" cx="${vx}" cy="${vy}" r="${5 * px}"/>`;
          break;
        }
        case "door": {
          const e = pickEdge(p[0], p[1], 0.45);
          if (e && M.edgeInBounds(this.map, e.o, e.x, e.y)) out += edgeLine(e, "cad-hl-door");
          break;
        }
        case "prop": {
          const [x, y] = this._propAnchor(p);
          const def = PROP_BY_ID.get(this.propType);
          const fp = M.propFootprint(this.propType, this.propRot);
          if (def && fp) {
            const ok = M.propFits(this.map, this.propType, x, y, this.propRot);
            out += `<g opacity="0.7" transform="translate(${x + fp.w / 2} ${y + fp.h / 2}) rotate(${this.propRot * 90}) translate(${-def.w / 2} ${-def.h / 2})">${def.svg}</g>`;
            out += rect(x, y, fp.w, fp.h, ok ? "cad-hl" : "cad-hl-erase-cell");
          }
          break;
        }
      }
    }
    this.el.overlay.innerHTML = out;
  }

  /* -------------------------------------------- */
  /*  Panneau et barre                            */
  /* -------------------------------------------- */

  _setTool(tool) {
    if (!TOOLS.some((x) => x.id === tool)) return;
    this.tool = tool;
    for (const b of this.root.querySelectorAll("[data-tool]")) b.classList.toggle("active", b.dataset.tool === tool);
    this.el.hint.textContent = `${this.t(`CADASTRE.Hints.${tool}`)} ${this.t("CADASTRE.Hints.pan")}`;
    this.el.viewport.dataset.tool = tool;
    this._renderPanel();
    this._renderOverlay();
  }

  _renderPanel() {
    if (!this.el) return;
    const t = this.t;
    const title = (key) => `<h3>${escapeHTML(t(key))}</h3>`;
    let html = "";
    const terrainTool = ["brush", "fill", "room"].includes(this.tool);
    if (terrainTool) {
      html += title("CADASTRE.Panel.Terrain") + `<div class="cad-swatches">${TERRAINS.map((x) => `
        <button type="button" data-terrain="${x.id}" class="${x.id === this.terrain ? "active" : ""}" title="${escapeHTML(t(`CADASTRE.Terrains.${x.id}`))}">
          <svg viewBox="0 0 1 1"><rect width="1" height="1" fill="url(#${this.prefix}-t-${x.id})"/></svg>
          <span>${escapeHTML(t(`CADASTRE.Terrains.${x.id}`))}</span>
        </button>`).join("")}</div>`;
    }
    if (this.tool === "brush" || this.tool === "eraser") {
      html += title("CADASTRE.Panel.BrushSize") + `<div class="cad-segmented">${BRUSH_SIZES.map((n) =>
        `<button type="button" data-size="${n}" class="${n === this.brushSize ? "active" : ""}">${n}</button>`).join("")}</div>`;
    }
    if (this.tool === "eraser") {
      html += title("CADASTRE.Panel.Eraser") + `<div class="cad-segmented">${ERASE_MODES.map((m) =>
        `<button type="button" data-erase="${m}" class="${m === this.eraseMode ? "active" : ""}">${escapeHTML(t(`CADASTRE.EraseModes.${m}`))}</button>`).join("")}</div>`;
    }
    if (this.tool === "prop") {
      html += title("CADASTRE.Panel.Props") + `<div class="cad-swatches cad-props">${PROPS.map((p) => `
        <button type="button" data-prop-type="${p.id}" class="${p.id === this.propType ? "active" : ""}" title="${escapeHTML(t(`CADASTRE.Props.${p.id}`))}">
          <svg viewBox="0 0 ${Math.max(p.w, p.h)} ${Math.max(p.w, p.h)}"><g transform="translate(${(Math.max(p.w, p.h) - p.w) / 2} ${(Math.max(p.w, p.h) - p.h) / 2})">${p.svg}</g></svg>
          <span>${escapeHTML(t(`CADASTRE.Props.${p.id}`))}</span>
        </button>`).join("")}</div>
        <button type="button" data-action="rotate"><i class="fa-solid fa-rotate"></i> ${escapeHTML(t("CADASTRE.Panel.Rotate"))}</button>`;
    }
    this.el.toolOptions.innerHTML = html;
  }

  _syncMapFields() {
    const f = this.el.mapOptions;
    f.querySelector('[name="name"]').value = this.map.name;
    f.querySelector('[name="cols"]').value = this.map.cols;
    f.querySelector('[name="rows"]').value = this.map.rows;
    f.querySelector('[name="gridSize"]').value = this.map.gridSize;
    f.querySelector('[name="background"]').value = this.map.background;
  }

  _updateTopbar() {
    const undo = this.root.querySelector('[data-action="undo"]');
    const redo = this.root.querySelector('[data-action="redo"]');
    if (undo) undo.disabled = !this.undoStack.length;
    if (redo) redo.disabled = !this.redoStack.length;
    this.root.querySelector('[data-action="grid"]')?.classList.toggle("active", this.showGrid);
    this.el.dirty.hidden = !this.dirty;
  }

  _setDirty(dirty) {
    if (this.dirty === dirty) return;
    this.dirty = dirty;
    this._updateTopbar();
    this.onDirty?.(dirty);
  }

  /* -------------------------------------------- */
  /*  Historique                                  */
  /* -------------------------------------------- */

  /** Garde l'état avant un geste ; `commit` ne l'enregistre que si le geste a changé quelque chose. */
  _begin() {
    this._pending = JSON.stringify(this.map);
  }

  _commit(changed, full = false) {
    const before = this._pending;
    this._pending = null;
    if (!changed || before == null) return;
    this.undoStack.push(before);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this._setDirty(true);
    this._updateTopbar();
    this.renderMap(full);
  }

  undo() { this._travel(this.undoStack, this.redoStack); }
  redo() { this._travel(this.redoStack, this.undoStack); }

  _travel(from, to) {
    if (!from.length) return;
    this._cancelDrag();
    to.push(JSON.stringify(this.map));
    this.map = JSON.parse(from.pop());
    this._setDirty(true);
    this._updateTopbar();
    this.renderMap(true);
    this._syncMapFields();
  }

  /* -------------------------------------------- */
  /*  Accès                                       */
  /* -------------------------------------------- */

  getMap() { return M.cloneMap(this.map); }

  /** Appelé par l'hôte une fois l'enregistrement fait. */
  markSaved(map) {
    if (map) this.map.sceneId = map.sceneId ?? this.map.sceneId;
    this._setDirty(false);
  }

  async save() {
    if (!this.onSave) return;
    await this.onSave(this.getMap());
  }

  /* -------------------------------------------- */
  /*  Événements                                  */
  /* -------------------------------------------- */

  _onClick(event) {
    const b = event.target.closest("button");
    if (!b || !this.root.contains(b)) return;
    // Le panneau est reconstruit à chaque choix : on garde le clavier sur l'éditeur.
    if (!b.closest(".cad-map-options")) queueMicrotask(() => this.root.focus({ preventScroll: true }));
    if (b.dataset.tool) return this._setTool(b.dataset.tool);
    if (b.dataset.terrain) { this.terrain = b.dataset.terrain; return this._renderPanel(); }
    if (b.dataset.size) { this.brushSize = Number(b.dataset.size); this._renderPanel(); return this._renderOverlay(); }
    if (b.dataset.erase) { this.eraseMode = b.dataset.erase; return this._renderPanel(); }
    if (b.dataset.propType) { this.propType = b.dataset.propType; this._renderPanel(); return this._renderOverlay(); }
    switch (b.dataset.action) {
      case "undo": return this.undo();
      case "redo": return this.redo();
      case "grid": this.showGrid = !this.showGrid; this._updateTopbar(); return this.renderMap();
      case "fit": return this.fit();
      case "rotate": this.propRot = (this.propRot + 1) % 4; return this._renderOverlay();
      case "save": return this.save();
      case "export": return this.onExport?.(this.getMap());
      case "apply-size": return this._applySize();
    }
  }

  _onMapField(event) {
    const input = event.target;
    if (input.name === "name") {
      this.map.name = input.value.trim();
      this._setDirty(true);
    } else if (input.name === "background") {
      this._begin();
      const changed = this.map.background !== input.value;
      this.map.background = input.value;
      this._commit(changed);
    }
  }

  _applySize() {
    const f = this.el.mapOptions;
    const num = (name) => Number(f.querySelector(`[name="${name}"]`).value);
    this._begin();
    const before = this.map.gridSize;
    let changed = M.resizeMap(this.map, num("cols"), num("rows"));
    const gridSize = M.createMap({ gridSize: num("gridSize") }).gridSize;
    if (gridSize !== before) { this.map.gridSize = gridSize; changed = true; }
    this._commit(changed, true);
    this._syncMapFields();
    if (changed) this.fit();
  }

  _onKeyDown(event) {
    if (event.target.closest?.("input, select, textarea")) return;
    // L'éditeur garde le clavier : les raccourcis de Foundry (Ctrl+Z…) ne doivent pas agir sur la scène.
    event.stopPropagation();
    const ctrl = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    let handled = true;
    if (ctrl && key === "z") event.shiftKey ? this.redo() : this.undo();
    else if (ctrl && key === "y") this.redo();
    else if (ctrl && key === "s") this.save();
    else if (!ctrl && /^[1-7]$/.test(event.key)) this._setTool(TOOLS[Number(event.key) - 1].id);
    else if (!ctrl && key === "r") { this.propRot = (this.propRot + 1) % 4; this._renderOverlay(); }
    else if (key === "[" || key === "]") {
      const i = BRUSH_SIZES.indexOf(this.brushSize) + (key === "]" ? 1 : -1);
      this.brushSize = BRUSH_SIZES[Math.min(BRUSH_SIZES.length - 1, Math.max(0, i))];
      this._renderPanel(); this._renderOverlay();
    }
    else if (key === " ") { this.spaceHeld = true; this.el.viewport.classList.add("cad-panning"); }
    else if (key === "escape") this._cancelDrag();
    else handled = false;
    if (handled) event.preventDefault();
  }

  _onKeyUp(event) {
    if (event.key === " ") { this.spaceHeld = false; this.el.viewport.classList.remove("cad-panning"); }
    if (event.key === "Alt" && this.drag?.kind === "wall") { this.drag.erase = false; this._renderOverlay(); }
  }

  _toMap(event) {
    const r = this.el.viewport.getBoundingClientRect();
    const { s, tx, ty } = this.view;
    return [(event.clientX - r.left - tx) / s, (event.clientY - r.top - ty) / s];
  }

  _onWheel(event) {
    event.preventDefault();
    const r = this.el.viewport.getBoundingClientRect();
    const mx = event.clientX - r.left, my = event.clientY - r.top;
    const { s, tx, ty } = this.view;
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * Math.exp(-event.deltaY * 0.0015)));
    const k = next / s;
    this.view = { s: next, tx: mx - (mx - tx) * k, ty: my - (my - ty) * k };
    this._applyView();
    this._renderOverlay();
  }

  _onPointerDown(event) {
    this.root.focus({ preventScroll: true });
    const pan = event.button === 1 || event.button === 2 || (event.button === 0 && this.spaceHeld);
    if (!pan && event.button !== 0) return;
    this.el.viewport.setPointerCapture(event.pointerId);
    const p = this._toMap(event);
    this.pointer = p;

    if (pan) {
      this.drag = { kind: "pan", x: event.clientX, y: event.clientY, tx: this.view.tx, ty: this.view.ty };
      this.el.viewport.classList.add("cad-panning");
      return;
    }

    const cell = pickCell(...p);
    switch (this.tool) {
      case "brush":
      case "eraser":
        this._begin();
        this.drag = { kind: "stroke", last: cell, changed: false };
        this._strokeAt(p, cell);
        break;
      case "fill": {
        if (!M.inBounds(this.map, ...cell)) return;
        this._begin();
        const changed = M.paintCells(this.map, M.fillCells(this.map, ...cell), this.terrain);
        this._commit(changed);
        break;
      }
      case "room":
        this.drag = { kind: "room", start: cell, end: cell };
        break;
      case "wall":
        this.drag = { kind: "wall", start: pickVertex(...p), end: pickVertex(...p), origin: p, erase: event.altKey };
        break;
      case "door": {
        const e = pickEdge(p[0], p[1], 0.45);
        if (!e) return;
        this._begin();
        this._commit(M.cycleDoor(this.map, e.o, e.x, e.y));
        break;
      }
      case "prop": {
        const [x, y] = this._propAnchor(p);
        this._begin();
        this._commit(!!M.addProp(this.map, this.propType, x, y, this.propRot));
        break;
      }
    }
    this._renderOverlay();
  }

  _onPointerMove(event) {
    const p = this._toMap(event);
    this.pointer = p;
    const [cx, cy] = pickCell(...p);
    this.el.coords.textContent = M.inBounds(this.map, cx, cy) ? this.t("CADASTRE.Editor.Coords", { x: cx + 1, y: cy + 1 }) : "";

    const drag = this.drag;
    if (drag?.kind === "pan") {
      this.view.tx = drag.tx + event.clientX - drag.x;
      this.view.ty = drag.ty + event.clientY - drag.y;
      this._applyView();
      return;
    }
    if (drag?.kind === "stroke") {
      const cell = [cx, cy];
      if (cell[0] !== drag.last[0] || cell[1] !== drag.last[1]) {
        for (const c of cellsBetween(drag.last, cell)) this._strokeAt(p, c);
        drag.last = cell;
      } else if (this._eraserEdge(p)) {
        this._strokeAt(p, cell);
      }
    } else if (drag?.kind === "room") {
      drag.end = [Math.min(this.map.cols - 1, Math.max(0, cx)), Math.min(this.map.rows - 1, Math.max(0, cy))];
    } else if (drag?.kind === "wall") {
      const v = pickVertex(...p);
      drag.end = [Math.min(this.map.cols, Math.max(0, v[0])), Math.min(this.map.rows, Math.max(0, v[1]))];
      drag.erase = event.altKey;
    }
    this._renderOverlay();
  }

  _onPointerUp(event) {
    const drag = this.drag;
    this.drag = null;
    this.el.viewport.classList.toggle("cad-panning", this.spaceHeld);
    if (!drag) return;
    if (drag.kind === "stroke") {
      this._commit(drag.changed);
    } else if (drag.kind === "room") {
      this._begin();
      this._commit(M.drawRoom(this.map, drag.start, drag.end, this.terrain));
    } else if (drag.kind === "wall") {
      const p = this._toMap(event);
      const moved = Math.hypot(p[0] - drag.origin[0], p[1] - drag.origin[1]) > 0.35;
      const end = M.lineEnd(drag.start, drag.end);
      this._begin();
      if (!moved || (end[0] === drag.start[0] && end[1] === drag.start[1])) {
        // Clic simple : bascule le mur le plus proche.
        const e = pickEdge(drag.origin[0], drag.origin[1], 0.5);
        const current = e && this.map.edges[M.edgeKey(e.o, e.x, e.y)];
        this._commit(!!e && M.setEdge(this.map, e.o, e.x, e.y, current ? null : "wall"));
      } else {
        this._commit(M.setLine(this.map, drag.start, end, drag.erase ? null : "wall"));
      }
    }
    this._renderOverlay();
  }

  _cancelDrag() {
    const drag = this.drag;
    this.drag = null;
    if (drag?.kind === "stroke" && drag.changed && this._pending) {
      // Le trait déjà peint est annulé.
      this.map = JSON.parse(this._pending);
      this._pending = null;
      this.renderMap();
    }
    this._renderOverlay();
  }

  /* -------------------------------------------- */
  /*  Outils                                      */
  /* -------------------------------------------- */

  /** Gomme taille 1 près d'un bord : l'arête visée, sinon null. */
  _eraserEdge(p) {
    if (this.tool !== "eraser" || this.brushSize !== 1 || !["all", "walls"].includes(this.eraseMode)) return null;
    const e = pickEdge(p[0], p[1], 0.22);
    return e && M.edgeInBounds(this.map, e.o, e.x, e.y) ? e : null;
  }

  _strokeAt(p, [cx, cy]) {
    const drag = this.drag;
    let changed = false;
    if (this.tool === "brush") {
      changed = M.paintCells(this.map, M.brushCells(this.map, cx, cy, this.brushSize), this.terrain);
    } else {
      const edge = this._eraserEdge(p);
      if (edge) {
        changed = M.setEdge(this.map, edge.o, edge.x, edge.y, null);
      } else {
        const cells = M.brushCells(this.map, cx, cy, this.brushSize);
        const mode = this.eraseMode;
        if (mode === "all" || mode === "floor") changed = M.paintCells(this.map, cells, null) || changed;
        if (mode === "all" || mode === "props") {
          for (const [x, y] of cells) {
            let prop;
            while ((prop = M.propAt(this.map, x, y))) changed = M.removeProp(this.map, prop.id) || changed;
          }
        }
        if ((mode === "all" && this.brushSize > 1) || mode === "walls") {
          for (const [x, y] of cells) {
            for (const [o, ex, ey] of [["h", x, y], ["h", x, y + 1], ["v", x, y], ["v", x + 1, y]]) {
              changed = M.setEdge(this.map, o, ex, ey, null) || changed;
            }
          }
        }
      }
    }
    if (changed) {
      drag.changed = true;
      this.renderMap();
    }
  }

  /** Case en haut à gauche d'un objet centré sous le pointeur. */
  _propAnchor(p) {
    const fp = M.propFootprint(this.propType, this.propRot) ?? { w: 1, h: 1 };
    return [Math.round(p[0] - fp.w / 2), Math.round(p[1] - fp.h / 2)];
  }
}

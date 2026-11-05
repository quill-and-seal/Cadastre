/**
 * Éditeur de carte vectoriel : interface DOM autonome, sans dépendance à Foundry.
 * La fenêtre Foundry (app.js) l'héberge ; le banc d'essai (tools/editor-lab.html) aussi.
 */
import { TERRAINS, PROPS } from "./catalog.js";
import * as M from "./model.js";
import * as P from "./poly.js";
import { flattenNodes, rectNodes, ellipseNodes, smoothNodes, rdp, cleanNode, polylineLength } from "./curves.js";
import { ringsPath as ringsPathD } from "./render.js";
import { renderPaths } from "./render.js";
import { renderDefs, renderTerrains, renderProps, renderWalls, renderGrid, polylinePath, terrainFill, terrainPatternId, propArt, defaultResolve } from "./render.js";
import { isAssetKey, assetIdOf, assetKey, embedAsset, refreshMapAssets, filterAssets, normalizeLibrary, pruneAssets } from "./library.js";
import { HISTORY_LIMIT, MIN_CELLS, MAX_CELLS, MIN_GRID_SIZE, MAX_GRID_SIZE } from "./constants.js";

/** Outils, dans l'ordre de la barre ; `key` : raccourci (les anciens gardent le leur). */
export const TOOLS = [
  { id: "select", icon: "fa-arrow-pointer", key: "1" },
  { id: "brush", icon: "fa-paintbrush", key: "2" },
  { id: "fill", icon: "fa-fill-drip", key: "3" },
  { id: "shape", icon: "fa-draw-polygon", key: "4" },
  { id: "path", icon: "fa-route", key: "9" },
  { id: "wall", icon: "fa-pen-nib", key: "5" },
  { id: "door", icon: "fa-door-open", key: "6" },
  { id: "prop", icon: "fa-chair", key: "7" },
  { id: "eraser", icon: "fa-eraser", key: "8" }
];
const isCurve = (sel) => sel?.type === "wall" || sel?.type === "path";
const ERASE_MODES = ["all", "floor", "walls", "props"];
const MIN_SCALE = 4, MAX_SCALE = 260;
const SNAP_STEP = 0.5;
const HIT_PX = 8;
const SVG_NS = "http://www.w3.org/2000/svg";
/** Nombre maximal d'assets de bibliothèque affichés dans une palette (la recherche affine). */
const PALETTE_LIMIT = 90;

let instances = 0;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const f2 = (n) => Math.round(n * 100) / 100;
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export class MapEditor {
  /**
   * @param {HTMLElement} root
   * @param {object} map
   * @param {{t?:(key:string, data?:object)=>string, onSave?:(map)=>any, onExport?:(map)=>any, onDirty?:(dirty:boolean)=>void,
   *   library?:object[], onOpenLibrary?:()=>any, resolve?:(src:string)=>string}} [options]
   *   library : assets de la bibliothèque ; onOpenLibrary : ouvre la gestion de la bibliothèque ;
   *   resolve : URL d'affichage d'une image d'asset
   */
  constructor(root, map, { t = (k) => k, onSave = null, onExport = null, onDirty = null, library = [], onOpenLibrary = null, resolve = defaultResolve } = {}) {
    this.root = root;
    this.map = M.normalizeMap(map);
    this.t = t;
    this.onSave = onSave;
    this.onExport = onExport;
    this.onDirty = onDirty;
    this.onOpenLibrary = onOpenLibrary;
    this.resolve = resolve;
    this.library = normalizeLibrary(library);
    this.search = { terrain: "", prop: "" };
    this.prefix = `cad${++instances}`;

    this.opts = {
      terrain: "stone",
      brushRadius: 0.75,
      eraserRadius: 0.75,
      eraseMode: "all",
      shapeMode: "rect",
      shapeTarget: "room",
      wallMode: "pen",
      pathMode: "pen",
      pathWidth: 2,
      pathTerrain: "cobble",
      pathEdge: "wood",
      pathEdgeWidth: 0.35,
      doorWidth: 1,
      doorKind: "door",
      propType: PROPS[0].id,
      propAngle: 0,
      propScale: 1
    };
    this.tool = "shape";
    this.showGrid = true;
    this.snap = true;

    this.undoStack = [];
    this.redoStack = [];
    this.dirty = false;
    this.view = { s: 32, tx: 0, ty: 0 };
    this.pointer = null;      // position en cases
    this.mods = { alt: false, ctrl: false, shift: false };
    this.drag = null;         // geste en cours
    this.pen = null;          // tracé à la plume en cours
    this.selection = null;    // { type, id }
    this.selNode = -1;        // nœud choisi sur le mur sélectionné
    this.hover = null;
    this.spaceHeld = false;
    this._frame = null;
    this._dirtyParts = { terrain: false, map: false, overlay: false };
    const refreshed = refreshMapAssets(this.map, this.library);

    this._build();
    this.renderMap(true);
    this._renderPanel();
    this._syncMapFields();
    this._applyView();
    if (refreshed) this._setDirty(true);
    requestAnimationFrame(() => this.fit());
  }

  /* -------------------------------------------- */
  /*  Construction                                */
  /* -------------------------------------------- */

  _build() {
    const t = this.t;
    const btn = (action, icon, title, label = "") =>
      `<button type="button" data-action="${action}" title="${esc(title)}"><i class="fa-solid ${icon}"></i>${label ? `<span>${esc(label)}</span>` : ""}</button>`;

    this.root.classList.add("cad-editor");
    this.root.tabIndex = 0;
    this.root.innerHTML = `
      <header class="cad-topbar">
        ${btn("undo", "fa-rotate-left", t("CADASTRE.Editor.Undo"))}
        ${btn("redo", "fa-rotate-right", t("CADASTRE.Editor.Redo"))}
        <span class="cad-sep"></span>
        ${btn("grid", "fa-border-all", t("CADASTRE.Editor.Grid"))}
        ${btn("snap", "fa-magnet", t("CADASTRE.Editor.Snap"))}
        ${btn("fit", "fa-expand", t("CADASTRE.Editor.Fit"))}
        <span class="cad-dirty" hidden>${esc(t("CADASTRE.Editor.Unsaved"))}</span>
        <span class="cad-spacer"></span>
        ${this.onSave ? btn("save", "fa-floppy-disk", t("CADASTRE.Editor.SaveHint"), t("CADASTRE.Editor.Save")) : ""}
        ${this.onExport ? btn("export", "fa-map", t("CADASTRE.Editor.Export"), t("CADASTRE.Editor.Export")) : ""}
      </header>
      <div class="cad-body">
        <nav class="cad-tools">
          ${TOOLS.map((tool) => `<button type="button" data-tool="${tool.id}" title="${esc(t(`CADASTRE.Tools.${tool.id}`))}"><i class="fa-solid ${tool.icon}"></i></button>`).join("")}
        </nav>
        <div class="cad-viewport">
          <svg class="cad-svg" xmlns="${SVG_NS}">
            <g class="cad-defs"></g>
            <g class="cad-world">
              <rect class="cad-bg"></rect>
              <g class="cad-terrain"></g>
              <g class="cad-paths"></g>
              <g class="cad-props"></g>
              <g class="cad-walls"></g>
              <g class="cad-grid"></g>
              <rect class="cad-border" fill="none"></rect>
              <g class="cad-overlay"></g>
              <defs class="cad-extra-defs"></defs>
            </g>
          </svg>
        </div>
        <aside class="cad-panel">
          <section class="cad-tool-options"></section>
          <section class="cad-map-options">
            <h3>${esc(t("CADASTRE.Panel.Map"))}</h3>
            <label>${esc(t("CADASTRE.Panel.Name"))}<input type="text" name="name"></label>
            <div class="cad-row">
              <label>${esc(t("CADASTRE.Panel.Width"))}<input type="number" name="width" min="${MIN_CELLS}" max="${MAX_CELLS}"></label>
              <label>${esc(t("CADASTRE.Panel.Height"))}<input type="number" name="height" min="${MIN_CELLS}" max="${MAX_CELLS}"></label>
            </div>
            <div class="cad-row">
              <label>${esc(t("CADASTRE.Panel.GridSize"))}<input type="number" name="gridSize" min="${MIN_GRID_SIZE}" max="${MAX_GRID_SIZE}" step="10"></label>
              <label>${esc(t("CADASTRE.Panel.Background"))}<input type="color" name="background"></label>
            </div>
            <button type="button" data-action="apply-size" title="${esc(t("CADASTRE.Panel.ApplyHint"))}">${esc(t("CADASTRE.Panel.Apply"))}</button>
          </section>
        </aside>
      </div>
      <footer class="cad-status"><span class="cad-coords"></span><span class="cad-hint"></span></footer>`;

    const $ = (sel) => this.root.querySelector(sel);
    this.el = {
      viewport: $(".cad-viewport"), svg: $(".cad-svg"), defs: $(".cad-defs"), world: $(".cad-world"),
      bg: $(".cad-bg"), terrain: $(".cad-terrain"), paths: $(".cad-paths"), props: $(".cad-props"), walls: $(".cad-walls"),
      grid: $(".cad-grid"), border: $(".cad-border"), overlay: $(".cad-overlay"), extraDefs: $(".cad-extra-defs"),
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
    on(this.el.viewport, "pointerleave", () => { this.pointer = null; this.hover = null; this._schedule("overlay"); });
    on(this.el.viewport, "dblclick", (e) => this._onDoubleClick(e));
    on(this.el.viewport, "wheel", (e) => this._onWheel(e), { passive: false });
    on(this.el.viewport, "contextmenu", (e) => e.preventDefault());
    on(this.el.mapOptions, "change", (e) => this._onMapField(e));
    on(this.el.toolOptions, "input", (e) => this._onOptionInput(e, false));
    on(this.el.toolOptions, "input", (e) => this._onSearch(e));
    on(this.el.toolOptions, "change", (e) => this._onOptionInput(e, true));
    on(window, "blur", () => { this.spaceHeld = false; this.mods = { alt: false, ctrl: false, shift: false }; });

    this._setTool(this.tool);
    this._updateTopbar();
  }

  destroy() {
    for (const [target, type, fn, opts] of this._listeners) target.removeEventListener(type, fn, opts);
    this._listeners = [];
    if (this._frame) cancelAnimationFrame(this._frame);
  }

  /* -------------------------------------------- */
  /*  Rendu                                       */
  /* -------------------------------------------- */

  /** Demande un rendu au prochain affichage (les gestes rapides ne redessinent qu'une fois par image). */
  _schedule(...parts) {
    for (const p of parts) this._dirtyParts[p] = true;
    if (this._frame) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = null;
      const d = this._dirtyParts;
      this._dirtyParts = { terrain: false, map: false, overlay: false };
      if (d.terrain || d.map) this.renderMap(false, d.terrain);
      else if (d.overlay) this._renderOverlay();
    });
  }

  /** Redessine la carte ; `full` refait motifs et dimensions, `terrain` les sols. */
  renderMap(full = false, terrain = true) {
    const { map, prefix } = this;
    const assetSig = Object.entries(map.assets ?? {}).map(([id, a]) => `${id}:${a.src}:${a.w}:${a.h}`).join("|");
    if (assetSig !== this._assetSig) { this._assetSig = assetSig; full = true; }
    if (full) {
      this.el.defs.innerHTML = renderDefs(map, prefix, this.resolve);
      for (const el of [this.el.bg, this.el.border]) {
        el.setAttribute("width", map.width);
        el.setAttribute("height", map.height);
      }
      this.el.grid.innerHTML = renderGrid(map, 0.14);
    }
    this.el.bg.setAttribute("fill", map.background);
    if (full || terrain) this.el.terrain.innerHTML = renderTerrains(map, prefix);
    this.el.paths.innerHTML = renderPaths(map, prefix);
    this.el.props.innerHTML = renderProps(map, prefix, this.resolve);
    this.el.walls.innerHTML = renderWalls(map, "editor", prefix);
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
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min((r.width - 32) / this.map.width, (r.height - 32) / this.map.height)));
    this.view = { s, tx: (r.width - this.map.width * s) / 2, ty: (r.height - this.map.height * s) / 2 };
    this._applyView();
    this._renderOverlay();
  }

  /** Repères : sélection, survol, aperçus des gestes. */
  _renderOverlay() {
    const px = 1 / this.view.s;
    const p = this.pointer;
    const o = this.opts;
    let out = "";
    const pathEl = (d, cls, w = 2, extra = "") => `<path class="${cls}" d="${d}" stroke-width="${w * px}"${extra}/>`;
    const dot = ([x, y], cls, r = 4) => `<circle class="${cls}" cx="${x}" cy="${y}" r="${r * px}" stroke-width="${1.5 * px}"/>`;
    const square = ([x, y], cls, r = 4) => `<rect class="${cls}" x="${x - r * px}" y="${y - r * px}" width="${2 * r * px}" height="${2 * r * px}" stroke-width="${1.5 * px}"/>`;
    const disc = ([x, y], r, cls) => `<circle class="${cls}" cx="${x}" cy="${y}" r="${r}" stroke-width="${1.5 * px}"/>`;

    // Sélection et survol (outil de sélection).
    if (this.tool === "select") {
      if (this.hover && !(this.selection && this.hover.id === this.selection.id)) out += this._outline(this.hover, "cad-hover", px);
      if (this.selection) out += this._outline(this.selection, "cad-sel", px, true);
    }

    const drag = this.drag;
    switch (this.tool) {
      case "brush":
      case "eraser": {
        const r = this.tool === "brush" ? o.brushRadius : o.eraserRadius;
        const erase = this.tool === "eraser" || this.mods.alt;
        if (drag?.kind === "stroke" && drag.points.length) {
          const d = polylinePath(drag.points.length > 1 ? drag.points : [drag.points[0], [drag.points[0][0] + 0.001, drag.points[0][1]]]);
          out += erase
            ? `<path d="${d}" class="cad-stroke-erase" stroke-width="${2 * r}"/>`
            : `<path d="${d}" fill="none" stroke="${this._fill(o.terrain)}" stroke-opacity="0.9" stroke-width="${2 * r}" stroke-linecap="round" stroke-linejoin="round"/>`;
        }
        if (p) out += disc(p, r, erase ? "cad-brush-erase" : "cad-brush");
        break;
      }
      case "fill": {
        const prev = this._fillPreview;
        if (prev?.rings.length) {
          out += `<path d="${ringsPathD(prev.rings)}" fill="${this._fill(o.terrain)}" fill-opacity="0.6" class="cad-preview" stroke-width="${2 * px}"/>`;
        }
        if (p) out += dot(p, "cad-dot", 3);
        break;
      }
      case "shape": {
        if (drag?.kind === "shape" && drag.end) {
          const nodes = this._shapeNodes(drag.start, drag.end);
          if (nodes) out += this._nodesPreview(nodes, true, px);
        }
        if (this.pen) out += this._penPreview(px);
        else if (p && !drag) out += dot(this._snap(p), "cad-dot");
        break;
      }
      case "path": {
        const w = o.pathWidth + (o.pathEdge ? 2 * o.pathEdgeWidth : 0);
        const band = (pts) => `<path d="${polylinePath(pts)}" fill="none" stroke="${this._fill(o.pathTerrain)}" stroke-opacity="0.7" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
        if (drag?.kind === "freepath" && drag.points.length > 1) out += band(drag.points);
        if (this.pen?.purpose === "path" && this.pen.nodes.length > 1) out += band(flattenNodes(this.pen.nodes, false, 0.02));
        if (this.pen) out += this._penPreview(px);
        else if (p && !drag && o.pathMode === "pen") out += dot(this._snap(p), "cad-dot");
        break;
      }
      case "wall": {
        if (drag?.kind === "freewall" && drag.points.length > 1) out += pathEl(polylinePath(drag.points), "cad-preview", 3);
        if (this.pen) out += this._penPreview(px);
        else if (p && !drag && o.wallMode === "pen") out += dot(this._snap(p, true), "cad-dot");
        break;
      }
      case "door": {
        const target = p && this._doorTarget(p);
        if (target) out += pathEl(polylinePath([target.a, target.b]), "cad-door-preview", 6);
        break;
      }
      case "prop": {
        if (!p) break;
        const def = this._propDef(o.propType);
        const [x, y] = this._snap(p);
        if (def) out += `<g opacity="0.75" transform="translate(${x} ${y}) rotate(${o.propAngle}) scale(${o.propScale}) translate(${-def.w / 2} ${-def.h / 2})">${propArt(def, this.resolve)}</g>`;
        break;
      }
    }
    this.el.overlay.innerHTML = out;
  }

  /** Contour de surbrillance d'un objet ; `handles` : nœuds et poignées d'un mur. */
  _outline(target, cls, px, handles = false) {
    const map = this.map;
    if (target.type === "wall" || target.type === "path") {
      const wall = M.curveById(map, target.id);
      if (!wall) return "";
      const pts = M.wallPoints(wall);
      let out = "";
      if (target.type === "path") {
        // Bords de la bande, pour voir la largeur du chemin.
        const w = wall.width + (wall.edge ? 2 * wall.edgeWidth : 0);
        out += `<path class="${cls}" d="${polylinePath(wall.closed ? [...pts, pts[0]] : pts)}" stroke-width="${w}" stroke-opacity="0.18" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      out += `<path class="${cls}" d="${polylinePath(wall.closed ? [...pts, pts[0]] : pts)}" stroke-width="${3 * px}"/>`;
      if (!handles) return out;
      wall.nodes.forEach((n, i) => {
        for (const h of ["i", "o"]) {
          if (!n[h]) continue;
          const hx = n.x + n[h][0], hy = n.y + n[h][1];
          out += `<path class="cad-handle-line" d="M${n.x} ${n.y}L${hx} ${hy}" stroke-width="${1.2 * px}"/>`;
          out += `<circle class="cad-handle" cx="${hx}" cy="${hy}" r="${4 * px}" stroke-width="${1.2 * px}"/>`;
        }
        out += `<rect class="cad-node${i === this.selNode ? " active" : ""}${n.i || n.o ? " smooth" : ""}" x="${n.x - 4.5 * px}" y="${n.y - 4.5 * px}" width="${9 * px}" height="${9 * px}" stroke-width="${1.5 * px}"/>`;
      });
      return out;
    }
    if (target.type === "door") {
      const door = map.doors.find((d) => d.id === target.id);
      const ends = door && M.doorEnds(map, door);
      return ends ? `<path class="${cls}" d="${polylinePath([ends.a, ends.b])}" stroke-width="${7 * px}" stroke-linecap="round"/>` : "";
    }
    if (target.type === "prop") {
      const prop = map.props.find((q) => q.id === target.id);
      const def = prop && M.propDef(map, prop.type);
      if (!def) return "";
      let out = `<rect class="${cls}" transform="translate(${prop.x} ${prop.y}) rotate(${prop.a}) scale(${prop.k})" x="${-def.w / 2}" y="${-def.h / 2}" width="${def.w}" height="${def.h}" stroke-width="${(2 * px) / prop.k}" fill="none"/>`;
      if (!handles) return out;
      // Poignées de transformation : coins pour l'échelle, rond au-dessus pour la rotation.
      const g = this._propGizmo(prop, def);
      out += `<path class="cad-handle-line" d="M${g.top[0]} ${g.top[1]}L${g.rot[0]} ${g.rot[1]}" stroke-width="${1.2 * px}"/>`;
      for (const c of g.corners) out += `<rect class="cad-node" x="${c[0] - 4.5 * px}" y="${c[1] - 4.5 * px}" width="${9 * px}" height="${9 * px}" stroke-width="${1.5 * px}"/>`;
      out += `<circle class="cad-handle cad-rot" cx="${g.rot[0]}" cy="${g.rot[1]}" r="${5.5 * px}" stroke-width="${1.5 * px}"/>`;
      return out;
    }
    return "";
  }

  _nodesPreview(nodes, closed, px) {
    const pts = flattenNodes(nodes, closed, 0.01);
    const d = polylinePath(closed ? [...pts, pts[0]] : pts);
    const o = this.opts;
    const fill = this.tool === "shape" ? this._fill(o.terrain) : "none";
    return `<path d="${d}" fill="${fill}" fill-opacity="0.55" class="cad-preview" stroke-width="${2 * px}"/>`;
  }

  _penPreview(px) {
    const pen = this.pen;
    if (!pen?.nodes.length) return "";
    let out = "";
    const nodes = pen.nodes;
    const pts = flattenNodes(nodes, false, 0.01);
    out += `<path class="cad-preview" d="${polylinePath(pts)}" stroke-width="${2.5 * px}" fill="none"/>`;
    if (this.pointer && !this.drag) {
      const q = this._snap(this.pointer, true);
      const last = nodes.at(-1);
      const rubber = flattenNodes([last, { x: q[0], y: q[1] }], false, 0.01);
      out += `<path class="cad-rubber" d="${polylinePath(rubber)}" stroke-width="${1.5 * px}" fill="none"/>`;
    }
    for (const n of nodes) {
      if (n.o) {
        out += `<path class="cad-handle-line" d="M${n.x + (n.i?.[0] ?? 0)} ${n.y + (n.i?.[1] ?? 0)}L${n.x + n.o[0]} ${n.y + n.o[1]}" stroke-width="${1.2 * px}"/>`;
      }
    }
    nodes.forEach((n, i) => {
      const closable = i === 0 && nodes.length >= 2 && this.pointer && dist([n.x, n.y], this.pointer) * this.view.s < HIT_PX;
      out += `<rect class="cad-node${closable ? " active" : ""}" x="${n.x - 4.5 * px}" y="${n.y - 4.5 * px}" width="${9 * px}" height="${9 * px}" stroke-width="${1.5 * px}"/>`;
    });
    return out;
  }

  /* -------------------------------------------- */
  /*  Panneau et barre                            */
  /* -------------------------------------------- */

  _setTool(tool) {
    if (!TOOLS.some((x) => x.id === tool)) return;
    if (this.pen && tool !== this.tool) this.pen = null;
    this.tool = tool;
    this.hover = null;
    this._fillPreview = null;
    for (const b of this.root.querySelectorAll("[data-tool]")) b.classList.toggle("active", b.dataset.tool === tool);
    this.el.hint.textContent = `${this.t(`CADASTRE.Hints.${tool}`)} ${this.t("CADASTRE.Hints.pan")}`;
    this.el.viewport.dataset.tool = tool;
    this._renderPanel();
    this._renderOverlay();
  }

  _renderPanel() {
    if (!this.el) return;
    const t = this.t, o = this.opts;
    const title = (key) => `<h3>${esc(t(key))}</h3>`;
    const segmented = (opt, values, labelKey) => `<div class="cad-segmented">${values.map((v) =>
      `<button type="button" data-opt="${opt}" data-val="${v}" class="${o[opt] === v ? "active" : ""}">${esc(t(`${labelKey}.${v}`))}</button>`).join("")}</div>`;
    const slider = (field, value, min, max, step) =>
      `<div class="cad-slider"><input type="range" data-field="${field}" min="${min}" max="${max}" step="${step}" value="${value}"><output>${f2(value)}</output></div>`;
    const number = (field, label, value, min, max, step) =>
      `<label>${esc(t(label))}<input type="number" data-field="${field}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
    const terrains = (opt = "terrain", label = "CADASTRE.Panel.Terrain", none = false) => title(label) + `<div class="cad-swatches">${
      none ? `<button type="button" data-opt="${opt}" data-val="" class="${!o[opt] ? "active" : ""}"><span class="cad-thumb cad-none"></span><span>${esc(t("CADASTRE.Panel.NoEdge"))}</span></button>` : ""
    }${TERRAINS.map((x) => `
        <button type="button" data-opt="${opt}" data-val="${x.id}" class="${x.id === o[opt] ? "active" : ""}" title="${esc(t(`CADASTRE.Terrains.${x.id}`))}">
          <svg viewBox="0 0 1 1"><rect width="1" height="1" fill="url(#${this.prefix}-t-${x.id})"/></svg>
          <span>${esc(t(`CADASTRE.Terrains.${x.id}`))}</span>
        </button>`).join("")}</div>` + this._libraryPalette("texture", opt);

    let html = "";
    switch (this.tool) {
      case "select":
        html = title("CADASTRE.Panel.Selection") + this._selectionPanel();
        break;
      case "brush":
        html = title("CADASTRE.Panel.BrushSize") + slider("brushRadius", o.brushRadius, 0.1, 5, 0.05) + terrains();
        break;
      case "fill":
        html = terrains();
        break;
      case "shape":
        html = title("CADASTRE.Panel.Shape") + segmented("shapeMode", ["rect", "ellipse", "pen"], "CADASTRE.Panel.ShapeModes")
          + title("CADASTRE.Panel.Target") + segmented("shapeTarget", ["room", "floor"], "CADASTRE.Panel.Targets")
          + terrains();
        break;
      case "wall":
        html = title("CADASTRE.Panel.WallMode") + segmented("wallMode", ["pen", "free"], "CADASTRE.Panel.WallModes");
        break;
      case "path":
        html = title("CADASTRE.Panel.WallMode") + segmented("pathMode", ["pen", "free"], "CADASTRE.Panel.WallModes")
          + title("CADASTRE.Panel.PathWidth") + slider("pathWidth", o.pathWidth, 0.2, 12, 0.1)
          + terrains("pathTerrain", "CADASTRE.Panel.PathTerrain")
          + title("CADASTRE.Panel.EdgeWidth") + slider("pathEdgeWidth", o.pathEdgeWidth, 0.05, 2, 0.05)
          + terrains("pathEdge", "CADASTRE.Panel.PathEdge", true);
        break;
      case "door":
        html = title("CADASTRE.Panel.Door") + segmented("doorKind", ["door", "secret"], "CADASTRE.Panel.DoorKinds")
          + number("doorWidth", "CADASTRE.Panel.DoorWidth", o.doorWidth, 0.25, 8, 0.25);
        break;
      case "prop":
        html = title("CADASTRE.Panel.Props") + `<div class="cad-swatches cad-props">${PROPS.map((p) => {
          const side = Math.max(p.w, p.h);
          return `<button type="button" data-opt="propType" data-val="${p.id}" class="${p.id === o.propType ? "active" : ""}" title="${esc(t(`CADASTRE.Props.${p.id}`))}">
            <svg viewBox="0 0 ${side} ${side}"><g transform="translate(${(side - p.w) / 2} ${(side - p.h) / 2})">${p.svg}</g></svg>
            <span>${esc(t(`CADASTRE.Props.${p.id}`))}</span></button>`;
        }).join("")}</div>${this._libraryPalette("prop", "propType")}
          <div class="cad-row">${number("propAngle", "CADASTRE.Panel.Angle", o.propAngle, -360, 360, 15)}${number("propScale", "CADASTRE.Panel.Scale", o.propScale, 0.25, 4, 0.05)}</div>`;
        break;
      case "eraser":
        html = title("CADASTRE.Panel.BrushSize") + slider("eraserRadius", o.eraserRadius, 0.1, 5, 0.05)
          + title("CADASTRE.Panel.Eraser") + segmented("eraseMode", ERASE_MODES, "CADASTRE.EraseModes");
        break;
    }
    this.el.toolOptions.innerHTML = html;
  }

  _selectionPanel() {
    const t = this.t;
    const sel = this.selection;
    const actions = (dup = true) => `<div class="cad-row cad-actions">
      ${dup ? `<button type="button" data-action="duplicate"><i class="fa-solid fa-clone"></i> ${esc(t("CADASTRE.Panel.Duplicate"))}</button>` : ""}
      <button type="button" data-action="delete" class="cad-danger"><i class="fa-solid fa-trash"></i> ${esc(t("CADASTRE.Panel.Delete"))}</button></div>`;
    if (!sel) return `<p class="cad-note">${esc(t("CADASTRE.Panel.NoSelection"))}</p>`;
    if (sel.type === "wall") {
      const wall = this.map.walls.find((w) => w.id === sel.id);
      if (!wall) return "";
      return `<p class="cad-note"><strong>${esc(t("CADASTRE.Panel.SelWall"))}</strong> · ${esc(t("CADASTRE.Panel.Nodes", { n: wall.nodes.length }))}</p>
        <label class="cad-check"><input type="checkbox" data-field="selWallClosed" ${wall.closed ? "checked" : ""} ${wall.nodes.length < 3 ? "disabled" : ""}> ${esc(t("CADASTRE.Panel.WallClosed"))}</label>
        ${actions()}`;
    }
    if (sel.type === "path") {
      const q = this.map.paths.find((x) => x.id === sel.id);
      if (!q) return "";
      const options = (current, none) => (none ? `<option value="" ${!current ? "selected" : ""}>${esc(t("CADASTRE.Panel.NoEdge"))}</option>` : "")
        + this._terrainChoices().map(([key, name]) => `<option value="${esc(key)}" ${key === current ? "selected" : ""}>${esc(name)}</option>`).join("");
      return `<p class="cad-note"><strong>${esc(t("CADASTRE.Panel.SelPath"))}</strong> · ${esc(t("CADASTRE.Panel.Nodes", { n: q.nodes.length }))}</p>
        <div class="cad-row">
          <label>${esc(t("CADASTRE.Panel.PathWidth"))}<input type="number" data-field="selPathWidth" min="0.2" max="20" step="0.1" value="${q.width}"></label>
          <label>${esc(t("CADASTRE.Panel.EdgeWidth"))}<input type="number" data-field="selPathEdgeWidth" min="0.05" max="3" step="0.05" value="${q.edgeWidth}"></label>
        </div>
        <label>${esc(t("CADASTRE.Panel.PathTerrain"))}<select data-field="selPathTerrain">${options(q.terrain, false)}</select></label>
        <label>${esc(t("CADASTRE.Panel.PathEdge"))}<select data-field="selPathEdge">${options(q.edge, true)}</select></label>
        <label class="cad-check"><input type="checkbox" data-field="selPathClosed" ${q.closed ? "checked" : ""} ${q.nodes.length < 3 ? "disabled" : ""}> ${esc(t("CADASTRE.Panel.PathClosed"))}</label>
        ${actions()}`;
    }
    if (sel.type === "door") {
      const door = this.map.doors.find((d) => d.id === sel.id);
      if (!door) return "";
      return `<p class="cad-note"><strong>${esc(t("CADASTRE.Panel.SelDoor"))}</strong></p>
        <div class="cad-segmented">${["door", "secret"].map((k) =>
          `<button type="button" data-sel-door-kind="${k}" class="${door.kind === k ? "active" : ""}">${esc(t(`CADASTRE.Panel.DoorKinds.${k}`))}</button>`).join("")}</div>
        <label>${esc(t("CADASTRE.Panel.DoorWidth"))}<input type="number" data-field="selDoorWidth" min="0.25" max="8" step="0.25" value="${door.w}"></label>
        ${actions(false)}`;
    }
    if (sel.type === "prop") {
      const prop = this.map.props.find((q) => q.id === sel.id);
      if (!prop) return "";
      return `<p class="cad-note"><strong>${esc(this._propName(prop.type))}</strong></p>
        <div class="cad-row">
          <label>${esc(t("CADASTRE.Panel.Angle"))}<input type="number" data-field="selPropAngle" min="-360" max="360" step="15" value="${prop.a}"></label>
          <label>${esc(t("CADASTRE.Panel.Scale"))}<input type="number" data-field="selPropScale" min="0.25" max="4" step="0.05" value="${prop.k}"></label>
        </div>
        ${actions()}`;
    }
    return "";
  }

  _syncMapFields() {
    const f = this.el.mapOptions;
    f.querySelector('[name="name"]').value = this.map.name;
    f.querySelector('[name="width"]').value = this.map.width;
    f.querySelector('[name="height"]').value = this.map.height;
    f.querySelector('[name="gridSize"]').value = this.map.gridSize;
    f.querySelector('[name="background"]').value = this.map.background;
  }

  _updateTopbar() {
    const undo = this.root.querySelector('[data-action="undo"]');
    const redo = this.root.querySelector('[data-action="redo"]');
    if (undo) undo.disabled = !this.undoStack.length;
    if (redo) redo.disabled = !this.redoStack.length;
    this.root.querySelector('[data-action="grid"]')?.classList.toggle("active", this.showGrid);
    this.root.querySelector('[data-action="snap"]')?.classList.toggle("active", this.snap);
    this.el.dirty.hidden = !this.dirty;
  }

  _setDirty(dirty) {
    if (this.dirty === dirty) return;
    this.dirty = dirty;
    this._updateTopbar();
    this.onDirty?.(dirty);
  }

  _select(target, node = -1) {
    const same = target?.id === this.selection?.id && target?.type === this.selection?.type;
    this.selection = target;
    this.selNode = node;
    if (!same) this._renderPanel();
    this._renderOverlay();
  }

  /** La sélection pointe-t-elle encore vers quelque chose (après annulation, gomme…) ? */
  _checkSelection() {
    const sel = this.selection;
    if (!sel) return;
    const list = { wall: this.map.walls, path: this.map.paths, door: this.map.doors, prop: this.map.props }[sel.type];
    if (!list?.some((x) => x.id === sel.id)) { this.selection = null; this.selNode = -1; }
    const wall = isCurve(sel) && M.curveById(this.map, sel.id);
    if (wall && this.selNode >= wall.nodes.length) this.selNode = -1;
  }

  /* -------------------------------------------- */
  /*  Historique                                  */
  /* -------------------------------------------- */

  /** Garde l'état avant un geste ; `commit` ne l'enregistre que si le geste a changé quelque chose. */
  _begin() {
    this._pending = JSON.stringify(this.map);
  }

  _commit(changed, { terrain = true, full = false } = {}) {
    const before = this._pending;
    this._pending = null;
    if (!changed || before == null) {
      this._renderOverlay();
      return;
    }
    this.undoStack.push(before);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this._setDirty(true);
    this._updateTopbar();
    this._checkSelection();
    this.renderMap(full, terrain);
    if (this.tool === "select") this._renderPanel();
  }

  /** Abandonne le geste en cours et revient à l'état d'avant. */
  _rollback() {
    if (this._pending == null) return;
    this.map = JSON.parse(this._pending);
    this._pending = null;
    this._checkSelection();
    this.renderMap(false, true);
  }

  undo() { this._travel(this.undoStack, this.redoStack); }
  redo() { this._travel(this.redoStack, this.undoStack); }

  _travel(from, to) {
    if (!from.length) return;
    this._cancelDrag();
    this.pen = null;
    to.push(JSON.stringify(this.map));
    this.map = JSON.parse(from.pop());
    this._setDirty(true);
    this._updateTopbar();
    this._checkSelection();
    this.renderMap(true);
    this._syncMapFields();
    this._renderPanel();
  }

  /* -------------------------------------------- */
  /*  Accès                                       */
  /* -------------------------------------------- */

  getMap() {
    const map = M.cloneMap(this.map);
    pruneAssets(map);
    return map;
  }

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
  /*  Aides au pointage                           */
  /* -------------------------------------------- */

  _toMap(event) {
    const r = this.el.viewport.getBoundingClientRect();
    const { s, tx, ty } = this.view;
    return [(event.clientX - r.left - tx) / s, (event.clientY - r.top - ty) / s];
  }

  /**
   * Point aimanté : d'abord aux nœuds des murs proches (pour relier les murs), puis à la grille.
   * Ctrl inverse l'aimant de la grille.
   */
  _snap(p, toNodes = false, skip = null) {
    if (toNodes) {
      const tol = HIT_PX / this.view.s;
      let best = null, bestD = tol;
      for (const wall of this.map.walls) {
        wall.nodes.forEach((n, i) => {
          if (skip && skip.wall === wall.id && skip.index === i) return;
          const d = dist([n.x, n.y], p);
          if (d < bestD) { bestD = d; best = [n.x, n.y]; }
        });
      }
      if (best) return best;
      // Sinon, sur le mur le plus proche : une cloison s'arrête pile contre le mur.
      const onWall = M.nearestWallPoint(this.map, p[0], p[1], tol);
      if (onWall && !(skip && M.nearestWall(this.map, p[0], p[1], tol)?.wall.id === skip.wall)) return onWall;
    }
    if (this.snap !== this.mods.ctrl) return [Math.round(p[0] / SNAP_STEP) * SNAP_STEP, Math.round(p[1] / SNAP_STEP) * SNAP_STEP];
    return [f2(p[0]), f2(p[1])];
  }

  /** Objet sous le pointeur : porte, puis objet, puis mur. */
  _hitTest(p) {
    const tol = HIT_PX / this.view.s;
    let best = null, bestD = tol;
    for (const door of this.map.doors) {
      const ends = M.doorEnds(this.map, door);
      if (!ends) continue;
      const d = segmentDistance(p, ends.a, ends.b);
      if (d < bestD) { bestD = d; best = { type: "door", id: door.id }; }
    }
    if (best) return best;
    const prop = M.propAt(this.map, p[0], p[1]);
    if (prop) return { type: "prop", id: prop.id };
    const hit = M.nearestWall(this.map, p[0], p[1], tol);
    if (hit) return { type: "wall", id: hit.wall.id };
    const path = M.nearestPath(this.map, p[0], p[1], 0);
    return path ? { type: "path", id: path.path.id } : null;
  }

  /** Repères des poignées d'un objet : coins, milieu du haut, poignée de rotation. */
  _propGizmo(prop, def) {
    const r = (prop.a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    const at = (lx, ly) => [prop.x + (lx * c - ly * s) * prop.k, prop.y + (lx * s + ly * c) * prop.k];
    const hw = def.w / 2, hh = def.h / 2;
    const lift = 26 / this.view.s / prop.k;
    return {
      corners: [at(-hw, -hh), at(hw, -hh), at(hw, hh), at(-hw, hh)],
      top: at(0, -hh),
      rot: at(0, -hh - lift),
      half: Math.hypot(hw, hh)
    };
  }

  /** Nœud ou poignée du mur sélectionné sous le pointeur. */
  _handleHit(p) {
    const sel = this.selection;
    const tol = HIT_PX / this.view.s;
    if (sel?.type === "prop") {
      const prop = this.map.props.find((q) => q.id === sel.id);
      const def = prop && M.propDef(this.map, prop.type);
      if (!def) return null;
      const g = this._propGizmo(prop, def);
      if (dist(g.rot, p) < tol * 1.2) return { kind: "rotate", id: prop.id };
      if (g.corners.some((c) => dist(c, p) < tol)) return { kind: "scale", id: prop.id, half: g.half };
      return null;
    }
    if (!isCurve(sel)) return null;
    const wall = M.curveById(this.map, sel.id);
    if (!wall) return null;
    for (let i = 0; i < wall.nodes.length; i++) {
      const n = wall.nodes[i];
      for (const which of ["i", "o"]) {
        if (n[which] && dist([n.x + n[which][0], n.y + n[which][1]], p) < tol) return { kind: "handle", index: i, which };
      }
    }
    for (let i = 0; i < wall.nodes.length; i++) {
      const n = wall.nodes[i];
      if (dist([n.x, n.y], p) < tol) return { kind: "node", index: i };
    }
    return null;
  }

  /** Mur visé par l'outil porte et bords de la porte qui y serait posée. */
  _doorTarget(p) {
    const hit = M.nearestWall(this.map, p[0], p[1], Math.max(0.6, (HIT_PX * 1.5) / this.view.s));
    if (!hit) return null;
    const w = Math.min(this.opts.doorWidth, hit.length);
    const s = hit.wall.closed ? hit.s : Math.min(Math.max(hit.s, w / 2), hit.length - w / 2);
    const a = M.pointOnWall(hit.wall, s - w / 2), b = M.pointOnWall(hit.wall, s + w / 2);
    return { wall: hit.wall, s, w, a: [a.x, a.y], b: [b.x, b.y] };
  }

  /** Nœuds d'un rectangle ou d'une ellipse entre deux coins (Maj : carré, cercle). */
  _shapeNodes(a, b) {
    let [x0, y0] = a, [x1, y1] = b;
    if (this.mods.shift) {
      const side = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      x1 = x0 + Math.sign(x1 - x0 || 1) * side;
      y1 = y0 + Math.sign(y1 - y0 || 1) * side;
    }
    if (Math.abs(x1 - x0) < 0.1 || Math.abs(y1 - y0) < 0.1) return null;
    const [lx, hx] = [Math.min(x0, x1), Math.max(x0, x1)], [ly, hy] = [Math.min(y0, y1), Math.max(y0, y1)];
    return this.opts.shapeMode === "ellipse"
      ? ellipseNodes((lx + hx) / 2, (ly + hy) / 2, (hx - lx) / 2, (hy - ly) / 2)
      : rectNodes(lx, ly, hx, hy);
  }

  /* -------------------------------------------- */
  /*  Événements : boutons et champs              */
  /* -------------------------------------------- */

  _onClick(event) {
    const b = event.target.closest("button");
    if (!b || !this.root.contains(b)) return;
    // Le panneau est reconstruit à chaque choix : on garde le clavier sur l'éditeur.
    if (!b.closest(".cad-map-options")) queueMicrotask(() => this.root.focus({ preventScroll: true }));
    if (b.dataset.tool) return this._setTool(b.dataset.tool);
    if (b.dataset.opt) {
      this.opts[b.dataset.opt] = b.dataset.val;
      if (["wallMode", "shapeMode", "pathMode"].includes(b.dataset.opt)) this.pen = null;
      this._renderPanel();
      return this._renderOverlay();
    }
    if (b.dataset.selDoorKind && this.selection?.type === "door") {
      this._begin();
      return this._commit(M.updateDoor(this.map, this.selection.id, { kind: b.dataset.selDoorKind }), { terrain: false });
    }
    switch (b.dataset.action) {
      case "undo": return this.undo();
      case "redo": return this.redo();
      case "grid": this.showGrid = !this.showGrid; this._updateTopbar(); return this.renderMap(false, false);
      case "snap": this.snap = !this.snap; return this._updateTopbar();
      case "fit": return this.fit();
      case "save": return this.save();
      case "export": return this.onExport?.(this.getMap());
      case "apply-size": return this._applySize();
      case "delete": return this._deleteSelection();
      case "duplicate": return this._duplicateSelection();
      case "open-library": return this.onOpenLibrary?.();
    }
  }

  _onOptionInput(event, committed) {
    const input = event.target;
    const field = input.dataset?.field;
    if (!field) return;
    const value = input.type === "checkbox" ? input.checked : input.tagName === "SELECT" ? input.value : Number(input.value);
    if (input.type === "range") input.nextElementSibling.textContent = f2(value);
    if (field in this.opts) {
      if (Number.isFinite(value)) this.opts[field] = value;
      return this._renderOverlay();
    }
    if (!committed || !this.selection) return;
    const id = this.selection.id;
    this._begin();
    let changed = false;
    if (field === "selWallClosed") changed = M.setWallClosed(this.map, id, value);
    else if (field === "selDoorWidth") changed = M.updateDoor(this.map, id, { w: value });
    else if (field === "selPropAngle") changed = M.updateProp(this.map, id, { a: value });
    else if (field === "selPropScale") changed = M.updateProp(this.map, id, { k: value });
    else if (field === "selPathWidth") changed = M.updatePath(this.map, id, { width: value });
    else if (field === "selPathEdgeWidth") changed = M.updatePath(this.map, id, { edgeWidth: value });
    else if (field === "selPathClosed") changed = M.updatePath(this.map, id, { closed: value });
    else if (field === "selPathTerrain" || field === "selPathEdge") {
      const key = value || null;
      if (!key || this._useAsset(key)) changed = M.updatePath(this.map, id, field === "selPathTerrain" ? { terrain: key } : { edge: key });
    }
    this._commit(changed, { terrain: false });
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
      this._commit(changed, { terrain: false });
    }
  }

  _applySize() {
    const f = this.el.mapOptions;
    const num = (name) => Number(f.querySelector(`[name="${name}"]`).value);
    this._begin();
    let changed = M.resizeMap(this.map, num("width"), num("height"));
    const gridSize = M.createMap({ gridSize: num("gridSize") }).gridSize;
    if (gridSize !== this.map.gridSize) { this.map.gridSize = gridSize; changed = true; }
    this._commit(changed, { full: true });
    this._syncMapFields();
    if (changed) this.fit();
  }

  _deleteSelection() {
    const sel = this.selection;
    if (!sel) return;
    this._begin();
    let changed = false;
    if (isCurve(sel) && this.selNode >= 0) {
      changed = M.removeNode(this.map, sel.id, this.selNode);
      this.selNode = -1;
    } else if (isCurve(sel)) changed = M.removeWall(this.map, sel.id);
    else if (sel.type === "door") changed = M.removeDoor(this.map, sel.id);
    else if (sel.type === "prop") changed = M.removeProp(this.map, sel.id);
    this._commit(changed, { terrain: false });
    this._renderPanel();
  }

  _duplicateSelection() {
    const sel = this.selection;
    if (!sel || sel.type === "door") return;
    this._begin();
    const copy = isCurve(sel) ? M.duplicateWall(this.map, sel.id) : M.duplicateProp(this.map, sel.id);
    this._commit(!!copy, { terrain: false });
    if (copy) this._select({ type: sel.type, id: copy.id });
  }

  /* -------------------------------------------- */
  /*  Événements : clavier                        */
  /* -------------------------------------------- */

  _onKeyDown(event) {
    this.mods = { alt: event.altKey, ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey };
    if (event.target.closest?.("input, select, textarea")) return;
    // L'éditeur garde le clavier : les raccourcis de Foundry (Ctrl+Z…) ne doivent pas agir sur la scène.
    event.stopPropagation();
    const ctrl = this.mods.ctrl;
    const key = event.key.toLowerCase();
    let handled = true;
    if (ctrl && key === "z") event.shiftKey ? this.redo() : this.undo();
    else if (ctrl && key === "y") this.redo();
    else if (ctrl && key === "s") this.save();
    else if (ctrl && key === "d") this._duplicateSelection();
    else if (!ctrl && TOOLS.some((x) => x.key === event.key)) this._setTool(TOOLS.find((x) => x.key === event.key).id);
    else if (!ctrl && key === "r") this._rotate(event.shiftKey ? -15 : 15);
    else if (key === "enter") this._finishPen(this.pen?.purpose === "shape");
    else if (key === "escape") { if (this.pen) this.pen = null; else if (this.drag) this._cancelDrag(); else this._select(null); }
    else if (key === "delete" || key === "backspace") {
      if (this.pen) { this.pen.nodes.pop(); if (!this.pen.nodes.length) this.pen = null; }
      else this._deleteSelection();
    }
    else if (key === "[" || key === "]") {
      const field = this.tool === "eraser" ? "eraserRadius" : "brushRadius";
      const k = key === "]" ? 1.25 : 0.8;
      this.opts[field] = f2(Math.min(5, Math.max(0.1, this.opts[field] * k)));
      this._renderPanel();
    }
    else if (key === " ") { this.spaceHeld = true; this.el.viewport.classList.add("cad-panning"); }
    else if (key === "alt" || key === "shift" || key === "control" || key === "meta") { /* modificateur seul */ }
    else handled = false;
    if (handled) event.preventDefault();
    this._renderOverlay();
  }

  _onKeyUp(event) {
    this.mods = { alt: event.altKey, ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey };
    if (event.key === " ") { this.spaceHeld = false; this.el.viewport.classList.remove("cad-panning"); }
    this._renderOverlay();
  }

  _rotate(deg) {
    if (this.tool === "prop") {
      this.opts.propAngle = ((this.opts.propAngle + deg) % 360 + 360) % 360;
      this._renderPanel();
      return this._renderOverlay();
    }
    if (this.selection?.type === "prop") {
      const prop = this.map.props.find((q) => q.id === this.selection.id);
      this._begin();
      this._commit(M.updateProp(this.map, prop.id, { a: prop.a + deg }), { terrain: false });
      this._renderPanel();
    }
  }

  /* -------------------------------------------- */
  /*  Événements : pointeur                       */
  /* -------------------------------------------- */

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
    this.mods = { alt: event.altKey, ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey };
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

    const o = this.opts;
    switch (this.tool) {
      case "select": {
        const h = this._handleHit(p);
        if (h) {
          this._begin();
          if (h.index != null) this.selNode = h.index;
          this.drag = { ...h, moved: false };
          break;
        }
        const hit = this._hitTest(p);
        this._select(hit);
        if (hit) {
          this._begin();
          const prop = hit.type === "prop" && this.map.props.find((q) => q.id === hit.id);
          this.drag = { kind: "move", target: hit, start: p, last: p, origin: prop ? [prop.x, prop.y] : null, moved: false };
        }
        break;
      }
      case "brush":
      case "eraser":
        this.drag = { kind: "stroke", points: [p], erase: this.tool === "eraser" || event.altKey };
        break;
      case "fill": {
        this._begin();
        const changed = this._useAsset(o.terrain) && M.fillAt(this.map, p[0], p[1], o.terrain, this._barrier());
        this._commit(changed);
        this._fillPreview = null;
        break;
      }
      case "shape":
        if (o.shapeMode === "pen") this._penDown(p, "shape");
        else this.drag = { kind: "shape", start: this._snap(p), end: null };
        break;
      case "wall":
        if (o.wallMode === "pen") this._penDown(p, "wall");
        else this.drag = { kind: "freewall", points: [this._snap(p, true)] };
        break;
      case "path":
        if (o.pathMode === "pen") this._penDown(p, "path");
        else this.drag = { kind: "freepath", points: [p] };
        break;
      case "door": {
        const target = this._doorTarget(p);
        if (!target) break;
        this._begin();
        const door = M.addDoor(this.map, target.wall.id, target.s, target.w, o.doorKind);
        this._commit(!!door, { terrain: false });
        break;
      }
      case "prop": {
        const [x, y] = this._snap(p);
        this._begin();
        this._commit(this._useAsset(o.propType) && !!M.addProp(this.map, o.propType, x, y, o.propAngle, o.propScale), { terrain: false });
        break;
      }
    }
    this._renderOverlay();
  }

  _onPointerMove(event) {
    this.mods = { alt: event.altKey, ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey };
    const p = this._toMap(event);
    this.pointer = p;
    this.el.coords.textContent = this.t("CADASTRE.Editor.Coords", { x: f2(p[0]).toFixed(1), y: f2(p[1]).toFixed(1) });

    const drag = this.drag;
    if (!drag) {
      if (this.tool === "select") this.hover = this._hitTest(p);
      if (this.tool === "fill") this._queueFillPreview(p);
      return this._schedule("overlay");
    }
    switch (drag.kind) {
      case "pan":
        this.view.tx = drag.tx + event.clientX - drag.x;
        this.view.ty = drag.ty + event.clientY - drag.y;
        this._applyView();
        break;
      case "stroke": {
        const last = drag.points.at(-1);
        if (dist(last, p) > 0.04) drag.points.push(p);
        break;
      }
      case "shape":
        drag.end = this._snap(p);
        break;
      case "freewall":
      case "freepath": {
        if (dist(drag.points.at(-1), p) > 0.08) drag.points.push(p);
        break;
      }
      case "rotate": {
        const prop = this.map.props.find((q) => q.id === drag.id);
        if (!prop) break;
        let a = (Math.atan2(p[1] - prop.y, p[0] - prop.x) * 180) / Math.PI + 90;
        if (!event.altKey) a = Math.round(a / 15) * 15; // Alt : rotation libre
        drag.moved = M.updateProp(this.map, prop.id, { a }) || drag.moved;
        this._schedule("map");
        break;
      }
      case "scale": {
        const prop = this.map.props.find((q) => q.id === drag.id);
        if (!prop) break;
        let k = Math.hypot(p[0] - prop.x, p[1] - prop.y) / drag.half;
        if (!event.altKey) k = Math.round(k / 0.05) * 0.05; // Alt : échelle libre
        drag.moved = M.updateProp(this.map, prop.id, { k }) || drag.moved;
        this._schedule("map");
        break;
      }
      case "pen": {
        const node = this.pen?.nodes[drag.index];
        if (!node) break;
        const d = [p[0] - node.x, p[1] - node.y];
        if (Math.hypot(...d) * this.view.s > 4) {
          node.o = [f2(d[0]), f2(d[1])];
          node.i = [-f2(d[0]), -f2(d[1])];
        }
        break;
      }
      case "node": {
        const sel = this.selection;
        const q = this._snap(p, sel.type === "wall", { wall: sel.id, index: drag.index });
        drag.moved = M.moveNode(this.map, sel.id, drag.index, q[0], q[1]) || drag.moved;
        this._schedule("map");
        break;
      }
      case "handle": {
        const wall = M.curveById(this.map, this.selection.id);
        const n = wall?.nodes[drag.index];
        if (n) drag.moved = M.moveHandle(this.map, wall.id, drag.index, drag.which, p[0] - n.x, p[1] - n.y, !event.altKey) || drag.moved;
        this._schedule("map");
        break;
      }
      case "move": {
        const t = drag.target;
        if (t.type === "prop") {
          const q = this._snap([drag.origin[0] + p[0] - drag.start[0], drag.origin[1] + p[1] - drag.start[1]]);
          drag.moved = M.updateProp(this.map, t.id, { x: q[0], y: q[1] }) || drag.moved;
        } else if (t.type === "wall" || t.type === "path") {
          let dx = p[0] - drag.start[0], dy = p[1] - drag.start[1];
          if (this.snap !== this.mods.ctrl) { dx = Math.round(dx / SNAP_STEP) * SNAP_STEP; dy = Math.round(dy / SNAP_STEP) * SNAP_STEP; }
          const [mx, my] = [dx - (drag.applied?.[0] ?? 0), dy - (drag.applied?.[1] ?? 0)];
          if (mx || my) {
            M.moveWall(this.map, t.id, mx, my);
            drag.applied = [dx, dy];
            drag.moved = true;
          }
        } else if (t.type === "door") {
          drag.moved = M.slideDoor(this.map, t.id, p[0], p[1]) || drag.moved;
        }
        this._schedule("map");
        break;
      }
    }
    this._schedule("overlay");
  }

  _onPointerUp() {
    const drag = this.drag;
    this.drag = null;
    this.el.viewport.classList.toggle("cad-panning", this.spaceHeld);
    if (!drag) return;
    const o = this.opts;
    switch (drag.kind) {
      case "stroke": {
        const r = this.tool === "eraser" ? o.eraserRadius : o.brushRadius;
        const rings = P.strokeRings(drag.points, r);
        this._begin();
        let changed;
        if (this.tool === "eraser") {
          const m = o.eraseMode;
          changed = M.eraseArea(this.map, rings, { floor: m === "all" || m === "floor", walls: m === "all" || m === "walls", props: m === "all" || m === "props" });
        } else if (drag.erase) {
          changed = M.eraseArea(this.map, rings, { floor: true, walls: false, props: false });
        } else {
          changed = this._useAsset(o.terrain) && M.paintArea(this.map, rings, o.terrain);
        }
        this._commit(changed);
        break;
      }
      case "shape": {
        const nodes = drag.end && this._shapeNodes(drag.start, drag.end);
        if (nodes) this._createShape(nodes);
        break;
      }
      case "freewall": {
        const pts = rdp(drag.points, 0.05);
        if (pts.length < 2 || polylineLength(pts) < 0.2) break;
        const closed = pts.length > 3 && dist(pts[0], pts.at(-1)) < 0.35;
        if (closed) pts.pop();
        this._begin();
        this._commit(!!M.addWall(this.map, smoothNodes(pts, closed), closed), { terrain: false });
        break;
      }
      case "freepath": {
        const pts = rdp(drag.points, 0.05);
        if (pts.length < 2 || polylineLength(pts) < 0.3) break;
        const closed = pts.length > 3 && dist(pts[0], pts.at(-1)) < Math.max(0.35, o.pathWidth / 2);
        if (closed) pts.pop();
        this._createPath(smoothNodes(pts, closed), closed);
        break;
      }
      case "rotate":
      case "scale":
      case "node":
      case "handle":
      case "move":
        if (drag.moved) this._commit(true, { terrain: false });
        else this._pending = null;
        if (drag.kind === "move" && this.tool === "select") this._renderPanel();
        break;
    }
    this._renderOverlay();
  }

  _onDoubleClick(event) {
    const p = this._toMap(event);
    if (this.pen) {
      // Le double-clic a déjà posé deux nœuds au même endroit : on retire le doublon.
      const nodes = this.pen.nodes;
      if (nodes.length > 1 && dist([nodes.at(-1).x, nodes.at(-1).y], [nodes.at(-2).x, nodes.at(-2).y]) < 0.05) nodes.pop();
      return this._finishPen(this.pen.purpose === "shape");
    }
    if (this.tool !== "select" || !isCurve(this.selection)) return;
    const h = this._handleHit(p);
    this._begin();
    if (h?.kind === "node") {
      this._commit(M.toggleNodeSmooth(this.map, this.selection.id, h.index), { terrain: false });
    } else if (this._hitTest(p)?.id === this.selection.id) {
      const index = M.insertNode(this.map, this.selection.id, p[0], p[1]);
      this._commit(index >= 0, { terrain: false });
      this.selNode = index;
      this._renderPanel();
    } else {
      this._pending = null;
    }
    this._renderOverlay();
  }

  _cancelDrag() {
    const drag = this.drag;
    this.drag = null;
    if (drag && ["node", "handle", "move"].includes(drag.kind)) this._rollback();
    this._renderOverlay();
  }

  /* -------------------------------------------- */
  /*  Plume                                       */
  /* -------------------------------------------- */

  _penDown(p, purpose) {
    if (!this.pen || this.pen.purpose !== purpose) this.pen = { purpose, nodes: [] };
    const nodes = this.pen.nodes;
    const first = nodes[0];
    if (first && nodes.length >= 2 && dist([first.x, first.y], p) * this.view.s < HIT_PX) {
      return this._finishPen(true);
    }
    const [x, y] = this._snap(p, purpose === "wall");
    nodes.push({ x, y });
    this.drag = { kind: "pen", index: nodes.length - 1 };
  }

  _finishPen(closed) {
    const pen = this.pen;
    this.pen = null;
    if (!pen) return;
    const nodes = pen.nodes.map(cleanNode);
    if (pen.purpose === "shape") {
      if (nodes.length >= 3) this._createShape(nodes);
    } else if (pen.purpose === "path") {
      if (nodes.length >= 2) this._createPath(nodes, closed && nodes.length >= 3);
    } else if (nodes.length >= 2) {
      this._begin();
      this._commit(!!M.addWall(this.map, nodes, closed && nodes.length >= 3), { terrain: false });
    }
    this._renderOverlay();
  }

  /* -------------------------------------------- */
  /*  Remplissage                                 */
  /* -------------------------------------------- */

  /** Murs épaissis, recalculés seulement quand les murs ou les portes changent. */
  _barrier() {
    const sig = JSON.stringify([this.map.walls, this.map.width, this.map.height]);
    if (this._barrierCache?.sig !== sig) this._barrierCache = { sig, rings: M.wallBarrier(this.map) };
    return this._barrierCache.rings;
  }

  /** Aperçu de la pièce qui serait remplie, calculé quand le pointeur ralentit. */
  _queueFillPreview(p) {
    clearTimeout(this._fillTimer);
    const inside = this._fillPreview?.rings.length && P.pointInRings(this._fillPreview.rings, p[0], p[1])
      && this._fillPreview.sig === this._barrierCache?.sig;
    if (inside) return;
    this._fillPreview = null;
    this._fillTimer = setTimeout(() => {
      if (this.tool !== "fill" || !this.pointer) return;
      const rings = M.enclosedArea(this.map, this.pointer[0], this.pointer[1], M.FILL_WALL_RADIUS, this._barrier());
      this._fillPreview = { rings, sig: this._barrierCache.sig };
      this._renderOverlay();
    }, 90);
  }

  /* -------------------------------------------- */
  /*  Bibliothèque                                */
  /* -------------------------------------------- */

  /** Nouvelle liste d'assets (bibliothèque modifiée ailleurs) : la palette et les copies de la carte suivent. */
  setLibrary(library) {
    this.library = normalizeLibrary(library);
    if (refreshMapAssets(this.map, this.library)) {
      this._setDirty(true);
      this.renderMap(true);
    }
    for (const [opt, kind] of [["terrain", "texture"], ["propType", "prop"]]) {
      const key = this.opts[opt];
      if (isAssetKey(key) && !this._libraryAsset(key, kind) && !this.map.assets?.[assetIdOf(key)]) {
        this.opts[opt] = opt === "terrain" ? "stone" : PROPS[0].id;
      }
    }
    this._renderPanel();
    this._renderOverlay();
  }

  _libraryAsset(key, kind = null) {
    const id = assetIdOf(key);
    const a = id && this.library.find((x) => x.id === id);
    return a && (!kind || a.kind === kind) ? a : null;
  }

  /**
   * Copie dans la carte l'asset de bibliothèque choisi, juste avant de l'utiliser.
   * Renvoie false si la clé ne désigne rien d'utilisable.
   */
  _useAsset(key) {
    if (!isAssetKey(key)) return true;
    if (this.map.assets?.[assetIdOf(key)]) return true;
    const asset = this._libraryAsset(key);
    return !!(asset && embedAsset(this.map, asset));
  }

  /** Sols proposés dans les listes : intégrés, puis textures de la carte et de la bibliothèque. */
  _terrainChoices() {
    const out = TERRAINS.map((x) => [x.id, this.t(`CADASTRE.Terrains.${x.id}`)]);
    const seen = new Set();
    for (const [id, a] of Object.entries(this.map.assets ?? {})) if (a.kind === "texture") { seen.add(id); out.push([assetKey(id), a.name]); }
    for (const a of this.library) if (a.kind === "texture" && !seen.has(a.id)) out.push([assetKey(a.id), a.name]);
    return out;
  }

  _propDef(type) {
    return M.propDef(this.map, type) ?? this._libraryAsset(type, "prop");
  }

  _propName(type) {
    if (!isAssetKey(type)) return this.t(`CADASTRE.Props.${type}`);
    return (this.map.assets?.[assetIdOf(type)] ?? this._libraryAsset(type))?.name ?? type;
  }

  /**
   * Remplissage d'un sol pour les aperçus. Une texture de bibliothèque pas encore
   * utilisée dans la carte n'a pas de motif : on en ajoute un à part.
   */
  _fill(key) {
    if (isAssetKey(key) && !this.map.assets?.[assetIdOf(key)]) {
      const a = this._libraryAsset(key, "texture");
      if (a) {
        const id = terrainPatternId(`${this.prefix}-x`, key);
        if (this.el.extraDefs.dataset.key !== key) {
          this.el.extraDefs.dataset.key = key;
          this.el.extraDefs.innerHTML = `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${a.w}" height="${a.h}">`
            + `<image href="${esc(this.resolve(a.src))}" width="${a.w}" height="${a.h}" preserveAspectRatio="none"/></pattern>`;
        }
        return `url(#${id})`;
      }
    }
    return terrainFill(this.prefix, key);
  }

  /** Assets de la bibliothèque dans la palette d'un outil, avec recherche et accès à la gestion. */
  _libraryPalette(kind, opt) {
    const t = this.t;
    const field = kind === "texture" ? "terrain" : "prop";
    const all = this.library.filter((a) => a.kind === kind);
    const found = filterAssets(all, { query: this.search[field] });
    const current = this.opts[opt];
    const shown = found.slice(0, PALETTE_LIMIT);
    // L'asset choisi reste visible même s'il sort de la recherche.
    const chosen = this._libraryAsset(current, kind);
    if (chosen && !shown.includes(chosen)) shown.unshift(chosen);

    let html = `<div class="cad-lib-head"><h3>${esc(t("CADASTRE.Panel.Library"))}</h3>`
      + (this.onOpenLibrary ? `<button type="button" data-action="open-library" title="${esc(t("CADASTRE.Panel.ManageLibrary"))}"><i class="fa-solid fa-book-atlas"></i></button>` : "")
      + `</div>`;
    if (!all.length) return html + `<p class="cad-note">${esc(t(kind === "texture" ? "CADASTRE.Panel.NoTextures" : "CADASTRE.Panel.NoProps"))}</p>`;
    html += `<input type="search" class="cad-search" data-search="${field}" placeholder="${esc(t("CADASTRE.Panel.Search"))}" value="${esc(this.search[field])}">`;
    html += `<div class="cad-swatches cad-lib ${kind === "texture" ? "" : "cad-props"}">${shown.map((a) => {
      const key = assetKey(a.id);
      return `<button type="button" data-opt="${opt}" data-val="${key}" class="${key === current ? "active" : ""}" title="${esc(`${a.name} · ${a.w} × ${a.h}`)}">
        <span class="cad-thumb${kind === "texture" ? " tile" : ""}" style="background-image:url(&quot;${esc(this.resolve(a.src))}&quot;)"></span>
        <span>${esc(a.name)}</span></button>`;
    }).join("")}</div>`;
    if (found.length > PALETTE_LIMIT) html += `<p class="cad-note">${esc(t("CADASTRE.Panel.MoreResults", { n: found.length - PALETTE_LIMIT }))}</p>`;
    if (!found.length) html += `<p class="cad-note">${esc(t("CADASTRE.Panel.NoResults"))}</p>`;
    return html;
  }

  _onSearch(event) {
    const field = event.target.dataset?.search;
    if (!field) return;
    this.search[field] = event.target.value;
    const pos = event.target.selectionStart;
    this._renderPanel();
    const input = this.el.toolOptions.querySelector(`[data-search="${field}"]`);
    input?.focus();
    input?.setSelectionRange(pos, pos);
  }

  _createPath(nodes, closed) {
    const o = this.opts;
    const edge = o.pathEdge || null;
    this._begin();
    const ok = this._useAsset(o.pathTerrain) && (!edge || this._useAsset(edge));
    const path = ok && M.addPath(this.map, nodes, { closed, width: o.pathWidth, terrain: o.pathTerrain, edge, edgeWidth: o.pathEdgeWidth });
    this._commit(!!path, { terrain: false });
  }

  _createShape(nodes) {
    const o = this.opts;
    this._begin();
    let changed;
    if (!this._useAsset(o.terrain)) return this._commit(false);
    if (o.shapeTarget === "room") {
      changed = M.addRoom(this.map, nodes, o.terrain);
    } else {
      const ring = P.pointsRing(flattenNodes(nodes, true, 0.005));
      changed = M.paintArea(this.map, P.normalizeRings([ring]), o.terrain);
    }
    this._commit(changed);
  }
}

function segmentDistance([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

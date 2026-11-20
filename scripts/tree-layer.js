/**
 * Arbres générés, dans Foundry. Les scènes exportées par Cadastre gardent leurs arbres en pages
 * d'images (drapeau `cadastre.trees`), découpés en morceaux rigides : le tronc et les grosses
 * branches d'un côté, chaque branche (avec ses rameaux et ses feuilles) de l'autre. Ce calque,
 * au-dessus de l'herbe et sous les jetons, les pose et fait pivoter chaque branche autour de son
 * point d'attache, comme du bois : rien n'est déformé, chaque feuille garde sa forme.
 *
 * Le vent est celui de l'herbe, à la même horloge : une rafale qui couche l'herbe passe dans
 * l'arbre au même moment. Chaque branche est un petit ressort amorti (elle a du poids : elle
 * suit la rafale avec retard, la dépasse un peu, revient), à son propre rythme. Le sapin plie
 * d'un bloc : ses étages glissent sous le vent, plus haut plus loin.
 * Effets coupés (réglage du vent à 0), les arbres restent, immobiles.
 */
import { MODULE_ID, log } from "./constants.js";
import { normalizeWind, WIND_LEVELS } from "./wind.js";
import { gustAt, windClock } from "./grass.js";
import { treeSprites } from "./tree-sprites.js";
import { pieceRecord } from "./tree-pack.js";

/** Au-dessus de l'herbe (même rang, ordre 1), sous les tuiles et les jetons. */
const SORT_LAYER = 100;

/**
 * Réglages du mouvement. MAX_TURN : rotation d'une branche de travers au vent par grand vent
 * (radians) ; SWAY : balancement propre ; STIFF / DAMP : ressort et amortissement.
 */
const MAX_TURN = 0.11, SWAY = 0.035, STIFF = 9, DAMP = 3.2, CONIFER_SHIFT = 0.09;

/** Poussée du vent sur l'arbre : la force réglée, modulée par la rafale locale (0..1 de l'herbe). */
export const treePush = (strength, g) => strength * (0.35 + 0.9 * g);

/**
 * Images d'arbres lissées à toutes les échelles : des réductions calculées d'avance (mipmaps)
 * évitent que les feuilles scintillent (« frisent ») dès que l'arbre est affiché plus petit que
 * son image, surtout quand les branches bougent.
 */
function smooth(base) {
  if (!base) return;
  base.mipmap = PIXI.MIPMAP_MODES?.ON ?? 1;
  base.scaleMode = PIXI.SCALE_MODES?.LINEAR ?? 1;
  base.anisotropicLevel = 4;
  base.update?.();
}

const hash = (n) => { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };

/**
 * Pose les morceaux d'un arbre : un sprite par morceau, accroché à son point d'attache.
 * src : { pieces:[{ tex, …pieceRecord }], ppc } ; les positions sont relatives au pied du tronc.
 */
function setPieces(tr, pieces, ppc, sceneSize) {
  tr.box.removeChildren().forEach((c) => c.destroy());
  tr.box.scale.set(sceneSize / ppc);
  tr.ppc = ppc;
  tr.parts = pieces.map((q) => {
    const sp = new PIXI.Sprite(q.tex);
    sp.anchor.set(Math.min(1.5, Math.max(-0.5, (q.ax - q.ox) / q.w)), Math.min(1.5, Math.max(-0.5, (q.ay - q.oy) / q.h)));
    // Ancre hors de l'image (point d'attache sur la branche mère, juste à côté) : la position
    // compense, l'image reste à sa place au repos.
    sp.position.set(q.ox + sp.anchor.x * q.w, q.oy + sp.anchor.y * q.h);
    tr.box.addChild(sp);
    const L = Math.hypot(q.lx, q.ly) / ppc;                   // longueur du bras de levier, en cases
    const ux = L ? q.lx / ppc / L : 0, uy = L ? q.ly / ppc / L : 0;
    const old = tr.parts?.find((p) => p.id === q.id);
    return {
      id: q.id, sp, base: q.id === 0, L, ux, uy, hz: q.hz ?? 0,
      // Rythme propre : les grosses branches lentes, les petites plus vives.
      w: 1.4 + 1.6 / Math.sqrt(0.4 + L) + hash(q.id + tr.seed) * 0.6, ph: hash(q.id * 7.1 + tr.seed) * 6.28,
      th: old?.th ?? 0, v: old?.v ?? 0, dx: old?.dx ?? 0, dy: old?.dy ?? 0
    };
  });
}

/**
 * Un conteneur par arbre, posé sur la scène (pixels de scène), avec ses morceaux.
 * @returns {object[]}  { box, x, y, r (cases), item, parts, ppc }
 */
export function treeSprites2(root, items, pages, { size, ox, oy, ppc }) {
  const tex = new Map();
  const region = (q) => {
    const page = pages[q.page];
    if (!page) return null;
    return new PIXI.Texture(page.color.baseTexture ?? page.color, new PIXI.Rectangle(q.u, q.v, q.w, q.h));
  };
  return items.map((t) => {
    const box = new PIXI.Container();
    box.position.set(ox + t.x * size, oy + t.y * size);
    box.rotation = ((t.spin ?? 0) * Math.PI) / 180;
    root.addChild(box);
    const tp = t.ppc ?? ppc;
    const tr = { box, x: t.x, y: t.y, r: t.half / tp, item: t, seed: (t.seed ?? 0) % 997 };
    // Scènes exportées avant les morceaux (0.1.17 à 0.1.20) : l'arbre d'une seule image, immobile.
    const pieces = t.pieces ?? [{ id: 0, page: t.page, u: t.u, v: t.v, w: t.size, h: t.size, ox: -t.half, oy: -t.half, ax: 0, ay: 0, lx: 0, ly: 0 }];
    setPieces(tr, pieces.map((q) => ({ ...q, tex: region(q) })).filter((q) => q.tex), tp, size);
    return tr;
  });
}

/**
 * Une image : le vent lu de part et d'autre de chaque arbre visible (view : rectangle en cases),
 * puis chaque branche avance d'un pas de ressort vers l'angle que lui donne le vent.
 */
export function stepTrees(trees, t, dt, wind, dir, [x0, y0, x1, y1], animated = true, viewPpc = 100) {
  for (const tr of trees) {
    // Direction du vent dans le repère de la plante (petites plantes tournées à l'affichage).
    const sr = -tr.box.rotation, dx = dir[0] * Math.cos(sr) - dir[1] * Math.sin(sr), dy = dir[0] * Math.sin(sr) + dir[1] * Math.cos(sr);
    const vis = tr.x + tr.r >= x0 && tr.x - tr.r <= x1 && tr.y + tr.r >= y0 && tr.y - tr.r <= y1;
    tr.box.visible = vis;
    if (!vis || !animated || tr.item.rigid || tr.parts.length < 2) continue;
    // Trop petit à l'écran pour qu'un balancement se voie : on ne calcule rien.
    if (tr.r * viewPpc < 18) continue;
    // La rafale traverse la couronne : vent lu au vent, au centre et sous le vent.
    const k = tr.r * 0.8;
    const g0 = gustAt(tr.x - dir[0] * k, tr.y - dir[1] * k, t, wind), g1 = gustAt(tr.x, tr.y, t, wind), g2 = gustAt(tr.x + dir[0] * k, tr.y + dir[1] * k, t, wind);
    const conifer = tr.item.conifer, ppc = tr.ppc;
    for (const p of tr.parts) {
      if (p.base) continue;
      // Position de la branche le long du vent (-1 au vent, 1 sous le vent).
      const sx = p.sp.position.x / ppc + p.ux * p.L * 0.5, sy = p.sp.position.y / ppc + p.uy * p.L * 0.5;
      const a = Math.max(-1, Math.min(1, (sx * dx + sy * dy) / Math.max(0.3, tr.r)));
      const g = a < 0 ? g1 + (g0 - g1) * -a : g1 + (g2 - g1) * a;
      const push = treePush(wind.strength, g);
      // Couple du vent sur la branche : maximal quand elle est de travers, nul dans l'axe du vent.
      const cross = p.ux * dy - p.uy * dx;
      const turn = conifer ? 0 : 1;
      const target = push * (MAX_TURN * turn * cross + SWAY * turn * Math.sin(t * p.w + p.ph));
      // Ressort amorti (pas de temps borné) : la branche a du poids.
      const h = Math.min(dt, 0.05);
      p.v += (STIFF * (target - p.th) - DAMP * p.v) * h;
      p.th += p.v * h;
      p.sp.rotation = p.th;
      if (conifer) {
        // Le sapin plie d'un bloc : chaque étage glisse sous le vent, d'autant plus qu'il est haut.
        const shift = push * CONIFER_SHIFT * ppc * Math.min(1, p.hz / Math.max(0.5, tr.r * 2.5)) * (0.8 + 0.2 * Math.sin(t * p.w * 0.6 + p.ph));
        p.dx += (dx * shift - p.dx) * Math.min(1, h * 2.5);
        p.dy += (dy * shift - p.dy) * Math.min(1, h * 2.5);
        const q = p.rest ?? (p.rest = [p.sp.position.x, p.sp.position.y]);
        p.sp.position.set(q[0] + p.dx, q[1] + p.dy);
      }
    }
  }
}

/* -------------------------------------------- */
/*  Netteté au zoom                             */
/* -------------------------------------------- */

/**
 * Finesses possibles en zoomant (pixels par case). Les images affinées coûtent cher en mémoire
 * graphique : leur total est plafonné (SHARP_BUDGET pixels), un seul arbre est redessiné à la fois
 * et un seul est envoyé à la carte graphique par image, pour ne jamais figer l'affichage.
 */
const SHARP_LEVELS = [400, 560];
const SHARP_BUDGET = 32e6;
/** Pixels envoyés à la carte graphique par image au plus (le reste attend l'image suivante). */
const UPLOAD_PER_FRAME = 2e6;
const MAX_SPRITE = 2048;
const SHARP_BUSY = 2;

/**
 * Comme Vellum pour les images vectorielles : quand on zoome plus loin que la finesse des images
 * envoyées avec la scène, les arbres à l'écran sont redessinés plus fins (en arrière-plan, depuis
 * leur graine), du centre de l'écran vers les bords, puis remplacés au vol ; en dézoomant, ils
 * reprennent leurs images d'origine.
 */
export class TreeSharpener {
  constructor(trees, sceneSize, pages) {
    this.trees = trees.filter((t) => t.item.kind && t.item.pieces);
    this.size = sceneSize;
    this.pages = pages;
    this.lastPpc = 0;
    this.stableSince = 0;
    this.sharp = new Set();
    this.used = 0;
    this.busy = 0;
    this.ready = [];
    this.dead = false;
  }

  /** Pixels estimés d'un arbre affiné (les morceaux se chevauchent : environ deux fois la boîte). */
  _cost(tr, ppc) {
    const side = 2 * (tr.item.radius + 0.5) * ppc;
    return 1.2 * side * side;
  }

  update(viewPpc, now, view) {
    this._upload();
    if (Math.abs(viewPpc - this.lastPpc) > 1) { this.lastPpc = viewPpc; this.stableSince = now; return; }
    if (now - this.stableSince < 350) return;
    // Dézoom : on rend la mémoire tout de suite.
    for (const tr of this.sharp) if (this._level(tr, viewPpc) <= tr.item.ppc) this._restore(tr);
    // Affiner sans worker se ferait dans la page et la figerait : on garde alors les images de la scène.
    if (this.busy >= SHARP_BUSY || treeSprites.noWorker) return;
    const [x0, y0, x1, y1] = view ?? [0, 0, 0, 0], cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const todo = this.trees
      .filter((tr) => tr.box.visible && !tr.pending)
      .map((tr) => ({ tr, want: this._level(tr, viewPpc), d: (tr.x - cx) ** 2 + (tr.y - cy) ** 2 }))
      .filter((o) => o.want > o.tr.item.ppc && o.want !== o.tr.ppc)
      .sort((a, b) => a.d - b.d);
    for (const { tr, want } of todo) {
      if (this.busy >= SHARP_BUSY) break;
      const cost = this._cost(tr, want) - (tr.sharpPx ?? 0);
      // Place faite en libérant les arbres affinés sortis de l'écran.
      while (this.used + cost > SHARP_BUDGET) {
        const old = [...this.sharp].find((x) => !x.box.visible);
        if (!old) break;
        this._restore(old);
      }
      if (this.used + cost > SHARP_BUDGET) break;
      this._request(tr, want);
    }
  }

  _level(tr, viewPpc) {
    if (viewPpc <= tr.item.ppc * 1.15) return tr.item.ppc;
    const cap = Math.floor((MAX_SPRITE - 8) / (2 * (tr.item.radius + 0.5)));
    const lvl = SHARP_LEVELS.find((l) => l >= viewPpc) ?? SHARP_LEVELS.at(-1);
    return Math.max(tr.item.ppc, Math.min(lvl, cap));
  }

  async _request(tr, ppc) {
    tr.pending = ppc;
    this.busy++;
    const reserved = this._cost(tr, ppc);
    this.used += reserved;
    let r = null;
    try {
      const it = tr.item;
      r = await treeSprites.get({ kind: it.kind, seed: it.seed, radius: it.radius, rotation: it.rot, ppc, detail: 1, background: true });
      r.shadow?.close?.();
    } catch (error) {
      log("Arbre non affiné", error);
    } finally {
      this.busy--;
      this.used -= reserved;
    }
    if (!r || this.dead || tr.pending !== ppc || !tr.box.visible) {
      for (const q of r?.pieces ?? []) q.img?.close?.();
      if (tr.pending === ppc) tr.pending = 0;
      return;
    }
    const px = r.pieces.reduce((n, q) => n + q.w * q.h, 0);
    this.used += px;
    // Vu de près, pas besoin de réductions : images lissées simples, sans mipmaps.
    const tex = r.pieces.map((q) => PIXI.Texture.from(q.img, { mipmap: PIXI.MIPMAP_MODES?.OFF ?? 0, scaleMode: PIXI.SCALE_MODES?.LINEAR ?? 1 }));
    this.ready.push({ tr, ppc, r, px, tex, sent: 0 });
  }

  /**
   * Envoie les images prêtes à la carte graphique par petites portions à chaque image : un gros
   * arbre envoyé d'un coup figerait l'affichage. L'arbre n'est remplacé qu'une fois tout envoyé.
   */
  _upload() {
    const job = this.ready[0];
    if (!job) return;
    const gl = this.renderer?.texture;
    let budget = UPLOAD_PER_FRAME;
    while (gl && job.sent < job.tex.length && budget > 0) {
      const t = job.tex[job.sent++];
      budget -= t.width * t.height;
      try { gl.bind(t); } catch { /* envoyé au premier affichage */ }
    }
    if (gl && job.sent < job.tex.length) return;
    this.ready.shift();
    this._apply(job);
  }

  _apply({ tr, ppc, r, px, tex }) {
    this.used -= px;
    const stale = this.dead || tr.pending !== ppc || this._level(tr, this.lastPpc) !== ppc;
    if (tr.pending === ppc) tr.pending = 0;
    if (stale) { for (const t of tex) t.destroy(true); for (const q of r.pieces) q.img?.close?.(); return; }
    this._drop(tr);
    tr.sharpTex = tex;
    tr.sharpImg = r.pieces.map((q) => q.img);
    setPieces(tr, r.pieces.map((q, i) => ({ ...pieceRecord(q, r.half), tex: tex[i] })), ppc, this.size);
    tr.sharpPx = px;
    this.used += px;
    this.sharp.add(tr);
  }

  _drop(tr) {
    for (const t of tr.sharpTex ?? []) t.destroy(true);
    for (const i of tr.sharpImg ?? []) i?.close?.();
    tr.sharpTex = tr.sharpImg = null;
    if (this.sharp.has(tr)) this.used -= tr.sharpPx ?? 0;
    tr.sharpPx = 0;
    this.sharp.delete(tr);
  }

  _restore(tr) {
    const page = (q) => this.pages[q.page];
    const pieces = tr.item.pieces.map((q) => ({ ...q, tex: page(q) ? new PIXI.Texture(page(q).color.baseTexture ?? page(q).color, new PIXI.Rectangle(q.u, q.v, q.w, q.h)) : null })).filter((q) => q.tex);
    setPieces(tr, pieces, tr.item.ppc, this.size);
    this._drop(tr);
  }

  destroy() {
    this.dead = true;
    for (const { r, tex } of this.ready) { for (const t of tex) t.destroy(true); for (const q of r.pieces) q.img?.close?.(); }
    this.ready = [];
    for (const tr of this.trees) this._drop(tr);
  }
}

/** Plantes du drapeau, quelle que soit sa version (v4 : modèles partagés, morceaux en tableaux). */
export function expandItems(data) {
  if ((data.v ?? 1) < 4) return data.items;
  const models = (data.models ?? []).map((m) => ({
    ...m,
    pieces: m.pieces.map(([page, u, v, w, h, ox, oy, ax, ay, lx, ly, hz, id]) => ({ page, u, v, w, h, ox, oy, ax, ay, lx, ly, hz, id }))
  }));
  return data.items.map(([x, y, m, spin]) => models[m] && { ...models[m], x, y, spin }).filter(Boolean);
}

let state = null;

export function registerTrees() {
  Hooks.on("canvasReady", () => refresh());
  Hooks.on("canvasTearDown", () => teardown());
  Hooks.on("updateScene", (scene, changes) => {
    if (scene.id === canvas.scene?.id && foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`)) refresh();
  });
}

/** Le réglage du vent a changé (wind-layer.js) : les arbres suivent. */
export const refreshTrees = () => refresh();

function teardown() {
  if (!state) return;
  state.dead = true;
  if (state.tick) canvas.app?.ticker?.remove(state.tick);
  state.sharpener?.destroy();
  if (state.root && !state.root.destroyed) state.root.destroy({ children: true });
  state = null;
}

const loadTex = (src) => (foundry.canvas?.loadTexture ?? globalThis.loadTexture)(src);

async function refresh() {
  teardown();
  const data = canvas.scene?.getFlag(MODULE_ID, "trees");
  if (!data?.items?.length || !data.pages?.length) return;
  const me = state = { dead: false };
  try {
    const pages = await Promise.all(data.pages.map(async (p) => ({ ...p, color: await loadTex(p.color) })));
    if (me.dead) return;
    for (const p of pages) smooth(p.color?.baseTexture);
    const d = canvas.dimensions;
    const size = d.size, ox = d.sceneX ?? d.sceneRect?.x ?? 0, oy = d.sceneY ?? d.sceneRect?.y ?? 0;
    const ppc = data.ppc || size;
    const wind = normalizeWind(data.wind);
    let level = WIND_LEVELS.FULL;
    try { level = Number(game.settings.get(MODULE_ID, "windLevel")); } catch { /* réglage absent */ }
    const animated = level > 0 && wind.strength > 0;
    const a = (wind.dir * Math.PI) / 180, dir = [Math.cos(a), Math.sin(a)];

    const root = new PIXI.Container();
    root.eventMode = "none";
    Object.assign(root, { elevation: 0, sortLayer: SORT_LAYER, sort: 2 });
    const parent = canvas.primary ?? canvas.stage;
    parent.addChild(root);
    parent.sortDirty = true;
    me.root = root;

    const trees = treeSprites2(root, expandItems(data), pages, { size, ox, oy, ppc });
    const sharpener = me.sharpener = new TreeSharpener(trees, size, pages);
    sharpener.renderer = canvas.app.renderer;
    let last = windClock();
    me.tick = () => {
      const t = windClock(), dt = Math.max(0, Math.min(0.1, t - last));
      last = t;
      const r = canvas.app.renderer, inv = canvas.stage.worldTransform.clone().invert();
      const p0 = inv.apply(new PIXI.Point(0, 0)), p1 = inv.apply(new PIXI.Point(r.screen.width, r.screen.height));
      const x0 = (Math.min(p0.x, p1.x) - ox) / size, y0 = (Math.min(p0.y, p1.y) - oy) / size;
      const x1 = (Math.max(p0.x, p1.x) - ox) / size, y1 = (Math.max(p0.y, p1.y) - oy) / size;
      const viewPpc = size * Math.abs(canvas.stage.scale.x);
      stepTrees(trees, t, dt, wind, dir, [x0, y0, x1, y1], animated, viewPpc);
      sharpener.update(viewPpc * (r.resolution ?? 1), performance.now(), [x0, y0, x1, y1]);
    };
    me.tick();
    canvas.app.ticker.add(me.tick);
  } catch (error) {
    log("Arbres non affichés", error);
    if (state === me) teardown();
  }
}

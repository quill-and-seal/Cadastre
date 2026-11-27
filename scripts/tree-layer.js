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
import { diagLine, diagLoaded, diagMemory, textureBytes } from "./diagnostic.js";
import { shadeLayer, scheduleMask } from "./shade-layer.js";
import { sunState } from "./sun.js";
import { MODULE_ID, log } from "./constants.js";
import { normalizeWind, WIND_LEVELS } from "./wind.js";
import { gustAt, windClock } from "./grass.js";
import { treeSprites } from "./tree-sprites.js";
import { pieceRecord } from "./tree-pack.js";

/** Au-dessus de l'herbe (même rang, ordre 1), sous les tuiles et les jetons. */
const SORT_LAYER = 100;
/** Intensités des ombres (réglage), de légère à très marquée. */

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
export function treeSprites2(root, items, pages, { size, ox, oy, ppc, shadowPages = [], sppc = 0 }) {
  const region = (q, list = pages) => {
    const page = list[q.page];
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
    // Ombre : silhouette de la couronne vue d'en haut (pied du tronc en cx, cy de son image),
    // projetée selon le soleil par TreeShadows.
    const tex = t.s && sppc ? region({ page: t.s[0], u: t.s[1], v: t.s[2], w: t.s[3], h: t.s[4] }, shadowPages) : null;
    if (tex) tr.shadow = { tex, cx: t.s[5], cy: t.s[6], k: size / sppc };
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

/**
 * Forêts regroupées au dézoom : quand une case fait moins de BAKE_BELOW pixels à l'écran, le vent
 * ne se voit plus et des milliers de morceaux d'arbres coûtent pour rien. Les arbres sont alors
 * dessinés une fois, par zones de BAKE_CHUNK cases, dans quelques images fixes (BAKE_PPC pixels par
 * case) affichées à leur place. En rezoomant (au-delà de BAKE_ABOVE), les vrais arbres reviennent.
 * Les zones sont préparées petit à petit (quelques millisecondes par image), puis gardées.
 */
const BAKE_PPC = 32;
const BAKE_BELOW = 26;
const BAKE_ABOVE = 34;
const BAKE_CHUNK = 8;
const BAKE_MS = 4;

export class TreeBaker {
  constructor(root, trees, { size, ox, oy, renderer }) {
    this.trees = trees;
    this.size = size; this.ox = ox; this.oy = oy;
    this.renderer = renderer;
    this.layer = new PIXI.Container();
    this.layer.eventMode = "none";
    root.addChild(this.layer);
    this.active = false;
    // Zones : arbres rattachés à la zone de leur centre ; l'image déborde du plus grand d'entre eux.
    const chunks = new Map();
    for (const tr of trees) {
      const cx = Math.floor(tr.x / BAKE_CHUNK), cy = Math.floor(tr.y / BAKE_CHUNK), id = `${cx},${cy}`;
      let c = chunks.get(id);
      if (!c) chunks.set(id, c = { cx, cy, trees: [], margin: 0, sprite: null, rt: null });
      c.trees.push(tr);
      c.margin = Math.max(c.margin, tr.r + 0.1);
    }
    this.chunks = [...chunks.values()];
    this.bytes = 0;
  }

  /** @returns {boolean} arbres regroupés (le vent n'a alors rien à calculer) */
  update(viewPpc, view) {
    if (!this.renderer) return false;
    if (!this.active && viewPpc < BAKE_BELOW) this.active = true;
    else if (this.active && viewPpc > BAKE_ABOVE) this._leave();
    if (!this.active) return false;
    const [x0, y0, x1, y1] = view;
    const t0 = performance.now();
    for (const c of this.chunks) {
      const m = c.margin;
      const seen = (c.cx + 1) * BAKE_CHUNK + m >= x0 && c.cx * BAKE_CHUNK - m <= x1 && (c.cy + 1) * BAKE_CHUNK + m >= y0 && c.cy * BAKE_CHUNK - m <= y1;
      if (!c.sprite && seen && performance.now() - t0 < BAKE_MS) this._bake(c);
      if (c.sprite) {
        c.sprite.visible = seen;
        for (const tr of c.trees) tr.box.visible = false;
      } else {
        // Pas encore préparée : ses vrais arbres restent, immobiles.
        for (const tr of c.trees) tr.box.visible = seen;
      }
    }
    return true;
  }

  _leave() {
    this.active = false;
    for (const c of this.chunks) if (c.sprite) c.sprite.visible = false;
  }

  _draw(objects, rect, ppc, layer) {
    const r = drawFixed(this.renderer, objects, rect, ppc, this);
    layer.addChild(r.sprite);
    this.bytes += r.bytes;
    return r;
  }

  _bake(c) {
    const m = c.margin, span = BAKE_CHUNK + 2 * m;
    // Petites plantes d'abord, comme dans le calque.
    ({ rt: c.rt, sprite: c.sprite } = this._draw(c.trees.map((tr) => tr.box), [c.cx * BAKE_CHUNK - m, c.cy * BAKE_CHUNK - m, span, span], BAKE_PPC, this.layer));
    diagMemory("forêts regroupées", this.bytes);
  }

  get count() { return this.chunks.filter((c) => c.sprite?.visible).length; }

  destroy() {
    for (const c of this.chunks) c.rt?.destroy(true);
    diagMemory("forêts regroupées", 0);
  }
}

/**
 * Dessine des objets de la scène dans une image fixe (avec réductions : vue de loin, elle reste
 * lisse au lieu de scintiller). rect : [x, y, largeur, hauteur] en cases ; ppc : pixels par case.
 * @returns {{rt, sprite, bytes:number}}  sprite : l'image, posée à sa place sur la scène
 */
function drawFixed(renderer, objects, [wx, wy, ww, wh], ppc, { size, ox, oy }, mipmap = true) {
  const pw = Math.max(1, Math.ceil(ww * ppc)), ph = Math.max(1, Math.ceil(wh * ppc));
  // Avec réductions (mipmaps) : vue de très loin, la forêt reste lisse au lieu de scintiller.
  const rt = PIXI.RenderTexture.create({ width: pw, height: ph, scaleMode: PIXI.SCALE_MODES?.LINEAR ?? 1, mipmap: mipmap ? (PIXI.MIPMAP_MODES?.ON ?? 1) : (PIXI.MIPMAP_MODES?.OFF ?? 0) });
  const k = ppc / size;
  const transform = new PIXI.Matrix(k, 0, 0, k, -(ox + wx * size) * k, -(oy + wy * size) * k);
  let first = true;
  for (const o of objects) {
    const was = o.visible;
    o.visible = true;
    renderer.render(o, { renderTexture: rt, transform, clear: first });
    o.visible = was;
    first = false;
  }
  const sprite = new PIXI.Sprite(rt);
  sprite.position.set(ox + wx * size, oy + wy * size);
  sprite.scale.set(1 / k);
  return { rt, sprite, bytes: pw * ph * 4 * 4 / 3 };
}

/**
 * Ombres des arbres au soleil réglé (sun.js), posées dans le calque des ombres de la scène
 * (shade-layer.js), sur l'herbe et sous les arbres. Chaque morceau de l'arbre (tronc, branches)
 * porte sa propre ombre : la même image, décalée selon sa hauteur le long des rayons du soleil, et
 * tournée comme lui quand le vent le balance. Le calque des ombres la peint d'une seule couleur.
 * En plus : une tache sombre au pied et l'ombre du tronc jusqu'au bas de la couronne.
 */
let footTex = null;
function footTexture() {
  if (footTex && !footTex.baseTexture.destroyed) return footTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return (footTex = PIXI.Texture.from(c));
}

export class TreeShadows {
  constructor(layer, trees, { size }) {
    this.size = size;
    this.group = layer.trees.addChild(new PIXI.Container());
    this.trees = trees;
    for (const tr of trees) {
      const node = new PIXI.Container();
      node.position.copyFrom(tr.box.position);
      node.foot = node.addChild(new PIXI.Sprite(footTexture()));
      node.foot.anchor.set(0.5);
      node.foot.width = node.foot.height = tr.r * 1.1 * size;
      node.foot.alpha = 0.45;
      node.trunk = node.addChild(new PIXI.Sprite(PIXI.Texture.WHITE));
      node.trunk.anchor.set(0, 0.5);
      node.trunk.alpha = 0.85;
      node.trunkW = Math.max(0.05, tr.r * 0.05) * size;
      // Morceaux : dans un conteneur qui reprend la rotation et l'échelle de l'arbre.
      node.box = node.addChild(new PIXI.Container());
      tr.shadowNode = node;
      this.group.addChild(node);
    }
    this.beforeMask = () => this.update(null, sunState());
    (layer.beforeMask ??= new Set()).add(this.beforeMask);
    this.layer = layer;
    this.update(null, sunState());
    scheduleMask();
  }

  /** Ombres des morceaux, refaites quand l'arbre change d'images (netteté au zoom). */
  _build(tr) {
    const node = tr.shadowNode;
    node.box.removeChildren().forEach((c) => c.destroy());
    node.box.rotation = tr.box.rotation;
    node.box.scale.copyFrom(tr.box.scale);
    node.sprites = tr.parts.map((p) => {
      const sp = new PIXI.Sprite(p.sp.texture);
      sp.anchor.copyFrom(p.sp.anchor);
      return node.box.addChild(sp);
    });
    const hz = tr.parts.filter((p) => !p.base).map((p) => p.hz);
    // Bas de la couronne : la branche la plus basse ; haut : la plus haute.
    node.zlo = tr.item.z?.[0] ?? (hz.length ? Math.min(...hz) : 0);
    node.zhi = tr.item.z?.[1] ?? (hz.length ? Math.max(...hz) : 0);
    node.partsRef = tr.parts;
  }

  /** Place les ombres (view : [x0, y0, x1, y1] en cases, null : toute la carte). */
  update(view, sun) {
    const { dir, len } = sun, size = this.size;
    for (const tr of this.trees) {
      const node = tr.shadowNode;
      if (node.partsRef !== tr.parts) this._build(tr);
      if (view) {
        const reach = node.zhi * len + tr.r + 0.5;
        const vis = tr.x + reach >= view[0] && tr.x - reach <= view[2] && tr.y + reach >= view[1] && tr.y - reach <= view[3];
        node.visible = vis;
        if (!vis) continue;
      }
      // Décalage d'une case de hauteur, dans le repère des morceaux (pixels de l'arbre, tournés).
      const rot = -tr.box.rotation, c = Math.cos(rot), s = Math.sin(rot), k = len * tr.ppc;
      const lx = (dir[0] * c - dir[1] * s) * k, ly = (dir[0] * s + dir[1] * c) * k;
      for (let i = 0; i < tr.parts.length; i++) {
        const p = tr.parts[i], sp = node.sprites[i];
        // Le tronc (morceau 0) part du pied : seulement ses parties hautes s'en éloignent.
        const z = p.base ? Math.min(p.hz, node.zlo) * 0.5 : p.hz;
        sp.position.set(p.sp.position.x + lx * z, p.sp.position.y + ly * z);
        sp.rotation = p.sp.rotation;
      }
      const L = Math.max(0, node.zlo * len) * size;
      node.trunk.visible = L > 2;
      node.trunk.rotation = Math.atan2(dir[1], dir[0]);
      node.trunk.width = L;
      node.trunk.height = node.trunkW;
    }
  }

  destroy() {
    this.layer.beforeMask?.delete(this.beforeMask);
    if (!this.group.destroyed) this.group.destroy({ children: true });
    scheduleMask();
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
  // « Précharger chez les joueurs » de Vellum : les images des arbres et de leurs ombres partent avec la scène.
  Hooks.on("vellumPreload", (scene, add) => {
    const data = scene.getFlag(MODULE_ID, "trees");
    for (const p of [...(data?.pages ?? []), ...(data?.shadows?.pages ?? [])]) add(p.color);
    const shade = scene.getFlag(MODULE_ID, "shade");
    if (shade?.src) add(shade.src);
  });
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
  state.baker?.destroy();
  state.shadows?.destroy();
  state.stats?.remove();
  diagMemory("arbres", 0);
  diagMemory("arbres affinés", 0);
  diagMemory("ombres des arbres", 0);
  if (state.root && !state.root.destroyed) state.root.destroy({ children: true });
  state = null;
}

const loadTex = (src) => (foundry.canvas?.loadTexture ?? globalThis.loadTexture)(src);

async function refresh() {
  teardown();
  const data = canvas.scene?.getFlag(MODULE_ID, "trees");
  if (!data?.items?.length || !data.pages?.length) return;
  const me = state = { dead: false };
  const start = performance.now();
  try {
    const load = (list) => Promise.all((list ?? []).map(async (p) => ({ ...p, color: await loadTex(p.color) })));
    // Les images d'ombres exportées ne servent plus : chaque morceau d'arbre porte sa propre ombre.
    const pages = await load(data.pages), shadowPages = [];
    if (me.dead) return;
    for (const p of [...pages, ...shadowPages]) smooth(p.color?.baseTexture);
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
    // Vellum ne doit pas reprendre ces images : Cadastre gère lui-même leur netteté (des milliers
    // de morceaux d'arbres agrandis un par un figeaient l'affichage au zoom).
    root.vellumIgnore = true;
    root._vellumPatch = true;
    Object.assign(root, { elevation: 0, sortLayer: SORT_LAYER, sort: 2 });
    const parent = canvas.primary ?? canvas.stage;
    parent.addChild(root);
    me.root = root;

    parent.sortDirty = true;

    const trees = treeSprites2(root, expandItems(data), pages, { size, ox, oy, ppc, shadowPages, sppc: data.shadows?.ppc ?? 0 });
    // Ombres (scènes exportées depuis la 0.1.27 ; avant, elles sont dans l'image de fond).
    // Scènes exportées avant la 0.1.27 : les ombres sont dans l'image de fond.
    const layer = data.shadows ? shadeLayer() : null;
    const shadows = me.shadows = layer ? new TreeShadows(layer, trees, { size, ox, oy }) : null;
    me.shadowPages = shadowPages;
    const sharpener = me.sharpener = new TreeSharpener(trees, size, pages);
    sharpener.renderer = canvas.app.renderer;
    const baker = me.baker = new TreeBaker(root, trees, { size, ox, oy, renderer: canvas.app.renderer });
    const stats = me.stats = diagLine("Arbres");
    diagMemory("ombres des arbres", shadowPages.reduce((n, p) => n + textureBytes(p.color?.baseTexture), 0));
    const pageBytes = pages.reduce((n, p) => n + textureBytes(p.color?.baseTexture), 0);
    diagMemory("arbres", pageBytes);
    let frames = 0, cpuMs = 0, lastStats = performance.now();
    let last = windClock();
    me.tick = () => {
      const c0 = stats ? performance.now() : 0;
      const t = windClock(), dt = Math.max(0, Math.min(0.1, t - last));
      last = t;
      const r = canvas.app.renderer, inv = canvas.stage.worldTransform.clone().invert();
      const p0 = inv.apply(new PIXI.Point(0, 0)), p1 = inv.apply(new PIXI.Point(r.screen.width, r.screen.height));
      const x0 = (Math.min(p0.x, p1.x) - ox) / size, y0 = (Math.min(p0.y, p1.y) - oy) / size;
      const x1 = (Math.max(p0.x, p1.x) - ox) / size, y1 = (Math.max(p0.y, p1.y) - oy) / size;
      const viewPpc = size * Math.abs(canvas.stage.scale.x);
      // Dézoomé : forêts regroupées en quelques images fixes, rien à animer.
      if (!baker.update(viewPpc * (r.resolution ?? 1), [x0, y0, x1, y1])) stepTrees(trees, t, dt, wind, dir, [x0, y0, x1, y1], animated, viewPpc);
      sharpener.update(viewPpc * (r.resolution ?? 1), performance.now(), [x0, y0, x1, y1]);
      shadows?.update([x0, y0, x1, y1], sunState());
      if (stats) {
        frames++; cpuMs += performance.now() - c0;
        const now = performance.now();
        if (now - lastStats > 500) {
          let seen = 0, parts = 0;
          for (const tr of trees) if (tr.box.visible) { seen++; parts += tr.parts.length; }
          diagMemory("arbres affinés", sharpener.used * 4);
          stats.textContent = (baker.active
            ? `Arbres : regroupés (dézoom) · ${baker.count} images · ${seen} arbres pas encore regroupés`
            : `Arbres : ${seen} / ${trees.length} à l'écran · ${parts.toLocaleString()} morceaux`)
            + ` · ${sharpener.sharp.size} affinés (${(sharpener.used * 4 / 1048576).toFixed(0)} Mo)`
            + ` · calcul ${(cpuMs / frames).toFixed(2)} ms` + (animated ? "" : " · vent coupé")
            + (shadows ? (shadows.todo ? ` · ombres : ${shadows.todo} dalles à peindre` : "") : " · ombres anciennes, dans l'image de fond : réexporter la carte");
          frames = 0; cpuMs = 0; lastStats = now;
        }
      }
    };
    me.tick();
    diagLoaded("arbres", start);
    canvas.app.ticker.add(me.tick);
  } catch (error) {
    log("Arbres non affichés", error);
    if (state === me) teardown();
  }
}

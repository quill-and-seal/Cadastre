/**
 * Arbres générés, dans Foundry. Les scènes exportées par Cadastre gardent leurs arbres en pages
 * d'images (drapeau `cadastre.trees`) : l'arbre et sa carte du vent. Ce calque, au-dessus de
 * l'herbe et sous les jetons, les pose et les fait ployer au vent — le même vent que l'herbe, à
 * la même horloge : une rafale qui couche l'herbe passe dans l'arbre au même moment.
 * Effets coupés (réglage du vent à 0), les arbres restent, immobiles.
 */
import { MODULE_ID, log } from "./constants.js";
import { normalizeWind, WIND_LEVELS } from "./wind.js";
import { gustAt, windClock } from "./grass.js";
import { treeSprites } from "./tree-sprites.js";

/** Au-dessus de l'herbe (même rang, ordre 1), sous les tuiles et les jetons. */
const SORT_LAYER = 100;

const VERT = `precision highp float;
attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;
uniform mat3 projectionMatrix;
uniform mat3 translationMatrix;
varying vec2 vUV;
varying vec2 vLocal;
void main() {
  vUV = aTextureCoord;
  vLocal = aVertexPosition;
  gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
}`;

/**
 * La carte du vent dit, en chaque point de l'arbre, sa souplesse (R), la phase de sa grosse
 * branche (G) et celle de son rameau (B, feuilles seulement). La couronne se couche sous le vent
 * et balance ; la rafale la traverse dans le sens du vent ; les feuilles frémissent.
 */
export const TREE_FRAG = `precision highp float;
varying vec2 vUV;
varying vec2 vLocal;
uniform sampler2D uColor;
uniform sampler2D uData;
uniform vec4 uRect;
uniform vec2 uTexel;
uniform vec2 uDir;
uniform vec3 uGust;
uniform float uT;
uniform float uStr;
uniform float uAmp;
uniform float uFlut;
uniform float uHalf;
uniform float uAlpha;
void main() {
  vec4 w = texture2D(uData, vUV);
  float bend = w.r, ph = w.g * 6.2831, tp = w.b * 255.0;
  float along = clamp(dot(vLocal, uDir) / uHalf, -1.0, 1.0);
  float g = along < 0.0 ? mix(uGust.y, uGust.x, -along) : mix(uGust.y, uGust.z, along);
  float sway = g * (0.65 + 0.25 * sin(uT * 1.9 + ph) + 0.06 * sin(uT * 3.1 + ph * 2.0));
  vec2 side = vec2(-uDir.y, uDir.x);
  vec2 off = bend * uAmp * uStr * (uDir * sway + side * 0.15 * g * sin(uT * 1.4 + ph * 1.7));
  float leaf = step(0.05, w.b);
  off += leaf * uFlut * uStr * (0.3 + 0.5 * g) * vec2(sin(uT * 5.0 + tp), cos(uT * 6.3 + tp * 1.3));
  vec2 uv = clamp(vUV - off * uTexel, uRect.xy, uRect.zw);
  gl_FragColor = texture2D(uColor, uv) * uAlpha;
}`;

/** Force du vent locale (0..1 de l'herbe) → poussée sur l'arbre. */
export const treeGust = (g) => 0.3 + 1.2 * g;

/** Pose une image d'arbre sur son maillage : texture (page ou image seule), cadre, finesse. */
function setSprite(tr, { color, data, pw, ph, u, v, half, ppc }, sceneSize) {
  const size = half * 2, u0 = u / pw, v0 = v / ph, u1 = (u + size) / pw, v1 = (v + size) / ph;
  tr.mesh.geometry.getBuffer("aVertexPosition").update(new Float32Array([-half, -half, half, -half, half, half, -half, half]));
  tr.mesh.geometry.getBuffer("aTextureCoord").update(new Float32Array([u0, v0, u1, v0, u1, v1, u0, v1]));
  const U = tr.uniforms;
  Object.assign(U, { uColor: color, uData: data, uHalf: half, uAmp: ppc * 0.22, uFlut: Math.max(0.6, ppc * 0.006) });
  U.uRect.set([u0 + 0.5 / pw, v0 + 0.5 / ph, u1 - 0.5 / pw, v1 - 0.5 / ph]);
  U.uTexel.set([1 / pw, 1 / ph]);
  tr.mesh.scale.set(sceneSize / ppc);
  tr.ppc = ppc;
}

/**
 * Un maillage par arbre, posé sur la scène (pixels de scène), lisant sa page d'images.
 * @returns {object[]}  { mesh, uniforms, x, y, r (cases), ppc, base (image d'origine), item }
 */
export function treeMeshes(root, items, pages, { size, ox, oy, ppc, dir, strength }) {
  const program = PIXI.Program.from(VERT, TREE_FRAG);
  return items.map((t) => {
    const page = pages[t.page];
    if (!page) return null;
    const geometry = new PIXI.Geometry()
      .addAttribute("aVertexPosition", new Float32Array(8), 2)
      .addAttribute("aTextureCoord", new Float32Array(8), 2)
      .addIndex([0, 1, 2, 0, 2, 3]);
    const uniforms = {
      uColor: page.color, uData: page.data, uRect: new Float32Array(4), uTexel: new Float32Array(2),
      uDir: new Float32Array(dir), uGust: new Float32Array([0.75, 0.75, 0.75]),
      uT: 0, uStr: strength, uAmp: 0, uFlut: 0, uHalf: 1, uAlpha: 1
    };
    const mesh = new PIXI.Mesh(geometry, new PIXI.Shader(program, uniforms));
    mesh.position.set(ox + t.x * size, oy + t.y * size);
    root.addChild(mesh);
    // Chaque arbre a sa finesse (pixels par case) ; v1 : celle de toute la scène.
    const base = { color: page.color, data: page.data, pw: page.w, ph: page.h, u: t.u, v: t.v, half: t.half, ppc: t.ppc ?? ppc };
    const tr = { mesh, uniforms, x: t.x, y: t.y, r: t.half / base.ppc, base, item: t };
    setSprite(tr, base, size);
    return tr;
  }).filter(Boolean);
}

/* -------------------------------------------- */
/*  Netteté au zoom                             */
/* -------------------------------------------- */

/** Finesses possibles en zoomant (pixels par case), et nombre d'arbres gardés aussi fins. */
const SHARP_LEVELS = [400, 560];
const SHARP_KEEP = 16;
const MAX_SPRITE = 4096;

/**
 * Comme Vellum pour les images vectorielles : quand on zoome plus loin que la finesse des images
 * envoyées avec la scène, les arbres à l'écran sont redessinés plus fins (en arrière-plan, depuis
 * leur graine), puis remplacés au vol ; en dézoomant, ils reprennent leur image d'origine.
 */
export class TreeSharpener {
  constructor(trees, sceneSize) {
    this.trees = trees.filter((t) => t.item.kind);
    this.size = sceneSize;
    this.lastPpc = 0;
    this.stableSince = 0;
    this.sharp = new Set();
    this.dead = false;
  }

  /** viewPpc : pixels d'écran par case. */
  update(viewPpc, now) {
    if (Math.abs(viewPpc - this.lastPpc) > 1) { this.lastPpc = viewPpc; this.stableSince = now; return; }
    if (now - this.stableSince < 350) return;
    for (const tr of this.trees) {
      const want = this._level(tr, viewPpc);
      if (want <= tr.base.ppc) { if (tr.ppc !== tr.base.ppc && !tr.pending) this._restore(tr); continue; }
      if (!tr.mesh.visible || want === tr.ppc || want === tr.pending) continue;
      // Place pour un arbre de plus : on rend son image d'origine à un arbre hors de l'écran.
      if (this.sharp.size >= SHARP_KEEP && !this.sharp.has(tr)) {
        const old = [...this.sharp].find((x) => !x.mesh.visible);
        if (!old) continue;
        this._restore(old);
      }
      this._request(tr, want);
    }
  }

  _level(tr, viewPpc) {
    if (viewPpc <= tr.base.ppc * 1.15) return tr.base.ppc;
    const cap = Math.floor((MAX_SPRITE - 8) / (2 * (tr.item.radius + 0.5)));
    const lvl = SHARP_LEVELS.find((l) => l >= viewPpc) ?? SHARP_LEVELS.at(-1);
    return Math.max(tr.base.ppc, Math.min(lvl, cap));
  }

  async _request(tr, ppc) {
    tr.pending = ppc;
    try {
      const it = tr.item;
      const r = await treeSprites.get({ kind: it.kind, seed: it.seed, radius: it.radius, rotation: it.rot, ppc, detail: 1 });
      if (this.dead || tr.pending !== ppc) { for (const b of [r.color, r.data, r.shadow]) b?.close?.(); return; }
      r.shadow?.close?.();
      const color = PIXI.Texture.from(r.color), data = PIXI.Texture.from(r.data);
      this._drop(tr);
      tr.sharpTex = [color, data];
      setSprite(tr, { color, data, pw: r.half * 2, ph: r.half * 2, u: 0, v: 0, half: r.half, ppc }, this.size);
      this.sharp.delete(tr); this.sharp.add(tr);
    } catch (error) {
      log("Arbre non affiné", error);
    } finally {
      if (tr.pending === ppc) tr.pending = 0;
    }
  }

  _drop(tr) {
    for (const t of tr.sharpTex ?? []) t.destroy(true);
    tr.sharpTex = null;
  }

  _restore(tr) {
    this._drop(tr);
    this.sharp.delete(tr);
    setSprite(tr, tr.base, this.size);
  }

  destroy() {
    this.dead = true;
    for (const tr of this.trees) this._drop(tr);
  }
}

/** Une image : le vent lu de part et d'autre de chaque arbre visible (view : rectangle en cases). */
export function stepTrees(trees, t, wind, dir, [x0, y0, x1, y1], animated = true) {
  for (const tr of trees) {
    const vis = tr.x + tr.r >= x0 && tr.x - tr.r <= x1 && tr.y + tr.r >= y0 && tr.y - tr.r <= y1;
    tr.mesh.visible = vis;
    if (!vis || !animated) continue;
    const k = tr.r * 0.8, g = tr.uniforms.uGust;
    g[0] = treeGust(gustAt(tr.x - dir[0] * k, tr.y - dir[1] * k, t, wind));
    g[1] = treeGust(gustAt(tr.x, tr.y, t, wind));
    g[2] = treeGust(gustAt(tr.x + dir[0] * k, tr.y + dir[1] * k, t, wind));
    tr.uniforms.uT = t;
  }
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
    const pages = await Promise.all(data.pages.map(async (p) => ({ ...p, color: await loadTex(p.color), data: await loadTex(p.data) })));
    if (me.dead) return;
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

    const trees = treeMeshes(root, data.items, pages, { size, ox, oy, ppc, dir, strength: animated ? wind.strength : 0 });

    const sharpener = me.sharpener = new TreeSharpener(trees, size);
    me.tick = () => {
      const t = windClock();
      const r = canvas.app.renderer, inv = canvas.stage.worldTransform.clone().invert();
      const p0 = inv.apply(new PIXI.Point(0, 0)), p1 = inv.apply(new PIXI.Point(r.screen.width, r.screen.height));
      const x0 = (Math.min(p0.x, p1.x) - ox) / size, y0 = (Math.min(p0.y, p1.y) - oy) / size;
      const x1 = (Math.max(p0.x, p1.x) - ox) / size, y1 = (Math.max(p0.y, p1.y) - oy) / size;
      stepTrees(trees, t, wind, dir, [x0, y0, x1, y1], animated);
      sharpener.update(size * Math.abs(canvas.stage.scale.x) * (r.resolution ?? 1), performance.now());
    };
    me.tick();
    canvas.app.ticker.add(me.tick);
  } catch (error) {
    log("Arbres non affichés", error);
    if (state === me) teardown();
  }
}

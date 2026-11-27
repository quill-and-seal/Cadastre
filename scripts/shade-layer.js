/**
 * Ombres de la scène, au soleil de l'heure réglée (sun.js) : un calque entre l'herbe et les arbres.
 *  - objets et murs : une carte des hauteurs (exportée avec la scène) ; la carte graphique cherche,
 *    pour chaque point, ce qui se dresse entre lui et le soleil ;
 *  - arbres : le calque des arbres y pose l'ombre de chacun (tree-layer.js), qui suit le vent.
 * Le tout est aplati puis rendu transparent d'un bloc (deux ombres qui se croisent ne
 * s'additionnent pas), et gommé au-dessus de l'eau animée : c'est l'eau qui se dessine à l'ombre,
 * d'après un petit masque des ombres (shadow-mask.js), refait quand le soleil change.
 */
import { MODULE_ID, log } from "./constants.js";
import { sunState } from "./sun.js";
import { setShadowMask } from "./shadow-mask.js";
import { diagMemory } from "./diagnostic.js";

/** Au-dessus de l'herbe (même rang, ordre 1), sous les arbres (ordre 2). */
const SORT_LAYER = 100, SORT = 1.5;
/** Intensités des ombres (réglage « Intensité des ombres des arbres »). */
export const SHADOW_LEVELS = [0.35, 0.6, 0.8, 1];
/** Finesse du masque lu par l'eau, et de la gomme de l'eau (pixels par case). */
const MASK_PPC = 16, ERASE_PPC = 16;
/** Couleur des ombres (comme tree-paint.js). */
export const SHADE_COLOR = 0x050e1c;

let shade = null;

/** Intensité réglée (0..1). */
export function shadowLevel() {
  try { return Number(game.settings.get(MODULE_ID, "treeShadow")) || SHADOW_LEVELS[3]; } catch { return SHADOW_LEVELS[3]; }
}

const HEIGHT_VERT = `
precision highp float;
attribute vec2 aVertexPosition;
uniform mat3 projectionMatrix;
uniform mat3 translationMatrix;
varying vec2 vPos;
void main() {
  vPos = aVertexPosition;
  gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
}`;

/** Ombres des objets et des murs : ce qui, entre le point et le soleil, est plus haut que le rayon. */
const HEIGHT_FRAG = `
precision highp float;
varying vec2 vPos;
uniform sampler2D uHeight;
uniform vec2 uSize;
uniform vec2 uDir;
uniform float uLen, uMax, uReach;
float H(vec2 p) {
  if (p.x < 0.0 || p.y < 0.0 || p.x > uSize.x || p.y > uSize.y) return 0.0;
  return texture2D(uHeight, p / uSize).r * uMax;
}
void main() {
  // Intérieur d'une pièce (vert) : à l'abri du soleil.
  vec2 q = vPos / uSize;
  if (q.x >= 0.0 && q.y >= 0.0 && q.x <= 1.0 && q.y <= 1.0 && texture2D(uHeight, q).g > 0.5) { gl_FragColor = vec4(0.0); return; }
  float h0 = H(vPos);
  float sh = 0.0;
  for (int i = 1; i <= 32; i++) {
    float s = uReach * float(i) / 32.0;
    float need = h0 + s / uLen;
    sh = max(sh, smoothstep(need - 0.04, need + 0.04, H(vPos - uDir * s)));
  }
  sh *= 0.92;
  gl_FragColor = vec4(vec3(${((SHADE_COLOR >> 16) / 255).toFixed(3)}, ${(((SHADE_COLOR >> 8) & 255) / 255).toFixed(3)}, ${((SHADE_COLOR & 255) / 255).toFixed(3)}) * sh, sh);
}`;

/**
 * Calque des ombres de la scène affichée (créé à la demande).
 * @returns {{root, content, trees, size:number, ox:number, oy:number}|null}
 *   trees : où le calque des arbres pose ses ombres
 */
export function shadeLayer() {
  if (shade && !shade.root.destroyed) return shade;
  if (!canvas?.ready && !canvas?.dimensions) return null;
  const d = canvas.dimensions;
  const parent = canvas.primary ?? canvas.stage;
  if (!d || !parent) return null;
  const root = new PIXI.Container();
  root.eventMode = "none";
  root.vellumIgnore = true;
  root._vellumPatch = true;
  Object.assign(root, { elevation: 0, sortLayer: SORT_LAYER, sort: SORT });
  const Alpha = PIXI.AlphaFilter ?? PIXI.filters?.AlphaFilter;
  const filter = Alpha ? new Alpha(shadowLevel()) : null;
  if (filter) root.filters = [filter];
  else root.alpha = shadowLevel();
  const content = root.addChild(new PIXI.Container());
  const heights = content.addChild(new PIXI.Container());
  const trees = content.addChild(new PIXI.Container());
  parent.addChild(root);
  parent.sortDirty = true;
  shade = {
    root, content, heights, trees, filter, mesh: null, maskRt: null, eraser: null, maskTimer: 0,
    size: d.size, ox: d.sceneX ?? d.sceneRect?.x ?? 0, oy: d.sceneY ?? d.sceneRect?.y ?? 0,
    width: Math.round((d.sceneWidth ?? 0) / d.size), height: Math.round((d.sceneHeight ?? 0) / d.size)
  };
  let waterLevel = 0;
  try { waterLevel = Number(game.settings.get(MODULE_ID, "waterLevel")); } catch { /* réglage absent */ }
  if (waterLevel) setEraser(canvas.scene?.getFlag(MODULE_ID, "water")?.rings);
  applySun();
  return shade;
}

/** Intensité changée : appliquée tout de suite. */
export function refreshShadeLevel() {
  if (!shade) return;
  const level = shadowLevel() * sunState().light;
  if (shade.filter) shade.filter.alpha = level;
  else shade.root.alpha = level;
  if (shade.mask) shade.mask.level = level;
}

/** Soleil changé : objets et murs suivent ; le calque des arbres lit sunState() à chaque image. */
function applySun() {
  if (!shade) return;
  const sun = sunState();
  const u = shade.mesh?.shader.uniforms;
  if (u) {
    u.uDir = new Float32Array(sun.dir);
    u.uLen = sun.len;
    u.uReach = Math.min(8, u.uMax * sun.len);
  }
  refreshShadeLevel();
  scheduleMask();
}

/** Masque des ombres pour l'eau, refait un peu après le dernier changement. */
export function scheduleMask() {
  if (!shade) return;
  clearTimeout(shade.maskTimer);
  shade.maskTimer = setTimeout(drawMask, 250);
}

function drawMask() {
  if (!shade || shade.root.destroyed) return;
  const { size, ox, oy, width, height } = shade;
  const renderer = canvas.app?.renderer;
  if (!renderer || !width || !height) return;
  const ppc = Math.min(MASK_PPC, 4096 / Math.max(width, height));
  const w = Math.ceil(width * ppc), h = Math.ceil(height * ppc);
  if (!shade.maskRt || shade.maskRt.width !== w || shade.maskRt.height !== h) {
    shade.maskRt?.destroy(true);
    shade.maskRt = PIXI.RenderTexture.create({ width: w, height: h, scaleMode: PIXI.SCALE_MODES?.LINEAR ?? 1 });
  }
  const k = ppc / size;
  try {
    // Le contenu seul (sans la gomme de l'eau), hors de l'écran : toute la carte.
    // Ombres des arbres placées partout (pas seulement à l'écran), le temps du dessin.
    for (const f of shade.beforeMask ?? []) f();
    const nodes = shade.trees.children.flatMap((g) => g.children);
    const shown = nodes.map((c) => c.visible);
    for (const c of nodes) c.visible = true;
    renderer.render(shade.content, { renderTexture: shade.maskRt, transform: new PIXI.Matrix(k, 0, 0, k, -ox * k, -oy * k), clear: true });
    nodes.forEach((c, i) => { c.visible = shown[i]; });
  } catch (error) {
    log("Masque des ombres non dessiné", error);
    return;
  }
  shade.mask = { texture: shade.maskRt, rect: [0, 0, width, height], level: shadowLevel() * sunState().light };
  setShadowMask(shade.mask);
}

/**
 * Gomme de l'eau animée : sur l'eau, l'ombre n'est pas posée par-dessus, c'est l'eau qui se dessine
 * à l'ombre (sans reflets, plus sombre). Image de l'eau (îles comprises), en dernier dans le calque.
 */
function setEraser(rings) {
  if (!shade) return;
  shade.eraser?.destroy(true);
  shade.eraser = null;
  if (!rings?.length) return;
  const { size, ox, oy } = shade;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (let i = 0; i < r.length; i += 2) {
    x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]); y0 = Math.min(y0, r[i + 1]); y1 = Math.max(y1, r[i + 1]);
  }
  if (!(x1 > x0 && y1 > y0)) return;
  const ppc = Math.min(ERASE_PPC, 4096 / Math.max(x1 - x0, y1 - y0));
  const c = document.createElement("canvas");
  c.width = Math.ceil((x1 - x0) * ppc) + 2; c.height = Math.ceil((y1 - y0) * ppc) + 2;
  const x = c.getContext("2d");
  x.beginPath();
  for (const r of rings) {
    for (let i = 0; i < r.length; i += 2) {
      const px = (r[i] - x0) * ppc + 1, py = (r[i + 1] - y0) * ppc + 1;
      if (i) x.lineTo(px, py); else x.moveTo(px, py);
    }
    x.closePath();
  }
  x.fillStyle = "#fff";
  x.fill("evenodd");
  const sprite = new PIXI.Sprite(PIXI.Texture.from(c));
  sprite.position.set(ox + (x0 - 1 / ppc) * size, oy + (y0 - 1 / ppc) * size);
  sprite.scale.set(size / ppc);
  sprite.blendMode = PIXI.BLEND_MODES?.ERASE ?? 26;
  shade.eraser = shade.root.addChild(sprite);
}

/** Objets et murs : carte des hauteurs exportée avec la scène. */
async function loadHeights(flag) {
  if (!shade || !flag?.src) return;
  const loadTex = foundry.canvas?.loadTexture ?? globalThis.loadTexture;
  let tex;
  try { tex = await loadTex(flag.src); } catch (error) { log("Carte des hauteurs non chargée", error); return; }
  if (!tex || !shade || shade.root.destroyed) return;
  tex.baseTexture.scaleMode = PIXI.SCALE_MODES?.LINEAR ?? 1;
  tex.baseTexture.mipmap = PIXI.MIPMAP_MODES?.OFF ?? 0;
  const W = flag.width, H = flag.height;
  const geometry = new PIXI.Geometry().addAttribute("aVertexPosition", new Float32Array([0, 0, W, 0, W, H, 0, 0, W, H, 0, H]), 2);
  const sun = sunState();
  const uniforms = {
    uHeight: tex, uSize: new Float32Array([W, H]), uDir: new Float32Array(sun.dir),
    uLen: sun.len, uMax: flag.maxHeight ?? 4, uReach: Math.min(8, (flag.maxHeight ?? 4) * sun.len)
  };
  const mesh = new PIXI.Mesh(geometry, PIXI.Shader.from(HEIGHT_VERT, HEIGHT_FRAG, uniforms), undefined, PIXI.DRAW_MODES.TRIANGLES);
  mesh.position.set(shade.ox, shade.oy);
  mesh.scale.set(shade.size);
  shade.heights.addChild(mesh);
  shade.mesh = mesh;
  diagMemory("ombres des objets", (tex.baseTexture.realWidth ?? 0) * (tex.baseTexture.realHeight ?? 0) * 4);
  scheduleMask();
}

function teardown() {
  if (!shade) return;
  clearTimeout(shade.maskTimer);
  setShadowMask(null);
  shade.maskRt?.destroy(true);
  if (!shade.root.destroyed) shade.root.destroy({ children: true });
  diagMemory("ombres des objets", 0);
  shade = null;
}

/** Objets et murs de la scène : leur carte des hauteurs, si elle a été exportée. */
function refresh() {
  if (shade?.mesh) {
    shade.mesh.destroy();
    shade.mesh = null;
  }
  const flag = canvas.scene?.getFlag(MODULE_ID, "shade");
  if (!flag?.src || !shadeLayer()) return;
  loadHeights(flag);
}

export const refreshShade = () => refresh();

/** Tout refaire (animation de l'eau changée : la gomme de l'eau suit). */
export function rebuildShade() {
  teardown();
  refresh();
}

export function registerShade() {
  game.settings.register(MODULE_ID, "treeShadow", {
    name: "CADASTRE.Settings.TreeShadow",
    hint: "CADASTRE.Settings.TreeShadowHint",
    scope: "world",
    config: true,
    type: Number,
    choices: Object.fromEntries(SHADOW_LEVELS.map((n, i) => [n, `CADASTRE.Settings.TreeShadows.${i}`])),
    default: SHADOW_LEVELS[3],
    onChange: () => refreshShadeLevel()
  });
  Hooks.on("canvasReady", () => refresh());
  Hooks.on("canvasTearDown", () => teardown());
  Hooks.on("cadastreSun", () => applySun());
  Hooks.on("updateScene", (scene, changes) => {
    if (scene.id === canvas.scene?.id && foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.shade`)) refresh();
  });
}

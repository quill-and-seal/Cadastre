/**
 * Lucioles du marais : petites lueurs qui tournoient au-dessus de l'eau et des rives, s'allument
 * et s'éteignent, s'écartent d'un jeton qui passe. Plus nombreuses et plus vives quand le soleil
 * baisse (réglage « Heure du soleil ») ou quand la scène est sombre.
 * Points d'ancrage exportés avec la scène (drapeau « fireflies »).
 */
import { MODULE_ID } from "./constants.js";
import { sunState } from "./sun.js";
import { tokenPushers } from "./tree-layer.js";

let state = null;

/** Lueur douce (texture partagée). */
function glowTexture() {
  const n = 64, c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d"), grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  grad.addColorStop(0, "rgba(255,255,235,1)");
  grad.addColorStop(0.12, "rgba(235,255,150,0.95)");
  grad.addColorStop(0.35, "rgba(190,240,80,0.35)");
  grad.addColorStop(1, "rgba(160,220,60,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, n, n);
  return PIXI.Texture.from(c);
}

/**
 * Part des lucioles visibles et leur éclat : faibles en plein jour, toutes au crépuscule ou
 * dans une scène sombre.
 */
export function fireflyPresence(light, darkness = 0) {
  const dusk = Math.max(0, Math.min(1, (1 - light) / 0.5));
  return Math.max(0.2 + 0.8 * dusk, Math.min(1, darkness * 1.2));
}

/**
 * Une luciole à l'instant t : position (cases) et éclat (0..1). Mouvement lent en huit autour
 * de l'ancre ; clignotement : allumée un moment, puis éteinte.
 */
export function fireflyAt(f, t) {
  const x = f.ax + 0.7 * Math.sin(t * f.w1 + f.p1) + 0.3 * Math.sin(t * f.w2 * 2.3 + f.p2);
  const y = f.ay + 0.5 * Math.sin(t * f.w2 + f.p2) + 0.3 * Math.cos(t * f.w1 * 1.7 + f.p1);
  const c = Math.sin(t * f.blink + f.p3);
  const glow = c > 0.2 ? Math.pow((c - 0.2) / 0.8, 0.6) : 0;
  return { x, y, glow };
}

function teardown() {
  if (!state) return;
  canvas.app?.ticker?.remove(state.tick);
  if (!state.root.destroyed) state.root.destroy({ children: true });
  state.texture.destroy(true);
  state = null;
}

function refresh() {
  teardown();
  const data = canvas.scene?.getFlag(MODULE_ID, "fireflies");
  let on = true;
  try { on = game.settings.get(MODULE_ID, "fireflies"); } catch { /* réglage absent */ }
  if (!on || !data?.pts?.length) return;
  const d = canvas.dimensions;
  const size = d.size, ox = d.sceneX ?? d.sceneRect?.x ?? 0, oy = d.sceneY ?? d.sceneRect?.y ?? 0;
  const root = new PIXI.Container();
  root.eventMode = "none";
  root.vellumIgnore = true;
  root._vellumPatch = true;
  root.position.set(ox, oy);
  root.scale.set(size);
  // Au-dessus de l'éclairage : une luciole brille même dans une scène plongée dans le noir.
  const parent = canvas.interface ?? canvas.primary ?? canvas.stage;
  parent.addChild(root);
  const texture = glowTexture();
  let seed = 1;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const flies = data.pts.map(([ax, ay]) => {
    const sp = new PIXI.Sprite(texture);
    sp.anchor.set(0.5);
    sp.blendMode = PIXI.BLEND_MODES.ADD;
    const k = 0.22 + rand() * 0.12;
    sp.scale.set(k / 64);
    root.addChild(sp);
    return {
      sp, ax, ay, dx: 0, dy: 0, k,
      w1: 0.12 + rand() * 0.2, w2: 0.1 + rand() * 0.2, blink: 0.6 + rand() * 0.9,
      p1: rand() * 6.28, p2: rand() * 6.28, p3: rand() * 6.28, rank: rand()
    };
  });
  const start = performance.now();
  const tick = () => {
    const t = (performance.now() - start) / 1000;
    const dark = canvas.environment?.darknessLevel ?? canvas.darknessLevel ?? 0;
    const presence = fireflyPresence(sunState().light, dark);
    const pushers = tokenPushers(size, ox, oy);
    for (const f of flies) {
      if (f.rank > presence) { f.sp.visible = false; continue; }
      const p = fireflyAt(f, t);
      // Un jeton qui approche les fait s'écarter ; elles reviennent doucement à leur ancre.
      for (const q of pushers) {
        const vx = p.x + f.dx - q.x, vy = p.y + f.dy - q.y, r = q.r + 0.9, dd = Math.hypot(vx, vy);
        if (dd < r && dd > 1e-3) { const push = (r - dd) * 0.12; f.dx += (vx / dd) * push; f.dy += (vy / dd) * push; }
      }
      f.dx *= 0.985; f.dy *= 0.985;
      f.sp.visible = p.glow > 0.01;
      f.sp.position.set(p.x + f.dx, p.y + f.dy);
      f.sp.alpha = p.glow * (0.55 + 0.45 * presence);
    }
  };
  canvas.app.ticker.add(tick);
  state = { root, texture, tick };
}

export function registerFireflies() {
  game.settings.register(MODULE_ID, "fireflies", {
    name: "CADASTRE.Settings.Fireflies",
    hint: "CADASTRE.Settings.FirefliesHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => refresh()
  });
  Hooks.on("canvasReady", () => refresh());
  Hooks.on("canvasTearDown", () => teardown());
  Hooks.on("updateScene", (scene, changes) => {
    if (scene.id === canvas.scene?.id && foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`)) refresh();
  });
}

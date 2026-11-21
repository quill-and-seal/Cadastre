/**
 * Mode diagnostic (réglage client « Mode diagnostic ») : un petit panneau qui dit ce qui coûte.
 *  - images par seconde, temps moyen et pire temps d'une image ;
 *  - gels : tâches de plus de 50 ms du navigateur (quel que soit le module responsable) ;
 *  - temps de chargement de la scène et des arbres ;
 *  - mémoire graphique : toutes les textures, et la part de Cadastre ;
 *  - une ligne par calque de Cadastre (arbres, herbe, eau) : ce qui est dessiné et son temps de calcul.
 */
import { MODULE_ID } from "./constants.js";

let panel = null;
const lines = new Map();      // nom → texte
let frameTick = null;
let observer = null;
let sceneStart = 0;
const loads = new Map();      // étape → ms depuis le début du chargement de la scène
const freezes = [];           // { at, ms }
const memory = new Map();     // nom → octets (textures tenues par Cadastre)

export const diagnosticOn = () => {
  try { return !!game.settings.get(MODULE_ID, "grassStats"); } catch { return false; }
};

/** Ligne d'un calque : objet dont on règle textContent (comme un élément du DOM). */
export function diagLine(name) {
  if (!diagnosticOn()) return null;
  ensurePanel();
  return {
    set textContent(text) { lines.set(name, text); },
    remove() { lines.delete(name); }
  };
}

/** Mémoire graphique tenue par un calque de Cadastre (octets), pour la part de Cadastre. */
export function diagMemory(name, bytes) {
  if (bytes > 0) memory.set(name, bytes);
  else memory.delete(name);
}

/** Étape du chargement de la scène (« arbres », « herbe »…), comptée depuis son début. */
export function diagLoaded(step) {
  if (sceneStart) loads.set(step, performance.now() - sceneStart);
}

/** Octets d'une texture dans la carte graphique (avec ses réductions s'il y en a). */
export function textureBytes(base) {
  if (!base?.valid) return 0;
  const px = (base.realWidth ?? base.width) * (base.realHeight ?? base.height);
  return px * 4 * (base.mipmap ? 4 / 3 : 1);
}

const mb = (b) => `${(b / 1048576).toFixed(0)} Mo`;

function gpuTotal() {
  const tex = canvas.app?.renderer?.texture;
  let sum = 0, n = 0;
  for (const t of tex?.managedTextures ?? []) { sum += textureBytes(t); n++; }
  return { sum, n };
}

function ensurePanel() {
  if (panel) return;
  panel = document.createElement("div");
  panel.id = "cadastre-diagnostic";
  panel.style.cssText = "position:fixed;left:8px;top:8px;z-index:1000;max-width:520px;padding:6px 10px;border-radius:4px;"
    + "background:rgba(0,0,0,.78);color:#e6efe0;font:12px/1.45 monospace;pointer-events:none;white-space:pre-wrap";
  document.body.appendChild(panel);

  let frames = 0, sum = 0, worst = 0, last = performance.now();
  frameTick = () => {
    const ms = canvas.app?.ticker?.elapsedMS ?? 16;
    frames++; sum += ms; worst = Math.max(worst, ms);
    const now = performance.now();
    if (now - last < 500) return;
    const avg = sum / frames;
    const out = [`Cadastre — diagnostic`, `Affichage : ${Math.round(1000 / avg)} img/s · ${avg.toFixed(1)} ms/image · pire ${worst.toFixed(0)} ms`];
    const recent = freezes.filter((f) => now - f.at < 30_000);
    if (recent.length) {
      const big = recent.reduce((a, f) => (f.ms > a.ms ? f : a));
      out.push(`Gels (30 s) : ${recent.length} · le pire ${big.ms.toFixed(0)} ms il y a ${((now - big.at) / 1000).toFixed(0)} s`);
    } else out.push("Gels (30 s) : aucun");
    if (loads.size) out.push(`Chargement : ${[...loads].map(([k, v]) => `${k} ${(v / 1000).toFixed(1)} s`).join(" · ")}`);
    const { sum: gpu, n } = gpuTotal();
    const mine = [...memory.values()].reduce((a, b) => a + b, 0);
    out.push(`Mémoire graphique : ${mb(gpu)} (${n} textures) · dont Cadastre ${mb(mine)}`
      + (memory.size ? ` (${[...memory].map(([k, v]) => `${k} ${mb(v)}`).join(", ")})` : ""));
    for (const [name, text] of lines) out.push(text.startsWith(name) ? text : `${name} : ${text}`);
    panel.textContent = out.join("\n");
    frames = 0; sum = 0; worst = 0; last = now;
  };
  canvas.app?.ticker?.add(frameTick);

  // Tâches longues du navigateur : ce sont les gels, quel que soit le responsable.
  try {
    observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) freezes.push({ at: e.startTime + e.duration, ms: e.duration });
      while (freezes.length > 200) freezes.shift();
    });
    observer.observe({ type: "longtask", buffered: false });
  } catch { /* navigateur sans « longtask » */ }
}

function closePanel() {
  if (frameTick) canvas.app?.ticker?.remove(frameTick);
  observer?.disconnect();
  panel?.remove();
  panel = null; frameTick = null; observer = null;
  lines.clear();
}

export function registerDiagnostic() {
  Hooks.on("canvasInit", () => { sceneStart = performance.now(); loads.clear(); });
  Hooks.on("canvasReady", () => { diagLoaded("scène"); if (diagnosticOn()) ensurePanel(); });
  Hooks.on("canvasTearDown", () => closePanel());
}

/** Le réglage a changé. */
export function refreshDiagnostic() {
  if (diagnosticOn()) ensurePanel();
  else closePanel();
}

/**
 * Arbres procéduraux : chaque arbre est dessiné à partir d'une graine, dans le style
 * « peint et encré » (contour d'encre, couronne en lobes, lumière venant du haut à gauche,
 * ombre portée). Deux arbres du même type ne se ressemblent jamais tout à fait.
 *
 * Un type d'arbre : { id, w, h, tree: true, make(seed) → contenu SVG dans un carré w × h }.
 * Dans une carte, un arbre est un objet (props) de type `tree-<id>` avec sa graine `s`.
 */
import { mulberry32 } from "./catalog.js";

const r3 = (n) => Math.round(n * 1000) / 1000;
const INK = "#13221a";
const SHADOW = `fill="#0b1a10" fill-opacity="0.32"`;
/** Décalage de l'ombre portée, en cases (lumière en haut à gauche). */
const SHADOW_OFFSET = [0.2, 0.26];

/** Légère variation de teinte d'une couleur #rrggbb (le même arbre garde la même teinte). */
function vary(hex, rand, amount = 0.08) {
  const f = 1 + (rand() - 0.5) * 2 * amount;
  return "#" + [1, 3, 5].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * f)))
    .toString(16).padStart(2, "0")).join("");
}

const circle = (x, y, r, attrs) => `<circle cx="${r3(x)}" cy="${r3(y)}" r="${r3(r)}" ${attrs}/>`;

/** Couronne en lobes (feuillu, buisson). */
function lobedCanopy(seed, size, { lobes: [nMin, nMax], palette, flowers = 0 }) {
  const rand = mulberry32(seed);
  const c = size / 2, R = size * 0.44;
  const n = nMin + Math.floor(rand() * (nMax - nMin + 1));
  const turn = rand() * Math.PI * 2;
  const blobs = [{ x: c, y: c, r: R * (0.5 + rand() * 0.08), a: null }];
  for (let i = 0; i < n; i++) {
    const a = turn + (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.5;
    const d = R * (0.52 + rand() * 0.16);
    const r = R * (0.3 + rand() * 0.13);
    blobs.push({ x: c + Math.cos(a) * d, y: c + Math.sin(a) * d, r, a });
  }
  const dark = vary(palette.dark, rand), mid = vary(palette.mid, rand), light = vary(palette.light, rand);
  const [sx, sy] = SHADOW_OFFSET;
  let out = "";
  for (const b of blobs) out += circle(b.x + sx * size / 3, b.y + sy * size / 3, b.r, SHADOW);
  for (const b of blobs) out += circle(b.x, b.y, b.r + 0.05, `fill="${INK}"`);
  for (const b of blobs) out += circle(b.x, b.y, b.r, `fill="${dark}"`);
  // Volume : chaque lobe éclairé du côté de la lumière.
  for (const b of blobs) out += circle(b.x - b.r * 0.12, b.y - b.r * 0.16, b.r * 0.78, `fill="${mid}"`);
  // Lumière : petites grappes de feuilles claires sur le côté éclairé des lobes.
  for (const b of blobs) {
    const lit = b.a === null || Math.cos(b.a - Math.PI * 1.25) > -0.2;
    if (!lit) continue;
    const hx = b.x - b.r * 0.3, hy = b.y - b.r * 0.34;
    for (let i = 0; i < 4; i++) {
      const a = rand() * Math.PI * 2, d = b.r * 0.2 * rand();
      out += circle(hx + Math.cos(a) * d, hy + Math.sin(a) * d, b.r * (0.14 + rand() * 0.1), `fill="${light}" fill-opacity="0.7"`);
    }
  }
  // Traits de feuillage : petits arcs sombres au bas de chaque lobe.
  let arcs = "";
  for (const b of blobs) {
    const a0 = Math.PI * (0.15 + rand() * 0.2), a1 = a0 + Math.PI * (0.35 + rand() * 0.2);
    const rr = b.r * 0.72;
    arcs += `M${r3(b.x + Math.cos(a0) * rr)} ${r3(b.y + Math.sin(a0) * rr)}A${r3(rr)} ${r3(rr)} 0 0 1 ${r3(b.x + Math.cos(a1) * rr)} ${r3(b.y + Math.sin(a1) * rr)}`;
  }
  out += `<path d="${arcs}" fill="none" stroke="${INK}" stroke-opacity="0.45" stroke-width="0.035" stroke-linecap="round"/>`;
  if (flowers && rand() < flowers) {
    const color = ["#d9455f", "#f0c040", "#e86fa0"][Math.floor(rand() * 3)];
    for (let i = 0; i < 7; i++) {
      const a = rand() * Math.PI * 2, d = R * rand() * 0.85;
      out += circle(c + Math.cos(a) * d, c + Math.sin(a) * d, 0.035 + rand() * 0.02, `fill="${color}" stroke="${INK}" stroke-width="0.012"`);
    }
  }
  return out;
}

/** Palme dentelée en deux tons, de part et d'autre de la nervure. */
function frond(cx, cy, angle, length, width, bend, colors) {
  const steps = 12;
  const left = [], right = [], rib = [];
  const ca = Math.cos(angle), sa = Math.sin(angle);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const along = t * length;
    const side = bend * length * t * t; // la palme se courbe
    const half = width * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.02)), 0.6) * (i % 2 ? 0.8 : 1); // dents
    const px = cx + ca * along - sa * side, py = cy + sa * along + ca * side;
    rib.push([px, py]);
    left.push([px - sa * half, py + ca * half]);
    right.push([px + sa * half, py - ca * half]);
  }
  const poly = (pts) => "M" + pts.map(([x, y]) => `${r3(x)} ${r3(y)}`).join("L") + "Z";
  const ribPts = rib.slice().reverse();
  return {
    shadow: poly([...left, ...right.slice().reverse()]),
    halves: [
      `<path d="${poly([...left, ...ribPts])}" fill="${colors[0]}" stroke="${INK}" stroke-width="0.045" stroke-linejoin="round"/>`,
      `<path d="${poly([...right, ...ribPts])}" fill="${colors[1]}" stroke="${INK}" stroke-width="0.045" stroke-linejoin="round"/>`
    ],
    rib: `<path d="M${rib.map(([x, y]) => `${r3(x)} ${r3(y)}`).join("L")}" fill="none" stroke="${colors[2]}" stroke-width="0.03" stroke-linecap="round"/>`
  };
}

function palm(seed, size) {
  const rand = mulberry32(seed);
  const c = size / 2;
  const n = 7 + Math.floor(rand() * 3);
  const turn = rand() * Math.PI * 2;
  const light = vary("#6aa85c", rand), dark = vary("#3f7c44", rand), rib = vary("#a8d38a", rand);
  const fronds = [];
  for (let i = 0; i < n; i++) {
    const a = turn + (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    const length = size * (0.4 + rand() * 0.07);
    const width = size * (0.12 + rand() * 0.025);
    const bend = (rand() - 0.5) * 0.35;
    fronds.push(frond(c, c, a, length, width, bend, [light, dark, rib]));
  }
  // Ordre de superposition au hasard, comme de vraies palmes.
  fronds.sort(() => rand() - 0.5);
  const [sx, sy] = SHADOW_OFFSET;
  let out = `<g transform="translate(${r3(sx * size / 3)} ${r3(sy * size / 3)})">`;
  for (const f of fronds) out += `<path d="${f.shadow}" ${SHADOW}/>`;
  out += "</g>";
  for (const f of fronds) out += f.halves.join("") + f.rib;
  out += circle(c, c, size * 0.05, `fill="#7a5a34" stroke="${INK}" stroke-width="0.04"`);
  return out;
}

function pine(seed, size) {
  const rand = mulberry32(seed);
  const c = size / 2, R = size * 0.46;
  const spikes = 11 + Math.floor(rand() * 4);
  const turn = rand() * Math.PI * 2;
  const layers = [[1, "#1f4b33"], [0.72, "#2b6243"], [0.44, "#3e7c53"]];
  const star = (scale, twist) => {
    let d = "";
    for (let i = 0; i < spikes * 2; i++) {
      const a = turn + twist + (i / (spikes * 2)) * Math.PI * 2;
      const r = R * scale * (i % 2 ? 0.7 : 1) * (0.92 + rand() * 0.12);
      d += `${i ? "L" : "M"}${r3(c + Math.cos(a) * r)} ${r3(c + Math.sin(a) * r)}`;
    }
    return d + "Z";
  };
  const [sx, sy] = SHADOW_OFFSET;
  let out = `<path d="${star(1, 0)}" transform="translate(${r3(sx * size / 3)} ${r3(sy * size / 3)})" ${SHADOW}/>`;
  layers.forEach(([scale, color], i) => {
    out += `<path d="${star(scale, i * 0.2)}" fill="${vary(color, rand, 0.06)}" stroke="${INK}" stroke-width="0.05" stroke-linejoin="round"/>`;
  });
  out += circle(c - R * 0.06, c - R * 0.08, R * 0.12, `fill="#5d9a68" fill-opacity="0.8"`);
  return out;
}

/**
 * spin : petite plante dessinée sans orientation puis tournée telle quelle à l'affichage (la
 * lumière tourne avec elle, ça ne se voit pas) : ses dessins se réutilisent d'une plante à l'autre.
 * proc : essence générée (tree-gen.js) — l'arbre est calculé branche par branche et feuille par
 * feuille, puis animé par le vent dans la scène. `make` reste son dessin simple : icône de la
 * palette et silhouette affichée le temps du calcul.
 */
export const TREES = [
  { id: "oak", w: 4, h: 4, tree: true, proc: "oak", make: (seed) => lobedCanopy(seed, 4, { lobes: [8, 11], palette: { dark: "#2c6339", mid: "#3c7d46", light: "#5f9f58" } }) },
  { id: "birch", w: 3, h: 3, tree: true, proc: "birch", make: (seed) => lobedCanopy(seed, 3, { lobes: [7, 10], palette: { dark: "#3b7a3a", mid: "#55984a", light: "#8cc26a" } }) },
  { id: "pine", w: 3, h: 3, tree: true, proc: "pine", make: (seed) => pine(seed, 3) },
  { id: "bush", w: 1.4, h: 1.4, tree: true, proc: "bush", spin: true, make: (seed) => lobedCanopy(seed, 1.4, { lobes: [6, 8], palette: { dark: "#2f6e35", mid: "#418a43", light: "#69ad5c" }, flowers: 0.35 }) },
  { id: "palm", w: 3.4, h: 3.4, tree: true, make: (seed) => palm(seed, 3.4) },
  // Forêts (biomes) : arbres, sous-bois et petits éléments du sol.
  { id: "beech", w: 4.4, h: 4.4, tree: true, proc: "beech", make: (seed) => lobedCanopy(seed, 4.4, { lobes: [9, 12], palette: { dark: "#24562a", mid: "#33743a", light: "#6aac56" } }) },
  { id: "spruce", w: 3, h: 3, tree: true, proc: "spruce", make: (seed) => pine(seed, 3) },
  { id: "bilberry", w: 0.7, h: 0.7, tree: true, proc: "bilberry", spin: true, make: (seed) => lobedCanopy(seed, 0.7, { lobes: [6, 8], palette: { dark: "#2a5a24", mid: "#3f8236", light: "#7fb455" } }) },
  { id: "fern", w: 1.2, h: 1.2, tree: true, proc: "fern", spin: true, make: (seed) => fernIcon(seed, 1.2) },
  { id: "stump", w: 1, h: 1, tree: true, proc: "stump", spin: true, make: (seed) => stumpIcon(seed, 1) },
  { id: "mushrooms", w: 0.3, h: 0.3, tree: true, proc: "mushrooms", spin: true, make: (seed) => capsIcon(seed, 0.3) },
  // Marais. water : pousse sur l'eau (nénuphar), et nulle part ailleurs.
  { id: "reed", w: 2, h: 2, tree: true, proc: "reed", spin: true, make: (seed) => clumpIcon(seed, 2, { n: 26, color: "#6a8a4a", tip: "#8c6a62" }) },
  { id: "cattail", w: 1.7, h: 1.7, tree: true, proc: "cattail", spin: true, make: (seed) => clumpIcon(seed, 1.7, { n: 16, color: "#4f7e3a", tip: "#4a2e1a", spike: true }) },
  { id: "rush", w: 1, h: 1, tree: true, proc: "rush", spin: true, make: (seed) => clumpIcon(seed, 1, { n: 30, color: "#2f5e2c" }) },
  { id: "lily", w: 1.4, h: 1.4, tree: true, proc: "lily", spin: true, water: true, make: (seed) => lilyIcon(seed, 1.4) },
  { id: "snag", w: 1.8, h: 1.8, tree: true, proc: "snag", spin: true, make: (seed) => stumpIcon(seed, 1.8, { bark: "#3e362a", wood: "#7a6a50", roots: 8 }) },
  { id: "knees", w: 1.2, h: 1.2, tree: true, proc: "knees", spin: true, water: true, make: (seed) => capsIcon(seed, 1.2, "#5e4c36") },
  { id: "log", w: 3, h: 3, tree: true, proc: "log", spin: true, make: (seed) => logIcon(seed, 3) },
  { id: "willow", w: 4, h: 4, tree: true, proc: "willow", make: (seed) => lobedCanopy(seed, 4, { lobes: [12, 16], palette: { dark: "#3a563c", mid: "#6a8a60", light: "#bccfa6" } }) }
];

/** Icônes simples (palette, silhouette le temps du calcul). */
function clumpIcon(seed, size, { n, color, tip = null, spike = false }) {
  const rand = mulberry32(seed), c = size / 2;
  let d = "", t = "";
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2, L = size * (0.25 + rand() * 0.22), x = c + Math.cos(a) * L, y = c + Math.sin(a) * L;
    d += `M${r3(c + Math.cos(a) * size * 0.05)} ${r3(c + Math.sin(a) * size * 0.05)}L${r3(x)} ${r3(y)}`;
    if (tip && rand() < 0.4) t += spike
      ? `<path d="M${r3(x)} ${r3(y)}l${r3(Math.cos(a) * size * 0.08)} ${r3(Math.sin(a) * size * 0.08)}" stroke="${tip}" stroke-width="${r3(size * 0.05)}" stroke-linecap="round"/>`
      : circle(x, y, size * 0.035, `fill="${tip}"`);
  }
  return `<path d="${d}" stroke="${INK}" stroke-width="${r3(size * 0.04)}" stroke-linecap="round" fill="none"/>`
    + `<path d="${d}" stroke="${color}" stroke-width="${r3(size * 0.025)}" stroke-linecap="round" fill="none"/>` + t;
}
function lilyIcon(seed, size) {
  const rand = mulberry32(seed), c = size / 2;
  let out = "";
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2, d = rand() * size * 0.35, r = size * (0.08 + rand() * 0.06), x = c + Math.cos(a) * d, y = c + Math.sin(a) * d;
    const n = rand() * Math.PI * 2, n0 = n + 0.25, n1 = n - 0.25;
    out += `<path d="M${r3(x)} ${r3(y)}L${r3(x + Math.cos(n0) * r)} ${r3(y + Math.sin(n0) * r)}A${r3(r)} ${r3(r)} 0 1 1 ${r3(x + Math.cos(n1) * r)} ${r3(y + Math.sin(n1) * r)}Z" fill="#4e8f3e" stroke="${INK}" stroke-width="${r3(size * 0.015)}"/>`;
  }
  return out + circle(c, c, size * 0.05, `fill="#f4f1ea" stroke="${INK}" stroke-width="${r3(size * 0.01)}"`);
}
function fernIcon(seed, size) {
  const rand = mulberry32(seed), c = size / 2, n = 9;
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.3, L = size * 0.46;
    d += `M${r3(c)} ${r3(c)}L${r3(c + Math.cos(a) * L)} ${r3(c + Math.sin(a) * L)}`;
  }
  return `<path d="${d}" stroke="${INK}" stroke-width="${r3(size * 0.09)}" stroke-linecap="round" fill="none"/>`
    + `<path d="${d}" stroke="#4a8f38" stroke-width="${r3(size * 0.06)}" stroke-linecap="round" fill="none"/>`;
}
function stumpIcon(seed, size, { bark = "#5a4030", wood = "#c49a68", roots = 0 } = {}) {
  const c = size / 2, k = 0.9 + mulberry32(seed)() * 0.2;
  let r = "";
  for (let i = 0; i < roots; i++) {
    const a = (i / roots) * Math.PI * 2;
    r += `M${r3(c)} ${r3(c)}L${r3(c + Math.cos(a) * size * 0.45)} ${r3(c + Math.sin(a) * size * 0.45)}`;
  }
  if (roots) return `<path d="${r}" stroke="${bark}" stroke-width="${r3(size * 0.06)}" stroke-linecap="round"/>`
    + circle(c, c, size * 0.17 * k, `fill="${bark}" stroke="${INK}" stroke-width="0.03"`) + circle(c, c, size * 0.12, `fill="${wood}"`);
  return circle(c, c, size * 0.3 * k, `fill="#5a4030" stroke="${INK}" stroke-width="0.03"`) + circle(c, c, size * 0.24, `fill="#c49a68"`)
    + circle(c, c, size * 0.14, `fill="none" stroke="#8a6438" stroke-width="0.012"`) + circle(c, c, size * 0.07, `fill="none" stroke="#8a6438" stroke-width="0.012"`);
}
function capsIcon(seed, size, color = "#8a5a2e") {
  const rand = mulberry32(seed), c = size / 2;
  let out = "";
  for (let i = 0; i < 4; i++) out += circle(c + (rand() - 0.5) * size * 0.5, c + (rand() - 0.5) * size * 0.5, size * (0.1 + rand() * 0.08), `fill="${color}" stroke="${INK}" stroke-width="0.008"`);
  return out;
}
function logIcon(seed, size) {
  const rand = mulberry32(seed), c = size / 2, L = size * (0.34 + rand() * 0.1), w = size * (0.09 + rand() * 0.04), a = rand() * Math.PI;
  const dx = Math.cos(a) * L, dy = Math.sin(a) * L, d = `M${r3(c - dx)} ${r3(c - dy)}L${r3(c + dx)} ${r3(c + dy)}`;
  return `<path d="${d}" stroke="${INK}" stroke-width="${r3(w + 0.06)}" stroke-linecap="round"/>`
    + `<path d="${d}" stroke="#5a5040" stroke-width="${r3(w)}" stroke-linecap="round"/>`
    + circle(c - dx, c - dy, w * 0.75, `fill="#3e362a" stroke="${INK}" stroke-width="0.02"`);
}

export const TREE_PREFIX = "tree-";
export const TREE_BY_TYPE = new Map(TREES.map((t) => [`${TREE_PREFIX}${t.id}`, t]));

/** Mélange par défaut du pinceau à arbres : surtout des feuillus et des buissons. */
export const TREE_MIX = [["oak", 0.35], ["birch", 0.2], ["bush", 0.2], ["pine", 0.15], ["palm", 0.1]];

/** Rayon de la couronne d'un arbre posé (cases), pour son essence et son échelle. */
export const treeRadius = (def, k = 1) => (def.w * k) / 2 * 0.92;

export function pickTreeKind(kind, rand) {
  if (kind !== "mix") return kind;
  let x = rand();
  for (const [id, w] of TREE_MIX) { if ((x -= w) <= 0) return id; }
  return TREE_MIX[0][0];
}

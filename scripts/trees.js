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

export const TREES = [
  { id: "oak", w: 3, h: 3, tree: true, make: (seed) => lobedCanopy(seed, 3, { lobes: [8, 11], palette: { dark: "#2c6339", mid: "#3c7d46", light: "#5f9f58" } }) },
  { id: "palm", w: 3.4, h: 3.4, tree: true, make: (seed) => palm(seed, 3.4) },
  { id: "pine", w: 2.6, h: 2.6, tree: true, make: (seed) => pine(seed, 2.6) },
  { id: "bush", w: 1.4, h: 1.4, tree: true, make: (seed) => lobedCanopy(seed, 1.4, { lobes: [6, 8], palette: { dark: "#2f6e35", mid: "#418a43", light: "#69ad5c" }, flowers: 0.35 }) }
];

export const TREE_PREFIX = "tree-";
export const TREE_BY_TYPE = new Map(TREES.map((t) => [`${TREE_PREFIX}${t.id}`, t]));

/** Mélange par défaut du pinceau à arbres : surtout des feuillus et des buissons. */
export const TREE_MIX = [["oak", 0.45], ["bush", 0.25], ["palm", 0.15], ["pine", 0.15]];

export function pickTreeKind(kind, rand) {
  if (kind !== "mix") return kind;
  let x = rand();
  for (const [id, w] of TREE_MIX) { if ((x -= w) <= 0) return id; }
  return TREE_MIX[0][0];
}

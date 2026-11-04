/**
 * Catalogue : sols et objets, dessinés en SVG.
 * Toutes les dimensions sont en cases (1 = une case de la grille).
 */

/** Générateur pseudo-aléatoire déterministe : les motifs sont identiques à chaque rendu. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r3 = (n) => Math.round(n * 1000) / 1000;

function speckles(seed, count, colors, rMin, rMax, w = 1, h = 1) {
  const rand = mulberry32(seed);
  let out = "";
  for (let i = 0; i < count; i++) {
    const x = r3(rand() * w), y = r3(rand() * h), r = r3(rMin + rand() * (rMax - rMin));
    out += `<circle cx="${x}" cy="${y}" r="${r}" fill="${colors[i % colors.length]}"/>`;
  }
  return out;
}

function blades(seed, count, colors) {
  const rand = mulberry32(seed);
  let out = "";
  for (let i = 0; i < count; i++) {
    const x = r3(rand()), y = r3(rand()), dx = r3((rand() - 0.5) * 0.08), dy = r3(-0.05 - rand() * 0.06);
    out += `<path d="M${x} ${y}l${dx} ${dy}" stroke="${colors[i % colors.length]}" stroke-width="0.018" stroke-linecap="round"/>`;
  }
  return out;
}

function cobbles() {
  const tones = ["#8b857b", "#7f7a70", "#948e83", "#77726a", "#878177"];
  const s = 1 / 3;
  let out = "";
  for (let row = 0; row < 3; row++) {
    const off = (row % 2) * (s / 2);
    for (let i = -1; i < 4; i++) {
      const x = r3(i * s + off + 0.02), y = r3(row * s + 0.02);
      out += `<rect x="${x}" y="${y}" width="${r3(s - 0.04)}" height="${r3(s - 0.04)}" rx="0.07" fill="${tones[(row * 3 + i + 6) % tones.length]}"/>`;
    }
  }
  return out;
}

function flagstones() {
  const tones = ["#7f796f", "#757067", "#827c72", "#6f6a62", "#7a746b"];
  let out = "";
  for (let row = 0; row < 2; row++) {
    const off = row === 0 ? 0 : -0.5;
    for (let i = 0; i < 3; i++) {
      out += `<rect x="${off + i + 0.025}" y="${row + 0.025}" width="0.95" height="0.95" rx="0.04" fill="${tones[(row * 2 + i) % tones.length]}"/>`;
    }
  }
  out += `<path d="M0.2 0.3l0.18 0.1l0.07 0.2M1.6 1.35l-0.15 0.12" stroke="#5a554e" stroke-width="0.012" fill="none"/>`;
  return out;
}

function planks() {
  const tones = ["#93623a", "#85552f", "#8f5d35", "#80522d"];
  const seams = [0.3, 0.9, 0.55, 0.15];
  let out = "";
  for (let row = 0; row < 4; row++) {
    const y = row * 0.25;
    out += `<rect x="0" y="${y}" width="2" height="0.25" fill="${tones[row]}"/>`;
    out += `<path d="M0 ${y}h2" stroke="#4e3119" stroke-width="0.016"/>`;
    for (const x of [seams[row], seams[row] + 1]) {
      out += `<path d="M${x} ${y}v0.25" stroke="#4e3119" stroke-width="0.016"/>`;
    }
    out += `<path d="M0 ${r3(y + 0.12)}h2" stroke="#ffffff" stroke-opacity="0.05" stroke-width="0.03"/>`;
  }
  return out;
}

function waves() {
  let out = "";
  for (const [x, y] of [[0.1, 0.25], [1.1, 0.25], [0.6, 0.75], [1.6, 0.75], [-0.4, 0.75]]) {
    out += `<path d="M${x} ${y}q0.15 -0.1 0.3 0t0.3 0" stroke="#7fb0cf" stroke-opacity="0.55" stroke-width="0.03" fill="none" stroke-linecap="round"/>`;
  }
  return out;
}

/**
 * Sols : `pattern` est le contenu d'un <pattern> SVG de taille `w`×`h` cases.
 * `swatch` sert à l'aperçu de la palette.
 */
export const TERRAINS = [
  { id: "stone", swatch: "#7a746b", w: 2, h: 2, base: "#4a463f", pattern: flagstones() },
  { id: "wood", swatch: "#8a5a33", w: 2, h: 1, base: "#4e3119", pattern: planks() },
  { id: "cobble", swatch: "#837d73", w: 1, h: 1, base: "#4f4b45", pattern: cobbles() },
  { id: "dirt", swatch: "#6b5236", w: 1, h: 1, base: "#6b5236", pattern: speckles(11, 16, ["#5d4630", "#7a5f40", "#56412b"], 0.015, 0.05) },
  { id: "grass", swatch: "#4d6b33", w: 1, h: 1, base: "#4d6b33", pattern: speckles(23, 6, ["#45602e"], 0.05, 0.12) + blades(7, 26, ["#6a8c48", "#3f5a2a", "#5f8040"]) },
  { id: "water", swatch: "#2e5a78", w: 2, h: 1, base: "#2e5a78", pattern: waves() }
];

export const TERRAIN_IDS = new Set(TERRAINS.map((t) => t.id));

/**
 * Objets : `svg` est dessiné dans un rectangle de `w`×`h` cases (orientation 0).
 */
export const PROPS = [
  {
    id: "barrel", w: 1, h: 1,
    svg: `<circle cx="0.5" cy="0.5" r="0.36" fill="#7a4f2a" stroke="#3b2614" stroke-width="0.04"/>
<circle cx="0.5" cy="0.5" r="0.29" fill="none" stroke="#2f2a26" stroke-width="0.03"/>
<circle cx="0.5" cy="0.5" r="0.16" fill="#6a4423" stroke="#2f2a26" stroke-width="0.025"/>
<path d="M0.3 0.36a0.25 0.25 0 0 1 0.14 -0.1" stroke="#ffffff" stroke-opacity="0.25" stroke-width="0.03" fill="none"/>`
  },
  {
    id: "crate", w: 1, h: 1,
    svg: `<rect x="0.13" y="0.13" width="0.74" height="0.74" fill="#9a7040" stroke="#4a3218" stroke-width="0.04"/>
<rect x="0.21" y="0.21" width="0.58" height="0.58" fill="none" stroke="#5c3f1f" stroke-width="0.03"/>
<path d="M0.21 0.21L0.79 0.79M0.79 0.21L0.21 0.79" stroke="#5c3f1f" stroke-width="0.035"/>`
  },
  {
    id: "chest", w: 1, h: 1,
    svg: `<rect x="0.12" y="0.24" width="0.76" height="0.52" rx="0.04" fill="#6e4423" stroke="#2d1b0d" stroke-width="0.04"/>
<path d="M0.3 0.24v0.52M0.7 0.24v0.52" stroke="#9a9a9a" stroke-width="0.05"/>
<rect x="0.45" y="0.66" width="0.1" height="0.1" fill="#c8a040" stroke="#5a4510" stroke-width="0.015"/>`
  },
  {
    id: "table", w: 2, h: 1,
    svg: `<rect x="0.1" y="0.15" width="1.8" height="0.7" rx="0.05" fill="#8b5e34" stroke="#3e2914" stroke-width="0.04"/>
<path d="M0.12 0.38h1.76M0.12 0.62h1.76" stroke="#6b4626" stroke-width="0.02"/>`
  },
  {
    id: "chair", w: 1, h: 1,
    svg: `<rect x="0.28" y="0.34" width="0.44" height="0.42" rx="0.04" fill="#8b5e34" stroke="#3e2914" stroke-width="0.035"/>
<rect x="0.25" y="0.2" width="0.5" height="0.11" rx="0.03" fill="#6b4626" stroke="#3e2914" stroke-width="0.03"/>`
  },
  {
    id: "bed", w: 1, h: 2,
    svg: `<rect x="0.1" y="0.08" width="0.8" height="1.84" rx="0.04" fill="#5b3a1f" stroke="#2d1b0d" stroke-width="0.04"/>
<rect x="0.16" y="0.14" width="0.68" height="1.7" fill="#c9c1ad"/>
<rect x="0.24" y="0.22" width="0.52" height="0.3" rx="0.07" fill="#ece6d6" stroke="#b0a890" stroke-width="0.015"/>
<rect x="0.16" y="0.75" width="0.68" height="1.09" fill="#7b2e2e"/>
<path d="M0.16 0.8h0.68" stroke="#a24646" stroke-width="0.04"/>`
  },
  {
    id: "pillar", w: 1, h: 1,
    svg: `<rect x="0.1" y="0.1" width="0.8" height="0.8" rx="0.06" fill="#5f5a53" stroke="#2f2c28" stroke-width="0.035"/>
<circle cx="0.5" cy="0.5" r="0.32" fill="#8c877e" stroke="#4a4640" stroke-width="0.035"/>
<circle cx="0.5" cy="0.5" r="0.2" fill="none" stroke="#a8a299" stroke-width="0.025"/>`
  },
  {
    id: "stairs", w: 1, h: 1,
    svg: `<rect x="0.05" y="0.05" width="0.9" height="0.9" fill="#55504a" stroke="#2f2c28" stroke-width="0.03"/>
<rect x="0.05" y="0.05" width="0.9" height="0.18" fill="#8a847a"/>
<rect x="0.05" y="0.23" width="0.9" height="0.18" fill="#7a746b"/>
<rect x="0.05" y="0.41" width="0.9" height="0.18" fill="#6b665e"/>
<rect x="0.05" y="0.59" width="0.9" height="0.18" fill="#5e5952"/>
<path d="M0.05 0.23h0.9M0.05 0.41h0.9M0.05 0.59h0.9M0.05 0.77h0.9" stroke="#2f2c28" stroke-width="0.02"/>`
  }
];

export const PROP_BY_ID = new Map(PROPS.map((p) => [p.id, p]));

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

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);

/**
 * Texture peinte : bruit fractal (feTurbulence) transformé en dégradé entre deux couleurs.
 * Le motif fait `size` cases et se raccorde sans couture (stitchTiles), donc pas de
 * répétition visible à petite échelle, comme un fond peint à la main.
 */
function painted(id, size, dark, light, freq, seed) {
  const d = hex(dark), l = hex(light);
  // Le canal rouge du bruit varie surtout entre 0,3 et 0,7 : on l'étire vers dark → light.
  const row = (i) => {
    const k = (l[i] - d[i]) / 0.4;
    return `${r3(k)} 0 0 0 ${r3(d[i] - 0.3 * k)}`;
  };
  return `<filter id="cadf-${id}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width="${size}" height="${size}" color-interpolation-filters="sRGB">`
    + `<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="4" seed="${seed}" stitchTiles="stitch"/>`
    + `<feColorMatrix type="matrix" values="${row(0)} ${row(1)} ${row(2)} 0 0 0 0 1"/></filter>`
    + `<rect width="${size}" height="${size}" filter="url(#cadf-${id})"/>`;
}

/**
 * Herbe vue de dessus : un tapis serré de gerbes de brins « peignés ». Chaque gerbe part d'un
 * pied et s'ouvre en éventail, mais tous les brins penchent à peu près du même côté (`lean`,
 * à ± `spread` près), comme une pelouse peinte. Palette resserrée et brins un peu transparents :
 * la couleur varie en grandes nappes, données par le fond peint sous les brins.
 * Les brins sont regroupés par teinte (un chemin SVG par teinte). Le motif fait `size` cases
 * et se raccorde.
 *
 * @param {number} clumps  gerbes par case
 */
export function grassBlades(size, clumps, seed, {
  blades = [6, 10], length = [0.14, 0.3], width = 0.02, lean = GRASS_LEAN, spread = 1.1,
  colors = GRASS_BLADE_COLORS, opacity = 0.78
} = {}) {
  const rand = mulberry32(seed);
  const roots = colors.slice(0, 2), tips = colors.slice(2);
  const groups = new Map(colors.map((c) => [c, []]));
  const push = (color, d) => groups.get(color).push(d);
  const seg = (ax, ay, cx, cy, bx, by) => `M${r3(ax)} ${r3(ay)}Q${r3(cx)} ${r3(cy)} ${r3(bx)} ${r3(by)}`;
  const n = Math.round(size * size * clumps);
  for (let c = 0; c < n; c++) {
    const x0 = rand() * size, y0 = rand() * size;
    const count = blades[0] + Math.floor(rand() * (blades[1] - blades[0] + 1));
    const tone = rand();
    for (let i = 0; i < count; i++) {
      const a = lean + (rand() - 0.5) * 2 * spread;
      const len = length[0] + rand() * (length[1] - length[0]);
      const ex = Math.cos(a) * len, ey = Math.sin(a) * len;
      // Courbure douce, toujours du même côté : les brins semblent tous suivre le même mouvement.
      const curl = len * (0.12 + rand() * 0.12);
      const mx = ex * 0.5 - Math.sin(a) * curl, my = ey * 0.5 + Math.cos(a) * curl;
      const k = (tone * 0.7 + rand() * 0.3);
      const root = roots[Math.min(roots.length - 1, Math.floor(k * roots.length))];
      const tip = tips[Math.min(tips.length - 1, Math.floor(k * tips.length))];
      // Pieds un peu décalés dans la gerbe : pas d'éventail trop régulier.
      const jx = (rand() - 0.5) * 0.12, jy = (rand() - 0.5) * 0.12;
      for (const [ox, oy] of copies(x0, y0, size)) {
        const x = x0 + ox + jx, y = y0 + oy + jy;
        push(root, seg(x, y, x + mx * 0.45, y + my * 0.45, x + mx, y + my));
        push(tip, seg(x + mx, y + my, x + (mx + ex) / 2 + Math.cos(a) * len * 0.05, y + (my + ey) / 2 + Math.sin(a) * len * 0.05, x + ex, y + ey));
      }
    }
  }
  return [...groups].map(([color, segs]) => {
    if (!segs.length) return "";
    const w = roots.includes(color) ? width * 1.3 : width;
    return `<path d="${segs.join("")}" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${r3(w)}" stroke-linecap="round"/>`;
  }).join("");
}

/** Inclinaison commune des brins (radians) : vers le haut et un peu à gauche, côté lumière. */
export const GRASS_LEAN = -1.95;

/** Une gerbe près d'un bord du motif est redessinée de l'autre côté : le motif se raccorde sans couture. */
function copies(x, y, size, margin = 0.35) {
  const out = [[0, 0]];
  const xs = [0], ys = [0];
  if (x < margin) xs.push(size); else if (x > size - margin) xs.push(-size);
  if (y < margin) ys.push(size); else if (y > size - margin) ys.push(-size);
  for (const ox of xs) for (const oy of ys) if (ox || oy) out.push([ox, oy]);
  return out;
}

/** Verts des brins, du plus sombre (au ras du sol) au plus clair (pointes au soleil). */
/** Verts des brins : deux pour les pieds, trois pour les pointes, proches les uns des autres. */
export const GRASS_BLADE_COLORS = ["#2f6626", "#356f2a", "#4a8a36", "#53953c", "#5e9f43"];

function waves() {
  let out = "";
  for (const [x, y] of [[0.1, 0.25], [1.1, 0.25], [0.6, 0.75], [1.6, 0.75], [-0.4, 0.75]]) {
    out += `<path d="M${x} ${y}q0.15 -0.1 0.3 0t0.3 0" stroke="#7fb0cf" stroke-opacity="0.55" stroke-width="0.03" fill="none" stroke-linecap="round"/>`;
  }
  return out;
}

/**
 * Sols : `pattern` est le contenu d'un <pattern> SVG de taille `w`×`h` cases.
 * `swatch` sert à l'aperçu de la palette ; `soft` : sol naturel, au bord fondu sur ses voisins.
 */
export const TERRAINS = [
  { id: "stone", swatch: "#7a746b", w: 2, h: 2, base: "#4a463f", pattern: flagstones() },
  { id: "wood", swatch: "#8a5a33", w: 2, h: 1, base: "#4e3119", pattern: planks() },
  { id: "cobble", swatch: "#837d73", w: 1, h: 1, base: "#4f4b45", pattern: cobbles() },
  { id: "dirt", soft: true, swatch: "#83604c", w: 6, h: 6, base: "#7d5a47", pattern: painted("dirt", 6, "#5f4234", "#a07a63", 0.42, 5) + speckles(31, 90, ["#5a3e30", "#b08b72", "#6e4b3a"], 0.01, 0.035, 6, 6) },
  // Herbe : grandes nappes de couleur peintes (motif de 12 cases), puis le tapis de brins par-dessus (motif de 4 cases).
  // Même herbe que les brins dessinés par la carte graphique (grass.js) : elle ne se voit qu'au
  // bord des arbres, de l'eau et des chemins, là où ces brins s'arrêtent.
  { id: "grass", soft: true, swatch: "#4f7e2e", w: 12, h: 12, base: "#3f6a26", pattern: painted("grass", 12, "#2c4f1b", "#527f2b", 0.11, 11),
    overlay: { w: 2, h: 2, pattern: grassBlades(2, 520, 11, {
      blades: [1, 2], length: [0.07, 0.17], width: 0.011, spread: Math.PI, opacity: 0.92,
      colors: ["#2d541c", "#3a6623", "#5b892e", "#6d9a36", "#86ad45"]
    }) } },
  { id: "water", water: true, swatch: "#2a8a92", w: 2, h: 1, base: "#1f6f7d", pattern: waves() },
  // Sable et roche : au bord de l'eau, ils font une plage et une falaise (coast.js).
  { id: "sand", soft: true, swatch: "#d9c08f", w: 8, h: 8, base: "#cdb486", pattern: painted("sand", 8, "#c4a878", "#ead8ad", 0.22, 7) + sandRipples() + speckles(47, 220, ["#b3986a", "#f2e4c2", "#a88d60"], 0.008, 0.022, 8, 8) },
  { id: "rock", swatch: "#7c766c", w: 6, h: 6, base: "#5f5a52", pattern: painted("rock", 6, "#5a554d", "#8f897e", 0.32, 13) + rockCracks() },
  // Sols de forêt peints élément par élément (ground.js) : `ground` nomme leur tuile, calculée à
  // la demande ; en attendant, leur motif simple ci-dessous.
  { id: "litter", soft: true, swatch: "#7a5428", w: 8, h: 8, base: "#4a3420", ground: "litter",
    pattern: painted("litter", 8, "#3a2614", "#7a5428", 0.4, 17) + speckles(53, 600, ["#9a5a22", "#c48a3a", "#5a3820", "#7d6a2a"], 0.02, 0.05, 8, 8) },
  { id: "needles", soft: true, swatch: "#6e4a28", w: 8, h: 8, base: "#4a3018", ground: "needles",
    pattern: painted("needles", 8, "#3a2414", "#6e4426", 0.3, 19) + speckles(59, 300, ["#3a6020", "#5a8228", "#8e5a2c"], 0.03, 0.09, 8, 8) },
  // Vase de marais : terre gorgée d'eau, luisante, flaques, tiges mortes et algues.
  { id: "mud", soft: true, swatch: "#5a5430", w: 8, h: 8, base: "#4a4428", ground: "mud",
    pattern: painted("mud", 8, "#3a3420", "#6a6236", 0.3, 23) + speckles(61, 260, ["#4a5a32", "#2e2618", "#7a7044"], 0.02, 0.06, 8, 8) }
];

/** Rides de vent sur le sable, très douces. */
function sandRipples() {
  const rand = mulberry32(71);
  let out = "";
  for (let i = 0; i < 26; i++) {
    const x = r3(rand() * 8), y = r3(rand() * 8), len = r3(0.6 + rand() * 1.4), bend = r3((rand() - 0.5) * 0.25);
    out += `<path d="M${x} ${y}q${r3(len / 2)} ${bend} ${len} 0" stroke="#b89e70" stroke-opacity="0.35" stroke-width="0.03" fill="none" stroke-linecap="round"/>`;
  }
  return out;
}

/** Fissures et arêtes de la roche. */
function rockCracks() {
  const rand = mulberry32(29);
  let dark = "", light = "";
  for (let i = 0; i < 22; i++) {
    let x = rand() * 6, y = rand() * 6, d = `M${r3(x)} ${r3(y)}`;
    let a = rand() * Math.PI * 2;
    for (let k = 0; k < 3 + Math.floor(rand() * 3); k++) {
      a += (rand() - 0.5) * 1.2;
      const l = 0.15 + rand() * 0.35;
      x += Math.cos(a) * l; y += Math.sin(a) * l;
      d += `L${r3(x)} ${r3(y)}`;
    }
    dark += d;
    light += `M${r3(rand() * 6)} ${r3(rand() * 6)}l${r3(0.2 + rand() * 0.3)} ${r3((rand() - 0.5) * 0.2)}`;
  }
  return `<path d="${dark}" stroke="#3f3b35" stroke-opacity="0.7" stroke-width="0.025" fill="none" stroke-linejoin="round"/>`
    + `<path d="${light}" stroke="#b3ada2" stroke-opacity="0.35" stroke-width="0.03" fill="none" stroke-linecap="round"/>`;
}

export const TERRAIN_IDS = new Set(TERRAINS.map((t) => t.id));

/** Sol de fond de chaque biome (biomes.js). */
export const BIOME_SOILS = { broadleaf: "litter", conifer: "needles", marsh: "mud" };

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

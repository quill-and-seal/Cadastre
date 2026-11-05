/**
 * Bibliothèque d'assets : images venues de l'extérieur (packs d'assets, fichiers du MJ)
 * utilisées comme objets ou comme textures de sol. Données pures, sans Foundry ni DOM.
 *
 * Un asset :
 *   { id, name, kind: "prop"|"texture", src, w, h, tags: [], soft? }
 *     src  : chemin de l'image (dans les données de Foundry, ou URL)
 *     w, h : taille en cases (objet : emprise ; texture : taille d'un motif qui se répète)
 *     soft : texture au bord fondu sur ses voisins (sols naturels)
 *
 * Dans une carte, un asset est désigné par `asset:<id>`, et la carte garde une copie
 * des assets qu'elle utilise (map.assets) : elle reste affichable même si l'asset
 * change ou disparaît de la bibliothèque.
 */

export const ASSET_PREFIX = "asset:";
export const ASSET_KINDS = ["prop", "texture"];
export const IMAGE_EXTENSIONS = ["png", "webp", "jpg", "jpeg", "svg", "avif", "gif"];

/** Pixels par case des assets à l'import : 200 px est la norme de la plupart des packs (Forgotten Adventures…). */
export const DEFAULT_ASSET_PPC = 200;

export const MIN_ASSET_CELLS = 0.1;
export const MAX_ASSET_CELLS = 40;

const round3 = (n) => Math.round(n * 1000) / 1000;
const clamp = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export const assetKey = (id) => `${ASSET_PREFIX}${id}`;
export const isAssetKey = (key) => typeof key === "string" && key.startsWith(ASSET_PREFIX);
export const assetIdOf = (key) => (isAssetKey(key) ? key.slice(ASSET_PREFIX.length) : null);

export function extensionOf(path) {
  const clean = String(path ?? "").split(/[?#]/)[0];
  const dot = clean.lastIndexOf(".");
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : "";
}

export const isImagePath = (path) => IMAGE_EXTENSIONS.includes(extensionOf(path));

/** Nom lisible à partir d'un chemin : « Barrel_Wood_A1_1x1.webp » → « Barrel Wood A1 ». */
export function nameFromPath(path) {
  let base = decodeURIComponent(String(path ?? "").split(/[?#]/)[0].split("/").pop() || "");
  base = base.replace(/\.[a-z0-9]+$/i, "");
  base = base.replace(/[_-]+\d+x\d+$/i, ""); // suffixe de taille des packs (« _2x1 »)
  base = base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return base || "asset";
}

/** Taille en cases écrite dans le nom de fichier (« _2x1 », « 3x3 »), si elle y est. */
export function sizeFromPath(path) {
  const m = /(?:^|[_\-\s.])(\d{1,2})x(\d{1,2})(?:[_\-\s.]|$)/i.exec(decodeURIComponent(String(path ?? "").split("/").pop()));
  if (!m) return null;
  const w = Number(m[1]), h = Number(m[2]);
  return w > 0 && h > 0 ? { w, h } : null;
}

/**
 * Devine le type d'un asset d'après son chemin : un dossier ou un nom qui parle de
 * sol, texture, terrain… donne une texture ; le reste est un objet.
 */
export function guessKind(path) {
  const p = String(path ?? "").toLowerCase();
  return /(textures?|terrains?|floors?|grounds?|tiles?|sols?|seamless|motifs?)(\/|_|-|\s|\.|$)/.test(p) ? "texture" : "prop";
}

/** Étiquettes tirées des sous-dossiers, relatifs au dossier importé. */
export function tagsFromPath(path, root = "") {
  const rel = root && path.startsWith(root) ? path.slice(root.length) : path;
  const parts = decodeURIComponent(rel).split("/").filter(Boolean);
  parts.pop(); // le fichier
  return parts.map((p) => p.replace(/[_-]+/g, " ").trim().toLowerCase()).filter(Boolean).slice(-3);
}

export function normalizeTags(tags) {
  const list = Array.isArray(tags) ? tags : String(tags ?? "").split(",");
  return [...new Set(list.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 12);
}

/** Remet en forme un asset ; null s'il est inutilisable. */
export function normalizeAsset(raw) {
  if (!raw || typeof raw !== "object") return null;
  const src = typeof raw.src === "string" ? raw.src.trim() : "";
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!src || !id || !/^[\w.-]{1,64}$/.test(id)) return null;
  const kind = ASSET_KINDS.includes(raw.kind) ? raw.kind : guessKind(src);
  const out = {
    id,
    name: String(raw.name ?? "").trim().slice(0, 80) || nameFromPath(src),
    kind,
    src,
    w: round3(clamp(raw.w, MIN_ASSET_CELLS, MAX_ASSET_CELLS, 1)),
    h: round3(clamp(raw.h, MIN_ASSET_CELLS, MAX_ASSET_CELLS, 1)),
    tags: normalizeTags(raw.tags)
  };
  if (kind === "texture" && raw.soft) out.soft = true;
  return out;
}

/** Liste d'assets propre : entrées invalides écartées, identifiants et sources uniques. */
export function normalizeLibrary(raw) {
  const out = [];
  const ids = new Set(), srcs = new Set();
  for (const item of Array.isArray(raw) ? raw : []) {
    const asset = normalizeAsset(item);
    if (!asset || ids.has(asset.id) || srcs.has(`${asset.kind}|${asset.src}`)) continue;
    ids.add(asset.id);
    srcs.add(`${asset.kind}|${asset.src}`);
    out.push(asset);
  }
  return out;
}

/** Identifiant court, stable pour une source et un type donnés (le même fichier réimporté garde son id). */
export function assetIdFor(src, kind = "prop") {
  let h = 2166136261;
  for (const c of `${kind}|${src}`) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return `a${(h >>> 0).toString(36)}`;
}

/**
 * Asset tout prêt à partir d'un fichier.
 * @param {string} src
 * @param {{width?:number, height?:number, ppc?:number, kind?:string, root?:string, name?:string}} [info]
 *   width/height : taille de l'image en pixels, ppc : pixels par case de l'asset
 */
export function assetFromFile(src, { width = 0, height = 0, ppc = DEFAULT_ASSET_PPC, kind = null, root = "", name = null } = {}) {
  const k = ASSET_KINDS.includes(kind) ? kind : guessKind(src);
  const named = sizeFromPath(src);
  let w, h;
  if (named && k === "prop") ({ w, h } = named);
  else if (width > 0 && height > 0) { w = width / ppc; h = height / ppc; }
  else { w = 1; h = 1; }
  return normalizeAsset({
    id: assetIdFor(src, k),
    name: name ?? nameFromPath(src),
    kind: k,
    src,
    w, h,
    tags: tagsFromPath(src, root),
    soft: false
  });
}

/** Ajoute ou remplace des assets (même id : l'ancien est mis à jour). Renvoie la nouvelle liste. */
export function mergeAssets(library, assets) {
  const byId = new Map(normalizeLibrary(library).map((a) => [a.id, a]));
  for (const a of assets) {
    const n = normalizeAsset(a);
    if (n) byId.set(n.id, n);
  }
  return normalizeLibrary([...byId.values()]);
}

/** Recherche : texte (nom et étiquettes), type, étiquette. */
export function filterAssets(library, { query = "", kind = null, tag = null } = {}) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  return library.filter((a) => {
    if (kind && a.kind !== kind) return false;
    if (tag && !a.tags.includes(tag)) return false;
    const hay = `${a.name} ${a.tags.join(" ")}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Toutes les étiquettes, les plus fréquentes d'abord. */
export function allTags(library) {
  const count = new Map();
  for (const a of library) for (const t of a.tags) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count].sort((p, q) => q[1] - p[1] || p[0].localeCompare(q[0])).map(([t]) => t);
}

/* -------------------------------------------- */
/*  Assets d'une carte                          */
/* -------------------------------------------- */

/** Copie d'un asset dans une carte (sans les étiquettes, inutiles au rendu). */
export function embedAsset(map, asset) {
  const a = normalizeAsset(asset);
  if (!a) return null;
  map.assets ??= {};
  const { tags, ...copy } = a;
  void tags;
  map.assets[a.id] = copy;
  return assetKey(a.id);
}

/** Définition d'un asset utilisé par la carte, à partir de sa clé `asset:<id>`. */
export function mapAsset(map, key) {
  const id = assetIdOf(key);
  return id ? map.assets?.[id] ?? null : null;
}

/** Sources des images effectivement utilisées par la carte (pour l'export). */
export function usedAssetSources(map) {
  const used = new Set();
  for (const key of Object.keys(map.terrains ?? {})) {
    const a = mapAsset(map, key);
    if (a) used.add(a.src);
  }
  for (const p of map.props ?? []) {
    const a = mapAsset(map, p.type);
    if (a) used.add(a.src);
  }
  return [...used];
}

/** Retire de la carte les copies d'assets qu'elle n'utilise plus. */
export function pruneAssets(map) {
  if (!map.assets) return false;
  const used = new Set([...Object.keys(map.terrains ?? {}), ...(map.props ?? []).map((p) => p.type)]
    .map(assetIdOf).filter(Boolean));
  let changed = false;
  for (const id of Object.keys(map.assets)) {
    if (!used.has(id)) { delete map.assets[id]; changed = true; }
  }
  return changed;
}

/**
 * Met à jour les copies d'une carte à partir de la bibliothèque
 * (taille, nom, image modifiés dans la bibliothèque). Les assets supprimés restent.
 */
export function refreshMapAssets(map, library) {
  if (!map.assets) return false;
  const byId = new Map(library.map((a) => [a.id, a]));
  let changed = false;
  for (const id of Object.keys(map.assets)) {
    const fresh = byId.get(id);
    if (!fresh) continue;
    const { tags, ...copy } = fresh;
    void tags;
    if (JSON.stringify(copy) !== JSON.stringify(map.assets[id])) { map.assets[id] = copy; changed = true; }
  }
  return changed;
}

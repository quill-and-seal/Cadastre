/**
 * Stockage des cartes : une entrée de journal par carte, dans un dossier « Cadastre ».
 * La carte est gardée en JSON dans un drapeau texte, pour qu'une sauvegarde
 * remplace tout (un objet serait fusionné et garderait les cases effacées).
 */
import { MODULE_ID } from "./constants.js";
import { createMap, normalizeMap } from "./model.js";

const JournalEntryCls = () => CONFIG.JournalEntry.documentClass;
const FolderCls = () => CONFIG.Folder.documentClass;

export const isMapEntry = (entry) => typeof entry?.flags?.[MODULE_ID]?.map === "string";

export function listMapEntries() {
  return game.journal.filter(isMapEntry).sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}

export function readMap(entry) {
  try {
    const map = normalizeMap(JSON.parse(entry.flags[MODULE_ID].map));
    if (!map.name) map.name = entry.name;
    return map;
  } catch (error) {
    console.error(`${MODULE_ID} | Carte illisible : ${entry.name}`, error);
    return createMap({ name: entry.name });
  }
}

async function ensureFolder() {
  const existing = game.folders.find((f) => f.type === "JournalEntry" && f.getFlag(MODULE_ID, "root"));
  if (existing) return existing;
  return FolderCls().create({
    name: game.i18n.localize("CADASTRE.Manager.Folder"),
    type: "JournalEntry",
    color: "#7a5a2a",
    flags: { [MODULE_ID]: { root: true } }
  });
}

export async function createMapEntry(map) {
  const folder = await ensureFolder();
  return JournalEntryCls().create({
    name: map.name || game.i18n.localize("CADASTRE.Manager.Untitled"),
    folder: folder?.id ?? null,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
    flags: { [MODULE_ID]: { map: JSON.stringify(map) } }
  });
}

export function saveMap(entry, map) {
  return entry.update({
    name: map.name || entry.name,
    [`flags.${MODULE_ID}.map`]: JSON.stringify(map)
  });
}

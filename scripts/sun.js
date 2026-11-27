/**
 * Soleil de la scène : l'heure du jour (réglage « Heure du soleil », changeable en pleine partie)
 * donne la direction et la longueur des ombres de tout ce qui en porte (arbres, objets, murs).
 * Le soleil se lève à l'est (6 h), passe au sud à midi (les ombres pointent vers le nord, en haut
 * de la carte), se couche à l'ouest (18 h).
 */
import { MODULE_ID } from "./constants.js";

/** Hauteur du soleil à midi, et au plus bas (avant 6 h et après 18 h, en degrés). */
const NOON_ELEVATION = 62, LOW_ELEVATION = 9;
/** Longueur d'ombre par case de hauteur, au plus (soleil rasant). */
const MAX_LENGTH = 3;

let cached = null;

/**
 * @param {number} hour  heure du jour (5 à 21)
 * @returns {{hour:number, dir:number[], len:number, elevation:number, light:number}}
 *   dir : direction des ombres (cases, unitaire) ; len : longueur d'ombre par case de hauteur ;
 *   light : force du soleil (0..1), plus faible à l'aube et au crépuscule
 */
export function sunAt(hour) {
  const h = Math.max(5, Math.min(21, Number(hour) || 15));
  // Direction des ombres : à l'ouest au lever, au nord à midi, à l'est au coucher.
  const phi = Math.PI + ((h - 6) / 12) * Math.PI;
  const day = Math.sin((Math.max(6, Math.min(18, h)) - 6) / 12 * Math.PI);
  const elevation = Math.max(LOW_ELEVATION, NOON_ELEVATION * day);
  const len = Math.min(MAX_LENGTH, 1 / Math.tan((elevation * Math.PI) / 180));
  const light = 0.45 + 0.55 * Math.min(1, elevation / 25);
  return { hour: h, dir: [Math.cos(phi), Math.sin(phi)], len, elevation, light };
}

/** Soleil réglé pour la scène. */
export function sunState() {
  if (cached) return cached;
  let hour = 15;
  try { hour = Number(game.settings.get(MODULE_ID, "sunTime")); } catch { /* réglage absent */ }
  return (cached = sunAt(hour));
}

/** Change l'heure du soleil (MJ) : toutes les ombres suivent, chez tous les joueurs. */
export async function setSunTime(hour) {
  if (!game.user?.isGM) return;
  await game.settings.set(MODULE_ID, "sunTime", Math.max(5, Math.min(21, Number(hour) || 15)));
}

export function registerSun() {
  game.settings.register(MODULE_ID, "sunTime", {
    name: "CADASTRE.Settings.SunTime",
    hint: "CADASTRE.Settings.SunTimeHint",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 5, max: 21, step: 0.25 },
    default: 15,
    onChange: () => { cached = null; Hooks.callAll("cadastreSun", sunState()); }
  });
}

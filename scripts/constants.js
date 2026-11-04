export const MODULE_ID = "cadastre";

/** Version du format de carte enregistré. */
export const FORMAT_VERSION = 1;

/** Limites de taille d'une carte, en cases. */
export const MIN_CELLS = 4;
export const MAX_CELLS = 120;

/** Taille d'une case dans la scène exportée, en pixels. */
export const DEFAULT_GRID_SIZE = 100;
export const MIN_GRID_SIZE = 50;
export const MAX_GRID_SIZE = 300;

/** Côté maximal de l'image exportée : au-delà, l'image est réduite et Foundry l'étire. */
export const MAX_TEXTURE = 8192;

/** Nombre d'états gardés pour l'annulation. */
export const HISTORY_LIMIT = 150;

export const log = (...args) => console.log(`${MODULE_ID} |`, ...args);

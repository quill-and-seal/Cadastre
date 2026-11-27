/**
 * Masque des ombres des arbres, partagé entre calques : le calque des arbres le dessine une fois
 * (une petite image de toute la carte, l'opacité des ombres), l'eau animée le lit pour éteindre
 * ses reflets de soleil à l'ombre.
 */
let current = null;

/**
 * @param {{texture:PIXI.Texture, rect:number[], level:number}|null} mask
 *   rect : [x, y, largeur, hauteur] en cases ; level : intensité des ombres réglée (0..1)
 */
export function setShadowMask(mask) {
  current = mask;
}

export const getShadowMask = () => (current?.texture?.valid === false ? null : current);

import { BELOW_MD, mediaMatches } from './media'

/**
 * Whether the canvas scenes should spend the phone budget: below md, or on a touch-first device of
 * any width (a tablet's GPU is a phone's). Fewer stars and stalks, fewer noise layers in the hero
 * shader, a lower device-pixel cap.
 */
export function isPhoneBudget(): boolean {
  return mediaMatches(BELOW_MD) || mediaMatches('(pointer: coarse)')
}

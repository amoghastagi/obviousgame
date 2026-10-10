/*
 * Fruit Shockers — character → accent color (leaderboard dots).
 * Maps loadout character ids onto the design tokens that mirror
 * src/graphics/palette.js. Never hardcode ids outside loadout.js + here.
 */

const CHARACTER_ACCENTS = Object.freeze({
  banana_commando: 'var(--color-banana)',
  watermelon_tank: 'var(--color-melon-rind)',
  strawberry_scout: 'var(--color-strawberry)',
})

/** Accent color for a character id; unknown ids fall back to neon cyan. */
export function characterColor(characterId) {
  return CHARACTER_ACCENTS[characterId] ?? 'var(--color-neon-cyan)'
}

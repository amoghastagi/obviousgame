/*
 * Fruit Shockers — HUD weapon glyphs (inline SVG, no image assets).
 * One simple glyph per weapon id from src/data/loadout.js:
 *   peel_launcher → curved peel arc in flight
 *   seed_shotgun  → seed scatter fanning out
 *   vine_sniper   → zigzag vine with a leaf and a berry tip
 * Strokes/fills reference design tokens only. Unknown ids (engine ahead of
 * data) get a neutral fallback reticle so the chip never renders empty.
 */

const BASE = 'aria-hidden="true" focusable="false"'

const FALLBACK = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-ink)" stroke-width="2" ${BASE}>
  <circle cx="12" cy="12" r="6.5"/>
  <circle cx="12" cy="12" r="1.6" fill="var(--color-ink)" stroke="none"/>
</svg>`

const GLYPHS = {
  peel_launcher: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" ${BASE}>
    <path d="M4 16.5C6.5 8.5 15.5 5.5 20.5 10" stroke="var(--color-banana-deep)" stroke-width="2.6"/>
    <path d="M6.5 18.5C8.5 12.5 15 10.5 18.5 13.5" stroke="var(--color-banana)" stroke-width="2.2"/>
    <circle cx="4" cy="16.5" r="1.7" fill="var(--color-neon-pink)"/>
  </svg>`,

  seed_shotgun: `<svg viewBox="0 0 24 24" fill="none" ${BASE}>
    <ellipse cx="6.5" cy="17.5" rx="1.6" ry="2.6" transform="rotate(-38 6.5 17.5)" fill="var(--color-ink)"/>
    <ellipse cx="11" cy="13" rx="1.7" ry="2.8" transform="rotate(-12 11 13)" fill="var(--color-ink)"/>
    <ellipse cx="16" cy="9" rx="1.6" ry="2.6" transform="rotate(14 16 9)" fill="var(--color-ink)"/>
    <ellipse cx="19.5" cy="5.5" rx="1.3" ry="2.1" transform="rotate(38 19.5 5.5)" fill="var(--color-melon-flesh)"/>
    <ellipse cx="15" cy="17" rx="1.3" ry="2.1" transform="rotate(8 15 17)" fill="var(--color-melon-flesh)"/>
  </svg>`,

  vine_sniper: `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round" ${BASE}>
    <path d="M3 19.5 8.5 11l3 3.5L16.5 7l4.5 2.5" stroke="var(--color-melon-deep)" stroke-width="2.4"/>
    <path d="M8.5 11C6.2 10.7 4.9 9.4 4.6 7.4c2 .3 3.3 1.6 3.9 3.6Z" fill="var(--color-melon-rind)"/>
    <circle cx="20.5" cy="4.5" r="1.6" fill="var(--color-neon-pink)"/>
  </svg>`,
}

/** Inline SVG string for a weapon id, or the neutral fallback. */
export function getWeaponGlyph(weaponId) {
  return GLYPHS[weaponId] ?? FALLBACK
}

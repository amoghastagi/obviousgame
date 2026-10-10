/*
 * Fruit Shockers — inline weapon glyphs.
 *
 * Hand-drawn SVG (no image assets) keyed by weapon id from loadout.WEAPONS.
 * Strokes/fills reference the design tokens from tokens.css, so the glyphs
 * stay on-palette for free. Display only — always aria-hidden.
 */

export const WEAPON_GLYPHS = Object.freeze({
  // Peel Launcher: curved peel arc arcing up-right, lighter curl at the tip,
  // launch sparks and motion dashes at the tail.
  peel_launcher: /* html */ `
    <svg viewBox="0 0 48 48" width="44" height="44" fill="none" aria-hidden="true">
      <path d="M9 37 C 11 20 26 9 40 15" stroke="var(--color-banana-deep)" stroke-width="6" stroke-linecap="round"/>
      <path d="M40 15 C 44 17 45 21 42 24" stroke="var(--color-banana)" stroke-width="6" stroke-linecap="round"/>
      <path d="M17 42 h5" stroke="var(--color-ink)" stroke-width="2.5" stroke-linecap="round" opacity="0.4"/>
      <path d="M8 44 h4" stroke="var(--color-ink)" stroke-width="2.5" stroke-linecap="round" opacity="0.4"/>
      <circle cx="9" cy="32" r="2.2" fill="var(--color-neon-pink)"/>
    </svg>`,

  // Seed Shotgun: muzzle chevron with seeds scattering in a fan, plus juice specks.
  seed_shotgun: /* html */ `
    <svg viewBox="0 0 48 48" width="44" height="44" fill="none" aria-hidden="true">
      <path d="M6 25 h7" stroke="var(--color-ink)" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="21" cy="14" rx="3" ry="4.5" transform="rotate(24 21 14)" fill="var(--color-ink)"/>
      <ellipse cx="30" cy="19" rx="3" ry="4.5" transform="rotate(12 30 19)" fill="var(--color-ink)"/>
      <ellipse cx="26" cy="30" rx="3" ry="4.5" transform="rotate(-14 26 30)" fill="var(--color-ink)"/>
      <ellipse cx="38" cy="29" rx="3" ry="4.5" transform="rotate(-26 38 29)" fill="var(--color-ink)"/>
      <ellipse cx="39" cy="11" rx="3" ry="4.5" transform="rotate(28 39 11)" fill="var(--color-ink)"/>
      <circle cx="17" cy="24" r="2" fill="var(--color-melon-flesh)"/>
      <circle cx="35" cy="21" r="1.6" fill="var(--color-melon-flesh)"/>
    </svg>`,

  // Vine Sniper: zigzag vine with lime leaves, a curling tendril, and a target dot.
  vine_sniper: /* html */ `
    <svg viewBox="0 0 48 48" width="44" height="44" fill="none" aria-hidden="true">
      <path d="M7 40 L 19 31 L 13 23 L 27 15 L 22 7" stroke="var(--color-melon-deep)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <ellipse cx="26" cy="29" rx="4" ry="2.4" transform="rotate(-18 26 29)" fill="var(--color-neon-lime)"/>
      <ellipse cx="15" cy="15" rx="2.4" ry="4" transform="rotate(64 15 15)" fill="var(--color-neon-lime)"/>
      <path d="M22 7 C 25 3 30 4 30 8" stroke="var(--color-melon-deep)" stroke-width="3" stroke-linecap="round"/>
      <circle cx="38" cy="9" r="2.5" fill="var(--color-neon-pink)"/>
    </svg>`,
})

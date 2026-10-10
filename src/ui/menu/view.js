/*
 * Fruit Shockers — MENU view builders.
 *
 * Pure HTML-string factories plus the accent map that ties each character and
 * weapon to its design-token colors. No DOM access here — index.js renders
 * the shell once and flips state classes imperatively.
 */

import { CHARACTERS, WEAPONS } from '../../data/loadout.js'
import { WEAPON_GLYPHS } from './glyphs.js'

// Accent gradients per id — tokens.css is the color source of truth.
export const CHARACTER_ACCENTS = Object.freeze({
  banana_commando: { from: 'var(--color-banana)', to: 'var(--color-banana-deep)' },
  watermelon_tank: { from: 'var(--color-melon-rind)', to: 'var(--color-melon-flesh)' },
  strawberry_scout: { from: 'var(--color-neon-pink)', to: 'var(--color-strawberry-deep)' },
})

export const WEAPON_ACCENTS = Object.freeze({
  peel_launcher: { from: 'var(--color-banana)', to: 'var(--color-banana-deep)' },
  seed_shotgun: { from: 'var(--color-melon-flesh)', to: 'var(--color-strawberry-deep)' },
  vine_sniper: { from: 'var(--color-neon-lime)', to: 'var(--color-melon-deep)' },
})

const CHARACTER_STATS = Object.freeze([
  ['Speed', 'speed'],
  ['Armor', 'armor'],
  ['Agility', 'agility'],
])

const WEAPON_STATS = Object.freeze([
  ['Damage', 'damage'],
  ['Fire rate', 'fireRate'],
  ['Range', 'range'],
])

/** One accent-colored neon segmented bar per stat, via the shared .stat-bar utility. */
function statRows(labels, stats, accent) {
  return labels
    .map(
      ([label, key]) => /* html */ `
        <span class="grid w-full grid-cols-[6rem_1fr] items-center gap-2.5">
          <span class="text-[0.65rem] font-bold uppercase tracking-wide text-ink/55">${label}</span>
          <span class="stat-bar" style="--stat-value: ${stats[key]}; --stat-from: ${accent.from}; --stat-to: ${accent.to}"></span>
        </span>`,
    )
    .join('')
}

/** Inline custom-property string carrying a card's accent colors. */
function accentStyle(accent) {
  return `--accent-from: ${accent.from}; --accent-to: ${accent.to}`
}

/** One glassmorphism character card (accent glow, blurb, Speed/Armor/Agility bars). */
export function characterCardHTML(character) {
  const accent = CHARACTER_ACCENTS[character.id]
  return /* html */ `
    <button
      type="button"
      class="glass-panel menu-card flex flex-col items-start gap-3 p-5 text-left"
      data-action="select-character"
      data-id="${character.id}"
      style="${accentStyle(accent)}"
      aria-pressed="false"
    >
      <span class="select-chip">Selected</span>
      <span class="fruit-orb" aria-hidden="true"></span>
      <span class="font-display text-lg font-extrabold tracking-wide">${character.name}</span>
      <span class="text-sm font-medium leading-snug text-ink/70">${character.blurb}</span>
      <span class="mt-1 flex w-full flex-col gap-2">
        ${statRows(CHARACTER_STATS, character.stats, accent)}
      </span>
    </button>`
}

/** One glassmorphism weapon card (SVG glyph, Damage/Fire rate/Range bars, ammo readout). */
export function weaponCardHTML(weapon) {
  const accent = WEAPON_ACCENTS[weapon.id]
  return /* html */ `
    <button
      type="button"
      class="glass-panel menu-card flex flex-col items-start gap-3 p-5 text-left"
      data-action="select-weapon"
      data-id="${weapon.id}"
      style="${accentStyle(accent)}"
      aria-pressed="false"
    >
      <span class="select-chip">Selected</span>
      <span class="weapon-glyph" aria-hidden="true">${WEAPON_GLYPHS[weapon.id]}</span>
      <span class="font-display text-lg font-extrabold tracking-wide">${weapon.name}</span>
      <span class="flex w-full flex-col gap-2">
        ${statRows(WEAPON_STATS, weapon.stats, accent)}
      </span>
      <span class="glass-chip mt-1 text-xs font-extrabold tracking-wide">
        <span class="text-ink/55">MAG</span> ${weapon.ammo.mag}
        <span class="text-ink/55">· RES</span> ${weapon.ammo.reserve}
      </span>
    </button>`
}

/** Full menu skeleton: title block plus the 'select' and 'confirm' sections. */
export function shellHTML() {
  return /* html */ `
    <div class="surface-interactive flex h-full w-full flex-col overflow-y-auto overscroll-contain">
      <div class="mx-auto my-auto flex w-full max-w-6xl flex-col items-center gap-7 px-4 py-10 sm:px-6">
        <header class="text-center">
          <p class="text-[0.7rem] font-bold uppercase tracking-[0.35em] text-ink/60">Low-poly grocery arena</p>
          <h1 class="display-title title-sheen mt-2 text-5xl sm:text-6xl md:text-7xl">Fruit Shockers</h1>
          <p class="mt-3 text-sm font-semibold text-ink/70 sm:text-base">Checkout or be checked out.</p>
        </header>

        <section data-section="select" class="flex w-full flex-col items-center gap-6" aria-label="Character and weapon selection">
          <div class="w-full">
            <h2 class="mb-3 text-center text-xs font-bold uppercase tracking-[0.3em] text-ink/55">Pick your fruit</h2>
            <div class="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-3">
              ${CHARACTERS.map(characterCardHTML).join('')}
            </div>
          </div>

          <div class="w-full">
            <h2 class="mb-3 text-center text-xs font-bold uppercase tracking-[0.3em] text-ink/55">Pick your weapon</h2>
            <div class="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-3">
              ${WEAPONS.map(weaponCardHTML).join('')}
            </div>
          </div>

          <button type="button" class="btn-neon min-h-11" data-action="confirm">Confirm loadout</button>
          <p class="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-ink/45">
            Arrows move focus &middot; Enter selects
          </p>
        </section>

        <section data-section="confirm" class="flex w-full flex-col items-center gap-7" hidden aria-label="Confirm loadout">
          <h2 class="text-xs font-bold uppercase tracking-[0.3em] text-ink/55">Loadout locked?</h2>
          <div class="glass-panel flex w-full max-w-2xl flex-col items-center justify-center gap-4 p-5 sm:flex-row sm:gap-7">
            <div class="flex items-center gap-3">
              <span class="fruit-orb" data-role="confirm-orb" aria-hidden="true"></span>
              <span class="block text-left">
                <span class="block text-[0.6rem] font-bold uppercase tracking-[0.2em] text-ink/50">Character</span>
                <span class="block font-display text-lg font-extrabold" data-role="confirm-character"></span>
              </span>
            </div>
            <span class="font-display text-2xl font-black text-neon-pink" aria-hidden="true">&times;</span>
            <div class="flex items-center gap-3">
              <span class="weapon-glyph" data-role="confirm-glyph" aria-hidden="true"></span>
              <span class="block text-left">
                <span class="block text-[0.6rem] font-bold uppercase tracking-[0.2em] text-ink/50">Weapon</span>
                <span class="block font-display text-lg font-extrabold" data-role="confirm-weapon"></span>
              </span>
            </div>
            <span class="glass-chip text-xs font-extrabold tracking-wide" data-role="confirm-ammo"></span>
          </div>
          <button type="button" class="btn-neon px-14 py-5 text-2xl" data-action="play">Play</button>
          <button type="button" class="btn-neon--ghost min-h-11" data-action="back">Back</button>
        </section>
      </div>
    </div>`
}

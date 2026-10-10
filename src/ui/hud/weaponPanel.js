/*
 * Fruit Shockers — HUD active weapon chip (bottom-right, above the ammo).
 *
 * Store-driven: reads { weapon: { id, name } } from hudStore and swaps the
 * inline-SVG glyph + name on change, with a small pop animation.
 */

import { subscribe } from '../../core/hudStore.js'
import { getWeaponGlyph } from './weaponGlyphs.js'
import { retrigger } from './retrigger.js'

const MARKUP = /* html */ `
  <div class="glass-chip hud-weapon-chip flex items-center gap-2.5">
    <span class="hud-weapon-glyph flex h-8 w-8 items-center justify-center"></span>
    <div>
      <p class="text-[10px] font-bold uppercase tracking-[0.25em] text-ink/50">Weapon</p>
      <p class="hud-weapon-name font-display text-sm font-extrabold uppercase leading-tight tracking-wide">—</p>
    </div>
  </div>
`

export function createWeaponPanel(mountEl) {
  mountEl.innerHTML = MARKUP
  const chip = mountEl.querySelector('.hud-weapon-chip')
  const glyphEl = mountEl.querySelector('.hud-weapon-glyph')
  const nameEl = mountEl.querySelector('.hud-weapon-name')

  let prevId // undefined until the first snapshot lands

  const render = ({ weapon }) => {
    const id = weapon?.id ?? null
    glyphEl.innerHTML = getWeaponGlyph(id)
    nameEl.textContent = weapon ? weapon.name : '—'
    chip.classList.toggle('is-unset', !weapon)
    if (weapon && prevId !== undefined && prevId !== id) retrigger(chip, 'is-swap')
    prevId = id
  }

  subscribe(render)
}

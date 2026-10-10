/*
 * Fruit Shockers — HUD ammo counter (bottom-right).
 *
 * Store-driven: reads { ammo: { mag, reserve, reloading } } from hudStore.
 * Large mag numeral, smaller reserve readout; while `reloading`, the count
 * pulses and a RELOADING chip appears. Placeholder dashes render until the
 * first weapon:change puts the store in a live state.
 */

import { subscribe } from '../../core/hudStore.js'

const MARKUP = /* html */ `
  <div class="glass-chip hud-ammo relative flex items-end gap-2.5 px-5 py-3">
    <span class="hud-reload-chip" hidden>Reloading</span>
    <p class="hud-ammo-mag font-display text-5xl font-black leading-none tabular-nums">—</p>
    <div class="pb-1">
      <p class="hud-ammo-reserve text-sm font-extrabold tabular-nums text-ink/70">/ —</p>
      <p class="text-[9px] font-bold uppercase tracking-[0.22em] text-ink/50">Reserve</p>
    </div>
  </div>
`

export function createAmmoPanel(mountEl) {
  mountEl.innerHTML = MARKUP
  const panel = mountEl.querySelector('.hud-ammo')
  const magEl = mountEl.querySelector('.hud-ammo-mag')
  const reserveEl = mountEl.querySelector('.hud-ammo-reserve')
  const reloadChip = mountEl.querySelector('.hud-reload-chip')

  const render = ({ ammo, weapon }) => {
    const live = weapon !== null // snapshot placeholders until match:start
    magEl.textContent = live ? String(ammo.mag) : '—'
    reserveEl.textContent = live ? `/ ${ammo.reserve}` : '/ —'
    panel.classList.toggle('is-reloading', ammo.reloading)
    reloadChip.hidden = !ammo.reloading
    magEl.classList.toggle('is-empty', live && !ammo.reloading && ammo.mag === 0)
  }

  subscribe(render)
}

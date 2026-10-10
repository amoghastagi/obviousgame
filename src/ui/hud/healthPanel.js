/*
 * Fruit Shockers — HUD health panel (bottom-left) + damage vignette.
 *
 * Store-driven: reads { health: { current, max } } from hudStore. The bar
 * animates its width, ramps green→amber→red with falling health, and a brief
 * red vignette flashes across the whole screen on large drops.
 */

import { subscribe } from '../../core/hudStore.js'
import { retrigger } from './retrigger.js'

/** Health tier from a 0..1 ratio — thresholds chosen so single hits walk the ramp. */
export function healthTier(ratio) {
  if (ratio > 0.55) return 'high'
  if (ratio > 0.25) return 'mid'
  return 'low'
}

/** A "large drop" is ≥10 damage in one update, or any fall to zero. */
export function isLargeDrop(prevCurrent, current) {
  if (prevCurrent === null) return false
  return current === 0 || prevCurrent - current >= 10
}

const MARKUP = /* html */ `
  <div class="glass-chip hud-health w-64 max-w-[42vw]" data-tier="high">
    <div class="flex items-baseline justify-between gap-3">
      <p class="text-[10px] font-bold uppercase tracking-[0.25em] text-ink/50">Health</p>
      <p class="hud-health-readout font-display text-sm font-extrabold tabular-nums">100 / 100</p>
    </div>
    <div class="hud-health-track mt-1.5">
      <div class="hud-health-fill" style="width: 100%"></div>
    </div>
  </div>
`

export function createHealthPanel(mountEl, vignetteEl) {
  mountEl.innerHTML = MARKUP
  const chip = mountEl.querySelector('.hud-health')
  const fill = mountEl.querySelector('.hud-health-fill')
  const readout = mountEl.querySelector('.hud-health-readout')

  let prevCurrent = null

  const render = ({ health }) => {
    const { current, max } = health
    const ratio = max > 0 ? current / max : 0

    chip.dataset.tier = healthTier(ratio)
    fill.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`
    readout.textContent = `${Math.round(current)} / ${max}`

    if (isLargeDrop(prevCurrent, current)) retrigger(vignetteEl, 'is-flashing')
    prevCurrent = current
  }

  subscribe(render)
}

/*
 * Fruit Shockers — HUD crosshair (dead center) + hitmarkers.
 *
 * Bus-only ephemeral signals (hudStore deliberately does not hold these):
 *   crosshair:update { spreadPx } → the four ticks breathe with weapon spread
 *   hit:confirm      { killed }   → flash an X hitmarker; bigger and red on kill
 */

import { bus, Events } from '../../core/eventBus.js'
import { retrigger } from './retrigger.js'

const MARKUP = /* html */ `
  <div class="hud-crosshair" data-hud="crosshair">
    <span class="hud-cross-tick hud-cross-tick--top"></span>
    <span class="hud-cross-tick hud-cross-tick--bottom"></span>
    <span class="hud-cross-tick hud-cross-tick--left"></span>
    <span class="hud-cross-tick hud-cross-tick--right"></span>
    <span class="hud-cross-dot"></span>
    <span class="hud-hitmarker" data-hud="hitmarker"><i></i><i></i><i></i><i></i></span>
  </div>
`

/** Contract range is 4–40px; clamp defensively so odd input can't invert the ticks. */
export function clampSpread(spreadPx) {
  return Math.min(40, Math.max(4, Number(spreadPx) || 0))
}

export function createCrosshair(rootEl) {
  rootEl.insertAdjacentHTML('beforeend', MARKUP)
  const el = rootEl.querySelector('[data-hud="crosshair"]')
  const marker = rootEl.querySelector('[data-hud="hitmarker"]')

  bus.on(Events.CROSSHAIR_UPDATE, ({ spreadPx }) => {
    el.style.setProperty('--hud-gap', `${clampSpread(spreadPx)}px`)
  })

  bus.on(Events.HIT_CONFIRM, ({ killed }) => {
    marker.classList.toggle('is-kill', killed === true)
    retrigger(marker, 'is-flash')
  })
}

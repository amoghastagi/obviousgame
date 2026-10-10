/*
 * Fruit Shockers — HUD surface.
 *
 * Contract with the shell (main.js):
 *   - exports init(rootEl): renders into the given mount and self-manages
 *     visibility by subscribing to `game:state` (visible in 'playing' and
 *     'paused'; in 'paused' a translucent "PAUSED — press Esc" glass veil
 *     covers the frozen view). Export signature stays stable.
 *   - persistent values (health / ammo / weapon / leaderboard) come from
 *     hudStore; the ephemeral crosshair + hit signals go straight over the bus.
 *   - emits no intents of its own: pause is Esc (handled by the shell) and
 *     quit lives in the modals surface.
 *
 * Layout (all pointer-transparent except the leaderboard collapse toggle):
 *   top-right    leaderboard (collapsible)
 *   bottom-left  health bar + readout
 *   bottom-right weapon chip above the ammo counter
 *   center       crosshair + hitmarkers
 *   screen-space damage vignette + pause veil
 */

import { bus, Events } from '../../core/eventBus.js'
import { getState, GameStates } from '../../core/gameState.js'
import './hud.css'
import { createHealthPanel } from './healthPanel.js'
import { createAmmoPanel } from './ammoPanel.js'
import { createWeaponPanel } from './weaponPanel.js'
import { createCrosshair } from './crosshair.js'
import { createLeaderboard } from './leaderboard.js'

export function init(rootEl) {
  rootEl.innerHTML = /* html */ `
    <div class="hud-readable absolute inset-0">
      <div data-mount="leaderboard" class="absolute right-3 top-3 md:right-4 md:top-4"></div>
      <div data-mount="health" class="absolute bottom-3 left-3 md:bottom-5 md:left-5"></div>
      <div class="absolute bottom-3 right-3 flex flex-col items-end gap-2 md:bottom-5 md:right-5">
        <div data-mount="weapon"></div>
        <div data-mount="ammo"></div>
      </div>
      <div class="hud-vignette" data-hud="vignette"></div>
      <div class="hud-pause-veil" data-hud="pause-veil" hidden>
        <div class="glass-panel px-10 py-8 text-center">
          <p class="display-title text-4xl">Paused</p>
          <p class="mt-3 text-[11px] font-bold uppercase tracking-[0.3em] text-ink/60">
            Press Esc to resume
          </p>
        </div>
      </div>
    </div>
  `

  const mount = (name) => rootEl.querySelector(`[data-mount="${name}"]`)
  createCrosshair(rootEl)
  createLeaderboard(mount('leaderboard'))
  createHealthPanel(mount('health'), rootEl.querySelector('[data-hud="vignette"]'))
  createWeaponPanel(mount('weapon'))
  createAmmoPanel(mount('ammo'))

  // Visibility: HUD shows in 'playing' and 'paused' (it stays up under the
  // pause veil so the frozen match keeps its readouts). The veil itself is
  // up only while paused.
  const pauseVeil = rootEl.querySelector('[data-hud="pause-veil"]')
  const sync = () => {
    const state = getState()
    rootEl.hidden = state !== GameStates.PLAYING && state !== GameStates.PAUSED
    pauseVeil.hidden = state !== GameStates.PAUSED
  }
  bus.on(Events.GAME_STATE, sync)
  sync()
}

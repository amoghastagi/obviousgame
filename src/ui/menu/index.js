/*
 * Fruit Shockers — MENU surface (stub).
 *
 * Contract with the shell (main.js):
 *   - exports init(rootEl): renders into the given mount and self-manages
 *     visibility by subscribing to `game:state` (this surface is visible in
 *     state 'menu' only). Export signature must stay stable — the real menu
 *     replaces this file's body, not its shape.
 *   - UI → game intent is emitted on the bus, never by importing gameState:
 *     PLAY emits `ui:match:start { characterId, weaponId }`.
 */

import { bus, Events } from '../../core/eventBus.js'
import { getState, GameStates } from '../../core/gameState.js'
import { loadSelection } from '../../data/loadout.js'

export function init(rootEl) {
  rootEl.innerHTML = /* html */ `
    <div class="flex h-full w-full items-center justify-center p-6">
      <div class="glass-panel surface-interactive w-full max-w-xl px-10 py-12 text-center">
        <p class="text-xs font-bold uppercase tracking-[0.3em] text-ink/60">Low-poly grocery arena</p>
        <h1 class="display-title mt-4 text-5xl">Fruit Shockers</h1>
        <p class="mx-auto mt-4 max-w-sm text-sm font-medium text-ink/70">
          Three fruits. One produce aisle. Zero chill. (Menu surface stub — the real
          character &amp; weapon selection lands next.)
        </p>
        <button id="demo-play" class="btn-neon mt-8 text-base" type="button">Play (demo)</button>
        <p class="mt-6 text-xs font-semibold uppercase tracking-widest text-ink/50">
          Esc toggles pause during a match
        </p>
      </div>
    </div>
  `

  rootEl.querySelector('#demo-play').addEventListener('click', () => {
    bus.emit(Events.UI_MATCH_START, loadSelection())
  })

  // Visibility: menu surface shows only in the 'menu' state.
  const sync = () => {
    rootEl.hidden = getState() !== GameStates.MENU
  }
  bus.on(Events.GAME_STATE, sync)
  sync()
}

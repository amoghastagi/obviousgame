/*
 * Fruit Shockers — MODALS surface (stub).
 *
 * Contract with the shell (main.js):
 *   - exports init(rootEl): renders into the given mount and self-manages
 *     visibility by subscribing to `game:state` (visible in 'game_over' and
 *     'victory'). Export signature must stay stable — the real modals replace
 *     this file's body, not its shape.
 *   - reads the match summary by subscribing to `match:end` on the bus
 *     (hudStore intentionally does not hold it — it is match-scoped).
 *   - UI → game intent: Retry emits `ui:match:start { characterId, weaponId }`,
 *     Quit emits `ui:match:quit {}`. Both are handled by main.js glue.
 */

import { bus, Events } from '../../core/eventBus.js'
import { getState, GameStates } from '../../core/gameState.js'
import { loadSelection } from '../../data/loadout.js'

export function init(rootEl) {
  rootEl.innerHTML = /* html */ `
    <div class="flex h-full w-full items-center justify-center p-6">
      <div class="glass-panel surface-interactive w-full max-w-lg px-10 py-10 text-center">
        <p id="stub-modal-title" class="display-title text-4xl">Match over</p>
        <p class="mt-2 text-xs font-bold uppercase tracking-[0.25em] text-ink/50">
          Modals surface stub — summary modal
        </p>
        <dl id="stub-summary" class="mx-auto mt-6 grid max-w-xs grid-cols-2 gap-x-6 gap-y-2 text-sm font-semibold tabular-nums"></dl>
        <div class="mt-8 flex items-center justify-center gap-3">
          <button id="stub-retry" class="btn-neon" type="button">Retry</button>
          <button id="stub-quit" class="btn-neon--secondary btn-neon" type="button">Quit to menu</button>
        </div>
      </div>
    </div>
  `

  const titleEl = rootEl.querySelector('#stub-modal-title')
  const summaryEl = rootEl.querySelector('#stub-summary')

  let lastSummary = null

  const statRow = (label, value) =>
    `<div class="contents"><dt class="text-left text-ink/60">${label}</dt><dd class="text-right">${value}</dd></div>`

  const renderSummary = ({ victory, summary }) => {
    titleEl.textContent = victory ? 'Victory!' : 'Game over'
    summaryEl.innerHTML = [
      statRow('Placement', `#${summary.placement}`),
      statRow('Score', summary.score),
      statRow('Kills', summary.kills),
      statRow('Deaths', summary.deaths),
      statRow('Accuracy', `${summary.accuracy}%`),
      statRow('Survived', `${summary.timeSurvivedSec}s`),
    ].join('')
  }

  bus.on(Events.MATCH_END, (payload) => {
    lastSummary = payload
    renderSummary(payload)
  })

  rootEl.querySelector('#stub-retry').addEventListener('click', () => {
    bus.emit(Events.UI_MATCH_START, loadSelection())
  })
  rootEl.querySelector('#stub-quit').addEventListener('click', () => {
    bus.emit(Events.UI_MATCH_QUIT, {})
  })

  // Visibility: modals show only in 'game_over' and 'victory'. Rendering the
  // last summary again here covers the case where game:state arrives before
  // this surface subscribed (e.g. HMR reload mid-session).
  const sync = () => {
    const s = getState()
    const visible = s === GameStates.GAME_OVER || s === GameStates.VICTORY
    rootEl.hidden = !visible
    if (visible && lastSummary) renderSummary(lastSummary)
  }
  bus.on(Events.GAME_STATE, sync)
  sync()
}

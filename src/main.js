/*
 * Fruit Shockers — app shell / boot.
 *
 * Owns the glue between surfaces and the game:
 *   - boots the three UI surfaces (menu, hud, modals) into their mount roots;
 *   - maps UI intent events onto the game:
 *       ui:match:start → gameState.transition('playing') + bus.emit('match:start', { mode: 'sandbox' })
 *       ui:match:quit  → gameState.transition('menu')
 *   - Escape toggles playing ↔ paused;
 *   - mounts the demo match driver (src/demo/mockGame.js) until the real engine lands.
 *
 * Surfaces never import gameState's transition(); they emit intent on the bus
 * and manage their own visibility off `game:state`.
 */

import './styles/main.css'
import { bus, Events } from './core/eventBus.js'
import { getState, transition, GameStates } from './core/gameState.js'
import { init as initMenu } from './ui/menu/index.js'
import { init as initHud } from './ui/hud/index.js'
import { init as initModals } from './ui/modals/index.js'
import { initMockGame } from './demo/mockGame.js'
import { mountDemo } from './demos/registry.js'

// --- Boot the three surfaces ------------------------------------------------
initMenu(document.getElementById('menu-root'))
initHud(document.getElementById('hud-root'))
initModals(document.getElementById('modal-root'))

// --- Demo match driver (stands in for the real game engine) -----------------
initMockGame()

// --- UI intent → game glue --------------------------------------------------
bus.on(Events.UI_MATCH_START, () => {
  // Transition first so surfaces are visible before match events start flowing.
  transition(GameStates.PLAYING)
  bus.emit(Events.MATCH_START, { mode: 'sandbox' })
})

bus.on(Events.UI_MATCH_QUIT, () => {
  transition(GameStates.MENU)
})

// --- Escape toggles playing ↔ paused ----------------------------------------
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return
  if (getState() === GameStates.PLAYING) transition(GameStates.PAUSED)
  else if (getState() === GameStates.PAUSED) transition(GameStates.PLAYING)
})

// --- Graphics demo registry compatibility -----------------------------------
// The graphics team's demo registry (?demo=<key>) mounts into the canvas layer
// instead of the old #app div; without the param the plain pastel placeholder shows.
const demoKey = new URLSearchParams(window.location.search).get('demo')
if (demoKey) {
  mountDemo(demoKey, document.getElementById('game-canvas'))
}

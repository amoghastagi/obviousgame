/*
 * Fruit Shockers — app shell / boot.
 *
 * Owns the glue between surfaces and the game:
 *   - boots the GameHost (src/game/main-game.js) into #game-canvas — the real
 *     grocery arena idles behind the menu from the first frame;
 *   - boots the three UI surfaces (menu, hud, modals) into their mount roots;
 *   - maps UI intent events onto the game:
 *       ui:match:start → gameState.transition('playing') + bus.emit('match:start', { mode: 'sandbox' })
 *       ui:match:quit  → gameState.transition('menu')
 *   - Escape toggles playing ↔ paused;
 *   - keeps the ?demo= dev gallery reachable: with a demo key in the URL the
 *     registry mounts into the canvas layer in place of the GameHost.
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
import { initGame } from './game/main-game.js'
import { mountDemo } from './demos/registry.js'

// --- Boot the three surfaces ------------------------------------------------
initMenu(document.getElementById('menu-root'))
initHud(document.getElementById('hud-root'))
initModals(document.getElementById('modal-root'))

// --- Boot path: the GameHost, or the ?demo= dev gallery ----------------------
// Default boot is one cohesive app — the real arena renders behind the menu in
// attract mode. A ?demo=<key> param hands the canvas layer to the dev gallery
// instead; the two never mount together (one renderer per canvas).
const demoKey = new URLSearchParams(window.location.search).get('demo')
if (demoKey) {
  mountDemo(demoKey, document.getElementById('game-canvas'))
} else {
  initGame(document.getElementById('game-canvas'))
}

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

/*
 * Fruit Shockers — game state machine (UI-side contract).
 *
 * Finite state machine for match lifecycle. Every change is broadcast on the
 * bus as `game:state { from, to }` so surfaces can own their own visibility.
 *
 * Allowed transitions:
 *   menu      → playing
 *   playing   → paused | game_over | victory
 *   paused    → playing
 *   game_over → menu | playing
 *   victory   → menu | playing
 *
 * Note there is deliberately NO direct edge from playing/paused to menu:
 * an in-flight match ends via `match:end` first (→ game_over/victory), and
 * quit is issued from the summary modal. transition() throws on any other
 * move — that failure is the contract working, not a bug to catch.
 */

import { bus, Events } from './eventBus.js'

export const GameStates = Object.freeze({
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAME_OVER: 'game_over',
  VICTORY: 'victory',
})

const ALLOWED = Object.freeze({
  [GameStates.MENU]: [GameStates.PLAYING],
  [GameStates.PLAYING]: [GameStates.PAUSED, GameStates.GAME_OVER, GameStates.VICTORY],
  [GameStates.PAUSED]: [GameStates.PLAYING],
  [GameStates.GAME_OVER]: [GameStates.MENU, GameStates.PLAYING],
  [GameStates.VICTORY]: [GameStates.MENU, GameStates.PLAYING],
})

let state = GameStates.MENU

/** Current state: 'menu' | 'playing' | 'paused' | 'game_over' | 'victory'. */
export function getState() {
  return state
}

/**
 * Move the machine to `to`. Throws on an illegal transition so contract
 * violations surface immediately instead of smearing across surfaces.
 * Emits `game:state { from, to }` on success.
 */
export function transition(to) {
  const allowed = ALLOWED[state] ?? []
  if (!allowed.includes(to)) {
    throw new Error(`[gameState] illegal transition: ${state} → ${to}`)
  }
  const from = state
  state = to
  bus.emit(Events.GAME_STATE, { from, to })
  return state
}

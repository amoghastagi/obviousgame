/*
 * Fruit Shockers — shared event contract (game ⇄ UI).
 *
 * `bus` is the single pub/sub channel every module talks over; `Events` is the
 * closed vocabulary. Event names and payload shapes are a CONTRACT the gameplay
 * engine will implement exactly — do not rename or reshape.
 *
 * Contract (payload shapes):
 *   Game → UI:
 *     match:start        { mode: 'sandbox' }
 *     match:end          { victory: boolean, summary: { kills, deaths, score,
 *                          placement, accuracy, timeSurvivedSec } }
 *     health:update      { current, max }
 *     ammo:update        { mag, reserve, reloading }
 *     weapon:change      { id, name }
 *     leaderboard:update { entries: [{ id, name, character, kills, deaths,
 *                          score, isLocal }] }         (pre-sorted score-desc)
 *     crosshair:update   { spreadPx }                  (4–40)
 *     hit:confirm        { killed }
 *   UI → game:
 *     ui:match:start     { characterId, weaponId }
 *     ui:match:quit      {}
 *   Internal (state machine):
 *     game:state         { from, to }
 *
 * Handlers must not throw; an exception inside a handler will break the
 * remaining handlers for that emit.
 */

export const Events = Object.freeze({
  // Game → UI
  MATCH_START: 'match:start',
  MATCH_END: 'match:end',
  HEALTH_UPDATE: 'health:update',
  AMMO_UPDATE: 'ammo:update',
  WEAPON_CHANGE: 'weapon:change',
  LEADERBOARD_UPDATE: 'leaderboard:update',
  CROSSHAIR_UPDATE: 'crosshair:update',
  HIT_CONFIRM: 'hit:confirm',

  // UI → game
  UI_MATCH_START: 'ui:match:start',
  UI_MATCH_QUIT: 'ui:match:quit',

  // State machine
  GAME_STATE: 'game:state',
})

function createBus() {
  const handlers = new Map() // event name -> Set<fn>

  return {
    /** Subscribe. Returns an unsubscribe function. */
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event).add(fn)
      return () => this.off(event, fn)
    },

    off(event, fn) {
      handlers.get(event)?.delete(fn)
    },

    emit(event, payload) {
      const set = handlers.get(event)
      if (!set) return
      for (const fn of [...set]) fn(payload)
    },
  }
}

/** Singleton pub/sub bus for the whole app. */
export const bus = createBus()

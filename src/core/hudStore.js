/*
 * Fruit Shockers — reactive HUD snapshot store.
 *
 * Holds the latest health / ammo / weapon / leaderboard values so surfaces can
 * read one consistent snapshot instead of tracking N bus events. The store
 * keeps itself current by subscribing to the bus at module load; it resets to
 * defaults on every `match:start` so a new match never shows stale values.
 *
 *   import { subscribe, getSnapshot } from './core/hudStore.js'
 *   const off = subscribe((snap) => render(snap))  // fires immediately, then per change
 *
 * Crosshair spread and hit confirms are intentionally NOT stored — they are
 * high-frequency/ephemeral signals; subscribe to the bus for those.
 */

import { bus, Events } from './eventBus.js'

const initialSnapshot = () => ({
  health: { current: 100, max: 100 },
  ammo: { mag: 0, reserve: 0, reloading: false },
  weapon: null, // { id, name } — null until the first weapon:change
  leaderboard: { entries: [] }, // pre-sorted score-desc by the game
})

let snapshot = Object.freeze(initialSnapshot())
const listeners = new Set()

function update(patch) {
  snapshot = Object.freeze({ ...snapshot, ...patch })
  for (const fn of [...listeners]) fn(snapshot)
}

bus.on(Events.HEALTH_UPDATE, ({ current, max }) => update({ health: { current, max } }))
bus.on(Events.AMMO_UPDATE, ({ mag, reserve, reloading }) =>
  update({ ammo: { mag, reserve, reloading } }),
)
bus.on(Events.WEAPON_CHANGE, (weapon) => update({ weapon: { ...weapon } }))
bus.on(Events.LEADERBOARD_UPDATE, ({ entries }) => update({ leaderboard: { entries } }))
bus.on(Events.MATCH_START, () => update(initialSnapshot()))

/**
 * Subscribe to snapshot changes. The listener is called immediately with the
 * current snapshot, then on every change. Returns an unsubscribe function.
 */
export function subscribe(fn) {
  listeners.add(fn)
  fn(snapshot)
  return () => listeners.delete(fn)
}

/** Latest immutable snapshot: { health, ammo, weapon, leaderboard }. */
export function getSnapshot() {
  return snapshot
}

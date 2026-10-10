/*
 * Fruit Shockers — pure-ish ammo model + crosshair spread.
 *
 * Fed by WEAPONS[i] from data/loadout.js — { stats: {...}, ammo: {mag, reserve} }.
 * The reload timer is dt-driven (no setTimeout), so pausing freezes it for
 * free: the host simply stops calling tick() when the FSM leaves 'playing'.
 *
 * Contract (src/core/eventBus.js): every state change emits
 * ammo:update {mag, reserve, reloading}; crosshair:update {spreadPx} is
 * clamped to the 4–40 px contract range.
 */

export const RELOAD_SECONDS = 1.8 // mock parity: ~1.8 s reload
// Frame-sized dt subtractions accumulate floating-point dust that can strand
// reloadLeft at ~1e-17 — a residue the exact `> 0` check would never clear,
// leaving the reload (and the reloading flag) stuck forever. One microsecond
// of early completion is invisible; a soft-locked reload is not.
const RELOAD_EPSILON_S = 1e-6
const MOVING_BONUS_PX = 8
const SPREAD_FLOOR_PX = 4
const SPREAD_CEILING_PX = 40

/**
 * The host calls tryFire() after its own cooldown gate passes. Returns false
 * (and changes nothing) while reloading or on an empty mag; otherwise burns
 * one round, emits, and auto-reloads when the last round left the mag.
 */
export function createAmmoModel(weapon, emitAmmo) {
  let mag = weapon.ammo.mag
  let reserve = weapon.ammo.reserve
  let reloading = false
  let reloadLeft = 0 // seconds remaining; dt-driven, no setTimeout

  return {
    tryFire() {
      if (reloading || mag <= 0) return false
      mag -= 1
      emitAmmo({ mag, reserve, reloading })
      if (mag === 0) this.reload()
      return true
    },

    reload() {
      if (reloading || reserve <= 0 || mag === weapon.ammo.mag) return
      reloading = true
      reloadLeft = RELOAD_SECONDS
      emitAmmo({ mag, reserve, reloading })
    },

    tick(dt) {
      if (!reloading) return
      reloadLeft -= dt
      if (reloadLeft > RELOAD_EPSILON_S) return
      const take = Math.min(weapon.ammo.mag - mag, reserve)
      mag += take
      reserve -= take
      reloading = false
      emitAmmo({ mag, reserve, reloading })
    },
  }
}

/** Contract range is 4–40 px (eventBus.js header). Base + movement + firing bloom. */
export function spreadPx({ base = 6, moving = false, bloom = 0 } = {}) {
  const px = base + (moving ? MOVING_BONUS_PX : 0) + bloom
  return Math.min(SPREAD_CEILING_PX, Math.max(SPREAD_FLOOR_PX, Math.round(px * 10) / 10))
}

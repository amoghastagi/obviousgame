// Health system — the catalog-driven player health model.
//
// Owns env.state.player.health/alive end to end for the cohesive app:
//   - max health derives from the selected character's stats
//     (70 + 10 x armor — watermelon_tank 120, banana_commando 100,
//     strawberry_scout 80);
//   - damage clamps at 0, counts the death, and respawns the body at the
//     spawn point after 1.5 s (the engine's original player timing);
//   - health regenerates 4 HP/s once 2 s pass without damage (the mock's
//     rate, expressed per second);
//   - every damage tick, regen change, and respawn emits the contract's
//     health:update { current, max } — the HUD never polls.
//
// The system supersedes the bots module's interim damagePlayer hook: the
// GameHost installs health.damage over it AFTER createBotManager. All timers
// are dt-driven — no setTimeout, so pause freezes everything.

import { bus, Events } from '../core/eventBus.js'

// Spec defaults (tunable within the spec's clamps, not ignorable).
const REGEN_DELAY_S = 2
const REGEN_HP_PER_S = 4
const RESPAWN_DELAY_S = 1.5

/** Catalog mapping: max health = 70 + 10 × stats.armor. */
export function maxHealthFor(stats) {
  return 70 + 10 * stats.armor
}

/**
 * createHealthSystem(env, { maxHealth, physics }) → { damage, update, reset }.
 * `physics` is the player controller — respawn() returns the avatar to the
 * spawn point and re-arms the body (physics.js also gates on player.alive,
 * so a dead body stays put until respawn).
 */
export function createHealthSystem(env, { maxHealth, physics }) {
  const player = env.state.player
  let max = maxHealth
  let respawnLeft = 0 // seconds remaining; > 0 while dead
  let sinceDamage = Infinity // seconds since the last hit
  let lastRounded = null

  function emit() {
    bus.emit(Events.HEALTH_UPDATE, { current: player.health, max })
    lastRounded = Math.round(player.health)
  }

  /** Catalog max swap at match start — full heal, emits the opening beat. */
  function reset(nextMax = max) {
    max = nextMax
    player.health = max
    player.alive = true
    respawnLeft = 0
    sinceDamage = Infinity
    emit()
  }

  /**
   * Apply incoming damage (bots' fire). Counts the death and starts the
   * respawn countdown at 0 hp. Dead players take no further damage.
   */
  function damage(amount) {
    if (!player.alive) return
    player.health = Math.max(0, player.health - amount)
    sinceDamage = 0
    if (player.health <= 0) {
      player.alive = false
      env.state.score.deaths += 1
      respawnLeft = RESPAWN_DELAY_S
    }
    emit()
  }

  function update(dt) {
    if (!player.alive) {
      respawnLeft -= dt
      // 1e-9 guard: float dust at the boundary must not hold the timer.
      if (respawnLeft > 1e-9) return
      // Respawn: body back to the spawn point (physics.re-arms alive), full
      // health, damage clock cleared. physics.respawn() also zeroes velocity.
      physics.respawn()
      player.health = max
      player.alive = true
      sinceDamage = Infinity
      emit()
      return
    }

    sinceDamage += dt

    // Regen: 4 HP/s after 2 s without damage, capped at max. Emit only when
    // the HUD-visible (rounded) value changes — ~1 emission per point gained.
    if (sinceDamage < REGEN_DELAY_S || player.health >= max) return
    player.health = Math.min(max, player.health + REGEN_HP_PER_S * dt)
    if (Math.round(player.health) !== lastRounded) emit()
  }

  return { damage, update, reset }
}

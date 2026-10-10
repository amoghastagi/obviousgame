import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import { createHealthSystem, maxHealthFor } from './health.js'
import { CHARACTERS } from '../data/loadout.js'
import { bus, Events } from '../core/eventBus.js'

const emissions = []
bus.on(Events.HEALTH_UPDATE, (payload) => emissions.push(payload))
beforeEach(() => {
  emissions.length = 0
})

const byId = (id) => CHARACTERS.find((c) => c.id === id)

function makeEnv() {
  return {
    state: {
      player: { pos: new THREE.Vector3(0, 0, 8), vel: new THREE.Vector3(), health: 100, alive: true },
      score: { kills: 0, deaths: 0 },
    },
  }
}

function makeSystem(env, maxHealth = 100) {
  const physics = { respawn: vi.fn() }
  const health = createHealthSystem(env, { maxHealth, physics })
  return { health, physics }
}

describe('maxHealthFor — the catalog mapping', () => {
  it('watermelon_tank (armor 5) → 120', () => {
    expect(maxHealthFor(byId('watermelon_tank').stats)).toBe(120)
  })
  it('banana_commando (armor 2) → 90', () => {
    expect(maxHealthFor(byId('banana_commando').stats)).toBe(90)
  })
  it('strawberry_scout (armor 1) → 80', () => {
    expect(maxHealthFor(byId('strawberry_scout').stats)).toBe(80)
  })
})

describe('damage', () => {
  it('emits health:update with the reduced health and the catalog max', () => {
    const env = makeEnv()
    const { health } = makeSystem(env, 120)
    health.reset(120)
    emissions.length = 0

    health.damage(10)

    expect(emissions).toEqual([{ current: 110, max: 120 }])
    expect(env.state.player.health).toBe(110)
  })

  it('clamps at 0, counts the death, and starts the 1.5 s respawn clock', () => {
    const env = makeEnv()
    const { health } = makeSystem(env, 100)
    health.reset(100)

    health.damage(45)
    health.damage(60) // past zero

    expect(env.state.player.health).toBe(0)
    expect(env.state.player.alive).toBe(false)
    expect(env.state.score.deaths).toBe(1)
    expect(emissions.at(-1)).toEqual({ current: 0, max: 100 })
  })

  it('a dead player takes no further damage and no second death counts', () => {
    const env = makeEnv()
    const { health } = makeSystem(env, 100)
    health.reset(100)

    health.damage(100)
    health.damage(30)

    expect(env.state.score.deaths).toBe(1)
    expect(emissions).toHaveLength(2) // the kill, not the second hit
  })
})

describe('respawn', () => {
  it('respawns after 1.5 s: physics.respawn, full health, alive, health:update', () => {
    const env = makeEnv()
    const { health, physics } = makeSystem(env, 100)
    health.reset(100)
    health.damage(100)

    health.update(1.4)
    expect(physics.respawn).not.toHaveBeenCalled() // still counting

    health.update(0.1)
    expect(physics.respawn).toHaveBeenCalledTimes(1)
    expect(env.state.player.alive).toBe(true)
    expect(env.state.player.health).toBe(100)
    expect(emissions.at(-1)).toEqual({ current: 100, max: 100 })
  })

  it('a respawned player takes damage again', () => {
    const env = makeEnv()
    const { health } = makeSystem(env, 100)
    health.reset(100)
    health.damage(100)
    health.update(1.5)
    emissions.length = 0

    health.damage(25)

    expect(env.state.player.health).toBe(75)
    expect(emissions).toEqual([{ current: 75, max: 100 }])
  })
})

describe('regen', () => {
  it('holds while within 2 s of the last hit, then restores 4 HP/s', () => {
    const env = makeEnv()
    const { health } = makeSystem(env, 100)
    health.reset(100)
    health.damage(40) // 60 hp, damage clock zeroed

    health.update(1.9)
    expect(env.state.player.health).toBeCloseTo(60, 6) // inside the delay — nothing yet

    health.update(0.1) // the 2 s delay elapses this frame — the first regen tick rides it
    health.update(1) // +4
    expect(env.state.player.health).toBeCloseTo(64.4, 6) // 60 + 4×0.1 + 4
  })

  it('emits as the rounded value changes, not on every frame', () => {
    const env = makeEnv()
    const { health } = makeSystem(env, 100)
    health.reset(100)
    health.damage(2) // 98 hp — regen will tick it back to 100

    for (let i = 0; i < 300; i += 1) health.update(0.016) // 4.8 s of frames

    // Emits only when the HUD-visible (rounded) value changes: 98 → 99 → 100.
    const currents = emissions.map((e) => Math.round(e.current))
    expect(currents).toEqual([100, 98, 99, 100])
    expect(env.state.player.health).toBe(100)
  })

  it('stops at max — no emission loop while healthy', () => {
    const env = makeEnv()
    const { health } = makeSystem(env, 100)
    health.reset(100)

    for (let i = 0; i < 60; i += 1) health.update(0.016)

    expect(emissions).toEqual([{ current: 100, max: 100 }]) // reset's emission only
    expect(env.state.player.health).toBe(100)
  })
})

describe('reset', () => {
  it('adopts a new catalog max and emits the opening beat', () => {
    const env = makeEnv()
    const { health } = makeSystem(env, 100)

    health.reset(120)

    expect(env.state.player.health).toBe(120)
    expect(emissions).toEqual([{ current: 120, max: 120 }])
  })

  it('clears a pending death — no phantom respawn after a mid-air reset', () => {
    const env = makeEnv()
    const { health, physics } = makeSystem(env, 100)
    health.reset(100)
    health.damage(100)

    health.reset(100) // match restarts while the respawn clock runs

    for (let i = 0; i < 30; i += 1) health.update(0.1)
    expect(physics.respawn).not.toHaveBeenCalled() // already fresh
    expect(env.state.player.alive).toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import { createAmmoModel, spreadPx, RELOAD_SECONDS } from './ammo.js'
import { WEAPONS } from '../data/loadout.js'

/** Weapon shape identical to the loadout catalog entries ({ stats, ammo }). */
function makeWeapon(overrides = {}) {
  return { id: 'test_rifle', name: 'Test Rifle', ammo: { mag: 6, reserve: 24 }, ...overrides }
}

/** Collects every ammo:update payload the model emits, in order. */
function recorder() {
  const emissions = []
  const emit = (payload) => emissions.push({ ...payload })
  return { emissions, emit }
}

describe('createAmmoModel — tryFire', () => {
  it('decrements the mag and emits the new state', () => {
    const { emissions, emit } = recorder()
    const model = createAmmoModel(makeWeapon(), emit)

    expect(model.tryFire()).toBe(true)
    expect(emissions).toEqual([{ mag: 5, reserve: 24, reloading: false }])
  })

  it('refuses to fire while reloading — no decrement, no emit', () => {
    const { emissions, emit } = recorder()
    const model = createAmmoModel(makeWeapon({ ammo: { mag: 1, reserve: 24 } }), emit)

    expect(model.tryFire()).toBe(true) // last round → auto-reload starts
    const afterReloadStart = emissions.length
    expect(model.tryFire()).toBe(false)
    expect(emissions.length).toBe(afterReloadStart)
    expect(emissions.at(-1)).toEqual({ mag: 0, reserve: 24, reloading: true })
  })

  it('refuses to fire on an empty mag with no reserve', () => {
    const { emissions, emit } = recorder()
    const model = createAmmoModel(makeWeapon({ ammo: { mag: 2, reserve: 0 } }), emit)

    expect(model.tryFire()).toBe(true)
    expect(model.tryFire()).toBe(true)
    expect(model.tryFire()).toBe(false)
    expect(emissions.at(-1)).toEqual({ mag: 0, reserve: 0, reloading: false })
  })

  it('works unchanged against a real loadout catalog weapon', () => {
    const { emissions, emit } = recorder()
    const peelLauncher = WEAPONS.find((w) => w.id === 'peel_launcher') // mag 6, reserve 24
    const model = createAmmoModel(peelLauncher, emit)

    model.tryFire()
    expect(emissions[0]).toEqual({ mag: 5, reserve: 24, reloading: false })
  })
})

describe('createAmmoModel — reload', () => {
  it('auto-reloads when the last round leaves the mag', () => {
    const { emissions, emit } = recorder()
    const model = createAmmoModel(makeWeapon(), emit)

    for (let i = 0; i < 5; i += 1) model.tryFire()
    expect(emissions.at(-1)).toEqual({ mag: 1, reserve: 24, reloading: false })

    model.tryFire() // mag hits 0
    expect(emissions.at(-2)).toEqual({ mag: 0, reserve: 24, reloading: false })
    expect(emissions.at(-1)).toEqual({ mag: 0, reserve: 24, reloading: true })
  })

  it('is a no-op when the mag is already full', () => {
    const { emissions, emit } = recorder()
    const model = createAmmoModel(makeWeapon(), emit)

    model.reload()
    expect(emissions).toEqual([])
  })

  it('is a no-op when the reserve is empty', () => {
    const { emissions, emit } = recorder()
    const model = createAmmoModel(makeWeapon({ ammo: { mag: 2, reserve: 0 } }), emit)

    model.reload()
    expect(emissions).toEqual([])
  })

  it('is a no-op while a reload is already running', () => {
    const { emissions, emit } = recorder()
    const model = createAmmoModel(makeWeapon({ ammo: { mag: 1, reserve: 24 } }), emit)

    model.tryFire() // empty → auto-reload
    model.reload() // ignored — already reloading
    expect(emissions.filter((e) => e.reloading)).toHaveLength(1)
  })

  it('completes from reserve after RELOAD_SECONDS of accumulated dt', () => {
    const { emissions, emit } = recorder()
    const model = createAmmoModel(makeWeapon(), emit)

    for (let i = 0; i < 6; i += 1) model.tryFire() // empty → auto-reload
    model.tick(RELOAD_SECONDS)

    expect(emissions.at(-1)).toEqual({ mag: 6, reserve: 18, reloading: false })
  })

  it('tops up partially — pulls only the mag room from reserve', () => {
    const { emissions, emit } = recorder()
    const model = createAmmoModel(makeWeapon(), emit)

    model.tryFire()
    model.tryFire()
    model.tryFire() // mag 3 of 6
    model.reload()
    model.tick(RELOAD_SECONDS)

    expect(emissions.at(-1)).toEqual({ mag: 6, reserve: 21, reloading: false })
  })

  it('exhausts the reserve when it cannot fill the mag', () => {
    const { emissions, emit } = recorder()
    const model = createAmmoModel(makeWeapon({ ammo: { mag: 4, reserve: 2 } }), emit)

    for (let i = 0; i < 4; i += 1) model.tryFire() // empty → auto-reload
    model.tick(RELOAD_SECONDS)

    expect(emissions.at(-1)).toEqual({ mag: 2, reserve: 0, reloading: false })

    model.tryFire()
    model.tryFire()
    expect(model.tryFire()).toBe(false)
    expect(emissions.at(-1)).toEqual({ mag: 0, reserve: 0, reloading: false })
  })

  it('is dt-driven — partial ticks hold the reload, only accumulated time completes it', () => {
    const { emissions, emit } = recorder()
    const model = createAmmoModel(makeWeapon(), emit)

    model.tryFire()
    model.tryFire()
    model.reload()
    model.tick(RELOAD_SECONDS * 0.5)
    model.tick(RELOAD_SECONDS * 0.49)
    expect(emissions.filter((e) => !e.reloading && e.mag === 6)).toHaveLength(0)

    model.tick(RELOAD_SECONDS * 0.01)
    expect(emissions.at(-1)).toEqual({ mag: 6, reserve: 22, reloading: false })
  })

  it('completes across real frame-rate dt (many 1/60 s frames) despite floating-point drift', () => {
    const { emissions, emit } = recorder()
    const model = createAmmoModel(makeWeapon(), emit)

    model.tryFire()
    model.tryFire()
    model.reload()
    for (let f = 0; f < 200; f += 1) model.tick(1 / 60) // ≈3.3 s of frames, well past 1.8 s
    expect(emissions.at(-1)).toEqual({ mag: 6, reserve: 22, reloading: false })
  })

  it('emits nothing on tick while not reloading', () => {
    const { emissions, emit } = recorder()
    const model = createAmmoModel(makeWeapon(), emit)

    model.tick(0.5)
    expect(emissions).toEqual([])
  })
})

describe('spreadPx', () => {
  it('defaults to a 6 px stationary base', () => {
    expect(spreadPx()).toBe(6)
    expect(spreadPx({})).toBe(6)
  })

  it('adds the movement bonus and firing bloom', () => {
    expect(spreadPx({ moving: true })).toBe(14)
    expect(spreadPx({ bloom: 5.5 })).toBe(11.5)
    expect(spreadPx({ moving: true, bloom: 2 })).toBe(16)
  })

  it('clamps to the 4–40 px contract range', () => {
    expect(spreadPx({ base: 1 })).toBe(4)
    expect(spreadPx({ base: -10, bloom: -50 })).toBe(4)
    expect(spreadPx({ base: 45 })).toBe(40)
    expect(spreadPx({ base: 6, moving: true, bloom: 40 })).toBe(40)
  })

  it('rounds to one decimal', () => {
    expect(spreadPx({ base: 6.26 })).toBe(6.3)
    expect(spreadPx({ base: 6.24 })).toBe(6.2)
  })

  it('stays inside the contract for any input combination', () => {
    for (const base of [-20, 0, 3.99, 4, 20, 39.9, 40, 100]) {
      for (const bloom of [-30, 0, 7, 80]) {
        for (const moving of [false, true]) {
          const px = spreadPx({ base, bloom, moving })
          expect(px).toBeGreaterThanOrEqual(4)
          expect(px).toBeLessThanOrEqual(40)
        }
      }
    }
  })
})

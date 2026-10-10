import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { createWeaponSystem, weaponParams } from './weapons.js'
import { WEAPONS } from '../data/loadout.js'
import { bus, Events } from '../core/eventBus.js'
import { getState, transition, GameStates } from '../core/gameState.js'

// weapons.js touches document (pointer lock) and window-level input listeners
// at factory time; stub the minimum for the node test environment. Fresh
// listener maps per test keep handler lookups unambiguous.
let windowListeners
let canvasListeners
beforeEach(() => {
  windowListeners = new Map()
  canvasListeners = new Map()
  vi.stubGlobal('window', {
    addEventListener: (type, fn) => windowListeners.set(type, fn),
    removeEventListener: (type) => windowListeners.delete(type),
  })
  vi.stubGlobal('document', {
    pointerLockElement: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  // Tests that press PLAY leave the FSM mid-match; walk it back to menu so
  // every test starts from a clean machine.
  const state = getState()
  if (state === GameStates.PLAYING || state === GameStates.PAUSED) {
    transition(GameStates.GAME_OVER)
    transition(GameStates.MENU)
  } else if (state === GameStates.GAME_OVER || state === GameStates.VICTORY) {
    transition(GameStates.MENU)
  }
})

/** Collects every contract emission the systems make, in order. */
const emissions = []
for (const name of [Events.WEAPON_CHANGE, Events.AMMO_UPDATE, Events.CROSSHAIR_UPDATE, Events.HIT_CONFIRM]) {
  bus.on(name, (payload) => emissions.push({ name, payload }))
}
beforeEach(() => {
  emissions.length = 0
})

const byId = (id) => WEAPONS.find((w) => w.id === id)

/** Weapon shape identical to the loadout catalog entries ({ stats, ammo }). */
function makeWeapon(overrides = {}) {
  return {
    id: 'test_rifle',
    name: 'Test Rifle',
    stats: { damage: 3, fireRate: 2, range: 4 },
    ammo: { mag: 6, reserve: 24 },
    ...overrides,
  }
}

/** A minimal env: real three math, fake scene/DOM. The bot mimics bots.js's rules. */
function makeEnv() {
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 300)
  camera.position.set(0, 1.6, 0)
  camera.lookAt(0, 1.6, -10) // straight down -Z at the bot

  const sceneMeshes = []
  const scene = {
    meshes: sceneMeshes,
    add: (mesh) => sceneMeshes.push(mesh),
    remove: (mesh) => {
      const i = sceneMeshes.indexOf(mesh)
      if (i !== -1) sceneMeshes.splice(i, 1)
    },
  }

  const botBody = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
  botBody.position.set(0, 1.6, -10)
  botBody.updateMatrixWorld(true) // raycasts read matrixWorld — the game's render loop does this every frame
  botBody.userData = { fruit: true, isBot: true, entityId: 'bot-1' }
  const botRecord = { id: 'bot-1', body: botBody, health: 100, alive: true }

  const env = {
    THREE,
    scene,
    camera,
    renderer: {
      domElement: {
        addEventListener: (type, fn) => canvasListeners.set(type, fn),
        removeEventListener: (type) => canvasListeners.delete(type),
      },
    },
    world: { colliders: [], targets: [botBody], obstacleMeshes: [] },
    state: {
      player: { pos: new THREE.Vector3(0, 0, 0), vel: new THREE.Vector3(), health: 100, alive: true },
      score: { kills: 0, deaths: 0 },
      bots: [botRecord],
    },
    hooks: { hitBot: null, damagePlayer: null },
    spawnPoint: new THREE.Vector3(0, 0, 8),
  }
  // Mimics bots.js's hook: damage the record; dead at ≤ 0 hp.
  env.hooks.hitBot = (mesh, dmg) => {
    const bot = env.state.bots.find((b) => b.body === mesh)
    if (!bot || !bot.alive) return
    bot.health -= Number.isFinite(dmg) ? dmg : 0
    if (bot.health <= 0) bot.alive = false
  }
  return { env, botBody, botRecord }
}

function makeSystem(env, overrides = {}) {
  const rig = { mode: 'fps' }
  const avatar = new THREE.Group()
  avatar.userData = { character: 'banana', hitboxRadius: 0.5, eyeHeight: 1.1 }
  const system = createWeaponSystem(env, { weapon: makeWeapon(), avatar, rig, ...overrides })
  return { system, rig, avatar }
}

/** Press-and-hold helper: pointer locked, left button down. */
function holdTrigger(env) {
  document.pointerLockElement = env.renderer.domElement
  canvasListeners.get('mousedown')({ button: 0 })
}

const ofName = (name) => emissions.filter((e) => e.name === name)

describe('weaponParams — the spec’s catalog mappings', () => {
  it('peel_launcher: damage 5×3 = 15, cooldown 0.6/2 = 0.3 s, range 30×4 = 120 m', () => {
    expect(weaponParams(byId('peel_launcher'))).toEqual({ damage: 15, cooldown: 0.3, range: 120 })
  })

  it('seed_shotgun: damage 20, cooldown 0.6/3 s, range 60 m', () => {
    const params = weaponParams(byId('seed_shotgun'))
    expect(params.damage).toBe(20)
    expect(params.cooldown).toBeCloseTo(0.2, 12) // 0.6/3 carries float dust
    expect(params.range).toBe(60)
  })

  it('vine_sniper: damage 25, cooldown 0.6 s, range 150 m', () => {
    expect(weaponParams(byId('vine_sniper'))).toEqual({ damage: 25, cooldown: 0.6, range: 150 })
  })
})

describe('cooldown gating', () => {
  it('refuses a second shot inside the cooldown, then fires once it elapses', () => {
    const { env } = makeEnv()
    const { system } = makeSystem(env) // test rifle: fireRate 2 → 0.3 s cooldown

    expect(system.fire()).toBe(true)
    expect(system.fire()).toBe(false) // gated
    system.update(0.3)
    expect(system.fire()).toBe(true)
  })

  it('paces per the catalog — the shotgun recovers in 0.2 s, the sniper needs 0.6 s', () => {
    const shotgun = makeSystem(makeEnv().env, { weapon: byId('seed_shotgun') })
    shotgun.system.fire()
    shotgun.system.update(0.2)
    expect(shotgun.system.fire()).toBe(true)

    const sniper = makeSystem(makeEnv().env, { weapon: byId('vine_sniper') })
    sniper.system.fire()
    sniper.system.update(0.2)
    expect(sniper.system.fire()).toBe(false) // still cooling
    sniper.system.update(0.4)
    expect(sniper.system.fire()).toBe(true)
  })
})

describe('ammo model consumption through the weapon', () => {
  it('equip emits the opening weapon:change + full catalog ammo', () => {
    const { env } = makeEnv()
    const { system } = makeSystem(env, { weapon: byId('peel_launcher') })

    system.equip(byId('peel_launcher'))

    expect(emissions.map((e) => e.name)).toEqual([Events.WEAPON_CHANGE, Events.AMMO_UPDATE])
    expect(emissions[0].payload).toEqual({ id: 'peel_launcher', name: 'Peel Launcher' })
    expect(emissions[1].payload).toEqual({ mag: 6, reserve: 24, reloading: false })
  })

  it('six shots drain the mag into the auto-reload — 5…0, then reloading', () => {
    const { env } = makeEnv()
    const { system } = makeSystem(env, { weapon: byId('peel_launcher') })

    for (let i = 0; i < 6; i += 1) {
      expect(system.fire()).toBe(true)
      system.update(0.3) // clear the cooldown between shots
    }

    const payloads = ofName(Events.AMMO_UPDATE).map((e) => e.payload)
    expect(payloads.map((p) => p.mag)).toEqual([5, 4, 3, 2, 1, 0, 0])
    expect(payloads.at(-1)).toEqual({ mag: 0, reserve: 24, reloading: true })
  })

  it('a trigger pull during a reload is refused — the mag does not move', () => {
    const { env } = makeEnv()
    const { system } = makeSystem(env, { weapon: byId('peel_launcher') })

    for (let i = 0; i < 6; i += 1) {
      system.fire()
      system.update(0.3)
    }
    emissions.length = 0

    expect(system.fire()).toBe(false)
    expect(ofName(Events.AMMO_UPDATE)).toEqual([]) // no state change to emit
    expect(system.shotStats().shots).toBe(6)
  })

  it('completing the reload refills from the reserve and firing resumes', () => {
    const { env } = makeEnv()
    const { system } = makeSystem(env, { weapon: byId('peel_launcher') })

    for (let i = 0; i < 6; i += 1) {
      system.fire()
      system.update(0.3)
    }
    system.update(1.8) // reload elapses (dt-driven — no setTimeout)

    const payloads = ofName(Events.AMMO_UPDATE).map((e) => e.payload)
    expect(payloads.at(-1)).toEqual({ mag: 6, reserve: 18, reloading: false })
    expect(system.fire()).toBe(true)
    expect(ofName(Events.AMMO_UPDATE).at(-1).payload).toEqual({ mag: 5, reserve: 18, reloading: false })
  })

  it('R reloads early: the keydown handler starts a reload on a partially empty mag', () => {
    const { env } = makeEnv()
    const { system } = makeSystem(env, { weapon: byId('peel_launcher') })

    transition(GameStates.PLAYING)
    system.fire()
    system.update(0.3)
    windowListeners.get('keydown')({ code: 'KeyR' })

    expect(ofName(Events.AMMO_UPDATE).at(-1).payload).toEqual({ mag: 5, reserve: 24, reloading: true })
  })

  it('R is ignored outside the playing state — no reload, no emission', () => {
    const { env } = makeEnv()
    const { system } = makeSystem(env, { weapon: byId('peel_launcher') })

    system.fire() // FSM is in menu — the trigger pull still works, but…
    system.update(0.3)
    windowListeners.get('keydown')({ code: 'KeyR' })

    expect(ofName(Events.AMMO_UPDATE).at(-1).payload).toEqual({ mag: 5, reserve: 24, reloading: false })
  })

  it('equip resets the counters and adopts the new weapon', () => {
    const { env } = makeEnv()
    const { system } = makeSystem(env, { weapon: byId('peel_launcher') })

    system.fire()
    system.equip(byId('vine_sniper'))

    expect(system.shotStats()).toEqual({ shots: 0, hits: 0 })
    expect(emissions.filter((e) => e.name === Events.WEAPON_CHANGE).at(-1).payload).toEqual({
      id: 'vine_sniper',
      name: 'Vine Sniper',
    })
    expect(ofName(Events.AMMO_UPDATE).at(-1).payload).toEqual({ mag: 4, reserve: 16, reloading: false })
  })
})

describe('input gating', () => {
  it('a click without pointer lock never fires — the rig owns locking', () => {
    const { env } = makeEnv()
    const { system } = makeSystem(env)

    canvasListeners.get('mousedown')({ button: 0 }) // no pointer lock
    system.update(0.016)

    expect(system.shotStats().shots).toBe(0)
  })

  it('a locked press fires on the next update, and release stops it', () => {
    const { env } = makeEnv()
    const { system } = makeSystem(env, { weapon: byId('seed_shotgun') })

    holdTrigger(env)
    system.update(0.016)
    expect(system.shotStats().shots).toBe(1)

    windowListeners.get('mouseup')({ button: 0 })
    system.update(0.2) // cooldown elapses, but the trigger is up
    system.update(0.2)
    expect(system.shotStats().shots).toBe(1)
  })
})

describe('real hits — hit:confirm and the accuracy counters', () => {
  it('a non-lethal hit emits hit:confirm {killed:false} and counts shots/hits', () => {
    const { env } = makeEnv()
    const { system } = makeSystem(env, { weapon: byId('seed_shotgun') }) // 20 dmg < 100 hp

    expect(system.fire()).toBe(true)

    expect(ofName(Events.HIT_CONFIRM)).toEqual([{ name: Events.HIT_CONFIRM, payload: { killed: false } }])
    expect(system.shotStats()).toEqual({ shots: 1, hits: 1 })
  })

  it('the killing shot emits hit:confirm {killed:true} — real hitBot damage, not simulated', () => {
    const { env, botRecord } = makeEnv()
    const { system } = makeSystem(env, { weapon: byId('seed_shotgun') }) // 5 × 20 = 100

    for (let i = 0; i < 5; i += 1) {
      expect(system.fire()).toBe(true)
      system.update(0.2)
    }

    const confirms = ofName(Events.HIT_CONFIRM).map((e) => e.payload)
    expect(confirms).toEqual([
      { killed: false },
      { killed: false },
      { killed: false },
      { killed: false },
      { killed: true },
    ])
    expect(botRecord.alive).toBe(false)
  })

  it('a target beyond the weapon’s range is not a hit — the shot still counts', () => {
    const { env } = makeEnv()
    env.world.targets[0].position.set(0, 1.6, -100) // shotgun range 60 m, sniper 150 m
    env.world.targets[0].updateMatrixWorld(true)

    const shotgun = makeSystem(env, { weapon: byId('seed_shotgun') })
    expect(shotgun.system.fire()).toBe(true)
    expect(ofName(Events.HIT_CONFIRM)).toEqual([])
    expect(shotgun.system.shotStats()).toEqual({ shots: 1, hits: 0 })

    emissions.length = 0
    const sniper = makeSystem(env, { weapon: byId('vine_sniper') })
    expect(sniper.system.fire()).toBe(true)
    expect(ofName(Events.HIT_CONFIRM)).toHaveLength(1)
    expect(sniper.system.shotStats()).toEqual({ shots: 1, hits: 1 })
  })
})

describe('own-avatar exclusion', () => {
  it('a shot down the avatar’s own ray line hits the bot behind it, never the avatar', () => {
    const { env } = makeEnv()
    const avatar = new THREE.Group()
    avatar.userData = { character: 'banana', eyeHeight: 1.1 }
    const avatarBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.5), new THREE.MeshBasicMaterial())
    avatarBody.position.set(0, 1.6, -2) // between the camera (z=0) and the bot (z=-10)
    avatarBody.updateMatrixWorld(true)
    avatar.add(avatarBody)
    env.world.targets.push(avatarBody) // registered — as if some system had

    const { system } = makeSystem(env, { avatar, weapon: byId('seed_shotgun') })
    expect(system.fire()).toBe(true)

    // The bot took the one shotgun blast (100 → 80); the avatar has no record
    // and its presence on the ray changed nothing.
    expect(env.state.bots[0].health).toBe(80)
    expect(system.shotStats()).toEqual({ shots: 1, hits: 1 })
  })
})

describe('crosshair spread', () => {
  it('emits the 6 px stationary base once, then nothing until it changes', () => {
    const { env } = makeEnv()
    const { system } = makeSystem(env)

    system.update(0.016)
    system.update(0.016)

    expect(ofName(Events.CROSSHAIR_UPDATE)).toEqual([{ name: Events.CROSSHAIR_UPDATE, payload: { spreadPx: 6 } }])
  })

  it('movement widens the spread by 8 px and it narrows back when you stop', () => {
    const { env } = makeEnv()
    const { system } = makeSystem(env)

    env.state.player.vel.set(3, 0, 0)
    system.update(0.016)
    expect(ofName(Events.CROSSHAIR_UPDATE).at(-1).payload).toEqual({ spreadPx: 14 })

    env.state.player.vel.set(0, 0, 0)
    system.update(0.016)
    expect(ofName(Events.CROSSHAIR_UPDATE).at(-1).payload).toEqual({ spreadPx: 6 })
  })

  it('firing blooms the spread and the bloom decays per frame back to base', () => {
    const { env } = makeEnv()
    const { system } = makeSystem(env)

    system.fire() // bloom +6
    system.update(0.016)
    expect(ofName(Events.CROSSHAIR_UPDATE).at(-1).payload).toEqual({ spreadPx: 12 })

    for (let i = 0; i < 40; i += 1) system.update(0.016) // ~0.64 s of decay ≥ 6 px
    expect(ofName(Events.CROSSHAIR_UPDATE).at(-1).payload).toEqual({ spreadPx: 6 })
  })

  it('never leaves the 4–40 px contract range under sustained full-auto fire', () => {
    const { env } = makeEnv()
    const { system } = makeSystem(env, { weapon: byId('seed_shotgun') })

    holdTrigger(env)
    env.state.player.vel.set(3, 0, 0) // moving + blooming is the worst case
    const seen = []
    for (let i = 0; i < 120; i += 1) {
      system.update(0.016)
      const last = ofName(Events.CROSSHAIR_UPDATE).at(-1)
      if (last) seen.push(last.payload.spreadPx)
    }

    expect(seen.length).toBeGreaterThan(0)
    for (const px of seen) {
      expect(px).toBeGreaterThanOrEqual(4)
      expect(px).toBeLessThanOrEqual(40)
    }
    expect(Math.max(...seen)).toBe(40) // saturated at the ceiling, never beyond
  })
})

describe('tracer origin — FPS muzzle vs TPS avatar eye', () => {
  it('in FPS the tracer leaves the camera-space muzzle', () => {
    const { env } = makeEnv()
    const { system } = makeSystem(env)

    system.fire()
    const tracer = env.scene.meshes[0]
    // Straight -Z shot: muzzle sits 0.14 below the eye (1.6), so the beam's
    // midpoint y is (1.46 + 1.6) / 2.
    expect(tracer.position.y).toBeCloseTo(1.53, 2)
  })

  it('in TPS the tracer leaves the avatar’s eye, not the orbit camera', () => {
    const { env } = makeEnv()
    const { system, rig, avatar } = makeSystem(env)
    avatar.position.set(0, 0, 0)
    rig.mode = 'tps'

    system.fire()
    const tracer = env.scene.meshes[0]
    // Eye at 1.1 (the fruit's userData.eyeHeight), impact at 1.6 → midpoint 1.35.
    expect(tracer.position.y).toBeCloseTo(1.35, 2)
  })
})

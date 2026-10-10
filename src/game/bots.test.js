import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import { createBotManager, botRoster, BOT_NAMES } from './bots.js'
import { scoreOf } from './matchRules.js'

// Minimal fruit-avatar stand-in: a group with one child mesh, carrying the
// cast's userData shape ({ character, hitboxRadius, eyeHeight }).
function fakeAvatar(character = 'banana', hitboxRadius = 0.5, eyeHeight = 1.0) {
  const group = new THREE.Group()
  group.userData = { character, hitboxRadius, eyeHeight }
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 1, 0.5),
    new THREE.MeshLambertMaterial(),
  )
  body.castShadow = true
  group.add(body)
  return group
}

function makeEnv({ spawnPoints = [] } = {}) {
  return {
    THREE,
    scene: { add: vi.fn(), remove: vi.fn() },
    camera: new THREE.PerspectiveCamera(),
    world: {
      colliders: [],
      targets: [],
      obstacleMeshes: [],
      bounds: { minX: -32, maxX: 32, minZ: -32, maxZ: 32 },
    },
    state: {
      player: { pos: new THREE.Vector3(0, 0, 8), vel: new THREE.Vector3(), health: 100, alive: true },
      score: { kills: 0, deaths: 0 },
      bots: [],
    },
    hooks: { hitBot: null, damagePlayer: null },
    spawnPoint: new THREE.Vector3(0, 0, 0),
    spawnPoints: spawnPoints.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))),
  }
}

// Health-system stand-in: the death half of health.js (enough for kill credit).
function installDamageHook(env) {
  env.hooks.damagePlayer = (dmg) => {
    const player = env.state.player
    if (!player.alive) return
    player.health = Math.max(0, player.health - dmg)
    if (player.health <= 0) {
      player.alive = false
      env.state.score.deaths += 1
    }
  }
}

function makeManager(env, roster = botRoster()) {
  const avatarFor = vi.fn((characterId) => fakeAvatar(characterId))
  const bots = createBotManager(env, { roster, avatarFor })
  return { bots, avatarFor }
}

describe('botRoster — the mock driver\'s roster', () => {
  it('carries the mock\'s five names and bot-1…bot-5 ids', () => {
    expect(BOT_NAMES).toEqual(['Melon Musk', 'Berry Bonds', 'Citrus Cline', 'Raisin Kane', 'Papaya Diaz'])
    expect(botRoster().map((b) => b.id)).toEqual(['bot-1', 'bot-2', 'bot-3', 'bot-4', 'bot-5'])
  })

  it('rotates loadout character ids one step off the list (round-robin)', () => {
    expect(botRoster().map((b) => b.character)).toEqual([
      'watermelon_tank',
      'strawberry_scout',
      'banana_commando',
      'watermelon_tank',
      'strawberry_scout',
    ])
  })
})

describe('createBotManager — avatars and records', () => {
  it('builds one scored fruit bot per roster entry', () => {
    const env = makeEnv()
    const { bots, avatarFor } = makeManager(env)

    expect(bots.bots).toHaveLength(5)
    expect(avatarFor).toHaveBeenCalledTimes(5)
    expect(env.state.bots).toHaveLength(5)
    for (const bot of bots.bots) {
      expect(bot).toMatchObject({
        name: expect.any(String),
        character: expect.any(String),
        kills: 0,
        deaths: 0,
        score: 0,
        alive: true,
        health: 100,
      })
      expect(bot.hitMeshes.length).toBeGreaterThan(0)
      expect(bot.mesh.userData).toMatchObject({ isBot: true, entityId: bot.id })
    }
  })

  it('registers every avatar mesh as a hittable target', () => {
    const env = makeEnv()
    const { bots } = makeManager(env)

    const registered = env.world.targets
    expect(registered.length).toBe(bots.bots.reduce((n, b) => n + b.hitMeshes.length, 0))
    for (const mesh of registered) {
      expect(mesh.userData).toMatchObject({ fruit: true, isBot: true })
    }
  })

  it('spawns bots from the arena\'s spawn points, skipping the player\'s point [0]', () => {
    const points = [
      [0, 0, 0],
      [10, 0, 0],
      [10, 0, 10],
      [-10, 0, 0],
      [-10, 0, -10],
      [20, 0, 0],
    ]
    const env = makeEnv({ spawnPoints: points })
    const { bots } = makeManager(env)

    bots.bots.forEach((bot, i) => {
      const expected = points[(i + 1) % points.length]
      expect(bot.pos.x).toBeCloseTo(expected[0], 6)
      expect(bot.pos.z).toBeCloseTo(expected[2], 6)
    })
  })

  it('adopts the avatar\'s hitboxRadius for movement and eyeHeight for LOS', () => {
    const env = makeEnv()
    const manager = createBotManager(env, {
      roster: [{ id: 'bot-1', name: 'Big Melon', character: 'watermelon_tank' }],
      avatarFor: () => fakeAvatar('watermelon', 0.85, 1.2),
    })

    expect(manager.bots[0].radius).toBeCloseTo(0.85, 6)
    expect(manager.bots[0].eyeY).toBeCloseTo(1.2, 6)
  })
})

describe('combat rules — hits, deaths, kill credit', () => {
  let env
  let bots

  beforeEach(() => {
    env = makeEnv()
    ;({ bots } = makeManager(env))
  })

  it('applies damage through the hitBot ancestor walk from any avatar mesh', () => {
    const bot = bots.bots[0]
    const hitMesh = bot.hitMeshes[0]

    env.hooks.hitBot(hitMesh, 40)

    expect(bot.health).toBe(60)
    expect(bot.alive).toBe(true)
  })

  it('a lethal hit counts the death, scores it, and deregisters the body', () => {
    const bot = bots.bots[0]

    env.hooks.hitBot(bot.hitMeshes[0], 999)

    expect(bot.alive).toBe(false)
    expect(bot.deaths).toBe(1)
    expect(bot.score).toBe(scoreOf(0, 1)) // −25
    expect(env.state.score.kills).toBe(1) // the local player's kill
    expect(env.world.targets.some((m) => bot.hitMeshes.includes(m))).toBe(false)
  })

  it('ignores non-bot meshes and dead bots', () => {
    const bot = bots.bots[0]
    env.hooks.hitBot(bot.hitMeshes[0], 999) // dead
    env.hooks.hitBot(bot.hitMeshes[0], 10) // pass-through while dead

    expect(bot.deaths).toBe(1)
    expect(env.state.score.kills).toBe(1)
  })

  it('credits the firing bot with a kill when its shot ends the player', () => {
    const env = makeEnv()
    installDamageHook(env)
    // Solo roster: no wandering teammate can steal the kill credit.
    const manager = createBotManager(env, {
      roster: [{ id: 'bot-1', name: 'Solo', character: 'banana_commando' }],
      avatarFor: () => fakeAvatar(),
    })
    const bot = manager.bots[0]
    // Bot 5 m from the player, clear line of sight.
    bot.pos.set(5, 0, 8)

    // First shot at the 0.5 s acquire delay, then one every 1.2 s; 10 shots
    // at 10 damage drain 100 hp.
    for (let i = 0; i < 10 && env.state.player.alive; i++) manager.update(1.2)

    expect(env.state.player.alive).toBe(false)
    expect(bot.kills).toBe(1)
    expect(bot.score).toBe(scoreOf(1, 0)) // 100
  })
})

describe('respawn — 3 s at the farthest arena spawn point', () => {
  it('respawns after 3 s, re-registered, at the spawn point farthest from the player', () => {
    const env = makeEnv({
      spawnPoints: [[0, 0, 0], [10, 0, 0], [-30, 0, 0]],
    })
    const { bots } = makeManager(env)
    const bot = bots.bots[0]
    env.state.player.pos.set(0, 0, 0)
    env.hooks.hitBot(bot.hitMeshes[0], 999)

    bots.update(2.9)
    expect(bot.alive).toBe(false) // still counting

    bots.update(0.15)
    expect(bot.alive).toBe(true)
    expect(bot.health).toBe(100)
    expect(bot.pos.x).toBeCloseTo(-30, 6) // farthest from the player at origin
    expect(env.world.targets.some((m) => bot.hitMeshes.includes(m))).toBe(true)
  })
})

describe('resetMatch — fresh records and bodies for a new match', () => {
  it('zeroes records, revives everyone, and returns bots to their spawn points', () => {
    const points = [[0, 0, 0], [10, 0, 0], [-10, 0, 0], [0, 0, 10], [0, 0, -10], [20, 0, 20]]
    const env = makeEnv({ spawnPoints: points })
    installDamageHook(env)
    const manager = createBotManager(env, {
      roster: [
        { id: 'bot-1', name: 'One', character: 'banana_commando' },
        { id: 'bot-2', name: 'Two', character: 'strawberry_scout' },
      ],
      avatarFor: () => fakeAvatar(),
    })

    // One bot killed, one bot credited with ending the player.
    env.hooks.hitBot(manager.bots[0].hitMeshes[0], 999)
    manager.bots[1].pos.set(5, 0, 8)
    for (let i = 0; i < 10 && env.state.player.alive; i++) manager.update(1.2)
    expect(manager.bots[1].kills).toBe(1)

    manager.resetMatch()

    manager.bots.forEach((bot, i) => {
      expect(bot.kills).toBe(0)
      expect(bot.deaths).toBe(0)
      expect(bot.score).toBe(0)
      expect(bot.alive).toBe(true)
      expect(bot.health).toBe(100)
      expect(bot.pos.x).toBeCloseTo(points[(i + 1) % points.length][0], 6)
      expect(bot.pos.z).toBeCloseTo(points[(i + 1) % points.length][2], 6)
      expect(env.world.targets.some((m) => bot.hitMeshes.includes(m))).toBe(true)
    })
  })
})

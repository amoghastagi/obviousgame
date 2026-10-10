import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { createMatchDirector, MATCH_DURATION_S } from './matchDirector.js'
import { bus, Events } from '../core/eventBus.js'
import { getState, transition, GameStates } from '../core/gameState.js'
import { maxHealthFor } from './health.js'
import { setSelection } from '../data/loadout.js'
import { botRoster } from './bots.js'
import { SCORE_KILL, scoreOf } from './matchRules.js'

// The director's whole world: records in env.state (player score + bot
// records), the weapon system (equip + shotStats), and the health system
// (reset). Fakes for the systems, real bus/FSM/loadout — the ordering and
// transition behavior is the real contract.
function makeDirectorEnv() {
  const env = {
    state: {
      player: { pos: new THREE.Vector3(0, 0, 8), health: 100, alive: true },
      score: { kills: 0, deaths: 0 },
      // Real roster names/characters, zeroed records.
      bots: botRoster().map((entry) => ({ ...entry, kills: 0, deaths: 0, score: 0 })),
    },
  }
  return env
}

function makeDirector(env, { shots = 0, hits = 0, onMatchStart } = {}) {
  const weapons = { equip: vi.fn(), shotStats: vi.fn(() => ({ shots, hits })) }
  // The real health system announces the reset — the beat's health:update.
  const health = {
    reset: vi.fn((max) => bus.emit(Events.HEALTH_UPDATE, { current: max, max })),
  }
  const match = createMatchDirector(env, { weapons, health, maxHealthFor, onMatchStart })
  return { match, weapons, health }
}

/** Collects every contract emission the director makes, in order. */
const emissions = []
for (const name of [
  Events.WEAPON_CHANGE,
  Events.HEALTH_UPDATE,
  Events.AMMO_UPDATE,
  Events.LEADERBOARD_UPDATE,
  Events.MATCH_END,
]) {
  bus.on(name, (payload) => emissions.push({ name, payload, stateAtEmit: getState() }))
}
beforeEach(() => {
  emissions.length = 0
})

// Map-backed localStorage so the director's loadSelection reads a real pick.
let storage
beforeEach(() => {
  storage = new Map()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, String(v)),
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  // Failed or finished tests leave the FSM mid-match; walk it back to menu
  // so every test starts from a clean machine.
  const state = getState()
  if (state === GameStates.PLAYING || state === GameStates.PAUSED) {
    transition(GameStates.GAME_OVER)
    transition(GameStates.MENU)
  } else if (state === GameStates.GAME_OVER || state === GameStates.VICTORY) {
    transition(GameStates.MENU)
  }
})

const ofName = (name) => emissions.filter((e) => e.name === name)

describe('the opening beat — the mock\'s exact order', () => {
  it('announces weapon → health → ammo → leaderboard, once each, describing the fresh state', () => {
    setSelection({ characterId: 'strawberry_scout', weaponId: 'seed_shotgun' })
    const env = makeDirectorEnv()
    const onMatchStart = vi.fn(() => {
      env.state.score.kills = 0
      env.state.score.deaths = 0
      for (const bot of env.state.bots) {
        bot.kills = 0
        bot.deaths = 0
        bot.score = 0
      }
    })
    const { match, weapons, health } = makeDirector(env, { onMatchStart })
    transition(GameStates.PLAYING)

    bus.emit(Events.MATCH_START, { mode: 'sandbox' })

    // The beat, in order, nothing else interleaved.
    expect(emissions.map((e) => e.name)).toEqual([
      Events.WEAPON_CHANGE,
      Events.HEALTH_UPDATE,
      Events.AMMO_UPDATE,
      Events.LEADERBOARD_UPDATE,
    ])
    // Bodies first, then the announcements: equip adopts silently — the
    // director owns the weapon:change emission.
    expect(onMatchStart).toHaveBeenCalledTimes(1)
    expect(weapons.equip).toHaveBeenCalledWith(expect.objectContaining({ id: 'seed_shotgun' }), { silent: true })
    expect(emissions[0].payload).toEqual({ id: 'seed_shotgun', name: 'Seed Shotgun' })
    expect(health.reset).toHaveBeenCalledWith(maxHealthFor({ armor: 1 })) // strawberry: 80
    expect(emissions[1].payload).toEqual({ current: 80, max: 80 })
    expect(emissions[2].payload).toEqual({ mag: 8, reserve: 32, reloading: false })
    expect(match.armed).toBe(true)
  })

  it('the roster snapshot holds all six participants, pre-sorted score-desc', () => {
    const env = makeDirectorEnv()
    const { match } = makeDirector(env)
    transition(GameStates.PLAYING)

    bus.emit(Events.MATCH_START, { mode: 'sandbox' })

    const { entries } = ofName(Events.LEADERBOARD_UPDATE)[0].payload
    expect(entries).toHaveLength(6)
    expect(entries[0]).toEqual({
      id: 'local',
      name: 'You',
      character: 'banana_commando', // default selection
      kills: 0,
      deaths: 0,
      score: 0,
      isLocal: true,
    })
    expect(entries.slice(1).map((e) => e.name)).toEqual([
      'Melon Musk',
      'Berry Bonds',
      'Citrus Cline',
      'Raisin Kane',
      'Papaya Diaz',
    ])
    expect(entries.slice(1).map((e) => e.character)).toEqual([
      'watermelon_tank',
      'strawberry_scout',
      'banana_commando',
      'watermelon_tank',
      'strawberry_scout',
    ])
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i - 1].score).toBeGreaterThanOrEqual(entries[i].score)
      expect(entries[i].isLocal).toBe(false)
    }
  })
})

describe('the leaderboard during play — reacts to every kill and death', () => {
  it('emits a pre-sorted update on the next tick after a record changes, and not otherwise', () => {
    const env = makeDirectorEnv()
    const { match } = makeDirector(env)
    transition(GameStates.PLAYING)
    bus.emit(Events.MATCH_START, { mode: 'sandbox' })

    // Nothing changed → no update.
    emissions.length = 0
    match.tick(0.016)
    expect(ofName(Events.LEADERBOARD_UPDATE)).toEqual([])

    // Bot-2 scores two kills and dies once (as hooks do) → one update.
    const bot2 = env.state.bots[1]
    bot2.kills = 2
    bot2.deaths = 1
    match.tick(0.016)

    const updates = ofName(Events.LEADERBOARD_UPDATE)
    expect(updates).toHaveLength(1)
    const { entries } = updates[0].payload
    expect(entries[0].id).toBe('bot-2')
    expect(entries[0].score).toBe(scoreOf(2, 1)) // 175
    expect(entries.map((e) => e.score)).toEqual([...entries.map((e) => e.score)].sort((a, b) => b - a))
  })
})

describe('the clock — dt-driven, ends once at 60 s', () => {
  it('runs only when ticked and fires match:end exactly once', () => {
    const env = makeDirectorEnv()
    const { match } = makeDirector(env)
    transition(GameStates.PLAYING)
    bus.emit(Events.MATCH_START, { mode: 'sandbox' })

    match.tick(MATCH_DURATION_S - 1)
    expect(ofName(Events.MATCH_END)).toHaveLength(0) // not yet

    match.tick(1) // 60 s total
    expect(ofName(Events.MATCH_END)).toHaveLength(1)
    expect(match.armed).toBe(false)

    match.tick(10) // post-match ticks do nothing
    expect(ofName(Events.MATCH_END)).toHaveLength(1)
    expect(match.elapsed).toBe(MATCH_DURATION_S)
  })
})

describe('the end of the match — emit-then-transition, the mock\'s shape', () => {
  it('victory: placement 1st → match:end first (state still playing), then the FSM lands on victory', () => {
    const env = makeDirectorEnv()
    const { match } = makeDirector(env, { shots: 10, hits: 4 })
    transition(GameStates.PLAYING)
    bus.emit(Events.MATCH_START, { mode: 'sandbox' })

    env.state.score.kills = 2 // local leads 200–0
    match.tick(MATCH_DURATION_S)

    const end = ofName(Events.MATCH_END)[0]
    expect(end.stateAtEmit).toBe(GameStates.PLAYING) // emitted BEFORE the transition
    expect(getState()).toBe(GameStates.VICTORY) // …then transitioned
    expect(end.payload).toEqual({
      victory: true,
      summary: {
        kills: 2,
        deaths: 0,
        score: 2 * SCORE_KILL,
        placement: 1,
        accuracy: 40, // real shots/hits — no mock clamp
        timeSurvivedSec: MATCH_DURATION_S,
      },
    })
  })

  it('game over: a bot leads → match:end, then the FSM lands on game_over', () => {
    const env = makeDirectorEnv()
    const { match } = makeDirector(env, { shots: 0, hits: 0 })
    transition(GameStates.PLAYING)
    bus.emit(Events.MATCH_START, { mode: 'sandbox' })

    env.state.bots[0].kills = 1 // Melon Musk leads
    match.tick(MATCH_DURATION_S)

    const end = ofName(Events.MATCH_END)[0]
    expect(end.stateAtEmit).toBe(GameStates.PLAYING)
    expect(getState()).toBe(GameStates.GAME_OVER)
    expect(end.payload.victory).toBe(false)
    expect(end.payload.summary).toMatchObject({ placement: 2, kills: 0, deaths: 0, score: 0, accuracy: 0 })
  })

  it('the final leaderboard immediately precedes match:end — the modal reads fresh standings', () => {
    const env = makeDirectorEnv()
    const { match } = makeDirector(env)
    transition(GameStates.PLAYING)
    bus.emit(Events.MATCH_START, { mode: 'sandbox' })

    env.state.bots[0].kills = 3
    env.state.score.kills = 1
    match.tick(MATCH_DURATION_S)

    const names = emissions.map((e) => e.name)
    expect(names[names.length - 2]).toBe(Events.LEADERBOARD_UPDATE)
    expect(names[names.length - 1]).toBe(Events.MATCH_END)
    const final = ofName(Events.LEADERBOARD_UPDATE).at(-1).payload.entries
    expect(final.map((e) => e.id)).toEqual(['bot-1', 'local', 'bot-2', 'bot-3', 'bot-4', 'bot-5'])
    expect(final[0].score).toBe(3 * SCORE_KILL)
  })
})

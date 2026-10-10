/*
 * Fruit Shockers — MOCK MATCH DRIVER (demo only).
 *
 * Simulates a full sandbox match on the event bus so every UI surface can be
 * verified without the 3D engine. Lives in src/demo/ — the real game engine
 * replaces it; when that lands, delete this file and its import in main.js.
 *
 * Behavior:
 *   - on `match:start`: emits `weapon:change` from the persisted selection
 *     plus the opening health/ammo/leaderboard snapshot (so the HUD never
 *     flashes placeholders before the first tick), then ticks every 200ms:
 *     health (damage + regen + respawn), ammo
 *     (mag drain + reload cycles via the reloading flag), crosshair (wandering
 *     4–40 spread, spikes on shots), hit:confirm, and leaderboard:update
 *     (local player + 5 bots, churned over time, pre-sorted score-desc).
 *   - ticking pauses when the game state is not 'playing' (Esc freezes the match).
 *   - after 45–60s of match time: emits `match:end` (summary derived from the
 *     tracked leaderboard numbers) and transitions to 'victory' when the local
 *     player placed 1st, else 'game_over'. Retry works because the modal
 *     re-emits `ui:match:start`.
 */

import { bus, Events } from '../core/eventBus.js'
import { getState, transition, GameStates } from '../core/gameState.js'
import { CHARACTERS, WEAPONS, loadSelection } from '../data/loadout.js'

const TICK_MS = 200
const MATCH_MIN_SEC = 45
const MATCH_MAX_SEC = 60
const HEALTH_MAX = 100
const SPREAD_MIN = 4
const SPREAD_MAX = 40

const BOT_NAMES = ['Melon Musk', 'Berry Bonds', 'Citrus Cline', 'Raisin Kane', 'Papaya Diaz']

let initialized = false
let timer = null

const rand = (min, max) => min + Math.random() * (max - min)
const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

function stopTicking() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function makeBots() {
  return BOT_NAMES.map((name, i) => ({
    id: `bot-${i + 1}`,
    name,
    character: CHARACTERS[(i + 1) % CHARACTERS.length].id,
    kills: 0,
    deaths: 0,
    score: 0,
    isLocal: false,
    // Per-match skill keeps bot rankings different every run.
    killRate: rand(0.018, 0.042),
  }))
}

function startMatch() {
  stopTicking()

  const selection = loadSelection()
  const weapon = WEAPONS.find((w) => w.id === selection.weaponId) ?? WEAPONS[0]

  const match = {
    weapon,
    health: HEALTH_MAX,
    respawnAt: 0,
    lastDamageAt: -Infinity,
    mag: weapon.ammo.mag,
    reserve: weapon.ammo.reserve,
    reloading: false,
    reloadTicksLeft: 0,
    spread: 8,
    matchTimeMs: 0,
    durationMs: rand(MATCH_MIN_SEC, MATCH_MAX_SEC) * 1000,
    shots: 0,
    hits: 0,
    local: {
      id: 'local',
      name: 'You',
      character: CHARACTERS.find((c) => c.id === selection.characterId)?.id ?? CHARACTERS[0].id,
      kills: 0,
      deaths: 0,
      score: 0,
      isLocal: true,
    },
    bots: makeBots(),
  }

  // The game announces the player's loadout as the match opens, with the
  // opening readouts in the same beat — the HUD must not flash a stale
  // "0 / 0" ammo counter or "No standings yet" before the first tick.
  bus.emit(Events.WEAPON_CHANGE, { id: weapon.id, name: weapon.name })
  bus.emit(Events.HEALTH_UPDATE, { current: match.health, max: HEALTH_MAX })
  bus.emit(Events.AMMO_UPDATE, { mag: match.mag, reserve: match.reserve, reloading: false })
  emitLeaderboard(match)

  timer = setInterval(() => tick(match), TICK_MS)
}

function tick(match) {
  // Pause freezes the simulation: no clock, no damage, no events.
  if (getState() !== GameStates.PLAYING) return

  match.matchTimeMs += TICK_MS
  const nowSec = match.matchTimeMs / 1000

  simulateHealth(match, nowSec)
  simulateAmmoAndShots(match)
  emitCrosshair(match)
  churnLeaderboard(match)
  emitLeaderboard(match)

  if (match.matchTimeMs >= match.durationMs) endMatch(match)
}

function simulateHealth(match, nowSec) {
  if (match.health <= 0) {
    // Downed: stay at 0 until the respawn beat passes.
    if (match.matchTimeMs >= match.respawnAt) match.health = HEALTH_MAX
  } else {
    if (Math.random() < 0.035) {
      match.health = Math.max(0, match.health - rand(8, 22))
      match.lastDamageAt = nowSec
      if (match.health === 0) {
        match.local.deaths += 1
        match.respawnAt = match.matchTimeMs + 1200
      }
    } else if (match.health < HEALTH_MAX && nowSec - match.lastDamageAt > 2) {
      match.health = Math.min(HEALTH_MAX, match.health + 0.8) // slow regen
    }
  }
  bus.emit(Events.HEALTH_UPDATE, { current: Math.round(match.health), max: HEALTH_MAX })
}

function simulateAmmoAndShots(match) {
  if (match.reloading) {
    match.reloadTicksLeft -= 1
    if (match.reloadTicksLeft <= 0) {
      match.reloading = false
      match.mag = match.weapon.ammo.mag
      match.reserve = Math.max(0, match.reserve - match.weapon.ammo.mag)
      if (match.reserve === 0) match.reserve = match.weapon.ammo.reserve // demo replenish
    }
  } else {
    // FireRate 1–5 maps to per-tick shot chance 3%–11%.
    const shotChance = 0.03 + match.weapon.stats.fireRate * 0.016
    if (Math.random() < shotChance) {
      match.shots += 1
      match.mag -= 1
      match.spread = Math.min(SPREAD_MAX, match.spread + rand(5, 12)) // spike on shots
      if (Math.random() < 0.6) {
        match.hits += 1
        bus.emit(Events.HIT_CONFIRM, { killed: Math.random() < 0.08 })
      }
      if (match.mag <= 0) {
        match.reloading = true
        match.reloadTicksLeft = 9 // ~1.8s at 200ms ticks
      }
    } else {
      // Wandering spread with a pull back toward the resting value.
      match.spread = SPREAD_MIN + (match.spread - SPREAD_MIN) * 0.9 + rand(-0.4, 0.6)
      match.spread = clamp(match.spread, SPREAD_MIN, SPREAD_MAX)
    }
  }
  bus.emit(Events.AMMO_UPDATE, {
    mag: match.mag,
    reserve: match.reserve,
    reloading: match.reloading,
  })
}

function emitCrosshair(match) {
  bus.emit(Events.CROSSHAIR_UPDATE, { spreadPx: Math.round(match.spread * 10) / 10 })
}

function churnLeaderboard(match) {
  for (const bot of match.bots) {
    if (Math.random() < bot.killRate) bot.kills += 1
    if (Math.random() < 0.02) bot.deaths += 1
  }
  if (Math.random() < 0.032) match.local.kills += 1 // expected ~8 kills per match
  for (const p of [match.local, ...match.bots]) {
    p.score = p.kills * 100 - p.deaths * 25
  }
}

function emitLeaderboard(match) {
  const entries = [match.local, ...match.bots]
    .map(({ id, name, character, kills, deaths, score, isLocal }) => ({
      id,
      name,
      character,
      kills,
      deaths,
      score,
      isLocal,
    }))
    .sort((a, b) => b.score - a.score)
  bus.emit(Events.LEADERBOARD_UPDATE, { entries })
  return entries
}

function endMatch(match) {
  stopTicking()

  const entries = emitLeaderboard(match) // final standings
  const placement = entries.findIndex((e) => e.isLocal) + 1
  const victory = placement === 1
  const accuracy = clamp(Math.round((match.hits / Math.max(1, match.shots)) * 100), 20, 80)

  bus.emit(Events.MATCH_END, {
    victory,
    summary: {
      kills: match.local.kills,
      deaths: match.local.deaths,
      score: match.local.kills * 100 - match.local.deaths * 25,
      placement,
      accuracy,
      timeSurvivedSec: Math.round(match.matchTimeMs / 1000),
    },
  })

  // Match end is the only path out of 'playing' besides pause.
  transition(victory ? GameStates.VICTORY : GameStates.GAME_OVER)
}

/** Wire the mock driver to the bus. Idempotent; called once from main.js. */
export function initMockGame() {
  if (initialized) return
  initialized = true
  bus.on(Events.MATCH_START, startMatch)
}

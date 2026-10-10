// src/game/matchDirector.js — the match: the 60 s clock, the leaderboard,
// and the end-of-match flow.
//
// This module is the single match:start subscriber (the mock driver's role
// in the UI contract) and the single source of match-flow emissions. It
// reproduces the mock's exact behavioral shape:
//
//   OPENING BEAT (on match:start, in this order — the HUD never flashes
//   placeholder values):
//     1. weapon:change   { id, name }        — the persisted selection
//     2. health:update   { current, max }    — full catalog max
//     3. ammo:update     { mag, reserve }    — full mag, not reloading
//     4. leaderboard:update { entries }      — the roster, pre-sorted
//
//   DURING PLAY: leaderboard:update on every kill or death by any
//   participant (score = kills·100 − deaths·25, entries pre-sorted score-
//   desc). The clock is dt-driven and only advances while the FSM is in
//   `playing` — the host simply doesn't call tick() otherwise, so Esc pause
//   stops the clock and the leaderboard stays frozen with it.
//
//   AT EXPIRY (emit-then-transition, the mock's exact shape): a final
//   leaderboard, then match:end { victory, summary } — victory = placed
//   1st, accuracy from real shots/hits — and only then the FSM transition
//   to victory or game_over. The summary modal opens on the state change.
//
// The director touches no simulation state of its own: bodies, weapons, and
// health are the systems' — records in env.state (player score + bot
// records) are the scoreboard.
import { bus, Events } from '../core/eventBus.js'
import { transition, GameStates } from '../core/gameState.js'
import { loadSelection, WEAPONS, CHARACTERS } from '../data/loadout.js'
import { scoreOf, sortEntries, matchSummary } from './matchRules.js'

export const MATCH_DURATION_S = 60

// The local player's leaderboard identity. Loadout ids are the HUD's color
// vocabulary; 'You' is the mock's local name.
const LOCAL_ID = 'local'
const LOCAL_NAME = 'You'

export function createMatchDirector(env, { weapons, health, maxHealthFor, onMatchStart } = {}) {
  let armed = false
  let elapsed = 0
  let lastSignature = null

  // The persisted selection is the transport (contract: match:start carries
  // only { mode }; ids survive in localStorage).
  function weaponFor() {
    const { weaponId } = loadSelection()
    return WEAPONS.find((w) => w.id === weaponId) ?? WEAPONS[0]
  }

  function characterFor() {
    const { characterId } = loadSelection()
    return CHARACTERS.find((c) => c.id === characterId) ?? CHARACTERS[0]
  }

  function localEntry() {
    const { kills, deaths } = env.state.score
    return {
      id: LOCAL_ID,
      name: LOCAL_NAME,
      character: characterFor().id,
      kills,
      deaths,
      score: scoreOf(kills, deaths),
      isLocal: true,
    }
  }

  function entries() {
    return sortEntries([
      localEntry(),
      ...env.state.bots.map((bot) => ({
        id: bot.id,
        name: bot.name,
        character: bot.character,
        kills: bot.kills,
        deaths: bot.deaths,
        score: scoreOf(bot.kills, bot.deaths),
        isLocal: false,
      })),
    ])
  }

  function emitLeaderboard() {
    const leaderboardEntries = entries()
    bus.emit(Events.LEADERBOARD_UPDATE, { entries: leaderboardEntries })
    return leaderboardEntries
  }

  // Kills/deaths of every participant — the only signals the leaderboard
  // reacts to. Cheap string compare, no per-frame allocation of entries.
  function signature() {
    let sig = `${env.state.score.kills}:${env.state.score.deaths}`
    for (const bot of env.state.bots) sig += `|${bot.kills}:${bot.deaths}`
    return sig
  }

  // The match:start beat, in the mock's order. `onMatchStart` (the host)
  // resets bodies first — the beat's health/ammo/leaderboard describe the
  // fresh state, not the previous match's.
  function begin() {
    onMatchStart?.()
    const weapon = weaponFor()
    weapons.equip(weapon, { silent: true })
    bus.emit(Events.WEAPON_CHANGE, { id: weapon.id, name: weapon.name })
    health.reset(maxHealthFor(characterFor().stats))
    bus.emit(Events.AMMO_UPDATE, { mag: weapon.ammo.mag, reserve: weapon.ammo.reserve, reloading: false })
    lastSignature = signature()
    emitLeaderboard()
    elapsed = 0
    armed = true
  }

  function endMatch() {
    armed = false
    // Final standings feed the summary — emit once, reuse the array.
    const finalEntries = emitLeaderboard()
    const { shots, hits } = weapons.shotStats()
    const { victory, summary } = matchSummary({
      entries: finalEntries,
      localId: LOCAL_ID,
      shots,
      hits,
      timeSurvivedSec: Math.round(elapsed),
    })
    // Emit-then-transition: the modal's data must exist before the state
    // change opens it (the mock's exact sequence).
    bus.emit(Events.MATCH_END, { victory, summary })
    transition(victory ? GameStates.VICTORY : GameStates.GAME_OVER)
  }

  function tick(dt) {
    if (!armed) return
    elapsed += dt
    const sig = signature()
    if (sig !== lastSignature) {
      lastSignature = sig
      emitLeaderboard()
    }
    if (elapsed >= MATCH_DURATION_S) endMatch()
  }

  bus.on(Events.MATCH_START, begin)

  return {
    begin,
    tick,
    get armed() {
      return armed
    },
    get elapsed() {
      return elapsed
    },
    dispose: () => bus.off(Events.MATCH_START, begin),
  }
}

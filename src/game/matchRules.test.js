import { describe, it, expect } from 'vitest'
import {
  SCORE_KILL,
  SCORE_DEATH,
  scoreOf,
  sortEntries,
  placementOf,
  matchSummary,
} from './matchRules.js'

function entry(id, kills, deaths, isLocal = false) {
  return {
    id,
    name: id,
    character: 'banana_commando',
    kills,
    deaths,
    score: scoreOf(kills, deaths),
    isLocal,
  }
}

describe('scoreOf', () => {
  it('uses the contract weights: kills·100 − deaths·25', () => {
    expect(SCORE_KILL).toBe(100)
    expect(SCORE_DEATH).toBe(25)
    expect(scoreOf(0, 0)).toBe(0)
    expect(scoreOf(3, 1)).toBe(275)
    expect(scoreOf(1, 5)).toBe(-25)
    expect(scoreOf(10, 0)).toBe(1000)
  })
})

describe('sortEntries', () => {
  it('sorts score-descending', () => {
    const roster = [entry('a', 1, 0), entry('b', 3, 1), entry('c', 0, 0), entry('d', 0, 1)]
    expect(sortEntries(roster).map((e) => e.id)).toEqual(['b', 'a', 'c', 'd'])
  })

  it('breaks ties stably — equal scores keep their input order', () => {
    const roster = [entry('late', 2, 0), entry('early', 2, 0), entry('low', 0, 5)]
    expect(sortEntries(roster).map((e) => e.id)).toEqual(['late', 'early', 'low'])
  })

  it('returns a copy and never mutates the input', () => {
    const roster = [entry('a', 0, 0), entry('b', 5, 0)]
    sortEntries(roster)
    expect(roster.map((e) => e.id)).toEqual(['a', 'b'])
  })
})

describe('placementOf', () => {
  const roster = [
    entry('bot-1', 5, 0),
    entry('local', 3, 1, true),
    entry('bot-2', 1, 2),
  ]

  it('is 1-based', () => {
    expect(placementOf(roster, 'local')).toBe(2)
    expect(placementOf(roster, 'bot-1')).toBe(1)
    expect(placementOf(roster, 'bot-2')).toBe(3)
  })

  it('resolves ties by input order (stable sort)', () => {
    const tied = [entry('local', 2, 2, true), entry('bot', 2, 2)]
    expect(placementOf(tied, 'local')).toBe(1)
    expect(placementOf([tied[1], tied[0]], 'local')).toBe(2)
  })
})

describe('matchSummary', () => {
  // A full real-match roster: local + 5 bots, mirroring the mock's design.
  const winRoster = [
    entry('local', 8, 2, true),
    entry('bot-1', 6, 3),
    entry('bot-2', 6, 4),
    entry('bot-3', 3, 5),
    entry('bot-4', 1, 2),
    entry('bot-5', 0, 6),
  ]

  it('wins iff the local player placed 1st', () => {
    const win = matchSummary({ entries: winRoster, localId: 'local', shots: 10, hits: 4, timeSurvivedSec: 60 })
    expect(win.victory).toBe(true)
    expect(win.summary.placement).toBe(1)

    const loseRoster = winRoster.map((e) =>
      e.id === 'bot-1' ? entry('bot-1', 9, 1) : e
    )
    const lose = matchSummary({ entries: loseRoster, localId: 'local', shots: 10, hits: 4, timeSurvivedSec: 60 })
    expect(lose.victory).toBe(false)
    expect(lose.summary.placement).toBe(2)
  })

  it("carries the local player's line: kills, deaths, score, placement, timeSurvivedSec", () => {
    const result = matchSummary({ entries: winRoster, localId: 'local', shots: 20, hits: 9, timeSurvivedSec: 60 })
    expect(result.summary).toEqual({
      kills: 8,
      deaths: 2,
      score: 750, // 8·100 − 2·25
      placement: 1,
      accuracy: 45,
      timeSurvivedSec: 60,
    })
  })

  it('reports accuracy 0 when no shots were fired (no mock clamp)', () => {
    const result = matchSummary({ entries: winRoster, localId: 'local', shots: 0, hits: 0, timeSurvivedSec: 60 })
    expect(result.summary.accuracy).toBe(0)
  })

  it('rounds real accuracy to a whole percent', () => {
    const result = matchSummary({ entries: winRoster, localId: 'local', shots: 3, hits: 2, timeSurvivedSec: 60 })
    expect(result.summary.accuracy).toBe(67) // 2/3 → 66.67 → 67
  })
})

/*
 * Fruit Shockers — pure match rules.
 *
 * Score, sorting, placement, and the end-of-match summary as plain math —
 * no graphics, DOM, or bus imports, so the GameHost can trust it and Vitest
 * can exhaust it without a renderer.
 *
 * Contract notes (see src/core/eventBus.js):
 *   - score = kills·100 − deaths·25
 *   - leaderboard entries are pre-sorted score-desc
 *   - accuracy is real shots/hits (the mock's 20–80 % clamp is dropped);
 *     0 when no shots were fired
 *   - victory iff the local player placed 1st
 */

export const SCORE_KILL = 100
export const SCORE_DEATH = 25

export function scoreOf(kills, deaths) {
  return kills * SCORE_KILL - deaths * SCORE_DEATH
}

/** Sorted copy, score-desc. Stable: ties keep their input order. */
export function sortEntries(entries) {
  return [...entries].sort((a, b) => b.score - a.score)
}

export function placementOf(entries, localId) {
  return sortEntries(entries).findIndex((e) => e.id === localId) + 1
}

/** Real accuracy — no mock clamp. victory iff the local player placed 1st. */
export function matchSummary({ entries, localId, shots, hits, timeSurvivedSec }) {
  const sorted = sortEntries(entries)
  const local = sorted.find((e) => e.id === localId)
  const placement = sorted.findIndex((e) => e.id === localId) + 1
  return {
    victory: placement === 1,
    summary: {
      kills: local.kills,
      deaths: local.deaths,
      score: scoreOf(local.kills, local.deaths),
      placement,
      accuracy: shots > 0 ? Math.round((hits / shots) * 100) : 0,
      timeSurvivedSec,
    },
  }
}

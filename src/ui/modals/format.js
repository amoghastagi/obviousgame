/*
 * Fruit Shockers — MODALS pure formatters.
 *
 * Small stateless display helpers for the summary modal; kept separate so
 * they stay trivially testable and reusable by future surfaces.
 */

import { CHARACTERS, WEAPONS } from '../../data/loadout.js'

/** 47 → '0:47', 125 → '2:05'. Input is seconds (fractional inputs round). */
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Resolve a { characterId, weaponId } selection to display names, never
 * throwing on unknown ids (the modal must survive corrupt storage).
 */
export function resolveLoadoutNames({ characterId, weaponId } = {}) {
  const character = CHARACTERS.find((c) => c.id === characterId)
  const weapon = WEAPONS.find((w) => w.id === weaponId)
  return {
    character: character?.name ?? 'Unknown fruit',
    weapon: weapon?.name ?? 'Unknown weapon',
  }
}

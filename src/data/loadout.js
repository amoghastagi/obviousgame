/*
 * Fruit Shockers — shared loadout data.
 *
 * Single source of truth for the three fruit characters, their weapons, and
 * selection persistence. Stats are on a 1–5 scale. The menu, HUD, modal, and
 * mock driver all import from here — never hardcode ids or names elsewhere.
 */

export const CHARACTERS = Object.freeze([
  {
    id: 'banana_commando',
    name: 'Banana Commando',
    blurb: 'Goes in peels first, asks questions never.',
    stats: { speed: 4, armor: 2, agility: 5 },
  },
  {
    id: 'watermelon_tank',
    name: 'Watermelon Tank',
    blurb: 'Thick rind, thicker resolve.',
    stats: { speed: 2, armor: 5, agility: 2 },
  },
  {
    id: 'strawberry_scout',
    name: 'Strawberry Scout',
    blurb: 'Small berry, outsprints trouble.',
    stats: { speed: 5, armor: 1, agility: 4 },
  },
])

export const WEAPONS = Object.freeze([
  {
    id: 'peel_launcher',
    name: 'Peel Launcher',
    stats: { damage: 3, fireRate: 2, range: 4 },
    ammo: { mag: 6, reserve: 24 },
  },
  {
    id: 'seed_shotgun',
    name: 'Seed Shotgun',
    stats: { damage: 4, fireRate: 3, range: 2 },
    ammo: { mag: 8, reserve: 32 },
  },
  {
    id: 'vine_sniper',
    name: 'Vine Sniper',
    stats: { damage: 5, fireRate: 1, range: 5 },
    ammo: { mag: 4, reserve: 16 },
  },
])

const STORAGE_KEY = 'fruit-shockers-selection'
const DEFAULT_SELECTION = Object.freeze({ characterId: CHARACTERS[0].id, weaponId: WEAPONS[0].id })

function isValidSelection(sel) {
  return (
    !!sel &&
    CHARACTERS.some((c) => c.id === sel.characterId) &&
    WEAPONS.some((w) => w.id === sel.weaponId)
  )
}

/**
 * Read the persisted selection from localStorage (key 'fruit-shockers-selection').
 * Returns validated { characterId, weaponId }; falls back to the first
 * character/weapon when nothing is stored or the payload is corrupt.
 */
export function loadSelection() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SELECTION }
    const parsed = JSON.parse(raw)
    return isValidSelection(parsed) ? { ...parsed } : { ...DEFAULT_SELECTION }
  } catch (err) {
    // Corrupt/unavailable storage must never break boot — fall back to defaults.
    console.warn('[loadout] could not load selection, using defaults:', err)
    return { ...DEFAULT_SELECTION }
  }
}

/** Persist { characterId, weaponId }. Throws on unknown ids so bad data fails loudly. */
export function setSelection({ characterId, weaponId }) {
  if (!isValidSelection({ characterId, weaponId })) {
    throw new Error(`[loadout] unknown selection: ${JSON.stringify({ characterId, weaponId })}`)
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ characterId, weaponId }))
}

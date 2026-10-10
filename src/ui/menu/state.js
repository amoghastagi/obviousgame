/*
 * Fruit Shockers — MENU internal state module.
 *
 * Owns the menu's sub-state flow ('select' → 'confirm', with Back) and the
 * in-progress selection draft. Every pick persists through loadout's
 * setSelection so localStorage is always current; PLAY persists once more
 * (contract: selection persisted first) and hands back the payload for
 * `ui:match:start`. The menu never imports gameState — intents only.
 *
 * Subscribers get a fresh snapshot { subState, selection } on every change.
 */

import { loadSelection, setSelection } from '../../data/loadout.js'

export const MenuStates = Object.freeze({
  SELECT: 'select',
  CONFIRM: 'confirm',
})

let subState = MenuStates.SELECT
let draft = loadSelection()
const listeners = new Set()

function snapshot() {
  return { subState, selection: { ...draft } }
}

function notify() {
  for (const listener of [...listeners]) listener(snapshot())
}

/** Current menu state: { subState, selection: { characterId, weaponId } }. */
export function getMenuState() {
  return snapshot()
}

/** Subscribe to menu state changes. Returns an unsubscribe function. */
export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Pick a character (id from CHARACTERS). Persists immediately. */
export function selectCharacter(characterId) {
  draft = { ...draft, characterId }
  setSelection(draft)
  notify()
}

/** Pick a weapon (id from WEAPONS). Persists immediately. */
export function selectWeapon(weaponId) {
  draft = { ...draft, weaponId }
  setSelection(draft)
  notify()
}

/** 'select' → 'confirm': show the confirmation strip. */
export function confirmLoadout() {
  subState = MenuStates.CONFIRM
  notify()
}

/** Back navigation from the confirmation strip. */
export function backToSelect() {
  subState = MenuStates.SELECT
  notify()
}

/**
 * Game state returned to 'menu': restore the last selection from localStorage
 * so a returning player sees their loadout, and restart the flow at 'select'.
 */
export function restore() {
  draft = loadSelection()
  subState = MenuStates.SELECT
  notify()
}

/**
 * Persist the draft (contract: selection persisted first) and return a fresh
 * copy as the payload for `ui:match:start`.
 */
export function persist() {
  setSelection(draft)
  return { ...draft }
}

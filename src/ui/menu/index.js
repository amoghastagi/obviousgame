/*
 * Fruit Shockers — MENU surface.
 *
 * Contract with the shell (main.js):
 *   - exports init(rootEl): renders into the given mount and self-manages
 *     visibility by subscribing to `game:state` (this surface is visible in
 *     state 'menu' only). Export signature must stay stable.
 *   - UI → game intent is emitted on the bus, never by importing gameState:
 *     PLAY persists the selection first, then emits
 *     `ui:match:start { characterId, weaponId }`.
 *   - When the game state returns to 'menu', the persisted selection is
 *     restored from localStorage so a returning player sees their loadout.
 */

import './menu.css'
import { bus, Events } from '../../core/eventBus.js'
import { getState, GameStates } from '../../core/gameState.js'
import { CHARACTERS, WEAPONS } from '../../data/loadout.js'
import { WEAPON_GLYPHS } from './glyphs.js'
import {
  MenuStates,
  backToSelect,
  confirmLoadout,
  getMenuState,
  persist,
  restore,
  selectCharacter,
  selectWeapon,
  subscribe,
} from './state.js'
import { CHARACTER_ACCENTS, shellHTML } from './view.js'

export function init(rootEl) {
  rootEl.innerHTML = shellHTML()

  const sectionSelect = rootEl.querySelector('[data-section="select"]')
  const sectionConfirm = rootEl.querySelector('[data-section="confirm"]')
  const confirmOrb = rootEl.querySelector('[data-role="confirm-orb"]')
  const confirmCharacter = rootEl.querySelector('[data-role="confirm-character"]')
  const confirmWeapon = rootEl.querySelector('[data-role="confirm-weapon"]')
  const confirmGlyph = rootEl.querySelector('[data-role="confirm-glyph"]')
  const confirmAmmo = rootEl.querySelector('[data-role="confirm-ammo"]')
  const confirmButton = rootEl.querySelector('[data-action="confirm"]')
  const playButton = rootEl.querySelector('[data-action="play"]')

  // Reflect menu state onto the DOM: sub-state sections, selected rings/chips,
  // and the confirmation strip contents.
  function syncUI({ subState, selection }) {
    sectionSelect.hidden = subState !== MenuStates.SELECT
    sectionConfirm.hidden = subState !== MenuStates.CONFIRM

    for (const el of rootEl.querySelectorAll('[data-action="select-character"]')) {
      const selected = el.dataset.id === selection.characterId
      el.classList.toggle('is-selected', selected)
      el.setAttribute('aria-pressed', String(selected))
    }
    for (const el of rootEl.querySelectorAll('[data-action="select-weapon"]')) {
      const selected = el.dataset.id === selection.weaponId
      el.classList.toggle('is-selected', selected)
      el.setAttribute('aria-pressed', String(selected))
    }

    const character = CHARACTERS.find((c) => c.id === selection.characterId)
    const weapon = WEAPONS.find((w) => w.id === selection.weaponId)
    const accent = CHARACTER_ACCENTS[character.id]
    confirmOrb.style.setProperty('--accent-from', accent.from)
    confirmOrb.style.setProperty('--accent-to', accent.to)
    confirmCharacter.textContent = character.name
    confirmWeapon.textContent = weapon.name
    confirmGlyph.innerHTML = WEAPON_GLYPHS[weapon.id]
    confirmAmmo.textContent = `MAG ${weapon.ammo.mag} · RES ${weapon.ammo.reserve}`
  }

  subscribe(syncUI)
  syncUI(getMenuState())

  // One delegated listener for every menu action.
  rootEl.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]')
    if (!target) return
    switch (target.dataset.action) {
      case 'select-character':
        selectCharacter(target.dataset.id)
        break
      case 'select-weapon':
        selectWeapon(target.dataset.id)
        break
      case 'confirm':
        confirmLoadout()
        playButton.focus()
        break
      case 'back':
        backToSelect()
        confirmButton.focus()
        break
      case 'play':
        // Contract: persist first, then emit the start intent with the ids.
        bus.emit(Events.UI_MATCH_START, persist())
        break
      default:
        break
    }
  })

  // Nice-to-have keyboard flow: arrows move focus through the visible cards,
  // Enter selects/starts (native button behavior), Esc backs out of confirm.
  rootEl.addEventListener('keydown', (event) => {
    if (getState() !== GameStates.MENU) return

    if (event.key === 'Escape' && getMenuState().subState === MenuStates.CONFIRM) {
      backToSelect()
      confirmButton.focus()
      return
    }

    const delta = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key]
    if (!delta) return

    const scope = getMenuState().subState === MenuStates.CONFIRM ? sectionConfirm : sectionSelect
    const focusables = [...scope.querySelectorAll('button')]
    const index = focusables.indexOf(document.activeElement)
    if (index === -1) return
    event.preventDefault()
    focusables[(index + delta + focusables.length) % focusables.length].focus()
  })

  // Visibility: menu surface shows only in the 'menu' state; on re-entry the
  // persisted selection is restored so a returning player sees their loadout.
  const sync = () => {
    const visible = getState() === GameStates.MENU
    rootEl.hidden = !visible
    if (visible) restore()
  }
  bus.on(Events.GAME_STATE, sync)
  sync()
}

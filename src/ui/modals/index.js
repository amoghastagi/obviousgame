/*
 * Fruit Shockers — MODALS surface (match summary).
 *
 * Contract with the shell (main.js):
 *   - exports init(rootEl): renders into the given mount and self-manages
 *     visibility by subscribing to `game:state` (visible in 'game_over' and
 *     'victory'). Export signature stays stable.
 *   - reads the match summary by subscribing to `match:end` on the bus
 *     { victory, summary: { kills, deaths, score, placement, accuracy,
 *     timeSurvivedSec } } — hudStore intentionally does not hold it.
 *   - UI → game intents only, never a direct gameState.transition():
 *     Retry emits `ui:match:start { characterId, weaponId }` (main.js owns
 *     the transition + match:start), Back-to-menu/Escape emit
 *     `ui:match:quit {}`.
 *
 * Behavior:
 *   - Two variants of one responsive modal: VICTORY (golden glass, trophy,
 *     "VICTORY!") and GAME OVER (splat red/pink glass, "SPLATTED!"), chosen
 *     by the `match:end` payload's `victory` flag.
 *   - Score is the hero number (count-up); Kills, Deaths, Placement,
 *     Accuracy and Time survived are staggered stat tiles. Recap chip shows
 *     the chosen character + weapon from loadSelection().
 *   - Focus: RETRY is focused on open, focus is restored on close, Tab is
 *     trapped inside the dialog, Escape returns to the menu.
 *   - Layout: centered panel on desktop, full-width bottom sheet on small
 *     screens. Honors prefers-reduced-motion (no choreography, instant values).
 */

import './modals.css'
import { bus, Events } from '../../core/eventBus.js'
import { getState, GameStates } from '../../core/gameState.js'
import { loadSelection } from '../../data/loadout.js'
import { animateValue, cancelAllAnimations } from './countUp.js'
import { formatClock, resolveLoadoutNames } from './format.js'

/** Local player + 5 bots in the current match rules (not in the payload). */
const MATCH_PARTICIPANTS = 6

const STAT_BASE_DELAY_MS = 260
const STAT_STAGGER_MS = 80
const COUNT_DURATION_MS = 900

const VICTORY_VARIANT = {
  key: 'victory',
  glyph: '🏆',
  glyphClass: '',
  kicker: 'Match complete',
  title: 'Victory!',
  titleClass: 'modal-title--victory',
  panelClass: 'modal-panel--victory',
  blurb: 'Sweet — the whole produce aisle bows to you.',
}

const GAME_OVER_VARIANT = {
  key: 'game-over',
  glyph: '💥',
  glyphClass: 'modal-glyph--splat',
  kicker: 'Match complete',
  title: 'Splatted!',
  titleClass: 'modal-title--splat',
  panelClass: 'modal-panel--splat',
  blurb: 'Pulp friction. The aisle claims another fruit.',
}

const summaryOf = (result) => ({
  kills: 0,
  deaths: 0,
  score: 0,
  placement: 0,
  accuracy: 0,
  timeSurvivedSec: 0,
  ...result?.summary,
})

const statTile = ({ label, field, index, span = '', prefix = '', suffix = '' }) => `
  <div class="modal-stat glass-chip px-3 py-2.5 text-left ${span}" style="--stagger-i: ${index}">
    <dt class="text-[10px] font-bold uppercase tracking-[0.12em] text-ink/50">${label}</dt>
    <dd class="mt-0.5 whitespace-nowrap font-display text-2xl font-extrabold tabular-nums">
      ${prefix}<span data-field="${field}">0</span>${suffix}
    </dd>
  </div>
`

const panelHtml = (variant, result) => {
  const summary = summaryOf(result)
  const { character, weapon } = resolveLoadoutNames(loadSelection())
  const tiles = [
    { label: 'Kills', field: 'kills', index: 1 },
    { label: 'Deaths', field: 'deaths', index: 2 },
    {
      label: 'Placed',
      field: 'placement',
      index: 3,
      prefix: '<span class="text-lg">#</span>',
      suffix: `<span class="block text-[10px] font-bold tracking-wide text-ink/50">of ${MATCH_PARTICIPANTS}</span>`,
    },
    { label: 'Accuracy', field: 'accuracy', index: 4, suffix: '<span class="text-base">%</span>' },
    {
      label: 'Survived',
      field: 'timeSurvivedSec',
      index: 5,
      span: 'col-span-2 sm:col-span-1',
    },
  ]

  return `
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      class="modal-panel glass-panel surface-interactive w-full max-h-[88dvh] overflow-y-auto
             rounded-t-3xl sm:rounded-3xl sm:max-w-lg ${variant.panelClass}"
    >
      <div class="px-5 pt-8 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center sm:px-10 sm:pt-10 sm:pb-9">
        <div
          class="modal-glyph ${variant.glyphClass} mx-auto flex h-16 w-16 items-center justify-center rounded-full
                 border-2 border-ink/85 bg-white/60 text-3xl shadow-[0_6px_0_rgba(58,46,57,0.85)]"
          aria-hidden="true"
        >${variant.glyph}</div>
        <p class="modal-kicker mt-4 text-[10px] font-bold uppercase tracking-[0.3em] sm:text-xs">${variant.kicker}</p>
        <h2 id="modal-title" class="display-title ${variant.titleClass} mt-2 text-5xl sm:text-6xl">${variant.title}</h2>
        <p class="mt-3 text-sm font-medium text-ink/70">${variant.blurb}</p>

        <div class="modal-stat glass-chip mt-6 px-6 py-3" style="--stagger-i: 0">
          <p class="text-[10px] font-bold uppercase tracking-[0.25em] text-ink/50">Score</p>
          <p class="modal-hero-value font-display text-5xl font-black tabular-nums sm:text-6xl" data-field="score">0</p>
        </div>

        <dl class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          ${tiles
            .map(
              ({ span, ...tile }) => `
                <div class="${span ?? ''} contents">
                  ${statTile(tile)}
                </div>`,
            )
            .join('')}
        </dl>

        <div class="glass-chip mx-auto mt-5 inline-flex items-center gap-2 text-xs font-semibold text-ink/70">
          <span class="text-[10px] font-bold uppercase tracking-[0.25em] text-ink/50">Loadout</span>
          <span>${character} · ${weapon}</span>
        </div>

        <div class="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            data-action="retry"
            class="btn-neon min-h-12 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neon-pink"
          >Retry</button>
          <button
            type="button"
            data-action="menu"
            class="btn-neon btn-neon--secondary min-h-12 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neon-pink"
          >Back to menu</button>
        </div>
        <p class="mt-4 text-[10px] font-semibold uppercase tracking-widest text-ink/40">
          Esc also returns to the menu
        </p>
      </div>
    </section>
  `
}

/** Kick off count-ups for every [data-field] value in the mounted panel. */
function runCountUps(backdrop, result) {
  const summary = summaryOf(result)
  backdrop.querySelectorAll('[data-field]').forEach((el, i) => {
    const field = el.dataset.field
    const format = field === 'timeSurvivedSec' ? formatClock : undefined
    animateValue(el, summary[field] ?? 0, {
      duration: COUNT_DURATION_MS,
      delay: STAT_BASE_DELAY_MS + i * STAT_STAGGER_MS,
      ...(format ? { format } : {}),
    })
  })
}

export function init(rootEl) {
  rootEl.innerHTML = `
    <div class="modal-backdrop surface-interactive flex h-full w-full items-end justify-center sm:items-center sm:p-6"></div>
  `
  const backdrop = rootEl.firstElementChild

  let lastResult = null
  let isOpen = false
  let previouslyFocused = null

  const render = (result) => {
    cancelAllAnimations()
    const variant = result.victory ? VICTORY_VARIANT : GAME_OVER_VARIANT
    backdrop.innerHTML = panelHtml(variant, result)
    runCountUps(backdrop, result)

    previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    backdrop.querySelector('[data-action="retry"]')?.focus({ preventScroll: true })
  }

  const close = () => {
    cancelAllAnimations()
    backdrop.innerHTML = ''
    isOpen = false
    const el = previouslyFocused
    previouslyFocused = null
    if (el && el.isConnected && !el.closest('[hidden]')) {
      el.focus({ preventScroll: true })
    }
  }

  const open = (result) => {
    render(result)
    isOpen = true
  }

  bus.on(Events.MATCH_END, (payload) => {
    // Tolerate malformed payloads — handlers must never throw (bus contract).
    if (!payload || typeof payload !== 'object' || typeof payload.summary !== 'object') return
    lastResult = payload
    if (isOpen) render(payload)
  })

  // Actions are intents on the bus; main.js owns transitions.
  backdrop.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action
    if (action === 'retry') bus.emit(Events.UI_MATCH_START, loadSelection())
    else if (action === 'menu') bus.emit(Events.UI_MATCH_QUIT, {})
  })

  const onKeyDown = (event) => {
    if (!isOpen) return
    if (event.key === 'Escape') {
      event.preventDefault()
      bus.emit(Events.UI_MATCH_QUIT, {})
      return
    }
    if (event.key === 'Tab') {
      // Minimal focus trap across the dialog's buttons.
      const focusables = [...backdrop.querySelectorAll('button:not([disabled])')]
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !backdrop.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }
  window.addEventListener('keydown', onKeyDown)

  // Visibility: show only in 'game_over' and 'victory'. Rendering the last
  // summary again on open covers match:end arriving before game:state (the
  // driver's order) as well as the reverse (e.g. HMR reload mid-session).
  const sync = () => {
    const state = getState()
    const visible = state === GameStates.GAME_OVER || state === GameStates.VICTORY
    // Unhide BEFORE opening: focus() is a no-op inside a display:none subtree,
    // and open() focuses the RETRY button.
    rootEl.hidden = !visible
    if (visible && !isOpen) {
      open(
        lastResult ?? {
          victory: state === GameStates.VICTORY,
          summary: {},
        },
      )
    } else if (!visible && isOpen) {
      close()
    }
  }
  bus.on(Events.GAME_STATE, sync)
  sync()
}

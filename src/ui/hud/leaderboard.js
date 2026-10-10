/*
 * Fruit Shockers — HUD leaderboard (top-right).
 *
 * Store-driven: reads { leaderboard: { entries } } from hudStore. Entries are
 * pre-sorted score-desc by the game (per the event contract) — this component
 * only renders them in the given order.
 *
 * Rows are persistent DOM nodes held at fixed slots; re-sorting re-aims each
 * row's translateY so rank changes glide instead of hard-snapping. The row
 * whose isLocal is true is highlighted. Collapsible via the header toggle —
 * defaults collapsed on small screens where the board would crowd the view.
 */

import { subscribe } from '../../core/hudStore.js'
import { characterColor } from './characterColors.js'
import { retrigger } from './retrigger.js'

const ROW_H = 30 // px — must match the 1.875rem row height in hud.css

const MARKUP = /* html */ `
  <div class="glass-panel hud-board overflow-hidden">
    <button type="button" aria-expanded="true"
      class="hud-board-toggle surface-interactive flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-2.5">
      <span class="text-[10px] font-bold uppercase tracking-[0.25em] text-ink/60">Leaderboard</span>
      <span class="hud-board-meta text-[11px] font-extrabold tabular-nums text-ink/70">—</span>
      <svg class="hud-board-chevron h-3.5 w-3.5 shrink-0 text-ink/50" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
        aria-hidden="true" focusable="false">
        <path d="m6 9 6 6 6-6"/>
      </svg>
    </button>
    <div class="hud-board-body">
      <div class="hud-board-head border-b border-ink/10 pb-1 text-[9px] font-bold uppercase tracking-[0.18em] text-ink/45">
        <span class="text-right">#</span>
        <span>Player</span>
        <span class="text-center">K</span>
        <span class="text-center">D</span>
        <span class="text-right">Score</span>
      </div>
      <div class="hud-board-rows" style="height: 0px"></div>
      <p class="hud-board-empty px-4 py-2 text-[11px] font-semibold text-ink/45" hidden>
        No standings yet
      </p>
    </div>
  </div>
`

const CELL = 'text-xs font-bold tabular-nums text-ink/80'

export function createLeaderboard(mountEl) {
  mountEl.innerHTML = MARKUP
  const board = mountEl.querySelector('.hud-board')
  const metaEl = mountEl.querySelector('.hud-board-meta')
  const rowsEl = mountEl.querySelector('.hud-board-rows')
  const emptyEl = mountEl.querySelector('.hud-board-empty')
  const toggleEl = mountEl.querySelector('.hud-board-toggle')

  const rowsById = new Map() // entry id -> row element
  const rankById = new Map() // entry id -> last rendered rank (1-based)

  // Collapse by default only on small screens, where the board crowds the view.
  let collapsed = window.matchMedia('(max-width: 640px)').matches
  const applyCollapsed = () => {
    board.classList.toggle('is-collapsed', collapsed)
    toggleEl.setAttribute('aria-expanded', String(!collapsed))
  }
  toggleEl.addEventListener('click', () => {
    collapsed = !collapsed
    applyCollapsed()
  })
  applyCollapsed()

  function buildRow() {
    const row = document.createElement('div')
    row.className = 'hud-board-row'
    row.innerHTML = `
      <span class="hud-board-rank text-xs font-extrabold tabular-nums text-ink/60"></span>
      <span class="flex min-w-0 items-center gap-1.5">
        <span class="hud-char-dot shrink-0"></span>
        <span class="hud-board-name truncate text-xs font-bold text-ink/85"></span>
      </span>
      <span class="hud-board-kills ${CELL} text-center"></span>
      <span class="hud-board-deaths ${CELL} text-center"></span>
      <span class="hud-board-score ${CELL} text-right"></span>
    `
    return row
  }

  function refreshRow(row, entry, index) {
    const rank = index + 1

    row.style.transform = `translateY(${index * ROW_H}px)`
    row.classList.toggle('is-local', entry.isLocal === true)

    row.querySelector('.hud-board-rank').textContent = String(rank)
    row.querySelector('.hud-char-dot').style.background = characterColor(entry.character)
    row.querySelector('.hud-board-name').textContent = entry.name
    row.querySelector('.hud-board-kills').textContent = String(entry.kills)
    row.querySelector('.hud-board-deaths').textContent = String(entry.deaths)
    row.querySelector('.hud-board-score').textContent = String(entry.score)

    if (rankById.get(entry.id) !== rank) {
      rankById.set(entry.id, rank)
      retrigger(row.querySelector('.hud-board-rank'), 'is-bump')
    }
  }

  const render = ({ leaderboard }) => {
    const entries = leaderboard.entries

    rowsEl.style.height = `${entries.length * ROW_H}px`
    emptyEl.hidden = entries.length > 0
    const local = entries.find((e) => e.isLocal)
    metaEl.textContent = local ? `#${entries.indexOf(local) + 1} · ${local.score}` : '—'

    const seen = new Set()
    entries.forEach((entry, index) => {
      seen.add(entry.id)
      let row = rowsById.get(entry.id)
      if (!row) {
        row = buildRow()
        rowsById.set(entry.id, row)
        rowsEl.appendChild(row)
      }
      refreshRow(row, entry, index)
    })
    for (const [id, row] of rowsById) {
      if (!seen.has(id)) {
        row.remove()
        rowsById.delete(id)
        rankById.delete(id)
      }
    }
  }

  subscribe(render)
}

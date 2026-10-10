/*
 * Fruit Shockers — HUD surface (stub).
 *
 * Contract with the shell (main.js):
 *   - exports init(rootEl): renders into the given mount and self-manages
 *     visibility by subscribing to `game:state` (visible in 'playing' and
 *     'paused'). Export signature must stay stable — the real HUD replaces
 *     this file's body, not its shape.
 *   - reads game state through hudStore (health/ammo/weapon/leaderboard);
 *     high-frequency signals (crosshair, hit confirm) go via the bus directly.
 *
 * This stub is a minimal live readout — it exists so event flow is verifiable
 * before the real HUD lands, not a design reference.
 */

import { bus, Events } from '../../core/eventBus.js'
import { getState, GameStates } from '../../core/gameState.js'
import { subscribe } from '../../core/hudStore.js'

export function init(rootEl) {
  rootEl.innerHTML = /* html */ `
    <div class="flex h-full w-full flex-col justify-between p-4">
      <div class="flex justify-between gap-4">
        <div class="glass-chip surface-interactive">
          <p class="text-[10px] font-bold uppercase tracking-[0.25em] text-ink/50">Weapon</p>
          <p id="stub-weapon" class="font-display text-sm font-extrabold uppercase tracking-wide">—</p>
        </div>
        <div class="glass-chip text-center">
          <p class="text-[10px] font-bold uppercase tracking-[0.25em] text-ink/50">HUD stub</p>
          <p class="text-xs font-semibold text-ink/70">real HUD lands next</p>
        </div>
        <div class="glass-chip min-w-56 text-right">
          <p class="text-[10px] font-bold uppercase tracking-[0.25em] text-ink/50">Leaderboard</p>
          <ol id="stub-board" class="mt-1 space-y-0.5 text-xs font-semibold tabular-nums"></ol>
        </div>
      </div>
      <div class="flex items-end justify-between gap-4">
        <div class="glass-chip w-64">
          <p class="text-[10px] font-bold uppercase tracking-[0.25em] text-ink/50">Health</p>
          <div class="stat-bar mt-1" id="stub-health-bar"></div>
          <p id="stub-health" class="mt-1 text-xs font-bold tabular-nums">100 / 100</p>
        </div>
        <div class="glass-chip text-right">
          <p class="text-[10px] font-bold uppercase tracking-[0.25em] text-ink/50">Ammo</p>
          <p id="stub-ammo" class="font-display text-lg font-extrabold tabular-nums">—</p>
        </div>
      </div>
    </div>
  `

  const weaponEl = rootEl.querySelector('#stub-weapon')
  const healthEl = rootEl.querySelector('#stub-health')
  const healthBar = rootEl.querySelector('#stub-health-bar')
  const ammoEl = rootEl.querySelector('#stub-ammo')
  const boardEl = rootEl.querySelector('#stub-board')

  const render = (snap) => {
    weaponEl.textContent = snap.weapon ? snap.weapon.name : '—'
    healthEl.textContent = `${Math.round(snap.health.current)} / ${snap.health.max}`
    healthBar.style.setProperty('--stat-value', String(Math.round((snap.health.current / snap.health.max) * 5)))
    healthBar.style.setProperty('--stat-from', snap.health.current <= 30 ? 'var(--color-strawberry)' : 'var(--color-neon-lime)')
    healthBar.style.setProperty('--stat-to', snap.health.current <= 30 ? 'var(--color-strawberry-deep)' : 'var(--color-neon-cyan)')
    ammoEl.textContent = snap.ammo.reloading
      ? 'reloading…'
      : `${snap.ammo.mag} / ${snap.ammo.reserve}`
    boardEl.innerHTML = snap.leaderboard.entries
      .slice(0, 3)
      .map((e, i) => {
        const me = e.isLocal ? 'text-neon-pink' : 'text-ink/80'
        return `<li class="${me}">${i + 1}. ${e.name} — ${e.score}</li>`
      })
      .join('')
  }

  const unsubscribe = subscribe(render)

  // Visibility: HUD shows in 'playing' and 'paused' (stays up under the pause overlay).
  const sync = () => {
    const s = getState()
    rootEl.hidden = s !== GameStates.PLAYING && s !== GameStates.PAUSED
  }
  bus.on(Events.GAME_STATE, sync)
  sync()
}

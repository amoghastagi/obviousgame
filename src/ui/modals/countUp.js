/*
 * Fruit Shockers — MODALS count-up animator.
 *
 * rAF-driven easing counter for summary stat tiles. Tracks every active
 * animation so re-renders and close can cancel stale frames instead of
 * leaking timers that write into detached DOM.
 */

const active = new Set()

/** Cancel every running count-up. Called on re-render and on close. */
export function cancelAllAnimations() {
  for (const raf of active) cancelAnimationFrame(raf)
  active.clear()
}

/**
 * Animate `el.textContent` from 0 to `target` with an ease-out curve.
 * `format` receives the fractional current value (round inside it).
 * Honors prefers-reduced-motion by landing the final value immediately.
 * Returns a cancel function.
 */
export function animateValue(el, target, { duration = 900, delay = 0, format = (v) => `${Math.round(v)}` } = {}) {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduced || duration <= 0) {
    el.textContent = format(target)
    return () => {}
  }

  let raf
  const startAt = performance.now() + delay
  const step = (now) => {
    active.delete(raf)
    const t = Math.min(1, Math.max(0, (now - startAt) / duration))
    const eased = 1 - (1 - t) ** 3
    el.textContent = format(target * eased)
    if (t < 1) {
      raf = requestAnimationFrame(step)
      active.add(raf)
    }
  }
  raf = requestAnimationFrame(step)
  active.add(raf)
  return () => cancelAnimationFrame(raf)
}

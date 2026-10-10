/**
 * Restart a CSS animation by re-adding its trigger class.
 * Removing the class, forcing a reflow, then re-adding makes the animation
 * run again even when the previous run is still in flight — used for the
 * vignette flash, hitmarkers, weapon swaps, and rank bumps.
 */
export function retrigger(el, className) {
  el.classList.remove(className)
  void el.offsetWidth
  el.classList.add(className)
}

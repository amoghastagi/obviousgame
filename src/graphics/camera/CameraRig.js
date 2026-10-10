// CameraRig — first-person / third-person camera tracking for Fruit Shockers.
//
// Owns pointer-lock mouse look, an exponential yaw/pitch smoothing shared by
// both modes (movement never snaps), an eye-height FPS attach, and a
// spring-damped TPS follow orbit with a cheap floor clamp. The movement agent
// can read getYaw()/getForward()/getRight() to drive WASD.

import * as THREE from 'three'
import { getState, GameStates } from '../../core/gameState.js'

const UP = new THREE.Vector3(0, 1, 0)
const PITCH_LIMIT = THREE.MathUtils.degToRad(85)
const FLOOR_MIN_Y = 0.4 // cheap TPS floor clamp; real arena collision comes later
const LOOK_SMOOTHING = 16 // exp rate for raw look input -> smoothed yaw/pitch
const FOLLOW_RATE = 8 // exp spring rate for the TPS position follow
const LOOK_AT_RATE = 10 // exp rate for the smoothed TPS look-at point
const MAX_DT = 0.1 // clamp huge frames (tab refocus) so smoothing never snaps

/**
 * @param {number} sensitivity - radians of look per pointer pixel
 * @param {number} eyeHeight   - FPS camera height above the target origin
 * @param {number} distance    - TPS orbit distance behind the target
 * @param {'fps'|'tps'} mode   - starting mode
 */
export class CameraRig {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {HTMLElement} domElement - element that receives click-to-lock
   * @param {{ sensitivity?: number, eyeHeight?: number, distance?: number, mode?: 'fps'|'tps' }} [opts]
   */
  constructor(camera, domElement, opts = {}) {
    const o = { sensitivity: 0.0022, eyeHeight: 1.6, distance: 4.5, mode: 'fps', ...opts }
    this.camera = camera
    this.sensitivity = o.sensitivity
    this.eyeHeight = o.eyeHeight
    this.distance = o.distance
    this.mode = o.mode === 'tps' ? 'tps' : 'fps'

    this._domElement = domElement
    this._target = null
    this._pointerLocked = false

    /**
     * Optional callback invoked with 'fps' | 'tps' whenever the mode actually
     * changes — the controller hides the avatar body in FPS, shows it in TPS.
     * @type {((mode: 'fps' | 'tps') => void) | null}
     */
    this.onModeChange = null

    // Raw look input (radians) and its exponentially smoothed shadow. Both
    // modes consume the smoothed pair so toggling never jumps the view.
    this._yaw = 0
    this._pitch = 0
    this._yawSmooth = 0
    this._pitchSmooth = 0

    // Per-frame scratch vectors — no allocations inside the update loop.
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ')
    this._desired = new THREE.Vector3()
    this._orbitOffset = new THREE.Vector3(0, this.distance * 0.5, this.distance)
    this._lookGoal = new THREE.Vector3()
    this._smoothedLook = new THREE.Vector3()
    this._lookSeeded = false

    // Listeners are kept as fields so dispose() removes the exact same refs.
    this._onClick = () => {
      // Look input is a playing-state feature: gate pointer lock on the FSM so
      // clicks in attract mode (menu over the live arena) never lock the cursor.
      // Both modes lock — TPS orbits the camera from the same smoothed look.
      if (this._pointerLocked || getState() !== GameStates.PLAYING) return
      const req = this._domElement.requestPointerLock()
      // Rejects on the browser's Esc-relock cooldown; pointerlockchange stays
      // the source of truth, so the rejection carries no actionable error.
      if (req && typeof req.catch === 'function') req.catch(() => {})
    }
    this._onPointerLockChange = () => {
      this._pointerLocked = document.pointerLockElement === this._domElement
    }
    this._onMouseMove = (e) => {
      if (this._pointerLocked) this.applyLook(e.movementX, e.movementY)
    }
    this._onKeyDown = (e) => {
      if (e.code === 'KeyV') this.toggleMode()
    }

    domElement.addEventListener('click', this._onClick)
    document.addEventListener('pointerlockchange', this._onPointerLockChange)
    document.addEventListener('mousemove', this._onMouseMove)
    document.addEventListener('keydown', this._onKeyDown)
  }

  /** Attach the tracked character group; its origin must sit at ground level. */
  setTarget(object3D) {
    this._target = object3D
  }

  /**
   * Per-character FPS eye height above the target origin — wire the fruit's
   * `userData.eyeHeight` here. Also lifts the TPS look-at point, so orbiting
   * heads toward the character's eyes rather than a flat 1.6 default.
   */
  setEyeHeight(height) {
    this.eyeHeight = height
  }

  /** Feed raw pointer deltas in pixels; sensitivity is applied here. */
  applyLook(dx, dy) {
    this._yaw -= dx * this.sensitivity
    this._pitch = THREE.MathUtils.clamp(this._pitch - dy * this.sensitivity, -PITCH_LIMIT, PITCH_LIMIT)
  }

  /** @param {'fps'|'tps'} mode */
  setMode(mode) {
    const next = mode === 'tps' ? 'tps' : 'fps'
    if (next === this.mode) return
    this.mode = next
    if (typeof this.onModeChange === 'function') this.onModeChange(next)
  }

  toggleMode() {
    this.setMode(this.mode === 'fps' ? 'tps' : 'fps')
  }

  /** Smoothed yaw in radians (matches what is on screen). */
  getYaw() {
    return this._yawSmooth
  }

  /** Horizontal forward basis from the smoothed yaw; pass `out` to reuse. */
  getForward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this._yawSmooth), 0, -Math.cos(this._yawSmooth))
  }

  /** Horizontal right basis from the smoothed yaw; pass `out` to reuse. */
  getRight(out = new THREE.Vector3()) {
    return out.set(Math.cos(this._yawSmooth), 0, -Math.sin(this._yawSmooth))
  }

  /** Advance the rig by `dt` seconds; call once per frame after moving the target. */
  update(dt) {
    if (!this._target) return
    const dtc = THREE.MathUtils.clamp(dt, 0, MAX_DT)
    this._smoothLookInput(dtc)

    if (this.mode === 'fps') {
      const t = this._target.position
      this.camera.position.set(t.x, t.y + this.eyeHeight, t.z)
      this.camera.quaternion.setFromEuler(this._euler.set(this._pitchSmooth, this._yawSmooth, 0))
      return
    }

    // TPS: orbit behind/above the target at the smoothed yaw, spring-damped.
    this._desired.copy(this._orbitOffset).applyAxisAngle(UP, this._yawSmooth).add(this._target.position)
    this._lookGoal.copy(this._target.position)
    this._lookGoal.y += this.eyeHeight + 0.3
    if (!this._lookSeeded) {
      this._lookSeeded = true
      this._smoothedLook.copy(this._lookGoal)
    }
    this.camera.position.lerp(this._desired, 1 - Math.exp(-FOLLOW_RATE * dtc))
    this._smoothedLook.lerp(this._lookGoal, 1 - Math.exp(-LOOK_AT_RATE * dtc))
    if (this.camera.position.y < FLOOR_MIN_Y) this.camera.position.y = FLOOR_MIN_Y
    this.camera.lookAt(this._smoothedLook)
  }

  _smoothLookInput(dt) {
    const k = 1 - Math.exp(-LOOK_SMOOTHING * dt)
    this._yawSmooth += (this._yaw - this._yawSmooth) * k
    this._pitchSmooth += (this._pitch - this._pitchSmooth) * k
  }

  /** Remove every listener and release pointer lock if we still hold it. */
  dispose() {
    this._domElement.removeEventListener('click', this._onClick)
    document.removeEventListener('pointerlockchange', this._onPointerLockChange)
    document.removeEventListener('mousemove', this._onMouseMove)
    document.removeEventListener('keydown', this._onKeyDown)
    if (document.pointerLockElement === this._domElement) document.exitPointerLock()
  }
}

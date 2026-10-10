// src/game/physics.js — Agent C player controller: WASD movement, jump,
// pointer-lock mouse-look, and AABB collision against env.world.colliders.
//
// Owns env.state.player.pos (aliased to the first-person camera) and .vel.
// pos is the EYE position: the body AABB spans from the feet (pos.y - 1.7)
// up 1.8 m, with 0.3 m half-extents on X/Z. Movement is resolved one axis at
// a time (X, then Z, then Y) so the player slides along walls instead of
// sticking, lands on top of obstacle boxes, and never clips through them.
import * as THREE from 'three'
import { PALETTE } from '../graphics/palette.js'
import { addSolid } from './env.js'

const EYE_HEIGHT = 1.7 // camera rides this high above the feet
const BODY_HEIGHT = 1.8 // feet → head
const BODY_HALF = 0.3 // AABB half-extent on X/Z
const MOVE_SPEED = 6 // target ground speed, m/s
const GROUND_ACCEL = 10 // how fast horizontal velocity approaches target (1/s)
const AIR_ACCEL = 2.5 // limited air steering (1/s)
const JUMP_SPEED = 7 // initial upward velocity, m/s
const GRAVITY = 20 // m/s²
const MAX_FALL = 60 // terminal velocity, m/s
const PITCH_LIMIT = (89 * Math.PI) / 180
const MOUSE_SENS = 0.002 // rad per pixel of movementX/Y
const SKIN = 0.001 // keeps the AABB off surfaces it rests on (prevents re-hit)

// Verification prop for the placeholder arena: its lowest obstacle top is
// 3 m, out of reach of the spec'd jump (apex ≈ 1.225 m). This low step crate
// makes "jump onto a box and stand on it" testable until the real arena from
// the graphics lane lands. Registered through the same addSolid() path as
// every other obstacle so it collides and raycasts like one.
function addStepCrate(env) {
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.9, 1.6),
    new THREE.MeshLambertMaterial({ color: PALETTE.cardboard })
  )
  crate.position.set(2.2, 0.45, 5.0) // top surface at 0.9 m — jumpable
  crate.castShadow = crate.receiveShadow = true
  addSolid(env, crate)
}

export function createPlayerController(env) {
  const { camera, renderer, world, state, spawnPoint } = env
  const player = state.player
  const pos = player.pos // aliases camera.position
  const vel = player.vel
  const dom = renderer.domElement

  // Look state, seeded from whatever orientation the harness left the camera
  // in. YXZ order = yaw around the world up, then pitch — no roll drift.
  camera.rotation.order = 'YXZ'
  let yaw = camera.rotation.y
  let pitch = camera.rotation.x
  let grounded = true // the contract's spawnPoint rests on the floor, so jump works from frame one

  // --- input ---------------------------------------------------------------
  const keys = new Set()
  const onKeyDown = (e) => {
    keys.add(e.code)
    if (e.code === 'Space') e.preventDefault() // keep the page from scrolling
  }
  const onKeyUp = (e) => keys.delete(e.code)
  const clearKeys = () => keys.clear()
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', clearKeys)

  dom.addEventListener('click', () => {
    try {
      const p = dom.requestPointerLock()
      // Chrome rejects re-locks within ~1s of an Escape exit; stay silent.
      if (p && typeof p.catch === 'function') p.catch(() => {})
    } catch {
      /* pointer lock unavailable — mouse-look just stays off */
    }
  })

  const onMouseMove = (e) => {
    if (document.pointerLockElement !== dom) return
    yaw -= e.movementX * MOUSE_SENS
    pitch -= e.movementY * MOUSE_SENS
    pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch))
  }
  const onPointerLockChange = () => {
    if (document.pointerLockElement !== dom) clearKeys() // no stuck keys on Escape
  }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('pointerlockchange', onPointerLockChange)

  // --- collision -------------------------------------------------------------
  const bodyBox = new THREE.Box3()
  const setBodyBox = () => {
    bodyBox.min.set(pos.x - BODY_HALF, pos.y - EYE_HEIGHT, pos.z - BODY_HALF)
    bodyBox.max.set(pos.x + BODY_HALF, pos.y - EYE_HEIGHT + BODY_HEIGHT, pos.z + BODY_HALF)
  }

  // Move along one axis, then push out of any collider overlapped on that
  // axis. Zeroing the axis velocity on contact is what produces wall-slide.
  //
  // A collider only blocks axis A when the body overlaps it with real depth
  // (beyond mere touching) on the other two axes — otherwise resting exactly
  // on a surface counts as touching its side face and the resolver shoves the
  // player sideways (e.g. along the floor box's edge, out of the world).
  const touchesBeyondSkin = (collider, axis) => {
    for (const a of ['x', 'y', 'z']) {
      if (a === axis) continue
      if (bodyBox.min[a] >= collider.max[a] - SKIN) return false
      if (bodyBox.max[a] <= collider.min[a] + SKIN) return false
    }
    return true
  }
  const moveAxis = (axis, delta) => {
    if (delta === 0) return
    pos[axis] += delta
    setBodyBox()
    for (const collider of world.colliders) {
      if (!bodyBox.intersectsBox(collider) || !touchesBeyondSkin(collider, axis)) continue
      if (axis === 'y') {
        if (delta < 0) {
          pos.y = collider.max.y + EYE_HEIGHT + SKIN // landed on top
          grounded = true
        } else {
          pos.y = collider.min.y - (BODY_HEIGHT - EYE_HEIGHT) - SKIN // head bump
        }
        vel.y = 0
      } else {
        pos[axis] =
          delta > 0 ? collider.min[axis] - BODY_HALF - SKIN : collider.max[axis] + BODY_HALF + SKIN
        vel[axis] = 0
      }
      setBodyBox()
    }
  }

  // --- API -------------------------------------------------------------------
  function update(dt) {
    if (!player.alive || !Number.isFinite(dt) || dt <= 0) return

    camera.rotation.set(pitch, yaw, 0)

    // Wish direction from keys, relative to yaw (forward = camera's -Z).
    const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0)
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0)
    let wishX = 0
    let wishZ = 0
    if (fwd !== 0 || strafe !== 0) {
      const inv = 1 / Math.hypot(fwd, strafe) // no diagonal speed boost
      const sin = Math.sin(yaw)
      const cos = Math.cos(yaw)
      wishX = (fwd * -sin + strafe * cos) * inv
      wishZ = (fwd * -cos + strafe * -sin) * inv
    }

    // Smooth acceleration toward the target velocity; the same blend decays
    // velocity back to zero as friction when no key is held.
    const accel = grounded ? GROUND_ACCEL : AIR_ACCEL
    const blend = 1 - Math.exp(-accel * dt)
    vel.x += (wishX * MOVE_SPEED - vel.x) * blend
    vel.z += (wishZ * MOVE_SPEED - vel.z) * blend

    if (keys.has('Space') && grounded) {
      vel.y = JUMP_SPEED
      grounded = false
    }
    vel.y = Math.max(vel.y - GRAVITY * dt, -MAX_FALL)

    moveAxis('x', vel.x * dt)
    moveAxis('z', vel.z * dt)
    grounded = false // re-confirmed by the Y resolve every frame we rest on something
    moveAxis('y', vel.y * dt)

    // Keep the whole body inside the arena bounds.
    pos.x = THREE.MathUtils.clamp(pos.x, world.bounds.minX + BODY_HALF, world.bounds.maxX - BODY_HALF)
    pos.z = THREE.MathUtils.clamp(pos.z, world.bounds.minZ + BODY_HALF, world.bounds.maxZ - BODY_HALF)

    if (pos.y - EYE_HEIGHT < -10) respawn() // defensive net: fell out of the world
  }

  function respawn() {
    vel.set(0, 0, 0)
    pos.copy(spawnPoint)
    grounded = true // spawnPoint rests on the floor
    player.alive = true // an explicit respawn implies a live player; death stays the bots lane's call
  }

  addStepCrate(env)

  return { update, respawn }
}

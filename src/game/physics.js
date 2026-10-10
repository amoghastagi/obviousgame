// src/game/physics.js — player controller: WASD movement, jump, and AABB
// collision against env.world.colliders.
//
// Look input lives entirely in the CameraRig — the ONE look owner. This
// controller only READS the rig (rig.getYaw()) for the wish direction and
// never touches the camera, the pointer, or mouse events.
//
// Owns env.state.player.pos (aliased by env.js to the avatar mesh's position)
// and .vel. pos is FEET-anchored: pos.y is the feet at ground level, the body
// AABB spans pos.y → pos.y + BODY_HEIGHT, with 0.3 m half-extents on X/Z.
// Movement, respawns, and the TPS orbit all move the visible body.
// Movement is resolved one axis at a time (X, then Z, then Y) so the player
// slides along walls instead of sticking, lands on top of obstacle boxes, and
// never clips through them.
//
// update() takes an `enabled` flag: the GameHost passes `getState() ===
// 'playing'` every frame so the simulation freezes outside play (Esc pause)
// while the renderer keeps drawing the frozen scene.
import * as THREE from 'three'

const BODY_HEIGHT = 1.8 // feet → head (pos.y IS the feet)
const BODY_HALF = 0.3 // AABB half-extent on X/Z
const MOVE_SPEED = 6 // target ground speed, m/s
const GROUND_ACCEL = 10 // how fast horizontal velocity approaches target (1/s)
const AIR_ACCEL = 2.5 // limited air steering (1/s)
const JUMP_SPEED = 7 // initial upward velocity, m/s
const GRAVITY = 20 // m/s²
const MAX_FALL = 60 // terminal velocity, m/s
const SKIN = 0.001 // keeps the AABB off surfaces it rests on (prevents re-hit)

export function createPlayerController(env, { rig, avatar, moveSpeed = MOVE_SPEED } = {}) {
  const { world, state, spawnPoint } = env
  const player = state.player
  let pos = player.pos // ALIASES avatar.position (feet at ground level)
  const vel = player.vel

  let grounded = true // the contract's spawnPoint rests on the floor, so jump works from frame one

  // Body visibility follows the rig mode — FPS is headless (the camera IS the
  // eyes), TPS shows the fruit and orbits it. The hook fires on V presses even
  // while the sim is frozen; the per-frame assert below re-asserts the same
  // rule on every enabled frame (covers entering play without a mode change).
  rig.onModeChange = (mode) => {
    avatar.visible = mode === 'tps'
  }

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

  // --- collision -------------------------------------------------------------
  const bodyBox = new THREE.Box3()
  const setBodyBox = () => {
    bodyBox.min.set(pos.x - BODY_HALF, pos.y, pos.z - BODY_HALF)
    bodyBox.max.set(pos.x + BODY_HALF, pos.y + BODY_HEIGHT, pos.z + BODY_HALF)
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
          pos.y = collider.max.y + SKIN // landed on top
          grounded = true
        } else {
          pos.y = collider.min.y - BODY_HEIGHT - SKIN // head bump
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
  function update(dt, { enabled = true } = {}) {
    if (!enabled || !player.alive || !Number.isFinite(dt) || dt <= 0) return

    avatar.visible = rig.mode === 'tps' // FPS hides the body; TPS shows it

    // Wish direction from keys, relative to the rig's yaw (forward = -Z).
    const yaw = rig.getYaw()
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
    vel.x += (wishX * moveSpeed - vel.x) * blend
    vel.z += (wishZ * moveSpeed - vel.z) * blend

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

    if (pos.y < -10) respawn() // defensive net: fell out of the world
  }

  function respawn() {
    vel.set(0, 0, 0)
    pos.copy(spawnPoint)
    grounded = true // spawnPoint rests on the floor
    player.alive = true // an explicit respawn implies a live player; death stays the bots lane's call
  }

  // Selection swaps rebind the anchored avatar: the host points
  // env.state.player.pos at the new mesh, then calls this so the controller's
  // alias, visibility assert, and catalog speed follow the swap.
  function setAvatar(nextAvatar, nextMoveSpeed) {
    avatar = nextAvatar
    if (nextMoveSpeed !== undefined) moveSpeed = nextMoveSpeed
    pos = player.pos // re-alias — env.state.player.pos was re-pointed
    avatar.visible = rig.mode === 'tps'
  }

  return {
    update,
    respawn,
    setAvatar,
    dispose() {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', clearKeys)
    },
  }
}

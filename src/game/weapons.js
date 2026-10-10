// src/game/weapons.js — the player's hitscan weapon, driven by the loadout catalog.
//
// Every combat param derives from a WEAPONS[i] entry (data/loadout.js) via the
// integration spec's mappings:
//   damage = 5 × stats.damage · fire cooldown = 0.6 / stats.fireRate s ·
//   raycast range = 30 × stats.range m · mag/reserve straight from weapon.ammo.
//
// The pure ammo model (ammo.js) owns mag/reserve/reload — manual R, auto-reload
// on empty, dt-driven so the Esc pause freezes it for free — and every state
// change emits ammo:update {mag, reserve, reloading}.
//
// The raycast decides damage; the tracer merely conveys the shot. A target is
// only damaged when no static collider sits between the camera and it (no
// shooting through walls). Bot damage flows through env.hooks.hitBot (the bots
// module's rules); the killed flag for hit:confirm is read back from the bot
// record in env.state.bots — real engine damage, nothing simulated. The local
// player's own avatar meshes are excluded from target raycasts: aim is
// camera-through-crosshair, so in TPS the ray leaves the orbit camera and must
// never hit the body it follows.
//
// Emits (existing contract, src/core/eventBus.js — no new event names):
//   weapon:change {id, name}            on equip (match start / retry)
//   ammo:update {mag, reserve, reloading} — from the ammo model
//   crosshair:update {spreadPx}         per frame while it changes (4–40 px)
//   hit:confirm {killed}                on a real target hit, kill or not
// Shots and hits are counted here; the match director's accuracy number
// consumes them via shotStats().
import { PALETTE } from '../graphics/palette.js'
import { bus, Events } from '../core/eventBus.js'
import { getState, GameStates } from '../core/gameState.js'
import { createAmmoModel, spreadPx } from './ammo.js'

// Spec mapping ("Match rules and stats"): the catalog's 1–5 stats scale into
// combat params. Exported pure — the unit suite derives all three weapons.
export function weaponParams(weapon) {
  return {
    damage: 5 * weapon.stats.damage,
    cooldown: 0.6 / weapon.stats.fireRate, // seconds between shots; holding auto-fires
    range: 30 * weapon.stats.range, // meters the ray and tracer reach
  }
}

const TRACER_LIFE = 0.08
const FLASH_LIFE = 0.12
const SPREAD_BASE_PX = 6 // spec: stationary base
const SPREAD_MOVE_PX = 8 // spec: +8 while moving
const BLOOM_PER_SHOT_PX = 6 // spike per fired shot (mock spiked +5–12)
const BLOOM_DECAY_PX_S = 12 // bloom bleeds off per second of update
const BLOOM_MAX_PX = 30 // bloom alone saturates below the 40 px ceiling
const MOVING_SPEED_EPS = 0.5 // m/s of horizontal velocity that counts as moving
const FALLBACK_EYE_HEIGHT = 1.6 // when an avatar carries no userData.eyeHeight

export function createWeaponSystem(env, { weapon, avatar, rig }) {
  const { THREE, camera, scene, world, hooks } = env
  const canvas = env.renderer.domElement
  const crosshair = new THREE.Vector2(0, 0)
  // Camera-space muzzle offset (right, down, forward) so the FPS tracer reads
  // as fired from a gun rather than out of the pupil.
  const muzzleOffset = new THREE.Vector3(0.12, -0.14, -0.35)
  const raycaster = new THREE.Raycaster()

  let params = weaponParams(weapon)
  let ammo = createAmmoModel(weapon, emitAmmo)
  let cooldown = 0
  let firing = false
  let bloom = 0
  let lastSpreadPx = null
  let shots = 0
  let hits = 0
  raycaster.far = params.range

  // The ammo model's emission callback — every mag/reserve/reload state
  // change goes straight onto the contract bus.
  function emitAmmo(payload) {
    bus.emit(Events.AMMO_UPDATE, payload)
  }

  // Own-avatar exclusion set: the avatar's meshes are never legitimate
  // targets, wherever they appear in world.targets.
  const ownMeshes = new Set()
  let avatarRoot = avatar
  function setAvatar(nextAvatar) {
    ownMeshes.clear()
    nextAvatar.traverse((obj) => ownMeshes.add(obj))
    avatarRoot = nextAvatar
  }
  setAvatar(avatar)

  // --- effect bookkeeping --------------------------------------------------

  const effects = []

  function addEffect(mesh, life, tick, onEnd) {
    scene.add(mesh)
    effects.push({ mesh, life, age: 0, tick, onEnd })
  }

  function stepEffects(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const fx = effects[i]
      fx.age += dt
      if (fx.age >= fx.life) {
        scene.remove(fx.mesh)
        fx.onEnd?.()
        effects.splice(i, 1)
      } else {
        fx.tick(fx.age / fx.life)
      }
    }
  }

  function glowMaterial(color) {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  }

  // Stretched thin box from muzzle to impact, fading fast.
  function spawnTracer(start, end) {
    const material = glowMaterial(PALETTE.neonLime)
    const mesh = new THREE.Mesh(tracerGeometry, material)
    mesh.position.copy(start).add(end).multiplyScalar(0.5)
    mesh.lookAt(end)
    mesh.scale.z = start.distanceTo(end)
    addEffect(mesh, TRACER_LIFE, (t) => (material.opacity = 1 - t), () => material.dispose())
  }

  // Small expanding splash where the shot landed.
  function spawnFlash(point) {
    const material = glowMaterial(PALETTE.neonPink)
    const mesh = new THREE.Mesh(flashGeometry, material)
    mesh.position.copy(point)
    addEffect(
      mesh,
      FLASH_LIFE,
      (t) => {
        material.opacity = 1 - t
        mesh.scale.setScalar(1 + t * 2)
      },
      () => material.dispose(),
    )
  }

  // Shared geometries; each effect clones its material so opacity can fade
  // independently, and disposes it when the effect ends.
  const tracerGeometry = new THREE.BoxGeometry(0.03, 0.03, 1)
  const flashGeometry = new THREE.SphereGeometry(0.07, 8, 8)

  // --- shot ----------------------------------------------------------------

  // Where the tracer starts. FPS: the camera-space muzzle. TPS: the avatar's
  // eye — the orbit camera is not the body, so the beam should leave the
  // fruit's head rather than the lens.
  function tracerOrigin() {
    if (rig.mode === 'tps') {
      const eye = avatarRoot.userData?.eyeHeight ?? FALLBACK_EYE_HEIGHT
      return new THREE.Vector3(avatarRoot.position.x, avatarRoot.position.y + eye, avatarRoot.position.z)
    }
    return muzzleOffset.clone().applyQuaternion(camera.quaternion).add(camera.position)
  }

  // Closest static collider the ray crosses. The returned point is the wall
  // face, or the ray at max range when the shot reaches open air.
  function nearestWall(ray) {
    const probe = new THREE.Vector3()
    const point = new THREE.Vector3()
    let distance = Infinity
    for (const box of world.colliders) {
      if (!ray.intersectBox(box, probe)) continue
      const d = probe.distanceTo(ray.origin)
      if (d < distance) {
        distance = d
        point.copy(probe)
      }
    }
    if (distance === Infinity) ray.at(params.range, point)
    return { distance, point }
  }

  // Ray-vs-world for one shot: the target only survives the wall check. The
  // local player's own meshes are filtered out of the target list first.
  function resolveImpact() {
    const wall = nearestWall(raycaster.ray)
    const targets = world.targets.filter((mesh) => !ownMeshes.has(mesh))
    const hit = raycaster.intersectObjects(targets, false)[0]
    const onTarget = hit !== undefined && hit.distance < wall.distance
    return { onTarget, hit, end: onTarget ? hit.point.clone() : wall.point }
  }

  // The bots module stamps and registers every avatar mesh and keeps records
  // in env.state.bots; hit.object is exactly a registered mesh (non-recursive
  // raycast) — its record is the ancestor chain's bot (the fruit group).
  function botRecordFor(mesh) {
    let node = mesh
    while (node) {
      const record = env.state.bots.find((bot) => bot.mesh === node)
      if (record) return record
      node = node.parent
    }
    return null
  }

  function fire() {
    if (cooldown > 0) return false
    if (!ammo.tryFire()) return false // reloading or dry: no shot, no cooldown burn
    cooldown = params.cooldown
    shots += 1
    bloom = Math.min(BLOOM_MAX_PX, bloom + BLOOM_PER_SHOT_PX)

    camera.updateMatrixWorld() // aim against this frame's camera, not last render's
    raycaster.setFromCamera(crosshair, camera)
    const { onTarget, hit, end } = resolveImpact()
    spawnTracer(tracerOrigin(), end)
    spawnFlash(end)
    if (onTarget) {
      hits += 1
      const record = botRecordFor(hit.object)
      hooks.hitBot?.(hit.object, params.damage)
      bus.emit(Events.HIT_CONFIRM, { killed: record ? !record.alive : false })
    }
    return true
  }

  // --- crosshair spread ------------------------------------------------------

  // Horizontal speed is the movement signal — the physics controller writes
  // env.state.player.vel every frame it runs.
  function isMoving() {
    const vel = env.state.player.vel
    return Math.hypot(vel.x, vel.z) > MOVING_SPEED_EPS
  }

  function emitSpread() {
    const px = spreadPx({ base: SPREAD_BASE_PX, moving: isMoving(), bloom })
    if (px === lastSpreadPx) return
    lastSpreadPx = px
    bus.emit(Events.CROSSHAIR_UPDATE, { spreadPx: px })
  }

  // --- input ---------------------------------------------------------------

  // The CameraRig owns pointer lock and only requests it while playing; the
  // first click after a pause (re)locks the cursor without firing.
  function onMouseDown(event) {
    if (event.button !== 0) return
    if (document.pointerLockElement !== canvas) return
    firing = true
  }

  function onMouseUp(event) {
    if (event.button === 0) firing = false
  }

  function onLockChange() {
    if (document.pointerLockElement !== canvas) firing = false
  }

  function onKeyDown(event) {
    if (event.code !== 'KeyR') return
    if (getState() !== GameStates.PLAYING) return // reload is a playing-state action
    ammo.reload()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  // mouseup on window: under pointer lock the event retargets to the canvas
  // and bubbles here, and a release outside the page still stops auto-fire.
  window.addEventListener('mouseup', onMouseUp)
  document.addEventListener('pointerlockchange', onLockChange)
  window.addEventListener('keydown', onKeyDown)

  // --- equip + frame update --------------------------------------------------

  // Match start (and retry): adopt the selected weapon — fresh model, fresh
  // counters — and emit the opening weapon:change + ammo:update so the HUD
  // never flashes placeholder ammo. (Leaderboard's opening snapshot is the
  // match director's beat, not this module's.)
  function equip(nextWeapon) {
    weapon = nextWeapon
    params = weaponParams(weapon)
    raycaster.far = params.range
    ammo = createAmmoModel(weapon, emitAmmo)
    cooldown = 0
    bloom = 0
    lastSpreadPx = null
    shots = 0
    hits = 0
    bus.emit(Events.WEAPON_CHANGE, { id: weapon.id, name: weapon.name })
    emitAmmo({ mag: weapon.ammo.mag, reserve: weapon.ammo.reserve, reloading: false })
  }

  function update(dt) {
    cooldown = Math.max(0, cooldown - dt)
    ammo.tick(dt) // dt-driven reload; emits on completion
    if (firing) fire()
    // Emit first (this frame's shot shows its full bloom immediately), then
    // decay the bloom over the interval the frame consumed.
    emitSpread()
    bloom = Math.max(0, bloom - BLOOM_DECAY_PX_S * dt)
    stepEffects(dt)
  }

  return {
    update,
    fire,
    equip,
    setAvatar,
    shotStats: () => ({ shots, hits }),
    dispose() {
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('pointerlockchange', onLockChange)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

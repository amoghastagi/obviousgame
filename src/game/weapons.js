// src/game/weapons.js — player hitscan rifle (weapons lane).
//
// The raycast decides damage; the tracer merely conveys the shot. A target is
// only damaged when no static collider sits between the camera and it (no
// shooting through walls). Bot damage flows through env.hooks.hitBot; the
// placeholder fruit dummies are finished off locally so the arena is playable
// before the bots module lands.
import { PALETTE } from '../graphics/palette.js'

const FIRE_COOLDOWN = 0.18 // seconds between shots; holding the button auto-fires at this rate
const DAMAGE = 25
const RANGE = 120 // tracer reach when the ray hits neither target nor wall
const TRACER_LIFE = 0.08
const FLASH_LIFE = 0.12
const DEATH_POP_LIFE = 0.2

export function createWeaponSystem(env) {
  const { THREE, camera, scene, world, hooks } = env
  const canvas = env.renderer.domElement
  const crosshair = new THREE.Vector2(0, 0)
  // Camera-space muzzle offset (right, down, forward) so the tracer reads as
  // fired from a gun rather than out of the pupil.
  const muzzleOffset = new THREE.Vector3(0.12, -0.14, -0.35)
  const raycaster = new THREE.Raycaster()
  raycaster.far = RANGE
  // Shared geometries; each effect clones its material so opacity can fade
  // independently, and disposes it when the effect ends.
  const tracerGeometry = new THREE.BoxGeometry(0.03, 0.03, 1)
  const flashGeometry = new THREE.SphereGeometry(0.07, 8, 8)

  let cooldown = 0
  let firing = false
  const effects = []

  // --- effect bookkeeping --------------------------------------------------

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

  // Swell to 1.6x over the first 40% of the pop, then collapse to nothing.
  function popScale(t) {
    const GROW = 0.4
    return t < GROW ? 1 + (t / GROW) * 0.6 : 1.6 * (1 - (t - GROW) / (1 - GROW))
  }

  function killDummy(mesh) {
    const i = world.targets.indexOf(mesh)
    if (i !== -1) world.targets.splice(i, 1)
    // The pop borrows the dummy's own mesh (its material belongs to
    // gameDemo), so the end callback only unlinks it from the scene.
    addEffect(mesh, DEATH_POP_LIFE, (t) => mesh.scale.setScalar(popScale(t)))
  }

  function damageDummy(mesh) {
    mesh.userData.hitPoints -= DAMAGE
    if (mesh.userData.hitPoints <= 0) killDummy(mesh)
  }

  // --- shot ----------------------------------------------------------------

  // Camera-space muzzle position for the current frame.
  function muzzlePoint() {
    return muzzleOffset.clone().applyQuaternion(camera.quaternion).add(camera.position)
  }

  // Closest static collider the ray crosses. The returned point is the wall
  // face, or the ray at RANGE when the shot reaches open air.
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
    if (distance === Infinity) ray.at(RANGE, point)
    return { distance, point }
  }

  // Ray-vs-world for one shot: the target only survives the wall check.
  function resolveImpact() {
    const wall = nearestWall(raycaster.ray)
    const hit = raycaster.intersectObjects(world.targets, false)[0]
    const onTarget = hit !== undefined && hit.distance < wall.distance
    return { onTarget, hit, end: onTarget ? hit.point.clone() : wall.point }
  }

  function fire() {
    if (cooldown > 0) return false
    cooldown = FIRE_COOLDOWN
    camera.updateMatrixWorld() // aim against this frame's camera, not last render's
    raycaster.setFromCamera(crosshair, camera)
    const { onTarget, hit, end } = resolveImpact()
    spawnTracer(muzzlePoint(), end)
    spawnFlash(end)
    if (onTarget) {
      hooks.hitBot?.(hit.object, DAMAGE)
      if (hit.object.userData.isDummy) damageDummy(hit.object)
    }
    return true
  }

  // --- input ---------------------------------------------------------------

  // physics.js (the usual pointer-lock owner) may not have landed yet, so the
  // first click grabs the lock instead of firing; a duplicate request from a
  // look controller is a harmless no-op.
  function onMouseDown(event) {
    if (event.button !== 0) return
    if (document.pointerLockElement !== canvas) {
      const request = canvas.requestPointerLock?.()
      // Browsers reject re-lock requests during the post-Esc cooldown; there
      // is nothing to recover and an unhandled rejection would dirty the console.
      request?.catch?.(() => {})
      return
    }
    firing = true
  }

  function onMouseUp(event) {
    if (event.button === 0) firing = false
  }

  function onLockChange() {
    if (document.pointerLockElement !== canvas) firing = false
  }

  canvas.addEventListener('mousedown', onMouseDown)
  // mouseup on window: under pointer lock the event retargets to the canvas
  // and bubbles here, and a release outside the page still stops auto-fire.
  addEventListener('mouseup', onMouseUp)
  document.addEventListener('pointerlockchange', onLockChange)

  function update(dt) {
    cooldown = Math.max(0, cooldown - dt)
    if (firing) fire()
    stepEffects(dt)
  }

  return { update, fire }
}

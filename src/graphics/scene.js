// Shared game scene for Fruit Shockers: renderer, camera, pastel lighting rig,
// ground plane, and the render loop. All colors come from the shared palette —
// never color literals here.
import * as THREE from 'three'
import { PALETTE } from './palette.js'

const MAX_PIXEL_RATIO = 2

// Half-extent of the playable arena the key light's shadow camera must cover.
// The arena is ~70 units wide; pad a little so tall props near the edges
// still receive/cast shadows.
const SHADOW_EXTENT = 45

/**
 * Flat-shaded material used across all Fruit Shockers geometry.
 * Chosen: MeshLambertMaterial with flatShading — cheap diffuse shading that
 * lets the pastel palette read cleanly under hemisphere + directional light.
 * (MeshToonMaterial would band the shading; we want soft facet flats.)
 * Other modules should build ALL materials through this helper so shading
 * stays consistent scene-wide.
 */
export function createFlatMaterial(colorHex) {
  return new THREE.MeshLambertMaterial({ color: colorHex, flatShading: true })
}

/**
 * Boot the shared game scene inside `container`.
 *
 * Returns a handle:
 *   { scene, camera, addUpdateListener, removeUpdateListener, update, render, cleanup }
 *
 * - addUpdateListener(fn) / removeUpdateListener(fn): per-frame callbacks;
 *   each fn receives dt in seconds.
 * - update(dt) / render(): exposed so a host can drive the loop manually.
 * - cleanup(): stop the loop, dispose owned GPU resources, remove the canvas.
 */
export function createGameScene(container) {
  // --- Renderer -------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  })
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO))
  renderer.setSize(container.clientWidth || 1, container.clientHeight || 1)
  renderer.domElement.style.display = 'block'
  container.appendChild(renderer.domElement)

  // --- Scene: background + fog ---------------------------------------------
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(PALETTE.bg)
  scene.fog = new THREE.Fog(PALETTE.fog, 40, 160)

  // --- Camera ---------------------------------------------------------------
  const camera = new THREE.PerspectiveCamera(
    70,
    (container.clientWidth || 1) / (container.clientHeight || 1),
    0.1,
    300,
  )

  // --- Lighting rig ---------------------------------------------------------
  // Hemisphere: pastel sky wash from above, warm cream bounce from below.
  // Intensities are ~2x the legacy scale: three r155+ dropped the internal
  // pi multiplier, and at 0.9/1.2 the pastel floor renders sandy tan.
  const hemisphere = new THREE.HemisphereLight(PALETTE.wall, PALETTE.floorB, 2.0)
  scene.add(hemisphere)

  // Key light: warm white, casts the soft shadows. Ortho shadow camera sized
  // to cover the arena.
  const key = new THREE.DirectionalLight(PALETTE.counterTop, 2.6)
  key.position.set(24, 32, 16)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.left = -SHADOW_EXTENT
  key.shadow.camera.right = SHADOW_EXTENT
  key.shadow.camera.top = SHADOW_EXTENT
  key.shadow.camera.bottom = -SHADOW_EXTENT
  key.shadow.camera.near = 1
  key.shadow.camera.far = 120
  // normalBias kills shadow acne on flat low-poly surfaces without the
  // peter-panning a large plain bias causes.
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.03
  key.shadow.camera.updateProjectionMatrix()
  scene.add(key)

  // Fill light: soft, shadowless, from the opposite side. Tinted with the
  // palette cyan for the neon-highlight look.
  const fill = new THREE.DirectionalLight(PALETTE.neonCyan, 0.65)
  fill.position.set(-20, 14, -18)
  scene.add(fill)

  // --- Ground: large pastel plane so shadows read immediately ---------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    createFlatMaterial(PALETTE.floorA),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  // --- Render loop with per-frame listeners ---------------------------------
  const updateListeners = new Set()
  const clock = new THREE.Clock()
  let rafId = 0
  let running = false

  function update(dt) {
    for (const fn of updateListeners) fn(dt)
  }

  function render() {
    renderer.render(scene, camera)
  }

  function tick() {
    rafId = requestAnimationFrame(tick)
    update(clock.getDelta())
    render()
  }

  function start() {
    if (running) return
    running = true
    clock.getDelta() // swallow the pause gap so the first dt is sane
    rafId = requestAnimationFrame(tick)
  }

  function stop() {
    running = false
    cancelAnimationFrame(rafId)
  }

  start()

  // --- Resize ---------------------------------------------------------------
  const resizeObserver = new ResizeObserver(() => {
    const w = container.clientWidth || 1
    const h = container.clientHeight || 1
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  })
  resizeObserver.observe(container)

  // --- Cleanup --------------------------------------------------------------
  function cleanup() {
    stop()
    resizeObserver.disconnect()
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose()
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        for (const m of mats) m.dispose()
      }
    })
    renderer.dispose()
    renderer.domElement.remove()
  }

  return {
    scene,
    camera,
    renderer, // the GameHost needs the handle (env contract, rig click-to-lock)
    addUpdateListener(fn) {
      updateListeners.add(fn)
    },
    removeUpdateListener(fn) {
      updateListeners.delete(fn)
    },
    update,
    render,
    cleanup,
  }
}

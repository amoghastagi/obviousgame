// Self-contained camera demo: ?demo=camera
//
// Minimal scene with its own renderer, lights, pastel floor, crates, and a
// placeholder fruit capsule riding a scripted loop while CameraRig tracks it.
// Deliberately does NOT import from src/graphics/scene.js — the scene agent
// owns that module. Hint overlay uses inline styles only; the HUD agent owns
// real UI later.

import * as THREE from 'three'
import { PALETTE } from '../graphics/palette.js'
import { CameraRig } from '../graphics/camera/CameraRig.js'

const ORBIT_SPEED = 0.45 // rad/s around the arena
const ORBIT_RADIUS = 5

export async function mount(container) {
  const width = container.clientWidth || window.innerWidth
  const height = container.clientHeight || window.innerHeight

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.domElement.style.display = 'block'
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(PALETTE.bg)
  scene.fog = new THREE.Fog(PALETTE.fog, 18, 60)

  const camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 200)
  camera.position.set(ORBIT_RADIUS, 1.8, 0) // near the first FPS eye position; rig refines each frame

  // Warm pastel key light plus a soft sky/ground hemisphere.
  scene.add(new THREE.HemisphereLight(PALETTE.bg, PALETTE.floorB, 1.4))
  const sun = new THREE.DirectionalLight(PALETTE.counterTop, 2.4)
  sun.position.set(8, 14, 6)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.left = -12
  sun.shadow.camera.right = 12
  sun.shadow.camera.top = 12
  sun.shadow.camera.bottom = -12
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 50
  scene.add(sun)

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshLambertMaterial({ color: PALETTE.floorA }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  // A few grocery crates scattered along the loop.
  const crates = [
    { pos: [2.5, 0.5, -3], size: 1.0, color: PALETTE.cardboard, rot: 0.3 },
    { pos: [-4, 0.75, 2.5], size: 1.5, color: PALETTE.cardboardDark, rot: -0.5 },
    { pos: [3.5, 0.6, 4], size: 1.2, color: PALETTE.counterBody, rot: 0.9 },
    { pos: [-2, 0.5, -5.5], size: 1.0, color: PALETTE.melonRind, rot: 0.15 },
    { pos: [0.5, 0.4, 6.5], size: 0.8, color: PALETTE.counterTop, rot: -0.7 },
  ]
  for (const c of crates) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(c.size, c.size, c.size),
      new THREE.MeshLambertMaterial({ color: c.color }),
    )
    mesh.position.set(...c.pos)
    mesh.rotation.y = c.rot
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
  }

  // Placeholder fruit character — group origin at ground level (rig contract).
  const character = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.45, 0.7, 6, 16),
    new THREE.MeshLambertMaterial({ color: PALETTE.strawberry }),
  )
  body.position.y = 0.8
  body.castShadow = true
  character.add(body)

  const topper = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 12, 8),
    new THREE.MeshLambertMaterial({ color: PALETTE.leaf }),
  )
  topper.position.y = 1.74
  topper.castShadow = true
  character.add(topper)

  for (const x of [-0.16, 0.16]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 8),
      new THREE.MeshLambertMaterial({ color: PALETTE.ink }),
    )
    eye.position.set(x, 1.0, -0.42)
    character.add(eye)
  }
  scene.add(character)

  // Rig defaults: sensitivity 0.0022, eyeHeight 1.6, distance 4.5, mode 'fps'.
  const rig = new CameraRig(camera, renderer.domElement)
  rig.setTarget(character)
  // Ease the initial FPS aim down a touch so the floor reads in the first frame
  // (and the character's own eyes stay below the bottom of the view).
  rig.applyLook(0, 60)

  const hint = document.createElement('div')
  hint.textContent = 'Click to lock pointer (FPS) — V toggles third-person'
  Object.assign(hint.style, {
    position: 'absolute',
    top: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '8px 14px',
    borderRadius: '10px',
    background: `${PALETTE.ink}c7`,
    color: PALETTE.bg,
    fontFamily: 'system-ui, sans-serif',
    fontSize: '13px',
    pointerEvents: 'none',
    zIndex: '10',
  })
  container.appendChild(hint)

  const resize = () => {
    const w = container.clientWidth || window.innerWidth
    const h = container.clientHeight || window.innerHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  window.addEventListener('resize', resize)
  resize()

  // Scripted loop: clockwise circle + gentle bob; the capsule faces the tangent.
  const clock = new THREE.Clock()
  let elapsed = 0

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05)
    elapsed += dt
    const a = elapsed * ORBIT_SPEED
    character.position.set(
      Math.cos(a) * ORBIT_RADIUS,
      0.12 + Math.sin(elapsed * 1.8) * 0.12,
      -Math.sin(a) * ORBIT_RADIUS,
    )
    character.rotation.y = a
    rig.update(dt)
    renderer.render(scene, camera)
  })
}

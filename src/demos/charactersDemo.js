import * as THREE from 'three'
import { PALETTE } from '../graphics/palette.js'
import { CHARACTERS } from '../graphics/characters/index.js'
import { cerealBox, counter, cuttingBoard, milkCarton } from '../graphics/arena/props.js'

// Self-contained characters demo: own renderer, lights and floor (deliberately
// NOT src/graphics/scene.js — that module is owned by another task). Shows the
// three fruit characters on neon-trimmed pedestals with a corner slice of the
// grocery arena behind them, and a slow turntable camera.

const PEDESTAL_SPACING = 3.6
const PEDESTAL_TOP = 0.5

function addLights(scene) {
  const hemi = new THREE.HemisphereLight(PALETTE.bg, PALETTE.floorB, 1.1)
  const sun = new THREE.DirectionalLight(PALETTE.counterTop, 2.4)
  sun.position.set(9, 15, 7)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -14
  sun.shadow.camera.right = 14
  sun.shadow.camera.top = 14
  sun.shadow.camera.bottom = -14
  sun.shadow.camera.near = 2
  sun.shadow.camera.far = 50
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.02
  scene.add(hemi, sun)
}

// Pedestal with a neon trim ring per character.
function addPedestal(scene, x, accent) {
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 1.1, PEDESTAL_TOP, 10),
    new THREE.MeshLambertMaterial({ color: PALETTE.counterTop, flatShading: true }),
  )
  pedestal.position.set(x, PEDESTAL_TOP / 2, 1.5)
  pedestal.castShadow = true
  pedestal.receiveShadow = true

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.98, 0.05, 8, 28),
    new THREE.MeshLambertMaterial({ color: accent, flatShading: true }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.set(x, PEDESTAL_TOP, 1.5)
  ring.castShadow = true

  scene.add(pedestal, ring)
}

// Corner slice of the arena behind the pedestal row.
function addArenaSlice(scene) {
  const slice = new THREE.Group()

  const backCounter = counter({ length: 15 })
  backCounter.position.set(0, 0, -7)
  slice.add(backCounter)

  const boxA = cerealBox({ width: 2.6, height: 3.6, depth: 1, panel: PALETTE.neonPink })
  boxA.position.set(-6, 0, -9.5)
  boxA.rotation.y = 0.25

  const boxB = cerealBox({ width: 2.8, height: 3.8, depth: 1, panel: PALETTE.neonCyan })
  boxB.position.set(5.5, 0, -10)
  boxB.rotation.y = -0.2

  const boxC = cerealBox({ width: 0.95, height: 1.4, depth: 0.34, panel: PALETTE.neonLime })
  boxC.position.set(-2.4, COUNTER_TOP, -7.2)
  boxC.rotation.y = -0.15

  const boxD = cerealBox({ width: 0.95, height: 1.25, depth: 0.34, panel: PALETTE.neonPink })
  boxD.position.set(3.2, COUNTER_TOP, -6.8)
  boxD.rotation.y = 0.3

  const carton = milkCarton()
  carton.position.set(0.6, COUNTER_TOP, -7.1)
  carton.rotation.y = 0.4

  const board = cuttingBoard()
  board.position.set(-4.4, COUNTER_TOP + 0.05, -6.9)
  board.rotation.y = 0.12

  slice.add(boxA, boxB, boxC, boxD, carton, board)
  scene.add(slice)
}

export async function mount(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(PALETTE.bg)
  scene.fog = new THREE.Fog(PALETTE.fog, 30, 80)

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 200)

  addLights(scene)

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshLambertMaterial({ color: PALETTE.floorA }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const accents = [PALETTE.neonLime, PALETTE.neonCyan, PALETTE.neonPink]
  Object.keys(CHARACTERS).forEach((key, i) => {
    const x = (i - 1) * PEDESTAL_SPACING
    addPedestal(scene, x, accents[i % accents.length])
    const character = CHARACTERS[key].create()
    character.position.set(x, PEDESTAL_TOP, 1.5)
    character.rotation.y = 0.15 - i * 0.2
    scene.add(character)
  })

  addArenaSlice(scene)

  const clock = new THREE.Clock()
  renderer.setAnimationLoop(() => {
    const angle = clock.getElapsedTime() * 0.22
    camera.position.set(Math.sin(angle) * 9.5, 4.2, Math.cos(angle) * 9.5)
    camera.lookAt(0, 1.2, 0)
    renderer.render(scene, camera)
  })

  const resize = () => {
    const width = container.clientWidth
    const height = container.clientHeight
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
  }
  const observer = new ResizeObserver(resize)
  observer.observe(container)
}

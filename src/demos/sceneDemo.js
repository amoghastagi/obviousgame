// ?demo=scene — placeholder primitives on the shared ground plane.
// Exists to verify the graphics foundation (lighting, fog, soft shadows,
// render loop) before real fruit characters and arena geometry land.
import * as THREE from 'three'
import { createGameScene, createFlatMaterial } from '../graphics/scene.js'
import { PALETTE } from '../graphics/palette.js'

export async function mount(container) {
  const game = createGameScene(container)
  const { scene, camera, addUpdateListener } = game

  // Pleasant fixed three-quarter view of the prop cluster.
  camera.position.set(11, 7.5, 14)
  camera.lookAt(0, 1.5, 0)

  // Placeholder props: boxes / spheres / cylinders in pastel palette colors.
  const spinnerSpec = { x: 0.5, y: 1.4, z: -0.5 }
  const propSpecs = [
    { geo: new THREE.BoxGeometry(2.2, 2.2, 2.2), color: PALETTE.cardboard, pos: [-4.5, 1.1, 2] },
    { geo: new THREE.BoxGeometry(1.4, 3.4, 1.4), color: PALETTE.counterBody, pos: [-7, 1.7, -4] },
    { geo: new THREE.SphereGeometry(1.7, 12, 8), color: PALETTE.melonRind, pos: [3.5, 1.7, -2.5] },
    { geo: new THREE.SphereGeometry(1.1, 10, 7), color: PALETTE.strawberry, pos: [1, 1.1, 3.5] },
    { geo: new THREE.CylinderGeometry(1, 1.2, 2.6, 8), color: PALETTE.leaf, pos: [6.5, 1.3, 2.5] },
    { geo: new THREE.SphereGeometry(0.8, 10, 7), color: PALETTE.bananaPeel, pos: [-2.8, 0.8, -5.5] },
  ]

  for (const spec of propSpecs) {
    const mesh = new THREE.Mesh(spec.geo, createFlatMaterial(spec.color))
    mesh.position.set(...spec.pos)
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
  }

  // The one gently rotating neon showpiece — a faceted low-poly gem.
  const spinner = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.4, 1),
    createFlatMaterial(PALETTE.neonPink),
  )
  spinner.position.set(spinnerSpec.x, spinnerSpec.y, spinnerSpec.z)
  spinner.castShadow = true
  spinner.receiveShadow = true
  scene.add(spinner)

  addUpdateListener((dt) => {
    spinner.rotation.y += dt * 0.6
  })

  // Return the handle so a host can drive cleanup() later.
  return game
}

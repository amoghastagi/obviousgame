import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PALETTE } from '../palette.js'

// Grocery prop factories. Each returns a THREE.Group pivoted at the floor (or
// shelf surface) it stands on, centered on x/z. Colors always come from the
// shared palette; sizes are parameterized so the arena can scale props up
// (giant cereal-box cover walls) or down (counter-top clutter).

const flatMat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra })

function solidMesh(geometry, color) {
  const mesh = new THREE.Mesh(geometry, flatMat(color))
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

// Giant product box — scaled up it doubles as a cover wall.
export function cerealBox({ width = 1.1, height = 1.7, depth = 0.4, panel = PALETTE.neonPink } = {}) {
  const group = new THREE.Group()

  const body = solidMesh(new THREE.BoxGeometry(width, height, depth), PALETTE.cardboard)
  group.add(body)

  const front = solidMesh(new THREE.BoxGeometry(width * 0.78, height * 0.58, 0.02), panel)
  front.position.set(0, -height * 0.16, depth / 2 + 0.012)
  group.add(front)

  const brand = solidMesh(new THREE.BoxGeometry(width * 0.78, height * 0.12, 0.02), PALETTE.counterTop)
  brand.position.set(0, height * 0.36, depth / 2 + 0.012)
  group.add(brand)

  return group
}

// Thin rounded cutting board with a handle block.
export function cuttingBoard({ width = 1.9, depth = 1.15, thickness = 0.1 } = {}) {
  const group = new THREE.Group()

  const board = solidMesh(new RoundedBoxGeometry(width, thickness, depth, 2, 0.035), PALETTE.cardboard)
  group.add(board)

  const handle = solidMesh(new RoundedBoxGeometry(0.42, thickness * 0.85, 0.26, 2, 0.03), PALETTE.cardboardDark)
  handle.position.set(width / 2 + 0.18, 0, 0)
  group.add(handle)

  return group
}

// Counter run: pastel body with a lighter overhanging top slab.
export function counter({ length = 8, depth = 2, height = 2 } = {}) {
  const group = new THREE.Group()

  const body = solidMesh(new THREE.BoxGeometry(length, height - 0.16, depth), PALETTE.counterBody)
  body.position.y = (height - 0.16) / 2
  group.add(body)

  const top = solidMesh(new THREE.BoxGeometry(length + 0.14, 0.16, depth + 0.14), PALETTE.counterTop)
  top.position.y = height - 0.08
  group.add(top)

  return group
}

// Milk carton: box body with a folded gable roof (a 3-segment cylinder is a
// triangular prism) and a neon brand stripe.
export function milkCarton({ scale = 1 } = {}) {
  const group = new THREE.Group()

  const width = 0.66 * scale
  const bodyHeight = 1.02 * scale

  const body = solidMesh(new THREE.BoxGeometry(width, bodyHeight, width), PALETTE.counterTop)
  body.position.y = bodyHeight / 2
  group.add(body)

  const roofRadius = width / Math.sqrt(3)
  const roofGeometry = new THREE.CylinderGeometry(roofRadius, roofRadius, width + 0.06, 3, 1, false, Math.PI)
  roofGeometry.rotateX(Math.PI / 2) // prism runs along z, ridge pointing up
  const roof = solidMesh(roofGeometry, PALETTE.counterTop)
  roof.position.y = bodyHeight + roofRadius * 0.5
  group.add(roof)

  const stripe = solidMesh(new THREE.BoxGeometry(width + 0.015, 0.2 * scale, width + 0.015), PALETTE.neonCyan)
  stripe.position.y = bodyHeight * 0.62
  group.add(stripe)

  return group
}

// Shelf unit: side panels, shelf slabs, and a few small products.
export function shelf({ width = 5, height = 4.2, depth = 1.3, levels = 3 } = {}) {
  const group = new THREE.Group()
  const accents = [PALETTE.neonPink, PALETTE.neonCyan, PALETTE.neonLime]

  for (const side of [-1, 1]) {
    const panel = solidMesh(new THREE.BoxGeometry(0.14, height, depth), PALETTE.cardboard)
    panel.position.set(side * (width / 2 - 0.07), height / 2, 0)
    group.add(panel)
  }

  for (let level = 0; level < levels; level++) {
    const y = ((level + 1) / levels) * height
    const board = solidMesh(new THREE.BoxGeometry(width - 0.1, 0.1, depth), PALETTE.counterTop)
    board.position.y = y
    group.add(board)

    for (let i = 0; i < 3; i++) {
      const itemHeight = 0.55 + ((level + i) % 3) * 0.14
      const item = solidMesh(new THREE.BoxGeometry(0.5, itemHeight, 0.4), i === 1 ? accents[level % 3] : PALETTE.cardboardDark)
      item.position.set(-width / 2 + 1 + i * 1.4, y + 0.05 + itemHeight / 2, 0.1)
      group.add(item)
    }
  }

  return group
}

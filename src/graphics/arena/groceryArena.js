import * as THREE from 'three'
import { PALETTE } from '../palette.js'
import { cerealBox, counter, cuttingBoard, milkCarton, shelf } from './props.js'

// Grocery-store arena: pastel checker floor, perimeter counters along two
// walls, giant cereal-box cover walls, counter-top clutter, and shelf units.
// Colliders are world-space THREE.Box3 per solid obstacle (floor excluded),
// valid for an arena group placed at identity. Spawn points are spread across
// the floor and filtered against the colliders.

const ARENA_SIZE = 64
const CELL = 4
const COUNTER_TOP = 2.0

// One vertex-colored checker plane, 4-unit cells.
function buildFloor() {
  const geometry = new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE, ARENA_SIZE / CELL, ARENA_SIZE / CELL).toNonIndexed()
  geometry.rotateX(-Math.PI / 2)

  const position = geometry.getAttribute('position')
  const colors = new Float32Array(position.count * 3)
  const light = new THREE.Color(PALETTE.floorA)
  const dark = new THREE.Color(PALETTE.floorB)
  const centroid = new THREE.Vector3()
  for (let f = 0; f < position.count; f += 3) {
    centroid.set(0, 0, 0)
    for (let k = 0; k < 3; k++) {
      centroid.x += position.getX(f + k)
      centroid.y += position.getY(f + k)
      centroid.z += position.getZ(f + k)
    }
    centroid.multiplyScalar(1 / 3)
    const cellX = Math.floor((centroid.x + ARENA_SIZE / 2) / CELL)
    const cellZ = Math.floor((centroid.z + ARENA_SIZE / 2) / CELL)
    const color = (cellX + cellZ) % 2 ? dark : light
    for (let k = 0; k < 3; k++) {
      colors[(f + k) * 3 + 0] = color.r
      colors[(f + k) * 3 + 1] = color.g
      colors[(f + k) * 3 + 2] = color.b
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }))
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

export function createGroceryArena() {
  const group = new THREE.Group()
  const solids = []

  const place = (object, x, z, rotationY = 0, y = 0) => {
    object.position.set(x, y, z)
    object.rotation.y = rotationY
    group.add(object)
    solids.push(object)
    return object
  }

  group.add(buildFloor()) // walkable — excluded from colliders

  // Perimeter counter runs along two walls.
  place(counter({ length: 52 }), 0, -29.5)
  place(counter({ length: 36 }), -29.5, 6, Math.PI / 2)

  // Cereal-box cover walls mid-arena.
  place(cerealBox({ width: 3.4, height: 4.6, depth: 1.2, panel: PALETTE.neonPink }), -9, 3, 0.35)
  place(cerealBox({ width: 3.8, height: 4.8, depth: 1.2, panel: PALETTE.neonCyan }), 7, -8, -0.22)
  place(cerealBox({ width: 3.0, height: 4.4, depth: 1.1, panel: PALETTE.neonLime }), 1, 15, 0.1)

  // Shelf units along the far wall.
  place(shelf({ width: 6 }), 29.6, -6, -Math.PI / 2)
  place(shelf({ width: 6 }), 29.6, 14, -Math.PI / 2)

  // Counter-top clutter: cutting boards and milk cartons.
  place(cuttingBoard(), -10, -29.5, 0.16, COUNTER_TOP + 0.05)
  place(cuttingBoard(), -29.5, 2, Math.PI / 2 + 0.12, COUNTER_TOP + 0.05)
  place(milkCarton(), -2, -29.6, 0.3, COUNTER_TOP)
  place(milkCarton({ scale: 1.15 }), 5.5, -29.4, -0.2, COUNTER_TOP)
  place(milkCarton(), -26.5, 10, 0.7) // one loose on the floor by the left counter
  place(cerealBox({ width: 0.9, height: 1.35, depth: 0.32, panel: PALETTE.neonLime }), 2.2, -29.5, -0.15, COUNTER_TOP)
  place(cerealBox({ width: 0.9, height: 1.2, depth: 0.32, panel: PALETTE.neonPink }), 3.6, -29.6, 0.2, COUNTER_TOP)

  group.updateWorldMatrix(true, true)
  const colliders = solids.map((solid) => new THREE.Box3().setFromObject(solid))

  // Spread of hand-picked spawn candidates; drop any that sit inside a
  // collider (plus a 1.2-unit comfort margin).
  const grown = new THREE.Box3()
  const candidates = [
    [14, 12],
    [-14, 12],
    [20, -2],
    [12, -16],
    [-4, -18],
    [-16, -6],
    [2, 24],
    [-22, 22],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z))
  const spawnPoints = candidates.filter((point) =>
    colliders.every((box) => {
      grown.copy(box).expandByScalar(1.2)
      return !grown.containsPoint(point)
    }),
  )

  return { group, colliders, spawnPoints, size: { x: ARENA_SIZE, z: ARENA_SIZE } }
}

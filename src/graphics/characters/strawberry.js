import * as THREE from 'three'
import { PALETTE } from '../palette.js'

// Squat strawberry: an icosahedron deformed into a teardrop (narrow top,
// wide base), seeded with tiny flattened spheres oriented flush to the
// surface, topped with a fanned leafy calyx. All vertex-colored, no textures.

const BODY_RADIUS = 0.58
const STRETCH = 1.28
const SEEDS = 24
const LEAVES = 5
const GOLDEN_ANGLE = 2.39996

const flatMat = (extra = {}) => new THREE.MeshLambertMaterial({ flatShading: true, ...extra })

// Shared body deformation so seeds land exactly on the visible surface.
function deformPoint(p) {
  const y = p.y * STRETCH
  let x = p.x
  let z = p.z
  if (y > 0) {
    const k = Math.min(1, y / (BODY_RADIUS * STRETCH))
    const s = 1 - 0.45 * Math.pow(k, 0.9)
    x *= s
    z *= s
  }
  p.set(x * 1.06, y, z * 1.06)
  return p
}

export function createStrawberry() {
  const group = new THREE.Group()

  // Teardrop body: deformed icosahedron with darker under-faces for depth.
  const geometry = new THREE.IcosahedronGeometry(BODY_RADIUS, 1)
  const position = geometry.getAttribute('position')
  for (let i = 0; i < position.count; i++) {
    const p = deformPoint(new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)))
    position.setXYZ(i, p.x, p.y, p.z)
  }
  const colors = new Float32Array(position.count * 3)
  const base = new THREE.Color(PALETTE.strawberry)
  const dark = new THREE.Color(PALETTE.strawberryDark)
  const centroid = new THREE.Vector3()
  for (let f = 0; f < position.count; f += 3) {
    centroid.set(0, 0, 0)
    for (let k = 0; k < 3; k++) {
      centroid.x += position.getX(f + k)
      centroid.y += position.getY(f + k)
      centroid.z += position.getZ(f + k)
    }
    centroid.multiplyScalar(1 / 3)
    const color = centroid.y < -0.12 ? dark : base
    for (let k = 0; k < 3; k++) {
      colors[(f + k) * 3 + 0] = color.r
      colors[(f + k) * 3 + 1] = color.g
      colors[(f + k) * 3 + 2] = color.b
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeBoundingBox()
  const lift = -geometry.boundingBox.min.y
  geometry.translate(0, lift, 0)

  const body = new THREE.Mesh(geometry, flatMat({ vertexColors: true }))
  body.castShadow = true
  group.add(body)

  // Seeds: golden-angle spiral over the body, skipping the calyx crown.
  const seedGeometry = new THREE.SphereGeometry(0.05, 6, 4)
  seedGeometry.scale(1, 1, 0.5) // flatten along Z, then aim +Z outward
  const point = new THREE.Vector3()
  const out = new THREE.Vector3()
  for (let i = 0; i < SEEDS; i++) {
    const t = (i + 0.5) / SEEDS
    const cosPhi = 0.68 - t * 1.4
    const phi = Math.acos(cosPhi)
    const theta = i * GOLDEN_ANGLE + 0.7
    point
      .set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta))
      .multiplyScalar(BODY_RADIUS)
    deformPoint(point)
    point.y += lift
    out.copy(point).normalize()

    const seed = new THREE.Mesh(seedGeometry, flatMat({ color: PALETTE.seeds }))
    seed.position.copy(point).addScaledVector(out, 0.01)
    seed.lookAt(point.clone().addScaledVector(out, 2))
    seed.castShadow = true
    group.add(seed)
  }

  // Calyx: fanned leaf blades draped over the shoulder plus a stem nub.
  const topY = geometry.boundingBox.max.y
  const leafGeometry = new THREE.ConeGeometry(0.15, 0.6, 4)
  leafGeometry.translate(0, 0.3, 0) // pivot at the leaf base
  leafGeometry.scale(1.1, 1, 0.35) // flatten into a blade
  for (let i = 0; i < LEAVES; i++) {
    const fan = new THREE.Group()
    fan.rotation.y = (i / LEAVES) * Math.PI * 2 + 0.3
    const leaf = new THREE.Mesh(leafGeometry, flatMat({ color: PALETTE.leaf }))
    leaf.rotation.z = 1.95 // drape outward and down
    leaf.castShadow = true
    fan.add(leaf)
    fan.position.y = topY - 0.03
    group.add(fan)
  }
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.2, 5), flatMat({ color: PALETTE.leaf }))
  stem.position.set(0, topY + 0.05, 0)
  stem.rotation.z = 0.25
  stem.castShadow = true
  group.add(stem)

  group.userData = { character: 'strawberry', hitboxRadius: 0.62, eyeHeight: 0.75 }
  return group
}

import * as THREE from 'three'
import { PALETTE } from '../palette.js'

// Curved banana: a tube swept along a Catmull-Rom arc, tapered toward both
// tips by scaling each ring about its spine point. The concave (inner) faces
// get the shade tone via per-face vertex colors so the crescent reads without
// any textures.

const SPINE_POINTS = [
  new THREE.Vector3(0.0, 0.05, 0.0),
  new THREE.Vector3(0.3, 0.42, 0.0),
  new THREE.Vector3(0.4, 0.92, 0.0),
  new THREE.Vector3(0.22, 1.32, 0.0),
  new THREE.Vector3(-0.08, 1.52, 0.0),
]
const RADIUS = 0.24
const RADIAL_SEGMENTS = 8
const TUBULAR_SEGMENTS = 22
const TAPER_SAMPLES = 64

const flatMat = (extra = {}) => new THREE.MeshLambertMaterial({ flatShading: true, ...extra })

// Bananas stay near full girth through the middle and thin out at both tips.
function taperFactor(t) {
  return 0.3 + 0.7 * Math.pow(Math.sin(Math.PI * t), 0.55)
}

function buildBody() {
  const spine = new THREE.CatmullRomCurve3(SPINE_POINTS)
  const geometry = new THREE.TubeGeometry(spine, TUBULAR_SEGMENTS, RADIUS, RADIAL_SEGMENTS, false).toNonIndexed()

  // Sample the spine once: point + unit direction toward the concave side
  // (the second-difference of the curve points at its center of curvature).
  const samples = []
  for (let i = 0; i <= TAPER_SAMPLES; i++) samples.push(spine.getPointAt(i / TAPER_SAMPLES))
  const concave = []
  for (let i = 0; i <= TAPER_SAMPLES; i++) {
    const a = samples[Math.max(0, i - 1)]
    const b = samples[Math.min(TAPER_SAMPLES, i + 1)]
    concave.push(
      new THREE.Vector3().subVectors(b, samples[i]).add(new THREE.Vector3().subVectors(a, samples[i])),
    )
  }
  concave[0].copy(concave[1])
  concave[TAPER_SAMPLES].copy(concave[TAPER_SAMPLES - 1])
  concave.forEach((v) => v.normalize())

  const nearestSample = (p) => {
    let best = 0
    let bestD = Infinity
    for (let i = 0; i <= TAPER_SAMPLES; i++) {
      const d = p.distanceToSquared(samples[i])
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return best
  }

  // Taper: scale every vertex toward its spine point.
  const position = geometry.getAttribute('position')
  const tmp = new THREE.Vector3()
  for (let i = 0; i < position.count; i++) {
    tmp.fromBufferAttribute(position, i)
    const s = nearestSample(tmp)
    tmp.sub(samples[s]).multiplyScalar(taperFactor(s / TAPER_SAMPLES)).add(samples[s])
    position.setXYZ(i, tmp.x, tmp.y, tmp.z)
  }

  // Two-tone: faces on the concave side of the spine take the shade color.
  const colors = new Float32Array(position.count * 3)
  const peel = new THREE.Color(PALETTE.bananaPeel)
  const shade = new THREE.Color(PALETTE.bananaShade)
  const centroid = new THREE.Vector3()
  const outward = new THREE.Vector3()
  for (let f = 0; f < position.count; f += 3) {
    centroid.set(0, 0, 0)
    for (let k = 0; k < 3; k++) centroid.add(tmp.fromBufferAttribute(position, f + k))
    centroid.multiplyScalar(1 / 3)
    const s = nearestSample(centroid)
    outward.subVectors(centroid, samples[s]).normalize()
    const color = outward.dot(concave[s]) > 0 ? shade : peel
    for (let k = 0; k < 3; k++) {
      colors[(f + k) * 3 + 0] = color.r
      colors[(f + k) * 3 + 1] = color.g
      colors[(f + k) * 3 + 2] = color.b
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  // Center x/z and lift so the body's lowest point is y = 0.
  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  const cx = (box.min.x + box.max.x) / 2
  const cz = (box.min.z + box.max.z) / 2
  geometry.translate(-cx, -box.min.y, -cz)

  const mesh = new THREE.Mesh(geometry, flatMat({ vertexColors: true }))
  mesh.castShadow = true
  return { mesh, offset: new THREE.Vector3(-cx, -box.min.y, -cz) }
}

export function createBanana() {
  const group = new THREE.Group()
  const { mesh, offset } = buildBody()
  group.add(mesh)

  const spine = new THREE.CatmullRomCurve3(SPINE_POINTS)
  // Stem cap on the standing end, darker tip nub on the other end.
  const stemEnd = spine.getPointAt(0).add(offset)
  const tipEnd = spine.getPointAt(1).add(offset)
  const stemDir = spine.getTangentAt(0).negate()
  const tipDir = spine.getTangentAt(1)

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.3, 6), flatMat({ color: PALETTE.stem }))
  stem.position.copy(stemEnd).addScaledVector(stemDir, 0.06)
  stem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), stemDir)
  stem.castShadow = true

  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.085, 6, 5), flatMat({ color: PALETTE.stem }))
  tip.position.copy(tipEnd).addScaledVector(tipDir, 0.015)
  tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tipDir)
  tip.scale.set(1, 1.3, 1)
  tip.castShadow = true

  group.add(stem, tip)

  // The body mesh is already grounded at y = 0; the stem angles sideways and
  // may bury its end in the pedestal, which keeps the banana planted.

  group.userData = { character: 'banana', hitboxRadius: 0.5, eyeHeight: 1.1 }
  return group
}

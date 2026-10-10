import * as THREE from 'three'
import { PALETTE } from '../palette.js'

// Stocky watermelon cask: a squashed icosahedron with darker vertical stripes
// painted per triangle by the centroid's angle around Y, so the melon stays
// flat-shaded low-poly with zero textures.

const STRIPES = 10

const flatMat = (extra = {}) => new THREE.MeshLambertMaterial({ flatShading: true, ...extra })

export function createWatermelon() {
  const group = new THREE.Group()

  const geometry = new THREE.IcosahedronGeometry(0.72, 1)
  geometry.scale(1.15, 0.9, 1.15)

  const position = geometry.getAttribute('position')
  const colors = new Float32Array(position.count * 3)
  const rind = new THREE.Color(PALETTE.melonRind)
  const stripe = new THREE.Color(PALETTE.melonStripe)
  const centroid = new THREE.Vector3()
  for (let f = 0; f < position.count; f += 3) {
    centroid.set(0, 0, 0)
    for (let k = 0; k < 3; k++) {
      centroid.x += position.getX(f + k)
      centroid.y += position.getY(f + k)
      centroid.z += position.getZ(f + k)
    }
    centroid.multiplyScalar(1 / 3)
    const angle = Math.atan2(centroid.z, centroid.x)
    const band = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * STRIPES)
    const color = band % 2 ? stripe : rind
    for (let k = 0; k < 3; k++) {
      colors[(f + k) * 3 + 0] = color.r
      colors[(f + k) * 3 + 1] = color.g
      colors[(f + k) * 3 + 2] = color.b
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeBoundingBox()
  geometry.translate(0, -geometry.boundingBox.min.y, 0)

  const body = new THREE.Mesh(geometry, flatMat({ vertexColors: true }))
  body.castShadow = true
  group.add(body)

  // Little curled stem on the crown.
  const topY = geometry.boundingBox.max.y
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.22, 5), flatMat({ color: PALETTE.stem }))
  stem.position.set(0.06, topY + 0.07, 0)
  stem.rotation.z = -0.55
  stem.castShadow = true
  group.add(stem)

  group.userData = { character: 'watermelon', hitboxRadius: 0.85, eyeHeight: 1.0 }
  return group
}

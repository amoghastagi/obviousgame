// Combined graphics slice: ?demo=full
//
// Wires the four graphics modules together the way the game will: the shared
// scene/lighting foundation renders the grocery arena, the three fruit
// characters stand at arena spawn points, and the CameraRig tracks a scripted
// banana lap in third person (V toggles first person). Movement here is
// scripted — real WASD physics belongs to the gameplay agent's modules.

import * as THREE from 'three'
import { createGameScene } from '../graphics/scene.js'
import { createGroceryArena } from '../graphics/arena/groceryArena.js'
import { createBanana, createWatermelon, createStrawberry } from '../graphics/characters/index.js'
import { CameraRig } from '../graphics/camera/CameraRig.js'
import { PALETTE } from '../graphics/palette.js'

const LAP_SPEED = 0.5 // rad/s around the produce floor
const LAP_RADIUS = 10 // stays clear of the counters and cereal walls

export async function mount(container) {
  const game = createGameScene(container)
  const { scene, camera } = game

  const arena = createGroceryArena()
  scene.add(arena.group)

  // Fruit at three of the arena's filtered spawn points (origins at ground).
  const cast = [createBanana(), createWatermelon(), createStrawberry()]
  cast.forEach((fruit, i) => {
    const spawn = arena.spawnPoints[i % arena.spawnPoints.length]
    fruit.position.copy(spawn)
    fruit.rotation.y = (i / cast.length) * Math.PI * 2
    scene.add(fruit)
  })

  // The banana takes a lap; the rig follows in third person by default.
  const player = cast[0]
  const canvas = container.querySelector('canvas')
  const rig = new CameraRig(camera, canvas, { mode: 'tps' })
  rig.setTarget(player)

  const hint = document.createElement('div')
  hint.textContent = 'V toggles third/first person — click to lock pointer in FPS'
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

  let elapsed = 0
  game.addUpdateListener((dt) => {
    elapsed += dt
    const a = elapsed * LAP_SPEED
    player.position.set(
      Math.cos(a) * LAP_RADIUS,
      Math.abs(Math.sin(elapsed * 2.2)) * 0.08, // gentle produce bob
      -Math.sin(a) * LAP_RADIUS,
    )
    player.rotation.y = a
    rig.update(dt)
  })

  // Match the other demos: no unmount path in the switcher yet; the scene
  // module owns cleanup once the registry gains teardown.
  return { cleanup: () => { rig.dispose(); game.cleanup() } }
}

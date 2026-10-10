/*
 * Fruit Shockers — GameHost: the one cohesive boot path from menu to match.
 *
 * Integration spine between the three lanes:
 *   - graphics (createGameScene, grocery arena, fruit cast, CameraRig) is the
 *     ONLY renderer, scene, and RAF loop — adopted as-is, no placeholders;
 *   - the engine env (env.js) is injected with the arena's colliders, bounds,
 *     and spawn points instead of its placeholder box room;
 *   - the UI contract (core/eventBus.js, core/gameState.js) is read directly
 *     for state; match lifecycle events are wired by later PRs in the chain.
 *
 * This PR boots the real arena behind the menu in attract mode: a slow idle
 * camera drift over the grocery store, the selected fruit standing at a spawn
 * point, simulation gated off. Gameplay systems (physics, weapons, bots) and
 * the match director land through later PRs — they must gate on
 * `getState() === 'playing'` exactly like the drift does.
 */

import * as THREE from 'three'
import { createGameScene } from '../graphics/scene.js'
import { createGroceryArena } from '../graphics/arena/groceryArena.js'
import { CHARACTERS as FRUIT_CAST } from '../graphics/characters/index.js'
import { CameraRig } from '../graphics/camera/CameraRig.js'
import { createEnv } from './env.js'
import { loadSelection } from '../data/loadout.js'
import { getState, GameStates } from '../core/gameState.js'

// The arena is 64×64 units; env.js's legacy placeholder bounds (±39) are wider
// than the real floor and let entities escape the grocery store. ±32 is the
// walkable truth from here on.
const ARENA_BOUNDS = Object.freeze({ minX: -32, maxX: 32, minZ: -32, maxZ: 32 })

// Attract-mode drift: a slow full-circle orbit over the arena, menu state only.
const DRIFT_RADIUS = 22
const DRIFT_HEIGHT = 9
const DRIFT_RATE = 0.08 // rad/s — a revolution takes ~78 s

// Loadout ids (data/loadout.js) and the graphics cast keys (graphics/characters)
// differ by suffix: `banana_commando` → `banana`. Map once, fail loudly.
const CAST_KEY_BY_CHARACTER_ID = Object.freeze({
  banana_commando: 'banana',
  watermelon_tank: 'watermelon',
  strawberry_scout: 'strawberry',
})

function castKeyFor(characterId) {
  const key = CAST_KEY_BY_CHARACTER_ID[characterId]
  if (!key) throw new Error(`[game] no fruit cast entry for character id "${characterId}"`)
  return key
}

/**
 * Boot the GameHost into `container` (the #game-canvas layer).
 * Returns { dispose } — dispose stops the loop, releases the rig, and
 * removes the canvas (the page shell never calls it; the registry could).
 */
export function initGame(container) {
  // --- The ONLY renderer + RAF loop in the app -------------------------------
  const game = createGameScene(container)

  // --- The real arena ----------------------------------------------------------
  const arena = createGroceryArena()
  game.scene.add(arena.group)

  // --- Engine env, injected with the arena's geometry --------------------------
  const env = createEnv({ scene: game.scene, camera: game.camera, renderer: game.renderer })
  // Arena colliders are world-space Box3s valid for the group at identity —
  // push them straight in, plus a floor box so entities have a walkable top
  // surface at y = 0 (the arena floor itself is excluded from arena.colliders).
  const floorBox = new THREE.Box3(
    new THREE.Vector3(-32, -1, -32),
    new THREE.Vector3(32, 0, 32),
  )
  env.world.colliders.push(...arena.colliders, floorBox)
  env.world.bounds = { ...ARENA_BOUNDS }
  // Spawn points: the arena's hand-picked, collider-checked candidates.
  // The legacy single spawnPoint (0, 1.7, 8) was an eye-height guess from the
  // placeholder room; respawns anchor at ground level from now on.
  env.spawnPoints = arena.spawnPoints
  env.spawnPoint = arena.spawnPoints[0].clone()

  // --- Local player avatar + camera rig ---------------------------------------
  // The selected fruit stands idle at a spawn point. The rig is constructed
  // now but look input is NOT wired to the playing state yet — the next PR in
  // the chain owns the look handoff (one look owner, ever). Until then the
  // rig holds no camera authority: the drift below owns the menu view.
  const selection = loadSelection()
  const avatar = FRUIT_CAST[castKeyFor(selection.characterId)].create()
  avatar.position.copy(arena.spawnPoints[0])
  game.scene.add(avatar)

  const rig = new CameraRig(game.camera, game.renderer.domElement, { mode: 'fps' })
  rig.setTarget(avatar)

  // --- Attract mode -------------------------------------------------------------
  // The menu owns the backdrop: a slow orbit over the arena. Menu state only —
  // pause keeps the frozen scene under the veil, and playing belongs to the
  // rig once the look PR lands. No simulation ticks anywhere in this PR.
  let driftTime = Math.PI * 0.25 // start from a pleasing angle, not dead center
  game.addUpdateListener((dt) => {
    if (getState() !== GameStates.MENU) return
    driftTime += dt * DRIFT_RATE
    game.camera.position.set(
      Math.cos(driftTime) * DRIFT_RADIUS,
      DRIFT_HEIGHT,
      Math.sin(driftTime) * DRIFT_RADIUS,
    )
    game.camera.lookAt(0, 1, 0)
  })

  return {
    dispose() {
      rig.dispose()
      game.cleanup() // stops the loop, disposes GPU resources, removes the canvas
    },
  }
}

/**
 * Demo-registry adapter (?demo=game): the gallery's mount contract — resolve
 * after the first rendered frame so mountDemo sees a live, rendering scene.
 */
export async function mount(container) {
  initGame(container)
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

/*
 * Fruit Shockers — GameHost: the one cohesive boot path from menu to match.
 *
 * Integration spine between the three lanes:
 *   - graphics (createGameScene, grocery arena, fruit cast, CameraRig) is the
 *     ONLY renderer, scene, and RAF loop — adopted as-is, no placeholders;
 *   - the engine env (env.js) is injected with the arena's colliders, bounds,
 *     and spawn points instead of its placeholder box room;
 *   - the UI contract (core/eventBus.js, core/gameState.js) is read directly
 *     for state; the host is the match:start subscriber (selection refresh +
 *     fresh body). The opening beat and match-end events land in later PRs.
 *
 * This PR boots the real arena behind the menu in attract mode: a slow idle
 * camera drift over the grocery store, the selected fruit standing at a spawn
 * point, simulation gated off. In play, the CameraRig is the sole look owner
 * (FPS eye attach + TPS orbit) and the avatar-anchored controller moves the
 * body. Gameplay systems (weapons, bots) and the match director land through
 * later PRs — they must gate on `getState() === 'playing'` exactly like the
 * physics controller does.
 */

import * as THREE from 'three'
import { createGameScene } from '../graphics/scene.js'
import { createGroceryArena } from '../graphics/arena/groceryArena.js'
import { CHARACTERS as FRUIT_CAST } from '../graphics/characters/index.js'
import { CameraRig } from '../graphics/camera/CameraRig.js'
import { createEnv } from './env.js'
import { createPlayerController } from './physics.js'
import { CHARACTERS, loadSelection } from '../data/loadout.js'
import { bus, Events } from '../core/eventBus.js'
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

// Swap-related GPU cleanup: the cast factories build fresh geometries and
// materials per instance, so a replaced avatar's GPU objects are disposed,
// not just unparented.
function disposeObject(root) {
  root.traverse((obj) => {
    obj.geometry?.dispose()
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const material of materials) material?.dispose()
  })
}

// Spec mapping: move speed = 4 + 0.8 × stats.speed m/s → 5.6 (tank), 7.2
// (banana), 8.0 (scout). Max health lands with the catalog-combat PR.
const moveSpeedFor = (stats) => 4 + 0.8 * stats.speed

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

  // --- Local player avatar + engine env ----------------------------------------
  // The avatar is created BEFORE env: env.state.player.pos aliases the avatar
  // mesh's position (feet-anchored at ground level), so movement, respawns,
  // and the TPS orbit all move the visible body — the camera is never the
  // physics anchor. The boot-time selection dresses the attract-mode cast;
  // match:start re-reads the selection so a match always uses the fruit the
  // player actually picked in the menu (persisted before the intent fires).
  const selectionCharacter = () => {
    const selection = loadSelection()
    return CHARACTERS.find((c) => c.id === selection.characterId)
  }
  let character = selectionCharacter()
  let avatar = FRUIT_CAST[castKeyFor(character.id)].create()
  avatar.position.copy(arena.spawnPoints[0])
  game.scene.add(avatar)

  const env = createEnv({
    scene: game.scene,
    camera: game.camera,
    renderer: game.renderer,
    playerAnchor: avatar,
  })
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
  // Respawn anchors are ground level — the feet-anchored body copies them
  // directly.
  env.spawnPoints = arena.spawnPoints
  env.spawnPoint = arena.spawnPoints[0].clone()

  // --- Camera rig: the ONE look owner ------------------------------------------
  // Pointer-lock mouse-look (FPS eye attach + TPS orbit) lives here and only
  // here; the controller below READS the rig. Click-to-lock works in both
  // modes and only while playing. Eye height is the selected fruit's.
  const rig = new CameraRig(game.camera, game.renderer.domElement, { mode: 'fps' })
  rig.setTarget(avatar)
  rig.setEyeHeight(avatar.userData.eyeHeight)

  // --- Player controller: rig-driven movement, avatar-anchored body ----------
  const physics = createPlayerController(env, {
    rig,
    avatar,
    moveSpeed: moveSpeedFor(character.stats),
  })

  // Rebind the avatar-derived state to a newly selected fruit: swap the mesh,
  // re-anchor env.state.player.pos (the feet alias), refresh the rig target +
  // eye height and the controller's catalog speed, and respawn the body.
  function applySelection(nextCharacter) {
    if (nextCharacter.id === character.id) return
    game.scene.remove(avatar)
    disposeObject(avatar)
    character = nextCharacter
    avatar = FRUIT_CAST[castKeyFor(character.id)].create()
    avatar.position.copy(env.spawnPoint)
    game.scene.add(avatar)
    env.state.player.pos = avatar.position // re-anchor the feet alias
    rig.setTarget(avatar)
    rig.setEyeHeight(avatar.userData.eyeHeight)
    physics.setAvatar(avatar, moveSpeedFor(character.stats))
    physics.respawn()
  }

  // The host is the match:start subscriber (the mock's role, contract §2.2).
  // The menu persists the pick to localStorage before emitting the intent, so
  // reading it here honors what the player chose; respawn gives every match —
  // first run or retry — a fresh body at the spawn point.
  bus.on(Events.MATCH_START, () => {
    applySelection(selectionCharacter())
    physics.respawn()
  })

  // --- Attract mode + playing loop ---------------------------------------------
  // MENU: a slow orbit over the arena (the drift owns the camera). PLAYING:
  // the rig owns the camera and the controller moves the avatar. Every other
  // state (paused, end states) freezes both — the renderer keeps drawing the
  // frozen scene under the veil.
  let driftTime = Math.PI * 0.25 // start from a pleasing angle, not dead center
  game.addUpdateListener((dt) => {
    const st = getState()
    if (st === GameStates.MENU) {
      driftTime += dt * DRIFT_RATE
      game.camera.position.set(
        Math.cos(driftTime) * DRIFT_RADIUS,
        DRIFT_HEIGHT,
        Math.sin(driftTime) * DRIFT_RADIUS,
      )
      game.camera.lookAt(0, 1, 0)
      return
    }
    const playing = st === GameStates.PLAYING
    physics.update(dt, { enabled: playing }) // sim freezes under the pause veil
    if (playing) rig.update(dt) // camera freezes too — no drift, no orbit
  })

  return {
    dispose() {
      physics.dispose()
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

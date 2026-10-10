// src/game/bots.js — bot AI: wandering, obstacle avoidance, combat
// engagement, and the combat rules (health, score, respawns).
//
// Behavior, per the env.js contract:
//   WANDER — random waypoints inside world.bounds; steering is a heading that
//            turns toward the waypoint, with a short forward probe against
//            world.colliders that turns the bot when blocked.
//   COMBAT — player alive, within ENGAGE_RANGE and in line-of-sight (eye →
//            player ray vs world.colliders): face the player, fire every
//            FIRE_INTERVAL s — at fire time, if LOS is still clear, deal 10
//            damage via hooks.damagePlayer and draw a brief tracer. A shot
//            that kills the player credits the firing bot's record.
//   Rules  — hooks.hitBot applies damage to bots (100 hp); on death the bot's
//            record counts the death, the local player's score.kills bumps,
//            the hittable meshes leave world.targets (fire passes through),
//            a ~300 ms splat plays, and the bot respawns after ~3 s.
//            hooks.damagePlayer is the health system's (installed by the
//            GameHost after this manager) — deaths and the player respawn
//            clock belong to it.
//
// Each bot re-senses every frame (engaged = alive player, in range, LOS
// clear) and runs the matching behavior, so combat exits the moment the
// player dies or breaks sight.
//
// AVATARS: the GameHost injects the roster (the mock driver's five named
// bots, round-robin over the loadout cast) and an `avatarFor(characterId)`
// factory that builds a fruit group from the graphics lane. Every mesh in
// the avatar is stamped { fruit, isBot, entityId } and registered as
// hittable — the hitBot ancestor walk resolves any hit mesh to its record.
// Movement collision uses the avatar's own hitboxRadius and LOS uses its
// eyeHeight, so a watermelon blocks shelves wider than a strawberry.
//
// AI is otherwise unchanged from the placeholder-capsule era: same speeds,
// ranges, timings, and steering — real avatars and scored records only.
import * as THREE from 'three'
import { PALETTE } from '../graphics/palette.js'
import { CHARACTERS } from '../data/loadout.js'
import { scoreOf } from './matchRules.js'

// --- The mock driver's roster (behavioral spec adopted by the integration
// spec): five named bots, characters rotated one step off the loadout list —
// Melon Musk gets the watermelon, Berry Bonds the strawberry, Citrus Cline
// the banana. `character` is the LOADOUT id so the HUD's color mapping works
// untouched; the GameHost maps it to a fruit mesh via avatarFor.
export const BOT_NAMES = Object.freeze([
  'Melon Musk',
  'Berry Bonds',
  'Citrus Cline',
  'Raisin Kane',
  'Papaya Diaz',
])

export function botRoster(count = BOT_NAMES.length) {
  return BOT_NAMES.slice(0, count).map((name, i) => ({
    id: `bot-${i + 1}`,
    name,
    character: CHARACTERS[(i + 1) % CHARACTERS.length].id,
  }))
}

// --- Tunables (unchanged balance) -------------------------------------------
const BOT_SPEED = 3.2 // m/s while wandering
const BOT_RADIUS = 0.4 // XZ collision radius when an avatar gives none
const BOT_EYE_Y = 1.4 // LOS origin height when an avatar gives none
const BOT_HEIGHT = 1.6 // body extent, used for vertical collider overlap
const TURN_RATE = Math.PI * 1.6 // rad/s toward the current waypoint
const AVOID_TURN = Math.PI * 0.9 // rad/s turn-in-place while blocked
const PROBE_DIST = 1.6 // forward obstacle probe length
const WAYPOINT_TIMEOUT = 6 // s before an unreachable waypoint is abandoned
const ARRIVAL_DIST = 0.7 // close enough to count as arrived
const ENGAGE_RANGE = 15 // m at which a visible player is engaged
const FIRE_INTERVAL = 1.2 // s between shots
const FIRE_ACQUIRE_DELAY = 0.5 // s grace before the first shot on sight
const PLAYER_DMG = 10 // damage per bot shot
const BOT_MAX_HEALTH = 100
const BOT_RESPAWN_DELAY = 3 // s
const SPLAT_TIME = 0.3 // s to flatten on death
const TRACER_LIFE = 0.12 // s a shot tracer stays visible
const BOUNDS_MARGIN = 1 // keep waypoints and bodies off the arena edge
const SPAWN_CLEAR_TRIES = 24 // samples when hunting a clear spawn point
const SPAWN_PLAYER_DIST = 10 // prefer spawn/respawn points away from the player

// Scratch vectors — behavior helpers are hot-path and allocation-free.
// Usage is strictly sequential within a frame, so sharing is safe.
const _eye = new THREE.Vector3()
const _tmp = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _hit = new THREE.Vector3()
const _probeEnd = new THREE.Vector3()
const _ray = new THREE.Ray()

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

// Shortest signed angular distance from `from` to `to`, in (-PI, PI].
function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

function turnToward(heading, target, maxStep) {
  const d = angleDelta(heading, target)
  return heading + clamp(d, -maxStep, maxStep)
}

// Does a bot body (feet at y=0, height BOT_HEIGHT) vertically overlap `box`?
// The floor collider's top is y=0, so this excludes it from XZ resolution.
function bodyOverlapsY(box) {
  return box.max.y > 0.05 && box.min.y < BOT_HEIGHT
}

function pointIsClear(env, x, z, radius = BOT_RADIUS) {
  for (const box of env.world.colliders) {
    if (!bodyOverlapsY(box)) continue
    if (
      x > box.min.x - radius &&
      x < box.max.x + radius &&
      z > box.min.z - radius &&
      z < box.max.z + radius
    ) {
      return false
    }
  }
  return true
}

// True if the segment `from` → `to` is interrupted by a static collider.
// Eye-level segments can't touch the floor (top at y=0), so it is skipped.
function segmentBlocked(env, from, to) {
  const len = from.distanceTo(to)
  if (len < 1e-6) return false
  _dir.subVectors(to, from).divideScalar(len)
  _ray.set(from, _dir)
  for (const box of env.world.colliders) {
    if (box.max.y <= 0.05) continue
    const hit = _ray.intersectBox(box, _hit)
    if (hit && from.distanceTo(hit) <= len) return true
  }
  return false
}

// Random point inside bounds (inset by BOUNDS_MARGIN), clear of colliders,
// preferring distance from the player. Falls back to the last sample —
// movement collision and the waypoint timeout recover from bad spots.
function samplePoint(env, playerDist) {
  const b = env.world.bounds
  const spanX = b.maxX - b.minX - BOUNDS_MARGIN * 2
  const spanZ = b.maxZ - b.minZ - BOUNDS_MARGIN * 2
  const out = new THREE.Vector3()
  for (let i = 0; i < SPAWN_CLEAR_TRIES; i++) {
    out.set(b.minX + BOUNDS_MARGIN + Math.random() * spanX, 0, b.minZ + BOUNDS_MARGIN + Math.random() * spanZ)
    if (!pointIsClear(env, out.x, out.z)) continue
    if (playerDist > 0) {
      _tmp.set(out.x, 0, out.z)
      const px = env.state.player.pos.x
      const pz = env.state.player.pos.z
      if (Math.hypot(out.x - px, out.z - pz) < playerDist) continue
    }
    break
  }
  return out
}

// Move `pos` by (dx, dz), resolving each axis against colliders expanded by
// `radius` (per-axis resolve per the contract). Ground units: y untouched.
function moveWithCollision(env, pos, dx, dz, radius) {
  const resolve = (axis, delta) => {
    if (delta === 0) return
    pos[axis] += delta
    for (const box of env.world.colliders) {
      if (!bodyOverlapsY(box)) continue
      const inX = pos.x > box.min.x - radius && pos.x < box.max.x + radius
      const inZ = pos.z > box.min.z - radius && pos.z < box.max.z + radius
      if (!(inX && inZ)) continue
      if (axis === 'x') pos.x = delta > 0 ? box.min.x - radius - 0.01 : box.max.x + radius + 0.01
      else pos.z = delta > 0 ? box.min.z - radius - 0.01 : box.max.z + radius + 0.01
    }
  }
  resolve('x', dx)
  resolve('z', dz)
  const b = env.world.bounds
  pos.x = clamp(pos.x, b.minX + radius, b.maxX - radius)
  pos.z = clamp(pos.z, b.minZ + radius, b.maxZ - radius)
}

// Stamp the hittable identity onto the avatar and everything inside it —
// the group keeps its cast userData ({ character, hitboxRadius, eyeHeight }),
// every mesh gains the isBot marker so hooks.hitBot accepts it. Returns the
// hittable meshes (all descendants + the group itself when it is a Mesh).
function stampAvatar(avatar, id) {
  const meshes = []
  avatar.traverse((node) => {
    node.userData = { ...node.userData, fruit: true, isBot: true, entityId: id }
    if (node.isMesh) meshes.push(node)
  })
  return meshes
}

/**
 * createBotManager(env, { roster, avatarFor }) → { update, bots, resetMatch }.
 *
 * `roster` — pure data: [{ id, name, character }] (botRoster() for the
 *            mock's five). Records carry kills/deaths/score per bot.
 * `avatarFor(characterId)` — builds a fruit avatar Group (graphics cast);
 *            required: the cohesive app has no placeholder bodies.
 */
export function createBotManager(env, { roster = botRoster(), avatarFor } = {}) {
  if (typeof avatarFor !== 'function') {
    throw new Error('[bots] avatarFor(characterId) is required — the GameHost maps loadout ids to fruit avatars')
  }
  const { state, hooks, world } = env
  const bots = []
  const botByMesh = new Map() // hittable mesh → record (ancestors walked on hit)
  const tracers = []
  let playerRespawnTimer = 0

  // --- Spawn positions -------------------------------------------------------
  // Initial spawn: arena spawn point index+1 — the local player holds [0]
  // (the GameHost sets env.spawnPoint from it). Respawn: the arena point
  // farthest from the player, so bots never pop up under the player's crosshair.
  function spawnPositionFor(index, target) {
    const points = env.spawnPoints
    if (points && points.length > 0) {
      target.copy(points[(index + 1) % points.length])
      return target
    }
    target.copy(samplePoint(env, SPAWN_PLAYER_DIST))
    return target
  }

  function respawnPosition(target) {
    const points = env.spawnPoints
    if (points && points.length > 0) {
      let best = points[0]
      let bestDist = -Infinity
      for (const point of points) {
        const d = point.distanceTo(state.player.pos)
        if (d > bestDist) {
          bestDist = d
          best = point
        }
      }
      target.copy(best)
      return target
    }
    target.copy(samplePoint(env, SPAWN_PLAYER_DIST))
    return target
  }

  function registerBot(bot) {
    for (const mesh of bot.hitMeshes) {
      if (world.targets.indexOf(mesh) === -1) world.targets.push(mesh)
      botByMesh.set(mesh, bot)
    }
  }

  function deregisterBot(bot) {
    for (const mesh of bot.hitMeshes) {
      const idx = world.targets.indexOf(mesh)
      if (idx !== -1) world.targets.splice(idx, 1)
    }
  }

  // --- Spawn -----------------------------------------------------------------
  for (let i = 0; i < roster.length; i++) {
    const { id, name, character } = roster[i]
    const avatar = avatarFor(character)
    const hitMeshes = stampAvatar(avatar, id)
    const bot = {
      id,
      name,
      character, // loadout id — the HUD's color mapping consumes this
      kills: 0,
      deaths: 0,
      score: 0,
      mesh: avatar, // the fruit group; origin sits at ground level
      hitMeshes,
      pos: avatar.position, // alias — ground level (y=0)
      radius: avatar.userData?.hitboxRadius ?? BOT_RADIUS,
      eyeY: avatar.userData?.eyeHeight ?? BOT_EYE_Y,
      heading: Math.random() * Math.PI * 2,
      health: BOT_MAX_HEALTH,
      alive: true,
      mode: 'wander',
      waypoint: null,
      waypointTimer: 0,
      fireTimer: 0,
      avoidDir: Math.random() < 0.5 ? -1 : 1,
      splatT: 0,
      respawnTimer: 0,
    }
    avatar.rotation.y = bot.heading
    spawnPositionFor(i, avatar.position)
    env.scene.add(avatar)
    registerBot(bot)
    bots.push(bot)
    state.bots.push(bot)
  }

  function killBot(bot) {
    bot.alive = false
    bot.mode = 'dead'
    bot.health = 0
    bot.splatT = SPLAT_TIME
    bot.respawnTimer = BOT_RESPAWN_DELAY
    bot.deaths += 1
    bot.score = scoreOf(bot.kills, bot.deaths)
    state.score.kills += 1
    // Deregister while dead so player fire passes through.
    deregisterBot(bot)
  }

  function respawnBot(bot) {
    respawnPosition(bot.pos)
    bot.health = BOT_MAX_HEALTH
    bot.alive = true
    bot.mode = 'wander'
    bot.waypoint = null
    bot.waypointTimer = 0
    bot.fireTimer = FIRE_ACQUIRE_DELAY
    bot.heading = Math.random() * Math.PI * 2
    bot.mesh.scale.set(1, 1, 1)
    bot.mesh.visible = true
    registerBot(bot)
  }

  // --- Hooks (combat rules live here per the contract) -----------------------
  hooks.hitBot = (mesh, dmg) => {
    // Only our own registered meshes count; dummy-fruit deaths are the
    // weapons module's business, not ours.
    if (!mesh?.userData?.isBot) return
    let node = mesh
    let bot = null
    while (node && !bot) {
      bot = botByMesh.get(node) ?? null
      node = node.parent
    }
    if (!bot || !bot.alive) return
    const amount = Number.isFinite(dmg) ? dmg : 0
    bot.health -= amount
    if (bot.health > 0) return
    killBot(bot)
  }

  hooks.damagePlayer = (dmg) => {
    // Interim hook — the GameHost installs the health system's damage over
    // this after createBotManager; it stays only as the documented fallback.
    const player = state.player
    if (!player.alive) return
    const amount = Number.isFinite(dmg) ? dmg : 0
    player.health = Math.max(0, player.health - amount)
    if (player.health > 0) return
    player.alive = false
    state.score.deaths += 1
    playerRespawnTimer = 1.5
  }

  // --- Behavior ----------------------------------------------------------------
  function pickWaypoint(bot) {
    bot.waypoint = samplePoint(env, 0)
    bot.waypointTimer = 0
  }

  function wanderStep(bot, dt) {
    bot.waypointTimer += dt
    if (!bot.waypoint || bot.pos.distanceTo(bot.waypoint) < ARRIVAL_DIST || bot.waypointTimer > WAYPOINT_TIMEOUT) {
      pickWaypoint(bot)
    }

    // Short forward probe: turn in place while blocked, keeping the avoid
    // direction chosen when the block started so the bot commits to steering
    // around the obstacle instead of jittering.
    _eye.copy(bot.pos)
    _eye.y += 0.9
    _tmp.set(Math.sin(bot.heading), 0, Math.cos(bot.heading))
    const probeEnd = _probeEnd.copy(_eye).addScaledVector(_tmp, PROBE_DIST)
    if (segmentBlocked(env, _eye, probeEnd)) {
      bot.heading += bot.avoidDir * AVOID_TURN * dt
      return
    }

    const desired = Math.atan2(bot.waypoint.x - bot.pos.x, bot.waypoint.z - bot.pos.z)
    bot.heading = turnToward(bot.heading, desired, TURN_RATE * dt)
    moveWithCollision(env, bot.pos, Math.sin(bot.heading) * BOT_SPEED * dt, Math.cos(bot.heading) * BOT_SPEED * dt, bot.radius)
  }

  function combatStep(bot, dt) {
    const player = state.player
    bot.heading = turnToward(
      bot.heading,
      Math.atan2(player.pos.x - bot.pos.x, player.pos.z - bot.pos.z),
      TURN_RATE * dt,
    )
    bot.fireTimer -= dt
    if (bot.fireTimer > 0) return
    bot.fireTimer = FIRE_INTERVAL
    // Re-check at fire time: only shoot with a clear lane.
    _eye.copy(bot.pos)
    _eye.y += bot.eyeY
    const wasAlive = player.alive
    if (!segmentBlocked(env, _eye, player.pos)) {
      hooks.damagePlayer?.(PLAYER_DMG, bot)
      spawnTracer(_eye.clone(), player.pos.clone())
      // The kill credit: this bot's shot emptied the player's health.
      if (wasAlive && !player.alive) {
        bot.kills += 1
        bot.score = scoreOf(bot.kills, bot.deaths)
      }
    }
  }

  // --- Tracers (placeholder shot visuals) --------------------------------------
  function spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to])
    const mat = new THREE.LineBasicMaterial({ color: PALETTE.neonPink, transparent: true, opacity: 0.9 })
    const line = new THREE.Line(geo, mat)
    env.scene.add(line)
    tracers.push({ line, life: TRACER_LIFE })
  }

  function updateTracers(dt) {
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i]
      t.life -= dt
      if (t.life <= 0) {
        env.scene.remove(t.line)
        t.line.geometry.dispose()
        t.line.material.dispose()
        tracers.splice(i, 1)
      } else {
        t.line.material.opacity = Math.max(0, t.life / TRACER_LIFE) * 0.9
      }
    }
  }

  // --- Match reset (retry / fresh match) ----------------------------------------
  // Fresh bodies at the roster's arena spawn points, zeroed records — the
  // match director's begin() calls this before its opening leaderboard beat.
  function resetMatch() {
    for (let i = 0; i < bots.length; i++) {
      const bot = bots[i]
      bot.kills = 0
      bot.deaths = 0
      bot.score = 0
      bot.health = BOT_MAX_HEALTH
      bot.alive = true
      bot.mode = 'wander'
      bot.waypoint = null
      bot.waypointTimer = 0
      bot.fireTimer = FIRE_ACQUIRE_DELAY
      bot.splatT = 0
      bot.respawnTimer = 0
      bot.heading = Math.random() * Math.PI * 2
      bot.mesh.scale.set(1, 1, 1)
      bot.mesh.visible = true
      bot.mesh.rotation.y = bot.heading
      spawnPositionFor(i, bot.pos)
      registerBot(bot)
    }
  }

  // --- Frame update --------------------------------------------------------------
  function update(dt) {
    const player = state.player
    for (const bot of bots) {
      if (!bot.alive) {
        // Death: flatten toward the ground over SPLAT_TIME, hide until respawn.
        if (bot.splatT > 0) {
          bot.splatT = Math.max(0, bot.splatT - dt)
          const p = 1 - bot.splatT / SPLAT_TIME
          bot.mesh.scale.set(1 + p * 0.35, Math.max(0.06, 1 - p * 0.94), 1 + p * 0.35)
          if (bot.splatT === 0) bot.mesh.visible = false
        }
        bot.respawnTimer -= dt
        if (bot.respawnTimer <= 0) respawnBot(bot)
        continue
      }

      // Sense every frame: engaged = player alive, in range, LOS clear.
      _eye.copy(bot.pos)
      _eye.y += bot.eyeY
      const engaged =
        player.alive && bot.pos.distanceTo(player.pos) <= ENGAGE_RANGE && !segmentBlocked(env, _eye, player.pos)
      if (engaged) {
        if (bot.mode !== 'combat') {
          bot.mode = 'combat'
          bot.fireTimer = FIRE_ACQUIRE_DELAY // grace on first sight
        }
        combatStep(bot, dt)
      } else {
        bot.mode = 'wander'
        wanderStep(bot, dt)
      }
      bot.mesh.rotation.y = bot.heading
    }
    updateTracers(dt)

    // Player respawn: physics may own the exact reset; otherwise park the
    // camera back at the spawn point with no residual velocity.
    if (!player.alive && playerRespawnTimer > 0) {
      playerRespawnTimer -= dt
      if (playerRespawnTimer <= 0) {
        if (env.physics?.respawn) env.physics.respawn()
        else {
          env.camera.position.copy(env.spawnPoint)
          state.player.vel?.set?.(0, 0, 0)
        }
        player.health = 100
        player.alive = true
      }
    }
  }

  return { update, bots, resetMatch }
}

// src/game/bots.js — Agent C bot AI: wandering, obstacle avoidance, combat
// engagement, and the combat rules (health, score, respawns).
//
// Behavior, per the env.js contract:
//   WANDER — random waypoints inside world.bounds; steering is a heading that
//            turns toward the waypoint, with a short forward probe against
//            world.colliders that turns the bot when blocked.
//   COMBAT — player alive, within ENGAGE_RANGE and in line-of-sight (eye →
//            camera ray vs world.colliders): face the player, fire every
//            FIRE_INTERVAL s — at fire time, if LOS is still clear, deal 10
//            damage via hooks.damagePlayer and draw a brief tracer.
//   Rules  — hooks.hitBot applies damage to bots (100 hp); on death bumps
//            score.kills, plays a ~300 ms splat, removes the mesh from
//            world.targets and respawns after ~3 s. hooks.damagePlayer drains
//            player health; at 0 bumps score.deaths and respawns the player
//            after ~1.5 s (env.physics.respawn() if present, else the camera
//            is reset to env.spawnPoint).
//
// Each bot re-senses every frame (engaged = alive player, in range, LOS
// clear) and runs the matching behavior, so combat exits the moment the
// player dies or breaks sight.
//
// PLACEHOLDER VISUALS: capsule bodies + ink "visor" facing marker, colored
// from PALETTE. The graphics lane owns fruit characters — swap the mesh, keep
// the record shape (id / mesh / pos / health / alive / mode).
import * as THREE from 'three'
import { PALETTE } from '../graphics/palette.js'

// --- Tunables (placeholder balance) ----------------------------------------
const BOT_COUNT = 3
const BOT_SPEED = 3.2 // m/s while wandering
const BOT_RADIUS = 0.4 // XZ collision radius
const BOT_EYE_Y = 1.4 // LOS origin height above ground
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
const PLAYER_RESPAWN_DELAY = 1.5 // s
const SPLAT_TIME = 0.3 // s to flatten on death
const TRACER_LIFE = 0.12 // s a shot tracer stays visible
const BOUNDS_MARGIN = 1 // keep waypoints and bodies off the arena edge
const SPAWN_CLEAR_TRIES = 24 // samples when hunting a clear spawn point
const SPAWN_PLAYER_DIST = 10 // prefer spawn/respawn points away from the player
const MIN_SPAWN_SPREAD = 8 // preferred spacing between simultaneous spawns

const botColors = [PALETTE.strawberry, PALETTE.bananaPeel, PALETTE.melonRind]

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

function pointIsClear(env, x, z) {
  for (const box of env.world.colliders) {
    if (!bodyOverlapsY(box)) continue
    if (
      x > box.min.x - BOT_RADIUS &&
      x < box.max.x + BOT_RADIUS &&
      z > box.min.z - BOT_RADIUS &&
      z < box.max.z + BOT_RADIUS
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
// BOT_RADIUS (per-axis resolve per the contract). Ground units: y untouched.
function moveWithCollision(env, pos, dx, dz) {
  const resolve = (axis, delta) => {
    if (delta === 0) return
    pos[axis] += delta
    for (const box of env.world.colliders) {
      if (!bodyOverlapsY(box)) continue
      const inX = pos.x > box.min.x - BOT_RADIUS && pos.x < box.max.x + BOT_RADIUS
      const inZ = pos.z > box.min.z - BOT_RADIUS && pos.z < box.max.z + BOT_RADIUS
      if (!(inX && inZ)) continue
      if (axis === 'x') pos.x = delta > 0 ? box.min.x - BOT_RADIUS - 0.01 : box.max.x + BOT_RADIUS + 0.01
      else pos.z = delta > 0 ? box.min.z - BOT_RADIUS - 0.01 : box.max.z + BOT_RADIUS + 0.01
    }
  }
  resolve('x', dx)
  resolve('z', dz)
  const b = env.world.bounds
  pos.x = clamp(pos.x, b.minX + BOT_RADIUS, b.maxX - BOT_RADIUS)
  pos.z = clamp(pos.z, b.minZ + BOT_RADIUS, b.maxZ - BOT_RADIUS)
}

// PLACEHOLDER body: capsule + ink visor marking the facing direction (+Z).
// The capsule is the registered hittable surface; the visor is cosmetic.
function buildBotMesh(env, color, id) {
  const group = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(BOT_RADIUS, BOT_HEIGHT - BOT_RADIUS * 2, 4, 12),
    new THREE.MeshLambertMaterial({ color }),
  )
  body.position.y = BOT_HEIGHT / 2
  body.castShadow = true
  body.userData = { fruit: true, isBot: true, entityId: id }
  group.add(body)

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.12, 0.06),
    new THREE.MeshLambertMaterial({ color: PALETTE.ink }),
  )
  visor.position.set(0, BOT_HEIGHT * 0.7, BOT_RADIUS - 0.02)
  group.add(visor)

  group.userData = { fruit: true, isBot: true, entityId: id }
  env.scene.add(group)
  return { group, body }
}

export function createBotManager(env) {
  const { state, hooks, world } = env
  const bots = []
  const botByMesh = new Map() // hittable mesh → record (ancestors walked on hit)
  const tracers = []
  let playerRespawnTimer = 0

  // --- Spawn -----------------------------------------------------------------
  for (let i = 0; i < BOT_COUNT; i++) {
    const id = `bot-${i + 1}`
    const { group, body } = buildBotMesh(env, botColors[i % botColors.length], id)
    const bot = {
      id,
      mesh: group,
      body,
      pos: group.position, // alias — ground level (y=0)
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
    // Spread initial spawns: clear of obstacles, away from the player and
    // from each other (best-effort — the sampler degrades gracefully).
    const p = samplePoint(env, SPAWN_PLAYER_DIST)
    for (let attempt = 0; attempt < 6 && bots.some((b) => b.pos.distanceTo(p) < MIN_SPAWN_SPREAD); attempt++) {
      p.copy(samplePoint(env, SPAWN_PLAYER_DIST))
    }
    group.position.copy(p)
    world.targets.push(body)
    botByMesh.set(body, bot)
    bots.push(bot)
    state.bots.push(bot)
  }

  function killBot(bot) {
    bot.alive = false
    bot.mode = 'dead'
    bot.health = 0
    bot.splatT = SPLAT_TIME
    bot.respawnTimer = BOT_RESPAWN_DELAY
    state.score.kills += 1
    // Deregister while dead so player fire passes through.
    const idx = world.targets.indexOf(bot.body)
    if (idx !== -1) world.targets.splice(idx, 1)
  }

  function respawnBot(bot) {
    bot.pos.copy(samplePoint(env, SPAWN_PLAYER_DIST))
    bot.health = BOT_MAX_HEALTH
    bot.alive = true
    bot.mode = 'wander'
    bot.waypoint = null
    bot.waypointTimer = 0
    bot.fireTimer = FIRE_ACQUIRE_DELAY
    bot.heading = Math.random() * Math.PI * 2
    bot.mesh.scale.set(1, 1, 1)
    bot.mesh.visible = true
    world.targets.push(bot.body)
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
    const player = state.player
    if (!player.alive) return
    const amount = Number.isFinite(dmg) ? dmg : 0
    player.health = Math.max(0, player.health - amount)
    if (player.health > 0) return
    player.alive = false
    state.score.deaths += 1
    playerRespawnTimer = PLAYER_RESPAWN_DELAY
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
    moveWithCollision(env, bot.pos, Math.sin(bot.heading) * BOT_SPEED * dt, Math.cos(bot.heading) * BOT_SPEED * dt)
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
    _eye.y += BOT_EYE_Y
    if (!segmentBlocked(env, _eye, player.pos)) {
      hooks.damagePlayer?.(PLAYER_DMG, bot)
      spawnTracer(_eye.clone(), player.pos.clone())
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
      _eye.y += BOT_EYE_Y
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

  return { update, bots }
}

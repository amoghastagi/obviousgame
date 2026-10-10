// src/game/env.js — Agent C (Physics & Gameplay Mechanics) system contract.
//
// One `env` object is created by gameDemo.js and handed to every gameplay
// system. Gameplay sub-agents implement exactly ONE file each:
//
//   src/game/physics.js → export function createPlayerController(env)
//   src/game/weapons.js → export function createWeaponSystem(env)
//   src/game/bots.js    → export function createBotManager(env)
//
// Each factory returns at least `{ update(dt) }`; the main loop calls it every
// frame. Systems are loaded dynamically and must tolerate the other files not
// existing yet (missing modules are skipped with a console warning).
//
// Contract:
//   env.THREE           — the three module
//   env.scene           — THREE.Scene (placeholder arena until graphics lands)
//   env.camera          — THREE.PerspectiveCamera, first-person; physics moves it
//   env.renderer        — THREE.WebGLRenderer
//   env.world.colliders — THREE.Box3[] static AABBs (floor + obstacles). Use for
//                         movement collision and line-of-sight checks
//                         (THREE.Ray.intersectBox).
//   env.world.targets   — Mesh[] hittable by player fire. Bots register their
//                         meshes here. Placeholder fruit dummies carry
//                         userData { fruit: true, isDummy: true, entityId, hitPoints }.
//   env.world.obstacleMeshes — the meshes backing world.colliders (visual raycasts).
//   env.world.bounds    — { minX, maxX, minZ, maxZ } arena clamp for entities.
//   env.state.player    — { pos, vel, health, alive }. pos ALIASES camera.position:
//                         physics writes it, everyone else reads it.
//   env.state.score     — { kills, deaths }
//   env.state.bots      — bot records; the bots module populates this.
//   env.hooks           — { hitBot(mesh, dmg), damagePlayer(dmg, source) }.
//                         Implemented by the bots module (health-reduction and
//                         score rules are its remit). Weapons call them with
//                         optional chaining so a missing bots module is harmless.
//   env.spawnPoint      — THREE.Vector3 respawn location (ground level; set
//                         by the GameHost from the arena's spawn points).
//   env.spawnPoints     — THREE.Vector3[] ground-level spawn candidates from
//                         the arena; bot spawners sample from these.
//
// Solidity convention (bridges graphics → physics): any mesh with
// `userData.solid === true` is a static obstacle. `addSolid(env, mesh)` registers
// its Box3 into world.colliders and lists the mesh in world.obstacleMeshes.
// When the graphics lane's arena lands, flagging its obstacle meshes with
// userData.solid is all the integration it needs.
import * as THREE from 'three'

export function createEnv({ scene, camera, renderer }) {
  const world = {
    colliders: [],
    targets: [],
    obstacleMeshes: [],
    bounds: { minX: -39, maxX: 39, minZ: -39, maxZ: 39 },
  }
  const state = {
    player: { pos: camera.position, vel: new THREE.Vector3(), health: 100, alive: true },
    score: { kills: 0, deaths: 0 },
    bots: [],
  }
  const hooks = { hitBot: null, damagePlayer: null }
  const spawnPoint = new THREE.Vector3(0, 1.7, 8)
  return { THREE, scene, camera, renderer, world, state, hooks, spawnPoint }
}

// Register a static mesh as an obstacle: adds it to the scene, lists it for
// visual raycasts, and bakes its world-space AABB into world.colliders.
export function addSolid(env, mesh) {
  mesh.userData.solid = true
  env.scene.add(mesh)
  env.world.obstacleMeshes.push(mesh)
  env.world.colliders.push(new THREE.Box3().setFromObject(mesh))
  return mesh
}

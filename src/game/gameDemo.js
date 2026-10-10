// src/game/gameDemo.js — Agent C integrated gameplay demo (?demo=game).
//
// PLACEHOLDER RENDERING: plain floor, box obstacles, fruit dummies, and
// headless lights so the three gameplay systems (physics / weapons / bots) are
// verifiable before the graphics lane's arena and characters land. Everything
// visual in this file is expected to be replaced by Agent B's work — the env
// contract in env.js is the stable integration point, not these meshes.
import * as THREE from 'three'
import { PALETTE } from '../graphics/palette.js'
import { createEnv, addSolid } from './env.js'

export async function mount(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(innerWidth, innerHeight)
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(PALETTE.bg)
  scene.fog = new THREE.Fog(PALETTE.fog, 60, 160)

  const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 500)
  camera.position.set(0, 1.7, 8)

  // Placeholder lights — Agent B owns final lighting.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.2))
  const sun = new THREE.DirectionalLight(0xfff2cc, 1.6)
  sun.position.set(12, 24, 8)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.left = -40
  sun.shadow.camera.right = 40
  sun.shadow.camera.top = 40
  sun.shadow.camera.bottom = -40
  scene.add(sun)

  const env = createEnv({ scene, camera, renderer })
  camera.position.copy(env.spawnPoint)

  // Placeholder kitchen obstacles — Agent B owns the real arena. These meshes
  // go through addSolid() so they are already wired as physics colliders.
  const box = (w, h, d, x, y, z, color) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }))
    m.position.set(x, y, z)
    m.castShadow = m.receiveShadow = true
    return m
  }
  addSolid(env, box(80, 1, 80, 0, -0.5, 0, PALETTE.floorA)) // floor
  addSolid(env, box(4, 6, 2, -8, 3, -6, PALETTE.cardboard)) // "cereal box" walls
  addSolid(env, box(2, 5, 8, 6, 2.5, -10, PALETTE.wall))
  addSolid(env, box(6, 3, 2, 10, 1.5, 4, PALETTE.counterBody))
  addSolid(env, box(2, 7, 2, -12, 3.5, 8, PALETTE.cardboardDark))
  addSolid(env, box(10, 4, 2, 0, 2, 16, PALETTE.wall))
  addSolid(env, box(3, 9, 3, -20, 4.5, -20, PALETTE.cardboard))

  // Placeholder fruit dummies — static targets so shooting is testable before
  // the bots module exists. The bots lane replaces these with live bots.
  const dummyFruit = (x, z, color, i) => {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8), new THREE.MeshLambertMaterial({ color }))
    m.position.set(x, 1.2, z)
    m.castShadow = true
    m.userData = { fruit: true, isDummy: true, entityId: `dummy-${i}`, hitPoints: 100 }
    scene.add(m)
    env.world.targets.push(m)
  }
  dummyFruit(-3, -2, PALETTE.strawberry, 1)
  dummyFruit(4, -4, PALETTE.bananaPeel, 2)
  dummyFruit(-9, 5, PALETTE.melonRind, 3)

  // Placeholder HUD text — Agent A owns the real HUD overlay.
  const hudEl = document.createElement('div')
  hudEl.style.cssText =
    'position:fixed;top:8px;left:8px;z-index:10;background:rgba(0,0,0,.55);' +
    'padding:6px 12px;border-radius:8px;font-size:13px;color:#eee;font-family:system-ui,sans-serif'
  container.appendChild(hudEl)
  const hud = () => {
    hudEl.textContent =
      `HP ${Math.max(0, Math.ceil(env.state.player.health))} · ` +
      `Kills ${env.state.score.kills} · Deaths ${env.state.score.deaths}`
  }

  // Gameplay systems load dynamically; the game boots even if a module file
  // does not exist yet (its lane hasn't landed).
  const tryLoad = async (file, factoryName) => {
    try {
      const m = await import(`./${file}`)
      return m[factoryName](env)
    } catch (err) {
      console.warn(`[game] ${file} not loaded yet: ${err?.message ?? err}`)
      return null
    }
  }
  const physics = await tryLoad('physics.js', 'createPlayerController')
  const weapons = await tryLoad('weapons.js', 'createWeaponSystem')
  const bots = await tryLoad('bots.js', 'createBotManager')

  let lastT = performance.now()
  renderer.setAnimationLoop(() => {
    const now = performance.now()
    const dt = Math.min((now - lastT) / 1000, 0.05)
    lastT = now
    physics?.update(dt)
    weapons?.update(dt)
    bots?.update(dt)
    hud()
    renderer.render(scene, camera)
  })

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(innerWidth, innerHeight)
  })

  // Resolve after the first frame so mountDemo sees a live, rendering scene.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

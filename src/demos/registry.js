// Demo registry — ?demo=<key> picks which demo mounts into #app.
// Each graphics sub-agent adds exactly ONE entry to the `demos` map:
//   sceneDemo:      scene:      () => import('./sceneDemo.js').then((m) => m.mount),
//   charactersDemo: characters: () => import('./charactersDemo.js').then((m) => m.mount),
//   cameraDemo:     camera:     () => import('./cameraDemo.js').then((m) => m.mount),
export const demos = {}

export async function mountDemo(key, container) {
  const load = demos[key]
  if (!load) {
    container.textContent = `Fruit Shockers — no demo registered for "${key ?? ''}". Available: ${
      Object.keys(demos).join(', ') || '(none yet)'
    }`
    return
  }
  const mount = await load()
  await mount(container)
}

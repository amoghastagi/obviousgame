# Fruit Shockers 🍌🍉🍓

A low-poly 3D web arena shooter set in a giant grocery store, where fruit
characters — **Banana Commando**, **Watermelon Tank**, and **Strawberry
Scout** — battle it out among the produce shelves. Single-player sandbox with
bot opponents, arcade movement, and a glassmorphism UI: character/weapon
selection, live HUD (health, ammo, weapon, crosshair, leaderboard), and a
victory/game-over summary with retry.

## Stack

- [Three.js](https://threejs.org/) — 3D rendering
- [Vite](https://vite.dev/) + vanilla JavaScript (ES modules) — no framework
- [Tailwind CSS v4](https://tailwindcss.com/) — design tokens + glassmorphism utilities

## Run it

```bash
npm install
npm run dev      # dev server on :5173
npm run build    # production build
npm run preview  # serve the production build
```

## UI architecture

Three UI surfaces — **menu**, **hud**, **modals** — are booted by `src/main.js`
into mount roots layered over the canvas (`#menu-root`, `#hud-root`,
`#modal-root` over `#game-canvas`). All cross-cutting communication goes
through the contract modules in `src/core/`; surfaces never import each other.

### Contract modules (`src/core/`, `src/data/`)

| Module | Exports | Role |
| --- | --- | --- |
| `core/eventBus.js` | `bus`, `Events` | Singleton pub/sub. `Events` is the closed event vocabulary (`match:start`, `health:update`, `ui:match:start`, …) — names and payload shapes are a contract with the gameplay engine. |
| `core/gameState.js` | `getState()`, `transition(to)`, `GameStates` | Finite state machine (`menu`, `playing`, `paused`, `game_over`, `victory`). Emits `game:state { from, to }` on every change; `transition` throws on illegal moves. |
| `core/hudStore.js` | `subscribe(fn)`, `getSnapshot()` | Reactive snapshot of latest health/ammo/weapon/leaderboard, kept current by bus subscriptions; resets on `match:start`. |
| `data/loadout.js` | `CHARACTERS`, `WEAPONS`, `loadSelection()`, `setSelection()` | Fruit/weapon catalog (1–5 stat scales) and selection persistence (localStorage key `fruit-shockers-selection`). |

### Surface stub signature

Each surface currently ships as a stub with the **stable export signature the
real implementations must keep**:

```js
export function init(rootEl) // render into rootEl; self-manage visibility
```

A stub renders a small glass placeholder naming its surface and subscribes to
`game:state` for its own visibility:

- `ui/menu` — visible in `menu`; PLAY (demo) emits `ui:match:start`
- `ui/hud` — visible in `playing` and `paused`; renders hudStore values
- `ui/modals` — visible in `game_over` and `victory`; shows the `match:end`
  summary with Retry (`ui:match:start`) and Quit (`ui:match:quit`) buttons

UI → game intent is always emitted on the bus (`ui:match:start`,
`ui:match:quit`); `main.js` owns the mapping to `gameState` transitions.
`Esc` toggles `playing ↔ paused`.

### Who owns what

| Directory | Owner |
| --- | --- |
| `src/core/`, `src/data/`, `src/styles/` | UI foundation (this branch) — shared contracts & design system |
| `src/ui/menu/` | Menu team (replaces the stub, keeps `init(rootEl)`) |
| `src/ui/hud/` | HUD team (replaces the stub, keeps `init(rootEl)`) |
| `src/ui/modals/` | Modal team (replaces the stub, keeps `init(rootEl)`) |
| `src/graphics/`, `src/demos/` | 3D graphics team (palette + demo registry; `?demo=<key>` mounts into `#game-canvas`) |
| `src/main.js` | UI foundation — boot + event glue; coordinate before editing |
| `src/demo/mockGame.js` | **Temporary** mock match driver simulating a full match on the bus; deleted once the real engine emits the contract events |

### Design system

Tokens and utilities live in `src/styles/` (`tokens.css`, `components.css`,
imported once via `main.css`). Use the shared classes — `.glass-panel`,
`.glass-chip`, `.btn-neon` (+ `--secondary` / `--ghost`), `.display-title`,
`.stat-bar`, `.page-backdrop`, `.surface-root` — and the Tailwind color tokens
(`banana`, `melon-rind`, `strawberry`, `neon-pink`, `neon-cyan`, `ink`, …)
rather than re-rolling styles per surface. The doc header at the top of
`components.css` is the full reference.

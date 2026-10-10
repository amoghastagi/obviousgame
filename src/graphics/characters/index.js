import { createBanana } from './banana.js'
import { createStrawberry } from './strawberry.js'
import { createWatermelon } from './watermelon.js'

export { createBanana, createStrawberry, createWatermelon }

// Playable fruit roster. Each factory returns a THREE.Group with userData
// { character, hitboxRadius, eyeHeight } for gameplay wiring.
export const CHARACTERS = {
  banana: { create: createBanana, label: 'Banana Commando' },
  watermelon: { create: createWatermelon, label: 'Watermelon Tank' },
  strawberry: { create: createStrawberry, label: 'Strawberry Scout' },
}

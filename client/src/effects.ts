// client/src/effects.ts
// Color cycling effects and visual enhancements for game entities
//
// For advanced visual effects, see the animation module:
// - Confetti: import { ConfettiSystem } from './animation'
// - Entrance animations: import { EntranceAnimation } from './animation'
// - Border system: import { renderBorder } from './animation'
// - Interpolation: import { InterpolationManager } from './animation'

// Re-export animation module for convenience
export * from './animation'

// Re-export color cycling from client-core (extracted in Phase 1 refactoring)
export * from '../../client-core/src/effects/colorCycling'

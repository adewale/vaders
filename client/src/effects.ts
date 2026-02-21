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

// ─── Color Cycling Effects ───────────────────────────────────────────────────

/**
 * Get UFO color based on game tick for color cycling effect
 */
export function getUFOColor(tick: number): string {
  const colors = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#00ffff', '#ff00ff']
  return colors[Math.floor(tick / 5) % colors.length]
}

// client/src/effects.ts
// Color cycling effects and visual enhancements for game entities
//
// For advanced visual effects, see the animation module:
// - Confetti: import { ConfettiSystem } from './animation'
// - Wave wipes: import { WipeTransition } from './animation'
// - Entrance animations: import { EntranceAnimation } from './animation'
// - Border system: import { renderBorder } from './animation'
// - Interpolation: import { InterpolationManager } from './animation'

// Import easing for helper functions
import { easeOutBounce } from './animation/easing'

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

/**
 * Get victory flash color for game over screen
 */
export function getVictoryColor(tick: number): string {
  const colors = ['#ffff00', '#ffffff', '#00ffff', '#ff55ff']
  return colors[Math.floor(tick / 8) % colors.length]
}

/**
 * Get pulse intensity for blinking effects (0-1)
 */
export function getPulseIntensity(tick: number, speed: number = 10): number {
  return (Math.sin(tick / speed * Math.PI) + 1) / 2
}

/**
 * Get rainbow color cycle
 */
export function getRainbowColor(tick: number, speed: number = 20): string {
  const hue = (tick * (360 / speed)) % 360
  return hslToHex(hue, 100, 50)
}

/**
 * Convert HSL to hex color
 */
function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

// ─── Visual Enhancement Helpers ──────────────────────────────────────────────

/**
 * Calculate alien visual position during entrance animation
 */
export function calculateAlienEntranceY(
  targetY: number,
  progress: number,
  startY: number = -4
): number {
  return startY + (targetY - startY) * easeOutBounce(progress)
}

/**
 * Check if a position is visible through an iris wipe mask
 */
export function isVisibleThroughIris(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  radius: number
): boolean {
  const dx = (x - centerX) * 0.5 // Aspect ratio correction
  const dy = y - centerY
  const distance = Math.sqrt(dx * dx + dy * dy)
  return distance <= radius
}

/**
 * Get opacity for fading effect (for confetti, etc.)
 */
export function getFadeOpacity(
  currentLife: number,
  maxLife: number,
  fadeStartRatio: number = 0.3
): number {
  const lifeRatio = currentLife / maxLife
  if (lifeRatio > fadeStartRatio) return 1
  return lifeRatio / fadeStartRatio
}

/**
 * Get screen shake offset for impact effects
 */
export function getShakeOffset(
  tick: number,
  intensity: number = 1,
  duration: number = 10,
  startTick: number = 0
): { x: number; y: number } {
  const elapsed = tick - startTick
  if (elapsed < 0 || elapsed >= duration) {
    return { x: 0, y: 0 }
  }

  // Decay over time
  const decay = 1 - elapsed / duration
  const magnitude = intensity * decay

  // Pseudo-random shake based on tick
  const x = Math.sin(elapsed * 12.9898) * magnitude
  const y = Math.cos(elapsed * 78.233) * magnitude * 0.5 // Less vertical shake

  return {
    x: Math.round(x),
    y: Math.round(y),
  }
}

// client/src/animation/easing.ts
// Easing functions for animations and visual effects
//
// Common easing curves used in game animations:
// - easeOutQuad: Slow end, for reveal/entering effects
// - easeOutBounce: Bouncy landing, for alien entrance
// - easeOutElastic: Overshoots and springs back, for emphasis

/**
 * Quadratic ease-out: Slow end
 * Good for reveal/enter animations
 * @param t - Progress value between 0 and 1
 * @returns Output value between 0 and 1
 */
export function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

/**
 * Bounce ease-out: Bouncy landing effect
 * Great for alien entrance animations (rain effect)
 * @param t - Progress value between 0 and 1
 * @returns Output value between 0 and 1
 */
export function easeOutBounce(t: number): number {
  const n1 = 7.5625
  const d1 = 2.75

  if (t < 1 / d1) {
    return n1 * t * t
  } else if (t < 2 / d1) {
    return n1 * (t -= 1.5 / d1) * t + 0.75
  } else if (t < 2.5 / d1) {
    return n1 * (t -= 2.25 / d1) * t + 0.9375
  } else {
    return n1 * (t -= 2.625 / d1) * t + 0.984375
  }
}

/**
 * Elastic ease-out: Overshoots and springs back
 * Great for emphasis effects
 * @param t - Progress value between 0 and 1
 * @returns Output value between 0 and 1
 */
export function easeOutElastic(t: number): number {
  const c4 = (2 * Math.PI) / 3

  if (t === 0) return 0
  if (t === 1) return 1
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
}

/**
 * Easing function type for use in animation systems
 */
export type EasingFunction = (t: number) => number

// ─── Linear Interpolation Utilities ──────────────────────────────────────────

/**
 * Linear interpolation between two values
 * @param a - Start value
 * @param b - End value
 * @param t - Interpolation factor (0 = a, 1 = b)
 * @returns Interpolated value
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Clamp a value between min and max
 * @param value - Value to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

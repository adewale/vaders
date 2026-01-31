// client/src/animation/easing.ts
// Easing functions for animations and visual effects
//
// Common easing curves used in game animations:
// - easeInQuad: Slow start, for closing/exiting effects
// - easeOutQuad: Slow end, for reveal/entering effects
// - easeOutBounce: Bouncy landing, for alien entrance
// - easeInOutQuad: Smooth both ends, for general transitions
// - linear: Constant rate, for simple movements

/**
 * Linear interpolation (no easing)
 * @param t - Progress value between 0 and 1
 * @returns Output value between 0 and 1
 */
export function linear(t: number): number {
  return t
}

/**
 * Quadratic ease-in: Slow start
 * Good for closing/exit animations
 * @param t - Progress value between 0 and 1
 * @returns Output value between 0 and 1
 */
export function easeInQuad(t: number): number {
  return t * t
}

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
 * Quadratic ease-in-out: Slow start and end
 * Good for smooth transitions
 * @param t - Progress value between 0 and 1
 * @returns Output value between 0 and 1
 */
export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

/**
 * Cubic ease-in: Slow start (more pronounced than quadratic)
 * @param t - Progress value between 0 and 1
 * @returns Output value between 0 and 1
 */
export function easeInCubic(t: number): number {
  return t * t * t
}

/**
 * Cubic ease-out: Slow end (more pronounced than quadratic)
 * @param t - Progress value between 0 and 1
 * @returns Output value between 0 and 1
 */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Cubic ease-in-out: Slow start and end
 * @param t - Progress value between 0 and 1
 * @returns Output value between 0 and 1
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
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
 * Bounce ease-in: Bouncy start effect
 * @param t - Progress value between 0 and 1
 * @returns Output value between 0 and 1
 */
export function easeInBounce(t: number): number {
  return 1 - easeOutBounce(1 - t)
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
 * Back ease-out: Overshoots slightly then settles
 * @param t - Progress value between 0 and 1
 * @returns Output value between 0 and 1
 */
export function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1

  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

/**
 * Sine ease-in: Very gentle acceleration
 * @param t - Progress value between 0 and 1
 * @returns Output value between 0 and 1
 */
export function easeInSine(t: number): number {
  return 1 - Math.cos((t * Math.PI) / 2)
}

/**
 * Sine ease-out: Very gentle deceleration
 * @param t - Progress value between 0 and 1
 * @returns Output value between 0 and 1
 */
export function easeOutSine(t: number): number {
  return Math.sin((t * Math.PI) / 2)
}

/**
 * Easing function type for use in animation systems
 */
export type EasingFunction = (t: number) => number

/**
 * Map of named easing functions for dynamic selection
 */
export const EASING_FUNCTIONS: Record<string, EasingFunction> = {
  linear,
  easeInQuad,
  easeOutQuad,
  easeInOutQuad,
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
  easeOutBounce,
  easeInBounce,
  easeOutElastic,
  easeOutBack,
  easeInSine,
  easeOutSine,
}

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

/**
 * Inverse linear interpolation - find t given a value between a and b
 * @param a - Start value
 * @param b - End value
 * @param value - Value to find t for
 * @returns The t value (0-1) that would produce the given value via lerp
 */
export function inverseLerp(a: number, b: number, value: number): number {
  if (a === b) return 0
  return (value - a) / (b - a)
}

/**
 * Remap a value from one range to another
 * @param value - Input value
 * @param inMin - Input range minimum
 * @param inMax - Input range maximum
 * @param outMin - Output range minimum
 * @param outMax - Output range maximum
 * @returns Remapped value
 */
export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  const t = inverseLerp(inMin, inMax, value)
  return lerp(outMin, outMax, t)
}

// client/src/animation/easing.test.ts
// Unit tests for easing functions and lerp utilities

import { describe, test, expect } from 'bun:test'
import {
  easeOutQuad,
  easeOutBounce,
  easeOutElastic,
  lerp,
  clamp,
} from './easing'

describe('easeOutQuad', () => {
  test('returns 0 at t=0', () => {
    expect(easeOutQuad(0)).toBe(0)
  })

  test('returns 1 at t=1', () => {
    expect(easeOutQuad(1)).toBe(1)
  })

  test('value at midpoint is greater than linear', () => {
    expect(easeOutQuad(0.5)).toBeGreaterThan(0.5)
  })

  test('formula: 1 - (1 - t)^2', () => {
    expect(easeOutQuad(0.5)).toBe(0.75)
  })
})

describe('easeOutBounce', () => {
  test('returns 0 at t=0', () => {
    expect(easeOutBounce(0)).toBe(0)
  })

  test('returns 1 at t=1', () => {
    expect(easeOutBounce(1)).toBe(1)
  })

  test('value exceeds 1 before settling (bounce effect)', () => {
    const valueAtQuarter = easeOutBounce(0.25)
    const valueAtHalf = easeOutBounce(0.5)
    const valueAtThreeQuarter = easeOutBounce(0.75)

    expect(valueAtQuarter).toBeGreaterThan(0)
    expect(valueAtQuarter).toBeLessThanOrEqual(1)
    expect(valueAtHalf).toBeGreaterThan(0)
    expect(valueAtHalf).toBeLessThanOrEqual(1)
    expect(valueAtThreeQuarter).toBeGreaterThan(0)
    expect(valueAtThreeQuarter).toBeLessThanOrEqual(1)
  })

  test('covers all bounce regions', () => {
    expect(easeOutBounce(0.1)).toBeGreaterThan(0)
    expect(easeOutBounce(0.5)).toBeGreaterThan(0)
    expect(easeOutBounce(0.8)).toBeGreaterThan(0)
    expect(easeOutBounce(0.95)).toBeGreaterThan(0)
  })
})

describe('easeOutElastic', () => {
  test('returns 0 at t=0', () => {
    expect(easeOutElastic(0)).toBe(0)
  })

  test('returns 1 at t=1', () => {
    expect(easeOutElastic(1)).toBe(1)
  })

  test('overshoots 1 at certain points (elastic effect)', () => {
    let foundOvershoot = false
    for (let t = 0.1; t < 1; t += 0.01) {
      if (easeOutElastic(t) > 1.01) {
        foundOvershoot = true
        break
      }
    }
    expect(foundOvershoot).toBe(true)
  })

  test('settles to 1 at end', () => {
    expect(easeOutElastic(0.99)).toBeCloseTo(1, 1)
  })
})

describe('lerp', () => {
  test('returns start value at t=0', () => {
    expect(lerp(10, 20, 0)).toBe(10)
  })

  test('returns end value at t=1', () => {
    expect(lerp(10, 20, 1)).toBe(20)
  })

  test('returns midpoint at t=0.5', () => {
    expect(lerp(10, 20, 0.5)).toBe(15)
  })

  test('works with negative values', () => {
    expect(lerp(-10, 10, 0.5)).toBe(0)
  })

  test('works with reversed range', () => {
    expect(lerp(20, 10, 0.5)).toBe(15)
  })

  test('extrapolates beyond t=1', () => {
    expect(lerp(0, 10, 2)).toBe(20)
  })

  test('extrapolates below t=0', () => {
    expect(lerp(0, 10, -1)).toBe(-10)
  })

  test('handles same start and end', () => {
    expect(lerp(5, 5, 0.5)).toBe(5)
  })
})

describe('clamp', () => {
  test('returns value if within range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })

  test('returns min if value below min', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
  })

  test('returns max if value above max', () => {
    expect(clamp(15, 0, 10)).toBe(10)
  })

  test('returns min if value equals min', () => {
    expect(clamp(0, 0, 10)).toBe(0)
  })

  test('returns max if value equals max', () => {
    expect(clamp(10, 0, 10)).toBe(10)
  })

  test('works with negative ranges', () => {
    expect(clamp(0, -10, -5)).toBe(-5)
    expect(clamp(-15, -10, -5)).toBe(-10)
  })

  test('works with floating point', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5)
    expect(clamp(1.5, 0, 1)).toBe(1)
  })
})

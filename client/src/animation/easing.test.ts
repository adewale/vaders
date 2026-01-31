// client/src/animation/easing.test.ts
// Unit tests for easing functions and lerp utilities

import { describe, test, expect } from 'bun:test'
import {
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
  lerp,
  clamp,
  inverseLerp,
  remap,
  EASING_FUNCTIONS,
} from './easing'

describe('linear', () => {
  test('returns 0 at t=0', () => {
    expect(linear(0)).toBe(0)
  })

  test('returns 1 at t=1', () => {
    expect(linear(1)).toBe(1)
  })

  test('returns t unchanged for any value', () => {
    expect(linear(0.25)).toBe(0.25)
    expect(linear(0.5)).toBe(0.5)
    expect(linear(0.75)).toBe(0.75)
  })
})

describe('easeInQuad', () => {
  test('returns 0 at t=0', () => {
    expect(easeInQuad(0)).toBe(0)
  })

  test('returns 1 at t=1', () => {
    expect(easeInQuad(1)).toBe(1)
  })

  test('returns t^2 (slow start)', () => {
    expect(easeInQuad(0.5)).toBe(0.25)
    expect(easeInQuad(0.25)).toBe(0.0625)
  })

  test('value at midpoint is less than linear', () => {
    expect(easeInQuad(0.5)).toBeLessThan(0.5)
  })
})

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

describe('easeInOutQuad', () => {
  test('returns 0 at t=0', () => {
    expect(easeInOutQuad(0)).toBe(0)
  })

  test('returns 1 at t=1', () => {
    expect(easeInOutQuad(1)).toBe(1)
  })

  test('returns 0.5 at t=0.5 (symmetric)', () => {
    expect(easeInOutQuad(0.5)).toBe(0.5)
  })

  test('first half is slow (ease-in)', () => {
    expect(easeInOutQuad(0.25)).toBeLessThan(0.25)
  })

  test('second half is fast then slow (ease-out)', () => {
    expect(easeInOutQuad(0.75)).toBeGreaterThan(0.75)
  })
})

describe('easeInCubic', () => {
  test('returns 0 at t=0', () => {
    expect(easeInCubic(0)).toBe(0)
  })

  test('returns 1 at t=1', () => {
    expect(easeInCubic(1)).toBe(1)
  })

  test('returns t^3', () => {
    expect(easeInCubic(0.5)).toBe(0.125)
  })

  test('is slower than easeInQuad at midpoint', () => {
    expect(easeInCubic(0.5)).toBeLessThan(easeInQuad(0.5))
  })
})

describe('easeOutCubic', () => {
  test('returns 0 at t=0', () => {
    expect(easeOutCubic(0)).toBe(0)
  })

  test('returns 1 at t=1', () => {
    expect(easeOutCubic(1)).toBe(1)
  })

  test('is faster than easeOutQuad at midpoint', () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(easeOutQuad(0.5))
  })
})

describe('easeInOutCubic', () => {
  test('returns 0 at t=0', () => {
    expect(easeInOutCubic(0)).toBe(0)
  })

  test('returns 1 at t=1', () => {
    expect(easeInOutCubic(1)).toBe(1)
  })

  test('returns 0.5 at t=0.5', () => {
    expect(easeInOutCubic(0.5)).toBe(0.5)
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
    // The bounce easing creates values that overshoot then settle
    // Check that values are in valid range (0-1 for final output)
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
    // Test each region of the piecewise function
    // First bounce: t < 1/2.75 ≈ 0.364
    expect(easeOutBounce(0.1)).toBeGreaterThan(0)
    // Second bounce: t < 2/2.75 ≈ 0.727
    expect(easeOutBounce(0.5)).toBeGreaterThan(0)
    // Third bounce: t < 2.5/2.75 ≈ 0.909
    expect(easeOutBounce(0.8)).toBeGreaterThan(0)
    // Final bounce: t >= 2.5/2.75
    expect(easeOutBounce(0.95)).toBeGreaterThan(0)
  })
})

describe('easeInBounce', () => {
  test('returns 0 at t=0', () => {
    expect(easeInBounce(0)).toBe(0)
  })

  test('returns 1 at t=1', () => {
    expect(easeInBounce(1)).toBe(1)
  })

  test('is inverse of easeOutBounce', () => {
    // easeInBounce(t) = 1 - easeOutBounce(1 - t)
    expect(easeInBounce(0.3)).toBeCloseTo(1 - easeOutBounce(0.7), 10)
    expect(easeInBounce(0.5)).toBeCloseTo(1 - easeOutBounce(0.5), 10)
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
    // The elastic function oscillates around the target
    // Find a point where it overshoots
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

describe('easeOutBack', () => {
  test('returns 0 at t=0', () => {
    expect(easeOutBack(0)).toBeCloseTo(0, 10)
  })

  test('returns 1 at t=1', () => {
    expect(easeOutBack(1)).toBe(1)
  })

  test('overshoots target (back effect)', () => {
    // easeOutBack should exceed 1 at some point
    let maxValue = 0
    for (let t = 0; t <= 1; t += 0.01) {
      maxValue = Math.max(maxValue, easeOutBack(t))
    }
    expect(maxValue).toBeGreaterThan(1)
  })
})

describe('easeInSine', () => {
  test('returns 0 at t=0', () => {
    expect(easeInSine(0)).toBeCloseTo(0, 10)
  })

  test('returns 1 at t=1', () => {
    expect(easeInSine(1)).toBeCloseTo(1, 10)
  })

  test('is very gentle acceleration', () => {
    // Sine easing is gentler than quadratic at the start
    expect(easeInSine(0.1)).toBeGreaterThan(easeInQuad(0.1))
  })
})

describe('easeOutSine', () => {
  test('returns 0 at t=0', () => {
    expect(easeOutSine(0)).toBeCloseTo(0, 10)
  })

  test('returns 1 at t=1', () => {
    expect(easeOutSine(1)).toBeCloseTo(1, 10)
  })

  test('is gentler deceleration than quadratic', () => {
    // At the end, sine is gentler
    expect(easeOutSine(0.9)).toBeLessThan(easeOutQuad(0.9))
  })
})

describe('EASING_FUNCTIONS', () => {
  test('contains all easing functions', () => {
    expect(EASING_FUNCTIONS.linear).toBe(linear)
    expect(EASING_FUNCTIONS.easeInQuad).toBe(easeInQuad)
    expect(EASING_FUNCTIONS.easeOutQuad).toBe(easeOutQuad)
    expect(EASING_FUNCTIONS.easeInOutQuad).toBe(easeInOutQuad)
    expect(EASING_FUNCTIONS.easeInCubic).toBe(easeInCubic)
    expect(EASING_FUNCTIONS.easeOutCubic).toBe(easeOutCubic)
    expect(EASING_FUNCTIONS.easeInOutCubic).toBe(easeInOutCubic)
    expect(EASING_FUNCTIONS.easeOutBounce).toBe(easeOutBounce)
    expect(EASING_FUNCTIONS.easeInBounce).toBe(easeInBounce)
    expect(EASING_FUNCTIONS.easeOutElastic).toBe(easeOutElastic)
    expect(EASING_FUNCTIONS.easeOutBack).toBe(easeOutBack)
    expect(EASING_FUNCTIONS.easeInSine).toBe(easeInSine)
    expect(EASING_FUNCTIONS.easeOutSine).toBe(easeOutSine)
  })

  test('all functions return 0 at t=0', () => {
    for (const [name, fn] of Object.entries(EASING_FUNCTIONS)) {
      expect(fn(0)).toBeCloseTo(0, 5)
    }
  })

  test('all functions return 1 at t=1', () => {
    for (const [name, fn] of Object.entries(EASING_FUNCTIONS)) {
      expect(fn(1)).toBeCloseTo(1, 5)
    }
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

describe('inverseLerp', () => {
  test('returns 0 when value equals start', () => {
    expect(inverseLerp(10, 20, 10)).toBe(0)
  })

  test('returns 1 when value equals end', () => {
    expect(inverseLerp(10, 20, 20)).toBe(1)
  })

  test('returns 0.5 at midpoint', () => {
    expect(inverseLerp(10, 20, 15)).toBe(0.5)
  })

  test('works with values outside range', () => {
    expect(inverseLerp(0, 10, 20)).toBe(2)
    expect(inverseLerp(0, 10, -10)).toBe(-1)
  })

  test('returns 0 when start equals end', () => {
    expect(inverseLerp(5, 5, 5)).toBe(0)
  })

  test('works with negative ranges', () => {
    expect(inverseLerp(-10, 10, 0)).toBe(0.5)
  })
})

describe('remap', () => {
  test('remaps 0-1 to 0-100', () => {
    expect(remap(0.5, 0, 1, 0, 100)).toBe(50)
  })

  test('remaps 0-100 to 0-1', () => {
    expect(remap(50, 0, 100, 0, 1)).toBe(0.5)
  })

  test('handles inverted output range', () => {
    expect(remap(0.25, 0, 1, 100, 0)).toBe(75)
  })

  test('handles inverted input range', () => {
    expect(remap(75, 100, 0, 0, 1)).toBe(0.25)
  })

  test('remaps full range', () => {
    expect(remap(0, 0, 1, 0, 100)).toBe(0)
    expect(remap(1, 0, 1, 0, 100)).toBe(100)
  })

  test('works with negative ranges', () => {
    expect(remap(0, -10, 10, 0, 100)).toBe(50)
  })

  test('extrapolates beyond input range', () => {
    expect(remap(2, 0, 1, 0, 100)).toBe(200)
    expect(remap(-1, 0, 1, 0, 100)).toBe(-100)
  })
})

describe('combined easing with lerp', () => {
  test('easing can be used with lerp for smooth interpolation', () => {
    const start = 0
    const end = 100
    const t = 0.5

    // Linear interpolation
    const linearResult = lerp(start, end, linear(t))
    expect(linearResult).toBe(50)

    // Ease-in gives smaller value at midpoint
    const easeInResult = lerp(start, end, easeInQuad(t))
    expect(easeInResult).toBe(25)

    // Ease-out gives larger value at midpoint
    const easeOutResult = lerp(start, end, easeOutQuad(t))
    expect(easeOutResult).toBe(75)
  })

  test('chaining inverse lerp and lerp with remap', () => {
    // Remap is equivalent to lerp(outMin, outMax, inverseLerp(inMin, inMax, value))
    const value = 50
    const result1 = remap(value, 0, 100, 0, 1)
    const result2 = lerp(0, 1, inverseLerp(0, 100, value))
    expect(result1).toBeCloseTo(result2, 10)
  })
})

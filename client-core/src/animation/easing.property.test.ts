// client-core/src/animation/easing.property.test.ts
// Property-based tests for easing and interpolation utilities

import { describe, it, expect } from 'bun:test'
import fc from 'fast-check'
import { easeOutQuad, easeOutBounce, easeOutElastic, lerp, clamp } from './easing'

// Arbitrary for values in [0, 1]
const arbUnitInterval = fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true })

// Arbitrary for finite doubles (no NaN/Infinity/-0)
const arbFinite = fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e6, max: 1e6 }).map((v) => (v === 0 ? 0 : v))

describe('easeOutQuad (property-based)', () => {
  it('boundary: f(0) = 0 and f(1) = 1', () => {
    expect(easeOutQuad(0)).toBe(0)
    expect(easeOutQuad(1)).toBe(1)
  })

  it('output is in [0, 1] for all t in [0, 1]', () => {
    fc.assert(
      fc.property(arbUnitInterval, (t) => {
        const result = easeOutQuad(t)
        expect(result).toBeGreaterThanOrEqual(0)
        expect(result).toBeLessThanOrEqual(1)
      }),
    )
  })

  it('is monotonically non-decreasing for t in [0, 1]', () => {
    fc.assert(
      fc.property(arbUnitInterval, arbUnitInterval, (a, b) => {
        const lo = Math.min(a, b)
        const hi = Math.max(a, b)
        expect(easeOutQuad(hi)).toBeGreaterThanOrEqual(easeOutQuad(lo))
      }),
    )
  })
})

describe('easeOutBounce (property-based)', () => {
  it('boundary: f(0) = 0 and f(1) = 1', () => {
    expect(easeOutBounce(0)).toBe(0)
    expect(easeOutBounce(1)).toBe(1)
  })

  it('output is in [0, 1] for all t in [0, 1]', () => {
    fc.assert(
      fc.property(arbUnitInterval, (t) => {
        const result = easeOutBounce(t)
        expect(result).toBeGreaterThanOrEqual(0)
        expect(result).toBeLessThanOrEqual(1)
      }),
    )
  })
})

describe('easeOutElastic (property-based)', () => {
  it('boundary: f(0) = 0 and f(1) = 1', () => {
    expect(easeOutElastic(0)).toBe(0)
    expect(easeOutElastic(1)).toBe(1)
  })

  it('output converges to 1 — final quarter is within [0.9, 1.1]', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.75, max: 1, noNaN: true, noDefaultInfinity: true }), (t) => {
        const result = easeOutElastic(t)
        expect(result).toBeGreaterThanOrEqual(0.9)
        expect(result).toBeLessThanOrEqual(1.1)
      }),
    )
  })
})

describe('lerp (property-based)', () => {
  it('lerp(a, a, t) = a for any t', () => {
    fc.assert(
      fc.property(arbFinite, arbUnitInterval, (a, t) => {
        expect(lerp(a, a, t)).toBe(a)
      }),
    )
  })

  it('lerp(a, b, 0) = a', () => {
    fc.assert(
      fc.property(arbFinite, arbFinite, (a, b) => {
        expect(lerp(a, b, 0)).toBe(a)
      }),
    )
  })

  it('lerp(a, b, 1) = b', () => {
    fc.assert(
      fc.property(arbFinite, arbFinite, (a, b) => {
        expect(lerp(a, b, 1)).toBeCloseTo(b, 6)
      }),
    )
  })

  it('lerp(a, b, 0.5) = midpoint of a and b', () => {
    fc.assert(
      fc.property(arbFinite, arbFinite, (a, b) => {
        expect(lerp(a, b, 0.5)).toBeCloseTo((a + b) / 2, 6)
      }),
    )
  })

  it('result is between a and b for t in [0, 1] (when a <= b)', () => {
    fc.assert(
      fc.property(arbFinite, arbFinite, arbUnitInterval, (x, y, t) => {
        const a = Math.min(x, y)
        const b = Math.max(x, y)
        const result = lerp(a, b, t)
        expect(result).toBeGreaterThanOrEqual(a - 1e-9)
        expect(result).toBeLessThanOrEqual(b + 1e-9)
      }),
    )
  })
})

describe('clamp (property-based)', () => {
  it('output is always within [min, max]', () => {
    fc.assert(
      fc.property(arbFinite, arbFinite, arbFinite, (v, x, y) => {
        const min = Math.min(x, y)
        const max = Math.max(x, y)
        const result = clamp(v, min, max)
        expect(result).toBeGreaterThanOrEqual(min)
        expect(result).toBeLessThanOrEqual(max)
      }),
    )
  })

  it('is idempotent: clamp(clamp(v, min, max), min, max) = clamp(v, min, max)', () => {
    fc.assert(
      fc.property(arbFinite, arbFinite, arbFinite, (v, x, y) => {
        const min = Math.min(x, y)
        const max = Math.max(x, y)
        const once = clamp(v, min, max)
        const twice = clamp(once, min, max)
        expect(twice).toBe(once)
      }),
    )
  })

  it('is identity when value is already in range', () => {
    fc.assert(
      fc.property(arbFinite, arbFinite, arbFinite, (_v, x, y) => {
        const min = Math.min(x, y)
        const max = Math.max(x, y)
        // Pick a value guaranteed to be in range
        const inRange = lerp(min, max, 0.5)
        expect(clamp(inRange, min, max)).toBeCloseTo(inRange, 10)
      }),
    )
  })
})

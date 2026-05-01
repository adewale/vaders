// client/src/animation/starfield.property.test.ts
// Property-based tests for StarfieldSystem

import { describe, it, expect } from 'bun:test'
import fc from 'fast-check'
import { StarfieldSystem, STAR_LAYERS, type StarLayer } from './starfield'

describe('StarfieldSystem (property-based)', () => {
  // Arbitrary for valid starfield configs
  const arbConfig = fc.record({
    width: fc.integer({ min: 10, max: 200 }),
    height: fc.integer({ min: 5, max: 60 }),
    density: fc.double({ min: 0.005, max: 0.05, noNaN: true }),
  })

  // Arbitrary for a valid hex color string
  const arbHexColor = fc
    .tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }))
    .map(
      ([r, g, b]) =>
        `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`,
    )

  // Arbitrary for a valid single-layer system
  const arbLayer: fc.Arbitrary<StarLayer> = fc.record({
    ramp: fc.array(arbHexColor, { minLength: 2, maxLength: 8 }),
    ticksPerStep: fc.integer({ min: 5, max: 50 }),
    weight: fc.constant(1.0),
  })

  it('no star is ever out of bounds for any valid config', () => {
    fc.assert(
      fc.property(arbConfig, ({ width, height, density }) => {
        const system = new StarfieldSystem({ width, height, density })
        const cells = system.getCells(0)
        for (const cell of cells) {
          expect(cell.x).toBeGreaterThanOrEqual(0)
          expect(cell.x).toBeLessThan(width)
          expect(cell.y).toBeGreaterThanOrEqual(0)
          expect(cell.y).toBeLessThan(height)
        }
      }),
    )
  })

  it('star count never exceeds density * area', () => {
    fc.assert(
      fc.property(arbConfig, ({ width, height, density }) => {
        const system = new StarfieldSystem({ width, height, density })
        const maxExpected = Math.round(width * height * density)
        expect(system.starCount).toBeLessThanOrEqual(maxExpected)
      }),
    )
  })

  it('all output colors come from their layer ramps for any tick', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10000 }), (tick) => {
        const system = new StarfieldSystem()
        const allColors = new Set(STAR_LAYERS.flatMap((l) => l.ramp))
        for (const cell of system.getCells(tick)) {
          expect(allColors.has(cell.color)).toBe(true)
        }
      }),
    )
  })

  it('is deterministic: same config always produces same output for same tick', () => {
    fc.assert(
      fc.property(arbConfig, fc.integer({ min: 0, max: 5000 }), ({ width, height, density }, tick) => {
        const a = new StarfieldSystem({ width, height, density })
        const b = new StarfieldSystem({ width, height, density })
        expect(a.getCells(tick)).toEqual(b.getCells(tick))
      }),
    )
  })

  it('memoization: getCells returns same reference within same slow-tick bucket', () => {
    fc.assert(
      fc.property(arbLayer, fc.integer({ min: 0, max: 500 }), (layer, baseTick) => {
        const system = new StarfieldSystem({}, [layer])
        const ref = system.getCells(baseTick)
        // A tick that's guaranteed to be in the same bucket (offset < ticksPerStep)
        const offset = baseTick % layer.ticksPerStep // how far into current bucket
        const remaining = layer.ticksPerStep - offset - 1 // ticks left in bucket
        if (remaining > 0) {
          expect(system.getCells(baseTick + 1)).toBe(ref)
        }
      }),
    )
  })

  it('all colors cycle through the full ramp given enough ticks', () => {
    fc.assert(
      fc.property(arbLayer, (layer) => {
        const system = new StarfieldSystem({ width: 50, height: 20, density: 0.02 }, [layer])
        const seenColors = new Set<string>()
        // Advance through enough ticks to cover all ramp entries
        for (let step = 0; step < layer.ramp.length; step++) {
          for (const cell of system.getCells(step * layer.ticksPerStep)) {
            seenColors.add(cell.color)
          }
        }
        // All ramp colors should appear at least once
        for (const color of layer.ramp) {
          expect(seenColors.has(color)).toBe(true)
        }
      }),
    )
  })

  it('no duplicate positions in the output', () => {
    fc.assert(
      fc.property(arbConfig, ({ width, height, density }) => {
        const system = new StarfieldSystem({ width, height, density })
        const cells = system.getCells(0)
        const keys = new Set<number>()
        for (const cell of cells) {
          const key = cell.y * width + cell.x
          expect(keys.has(key)).toBe(false)
          keys.add(key)
        }
      }),
    )
  })
})

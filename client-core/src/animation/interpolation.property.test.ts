// client-core/src/animation/interpolation.property.test.ts
// Property-based tests for toRenderPosition and lerpPosition

import { describe, it, expect } from 'bun:test'
import fc from 'fast-check'
import { toRenderPosition, lerpPosition, HALF_BLOCKS, HALF_BLOCKS_ASCII } from './interpolation'

// Use integer-based positions to avoid IEEE 754 edge cases (-0, subnormals)
// that are mathematically valid but not meaningful for game positions
const arbPosition = fc.integer({ min: -50, max: 200 }).map((n) => n + 0.0) // ensure number type
const arbSubPosition = fc.integer({ min: -5000, max: 20000 }).map((n) => n / 100) // 2 decimal places
const arbUnitInterval = fc.integer({ min: 0, max: 1000 }).map((n) => n / 1000)

describe('toRenderPosition (property-based)', () => {
  it('cellX = floor(visualX) and cellY = floor(visualY)', () => {
    fc.assert(
      fc.property(arbSubPosition, arbSubPosition, (vx, vy) => {
        const pos = toRenderPosition(vx, vy)
        expect(pos.cellX).toBe(Math.floor(vx))
        expect(pos.cellY).toBe(Math.floor(vy))
      }),
    )
  })

  it('subX and subY are always in [0, 1)', () => {
    fc.assert(
      fc.property(arbSubPosition, arbSubPosition, (vx, vy) => {
        const pos = toRenderPosition(vx, vy)
        expect(pos.subX).toBeGreaterThanOrEqual(0)
        expect(pos.subX).toBeLessThan(1)
        expect(pos.subY).toBeGreaterThanOrEqual(0)
        expect(pos.subY).toBeLessThan(1)
      }),
    )
  })

  it('cellX + subX reconstructs visualX', () => {
    fc.assert(
      fc.property(arbSubPosition, arbSubPosition, (vx, vy) => {
        const pos = toRenderPosition(vx, vy)
        expect(pos.cellX + pos.subX).toBeCloseTo(vx, 10)
        expect(pos.cellY + pos.subY).toBeCloseTo(vy, 10)
      }),
    )
  })

  it('halfBlock is always one of the valid block characters (Unicode)', () => {
    const validBlocks = new Set([HALF_BLOCKS.full, HALF_BLOCKS.right, HALF_BLOCKS.empty])
    fc.assert(
      fc.property(arbSubPosition, arbSubPosition, (vx, vy) => {
        const pos = toRenderPosition(vx, vy, false)
        expect(validBlocks.has(pos.halfBlock)).toBe(true)
      }),
    )
  })

  it('halfBlock is always one of the valid block characters (ASCII)', () => {
    const validBlocks = new Set([HALF_BLOCKS_ASCII.full, HALF_BLOCKS_ASCII.right, HALF_BLOCKS_ASCII.empty])
    fc.assert(
      fc.property(arbSubPosition, arbSubPosition, (vx, vy) => {
        const pos = toRenderPosition(vx, vy, true)
        expect(validBlocks.has(pos.halfBlock)).toBe(true)
      }),
    )
  })

  it('hasSubCellOffset is consistent with subX and subY values', () => {
    fc.assert(
      fc.property(arbSubPosition, arbSubPosition, (vx, vy) => {
        const pos = toRenderPosition(vx, vy)
        const expected = pos.subX > 0.1 || pos.subY > 0.1
        expect(pos.hasSubCellOffset).toBe(expected)
      }),
    )
  })

  it('integer positions have no sub-cell offset', () => {
    fc.assert(
      fc.property(fc.integer({ min: -50, max: 200 }), fc.integer({ min: -50, max: 200 }), (x, y) => {
        const pos = toRenderPosition(x, y)
        expect(pos.subX).toBe(0)
        expect(pos.subY).toBe(0)
        expect(pos.hasSubCellOffset).toBe(false)
      }),
    )
  })
})

describe('lerpPosition (property-based)', () => {
  it('at t=0 returns prev position', () => {
    fc.assert(
      fc.property(arbPosition, arbPosition, arbPosition, arbPosition, (px, py, cx, cy) => {
        const { x, y } = lerpPosition(px, py, cx, cy, 0)
        expect(x).toBeCloseTo(px, 10)
        expect(y).toBeCloseTo(py, 10)
      }),
    )
  })

  it('at t=1 returns current position', () => {
    fc.assert(
      fc.property(arbPosition, arbPosition, arbPosition, arbPosition, (px, py, cx, cy) => {
        const { x, y } = lerpPosition(px, py, cx, cy, 1)
        expect(x).toBeCloseTo(cx, 6)
        expect(y).toBeCloseTo(cy, 6)
      }),
    )
  })

  it('result is between prev and current for t in [0, 1]', () => {
    fc.assert(
      fc.property(arbPosition, arbPosition, arbPosition, arbPosition, arbUnitInterval, (px, py, cx, cy, t) => {
        const { x, y } = lerpPosition(px, py, cx, cy, t)
        expect(x).toBeGreaterThanOrEqual(Math.min(px, cx) - 1e-9)
        expect(x).toBeLessThanOrEqual(Math.max(px, cx) + 1e-9)
        expect(y).toBeGreaterThanOrEqual(Math.min(py, cy) - 1e-9)
        expect(y).toBeLessThanOrEqual(Math.max(py, cy) + 1e-9)
      }),
    )
  })

  it('lerp from a point to itself returns that point', () => {
    fc.assert(
      fc.property(arbPosition, arbPosition, arbUnitInterval, (px, py, t) => {
        const { x, y } = lerpPosition(px, py, px, py, t)
        expect(x).toBeCloseTo(px, 10)
        expect(y).toBeCloseTo(py, 10)
      }),
    )
  })
})

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { _computeScale } from './useCanvasScale'

describe('computeScale', () => {
  it('caps scale when viewport is much larger than canvas', () => {
    // Canvas is 800x600, viewport is 3200x2400 (4x larger)
    const result = _computeScale(800, 600, 3200, 2400)
    expect(result.scale).toBe(4)
    expect(result.scale).toBeGreaterThan(0)
    expect(result.offsetX).toBeGreaterThanOrEqual(0)
    expect(result.offsetY).toBeGreaterThanOrEqual(0)
  })

  it('scales by width when viewport is narrow', () => {
    // Canvas is 800x600, viewport is 400x2000 (narrow but tall)
    const result = _computeScale(800, 600, 400, 2000)
    expect(result.scale).toBeCloseTo(0.5)
    expect(result.offsetX).toBe(0) // width-limited, no horizontal offset
    expect(result.offsetY).toBeGreaterThan(0) // vertical centering offset
    // Verify the scale is width-driven (scaleX < scaleY)
    expect(400 / 800).toBeLessThan(2000 / 600)
  })

  it('scales by height when viewport is short', () => {
    // Canvas is 800x600, viewport is 4000x300 (wide but short)
    const result = _computeScale(800, 600, 4000, 300)
    expect(result.scale).toBeCloseTo(0.5)
    expect(result.offsetX).toBeGreaterThan(0) // horizontal centering offset
    expect(result.offsetY).toBe(0) // height-limited, no vertical offset
    // Verify the scale is height-driven (scaleY < scaleX)
    expect(300 / 600).toBeLessThan(4000 / 800)
  })

  it('returns scale = 1 when viewport exactly matches canvas', () => {
    const result = _computeScale(800, 600, 800, 600)
    expect(result.scale).toBe(1)
    expect(result.offsetX).toBe(0)
    expect(result.offsetY).toBe(0)
  })

  it('property: scale is always > 0 for positive dimensions', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 10000 }),
        (cw, ch, vw, vh) => {
          const result = _computeScale(cw, ch, vw, vh)
          expect(result.scale).toBeGreaterThan(0)
          // Floating point arithmetic can produce tiny negative offsets (e.g. -8.8e-16)
          expect(result.offsetX).toBeGreaterThanOrEqual(-1e-10)
          expect(result.offsetY).toBeGreaterThanOrEqual(-1e-10)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('property: scaled canvas fits within viewport', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 10000 }),
        (cw, ch, vw, vh) => {
          const result = _computeScale(cw, ch, vw, vh)
          const scaledW = cw * result.scale
          const scaledH = ch * result.scale
          // Scaled canvas must not exceed viewport (within floating point tolerance)
          expect(scaledW).toBeLessThanOrEqual(vw + 0.001)
          expect(scaledH).toBeLessThanOrEqual(vh + 0.001)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('centering offsets place scaled canvas in the middle', () => {
    const result = _computeScale(400, 300, 1200, 300)
    // Height-limited: scale = 1, offsetX = (1200 - 400) / 2 = 400
    expect(result.scale).toBe(1)
    expect(result.offsetX).toBe(400)
    expect(result.offsetY).toBe(0)
  })
})

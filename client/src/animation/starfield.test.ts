// client/src/animation/starfield.test.ts
import { describe, it, expect } from 'bun:test'
import { StarfieldSystem, STAR_LAYERS, type StarLayer } from './starfield'

describe('StarfieldSystem', () => {
  it('generates expected star count within bounds', () => {
    const system = new StarfieldSystem({ width: 120, height: 34, density: 0.01 })
    const expected = Math.round(120 * 34 * 0.01) // ~41
    // Allow some variance from collision dedup
    expect(system.starCount).toBeGreaterThan(expected * 0.8)
    expect(system.starCount).toBeLessThanOrEqual(expected)
  })

  it('is deterministic — same config produces same positions', () => {
    const a = new StarfieldSystem({ width: 120, height: 34 })
    const b = new StarfieldSystem({ width: 120, height: 34 })
    expect(a.getCells(0)).toEqual(b.getCells(0))
  })

  it('stars have varying phase offsets', () => {
    const system = new StarfieldSystem({ width: 120, height: 34 })
    const cells = system.getCells(0)
    const colors = new Set(cells.map(c => c.color))
    expect(colors.size).toBeGreaterThan(1)
  })

  it('color cycles — different slow ticks produce different colors', () => {
    // Use a single-layer system with known ticksPerStep for predictability
    const layer: StarLayer = {
      ramp: ['#111111', '#222222', '#333333'],
      ticksPerStep: 10,
      weight: 1.0,
    }
    const system = new StarfieldSystem({}, [layer])
    const cells0 = system.getCells(0)
    const cells1 = system.getCells(10) // next slow tick
    const changed = cells0.some((c, i) => c.color !== cells1[i].color)
    expect(changed).toBe(true)
  })

  it('memoization — same slow tick returns same reference', () => {
    const system = new StarfieldSystem()
    const a = system.getCells(0)
    const b = system.getCells(1) // still in same slow tick for all layers
    expect(a).toBe(b) // exact same reference
  })

  it('ASCII mode uses period, Unicode uses middle dot', () => {
    const unicode = new StarfieldSystem({ unicode: true })
    const ascii = new StarfieldSystem({ unicode: false })
    expect(unicode.getCells(0)[0].char).toBe('\u00B7')
    expect(ascii.getCells(0)[0].char).toBe('.')
  })

  it('no star is out of bounds', () => {
    const w = 120, h = 34
    const system = new StarfieldSystem({ width: w, height: h })
    for (const cell of system.getCells(0)) {
      expect(cell.x).toBeGreaterThanOrEqual(0)
      expect(cell.x).toBeLessThan(w)
      expect(cell.y).toBeGreaterThanOrEqual(0)
      expect(cell.y).toBeLessThan(h)
    }
  })

  it('all colors come from their layer ramp', () => {
    const system = new StarfieldSystem()
    const allRampColors = new Set(STAR_LAYERS.flatMap(l => l.ramp))
    for (const cell of system.getCells(0)) {
      expect(allRampColors.has(cell.color)).toBe(true)
    }
  })

  // ─── New: depth layer tests ───────────────────────────────────────────────

  it('distributes stars across all layers', () => {
    const system = new StarfieldSystem({ width: 120, height: 34, density: 0.01 })
    const cells = system.getCells(0)
    // Each layer has distinct ramp colors; check that colors from multiple layers appear
    const layer0colors = new Set(STAR_LAYERS[0].ramp)
    const layer2colors = new Set(STAR_LAYERS[2].ramp)
    const hasLayer0 = cells.some(c => layer0colors.has(c.color))
    const hasLayer2 = cells.some(c => layer2colors.has(c.color))
    expect(hasLayer0).toBe(true)
    expect(hasLayer2).toBe(true)
  })

  it('layers cycle at different speeds (desynchronized)', () => {
    // At tick=15, the near layer (ticksPerStep=15) advances but far layer (28) doesn't
    const system = new StarfieldSystem({ width: 120, height: 34, density: 0.01 })
    const cells0 = system.getCells(0)
    const cells15 = system.getCells(15)

    // Collect colors from far-layer stars (ramp starts with #333366)
    const farRampColors = new Set(STAR_LAYERS[0].ramp)
    const farIndices = cells0.map((c, i) => farRampColors.has(c.color) ? i : -1).filter(i => i >= 0)
    const nearRampColors = new Set(STAR_LAYERS[2].ramp)
    const nearIndices = cells0.map((c, i) => nearRampColors.has(c.color) ? i : -1).filter(i => i >= 0)

    // Far stars should NOT have changed at tick 15 (28 ticks per step)
    const farChanged = farIndices.some(i => cells0[i].color !== cells15[i].color)
    expect(farChanged).toBe(false)

    // Near stars SHOULD have changed at tick 15 (15 ticks per step)
    const nearChanged = nearIndices.some(i => cells0[i].color !== cells15[i].color)
    expect(nearChanged).toBe(true)
  })

  it('near layer ramp includes a bright scintillation spike', () => {
    const nearLayer = STAR_LAYERS[2]
    // The brightest color should be noticeably brighter than the dimmest
    const brightness = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      return r + g + b
    }
    const brightnesses = nearLayer.ramp.map(brightness)
    const range = Math.max(...brightnesses) - Math.min(...brightnesses)
    // Spike should create a significant brightness range
    expect(range).toBeGreaterThan(150)
  })
})

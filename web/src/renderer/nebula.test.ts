import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { NebulaSystem } from './nebula'

describe('NebulaSystem', () => {
  it('getDrawCalls returns 6 clouds', () => {
    const n = new NebulaSystem({ width: 960, height: 576 })
    const calls = n.getDrawCalls(0)
    expect(calls.length).toBe(6)
  })

  it('each draw call has image, x, y and valid alpha', () => {
    const n = new NebulaSystem({ width: 960, height: 576 })
    const calls = n.getDrawCalls(0)
    for (const c of calls) {
      expect(c.image).toBeDefined()
      expect(typeof c.x).toBe('number')
      expect(typeof c.y).toBe('number')
      expect(c.alpha).toBeGreaterThanOrEqual(0.05)
      expect(c.alpha).toBeLessThanOrEqual(0.2)
    }
  })

  it('each draw call declares a composite op (lighter or screen)', () => {
    const n = new NebulaSystem({ width: 960, height: 576 })
    const calls = n.getDrawCalls(0)
    for (const c of calls) {
      expect(['lighter', 'screen']).toContain(c.compositeOp)
    }
  })

  it('mixes both lighter and screen composite ops', () => {
    const n = new NebulaSystem({ width: 960, height: 576 })
    const calls = n.getDrawCalls(0)
    const lighter = calls.filter((c) => c.compositeOp === 'lighter').length
    const screen = calls.filter((c) => c.compositeOp === 'screen').length
    expect(lighter).toBeGreaterThan(0)
    expect(screen).toBeGreaterThan(0)
  })

  it('clouds drift over time (x changes between ticks)', () => {
    const n = new NebulaSystem({ width: 960, height: 576 })
    const t0 = n.getDrawCalls(0).map((c) => c.x)
    const t1 = n.getDrawCalls(100).map((c) => c.x)
    // At least one cloud has moved
    const moved = t0.some((x, i) => x !== t1[i])
    expect(moved).toBe(true)
  })

  it('cloud x positions wrap at screen edges', () => {
    const n = new NebulaSystem({ width: 960, height: 576 })
    // With drift, eventually x should wrap — walking far enough, x stays in bounds.
    const calls = n.getDrawCalls(100000)
    for (const c of calls) {
      // Cloud width ~= width * 0.6 = 576; x wraps into [-cloudW, width)
      expect(c.x).toBeGreaterThanOrEqual(-1024)
      expect(c.x).toBeLessThanOrEqual(960)
    }
  })

  it('PBT: for any tick, all cloud x positions lie within a bounded range (post-wrap)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), (tick) => {
        const n = new NebulaSystem({ width: 960, height: 576 })
        const calls = n.getDrawCalls(tick)
        for (const c of calls) {
          // After wrap, x is within [-cloudWidth, width]
          expect(c.x).toBeGreaterThanOrEqual(-1024)
          expect(c.x).toBeLessThanOrEqual(960 + 1024)
        }
      }),
      { numRuns: 50 },
    )
  })
})

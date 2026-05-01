// Regression tests for the flicker bug caused by Math.random() in the shake
// executor. The pre-fix version re-rolled jitter every rAF frame (~60Hz),
// producing a whole-scene jitter at 24 frames over a 12-tick shake window
// that read as "the screen is flickering". These tests lock in:
//
//   1. Shake displacement is a deterministic function of (tick, shakeTicks).
//      Same inputs => same outputs.
//   2. At a single server tick, the jitter doesn't re-roll across repeated
//      rAF frames — the value is stable until the tick advances.
//   3. Across ticks, jitter values DO change (so the shake still looks like
//      a shake, not a static offset).
//   4. Jitter magnitude never exceeds shakeIntensity.
//   5. When shakeTicks hits 0 the scene is un-translated.

import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import { executeDrawCommands, triggerShake, resetEffects, type DrawCommand } from './canvasRenderer'

/** ctx mock that captures every translate() call so tests can check jitter. */
function makeCtxMock() {
  const translates: Array<{ dx: number; dy: number }> = []
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
    filter: 'none',
    fillStyle: '#000',
    shadowBlur: 0,
    shadowColor: '#000',
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    textAlign: 'start' as CanvasTextAlign,
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn((dx: number, dy: number) => {
      translates.push({ dx, dy })
    }),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    canvas: { width: 960, height: 576 },
  }
  return { ctx, translates }
}

const clearCmd: DrawCommand = { type: 'clear', width: 960, height: 576, fill: '#000' }

describe('shake jitter determinism (no Math.random per rAF)', () => {
  it('given the same tick argument, jitter is bit-identical across repeated calls', () => {
    resetEffects()
    triggerShake(4, 12)
    const { ctx: ctxA, translates: a } = makeCtxMock()
    const { ctx: ctxB, translates: b } = makeCtxMock()
    // Two independent renders at tick=100 must produce the same displacement.
    executeDrawCommands(ctxA as unknown as CanvasRenderingContext2D, [clearCmd], 100)
    executeDrawCommands(ctxB as unknown as CanvasRenderingContext2D, [clearCmd], 100)
    expect(a[0]).toEqual(b[0])
  })

  it('across different ticks, jitter changes (shake looks alive, not static)', () => {
    resetEffects()
    triggerShake(4, 12)
    const samples: Array<{ dx: number; dy: number }> = []
    for (let t = 100; t < 108; t++) {
      const { ctx, translates } = makeCtxMock()
      executeDrawCommands(ctx as unknown as CanvasRenderingContext2D, [clearCmd], t)
      samples.push(translates[0])
    }
    // Not all samples equal — otherwise it's a static offset, not a shake
    const unique = new Set(samples.map((s) => `${s.dx.toFixed(3)},${s.dy.toFixed(3)}`))
    expect(unique.size).toBeGreaterThan(1)
  })

  it('jitter magnitude never exceeds shakeIntensity', () => {
    resetEffects()
    const intensity = 4
    triggerShake(intensity, 12)
    for (let t = 0; t < 200; t++) {
      const { ctx, translates } = makeCtxMock()
      executeDrawCommands(ctx as unknown as CanvasRenderingContext2D, [clearCmd], t)
      if (translates.length === 0) continue
      const { dx, dy } = translates[0]
      expect(Math.abs(dx)).toBeLessThanOrEqual(intensity + 1e-6)
      expect(Math.abs(dy)).toBeLessThanOrEqual(intensity + 1e-6)
    }
  })

  it('no translate is emitted when shakeTicks is 0', () => {
    resetEffects()
    // Never called triggerShake — shakeTicks === 0
    const { ctx, translates } = makeCtxMock()
    executeDrawCommands(ctx as unknown as CanvasRenderingContext2D, [clearCmd], 100)
    expect(translates).toHaveLength(0)
  })

  it('PBT: determinism — (triggerShake params, tick) is a pure function of jitter', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }), // intensity
        fc.integer({ min: 1, max: 30 }), // duration
        fc.integer({ min: 0, max: 10_000 }), // tick
        (intensity, duration, tick) => {
          resetEffects()
          triggerShake(intensity, duration)
          const { ctx: ctxA, translates: a } = makeCtxMock()
          executeDrawCommands(ctxA as unknown as CanvasRenderingContext2D, [clearCmd], tick)
          resetEffects()
          triggerShake(intensity, duration)
          const { ctx: ctxB, translates: b } = makeCtxMock()
          executeDrawCommands(ctxB as unknown as CanvasRenderingContext2D, [clearCmd], tick)
          return JSON.stringify(a) === JSON.stringify(b)
        },
      ),
      { numRuns: 60 },
    )
  })

  it('PBT: jitter magnitude bound holds for arbitrary (intensity, tick)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 0, max: 100_000 }), (intensity, tick) => {
        resetEffects()
        triggerShake(intensity, 12)
        const { ctx, translates } = makeCtxMock()
        executeDrawCommands(ctx as unknown as CanvasRenderingContext2D, [clearCmd], tick)
        if (translates.length === 0) return true
        const { dx, dy } = translates[0]
        return Math.abs(dx) <= intensity + 1e-6 && Math.abs(dy) <= intensity + 1e-6
      }),
      { numRuns: 80 },
    )
  })

  it('PBT: jitter stays bounded + finite at extreme ticks (negative + very large)', () => {
    // Regression guard for the original PBT's gap: `{ min: 0, max: 100_000 }`
    // never exercised negative ticks or the range where sin/cos precision
    // starts to drift. Tests that (a) dx/dy are finite and (b) still
    // bounded by intensity everywhere the renderer can realistically be
    // called with a tick value.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.oneof(
          fc.integer({ min: -1_000_000, max: -1 }), // negative
          fc.integer({ min: 1_000_000, max: 1_000_000_000 }), // very large
          fc.constantFrom(0, 1, -1, Number.MAX_SAFE_INTEGER), // boundary literals
        ),
        (intensity, tick) => {
          resetEffects()
          triggerShake(intensity, 12)
          const { ctx, translates } = makeCtxMock()
          executeDrawCommands(ctx as unknown as CanvasRenderingContext2D, [clearCmd], tick)
          if (translates.length === 0) return true
          const { dx, dy } = translates[0]
          return (
            Number.isFinite(dx) &&
            Number.isFinite(dy) &&
            Math.abs(dx) <= intensity + 1e-6 &&
            Math.abs(dy) <= intensity + 1e-6
          )
        },
      ),
      { numRuns: 60 },
    )
  })
})

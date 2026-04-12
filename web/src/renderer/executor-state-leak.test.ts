// Regression tests for a bug that turned the whole screen white.
//
// Root cause: in executeDrawCommands, the `radial` and `circle` cases set
// ctx.globalCompositeOperation = 'lighter' (for additive explosion glows) but
// only restored the previous value AFTER the drawing code. If the drawing
// threw (or was skipped by the catch block), the composite op leaked. All
// subsequent draws — HUD text, starfield stars, entities — then composited
// additively, saturating the canvas to white.
//
// Fix: save state before try, restore in finally.

import { describe, it, expect, vi } from 'vitest'
import { executeDrawCommands, type DrawCommand } from './canvasRenderer'

/** Minimal canvas 2D context mock that records state mutations. */
function makeCtxMock() {
  const state = {
    globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
    globalAlpha: 1,
    filter: 'none',
    fillStyle: '#000000' as string | CanvasGradient,
  }
  const ctx = {
    get globalCompositeOperation() {
      return state.globalCompositeOperation
    },
    set globalCompositeOperation(v: GlobalCompositeOperation) {
      state.globalCompositeOperation = v
    },
    get globalAlpha() {
      return state.globalAlpha
    },
    set globalAlpha(v: number) {
      state.globalAlpha = v
    },
    get filter() {
      return state.filter
    },
    set filter(v: string) {
      state.filter = v
    },
    get fillStyle() {
      return state.fillStyle
    },
    set fillStyle(v: string | CanvasGradient) {
      state.fillStyle = v
    },
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
  }
  return { ctx, state }
}

describe('executor state leaks (white-screen bug regression)', () => {
  it('globalCompositeOperation is restored to source-over after radial with lighter', () => {
    const { ctx, state } = makeCtxMock()
    const cmd: DrawCommand = {
      type: 'radial',
      cx: 100,
      cy: 100,
      radius: 20,
      stops: [{ offset: 0, color: '#ffffff', alpha: 1 }],
      compositeOp: 'lighter',
    }
    executeDrawCommands(ctx as unknown as CanvasRenderingContext2D, [cmd])
    expect(state.globalCompositeOperation).toBe('source-over')
  })

  it('compositeOp is restored even when createRadialGradient throws', () => {
    const { ctx, state } = makeCtxMock()
    // Simulate a gradient creation failure — must not leak lighter into caller.
    ctx.createRadialGradient = vi.fn(() => {
      throw new Error('gradient failed')
    })
    const cmd: DrawCommand = {
      type: 'radial',
      cx: 100,
      cy: 100,
      radius: 20,
      stops: [{ offset: 0, color: '#ffffff', alpha: 1 }],
      compositeOp: 'lighter',
    }
    executeDrawCommands(ctx as unknown as CanvasRenderingContext2D, [cmd])
    // The critical assertion: lighter must not leak out of the failed draw
    expect(state.globalCompositeOperation).toBe('source-over')
  })

  it('circle restores compositeOp on exception', () => {
    const { ctx, state } = makeCtxMock()
    ctx.arc = vi.fn(() => {
      throw new Error('arc failed')
    })
    const cmd: DrawCommand = {
      type: 'circle',
      cx: 100,
      cy: 100,
      radius: 5,
      fill: '#ff0000',
      compositeOp: 'lighter',
    }
    executeDrawCommands(ctx as unknown as CanvasRenderingContext2D, [cmd])
    expect(state.globalCompositeOperation).toBe('source-over')
  })

  it('ctx.filter (blur) is restored after radial', () => {
    const { ctx, state } = makeCtxMock()
    const cmd: DrawCommand = {
      type: 'radial',
      cx: 100,
      cy: 100,
      radius: 20,
      stops: [{ offset: 0, color: '#ffffff', alpha: 1 }],
      blur: 4,
    }
    executeDrawCommands(ctx as unknown as CanvasRenderingContext2D, [cmd])
    expect(state.filter).toBe('none')
  })

  it('ctx.filter is restored even when arc throws', () => {
    const { ctx, state } = makeCtxMock()
    ctx.arc = vi.fn(() => {
      throw new Error('arc failed')
    })
    const cmd: DrawCommand = {
      type: 'circle',
      cx: 100,
      cy: 100,
      radius: 5,
      fill: '#ff0000',
      blur: 2,
    }
    executeDrawCommands(ctx as unknown as CanvasRenderingContext2D, [cmd])
    expect(state.filter).toBe('none')
  })

  it('ten radial commands in a row leave composite op at source-over', () => {
    const { ctx, state } = makeCtxMock()
    const cmds: DrawCommand[] = Array.from({ length: 10 }, (_, i) => ({
      type: 'radial' as const,
      cx: 100 + i,
      cy: 100,
      radius: 20,
      stops: [{ offset: 0, color: '#ffffff', alpha: 1 }],
      compositeOp: 'lighter' as GlobalCompositeOperation,
    }))
    executeDrawCommands(ctx as unknown as CanvasRenderingContext2D, cmds)
    expect(state.globalCompositeOperation).toBe('source-over')
  })

  it('followup rect after failing radial is NOT drawn with lighter', () => {
    const { ctx, state } = makeCtxMock()
    ctx.createRadialGradient = vi.fn(() => {
      throw new Error('boom')
    })
    let fillRectCompositeOp: GlobalCompositeOperation = 'source-over'
    ctx.fillRect = vi.fn(() => {
      // Capture composite op at the moment of the fillRect call
      fillRectCompositeOp = state.globalCompositeOperation
    })
    const cmds: DrawCommand[] = [
      {
        type: 'radial',
        cx: 100,
        cy: 100,
        radius: 20,
        stops: [{ offset: 0, color: '#ffffff', alpha: 1 }],
        compositeOp: 'lighter',
      },
      { type: 'rect', x: 0, y: 0, width: 10, height: 10, fill: '#fff' },
    ]
    executeDrawCommands(ctx as unknown as CanvasRenderingContext2D, cmds)
    // The rect must have been drawn in normal (source-over) mode, NOT lighter
    expect(fillRectCompositeOp).toBe('source-over')
  })
})

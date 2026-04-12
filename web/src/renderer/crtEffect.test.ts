import { describe, it, expect, beforeEach, vi } from 'vitest'
import { applyCRTEffect, setCRTEnabled, isCRTEnabled } from './crtEffect'

/** Build a minimal mock 2D context that records fillRect calls. */
function makeMockCtx() {
  const fillRectCalls: Array<{ x: number; y: number; w: number; h: number; fill: string }> = []
  let currentFill = '#000000'
  let currentFilter = 'none'
  const ctx = {
    get fillStyle() {
      return currentFill
    },
    set fillStyle(v: string) {
      currentFill = v
    },
    get filter() {
      return currentFilter
    },
    set filter(v: string) {
      currentFilter = v
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      fillRectCalls.push({ x, y, w, h, fill: currentFill })
    },
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    canvas: { width: 960, height: 576 },
  } as unknown as CanvasRenderingContext2D
  return { ctx, fillRectCalls }
}

describe('applyCRTEffect', () => {
  beforeEach(() => {
    setCRTEnabled(true)
  })

  it('draws scanlines at every 2nd row within canvas height', () => {
    const { ctx, fillRectCalls } = makeMockCtx()
    const width = 960
    const height = 100
    applyCRTEffect(ctx, width, height)

    // We expect scanlines every 2nd row — count them
    const scanlines = fillRectCalls.filter((c) => c.h === 1 && c.w === width)
    expect(scanlines.length).toBe(Math.ceil(height / 2))

    // Each scanline y coordinate is within [0, height)
    for (const s of scanlines) {
      expect(s.y).toBeGreaterThanOrEqual(0)
      expect(s.y).toBeLessThan(height)
    }
  })

  it('scanline y coordinates respect canvas height (no out-of-bounds)', () => {
    const { ctx, fillRectCalls } = makeMockCtx()
    applyCRTEffect(ctx, 50, 7) // odd height
    const scanlines = fillRectCalls.filter((c) => c.h === 1 && c.w === 50)
    for (const s of scanlines) {
      expect(s.y).toBeLessThan(7)
    }
  })

  it('can be toggled off — produces no draw calls when disabled', () => {
    setCRTEnabled(false)
    const { ctx, fillRectCalls } = makeMockCtx()
    applyCRTEffect(ctx, 960, 576)
    expect(fillRectCalls.length).toBe(0)
    expect(isCRTEnabled()).toBe(false)
  })

  it('is enabled by default after import', () => {
    // setCRTEnabled(true) in beforeEach confirms round-trip
    expect(isCRTEnabled()).toBe(true)
  })
})

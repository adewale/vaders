// client/src/gradient.test.ts
// TDD tests for gradient color interpolation

import { describe, test, expect } from 'bun:test'
import { interpolateGradient, gradientMultiline, GRADIENT_PRESETS } from './gradient'
import { LOGO_ASCII } from './sprites'

// ─── Helper ─────────────────────────────────────────────────────────────────

/** Parse "#rrggbb" to {r, g, b} in 0-255 range */
function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

/** Check two hex colors are within tolerance (per-channel) */
function colorsClose(a: string, b: string, tolerance = 2): boolean {
  const pa = parseHex(a)
  const pb = parseHex(b)
  return (
    Math.abs(pa.r - pb.r) <= tolerance &&
    Math.abs(pa.g - pb.g) <= tolerance &&
    Math.abs(pa.b - pb.b) <= tolerance
  )
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('interpolateGradient', () => {
  test('returns the requested number of colors', () => {
    const result = interpolateGradient(['#ff0000', '#0000ff'], 5)
    expect(result).toHaveLength(5)
  })

  test('first and last colors match the gradient stops', () => {
    const result = interpolateGradient(['#ff0000', '#0000ff'], 10)
    expect(result[0]).toBe('#ff0000')
    expect(result[9]).toBe('#0000ff')
  })

  test('midpoint between red and blue is purple', () => {
    // Red (#ff0000) to Blue (#0000ff), 3 colors → middle should be #800080
    const result = interpolateGradient(['#ff0000', '#0000ff'], 3)
    expect(result).toHaveLength(3)
    // Middle color: R=127-128, G=0, B=127-128
    const mid = parseHex(result[1])
    expect(mid.r).toBeGreaterThanOrEqual(127)
    expect(mid.r).toBeLessThanOrEqual(128)
    expect(mid.g).toBe(0)
    expect(mid.b).toBeGreaterThanOrEqual(127)
    expect(mid.b).toBeLessThanOrEqual(128)
  })

  test('multi-stop gradient transitions through all stops in order', () => {
    // Red → Green → Blue with 5 colors
    const result = interpolateGradient(['#ff0000', '#00ff00', '#0000ff'], 5)
    expect(result).toHaveLength(5)
    expect(result[0]).toBe('#ff0000')   // Pure red
    expect(result[2]).toBe('#00ff00')   // Pure green (midpoint)
    expect(result[4]).toBe('#0000ff')   // Pure blue
    // Position 1: between red and green
    const c1 = parseHex(result[1])
    expect(c1.r).toBeGreaterThan(0)
    expect(c1.g).toBeGreaterThan(0)
    expect(c1.b).toBe(0)
  })

  test('single color input produces flat array', () => {
    const result = interpolateGradient(['#ff8800'], 5)
    expect(result).toHaveLength(5)
    for (const color of result) {
      expect(color).toBe('#ff8800')
    }
  })

  test('single-character gradient returns the first color', () => {
    const result = interpolateGradient(['#ff0000', '#0000ff'], 1)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe('#ff0000')
  })

  test('empty count returns empty array', () => {
    const result = interpolateGradient(['#ff0000', '#0000ff'], 0)
    expect(result).toHaveLength(0)
  })
})

// ─── Multiline Gradient ─────────────────────────────────────────────────────

describe('gradientMultiline', () => {
  test('same column gets same color across all lines', () => {
    const text = 'AB\nCD'
    const result = gradientMultiline(text, ['#ff0000', '#0000ff'])
    // result is an array of lines, each line is an array of {char, color}
    expect(result).toHaveLength(2)
    // Column 0 on line 0 and line 1 should have the same color
    expect(result[0][0].color).toBe(result[1][0].color)
    // Column 1 should also match
    expect(result[0][1].color).toBe(result[1][1].color)
  })

  test('returns per-character color data for each line', () => {
    const text = 'ABC'
    const result = gradientMultiline(text, ['#ff0000', '#0000ff'])
    expect(result).toHaveLength(1)
    expect(result[0]).toHaveLength(3)
    expect(result[0][0].char).toBe('A')
    expect(result[0][1].char).toBe('B')
    expect(result[0][2].char).toBe('C')
  })

  test('gradient spans the width of the longest line', () => {
    const text = 'ABCDE\nXY'
    const result = gradientMultiline(text, ['#ff0000', '#0000ff'])
    // Line 0 has 5 chars, line 1 has 2 chars
    // Both should use gradient computed for width 5
    expect(result[0][0].color).toBe('#ff0000')  // First column = red
    expect(result[0][4].color).toBe('#0000ff')  // Last column of longest = blue
    // Short line's column 0 matches long line's column 0
    expect(result[1][0].color).toBe(result[0][0].color)
  })

  test('spaces get colored for column alignment', () => {
    const text = 'A B'
    const result = gradientMultiline(text, ['#ff0000', '#0000ff'])
    // Space at position 1 should have a color (not skipped)
    expect(result[0][1].char).toBe(' ')
    expect(result[0][1].color).toBeDefined()
    expect(result[0][1].color.startsWith('#')).toBe(true)
  })
})

// ─── Presets ────────────────────────────────────────────────────────────────

describe('GRADIENT_PRESETS', () => {
  test('all presets have at least 2 color stops', () => {
    for (const [name, stops] of Object.entries(GRADIENT_PRESETS)) {
      expect(stops.length).toBeGreaterThanOrEqual(2)
    }
  })

  test('all preset colors are valid hex', () => {
    const hexPattern = /^#[0-9a-f]{6}$/i
    for (const [name, stops] of Object.entries(GRADIENT_PRESETS)) {
      for (const color of stops) {
        expect(color).toMatch(hexPattern)
      }
    }
  })
})

// ─── Integration: LOGO_ASCII ────────────────────────────────────────────────

describe('gradient applied to LOGO_ASCII', () => {
  test('produces correct number of lines matching the logo', () => {
    const result = gradientMultiline(LOGO_ASCII, GRADIENT_PRESETS.vaders)
    const logoLines = LOGO_ASCII.split('\n')
    expect(result).toHaveLength(logoLines.length)
  })

  test('each line has one colored char per character in the source', () => {
    const result = gradientMultiline(LOGO_ASCII, GRADIENT_PRESETS.vaders)
    const logoLines = LOGO_ASCII.split('\n')
    for (let i = 0; i < logoLines.length; i++) {
      expect(result[i]).toHaveLength(logoLines[i].length)
    }
  })

  test('column 0 color is consistent across all lines', () => {
    const result = gradientMultiline(LOGO_ASCII, GRADIENT_PRESETS.vaders)
    const col0Color = result[0][0].color
    for (let i = 1; i < result.length; i++) {
      if (result[i].length > 0) {
        expect(result[i][0].color).toBe(col0Color)
      }
    }
  })
})

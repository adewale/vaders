// client/src/terminal/color-conversion.property.test.ts
// Property-based tests for color conversion functions

import { describe, it, expect } from 'bun:test'
import fc from 'fast-check'
import { hexTo256Color, hexTo16Color, convertColorForTerminal } from './index'

// Arbitrary for valid hex color strings (#rrggbb)
const arbHexColor = fc
  .tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }))
  .map(
    ([r, g, b]) =>
      `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`,
  )

describe('hexTo256Color (property-based)', () => {
  it('always returns an integer in [16, 255]', () => {
    fc.assert(
      fc.property(arbHexColor, (hex) => {
        const result = hexTo256Color(hex)
        expect(Number.isInteger(result)).toBe(true)
        expect(result).toBeGreaterThanOrEqual(16)
        expect(result).toBeLessThanOrEqual(255)
      }),
    )
  })

  it('is deterministic', () => {
    fc.assert(
      fc.property(arbHexColor, (hex) => {
        expect(hexTo256Color(hex)).toBe(hexTo256Color(hex))
      }),
    )
  })

  it('grayscale inputs (r=g=b) always return a valid index in [16, 255]', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 255 }), (v) => {
        const hex = `#${v.toString(16).padStart(2, '0').repeat(3)}`
        const result = hexTo256Color(hex)
        expect(result).toBeGreaterThanOrEqual(16)
        expect(result).toBeLessThanOrEqual(255)
      }),
    )
  })

  it('non-grayscale inputs map to the 6x6x6 color cube [16, 231]', () => {
    // Generate colors where components differ significantly
    const arbNonGray = fc
      .tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }))
      .filter(([r, g, b]) => Math.abs(r - g) >= 8 || Math.abs(g - b) >= 8)
      .map(
        ([r, g, b]) =>
          `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`,
      )

    fc.assert(
      fc.property(arbNonGray, (hex) => {
        const result = hexTo256Color(hex)
        expect(result).toBeGreaterThanOrEqual(16)
        expect(result).toBeLessThanOrEqual(231)
      }),
    )
  })
})

describe('hexTo16Color (property-based)', () => {
  it('always returns a valid ANSI foreground code: [30-37] or [90-97]', () => {
    fc.assert(
      fc.property(arbHexColor, (hex) => {
        const result = hexTo16Color(hex)
        const isNormal = result >= 30 && result <= 37
        const isBright = result >= 90 && result <= 97
        expect(isNormal || isBright).toBe(true)
      }),
    )
  })

  it('is deterministic', () => {
    fc.assert(
      fc.property(arbHexColor, (hex) => {
        expect(hexTo16Color(hex)).toBe(hexTo16Color(hex))
      }),
    )
  })

  it('pure black maps to a dark code [30-37]', () => {
    const result = hexTo16Color('#000000')
    expect(result).toBeGreaterThanOrEqual(30)
    expect(result).toBeLessThanOrEqual(37)
  })

  it('pure white maps to a bright code [90-97]', () => {
    const result = hexTo16Color('#ffffff')
    expect(result).toBeGreaterThanOrEqual(90)
    expect(result).toBeLessThanOrEqual(97)
  })
})

describe('convertColorForTerminal (property-based)', () => {
  it('true-color terminals pass through hex unchanged', () => {
    const trueColorCaps = { supportsTrueColor: true } as any
    fc.assert(
      fc.property(arbHexColor, (hex) => {
        expect(convertColorForTerminal(hex, trueColorCaps)).toBe(hex)
      }),
    )
  })

  it('256-color terminals produce ansi256:N format with valid N', () => {
    const caps256 = { supportsTrueColor: false } as any
    fc.assert(
      fc.property(arbHexColor, (hex) => {
        const result = convertColorForTerminal(hex, caps256)
        expect(result).toMatch(/^ansi256:\d+$/)
        const n = Number.parseInt(result.split(':')[1], 10)
        expect(n).toBeGreaterThanOrEqual(16)
        expect(n).toBeLessThanOrEqual(255)
      }),
    )
  })
})

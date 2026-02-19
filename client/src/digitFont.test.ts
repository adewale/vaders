// client/src/digitFont.test.ts

import { describe, test, expect } from 'bun:test'
import {
  DIGIT_FONT,
  DIGIT_FONT_ASCII,
  DIGIT_WIDTH,
  DIGIT_HEIGHT,
  DIGIT_GAP,
  composeDigits,
} from './digitFont'

// ─── Font Data ──────────────────────────────────────────────────────────────

describe('DIGIT_FONT', () => {
  const allDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

  test('has glyphs for all 10 digits', () => {
    for (const d of allDigits) {
      expect(DIGIT_FONT[d]).toBeDefined()
    }
  })

  test('each glyph has exactly DIGIT_HEIGHT lines', () => {
    for (const d of allDigits) {
      expect(DIGIT_FONT[d]).toHaveLength(DIGIT_HEIGHT)
    }
  })

  test('each line is exactly DIGIT_WIDTH characters', () => {
    for (const d of allDigits) {
      for (let row = 0; row < DIGIT_HEIGHT; row++) {
        expect(DIGIT_FONT[d][row].length).toBe(DIGIT_WIDTH)
      }
    }
  })
})

describe('DIGIT_FONT_ASCII', () => {
  const allDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

  test('has glyphs for all 10 digits', () => {
    for (const d of allDigits) {
      expect(DIGIT_FONT_ASCII[d]).toBeDefined()
    }
  })

  test('each glyph has exactly DIGIT_HEIGHT lines', () => {
    for (const d of allDigits) {
      expect(DIGIT_FONT_ASCII[d]).toHaveLength(DIGIT_HEIGHT)
    }
  })

  test('each line is exactly DIGIT_WIDTH characters', () => {
    for (const d of allDigits) {
      for (let row = 0; row < DIGIT_HEIGHT; row++) {
        expect(DIGIT_FONT_ASCII[d][row].length).toBe(DIGIT_WIDTH)
      }
    }
  })

  test('uses only ASCII characters (code < 128)', () => {
    for (const d of allDigits) {
      for (const line of DIGIT_FONT_ASCII[d]) {
        for (const ch of line) {
          expect(ch.charCodeAt(0)).toBeLessThan(128)
        }
      }
    }
  })
})

// ─── composeDigits ──────────────────────────────────────────────────────────

describe('composeDigits', () => {
  test('single digit returns correct dimensions', () => {
    const result = composeDigits(5)
    expect(result.width).toBe(DIGIT_WIDTH)
    expect(result.height).toBe(DIGIT_HEIGHT)
  })

  test('two-digit number includes gap between digits', () => {
    const result = composeDigits(12)
    expect(result.width).toBe(DIGIT_WIDTH * 2 + DIGIT_GAP)
    expect(result.height).toBe(DIGIT_HEIGHT)
  })

  test('three-digit number includes two gaps', () => {
    const result = composeDigits(100)
    expect(result.width).toBe(DIGIT_WIDTH * 3 + DIGIT_GAP * 2)
    expect(result.height).toBe(DIGIT_HEIGHT)
  })

  test('text has correct number of lines', () => {
    const result = composeDigits(7)
    const lines = result.text.split('\n')
    expect(lines).toHaveLength(DIGIT_HEIGHT)
  })

  test('each line has width matching the reported width', () => {
    const result = composeDigits(42)
    const lines = result.text.split('\n')
    for (const line of lines) {
      expect(line.length).toBe(result.width)
    }
  })

  test('useAscii flag selects ASCII font', () => {
    const unicode = composeDigits(3, false)
    const ascii = composeDigits(3, true)
    // Both should have the same dimensions
    expect(ascii.width).toBe(unicode.width)
    expect(ascii.height).toBe(unicode.height)
    // But different characters
    expect(ascii.text).not.toBe(unicode.text)
  })

  test('handles zero', () => {
    const result = composeDigits(0)
    expect(result.width).toBe(DIGIT_WIDTH)
    expect(result.height).toBe(DIGIT_HEIGHT)
  })

  test('negative numbers treated as zero', () => {
    const result = composeDigits(-5)
    expect(result.width).toBe(DIGIT_WIDTH)
  })

  test('float input is floored to integer', () => {
    const result = composeDigits(3.7)
    const expected = composeDigits(3)
    expect(result.text).toBe(expected.text)
    expect(result.width).toBe(expected.width)
  })

  test('NaN input produces digit 0', () => {
    const result = composeDigits(NaN)
    const expected = composeDigits(0)
    expect(result.text).toBe(expected.text)
    expect(result.width).toBe(DIGIT_WIDTH)
  })

  test('Infinity input produces digit 0', () => {
    const result = composeDigits(Infinity)
    const expected = composeDigits(0)
    expect(result.text).toBe(expected.text)
    expect(result.width).toBe(DIGIT_WIDTH)
  })

  test('negative Infinity input produces digit 0', () => {
    const result = composeDigits(-Infinity)
    const expected = composeDigits(0)
    expect(result.text).toBe(expected.text)
    expect(result.width).toBe(DIGIT_WIDTH)
  })
})

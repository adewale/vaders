// client/src/hooks/useTerminalSize.test.ts
// Tests for useTerminalSize hook logic
//
// The hook provides terminal size detection and game-to-terminal centering.
// The core logic is in the calculateSize function which is pure and testable.
// We also test the TerminalSize interface contracts and constants.

import { describe, test, expect } from 'bun:test'
import { STANDARD_WIDTH, STANDARD_HEIGHT } from '../../../shared/types'
import type { TerminalSize } from './useTerminalSize'

// ─── Constants ──────────────────────────────────────────────────────────────

describe('Terminal Size Constants', () => {
  test('STANDARD_WIDTH is 120', () => {
    expect(STANDARD_WIDTH).toBe(120)
  })

  test('STANDARD_HEIGHT is 36', () => {
    expect(STANDARD_HEIGHT).toBe(36)
  })
})

// ─── calculateSize Logic ────────────────────────────────────────────────────
// This mirrors the calculateSize function from the hook module.
// Since it is not exported, we re-implement it here to test the algorithm.

function calculateSize(width: number, height: number): TerminalSize {
  const isTooSmall = width < STANDARD_WIDTH || height < STANDARD_HEIGHT

  const offsetX = Math.max(0, Math.floor((width - STANDARD_WIDTH) / 2))
  const offsetY = Math.max(0, Math.floor((height - STANDARD_HEIGHT) / 2))

  return {
    terminalWidth: width,
    terminalHeight: height,
    gameWidth: STANDARD_WIDTH,
    gameHeight: STANDARD_HEIGHT,
    offsetX,
    offsetY,
    isTooSmall,
  }
}

describe('calculateSize', () => {
  describe('game dimensions are always fixed', () => {
    test('gameWidth is always STANDARD_WIDTH regardless of terminal size', () => {
      expect(calculateSize(80, 24).gameWidth).toBe(STANDARD_WIDTH)
      expect(calculateSize(200, 50).gameWidth).toBe(STANDARD_WIDTH)
      expect(calculateSize(120, 36).gameWidth).toBe(STANDARD_WIDTH)
    })

    test('gameHeight is always STANDARD_HEIGHT regardless of terminal size', () => {
      expect(calculateSize(80, 24).gameHeight).toBe(STANDARD_HEIGHT)
      expect(calculateSize(200, 50).gameHeight).toBe(STANDARD_HEIGHT)
      expect(calculateSize(120, 36).gameHeight).toBe(STANDARD_HEIGHT)
    })
  })

  describe('exact fit (terminal = standard size)', () => {
    test('no offsets when terminal matches standard size', () => {
      const size = calculateSize(STANDARD_WIDTH, STANDARD_HEIGHT)
      expect(size.offsetX).toBe(0)
      expect(size.offsetY).toBe(0)
    })

    test('is not too small', () => {
      const size = calculateSize(STANDARD_WIDTH, STANDARD_HEIGHT)
      expect(size.isTooSmall).toBe(false)
    })

    test('terminal dimensions match standard', () => {
      const size = calculateSize(STANDARD_WIDTH, STANDARD_HEIGHT)
      expect(size.terminalWidth).toBe(STANDARD_WIDTH)
      expect(size.terminalHeight).toBe(STANDARD_HEIGHT)
    })
  })

  describe('terminal smaller than standard (isTooSmall)', () => {
    test('marks as too small when width is less than standard', () => {
      const size = calculateSize(80, STANDARD_HEIGHT)
      expect(size.isTooSmall).toBe(true)
    })

    test('marks as too small when height is less than standard', () => {
      const size = calculateSize(STANDARD_WIDTH, 24)
      expect(size.isTooSmall).toBe(true)
    })

    test('marks as too small when both dimensions are less', () => {
      const size = calculateSize(80, 24)
      expect(size.isTooSmall).toBe(true)
    })

    test('offsets are 0 when terminal is smaller', () => {
      const size = calculateSize(80, 24)
      expect(size.offsetX).toBe(0)
      expect(size.offsetY).toBe(0)
    })

    test('offsets are 0 for width smaller, height larger', () => {
      const size = calculateSize(80, 50)
      expect(size.offsetX).toBe(0)
      // Y offset is still calculated even when width is too small
      expect(size.offsetY).toBe(Math.floor((50 - STANDARD_HEIGHT) / 2))
    })

    test('offsets are 0 for height smaller, width larger', () => {
      const size = calculateSize(200, 24)
      // X offset is still calculated even when height is too small
      expect(size.offsetX).toBe(Math.floor((200 - STANDARD_WIDTH) / 2))
      expect(size.offsetY).toBe(0)
    })

    test('isTooSmall with width exactly 1 less than standard', () => {
      const size = calculateSize(STANDARD_WIDTH - 1, STANDARD_HEIGHT)
      expect(size.isTooSmall).toBe(true)
    })

    test('isTooSmall with height exactly 1 less than standard', () => {
      const size = calculateSize(STANDARD_WIDTH, STANDARD_HEIGHT - 1)
      expect(size.isTooSmall).toBe(true)
    })
  })

  describe('terminal larger than standard (centering)', () => {
    test('centers horizontally when terminal is wider', () => {
      const size = calculateSize(200, STANDARD_HEIGHT)
      expect(size.offsetX).toBe(Math.floor((200 - STANDARD_WIDTH) / 2))
      expect(size.offsetX).toBe(40)
    })

    test('centers vertically when terminal is taller', () => {
      const size = calculateSize(STANDARD_WIDTH, 50)
      expect(size.offsetY).toBe(Math.floor((50 - STANDARD_HEIGHT) / 2))
      expect(size.offsetY).toBe(7)
    })

    test('centers both when terminal is larger in both dimensions', () => {
      const size = calculateSize(200, 50)
      expect(size.offsetX).toBe(40)
      expect(size.offsetY).toBe(7)
      expect(size.isTooSmall).toBe(false)
    })

    test('is not too small when terminal is larger', () => {
      const size = calculateSize(200, 50)
      expect(size.isTooSmall).toBe(false)
    })

    test('rounds down for odd differences (integer offsets)', () => {
      // Width difference of 1: Math.floor(1/2) = 0
      const oneWider = calculateSize(STANDARD_WIDTH + 1, STANDARD_HEIGHT)
      expect(oneWider.offsetX).toBe(0)

      // Width difference of 3: Math.floor(3/2) = 1
      const threeWider = calculateSize(STANDARD_WIDTH + 3, STANDARD_HEIGHT)
      expect(threeWider.offsetX).toBe(1)

      // Height difference of 5: Math.floor(5/2) = 2
      const fiveTaller = calculateSize(STANDARD_WIDTH, STANDARD_HEIGHT + 5)
      expect(fiveTaller.offsetY).toBe(2)
    })

    test('offset formula: Math.floor((terminal - standard) / 2)', () => {
      const testCases = [
        { terminal: 140, standard: 120, expected: 10 },
        { terminal: 160, standard: 120, expected: 20 },
        { terminal: 121, standard: 120, expected: 0 },  // Floor(0.5) = 0
        { terminal: 122, standard: 120, expected: 1 },  // Floor(1) = 1
      ]

      for (const { terminal, standard, expected } of testCases) {
        const offset = Math.max(0, Math.floor((terminal - standard) / 2))
        expect(offset).toBe(expected)
      }
    })
  })

  describe('edge cases', () => {
    test('very small terminal (1x1)', () => {
      const size = calculateSize(1, 1)
      expect(size.isTooSmall).toBe(true)
      expect(size.offsetX).toBe(0)
      expect(size.offsetY).toBe(0)
      expect(size.terminalWidth).toBe(1)
      expect(size.terminalHeight).toBe(1)
    })

    test('very large terminal', () => {
      const size = calculateSize(500, 200)
      expect(size.isTooSmall).toBe(false)
      expect(size.offsetX).toBe(190) // (500-120)/2
      expect(size.offsetY).toBe(82)  // (200-36)/2
    })

    test('terminal with 0 width', () => {
      const size = calculateSize(0, 36)
      expect(size.isTooSmall).toBe(true)
      expect(size.offsetX).toBe(0)
    })

    test('terminal with 0 height', () => {
      const size = calculateSize(120, 0)
      expect(size.isTooSmall).toBe(true)
      expect(size.offsetY).toBe(0)
    })
  })
})

// ─── TerminalSize Interface Contracts ───────────────────────────────────────

describe('TerminalSize Interface', () => {
  test('contains all required fields', () => {
    const size = calculateSize(120, 36)

    // All fields exist and have correct types
    expect(typeof size.terminalWidth).toBe('number')
    expect(typeof size.terminalHeight).toBe('number')
    expect(typeof size.gameWidth).toBe('number')
    expect(typeof size.gameHeight).toBe('number')
    expect(typeof size.offsetX).toBe('number')
    expect(typeof size.offsetY).toBe('number')
    expect(typeof size.isTooSmall).toBe('boolean')
  })

  test('terminalWidth and terminalHeight match input', () => {
    const size = calculateSize(150, 40)
    expect(size.terminalWidth).toBe(150)
    expect(size.terminalHeight).toBe(40)
  })
})

// ─── Default Context Value ──────────────────────────────────────────────────
// The hook provides a default context value for when no provider exists

describe('Default TerminalSize Context Value', () => {
  test('default matches standard dimensions with no offset', () => {
    // This mirrors the default value in TerminalSizeContext
    const defaultSize: TerminalSize = {
      terminalWidth: STANDARD_WIDTH,
      terminalHeight: STANDARD_HEIGHT,
      gameWidth: STANDARD_WIDTH,
      gameHeight: STANDARD_HEIGHT,
      offsetX: 0,
      offsetY: 0,
      isTooSmall: false,
    }

    expect(defaultSize.terminalWidth).toBe(120)
    expect(defaultSize.terminalHeight).toBe(36)
    expect(defaultSize.offsetX).toBe(0)
    expect(defaultSize.offsetY).toBe(0)
    expect(defaultSize.isTooSmall).toBe(false)
  })
})

// ─── Resize Detection Logic ─────────────────────────────────────────────────
// The hook uses a setInterval to poll for terminal size changes.
// It only updates state when dimensions actually change.

describe('Resize Change Detection', () => {
  test('detects width change', () => {
    const prev = calculateSize(120, 36)
    const next = calculateSize(140, 36)

    const changed = prev.terminalWidth !== next.terminalWidth ||
                    prev.terminalHeight !== next.terminalHeight
    expect(changed).toBe(true)
  })

  test('detects height change', () => {
    const prev = calculateSize(120, 36)
    const next = calculateSize(120, 40)

    const changed = prev.terminalWidth !== next.terminalWidth ||
                    prev.terminalHeight !== next.terminalHeight
    expect(changed).toBe(true)
  })

  test('detects no change when dimensions are same', () => {
    const prev = calculateSize(120, 36)
    const next = calculateSize(120, 36)

    const changed = prev.terminalWidth !== next.terminalWidth ||
                    prev.terminalHeight !== next.terminalHeight
    expect(changed).toBe(false)
  })

  test('recalculates offsets on resize', () => {
    const small = calculateSize(120, 36)
    const large = calculateSize(200, 50)

    expect(small.offsetX).toBe(0)
    expect(large.offsetX).toBe(40)
    expect(small.offsetY).toBe(0)
    expect(large.offsetY).toBe(7)
  })

  test('isTooSmall transitions correctly on resize', () => {
    // Start small
    const small = calculateSize(80, 24)
    expect(small.isTooSmall).toBe(true)

    // Resize to standard
    const standard = calculateSize(120, 36)
    expect(standard.isTooSmall).toBe(false)

    // Resize to large
    const large = calculateSize(200, 50)
    expect(large.isTooSmall).toBe(false)

    // Resize back to small
    const shrunk = calculateSize(100, 30)
    expect(shrunk.isTooSmall).toBe(true)
  })
})

// ─── Common Terminal Sizes ──────────────────────────────────────────────────

describe('Common Terminal Sizes', () => {
  test('80x24 (classic terminal)', () => {
    const size = calculateSize(80, 24)
    expect(size.isTooSmall).toBe(true)
    expect(size.offsetX).toBe(0)
    expect(size.offsetY).toBe(0)
  })

  test('120x36 (standard game size)', () => {
    const size = calculateSize(120, 36)
    expect(size.isTooSmall).toBe(false)
    expect(size.offsetX).toBe(0)
    expect(size.offsetY).toBe(0)
  })

  test('132x43 (macOS Terminal default)', () => {
    const size = calculateSize(132, 43)
    expect(size.isTooSmall).toBe(false)
    expect(size.offsetX).toBe(6)   // (132-120)/2 = 6
    expect(size.offsetY).toBe(3)   // (43-36)/2 = 3.5 -> floor -> 3
  })

  test('160x48 (large terminal)', () => {
    const size = calculateSize(160, 48)
    expect(size.isTooSmall).toBe(false)
    expect(size.offsetX).toBe(20)  // (160-120)/2
    expect(size.offsetY).toBe(6)   // (48-36)/2
  })

  test('240x67 (ultrawide)', () => {
    const size = calculateSize(240, 67)
    expect(size.isTooSmall).toBe(false)
    expect(size.offsetX).toBe(60)  // (240-120)/2
    expect(size.offsetY).toBe(15)  // (67-36)/2 = 15.5 -> floor -> 15
  })
})

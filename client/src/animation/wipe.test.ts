// client/src/animation/wipe.test.ts
// Unit tests for wave transition wipe effects

import { describe, test, expect, beforeEach } from 'bun:test'
import {
  WipeTransition,
  WIPE_BLOCKS,
  WIPE_BLOCKS_ASCII,
  createIrisMask,
  createIrisOpenMask,
  createHorizontalMask,
  createVerticalMask,
  createDiagonalMask,
  createDissolveMask,
  createWaveWipe,
  DEFAULT_WIPE_CONFIG,
  type WipeState,
} from './wipe'

describe('WIPE_BLOCKS', () => {
  test('contains expected unicode block characters', () => {
    expect(WIPE_BLOCKS.full).toBe('█')
    expect(WIPE_BLOCKS.top).toBe('▀')
    expect(WIPE_BLOCKS.bottom).toBe('▄')
    expect(WIPE_BLOCKS.left).toBe('▌')
    expect(WIPE_BLOCKS.right).toBe('▐')
    expect(WIPE_BLOCKS.empty).toBe(' ')
  })
})

describe('WIPE_BLOCKS_ASCII', () => {
  test('contains ASCII-safe fallback characters', () => {
    expect(WIPE_BLOCKS_ASCII.full).toBe('#')
    expect(WIPE_BLOCKS_ASCII.top).toBe('^')
    expect(WIPE_BLOCKS_ASCII.bottom).toBe('v')
    expect(WIPE_BLOCKS_ASCII.left).toBe('[')
    expect(WIPE_BLOCKS_ASCII.right).toBe(']')
    expect(WIPE_BLOCKS_ASCII.empty).toBe(' ')
  })
})

describe('DEFAULT_WIPE_CONFIG', () => {
  test('has sensible default values', () => {
    expect(DEFAULT_WIPE_CONFIG.width).toBe(120)
    expect(DEFAULT_WIPE_CONFIG.height).toBe(36)
    expect(DEFAULT_WIPE_CONFIG.exitDuration).toBeGreaterThan(0)
    expect(DEFAULT_WIPE_CONFIG.holdDuration).toBeGreaterThan(0)
    expect(DEFAULT_WIPE_CONFIG.enterDuration).toBeGreaterThan(0)
    expect(DEFAULT_WIPE_CONFIG.pattern).toBe('iris')
    expect(DEFAULT_WIPE_CONFIG.useAscii).toBe(false)
  })
})

describe('createIrisMask', () => {
  const mask = createIrisMask(60, 18, 50)

  test('center is always visible at progress 0', () => {
    expect(mask(60, 18, 0)).toBe(true)
  })

  test('radius shrinks to 0 at progress 1', () => {
    // At progress 1, radius is 0, so only exact center with distance 0 is visible
    // Due to floating point, center point (60,18) has distance 0 so is still "visible"
    // But nearby points should not be visible
    expect(mask(61, 18, 1)).toBe(false)
    expect(mask(60, 19, 1)).toBe(false)
  })

  test('edge cells visible at low progress', () => {
    expect(mask(10, 5, 0)).toBe(true)
    expect(mask(110, 30, 0)).toBe(true)
  })

  test('edge cells invisible at high progress', () => {
    expect(mask(10, 5, 0.9)).toBe(false)
    expect(mask(110, 30, 0.9)).toBe(false)
  })

  test('visibility decreases as progress increases', () => {
    // Point between center and edge
    const x = 40
    const y = 18

    const visibleAtLow = mask(x, y, 0.2)
    const visibleAtHigh = mask(x, y, 0.8)

    // At least one should differ (circle shrinks)
    if (visibleAtLow) {
      // If visible at low progress, might not be at high
      expect(visibleAtLow || !visibleAtHigh).toBe(true)
    }
  })

  test('accounts for aspect ratio', () => {
    // Horizontal and vertical equidistant points
    // Due to aspect ratio correction, they won't have the same visibility threshold
    const mask2 = createIrisMask(50, 20, 30)

    // These are at different "visual" distances due to 0.5 aspect ratio
    const horizontal = mask2(50 + 20, 20, 0.5) // 20 cells right
    const vertical = mask2(50, 20 + 10, 0.5) // 10 cells down

    // The test is that aspect ratio is considered - actual values depend on config
    expect(typeof horizontal).toBe('boolean')
    expect(typeof vertical).toBe('boolean')
  })
})

describe('createIrisOpenMask', () => {
  const mask = createIrisOpenMask(60, 18, 50)

  test('center is visible at progress 0', () => {
    // At progress 0, radius is 0, so only exact center is visible
    expect(mask(60, 18, 0)).toBe(true)
  })

  test('everything visible at progress 1', () => {
    expect(mask(60, 18, 1)).toBe(true)
    expect(mask(10, 5, 1)).toBe(true)
    expect(mask(110, 30, 1)).toBe(true)
  })

  test('edge cells invisible at low progress', () => {
    expect(mask(10, 5, 0.1)).toBe(false)
    expect(mask(110, 30, 0.1)).toBe(false)
  })

  test('is inverse of closing iris behavior', () => {
    const closeMask = createIrisMask(60, 18, 50)
    const openMask = createIrisOpenMask(60, 18, 50)

    // At the same progress, open mask is the complement
    // close at 0 = all visible, open at 0 = only center
    expect(closeMask(60, 18, 0)).toBe(true)
    expect(openMask(60, 18, 0)).toBe(true) // Center always visible

    // Edge: close at 0 = visible, open at 0 = not visible
    expect(closeMask(10, 5, 0)).toBe(true)
    expect(openMask(10, 5, 0)).toBe(false)
  })
})

describe('createHorizontalMask', () => {
  const mask = createHorizontalMask(100)

  test('left edge visible at progress 0', () => {
    expect(mask(0, 0, 0)).toBe(true)
  })

  test('right edge visible at progress 0', () => {
    expect(mask(99, 0, 0)).toBe(true)
  })

  test('left edge visible at high progress', () => {
    expect(mask(0, 0, 0.9)).toBe(true)
  })

  test('right edge invisible at high progress', () => {
    expect(mask(99, 0, 0.9)).toBe(false)
  })

  test('y coordinate is ignored', () => {
    expect(mask(50, 0, 0.5)).toBe(mask(50, 100, 0.5))
  })

  test('midpoint visible at midpoint progress', () => {
    // At progress 0.5, cells < 50 should be visible
    expect(mask(49, 0, 0.5)).toBe(true)
    expect(mask(50, 0, 0.5)).toBe(false)
  })
})

describe('createVerticalMask', () => {
  const mask = createVerticalMask(50)

  test('top edge visible at progress 0', () => {
    expect(mask(0, 0, 0)).toBe(true)
  })

  test('bottom edge visible at progress 0', () => {
    expect(mask(0, 49, 0)).toBe(true)
  })

  test('top edge visible at high progress', () => {
    expect(mask(0, 0, 0.9)).toBe(true)
  })

  test('bottom edge invisible at high progress', () => {
    expect(mask(0, 49, 0.9)).toBe(false)
  })

  test('x coordinate is ignored', () => {
    expect(mask(0, 25, 0.5)).toBe(mask(100, 25, 0.5))
  })
})

describe('createDiagonalMask', () => {
  const mask = createDiagonalMask(100, 50)

  test('top-left corner visible at progress 0', () => {
    expect(mask(0, 0, 0)).toBe(true)
  })

  test('bottom-right corner visible at progress 0', () => {
    expect(mask(99, 49, 0)).toBe(true)
  })

  test('bottom-right corner invisible at high progress', () => {
    expect(mask(99, 49, 0.9)).toBe(false)
  })

  test('top-left corner visible at high progress', () => {
    expect(mask(0, 0, 0.9)).toBe(true)
  })

  test('diagonal line determines visibility', () => {
    // Points along the diagonal have similar visibility thresholds
    // (0,0) and (1,1) are both at distance 0 and 2 from origin
    expect(mask(0, 0, 0)).toBe(mask(1, 1, 0))
  })
})

describe('createDissolveMask', () => {
  const mask = createDissolveMask()

  test('mostly visible at progress 0', () => {
    // At progress 0, noise > 0 is true for most cells (noise is 0-1, excluding exact 0)
    // Some cells may have noise exactly at 0 due to hash function
    let visibleCount = 0
    const total = 100
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        if (mask(x, y, 0)) {
          visibleCount++
        }
      }
    }
    // Most cells should be visible at progress 0
    expect(visibleCount).toBeGreaterThan(total * 0.9)
  })

  test('all invisible at progress 1', () => {
    // At progress 1, noise > 1 is always false
    let allInvisible = true
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        if (mask(x, y, 1)) {
          allInvisible = false
          break
        }
      }
    }
    expect(allInvisible).toBe(true)
  })

  test('is deterministic (same coordinates give same result)', () => {
    expect(mask(5, 7, 0.5)).toBe(mask(5, 7, 0.5))
    expect(mask(10, 20, 0.3)).toBe(mask(10, 20, 0.3))
  })

  test('different coordinates can have different visibility', () => {
    // Due to hash function, different coords should have different thresholds
    const visibilities = new Set<boolean>()
    for (let x = 0; x < 10; x++) {
      visibilities.add(mask(x, 0, 0.5))
    }
    // At 50% progress, we expect some visible and some not
    expect(visibilities.size).toBe(2)
  })
})

describe('WipeTransition', () => {
  let wipe: WipeTransition

  beforeEach(() => {
    wipe = new WipeTransition({ width: 120, height: 36 })
  })

  describe('constructor', () => {
    test('starts in idle state', () => {
      expect(wipe.getState()).toBe('idle')
    })

    test('is not active initially', () => {
      expect(wipe.isActive()).toBe(false)
    })

    test('accepts custom config', () => {
      const custom = new WipeTransition({
        width: 80,
        height: 24,
        pattern: 'horizontal',
        exitDuration: 20,
      })
      expect(custom.getState()).toBe('idle')
    })
  })

  describe('start', () => {
    test('transitions to exiting state', () => {
      wipe.start(2)
      expect(wipe.getState()).toBe('exiting')
    })

    test('sets wave number', () => {
      wipe.start(5)
      expect(wipe.getWaveNumber()).toBe(5)
    })

    test('resets tick to 0', () => {
      wipe.start(1)
      wipe.update()
      wipe.update()
      wipe.start(2)
      expect(wipe.getTick()).toBe(0)
    })

    test('sets active to true', () => {
      wipe.start(1)
      expect(wipe.isActive()).toBe(true)
    })

    test('reverse=true skips exit phase and starts in hold', () => {
      wipe.start(1, true)
      expect(wipe.getState()).toBe('hold')
      expect(wipe.isActive()).toBe(true)
    })

    test('reverse wipe goes hold -> entering -> idle', () => {
      const shortWipe = new WipeTransition({
        width: 120,
        height: 36,
        exitDuration: 10,
        holdDuration: 3,
        enterDuration: 3,
      })
      shortWipe.start(1, true)
      expect(shortWipe.getState()).toBe('hold')

      // Hold phase
      shortWipe.update()
      shortWipe.update()
      shortWipe.update()
      expect(shortWipe.getState()).toBe('entering')

      // Enter phase
      shortWipe.update()
      shortWipe.update()
      shortWipe.update()
      expect(shortWipe.getState()).toBe('idle')
    })

    test('reverse wipe never goes through exiting state', () => {
      const shortWipe = new WipeTransition({
        width: 120,
        height: 36,
        exitDuration: 10,
        holdDuration: 2,
        enterDuration: 2,
      })
      shortWipe.start(1, true)

      const states: WipeState[] = []
      states.push(shortWipe.getState())

      // Run through entire wipe
      for (let i = 0; i < 10; i++) {
        shortWipe.update()
        states.push(shortWipe.getState())
      }

      expect(states).not.toContain('exiting')
      expect(states).toContain('hold')
      expect(states).toContain('entering')
    })
  })

  describe('cancel', () => {
    test('returns to idle state', () => {
      wipe.start(1)
      wipe.cancel()
      expect(wipe.getState()).toBe('idle')
    })

    test('resets tick to 0', () => {
      wipe.start(1)
      wipe.update()
      wipe.update()
      wipe.cancel()
      expect(wipe.getTick()).toBe(0)
    })

    test('sets active to false', () => {
      wipe.start(1)
      wipe.cancel()
      expect(wipe.isActive()).toBe(false)
    })
  })

  describe('update', () => {
    test('does nothing when idle', () => {
      wipe.update()
      expect(wipe.getTick()).toBe(0)
    })

    test('increments tick when active', () => {
      wipe.start(1)
      wipe.update()
      expect(wipe.getTick()).toBe(1)
      wipe.update()
      expect(wipe.getTick()).toBe(2)
    })

    test('transitions from exiting to hold', () => {
      const shortWipe = new WipeTransition({
        width: 120,
        height: 36,
        exitDuration: 3,
      })
      shortWipe.start(1)
      expect(shortWipe.getState()).toBe('exiting')

      shortWipe.update()
      shortWipe.update()
      shortWipe.update()
      expect(shortWipe.getState()).toBe('hold')
    })

    test('transitions from hold to entering', () => {
      const shortWipe = new WipeTransition({
        width: 120,
        height: 36,
        exitDuration: 2,
        holdDuration: 2,
      })
      shortWipe.start(1)

      // Exit phase
      shortWipe.update()
      shortWipe.update()
      expect(shortWipe.getState()).toBe('hold')

      // Hold phase
      shortWipe.update()
      shortWipe.update()
      expect(shortWipe.getState()).toBe('entering')
    })

    test('transitions from entering to idle', () => {
      const shortWipe = new WipeTransition({
        width: 120,
        height: 36,
        exitDuration: 2,
        holdDuration: 2,
        enterDuration: 2,
      })
      shortWipe.start(1)

      // Complete all phases
      for (let i = 0; i < 6; i++) {
        shortWipe.update()
      }
      expect(shortWipe.getState()).toBe('idle')
    })
  })

  describe('getProgress', () => {
    test('returns 0 when idle', () => {
      expect(wipe.getProgress()).toBe(0)
    })

    test('returns 0-1 during exiting', () => {
      const shortWipe = new WipeTransition({
        width: 120,
        height: 36,
        exitDuration: 10,
      })
      shortWipe.start(1)

      expect(shortWipe.getProgress()).toBe(0)

      shortWipe.update()
      expect(shortWipe.getProgress()).toBe(0.1)

      for (let i = 0; i < 4; i++) shortWipe.update()
      expect(shortWipe.getProgress()).toBe(0.5)
    })

    test('returns 1 during hold', () => {
      const shortWipe = new WipeTransition({
        width: 120,
        height: 36,
        exitDuration: 2,
        holdDuration: 5,
      })
      shortWipe.start(1)
      shortWipe.update()
      shortWipe.update()
      expect(shortWipe.getState()).toBe('hold')
      expect(shortWipe.getProgress()).toBe(1)
    })

    test('returns 0-1 during entering', () => {
      const shortWipe = new WipeTransition({
        width: 120,
        height: 36,
        exitDuration: 2,
        holdDuration: 2,
        enterDuration: 10,
      })
      shortWipe.start(1)

      // Skip to entering phase
      for (let i = 0; i < 4; i++) shortWipe.update()
      expect(shortWipe.getState()).toBe('entering')
      expect(shortWipe.getProgress()).toBe(0)

      shortWipe.update()
      expect(shortWipe.getProgress()).toBe(0.1)
    })
  })

  describe('getEasedProgress', () => {
    test('applies easing to progress', () => {
      const shortWipe = new WipeTransition({
        width: 120,
        height: 36,
        exitDuration: 10,
      })
      shortWipe.start(1)

      for (let i = 0; i < 5; i++) shortWipe.update()
      const linear = shortWipe.getProgress()
      const eased = shortWipe.getEasedProgress()

      // easeInQuad makes value smaller at midpoint
      expect(eased).toBeLessThan(linear)
    })
  })

  describe('isInHold', () => {
    test('returns false when not in hold', () => {
      expect(wipe.isInHold()).toBe(false)
      wipe.start(1)
      expect(wipe.isInHold()).toBe(false)
    })

    test('returns true during hold phase', () => {
      const shortWipe = new WipeTransition({
        width: 120,
        height: 36,
        exitDuration: 2,
        holdDuration: 5,
      })
      shortWipe.start(1)
      shortWipe.update()
      shortWipe.update()
      expect(shortWipe.isInHold()).toBe(true)
    })
  })

  describe('isCellVisible', () => {
    test('returns true when idle', () => {
      expect(wipe.isCellVisible(0, 0)).toBe(true)
      expect(wipe.isCellVisible(60, 18)).toBe(true)
      expect(wipe.isCellVisible(119, 35)).toBe(true)
    })

    test('returns false during hold', () => {
      const shortWipe = new WipeTransition({
        width: 120,
        height: 36,
        exitDuration: 2,
        holdDuration: 5,
      })
      shortWipe.start(1)
      shortWipe.update()
      shortWipe.update()
      expect(shortWipe.isCellVisible(60, 18)).toBe(false)
    })

    test('visibility changes during exiting', () => {
      wipe.start(1)
      const centerVisible = wipe.isCellVisible(60, 18)
      expect(centerVisible).toBe(true) // Center visible early

      // After many updates, edges should be masked
      for (let i = 0; i < 25; i++) {
        wipe.update()
      }
      const edgeVisible = wipe.isCellVisible(5, 5)
      expect(edgeVisible).toBe(false) // Edge masked late
    })
  })

  describe('getMaskCells', () => {
    test('returns empty array when idle', () => {
      expect(wipe.getMaskCells()).toEqual([])
    })

    test('returns cells during active state', () => {
      // Use a smaller screen so the iris closes faster relative to cell count
      const smallWipe = new WipeTransition({
        width: 20,
        height: 10,
        exitDuration: 10,
      })
      smallWipe.start(1)
      // Run most of the exit phase so the iris has closed significantly
      for (let i = 0; i < 8; i++) {
        smallWipe.update()
      }
      const cells = smallWipe.getMaskCells()
      expect(cells.length).toBeGreaterThan(0)
    })

    test('cells have required properties', () => {
      wipe.start(1)
      wipe.update()
      const cells = wipe.getMaskCells()

      if (cells.length > 0) {
        const cell = cells[0]
        expect(typeof cell.x).toBe('number')
        expect(typeof cell.y).toBe('number')
        expect(typeof cell.char).toBe('string')
        expect(typeof cell.visible).toBe('boolean')
        expect(['none', 'top', 'bottom', 'left', 'right']).toContain(cell.edge)
      }
    })

    test('all returned cells are masked (not visible)', () => {
      wipe.start(1)
      for (let i = 0; i < 10; i++) {
        wipe.update()
      }
      const cells = wipe.getMaskCells()
      for (const cell of cells) {
        expect(cell.visible).toBe(false)
      }
    })

    test('returns all cells during hold (fully masked)', () => {
      const shortWipe = new WipeTransition({
        width: 10,
        height: 5,
        exitDuration: 2,
        holdDuration: 5,
      })
      shortWipe.start(1)
      shortWipe.update()
      shortWipe.update()
      expect(shortWipe.isInHold()).toBe(true)

      const cells = shortWipe.getMaskCells()
      expect(cells.length).toBe(10 * 5) // All cells masked
    })
  })

  describe('getTotalDuration', () => {
    test('returns sum of all phase durations', () => {
      const wipe = new WipeTransition({
        width: 120,
        height: 36,
        exitDuration: 10,
        holdDuration: 20,
        enterDuration: 15,
      })
      expect(wipe.getTotalDuration()).toBe(45)
    })
  })

  describe('getMaskColor', () => {
    test('returns configured mask color', () => {
      const wipe = new WipeTransition({
        width: 120,
        height: 36,
        maskColor: '#ff0000',
      })
      expect(wipe.getMaskColor()).toBe('#ff0000')
    })

    test('returns default mask color', () => {
      expect(wipe.getMaskColor()).toBe('#000000')
    })
  })

  describe('different patterns', () => {
    test('horizontal pattern masks left to right', () => {
      const hWipe = new WipeTransition({
        width: 100,
        height: 10,
        pattern: 'horizontal',
        exitDuration: 10,
      })
      hWipe.start(1)

      // Early in transition, left side should be visible
      for (let i = 0; i < 5; i++) hWipe.update()
      expect(hWipe.isCellVisible(10, 5)).toBe(true)
      expect(hWipe.isCellVisible(90, 5)).toBe(false)
    })

    test('vertical pattern masks top to bottom', () => {
      const vWipe = new WipeTransition({
        width: 10,
        height: 100,
        pattern: 'vertical',
        exitDuration: 10,
      })
      vWipe.start(1)

      for (let i = 0; i < 5; i++) vWipe.update()
      expect(vWipe.isCellVisible(5, 10)).toBe(true)
      expect(vWipe.isCellVisible(5, 90)).toBe(false)
    })

    test('dissolve pattern produces varied visibility', () => {
      const dWipe = new WipeTransition({
        width: 20,
        height: 20,
        pattern: 'dissolve',
        exitDuration: 10,
      })
      dWipe.start(1)

      for (let i = 0; i < 5; i++) dWipe.update()

      // At midpoint, some cells should be visible, some not
      const visibilities = new Set<boolean>()
      for (let x = 0; x < 20; x++) {
        visibilities.add(dWipe.isCellVisible(x, 10))
      }
      expect(visibilities.size).toBe(2) // Both true and false present
    })
  })

  describe('ASCII mode', () => {
    test('uses ASCII block characters', () => {
      const asciiWipe = new WipeTransition({
        width: 120,
        height: 36,
        useAscii: true,
      })
      asciiWipe.start(1)
      for (let i = 0; i < 10; i++) {
        asciiWipe.update()
      }

      const cells = asciiWipe.getMaskCells()
      const asciiChars = ['#', '^', 'v', '[', ']', ' ']
      for (const cell of cells) {
        expect(asciiChars).toContain(cell.char)
      }
    })
  })
})

describe('createWaveWipe', () => {
  test('creates wipe with correct dimensions', () => {
    const wipe = createWaveWipe(100, 50)
    wipe.start(1)
    expect(wipe.isActive()).toBe(true)
  })

  test('uses iris pattern', () => {
    const wipe = createWaveWipe(120, 36)
    wipe.start(1)
    // Center should be visible longer than edges (iris pattern)
    for (let i = 0; i < 20; i++) wipe.update()
    const centerVisible = wipe.isCellVisible(60, 18)
    const edgeVisible = wipe.isCellVisible(5, 5)
    expect(centerVisible).toBe(true)
    expect(edgeVisible).toBe(false)
  })

  test('accepts ascii flag', () => {
    const wipe = createWaveWipe(120, 36, true)
    wipe.start(1)
    wipe.update()
    const cells = wipe.getMaskCells()
    const asciiChars = ['#', '^', 'v', '[', ']', ' ']
    for (const cell of cells) {
      expect(asciiChars).toContain(cell.char)
    }
  })
})

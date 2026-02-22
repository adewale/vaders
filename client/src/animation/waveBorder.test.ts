// client/src/animation/waveBorder.test.ts

import { describe, test, expect } from 'bun:test'
import {
  WaveBorderAnimation,
  BRAILLE_DENSITY,
  MAX_DENSITY,
  ASPECT_RATIO,
  WAVE_COLORS,
  type WaveBorderConfig,
  type BorderCell,
} from './waveBorder'
import { interpolateGradient, getWaveGradient } from '../gradient'

// ─── Helper ─────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<WaveBorderConfig> = {}): WaveBorderConfig {
  return {
    boxWidth: 30,
    boxHeight: 18,
    waveNumber: 3,
    contentWidth: 8,
    contentHeight: 6,
    innerPadding: 4,
    ...overrides,
  }
}

// ─── BRAILLE_DENSITY ────────────────────────────────────────────────────────

describe('BRAILLE_DENSITY', () => {
  test('has 9 entries (0-8 dots)', () => {
    expect(BRAILLE_DENSITY).toHaveLength(9)
  })

  test('all characters are in the U+2800 block', () => {
    for (const ch of BRAILLE_DENSITY) {
      const code = ch.charCodeAt(0)
      expect(code).toBeGreaterThanOrEqual(0x2800)
      expect(code).toBeLessThanOrEqual(0x28FF)
    }
  })

  test('first entry is empty braille (U+2800)', () => {
    expect(BRAILLE_DENSITY[0]).toBe('\u2800')
  })

  test('last entry is full braille (U+28FF)', () => {
    expect(BRAILLE_DENSITY[MAX_DENSITY]).toBe('\u28FF')
  })

  test('density (dot count / popcount) increases monotonically', () => {
    for (let i = 1; i < BRAILLE_DENSITY.length; i++) {
      const prevCode = BRAILLE_DENSITY[i - 1].charCodeAt(0) - 0x2800
      const currCode = BRAILLE_DENSITY[i].charCodeAt(0) - 0x2800
      const prevPopcount = prevCode.toString(2).split('').filter(b => b === '1').length
      const currPopcount = currCode.toString(2).split('').filter(b => b === '1').length
      expect(currPopcount).toBeGreaterThan(prevPopcount)
    }
  })

  test('all entries are unique', () => {
    const unique = new Set(BRAILLE_DENSITY)
    expect(unique.size).toBe(BRAILLE_DENSITY.length)
  })
})

// ─── ASPECT_RATIO ────────────────────────────────────────────────────────────

describe('ASPECT_RATIO', () => {
  test('is 0.5 (terminal ~2:1 aspect)', () => {
    expect(ASPECT_RATIO).toBe(0.5)
  })

  test('is exported as a named constant (not a magic number)', () => {
    expect(typeof ASPECT_RATIO).toBe('number')
  })
})

// ─── Ripple culling ─────────────────────────────────────────────────────────

describe('ripple culling', () => {
  test('expired ripples are culled without affecting animation', () => {
    // Use a small box so ripples expire quickly
    const config = makeConfig({ boxWidth: 10, boxHeight: 6, waveNumber: 1 })
    const anim = new WaveBorderAnimation(config)

    // Run many ticks to generate and expire many ripples
    for (let i = 0; i < 200; i++) {
      anim.update()
      // getCells() should always succeed without errors
      const cells = anim.getCells()
      expect(cells.length).toBeGreaterThanOrEqual(0)
    }
  })

  test('animation continues correctly after ripples expire', () => {
    const config = makeConfig({ waveNumber: 2 })
    const anim = new WaveBorderAnimation(config)
    const period = anim.getHeartbeatPeriodTicks()

    // Run through multiple full heartbeat cycles
    for (let cycle = 0; cycle < 5; cycle++) {
      for (let t = 0; t < period; t++) {
        anim.update()
      }
      // Should still produce cells after each cycle
      const cells = anim.getCells()
      expect(cells.length).toBeGreaterThan(0)
    }
  })
})

// ─── Constructor ────────────────────────────────────────────────────────────

describe('WaveBorderAnimation constructor', () => {
  test('creates valid animation state', () => {
    const anim = new WaveBorderAnimation(makeConfig())
    expect(anim.getTick()).toBe(0)
    expect(anim.getSnakeCount()).toBeGreaterThan(0)
    expect(anim.getPerimeterLength()).toBeGreaterThan(0)
  })

  test('snake count equals min(max(waveNumber, 1), 6)', () => {
    expect(new WaveBorderAnimation(makeConfig({ waveNumber: 0 })).getSnakeCount()).toBe(1)
    expect(new WaveBorderAnimation(makeConfig({ waveNumber: 1 })).getSnakeCount()).toBe(1)
    expect(new WaveBorderAnimation(makeConfig({ waveNumber: 3 })).getSnakeCount()).toBe(3)
    expect(new WaveBorderAnimation(makeConfig({ waveNumber: 6 })).getSnakeCount()).toBe(6)
    expect(new WaveBorderAnimation(makeConfig({ waveNumber: 10 })).getSnakeCount()).toBe(6)
  })

  test('perimeter length matches box dimensions', () => {
    const config = makeConfig({ boxWidth: 20, boxHeight: 10 })
    const anim = new WaveBorderAnimation(config)
    // Perimeter = 2*(w + h) - 4 corners counted once
    const expected = 2 * (20 + 10) - 4
    expect(anim.getPerimeterLength()).toBe(expected)
  })

  test('heartbeat period is within bounds', () => {
    for (let wave = 1; wave <= 20; wave++) {
      const anim = new WaveBorderAnimation(makeConfig({ waveNumber: wave }))
      const period = anim.getHeartbeatPeriodTicks()
      expect(period).toBeGreaterThanOrEqual(1)
      // Period should decrease with wave number but stay bounded
      expect(period).toBeLessThanOrEqual(Math.ceil(1200 / 70) + 1)
    }
  })
})

// ─── update() ───────────────────────────────────────────────────────────────

describe('update', () => {
  test('advances tick count', () => {
    const anim = new WaveBorderAnimation(makeConfig())
    expect(anim.getTick()).toBe(0)
    anim.update()
    expect(anim.getTick()).toBe(1)
    anim.update()
    expect(anim.getTick()).toBe(2)
  })
})

// ─── getCells() ─────────────────────────────────────────────────────────────

describe('getCells', () => {
  test('returns cells after initialization', () => {
    const anim = new WaveBorderAnimation(makeConfig())
    anim.update()
    const cells = anim.getCells()
    expect(cells.length).toBeGreaterThan(0)
  })

  test('all cells have valid coordinates within box bounds', () => {
    const config = makeConfig()
    const anim = new WaveBorderAnimation(config)
    for (let i = 0; i < 20; i++) anim.update()
    const cells = anim.getCells()
    for (const cell of cells) {
      expect(cell.x).toBeGreaterThanOrEqual(0)
      expect(cell.x).toBeLessThan(config.boxWidth)
      expect(cell.y).toBeGreaterThanOrEqual(0)
      expect(cell.y).toBeLessThan(config.boxHeight)
    }
  })

  test('all cell characters are valid braille', () => {
    const anim = new WaveBorderAnimation(makeConfig())
    for (let i = 0; i < 20; i++) anim.update()
    const cells = anim.getCells()
    for (const cell of cells) {
      const code = cell.char.charCodeAt(0)
      expect(code).toBeGreaterThanOrEqual(0x2800)
      expect(code).toBeLessThanOrEqual(0x28FF)
    }
  })

  test('all cell colors are valid hex strings', () => {
    const anim = new WaveBorderAnimation(makeConfig())
    for (let i = 0; i < 20; i++) anim.update()
    const cells = anim.getCells()
    const hexPattern = /^#[0-9a-f]{6}$/i
    for (const cell of cells) {
      expect(cell.color).toMatch(hexPattern)
    }
  })

  test('all cells have unique (x,y) coordinates (no duplicates)', () => {
    // Run enough ticks for multiple overlapping ripples to produce duplicate cells
    const config = makeConfig({ waveNumber: 5, boxWidth: 30, boxHeight: 18 })
    const anim = new WaveBorderAnimation(config)
    const period = anim.getHeartbeatPeriodTicks()
    // Advance past several heartbeats to generate multiple overlapping ripples
    for (let i = 0; i < period * 3; i++) anim.update()
    const cells = anim.getCells()

    const seen = new Set<string>()
    for (const cell of cells) {
      const key = `${cell.x},${cell.y}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  test('no cells overlap the content area', () => {
    const config = makeConfig({ boxWidth: 30, boxHeight: 18, contentWidth: 8, contentHeight: 6 })
    const anim = new WaveBorderAnimation(config)
    // Run enough ticks to trigger ripples
    for (let i = 0; i < 50; i++) anim.update()
    const cells = anim.getCells()

    const contentLeft = Math.floor((config.boxWidth - config.contentWidth) / 2)
    const contentTop = Math.floor((config.boxHeight - config.contentHeight) / 2)
    const contentRight = contentLeft + config.contentWidth
    const contentBottom = contentTop + config.contentHeight

    for (const cell of cells) {
      const insideContent =
        cell.x >= contentLeft && cell.x < contentRight &&
        cell.y >= contentTop && cell.y < contentBottom
      // Interior ripple cells must not be in content area
      // (border cells are on the perimeter so they won't be inside content)
      if (cell.y > 0 && cell.y < config.boxHeight - 1 &&
          cell.x > 0 && cell.x < config.boxWidth - 1) {
        expect(insideContent).toBe(false)
      }
    }
  })
})

// ─── reset() ────────────────────────────────────────────────────────────────

describe('reset', () => {
  test('returns tick to 0', () => {
    const anim = new WaveBorderAnimation(makeConfig())
    for (let i = 0; i < 10; i++) anim.update()
    expect(anim.getTick()).toBe(10)
    anim.reset()
    expect(anim.getTick()).toBe(0)
  })
})

// ─── Animation over time ────────────────────────────────────────────────────

describe('animation over time', () => {
  test('cell pattern changes between ticks', () => {
    const anim = new WaveBorderAnimation(makeConfig())
    anim.update()
    const cells1 = anim.getCells()
    for (let i = 0; i < 5; i++) anim.update()
    const cells2 = anim.getCells()
    // Cells should differ (snakes moved — density pattern changes)
    const serialize = (cells: typeof cells1) =>
      cells.map(c => `${c.x},${c.y},${c.char}`).sort().join(';')
    expect(serialize(cells1)).not.toBe(serialize(cells2))
  })

  test('ripples reach all four borders of the box', () => {
    // Simulate realistic game dimensions: 120×36 terminal → ~72×27 box
    const config = makeConfig({ boxWidth: 72, boxHeight: 27, waveNumber: 1, contentWidth: 20, contentHeight: 8 })
    const anim = new WaveBorderAnimation(config)
    const period = anim.getHeartbeatPeriodTicks()

    // Track which edges the ripple reaches across all ticks
    let reachedTop = false
    let reachedBottom = false
    let reachedLeft = false
    let reachedRight = false

    // Run through two full heartbeat cycles, sampling every tick
    for (let i = 0; i < period * 2; i++) {
      anim.update()
      const cells = anim.getCells()
      // Interior ripple cells use gradient colors (not the border color)
      const [borderColor] = WAVE_COLORS[0] // Wave 1
      const rippleCells = cells.filter(c => c.color !== borderColor)
      if (rippleCells.some(c => c.y <= 2)) reachedTop = true
      if (rippleCells.some(c => c.y >= config.boxHeight - 3)) reachedBottom = true
      if (rippleCells.some(c => c.x <= 2)) reachedLeft = true
      if (rippleCells.some(c => c.x >= config.boxWidth - 3)) reachedRight = true
    }

    expect(reachedTop).toBe(true)
    expect(reachedBottom).toBe(true)
    expect(reachedLeft).toBe(true)
    expect(reachedRight).toBe(true)
  })

  test('ripple colors match digit gradient (prevents spritesheet drift)', () => {
    // The wave announce screen, the spritesheet, and any other consumer all rely
    // on getCells() returning the correct gradient colors for ripple cells.
    // If ripple colors ever diverge from getWaveGradient(), digits and ripples
    // will look mismatched.
    for (let wave = 1; wave <= 8; wave++) {
      const boxWidth = 46
      const config = makeConfig({ boxWidth, boxHeight: 18, waveNumber: wave, contentWidth: 10, contentHeight: 8 })
      const anim = new WaveBorderAnimation(config)
      const period = anim.getHeartbeatPeriodTicks()

      // Run past a heartbeat to generate ripple cells
      for (let i = 0; i < period + 5; i++) anim.update()
      const cells = anim.getCells()

      const expectedGradient = interpolateGradient(getWaveGradient(wave), boxWidth)
      const [borderColor] = WAVE_COLORS[((wave - 1) % WAVE_COLORS.length + WAVE_COLORS.length) % WAVE_COLORS.length]

      // Interior ripple cells (non-border-color) should use the digit gradient
      const rippleCells = cells.filter(c => c.color !== borderColor)
      expect(rippleCells.length).toBeGreaterThan(0)

      for (const cell of rippleCells) {
        expect(cell.color).toBe(expectedGradient[cell.x])
      }
    }
  })

  test('ripples spawn on heartbeat boundaries', () => {
    const config = makeConfig({ waveNumber: 1 })
    const anim = new WaveBorderAnimation(config)
    const period = anim.getHeartbeatPeriodTicks()
    // Advance to just before second heartbeat
    for (let i = 0; i < period - 1; i++) anim.update()
    const cellsBefore = anim.getCells()
    // Advance to heartbeat
    anim.update()
    const cellsAfter = anim.getCells()
    // After heartbeat, there should be more cells (ripple + border boost)
    expect(cellsAfter.length).toBeGreaterThanOrEqual(cellsBefore.length)
  })
})

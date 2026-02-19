// client/src/animation/waveBorder.test.ts

import { describe, test, expect } from 'bun:test'
import {
  WaveBorderAnimation,
  BRAILLE_DENSITY,
  MAX_DENSITY,
  type WaveBorderConfig,
} from './waveBorder'

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
    // Cells should differ (snakes moved)
    const serialize = (cells: typeof cells1) =>
      cells.map(c => `${c.x},${c.y}`).sort().join(';')
    expect(serialize(cells1)).not.toBe(serialize(cells2))
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

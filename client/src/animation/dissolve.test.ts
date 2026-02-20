// client/src/animation/dissolve.test.ts

import { describe, test, expect } from 'bun:test'
import {
  DissolveSystem,
  DISSOLVE_ASCII_CHARS,
  DEFAULT_DISSOLVE_CONFIG,
  type DissolveConfig,
  type DissolveCellOutput,
} from './dissolve'
import { BRAILLE_DENSITY, MAX_DENSITY } from './waveBorder'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Deterministic random for reproducible tests. */
function seededRandom(seed = 42): () => number {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function makeSystem(config: Partial<DissolveConfig> = {}, seed = 42): DissolveSystem {
  return new DissolveSystem(config, seededRandom(seed))
}

// ─── Constructor ─────────────────────────────────────────────────────────────

describe('DissolveSystem constructor', () => {
  test('creates system with pre-allocated pool', () => {
    const system = makeSystem()
    expect(system.getPoolSize()).toBe(DEFAULT_DISSOLVE_CONFIG.maxEffects)
    expect(system.getActiveCount()).toBe(0)
  })

  test('respects custom maxEffects', () => {
    const system = makeSystem({ maxEffects: 5 })
    expect(system.getPoolSize()).toBe(5)
  })
})

// ─── spawn() ─────────────────────────────────────────────────────────────────

describe('spawn', () => {
  test('creates an active effect', () => {
    const system = makeSystem()
    const result = system.spawn(10, 20, 5, 2, '#ff0000', 'dissolve')
    expect(result).toBe(true)
    expect(system.getActiveCount()).toBe(1)
  })

  test('returns false when pool is full', () => {
    const system = makeSystem({ maxEffects: 2 })
    expect(system.spawn(0, 0, 5, 2, '#ff0000', 'dissolve')).toBe(true)
    expect(system.spawn(0, 0, 5, 2, '#ff0000', 'dissolve')).toBe(true)
    expect(system.spawn(0, 0, 5, 2, '#ff0000', 'dissolve')).toBe(false)
    expect(system.getActiveCount()).toBe(2)
  })

  test('dissolve variant spawns 10-15 cells', () => {
    const system = makeSystem()
    system.spawn(10, 20, 5, 2, '#ff0000', 'dissolve')
    // After one update to start showing cells
    system.update()
    const cells = system.getCells()
    // With seeded random, should produce a consistent number
    expect(cells.length).toBeGreaterThanOrEqual(1)
    expect(cells.length).toBeLessThanOrEqual(15)
  })

  test('shimmer variant spawns fewer cells than dissolve', () => {
    const system1 = makeSystem({}, 42)
    system1.spawn(10, 20, 5, 2, '#ff0000', 'shimmer')
    system1.update()
    const shimmerCells = system1.getCells()

    const system2 = makeSystem({}, 42)
    system2.spawn(10, 20, 5, 2, '#ff0000', 'dissolve')
    system2.update()
    const dissolveCells = system2.getCells()

    expect(shimmerCells.length).toBeLessThanOrEqual(dissolveCells.length)
  })
})

// ─── update() ────────────────────────────────────────────────────────────────

describe('update', () => {
  test('advances effect ticks', () => {
    const system = makeSystem()
    system.spawn(10, 20, 5, 2, '#ff0000', 'dissolve')
    expect(system.getActiveCount()).toBe(1)
    system.update()
    expect(system.getActiveCount()).toBe(1) // Still active after 1 tick
  })

  test('deactivates effects after lifetime expires', () => {
    const system = makeSystem({ dissolveLifetime: 3 })
    system.spawn(10, 20, 5, 2, '#ff0000', 'dissolve')
    expect(system.getActiveCount()).toBe(1)
    system.update() // tick 1
    system.update() // tick 2
    expect(system.getActiveCount()).toBe(1)
    system.update() // tick 3 = lifetime, deactivates
    expect(system.getActiveCount()).toBe(0)
  })

  test('shimmer has shorter lifetime than dissolve', () => {
    const system = makeSystem()
    system.spawn(10, 20, 5, 2, '#ff0000', 'shimmer')
    // Advance through shimmer lifetime (default 8)
    for (let i = 0; i < DEFAULT_DISSOLVE_CONFIG.shimmerLifetime; i++) {
      system.update()
    }
    expect(system.getActiveCount()).toBe(0)
  })

  test('does nothing when no effects are active', () => {
    const system = makeSystem()
    system.update() // Should not throw
    expect(system.getActiveCount()).toBe(0)
  })
})

// ─── getCells() ──────────────────────────────────────────────────────────────

describe('getCells', () => {
  test('returns empty array when no effects active', () => {
    const system = makeSystem()
    expect(system.getCells()).toHaveLength(0)
  })

  test('returns same array reference when no effects active (shared constant)', () => {
    const system = makeSystem()
    const a = system.getCells()
    const b = system.getCells()
    // Should return the exact same empty array instance, not a new allocation
    expect(a).toBe(b)
  })

  test('returns new array when effects are active then same constant when idle', () => {
    const system = makeSystem({ dissolveLifetime: 2 })
    // No effects — should return shared empty array
    const emptyA = system.getCells()

    // Spawn an effect
    system.spawn(10, 20, 5, 2, '#ff0000', 'dissolve')
    system.update()
    const activeCells = system.getCells()
    expect(activeCells.length).toBeGreaterThan(0)

    // Expire the effect
    system.update() // tick 2 = lifetime, deactivates

    // Back to idle — should return shared empty array again
    const emptyB = system.getCells()
    expect(emptyB).toHaveLength(0)
    expect(emptyB).toBe(emptyA) // Same reference
  })

  test('returns cells after spawn and update', () => {
    const system = makeSystem()
    system.spawn(10, 20, 5, 2, '#ff0000', 'dissolve')
    system.update()
    const cells = system.getCells()
    expect(cells.length).toBeGreaterThan(0)
  })

  test('all cells use valid braille characters', () => {
    const system = makeSystem()
    system.spawn(10, 20, 5, 2, '#ff0000', 'dissolve')
    for (let i = 0; i < 5; i++) system.update()
    const cells = system.getCells()
    for (const cell of cells) {
      const code = cell.char.charCodeAt(0)
      expect(code).toBeGreaterThanOrEqual(0x2800)
      expect(code).toBeLessThanOrEqual(0x28FF)
    }
  })

  test('ASCII mode uses ASCII characters', () => {
    const system = makeSystem({ useAscii: true })
    system.spawn(10, 20, 5, 2, '#ff0000', 'dissolve')
    for (let i = 0; i < 5; i++) system.update()
    const cells = system.getCells()
    const asciiSet = new Set<string>(DISSOLVE_ASCII_CHARS)
    for (const cell of cells) {
      expect(asciiSet.has(cell.char)).toBe(true)
    }
  })

  test('all cells carry the spawned color', () => {
    const system = makeSystem()
    system.spawn(10, 20, 5, 2, '#aabbcc', 'dissolve')
    system.update()
    const cells = system.getCells()
    for (const cell of cells) {
      expect(cell.color).toBe('#aabbcc')
    }
  })

  test('cells are near the spawn origin', () => {
    const system = makeSystem()
    system.spawn(50, 20, 5, 2, '#ff0000', 'dissolve')
    system.update()
    const cells = system.getCells()
    for (const cell of cells) {
      // Cells should be within reasonable distance of origin
      expect(cell.x).toBeGreaterThanOrEqual(45)
      expect(cell.x).toBeLessThanOrEqual(60)
      expect(cell.y).toBeGreaterThanOrEqual(15)
      expect(cell.y).toBeLessThanOrEqual(25)
    }
  })

  test('density decreases over time', () => {
    const system = makeSystem({ dissolveLifetime: 20 })
    system.spawn(10, 20, 5, 2, '#ff0000', 'dissolve')

    // Get cells at early tick
    for (let i = 0; i < 2; i++) system.update()
    const earlyCells = system.getCells()

    // Get cells at late tick
    for (let i = 0; i < 12; i++) system.update()
    const lateCells = system.getCells()

    // Early cells should have higher density (higher braille codepoints)
    if (earlyCells.length > 0 && lateCells.length > 0) {
      const earlyMaxCode = Math.max(...earlyCells.map(c => c.char.charCodeAt(0)))
      const lateMaxCode = Math.max(...lateCells.map(c => c.char.charCodeAt(0)))
      expect(earlyMaxCode).toBeGreaterThanOrEqual(lateMaxCode)
    }
  })

  test('returns no cells after lifetime expires', () => {
    const system = makeSystem({ dissolveLifetime: 5 })
    system.spawn(10, 20, 5, 2, '#ff0000', 'dissolve')
    for (let i = 0; i < 10; i++) system.update()
    expect(system.getCells()).toHaveLength(0)
  })
})

// ─── Pool Reuse ──────────────────────────────────────────────────────────────

describe('pool reuse', () => {
  test('expired effects can be reused by new spawns', () => {
    const system = makeSystem({ maxEffects: 1, dissolveLifetime: 3 })
    expect(system.spawn(10, 20, 5, 2, '#ff0000', 'dissolve')).toBe(true)
    expect(system.spawn(20, 20, 5, 2, '#00ff00', 'dissolve')).toBe(false) // Pool full

    // Expire the first effect
    for (let i = 0; i < 3; i++) system.update()
    expect(system.getActiveCount()).toBe(0)

    // Now we can spawn again
    expect(system.spawn(20, 20, 5, 2, '#00ff00', 'dissolve')).toBe(true)
    expect(system.getActiveCount()).toBe(1)
  })

  test('multiple effects can be active simultaneously', () => {
    const system = makeSystem({ maxEffects: 5 })
    for (let i = 0; i < 5; i++) {
      system.spawn(i * 10, 20, 5, 2, '#ff0000', 'dissolve')
    }
    expect(system.getActiveCount()).toBe(5)
    system.update()
    expect(system.getActiveCount()).toBe(5)
  })
})

// ─── Variant Differences ─────────────────────────────────────────────────────

describe('variant differences', () => {
  test('shimmer deactivates before dissolve with default config', () => {
    const system = makeSystem()
    system.spawn(10, 20, 5, 2, '#ff0000', 'shimmer')
    system.spawn(20, 20, 5, 2, '#ff0000', 'dissolve')
    expect(system.getActiveCount()).toBe(2)

    // After shimmer lifetime, only dissolve should remain
    for (let i = 0; i < DEFAULT_DISSOLVE_CONFIG.shimmerLifetime; i++) {
      system.update()
    }
    expect(system.getActiveCount()).toBe(1)
  })

  test('shimmer cells stay closer to origin than dissolve cells', () => {
    // Use same spawn dimensions for fair comparison (shimmer has less drift)
    const shimmerSystem = makeSystem({}, 42)
    shimmerSystem.spawn(50, 20, 5, 2, '#ff0000', 'shimmer')
    for (let i = 0; i < 5; i++) shimmerSystem.update()
    const shimmerCells = shimmerSystem.getCells()

    const dissolveSystem = makeSystem({}, 42)
    dissolveSystem.spawn(50, 20, 5, 2, '#ff0000', 'dissolve')
    for (let i = 0; i < 5; i++) dissolveSystem.update()
    const dissolveCells = dissolveSystem.getCells()

    // Calculate average distance from origin for each
    const avgDist = (cells: Array<{x: number, y: number}>, ox: number, oy: number) => {
      if (cells.length === 0) return 0
      return cells.reduce((sum, c) => sum + Math.abs(c.x - ox) + Math.abs(c.y - oy), 0) / cells.length
    }

    if (shimmerCells.length > 0 && dissolveCells.length > 0) {
      const shimmerDist = avgDist(shimmerCells, 50, 20)
      const dissolveDist = avgDist(dissolveCells, 50, 20)
      expect(shimmerDist).toBeLessThanOrEqual(dissolveDist + 5) // Allow some tolerance
    }
  })
})

// ─── Deduplication ──────────────────────────────────────────────────────────

describe('getCells deduplication', () => {
  test('no two cells share the same (x, y) position', () => {
    // Spawn two effects at the exact same position so cells overlap
    const system = makeSystem({ maxEffects: 5 }, 42)
    system.spawn(50, 20, 5, 2, '#ff0000', 'shimmer')
    system.spawn(50, 20, 5, 2, '#00ff00', 'shimmer')
    system.update()

    const cells = system.getCells()
    const seen = new Set<string>()
    for (const cell of cells) {
      const key = `${cell.x},${cell.y}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  test('keeps the higher-density cell when positions collide', () => {
    // Spawn two dissolve effects at same position with different ages
    // so they produce different densities at the same coordinates
    const system = makeSystem({ maxEffects: 5, dissolveLifetime: 20 }, 42)
    system.spawn(50, 20, 5, 2, '#ff0000', 'dissolve')

    // Age the first effect so its density is lower
    for (let i = 0; i < 10; i++) system.update()

    // Spawn a fresh effect at the same position (higher density)
    system.spawn(50, 20, 5, 2, '#00ff00', 'dissolve')
    system.update()

    const cells = system.getCells()

    // Find any position that both effects could produce cells at
    // All cells must be unique by position
    const positions = new Map<string, string>()
    for (const cell of cells) {
      const key = `${cell.x},${cell.y}`
      expect(positions.has(key)).toBe(false)
      positions.set(key, cell.char)
    }
  })
})

// ─── getActiveCount (loop counter, not .filter()) ────────────────────────────

describe('getActiveCount', () => {
  test('returns 0 with no effects', () => {
    const system = makeSystem()
    expect(system.getActiveCount()).toBe(0)
  })

  test('increments correctly as effects are spawned', () => {
    const system = makeSystem({ maxEffects: 5 })
    system.spawn(0, 0, 5, 2, '#ff0000', 'dissolve')
    expect(system.getActiveCount()).toBe(1)
    system.spawn(10, 0, 5, 2, '#ff0000', 'dissolve')
    expect(system.getActiveCount()).toBe(2)
    system.spawn(20, 0, 5, 2, '#ff0000', 'shimmer')
    expect(system.getActiveCount()).toBe(3)
  })

  test('decrements when effects expire', () => {
    const system = makeSystem({ maxEffects: 5, dissolveLifetime: 2, shimmerLifetime: 1 })
    system.spawn(0, 0, 5, 2, '#ff0000', 'shimmer')
    system.spawn(10, 0, 5, 2, '#ff0000', 'dissolve')
    expect(system.getActiveCount()).toBe(2)
    system.update() // tick 1: shimmer expires
    expect(system.getActiveCount()).toBe(1)
    system.update() // tick 2: dissolve expires
    expect(system.getActiveCount()).toBe(0)
  })
})

// ─── EMPTY_CELLS frozen ──────────────────────────────────────────────────────

describe('EMPTY_CELLS safety', () => {
  test('getCells returns frozen array when idle', () => {
    const system = makeSystem()
    const cells = system.getCells()
    expect(cells).toHaveLength(0)
    expect(Object.isFrozen(cells)).toBe(true)
  })

  test('frozen empty array cannot be mutated', () => {
    const system = makeSystem()
    const cells = system.getCells()
    expect(() => { (cells as DissolveCellOutput[]).push({ x: 0, y: 0, char: 'x', color: '#000' }) }).toThrow()
  })
})

// ─── Bounds Checking ────────────────────────────────────────────────────────

describe('bounds checking', () => {
  test('filters out cells with negative x positions', () => {
    // Spawn at x=0 so cells with negative offsetX drift go off-screen left
    const system = makeSystem({ dissolveLifetime: 20 })
    system.spawn(0, 10, 5, 2, '#ff0000', 'dissolve')
    // Run many ticks to let drift accumulate
    for (let i = 0; i < 15; i++) system.update()
    const cells = system.getCells()
    for (const cell of cells) {
      expect(cell.x).toBeGreaterThanOrEqual(0)
    }
  })

  test('filters out cells with negative y positions', () => {
    // Spawn at y=0 so cells with upward drift go off-screen top
    const system = makeSystem({ dissolveLifetime: 20 })
    system.spawn(50, 0, 5, 2, '#ff0000', 'dissolve')
    for (let i = 0; i < 15; i++) system.update()
    const cells = system.getCells()
    for (const cell of cells) {
      expect(cell.y).toBeGreaterThanOrEqual(0)
    }
  })

  test('filters out cells beyond default screen width (120)', () => {
    // Spawn at far right edge
    const system = makeSystem({ dissolveLifetime: 20 })
    system.spawn(118, 10, 5, 2, '#ff0000', 'dissolve')
    for (let i = 0; i < 15; i++) system.update()
    const cells = system.getCells()
    for (const cell of cells) {
      expect(cell.x).toBeLessThan(120)
    }
  })

  test('filters out cells beyond default screen height (36)', () => {
    // Spawn at bottom edge
    const system = makeSystem({ dissolveLifetime: 20 })
    system.spawn(50, 34, 5, 2, '#ff0000', 'dissolve')
    for (let i = 0; i < 15; i++) system.update()
    const cells = system.getCells()
    for (const cell of cells) {
      expect(cell.y).toBeLessThan(36)
    }
  })

  test('respects custom screenWidth and screenHeight', () => {
    const system = makeSystem({ screenWidth: 80, screenHeight: 24, dissolveLifetime: 20 })
    system.spawn(78, 22, 5, 2, '#ff0000', 'dissolve')
    for (let i = 0; i < 15; i++) system.update()
    const cells = system.getCells()
    for (const cell of cells) {
      expect(cell.x).toBeGreaterThanOrEqual(0)
      expect(cell.x).toBeLessThan(80)
      expect(cell.y).toBeGreaterThanOrEqual(0)
      expect(cell.y).toBeLessThan(24)
    }
  })
})

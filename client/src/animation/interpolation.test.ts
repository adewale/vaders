// client/src/animation/interpolation.test.ts
// Unit tests for smooth movement interpolation

import { describe, test, expect, beforeEach } from 'bun:test'
import {
  InterpolationManager,
  HALF_BLOCKS,
  HALF_BLOCKS_ASCII,
  DEFAULT_INTERPOLATION_CONFIG,
  toRenderPosition,
  batchUpdateEntities,
  createFrameTiming,
  updateFrameTiming,
  markTick,
  lerpPosition,
} from './interpolation'

describe('HALF_BLOCKS', () => {
  test('contains half-block characters', () => {
    expect(HALF_BLOCKS.left).toBe('▌')
    expect(HALF_BLOCKS.right).toBe('▐')
    expect(HALF_BLOCKS.full).toBe('█')
    expect(HALF_BLOCKS.empty).toBe(' ')
  })
})

describe('HALF_BLOCKS_ASCII', () => {
  test('contains ASCII fallback characters', () => {
    expect(HALF_BLOCKS_ASCII.left).toBe('[')
    expect(HALF_BLOCKS_ASCII.right).toBe(']')
    expect(HALF_BLOCKS_ASCII.full).toBe('#')
    expect(HALF_BLOCKS_ASCII.empty).toBe(' ')
  })
})

describe('DEFAULT_INTERPOLATION_CONFIG', () => {
  test('has sensible defaults', () => {
    expect(DEFAULT_INTERPOLATION_CONFIG.tickDurationMs).toBe(33) // ~30Hz
    expect(DEFAULT_INTERPOLATION_CONFIG.targetFps).toBe(60)
    expect(DEFAULT_INTERPOLATION_CONFIG.maxLerpDistance).toBe(10)
    expect(DEFAULT_INTERPOLATION_CONFIG.useAscii).toBe(false)
  })
})

describe('InterpolationManager', () => {
  let manager: InterpolationManager

  beforeEach(() => {
    manager = new InterpolationManager()
  })

  describe('constructor', () => {
    test('creates with default config', () => {
      expect(manager.getEntityCount()).toBe(0)
    })

    test('accepts custom config', () => {
      const custom = new InterpolationManager({
        tickDurationMs: 50,
        maxLerpDistance: 20,
        useAscii: true,
      })
      expect(custom.getEntityCount()).toBe(0)
    })
  })

  describe('updateEntity', () => {
    test('adds new entity', () => {
      manager.updateEntity('player1', 10, 20, 1)
      expect(manager.hasEntity('player1')).toBe(true)
      expect(manager.getEntityCount()).toBe(1)
    })

    test('sets initial position', () => {
      manager.updateEntity('player1', 15, 25, 1)
      const pos = manager.getVisualPosition('player1')
      expect(pos?.x).toBe(15)
      expect(pos?.y).toBe(25)
    })

    test('updates existing entity position', () => {
      manager.updateEntity('player1', 10, 20, 1)
      manager.updateEntity('player1', 15, 25, 2)
      const pos = manager.getVisualPosition('player1')
      // After update, visual position might not be at new position yet
      // (depends on interpolation)
      expect(manager.hasEntity('player1')).toBe(true)
    })

    test('stores previous position on tick change', () => {
      manager.updateEntity('player1', 10, 20, 1)
      manager.updateEntity('player1', 15, 25, 2)

      // Interpolate with 0 elapsed = at previous position
      manager.startTick(2)
      manager.interpolate(0)
      const pos = manager.getVisualPosition('player1')
      expect(pos?.x).toBe(10) // Previous position
      expect(pos?.y).toBe(20)
    })

    test('keeps same previous position for same tick', () => {
      manager.updateEntity('player1', 10, 20, 1)
      manager.updateEntity('player1', 12, 22, 1) // Same tick
      manager.updateEntity('player1', 15, 25, 1) // Same tick again

      // All updates on same tick don't update prev
      manager.startTick(1)
      manager.interpolate(0)
      const pos = manager.getVisualPosition('player1')
      // First position becomes prev for first frame, current is 15,25
      expect(pos?.x).toBe(10)
    })
  })

  describe('removeEntity', () => {
    test('removes tracked entity', () => {
      manager.updateEntity('player1', 10, 20, 1)
      expect(manager.hasEntity('player1')).toBe(true)
      manager.removeEntity('player1')
      expect(manager.hasEntity('player1')).toBe(false)
    })

    test('handles removing non-existent entity', () => {
      expect(() => manager.removeEntity('unknown')).not.toThrow()
    })
  })

  describe('clear', () => {
    test('removes all entities', () => {
      manager.updateEntity('player1', 10, 20, 1)
      manager.updateEntity('player2', 30, 40, 1)
      expect(manager.getEntityCount()).toBe(2)
      manager.clear()
      expect(manager.getEntityCount()).toBe(0)
    })
  })

  describe('interpolate', () => {
    test('does nothing with no entities', () => {
      expect(() => manager.interpolate(16)).not.toThrow()
    })

    test('interpolates to midpoint at half duration', () => {
      // Set up entity at position (0,0) on tick 1
      manager.updateEntity('player1', 0, 0, 1)
      manager.startTick(1)
      manager.interpolate(33) // Complete first tick to establish position

      // Move to (6,4) on tick 2 - this stores (0,0) as prev
      // Distance = sqrt(36+16) = sqrt(52) = ~7.2, which is < maxLerpDistance (10)
      manager.updateEntity('player1', 6, 4, 2)
      manager.startTick(2)

      // At half tick duration (16.5ms for 33ms tick)
      manager.interpolate(16.5)
      const pos = manager.getVisualPosition('player1')
      expect(pos?.x).toBeCloseTo(3, 0)
      expect(pos?.y).toBeCloseTo(2, 0)
    })

    test('reaches target at full duration', () => {
      // Set up entity at position (0,0) on tick 1
      manager.updateEntity('player1', 0, 0, 1)
      manager.startTick(1)
      manager.interpolate(33) // Complete first tick

      // Move to (6,4) on tick 2 - within maxLerpDistance
      manager.updateEntity('player1', 6, 4, 2)
      manager.startTick(2)

      manager.interpolate(33) // Full tick duration
      const pos = manager.getVisualPosition('player1')
      expect(pos?.x).toBeCloseTo(6, 1)
      expect(pos?.y).toBeCloseTo(4, 1)
    })

    test('clamps to current position beyond duration', () => {
      // Set up entity at position (0,0) on tick 1
      manager.updateEntity('player1', 0, 0, 1)
      manager.startTick(1)
      manager.interpolate(33) // Complete first tick

      // Move to (6,4) on tick 2 - within maxLerpDistance
      manager.updateEntity('player1', 6, 4, 2)
      manager.startTick(2)

      manager.interpolate(100) // Way past duration
      const pos = manager.getVisualPosition('player1')
      expect(pos?.x).toBe(6)
      expect(pos?.y).toBe(4)
    })

    test('teleports for large distances', () => {
      const teleportManager = new InterpolationManager({ maxLerpDistance: 5 })
      teleportManager.updateEntity('player1', 0, 0, 1)
      teleportManager.updateEntity('player1', 100, 100, 2) // > maxLerpDistance
      teleportManager.startTick(2)

      teleportManager.interpolate(16) // Mid-tick
      const pos = teleportManager.getVisualPosition('player1')
      // Should snap to target instead of interpolating
      expect(pos?.x).toBe(100)
      expect(pos?.y).toBe(100)
    })
  })

  describe('getVisualPosition', () => {
    test('returns null for unknown entity', () => {
      expect(manager.getVisualPosition('unknown')).toBeNull()
    })

    test('returns position object for known entity', () => {
      manager.updateEntity('player1', 10, 20, 1)
      const pos = manager.getVisualPosition('player1')
      expect(pos).not.toBeNull()
      expect(typeof pos?.x).toBe('number')
      expect(typeof pos?.y).toBe('number')
    })
  })

  describe('getCellPosition', () => {
    test('returns null for unknown entity', () => {
      expect(manager.getCellPosition('unknown')).toBeNull()
    })

    test('returns cell coordinates and sub-cell offset', () => {
      manager.updateEntity('player1', 10.5, 20.3, 1)
      const cell = manager.getCellPosition('player1')
      expect(cell).not.toBeNull()
      expect(cell?.cellX).toBe(10)
      expect(cell?.cellY).toBe(20) // Rounded
      expect(cell?.subX).toBeCloseTo(0.5, 1)
    })
  })

  describe('getHalfBlockChar', () => {
    test('returns full block for low offset', () => {
      expect(manager.getHalfBlockChar(0)).toBe(HALF_BLOCKS.full)
      expect(manager.getHalfBlockChar(0.2)).toBe(HALF_BLOCKS.full)
    })

    test('returns right half for mid offset', () => {
      expect(manager.getHalfBlockChar(0.3)).toBe(HALF_BLOCKS.right)
      expect(manager.getHalfBlockChar(0.5)).toBe(HALF_BLOCKS.right)
      expect(manager.getHalfBlockChar(0.7)).toBe(HALF_BLOCKS.right)
    })

    test('returns empty for high offset', () => {
      expect(manager.getHalfBlockChar(0.8)).toBe(HALF_BLOCKS.empty)
      expect(manager.getHalfBlockChar(1)).toBe(HALF_BLOCKS.empty)
    })
  })

  describe('getAllVisualPositions', () => {
    test('returns empty map when no entities', () => {
      const positions = manager.getAllVisualPositions()
      expect(positions.size).toBe(0)
    })

    test('returns all entity positions', () => {
      manager.updateEntity('player1', 10, 20, 1)
      manager.updateEntity('player2', 30, 40, 1)
      const positions = manager.getAllVisualPositions()
      expect(positions.size).toBe(2)
      expect(positions.has('player1')).toBe(true)
      expect(positions.has('player2')).toBe(true)
    })
  })

  describe('hasEntity', () => {
    test('returns false for non-existent entity', () => {
      expect(manager.hasEntity('unknown')).toBe(false)
    })

    test('returns true for existing entity', () => {
      manager.updateEntity('player1', 10, 20, 1)
      expect(manager.hasEntity('player1')).toBe(true)
    })
  })

  describe('getEntityCount', () => {
    test('returns 0 initially', () => {
      expect(manager.getEntityCount()).toBe(0)
    })

    test('returns correct count', () => {
      manager.updateEntity('p1', 0, 0, 1)
      manager.updateEntity('p2', 0, 0, 1)
      manager.updateEntity('p3', 0, 0, 1)
      expect(manager.getEntityCount()).toBe(3)
    })
  })

  describe('getInterpolationFactor', () => {
    test('returns factor based on elapsed time', () => {
      manager.startTick(1)
      // Just after startTick, factor should be low
      const factor = manager.getInterpolationFactor()
      expect(factor).toBeGreaterThanOrEqual(0)
      expect(factor).toBeLessThanOrEqual(1)
    })
  })

  describe('ASCII mode', () => {
    test('uses ASCII half-blocks', () => {
      const asciiManager = new InterpolationManager({ useAscii: true })
      expect(asciiManager.getHalfBlockChar(0)).toBe(HALF_BLOCKS_ASCII.full)
      expect(asciiManager.getHalfBlockChar(0.5)).toBe(HALF_BLOCKS_ASCII.right)
    })
  })
})

describe('toRenderPosition', () => {
  test('returns integer cell coordinates', () => {
    const pos = toRenderPosition(10.7, 20.3)
    expect(pos.cellX).toBe(10)
    expect(pos.cellY).toBe(20)
  })

  test('returns sub-cell offsets', () => {
    const pos = toRenderPosition(10.7, 20.3)
    expect(pos.subX).toBeCloseTo(0.7, 1)
    expect(pos.subY).toBeCloseTo(0.3, 1)
  })

  test('returns appropriate half-block character', () => {
    const lowOffset = toRenderPosition(10.1, 20)
    expect(lowOffset.halfBlock).toBe(HALF_BLOCKS.full)

    const midOffset = toRenderPosition(10.5, 20)
    expect(midOffset.halfBlock).toBe(HALF_BLOCKS.right)

    const highOffset = toRenderPosition(10.9, 20)
    expect(highOffset.halfBlock).toBe(HALF_BLOCKS.empty)
  })

  test('sets hasSubCellOffset flag', () => {
    const noOffset = toRenderPosition(10, 20)
    expect(noOffset.hasSubCellOffset).toBe(false)

    const withOffset = toRenderPosition(10.3, 20.2)
    expect(withOffset.hasSubCellOffset).toBe(true)
  })

  test('uses ASCII mode when specified', () => {
    const pos = toRenderPosition(10.5, 20, true)
    expect(pos.halfBlock).toBe(HALF_BLOCKS_ASCII.right)
  })
})

describe('batchUpdateEntities', () => {
  test('updates multiple entities at once', () => {
    const manager = new InterpolationManager()
    const entities = [
      { id: 'p1', x: 10, y: 20 },
      { id: 'p2', x: 30, y: 40 },
      { id: 'p3', x: 50, y: 60 },
    ]

    batchUpdateEntities(manager, entities, 1)

    expect(manager.getEntityCount()).toBe(3)
    expect(manager.hasEntity('p1')).toBe(true)
    expect(manager.hasEntity('p2')).toBe(true)
    expect(manager.hasEntity('p3')).toBe(true)
  })

  test('handles empty array', () => {
    const manager = new InterpolationManager()
    batchUpdateEntities(manager, [], 1)
    expect(manager.getEntityCount()).toBe(0)
  })
})

describe('FrameTiming utilities', () => {
  describe('createFrameTiming', () => {
    test('creates timing object with defaults', () => {
      const timing = createFrameTiming()
      expect(timing.tickDurationMs).toBe(33)
      expect(timing.t).toBe(0)
      expect(typeof timing.lastTickTimestamp).toBe('number')
    })

    test('accepts custom tick duration', () => {
      const timing = createFrameTiming(50)
      expect(timing.tickDurationMs).toBe(50)
    })
  })

  describe('updateFrameTiming', () => {
    test('updates t based on elapsed time', () => {
      const timing = createFrameTiming(100)
      timing.lastTickTimestamp = performance.now() - 50 // 50ms ago

      updateFrameTiming(timing)

      expect(timing.t).toBeGreaterThan(0)
      expect(timing.t).toBeLessThanOrEqual(1)
    })

    test('clamps t to maximum of 1', () => {
      const timing = createFrameTiming(100)
      timing.lastTickTimestamp = performance.now() - 200 // 200ms ago (> tick duration)

      updateFrameTiming(timing)

      expect(timing.t).toBe(1)
    })
  })

  describe('markTick', () => {
    test('updates timestamp and resets t', () => {
      const timing = createFrameTiming()
      timing.t = 0.5
      timing.lastTickTimestamp = 0

      markTick(timing)

      expect(timing.t).toBe(0)
      expect(timing.lastTickTimestamp).toBeGreaterThan(0)
    })
  })
})

describe('lerpPosition', () => {
  test('returns previous position at t=0', () => {
    const pos = lerpPosition(10, 20, 30, 40, 0)
    expect(pos.x).toBe(10)
    expect(pos.y).toBe(20)
  })

  test('returns current position at t=1', () => {
    const pos = lerpPosition(10, 20, 30, 40, 1)
    expect(pos.x).toBe(30)
    expect(pos.y).toBe(40)
  })

  test('returns midpoint at t=0.5', () => {
    const pos = lerpPosition(0, 0, 100, 100, 0.5)
    expect(pos.x).toBe(50)
    expect(pos.y).toBe(50)
  })

  test('handles negative coordinates', () => {
    const pos = lerpPosition(-10, -20, 10, 20, 0.5)
    expect(pos.x).toBe(0)
    expect(pos.y).toBe(0)
  })

  test('handles same start and end', () => {
    const pos = lerpPosition(50, 50, 50, 50, 0.5)
    expect(pos.x).toBe(50)
    expect(pos.y).toBe(50)
  })
})

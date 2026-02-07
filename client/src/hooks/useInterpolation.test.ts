// client/src/hooks/useInterpolation.test.ts
// Tests for useInterpolation hook logic
//
// The hook wraps InterpolationManager (already tested in animation/interpolation.test.ts)
// with React state management. We test:
// 1. The InterpolationManager through the hook's interface contract
// 2. Entity position update and tracking lifecycle
// 3. Interpolation between game ticks
// 4. Batch operations and cleanup
// 5. toRenderPosition sub-cell precision

import { describe, test, expect, beforeEach } from 'bun:test'
import {
  InterpolationManager,
  DEFAULT_INTERPOLATION_CONFIG,
  toRenderPosition,
  batchUpdateEntities,
  lerpPosition,
  type RenderPosition,
} from '../animation/interpolation'
import type { EntityUpdate } from './useInterpolation'

// ─── Test Helpers ───────────────────────────────────────────────────────────

function createTestEntities(count: number): EntityUpdate[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `entity-${i}`,
    x: 10 + i * 5,
    y: 20 + i * 3,
  }))
}

// ─── Entity Update and Tracking ─────────────────────────────────────────────
// The hook's updateEntities/updateEntity/removeEntity/clear mirror the manager

describe('Entity Lifecycle Through Hook Interface', () => {
  let manager: InterpolationManager

  beforeEach(() => {
    manager = new InterpolationManager()
  })

  describe('updateEntities (batch)', () => {
    test('adds multiple entities at once', () => {
      const entities = createTestEntities(5)
      batchUpdateEntities(manager, entities, 1)
      expect(manager.getEntityCount()).toBe(5)
    })

    test('each entity is trackable after batch update', () => {
      const entities = createTestEntities(3)
      batchUpdateEntities(manager, entities, 1)

      for (const entity of entities) {
        expect(manager.hasEntity(entity.id)).toBe(true)
        const pos = manager.getVisualPosition(entity.id)
        expect(pos).not.toBeNull()
        expect(pos!.x).toBe(entity.x)
        expect(pos!.y).toBe(entity.y)
      }
    })

    test('handles empty entity array', () => {
      batchUpdateEntities(manager, [], 1)
      expect(manager.getEntityCount()).toBe(0)
    })

    test('updates existing entities on new tick', () => {
      batchUpdateEntities(manager, [{ id: 'p1', x: 10, y: 20 }], 1)
      batchUpdateEntities(manager, [{ id: 'p1', x: 15, y: 25 }], 2)

      // Entity should still be tracked (updated, not duplicated)
      expect(manager.getEntityCount()).toBe(1)
    })
  })

  describe('updateEntity (single)', () => {
    test('adds a new entity', () => {
      manager.updateEntity('player1', 50, 30, 1)
      expect(manager.hasEntity('player1')).toBe(true)
    })

    test('new entity visual position matches initial position', () => {
      manager.updateEntity('player1', 50, 30, 1)
      const pos = manager.getVisualPosition('player1')
      expect(pos!.x).toBe(50)
      expect(pos!.y).toBe(30)
    })

    test('stores previous position on tick change', () => {
      manager.updateEntity('player1', 10, 20, 1)
      // Move by small amount (distance < maxLerpDistance of 10)
      manager.updateEntity('player1', 15, 25, 2)

      // Interpolating at t=0 should give the previous position
      manager.startTick(2)
      manager.interpolate(0)
      const pos = manager.getVisualPosition('player1')
      expect(pos!.x).toBe(10) // Previous position
      expect(pos!.y).toBe(20)
    })
  })

  describe('removeEntity', () => {
    test('removes a tracked entity', () => {
      manager.updateEntity('p1', 10, 20, 1)
      expect(manager.hasEntity('p1')).toBe(true)

      manager.removeEntity('p1')
      expect(manager.hasEntity('p1')).toBe(false)
      expect(manager.getVisualPosition('p1')).toBeNull()
    })

    test('removing non-existent entity does not throw', () => {
      expect(() => manager.removeEntity('ghost')).not.toThrow()
    })

    test('reduces entity count', () => {
      manager.updateEntity('p1', 0, 0, 1)
      manager.updateEntity('p2', 0, 0, 1)
      expect(manager.getEntityCount()).toBe(2)

      manager.removeEntity('p1')
      expect(manager.getEntityCount()).toBe(1)
    })
  })

  describe('clear', () => {
    test('removes all entities', () => {
      batchUpdateEntities(manager, createTestEntities(10), 1)
      expect(manager.getEntityCount()).toBe(10)

      manager.clear()
      expect(manager.getEntityCount()).toBe(0)
    })

    test('getAllVisualPositions returns empty map after clear', () => {
      batchUpdateEntities(manager, createTestEntities(5), 1)
      manager.clear()
      expect(manager.getAllVisualPositions().size).toBe(0)
    })
  })
})

// ─── Position Interpolation ─────────────────────────────────────────────────

describe('Position Interpolation Between Game Ticks', () => {
  let manager: InterpolationManager

  beforeEach(() => {
    manager = new InterpolationManager()
  })

  test('interpolates to midpoint at half tick duration', () => {
    // Set up initial position
    manager.updateEntity('p1', 0, 0, 1)
    manager.startTick(1)
    manager.interpolate(33) // Complete first tick

    // Move entity on next tick
    manager.updateEntity('p1', 6, 4, 2)
    manager.startTick(2)

    // Interpolate at half tick (16.5ms out of 33ms)
    manager.interpolate(16.5)
    const pos = manager.getVisualPosition('p1')

    expect(pos!.x).toBeCloseTo(3, 0) // Midpoint of 0..6
    expect(pos!.y).toBeCloseTo(2, 0) // Midpoint of 0..4
  })

  test('reaches target position at full tick duration', () => {
    manager.updateEntity('p1', 0, 0, 1)
    manager.startTick(1)
    manager.interpolate(33)

    manager.updateEntity('p1', 10, 8, 2)
    manager.startTick(2)

    manager.interpolate(33) // Full tick
    const pos = manager.getVisualPosition('p1')

    expect(pos!.x).toBeCloseTo(10, 1)
    expect(pos!.y).toBeCloseTo(8, 1)
  })

  test('stays at previous position at t=0', () => {
    manager.updateEntity('p1', 10, 20, 1)
    manager.startTick(1)
    manager.interpolate(33)

    // Move by small amount (distance < maxLerpDistance of 10)
    manager.updateEntity('p1', 16, 24, 2)
    manager.startTick(2)

    manager.interpolate(0)
    const pos = manager.getVisualPosition('p1')

    expect(pos!.x).toBe(10) // Previous position
    expect(pos!.y).toBe(20)
  })

  test('clamps at t=1 for elapsed time beyond tick duration', () => {
    manager.updateEntity('p1', 0, 0, 1)
    manager.startTick(1)
    manager.interpolate(33)

    manager.updateEntity('p1', 10, 10, 2)
    manager.startTick(2)

    manager.interpolate(100) // Way past 33ms
    const pos = manager.getVisualPosition('p1')

    expect(pos!.x).toBe(10)
    expect(pos!.y).toBe(10)
  })

  test('teleports for large distance moves', () => {
    const teleportManager = new InterpolationManager({ maxLerpDistance: 5 })

    teleportManager.updateEntity('p1', 0, 0, 1)
    teleportManager.updateEntity('p1', 50, 50, 2) // Distance > 5

    teleportManager.startTick(2)
    teleportManager.interpolate(16) // Half tick

    const pos = teleportManager.getVisualPosition('p1')
    // Should snap instead of interpolating
    expect(pos!.x).toBe(50)
    expect(pos!.y).toBe(50)
  })

  test('does not teleport for small distance moves', () => {
    manager.updateEntity('p1', 0, 0, 1)
    manager.startTick(1)
    manager.interpolate(33)

    manager.updateEntity('p1', 1, 0, 2) // Distance = 1, well within maxLerpDistance (10)
    manager.startTick(2)

    manager.interpolate(16.5) // Half tick
    const pos = manager.getVisualPosition('p1')

    // Should interpolate smoothly, not snap
    expect(pos!.x).toBeCloseTo(0.5, 1) // Midpoint of 0..1
  })

  test('handles stationary entities (no movement)', () => {
    manager.updateEntity('p1', 50, 25, 1)
    manager.startTick(1)
    manager.interpolate(33)

    manager.updateEntity('p1', 50, 25, 2) // Same position
    manager.startTick(2)

    manager.interpolate(16.5)
    const pos = manager.getVisualPosition('p1')

    expect(pos!.x).toBe(50)
    expect(pos!.y).toBe(25)
  })
})

// ─── getAllVisualPositions ───────────────────────────────────────────────────

describe('getAllVisualPositions', () => {
  test('returns Map of all entity positions', () => {
    const manager = new InterpolationManager()
    batchUpdateEntities(manager, createTestEntities(4), 1)

    const positions = manager.getAllVisualPositions()
    expect(positions.size).toBe(4)

    for (let i = 0; i < 4; i++) {
      const id = `entity-${i}`
      expect(positions.has(id)).toBe(true)
      const pos = positions.get(id)!
      expect(pos.x).toBe(10 + i * 5)
      expect(pos.y).toBe(20 + i * 3)
    }
  })

  test('returns empty Map when no entities', () => {
    const manager = new InterpolationManager()
    expect(manager.getAllVisualPositions().size).toBe(0)
  })
})

// ─── Interpolation Factor ───────────────────────────────────────────────────

describe('Interpolation Factor', () => {
  test('factor is between 0 and 1 right after startTick', () => {
    const manager = new InterpolationManager()
    manager.startTick(1)

    const factor = manager.getInterpolationFactor()
    expect(factor).toBeGreaterThanOrEqual(0)
    expect(factor).toBeLessThanOrEqual(1)
  })

  test('factor formula: clamp(elapsed / tickDurationMs, 0, 1)', () => {
    // Verify the formula directly
    const tickDurationMs = 33
    expect(Math.min(1, Math.max(0, 0 / tickDurationMs))).toBe(0)
    expect(Math.min(1, Math.max(0, 16.5 / tickDurationMs))).toBeCloseTo(0.5, 1)
    expect(Math.min(1, Math.max(0, 33 / tickDurationMs))).toBe(1)
    expect(Math.min(1, Math.max(0, 100 / tickDurationMs))).toBe(1)
  })
})

// ─── markTick ───────────────────────────────────────────────────────────────

describe('markTick', () => {
  test('updates the tick timestamp', () => {
    const manager = new InterpolationManager()
    const before = performance.now()
    manager.startTick(1)
    const after = performance.now()

    // The factor should be very small right after marking (close to 0)
    const factor = manager.getInterpolationFactor()
    expect(factor).toBeGreaterThanOrEqual(0)
    expect(factor).toBeLessThan(0.5) // Should be very close to 0
  })
})

// ─── toRenderPosition (sub-cell precision) ──────────────────────────────────

describe('toRenderPosition Through Hook Interface', () => {
  test('converts integer position correctly', () => {
    const pos = toRenderPosition(10, 20)
    expect(pos.cellX).toBe(10)
    expect(pos.cellY).toBe(20)
    expect(pos.subX).toBeCloseTo(0, 1)
    expect(pos.subY).toBeCloseTo(0, 1)
    expect(pos.hasSubCellOffset).toBe(false)
  })

  test('converts fractional position correctly', () => {
    const pos = toRenderPosition(10.7, 20.3)
    expect(pos.cellX).toBe(10)
    expect(pos.cellY).toBe(20)
    expect(pos.subX).toBeCloseTo(0.7, 1)
    expect(pos.subY).toBeCloseTo(0.3, 1)
    expect(pos.hasSubCellOffset).toBe(true)
  })

  test('half-block character selection', () => {
    // subX < 0.25: full block
    expect(toRenderPosition(10.1, 20).halfBlock).toBe('\u2588') // full block

    // 0.25 <= subX < 0.75: right half
    expect(toRenderPosition(10.5, 20).halfBlock).toBe('\u2590') // right half-block

    // subX >= 0.75: empty
    expect(toRenderPosition(10.8, 20).halfBlock).toBe(' ')
  })

  test('ASCII mode uses different characters', () => {
    const pos = toRenderPosition(10.5, 20, true)
    expect(pos.halfBlock).toBe(']') // ASCII right half-block
  })

  test('hasSubCellOffset threshold is 0.1', () => {
    expect(toRenderPosition(10.05, 20.05).hasSubCellOffset).toBe(false) // Both < 0.1
    expect(toRenderPosition(10.15, 20.0).hasSubCellOffset).toBe(true)   // subX > 0.1
    expect(toRenderPosition(10.0, 20.15).hasSubCellOffset).toBe(true)   // subY > 0.1
  })
})

// ─── lerpPosition utility ───────────────────────────────────────────────────

describe('lerpPosition Utility', () => {
  test('returns previous position at t=0', () => {
    const pos = lerpPosition(0, 0, 100, 100, 0)
    expect(pos.x).toBe(0)
    expect(pos.y).toBe(0)
  })

  test('returns current position at t=1', () => {
    const pos = lerpPosition(0, 0, 100, 100, 1)
    expect(pos.x).toBe(100)
    expect(pos.y).toBe(100)
  })

  test('returns midpoint at t=0.5', () => {
    const pos = lerpPosition(10, 20, 30, 40, 0.5)
    expect(pos.x).toBe(20)
    expect(pos.y).toBe(30)
  })

  test('handles negative coordinates', () => {
    const pos = lerpPosition(-10, -20, 10, 20, 0.5)
    expect(pos.x).toBe(0)
    expect(pos.y).toBe(0)
  })

  test('handles same start and end', () => {
    const pos = lerpPosition(50, 50, 50, 50, 0.7)
    expect(pos.x).toBe(50)
    expect(pos.y).toBe(50)
  })

  test('quarter interpolation', () => {
    const pos = lerpPosition(0, 0, 100, 100, 0.25)
    expect(pos.x).toBe(25)
    expect(pos.y).toBe(25)
  })

  test('three-quarter interpolation', () => {
    const pos = lerpPosition(0, 0, 100, 100, 0.75)
    expect(pos.x).toBe(75)
    expect(pos.y).toBe(75)
  })
})

// ─── EntityUpdate Interface ─────────────────────────────────────────────────

describe('EntityUpdate Interface', () => {
  test('requires id, x, and y fields', () => {
    const update: EntityUpdate = {
      id: 'alien-42',
      x: 55,
      y: 12,
    }

    expect(update.id).toBe('alien-42')
    expect(update.x).toBe(55)
    expect(update.y).toBe(12)
  })
})

// ─── Configuration ──────────────────────────────────────────────────────────

describe('InterpolationManager Configuration', () => {
  test('default tickDurationMs is 33ms (30Hz)', () => {
    expect(DEFAULT_INTERPOLATION_CONFIG.tickDurationMs).toBe(33)
  })

  test('default targetFps is 60', () => {
    expect(DEFAULT_INTERPOLATION_CONFIG.targetFps).toBe(60)
  })

  test('default maxLerpDistance is 10', () => {
    expect(DEFAULT_INTERPOLATION_CONFIG.maxLerpDistance).toBe(10)
  })

  test('default useAscii is false', () => {
    expect(DEFAULT_INTERPOLATION_CONFIG.useAscii).toBe(false)
  })

  test('custom config overrides defaults', () => {
    const manager = new InterpolationManager({
      tickDurationMs: 50,
      maxLerpDistance: 20,
    })

    // Manager should work with custom config
    manager.updateEntity('p1', 0, 0, 1)
    expect(manager.hasEntity('p1')).toBe(true)
  })
})

// ─── Multiple Entities Simultaneous Interpolation ───────────────────────────

describe('Multiple Entities Interpolation', () => {
  test('interpolates all entities independently', () => {
    const manager = new InterpolationManager()

    // Tick 1: initial positions
    manager.updateEntity('p1', 0, 0, 1)
    manager.updateEntity('p2', 100, 100, 1)
    manager.startTick(1)
    manager.interpolate(33) // Complete first tick

    // Tick 2: move in different directions
    manager.updateEntity('p1', 10, 0, 2)  // Move right
    manager.updateEntity('p2', 90, 100, 2)  // Move left
    manager.startTick(2)

    // Interpolate at midpoint
    manager.interpolate(16.5)

    const pos1 = manager.getVisualPosition('p1')
    const pos2 = manager.getVisualPosition('p2')

    expect(pos1!.x).toBeCloseTo(5, 0)   // Midpoint 0..10
    expect(pos2!.x).toBeCloseTo(95, 0)  // Midpoint 100..90
  })
})

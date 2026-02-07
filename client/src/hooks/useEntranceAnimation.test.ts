// client/src/hooks/useEntranceAnimation.test.ts
// Tests for useEntranceAnimation hook logic
//
// The hook wraps EntranceAnimation (already tested in animation/entrance.test.ts)
// with React state management. We test:
// 1. The underlying EntranceAnimation class behavior through the hook's interface
// 2. State machine transitions (idle -> running -> complete)
// 3. Position tracking for entering aliens
// 4. Hook interface contracts (types, return values)

import { describe, test, expect, beforeEach } from 'bun:test'
import {
  EntranceAnimation,
  DEFAULT_ENTRANCE_CONFIG,
} from '../animation/entrance'
import type { EntranceAlien, AlienVisualPosition } from './useEntranceAnimation'

// ─── Test Helpers ───────────────────────────────────────────────────────────

function createTestAliens(count: number): EntranceAlien[] {
  const aliens: EntranceAlien[] = []
  const cols = Math.ceil(Math.sqrt(count))
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols)
    const col = i % cols
    aliens.push({
      id: `alien-${i}`,
      row,
      col,
      targetX: 10 + col * 7,
      targetY: 5 + row * 3,
    })
  }
  return aliens
}

// ─── Hook State Machine ─────────────────────────────────────────────────────
// The hook manages these state transitions:
// 1. Initial: isRunning=false, isComplete=true, positions=empty, progress=1
// 2. After start(): isRunning=true, isComplete=false, progress=0
// 3. During animation: isRunning=true, positions updating
// 4. After completion: isRunning=false, isComplete=true, progress=1
// 5. After stop(): snaps to formation, isRunning=false, isComplete=true

describe('Entrance Animation State Machine', () => {
  let entrance: EntranceAnimation

  beforeEach(() => {
    entrance = new EntranceAnimation()
  })

  describe('initial state', () => {
    test('is not running initially', () => {
      expect(entrance.isRunning()).toBe(false)
    })

    test('is complete initially (no aliens to animate)', () => {
      expect(entrance.isComplete()).toBe(true)
    })

    test('progress is 1 initially (meaning "done")', () => {
      expect(entrance.getProgress()).toBe(1)
    })

    test('no visual positions initially', () => {
      expect(entrance.getVisualPositions().size).toBe(0)
    })
  })

  describe('start transition', () => {
    test('transitions to running state', () => {
      entrance.start(createTestAliens(4))
      expect(entrance.isRunning()).toBe(true)
      expect(entrance.isComplete()).toBe(false)
    })

    test('sets progress to 0 at start', () => {
      entrance.start(createTestAliens(4))
      expect(entrance.getProgress()).toBe(0)
    })

    test('populates positions for all aliens', () => {
      const aliens = createTestAliens(6)
      entrance.start(aliens)
      const positions = entrance.getVisualPositions()
      expect(positions.size).toBe(6)
    })

    test('all aliens start in entering state', () => {
      const aliens = createTestAliens(3)
      entrance.start(aliens)
      for (const alien of aliens) {
        const pos = entrance.getVisualPosition(alien.id)
        expect(pos).not.toBeNull()
        expect(pos!.animState).toBe('entering')
      }
    })

    test('aliens start at startY position', () => {
      const aliens = createTestAliens(1)
      entrance.start(aliens)
      const pos = entrance.getVisualPosition(aliens[0].id)
      expect(pos!.y).toBe(DEFAULT_ENTRANCE_CONFIG.startY)
    })

    test('can restart animation with new aliens', () => {
      const firstAliens = createTestAliens(2)
      entrance.start(firstAliens)

      const secondAliens = [
        { id: 'new-1', row: 0, col: 0, targetX: 50, targetY: 10 },
      ]
      entrance.start(secondAliens)

      // Old aliens should be gone
      expect(entrance.getVisualPosition(firstAliens[0].id)).toBeNull()
      // New aliens should be present
      expect(entrance.getVisualPosition('new-1')).not.toBeNull()
    })

    test('handles empty alien array gracefully', () => {
      entrance.start([])
      expect(entrance.isRunning()).toBe(false)
    })
  })

  describe('animation progress', () => {
    test('progress increases with updates', () => {
      entrance.start(createTestAliens(4))
      const initialProgress = entrance.getProgress()

      for (let i = 0; i < 10; i++) {
        entrance.update()
      }

      expect(entrance.getProgress()).toBeGreaterThan(initialProgress)
    })

    test('aliens move toward target positions during animation', () => {
      const aliens = createTestAliens(1)
      entrance.start(aliens)

      const startY = entrance.getVisualPosition(aliens[0].id)!.y
      expect(startY).toBe(DEFAULT_ENTRANCE_CONFIG.startY) // Off-screen

      // Run several frames
      for (let i = 0; i < 15; i++) {
        entrance.update()
      }

      const midY = entrance.getVisualPosition(aliens[0].id)!.y
      expect(midY).toBeGreaterThan(startY) // Moving toward target
    })

    test('aliens reach formation after enough updates', () => {
      const shortEntrance = new EntranceAnimation({
        baseDuration: 5,
        staggerDelay: 0,
      })

      const aliens = createTestAliens(1)
      shortEntrance.start(aliens)

      // Run many frames to ensure completion
      for (let i = 0; i < 20; i++) {
        shortEntrance.update()
      }

      const pos = shortEntrance.getVisualPosition(aliens[0].id)
      expect(pos!.x).toBe(aliens[0].targetX)
      expect(pos!.y).toBe(aliens[0].targetY)
      expect(pos!.animState).toBe('formation')
    })

    test('animation auto-stops when all aliens reach formation', () => {
      const shortEntrance = new EntranceAnimation({
        baseDuration: 3,
        staggerDelay: 0,
      })

      shortEntrance.start(createTestAliens(2))

      for (let i = 0; i < 20; i++) {
        shortEntrance.update()
      }

      expect(shortEntrance.isRunning()).toBe(false)
      expect(shortEntrance.isComplete()).toBe(true)
    })
  })

  describe('stop transition', () => {
    test('immediately stops the animation', () => {
      entrance.start(createTestAliens(4))
      expect(entrance.isRunning()).toBe(true)

      entrance.stop()
      expect(entrance.isRunning()).toBe(false)
    })

    test('snaps all aliens to formation positions', () => {
      const aliens = createTestAliens(3)
      entrance.start(aliens)

      // Only a few frames, aliens are still entering
      entrance.update()
      entrance.update()

      entrance.stop()

      for (const alien of aliens) {
        const pos = entrance.getVisualPosition(alien.id)
        expect(pos!.x).toBe(alien.targetX)
        expect(pos!.y).toBe(alien.targetY)
        expect(pos!.animState).toBe('formation')
      }
    })

    test('marks animation as complete', () => {
      entrance.start(createTestAliens(4))
      entrance.stop()
      expect(entrance.isComplete()).toBe(true)
    })
  })
})

// ─── Alien Tracking ─────────────────────────────────────────────────────────

describe('Entering Alien Tracking', () => {
  let entrance: EntranceAnimation

  beforeEach(() => {
    entrance = new EntranceAnimation()
  })

  test('getPosition returns null for unknown alien', () => {
    expect(entrance.getVisualPosition('nonexistent')).toBeNull()
  })

  test('tracks alien through full lifecycle', () => {
    const shortEntrance = new EntranceAnimation({
      baseDuration: 5,
      staggerDelay: 0,
    })

    shortEntrance.start([
      { id: 'tracked', row: 0, col: 0, targetX: 30, targetY: 10 },
    ])

    // Phase 1: entering
    const enteringPos = shortEntrance.getVisualPosition('tracked')
    expect(enteringPos!.animState).toBe('entering')

    // Phase 2: in formation (after enough updates)
    for (let i = 0; i < 20; i++) {
      shortEntrance.update()
    }

    const formationPos = shortEntrance.getVisualPosition('tracked')
    expect(formationPos!.animState).toBe('formation')
    expect(formationPos!.x).toBe(30)
    expect(formationPos!.y).toBe(10)
  })

  test('tracks multiple aliens independently', () => {
    const shortEntrance = new EntranceAnimation({
      baseDuration: 5,
      staggerDelay: 5, // Stagger so aliens start at different times
    })

    shortEntrance.start([
      { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
      { id: 'a2', row: 0, col: 1, targetX: 20, targetY: 5 },
    ])

    // After a few frames, both should be tracking
    shortEntrance.update()
    shortEntrance.update()

    const pos1 = shortEntrance.getVisualPosition('a1')
    const pos2 = shortEntrance.getVisualPosition('a2')

    expect(pos1).not.toBeNull()
    expect(pos2).not.toBeNull()
    // They have different target positions
    expect(pos1!.x).not.toBe(pos2!.x)
  })

  test('getVisualPositions returns map matching alien count', () => {
    const aliens = createTestAliens(8)
    entrance.start(aliens)

    const positions = entrance.getVisualPositions()
    expect(positions.size).toBe(8)

    for (const alien of aliens) {
      expect(positions.has(alien.id)).toBe(true)
    }
  })
})

// ─── Stagger Patterns ───────────────────────────────────────────────────────

describe('Stagger Patterns Through Hook Interface', () => {
  test('rain pattern: column-first ordering', () => {
    const rain = new EntranceAnimation({ pattern: 'rain' })
    rain.start([
      { id: 'r0c0', row: 0, col: 0, targetX: 10, targetY: 5 },
      { id: 'r1c0', row: 1, col: 0, targetX: 10, targetY: 8 }, // Same column
      { id: 'r0c1', row: 0, col: 1, targetX: 17, targetY: 5 }, // Different column
    ])

    const s1 = rain.getAlienState('r0c0')
    const s2 = rain.getAlienState('r1c0')
    const s3 = rain.getAlienState('r0c1')

    // Same-column aliens should have closer start times than cross-column
    const sameColDiff = Math.abs(s1!.startTick - s2!.startTick)
    const crossColDiff = Math.abs(s1!.startTick - s3!.startTick)
    expect(sameColDiff).toBeLessThanOrEqual(crossColDiff)
  })

  test('slide pattern: same row has same start time', () => {
    const slide = new EntranceAnimation({ pattern: 'slide' })
    slide.start([
      { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
      { id: 'a2', row: 0, col: 1, targetX: 17, targetY: 5 },
      { id: 'a3', row: 1, col: 0, targetX: 10, targetY: 8 },
    ])

    const s1 = slide.getAlienState('a1')
    const s2 = slide.getAlienState('a2')
    const s3 = slide.getAlienState('a3')

    // Same row should have identical start times
    expect(s1!.startTick).toBe(s2!.startTick)
    // Different row should have different start time
    expect(s1!.startTick).not.toBe(s3!.startTick)
  })
})

// ─── EntranceAlien Interface Contracts ──────────────────────────────────────

describe('EntranceAlien Interface', () => {
  test('requires all position fields', () => {
    const alien: EntranceAlien = {
      id: 'test-alien',
      row: 2,
      col: 3,
      targetX: 50,
      targetY: 15,
    }

    expect(alien.id).toBe('test-alien')
    expect(alien.row).toBe(2)
    expect(alien.col).toBe(3)
    expect(alien.targetX).toBe(50)
    expect(alien.targetY).toBe(15)
  })
})

// ─── AlienVisualPosition Interface ──────────────────────────────────────────

describe('AlienVisualPosition Shape', () => {
  test('has x, y, and animState fields', () => {
    const entrance = new EntranceAnimation()
    entrance.start([
      { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
    ])

    const pos = entrance.getVisualPosition('a1')
    expect(pos).not.toBeNull()
    expect(typeof pos!.x).toBe('number')
    expect(typeof pos!.y).toBe('number')
    expect(['entering', 'formation']).toContain(pos!.animState)
  })

  test('position matches AlienVisualPosition shape', () => {
    const entrance = new EntranceAnimation()
    entrance.start([
      { id: 'a1', row: 0, col: 0, targetX: 42, targetY: 12 },
    ])

    const rawPos = entrance.getVisualPosition('a1')!
    const typedPos: AlienVisualPosition = {
      x: rawPos.x,
      y: rawPos.y,
      animState: rawPos.animState,
    }

    expect(typedPos.animState).toBe('entering')
    expect(typedPos.x).toBe(42) // targetX when animateX is false
    expect(typedPos.y).toBe(DEFAULT_ENTRANCE_CONFIG.startY)
  })
})

// ─── Configuration ──────────────────────────────────────────────────────────

describe('Entrance Animation Configuration', () => {
  test('default config uses rain pattern', () => {
    expect(DEFAULT_ENTRANCE_CONFIG.pattern).toBe('rain')
  })

  test('custom config overrides defaults', () => {
    const custom = new EntranceAnimation({
      baseDuration: 60,
      staggerDelay: 10,
      pattern: 'wave',
    })

    custom.start(createTestAliens(2))
    expect(custom.isRunning()).toBe(true)
    expect(custom.getEstimatedDuration()).toBeGreaterThan(0)
  })

  test('partial config merges with defaults', () => {
    // Only override baseDuration, keep everything else default
    const partial = new EntranceAnimation({ baseDuration: 100 })
    partial.start(createTestAliens(1))
    expect(partial.isRunning()).toBe(true)
  })

  test('empty config uses all defaults', () => {
    const empty = new EntranceAnimation({})
    empty.start(createTestAliens(1))
    expect(empty.isRunning()).toBe(true)
  })
})

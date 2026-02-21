// client/src/animation/temporal-dependencies.test.ts
// Tests for entrance animation timing

import { describe, test, expect } from 'bun:test'
import { EntranceAnimation } from './entrance'

describe('Entrance animation timing', () => {
  test('entrance animation completes within expected duration', () => {
    const entrance = new EntranceAnimation({
      baseDuration: 30,
      staggerDelay: 2,
    })

    // Create a 5x5 grid of aliens (25 aliens)
    const aliens = []
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        aliens.push({
          id: `a-${row}-${col}`,
          row,
          col,
          targetX: 10 + col * 7,
          targetY: 5 + row * 3,
        })
      }
    }

    entrance.start(aliens)

    let ticks = 0
    while (entrance.isRunning() && ticks < 500) {
      entrance.update()
      ticks++
    }

    // Should complete within reasonable time
    expect(entrance.isRunning()).toBe(false)
    expect(entrance.isComplete()).toBe(true)

    // Estimated duration should be roughly baseDuration + stagger time
    // For 25 aliens with stagger 2: ~25*2 + 30 = ~80 ticks
    expect(ticks).toBeLessThan(150) // Generous upper bound
    expect(ticks).toBeGreaterThan(30)  // At least baseDuration
  })

  test('aliens start off-screen and end at target positions', () => {
    const entrance = new EntranceAnimation({
      baseDuration: 10,
      staggerDelay: 1,
      startY: -5,
    })

    entrance.start([
      { id: 'a1', row: 0, col: 0, targetX: 50, targetY: 10 },
    ])

    // Initially off-screen
    const initial = entrance.getVisualPosition('a1')
    expect(initial).not.toBeNull()
    expect(initial!.y).toBe(-5)
    expect(initial!.x).toBe(50) // X starts at target

    // Run to completion
    while (entrance.isRunning()) {
      entrance.update()
    }

    // Ends at target
    const final = entrance.getVisualPosition('a1')
    expect(final).not.toBeNull()
    expect(final!.y).toBe(10)
    expect(final!.x).toBe(50)
    expect(final!.animState).toBe('formation')
  })
})

describe('Animation cancellation', () => {
  test('stopping entrance snaps aliens to formation', () => {
    const entrance = new EntranceAnimation({
      baseDuration: 100,
      staggerDelay: 10,
      startY: -5,
    })

    entrance.start([
      { id: 'a1', row: 0, col: 0, targetX: 50, targetY: 10 },
      { id: 'a2', row: 0, col: 1, targetX: 60, targetY: 10 },
    ])

    // Run a few ticks (not complete)
    entrance.update()
    entrance.update()
    expect(entrance.isRunning()).toBe(true)

    // Force stop
    entrance.stop()

    // Should be complete and at target positions
    expect(entrance.isRunning()).toBe(false)
    const pos1 = entrance.getVisualPosition('a1')
    const pos2 = entrance.getVisualPosition('a2')
    expect(pos1!.y).toBe(10)
    expect(pos2!.y).toBe(10)
    expect(pos1!.animState).toBe('formation')
    expect(pos2!.animState).toBe('formation')
  })
})

describe('Animation Configuration Contracts', () => {
  test('entrance with no aliens completes immediately', () => {
    const entrance = new EntranceAnimation()
    entrance.start([])

    expect(entrance.isRunning()).toBe(false)
    expect(entrance.isComplete()).toBe(true)
  })

  test('entrance with single alien works correctly', () => {
    const entrance = new EntranceAnimation({
      baseDuration: 5,
      staggerDelay: 0,
    })

    entrance.start([
      { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
    ])

    expect(entrance.isRunning()).toBe(true)

    for (let i = 0; i < 5; i++) {
      entrance.update()
    }

    expect(entrance.isComplete()).toBe(true)
  })
})

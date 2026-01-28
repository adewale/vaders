// client/src/animation/entrance.test.ts
// Unit tests for alien entrance animations

import { describe, test, expect, beforeEach } from 'bun:test'
import {
  EntranceAnimation,
  DEFAULT_ENTRANCE_CONFIG,
  RAIN_ENTRANCE,
  WAVE_ENTRANCE,
  SCATTER_ENTRANCE,
  SLIDE_ENTRANCE,
  createRainEntrance,
  type EntrancePattern,
} from './entrance'

describe('DEFAULT_ENTRANCE_CONFIG', () => {
  test('has sensible default values', () => {
    expect(DEFAULT_ENTRANCE_CONFIG.pattern).toBe('rain')
    expect(DEFAULT_ENTRANCE_CONFIG.baseDuration).toBeGreaterThan(0)
    expect(DEFAULT_ENTRANCE_CONFIG.staggerDelay).toBeGreaterThan(0)
    expect(DEFAULT_ENTRANCE_CONFIG.startY).toBeLessThan(0) // Off-screen top
    expect(typeof DEFAULT_ENTRANCE_CONFIG.easing).toBe('function')
    expect(DEFAULT_ENTRANCE_CONFIG.animateX).toBe(false)
  })
})

describe('RAIN_ENTRANCE', () => {
  test('has rain pattern configuration', () => {
    expect(RAIN_ENTRANCE.pattern).toBe('rain')
    expect(RAIN_ENTRANCE.animateX).toBe(false)
  })
})

describe('WAVE_ENTRANCE', () => {
  test('has wave pattern configuration', () => {
    expect(WAVE_ENTRANCE.pattern).toBe('wave')
    expect(WAVE_ENTRANCE.animateX).toBe(false)
  })
})

describe('SCATTER_ENTRANCE', () => {
  test('has scatter pattern configuration', () => {
    expect(SCATTER_ENTRANCE.pattern).toBe('scatter')
    expect(SCATTER_ENTRANCE.animateX).toBe(true) // Scatter animates X
  })
})

describe('SLIDE_ENTRANCE', () => {
  test('has slide pattern configuration', () => {
    expect(SLIDE_ENTRANCE.pattern).toBe('slide')
    expect(SLIDE_ENTRANCE.animateX).toBe(false)
  })
})

describe('EntranceAnimation', () => {
  let entrance: EntranceAnimation

  beforeEach(() => {
    entrance = new EntranceAnimation()
  })

  describe('constructor', () => {
    test('creates with default config', () => {
      expect(entrance.isRunning()).toBe(false)
      expect(entrance.getTick()).toBe(0)
    })

    test('accepts custom config', () => {
      const custom = new EntranceAnimation({
        pattern: 'wave',
        baseDuration: 50,
        staggerDelay: 5,
      })
      expect(custom.isRunning()).toBe(false)
    })
  })

  describe('start', () => {
    test('starts the animation', () => {
      entrance.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
      ])
      expect(entrance.isRunning()).toBe(true)
    })

    test('resets tick to 0', () => {
      entrance.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
      ])
      entrance.update()
      entrance.update()
      entrance.start([
        { id: 'a2', row: 0, col: 0, targetX: 10, targetY: 5 },
      ])
      expect(entrance.getTick()).toBe(0)
    })

    test('clears previous aliens', () => {
      entrance.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
      ])
      entrance.start([
        { id: 'a2', row: 0, col: 0, targetX: 20, targetY: 10 },
      ])
      expect(entrance.getAlienState('a1')).toBeUndefined()
      expect(entrance.getAlienState('a2')).toBeDefined()
    })

    test('handles empty array', () => {
      entrance.start([])
      expect(entrance.isRunning()).toBe(false)
    })

    test('sets initial visual positions at startY', () => {
      entrance.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
      ])
      const state = entrance.getAlienState('a1')
      expect(state?.visualY).toBe(DEFAULT_ENTRANCE_CONFIG.startY)
    })

    test('sets initial animation state to entering', () => {
      entrance.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
      ])
      const state = entrance.getAlienState('a1')
      expect(state?.animState).toBe('entering')
    })

    test('calculates staggered start times', () => {
      entrance.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
        { id: 'a2', row: 0, col: 1, targetX: 17, targetY: 5 },
        { id: 'a3', row: 0, col: 2, targetX: 24, targetY: 5 },
      ])
      const s1 = entrance.getAlienState('a1')
      const s2 = entrance.getAlienState('a2')
      const s3 = entrance.getAlienState('a3')

      // Different columns should have different start times
      expect(s1?.startTick).toBeDefined()
      expect(s2?.startTick).toBeDefined()
      expect(s3?.startTick).toBeDefined()
    })
  })

  describe('stop', () => {
    test('stops the animation', () => {
      entrance.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
      ])
      entrance.stop()
      expect(entrance.isRunning()).toBe(false)
    })

    test('snaps aliens to formation', () => {
      entrance.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
      ])
      entrance.stop()
      const state = entrance.getAlienState('a1')
      expect(state?.visualX).toBe(10)
      expect(state?.visualY).toBe(5)
      expect(state?.animState).toBe('formation')
    })
  })

  describe('update', () => {
    test('does nothing when not running', () => {
      entrance.update()
      expect(entrance.getTick()).toBe(0)
    })

    test('increments tick when running', () => {
      entrance.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
      ])
      entrance.update()
      expect(entrance.getTick()).toBe(1)
      entrance.update()
      expect(entrance.getTick()).toBe(2)
    })

    test('updates visual positions', () => {
      entrance.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 20 },
      ])
      const initialY = entrance.getAlienState('a1')?.visualY
      expect(initialY).toBe(DEFAULT_ENTRANCE_CONFIG.startY)

      // Update many times
      for (let i = 0; i < 20; i++) {
        entrance.update()
      }

      const newY = entrance.getAlienState('a1')?.visualY
      expect(newY).toBeGreaterThan(initialY!)
    })

    test('transitions to formation when complete', () => {
      const shortEntrance = new EntranceAnimation({
        baseDuration: 5,
        staggerDelay: 0,
      })
      shortEntrance.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
      ])

      for (let i = 0; i < 10; i++) {
        shortEntrance.update()
      }

      const state = shortEntrance.getAlienState('a1')
      expect(state?.animState).toBe('formation')
      expect(state?.visualX).toBe(10)
      expect(state?.visualY).toBe(5)
    })

    test('stops when all aliens in formation', () => {
      const shortEntrance = new EntranceAnimation({
        baseDuration: 3,
        staggerDelay: 0,
      })
      shortEntrance.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
      ])

      for (let i = 0; i < 10; i++) {
        shortEntrance.update()
      }

      expect(shortEntrance.isRunning()).toBe(false)
    })

    test('respects stagger delay', () => {
      const staggered = new EntranceAnimation({
        baseDuration: 5,
        staggerDelay: 10,
      })
      staggered.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
        { id: 'a2', row: 0, col: 1, targetX: 17, targetY: 5 },
      ])

      // After first update, first alien may have started
      staggered.update()
      const s1 = staggered.getAlienState('a1')
      const s2 = staggered.getAlienState('a2')

      // Depending on stagger order, aliens have different progress
      expect(s1?.animState).toBe('entering')
      expect(s2?.animState).toBe('entering')
    })
  })

  describe('isComplete', () => {
    test('returns true with no aliens', () => {
      expect(entrance.isComplete()).toBe(true)
    })

    test('returns false during animation', () => {
      entrance.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
      ])
      expect(entrance.isComplete()).toBe(false)
    })

    test('returns true when all in formation', () => {
      const shortEntrance = new EntranceAnimation({
        baseDuration: 3,
        staggerDelay: 0,
      })
      shortEntrance.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
      ])

      for (let i = 0; i < 10; i++) {
        shortEntrance.update()
      }

      expect(shortEntrance.isComplete()).toBe(true)
    })
  })

  describe('getAlienState', () => {
    test('returns undefined for unknown alien', () => {
      expect(entrance.getAlienState('unknown')).toBeUndefined()
    })

    test('returns state for known alien', () => {
      entrance.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
      ])
      const state = entrance.getAlienState('a1')
      expect(state).toBeDefined()
      expect(state?.id).toBe('a1')
      expect(state?.row).toBe(0)
      expect(state?.col).toBe(0)
      expect(state?.targetX).toBe(10)
      expect(state?.targetY).toBe(5)
    })
  })

  describe('getVisualPosition', () => {
    test('returns null for unknown alien', () => {
      expect(entrance.getVisualPosition('unknown')).toBeNull()
    })

    test('returns position for known alien', () => {
      entrance.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
      ])
      const pos = entrance.getVisualPosition('a1')
      expect(pos).not.toBeNull()
      expect(typeof pos?.x).toBe('number')
      expect(typeof pos?.y).toBe('number')
      expect(pos?.animState).toBe('entering')
    })
  })

  describe('getVisualPositions', () => {
    test('returns empty map when no aliens', () => {
      const positions = entrance.getVisualPositions()
      expect(positions.size).toBe(0)
    })

    test('returns all alien positions', () => {
      entrance.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
        { id: 'a2', row: 0, col: 1, targetX: 17, targetY: 5 },
      ])
      const positions = entrance.getVisualPositions()
      expect(positions.size).toBe(2)
      expect(positions.has('a1')).toBe(true)
      expect(positions.has('a2')).toBe(true)
    })

    test('position objects have correct properties', () => {
      entrance.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
      ])
      const positions = entrance.getVisualPositions()
      const pos = positions.get('a1')
      expect(typeof pos?.x).toBe('number')
      expect(typeof pos?.y).toBe('number')
      expect(pos).toBeDefined()
      expect(['entering', 'formation']).toContain(pos!.animState)
    })
  })

  describe('getEstimatedDuration', () => {
    test('returns total animation duration', () => {
      entrance.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
        { id: 'a2', row: 1, col: 0, targetX: 10, targetY: 7 },
        { id: 'a3', row: 0, col: 1, targetX: 17, targetY: 5 },
      ])
      const duration = entrance.getEstimatedDuration()
      expect(duration).toBeGreaterThan(0)
    })

    test('includes stagger delay', () => {
      const fast = new EntranceAnimation({
        baseDuration: 10,
        staggerDelay: 0,
      })
      const slow = new EntranceAnimation({
        baseDuration: 10,
        staggerDelay: 5,
      })

      const aliens = [
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
        { id: 'a2', row: 0, col: 1, targetX: 17, targetY: 5 },
      ]

      fast.start(aliens)
      slow.start(aliens)

      expect(slow.getEstimatedDuration()).toBeGreaterThan(fast.getEstimatedDuration())
    })
  })

  describe('getProgress', () => {
    test('returns 1 when not running', () => {
      expect(entrance.getProgress()).toBe(1)
    })

    test('returns 0 at start', () => {
      entrance.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
      ])
      expect(entrance.getProgress()).toBe(0)
    })

    test('increases over time', () => {
      entrance.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
      ])
      const initialProgress = entrance.getProgress()

      for (let i = 0; i < 10; i++) {
        entrance.update()
      }

      expect(entrance.getProgress()).toBeGreaterThan(initialProgress)
    })

    test('reaches 1 when complete', () => {
      const shortEntrance = new EntranceAnimation({
        baseDuration: 5,
        staggerDelay: 0,
      })
      shortEntrance.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
      ])

      for (let i = 0; i < 20; i++) {
        shortEntrance.update()
      }

      expect(shortEntrance.getProgress()).toBe(1)
    })
  })

  describe('patterns', () => {
    test('rain pattern - columns animate together', () => {
      const rain = new EntranceAnimation(RAIN_ENTRANCE)
      rain.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
        { id: 'a2', row: 1, col: 0, targetX: 10, targetY: 7 }, // Same column
        { id: 'a3', row: 0, col: 1, targetX: 17, targetY: 5 }, // Different column
      ])

      // Same column aliens have similar start times
      const s1 = rain.getAlienState('a1')
      const s2 = rain.getAlienState('a2')
      const s3 = rain.getAlienState('a3')

      // Column 0 aliens start earlier than column 1
      // Due to rain pattern ordering (column-first)
      expect(Math.abs(s1!.startTick - s2!.startTick)).toBeLessThan(
        Math.abs(s1!.startTick - s3!.startTick)
      )
    })

    test('wave pattern - diagonal ordering', () => {
      const wave = new EntranceAnimation(WAVE_ENTRANCE)
      wave.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 }, // row+col = 0
        { id: 'a2', row: 1, col: 0, targetX: 10, targetY: 7 }, // row+col = 1
        { id: 'a3', row: 0, col: 1, targetX: 17, targetY: 5 }, // row+col = 1
        { id: 'a4', row: 1, col: 1, targetX: 17, targetY: 7 }, // row+col = 2
      ])

      const s1 = wave.getAlienState('a1')
      const s2 = wave.getAlienState('a2')
      const s3 = wave.getAlienState('a3')
      const s4 = wave.getAlienState('a4')

      // (0,0) should start first
      expect(s1!.startTick).toBeLessThanOrEqual(s2!.startTick)
      expect(s1!.startTick).toBeLessThanOrEqual(s3!.startTick)
      expect(s1!.startTick).toBeLessThanOrEqual(s4!.startTick)

      // (1,1) should start last
      expect(s4!.startTick).toBeGreaterThanOrEqual(s2!.startTick)
      expect(s4!.startTick).toBeGreaterThanOrEqual(s3!.startTick)
    })

    test('slide pattern - row by row', () => {
      const slide = new EntranceAnimation(SLIDE_ENTRANCE)
      slide.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
        { id: 'a2', row: 0, col: 1, targetX: 17, targetY: 5 },
        { id: 'a3', row: 1, col: 0, targetX: 10, targetY: 7 },
        { id: 'a4', row: 1, col: 1, targetX: 17, targetY: 7 },
      ])

      const s1 = slide.getAlienState('a1')
      const s2 = slide.getAlienState('a2')
      const s3 = slide.getAlienState('a3')
      const s4 = slide.getAlienState('a4')

      // Same row should have same start time
      expect(s1!.startTick).toBe(s2!.startTick)
      expect(s3!.startTick).toBe(s4!.startTick)

      // Row 0 starts before row 1
      expect(s1!.startTick).toBeLessThan(s3!.startTick)
    })

    test('scatter pattern - varied start times', () => {
      const scatter = new EntranceAnimation(SCATTER_ENTRANCE)
      scatter.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
        { id: 'a2', row: 0, col: 1, targetX: 17, targetY: 5 },
        { id: 'a3', row: 1, col: 0, targetX: 10, targetY: 7 },
        { id: 'a4', row: 1, col: 1, targetX: 17, targetY: 7 },
      ])

      // Scatter uses deterministic hash, so order is consistent but "random"
      const startTimes = [
        scatter.getAlienState('a1')!.startTick,
        scatter.getAlienState('a2')!.startTick,
        scatter.getAlienState('a3')!.startTick,
        scatter.getAlienState('a4')!.startTick,
      ]

      // Not all the same (would be boring scatter)
      const uniqueTimes = new Set(startTimes)
      expect(uniqueTimes.size).toBeGreaterThan(1)
    })
  })

  describe('animateX option', () => {
    test('keeps X constant when animateX is false', () => {
      const noX = new EntranceAnimation({ animateX: false })
      noX.start([
        { id: 'a1', row: 0, col: 0, targetX: 50, targetY: 20 },
      ])

      const initialX = noX.getAlienState('a1')?.visualX
      expect(initialX).toBe(50) // Starts at target X

      for (let i = 0; i < 10; i++) {
        noX.update()
      }

      expect(noX.getAlienState('a1')?.visualX).toBe(50)
    })
  })
})

describe('createRainEntrance', () => {
  test('creates entrance with rain pattern', () => {
    const entrance = createRainEntrance()
    entrance.start([
      { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
    ])
    expect(entrance.isRunning()).toBe(true)
  })

  test('uses bounce easing', () => {
    const entrance = createRainEntrance()
    entrance.start([
      { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 20 },
    ])

    // Run partway through animation
    for (let i = 0; i < 15; i++) {
      entrance.update()
    }

    const pos = entrance.getVisualPosition('a1')
    // With bounce easing, should be past midpoint but not at target
    // (Bounce can overshoot slightly)
    expect(pos?.y).toBeGreaterThan(-4) // Past start
    expect(pos?.y).toBeLessThanOrEqual(20) // At or before target
  })
})

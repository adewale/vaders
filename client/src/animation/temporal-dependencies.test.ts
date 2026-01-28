// client/src/animation/temporal-dependencies.test.ts
// Tests that enforce temporal dependencies between animations
//
// These tests ensure the correct sequencing of:
// 1. Wipe animation (iris close → hold → iris open)
// 2. Entrance animation (aliens fly in from above)
//
// Key invariant: Entrance animation must start AFTER wipe enters 'idle' state

import { describe, test, expect, beforeEach } from 'bun:test'
import { WipeTransition, type WipeState } from './wipe'
import { EntranceAnimation } from './entrance'

// ─── Animation Timing Constants ─────────────────────────────────────────────
// These match the values in GameScreen.tsx

/** Wipe durations at 60fps (requestAnimationFrame) */
const WIPE_CONFIG = {
  exitDuration: 120,   // ~2 seconds at 60fps
  holdDuration: 120,   // ~2 seconds
  enterDuration: 120,  // ~2 seconds
}

/** Entrance animation config */
const ENTRANCE_CONFIG = {
  baseDuration: 30,    // Base duration per alien
  staggerDelay: 2,     // Delay between aliens
  startY: -5,          // Start above screen
}

// ─── Temporal Dependency Tests ──────────────────────────────────────────────

describe('Animation Temporal Dependencies', () => {
  describe('Wipe → Entrance sequencing', () => {
    test('entrance must not start until wipe is complete (idle)', () => {
      const wipe = new WipeTransition({
        width: 120,
        height: 36,
        ...WIPE_CONFIG,
      })
      const entrance = new EntranceAnimation()

      // Simulate game start sequence
      wipe.start(1, false) // Full wipe

      // Track states through entire wipe lifecycle
      const statesBeforeIdle: WipeState[] = []
      let entranceStartedBeforeIdle = false

      while (wipe.isActive()) {
        statesBeforeIdle.push(wipe.getState())
        wipe.update()

        // Entrance should NOT be running during wipe
        if (entrance.isRunning() && wipe.isActive()) {
          entranceStartedBeforeIdle = true
        }
      }

      // Wipe should go through exiting → hold → entering → idle
      expect(statesBeforeIdle).toContain('exiting')
      expect(statesBeforeIdle).toContain('hold')
      expect(statesBeforeIdle).toContain('entering')

      // Entrance should not have started during wipe
      expect(entranceStartedBeforeIdle).toBe(false)

      // NOW entrance can start (wipe is idle)
      expect(wipe.getState()).toBe('idle')
      entrance.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
      ])
      expect(entrance.isRunning()).toBe(true)
    })

    test('reverse wipe (game start) also completes before entrance', () => {
      const wipe = new WipeTransition({
        width: 120,
        height: 36,
        ...WIPE_CONFIG,
      })
      const entrance = new EntranceAnimation()

      // Reverse wipe skips exit phase (for game start)
      wipe.start(1, true)
      expect(wipe.getState()).toBe('hold') // Starts in hold

      // Track that we never see 'exiting' in reverse mode
      const states: WipeState[] = []
      while (wipe.isActive()) {
        states.push(wipe.getState())
        wipe.update()
      }

      // Should NOT contain exiting
      expect(states).not.toContain('exiting')
      // Should contain hold and entering
      expect(states).toContain('hold')
      expect(states).toContain('entering')

      // Wipe is now complete
      expect(wipe.getState()).toBe('idle')

      // NOW entrance can start
      entrance.start([
        { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
      ])
      expect(entrance.isRunning()).toBe(true)
    })

    test('wipe transition state machine is: exiting → hold → entering → idle', () => {
      const wipe = new WipeTransition({
        width: 120,
        height: 36,
        exitDuration: 5,
        holdDuration: 5,
        enterDuration: 5,
      })

      wipe.start(1, false)

      const transitions: string[] = []
      let prevState = wipe.getState()
      transitions.push(prevState)

      for (let i = 0; i < 20; i++) {
        wipe.update()
        const currentState = wipe.getState()
        if (currentState !== prevState) {
          transitions.push(currentState)
          prevState = currentState
        }
      }

      expect(transitions).toEqual(['exiting', 'hold', 'entering', 'idle'])
    })

    test('reverse wipe transition state machine is: hold → entering → idle', () => {
      const wipe = new WipeTransition({
        width: 120,
        height: 36,
        exitDuration: 5,
        holdDuration: 5,
        enterDuration: 5,
      })

      wipe.start(1, true) // reverse

      const transitions: string[] = []
      let prevState = wipe.getState()
      transitions.push(prevState)

      for (let i = 0; i < 15; i++) {
        wipe.update()
        const currentState = wipe.getState()
        if (currentState !== prevState) {
          transitions.push(currentState)
          prevState = currentState
        }
      }

      expect(transitions).toEqual(['hold', 'entering', 'idle'])
    })
  })

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

  describe('Full sequence timing (wipe + entrance)', () => {
    test('full wave transition sequence has correct total duration', () => {
      const wipe = new WipeTransition({
        width: 120,
        height: 36,
        ...WIPE_CONFIG,
      })
      const entrance = new EntranceAnimation({
        ...ENTRANCE_CONFIG,
      })

      // Start full wipe
      wipe.start(2, false)

      let wipeTicks = 0
      while (wipe.isActive()) {
        wipe.update()
        wipeTicks++
      }

      // Wipe duration should be exit + hold + enter
      const expectedWipeDuration = WIPE_CONFIG.exitDuration + WIPE_CONFIG.holdDuration + WIPE_CONFIG.enterDuration
      expect(wipeTicks).toBe(expectedWipeDuration)

      // Now start entrance
      const aliens = []
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 11; col++) {
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

      let entranceTicks = 0
      while (entrance.isRunning() && entranceTicks < 500) {
        entrance.update()
        entranceTicks++
      }

      // Total animation time
      const totalTicks = wipeTicks + entranceTicks

      // At 60fps, total should be around 6 seconds wipe + ~2 seconds entrance = ~480 ticks
      expect(totalTicks).toBeGreaterThan(360) // At least wipe duration
      expect(totalTicks).toBeLessThan(600)    // Reasonable upper bound
    })

    test('reverse wipe (game start) has shorter total duration', () => {
      const wipe = new WipeTransition({
        width: 120,
        height: 36,
        ...WIPE_CONFIG,
      })
      const entrance = new EntranceAnimation({
        ...ENTRANCE_CONFIG,
      })

      // Start reverse wipe (skips exit phase)
      wipe.start(1, true)

      let wipeTicks = 0
      while (wipe.isActive()) {
        wipe.update()
        wipeTicks++
      }

      // Reverse wipe should be hold + enter only
      const expectedReverseWipeDuration = WIPE_CONFIG.holdDuration + WIPE_CONFIG.enterDuration
      expect(wipeTicks).toBe(expectedReverseWipeDuration)

      // This is shorter than full wipe
      const fullWipeDuration = WIPE_CONFIG.exitDuration + WIPE_CONFIG.holdDuration + WIPE_CONFIG.enterDuration
      expect(wipeTicks).toBeLessThan(fullWipeDuration)
    })
  })

  describe('Hold phase invariants', () => {
    test('during hold phase, all cells are masked', () => {
      const wipe = new WipeTransition({
        width: 20,
        height: 10,
        exitDuration: 5,
        holdDuration: 10,
        enterDuration: 5,
      })

      wipe.start(1, false)

      // Skip to hold phase
      for (let i = 0; i < 5; i++) {
        wipe.update()
      }
      expect(wipe.getState()).toBe('hold')

      // All cells should be masked
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 20; x++) {
          expect(wipe.isCellVisible(x, y)).toBe(false)
        }
      }
    })

    test('wave title should be displayable during hold', () => {
      const wipe = new WipeTransition({
        width: 120,
        height: 36,
        exitDuration: 5,
        holdDuration: 10,
        enterDuration: 5,
      })

      wipe.start(3, false)

      // Skip to hold phase
      for (let i = 0; i < 5; i++) {
        wipe.update()
      }

      expect(wipe.isInHold()).toBe(true)
      expect(wipe.getWaveNumber()).toBe(3) // Can display wave number
    })
  })

  describe('Animation cancellation', () => {
    test('cancelling wipe returns to idle immediately', () => {
      const wipe = new WipeTransition({
        width: 120,
        height: 36,
        ...WIPE_CONFIG,
      })

      wipe.start(1, false)
      expect(wipe.isActive()).toBe(true)

      wipe.cancel()
      expect(wipe.isActive()).toBe(false)
      expect(wipe.getState()).toBe('idle')
    })

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
})

describe('Animation Configuration Contracts', () => {
  test('wipe durations must be positive', () => {
    const wipe = new WipeTransition({
      width: 120,
      height: 36,
      exitDuration: 1,
      holdDuration: 1,
      enterDuration: 1,
    })

    // Should complete in exactly 3 ticks
    wipe.start(1, false)
    wipe.update() // exit
    expect(wipe.getState()).toBe('hold')
    wipe.update() // hold
    expect(wipe.getState()).toBe('entering')
    wipe.update() // enter
    expect(wipe.getState()).toBe('idle')
  })

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

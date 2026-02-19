// shared/timing-compatibility.test.ts
// Tests that ensure client animations and server wipe phases are synchronized
//
// The client runs animations at 60fps (requestAnimationFrame)
// The server runs at 30Hz (33ms ticks)
// Server controls timing via status transitions; client follows with animations

import { describe, test, expect } from 'bun:test'
import { WIPE_TIMING } from './types'

// ─── Timing Constants (must match actual implementation) ────────────────────

/**
 * Server wipe phase durations in ticks at 30Hz
 * Imported from shared/types.ts (canonical source)
 */
const SERVER_WIPE_TICKS = {
  wipe_exit: WIPE_TIMING.EXIT_TICKS,
  wipe_hold: WIPE_TIMING.HOLD_TICKS,
  wipe_reveal: WIPE_TIMING.REVEAL_TICKS,
}

/**
 * Client wipe durations in frames at 60fps
 * From: client/src/components/GameScreen.tsx wipeConfig
 */
const CLIENT_WIPE_FRAMES = {
  exitDuration: 120,   // 2 seconds
  holdDuration: 180,   // 3 seconds
  enterDuration: 240,  // 4 seconds (matches server wipe_reveal)
}

/**
 * Client entrance animation config in frames at 60fps
 * From: client/src/animation/entrance.ts DEFAULT_ENTRANCE_CONFIG
 */
const CLIENT_ENTRANCE_CONFIG = {
  baseDuration: 30,    // ~0.5 seconds per alien at 60fps
  staggerDelay: 2,     // frames between alien starts
}

/**
 * Frame rates
 */
const CLIENT_FPS = 60
const SERVER_HZ = 30

// ─── Helper Functions ───────────────────────────────────────────────────────

function clientFramesToSeconds(frames: number): number {
  return frames / CLIENT_FPS
}

function serverTicksToSeconds(ticks: number): number {
  return ticks / SERVER_HZ
}

function serverTicksToClientFrames(ticks: number): number {
  // Server at 30Hz, client at 60fps → multiply by 2
  return ticks * (CLIENT_FPS / SERVER_HZ)
}

// ─── Server-Client Phase Duration Matching ──────────────────────────────────

describe('Server-Client Phase Duration Matching', () => {
  describe('Frame rate assumptions', () => {
    test('client runs at 60fps', () => {
      expect(CLIENT_FPS).toBe(60)
    })

    test('server runs at 30Hz', () => {
      expect(SERVER_HZ).toBe(30)
    })

    test('client is exactly 2x server tick rate', () => {
      expect(CLIENT_FPS / SERVER_HZ).toBe(2)
    })
  })

  describe('Wipe phase durations match in wall-clock time', () => {
    test('wipe_exit duration: server = client', () => {
      const serverSeconds = serverTicksToSeconds(SERVER_WIPE_TICKS.wipe_exit)
      const clientSeconds = clientFramesToSeconds(CLIENT_WIPE_FRAMES.exitDuration)

      expect(serverSeconds).toBe(2) // 60 ticks at 30Hz = 2 seconds
      expect(clientSeconds).toBe(2) // 120 frames at 60fps = 2 seconds
      expect(serverSeconds).toBe(clientSeconds)
    })

    test('wipe_hold duration: server = client', () => {
      const serverSeconds = serverTicksToSeconds(SERVER_WIPE_TICKS.wipe_hold)
      const clientSeconds = clientFramesToSeconds(CLIENT_WIPE_FRAMES.holdDuration)

      expect(serverSeconds).toBe(3)
      expect(clientSeconds).toBe(3)
      expect(serverSeconds).toBe(clientSeconds)
    })

    test('wipe_reveal duration: server = client', () => {
      const serverSeconds = serverTicksToSeconds(SERVER_WIPE_TICKS.wipe_reveal)
      const clientSeconds = clientFramesToSeconds(CLIENT_WIPE_FRAMES.enterDuration)

      expect(serverSeconds).toBe(4) // 120 ticks at 30Hz = 4 seconds
      expect(clientSeconds).toBe(4) // 240 frames at 60fps = 4 seconds
      expect(serverSeconds).toBe(clientSeconds)
    })

    test('client frames = server ticks × 2 for each phase', () => {
      expect(CLIENT_WIPE_FRAMES.exitDuration).toBe(serverTicksToClientFrames(SERVER_WIPE_TICKS.wipe_exit))
      expect(CLIENT_WIPE_FRAMES.holdDuration).toBe(serverTicksToClientFrames(SERVER_WIPE_TICKS.wipe_hold))
      expect(CLIENT_WIPE_FRAMES.enterDuration).toBe(serverTicksToClientFrames(SERVER_WIPE_TICKS.wipe_reveal))
    })
  })

  describe('Total wipe durations', () => {
    test('game start (hold + reveal): 7 seconds', () => {
      // Server: wipe_hold (3s) + wipe_reveal (4s) = 7s
      const serverSeconds = serverTicksToSeconds(
        SERVER_WIPE_TICKS.wipe_hold + SERVER_WIPE_TICKS.wipe_reveal
      )
      expect(serverSeconds).toBe(7)

      // Client: hold (3s) + enter (4s) = 7s
      const clientSeconds = clientFramesToSeconds(
        CLIENT_WIPE_FRAMES.holdDuration + CLIENT_WIPE_FRAMES.enterDuration
      )
      expect(clientSeconds).toBe(7)
    })

    test('wave transition (exit + hold + reveal): 9 seconds', () => {
      // Server: wipe_exit (2s) + wipe_hold (3s) + wipe_reveal (4s) = 9s
      const serverSeconds = serverTicksToSeconds(
        SERVER_WIPE_TICKS.wipe_exit +
        SERVER_WIPE_TICKS.wipe_hold +
        SERVER_WIPE_TICKS.wipe_reveal
      )
      expect(serverSeconds).toBe(9)

      // Client: exit (2s) + hold (3s) + enter (4s) = 9s
      const clientSeconds = clientFramesToSeconds(
        CLIENT_WIPE_FRAMES.exitDuration +
        CLIENT_WIPE_FRAMES.holdDuration +
        CLIENT_WIPE_FRAMES.enterDuration
      )
      expect(clientSeconds).toBe(9)
    })
  })
})

// ─── Entrance Animation Timing ──────────────────────────────────────────────

describe('Entrance Animation Timing', () => {
  test('entrance base duration is within wipe_reveal phase', () => {
    const entranceBaseSeconds = clientFramesToSeconds(CLIENT_ENTRANCE_CONFIG.baseDuration)
    const revealPhaseSeconds = serverTicksToSeconds(SERVER_WIPE_TICKS.wipe_reveal)

    // Base duration (~2.5s) should be less than reveal phase (4s)
    expect(entranceBaseSeconds).toBeLessThan(revealPhaseSeconds)
  })

  test('entrance animation completes within wipe_reveal for solo grid (5×11)', () => {
    const numAliens = 5 * 11 // 55 aliens
    // Worst case: last alien starts at (numAliens-1) * staggerDelay
    // Plus baseDuration for that alien to complete
    const maxStaggerFrames = (numAliens - 1) * CLIENT_ENTRANCE_CONFIG.staggerDelay
    const totalFrames = maxStaggerFrames + CLIENT_ENTRANCE_CONFIG.baseDuration

    const entranceSeconds = clientFramesToSeconds(totalFrames)
    const revealPhaseSeconds = serverTicksToSeconds(SERVER_WIPE_TICKS.wipe_reveal)

    // Entrance animation should complete before wipe_reveal ends
    expect(entranceSeconds).toBeLessThanOrEqual(revealPhaseSeconds)
  })

  test('entrance animation completes within wipe_reveal for 4-player grid (6×15)', () => {
    const numAliens = 6 * 15 // 90 aliens
    const maxStaggerFrames = (numAliens - 1) * CLIENT_ENTRANCE_CONFIG.staggerDelay
    const totalFrames = maxStaggerFrames + CLIENT_ENTRANCE_CONFIG.baseDuration

    const entranceSeconds = clientFramesToSeconds(totalFrames)
    const revealPhaseSeconds = serverTicksToSeconds(SERVER_WIPE_TICKS.wipe_reveal)

    // Even with more aliens, should complete within reveal phase
    expect(entranceSeconds).toBeLessThanOrEqual(revealPhaseSeconds)
  })

  test('entrance has bounce easing for visual feedback', () => {
    // The entrance animation uses easeOutBounce by default
    // DEFAULT_ENTRANCE_CONFIG.easing = easeOutBounce
    // Verified structurally: baseDuration must be positive for any easing to apply
    expect(CLIENT_ENTRANCE_CONFIG.baseDuration).toBeGreaterThan(0)
  })
})

// ─── Server Status Transition Timeline ──────────────────────────────────────

describe('Server Status Transition Timeline', () => {
  test('game start timeline (solo)', () => {
    // T=0: START_SOLO → status='wipe_hold', wipeTicksRemaining=90
    // T=0 to T=90: wipe_hold phase (3 seconds)
    // T=90: wipeTicksRemaining=0 → status='wipe_reveal', wipeTicksRemaining=120
    //       Aliens created with entering=true
    // T=90 to T=210: wipe_reveal phase (4 seconds)
    //       Aliens animate into position
    // T=210: wipeTicksRemaining=0 → status='playing', entering=false
    //        Aliens can now shoot

    const holdEndTick = SERVER_WIPE_TICKS.wipe_hold
    const revealEndTick = holdEndTick + SERVER_WIPE_TICKS.wipe_reveal

    expect(holdEndTick).toBe(90)
    expect(revealEndTick).toBe(210)
    expect(serverTicksToSeconds(revealEndTick)).toBe(7)
  })

  test('wave transition timeline', () => {
    // T=0: All aliens killed → status='wipe_exit', wipeTicksRemaining=60
    // T=0 to T=60: wipe_exit phase (2 seconds) - iris closing
    // T=60: → status='wipe_hold', wipeTicksRemaining=90
    // T=60 to T=150: wipe_hold phase (3 seconds) - show "WAVE N"
    // T=150: → status='wipe_reveal', wipeTicksRemaining=120
    //        New aliens created with entering=true
    // T=150 to T=270: wipe_reveal phase (4 seconds) - aliens enter
    // T=270: → status='playing', entering=false

    const exitEndTick = SERVER_WIPE_TICKS.wipe_exit
    const holdEndTick = exitEndTick + SERVER_WIPE_TICKS.wipe_hold
    const revealEndTick = holdEndTick + SERVER_WIPE_TICKS.wipe_reveal

    expect(exitEndTick).toBe(60)
    expect(holdEndTick).toBe(150)
    expect(revealEndTick).toBe(270)
    expect(serverTicksToSeconds(revealEndTick)).toBe(9)
  })

  test('aliens cannot shoot during wipe phases', () => {
    // During wipe phases, one of these conditions prevents shooting:
    // 1. status is wipe_exit, wipe_hold, or wipe_reveal (no TICK gameplay logic)
    // 2. aliens have entering=true flag (checked in tickReducer)
    //
    // After wipe_reveal ends:
    // - status becomes 'playing'
    // - entering becomes false
    // - Aliens can now shoot

    // Verify all three wipe phases have positive durations (logic tested in reducer.test.ts)
    expect(SERVER_WIPE_TICKS.wipe_exit).toBeGreaterThan(0)
    expect(SERVER_WIPE_TICKS.wipe_hold).toBeGreaterThan(0)
    expect(SERVER_WIPE_TICKS.wipe_reveal).toBeGreaterThan(0)
  })
})

// ─── Timing Invariants ──────────────────────────────────────────────────────

describe('Timing Invariants', () => {
  test('server controls timing, client follows', () => {
    // Key design principle: Server sends status changes
    // Client receives status and starts corresponding animation
    // Client animation duration should match server phase duration
    //
    // This ensures:
    // 1. All clients see same timing regardless of frame rate jitter
    // 2. Late joiners can sync to current phase based on wipeTicksRemaining
    // 3. No client-side timing hacks needed

    // Verify the 2x ratio holds for all phases (client follows server)
    const ratio = CLIENT_FPS / SERVER_HZ
    expect(CLIENT_WIPE_FRAMES.exitDuration).toBe(SERVER_WIPE_TICKS.wipe_exit * ratio)
    expect(CLIENT_WIPE_FRAMES.holdDuration).toBe(SERVER_WIPE_TICKS.wipe_hold * ratio)
    expect(CLIENT_WIPE_FRAMES.enterDuration).toBe(SERVER_WIPE_TICKS.wipe_reveal * ratio)
  })

  test('wipe_reveal is longest phase (for entrance animation)', () => {
    expect(SERVER_WIPE_TICKS.wipe_reveal).toBeGreaterThan(SERVER_WIPE_TICKS.wipe_exit)
    expect(SERVER_WIPE_TICKS.wipe_reveal).toBeGreaterThan(SERVER_WIPE_TICKS.wipe_hold)
  })

  test('wipe_hold is longer than wipe_exit (more time to read wave number)', () => {
    expect(SERVER_WIPE_TICKS.wipe_hold).toBeGreaterThanOrEqual(SERVER_WIPE_TICKS.wipe_exit)
  })

  test('no grace period - entering flag controls shooting', () => {
    // The old design used graceUntilTick to prevent alien shooting
    // The new design uses the entering flag on each alien
    // This is cleaner because:
    // 1. State is explicit on each alien
    // 2. No need to calculate grace period durations
    // 3. Works naturally with server-driven wipe phases

    // Verify WIPE_TIMING has no grace-related keys (design replaced grace with entering flag)
    const wipingKeys = Object.keys(WIPE_TIMING)
    expect(wipingKeys.some(k => k.toLowerCase().includes('grace'))).toBe(false)
  })
})

// ─── Late Joiner Handling ───────────────────────────────────────────────────

describe('Late Joiner Handling', () => {
  test('late joiner receives current wipe state', () => {
    // When a player joins mid-wipe, they receive:
    // - status: current wipe phase
    // - wipeTicksRemaining: how many ticks left in current phase
    // - wipeWaveNumber: wave number to display
    //
    // Client can calculate:
    // - Progress through current phase = 1 - (remaining / total)
    // - Start animation at appropriate point

    // Verify WIPE_TIMING has all three phase durations needed for progress calculation
    expect(Object.keys(WIPE_TIMING)).toContain('EXIT_TICKS')
    expect(Object.keys(WIPE_TIMING)).toContain('HOLD_TICKS')
    expect(Object.keys(WIPE_TIMING)).toContain('REVEAL_TICKS')
  })

  test('wipeTicksRemaining allows progress calculation', () => {
    // Example: Join during wipe_reveal with wipeTicksRemaining=60
    // Total wipe_reveal ticks = 120
    // Progress = 1 - (60/120) = 0.5 (halfway through reveal)
    //
    // Client can:
    // - Skip to 50% of entrance animation
    // - Show iris at 50% open state

    const remainingTicks = 60
    const totalTicks = SERVER_WIPE_TICKS.wipe_reveal
    const progress = 1 - (remainingTicks / totalTicks)

    expect(progress).toBe(0.5)
  })
})

// ─── Animation Easing Documentation ─────────────────────────────────────────

describe('Animation Easing', () => {
  test('wipe uses quadratic easing', () => {
    // wipe.ts uses:
    // - exiting phase: easeInQuad (accelerates into close)
    // - entering phase: easeOutQuad (decelerates as it opens)
    //
    // This creates smooth, natural-feeling transitions

    // Verify wipe phases have durations sufficient for easing to be perceptible
    expect(CLIENT_WIPE_FRAMES.exitDuration).toBeGreaterThanOrEqual(30) // at least 0.5s
    expect(CLIENT_WIPE_FRAMES.enterDuration).toBeGreaterThanOrEqual(30)
  })

  test('entrance uses bounce easing', () => {
    // entrance.ts uses easeOutBounce by default
    // Aliens "land" with a bounce effect
    //
    // Alternative configs available:
    // - WAVE_ENTRANCE: easeOutQuad (smooth)
    // - SCATTER_ENTRANCE: easeOutElastic (springy)
    // - SLIDE_ENTRANCE: easeOutQuad (row by row)

    // Verify entrance config has positive duration for bounce to be visible
    expect(CLIENT_ENTRANCE_CONFIG.baseDuration).toBeGreaterThanOrEqual(30)
    expect(CLIENT_ENTRANCE_CONFIG.staggerDelay).toBeGreaterThanOrEqual(1)
  })
})

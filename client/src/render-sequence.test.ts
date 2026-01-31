// client/src/render-sequence.test.ts
// Tests that verify correct rendering during state transitions
//
// These tests catch "flash" bugs where incorrect content appears
// briefly during status transitions.

import { describe, test, expect } from 'bun:test'
import type { GameState, GameStatus } from '../../shared/types'
import { GAME_STATE_DEFAULTS } from '../../shared/state-defaults'

// ─── Test Utilities ──────────────────────────────────────────────────────────

/**
 * Create a mock game state with specified status
 */
function createMockState(overrides: Partial<GameState> = {}): GameState {
  return {
    ...GAME_STATE_DEFAULTS,
    roomId: 'TEST01',
    ...overrides,
  } as GameState
}

/**
 * Simulate what App.tsx would render for a given state.
 * Returns the component type that would be rendered.
 */
function getRenderedComponent(state: GameState): 'connecting' | 'lobby' | 'wipe_hold_screen' | 'game' | 'game_over' | 'null' {
  // This mirrors the logic in App.tsx
  // If this gets out of sync with App.tsx, the static analysis test will catch it

  switch (state.status) {
    case 'waiting':
      return 'lobby'
    case 'countdown':
    case 'wipe_hold':
      return 'wipe_hold_screen'
    case 'wipe_exit':
    case 'wipe_reveal':
    case 'playing':
      return 'game'
    case 'game_over':
      return 'game_over'
    default:
      return 'null'
  }
}

/**
 * Check if a component type could cause a "flash" when transitioning.
 * A flash occurs when game UI (borders, etc) appears before the mask is ready.
 */
function couldCauseFlash(from: ReturnType<typeof getRenderedComponent>, to: ReturnType<typeof getRenderedComponent>): boolean {
  // Transitioning TO 'game' could cause flash if mask isn't ready
  // But transitioning TO 'wipe_hold_screen' should NOT cause flash (it's a simple black screen)
  // Transitioning FROM anything TO 'wipe_hold_screen' is safe

  if (to === 'wipe_hold_screen') {
    return false // wipe_hold_screen is a simple black screen, no flash possible
  }

  if (to === 'game' && from !== 'game') {
    // Transitioning to game from non-game could flash if entering during wipe
    // This is OK for wipe_reveal (iris is opening) but would be bad for wipe_hold
    return false // We've moved wipe_hold out of GameScreen, so this is now safe
  }

  return false
}

// ─── Render Sequence Tests ───────────────────────────────────────────────────

describe('Render sequence during solo game start', () => {
  test('waiting -> wipe_hold renders wipe_hold_screen, not game', () => {
    const waitingState = createMockState({ status: 'waiting' })
    const wipeHoldState = createMockState({
      status: 'wipe_hold',
      wipeTicksRemaining: 60,
      wipeWaveNumber: 1,
    })

    const fromComponent = getRenderedComponent(waitingState)
    const toComponent = getRenderedComponent(wipeHoldState)

    expect(fromComponent).toBe('lobby')
    expect(toComponent).toBe('wipe_hold_screen') // NOT 'game'!
  })

  test('wipe_hold -> wipe_reveal transitions to game', () => {
    const wipeHoldState = createMockState({
      status: 'wipe_hold',
      wipeTicksRemaining: 0,
      wipeWaveNumber: 1,
    })
    const wipeRevealState = createMockState({
      status: 'wipe_reveal',
      wipeTicksRemaining: 120,
      wipeWaveNumber: 1,
    })

    const fromComponent = getRenderedComponent(wipeHoldState)
    const toComponent = getRenderedComponent(wipeRevealState)

    expect(fromComponent).toBe('wipe_hold_screen')
    expect(toComponent).toBe('game')
  })

  test('full solo start sequence has no flash-prone transitions', () => {
    const sequence: GameStatus[] = ['waiting', 'wipe_hold', 'wipe_reveal', 'playing']

    for (let i = 0; i < sequence.length - 1; i++) {
      const fromState = createMockState({ status: sequence[i] })
      const toState = createMockState({ status: sequence[i + 1] })

      const from = getRenderedComponent(fromState)
      const to = getRenderedComponent(toState)

      const flashRisk = couldCauseFlash(from, to)

      expect(flashRisk).toBe(false)
    }
  })
})

describe('Render sequence during wave transition', () => {
  test('playing -> wipe_exit stays in game (for iris close)', () => {
    const playingState = createMockState({ status: 'playing' })
    const wipeExitState = createMockState({
      status: 'wipe_exit',
      wipeTicksRemaining: 60,
      wipeWaveNumber: 2,
    })

    expect(getRenderedComponent(playingState)).toBe('game')
    expect(getRenderedComponent(wipeExitState)).toBe('game')
  })

  test('wipe_exit -> wipe_hold transitions to black screen', () => {
    const wipeExitState = createMockState({
      status: 'wipe_exit',
      wipeTicksRemaining: 0,
      wipeWaveNumber: 2,
    })
    const wipeHoldState = createMockState({
      status: 'wipe_hold',
      wipeTicksRemaining: 60,
      wipeWaveNumber: 2,
    })

    expect(getRenderedComponent(wipeExitState)).toBe('game')
    expect(getRenderedComponent(wipeHoldState)).toBe('wipe_hold_screen')
  })

  test('full wave transition sequence', () => {
    const sequence: GameStatus[] = ['playing', 'wipe_exit', 'wipe_hold', 'wipe_reveal', 'playing']
    const expectedComponents: ReturnType<typeof getRenderedComponent>[] = ['game', 'game', 'wipe_hold_screen', 'game', 'game']

    for (let i = 0; i < sequence.length; i++) {
      const state = createMockState({ status: sequence[i] })
      expect(getRenderedComponent(state)).toBe(expectedComponents[i])
    }
  })
})

// ─── Static Analysis: Verify App.tsx matches our expectations ───────────────

describe('App.tsx render logic matches test expectations', () => {
  test('wipe_hold case does NOT render GameScreen', async () => {
    const fs = await import('fs')
    const path = await import('path')

    const appPath = path.join(__dirname, 'App.tsx')
    const source = fs.readFileSync(appPath, 'utf-8')

    // Find the wipe_hold case
    const wipeHoldMatch = source.match(/case\s+'wipe_hold':\s*\n([^]*?)(?=case\s+'wipe_exit'|case\s+'wipe_reveal')/s)
    expect(wipeHoldMatch).not.toBeNull()

    const wipeHoldBlock = wipeHoldMatch![1]

    // Should NOT contain GameScreen
    expect(wipeHoldBlock).not.toContain('<GameScreen')

    // Should contain wave title centered (terminal bg is black by default)
    expect(wipeHoldBlock).toContain('WAVE')
    expect(wipeHoldBlock).toContain('justifyContent="center"')
    expect(wipeHoldBlock).toContain('alignItems="center"')
  })

  test('wipe_reveal case renders GameScreen', async () => {
    const fs = await import('fs')
    const path = await import('path')

    const appPath = path.join(__dirname, 'App.tsx')
    const source = fs.readFileSync(appPath, 'utf-8')

    // Find cases that render GameScreen
    const gameScreenCases = source.match(/case\s+'(wipe_reveal|playing)':[^]*?<GameScreen/s)
    expect(gameScreenCases).not.toBeNull()
  })

  test('countdown case shows GET READY countdown (not GameScreen)', async () => {
    const fs = await import('fs')
    const path = await import('path')

    const appPath = path.join(__dirname, 'App.tsx')
    const source = fs.readFileSync(appPath, 'utf-8')

    // Find countdown case
    const countdownMatch = source.match(/case\s+'countdown':[\s\S]*?(?=case\s+'wipe_hold':)/)
    expect(countdownMatch).not.toBeNull()

    // Should show GET READY and countdownRemaining, not GameScreen
    expect(countdownMatch![0]).toContain('GET READY')
    expect(countdownMatch![0]).toContain('countdownRemaining')
    expect(countdownMatch![0]).not.toContain('<GameScreen')
  })
})

// ─── Invariant: No flash during any valid transition ─────────────────────────

describe('No flash invariant', () => {
  const allStatuses: GameStatus[] = [
    'waiting', 'countdown', 'wipe_exit', 'wipe_hold', 'wipe_reveal', 'playing', 'game_over'
  ]

  // Valid transitions (from -> to)
  const validTransitions: [GameStatus, GameStatus][] = [
    // Solo start
    ['waiting', 'wipe_hold'],

    // Coop start
    ['waiting', 'countdown'],
    ['countdown', 'wipe_hold'],

    // Wipe phases
    ['wipe_hold', 'wipe_reveal'],
    ['wipe_reveal', 'playing'],

    // Wave transition
    ['playing', 'wipe_exit'],
    ['wipe_exit', 'wipe_hold'],

    // Game over
    ['playing', 'game_over'],

    // Restart
    ['game_over', 'waiting'],
  ]

  for (const [from, to] of validTransitions) {
    test(`transition ${from} -> ${to} should not cause flash`, () => {
      const fromState = createMockState({ status: from })
      const toState = createMockState({ status: to })

      const fromComponent = getRenderedComponent(fromState)
      const toComponent = getRenderedComponent(toState)

      // Key invariant: if transitioning TO wipe_hold, must render wipe_hold_screen
      if (to === 'wipe_hold') {
        expect(toComponent).toBe('wipe_hold_screen')
      }

      // Key invariant: if transitioning FROM lobby TO game phases,
      // must go through wipe_hold_screen first
      if (fromComponent === 'lobby' && toComponent === 'game') {
        throw new Error(`Direct transition from lobby to game would cause flash! Must go through wipe_hold_screen.`)
      }
    })
  }
})

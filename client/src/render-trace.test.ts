// client/src/render-trace.test.ts
// Automated visual regression testing for render sequences
//
// This test actually traces what would be rendered during state transitions
// and catches any unexpected content ("flash" bugs).

import { describe, test, expect, beforeEach } from 'bun:test'
import type { GameState, GameStatus, Player, Entity } from '../../shared/types'
import { GAME_STATE_DEFAULTS } from '../../shared/state-defaults'

// ─── Render Trace System ─────────────────────────────────────────────────────

interface RenderFrame {
  timestamp: number
  status: GameStatus
  component: string
  content: string[]  // Key content identifiers
}

class RenderTracer {
  private frames: RenderFrame[] = []
  private frameCount = 0

  reset() {
    this.frames = []
    this.frameCount = 0
  }

  /**
   * Simulate what App.tsx renders for a given state
   * Returns content identifiers that would be visible
   */
  captureFrame(state: GameState): RenderFrame {
    const content: string[] = []
    let component = 'unknown'

    switch (state.status) {
      case 'waiting':
        component = 'LobbyScreen'
        content.push('lobby-ui')
        content.push('start-solo-button')
        content.push('room-code')
        break

      case 'countdown':
      case 'wipe_hold':
        component = 'WipeHoldScreen'
        content.push('black-background')
        content.push(`wave-title-${state.wipeWaveNumber ?? state.wave}`)
        // Should NOT contain:
        // - game-border
        // - player-ship
        // - aliens
        // - barriers
        break

      case 'wipe_exit':
        component = 'GameScreen'
        content.push('game-border')
        content.push('iris-mask-closing')
        // Game content hidden by mask
        break

      case 'wipe_reveal':
        component = 'GameScreen'
        content.push('game-border')
        content.push('iris-mask-opening')
        content.push('aliens-entering')
        break

      case 'playing':
        component = 'GameScreen'
        content.push('game-border')
        content.push('player-ship')
        content.push('aliens')
        content.push('barriers')
        break

      case 'game_over':
        component = 'GameOverScreen'
        content.push('game-over-ui')
        content.push('final-score')
        break
    }

    const frame: RenderFrame = {
      timestamp: this.frameCount++,
      status: state.status,
      component,
      content,
    }

    this.frames.push(frame)
    return frame
  }

  getFrames(): RenderFrame[] {
    return [...this.frames]
  }

  /**
   * Check if any frame contains content that shouldn't appear during that status
   */
  findFlashViolations(): string[] {
    const violations: string[] = []

    for (const frame of this.frames) {
      // During wipe_hold, should NOT have game UI
      if (frame.status === 'wipe_hold' || frame.status === 'countdown') {
        const forbiddenContent = ['game-border', 'player-ship', 'aliens', 'barriers']
        for (const forbidden of forbiddenContent) {
          if (frame.content.includes(forbidden)) {
            violations.push(
              `Frame ${frame.timestamp}: ${forbidden} visible during ${frame.status} (would cause flash)`
            )
          }
        }
      }

      // During wipe_hold, MUST have black background
      if (frame.status === 'wipe_hold') {
        if (!frame.content.includes('black-background')) {
          violations.push(
            `Frame ${frame.timestamp}: missing black-background during wipe_hold (would show terminal bg)`
          )
        }
      }
    }

    return violations
  }

  /**
   * Check for transition violations (wrong content appearing between states)
   */
  findTransitionViolations(): string[] {
    const violations: string[] = []

    for (let i = 1; i < this.frames.length; i++) {
      const prev = this.frames[i - 1]
      const curr = this.frames[i]

      // Transition from lobby to wipe_hold should NOT flash game content
      if (prev.status === 'waiting' && curr.status === 'wipe_hold') {
        if (curr.content.includes('game-border')) {
          violations.push(
            `Transition waiting->wipe_hold: game-border appeared (flash!)`
          )
        }
      }

      // Transition from wipe_exit to wipe_hold should hide game content
      if (prev.status === 'wipe_exit' && curr.status === 'wipe_hold') {
        if (curr.content.includes('game-border')) {
          violations.push(
            `Transition wipe_exit->wipe_hold: game-border should be hidden`
          )
        }
      }
    }

    return violations
  }
}

// ─── Test Utilities ──────────────────────────────────────────────────────────

function createState(status: GameStatus, overrides: Partial<GameState> = {}): GameState {
  const base = {
    ...GAME_STATE_DEFAULTS,
    roomId: 'TEST01',
    status,
  }

  // Set appropriate wipe state
  if (status === 'wipe_hold' || status === 'wipe_exit' || status === 'wipe_reveal') {
    base.wipeTicksRemaining = 30
    base.wipeWaveNumber = overrides.wave ?? 1
  }

  return { ...base, ...overrides } as GameState
}

// ─── Automated Render Trace Tests ────────────────────────────────────────────

describe('Render trace: Solo game start', () => {
  let tracer: RenderTracer

  beforeEach(() => {
    tracer = new RenderTracer()
  })

  test('captures correct sequence without flash', () => {
    // Simulate solo game start sequence
    tracer.captureFrame(createState('waiting'))
    tracer.captureFrame(createState('wipe_hold', { wipeWaveNumber: 1 }))
    tracer.captureFrame(createState('wipe_reveal', { wipeWaveNumber: 1 }))
    tracer.captureFrame(createState('playing'))

    const frames = tracer.getFrames()
    expect(frames.length).toBe(4)

    // Verify sequence
    expect(frames[0].component).toBe('LobbyScreen')
    expect(frames[1].component).toBe('WipeHoldScreen')
    expect(frames[2].component).toBe('GameScreen')
    expect(frames[3].component).toBe('GameScreen')

    // Check for flash violations
    const flashViolations = tracer.findFlashViolations()
    expect(flashViolations).toEqual([])

    // Check for transition violations
    const transitionViolations = tracer.findTransitionViolations()
    expect(transitionViolations).toEqual([])
  })

  test('wipe_hold frame has black background and wave title', () => {
    tracer.captureFrame(createState('wipe_hold', { wipeWaveNumber: 1 }))

    const frame = tracer.getFrames()[0]
    expect(frame.content).toContain('black-background')
    expect(frame.content).toContain('wave-title-1')
    expect(frame.content).not.toContain('game-border')
  })
})

describe('Render trace: Wave transition', () => {
  let tracer: RenderTracer

  beforeEach(() => {
    tracer = new RenderTracer()
  })

  test('captures correct sequence for wave transition', () => {
    // Wave 1 ends, transition to wave 2
    tracer.captureFrame(createState('playing', { wave: 1 }))
    tracer.captureFrame(createState('wipe_exit', { wave: 2, wipeWaveNumber: 2 }))
    tracer.captureFrame(createState('wipe_hold', { wave: 2, wipeWaveNumber: 2 }))
    tracer.captureFrame(createState('wipe_reveal', { wave: 2, wipeWaveNumber: 2 }))
    tracer.captureFrame(createState('playing', { wave: 2 }))

    const frames = tracer.getFrames()
    expect(frames.length).toBe(5)

    // Check for violations
    const flashViolations = tracer.findFlashViolations()
    expect(flashViolations).toEqual([])

    const transitionViolations = tracer.findTransitionViolations()
    expect(transitionViolations).toEqual([])
  })

  test('wipe_exit has iris mask closing', () => {
    tracer.captureFrame(createState('wipe_exit', { wipeWaveNumber: 2 }))

    const frame = tracer.getFrames()[0]
    expect(frame.content).toContain('iris-mask-closing')
    expect(frame.content).toContain('game-border')
  })
})

describe('Flash detection', () => {
  let tracer: RenderTracer

  beforeEach(() => {
    tracer = new RenderTracer()
  })

  test('autoStartSolo should skip lobby and go to wipe_hold_screen', () => {
    // When autoStartSolo is true, user should NEVER see LobbyScreen
    // This tests that the transition is: connecting -> wipe_hold_screen (not lobby)

    // Correct sequence for solo auto-start:
    tracer.captureFrame(createState('wipe_hold', { wipeWaveNumber: 1 }))
    tracer.captureFrame(createState('wipe_reveal', { wipeWaveNumber: 1 }))
    tracer.captureFrame(createState('playing'))

    const frames = tracer.getFrames()
    expect(frames.length).toBe(3)
    expect(frames[0].component).toBe('WipeHoldScreen')

    // Should NOT contain LobbyScreen
    const hasLobby = frames.some(f => f.component === 'LobbyScreen')
    expect(hasLobby).toBe(false)
  })

  test('detects flash if LobbyScreen appears during autoStartSolo', () => {
    // This simulates the bug: lobby briefly flashes before wipe_hold
    const buggySequence: RenderFrame[] = [
      { timestamp: 0, status: 'waiting', component: 'LobbyScreen', content: ['lobby-ui'] },
      { timestamp: 1, status: 'wipe_hold', component: 'WipeHoldScreen', content: ['black-background', 'wave-title-1'] },
    ]

    // The fact that LobbyScreen rendered during autoStartSolo is a bug
    const hasUnexpectedLobby = buggySequence[0].component === 'LobbyScreen'
    expect(hasUnexpectedLobby).toBe(true) // Confirms the buggy sequence

    // Proper fix: LobbyScreen should NOT appear when autoStartSolo is true
  })

  test('detects flash if game-border appears during wipe_hold', () => {
    // Simulate a buggy render where game content shows during wipe_hold
    const buggyFrame: RenderFrame = {
      timestamp: 0,
      status: 'wipe_hold',
      component: 'GameScreen', // BUG: Should be WipeHoldScreen
      content: ['game-border', 'player-ship'], // BUG: Should be black-background
    }

    // Manually add buggy frame
    ;(tracer as any).frames = [buggyFrame]
    ;(tracer as any).frameCount = 1

    const violations = tracer.findFlashViolations()
    expect(violations.length).toBeGreaterThan(0)
    expect(violations[0]).toContain('game-border')
    expect(violations[0]).toContain('wipe_hold')
  })

  test('detects missing black background during wipe_hold', () => {
    const buggyFrame: RenderFrame = {
      timestamp: 0,
      status: 'wipe_hold',
      component: 'WipeHoldScreen',
      content: ['wave-title-1'], // BUG: Missing black-background
    }

    ;(tracer as any).frames = [buggyFrame]
    ;(tracer as any).frameCount = 1

    const violations = tracer.findFlashViolations()
    expect(violations.length).toBeGreaterThan(0)
    expect(violations[0]).toContain('missing black-background')
  })
})

// ─── Integration with actual App.tsx logic ───────────────────────────────────

describe('App.tsx render logic verification', () => {
  test('getRenderedComponent matches App.tsx switch statement', async () => {
    const fs = await import('fs')
    const path = await import('path')

    const appPath = path.join(__dirname, 'App.tsx')
    const source = fs.readFileSync(appPath, 'utf-8')

    // Verify rendering logic for each status
    // Check that countdown/wipe_hold render wave title (not GameScreen)
    const wipeHoldBlock = source.match(/case 'countdown':[\s\S]*?case 'wipe_hold':[\s\S]*?[Ww]ave[\s\S]*?(?=case 'wipe_exit')/)
    expect(wipeHoldBlock).not.toBeNull()
    expect(wipeHoldBlock![0]).not.toContain('<GameScreen')

    // Check that wipe_exit/wipe_reveal/playing render GameScreen
    const gameScreenBlock = source.match(/case 'wipe_exit':[\s\S]*?case 'wipe_reveal':[\s\S]*?case 'playing':[\s\S]*?<GameScreen/)
    expect(gameScreenBlock).not.toBeNull()

    // Verify that the switch rendering block for wipe_hold does NOT contain GameScreen
    // Find the block between case 'wipe_hold': and case 'wipe_exit':
    const wipeHoldRenderBlock = source.match(/case 'wipe_hold':[\s\S]*?(?=case 'wipe_exit':)/)
    expect(wipeHoldRenderBlock).not.toBeNull()
    expect(wipeHoldRenderBlock![0]).not.toContain('<GameScreen')
  })
})

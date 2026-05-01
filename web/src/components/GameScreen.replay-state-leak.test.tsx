// Integration test: GameScreen mounts, plays a partial match, enters
// game_over, then "replays" in place by receiving a fresh (tick=0) state
// through the SAME mounted instance without unmount.
//
// Background: GameScreen.tsx calls resetEffects() only on unmount. In the
// real app, when the game ends the router currently swaps in GameOverScreen
// so GameScreen unmounts naturally — that path is safe. But nothing in the
// renderer ITSELF prevents a future refactor (or a different router choice)
// from reusing the same GameScreen instance across matches. The
// buildDrawCommands tick-rewind guard exists as defense-in-depth for
// exactly that case.
//
// This test mirrors the user flow we want to protect: the same GameScreen
// React instance processes state from match 1 (including a dead alien that
// would populate seenDeadAlienIds), then receives game_over, then receives
// a fresh match state. The renderer accumulators must be clean afterwards.

import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { GameScreen } from './GameScreen'
import { buildDrawCommands, resetEffects, _getMatchStateForTests, _RESET_MATCH_STATE } from '../renderer/canvasRenderer'
import { createDefaultGameState } from '../../../shared/state-defaults'
import type { AlienEntity, GameState } from '../../../shared/types'

function aliveAlien(id: string, x = 10): AlienEntity {
  return {
    kind: 'alien',
    id,
    x,
    y: 5,
    type: 'squid',
    alive: true,
    row: 0,
    col: 0,
    points: 30,
    entering: false,
  }
}
function deadAlien(id: string, x = 10): AlienEntity {
  return { ...aliveAlien(id, x), alive: false }
}

function makeState(tick: number, overrides: Partial<GameState> = {}): GameState {
  const s = createDefaultGameState('TEST01')
  s.tick = tick
  s.status = 'playing'
  Object.assign(s, overrides)
  return s
}

describe('GameScreen in-place replay: renderer state does not leak across matches', () => {
  afterEach(() => {
    cleanup()
    resetEffects()
  })

  it('same GameScreen instance: partial match → game_over → fresh match, no state leak', () => {
    resetEffects()
    expect(_getMatchStateForTests()).toEqual(_RESET_MATCH_STATE)

    // ── Match 1 starts ──
    // GameScreen renders a canvas. jsdom doesn't implement 2D context;
    // the component's rAF render loop calls buildDrawCommands via
    // requestAnimationFrame AFTER document.fonts.ready — so in a
    // synchronous test body we can't rely on it having fired. We
    // drive buildDrawCommands directly to deterministically advance
    // renderer module state, then use rerender() to verify GameScreen
    // stays mounted and doesn't trigger resetEffects() via its
    // unmount cleanup.
    const t1 = makeState(5, { entities: [aliveAlien('a1', 10)] })
    const { rerender, unmount } = render(<GameScreen state={t1} playerId={null} prevState={null} />)
    buildDrawCommands(t1, null, null)

    // Advance: alien dies. Re-render with new state (SAME component
    // instance, no unmount). Drive buildDrawCommands to populate
    // the dead-id accumulator.
    const t2 = makeState(6, { entities: [deadAlien('a1', 10)] })
    rerender(<GameScreen state={t2} playerId={null} prevState={t1} />)
    buildDrawCommands(t2, null, t1)

    // Confirm the match populated state. If this fails, the seed didn't
    // actually drive the accumulator and the rest of the test is moot.
    expect(_getMatchStateForTests().seenDeadAlienIdsSize).toBeGreaterThan(0)

    // ── Match 1 ends: game_over state comes in. GameScreen still mounted. ──
    const gameOver = makeState(50, { status: 'game_over', lives: 0 })
    rerender(<GameScreen state={gameOver} playerId={null} prevState={t2} />)
    buildDrawCommands(gameOver, null, t2)
    // Loss → confettiStarted stays false. Dead-id set still populated.
    expect(_getMatchStateForTests().seenDeadAlienIdsSize).toBeGreaterThan(0)
    expect(_getMatchStateForTests().confettiStarted).toBe(false)

    // ── Match 2 starts in place: new state, tick rewinds to a low value. ──
    // This is the critical path: same React instance, same module-level
    // renderer state, fresh server state. The tick-rewind guard inside
    // buildDrawCommands should have triggered resetEffects() even though
    // GameScreen never unmounted.
    const fresh = makeState(0, { status: 'playing', lives: 3, entities: [] })
    rerender(<GameScreen state={fresh} playerId={null} prevState={gameOver} />)
    buildDrawCommands(fresh, null, gameOver)

    // ── Assertion: no state leaked from match 1 into match 2. ──
    // We check every accumulator field. Advance-state fields
    // (lastProcessedTick, prevGameStatus, barrierLastHealth,
    // trackedPrevBulletIds) legitimately reflect the new match's
    // current tick — those are not expected to match _RESET_MATCH_STATE
    // exactly after a buildDrawCommands call.
    const reset = _getMatchStateForTests()
    expect(reset.seenDeadAlienIdsSize).toBe(0)
    expect(reset.seenDeadUfoIdsSize).toBe(0)
    expect(reset.confettiStarted).toBe(false)
    expect(reset.barrierDamageScarsSize).toBe(0)
    expect(reset.barrierShimmersLength).toBe(0)
    expect(reset.scoreBumpTicks).toBe(0)
    expect(reset.lastScoreBumpTick).toBe(_RESET_MATCH_STATE.lastScoreBumpTick)
    expect(reset.waveBurstTicks).toBe(0)
    expect(reset.fightFlashTicks).toBe(0)
    expect(reset.clearedFlashTicks).toBe(0)
    expect(reset.shakeTicks).toBe(0)
    expect(reset.shakeIntensity).toBe(0)
    expect(reset.shakeDuration).toBe(0)
    expect(reset.flashTicks).toBe(0)
    expect(reset.flashDuration).toBe(0)
    expect(reset.flashColor).toBe(_RESET_MATCH_STATE.flashColor)

    unmount()
  })
})

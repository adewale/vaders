// Regression tests for state that leaks across in-place replays.
//
// Root cause: `GameScreen.tsx` only calls `resetEffects()` on UNMOUNT.
// In the real user flow, the game screen typically stays mounted across
// waves, game-over, and replay (the URL path and room stay the same), so
// module-level accumulators inside canvasRenderer.ts carried state from
// one match into the next:
//
//   - `seenDeadAlienIds` / `seenDeadUfoIds` — grew unbounded (memory leak),
//     and could also mis-suppress explosions for a freshly-spawned alien
//     that happened to reuse an id from a prior match.
//   - `confettiStarted` — after a first victory, a second victory would
//     not re-fire the confetti because the flag never reset.
//   - `barrierDamageScars` / `barrierLastHealth` / `barrierShimmers` —
//     carried wave-N scars onto freshly-spawned wave-1 barriers.
//   - `prevGameStatus` / `lastProcessedTick` — transition detection
//     produced false positives on the first tick of the replay.
//
// Fix: buildDrawCommands now detects a game restart (tick rewound to a
// low value while we had previously processed a higher tick) and calls
// the reset path internally. Tests here lock that in without relying on
// the callers' unmount behaviour.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  buildDrawCommands,
  resetEffects,
  _getFlashStateForTests,
  _getSeenDeadIdsForTests,
  _getConfettiStartedForTests,
} from './canvasRenderer'
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

function state(tick: number, overrides: Partial<GameState> = {}): GameState {
  const s = createDefaultGameState('TEST01')
  s.tick = tick
  s.status = 'playing'
  Object.assign(s, overrides)
  return s
}

describe('in-place replay: state reset triggers on tick rewind', () => {
  it('resetEffects() zeroes flashColor (previously leaked stale colour)', () => {
    const prev = state(10, { lives: 3 })
    const curr = state(11, { lives: 2 })
    buildDrawCommands(curr, null, prev)
    // Damage flash triggered — colour is red
    expect(_getFlashStateForTests().color).toMatch(/255,\s*0,\s*0/)
    resetEffects()
    // After reset, the colour must be back to its default — NOT the last
    // triggered colour. A stale colour here would leak into fresh games
    // that call _getFlashStateForTests before any new trigger.
    expect(_getFlashStateForTests().color).not.toMatch(/255,\s*0,\s*0/)
  })

  it('seenDeadAlienIds is cleared when tick rewinds to a new game', () => {
    resetEffects()
    // Game 1: alien dies on tick 5. seenDeadAlienIds now contains its id.
    const alive1 = state(4, { entities: [aliveAlien('g1-a1')] })
    const dead1 = state(5, { entities: [deadAlien('g1-a1')] })
    buildDrawCommands(alive1, null, null)
    buildDrawCommands(dead1, null, alive1)
    expect(_getSeenDeadIdsForTests().size).toBeGreaterThan(0)

    // Game 2 starts — tick rewinds to 0. No explicit resetEffects() call,
    // simulating the in-place replay path. The renderer should detect the
    // tick rewind and clear the dead-id accumulator itself.
    const newGame = state(0, { entities: [aliveAlien('g2-a1')] })
    buildDrawCommands(newGame, null, dead1)
    expect(_getSeenDeadIdsForTests().size).toBe(0)
  })

  it('confettiStarted is cleared on tick rewind so a second victory re-fires', () => {
    resetEffects()
    // Drive the renderer into a victory state (confettiStarted = true).
    const victory = state(100, { status: 'game_over', lives: 3 })
    buildDrawCommands(victory, null, null)
    // Stopping + un-victorying within the same match should not clear;
    // only a full restart should.
    expect(_getConfettiStartedForTests()).toBe(true)

    // Replay: tick rewinds to 0, status back to 'playing'.
    const replay = state(0, { status: 'playing', lives: 3 })
    buildDrawCommands(replay, null, victory)
    expect(_getConfettiStartedForTests()).toBe(false)
  })

  it('tick rewind on FIRST call does NOT false-trigger a reset', () => {
    // Regression guard for the trigger condition — must not fire when
    // `lastProcessedTick` is at its initial sentinel.
    resetEffects()
    // First ever call with tick=0 shouldn't crash or clear anything that
    // wasn't already empty.
    const first = state(0)
    expect(() => buildDrawCommands(first, null, null)).not.toThrow()
  })

  it('tick moving FORWARD does NOT trigger a reset', () => {
    resetEffects()
    const a = state(5, { entities: [aliveAlien('persist')] })
    const b = state(6, { entities: [deadAlien('persist')] })
    buildDrawCommands(a, null, null)
    buildDrawCommands(b, null, a)
    const sizeBefore = _getSeenDeadIdsForTests().size
    expect(sizeBefore).toBeGreaterThan(0)

    // Normal forward progression
    const c = state(7, { entities: [aliveAlien('fresh')] })
    buildDrawCommands(c, null, b)
    // Set should still contain the previously-seen dead id (we haven't
    // restarted the game, just advanced).
    expect(_getSeenDeadIdsForTests().size).toBe(sizeBefore)
  })

  it('PBT: after a tick rewind, seenDeadAlienIds is always empty', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 300 }), // previous tick (game 1)
        fc.integer({ min: 0, max: 3 }), // rewind target (game 2)
        fc.array(fc.string({ minLength: 3 }), { minLength: 1, maxLength: 8 }),
        (prevTick, newTick, deadIds) => {
          resetEffects()
          // Seed game 1 with some dead aliens so the set is non-empty
          const aliveEntities = deadIds.map((id) => aliveAlien(id))
          const deadEntities = deadIds.map((id) => deadAlien(id))
          const g1a = state(prevTick - 1, { entities: aliveEntities })
          const g1b = state(prevTick, { entities: deadEntities })
          buildDrawCommands(g1a, null, null)
          buildDrawCommands(g1b, null, g1a)

          // Game 2
          const g2 = state(newTick)
          buildDrawCommands(g2, null, g1b)
          return _getSeenDeadIdsForTests().size === 0
        },
      ),
      { numRuns: 40 },
    )
  })
})

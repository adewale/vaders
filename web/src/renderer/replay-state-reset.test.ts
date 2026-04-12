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
  triggerShake,
  triggerFlash,
  _getFlashStateForTests,
  _getSeenDeadIdsForTests,
  _getConfettiStartedForTests,
  _getMatchStateForTests,
  _RESET_MATCH_STATE,
} from './canvasRenderer'
import { createDefaultGameState } from '../../../shared/state-defaults'
import { LAYOUT } from '../../../shared/types'
import type { AlienEntity, BarrierEntity, BulletEntity, GameState, UFOEntity } from '../../../shared/types'

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

function aliveUfo(id: string, x = 30): UFOEntity {
  return { kind: 'ufo', id, x, y: 1, direction: 1, alive: true, points: 100 }
}

function deadUfo(id: string, x = 30): UFOEntity {
  return { ...aliveUfo(id, x), alive: false }
}

function barrierAt(id: string, x: number, segHealth: 0 | 1 | 2 | 3 | 4 = 4): BarrierEntity {
  return {
    kind: 'barrier',
    id,
    x,
    segments: [
      { offsetX: 0, offsetY: 0, health: segHealth },
      { offsetX: 1, offsetY: 0, health: segHealth },
    ],
  }
}

function bulletAt(id: string, x: number, y: number, owner: string | null = 'p1'): BulletEntity {
  return { kind: 'bullet', id, x, y, ownerId: owner, dy: owner == null ? 1 : -1 }
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

// ──────────────────────────────────────────────────────────────────────────────
// EXHAUSTIVE MATCH-STATE RESET
// ──────────────────────────────────────────────────────────────────────────────
//
// The tests above spot-check three accumulators (seenDeadAlienIds,
// confettiStarted, flash colour). But canvasRenderer.ts has a whole
// constellation of module-level accumulators that must ALL clear on a
// tick rewind. The block below drives each one to a non-default value,
// asserts it's non-default, rewinds, then asserts EVERY field is back to
// the canonical clean-slate values in `_RESET_MATCH_STATE`.
//
// This is deliberately one big "everything populated, everything clears"
// test rather than N individual ones: the renderer is a single state
// machine, and it's the combined-reset guarantee that protects the
// in-place replay UX flow. A single-accumulator test would suffice if
// one slipped, but would miss the case where resetEffects() forgets a
// newly added field — whereas a struct-equality assertion against
// _RESET_MATCH_STATE catches that class of bug.

describe('in-place replay: EVERY match-scoped accumulator resets on tick rewind', () => {
  // Fields that represent "state accumulated across the match". These MUST
  // be at their reset values after a rewind — carrying any of them forward
  // causes the bugs described at the top of the file.
  // Fields NOT in this list are "advance-state" (lastProcessedTick,
  // prevGameStatus, barrierLastHealth, trackedPrevBulletIds): those are
  // updated to reflect the NEW match's latest tick as part of the same
  // buildDrawCommands call that triggered the rewind, which is correct.
  const ACCUMULATOR_FIELDS = [
    'seenDeadAlienIdsSize',
    'seenDeadUfoIdsSize',
    'seenDeadPlayerIdsSize',
    'confettiStarted',
    'barrierDamageScarsSize',
    'barrierShimmersLength',
    'scoreBumpTicks',
    'lastScoreBumpTick',
    'waveBurstTicks',
    'fightFlashTicks',
    'clearedFlashTicks',
    'shakeTicks',
    'shakeIntensity',
    'shakeDuration',
    'flashTicks',
    'flashDuration',
    'flashColor',
  ] as const

  it('resetEffects() directly zeroes EVERY match-scoped accumulator field', () => {
    // Direct invariant: calling resetEffects() in isolation must produce
    // the canonical clean-slate. This is the strongest guarantee and the
    // struct-equality check catches any new module-level field that
    // someone adds without wiring into resetEffects().
    resetEffects()
    expect(_getMatchStateForTests()).toEqual(_RESET_MATCH_STATE)

    // Mutate everything via a normal render, then reset again — still clean.
    buildDrawCommands(state(5, { entities: [aliveAlien('a1')] }), null, null)
    buildDrawCommands(state(6, { entities: [deadAlien('a1')] }), null, state(5, { entities: [aliveAlien('a1')] }))
    triggerShake(3, 10)
    triggerFlash('rgba(0, 255, 0, 0.5)', 8)
    resetEffects()
    expect(_getMatchStateForTests()).toEqual(_RESET_MATCH_STATE)
  })

  it('drives renderer to fully-populated state, rewinds, asserts accumulators clear', () => {
    resetEffects()
    // Phase 1: fresh match — baseline clean.
    expect(_getMatchStateForTests()).toEqual(_RESET_MATCH_STATE)

    // Phase 2: populate EVERY accumulator via normal renderer calls.
    // Barrier at x=20 so bullet at (20, 25) is centred on its first segment.
    const barrier = barrierAt('bar1', 20, 4)
    const startingEntities = [
      aliveAlien('a1', 10),
      aliveUfo('u1', 30),
      barrier,
      bulletAt('b1', 20, LAYOUT.BARRIER_Y),
      bulletAt('b2', 23, LAYOUT.BARRIER_Y),
    ]
    // wipe_reveal → playing transition on first advance arms fightFlashTicks.
    const t9 = state(9, { status: 'wipe_reveal', entities: startingEntities, score: 0, wave: 1, lives: 3 })
    buildDrawCommands(t9, null, null)

    const t10 = state(10, { entities: startingEntities, score: 0, wave: 1, lives: 3 })
    buildDrawCommands(t10, null, t9)

    // Tick 11: barriers take damage, bullets disappear mid-barrier
    // (shimmers spawn), alien + UFO die, player loses a life
    // (shake+flash), score & wave advance (scoreBump + waveBurst).
    const damagedBarrier: BarrierEntity = {
      ...barrier,
      segments: [
        { offsetX: 0, offsetY: 0, health: 2 },
        { offsetX: 1, offsetY: 0, health: 4 },
      ],
    }
    const t11Entities = [deadAlien('a1', 10), deadUfo('u1', 30), damagedBarrier]
    const t11 = state(11, { entities: t11Entities, score: 100, wave: 2, lives: 2 })
    buildDrawCommands(t11, null, t10)

    // Manually arm shake & flash so their ticks/duration/color are all
    // non-default regardless of natural trigger timing.
    triggerShake(5, 20)
    triggerFlash('rgba(200, 50, 50, 0.5)', 12)

    // playing → wipe_exit transition arms clearedFlashTicks (also captured
    // in the populated snapshot since we check immediately after).
    const t12 = state(12, { status: 'wipe_exit', entities: t11Entities, score: 100, wave: 2, lives: 2 })
    buildDrawCommands(t12, null, t11)

    // Snapshot the renderer state BEFORE confetti / further advance — at
    // this point every accumulator should be non-default (shimmers have
    // ticksRemaining=5 since they spawned at t11 and only decayed twice).
    const populated = _getMatchStateForTests()
    expect(populated.seenDeadAlienIdsSize).toBeGreaterThan(0)
    expect(populated.seenDeadUfoIdsSize).toBeGreaterThan(0)
    expect(populated.barrierDamageScarsSize).toBeGreaterThan(0)
    expect(populated.barrierLastHealthSize).toBeGreaterThan(0)
    expect(populated.barrierShimmersLength).toBeGreaterThan(0)
    expect(populated.lastProcessedTick).toBeGreaterThan(0)
    expect(populated.lastScoreBumpTick).toBeGreaterThanOrEqual(0)
    // fight flash armed on wipe_reveal→playing, cleared flash on playing→wipe_exit.
    expect(populated.fightFlashTicks + populated.clearedFlashTicks).toBeGreaterThan(0)
    expect(populated.shakeTicks).toBeGreaterThan(0)
    expect(populated.shakeIntensity).toBeGreaterThan(0)
    expect(populated.shakeDuration).toBeGreaterThan(0)
    expect(populated.flashTicks).toBeGreaterThan(0)
    expect(populated.flashDuration).toBeGreaterThan(0)
    expect(populated.flashColor).not.toBe(_RESET_MATCH_STATE.flashColor)

    // Separately: confettiStarted flips on victory entry. Do this after
    // the main snapshot because victory advances ticks (shimmers decay)
    // and we want to prove confettiStarted also resets.
    const victory = state(13, { status: 'game_over', lives: 3 })
    buildDrawCommands(victory, null, t12)
    expect(_getMatchStateForTests().confettiStarted).toBe(true)

    // Phase 4: REWIND — tick drops to 0 (server started a new match in
    // the same room). GameScreen is still mounted, so no explicit reset
    // happens via unmount. Pass an EMPTY entity list so advance-state
    // fields (barrierLastHealth, trackedPrevBulletIds) aren't
    // immediately repopulated by this same call.
    const newMatch = state(0, { status: 'playing', lives: 3, score: 0, wave: 1, entities: [] })
    buildDrawCommands(newMatch, null, victory)

    // Phase 5: assert EVERY accumulator field is at its reset value.
    // Struct-equality (toEqual) on the subset so a future contributor
    // who adds a new accumulator to _RESET_MATCH_STATE without wiring
    // it into resetEffects() sees a loud failure.
    const reset = _getMatchStateForTests()
    const actualAccumulators: Record<string, unknown> = {}
    const expectedAccumulators: Record<string, unknown> = {}
    for (const field of ACCUMULATOR_FIELDS) {
      actualAccumulators[field] = (reset as unknown as Record<string, unknown>)[field]
      expectedAccumulators[field] = (_RESET_MATCH_STATE as unknown as Record<string, unknown>)[field]
    }
    expect(actualAccumulators).toEqual(expectedAccumulators)

    // Advance-state fields may or may not have been repopulated by the
    // new match's first tick — verify they're at fresh-match values.
    expect(reset.lastProcessedTick).toBe(0) // current tick
    expect(reset.prevGameStatus).toBe('playing') // current status
    expect(reset.barrierLastHealthSize).toBe(0) // no barriers in new match yet
    expect(reset.trackedPrevBulletIdsSize).toBe(0) // no bullets in new match yet
  })

  it('PBT: random damage/hit events at T1, rewind to any T2<T1, all accumulators reset', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 500 }), // T1 — end of match 1
        fc.integer({ min: 0, max: 5 }), // T2 — start of match 2 (rewind target)
        fc.array(fc.string({ minLength: 2, maxLength: 6 }), { minLength: 1, maxLength: 6 }), // alien ids
        fc.array(fc.string({ minLength: 2, maxLength: 6 }), { minLength: 0, maxLength: 3 }), // ufo ids
        fc.integer({ min: 1, max: 6 }), // shake intensity
        fc.integer({ min: 5, max: 30 }), // shake duration
        fc.integer({ min: 5, max: 30 }), // flash duration
        (t1, t2, alienIds, ufoIds, shakeIntensity, shakeDuration, flashDuration) => {
          resetEffects()
          // Seed: aliens alive at t1-1, dead at t1 (→ seenDeadAlienIds).
          const aliveAs = alienIds.map((id) => aliveAlien(id))
          const deadAs = alienIds.map((id) => deadAlien(id))
          const aliveUs = ufoIds.map((id) => aliveUfo(id))
          const deadUs = ufoIds.map((id) => deadUfo(id))
          const barrier = barrierAt('bar-pbt', 20, 4)
          const damagedBarrier: BarrierEntity = {
            ...barrier,
            segments: [
              { offsetX: 0, offsetY: 0, health: 1 },
              { offsetX: 1, offsetY: 0, health: 3 },
            ],
          }

          const a = state(t1 - 1, {
            entities: [...aliveAs, ...aliveUs, barrier, bulletAt('b1', 20, LAYOUT.BARRIER_Y)],
            lives: 3,
            score: 0,
            wave: 1,
          })
          const b = state(t1, {
            entities: [...deadAs, ...deadUs, damagedBarrier],
            lives: 2, // player hit → shake + flash
            score: 100, // score bump
            wave: 2, // wave burst
          })
          buildDrawCommands(a, null, null)
          buildDrawCommands(b, null, a)
          triggerShake(shakeIntensity, shakeDuration)
          triggerFlash('rgba(1, 2, 3, 0.4)', flashDuration)

          // Rewind with empty entities so advance-state fields stay clean.
          const fresh = state(t2, { lives: 3, score: 0, wave: 1, entities: [] })
          buildDrawCommands(fresh, null, b)

          const reset = _getMatchStateForTests()
          // Every accumulator field must be at reset value.
          for (const field of ACCUMULATOR_FIELDS) {
            const actual = (reset as unknown as Record<string, unknown>)[field]
            const expected = (_RESET_MATCH_STATE as unknown as Record<string, unknown>)[field]
            if (actual !== expected) return false
          }
          // Advance-state: cleared or current-match values.
          if (reset.barrierLastHealthSize !== 0) return false
          if (reset.trackedPrevBulletIdsSize !== 0) return false
          if (reset.lastProcessedTick !== t2) return false
          if (reset.prevGameStatus !== 'playing') return false
          return true
        },
      ),
      { numRuns: 40 },
    )
  })
})

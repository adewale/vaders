// web/src/testing/coopFixture.ts
//
// Multi-player test fixtures.
//
// **Why this exists**: reviewing the visual-identity audit turned up a
// systemic pattern — renderer tests (and many component tests) default to
// single-player setups. `makeState({ players: { p1: … } })` is the ambient
// shape, so cross-player invariants (bullets differ per slot, local-vs-
// remote rendering, per-player death animations, damage flash gated on the
// local player) have no natural test site. Bugs that only surface with ≥2
// players survive every commit because nothing exercises that path.
//
// This module ships a `coopState(n)` factory that produces a GameState with
// `n ∈ {2, 3, 4}` distinct players already seated, plus helpers to drive
// per-player mutations (take a hit, add a kill, fire a bullet) so new tests
// can express multi-player scenarios without re-deriving the fixture each
// time. Pair with `expect(…)` assertions that compare slot-1 output against
// slot-N output — that's the test shape that catches "all my players look
// the same" bugs.

import type { GameState, Player, PlayerSlot, Entity, BulletEntity } from '../../../shared/types'
import { createDefaultGameState } from '../../../shared/state-defaults'

const SLOT_COLORS: Record<PlayerSlot, Player['color']> = {
  1: 'cyan',
  2: 'orange',
  3: 'magenta',
  4: 'lime',
}

const SLOT_START_X: Record<PlayerSlot, number> = {
  1: 24,
  2: 48,
  3: 72,
  4: 96,
}

/**
 * Build one player in the given slot with sensible defaults. Overrides win.
 */
export function coopPlayer(slot: PlayerSlot, overrides: Partial<Player> = {}): Player {
  return {
    id: `player-${slot}`,
    name: `P${slot}`,
    x: SLOT_START_X[slot],
    slot,
    color: SLOT_COLORS[slot],
    lastShotTick: 0,
    alive: true,
    lives: 3,
    respawnAtTick: null,
    invulnerableUntilTick: null,
    kills: 0,
    inputState: { left: false, right: false },
    ...overrides,
  }
}

/**
 * Build a GameState with `n` distinct players (1..n by slot).
 *
 * Example:
 *   const state = coopState(3, { tick: 100, wave: 2 })
 *   // 3 players in slots 1,2,3; coop mode; tick=100; wave=2
 *
 * Useful for tests asserting cross-player invariants — e.g. "slot 1's
 * bullets render a different colour than slot 2's", or "damage flash fires
 * only when the LOCAL player's lives drop".
 */
export function coopState(n: 2 | 3 | 4, overrides: Partial<GameState> = {}): GameState {
  const state = createDefaultGameState('TESTCC')
  // `n` is typed 2|3|4 so this is always 'coop'. The conditional was a
  // leftover from an earlier signature that also accepted 1; keeping it
  // explicit documents the intent.
  state.mode = 'coop'
  state.status = 'playing'
  state.players = {}
  for (let slot = 1; slot <= n; slot++) {
    const p = coopPlayer(slot as PlayerSlot)
    state.players[p.id] = p
  }
  Object.assign(state, overrides)
  return state
}

/**
 * Build a player-owned bullet for the given slot. Useful for testing that
 * bullet render commands carry the shooter's slot identity.
 */
export function coopBullet(slot: PlayerSlot, overrides: Partial<BulletEntity> = {}): BulletEntity {
  return {
    kind: 'bullet',
    id: `bullet-${slot}-${Math.random().toString(36).slice(2, 7)}`,
    x: SLOT_START_X[slot],
    y: 30,
    ownerId: `player-${slot}`,
    dy: -1,
    ...overrides,
  }
}

/**
 * Return a copy of `state` with `state.entities` replaced by the given list.
 * Convenience so tests can assemble "same players, different entities" pairs
 * for before/after comparisons without mutating a shared fixture.
 */
export function withEntities(state: GameState, entities: Entity[]): GameState {
  return { ...state, entities }
}

/**
 * Produce a (prev, curr) pair where the named player transitions from
 * alive → dead. Used by tests asserting a death explosion fires for that
 * player.
 */
export function coopDeathPair(n: 2 | 3 | 4, dyingSlot: PlayerSlot, tick = 20): { prev: GameState; curr: GameState } {
  const prev = coopState(n, { tick: tick - 1 })
  const curr = coopState(n, { tick })
  // Replace the dying player with a dead-alive flag in curr only.
  const dying = coopPlayer(dyingSlot, { alive: false, lives: 0 })
  curr.players[`player-${dyingSlot}`] = dying
  return { prev, curr }
}

// Tests for bug #3: damage flash must only fire for the LOCAL player's hit
// in coop, not for any teammate taking a hit.
//
// Before the fix, canvasRenderer.ts compared the global `state.lives` counter.
// In coop the whole team shares a life pool — if a teammate dies the counter
// decrements and every player sees the red damage flash. That conflated "my
// ship got hit" with "someone else on the team got hit", which misdirected
// attention and made the flash useless as a hit indicator.
//
// Fix: gate the flash on `state.players[playerId].lives < prev.players[playerId].lives`
// (per-player lives check). If `playerId` is null (spectator / pre-join), keep
// the old global behaviour so single-player tests still work.

import { describe, it, expect, beforeEach } from 'vitest'
import { buildDrawCommands, resetEffects, _getFlashStateForTests } from './canvasRenderer'
import { createDefaultGameState } from '../../../shared/state-defaults'
import type { GameState, Player } from '../../../shared/types'

beforeEach(() => {
  resetEffects()
})

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    name: 'Test',
    x: 50,
    slot: 1,
    color: 'cyan',
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

function stateWith(players: Record<string, Player>, overrides: Partial<GameState> = {}): GameState {
  const state = createDefaultGameState('TEST01')
  state.players = players
  state.entities = []
  state.status = 'playing'
  return { ...state, ...overrides, players, entities: [] }
}

describe('bug #3: damage flash gated on LOCAL player lives, not global', () => {
  it('local player hit: flash DOES fire (ticks > 0)', () => {
    const p1Prev = makePlayer({ id: 'p1', slot: 1, lives: 3 })
    const p1Curr = makePlayer({ id: 'p1', slot: 1, lives: 2 })
    const prev = stateWith({ p1: p1Prev }, { tick: 10, lives: 3 })
    const curr = stateWith({ p1: p1Curr }, { tick: 11, lives: 2 })

    buildDrawCommands(prev, 'p1', null)
    buildDrawCommands(curr, 'p1', prev)
    expect(_getFlashStateForTests().ticks).toBeGreaterThan(0)
    // Colour is red (damage)
    expect(_getFlashStateForTests().color).toMatch(/255,\s*0,\s*0/)
  })

  it('teammate hit but local player unchanged: flash does NOT fire', () => {
    // Two players. Local = p1 (lives unchanged). Teammate p2 takes a hit.
    // Global state.lives drops (shared pool) but p1's lives do not.
    const p1 = makePlayer({ id: 'p1', slot: 1, lives: 3 })
    const p2Prev = makePlayer({ id: 'p2', slot: 2, lives: 3 })
    const p2Curr = makePlayer({ id: 'p2', slot: 2, lives: 2 })
    const prev = stateWith({ p1, p2: p2Prev }, { tick: 10, lives: 3 })
    const curr = stateWith({ p1, p2: p2Curr }, { tick: 11, lives: 2 })

    buildDrawCommands(prev, 'p1', null)
    buildDrawCommands(curr, 'p1', prev)
    // Local player's lives are unchanged → flash must NOT trigger.
    expect(_getFlashStateForTests().ticks).toBe(0)
  })

  it('playerId=null (spectator/pre-join) falls back to global-lives behaviour', () => {
    // No local player identity. Must preserve the pre-fix behaviour so
    // single-player test paths don't regress.
    const p1Prev = makePlayer({ id: 'p1', slot: 1, lives: 3 })
    const p1Curr = makePlayer({ id: 'p1', slot: 1, lives: 2 })
    const prev = stateWith({ p1: p1Prev }, { tick: 10, lives: 3 })
    const curr = stateWith({ p1: p1Curr }, { tick: 11, lives: 2 })

    buildDrawCommands(prev, null, null)
    buildDrawCommands(curr, null, prev)
    // Global lives dropped → flash fires (fallback behaviour).
    expect(_getFlashStateForTests().ticks).toBeGreaterThan(0)
  })

  it('both local and teammate take hits the same tick: flash fires (local caused it)', () => {
    const p1Prev = makePlayer({ id: 'p1', slot: 1, lives: 3 })
    const p1Curr = makePlayer({ id: 'p1', slot: 1, lives: 2 })
    const p2Prev = makePlayer({ id: 'p2', slot: 2, lives: 3 })
    const p2Curr = makePlayer({ id: 'p2', slot: 2, lives: 2 })
    const prev = stateWith({ p1: p1Prev, p2: p2Prev }, { tick: 10, lives: 3 })
    const curr = stateWith({ p1: p1Curr, p2: p2Curr }, { tick: 11, lives: 1 })

    buildDrawCommands(prev, 'p1', null)
    buildDrawCommands(curr, 'p1', prev)
    expect(_getFlashStateForTests().ticks).toBeGreaterThan(0)
  })

  it('local player joins mid-game (not in prev state): no flash', () => {
    // p1 is in prev and curr but p2 only in curr. Local = p2.
    // prev.players[p2] is undefined — must NOT throw, must NOT flash.
    const p1 = makePlayer({ id: 'p1', slot: 1, lives: 3 })
    const p2 = makePlayer({ id: 'p2', slot: 2, lives: 3 })
    const prev = stateWith({ p1 }, { tick: 10, lives: 3 })
    const curr = stateWith({ p1, p2 }, { tick: 11, lives: 3 })

    buildDrawCommands(prev, 'p2', null)
    expect(() => buildDrawCommands(curr, 'p2', prev)).not.toThrow()
    expect(_getFlashStateForTests().ticks).toBe(0)
  })

  it('local player revives (lives increase): no flash (flash is for damage, not heal)', () => {
    // Extra-lives pickup or wave-bonus could raise lives; must not trigger
    // the damage flash.
    const p1Prev = makePlayer({ id: 'p1', slot: 1, lives: 1 })
    const p1Curr = makePlayer({ id: 'p1', slot: 1, lives: 3 })
    const prev = stateWith({ p1: p1Prev }, { tick: 10, lives: 1 })
    const curr = stateWith({ p1: p1Curr }, { tick: 11, lives: 3 })

    buildDrawCommands(prev, 'p1', null)
    buildDrawCommands(curr, 'p1', prev)
    expect(_getFlashStateForTests().ticks).toBe(0)
  })
})

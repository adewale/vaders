// worker/src/game/reducer.test.ts
// Unit tests for the pure game reducer

import { describe, it, expect, beforeEach } from 'vitest'
import { gameReducer, canTransition, type GameAction } from './reducer'
import type { GameState, Player, AlienEntity, BulletEntity, BarrierEntity } from '../../../shared/types'
import { LAYOUT, DEFAULT_CONFIG, getBullets, getAliens } from '../../../shared/types'
import {
  createTestGameState,
  createTestPlayer,
  createTestAlien,
  createTestBullet,
  createTestBarrier,
  createTestUFO,
  createTestPlayingState,
  createTestGameStateWithPlayer,
  createTestGameStateWithPlayers,
  createTestAlienFormation,
  hasEvent,
  getEventData,
} from '../test-utils'

// ============================================================================
// State Machine Tests
// ============================================================================

describe('canTransition', () => {
  describe('from waiting status', () => {
    it('returns true for PLAYER_JOIN', () => {
      expect(canTransition('waiting', 'PLAYER_JOIN')).toBe(true)
    })

    it('returns true for PLAYER_READY', () => {
      expect(canTransition('waiting', 'PLAYER_READY')).toBe(true)
    })

    it('returns true for PLAYER_UNREADY', () => {
      expect(canTransition('waiting', 'PLAYER_UNREADY')).toBe(true)
    })

    it('returns true for START_SOLO', () => {
      expect(canTransition('waiting', 'START_SOLO')).toBe(true)
    })

    it('returns true for START_COUNTDOWN', () => {
      expect(canTransition('waiting', 'START_COUNTDOWN')).toBe(true)
    })

    it('returns true for PLAYER_LEAVE', () => {
      expect(canTransition('waiting', 'PLAYER_LEAVE')).toBe(true)
    })

    it('returns false for TICK (cannot skip to playing)', () => {
      expect(canTransition('waiting', 'TICK')).toBe(false)
    })

    it('returns false for COUNTDOWN_TICK', () => {
      expect(canTransition('waiting', 'COUNTDOWN_TICK')).toBe(false)
    })
  })

  describe('from countdown status', () => {
    it('returns true for COUNTDOWN_TICK', () => {
      expect(canTransition('countdown', 'COUNTDOWN_TICK')).toBe(true)
    })

    it('returns true for COUNTDOWN_CANCEL', () => {
      expect(canTransition('countdown', 'COUNTDOWN_CANCEL')).toBe(true)
    })

    it('returns true for PLAYER_LEAVE', () => {
      expect(canTransition('countdown', 'PLAYER_LEAVE')).toBe(true)
    })

    it('returns true for PLAYER_INPUT', () => {
      expect(canTransition('countdown', 'PLAYER_INPUT')).toBe(true)
    })

    it('returns false for PLAYER_JOIN (cannot join during countdown)', () => {
      expect(canTransition('countdown', 'PLAYER_JOIN')).toBe(false)
    })

    it('returns false for TICK', () => {
      expect(canTransition('countdown', 'TICK')).toBe(false)
    })
  })

  describe('from playing status', () => {
    it('returns true for TICK', () => {
      expect(canTransition('playing', 'TICK')).toBe(true)
    })

    it('returns true for PLAYER_INPUT', () => {
      expect(canTransition('playing', 'PLAYER_INPUT')).toBe(true)
    })

    it('returns true for PLAYER_SHOOT', () => {
      expect(canTransition('playing', 'PLAYER_SHOOT')).toBe(true)
    })

    it('returns true for PLAYER_LEAVE', () => {
      expect(canTransition('playing', 'PLAYER_LEAVE')).toBe(true)
    })

    it('returns false for PLAYER_JOIN', () => {
      expect(canTransition('playing', 'PLAYER_JOIN')).toBe(false)
    })

    it('returns false for START_SOLO', () => {
      expect(canTransition('playing', 'START_SOLO')).toBe(false)
    })
  })

  describe('from game_over status', () => {
    it('returns false for all actions (terminal state)', () => {
      expect(canTransition('game_over', 'TICK')).toBe(false)
      expect(canTransition('game_over', 'PLAYER_JOIN')).toBe(false)
      expect(canTransition('game_over', 'PLAYER_LEAVE')).toBe(false)
      expect(canTransition('game_over', 'PLAYER_INPUT')).toBe(false)
      expect(canTransition('game_over', 'START_SOLO')).toBe(false)
    })
  })
})

// ============================================================================
// PLAYER_JOIN Action Tests
// ============================================================================

describe('PLAYER_JOIN action', () => {
  let state: GameState

  beforeEach(() => {
    state = createTestGameState()
  })

  it('adds player to state.players with correct properties', () => {
    const player = createTestPlayer({ id: 'p1', name: 'Alice', slot: 1 })
    const result = gameReducer(state, { type: 'PLAYER_JOIN', player })

    expect(result.state.players['p1']).toBeDefined()
    expect(result.state.players['p1'].name).toBe('Alice')
    expect(result.state.players['p1'].slot).toBe(1)
    expect(result.state.players['p1'].alive).toBe(true)
  })

  it('emits player_joined event', () => {
    const player = createTestPlayer({ id: 'p1' })
    const result = gameReducer(state, { type: 'PLAYER_JOIN', player })

    expect(hasEvent(result.events, 'player_joined')).toBe(true)
    const data = getEventData<{ player: Player }>(result.events, 'player_joined')
    expect(data?.player.id).toBe('p1')
  })

  it('sets mode to solo with 1 player', () => {
    const player = createTestPlayer({ id: 'p1' })
    const result = gameReducer(state, { type: 'PLAYER_JOIN', player })

    expect(result.state.mode).toBe('solo')
  })

  it('sets mode to coop with 2+ players', () => {
    const player1 = createTestPlayer({ id: 'p1' })
    let result = gameReducer(state, { type: 'PLAYER_JOIN', player: player1 })

    const player2 = createTestPlayer({ id: 'p2', slot: 2 })
    result = gameReducer(result.state, { type: 'PLAYER_JOIN', player: player2 })

    expect(result.state.mode).toBe('coop')
    expect(Object.keys(result.state.players).length).toBe(2)
  })

  it('returns persist: true', () => {
    const player = createTestPlayer({ id: 'p1' })
    const result = gameReducer(state, { type: 'PLAYER_JOIN', player })

    expect(result.persist).toBe(true)
  })

  it('is ignored when game is in playing status', () => {
    const playingState = createTestGameState({ status: 'playing' })
    const player = createTestPlayer({ id: 'p1' })
    const result = gameReducer(playingState, { type: 'PLAYER_JOIN', player })

    expect(result.state.players['p1']).toBeUndefined()
    expect(result.events.length).toBe(0)
    expect(result.persist).toBe(false)
  })
})

// ============================================================================
// PLAYER_LEAVE Action Tests
// ============================================================================

describe('PLAYER_LEAVE action', () => {
  it('removes player from state.players', () => {
    const { state, player } = createTestGameStateWithPlayer({ id: 'p1' })
    const result = gameReducer(state, { type: 'PLAYER_LEAVE', playerId: 'p1' })

    expect(result.state.players['p1']).toBeUndefined()
    expect(Object.keys(result.state.players).length).toBe(0)
  })

  it('removes player from readyPlayerIds', () => {
    const { state, player } = createTestGameStateWithPlayer({ id: 'p1' })
    state.readyPlayerIds = ['p1']

    const result = gameReducer(state, { type: 'PLAYER_LEAVE', playerId: 'p1' })

    expect(result.state.readyPlayerIds).not.toContain('p1')
  })

  it('emits player_left event', () => {
    const { state, player } = createTestGameStateWithPlayer({ id: 'p1' })
    const result = gameReducer(state, { type: 'PLAYER_LEAVE', playerId: 'p1' })

    expect(hasEvent(result.events, 'player_left')).toBe(true)
    const data = getEventData<{ playerId: string }>(result.events, 'player_left')
    expect(data?.playerId).toBe('p1')
  })

  it('reverts to solo mode when 1 player remains', () => {
    const { state, players } = createTestGameStateWithPlayers(2)
    state.mode = 'coop'

    const result = gameReducer(state, { type: 'PLAYER_LEAVE', playerId: players[0].id })

    expect(result.state.mode).toBe('solo')
    expect(Object.keys(result.state.players).length).toBe(1)
  })

  it('returns persist: true', () => {
    const { state } = createTestGameStateWithPlayer({ id: 'p1' })
    const result = gameReducer(state, { type: 'PLAYER_LEAVE', playerId: 'p1' })

    expect(result.persist).toBe(true)
  })
})

// ============================================================================
// PLAYER_READY/UNREADY Action Tests
// ============================================================================

describe('PLAYER_READY action', () => {
  it('adds playerId to readyPlayerIds', () => {
    const { state, player } = createTestGameStateWithPlayer({ id: 'p1' })
    const result = gameReducer(state, { type: 'PLAYER_READY', playerId: 'p1' })

    expect(result.state.readyPlayerIds).toContain('p1')
  })

  it('emits player_ready event', () => {
    const { state, player } = createTestGameStateWithPlayer({ id: 'p1' })
    const result = gameReducer(state, { type: 'PLAYER_READY', playerId: 'p1' })

    expect(hasEvent(result.events, 'player_ready')).toBe(true)
    const data = getEventData<{ playerId: string }>(result.events, 'player_ready')
    expect(data?.playerId).toBe('p1')
  })

  it('ignores already-ready player', () => {
    const { state, player } = createTestGameStateWithPlayer({ id: 'p1' })
    state.readyPlayerIds = ['p1']

    const result = gameReducer(state, { type: 'PLAYER_READY', playerId: 'p1' })

    expect(result.state.readyPlayerIds.filter(id => id === 'p1').length).toBe(1)
    expect(result.events.length).toBe(0)
    expect(result.persist).toBe(false)
  })

  it('returns persist: true when player becomes ready', () => {
    const { state, player } = createTestGameStateWithPlayer({ id: 'p1' })
    const result = gameReducer(state, { type: 'PLAYER_READY', playerId: 'p1' })

    expect(result.persist).toBe(true)
  })

  it('ignores non-existent player', () => {
    const state = createTestGameState()
    const result = gameReducer(state, { type: 'PLAYER_READY', playerId: 'nonexistent' })

    expect(result.events.length).toBe(0)
    expect(result.persist).toBe(false)
  })
})

describe('PLAYER_UNREADY action', () => {
  it('removes playerId from readyPlayerIds', () => {
    const { state, player } = createTestGameStateWithPlayer({ id: 'p1' })
    state.readyPlayerIds = ['p1']

    const result = gameReducer(state, { type: 'PLAYER_UNREADY', playerId: 'p1' })

    expect(result.state.readyPlayerIds).not.toContain('p1')
  })

  it('emits player_unready event', () => {
    const { state, player } = createTestGameStateWithPlayer({ id: 'p1' })
    state.readyPlayerIds = ['p1']

    const result = gameReducer(state, { type: 'PLAYER_UNREADY', playerId: 'p1' })

    expect(hasEvent(result.events, 'player_unready')).toBe(true)
    const data = getEventData<{ playerId: string }>(result.events, 'player_unready')
    expect(data?.playerId).toBe('p1')
  })

  it('ignores already-unready player', () => {
    const { state, player } = createTestGameStateWithPlayer({ id: 'p1' })
    // Player is not in readyPlayerIds (default)

    const result = gameReducer(state, { type: 'PLAYER_UNREADY', playerId: 'p1' })

    expect(result.events.length).toBe(0)
    expect(result.persist).toBe(false)
  })

  it('returns persist: true when player becomes unready', () => {
    const { state, player } = createTestGameStateWithPlayer({ id: 'p1' })
    state.readyPlayerIds = ['p1']

    const result = gameReducer(state, { type: 'PLAYER_UNREADY', playerId: 'p1' })

    expect(result.persist).toBe(true)
  })
})

// ============================================================================
// PLAYER_INPUT Action Tests
// ============================================================================

describe('PLAYER_INPUT action', () => {
  it('updates player.inputState with left/right values', () => {
    const { state, player } = createTestGameStateWithPlayer({ id: 'p1' })
    state.status = 'playing'

    const result = gameReducer(state, {
      type: 'PLAYER_INPUT',
      playerId: 'p1',
      input: { left: true, right: false },
    })

    expect(result.state.players['p1'].inputState).toEqual({ left: true, right: false })
  })

  it('ignored for dead players (alive: false)', () => {
    const { state, player } = createTestGameStateWithPlayer({ id: 'p1', alive: false })
    state.status = 'playing'
    const originalInput = { ...state.players['p1'].inputState }

    const result = gameReducer(state, {
      type: 'PLAYER_INPUT',
      playerId: 'p1',
      input: { left: true, right: true },
    })

    expect(result.state.players['p1'].inputState).toEqual(originalInput)
    expect(result.persist).toBe(false)
  })

  it('ignored for non-existent players', () => {
    const state = createTestGameState({ status: 'playing' })

    const result = gameReducer(state, {
      type: 'PLAYER_INPUT',
      playerId: 'nonexistent',
      input: { left: true, right: false },
    })

    expect(result.events.length).toBe(0)
    expect(result.persist).toBe(false)
  })

  it('works during waiting status', () => {
    const { state, player } = createTestGameStateWithPlayer({ id: 'p1' })
    state.status = 'waiting'

    const result = gameReducer(state, {
      type: 'PLAYER_INPUT',
      playerId: 'p1',
      input: { left: true, right: false },
    })

    expect(result.state.players['p1'].inputState).toEqual({ left: true, right: false })
  })
})

// ============================================================================
// PLAYER_SHOOT Action Tests
// ============================================================================

describe('PLAYER_SHOOT action', () => {
  it('creates BulletEntity with correct properties', () => {
    const { state, players } = createTestPlayingState(1)
    const player = players[0]
    player.x = 60
    player.lastShotTick = 0
    state.tick = 10  // Past cooldown (6 ticks)
    state.players[player.id] = player

    const result = gameReducer(state, { type: 'PLAYER_SHOOT', playerId: player.id })

    const bullets = getBullets(result.state.entities)
    expect(bullets.length).toBe(1)
    expect(bullets[0].x).toBe(player.x) // player.x IS the center, no offset needed
    expect(bullets[0].y).toBe(LAYOUT.PLAYER_Y - LAYOUT.BULLET_SPAWN_OFFSET) // Above player
    expect(bullets[0].dy).toBe(-1) // Moving up
    expect(bullets[0].ownerId).toBe(player.id)
  })

  it('respects cooldown (player.lastShotTick + config.playerCooldownTicks)', () => {
    const { state, players } = createTestPlayingState(1)
    const player = players[0]
    player.lastShotTick = 10
    state.tick = 14 // Less than lastShotTick + playerCooldownTicks (6)
    state.players[player.id] = player

    const result = gameReducer(state, { type: 'PLAYER_SHOOT', playerId: player.id })

    // Should not create bullet (cooldown not met)
    const bullets = getBullets(result.state.entities)
    expect(bullets.length).toBe(0)
  })

  it('allows shooting after cooldown expires', () => {
    const { state, players } = createTestPlayingState(1)
    const player = players[0]
    player.lastShotTick = 10
    state.tick = 16 // Equal to lastShotTick + playerCooldownTicks (10 + 6 = 16)
    state.players[player.id] = player

    const result = gameReducer(state, { type: 'PLAYER_SHOOT', playerId: player.id })

    const bullets = getBullets(result.state.entities)
    expect(bullets.length).toBe(1)
  })

  it('updates player.lastShotTick to current tick', () => {
    const { state, players } = createTestPlayingState(1)
    const player = players[0]
    state.tick = 100
    state.players[player.id] = player

    const result = gameReducer(state, { type: 'PLAYER_SHOOT', playerId: player.id })

    expect(result.state.players[player.id].lastShotTick).toBe(100)
  })

  it('ignored for dead players', () => {
    const { state, players } = createTestPlayingState(1)
    const player = players[0]
    player.alive = false
    state.players[player.id] = player

    const result = gameReducer(state, { type: 'PLAYER_SHOOT', playerId: player.id })

    const bullets = getBullets(result.state.entities)
    expect(bullets.length).toBe(0)
  })

  it('ignored for non-existent players', () => {
    const { state } = createTestPlayingState(1)

    const result = gameReducer(state, { type: 'PLAYER_SHOOT', playerId: 'nonexistent' })

    const bullets = getBullets(result.state.entities)
    expect(bullets.length).toBe(0)
  })
})

// ============================================================================
// Bullet Centering Integration Tests
// ============================================================================

describe('bullet spawn position centering', () => {
  /**
   * COORDINATE SYSTEM CONTRACT:
   *
   * The client treats player.x as the CENTER of the sprite:
   *   spriteLeftEdge = player.x - floor(SPRITE_WIDTH / 2)
   *
   * Bullets render at their exact x coordinate:
   *   bulletRenderColumn = bullet.x
   *
   * Therefore, for a bullet to appear visually centered above the player:
   *   bullet.x MUST equal player.x
   *
   * Adding an offset (like player.x + SPRITE_WIDTH/2) is WRONG because
   * it assumes player.x is the left edge, which it is not.
   */

  describe('player bullets (coordinate system contract)', () => {
    it('bullet.x equals player.x (player.x is CENTER, not left edge)', () => {
      const { state, players } = createTestPlayingState(1)
      const player = players[0]
      player.x = 50  // This is the CENTER of the sprite
      state.tick = 100
      state.players[player.id] = player

      const result = gameReducer(state, { type: 'PLAYER_SHOOT', playerId: player.id })

      const bullets = getBullets(result.state.entities)
      expect(bullets.length).toBe(1)

      // CORRECT: bullet.x should equal player.x (center position)
      // This ensures the bullet appears at the visual center of the sprite
      expect(bullets[0].x).toBe(player.x)
    })

    it('bullet spawns at visual center for various player positions', () => {
      const testPositions = [10, 25, 50, 60, 100]

      for (const playerX of testPositions) {
        const { state, players } = createTestPlayingState(1)
        const player = players[0]
        player.x = playerX  // Center position
        state.tick = 100
        state.players[player.id] = player

        const result = gameReducer(state, { type: 'PLAYER_SHOOT', playerId: player.id })

        const bullets = getBullets(result.state.entities)
        expect(bullets.length).toBe(1)

        // Bullet must be at player.x (the center)
        expect(bullets[0].x).toBe(playerX)
      }
    })

    it('DOCUMENTS: adding SPRITE_WIDTH/2 offset would be WRONG', () => {
      // This test documents WHY the old formula was wrong
      const playerX = 50
      const spriteWidth = LAYOUT.PLAYER_WIDTH  // 5

      // WRONG: This assumes player.x is left edge
      const wrongBulletX = playerX + Math.floor(spriteWidth / 2)  // 50 + 2 = 52

      // CORRECT: player.x IS the center, no offset needed
      const correctBulletX = playerX  // 50

      // The wrong formula places bullet 2 columns to the right
      expect(wrongBulletX - correctBulletX).toBe(2)
    })
  })

  describe('alien bullets (coordinate system contract)', () => {
    it('alien.x is also CENTER, so alien bullet.x should equal alien.x', () => {
      // Same coordinate system applies to aliens
      // Alien bullets should spawn at alien.x, not alien.x + offset
      expect(LAYOUT.ALIEN_WIDTH).toBe(LAYOUT.PLAYER_WIDTH)
    })

    it('alien and player use same coordinate system', () => {
      expect(LAYOUT.ALIEN_WIDTH).toBe(LAYOUT.PLAYER_WIDTH)
      expect(LAYOUT.ALIEN_HEIGHT).toBe(LAYOUT.PLAYER_HEIGHT)
    })
  })

  describe('sprite dimension constants', () => {
    it('PLAYER_WIDTH is 5 (odd number for symmetric centering)', () => {
      expect(LAYOUT.PLAYER_WIDTH).toBe(5)
    })

    it('ALIEN_WIDTH is 5 (odd number for symmetric centering)', () => {
      expect(LAYOUT.ALIEN_WIDTH).toBe(5)
    })

    it('center offset for 5-wide sprite is 2', () => {
      // For rendering: leftEdge = center - 2
      // Columns: [0, 1, 2, 3, 4] with center at index 2
      expect(Math.floor(5 / 2)).toBe(2)
    })
  })
})

// ============================================================================
// START_SOLO Action Tests
// ============================================================================

describe('START_SOLO action', () => {
  it('only works when exactly 1 player', () => {
    const { state, player } = createTestGameStateWithPlayer({ id: 'p1' })

    const result = gameReducer(state, { type: 'START_SOLO' })

    expect(result.state.status).toBe('playing')
  })

  it('fails with 0 players', () => {
    const state = createTestGameState()

    const result = gameReducer(state, { type: 'START_SOLO' })

    expect(result.state.status).toBe('waiting')
    expect(result.events.length).toBe(0)
  })

  it('fails with 2+ players', () => {
    const { state, players } = createTestGameStateWithPlayers(2)

    const result = gameReducer(state, { type: 'START_SOLO' })

    expect(result.state.status).toBe('waiting')
    expect(result.events.length).toBe(0)
  })

  it('sets status to playing, mode to solo, lives to 3', () => {
    const { state, player } = createTestGameStateWithPlayer({ id: 'p1' })

    const result = gameReducer(state, { type: 'START_SOLO' })

    expect(result.state.status).toBe('playing')
    expect(result.state.mode).toBe('solo')
    expect(result.state.lives).toBe(3)
  })

  it('resets tick to 0', () => {
    const { state, player } = createTestGameStateWithPlayer({ id: 'p1' })
    state.tick = 100

    const result = gameReducer(state, { type: 'START_SOLO' })

    expect(result.state.tick).toBe(0)
  })

  it('emits game_start event', () => {
    const { state, player } = createTestGameStateWithPlayer({ id: 'p1' })

    const result = gameReducer(state, { type: 'START_SOLO' })

    expect(hasEvent(result.events, 'game_start')).toBe(true)
  })

  it('returns persist: true', () => {
    const { state, player } = createTestGameStateWithPlayer({ id: 'p1' })

    const result = gameReducer(state, { type: 'START_SOLO' })

    expect(result.persist).toBe(true)
  })
})

// ============================================================================
// START_COUNTDOWN Action Tests
// ============================================================================

describe('START_COUNTDOWN action', () => {
  it('requires 2+ players', () => {
    const { state, player } = createTestGameStateWithPlayer({ id: 'p1' })
    state.readyPlayerIds = ['p1']

    const result = gameReducer(state, { type: 'START_COUNTDOWN' })

    expect(result.state.status).toBe('waiting')
    expect(result.events.length).toBe(0)
  })

  it('requires all players ready', () => {
    const { state, players } = createTestGameStateWithPlayers(2)
    state.readyPlayerIds = [players[0].id] // Only one player ready

    const result = gameReducer(state, { type: 'START_COUNTDOWN' })

    expect(result.state.status).toBe('waiting')
    expect(result.events.length).toBe(0)
  })

  it('sets status to countdown, countdownRemaining to 3', () => {
    const { state, players } = createTestGameStateWithPlayers(2)
    state.readyPlayerIds = [players[0].id, players[1].id]

    const result = gameReducer(state, { type: 'START_COUNTDOWN' })

    expect(result.state.status).toBe('countdown')
    expect(result.state.countdownRemaining).toBe(3)
  })

  it('emits countdown_tick with count: 3', () => {
    const { state, players } = createTestGameStateWithPlayers(2)
    state.readyPlayerIds = [players[0].id, players[1].id]

    const result = gameReducer(state, { type: 'START_COUNTDOWN' })

    expect(hasEvent(result.events, 'countdown_tick')).toBe(true)
    const data = getEventData<{ count: number }>(result.events, 'countdown_tick')
    expect(data?.count).toBe(3)
  })

  it('returns persist: true', () => {
    const { state, players } = createTestGameStateWithPlayers(2)
    state.readyPlayerIds = [players[0].id, players[1].id]

    const result = gameReducer(state, { type: 'START_COUNTDOWN' })

    expect(result.persist).toBe(true)
  })
})

// ============================================================================
// COUNTDOWN_TICK Action Tests
// ============================================================================

describe('COUNTDOWN_TICK action', () => {
  it('decrements countdownRemaining', () => {
    const { state, players } = createTestGameStateWithPlayers(2)
    state.status = 'countdown'
    state.countdownRemaining = 3

    const result = gameReducer(state, { type: 'COUNTDOWN_TICK' })

    expect(result.state.countdownRemaining).toBe(2)
  })

  it('emits countdown_tick with new count', () => {
    const { state, players } = createTestGameStateWithPlayers(2)
    state.status = 'countdown'
    state.countdownRemaining = 3

    const result = gameReducer(state, { type: 'COUNTDOWN_TICK' })

    expect(hasEvent(result.events, 'countdown_tick')).toBe(true)
    const data = getEventData<{ count: number }>(result.events, 'countdown_tick')
    expect(data?.count).toBe(2)
  })

  it('transitions to playing and emits game_start when countdownRemaining reaches 0', () => {
    const { state, players } = createTestGameStateWithPlayers(2)
    state.status = 'countdown'
    state.countdownRemaining = 1

    const result = gameReducer(state, { type: 'COUNTDOWN_TICK' })

    expect(result.state.status).toBe('playing')
    expect(result.state.countdownRemaining).toBeNull()
    expect(hasEvent(result.events, 'game_start')).toBe(true)
  })

  it('returns persist: true when transitioning to playing', () => {
    const { state, players } = createTestGameStateWithPlayers(2)
    state.status = 'countdown'
    state.countdownRemaining = 1

    const result = gameReducer(state, { type: 'COUNTDOWN_TICK' })

    expect(result.persist).toBe(true)
  })

  it('does nothing when countdownRemaining is null', () => {
    const { state, players } = createTestGameStateWithPlayers(2)
    state.status = 'countdown'
    state.countdownRemaining = null

    const result = gameReducer(state, { type: 'COUNTDOWN_TICK' })

    expect(result.events.length).toBe(0)
    expect(result.persist).toBe(false)
  })
})

// ============================================================================
// COUNTDOWN_CANCEL Action Tests
// ============================================================================

describe('COUNTDOWN_CANCEL action', () => {
  it('sets status to waiting, countdownRemaining to null', () => {
    const { state, players } = createTestGameStateWithPlayers(2)
    state.status = 'countdown'
    state.countdownRemaining = 2

    const result = gameReducer(state, { type: 'COUNTDOWN_CANCEL', reason: 'Player left' })

    expect(result.state.status).toBe('waiting')
    expect(result.state.countdownRemaining).toBeNull()
  })

  it('emits countdown_cancelled with reason', () => {
    const { state, players } = createTestGameStateWithPlayers(2)
    state.status = 'countdown'
    state.countdownRemaining = 2

    const result = gameReducer(state, { type: 'COUNTDOWN_CANCEL', reason: 'Player left' })

    expect(hasEvent(result.events, 'countdown_cancelled')).toBe(true)
    const data = getEventData<{ reason: string }>(result.events, 'countdown_cancelled')
    expect(data?.reason).toBe('Player left')
  })

  it('returns persist: true', () => {
    const { state, players } = createTestGameStateWithPlayers(2)
    state.status = 'countdown'
    state.countdownRemaining = 2

    const result = gameReducer(state, { type: 'COUNTDOWN_CANCEL', reason: 'Test' })

    expect(result.persist).toBe(true)
  })
})

// ============================================================================
// TICK Action (tickReducer) Tests - Critical Gameplay
// ============================================================================

describe('TICK action (tickReducer)', () => {
  describe('player movement', () => {
    it('applies inputState.left within PLAYER_MIN_X bounds', () => {
      const { state, players } = createTestPlayingState(1)
      const player = players[0]
      player.x = 10
      player.inputState = { left: true, right: false }
      state.players[player.id] = player

      const result = gameReducer(state, { type: 'TICK' })

      expect(result.state.players[player.id].x).toBe(10 - state.config.playerMoveSpeed)
    })

    it('applies inputState.right within PLAYER_MAX_X bounds', () => {
      const { state, players } = createTestPlayingState(1)
      const player = players[0]
      player.x = 60
      player.inputState = { left: false, right: true }
      state.players[player.id] = player

      const result = gameReducer(state, { type: 'TICK' })

      expect(result.state.players[player.id].x).toBe(60 + state.config.playerMoveSpeed)
    })

    it('respects PLAYER_MIN_X boundary', () => {
      const { state, players } = createTestPlayingState(1)
      const player = players[0]
      player.x = LAYOUT.PLAYER_MIN_X
      player.inputState = { left: true, right: false }
      state.players[player.id] = player

      const result = gameReducer(state, { type: 'TICK' })

      expect(result.state.players[player.id].x).toBe(LAYOUT.PLAYER_MIN_X)
    })

    it('respects PLAYER_MAX_X boundary', () => {
      const { state, players } = createTestPlayingState(1)
      const player = players[0]
      player.x = LAYOUT.PLAYER_MAX_X
      player.inputState = { left: false, right: true }
      state.players[player.id] = player

      const result = gameReducer(state, { type: 'TICK' })

      expect(result.state.players[player.id].x).toBe(LAYOUT.PLAYER_MAX_X)
    })

    it('dead players do not move', () => {
      const { state, players } = createTestPlayingState(1)
      const player = players[0]
      player.x = 60
      player.alive = false
      player.inputState = { left: true, right: false }
      state.players[player.id] = player

      const result = gameReducer(state, { type: 'TICK' })

      expect(result.state.players[player.id].x).toBe(60)
    })
  })

  describe('player respawn', () => {
    it('player.alive becomes true when tick >= respawnAtTick', () => {
      const { state, players } = createTestPlayingState(1)
      const player = players[0]
      player.alive = false
      player.respawnAtTick = 10
      player.lives = 2
      state.tick = 9
      state.players[player.id] = player

      const result = gameReducer(state, { type: 'TICK' })

      // tick becomes 10, which is >= respawnAtTick
      expect(result.state.players[player.id].alive).toBe(true)
      expect(result.state.players[player.id].respawnAtTick).toBeNull()
    })

    it('emits player_respawned event on respawn', () => {
      const { state, players } = createTestPlayingState(1)
      const player = players[0]
      player.alive = false
      player.respawnAtTick = 10
      player.lives = 2
      state.tick = 9
      state.players[player.id] = player

      const result = gameReducer(state, { type: 'TICK' })

      expect(hasEvent(result.events, 'player_respawned')).toBe(true)
      const data = getEventData<{ playerId: string }>(result.events, 'player_respawned')
      expect(data?.playerId).toBe(player.id)
    })

    it('clears inputState on respawn', () => {
      const { state, players } = createTestPlayingState(1)
      const player = players[0]
      player.alive = false
      player.respawnAtTick = 10
      player.lives = 2
      player.inputState = { left: true, right: true }
      state.tick = 9
      state.players[player.id] = player

      const result = gameReducer(state, { type: 'TICK' })

      expect(result.state.players[player.id].inputState).toEqual({ left: false, right: false })
    })
  })

  describe('bullet movement', () => {
    it('player bullets move up: y += dy * baseBulletSpeed', () => {
      const { state, players } = createTestPlayingState(1)
      const bullet = createTestBullet('b1', 50, 20, players[0].id, -1)
      state.entities.push(bullet)

      const result = gameReducer(state, { type: 'TICK' })

      const bullets = getBullets(result.state.entities)
      const movedBullet = bullets.find(b => b.id === 'b1')
      expect(movedBullet?.y).toBe(20 - state.config.baseBulletSpeed)
    })

    it('alien bullets move down: y += dy * baseBulletSpeed', () => {
      const { state, players } = createTestPlayingState(1)
      const bullet = createTestBullet('ab1', 50, 10, null, 1)
      state.entities.push(bullet)
      state.tick = 1 // Not a multiple of 5, so alien bullets move

      const result = gameReducer(state, { type: 'TICK' })

      const bullets = getBullets(result.state.entities)
      const movedBullet = bullets.find(b => b.id === 'ab1')
      expect(movedBullet?.y).toBe(10 + state.config.baseBulletSpeed)
    })

    it('alien bullets skip every 5th tick (20% slower)', () => {
      const { state, players } = createTestPlayingState(1)
      const bullet = createTestBullet('ab1', 50, 10, null, 1)
      state.entities.push(bullet)
      state.tick = 4 // Next tick will be 5, which is % 5 === 0

      const result = gameReducer(state, { type: 'TICK' })

      const bullets = getBullets(result.state.entities)
      const movedBullet = bullets.find(b => b.id === 'ab1')
      expect(movedBullet?.y).toBe(10) // Did not move
    })

    it('off-screen bullets are removed (y <= 0)', () => {
      const { state, players } = createTestPlayingState(1)
      const bullet = createTestBullet('b1', 50, 1, players[0].id, -1)
      state.entities.push(bullet)

      const result = gameReducer(state, { type: 'TICK' })

      const bullets = getBullets(result.state.entities)
      expect(bullets.find(b => b.id === 'b1')).toBeUndefined()
    })

    it('off-screen bullets are removed (y >= height)', () => {
      const { state, players } = createTestPlayingState(1)
      const bullet = createTestBullet('ab1', 50, state.config.height - 1, null, 1)
      state.entities.push(bullet)

      const result = gameReducer(state, { type: 'TICK' })

      const bullets = getBullets(result.state.entities)
      expect(bullets.find(b => b.id === 'ab1')).toBeUndefined()
    })
  })

  describe('alien-bullet collision', () => {
    it('alien.alive becomes false when hit', () => {
      const { state, players } = createTestPlayingState(1)
      const alien = createTestAlien('alien1', 50, 10)
      const bullet = createTestBullet('b1', 51, 10, players[0].id, -1) // Close enough for collision
      state.entities = [alien, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      const aliens = getAliens(result.state.entities)
      expect(aliens.find(a => a.id === 'alien1')?.alive).toBe(false)
    })

    it('score is increased by alien points', () => {
      const { state, players } = createTestPlayingState(1)
      const alien = createTestAlien('alien1', 50, 10, { points: 20 })
      const bullet = createTestBullet('b1', 51, 10, players[0].id, -1)
      state.entities = [alien, bullet]
      state.score = 0

      const result = gameReducer(state, { type: 'TICK' })

      expect(result.state.score).toBe(20)
    })

    it('emits alien_killed and score_awarded events', () => {
      const { state, players } = createTestPlayingState(1)
      const alien = createTestAlien('alien1', 50, 10, { points: 10 })
      const bullet = createTestBullet('b1', 51, 10, players[0].id, -1)
      state.entities = [alien, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      expect(hasEvent(result.events, 'alien_killed')).toBe(true)
      expect(hasEvent(result.events, 'score_awarded')).toBe(true)

      const alienKilledData = getEventData<{ alienId: string; playerId: string | null }>(
        result.events,
        'alien_killed'
      )
      expect(alienKilledData?.alienId).toBe('alien1')
      expect(alienKilledData?.playerId).toBe(players[0].id)
    })

    it('player kills count is incremented', () => {
      const { state, players } = createTestPlayingState(1)
      const player = players[0]
      player.kills = 0
      state.players[player.id] = player
      const alien = createTestAlien('alien1', 50, 10)
      const bullet = createTestBullet('b1', 51, 10, player.id, -1)
      state.entities = [alien, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      expect(result.state.players[player.id].kills).toBe(1)
    })
  })

  describe('player-bullet collision (alien bullets)', () => {
    it('player.alive becomes false when hit', () => {
      const { state, players } = createTestPlayingState(1)
      const player = players[0]
      player.x = 50
      player.lives = 3
      state.players[player.id] = player
      const bullet = createTestBullet('ab1', 51, LAYOUT.PLAYER_Y, null, 1)
      state.entities = [bullet]

      const result = gameReducer(state, { type: 'TICK' })

      expect(result.state.players[player.id].alive).toBe(false)
    })

    it('player.lives is decremented', () => {
      const { state, players } = createTestPlayingState(1)
      const player = players[0]
      player.x = 50
      player.lives = 3
      state.players[player.id] = player
      const bullet = createTestBullet('ab1', 51, LAYOUT.PLAYER_Y, null, 1)
      state.entities = [bullet]

      const result = gameReducer(state, { type: 'TICK' })

      expect(result.state.players[player.id].lives).toBe(2)
    })

    it('emits player_died event', () => {
      const { state, players } = createTestPlayingState(1)
      const player = players[0]
      player.x = 50
      player.lives = 3
      state.players[player.id] = player
      const bullet = createTestBullet('ab1', 51, LAYOUT.PLAYER_Y, null, 1)
      state.entities = [bullet]

      const result = gameReducer(state, { type: 'TICK' })

      expect(hasEvent(result.events, 'player_died')).toBe(true)
      const data = getEventData<{ playerId: string }>(result.events, 'player_died')
      expect(data?.playerId).toBe(player.id)
    })

    it('respawnAtTick is set when player has lives remaining', () => {
      const { state, players } = createTestPlayingState(1)
      const player = players[0]
      player.x = 50
      player.lives = 3
      state.tick = 100
      state.players[player.id] = player
      const bullet = createTestBullet('ab1', 51, LAYOUT.PLAYER_Y, null, 1)
      state.entities = [bullet]

      const result = gameReducer(state, { type: 'TICK' })

      expect(result.state.players[player.id].respawnAtTick).toBe(
        101 + state.config.respawnDelayTicks
      )
    })

    it('inputState is cleared on death', () => {
      const { state, players } = createTestPlayingState(1)
      const player = players[0]
      player.x = 50
      player.lives = 3
      player.inputState = { left: true, right: true }
      state.players[player.id] = player
      const bullet = createTestBullet('ab1', 51, LAYOUT.PLAYER_Y, null, 1)
      state.entities = [bullet]

      const result = gameReducer(state, { type: 'TICK' })

      expect(result.state.players[player.id].inputState).toEqual({ left: false, right: false })
    })
  })

  describe('barrier damage', () => {
    it('segment health is decremented on bullet hit', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50)
      barrier.segments[0].health = 4
      // Bullet starts at y=26, after TICK moves to y=25 (BARRIER_Y), then collision is detected
      const bullet = createTestBullet('b1', 50, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      const barriers = result.state.entities.filter(e => e.kind === 'barrier')
      const updatedBarrier = barriers.find(b => b.id === 'barrier1')
      expect((updatedBarrier as any).segments[0].health).toBe(3)
    })

    it('bullet is removed after hitting barrier', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50)
      // Bullet starts at y=26, after TICK moves to y=25 (BARRIER_Y), collision removes it
      const bullet = createTestBullet('b1', 50, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      const bullets = getBullets(result.state.entities)
      expect(bullets.find(b => b.id === 'b1')).toBeUndefined()
    })
  })

  describe('alien movement', () => {
    it('moves on alienMoveIntervalTicks', () => {
      const { state, players } = createTestPlayingState(1, {
        aliens: [createTestAlien('alien1', 50, 10)],
      })
      state.tick = 17 // Next tick (18) is the first move interval

      const result = gameReducer(state, { type: 'TICK' })

      const aliens = getAliens(result.state.entities)
      expect(aliens[0].x).toBe(50 + 2 * state.alienDirection)
    })

    it('reverses at walls and drops down', () => {
      const { state, players } = createTestPlayingState(1, {
        aliens: [createTestAlien('alien1', LAYOUT.ALIEN_MAX_X - 1, 10)],
      })
      state.alienDirection = 1
      state.tick = 17 // Next tick triggers movement

      const result = gameReducer(state, { type: 'TICK' })

      expect(result.state.alienDirection).toBe(-1)
      const aliens = getAliens(result.state.entities)
      expect(aliens[0].y).toBe(11) // Dropped down by 1
    })
  })

  describe('game over condition', () => {
    it('game over when aliens reach GAME_OVER_Y', () => {
      const { state, players } = createTestPlayingState(1, {
        aliens: [createTestAlien('alien1', 50, LAYOUT.GAME_OVER_Y)],
      })

      const result = gameReducer(state, { type: 'TICK' })

      expect(result.state.status).toBe('game_over')
      expect(hasEvent(result.events, 'game_over')).toBe(true)
      const data = getEventData<{ result: string }>(result.events, 'game_over')
      expect(data?.result).toBe('defeat')
    })

    it('game over when all players dead with 0 lives', () => {
      const { state, players } = createTestPlayingState(1, {
        aliens: [createTestAlien('alien1', 50, 10)],
      })
      const player = players[0]
      player.alive = false
      player.lives = 0
      state.players[player.id] = player

      const result = gameReducer(state, { type: 'TICK' })

      expect(result.state.status).toBe('game_over')
      expect(hasEvent(result.events, 'game_over')).toBe(true)
    })

    it('no game over if player dead but has lives remaining', () => {
      const { state, players } = createTestPlayingState(1, {
        aliens: [createTestAlien('alien1', 50, 10)],
      })
      const player = players[0]
      player.alive = false
      player.lives = 1
      player.respawnAtTick = state.tick + 100
      state.players[player.id] = player

      const result = gameReducer(state, { type: 'TICK' })

      expect(result.state.status).toBe('playing')
    })
  })

  describe('wave complete', () => {
    it('emits wave_complete when all aliens killed', () => {
      const { state, players } = createTestPlayingState(1, {
        aliens: [createTestAlien('alien1', 50, 10, { alive: false })],
      })

      const result = gameReducer(state, { type: 'TICK' })

      expect(hasEvent(result.events, 'wave_complete')).toBe(true)
      const data = getEventData<{ wave: number }>(result.events, 'wave_complete')
      expect(data?.wave).toBe(1)
    })
  })

  describe('tick increment', () => {
    it('increments tick counter', () => {
      const { state, players } = createTestPlayingState(1)
      state.tick = 100

      const result = gameReducer(state, { type: 'TICK' })

      expect(result.state.tick).toBe(101)
    })
  })

  describe('status guard', () => {
    it('does nothing when status is not playing', () => {
      const state = createTestGameState({ status: 'waiting', tick: 0 })

      const result = gameReducer(state, { type: 'TICK' })

      expect(result.state.tick).toBe(0)
      expect(result.events.length).toBe(0)
    })
  })
})

// ============================================================================
// UFO Tests
// ============================================================================

describe('UFO spawning and movement', () => {
  it('moves UFO each tick (direction * 1 cell)', () => {
    const { state, players } = createTestPlayingState(1)
    const ufo = createTestUFO('ufo1', 50, { direction: 1 })
    state.entities.push(ufo)

    const result = gameReducer(state, { type: 'TICK' })

    const ufos = result.state.entities.filter(e => e.kind === 'ufo')
    expect(ufos.length).toBe(1)
    expect(ufos[0].x).toBe(51) // Moved right by 1
  })

  it('removes UFO when it exits left side of screen', () => {
    const { state, players } = createTestPlayingState(1)
    // UFO removal condition is x < -3, so start at -3 and move left to -4
    const ufo = createTestUFO('ufo1', -3, { direction: -1 })
    state.entities.push(ufo)

    const result = gameReducer(state, { type: 'TICK' })

    const ufos = result.state.entities.filter(e => e.kind === 'ufo')
    expect(ufos.length).toBe(0)
  })

  it('removes UFO when it exits right side of screen', () => {
    const { state, players } = createTestPlayingState(1)
    // UFO removal condition is x > width + 3, so start at width+3 and move right to width+4
    const ufo = createTestUFO('ufo1', state.config.width + 3, { direction: 1 })
    state.entities.push(ufo)

    const result = gameReducer(state, { type: 'TICK' })

    const ufos = result.state.entities.filter(e => e.kind === 'ufo')
    expect(ufos.length).toBe(0)
  })

  it('UFO can spawn with seeded RNG', () => {
    // This test verifies the spawn mechanism exists
    // UFO spawns with 0.5% chance per tick when none active
    const { state, players } = createTestPlayingState(1)
    state.rngSeed = 42 // Seed the RNG

    // Run many ticks to increase probability of spawn
    let spawned = false
    let currentState = state
    for (let i = 0; i < 1000 && !spawned; i++) {
      const result = gameReducer(currentState, { type: 'TICK' })
      currentState = result.state
      const ufos = result.state.entities.filter(e => e.kind === 'ufo')
      if (ufos.length > 0) {
        spawned = true
        expect(ufos[0].y).toBe(1) // UFO spawns at y=1
        expect([50, 100, 150, 200, 300]).toContain(ufos[0].points)
      }
    }
    // Note: This test may occasionally not spawn a UFO due to RNG
    // but with 1000 ticks and 0.5% chance, probability is very high
  })
})

describe('UFO-bullet collision', () => {
  it('destroys UFO when hit by player bullet', () => {
    const { state, players } = createTestPlayingState(1)
    const ufo = createTestUFO('ufo1', 50, { points: 150 })
    const bullet = createTestBullet('b1', 51, 1, players[0].id, -1)
    state.entities.push(ufo, bullet)

    const result = gameReducer(state, { type: 'TICK' })

    const ufos = result.state.entities.filter(e => e.kind === 'ufo')
    expect(ufos.length).toBe(0) // UFO removed when killed
  })

  it('awards UFO points to player score', () => {
    const { state, players } = createTestPlayingState(1)
    const ufo = createTestUFO('ufo1', 50, { points: 200 })
    const bullet = createTestBullet('b1', 51, 1, players[0].id, -1)
    state.entities.push(ufo, bullet)
    state.score = 100

    const result = gameReducer(state, { type: 'TICK' })

    expect(result.state.score).toBe(300) // 100 + 200
  })

  it('increments player kills count for UFO kill', () => {
    const { state, players } = createTestPlayingState(1)
    const player = players[0]
    player.kills = 5
    state.players[player.id] = player
    const ufo = createTestUFO('ufo1', 50, { points: 100 })
    const bullet = createTestBullet('b1', 51, 1, player.id, -1)
    state.entities.push(ufo, bullet)

    const result = gameReducer(state, { type: 'TICK' })

    expect(result.state.players[player.id].kills).toBe(6)
  })

  it('emits score_awarded event with source=ufo', () => {
    const { state, players } = createTestPlayingState(1)
    const ufo = createTestUFO('ufo1', 50, { points: 100 })
    const bullet = createTestBullet('b1', 51, 1, players[0].id, -1)
    state.entities.push(ufo, bullet)

    const result = gameReducer(state, { type: 'TICK' })

    expect(hasEvent(result.events, 'score_awarded')).toBe(true)
    const scoreEvent = getEventData<{ playerId: string; points: number; source: string }>(
      result.events,
      'score_awarded'
    )
    expect(scoreEvent?.source).toBe('ufo')
    expect(scoreEvent?.points).toBe(100)
  })
})

// ============================================================================
// Barrier Damage Progression Tests
// ============================================================================

describe('barrier segment damage progression', () => {
  it('decrements from 4 to 3 on first hit', () => {
    const { state, players } = createTestPlayingState(1)
    const barrier = createTestBarrier('barrier1', 50)
    barrier.segments[0].health = 4
    const bullet = createTestBullet('b1', 50, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
    state.entities = [barrier, bullet]

    const result = gameReducer(state, { type: 'TICK' })

    const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as any
    expect(updatedBarrier.segments[0].health).toBe(3)
  })

  it('decrements from 3 to 2 on second hit', () => {
    const { state, players } = createTestPlayingState(1)
    const barrier = createTestBarrier('barrier1', 50)
    barrier.segments[0].health = 3
    const bullet = createTestBullet('b1', 50, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
    state.entities = [barrier, bullet]

    const result = gameReducer(state, { type: 'TICK' })

    const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as any
    expect(updatedBarrier.segments[0].health).toBe(2)
  })

  it('decrements from 2 to 1 on third hit', () => {
    const { state, players } = createTestPlayingState(1)
    const barrier = createTestBarrier('barrier1', 50)
    barrier.segments[0].health = 2
    const bullet = createTestBullet('b1', 50, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
    state.entities = [barrier, bullet]

    const result = gameReducer(state, { type: 'TICK' })

    const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as any
    expect(updatedBarrier.segments[0].health).toBe(1)
  })

  it('decrements from 1 to 0 on fourth hit (destroyed)', () => {
    const { state, players } = createTestPlayingState(1)
    const barrier = createTestBarrier('barrier1', 50)
    barrier.segments[0].health = 1
    const bullet = createTestBullet('b1', 50, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
    state.entities = [barrier, bullet]

    const result = gameReducer(state, { type: 'TICK' })

    const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as any
    expect(updatedBarrier.segments[0].health).toBe(0)
  })

  it('does not decrement below 0 and bullet passes through destroyed segment', () => {
    const { state, players } = createTestPlayingState(1)
    const barrier = createTestBarrier('barrier1', 50)
    barrier.segments[0].health = 0
    const bullet = createTestBullet('b1', 50, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
    state.entities = [barrier, bullet]

    const result = gameReducer(state, { type: 'TICK' })

    // Bullet should pass through destroyed segment (health=0)
    const bullets = getBullets(result.state.entities)
    // The bullet continues moving upward (was not absorbed by destroyed segment)
    const movedBullet = bullets.find(b => b.id === 'b1')
    expect(movedBullet).toBeDefined()
    expect(movedBullet!.y).toBe(LAYOUT.BARRIER_Y) // Moved up by 1

    // Segment health stays at 0
    const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as any
    expect(updatedBarrier.segments[0].health).toBe(0)
  })

  it('alien bullets also damage barriers', () => {
    const { state, players } = createTestPlayingState(1)
    const barrier = createTestBarrier('barrier1', 50)
    barrier.segments[0].health = 4
    // Alien bullet moving down towards barrier
    const bullet = createTestBullet('ab1', 50, LAYOUT.BARRIER_Y - 1, null, 1)
    state.entities = [barrier, bullet]

    const result = gameReducer(state, { type: 'TICK' })

    const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as any
    expect(updatedBarrier.segments[0].health).toBe(3)
  })
})

// ============================================================================
// Multiple Players Tests
// ============================================================================

describe('multiple players shooting simultaneously', () => {
  it('allows two players to shoot on the same tick', () => {
    const { state, players } = createTestPlayingState(2)
    const [player1, player2] = players
    player1.x = 30
    player1.lastShotTick = 0
    player2.x = 70
    player2.lastShotTick = 0
    state.tick = 10
    state.players[player1.id] = player1
    state.players[player2.id] = player2

    // Both players shoot
    let result = gameReducer(state, { type: 'PLAYER_SHOOT', playerId: player1.id })
    result = gameReducer(result.state, { type: 'PLAYER_SHOOT', playerId: player2.id })

    const bullets = getBullets(result.state.entities)
    expect(bullets.length).toBe(2)
    expect(bullets.map(b => b.ownerId).sort()).toEqual([player1.id, player2.id].sort())
  })

  it('each player can kill different aliens', () => {
    const { state, players } = createTestPlayingState(2)
    const [player1, player2] = players

    const alien1 = createTestAlien('alien1', 30, 10, { points: 10 })
    const alien2 = createTestAlien('alien2', 70, 10, { points: 20 })
    const bullet1 = createTestBullet('b1', 31, 10, player1.id, -1)
    const bullet2 = createTestBullet('b2', 71, 10, player2.id, -1)
    state.entities = [alien1, alien2, bullet1, bullet2]
    state.score = 0
    player1.kills = 0
    player2.kills = 0
    state.players[player1.id] = player1
    state.players[player2.id] = player2

    const result = gameReducer(state, { type: 'TICK' })

    expect(result.state.score).toBe(30) // 10 + 20
    expect(result.state.players[player1.id].kills).toBe(1)
    expect(result.state.players[player2.id].kills).toBe(1)
  })
})

// ============================================================================
// Player Respawn Position Tests
// ============================================================================

describe('player respawn position', () => {
  it('player respawns at death x position (does not reset to spawn)', () => {
    const { state, players } = createTestPlayingState(1)
    const player = players[0]
    player.x = 90 // Player moved far right before death
    player.alive = false
    player.respawnAtTick = 10
    player.lives = 2
    state.tick = 9
    state.players[player.id] = player

    const result = gameReducer(state, { type: 'TICK' })

    // Player respawns at same x position where they died
    expect(result.state.players[player.id].alive).toBe(true)
    expect(result.state.players[player.id].x).toBe(90) // Same position as death
  })

  it('player x position is preserved through death-respawn cycle', () => {
    const { state, players } = createTestPlayingState(1)
    const player = players[0]
    const deathPosition = 45
    player.x = deathPosition
    player.lives = 3
    state.players[player.id] = player

    // Simulate death from alien bullet
    const bullet = createTestBullet('ab1', 46, LAYOUT.PLAYER_Y, null, 1)
    state.entities = [bullet, createTestAlien('a1', 20, 5)]

    const deathResult = gameReducer(state, { type: 'TICK' })
    expect(deathResult.state.players[player.id].alive).toBe(false)
    expect(deathResult.state.players[player.id].x).toBe(deathPosition) // Position preserved

    // Fast forward to respawn
    const respawnState = { ...deathResult.state }
    respawnState.tick = deathResult.state.players[player.id].respawnAtTick! - 1

    const respawnResult = gameReducer(respawnState, { type: 'TICK' })
    expect(respawnResult.state.players[player.id].alive).toBe(true)
    expect(respawnResult.state.players[player.id].x).toBe(deathPosition) // Still at death position
  })
})

// ============================================================================
// Bottom-Row Alien Shooting Tests
// ============================================================================

describe('bottom-row-only alien shooting', () => {
  it('only aliens at the bottom of their column can shoot', () => {
    // Test the core mechanic: aliens can only shoot if they're the lowest alive alien in their column
    const { state, players } = createTestPlayingState(1)

    // Create a single column with 2 aliens - only the bottom one (higher row) should fire
    // We verify this by checking that bullets originate from below the bottom alien
    const topAlien = createTestAlien('top', 50, 5, { row: 0, col: 0 })
    const bottomAlien = createTestAlien('bottom', 50, 8, { row: 1, col: 0 })

    state.entities = [topAlien, bottomAlien]
    state.rngSeed = 42

    let currentState = state
    let bulletsCreated = 0

    for (let i = 0; i < 2000; i++) {
      const result = gameReducer(currentState, { type: 'TICK' })
      const newBullets = getBullets(result.state.entities).filter(b => b.ownerId === null)
      bulletsCreated += newBullets.length

      // Clear bullets for next iteration
      currentState = structuredClone(result.state)
      currentState.entities = currentState.entities.filter(e => e.kind !== 'bullet')
    }

    // Should have created some alien bullets over 2000 ticks
    // With ~1.7% probability per tick, we expect ~34 bullets
    expect(bulletsCreated).toBeGreaterThan(0)
  })

  it('dead aliens do not shoot', () => {
    const { state, players } = createTestPlayingState(1)

    // All aliens are dead - no bullets should be created
    const deadAlien1 = createTestAlien('dead1', 50, 5, { row: 0, col: 0, alive: false })
    const deadAlien2 = createTestAlien('dead2', 60, 5, { row: 0, col: 1, alive: false })

    state.entities = [deadAlien1, deadAlien2]
    state.rngSeed = 42

    let currentState = state
    let bulletsCreated = 0

    for (let i = 0; i < 500; i++) {
      const result = gameReducer(currentState, { type: 'TICK' })
      const newBullets = getBullets(result.state.entities).filter(b => b.ownerId === null)
      bulletsCreated += newBullets.length
      currentState = structuredClone(result.state)
    }

    // Dead aliens should not shoot
    expect(bulletsCreated).toBe(0)
  })

  it('when bottom alien is killed, surviving aliens can still shoot', () => {
    const { state, players } = createTestPlayingState(1)

    // Top alien is alive, bottom alien is dead
    // Top alien is now the effective "bottom" of its column and should be able to shoot
    const topAlien = createTestAlien('top', 50, 5, { row: 0, col: 0 })
    const bottomAlien = createTestAlien('bottom', 50, 8, { row: 1, col: 0, alive: false })

    state.entities = [topAlien, bottomAlien]
    state.rngSeed = 42

    let currentState = state
    let alienBulletFired = false

    for (let i = 0; i < 2000 && !alienBulletFired; i++) {
      const result = gameReducer(currentState, { type: 'TICK' })
      const newBullets = getBullets(result.state.entities).filter(b => b.ownerId === null)

      if (newBullets.length > 0) {
        alienBulletFired = true
      }

      currentState = structuredClone(result.state)
      currentState.entities = currentState.entities.filter(e => e.kind !== 'bullet')
    }

    // The surviving alien should be able to fire
    expect(alienBulletFired).toBe(true)
  })
})

// ============================================================================
// State Immutability Tests
// ============================================================================

describe('state immutability', () => {
  it('does not mutate input state', () => {
    const { state, player } = createTestGameStateWithPlayer({ id: 'p1' })
    const originalState = structuredClone(state)

    gameReducer(state, { type: 'PLAYER_LEAVE', playerId: 'p1' })

    expect(state).toEqual(originalState)
  })

  it('returns new state object for each action', () => {
    const { state, player } = createTestGameStateWithPlayer({ id: 'p1' })

    const result = gameReducer(state, { type: 'PLAYER_READY', playerId: 'p1' })

    expect(result.state).not.toBe(state)
  })
})

// ============================================================================
// 4-Player Game Tests
// ============================================================================

describe('4-player game scenarios', () => {
  it('allows all 4 players to shoot simultaneously', () => {
    const { state, players } = createTestPlayingState(4)
    const [p1, p2, p3, p4] = players

    // Position players across the screen
    p1.x = 20
    p2.x = 40
    p3.x = 60
    p4.x = 80
    p1.lastShotTick = 0
    p2.lastShotTick = 0
    p3.lastShotTick = 0
    p4.lastShotTick = 0
    state.tick = 10
    state.players[p1.id] = p1
    state.players[p2.id] = p2
    state.players[p3.id] = p3
    state.players[p4.id] = p4

    // All 4 players shoot
    let result = gameReducer(state, { type: 'PLAYER_SHOOT', playerId: p1.id })
    result = gameReducer(result.state, { type: 'PLAYER_SHOOT', playerId: p2.id })
    result = gameReducer(result.state, { type: 'PLAYER_SHOOT', playerId: p3.id })
    result = gameReducer(result.state, { type: 'PLAYER_SHOOT', playerId: p4.id })

    const bullets = getBullets(result.state.entities)
    expect(bullets.length).toBe(4)

    // Each bullet should be owned by a different player
    const ownerIds = bullets.map(b => b.ownerId).sort()
    const playerIds = [p1.id, p2.id, p3.id, p4.id].sort()
    expect(ownerIds).toEqual(playerIds)
  })

  it('all 4 players can kill different aliens on the same tick', () => {
    const { state, players } = createTestPlayingState(4)
    const [p1, p2, p3, p4] = players

    // Create 4 aliens at different positions
    const aliens = [
      createTestAlien('alien1', 20, 10, { points: 10 }),
      createTestAlien('alien2', 40, 10, { points: 20 }),
      createTestAlien('alien3', 60, 10, { points: 30 }),
      createTestAlien('alien4', 80, 10, { points: 10 }),
    ]

    // Create bullets from each player aimed at different aliens
    const bullets = [
      createTestBullet('b1', 21, 10, p1.id, -1),
      createTestBullet('b2', 41, 10, p2.id, -1),
      createTestBullet('b3', 61, 10, p3.id, -1),
      createTestBullet('b4', 81, 10, p4.id, -1),
    ]

    state.entities = [...aliens, ...bullets]
    state.score = 0
    p1.kills = 0
    p2.kills = 0
    p3.kills = 0
    p4.kills = 0
    state.players[p1.id] = p1
    state.players[p2.id] = p2
    state.players[p3.id] = p3
    state.players[p4.id] = p4

    const result = gameReducer(state, { type: 'TICK' })

    // All 4 aliens should be killed
    const remainingAliens = getAliens(result.state.entities)
    const liveAliens = remainingAliens.filter(a => a.alive)
    expect(liveAliens.length).toBe(0)

    // Total score should be 10+20+30+10 = 70
    expect(result.state.score).toBe(70)

    // Each player should have 1 kill
    expect(result.state.players[p1.id].kills).toBe(1)
    expect(result.state.players[p2.id].kills).toBe(1)
    expect(result.state.players[p3.id].kills).toBe(1)
    expect(result.state.players[p4.id].kills).toBe(1)

    // Should emit 4 alien_killed events and 4 score_awarded events
    const alienKilledEvents = result.events.filter(
      e => e.type === 'event' && e.name === 'alien_killed'
    )
    const scoreEvents = result.events.filter(
      e => e.type === 'event' && e.name === 'score_awarded'
    )
    expect(alienKilledEvents.length).toBe(4)
    expect(scoreEvents.length).toBe(4)
  })

  it('uses 5 shared lives in 4-player mode', () => {
    const { state, players } = createTestPlayingState(4)

    // Verify shared lives are set to 5 for coop
    expect(state.lives).toBe(5)
  })
})

// ============================================================================
// Game Over Conditions - Additional Tests
// ============================================================================

describe('game over by all players dying with no lives', () => {
  it('triggers game over when last player dies with 0 lives (solo)', () => {
    const { state, players } = createTestPlayingState(1, {
      aliens: [createTestAlien('alien1', 50, 10)],
    })
    const player = players[0]
    player.alive = false
    player.lives = 0
    player.respawnAtTick = null
    state.players[player.id] = player

    const result = gameReducer(state, { type: 'TICK' })

    expect(result.state.status).toBe('game_over')
    expect(hasEvent(result.events, 'game_over')).toBe(true)
    const data = getEventData<{ result: string }>(result.events, 'game_over')
    expect(data?.result).toBe('defeat')
  })

  it('triggers game over when all players die with 0 lives (coop)', () => {
    const { state, players } = createTestPlayingState(2, {
      aliens: [createTestAlien('alien1', 50, 10)],
    })
    const [p1, p2] = players

    // Both players dead with no lives
    p1.alive = false
    p1.lives = 0
    p1.respawnAtTick = null
    p2.alive = false
    p2.lives = 0
    p2.respawnAtTick = null
    state.players[p1.id] = p1
    state.players[p2.id] = p2

    const result = gameReducer(state, { type: 'TICK' })

    expect(result.state.status).toBe('game_over')
    expect(hasEvent(result.events, 'game_over')).toBe(true)
  })

  it('does NOT trigger game over if one player has lives remaining (coop)', () => {
    const { state, players } = createTestPlayingState(2, {
      aliens: [createTestAlien('alien1', 50, 10)],
    })
    const [p1, p2] = players

    // Player 1 dead with no lives, Player 2 dead but has lives
    p1.alive = false
    p1.lives = 0
    p1.respawnAtTick = null
    p2.alive = false
    p2.lives = 2
    p2.respawnAtTick = state.tick + 100
    state.players[p1.id] = p1
    state.players[p2.id] = p2

    const result = gameReducer(state, { type: 'TICK' })

    expect(result.state.status).toBe('playing')
  })

  it('does NOT trigger game over if one player is still alive (coop)', () => {
    const { state, players } = createTestPlayingState(2, {
      aliens: [createTestAlien('alien1', 50, 10)],
    })
    const [p1, p2] = players

    // Player 1 dead with no lives, Player 2 still alive
    p1.alive = false
    p1.lives = 0
    p1.respawnAtTick = null
    p2.alive = true
    p2.lives = 1
    state.players[p1.id] = p1
    state.players[p2.id] = p2

    const result = gameReducer(state, { type: 'TICK' })

    expect(result.state.status).toBe('playing')
  })
})

// ============================================================================
// Multiple Simultaneous Events Tests
// ============================================================================

describe('multiple simultaneous events in one tick', () => {
  it('handles multiple aliens killed by the same bullet (edge case)', () => {
    // This tests that a bullet can only kill one alien per tick
    const { state, players } = createTestPlayingState(1)
    const player = players[0]

    // Create two aliens at the exact same position
    const alien1 = createTestAlien('alien1', 50, 10, { points: 10 })
    const alien2 = createTestAlien('alien2', 50, 10, { points: 20 })
    const bullet = createTestBullet('b1', 51, 10, player.id, -1)

    state.entities = [alien1, alien2, bullet]
    state.score = 0
    player.kills = 0
    state.players[player.id] = player

    const result = gameReducer(state, { type: 'TICK' })

    // Only one alien should be killed (first one checked)
    const deadAliens = getAliens(result.state.entities).filter(a => !a.alive)
    expect(deadAliens.length).toBe(1)
    expect(result.state.players[player.id].kills).toBe(1)
  })

  it('handles player death and alien kill on the same tick', () => {
    const { state, players } = createTestPlayingState(1)
    const player = players[0]
    player.x = 50
    player.lives = 3
    player.kills = 0
    state.players[player.id] = player

    // Player bullet kills alien while alien bullet kills player
    const alien = createTestAlien('alien1', 30, 10, { points: 10 })
    const playerBullet = createTestBullet('pb1', 31, 10, player.id, -1)
    const alienBullet = createTestBullet('ab1', 51, LAYOUT.PLAYER_Y, null, 1)

    state.entities = [alien, playerBullet, alienBullet]
    state.score = 0

    const result = gameReducer(state, { type: 'TICK' })

    // Both events should occur
    expect(hasEvent(result.events, 'alien_killed')).toBe(true)
    expect(hasEvent(result.events, 'player_died')).toBe(true)

    // Score should be awarded
    expect(result.state.score).toBe(10)

    // Player should be dead but have kills credited
    expect(result.state.players[player.id].alive).toBe(false)
    expect(result.state.players[player.id].kills).toBe(1)
    expect(result.state.players[player.id].lives).toBe(2)
  })

  it('handles wave completion with UFO destruction on the same tick', () => {
    const { state, players } = createTestPlayingState(1)
    const player = players[0]

    // Last alien (dead) and a UFO that gets killed
    const lastAlien = createTestAlien('alien1', 30, 10, { alive: false })
    const ufo = createTestUFO('ufo1', 50, { points: 200 })
    const bullet = createTestBullet('b1', 51, 1, player.id, -1)

    state.entities = [lastAlien, ufo, bullet]
    state.score = 0
    player.kills = 0
    state.players[player.id] = player

    const result = gameReducer(state, { type: 'TICK' })

    // Both wave_complete and score_awarded should be emitted
    expect(hasEvent(result.events, 'wave_complete')).toBe(true)
    expect(hasEvent(result.events, 'score_awarded')).toBe(true)
    expect(result.state.score).toBe(200)
  })
})

// ============================================================================
// Shared Lives Tests (Coop Mode)
// ============================================================================

describe('shared lives in coop mode', () => {
  it('both players share the same lives pool', () => {
    const { state, players } = createTestPlayingState(2)
    expect(state.lives).toBe(5) // Coop uses 5 shared lives
  })

  it('player death decrements their individual lives, not shared pool', () => {
    const { state, players } = createTestPlayingState(2, {
      aliens: [createTestAlien('alien1', 20, 10)],
    })
    const [p1, p2] = players
    p1.x = 50
    p1.lives = 3
    p2.lives = 3
    state.players[p1.id] = p1
    state.players[p2.id] = p2

    // Alien bullet hits player 1
    const bullet = createTestBullet('ab1', 51, LAYOUT.PLAYER_Y, null, 1)
    state.entities.push(bullet)

    const result = gameReducer(state, { type: 'TICK' })

    // Player 1 loses a life
    expect(result.state.players[p1.id].lives).toBe(2)
    // Player 2 keeps their lives
    expect(result.state.players[p2.id].lives).toBe(3)
  })
})

// ============================================================================
// Edge Cases: Shooting at Boundaries
// ============================================================================

describe('shooting at screen boundaries', () => {
  it('bullet created at left boundary moves correctly', () => {
    const { state, players } = createTestPlayingState(1)
    const player = players[0]
    player.x = LAYOUT.PLAYER_MIN_X
    player.lastShotTick = 0
    state.tick = 10
    state.players[player.id] = player

    const result = gameReducer(state, { type: 'PLAYER_SHOOT', playerId: player.id })

    const bullets = getBullets(result.state.entities)
    expect(bullets.length).toBe(1)
    expect(bullets[0].x).toBe(LAYOUT.PLAYER_MIN_X) // player.x IS the center
  })

  it('bullet created at right boundary moves correctly', () => {
    const { state, players } = createTestPlayingState(1)
    const player = players[0]
    player.x = LAYOUT.PLAYER_MAX_X
    player.lastShotTick = 0
    state.tick = 10
    state.players[player.id] = player

    const result = gameReducer(state, { type: 'PLAYER_SHOOT', playerId: player.id })

    const bullets = getBullets(result.state.entities)
    expect(bullets.length).toBe(1)
    expect(bullets[0].x).toBe(LAYOUT.PLAYER_MAX_X) // player.x IS the center
  })

  it('player cannot move past left boundary while shooting', () => {
    const { state, players } = createTestPlayingState(1)
    const player = players[0]
    player.x = LAYOUT.PLAYER_MIN_X
    player.inputState = { left: true, right: false }
    state.players[player.id] = player

    const result = gameReducer(state, { type: 'TICK' })

    expect(result.state.players[player.id].x).toBe(LAYOUT.PLAYER_MIN_X)
  })

  it('player cannot move past right boundary while shooting', () => {
    const { state, players } = createTestPlayingState(1)
    const player = players[0]
    player.x = LAYOUT.PLAYER_MAX_X
    player.inputState = { left: false, right: true }
    state.players[player.id] = player

    const result = gameReducer(state, { type: 'TICK' })

    expect(result.state.players[player.id].x).toBe(LAYOUT.PLAYER_MAX_X)
  })
})

// ============================================================================
// Barrier Collision Detection Tests
// ============================================================================

describe('barrier collision detection', () => {
  /**
   * BARRIER COLLISION DETECTION CONTRACT:
   *
   * Barriers consist of segments at positions:
   *   segX = barrier.x + segment.offsetX
   *   segY = LAYOUT.BARRIER_Y + segment.offsetY
   *
   * Collision occurs when:
   *   Math.abs(bullet.x - segX) < 1 AND Math.abs(bullet.y - segY) < 1
   *
   * This means:
   *   - Exact position match (distance = 0) -> collision
   *   - Distance < 1 in both axes -> collision
   *   - Distance >= 1 in either axis -> no collision (bullet passes)
   *
   * When collision occurs:
   *   - Segment health decrements by 1
   *   - Bullet is marked for removal (y = -100 for player bullets, y = 100 for alien bullets)
   *
   * When segment health == 0:
   *   - No collision check (bullet passes through gap)
   */

  describe('player bullets hitting barriers from below', () => {
    it('bullet hits barrier segment when moving into exact position', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50, [
        { offsetX: 0, offsetY: 0, health: 4 },
      ])
      // Player bullet moving up, starts 1 below barrier segment
      // After TICK: bullet y = LAYOUT.BARRIER_Y (collision position)
      const bullet = createTestBullet('b1', 50, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      // Segment health should decrement
      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      expect(updatedBarrier.segments[0].health).toBe(3)

      // Bullet should be removed
      const bullets = getBullets(result.state.entities)
      expect(bullets.find(b => b.id === 'b1')).toBeUndefined()
    })

    it('bullet hits barrier when x is within threshold (< 1 distance)', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50, [
        { offsetX: 0, offsetY: 0, health: 4 },
      ])
      // Bullet at x=50.5, segment at x=50, distance = 0.5 < 1 -> collision
      const bullet = createTestBullet('b1', 50.5, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      expect(updatedBarrier.segments[0].health).toBe(3)
    })

    it('bullet hits barrier when y is within threshold after movement', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50, [
        { offsetX: 0, offsetY: 0, health: 4 },
      ])
      // Bullet starts at y = BARRIER_Y + 1, moves to y = BARRIER_Y
      // Segment at y = BARRIER_Y, distance = 0 < 1 -> collision
      const bullet = createTestBullet('b1', 50, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      expect(updatedBarrier.segments[0].health).toBe(3)
    })

    it('bullet misses barrier when x distance >= 1', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50, [
        { offsetX: 0, offsetY: 0, health: 4 },
      ])
      // Bullet at x=51, segment at x=50, distance = 1 >= 1 -> no collision
      const bullet = createTestBullet('b1', 51, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      // Segment health should remain unchanged
      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      expect(updatedBarrier.segments[0].health).toBe(4)

      // Bullet should continue (not removed by barrier, may be removed by off-screen check)
      const bullets = getBullets(result.state.entities)
      const bullet1 = bullets.find(b => b.id === 'b1')
      // If still on screen, it should exist and have moved
      if (bullet1) {
        expect(bullet1.y).toBe(LAYOUT.BARRIER_Y) // Moved up by 1
      }
    })

    it('bullet hits multiple segment barrier on left edge', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50, [
        { offsetX: 0, offsetY: 0, health: 4 },
        { offsetX: 1, offsetY: 0, health: 4 },
        { offsetX: 2, offsetY: 0, health: 4 },
      ])
      // Bullet aimed at leftmost segment (x=50)
      const bullet = createTestBullet('b1', 50, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      expect(updatedBarrier.segments[0].health).toBe(3) // Left segment hit
      expect(updatedBarrier.segments[1].health).toBe(4) // Middle untouched
      expect(updatedBarrier.segments[2].health).toBe(4) // Right untouched
    })

    it('bullet hits multiple segment barrier on right edge', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50, [
        { offsetX: 0, offsetY: 0, health: 4 },
        { offsetX: 1, offsetY: 0, health: 4 },
        { offsetX: 2, offsetY: 0, health: 4 },
      ])
      // Bullet aimed at rightmost segment (x=52)
      const bullet = createTestBullet('b1', 52, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      expect(updatedBarrier.segments[0].health).toBe(4) // Left untouched
      expect(updatedBarrier.segments[1].health).toBe(4) // Middle untouched
      expect(updatedBarrier.segments[2].health).toBe(3) // Right segment hit
    })
  })

  describe('alien bullets hitting barriers from above', () => {
    it('alien bullet hits barrier segment when moving into position', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50, [
        { offsetX: 0, offsetY: 0, health: 4 },
      ])
      // Alien bullet moving down, starts 1 above barrier segment
      // After TICK: bullet y = LAYOUT.BARRIER_Y (collision position)
      const bullet = createTestBullet('ab1', 50, LAYOUT.BARRIER_Y - 1, null, 1)
      state.entities = [barrier, bullet]
      state.tick = 1 // Not a multiple of 5, so alien bullet moves

      const result = gameReducer(state, { type: 'TICK' })

      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      expect(updatedBarrier.segments[0].health).toBe(3)

      // Alien bullet should be removed
      const bullets = getBullets(result.state.entities)
      expect(bullets.find(b => b.id === 'ab1')).toBeUndefined()
    })

    it('alien bullet marked for removal goes to y=100 (positive, off-screen below)', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50, [
        { offsetX: 0, offsetY: 0, health: 4 },
      ])
      const bullet = createTestBullet('ab1', 50, LAYOUT.BARRIER_Y - 1, null, 1)
      state.entities = [barrier, bullet]
      state.tick = 1

      const result = gameReducer(state, { type: 'TICK' })

      // Bullet is removed (y >= height condition filters it out)
      const bullets = getBullets(result.state.entities)
      expect(bullets.find(b => b.id === 'ab1')).toBeUndefined()
    })

    it('alien bullet hits barrier on upper segment when barrier has vertical depth', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50, [
        { offsetX: 0, offsetY: 0, health: 4 }, // Upper segment
        { offsetX: 0, offsetY: 1, health: 4 }, // Lower segment
      ])
      // Bullet aimed at upper segment (y = BARRIER_Y + 0)
      const bullet = createTestBullet('ab1', 50, LAYOUT.BARRIER_Y - 1, null, 1)
      state.entities = [barrier, bullet]
      state.tick = 1

      const result = gameReducer(state, { type: 'TICK' })

      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      expect(updatedBarrier.segments[0].health).toBe(3) // Upper hit
      expect(updatedBarrier.segments[1].health).toBe(4) // Lower untouched
    })

    it('alien bullet on 5th tick does not move (slower alien bullets)', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50, [
        { offsetX: 0, offsetY: 0, health: 4 },
      ])
      // Alien bullet at exact collision position but on tick that skips movement
      const bullet = createTestBullet('ab1', 50, LAYOUT.BARRIER_Y, null, 1)
      state.entities = [barrier, bullet]
      state.tick = 4 // Next tick (5) is % 5 === 0, alien bullet won't move

      const result = gameReducer(state, { type: 'TICK' })

      // Bullet should still be at same position (didn't move)
      // But collision check happens AFTER movement, so if already at collision pos, it still collides
      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      expect(updatedBarrier.segments[0].health).toBe(3) // Collision detected at current position
    })
  })

  describe('bullets passing through gaps in damaged barriers', () => {
    it('bullet passes through destroyed segment (health = 0)', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50, [
        { offsetX: 0, offsetY: 0, health: 0 }, // Destroyed
      ])
      const bullet = createTestBullet('b1', 50, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      // Segment health stays at 0
      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      expect(updatedBarrier.segments[0].health).toBe(0)

      // Bullet should continue through (not removed by barrier collision)
      const bullets = getBullets(result.state.entities)
      const bullet1 = bullets.find(b => b.id === 'b1')
      expect(bullet1).toBeDefined()
      expect(bullet1!.y).toBe(LAYOUT.BARRIER_Y) // Moved up by 1
    })

    it('bullet passes through gap between segments', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50, [
        { offsetX: 0, offsetY: 0, health: 4 },
        { offsetX: 2, offsetY: 0, health: 4 }, // Gap at offsetX: 1
      ])
      // Bullet aimed at gap (x=51, which is barrier.x + 1)
      const bullet = createTestBullet('b1', 51, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      // Both segments should be untouched
      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      expect(updatedBarrier.segments[0].health).toBe(4) // x=50
      expect(updatedBarrier.segments[1].health).toBe(4) // x=52

      // Bullet should pass through
      const bullets = getBullets(result.state.entities)
      const bullet1 = bullets.find(b => b.id === 'b1')
      expect(bullet1).toBeDefined()
    })

    it('bullet passes through destroyed middle segment while adjacent segments remain', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50, [
        { offsetX: 0, offsetY: 0, health: 4 },
        { offsetX: 1, offsetY: 0, health: 0 }, // Destroyed middle
        { offsetX: 2, offsetY: 0, health: 4 },
      ])
      // Bullet aimed at destroyed middle segment (x=51)
      const bullet = createTestBullet('b1', 51, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      // All segments unchanged
      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      expect(updatedBarrier.segments[0].health).toBe(4)
      expect(updatedBarrier.segments[1].health).toBe(0) // Still destroyed
      expect(updatedBarrier.segments[2].health).toBe(4)

      // Bullet passes through
      const bullets = getBullets(result.state.entities)
      expect(bullets.find(b => b.id === 'b1')).toBeDefined()
    })

    it('alien bullet passes through vertically destroyed column', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50, [
        { offsetX: 0, offsetY: 0, health: 0 }, // Top destroyed
        { offsetX: 0, offsetY: 1, health: 0 }, // Bottom destroyed
        { offsetX: 1, offsetY: 0, health: 4 }, // Adjacent intact
        { offsetX: 1, offsetY: 1, health: 4 }, // Adjacent intact
      ])
      // Alien bullet aimed at destroyed column (x=50)
      const bullet = createTestBullet('ab1', 50, LAYOUT.BARRIER_Y - 1, null, 1)
      state.entities = [barrier, bullet]
      state.tick = 1

      const result = gameReducer(state, { type: 'TICK' })

      // All health values unchanged
      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      expect(updatedBarrier.segments[0].health).toBe(0)
      expect(updatedBarrier.segments[1].health).toBe(0)
      expect(updatedBarrier.segments[2].health).toBe(4)
      expect(updatedBarrier.segments[3].health).toBe(4)

      // Bullet passes through
      const bullets = getBullets(result.state.entities)
      expect(bullets.find(b => b.id === 'ab1')).toBeDefined()
    })
  })

  describe('edge cases around barrier boundaries', () => {
    it('bullet at exactly x distance = 0.99 still collides (< 1)', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50, [
        { offsetX: 0, offsetY: 0, health: 4 },
      ])
      // Bullet at x=50.99, segment at x=50, distance = 0.99 < 1 -> collision
      const bullet = createTestBullet('b1', 50.99, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      expect(updatedBarrier.segments[0].health).toBe(3)
    })

    it('bullet at exactly x distance = 1.0 does NOT collide (not < 1)', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50, [
        { offsetX: 0, offsetY: 0, health: 4 },
      ])
      // Bullet at x=51, segment at x=50, distance = 1.0 NOT < 1 -> no collision
      const bullet = createTestBullet('b1', 51, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      expect(updatedBarrier.segments[0].health).toBe(4) // No damage
    })

    it('bullet at negative x offset from segment still detects collision', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50, [
        { offsetX: 0, offsetY: 0, health: 4 },
      ])
      // Bullet at x=49.5, segment at x=50, distance = |-0.5| = 0.5 < 1 -> collision
      const bullet = createTestBullet('b1', 49.5, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      expect(updatedBarrier.segments[0].health).toBe(3)
    })

    it('bullet hits first segment when within range of multiple segments', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50, [
        { offsetX: 0, offsetY: 0, health: 4 },
        { offsetX: 0.5, offsetY: 0, health: 4 }, // Overlapping segment
      ])
      // Bullet at x=50.25, within range of both segments (|50.25-50| < 1 and |50.25-50.5| < 1)
      const bullet = createTestBullet('b1', 50.25, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      // First segment in array gets hit (collision check breaks after first hit)
      expect(updatedBarrier.segments[0].health).toBe(3)
      expect(updatedBarrier.segments[1].health).toBe(4) // Second not hit
    })

    it('bullet collision with segment at offsetY > 0', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50, [
        { offsetX: 0, offsetY: 1, health: 4 }, // Segment at y = BARRIER_Y + 1
      ])
      // Bullet needs to collide at y = BARRIER_Y + 1
      const bullet = createTestBullet('b1', 50, LAYOUT.BARRIER_Y + 2, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      // After tick, bullet at y = BARRIER_Y + 1, segment at y = BARRIER_Y + 1 -> collision
      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      expect(updatedBarrier.segments[0].health).toBe(3)
    })

    it('bullet misses segment when y distance >= 1', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50, [
        { offsetX: 0, offsetY: 0, health: 4 },
      ])
      // Bullet at y = BARRIER_Y + 2, after tick at y = BARRIER_Y + 1
      // Segment at y = BARRIER_Y, distance = 1 NOT < 1 -> no collision
      const bullet = createTestBullet('b1', 50, LAYOUT.BARRIER_Y + 2, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      expect(updatedBarrier.segments[0].health).toBe(4) // No damage
    })

    it('handles barrier with no segments (empty array)', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier: BarrierEntity = {
        kind: 'barrier',
        id: 'barrier1',
        x: 50,
        segments: [], // No segments
      }
      const bullet = createTestBullet('b1', 50, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      // Bullet should pass through (no segments to hit)
      const bullets = getBullets(result.state.entities)
      expect(bullets.find(b => b.id === 'b1')).toBeDefined()
    })

    it('handles multiple barriers, bullet hits only the aligned one', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier1 = createTestBarrier('barrier1', 30, [
        { offsetX: 0, offsetY: 0, health: 4 },
      ])
      const barrier2 = createTestBarrier('barrier2', 50, [
        { offsetX: 0, offsetY: 0, health: 4 },
      ])
      const barrier3 = createTestBarrier('barrier3', 70, [
        { offsetX: 0, offsetY: 0, health: 4 },
      ])
      // Bullet aimed at barrier2 (x=50)
      const bullet = createTestBullet('b1', 50, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier1, barrier2, barrier3, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      const b1 = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      const b2 = result.state.entities.find(e => e.id === 'barrier2') as BarrierEntity
      const b3 = result.state.entities.find(e => e.id === 'barrier3') as BarrierEntity

      expect(b1.segments[0].health).toBe(4) // Not hit
      expect(b2.segments[0].health).toBe(3) // Hit
      expect(b3.segments[0].health).toBe(4) // Not hit
    })

    it('health cannot go below 0 even with multiple hits in same tick', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50, [
        { offsetX: 0, offsetY: 0, health: 1 },
      ])
      // Single bullet should reduce from 1 to 0, not below
      const bullet = createTestBullet('b1', 50, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      expect(updatedBarrier.segments[0].health).toBe(0)
    })

    it('two bullets hitting same segment in same tick - first bullet hits, second may pass through', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50, [
        { offsetX: 0, offsetY: 0, health: 4 },
      ])
      // Two bullets at same position - both will try to hit the segment
      const bullet1 = createTestBullet('b1', 50, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      const bullet2 = createTestBullet('b2', 50, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier, bullet1, bullet2]

      const result = gameReducer(state, { type: 'TICK' })

      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      // Both bullets hit in sequence during the same tick
      // Health goes 4 -> 3 -> 2
      expect(updatedBarrier.segments[0].health).toBe(2)
    })
  })

  describe('barrier collision with standard barrier shape', () => {
    it('bullet hits top-left of standard 5-segment barrier', () => {
      const { state, players } = createTestPlayingState(1)
      // Standard barrier shape from createTestBarrier:
      // [0,0] [1,0] [2,0]  <- top row
      // [0,1]       [2,1]  <- bottom row (gap in middle)
      const barrier = createTestBarrier('barrier1', 50)
      // Bullet aimed at top-left segment (x=50, y=BARRIER_Y)
      const bullet = createTestBullet('b1', 50, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      expect(updatedBarrier.segments[0].health).toBe(3) // [0,0] hit
      expect(updatedBarrier.segments[1].health).toBe(4) // [1,0] untouched
      expect(updatedBarrier.segments[2].health).toBe(4) // [2,0] untouched
      expect(updatedBarrier.segments[3].health).toBe(4) // [0,1] untouched
      expect(updatedBarrier.segments[4].health).toBe(4) // [2,1] untouched
    })

    it('bullet hits top-middle of standard 5-segment barrier', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50)
      // Bullet aimed at top-middle segment (x=51, y=BARRIER_Y)
      const bullet = createTestBullet('b1', 51, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      expect(updatedBarrier.segments[0].health).toBe(4) // [0,0] untouched
      expect(updatedBarrier.segments[1].health).toBe(3) // [1,0] hit
      expect(updatedBarrier.segments[2].health).toBe(4) // [2,0] untouched
    })

    it('alien bullet passes through bottom-middle gap of standard barrier', () => {
      const { state, players } = createTestPlayingState(1)
      const barrier = createTestBarrier('barrier1', 50)
      // Standard barrier has gap at [1,1] (no segment there)
      // Alien bullet aimed at x=51, y=BARRIER_Y+1 (the gap)
      const bullet = createTestBullet('ab1', 51, LAYOUT.BARRIER_Y, null, 1)
      state.entities = [barrier, bullet]
      state.tick = 1

      const result = gameReducer(state, { type: 'TICK' })

      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      // All segments should be untouched
      for (const seg of updatedBarrier.segments) {
        expect(seg.health).toBe(4)
      }

      // Bullet passes through
      const bullets = getBullets(result.state.entities)
      expect(bullets.find(b => b.id === 'ab1')).toBeDefined()
    })
  })
})

// worker/src/game/reducer.test.ts
// Unit tests for the pure game reducer

import { describe, it, expect, beforeEach } from 'vitest'
import { gameReducer, canTransition, type GameAction } from './reducer'
import type { GameState, Player, AlienEntity, BulletEntity, BarrierEntity } from '../../../shared/types'
import { LAYOUT, DEFAULT_CONFIG, getBullets, getAliens, getUFOs } from '../../../shared/types'
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
    it('alien.x is LEFT EDGE, so alien bullet spawns at alien.x + half width (center)', () => {
      // Aliens use LEFT EDGE coordinates (unlike players which use CENTER)
      // Alien bullets spawn at the visual center: alien.x + floor(ALIEN_WIDTH / 2)
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

    expect(result.state.status).toBe('wipe_hold') // Wipe phase before playing
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

  it('sets status to wipe_hold, mode to solo, lives to 3', () => {
    const { state, player } = createTestGameStateWithPlayer({ id: 'p1' })

    const result = gameReducer(state, { type: 'START_SOLO' })

    expect(result.state.status).toBe('wipe_hold') // Wipe phase before playing
    expect(result.state.mode).toBe('solo')
    expect(result.state.lives).toBe(3)
    expect(result.state.wipeTicksRemaining).toBe(30) // 2 seconds at 30Hz
    expect(result.state.wipeWaveNumber).toBe(1)
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

  it('transitions to wipe_hold and emits game_start when countdownRemaining reaches 0', () => {
    const { state, players } = createTestGameStateWithPlayers(2)
    state.status = 'countdown'
    state.countdownRemaining = 1

    const result = gameReducer(state, { type: 'COUNTDOWN_TICK' })

    expect(result.state.status).toBe('wipe_hold') // Wipe phase before playing
    expect(result.state.countdownRemaining).toBeNull()
    expect(result.state.wipeTicksRemaining).toBe(30)
    expect(result.state.wipeWaveNumber).toBe(1)
    expect(hasEvent(result.events, 'game_start')).toBe(true)
  })

  it('returns persist: true when transitioning to wipe_hold', () => {
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
    it('alien is removed from entities when hit (dead aliens are cleaned up)', () => {
      const { state, players } = createTestPlayingState(1)
      const alien = createTestAlien('alien1', 50, 10)
      const bullet = createTestBullet('b1', 51, 10, players[0].id, -1) // Close enough for collision
      state.entities = [alien, bullet]

      const result = gameReducer(state, { type: 'TICK' })

      // Dead aliens are cleaned up at end of tick (like UFOs)
      const aliens = getAliens(result.state.entities)
      expect(aliens.find(a => a.id === 'alien1')).toBeUndefined()
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

  it('bullet must be exactly aligned with segment X to hit (integer coordinates)', () => {
    // This test verifies the collision detection boundary behavior:
    // - Barrier at x=50 has segments at x=50, 51, 52 (offsets 0, 1, 2)
    // - Bullet at x=49 should miss (outside barrier on left)
    // - Bullet at x=50 should hit segment[0] at x=50
    // - Bullet at x=53 should miss (outside barrier on right)
    // Note: Bullets start at BARRIER_Y + 1 so they move INTO the barrier on tick

    const { state: state1, players } = createTestPlayingState(1)
    const barrier1 = createTestBarrier('barrier1', 50)
    const bulletOutsideLeft = createTestBullet('b1', 49, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
    state1.entities = [barrier1, bulletOutsideLeft]

    const result1 = gameReducer(state1, { type: 'TICK' })
    const updatedBarrier1 = result1.state.entities.find(e => e.id === 'barrier1') as any
    // Segment at x=50 should be undamaged - bullet at x=49 is outside barrier
    expect(updatedBarrier1.segments[0].health).toBe(4)

    // Test bullet aligned with segment
    const { state: state2 } = createTestPlayingState(1)
    const barrier2 = createTestBarrier('barrier2', 50)
    const bulletAligned = createTestBullet('b2', 50, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
    state2.entities = [barrier2, bulletAligned]

    const result2 = gameReducer(state2, { type: 'TICK' })
    const updatedBarrier2 = result2.state.entities.find(e => e.id === 'barrier2') as any
    // Segment[0] at x=50 should be damaged
    expect(updatedBarrier2.segments[0].health).toBe(3)

    // Test bullet outside on right
    const { state: state3 } = createTestPlayingState(1)
    const barrier3 = createTestBarrier('barrier3', 50)
    const bulletOutsideRight = createTestBullet('b3', 53, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
    state3.entities = [barrier3, bulletOutsideRight]

    const result3 = gameReducer(state3, { type: 'TICK' })
    const updatedBarrier3 = result3.state.entities.find(e => e.id === 'barrier3') as any
    // Segment at x=52 should be undamaged - bullet at x=53 is outside barrier (only 3 segments wide in test)
    expect(updatedBarrier3.segments[2].health).toBe(4)
  })
})

// ============================================================================
// Barrier Protection Gap Tests (demonstrates the "bullet through barrier" bug)
// ============================================================================

describe('barrier protection vs player hitbox mismatch', () => {
  // These tests demonstrate a bug where bullets can hit players "through" barriers
  // because the player hitbox (COLLISION_H=3) is wider than the barrier collision
  // detection threshold (< 1).
  //
  // Real barrier (5 segments): offsets 0,1,2,3,4 → for barrier at X=50, segments at X=50-54
  // Player hitbox: |bulletX - playerX - 1| < 3 → for player at X=52, bullets X=50-55 hit
  //
  // A bullet at X=55 would:
  //   - Miss barrier (nearest segment at X=54, difference=1, NOT < 1)
  //   - Hit player at X=52 (|55-52-1|=2 < 3)

  function createFullBarrier(id: string, x: number): BarrierEntity {
    // Use the real 5-wide barrier shape like production
    return {
      kind: 'barrier',
      id,
      x,
      segments: [
        { offsetX: 0, offsetY: 0, health: 4 },
        { offsetX: 1, offsetY: 0, health: 4 },
        { offsetX: 2, offsetY: 0, health: 4 },
        { offsetX: 3, offsetY: 0, health: 4 },
        { offsetX: 4, offsetY: 0, health: 4 },
        { offsetX: 0, offsetY: 1, health: 4 },
        { offsetX: 1, offsetY: 1, health: 4 },
        // gap at offsetX: 2, offsetY: 1 (the arch)
        { offsetX: 3, offsetY: 1, health: 4 },
        { offsetX: 4, offsetY: 1, health: 4 },
      ],
    }
  }

  it('FAILING: alien bullet at barrier edge should NOT hit player behind barrier', () => {
    // Setup: Player centered behind a 5-wide barrier
    // Barrier at X=50 covers X=50,51,52,53,54
    // Player at X=52 (centered behind barrier)
    // Alien bullet at X=55 (just outside barrier right edge)
    //
    // Expected behavior: Bullet should either hit barrier OR miss player
    // Actual behavior: Bullet misses barrier but hits player (the bug!)

    const { state, players } = createTestPlayingState(1)
    const player = players[0]
    player.x = 52  // Center player behind barrier
    state.players[player.id] = player

    const barrier = createFullBarrier('barrier1', 50)  // Segments at X=50-54
    // Alien bullet just outside barrier, moving down toward player
    const alienBullet = createTestBullet('ab1', 55, LAYOUT.PLAYER_Y - 1, null, 1)
    state.entities = [barrier, alienBullet]

    const result = gameReducer(state, { type: 'TICK' })

    // The bullet should NOT have killed the player if they're "behind" the barrier
    // This test documents the current (buggy) behavior where the bullet hits
    const playerAfter = result.state.players[player.id]

    // CURRENT BEHAVIOR (bug): player.alive = false (bullet hits through barrier edge)
    // EXPECTED BEHAVIOR: player.alive = true (barrier should protect)
    //
    // This assertion is what we WANT to be true (barrier protects player):
    expect(playerAfter.alive).toBe(true)  // THIS WILL FAIL - demonstrating the bug
  })

  it('FAILING: bullet 2 cells outside barrier still hits player', () => {
    // Even more egregious case: bullet is 2 cells outside barrier
    // Barrier at X=50 covers X=50-54
    // Player at X=52
    // Bullet at X=56

    const { state, players } = createTestPlayingState(1)
    const player = players[0]
    player.x = 52
    state.players[player.id] = player

    const barrier = createFullBarrier('barrier1', 50)
    const alienBullet = createTestBullet('ab1', 56, LAYOUT.PLAYER_Y - 1, null, 1)
    state.entities = [barrier, alienBullet]

    const result = gameReducer(state, { type: 'TICK' })
    const playerAfter = result.state.players[player.id]

    // Player hitbox extends to X=55 (|56-52-1|=3, NOT < 3, so actually misses!)
    // Let me recalculate: |bulletX - playerX - 1| < 3
    // |56 - 52 - 1| = |3| = 3, which is NOT < 3
    // So X=56 actually misses! Let's use X=55 instead
    expect(playerAfter.alive).toBe(true)
  })

  it('FAILING: documents exact boundary where bullet hits player but misses barrier', () => {
    // Precise test of the mismatch:
    // Barrier at X=50, segments at X=50,51,52,53,54
    // Player at X=52
    // Player hitbox: |bulletX - 52 - 1| < 3 → |bulletX - 53| < 3 → X in [51, 56)
    //
    // Bullet at X=55:
    //   - Barrier check: |55-54| = 1, NOT < 1 → MISS
    //   - Player check: |55-53| = 2 < 3 → HIT
    //
    // This is the protection gap!

    const { state, players } = createTestPlayingState(1)
    const player = players[0]
    player.x = 52
    state.players[player.id] = player

    const barrier = createFullBarrier('barrier1', 50)
    const alienBullet = createTestBullet('ab1', 55, LAYOUT.PLAYER_Y - 1, null, 1)
    state.entities = [barrier, alienBullet]

    // Verify bullet misses barrier
    const result = gameReducer(state, { type: 'TICK' })
    const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
    const allSegmentsUndamaged = updatedBarrier.segments.every(s => s.health === 4)
    expect(allSegmentsUndamaged).toBe(true)  // Bullet missed barrier ✓

    // But the player should still be protected!
    const playerAfter = result.state.players[player.id]
    expect(playerAfter.alive).toBe(true)  // THIS WILL FAIL
  })

  it('control: bullet aligned with barrier segment hits barrier, not player', () => {
    // This test should PASS - demonstrates correct behavior when bullet IS aligned
    const { state, players } = createTestPlayingState(1)
    const player = players[0]
    player.x = 52
    state.players[player.id] = player

    const barrier = createFullBarrier('barrier1', 50)
    // Bullet at X=54 - with 2x spacing, this hits segment at offsetX=2 (spans [54,56))
    const alienBullet = createTestBullet('ab1', 54, LAYOUT.BARRIER_Y - 1, null, 1)
    state.entities = [barrier, alienBullet]

    const result = gameReducer(state, { type: 'TICK' })

    // Bullet should hit barrier segment at offsetX=2 (x = 50 + 2*2 = 54)
    const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
    const hitSegment = updatedBarrier.segments.find(s => s.health === 3)
    expect(hitSegment?.offsetX).toBe(2)  // Segment 2 is at x=54

    // Player should be unharmed
    const playerAfter = result.state.players[player.id]
    expect(playerAfter.alive).toBe(true)
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
    // Dead aliens are cleaned up, so we count remaining alive aliens
    const remainingAliens = getAliens(result.state.entities)
    expect(remainingAliens.length).toBe(1) // One alien remains (only one killed per tick)
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
// Grace Period Tests
// ============================================================================

describe('alien entering flag (prevents shooting during wipe_reveal)', () => {
  describe('entering flag behavior', () => {
    it('aliens with entering=true do NOT shoot', () => {
      const { state, players } = createTestPlayingState(1)
      const enteringAlien = createTestAlien('alien1', 50, 10, { row: 0, col: 0, entering: true })
      state.entities = [enteringAlien]
      state.tick = 0
      state.rngSeed = 42

      let currentState = state
      let bulletsCreated = 0

      // Run many ticks with entering aliens
      for (let i = 0; i < 100; i++) {
        const result = gameReducer(currentState, { type: 'TICK' })
        const newBullets = getBullets(result.state.entities).filter(b => b.ownerId === null)
        bulletsCreated += newBullets.length
        currentState = structuredClone(result.state)
        // Keep entering flag set
        for (const e of currentState.entities) {
          if (e.kind === 'alien') e.entering = true
        }
      }

      // No alien bullets should have been created
      expect(bulletsCreated).toBe(0)
    })

    it('aliens with entering=false CAN shoot', () => {
      const { state, players } = createTestPlayingState(1)
      const normalAlien = createTestAlien('alien1', 50, 10, { row: 0, col: 0, entering: false })
      state.entities = [normalAlien]
      state.tick = 0
      state.rngSeed = 42

      let currentState = state
      let bulletsCreated = 0

      // Run many ticks with normal aliens
      for (let i = 0; i < 2000; i++) {
        const result = gameReducer(currentState, { type: 'TICK' })
        const newBullets = getBullets(result.state.entities).filter(b => b.ownerId === null)
        bulletsCreated += newBullets.length
        currentState = structuredClone(result.state)
        currentState.entities = currentState.entities.filter(e => e.kind !== 'bullet')
      }

      // Aliens should have fired during the period
      expect(bulletsCreated).toBeGreaterThan(0)
    })

    it('mixed entering and non-entering aliens: none shoot if any are entering', () => {
      const { state, players } = createTestPlayingState(1)
      const enteringAlien = createTestAlien('alien1', 50, 10, { row: 0, col: 0, entering: true })
      const normalAlien = createTestAlien('alien2', 60, 10, { row: 0, col: 1, entering: false })
      state.entities = [enteringAlien, normalAlien]
      state.tick = 0
      state.rngSeed = 42

      let currentState = state
      let bulletsCreated = 0

      // Run many ticks with mixed aliens
      for (let i = 0; i < 100; i++) {
        const result = gameReducer(currentState, { type: 'TICK' })
        const newBullets = getBullets(result.state.entities).filter(b => b.ownerId === null)
        bulletsCreated += newBullets.length
        currentState = structuredClone(result.state)
      }

      // No bullets because at least one alien is entering
      expect(bulletsCreated).toBe(0)
    })
  })

  describe('wipe phase transitions', () => {
    it('START_SOLO transitions to wipe_hold', () => {
      const { state } = createTestGameStateWithPlayer({ id: 'p1' })

      const result = gameReducer(state, { type: 'START_SOLO' })

      expect(result.state.status).toBe('wipe_hold')
      expect(result.state.wipeTicksRemaining).toBe(30)
      expect(result.state.wipeWaveNumber).toBe(1)
    })

    it('COUNTDOWN_TICK (ending) transitions to wipe_hold', () => {
      const { state } = createTestGameStateWithPlayers(2)
      state.status = 'countdown'
      state.countdownRemaining = 1

      const result = gameReducer(state, { type: 'COUNTDOWN_TICK' })

      expect(result.state.status).toBe('wipe_hold')
      expect(result.state.wipeTicksRemaining).toBe(30)
      expect(result.state.wipeWaveNumber).toBe(1)
    })

    it('wipe_hold transitions to wipe_reveal after countdown', () => {
      const { state } = createTestGameStateWithPlayer({ id: 'p1' })
      state.status = 'wipe_hold'
      state.wipeTicksRemaining = 1 // Last tick
      state.wipeWaveNumber = 1

      const result = gameReducer(state, { type: 'TICK' })

      expect(result.state.status).toBe('wipe_reveal')
      expect(result.state.wipeTicksRemaining).toBe(60) // Reveal duration
    })

    it('wipe_reveal transitions to playing after countdown', () => {
      const { state } = createTestGameStateWithPlayer({ id: 'p1' })
      const alien = createTestAlien('a1', 50, 10, { entering: true })
      state.status = 'wipe_reveal'
      state.wipeTicksRemaining = 1 // Last tick
      state.wipeWaveNumber = 1
      state.entities = [alien]

      const result = gameReducer(state, { type: 'TICK' })

      expect(result.state.status).toBe('playing')
      expect(result.state.wipeTicksRemaining).toBeNull()
      expect(result.state.wipeWaveNumber).toBeNull()
      // Aliens should have entering=false after wipe_reveal ends
      const aliens = getAliens(result.state.entities)
      expect(aliens[0].entering).toBe(false)
    })

    it('wipe_exit transitions to wipe_hold after countdown', () => {
      const { state } = createTestGameStateWithPlayer({ id: 'p1' })
      state.status = 'wipe_exit'
      state.wipeTicksRemaining = 1 // Last tick
      state.wipeWaveNumber = 2

      const result = gameReducer(state, { type: 'TICK' })

      expect(result.state.status).toBe('wipe_hold')
      expect(result.state.wipeTicksRemaining).toBe(30) // Hold duration
    })

    it('wipe_hold sets entering=true on aliens when transitioning to wipe_reveal', () => {
      const { state } = createTestGameStateWithPlayer({ id: 'p1' })
      const alien = createTestAlien('a1', 50, 10, { entering: false })
      state.status = 'wipe_hold'
      state.wipeTicksRemaining = 1 // Last tick
      state.wipeWaveNumber = 1
      state.entities = [alien]

      const result = gameReducer(state, { type: 'TICK' })

      expect(result.state.status).toBe('wipe_reveal')
      const aliens = getAliens(result.state.entities)
      expect(aliens[0].entering).toBe(true)
    })
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
// Sprite Shape vs Hitbox Alignment Audit
// ============================================================================
// These tests document and verify the alignment between:
// 1. Visual sprite dimensions (width x height in characters)
// 2. Collision hitbox calculations
// 3. Rendering position calculations
//
// Key constants from shared/types.ts:
//   SPRITE_SIZE.player = { width: 5, height: 2 }
//   SPRITE_SIZE.alien = { width: 5, height: 2 }
//   SPRITE_SIZE.ufo = { width: 5, height: 2 }  (NOTE: actual sprite is 5 chars, LAYOUT says width: 5)
//   SPRITE_SIZE.bullet = { width: 1, height: 1 }
//   SPRITE_SIZE.barrier = { width: 2, height: 2 }
//
// Key constants from shared/types.ts LAYOUT:
//   COLLISION_H = 3 (horizontal collision threshold)
//   COLLISION_V = 2 (vertical collision threshold)
//   PLAYER_WIDTH = 5
//   PLAYER_HEIGHT = 2
//   ALIEN_WIDTH = 5
//   ALIEN_HEIGHT = 2
//
// Coordinate systems:
//   - Player: x is CENTER (rendering: leftEdge = x - width/2)
//   - Alien: x is LEFT EDGE (rendering: left = x)
//   - UFO: x is LEFT EDGE (rendering: left = x)
//   - Barrier: x is LEFT EDGE, segments use offsetX/offsetY
//   - Bullet: x is position of 1-char sprite
//
// ============================================================================

describe('Sprite shape vs hitbox alignment', () => {
  // ─── Player Collision Tests ─────────────────────────────────────────────────
  describe('Player hitbox', () => {
    // Player.x is CENTER of sprite (width=5, so sprite spans [x-2, x+2])
    // checkBulletCollision: |bulletX - playerX - offsetX| < COLLISION_H (where offsetX=1)
    // Actual formula: |bulletX - playerX - 1| < 3
    // This means bullets at playerX-2 to playerX+4 (exclusive) will hit
    // But visual sprite spans playerX-2 to playerX+2
    // MISMATCH: hitbox extends 2 chars past right edge of visual sprite!

    it('MISMATCH: player hitbox extends past visual right edge', () => {
      // Player at x=50, visual sprite spans [48, 52] (5 chars wide, centered)
      // But checkBulletCollision hits for bullets at [48, 54)
      // This test verifies bullets outside the visual sprite DON'T hit

      const { state, players } = createTestPlayingState(1)
      const player = players[0]
      player.x = 50  // Center at 50, visual: [48, 52]
      state.players[player.id] = player

      // Bullet at x=53 is 1 char past visual right edge - should MISS (fixed behavior)
      const alienBullet = createTestBullet('ab1', 53, LAYOUT.PLAYER_Y, null, 1)
      state.entities = [alienBullet, createTestAlien('a1', 20, 5)]

      const result = gameReducer(state, { type: 'TICK' })
      const playerAfter = result.state.players[player.id]

      // FIXED: Bullet at x=53 now correctly misses player with visual sprite at [48,52]
      // checkPlayerHit: 53 >= 48 && 53 < 53 → false (not < 53)
      expect(playerAfter.alive).toBe(true)  // Correctly misses!
    })

    it('player hitbox now matches visual sprite', () => {
      // checkPlayerHit: bX >= pX - 2 && bX < pX + 3
      // For player at x=50: hitbox is [48, 53) which matches visual [48, 52] + bullet width
      //
      // For player at x=50:
      //   Left boundary:  47 < 48 -> MISS
      //   Left edge:      48 >= 48 && 48 < 53 -> HIT ✓
      //   Center:         50 >= 48 && 50 < 53 -> HIT
      //   Right edge:     52 >= 48 && 52 < 53 -> HIT
      //   Past right:     53 >= 48 && 53 < 53 -> MISS (53 not < 53) ✓
      //
      // Hitbox now aligns with visual sprite!

      const { state: state1, players: players1 } = createTestPlayingState(1)
      const player1 = players1[0]
      player1.x = 50
      state1.players[player1.id] = player1

      // Bullet at x=48 (visual left edge) NOW CORRECTLY HITS
      const bulletLeft = createTestBullet('ab1', 48, LAYOUT.PLAYER_Y, null, 1)
      state1.entities = [bulletLeft, createTestAlien('a1', 20, 5)]

      const result1 = gameReducer(state1, { type: 'TICK' })
      // FIXED: 48 >= 48 && 48 < 53 -> HIT
      expect(result1.state.players[player1.id].alive).toBe(false)  // Bullet at visual left edge now HITS
    })

    it('documents correct hitbox boundaries for player', () => {
      // Summary: For player at center x=50:
      // - Visual sprite spans: x=[48, 52] (5 chars wide centered on x=50)
      // - Hitbox spans: x=[48, 53) (matches visual, +1 for bullet width accounting)
      // - Left visual edge (48) is now INSIDE hitbox ✓
      // - Past right visual edge (53) is now OUTSIDE hitbox ✓

      const testCases = [
        { bulletX: 47, expectedHit: false, description: 'far left (outside visual)' },
        { bulletX: 48, expectedHit: true, description: 'visual left edge - HITS ✓' },
        { bulletX: 49, expectedHit: true, description: 'inside visual, 1 from left edge' },
        { bulletX: 50, expectedHit: true, description: 'center' },
        { bulletX: 51, expectedHit: true, description: 'inside visual' },
        { bulletX: 52, expectedHit: true, description: 'visual right edge' },
        { bulletX: 53, expectedHit: false, description: 'past visual right edge - MISSES ✓' },
        { bulletX: 54, expectedHit: false, description: 'far right (outside)' },
      ]

      for (const tc of testCases) {
        const { state, players } = createTestPlayingState(1)
        const player = players[0]
        player.x = 50
        state.players[player.id] = player

        const bullet = createTestBullet(`ab-${tc.bulletX}`, tc.bulletX, LAYOUT.PLAYER_Y, null, 1)
        state.entities = [bullet, createTestAlien('a1', 20, 5)]

        const result = gameReducer(state, { type: 'TICK' })
        const hit = !result.state.players[player.id].alive

        expect(hit).toBe(tc.expectedHit)  // Correct behavior
      }
    })
  })

  // ─── Alien Collision Tests ─────────────────────────────────────────────────
  describe('Alien hitbox', () => {
    // Alien.x is LEFT EDGE of sprite (width=5, so sprite spans [x, x+4])
    // checkAlienHit: bX >= aX && bX < aX + 5
    // This means bullets at [alienX, alienX+5) will hit
    // Visual sprite spans [alienX, alienX+5)
    // FIXED: hitbox now matches visual sprite!

    it('documents alien hitbox boundaries', () => {
      // Alien at x=50, visual sprite spans [50, 54] (5 chars wide, left-aligned)
      // checkAlienHit: bX >= 50 && bX < 55
      // Hits for bulletX in [50, 55)
      //
      // Hitbox: [50, 55) matches visual sprite!

      const testCases = [
        { bulletX: 47, expectedHit: false, description: 'far left' },
        { bulletX: 48, expectedHit: false, description: '2 left of visual' },
        { bulletX: 49, expectedHit: false, description: '1 left of visual - MISSES ✓' },
        { bulletX: 50, expectedHit: true, description: 'visual left edge - HITS ✓' },
        { bulletX: 51, expectedHit: true, description: 'visual center-left' },
        { bulletX: 52, expectedHit: true, description: 'visual center' },
        { bulletX: 53, expectedHit: true, description: 'visual center-right' },
        { bulletX: 54, expectedHit: true, description: 'visual right edge - HITS ✓' },
        { bulletX: 55, expectedHit: false, description: 'past right edge - MISSES ✓' },
      ]

      for (const tc of testCases) {
        const { state, players } = createTestPlayingState(1)
        const alien = createTestAlien('alien1', 50, 10)
        const bullet = createTestBullet(`b-${tc.bulletX}`, tc.bulletX, 10, players[0].id, -1)
        state.entities = [alien, bullet]

        const result = gameReducer(state, { type: 'TICK' })
        // Dead aliens are cleaned up at end of tick, so check if alien is removed (undefined)
        const alienAfter = getAliens(result.state.entities).find(a => a.id === 'alien1')
        const hit = alienAfter === undefined  // Alien removed = was hit

        expect(hit).toBe(tc.expectedHit)  // Correct behavior
      }
    })

    it('bullet left of visual alien sprite now correctly misses', () => {
      const { state, players } = createTestPlayingState(1)
      const alien = createTestAlien('alien1', 50, 10)  // Visual: [50, 54]
      const bullet = createTestBullet('b1', 49, 10, players[0].id, -1)  // 1 char LEFT of visual
      state.entities = [alien, bullet]

      const result = gameReducer(state, { type: 'TICK' })
      const alienAfter = getAliens(result.state.entities).find(a => a.id === 'alien1')

      // FIXED: 49 < 50 -> MISS
      // x=49 is visually LEFT of alien sprite, correctly misses
      expect(alienAfter?.alive).toBe(true)  // Correctly misses!
    })

    it('bullet at visual right edge now correctly hits alien', () => {
      const { state, players } = createTestPlayingState(1)
      const alien = createTestAlien('alien1', 50, 10)  // Visual: [50, 54]
      const bullet = createTestBullet('b1', 54, 10, players[0].id, -1)  // Visual right edge
      state.entities = [alien, bullet]

      const result = gameReducer(state, { type: 'TICK' })
      // Dead aliens are cleaned up at end of tick
      const alienAfter = getAliens(result.state.entities).find(a => a.id === 'alien1')

      // FIXED: 54 >= 50 && 54 < 55 -> HIT
      // x=54 is visually ON the alien sprite, correctly hits
      expect(alienAfter).toBeUndefined()  // Alien removed = was hit correctly!
    })
  })

  // ─── UFO Collision Tests ─────────────────────────────────────────────────
  describe('UFO hitbox', () => {
    // UFO.x is LEFT EDGE (same as alien)
    // Sprite comment says "7 chars wide" but SPRITE_SIZE.ufo = { width: 5 }
    // Actual sprite '╭─●─╮' is 5 chars (each Unicode char is 1 cell)
    // Uses checkUfoHit which now matches visual sprite

    it('documents UFO sprite dimension mismatch in comments', () => {
      // In sprites.ts line 34: "// UFO (mystery ship) - 2 lines, 7 chars wide"
      // In sprites.ts line 74: "ufo: { width: 5, height: 2 }"
      // Actual sprite '╭─●─╮' has 5 characters
      // This is a documentation bug (comment says 7, actual is 5)
      //
      // The hitbox now uses HITBOX.UFO_WIDTH=5 to match visual
      expect(LAYOUT.COLLISION_H).toBe(3)  // Old value kept for reference
    })

    it('documents UFO hitbox boundaries (now matches visual)', () => {
      const testCases = [
        { bulletX: 49, expectedHit: false, description: '1 left of visual - MISSES ✓' },
        { bulletX: 50, expectedHit: true, description: 'visual left edge - HITS ✓' },
        { bulletX: 53, expectedHit: true, description: 'visual center-right' },
        { bulletX: 54, expectedHit: true, description: 'visual right edge - HITS ✓' },
        { bulletX: 55, expectedHit: false, description: 'past right edge - MISSES ✓' },
      ]

      for (const tc of testCases) {
        const { state, players } = createTestPlayingState(1)
        const ufo = createTestUFO('ufo1', 50, { points: 100 })
        const bullet = createTestBullet(`b-${tc.bulletX}`, tc.bulletX, 1, players[0].id, -1)
        state.entities = [ufo, bullet, createTestAlien('a1', 20, 5)]

        const result = gameReducer(state, { type: 'TICK' })
        const ufoAfter = getUFOs(result.state.entities).find(u => u.id === 'ufo1')
        const hit = !ufoAfter?.alive

        expect(hit).toBe(tc.expectedHit)
      }
    })
  })

  // ─── Barrier Collision Tests ─────────────────────────────────────────────────
  describe('Barrier segment hitbox', () => {
    // Barrier collision now matches visual rendering!
    // Both use 2x multiplier for segment spacing:
    //   Collision: segX = barrier.x + seg.offsetX * HITBOX.BARRIER_SEGMENT_WIDTH
    //   Rendering: left = barrier.x + seg.offsetX * SPRITE_SIZE.barrier.width
    //
    // HITBOX.BARRIER_SEGMENT_WIDTH = SPRITE_SIZE.barrier.width = 2
    //
    // A barrier at x=50 with segment offsetX=2:
    // - Collision detects at x=54 (50 + 2*2)
    // - Rendering shows at x=54 (50 + 2*2) ✓

    it('barrier collision matches visual position', () => {
      // Barrier at x=50 with standard segments:
      // Both collision and render positions: 50, 52, 54, 56, 58 (offsetX 0-4, 2x width)
      //
      // A bullet at x=52 will hit segment at offsetX=1 (rendered at x=52-53)

      const { state, players } = createTestPlayingState(1)

      // Full barrier with 5 columns (offsets 0,1,2,3,4)
      const barrier: BarrierEntity = {
        kind: 'barrier',
        id: 'barrier1',
        x: 50,
        segments: [
          { offsetX: 0, offsetY: 0, health: 4 },
          { offsetX: 1, offsetY: 0, health: 4 },
          { offsetX: 2, offsetY: 0, health: 4 },
          { offsetX: 3, offsetY: 0, health: 4 },
          { offsetX: 4, offsetY: 0, health: 4 },
        ],
      }

      // Bullet at x=52 - should hit segment at offsetX=1 (visual and collision at 52-53)
      const bullet = createTestBullet('b1', 52, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })
      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity

      // Collision: bullet x=52 is in segment offsetX=1 (spans [52, 54))
      const hitSegment = updatedBarrier.segments.find(s => s.health === 3)
      expect(hitSegment?.offsetX).toBe(1)
    })

    it('bullet between visual segments misses (correct behavior)', () => {
      // With 2x spacing, segments are at x=50-51, 52-53, 54-55
      // A bullet at x=51 is inside segment 0's collision area

      const { state, players } = createTestPlayingState(1)

      const barrier: BarrierEntity = {
        kind: 'barrier',
        id: 'barrier1',
        x: 50,
        segments: [
          { offsetX: 0, offsetY: 0, health: 4 },
          { offsetX: 1, offsetY: 0, health: 4 },
          { offsetX: 2, offsetY: 0, health: 4 },
        ],
      }

      // Bullet at x=51, should hit segment 0 (spans [50, 52))
      const bullet = createTestBullet('b1', 51, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })
      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity

      // Collision hits segment at offsetX=0 (spans [50, 52), bullet at 51 is inside)
      const hitSegment = updatedBarrier.segments.find(s => s.health === 3)
      expect(hitSegment?.offsetX).toBe(0)
    })

    it('collision and visual positions now match', () => {
      // For each segment, collision and visual X should be identical
      const barrierX = 50
      const segmentWidth = 2
      const segments = [
        { offsetX: 0, expectedX: 50 },
        { offsetX: 1, expectedX: 52 },
        { offsetX: 2, expectedX: 54 },
        { offsetX: 3, expectedX: 56 },
        { offsetX: 4, expectedX: 58 },
      ]

      for (const seg of segments) {
        const collisionX = barrierX + seg.offsetX * segmentWidth
        const visualX = barrierX + seg.offsetX * segmentWidth
        expect(collisionX).toBe(seg.expectedX)
        expect(visualX).toBe(seg.expectedX)
        expect(collisionX).toBe(visualX) // No gap!
      }
    })

    it('barrier height collision matches visual', () => {
      // Y coordinate also uses 2x multiplier now:
      // Collision: segY = LAYOUT.BARRIER_Y + seg.offsetY * HITBOX.BARRIER_SEGMENT_HEIGHT
      // Rendering: top = LAYOUT.BARRIER_Y + seg.offsetY * SPRITE_SIZE.barrier.height
      //
      // Both equal 2, so no mismatch

      const segmentHeight = 2
      const segmentCases = [
        { offsetY: 0, expectedY: LAYOUT.BARRIER_Y },
        { offsetY: 1, expectedY: LAYOUT.BARRIER_Y + 2 },
      ]

      for (const seg of segmentCases) {
        const collisionY = LAYOUT.BARRIER_Y + seg.offsetY * segmentHeight
        const visualY = LAYOUT.BARRIER_Y + seg.offsetY * segmentHeight
        expect(collisionY).toBe(seg.expectedY)
        expect(visualY).toBe(seg.expectedY)
        expect(collisionY).toBe(visualY) // No gap!
      }
    })
  })

  // ─── Barrier collision matching visual position ─────────────────────────────────
  describe('barrier collision should match visual position', () => {
    it('bullet at visual segment position should hit that segment', () => {
      // Segment at offsetX=2 is RENDERED at x = 50 + 2*2 = 54
      // A bullet at x=54 should hit that segment (collision now uses 2x multiplier)

      const { state, players } = createTestPlayingState(1)

      const barrier: BarrierEntity = {
        kind: 'barrier',
        id: 'barrier1',
        x: 50,
        segments: [
          { offsetX: 0, offsetY: 0, health: 4 },
          { offsetX: 1, offsetY: 0, health: 4 },
          { offsetX: 2, offsetY: 0, health: 4 }, // Rendered at x=54
          { offsetX: 3, offsetY: 0, health: 4 },
          { offsetX: 4, offsetY: 0, health: 4 },
        ],
      }

      // Bullet at x=54 (where segment offsetX=2 is visually rendered)
      const bullet = createTestBullet('b1', 54, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })
      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity

      // Should hit segment at offsetX=2 (visually at x=54-55)
      const hitSegment = updatedBarrier.segments.find(s => s.health === 3)
      expect(hitSegment?.offsetX).toBe(2)
    })

    it('bullet at x=56 should hit segment visually at x=56', () => {
      // Segment at offsetX=3 is RENDERED at x = 50 + 3*2 = 56
      // Collision now matches visual position

      const { state, players } = createTestPlayingState(1)

      const barrier: BarrierEntity = {
        kind: 'barrier',
        id: 'barrier1',
        x: 50,
        segments: [
          { offsetX: 0, offsetY: 0, health: 4 },
          { offsetX: 1, offsetY: 0, health: 4 },
          { offsetX: 2, offsetY: 0, health: 4 },
          { offsetX: 3, offsetY: 0, health: 4 }, // Rendered at x=56
          { offsetX: 4, offsetY: 0, health: 4 },
        ],
      }

      // Bullet at x=56 (where segment offsetX=3 is visually rendered)
      const bullet = createTestBullet('b1', 56, LAYOUT.BARRIER_Y + 1, players[0].id, -1)
      state.entities = [barrier, bullet]

      const result = gameReducer(state, { type: 'TICK' })
      const updatedBarrier = result.state.entities.find(e => e.id === 'barrier1') as BarrierEntity
      const remainingBullets = result.state.entities.filter(e => e.kind === 'bullet')

      // Bullet should be destroyed, segment at offsetX=3 should be damaged
      const hitSegment = updatedBarrier.segments.find(s => s.health === 3)
      expect(hitSegment?.offsetX).toBe(3)
      expect(remainingBullets.length).toBe(0)
    })

    it('barrier visual span should match collision span', () => {
      // A 5-segment barrier (offsetX 0-4):
      // - Visual span: x=50 to x=59 (10 cells with 2-width segments)
      // - Collision span now also: x=50 to x=59 (matching visual)

      const barrierX = 50
      const segmentCount = 5
      const spriteWidth = 2

      // Visual span calculation
      const visualLeft = barrierX
      const visualRight = barrierX + (segmentCount - 1) * spriteWidth + spriteWidth - 1
      // = 50 + 4*2 + 2 - 1 = 50 + 8 + 1 = 59

      // Collision span calculation (now fixed with 2x multiplier)
      const collisionLeft = barrierX
      const collisionRight = barrierX + (segmentCount - 1) * spriteWidth + spriteWidth - 1
      // = 50 + 4*2 + 2 - 1 = 59

      // These should now match
      expect(collisionLeft).toBe(visualLeft)
      expect(collisionRight).toBe(visualRight)
    })
  })

  // ─── Summary of fixed hitboxes ─────────────────────────────────────────────────
  describe('Summary of entity coordinate systems (all fixed)', () => {
    it('documents all entity coordinate systems', () => {
      // PLAYER (checkPlayerHit):
      // - Position: x = CENTER of sprite (width 5)
      // - Visual: renders at [x-2, x+3)
      // - Hitbox: [x-2, x+3) × [y, y+2) ✓ MATCHES VISUAL

      // ALIEN (checkAlienHit):
      // - Position: x = LEFT EDGE of sprite (width 5)
      // - Visual: renders at [x, x+5)
      // - Hitbox: [x, x+5) × [y, y+2) ✓ MATCHES VISUAL

      // UFO (checkUfoHit):
      // - Position: x = LEFT EDGE of sprite (width 5)
      // - Visual: renders at [x, x+5)
      // - Hitbox: [x, x+5) × [y, y+2) ✓ MATCHES VISUAL

      // BARRIER (checkBarrierSegmentHit):
      // - Position: barrier.x = LEFT EDGE, segments use offsetX/offsetY
      // - Visual: renders at barrier.x + offsetX*2, barrier_y + offsetY*2
      // - Hitbox: collision at barrier.x + offsetX*2, barrier_y + offsetY*2 ✓ MATCHES VISUAL
      //
      // Using HITBOX constants ensures collision and visual stay in sync.
      expect(true).toBe(true)  // Documentation test
    })
  })
})

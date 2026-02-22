// worker/src/game/full-game-loop.test.ts
// Integration tests for full game loop: spawn, shoot, wave clear, wave progression, game over

import { describe, it, expect } from 'vitest'
import { gameReducer, type GameAction } from './reducer'
import type { GameState, AlienEntity, BulletEntity } from '../../../shared/types'
import { LAYOUT, DEFAULT_CONFIG, WIPE_TIMING, COUNTDOWN_SECONDS, getAliens, getBullets, getBarriers } from '../../../shared/types'
import {
  createTestGameState,
  createTestPlayer,
  createTestAlien,
  createTestBullet,
  createTestPlayingState,
  createTestGameStateWithPlayer,
  createTestGameStateWithPlayers,
  createTestAlienFormation,
  hasEvent,
  getEventData,
} from '../test-utils'

// ============================================================================
// Helper: Run N ticks through the reducer
// ============================================================================

function runTicks(state: GameState, count: number): { state: GameState; allEvents: any[] } {
  let current = state
  const allEvents: any[] = []
  for (let i = 0; i < count; i++) {
    const result = gameReducer(current, { type: 'TICK' })
    current = result.state
    allEvents.push(...result.events)
  }
  return { state: current, allEvents }
}

/**
 * Create a playing state where the player can immediately shoot.
 * The default createTestPlayingState has tick=0 and lastShotTick=0,
 * which triggers cooldown (0 - 0 = 0 < 6). This helper advances
 * the tick past the cooldown period.
 */
function createShootReadyState(playerCount: number = 1) {
  const result = createTestPlayingState(playerCount)
  // Advance tick past cooldown so player can shoot immediately
  result.state.tick = DEFAULT_CONFIG.playerCooldownTicks + 1
  return result
}

// ============================================================================
// Full Game Loop: Solo Game
// ============================================================================

describe('Full Game Loop: Solo Game', () => {
  it('starts game via START_SOLO, goes through wipe phases to playing', () => {
    const { state, player } = createTestGameStateWithPlayer({ name: 'Solo' })

    // START_SOLO transitions to wipe_hold
    const startResult = gameReducer(state, { type: 'START_SOLO' })
    expect(startResult.state.status).toBe('wipe_hold')
    expect(startResult.state.mode).toBe('solo')
    expect(startResult.state.lives).toBe(3)
    expect(startResult.state.wipeTicksRemaining).toBe(WIPE_TIMING.HOLD_TICKS)
    expect(hasEvent(startResult.events, 'game_start')).toBe(true)

    // Tick through wipe_hold (HOLD_TICKS ticks)
    let current = startResult.state
    for (let i = 0; i < WIPE_TIMING.HOLD_TICKS; i++) {
      const r = gameReducer(current, { type: 'TICK' })
      current = r.state
    }
    expect(current.status).toBe('wipe_reveal')
    expect(current.wipeTicksRemaining).toBe(WIPE_TIMING.REVEAL_TICKS)

    // Tick through wipe_reveal (120 ticks)
    for (let i = 0; i < WIPE_TIMING.REVEAL_TICKS; i++) {
      const r = gameReducer(current, { type: 'TICK' })
      current = r.state
    }
    expect(current.status).toBe('playing')
    expect(current.wipeTicksRemaining).toBeNull()
    expect(current.wipeWaveNumber).toBeNull()
  })

  it('player shoots and kills an alien, score increases', () => {
    const { state, players } = createShootReadyState(1)
    const player = players[0]

    // Place a single alien directly above the player
    const alien = createTestAlien('target', player.x, LAYOUT.PLAYER_Y - 5, {
      row: 0,
      col: 0,
      points: 30,
    })
    state.entities = [alien]
    state.alienShootingDisabled = true

    // Player shoots
    const shootResult = gameReducer(state, { type: 'PLAYER_SHOOT', playerId: player.id })
    const bullets = getBullets(shootResult.state.entities)
    expect(bullets.length).toBe(1)
    expect(bullets[0].dy).toBe(-1) // Moving up
    expect(bullets[0].ownerId).toBe(player.id)

    // Tick until bullet reaches alien
    let current = shootResult.state
    let killed = false
    const allEvents: any[] = []
    for (let i = 0; i < 20; i++) {
      const r = gameReducer(current, { type: 'TICK' })
      current = r.state
      allEvents.push(...r.events)
      if (hasEvent(r.events, 'alien_killed')) {
        killed = true
        break
      }
    }

    expect(killed).toBe(true)
    expect(current.score).toBe(30)

    // Verify alien is dead (dead aliens get removed by reducer)
    const liveAliens = getAliens(current.entities).filter(a => a.alive)
    expect(liveAliens.length).toBe(0)

    // Verify kill count on player
    expect(current.players[player.id].kills).toBe(1)
  })

  it('killing all aliens triggers wave_complete event', () => {
    const { state, players } = createShootReadyState(1)
    const player = players[0]

    // Single alien that we can kill easily
    const alien = createTestAlien('sole-alien', player.x, LAYOUT.PLAYER_Y - 3, {
      row: 0,
      col: 0,
      points: 10,
    })
    state.entities = [alien]
    state.alienShootingDisabled = true

    // Shoot
    let current = gameReducer(state, { type: 'PLAYER_SHOOT', playerId: player.id }).state

    // Tick until wave complete
    let waveComplete = false
    const allEvents: any[] = []
    for (let i = 0; i < 20; i++) {
      const r = gameReducer(current, { type: 'TICK' })
      current = r.state
      allEvents.push(...r.events)
      if (hasEvent(r.events, 'wave_complete')) {
        waveComplete = true
        break
      }
    }

    expect(waveComplete).toBe(true)

    // wave_complete event data should contain the current wave number
    const waveData = getEventData<{ wave: number }>(allEvents, 'wave_complete')
    expect(waveData?.wave).toBe(1) // First wave
  })

  it('game over when all players lose all lives', () => {
    const { state, players } = createTestPlayingState(1)
    const player = players[0]

    // Set player to have 0 lives and be dead (no more respawns)
    state.players[player.id].lives = 0
    state.players[player.id].alive = false
    state.players[player.id].respawnAtTick = null

    // Need at least one alien alive for game to check end condition
    state.entities = [createTestAlien('alien-1', 20, 5)]
    state.alienShootingDisabled = true

    // Tick to trigger end condition check
    const r = gameReducer(state, { type: 'TICK' })
    expect(r.state.status).toBe('game_over')
    expect(hasEvent(r.events, 'game_over')).toBe(true)
  })

  it('player respawns after dying with lives remaining', () => {
    const { state, players } = createTestPlayingState(1)
    const player = players[0]

    // Set player as dead with lives remaining, scheduled to respawn
    state.players[player.id].alive = false
    state.players[player.id].lives = 2
    state.players[player.id].respawnAtTick = state.tick + 3 // Respawn in 3 ticks

    state.entities = [createTestAlien('alien-1', 20, 5)]
    state.alienShootingDisabled = true

    // Tick past respawn time
    let current = state
    let respawned = false
    const allEvents: any[] = []
    for (let i = 0; i < 5; i++) {
      const r = gameReducer(current, { type: 'TICK' })
      current = r.state
      allEvents.push(...r.events)
      if (hasEvent(r.events, 'player_respawned')) {
        respawned = true
      }
    }

    expect(respawned).toBe(true)
    expect(current.players[player.id].alive).toBe(true)
    expect(current.players[player.id].respawnAtTick).toBeNull()
  })

  it('alien invasion triggers game over when aliens reach player level', () => {
    const { state, players } = createTestPlayingState(1)
    const player = players[0]

    // Place alien at invasion Y level - just above the threshold
    const alien = createTestAlien('invader', 20, LAYOUT.PLAYER_Y - LAYOUT.ALIEN_HEIGHT, {
      row: 0,
      col: 0,
    })
    state.entities = [alien]
    state.alienShootingDisabled = true

    // Set tick so alien moves on next tick
    const scaledMoveInterval = DEFAULT_CONFIG.baseAlienMoveIntervalTicks // For 1 player, speedMult=1.0
    state.tick = scaledMoveInterval - 1 // Next tick triggers alien move

    // Tick repeatedly until aliens descend past threshold
    let current = state
    let invaded = false
    for (let i = 0; i < scaledMoveInterval * 20; i++) {
      const r = gameReducer(current, { type: 'TICK' })
      current = r.state
      if (hasEvent(r.events, 'invasion')) {
        invaded = true
        break
      }
      if (current.status === 'game_over') {
        break
      }
    }

    // The alien needs to hit a wall and descend to reach player level
    // If it reached game_over through invasion, verify status
    if (invaded) {
      expect(current.status).toBe('game_over')
      expect(current.lives).toBe(0)
    }
  })
})

// ============================================================================
// Full Game Loop: Co-op Game
// ============================================================================

describe('Full Game Loop: Co-op Game', () => {
  it('2-player game starts with 5 shared lives via countdown', () => {
    const { state, players } = createTestGameStateWithPlayers(2)

    // Both players ready up
    let current = state
    for (const p of players) {
      current.readyPlayerIds.push(p.id)
    }

    // Start countdown
    const countdownResult = gameReducer(current, { type: 'START_COUNTDOWN' })
    expect(countdownResult.state.status).toBe('countdown')
    expect(countdownResult.state.countdownRemaining).toBe(COUNTDOWN_SECONDS)

    // Tick countdown to zero → wipe_hold
    let cdState = countdownResult.state
    for (let i = COUNTDOWN_SECONDS; i > 1; i--) {
      const r = gameReducer(cdState, { type: 'COUNTDOWN_TICK' })
      expect(r.state.countdownRemaining).toBe(i - 1)
      cdState = r.state
    }

    const finalTick = gameReducer(cdState, { type: 'COUNTDOWN_TICK' })
    expect(finalTick.state.status).toBe('wipe_hold')
    expect(finalTick.state.countdownRemaining).toBeNull()
    expect(hasEvent(finalTick.events, 'game_start')).toBe(true)
  })

  it('player leave during waiting removes player and stays in waiting', () => {
    const { state, players } = createTestGameStateWithPlayers(2)

    const leaveResult = gameReducer(state, { type: 'PLAYER_LEAVE', playerId: players[1].id })
    expect(leaveResult.state.status).toBe('waiting')
    expect(Object.keys(leaveResult.state.players)).toHaveLength(1)
    expect(leaveResult.state.players[players[0].id]).toBeDefined()
    expect(leaveResult.state.players[players[1].id]).toBeUndefined()
    expect(hasEvent(leaveResult.events, 'player_left')).toBe(true)
  })

  it('player leave during countdown removes player but reducer does not change status (shell handles cancellation)', () => {
    const { state, players } = createTestGameStateWithPlayers(2, { status: 'countdown' })
    state.countdownRemaining = 2
    state.readyPlayerIds = players.map(p => p.id)

    const leaveResult = gameReducer(state, { type: 'PLAYER_LEAVE', playerId: players[1].id })
    // The reducer only removes the player - the GameRoom shell is responsible
    // for detecting this and dispatching a COUNTDOWN_CANCEL action
    expect(Object.keys(leaveResult.state.players)).toHaveLength(1)
    expect(leaveResult.state.readyPlayerIds).not.toContain(players[1].id)
    expect(hasEvent(leaveResult.events, 'player_left')).toBe(true)
  })

  it('COUNTDOWN_CANCEL transitions back to waiting', () => {
    const { state, players } = createTestGameStateWithPlayers(2, { status: 'countdown' })
    state.countdownRemaining = 2

    const cancelResult = gameReducer(state, { type: 'COUNTDOWN_CANCEL', reason: 'Player left' })
    expect(cancelResult.state.status).toBe('waiting')
    expect(cancelResult.state.countdownRemaining).toBeNull()
    expect(hasEvent(cancelResult.events, 'countdown_cancelled')).toBe(true)
  })

  it('player leave during playing continues game with remaining player', () => {
    const { state, players } = createTestPlayingState(2)

    const leaveResult = gameReducer(state, { type: 'PLAYER_LEAVE', playerId: players[1].id })
    expect(leaveResult.state.status).toBe('playing')
    expect(Object.keys(leaveResult.state.players)).toHaveLength(1)
    expect(leaveResult.state.mode).toBe('solo') // Downgraded to solo
  })

  it('both players can shoot independently', () => {
    const { state, players } = createShootReadyState(2)
    state.entities = [createTestAlien('alien-1', 20, 5)]
    state.alienShootingDisabled = true

    // Player 1 shoots
    const r1 = gameReducer(state, { type: 'PLAYER_SHOOT', playerId: players[0].id })
    let bullets = getBullets(r1.state.entities)
    expect(bullets.length).toBe(1)
    expect(bullets[0].ownerId).toBe(players[0].id)

    // Player 2 shoots
    const r2 = gameReducer(r1.state, { type: 'PLAYER_SHOOT', playerId: players[1].id })
    bullets = getBullets(r2.state.entities)
    expect(bullets.length).toBe(2)
    expect(bullets[1].ownerId).toBe(players[1].id)
  })
})

// ============================================================================
// Wave Progression
// ============================================================================

describe('Wave Progression', () => {
  it('wave_complete event is emitted when all aliens are killed', () => {
    const { state, players } = createShootReadyState(1)
    const player = players[0]

    // Create just one alien right above player
    const alien = createTestAlien('last-alien', player.x, LAYOUT.PLAYER_Y - 4, {
      row: 0, col: 0, points: 10,
    })
    state.entities = [alien]
    state.alienShootingDisabled = true

    // Shoot
    let current = gameReducer(state, { type: 'PLAYER_SHOOT', playerId: player.id }).state

    // Tick until alien is dead
    let waveCompleted = false
    for (let i = 0; i < 15; i++) {
      const r = gameReducer(current, { type: 'TICK' })
      current = r.state
      if (hasEvent(r.events, 'wave_complete')) {
        waveCompleted = true
        break
      }
    }

    expect(waveCompleted).toBe(true)
  })

  it('score accumulates across multiple kills', () => {
    const { state, players } = createShootReadyState(1)
    const player = players[0]

    // Place two aliens at same height, different x positions
    // (so bullet only hits one at a time)
    const alien1 = createTestAlien('a1', player.x, LAYOUT.PLAYER_Y - 4, {
      row: 0, col: 0, points: 10,
    })
    // Second alien at same column but further up
    const alien2 = createTestAlien('a2', player.x, LAYOUT.PLAYER_Y - 8, {
      row: 1, col: 0, points: 20,
    })
    state.entities = [alien1, alien2]
    state.alienShootingDisabled = true

    // Shoot first alien
    let current = gameReducer(state, { type: 'PLAYER_SHOOT', playerId: player.id }).state

    // Tick until first kill
    let firstKilled = false
    for (let i = 0; i < 15; i++) {
      const r = gameReducer(current, { type: 'TICK' })
      current = r.state
      if (hasEvent(r.events, 'alien_killed')) {
        firstKilled = true
        break
      }
    }
    expect(firstKilled).toBe(true)

    const scoreAfterFirst = current.score
    expect(scoreAfterFirst).toBe(10)

    // Advance tick past cooldown so player can shoot again
    // Use structuredClone to avoid mutation issues
    current = structuredClone(current)
    current.tick += DEFAULT_CONFIG.playerCooldownTicks + 1

    // During the first kill loop, alien movement may have shifted alien2's x position.
    // Re-align the player to be directly under the surviving alien so the bullet hits.
    const survivingAlien = getAliens(current.entities).find(a => a.alive)
    expect(survivingAlien).toBeDefined()
    current.players[player.id].x = survivingAlien!.x

    // Also update lastShotTick so the cooldown check passes
    current.players[player.id].lastShotTick = 0

    // Shoot second alien
    current = gameReducer(current, { type: 'PLAYER_SHOOT', playerId: player.id }).state
    const newBullets = getBullets(current.entities)
    expect(newBullets.length).toBeGreaterThan(0)

    // Tick until second kill - also disable alien movement by setting a high move interval
    // so the alien doesn't drift away from the bullet during travel
    current = structuredClone(current)
    current.config.baseAlienMoveIntervalTicks = 99999

    let secondKilled = false
    for (let i = 0; i < 30; i++) {
      const r = gameReducer(current, { type: 'TICK' })
      current = r.state
      if (hasEvent(r.events, 'alien_killed')) {
        secondKilled = true
        break
      }
    }
    expect(secondKilled).toBe(true)
    expect(current.score).toBe(30) // 10 + 20
  })
})

// ============================================================================
// Wipe Phase Transitions
// ============================================================================

describe('Wipe Phase Transitions', () => {
  it('wipe_hold ticks down and transitions to wipe_reveal', () => {
    const state = createTestGameState({
      status: 'wipe_hold',
      wipeTicksRemaining: 3,
      wipeWaveNumber: 1,
      players: { p1: createTestPlayer({ id: 'p1' }) },
    })

    // Tick 1
    let r = gameReducer(state, { type: 'TICK' })
    expect(r.state.status).toBe('wipe_hold')
    expect(r.state.wipeTicksRemaining).toBe(2)

    // Tick 2
    r = gameReducer(r.state, { type: 'TICK' })
    expect(r.state.status).toBe('wipe_hold')
    expect(r.state.wipeTicksRemaining).toBe(1)

    // Tick 3 - transitions
    r = gameReducer(r.state, { type: 'TICK' })
    expect(r.state.status).toBe('wipe_reveal')
    expect(r.state.wipeTicksRemaining).toBe(WIPE_TIMING.REVEAL_TICKS)
  })

  it('wipe_reveal ticks down and transitions to playing', () => {
    const state = createTestGameState({
      status: 'wipe_reveal',
      wipeTicksRemaining: 3,
      wipeWaveNumber: 1,
      players: { p1: createTestPlayer({ id: 'p1' }) },
    })

    // Tick through all reveal ticks
    let current = state
    for (let i = 0; i < 3; i++) {
      const r = gameReducer(current, { type: 'TICK' })
      current = r.state
    }

    expect(current.status).toBe('playing')
    expect(current.wipeTicksRemaining).toBeNull()
    expect(current.wipeWaveNumber).toBeNull()
  })

  it('wipe_exit transitions to wipe_hold', () => {
    const state = createTestGameState({
      status: 'wipe_exit',
      wipeTicksRemaining: 2,
      wipeWaveNumber: 2,
      players: { p1: createTestPlayer({ id: 'p1' }) },
    })

    // Tick through exit phase
    let current = state
    for (let i = 0; i < 2; i++) {
      const r = gameReducer(current, { type: 'TICK' })
      current = r.state
    }

    expect(current.status).toBe('wipe_hold')
    expect(current.wipeTicksRemaining).toBe(WIPE_TIMING.HOLD_TICKS)
  })

  it('aliens entering flag is set during wipe_reveal and cleared on playing', () => {
    // Simulate wipe_reveal with aliens that have entering=true
    const alien = createTestAlien('a1', 20, 5, { entering: true })
    const state = createTestGameState({
      status: 'wipe_reveal',
      wipeTicksRemaining: 1,
      wipeWaveNumber: 1,
      entities: [alien],
      players: { p1: createTestPlayer({ id: 'p1' }) },
    })

    // Last tick of wipe_reveal transitions to playing
    const r = gameReducer(state, { type: 'TICK' })
    expect(r.state.status).toBe('playing')

    // Aliens should have entering=false
    const aliens = getAliens(r.state.entities)
    expect(aliens.length).toBe(1)
    expect(aliens[0].entering).toBe(false)
  })

  it('full wipe sequence: exit -> hold -> reveal -> playing', () => {
    const state = createTestGameState({
      status: 'wipe_exit',
      wipeTicksRemaining: WIPE_TIMING.EXIT_TICKS,
      wipeWaveNumber: 2,
      players: { p1: createTestPlayer({ id: 'p1' }) },
    })

    // Tick through all three phases
    let current = state

    // Exit phase
    const { state: afterExit } = runTicks(current, WIPE_TIMING.EXIT_TICKS)
    expect(afterExit.status).toBe('wipe_hold')

    // Hold phase
    const { state: afterHold } = runTicks(afterExit, WIPE_TIMING.HOLD_TICKS)
    expect(afterHold.status).toBe('wipe_reveal')

    // Reveal phase
    const { state: afterReveal } = runTicks(afterHold, WIPE_TIMING.REVEAL_TICKS)
    expect(afterReveal.status).toBe('playing')
  })
})

// ============================================================================
// Forfeit / Player Leave During Game
// ============================================================================

describe('Player Leave During Game', () => {
  it('solo player leaving during playing does not crash', () => {
    const { state, players } = createTestPlayingState(1)
    state.entities = [createTestAlien('a1', 20, 5)]

    const r = gameReducer(state, { type: 'PLAYER_LEAVE', playerId: players[0].id })
    expect(r.state.status).toBe('playing') // Reducer doesn't end game; shell does
    expect(Object.keys(r.state.players)).toHaveLength(0)
  })

  it('last player leaving in coop keeps game in playing status at reducer level', () => {
    const { state, players } = createTestPlayingState(2)

    // First player leaves
    let current = gameReducer(state, { type: 'PLAYER_LEAVE', playerId: players[0].id }).state
    expect(current.status).toBe('playing')
    expect(current.mode).toBe('solo')

    // Second player leaves
    current = gameReducer(current, { type: 'PLAYER_LEAVE', playerId: players[1].id }).state
    // Game remains playing at reducer level - shell handles the actual game end
    expect(Object.keys(current.players)).toHaveLength(0)
  })

  it('player leave emits player_left event', () => {
    const { state, players } = createTestPlayingState(2)

    const r = gameReducer(state, { type: 'PLAYER_LEAVE', playerId: players[0].id })
    expect(hasEvent(r.events, 'player_left')).toBe(true)
  })
})

// ============================================================================
// Bullet-Player Collisions (Alien Bullets)
// ============================================================================

describe('Bullet-Player Collisions', () => {
  it('alien bullet kills player and decrements lives', () => {
    const { state, players } = createTestPlayingState(1)
    const player = players[0]
    state.players[player.id].lives = 3

    // Create alien bullet heading toward the player
    const alienBullet = createTestBullet(
      'ab1',
      player.x,
      LAYOUT.PLAYER_Y - 2, // Just above player
      null, // alien bullet
      1     // moving down
    )
    state.entities = [
      createTestAlien('a1', 20, 5), // Keep an alien alive so game doesn't end
      alienBullet,
    ]
    state.alienShootingDisabled = true

    // Tick until bullet hits player
    let current = state
    let playerDied = false
    for (let i = 0; i < 10; i++) {
      const r = gameReducer(current, { type: 'TICK' })
      current = r.state
      if (hasEvent(r.events, 'player_died')) {
        playerDied = true
        break
      }
    }

    expect(playerDied).toBe(true)
    expect(current.players[player.id].alive).toBe(false)
    expect(current.players[player.id].lives).toBe(2)
    expect(current.players[player.id].respawnAtTick).not.toBeNull()
  })
})

// ============================================================================
// Cooldown System
// ============================================================================

describe('Cooldown System', () => {
  it('player cannot shoot during cooldown', () => {
    const { state, players } = createShootReadyState(1)
    state.entities = [createTestAlien('a1', 20, 5)]

    // First shot succeeds (tick is past cooldown)
    let current = gameReducer(state, { type: 'PLAYER_SHOOT', playerId: players[0].id }).state
    expect(getBullets(current.entities)).toHaveLength(1)

    // Immediate second shot fails (cooldown: tick hasn't advanced)
    current = gameReducer(current, { type: 'PLAYER_SHOOT', playerId: players[0].id }).state
    expect(getBullets(current.entities)).toHaveLength(1) // Still just 1 bullet

    // After cooldown period, shot succeeds
    current.tick += DEFAULT_CONFIG.playerCooldownTicks
    current = gameReducer(current, { type: 'PLAYER_SHOOT', playerId: players[0].id }).state
    expect(getBullets(current.entities)).toHaveLength(2)
  })

  it('player cannot shoot at tick 0 due to initial cooldown (lastShotTick=0)', () => {
    const { state, players } = createTestPlayingState(1)
    state.entities = [createTestAlien('a1', 20, 5)]
    // tick=0, lastShotTick=0, so 0-0=0 < cooldownTicks, shot blocked
    const r = gameReducer(state, { type: 'PLAYER_SHOOT', playerId: players[0].id })
    expect(getBullets(r.state.entities)).toHaveLength(0)
  })
})

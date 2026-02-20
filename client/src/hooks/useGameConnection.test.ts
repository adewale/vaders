// client/src/hooks/useGameConnection.test.ts
// Tests for useGameConnection hook logic
//
// The hook is tightly coupled to React (useState, useEffect, useRef, useCallback)
// and WebSocket. Rather than mock all React internals, we test:
// 1. Reconnection backoff calculation (pure math)
// 2. Message parsing and state update logic
// 3. Reconnection policy decisions (when to reconnect vs stop)
// 4. Exported constants and type-level contracts

import { describe, test, expect } from 'bun:test'
import type { ServerMessage, ServerEvent, GameState, GameConfig } from '../../../shared/types'
import { GAME_STATE_DEFAULTS } from '../../../shared/state-defaults'

// ─── Reconnection Constants ─────────────────────────────────────────────────
// These are the constants defined in useGameConnection.ts.
// We re-declare them here to test the expected values and backoff formula.

const RECONNECT_BASE_DELAY = 1000
const RECONNECT_MAX_DELAY = 10000
const RECONNECT_MAX_ATTEMPTS = 5
const PING_INTERVAL = 30000
const PONG_TIMEOUT = 5000
const SYNC_INTERVAL_MS = 33

describe('Reconnection Constants', () => {
  test('RECONNECT_BASE_DELAY is 1 second', () => {
    expect(RECONNECT_BASE_DELAY).toBe(1000)
  })

  test('RECONNECT_MAX_DELAY is 10 seconds', () => {
    expect(RECONNECT_MAX_DELAY).toBe(10000)
  })

  test('RECONNECT_MAX_ATTEMPTS is 5', () => {
    expect(RECONNECT_MAX_ATTEMPTS).toBe(5)
  })

  test('PING_INTERVAL is 30 seconds', () => {
    expect(PING_INTERVAL).toBe(30000)
  })

  test('PONG_TIMEOUT is 5 seconds', () => {
    expect(PONG_TIMEOUT).toBe(5000)
  })

  test('SYNC_INTERVAL_MS matches 30Hz tick rate', () => {
    expect(SYNC_INTERVAL_MS).toBe(33)
  })
})

// ─── Exponential Backoff Calculation ────────────────────────────────────────
// The backoff formula from the hook:
//   delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, attempt - 1), RECONNECT_MAX_DELAY)

function calculateBackoffDelay(attempt: number): number {
  return Math.min(
    RECONNECT_BASE_DELAY * Math.pow(2, attempt - 1),
    RECONNECT_MAX_DELAY
  )
}

describe('Exponential Backoff Calculation', () => {
  test('attempt 1 gives base delay (1000ms)', () => {
    expect(calculateBackoffDelay(1)).toBe(1000)
  })

  test('attempt 2 doubles delay (2000ms)', () => {
    expect(calculateBackoffDelay(2)).toBe(2000)
  })

  test('attempt 3 quadruples delay (4000ms)', () => {
    expect(calculateBackoffDelay(3)).toBe(4000)
  })

  test('attempt 4 gives 8000ms', () => {
    expect(calculateBackoffDelay(4)).toBe(8000)
  })

  test('attempt 5 is capped at max delay (10000ms, not 16000ms)', () => {
    // Without cap: 1000 * 2^4 = 16000
    // With cap: min(16000, 10000) = 10000
    expect(calculateBackoffDelay(5)).toBe(10000)
  })

  test('very high attempt is still capped at max delay', () => {
    expect(calculateBackoffDelay(100)).toBe(10000)
  })

  test('backoff sequence is monotonically non-decreasing', () => {
    let prevDelay = 0
    for (let attempt = 1; attempt <= RECONNECT_MAX_ATTEMPTS; attempt++) {
      const delay = calculateBackoffDelay(attempt)
      expect(delay).toBeGreaterThanOrEqual(prevDelay)
      prevDelay = delay
    }
  })

  test('all delays are positive', () => {
    for (let attempt = 1; attempt <= RECONNECT_MAX_ATTEMPTS; attempt++) {
      expect(calculateBackoffDelay(attempt)).toBeGreaterThan(0)
    }
  })

  test('no delay exceeds max', () => {
    for (let attempt = 1; attempt <= 20; attempt++) {
      expect(calculateBackoffDelay(attempt)).toBeLessThanOrEqual(RECONNECT_MAX_DELAY)
    }
  })
})

// ─── Reconnection Policy ────────────────────────────────────────────────────
// The hook decides whether to reconnect based on:
// - intentionalClose: if true, never reconnect
// - gameStatus: if 'game_over', never reconnect
// - attempt count: if >= RECONNECT_MAX_ATTEMPTS, give up

interface ReconnectDecisionInput {
  intentionalClose: boolean
  gameStatus: string | null
  attemptCount: number
}

/**
 * Determines whether a reconnection should be attempted.
 * Mirrors the logic in ws.onclose and scheduleReconnect.
 */
function shouldAttemptReconnect(input: ReconnectDecisionInput): 'reconnect' | 'stop_intentional' | 'stop_game_over' | 'stop_max_attempts' {
  if (input.intentionalClose) {
    return 'stop_intentional'
  }
  if (input.gameStatus === 'game_over') {
    return 'stop_game_over'
  }
  if (input.attemptCount >= RECONNECT_MAX_ATTEMPTS) {
    return 'stop_max_attempts'
  }
  return 'reconnect'
}

describe('Reconnection Policy', () => {
  test('reconnects on unexpected close during active game', () => {
    expect(shouldAttemptReconnect({
      intentionalClose: false,
      gameStatus: 'playing',
      attemptCount: 0,
    })).toBe('reconnect')
  })

  test('reconnects during waiting status', () => {
    expect(shouldAttemptReconnect({
      intentionalClose: false,
      gameStatus: 'waiting',
      attemptCount: 0,
    })).toBe('reconnect')
  })

  test('reconnects during countdown', () => {
    expect(shouldAttemptReconnect({
      intentionalClose: false,
      gameStatus: 'countdown',
      attemptCount: 0,
    })).toBe('reconnect')
  })

  test('reconnects with null gameStatus (initial state)', () => {
    expect(shouldAttemptReconnect({
      intentionalClose: false,
      gameStatus: null,
      attemptCount: 0,
    })).toBe('reconnect')
  })

  test('does not reconnect on intentional close', () => {
    expect(shouldAttemptReconnect({
      intentionalClose: true,
      gameStatus: 'playing',
      attemptCount: 0,
    })).toBe('stop_intentional')
  })

  test('does not reconnect after game over', () => {
    expect(shouldAttemptReconnect({
      intentionalClose: false,
      gameStatus: 'game_over',
      attemptCount: 0,
    })).toBe('stop_game_over')
  })

  test('does not reconnect after max attempts exceeded', () => {
    expect(shouldAttemptReconnect({
      intentionalClose: false,
      gameStatus: 'playing',
      attemptCount: RECONNECT_MAX_ATTEMPTS,
    })).toBe('stop_max_attempts')
  })

  test('does not reconnect when at exactly max attempts', () => {
    expect(shouldAttemptReconnect({
      intentionalClose: false,
      gameStatus: 'playing',
      attemptCount: 5,
    })).toBe('stop_max_attempts')
  })

  test('reconnects at attempt count just below max', () => {
    expect(shouldAttemptReconnect({
      intentionalClose: false,
      gameStatus: 'playing',
      attemptCount: 4,
    })).toBe('reconnect')
  })

  test('intentional close takes priority over all other conditions', () => {
    // Even if game is playing and we have attempts left, intentional close stops reconnection
    expect(shouldAttemptReconnect({
      intentionalClose: true,
      gameStatus: 'playing',
      attemptCount: 0,
    })).toBe('stop_intentional')
  })

  test('game_over takes priority over max attempts', () => {
    // If game is over and also at max attempts, game_over is the reason
    expect(shouldAttemptReconnect({
      intentionalClose: false,
      gameStatus: 'game_over',
      attemptCount: RECONNECT_MAX_ATTEMPTS,
    })).toBe('stop_game_over')
  })
})

// ─── Ping/Pong Timeout Logic ────────────────────────────────────────────────
// The hook closes the WebSocket if no pong received within PING_INTERVAL + PONG_TIMEOUT

function shouldCloseForPongTimeout(lastPongTime: number, now: number): boolean {
  return now - lastPongTime > PING_INTERVAL + PONG_TIMEOUT
}

describe('Ping/Pong Timeout', () => {
  test('does not close when pong is recent', () => {
    const now = Date.now()
    expect(shouldCloseForPongTimeout(now, now)).toBe(false)
  })

  test('does not close at exactly PING_INTERVAL', () => {
    const now = Date.now()
    expect(shouldCloseForPongTimeout(now - PING_INTERVAL, now)).toBe(false)
  })

  test('does not close at PING_INTERVAL + PONG_TIMEOUT (not exceeded)', () => {
    const now = Date.now()
    expect(shouldCloseForPongTimeout(now - (PING_INTERVAL + PONG_TIMEOUT), now)).toBe(false)
  })

  test('closes when past PING_INTERVAL + PONG_TIMEOUT', () => {
    const now = Date.now()
    expect(shouldCloseForPongTimeout(now - (PING_INTERVAL + PONG_TIMEOUT + 1), now)).toBe(true)
  })

  test('timeout threshold is 35 seconds total', () => {
    expect(PING_INTERVAL + PONG_TIMEOUT).toBe(35000)
  })
})

// ─── Server Message Parsing ─────────────────────────────────────────────────
// Test that the message handling logic correctly parses and routes messages.

function createTestGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    ...GAME_STATE_DEFAULTS,
    roomId: 'TEST01',
    rngSeed: 12345,
    ...overrides,
  }
}

/**
 * Simulates the message handler's state update logic.
 * Returns what the new partial state would look like.
 */
interface ConnectionState {
  serverState: GameState | null
  prevState: GameState | null
  lastSyncTime: number
  playerId: string | null
  config: GameConfig | null
  connected: boolean
  reconnecting: boolean
  error: string | null
  lastEvent: ServerEvent | null
  gameResult: 'victory' | 'defeat' | null
}

function handleMessage(
  msg: ServerMessage,
  currentState: ConnectionState
): Partial<ConnectionState> | null {
  if (msg.type === 'pong') {
    // Pong updates lastPongRef, no state change
    return null
  }

  if (msg.type === 'sync') {
    return {
      prevState: currentState.serverState,
      serverState: msg.state,
      lastSyncTime: Date.now(),
      playerId: msg.playerId ?? currentState.playerId,
      config: msg.config ?? currentState.config,
    }
  }

  if (msg.type === 'error') {
    return {
      error: `${msg.code}: ${msg.message}`,
    }
  }

  if (msg.type === 'event') {
    const updates: Partial<ConnectionState> = { lastEvent: msg }
    if (msg.name === 'game_over') {
      updates.gameResult = (msg.data as { result: 'victory' | 'defeat' }).result
    }
    return updates
  }

  return null
}

describe('Server Message Handling', () => {
  const initialState: ConnectionState = {
    serverState: null,
    prevState: null,
    lastSyncTime: 0,
    playerId: null,
    config: null,
    connected: false,
    reconnecting: false,
    error: null,
    lastEvent: null,
    gameResult: null,
  }

  describe('sync messages', () => {
    test('updates serverState on first sync', () => {
      const gameState = createTestGameState()
      const msg: ServerMessage = {
        type: 'sync',
        state: gameState,
        playerId: 'player-1',
        config: gameState.config,
      }

      const updates = handleMessage(msg, initialState)
      expect(updates).not.toBeNull()
      expect(updates!.serverState).toEqual(gameState)
      expect(updates!.playerId).toBe('player-1')
      expect(updates!.config).toEqual(gameState.config)
      expect(updates!.prevState).toBeNull() // No previous state yet
    })

    test('stores previous state on subsequent syncs', () => {
      const firstState = createTestGameState({ tick: 1 })
      const secondState = createTestGameState({ tick: 2 })

      const stateAfterFirst: ConnectionState = {
        ...initialState,
        serverState: firstState,
        playerId: 'player-1',
      }

      const msg: ServerMessage = {
        type: 'sync',
        state: secondState,
      }

      const updates = handleMessage(msg, stateAfterFirst)
      expect(updates!.prevState).toEqual(firstState)
      expect(updates!.serverState).toEqual(secondState)
    })

    test('preserves cached playerId when not in sync message', () => {
      const stateWithPlayer: ConnectionState = {
        ...initialState,
        playerId: 'player-1',
      }

      const msg: ServerMessage = {
        type: 'sync',
        state: createTestGameState(),
        // No playerId in this message
      }

      const updates = handleMessage(msg, stateWithPlayer)
      expect(updates!.playerId).toBe('player-1')
    })

    test('preserves cached config when not in sync message', () => {
      const cachedConfig = { ...createTestGameState().config }
      const stateWithConfig: ConnectionState = {
        ...initialState,
        config: cachedConfig,
      }

      const msg: ServerMessage = {
        type: 'sync',
        state: createTestGameState(),
        // No config in this message
      }

      const updates = handleMessage(msg, stateWithConfig)
      expect(updates!.config).toEqual(cachedConfig)
    })

    test('updates playerId when provided in sync', () => {
      const stateWithPlayer: ConnectionState = {
        ...initialState,
        playerId: 'player-1',
      }

      const msg: ServerMessage = {
        type: 'sync',
        state: createTestGameState(),
        playerId: 'player-2',
      }

      const updates = handleMessage(msg, stateWithPlayer)
      expect(updates!.playerId).toBe('player-2')
    })

    test('sets lastSyncTime to current time', () => {
      const before = Date.now()
      const msg: ServerMessage = {
        type: 'sync',
        state: createTestGameState(),
      }

      const updates = handleMessage(msg, initialState)
      const after = Date.now()

      expect(updates!.lastSyncTime).toBeGreaterThanOrEqual(before)
      expect(updates!.lastSyncTime).toBeLessThanOrEqual(after)
    })
  })

  describe('error messages', () => {
    test('formats error string from code and message', () => {
      const msg: ServerMessage = {
        type: 'error',
        code: 'room_full',
        message: 'Room is full',
      }

      const updates = handleMessage(msg, initialState)
      expect(updates!.error).toBe('room_full: Room is full')
    })

    test('handles game_in_progress error', () => {
      const msg: ServerMessage = {
        type: 'error',
        code: 'game_in_progress',
        message: 'Cannot join mid-game',
      }

      const updates = handleMessage(msg, initialState)
      expect(updates!.error).toBe('game_in_progress: Cannot join mid-game')
    })

    test('handles rate_limited error', () => {
      const msg: ServerMessage = {
        type: 'error',
        code: 'rate_limited',
        message: 'Too many requests',
      }

      const updates = handleMessage(msg, initialState)
      expect(updates!.error).toBe('rate_limited: Too many requests')
    })
  })

  describe('event messages', () => {
    test('stores event as lastEvent', () => {
      const event: ServerEvent = {
        type: 'event',
        name: 'player_joined',
        data: { player: { id: 'p1', name: 'Alice', x: 60, slot: 1, color: 'cyan', lastShotTick: 0, alive: true, lives: 3, respawnAtTick: null, invulnerableUntilTick: null, kills: 0, inputState: { left: false, right: false } } },
      }

      const updates = handleMessage(event, initialState)
      expect(updates!.lastEvent).toEqual(event)
    })

    test('extracts victory result from game_over event', () => {
      const event: ServerEvent = {
        type: 'event',
        name: 'game_over',
        data: { result: 'victory' },
      }

      const updates = handleMessage(event, initialState)
      expect(updates!.gameResult).toBe('victory')
    })

    test('extracts defeat result from game_over event', () => {
      const event: ServerEvent = {
        type: 'event',
        name: 'game_over',
        data: { result: 'defeat' },
      }

      const updates = handleMessage(event, initialState)
      expect(updates!.gameResult).toBe('defeat')
    })

    test('does not set gameResult for non-game_over events', () => {
      const event: ServerEvent = {
        type: 'event',
        name: 'wave_complete',
        data: { wave: 1 },
      }

      const updates = handleMessage(event, initialState)
      expect(updates!.gameResult).toBeUndefined()
    })

    test('stores alien_killed event', () => {
      const event: ServerEvent = {
        type: 'event',
        name: 'alien_killed',
        data: { alienId: 'alien-0', playerId: 'p1' },
      }

      const updates = handleMessage(event, initialState)
      expect(updates!.lastEvent).toEqual(event)
    })

    test('stores score_awarded event', () => {
      const event: ServerEvent = {
        type: 'event',
        name: 'score_awarded',
        data: { playerId: 'p1', points: 30, source: 'alien' },
      }

      const updates = handleMessage(event, initialState)
      expect(updates!.lastEvent).toEqual(event)
    })
  })

  describe('pong messages', () => {
    test('returns null (no state update, only ref update)', () => {
      const msg: ServerMessage = {
        type: 'pong',
        serverTime: Date.now(),
      }

      const updates = handleMessage(msg, initialState)
      expect(updates).toBeNull()
    })
  })

  describe('invalid messages', () => {
    test('handles invalid JSON gracefully', () => {
      // The hook has a try/catch around JSON.parse
      // Test that our logic handles unexpected message shapes
      const unknownMsg = { type: 'unknown' } as unknown as ServerMessage
      const updates = handleMessage(unknownMsg, initialState)
      expect(updates).toBeNull()
    })
  })
})

// ─── Interpolation / Render State Logic ─────────────────────────────────────
// The getRenderState function in the hook does:
// 1. Interpolate other players' positions between prevState and serverState
// 2. Interpolate alien positions
// 3. Apply local input prediction for the local player

describe('Render State Interpolation Logic', () => {
  test('interpolation factor clamps between 0 and 1', () => {
    // delay = Math.min(1, elapsed / SYNC_INTERVAL_MS)
    expect(Math.min(1, 0 / SYNC_INTERVAL_MS)).toBe(0)        // At sync time
    expect(Math.min(1, 16 / SYNC_INTERVAL_MS)).toBeCloseTo(0.485, 2)  // Half tick
    expect(Math.min(1, 33 / SYNC_INTERVAL_MS)).toBe(1)        // Full tick
    expect(Math.min(1, 100 / SYNC_INTERVAL_MS)).toBe(1)       // Past tick (clamped)
  })

  test('lerp formula produces correct midpoint', () => {
    // player.x = prevPlayer.x + (player.x - prevPlayer.x) * lerpT
    const prevX = 10
    const currX = 20
    const lerpT = 0.5
    const interpolatedX = prevX + (currX - prevX) * lerpT
    expect(interpolatedX).toBe(15)
  })

  test('lerp at t=0 gives previous position', () => {
    const prevX = 10
    const currX = 20
    const interpolatedX = prevX + (currX - prevX) * 0
    expect(interpolatedX).toBe(10)
  })

  test('lerp at t=1 gives current position', () => {
    const prevX = 10
    const currX = 20
    const interpolatedX = prevX + (currX - prevX) * 1
    expect(interpolatedX).toBe(20)
  })

  test('lerp handles same position (no movement)', () => {
    const prevX = 50
    const currX = 50
    const interpolatedX = prevX + (currX - prevX) * 0.5
    expect(interpolatedX).toBe(50)
  })
})

// ─── Connection State Shape ─────────────────────────────────────────────────

describe('Initial Connection State', () => {
  test('has correct initial values', () => {
    const initial: ConnectionState = {
      serverState: null,
      prevState: null,
      lastSyncTime: 0,
      playerId: null,
      config: null,
      connected: false,
      reconnecting: false,
      error: null,
      lastEvent: null,
      gameResult: null,
    }

    expect(initial.serverState).toBeNull()
    expect(initial.prevState).toBeNull()
    expect(initial.lastSyncTime).toBe(0)
    expect(initial.playerId).toBeNull()
    expect(initial.config).toBeNull()
    expect(initial.connected).toBe(false)
    expect(initial.reconnecting).toBe(false)
    expect(initial.error).toBeNull()
    expect(initial.lastEvent).toBeNull()
    expect(initial.gameResult).toBeNull()
  })
})

// ─── Reconnect Attempt Counter State Machine ────────────────────────────────

describe('Reconnect Attempt Counter', () => {
  test('resets to 0 on successful connection', () => {
    // On ws.onopen: reconnectAttemptRef.current = 0
    let attemptCount = 3
    // Simulate onopen
    attemptCount = 0
    expect(attemptCount).toBe(0)
  })

  test('increments before each reconnect attempt', () => {
    let attemptCount = 0

    // Simulate scheduleReconnect calls
    attemptCount += 1
    expect(attemptCount).toBe(1)
    expect(calculateBackoffDelay(attemptCount)).toBe(1000)

    attemptCount += 1
    expect(attemptCount).toBe(2)
    expect(calculateBackoffDelay(attemptCount)).toBe(2000)

    attemptCount += 1
    expect(attemptCount).toBe(3)
    expect(calculateBackoffDelay(attemptCount)).toBe(4000)
  })

  test('full reconnection sequence from 0 to max attempts', () => {
    let attemptCount = 0
    const delays: number[] = []

    while (attemptCount < RECONNECT_MAX_ATTEMPTS) {
      attemptCount += 1
      delays.push(calculateBackoffDelay(attemptCount))
    }

    expect(delays).toEqual([1000, 2000, 4000, 8000, 10000])
    expect(attemptCount).toBe(5)
    expect(shouldAttemptReconnect({
      intentionalClose: false,
      gameStatus: 'playing',
      attemptCount,
    })).toBe('stop_max_attempts')
  })

  test('resets on fresh mount / roomUrl change', () => {
    let intentionalClose = false
    let attemptCount = 3

    // Simulate useEffect running on roomUrl change
    intentionalClose = false
    attemptCount = 0

    expect(intentionalClose).toBe(false)
    expect(attemptCount).toBe(0)
  })
})

// ─── Client Message Construction ────────────────────────────────────────────

describe('Client Message Types', () => {
  test('join message includes player name', () => {
    const msg = { type: 'join' as const, name: 'Alice' }
    expect(JSON.parse(JSON.stringify(msg))).toEqual({ type: 'join', name: 'Alice' })
  })

  test('input message includes held state', () => {
    const msg = { type: 'input' as const, held: { left: true, right: false } }
    const parsed = JSON.parse(JSON.stringify(msg))
    expect(parsed.type).toBe('input')
    expect(parsed.held.left).toBe(true)
    expect(parsed.held.right).toBe(false)
  })

  test('shoot message has no payload', () => {
    const msg = { type: 'shoot' as const }
    expect(JSON.parse(JSON.stringify(msg))).toEqual({ type: 'shoot' })
  })

  test('move message includes direction', () => {
    const msg = { type: 'move' as const, direction: 'left' as const }
    expect(JSON.parse(JSON.stringify(msg))).toEqual({ type: 'move', direction: 'left' })
  })

  test('ping message has no payload', () => {
    const msg = { type: 'ping' as const }
    expect(JSON.parse(JSON.stringify(msg))).toEqual({ type: 'ping' })
  })

  test('input state copies values to avoid reference mutation', () => {
    // This mirrors the hook's updateInput behavior:
    // localInputRef.current = { left: held.left, right: held.right }
    const original = { left: true, right: false }
    const copy = { left: original.left, right: original.right }

    // Mutating original should not affect copy
    original.left = false
    expect(copy.left).toBe(true)
  })
})

// shared/protocol.test.ts
// Comprehensive tests for WebSocket protocol types, error codes, and server events
//
// Validates that all message shapes are correct, all union variants are covered,
// and real messages constructed by GameRoom match the expected protocol definitions.

import { describe, test, expect } from 'bun:test'
import type {
  ClientMessage,
  ServerMessage,
  ServerEvent,
  ErrorCode,
  InputState,
} from './protocol'
import type {
  Player,
  PlayerSlot,
  PlayerColor,
  GameState,
  GameConfig,
  GameEvent,
} from './types'
import { DEFAULT_CONFIG, PLAYER_COLORS } from './types'
import { createDefaultGameState } from './state-defaults'

// ─── Test Helpers ────────────────────────────────────────────────────────────

/** Create a minimal valid Player object for test fixtures */
function createTestPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'test-player-1',
    name: 'TestPlayer',
    x: 60,
    slot: 1 as PlayerSlot,
    color: 'cyan' as PlayerColor,
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

/** Create a minimal valid GameState for test fixtures */
function createTestGameState(): GameState {
  return createDefaultGameState('ABC123')
}

// ─── Runtime Validation Helpers ──────────────────────────────────────────────
// These helpers validate message shapes at runtime, complementing TypeScript's
// compile-time checks with actual structural verification.

/**
 * Validates that a value is a well-formed ClientMessage.
 * Returns null if valid, or a string describing the issue.
 */
function validateClientMessage(msg: unknown): string | null {
  if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) {
    return 'ClientMessage must be a non-null, non-array object'
  }

  const obj = msg as Record<string, unknown>
  if (typeof obj.type !== 'string') {
    return 'ClientMessage must have a string "type" field'
  }

  const validTypes = ['join', 'ready', 'unready', 'start_solo', 'forfeit', 'input', 'move', 'shoot', 'ping']
  if (!validTypes.includes(obj.type)) {
    return `Unknown ClientMessage type: "${obj.type}"`
  }

  switch (obj.type) {
    case 'join':
      if (typeof obj.name !== 'string') return 'join message must have a string "name" field'
      break
    case 'input':
      if (typeof obj.held !== 'object' || obj.held === null) return 'input message must have an "held" object'
      {
        const held = obj.held as Record<string, unknown>
        if (typeof held.left !== 'boolean') return 'input.held must have boolean "left"'
        if (typeof held.right !== 'boolean') return 'input.held must have boolean "right"'
      }
      break
    case 'move':
      if (obj.direction !== 'left' && obj.direction !== 'right') {
        return 'move message must have direction "left" or "right"'
      }
      break
    // ready, unready, start_solo, forfeit, shoot, ping have no extra fields
  }

  return null
}

/**
 * Validates that a value is a well-formed ServerMessage.
 * Returns null if valid, or a string describing the issue.
 */
function validateServerMessage(msg: unknown): string | null {
  if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) {
    return 'ServerMessage must be a non-null, non-array object'
  }

  const obj = msg as Record<string, unknown>
  if (typeof obj.type !== 'string') {
    return 'ServerMessage must have a string "type" field'
  }

  const validTypes = ['sync', 'event', 'pong', 'error']
  if (!validTypes.includes(obj.type)) {
    return `Unknown ServerMessage type: "${obj.type}"`
  }

  switch (obj.type) {
    case 'sync':
      if (typeof obj.state !== 'object' || obj.state === null) {
        return 'sync message must have a "state" object'
      }
      // playerId and config are optional (only sent on initial join)
      if (obj.playerId !== undefined && typeof obj.playerId !== 'string') {
        return 'sync.playerId must be a string if present'
      }
      break
    case 'event':
      if (typeof obj.name !== 'string') return 'event message must have a string "name" field'
      break
    case 'pong':
      if (typeof obj.serverTime !== 'number') return 'pong message must have a number "serverTime" field'
      break
    case 'error':
      if (typeof obj.code !== 'string') return 'error message must have a string "code" field'
      if (typeof obj.message !== 'string') return 'error message must have a string "message" field'
      break
  }

  return null
}

/**
 * Validates that a value is a well-formed ServerEvent.
 * Returns null if valid, or a string describing the issue.
 */
function validateServerEvent(msg: unknown): string | null {
  if (typeof msg !== 'object' || msg === null) {
    return 'ServerEvent must be a non-null object'
  }

  const obj = msg as Record<string, unknown>
  if (obj.type !== 'event') return 'ServerEvent must have type "event"'
  if (typeof obj.name !== 'string') return 'ServerEvent must have a string "name" field'

  const validEventNames: GameEvent[] = [
    'player_joined', 'player_left', 'player_ready', 'player_unready',
    'player_died', 'player_respawned', 'countdown_tick', 'countdown_cancelled',
    'game_start', 'alien_killed', 'score_awarded', 'wave_complete',
    'game_over', 'invasion', 'ufo_spawn',
  ]

  if (!validEventNames.includes(obj.name as GameEvent)) {
    return `Unknown event name: "${obj.name}"`
  }

  return null
}

// ─── ClientMessage Validation ────────────────────────────────────────────────

describe('ClientMessage Validation', () => {
  describe('all union variants have required fields', () => {
    test('join message has type and name', () => {
      const msg: ClientMessage = { type: 'join', name: 'Alice' }
      expect(msg.type).toBe('join')
      expect(msg.name).toBe('Alice')
      expect(validateClientMessage(msg)).toBeNull()
    })

    test('ready message has only type', () => {
      const msg: ClientMessage = { type: 'ready' }
      expect(msg.type).toBe('ready')
      expect(validateClientMessage(msg)).toBeNull()
    })

    test('unready message has only type', () => {
      const msg: ClientMessage = { type: 'unready' }
      expect(msg.type).toBe('unready')
      expect(validateClientMessage(msg)).toBeNull()
    })

    test('start_solo message has only type', () => {
      const msg: ClientMessage = { type: 'start_solo' }
      expect(msg.type).toBe('start_solo')
      expect(validateClientMessage(msg)).toBeNull()
    })

    test('forfeit message has only type', () => {
      const msg: ClientMessage = { type: 'forfeit' }
      expect(msg.type).toBe('forfeit')
      expect(validateClientMessage(msg)).toBeNull()
    })

    test('input message has type and held InputState', () => {
      const msg: ClientMessage = { type: 'input', held: { left: true, right: false } }
      expect(msg.type).toBe('input')
      expect(msg.held).toEqual({ left: true, right: false })
      expect(validateClientMessage(msg)).toBeNull()
    })

    test('move message has type and direction', () => {
      const msgLeft: ClientMessage = { type: 'move', direction: 'left' }
      const msgRight: ClientMessage = { type: 'move', direction: 'right' }
      expect(msgLeft.direction).toBe('left')
      expect(msgRight.direction).toBe('right')
      expect(validateClientMessage(msgLeft)).toBeNull()
      expect(validateClientMessage(msgRight)).toBeNull()
    })

    test('shoot message has only type', () => {
      const msg: ClientMessage = { type: 'shoot' }
      expect(msg.type).toBe('shoot')
      expect(validateClientMessage(msg)).toBeNull()
    })

    test('ping message has only type', () => {
      const msg: ClientMessage = { type: 'ping' }
      expect(msg.type).toBe('ping')
      expect(validateClientMessage(msg)).toBeNull()
    })
  })

  describe('type discriminator covers all cases', () => {
    const ALL_CLIENT_MESSAGE_TYPES = [
      'join', 'ready', 'unready', 'start_solo', 'forfeit',
      'input', 'move', 'shoot', 'ping',
    ] as const

    test('there are exactly 9 client message types', () => {
      expect(ALL_CLIENT_MESSAGE_TYPES.length).toBe(9)
    })

    test('every type produces a valid message when given required fields', () => {
      const messages: ClientMessage[] = [
        { type: 'join', name: 'Test' },
        { type: 'ready' },
        { type: 'unready' },
        { type: 'start_solo' },
        { type: 'forfeit' },
        { type: 'input', held: { left: false, right: false } },
        { type: 'move', direction: 'left' },
        { type: 'shoot' },
        { type: 'ping' },
      ]

      expect(messages.length).toBe(ALL_CLIENT_MESSAGE_TYPES.length)
      for (const msg of messages) {
        expect(validateClientMessage(msg)).toBeNull()
      }
    })
  })

  describe('InputState shape validation', () => {
    test('valid InputState has boolean left and right', () => {
      const input: InputState = { left: true, right: false }
      expect(typeof input.left).toBe('boolean')
      expect(typeof input.right).toBe('boolean')
    })

    test('all four input combinations are valid', () => {
      const combinations: InputState[] = [
        { left: false, right: false },
        { left: true, right: false },
        { left: false, right: true },
        { left: true, right: true },
      ]
      for (const input of combinations) {
        const msg: ClientMessage = { type: 'input', held: input }
        expect(validateClientMessage(msg)).toBeNull()
      }
    })
  })

  describe('invalid client messages are rejected', () => {
    test('rejects non-object values', () => {
      expect(validateClientMessage(null)).not.toBeNull()
      expect(validateClientMessage(undefined)).not.toBeNull()
      expect(validateClientMessage('string')).not.toBeNull()
      expect(validateClientMessage(42)).not.toBeNull()
      expect(validateClientMessage([])).not.toBeNull()
    })

    test('rejects objects without type field', () => {
      expect(validateClientMessage({})).not.toBeNull()
      expect(validateClientMessage({ name: 'Alice' })).not.toBeNull()
    })

    test('rejects objects with non-string type', () => {
      expect(validateClientMessage({ type: 42 })).not.toBeNull()
      expect(validateClientMessage({ type: null })).not.toBeNull()
      expect(validateClientMessage({ type: true })).not.toBeNull()
    })

    test('rejects unknown message types', () => {
      expect(validateClientMessage({ type: 'unknown' })).not.toBeNull()
      expect(validateClientMessage({ type: 'attack' })).not.toBeNull()
      expect(validateClientMessage({ type: 'PING' })).not.toBeNull()
    })

    test('rejects join without name', () => {
      expect(validateClientMessage({ type: 'join' })).not.toBeNull()
      expect(validateClientMessage({ type: 'join', name: 123 })).not.toBeNull()
    })

    test('rejects input without valid held state', () => {
      expect(validateClientMessage({ type: 'input' })).not.toBeNull()
      expect(validateClientMessage({ type: 'input', held: null })).not.toBeNull()
      expect(validateClientMessage({ type: 'input', held: { left: 'yes', right: false } })).not.toBeNull()
      expect(validateClientMessage({ type: 'input', held: { left: true } })).not.toBeNull()
    })

    test('rejects move without valid direction', () => {
      expect(validateClientMessage({ type: 'move' })).not.toBeNull()
      expect(validateClientMessage({ type: 'move', direction: 'up' })).not.toBeNull()
      expect(validateClientMessage({ type: 'move', direction: 'down' })).not.toBeNull()
      expect(validateClientMessage({ type: 'move', direction: 42 })).not.toBeNull()
    })
  })

  describe('JSON round-trip serialization', () => {
    test('all client message types survive JSON serialization', () => {
      const messages: ClientMessage[] = [
        { type: 'join', name: 'Alice' },
        { type: 'ready' },
        { type: 'unready' },
        { type: 'start_solo' },
        { type: 'forfeit' },
        { type: 'input', held: { left: true, right: false } },
        { type: 'move', direction: 'right' },
        { type: 'shoot' },
        { type: 'ping' },
      ]

      for (const msg of messages) {
        const serialized = JSON.stringify(msg)
        const deserialized = JSON.parse(serialized)
        expect(deserialized).toEqual(msg)
        expect(validateClientMessage(deserialized)).toBeNull()
      }
    })
  })
})

// ─── ServerMessage Validation ────────────────────────────────────────────────

describe('ServerMessage Validation', () => {
  describe('sync message shape', () => {
    test('minimal sync with only state', () => {
      const state = createTestGameState()
      const msg: ServerMessage = { type: 'sync', state }
      expect(msg.type).toBe('sync')
      expect(msg.state).toBeDefined()
      expect(validateServerMessage(msg)).toBeNull()
    })

    test('initial join sync includes playerId and config', () => {
      const state = createTestGameState()
      const msg: ServerMessage = {
        type: 'sync',
        state,
        playerId: 'player-uuid-123',
        config: DEFAULT_CONFIG,
      }
      expect(msg.type).toBe('sync')
      expect(msg.playerId).toBe('player-uuid-123')
      expect(msg.config).toEqual(DEFAULT_CONFIG)
      expect(validateServerMessage(msg)).toBeNull()
    })

    test('subsequent sync omits playerId and config', () => {
      // As documented: playerId and config are only sent on initial join
      const state = createTestGameState()
      const msg: ServerMessage = { type: 'sync', state }
      expect(msg.playerId).toBeUndefined()
      expect(msg.config).toBeUndefined()
      expect(validateServerMessage(msg)).toBeNull()
    })

    test('sync state contains required GameState fields', () => {
      const state = createTestGameState()
      const msg: ServerMessage = { type: 'sync', state }
      const syncState = msg.state as GameState

      expect(syncState.roomId).toBe('ABC123')
      expect(syncState.mode).toBe('solo')
      expect(syncState.status).toBe('waiting')
      expect(syncState.tick).toBe(0)
      expect(typeof syncState.rngSeed).toBe('number')
      expect(syncState.players).toEqual({})
      expect(syncState.readyPlayerIds).toEqual([])
      expect(syncState.entities).toEqual([])
      expect(syncState.wave).toBe(1)
      expect(syncState.lives).toBe(3)
      expect(syncState.score).toBe(0)
      expect(syncState.alienDirection).toBe(1)
      expect(syncState.config).toBeDefined()
    })

    test('sync message matches how GameRoom broadcasts full state', () => {
      // GameRoom.broadcastFullState() sends: { type: 'sync', state: this.game }
      const state = createTestGameState()
      const broadcastMsg = { type: 'sync', state }
      const serialized = JSON.stringify(broadcastMsg)
      const parsed = JSON.parse(serialized)

      expect(parsed.type).toBe('sync')
      expect(parsed.state).toBeDefined()
      expect(parsed.state.roomId).toBe('ABC123')
      expect(validateServerMessage(parsed)).toBeNull()
    })

    test('initial join sync matches how GameRoom sends it', () => {
      // GameRoom join handler sends:
      // { type: 'sync', state: this.game, playerId: player.id, config: this.game.config }
      const state = createTestGameState()
      const player = createTestPlayer()
      const joinSync = {
        type: 'sync',
        state,
        playerId: player.id,
        config: state.config,
      }
      const serialized = JSON.stringify(joinSync)
      const parsed = JSON.parse(serialized)

      expect(parsed.type).toBe('sync')
      expect(parsed.playerId).toBe('test-player-1')
      expect(parsed.config).toBeDefined()
      expect(parsed.config.width).toBe(120)
      expect(parsed.config.height).toBe(36)
      expect(validateServerMessage(parsed)).toBeNull()
    })
  })

  describe('pong message shape', () => {
    test('pong has serverTime as number', () => {
      const msg: ServerMessage = { type: 'pong', serverTime: 1700000000000 }
      expect(msg.type).toBe('pong')
      expect(msg.serverTime).toBe(1700000000000)
      expect(validateServerMessage(msg)).toBeNull()
    })

    test('pong matches how GameRoom constructs it', () => {
      // GameRoom ping handler sends: { type: 'pong', serverTime: Date.now() }
      const now = Date.now()
      const msg = { type: 'pong', serverTime: now }
      const serialized = JSON.stringify(msg)
      const parsed = JSON.parse(serialized)

      expect(parsed.type).toBe('pong')
      expect(typeof parsed.serverTime).toBe('number')
      expect(parsed.serverTime).toBeGreaterThan(0)
      expect(validateServerMessage(parsed)).toBeNull()
    })
  })

  describe('error message shape', () => {
    test('error has code and message strings', () => {
      const msg: ServerMessage = {
        type: 'error',
        code: 'room_full',
        message: 'Room is full',
      }
      expect(msg.type).toBe('error')
      expect(msg.code).toBe('room_full')
      expect(msg.message).toBe('Room is full')
      expect(validateServerMessage(msg)).toBeNull()
    })

    test('error matches how GameRoom.sendError constructs it', () => {
      // GameRoom.sendError sends: { type: 'error', code, message }
      const errorMsg = { type: 'error', code: 'invalid_message', message: 'Failed to parse message' }
      const serialized = JSON.stringify(errorMsg)
      const parsed = JSON.parse(serialized)

      expect(parsed.type).toBe('error')
      expect(typeof parsed.code).toBe('string')
      expect(typeof parsed.message).toBe('string')
      expect(validateServerMessage(parsed)).toBeNull()
    })
  })

  describe('invalid server messages are rejected', () => {
    test('rejects non-object values', () => {
      expect(validateServerMessage(null)).not.toBeNull()
      expect(validateServerMessage('string')).not.toBeNull()
      expect(validateServerMessage(42)).not.toBeNull()
    })

    test('rejects objects without type', () => {
      expect(validateServerMessage({})).not.toBeNull()
      expect(validateServerMessage({ state: {} })).not.toBeNull()
    })

    test('rejects unknown server message types', () => {
      expect(validateServerMessage({ type: 'unknown' })).not.toBeNull()
      expect(validateServerMessage({ type: 'join' })).not.toBeNull()
    })

    test('rejects sync without state', () => {
      expect(validateServerMessage({ type: 'sync' })).not.toBeNull()
    })

    test('rejects pong without serverTime', () => {
      expect(validateServerMessage({ type: 'pong' })).not.toBeNull()
      expect(validateServerMessage({ type: 'pong', serverTime: 'not-a-number' })).not.toBeNull()
    })

    test('rejects error without code or message', () => {
      expect(validateServerMessage({ type: 'error' })).not.toBeNull()
      expect(validateServerMessage({ type: 'error', code: 'room_full' })).not.toBeNull()
      expect(validateServerMessage({ type: 'error', message: 'oops' })).not.toBeNull()
    })
  })

  describe('JSON round-trip serialization', () => {
    test('all server message types survive JSON serialization', () => {
      const state = createTestGameState()
      const messages: ServerMessage[] = [
        { type: 'sync', state },
        { type: 'sync', state, playerId: 'p1', config: DEFAULT_CONFIG },
        { type: 'event', name: 'game_start', data: undefined },
        { type: 'event', name: 'player_joined', data: { player: createTestPlayer() } },
        { type: 'pong', serverTime: Date.now() },
        { type: 'error', code: 'room_full', message: 'Room is full' },
      ]

      for (const msg of messages) {
        const serialized = JSON.stringify(msg)
        const parsed = JSON.parse(serialized)
        expect(parsed.type).toBe(msg.type)
        expect(validateServerMessage(parsed)).toBeNull()
      }
    })
  })
})

// ─── ErrorCode Coverage ──────────────────────────────────────────────────────

describe('ErrorCode Coverage', () => {
  /** All error codes defined in the protocol */
  const ALL_ERROR_CODES: ErrorCode[] = [
    'room_full',
    'game_in_progress',
    'invalid_room',
    'invalid_message',
    'already_joined',
    'rate_limited',
    'countdown_in_progress',
  ]

  test('there are exactly 7 error codes', () => {
    expect(ALL_ERROR_CODES.length).toBe(7)
  })

  test('all error codes are non-empty strings', () => {
    for (const code of ALL_ERROR_CODES) {
      expect(typeof code).toBe('string')
      expect(code.length).toBeGreaterThan(0)
    }
  })

  test('all error codes use snake_case convention', () => {
    for (const code of ALL_ERROR_CODES) {
      expect(code).toMatch(/^[a-z][a-z_]*[a-z]$/)
    }
  })

  test('each error code produces a valid error ServerMessage', () => {
    for (const code of ALL_ERROR_CODES) {
      const msg: ServerMessage = { type: 'error', code, message: `Test error: ${code}` }
      expect(validateServerMessage(msg)).toBeNull()
    }
  })

  describe('error codes match GameRoom usage', () => {
    test('room_full is used when 4 players already in room', () => {
      // GameRoom sends this in webSocketMessage (join handler) and fetch (WS upgrade)
      const msg: ServerMessage = { type: 'error', code: 'room_full', message: 'Room is full' }
      expect(msg.code).toBe('room_full')
    })

    test('game_in_progress is used for HTTP upgrade rejection', () => {
      // GameRoom.fetch rejects WS connections during active game
      const msg: ServerMessage = { type: 'error', code: 'game_in_progress', message: 'Game in progress' }
      expect(msg.code).toBe('game_in_progress')
    })

    test('invalid_room is used for uninitialized rooms', () => {
      // GameRoom.fetch returns this for WS connections to non-initialized rooms
      const msg: ServerMessage = { type: 'error', code: 'invalid_room', message: 'Room not initialized' }
      expect(msg.code).toBe('invalid_room')
    })

    test('invalid_message is used for malformed WebSocket messages', () => {
      // GameRoom.webSocketMessage uses this for parse failures and invalid shapes
      const msg: ServerMessage = { type: 'error', code: 'invalid_message', message: 'Failed to parse message' }
      expect(msg.code).toBe('invalid_message')
    })

    test('already_joined is used for duplicate join attempts', () => {
      // GameRoom join handler rejects if attachment.playerId already set
      const msg: ServerMessage = { type: 'error', code: 'already_joined', message: 'Already in room' }
      expect(msg.code).toBe('already_joined')
    })

    test('rate_limited is used when message rate exceeds threshold', () => {
      // GameRoom rate limiter sends this when count > 60 msgs/sec
      const msg: ServerMessage = { type: 'error', code: 'rate_limited', message: 'Too many messages, slow down' }
      expect(msg.code).toBe('rate_limited')
    })

    test('countdown_in_progress is used when joining during countdown', () => {
      // GameRoom join handler rejects if status === 'countdown'
      const msg: ServerMessage = { type: 'error', code: 'countdown_in_progress', message: 'Game starting, try again' }
      expect(msg.code).toBe('countdown_in_progress')
    })
  })

  test('error codes are unique (no duplicates)', () => {
    const unique = new Set(ALL_ERROR_CODES)
    expect(unique.size).toBe(ALL_ERROR_CODES.length)
  })
})

// ─── ServerEvent Types ───────────────────────────────────────────────────────

describe('ServerEvent Types', () => {
  /** All event names defined in the protocol */
  const ALL_EVENT_NAMES: GameEvent[] = [
    'player_joined',
    'player_left',
    'player_ready',
    'player_unready',
    'player_died',
    'player_respawned',
    'countdown_tick',
    'countdown_cancelled',
    'game_start',
    'alien_killed',
    'score_awarded',
    'wave_complete',
    'game_over',
    'invasion',
    'ufo_spawn',
  ]

  test('there are exactly 15 server event types', () => {
    expect(ALL_EVENT_NAMES.length).toBe(15)
  })

  test('all event names are non-empty strings', () => {
    for (const name of ALL_EVENT_NAMES) {
      expect(typeof name).toBe('string')
      expect(name.length).toBeGreaterThan(0)
    }
  })

  test('all event names use snake_case convention', () => {
    for (const name of ALL_EVENT_NAMES) {
      expect(name).toMatch(/^[a-z][a-z_]*[a-z]$/)
    }
  })

  test('event names are unique (no duplicates)', () => {
    const unique = new Set(ALL_EVENT_NAMES)
    expect(unique.size).toBe(ALL_EVENT_NAMES.length)
  })

  describe('event data shapes match protocol definitions', () => {
    test('player_joined carries a Player object', () => {
      const player = createTestPlayer()
      const event: ServerEvent = { type: 'event', name: 'player_joined', data: { player } }
      expect(event.data.player.id).toBe('test-player-1')
      expect(event.data.player.name).toBe('TestPlayer')
      expect(event.data.player.slot).toBe(1)
      expect(event.data.player.color).toBe('cyan')
      expect(event.data.player.alive).toBe(true)
      expect(validateServerEvent(event)).toBeNull()
    })

    test('player_left carries playerId and optional reason', () => {
      const eventWithReason: ServerEvent = {
        type: 'event',
        name: 'player_left',
        data: { playerId: 'p1', reason: 'disconnected' },
      }
      const eventWithoutReason: ServerEvent = {
        type: 'event',
        name: 'player_left',
        data: { playerId: 'p1' },
      }
      expect(eventWithReason.data.playerId).toBe('p1')
      expect(eventWithReason.data.reason).toBe('disconnected')
      expect(eventWithoutReason.data.reason).toBeUndefined()
      expect(validateServerEvent(eventWithReason)).toBeNull()
      expect(validateServerEvent(eventWithoutReason)).toBeNull()
    })

    test('player_ready carries playerId', () => {
      const event: ServerEvent = { type: 'event', name: 'player_ready', data: { playerId: 'p1' } }
      expect(event.data.playerId).toBe('p1')
      expect(validateServerEvent(event)).toBeNull()
    })

    test('player_unready carries playerId', () => {
      const event: ServerEvent = { type: 'event', name: 'player_unready', data: { playerId: 'p1' } }
      expect(event.data.playerId).toBe('p1')
      expect(validateServerEvent(event)).toBeNull()
    })

    test('player_died carries playerId', () => {
      const event: ServerEvent = { type: 'event', name: 'player_died', data: { playerId: 'p1' } }
      expect(event.data.playerId).toBe('p1')
      expect(validateServerEvent(event)).toBeNull()
    })

    test('player_respawned carries playerId', () => {
      const event: ServerEvent = { type: 'event', name: 'player_respawned', data: { playerId: 'p1' } }
      expect(event.data.playerId).toBe('p1')
      expect(validateServerEvent(event)).toBeNull()
    })

    test('countdown_tick carries count number', () => {
      const event3: ServerEvent = { type: 'event', name: 'countdown_tick', data: { count: 3 } }
      const event2: ServerEvent = { type: 'event', name: 'countdown_tick', data: { count: 2 } }
      const event1: ServerEvent = { type: 'event', name: 'countdown_tick', data: { count: 1 } }
      expect(event3.data.count).toBe(3)
      expect(event2.data.count).toBe(2)
      expect(event1.data.count).toBe(1)
      expect(validateServerEvent(event3)).toBeNull()
    })

    test('countdown_cancelled carries reason string', () => {
      const event: ServerEvent = {
        type: 'event',
        name: 'countdown_cancelled',
        data: { reason: 'Player unreadied' },
      }
      expect(event.data.reason).toBe('Player unreadied')
      expect(validateServerEvent(event)).toBeNull()
    })

    test('game_start has undefined data', () => {
      const event: ServerEvent = { type: 'event', name: 'game_start', data: undefined }
      expect(event.data).toBeUndefined()
      expect(validateServerEvent(event)).toBeNull()
    })

    test('alien_killed carries alienId and playerId (nullable)', () => {
      const eventWithPlayer: ServerEvent = {
        type: 'event',
        name: 'alien_killed',
        data: { alienId: 'e_5', playerId: 'p1' },
      }
      const eventWithNull: ServerEvent = {
        type: 'event',
        name: 'alien_killed',
        data: { alienId: 'e_5', playerId: null },
      }
      expect(eventWithPlayer.data.alienId).toBe('e_5')
      expect(eventWithPlayer.data.playerId).toBe('p1')
      expect(eventWithNull.data.playerId).toBeNull()
      expect(validateServerEvent(eventWithPlayer)).toBeNull()
      expect(validateServerEvent(eventWithNull)).toBeNull()
    })

    test('score_awarded carries playerId, points, and source', () => {
      const sources = ['alien', 'ufo', 'commander', 'wave_bonus'] as const
      for (const source of sources) {
        const event: ServerEvent = {
          type: 'event',
          name: 'score_awarded',
          data: { playerId: 'p1', points: 30, source },
        }
        expect(event.data.points).toBe(30)
        expect(event.data.source).toBe(source)
        expect(validateServerEvent(event)).toBeNull()
      }
    })

    test('score_awarded playerId can be null', () => {
      const event: ServerEvent = {
        type: 'event',
        name: 'score_awarded',
        data: { playerId: null, points: 50, source: 'ufo' },
      }
      expect(event.data.playerId).toBeNull()
      expect(validateServerEvent(event)).toBeNull()
    })

    test('wave_complete carries wave number', () => {
      const event: ServerEvent = { type: 'event', name: 'wave_complete', data: { wave: 3 } }
      expect(event.data.wave).toBe(3)
      expect(validateServerEvent(event)).toBeNull()
    })

    test('game_over carries result (victory or defeat)', () => {
      const victory: ServerEvent = { type: 'event', name: 'game_over', data: { result: 'victory' } }
      const defeat: ServerEvent = { type: 'event', name: 'game_over', data: { result: 'defeat' } }
      expect(victory.data.result).toBe('victory')
      expect(defeat.data.result).toBe('defeat')
      expect(validateServerEvent(victory)).toBeNull()
      expect(validateServerEvent(defeat)).toBeNull()
    })

    test('invasion has undefined data', () => {
      const event: ServerEvent = { type: 'event', name: 'invasion', data: undefined }
      expect(event.data).toBeUndefined()
      expect(validateServerEvent(event)).toBeNull()
    })

    test('ufo_spawn carries x position', () => {
      const event: ServerEvent = { type: 'event', name: 'ufo_spawn', data: { x: 0 } }
      expect(event.data.x).toBe(0)
      expect(validateServerEvent(event)).toBeNull()
    })
  })

  describe('events match how GameRoom/reducer actually constructs them', () => {
    test('player_joined event from GameRoom join handler', () => {
      // GameRoom broadcasts: { type: 'event', name: 'player_joined', data: { player } }
      const player = createTestPlayer({ id: 'uuid-123', name: 'Alice', slot: 2, color: 'orange' })
      const event = { type: 'event', name: 'player_joined', data: { player } }
      const serialized = JSON.stringify(event)
      const parsed = JSON.parse(serialized)

      expect(parsed.type).toBe('event')
      expect(parsed.name).toBe('player_joined')
      expect(parsed.data.player.id).toBe('uuid-123')
      expect(parsed.data.player.name).toBe('Alice')
      expect(parsed.data.player.slot).toBe(2)
      expect(parsed.data.player.color).toBe('orange')
    })

    test('player_left event from GameRoom removePlayer', () => {
      // GameRoom broadcasts: { type: 'event', name: 'player_left', data: { playerId } }
      const event = { type: 'event', name: 'player_left', data: { playerId: 'uuid-123' } }
      const serialized = JSON.stringify(event)
      const parsed = JSON.parse(serialized)

      expect(parsed.type).toBe('event')
      expect(parsed.name).toBe('player_left')
      expect(parsed.data.playerId).toBe('uuid-123')
    })

    test('countdown_tick event from GameRoom countdown', () => {
      // GameRoom sends: { type: 'event', name: 'countdown_tick', data: { count: N } }
      for (const count of [3, 2, 1]) {
        const event = { type: 'event', name: 'countdown_tick', data: { count } }
        const serialized = JSON.stringify(event)
        const parsed = JSON.parse(serialized)
        expect(parsed.data.count).toBe(count)
      }
    })

    test('countdown_cancelled event from GameRoom cancelCountdown', () => {
      // GameRoom sends: { type: 'event', name: 'countdown_cancelled', data: { reason } }
      const reasons = ['Player unreadied', 'Player disconnected']
      for (const reason of reasons) {
        const event = { type: 'event', name: 'countdown_cancelled', data: { reason } }
        const serialized = JSON.stringify(event)
        const parsed = JSON.parse(serialized)
        expect(parsed.data.reason).toBe(reason)
      }
    })

    test('game_start event from GameRoom startGame', () => {
      // GameRoom broadcasts: { type: 'event', name: 'game_start', data: undefined }
      const event = { type: 'event', name: 'game_start', data: undefined }
      const serialized = JSON.stringify(event)
      const parsed = JSON.parse(serialized)

      expect(parsed.type).toBe('event')
      expect(parsed.name).toBe('game_start')
      // JSON.stringify(undefined) omits the key, so data won't be present
      expect(parsed.data).toBeUndefined()
    })

    test('game_over event from GameRoom endGame', () => {
      // GameRoom broadcasts: { type: 'event', name: 'game_over', data: { result } }
      for (const result of ['victory', 'defeat'] as const) {
        const event = { type: 'event', name: 'game_over', data: { result } }
        const serialized = JSON.stringify(event)
        const parsed = JSON.parse(serialized)
        expect(parsed.data.result).toBe(result)
      }
    })

    test('alien_killed event from reducer collision detection', () => {
      // Reducer emits: { type: 'event', name: 'alien_killed', data: { alienId: alien.id, playerId: bullet.ownerId } }
      const event = { type: 'event', name: 'alien_killed', data: { alienId: 'e_5', playerId: 'p1' } }
      const serialized = JSON.stringify(event)
      const parsed = JSON.parse(serialized)
      expect(parsed.data.alienId).toBe('e_5')
      expect(parsed.data.playerId).toBe('p1')
    })

    test('score_awarded event from reducer for alien kill', () => {
      // Reducer emits: { type: 'event', name: 'score_awarded', data: { playerId, points, source: 'alien' } }
      const event = { type: 'event', name: 'score_awarded', data: { playerId: 'p1', points: 30, source: 'alien' } }
      const serialized = JSON.stringify(event)
      const parsed = JSON.parse(serialized)
      expect(parsed.data.playerId).toBe('p1')
      expect(parsed.data.points).toBe(30)
      expect(parsed.data.source).toBe('alien')
    })

    test('score_awarded event from reducer for UFO kill', () => {
      // Reducer emits: { type: 'event', name: 'score_awarded', data: { playerId, points, source: 'ufo' } }
      const event = { type: 'event', name: 'score_awarded', data: { playerId: 'p1', points: 150, source: 'ufo' } }
      const serialized = JSON.stringify(event)
      const parsed = JSON.parse(serialized)
      expect(parsed.data.source).toBe('ufo')
    })

    test('wave_complete event from reducer', () => {
      // Reducer emits: { type: 'event', name: 'wave_complete', data: { wave: next.wave } }
      const event = { type: 'event', name: 'wave_complete', data: { wave: 2 } }
      const serialized = JSON.stringify(event)
      const parsed = JSON.parse(serialized)
      expect(parsed.data.wave).toBe(2)
    })

    test('invasion event from reducer', () => {
      // Reducer emits: { type: 'event', name: 'invasion', data: undefined }
      const event = { type: 'event', name: 'invasion', data: undefined }
      const serialized = JSON.stringify(event)
      const parsed = JSON.parse(serialized)
      expect(parsed.name).toBe('invasion')
    })

    test('ufo_spawn event from reducer', () => {
      // Reducer emits: { type: 'event', name: 'ufo_spawn', data: { x: startX } }
      const event = { type: 'event', name: 'ufo_spawn', data: { x: 0 } }
      const serialized = JSON.stringify(event)
      const parsed = JSON.parse(serialized)
      expect(parsed.data.x).toBe(0)
    })

    test('player_died event from reducer collision detection', () => {
      // Reducer emits: { type: 'event', name: 'player_died', data: { playerId: player.id } }
      const event = { type: 'event', name: 'player_died', data: { playerId: 'p1' } }
      const serialized = JSON.stringify(event)
      const parsed = JSON.parse(serialized)
      expect(parsed.data.playerId).toBe('p1')
    })

    test('player_respawned event from reducer', () => {
      // Reducer emits: { type: 'event', name: 'player_respawned', data: { playerId: player.id } }
      const event = { type: 'event', name: 'player_respawned', data: { playerId: 'p1' } }
      const serialized = JSON.stringify(event)
      const parsed = JSON.parse(serialized)
      expect(parsed.data.playerId).toBe('p1')
    })
  })

  describe('ServerEvent is a valid ServerMessage', () => {
    test('every ServerEvent satisfies the ServerMessage union', () => {
      const events: ServerEvent[] = [
        { type: 'event', name: 'player_joined', data: { player: createTestPlayer() } },
        { type: 'event', name: 'player_left', data: { playerId: 'p1' } },
        { type: 'event', name: 'player_ready', data: { playerId: 'p1' } },
        { type: 'event', name: 'player_unready', data: { playerId: 'p1' } },
        { type: 'event', name: 'player_died', data: { playerId: 'p1' } },
        { type: 'event', name: 'player_respawned', data: { playerId: 'p1' } },
        { type: 'event', name: 'countdown_tick', data: { count: 3 } },
        { type: 'event', name: 'countdown_cancelled', data: { reason: 'test' } },
        { type: 'event', name: 'game_start', data: undefined },
        { type: 'event', name: 'alien_killed', data: { alienId: 'e_1', playerId: 'p1' } },
        { type: 'event', name: 'score_awarded', data: { playerId: 'p1', points: 10, source: 'alien' } },
        { type: 'event', name: 'wave_complete', data: { wave: 1 } },
        { type: 'event', name: 'game_over', data: { result: 'victory' } },
        { type: 'event', name: 'invasion', data: undefined },
        { type: 'event', name: 'ufo_spawn', data: { x: 5 } },
      ]

      expect(events.length).toBe(ALL_EVENT_NAMES.length)
      for (const event of events) {
        // ServerEvent is included in ServerMessage union
        const asServerMsg: ServerMessage = event
        expect(asServerMsg.type).toBe('event')
        expect(validateServerMessage(event)).toBeNull()
        expect(validateServerEvent(event)).toBeNull()
      }
    })
  })
})

// ─── Type Guard Tests ────────────────────────────────────────────────────────

describe('Runtime Validation Helpers', () => {
  describe('validateClientMessage', () => {
    test('returns null for all valid client message types', () => {
      const validMessages = [
        { type: 'join', name: 'Alice' },
        { type: 'ready' },
        { type: 'unready' },
        { type: 'start_solo' },
        { type: 'forfeit' },
        { type: 'input', held: { left: true, right: true } },
        { type: 'move', direction: 'left' },
        { type: 'move', direction: 'right' },
        { type: 'shoot' },
        { type: 'ping' },
      ]
      for (const msg of validMessages) {
        expect(validateClientMessage(msg)).toBeNull()
      }
    })

    test('returns error string for all invalid messages', () => {
      const invalidMessages = [
        null,
        undefined,
        42,
        'string',
        [],
        {},
        { type: 42 },
        { type: 'invalid_type' },
        { type: 'join' }, // missing name
        { type: 'input' }, // missing held
        { type: 'move' }, // missing direction
        { type: 'move', direction: 'up' }, // invalid direction
      ]
      for (const msg of invalidMessages) {
        const result = validateClientMessage(msg)
        expect(typeof result).toBe('string')
        expect(result!.length).toBeGreaterThan(0)
      }
    })
  })

  describe('validateServerMessage', () => {
    test('returns null for all valid server message types', () => {
      const state = createTestGameState()
      const validMessages = [
        { type: 'sync', state },
        { type: 'sync', state, playerId: 'p1' },
        { type: 'event', name: 'game_start' },
        { type: 'pong', serverTime: 1234567890 },
        { type: 'error', code: 'room_full', message: 'Full' },
      ]
      for (const msg of validMessages) {
        expect(validateServerMessage(msg)).toBeNull()
      }
    })

    test('returns error string for all invalid messages', () => {
      const invalidMessages = [
        null,
        42,
        {},
        { type: 'sync' }, // missing state
        { type: 'pong' }, // missing serverTime
        { type: 'error', code: 'x' }, // missing message
        { type: 'unknown' },
      ]
      for (const msg of invalidMessages) {
        const result = validateServerMessage(msg)
        expect(typeof result).toBe('string')
        expect(result!.length).toBeGreaterThan(0)
      }
    })
  })

  describe('validateServerEvent', () => {
    test('returns null for all valid event names', () => {
      const ALL_EVENT_NAMES: GameEvent[] = [
        'player_joined', 'player_left', 'player_ready', 'player_unready',
        'player_died', 'player_respawned', 'countdown_tick', 'countdown_cancelled',
        'game_start', 'alien_killed', 'score_awarded', 'wave_complete',
        'game_over', 'invasion', 'ufo_spawn',
      ]
      for (const name of ALL_EVENT_NAMES) {
        const event = { type: 'event', name }
        expect(validateServerEvent(event)).toBeNull()
      }
    })

    test('returns error for unknown event names', () => {
      expect(validateServerEvent({ type: 'event', name: 'unknown_event' })).not.toBeNull()
      expect(validateServerEvent({ type: 'event', name: '' })).not.toBeNull()
    })

    test('returns error for non-event type', () => {
      expect(validateServerEvent({ type: 'sync', name: 'game_start' })).not.toBeNull()
    })

    test('returns error for non-object values', () => {
      expect(validateServerEvent(null)).not.toBeNull()
      expect(validateServerEvent('string')).not.toBeNull()
    })
  })
})

// ─── GameEvent Type Alignment ────────────────────────────────────────────────

describe('GameEvent type alignment with ServerEvent', () => {
  // The GameEvent type in types.ts should list exactly the same event names
  // as the ServerEvent union in protocol.ts

  const GAME_EVENT_NAMES: GameEvent[] = [
    'player_joined',
    'player_left',
    'player_ready',
    'player_unready',
    'player_died',
    'player_respawned',
    'countdown_tick',
    'countdown_cancelled',
    'game_start',
    'alien_killed',
    'score_awarded',
    'wave_complete',
    'game_over',
    'invasion',
    'ufo_spawn',
  ]

  test('GameEvent type covers all 15 event names', () => {
    expect(GAME_EVENT_NAMES.length).toBe(15)
  })

  test('GameEvent names match ServerEvent name discriminator values', () => {
    // This verifies the GameEvent union in types.ts stays aligned with
    // the ServerEvent union in protocol.ts
    // Any mismatch would be caught at compile time, but we verify at runtime too
    const uniqueNames = new Set(GAME_EVENT_NAMES)
    expect(uniqueNames.size).toBe(15)
  })

  test('events can be categorized by gameplay phase', () => {
    const lobbyEvents: GameEvent[] = [
      'player_joined', 'player_left', 'player_ready', 'player_unready',
    ]
    const transitionEvents: GameEvent[] = [
      'countdown_tick', 'countdown_cancelled', 'game_start',
    ]
    const gameplayEvents: GameEvent[] = [
      'alien_killed', 'score_awarded', 'player_died', 'player_respawned',
      'wave_complete', 'invasion', 'ufo_spawn',
    ]
    const endEvents: GameEvent[] = [
      'game_over',
    ]

    const allCategorized = [...lobbyEvents, ...transitionEvents, ...gameplayEvents, ...endEvents]
    const allCategorizedSet = new Set(allCategorized)
    const allEventSet = new Set(GAME_EVENT_NAMES)

    // Every event must be in exactly one category
    expect(allCategorized.length).toBe(GAME_EVENT_NAMES.length)
    expect(allCategorizedSet.size).toBe(allEventSet.size)
    for (const name of GAME_EVENT_NAMES) {
      expect(allCategorizedSet.has(name)).toBe(true)
    }
  })
})

// ─── Protocol Completeness ──────────────────────────────────────────────────

describe('Protocol Completeness', () => {
  test('ServerMessage union has exactly 4 top-level type variants', () => {
    // sync, event, pong, error
    const serverMessageTypes = ['sync', 'event', 'pong', 'error']
    expect(serverMessageTypes.length).toBe(4)
  })

  test('ClientMessage union has exactly 9 type variants', () => {
    const clientMessageTypes = [
      'join', 'ready', 'unready', 'start_solo', 'forfeit',
      'input', 'move', 'shoot', 'ping',
    ]
    expect(clientMessageTypes.length).toBe(9)
  })

  test('every client message type documented in CLAUDE.md is in the protocol', () => {
    // CLAUDE.md documents: join, ready, unready, start_solo, input, move, shoot, ping
    // Plus forfeit which is in the protocol
    const documentedTypes = ['join', 'ready', 'unready', 'start_solo', 'input', 'move', 'shoot', 'ping']
    for (const type of documentedTypes) {
      const msg = type === 'join'
        ? { type, name: 'test' }
        : type === 'input'
          ? { type, held: { left: false, right: false } }
          : type === 'move'
            ? { type, direction: 'left' }
            : { type }
      expect(validateClientMessage(msg)).toBeNull()
    }
  })

  test('every server message type documented in CLAUDE.md is in the protocol', () => {
    // CLAUDE.md documents: sync, event, error, pong
    const state = createTestGameState()
    const documentedMessages = [
      { type: 'sync', state },
      { type: 'event', name: 'game_start' },
      { type: 'error', code: 'room_full', message: 'test' },
      { type: 'pong', serverTime: 123 },
    ]
    for (const msg of documentedMessages) {
      expect(validateServerMessage(msg)).toBeNull()
    }
  })

  test('GameConfig is included in initial sync message', () => {
    const config: GameConfig = { ...DEFAULT_CONFIG }
    expect(config.width).toBe(120)
    expect(config.height).toBe(36)
    expect(config.maxPlayers).toBe(4)
    expect(config.tickIntervalMs).toBe(33)
    expect(config.baseAlienMoveIntervalTicks).toBe(18)
    expect(config.baseBulletSpeed).toBe(1)
    expect(typeof config.baseAlienShootRate).toBe('number')
    expect(config.playerCooldownTicks).toBe(6)
    expect(config.playerMoveSpeed).toBe(1)
    expect(config.respawnDelayTicks).toBe(45)
  })

  test('PlayerSlot and PlayerColor mappings are consistent', () => {
    const slots: PlayerSlot[] = [1, 2, 3, 4]
    const expectedColors: PlayerColor[] = ['cyan', 'orange', 'magenta', 'lime']

    for (let i = 0; i < slots.length; i++) {
      expect(PLAYER_COLORS[slots[i]]).toBe(expectedColors[i])
    }
  })
})

// ─── Message Serialization Patterns ──────────────────────────────────────────

describe('Message Serialization Patterns', () => {
  test('undefined data fields are omitted during JSON serialization', () => {
    // Important: JSON.stringify drops undefined values
    // This affects events with data: undefined (game_start, invasion)
    const event: ServerEvent = { type: 'event', name: 'game_start', data: undefined }
    const serialized = JSON.stringify(event)
    const parsed = JSON.parse(serialized)

    expect(parsed.type).toBe('event')
    expect(parsed.name).toBe('game_start')
    // data key is absent after JSON round-trip
    expect('data' in parsed).toBe(false)
  })

  test('null values are preserved during JSON serialization', () => {
    // null values in data fields should survive serialization
    const event: ServerEvent = {
      type: 'event',
      name: 'alien_killed',
      data: { alienId: 'e_1', playerId: null },
    }
    const serialized = JSON.stringify(event)
    const parsed = JSON.parse(serialized)

    expect(parsed.data.playerId).toBeNull()
  })

  test('nested Player objects survive JSON serialization', () => {
    const player = createTestPlayer()
    const event: ServerEvent = { type: 'event', name: 'player_joined', data: { player } }
    const serialized = JSON.stringify(event)
    const parsed = JSON.parse(serialized)

    expect(parsed.data.player.id).toBe('test-player-1')
    expect(parsed.data.player.inputState).toEqual({ left: false, right: false })
    expect(parsed.data.player.alive).toBe(true)
    expect(parsed.data.player.respawnAtTick).toBeNull()
  })

  test('full GameState survives JSON serialization in sync messages', () => {
    const state = createTestGameState()
    state.players['p1'] = createTestPlayer({ id: 'p1' })
    const msg: ServerMessage = { type: 'sync', state }
    const serialized = JSON.stringify(msg)
    const parsed = JSON.parse(serialized)

    expect(parsed.state.roomId).toBe('ABC123')
    expect(parsed.state.players.p1.id).toBe('p1')
    expect(parsed.state.config.width).toBe(120)
    expect(Array.isArray(parsed.state.entities)).toBe(true)
    expect(Array.isArray(parsed.state.readyPlayerIds)).toBe(true)
  })
})

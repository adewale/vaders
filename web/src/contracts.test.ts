// Contract tests: verify the web frontend handles EVERY variant of every
// discriminated union in shared/. Catches "I forgot to handle the new status" errors.

import { describe, it, expect } from 'vitest'

import { ALL_GAME_STATUSES, STATUS_RENDER_MAP, createDefaultGameState } from '../../shared/state-defaults'
import type {
  GameStatus,
  GameEvent,
  Entity,
  AlienEntity,
  BulletEntity,
  BarrierEntity,
  UFOEntity,
  PlayerSlot,
  ClassicAlienType,
} from '../../shared/types'
import { PLAYER_COLORS, ALIEN_REGISTRY } from '../../shared/types'
import type { ClientMessage, ServerMessage, ServerEvent, ErrorCode } from '../../shared/protocol'
import { COLORS } from '../../client-core/src/sprites/colors'

// ─── 1. Every GameStatus is covered by STATUS_RENDER_MAP ─────────────────────

describe('Every GameStatus is covered by STATUS_RENDER_MAP', () => {
  const allMapped = [...STATUS_RENDER_MAP.lobby, ...STATUS_RENDER_MAP.game, ...STATUS_RENDER_MAP.gameOver]

  it('every status appears in exactly one render group', () => {
    for (const status of ALL_GAME_STATUSES) {
      const occurrences = allMapped.filter((s) => s === status)
      expect(occurrences).toHaveLength(1)
    }
  })

  it('no extra statuses exist in the render map', () => {
    for (const mapped of allMapped) {
      expect(ALL_GAME_STATUSES).toContain(mapped)
    }
  })

  it('all three render groups are non-empty', () => {
    expect(STATUS_RENDER_MAP.lobby.length).toBeGreaterThan(0)
    expect(STATUS_RENDER_MAP.game.length).toBeGreaterThan(0)
    expect(STATUS_RENDER_MAP.gameOver.length).toBeGreaterThan(0)
  })
})

// ─── 2. All GameStatus values are renderable ─────────────────────────────────

describe('All GameStatus values are renderable', () => {
  const lobbyStatuses = new Set<string>(STATUS_RENDER_MAP.lobby)
  const gameStatuses = new Set<string>(STATUS_RENDER_MAP.game)
  const gameOverStatuses = new Set<string>(STATUS_RENDER_MAP.gameOver)

  function determineScreen(status: GameStatus): 'lobby' | 'game' | 'gameOver' {
    if (lobbyStatuses.has(status)) return 'lobby'
    if (gameStatuses.has(status)) return 'game'
    if (gameOverStatuses.has(status)) return 'gameOver'
    throw new Error(`Unhandled status: ${status}`)
  }

  it('each status maps to a known screen', () => {
    for (const status of ALL_GAME_STATUSES) {
      const screen = determineScreen(status)
      expect(['lobby', 'game', 'gameOver']).toContain(screen)
    }
  })

  it('createDefaultGameState produces a valid renderable state for each status', () => {
    for (const status of ALL_GAME_STATUSES) {
      const state = createDefaultGameState('TEST01')
      state.status = status
      expect(determineScreen(state.status)).toBeTruthy()
    }
  })

  it('"waiting" maps to lobby, gameplay statuses map to game, "game_over" maps to gameOver', () => {
    expect(determineScreen('waiting')).toBe('lobby')
    expect(determineScreen('playing')).toBe('game')
    expect(determineScreen('countdown')).toBe('game')
    expect(determineScreen('wipe_exit')).toBe('game')
    expect(determineScreen('wipe_hold')).toBe('game')
    expect(determineScreen('wipe_reveal')).toBe('game')
    expect(determineScreen('game_over')).toBe('gameOver')
  })
})

// ─── 3. All entity kinds are handled ─────────────────────────────────────────

describe('All entity kinds are handled', () => {
  const EXPECTED_KINDS = ['alien', 'bullet', 'barrier', 'ufo'] as const

  const alien: AlienEntity = {
    kind: 'alien',
    id: 'a1',
    x: 10,
    y: 5,
    type: 'squid',
    alive: true,
    row: 0,
    col: 0,
    points: 30,
    entering: false,
  }
  const bullet: BulletEntity = {
    kind: 'bullet',
    id: 'b1',
    x: 50,
    y: 20,
    ownerId: 'p1',
    dy: -1,
  }
  const barrier: BarrierEntity = {
    kind: 'barrier',
    id: 'bar1',
    x: 30,
    segments: [],
  }
  const ufo: UFOEntity = {
    kind: 'ufo',
    id: 'u1',
    x: 0,
    y: 1,
    direction: 1,
    alive: true,
    points: 100,
  }

  const allEntities: Entity[] = [alien, bullet, barrier, ufo]

  it('constructs one of each entity kind', () => {
    const kinds = allEntities.map((e) => e.kind)
    expect(kinds).toEqual(expect.arrayContaining([...EXPECTED_KINDS]))
  })

  it('each entity has the correct kind discriminator', () => {
    expect(alien.kind).toBe('alien')
    expect(bullet.kind).toBe('bullet')
    expect(barrier.kind).toBe('barrier')
    expect(ufo.kind).toBe('ufo')
  })

  it('no unexpected kinds exist', () => {
    for (const entity of allEntities) {
      expect(EXPECTED_KINDS as readonly string[]).toContain(entity.kind)
    }
  })
})

// ─── 4. All ClientMessage types can be constructed ───────────────────────────

describe('All ClientMessage types can be constructed', () => {
  const allMessages: ClientMessage[] = [
    { type: 'join', name: 'TestPlayer' },
    { type: 'ready' },
    { type: 'unready' },
    { type: 'start_solo' },
    { type: 'forfeit' },
    { type: 'input', held: { left: true, right: false } },
    { type: 'move', direction: 'left' },
    { type: 'shoot' },
    { type: 'ping' },
  ]

  it('has exactly 9 client message types', () => {
    expect(allMessages).toHaveLength(9)
  })

  it('each message has a type field', () => {
    for (const msg of allMessages) {
      expect(msg.type).toBeDefined()
      expect(typeof msg.type).toBe('string')
    }
  })

  it('all types are unique', () => {
    const types = allMessages.map((m) => m.type)
    expect(new Set(types).size).toBe(types.length)
  })

  it('each type matches the expected set', () => {
    const expectedTypes = ['join', 'ready', 'unready', 'start_solo', 'forfeit', 'input', 'move', 'shoot', 'ping']
    const actualTypes = allMessages.map((m) => m.type)
    expect(actualTypes.sort()).toEqual(expectedTypes.sort())
  })
})

// ─── 5. All ServerMessage types can be constructed ───────────────────────────

describe('All ServerMessage types can be constructed', () => {
  const defaultState = createDefaultGameState('TEST01')

  const allMessages: ServerMessage[] = [
    { type: 'sync', state: defaultState, playerId: 'p1', config: defaultState.config },
    { type: 'event', name: 'game_start', data: undefined },
    { type: 'pong', serverTime: Date.now() },
    { type: 'error', code: 'room_full', message: 'Room is full' },
  ]

  it('has exactly 4 server message types', () => {
    expect(allMessages).toHaveLength(4)
  })

  it('each message has a type field', () => {
    for (const msg of allMessages) {
      expect(msg.type).toBeDefined()
      expect(typeof msg.type).toBe('string')
    }
  })

  it('all types are unique', () => {
    const types = allMessages.map((m) => m.type)
    expect(new Set(types).size).toBe(types.length)
  })

  it('types match expected set', () => {
    const expectedTypes = ['sync', 'event', 'pong', 'error']
    const actualTypes = allMessages.map((m) => m.type)
    expect(actualTypes.sort()).toEqual(expectedTypes.sort())
  })
})

// ─── 6. All GameEvent names are valid ────────────────────────────────────────

describe('All GameEvent names are valid', () => {
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

  const dummyPlayer = {
    id: 'p1',
    name: 'Test',
    x: 60,
    slot: 1 as PlayerSlot,
    color: 'cyan' as const,
    lastShotTick: 0,
    alive: true,
    lives: 3,
    respawnAtTick: null,
    invulnerableUntilTick: null,
    kills: 0,
    inputState: { left: false, right: false },
  }

  const allServerEvents: ServerEvent[] = [
    { type: 'event', name: 'player_joined', data: { player: dummyPlayer } },
    { type: 'event', name: 'player_left', data: { playerId: 'p1' } },
    { type: 'event', name: 'player_ready', data: { playerId: 'p1' } },
    { type: 'event', name: 'player_unready', data: { playerId: 'p1' } },
    { type: 'event', name: 'player_died', data: { playerId: 'p1' } },
    { type: 'event', name: 'player_respawned', data: { playerId: 'p1' } },
    { type: 'event', name: 'countdown_tick', data: { count: 3 } },
    { type: 'event', name: 'countdown_cancelled', data: { reason: 'player left' } },
    { type: 'event', name: 'game_start', data: undefined },
    { type: 'event', name: 'alien_killed', data: { alienId: 'a1', playerId: 'p1' } },
    { type: 'event', name: 'score_awarded', data: { playerId: 'p1', points: 30, source: 'alien' } },
    { type: 'event', name: 'wave_complete', data: { wave: 1 } },
    { type: 'event', name: 'game_over', data: { result: 'victory' } },
    { type: 'event', name: 'invasion', data: undefined },
    { type: 'event', name: 'ufo_spawn', data: { x: 0 } },
  ]

  it('has exactly 15 event names', () => {
    expect(ALL_EVENT_NAMES).toHaveLength(15)
  })

  it('each event can be constructed as a valid ServerEvent', () => {
    expect(allServerEvents).toHaveLength(15)
    for (const evt of allServerEvents) {
      expect(evt.type).toBe('event')
      expect(typeof evt.name).toBe('string')
    }
  })

  it('all event names are represented in the ServerEvent list', () => {
    const constructedNames = allServerEvents.map((e) => e.name)
    for (const name of ALL_EVENT_NAMES) {
      expect(constructedNames).toContain(name)
    }
  })
})

// ─── 7. All ErrorCode values are valid snake_case ────────────────────────────

describe('All ErrorCode values are valid snake_case', () => {
  const ALL_ERROR_CODES: ErrorCode[] = [
    'room_full',
    'game_in_progress',
    'invalid_room',
    'invalid_message',
    'already_joined',
    'rate_limited',
    'countdown_in_progress',
  ]

  it('has exactly 7 error codes', () => {
    expect(ALL_ERROR_CODES).toHaveLength(7)
  })

  it('each code is valid snake_case', () => {
    const snakeCaseRegex = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/
    for (const code of ALL_ERROR_CODES) {
      expect(code).toMatch(snakeCaseRegex)
    }
  })

  it('each code can construct a valid error ServerMessage', () => {
    for (const code of ALL_ERROR_CODES) {
      const msg: ServerMessage = { type: 'error', code, message: `Error: ${code}` }
      expect(msg.type).toBe('error')
      expect(msg.code).toBe(code)
      expect(msg.message).toBeTruthy()
    }
  })
})

// ─── 8. All alien types have colors defined ──────────────────────────────────

describe('All alien types have colors defined', () => {
  const ALIEN_TYPES: ClassicAlienType[] = ['squid', 'crab', 'octopus']

  it('COLORS.alien has an entry for each alien type', () => {
    for (const type of ALIEN_TYPES) {
      expect(COLORS.alien[type]).toBeDefined()
      expect(typeof COLORS.alien[type]).toBe('string')
    }
  })

  it('ALIEN_REGISTRY has an entry for each alien type', () => {
    for (const type of ALIEN_TYPES) {
      expect(ALIEN_REGISTRY[type]).toBeDefined()
      expect(ALIEN_REGISTRY[type].points).toBeGreaterThan(0)
      expect(typeof ALIEN_REGISTRY[type].color).toBe('string')
    }
  })

  it('all alien color strings are valid hex colors', () => {
    const hexColorRegex = /^#[0-9a-fA-F]{6}$/
    for (const type of ALIEN_TYPES) {
      expect(COLORS.alien[type]).toMatch(hexColorRegex)
    }
  })
})

// ─── 9. All player slots have colors defined ─────────────────────────────────

describe('All player slots have colors defined', () => {
  const SLOTS: PlayerSlot[] = [1, 2, 3, 4]

  it('COLORS.player has an entry for each slot', () => {
    for (const slot of SLOTS) {
      expect(COLORS.player[slot]).toBeDefined()
      expect(typeof COLORS.player[slot]).toBe('string')
    }
  })

  it('PLAYER_COLORS has an entry for each slot', () => {
    for (const slot of SLOTS) {
      expect(PLAYER_COLORS[slot]).toBeDefined()
      expect(typeof PLAYER_COLORS[slot]).toBe('string')
    }
  })

  it('all player color strings are valid hex colors', () => {
    const hexColorRegex = /^#[0-9a-fA-F]{6}$/
    for (const slot of SLOTS) {
      expect(COLORS.player[slot]).toMatch(hexColorRegex)
    }
  })

  it('all four slots have distinct colors', () => {
    const colors = SLOTS.map((s) => COLORS.player[s])
    expect(new Set(colors).size).toBe(4)
  })
})

// ─── 10. STATUS_RENDER_MAP covers all statuses with no gaps and no overlaps ──

describe('STATUS_RENDER_MAP covers all statuses with no gaps and no overlaps', () => {
  const allMapped = [...STATUS_RENDER_MAP.lobby, ...STATUS_RENDER_MAP.game, ...STATUS_RENDER_MAP.gameOver]

  it('total mapped statuses equals ALL_GAME_STATUSES length', () => {
    expect(allMapped.length).toBe(ALL_GAME_STATUSES.length)
  })

  it('no duplicate statuses across groups', () => {
    expect(new Set(allMapped).size).toBe(allMapped.length)
  })

  it('every status in ALL_GAME_STATUSES is in the map', () => {
    for (const status of ALL_GAME_STATUSES) {
      expect(allMapped).toContain(status)
    }
  })

  it('every status in the map is in ALL_GAME_STATUSES', () => {
    for (const mapped of allMapped) {
      expect(ALL_GAME_STATUSES).toContain(mapped)
    }
  })
})

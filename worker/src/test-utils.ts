// worker/src/test-utils.ts
// Test helper factories for multiplayer game testing

import type {
  GameState,
  Player,
  AlienEntity,
  BulletEntity,
  BarrierEntity,
  BarrierSegment,
  UFOEntity,
  PlayerSlot,
  PlayerColor,
  ClassicAlienType,
  GameConfig,
  Entity,
} from '../../shared/types'
import { DEFAULT_CONFIG, LAYOUT, PLAYER_COLORS } from '../../shared/types'

/**
 * Creates a test player with sensible defaults
 */
export function createTestPlayer(overrides?: Partial<Player>): Player {
  const slot = (overrides?.slot ?? 1) as PlayerSlot
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    name: overrides?.name ?? 'TestPlayer',
    x: overrides?.x ?? Math.floor(DEFAULT_CONFIG.width / 2),
    slot,
    color: PLAYER_COLORS[slot],
    lastShotTick: overrides?.lastShotTick ?? 0,
    alive: overrides?.alive ?? true,
    lives: overrides?.lives ?? 3,
    respawnAtTick: overrides?.respawnAtTick ?? null,
    kills: overrides?.kills ?? 0,
    inputState: overrides?.inputState ?? { left: false, right: false },
    ...overrides,
  }
}

/**
 * Creates a test game state with sensible defaults
 */
export function createTestGameState(overrides?: Partial<GameState>): GameState {
  return {
    roomId: 'TEST01',
    mode: 'solo',
    status: 'waiting',
    tick: 0,
    rngSeed: 12345,
    countdownRemaining: null,
    players: {},
    readyPlayerIds: [],
    entities: [],
    wave: 1,
    lives: 3,
    score: 0,
    alienDirection: 1,
    config: DEFAULT_CONFIG,
    ...overrides,
  }
}

/**
 * Creates a test alien entity
 */
export function createTestAlien(
  id: string,
  x: number,
  y: number,
  overrides?: Partial<AlienEntity>
): AlienEntity {
  return {
    kind: 'alien',
    id,
    x,
    y,
    type: overrides?.type ?? 'octopus',
    alive: overrides?.alive ?? true,
    row: overrides?.row ?? 0,
    col: overrides?.col ?? 0,
    points: overrides?.points ?? 10,
    ...overrides,
  }
}

/**
 * Creates a test bullet entity
 */
export function createTestBullet(
  id: string,
  x: number,
  y: number,
  ownerId: string | null,
  dy: -1 | 1
): BulletEntity {
  return {
    kind: 'bullet',
    id,
    x,
    y,
    ownerId,
    dy,
  }
}

/**
 * Creates a test barrier entity
 */
export function createTestBarrier(
  id: string,
  x: number,
  segments?: BarrierSegment[]
): BarrierEntity {
  return {
    kind: 'barrier',
    id,
    x,
    segments: segments ?? [
      { offsetX: 0, offsetY: 0, health: 4 },
      { offsetX: 1, offsetY: 0, health: 4 },
      { offsetX: 2, offsetY: 0, health: 4 },
      { offsetX: 0, offsetY: 1, health: 4 },
      { offsetX: 2, offsetY: 1, health: 4 },
    ],
  }
}

/**
 * Creates a test UFO entity
 */
export function createTestUFO(
  id: string,
  x: number,
  overrides?: Partial<UFOEntity>
): UFOEntity {
  return {
    kind: 'ufo',
    id,
    x,
    y: 1,
    direction: overrides?.direction ?? 1,
    alive: overrides?.alive ?? true,
    points: overrides?.points ?? 100,
    ...overrides,
  }
}

/**
 * Creates a game state with a player already added
 */
export function createTestGameStateWithPlayer(
  playerOverrides?: Partial<Player>,
  stateOverrides?: Partial<GameState>
): { state: GameState; player: Player } {
  const player = createTestPlayer(playerOverrides)
  const state = createTestGameState({
    players: { [player.id]: player },
    mode: 'solo',
    ...stateOverrides,
  })
  return { state, player }
}

/**
 * Creates a game state with multiple players
 */
export function createTestGameStateWithPlayers(
  count: number,
  stateOverrides?: Partial<GameState>
): { state: GameState; players: Player[] } {
  const players: Player[] = []
  const playersRecord: Record<string, Player> = {}

  for (let i = 0; i < count; i++) {
    const slot = (i + 1) as PlayerSlot
    const player = createTestPlayer({
      id: `player-${i + 1}`,
      name: `Player${i + 1}`,
      slot,
      x: Math.floor(DEFAULT_CONFIG.width / (count + 1)) * (i + 1),
    })
    players.push(player)
    playersRecord[player.id] = player
  }

  const state = createTestGameState({
    players: playersRecord,
    mode: count === 1 ? 'solo' : 'coop',
    ...stateOverrides,
  })

  return { state, players }
}

/**
 * Creates a game state in playing status with entities
 */
export function createTestPlayingState(
  playerCount: number = 1,
  options?: {
    aliens?: AlienEntity[]
    bullets?: BulletEntity[]
    barriers?: BarrierEntity[]
  }
): { state: GameState; players: Player[] } {
  const { state, players } = createTestGameStateWithPlayers(playerCount)

  // Default aliens if not provided
  const aliens = options?.aliens ?? [
    createTestAlien('alien-1', 20, 5),
    createTestAlien('alien-2', 30, 5),
    createTestAlien('alien-3', 40, 5),
  ]

  const entities: Entity[] = [
    ...aliens,
    ...(options?.bullets ?? []),
    ...(options?.barriers ?? []),
  ]

  state.status = 'playing'
  state.entities = entities
  state.lives = playerCount === 1 ? 3 : 5

  return { state, players }
}

/**
 * Creates a formation of aliens for testing
 */
export function createTestAlienFormation(
  cols: number = 11,
  rows: number = 5,
  startX: number = 10,
  startY: number = LAYOUT.ALIEN_START_Y
): AlienEntity[] {
  const aliens: AlienEntity[] = []
  const types: ClassicAlienType[] = ['squid', 'crab', 'crab', 'octopus', 'octopus']
  const points: Record<ClassicAlienType, number> = { squid: 30, crab: 20, octopus: 10 }

  for (let row = 0; row < rows; row++) {
    const type = types[row] ?? 'octopus'
    for (let col = 0; col < cols; col++) {
      aliens.push({
        kind: 'alien',
        id: `alien-${row}-${col}`,
        x: startX + col * LAYOUT.ALIEN_COL_SPACING,
        y: startY + row * LAYOUT.ALIEN_ROW_SPACING,
        type,
        alive: true,
        row,
        col,
        points: points[type],
      })
    }
  }
  return aliens
}

/**
 * Mock DurableObjectState for testing
 */
export function createMockDurableObjectState(): {
  storage: {
    get: <T>(key: string) => Promise<T | undefined>
    put: (key: string, value: unknown) => Promise<void>
    delete: (key: string) => Promise<boolean>
  }
  blockConcurrencyWhile: <T>(fn: () => Promise<T>) => Promise<T>
} {
  const data = new Map<string, unknown>()

  return {
    storage: {
      get: async <T>(key: string): Promise<T | undefined> => {
        return data.get(key) as T | undefined
      },
      put: async (key: string, value: unknown): Promise<void> => {
        data.set(key, value)
      },
      delete: async (key: string): Promise<boolean> => {
        return data.delete(key)
      },
    },
    blockConcurrencyWhile: async <T>(fn: () => Promise<T>): Promise<T> => {
      return fn()
    },
  }
}

/**
 * Helper to check if an event was emitted
 */
export function hasEvent(
  events: Array<{ type: string; name?: string }>,
  name: string
): boolean {
  return events.some(e => e.type === 'event' && e.name === name)
}

/**
 * Helper to get event data
 */
export function getEventData<T>(
  events: Array<{ type: string; name?: string; data?: T }>,
  name: string
): T | undefined {
  const event = events.find(e => e.type === 'event' && e.name === name)
  return event?.data
}

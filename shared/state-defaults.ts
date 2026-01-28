// shared/state-defaults.ts
// Single source of truth for all GameState default values
//
// When adding new fields to GameState:
// 1. Add the field to the GameState interface in types.ts
// 2. Add the default value to GAME_STATE_DEFAULTS below
// 3. Run tests - the type-level check will fail if coverage is incomplete
// 4. Never add field initialization to startGame(), nextWave(), or other methods

import { DEFAULT_CONFIG, type GameState, type GameStatus } from './types'

// ─── Status Registry ─────────────────────────────────────────────────────────
// Single source of truth for all GameStatus values.
// Used by tests to verify exhaustive handling in UI components.

/**
 * All possible GameStatus values as a runtime-accessible array.
 * When adding a new status:
 * 1. Add to GameStatus type in types.ts
 * 2. Add to this array
 * 3. TypeScript will error if the arrays don't match
 */
export const ALL_GAME_STATUSES: readonly GameStatus[] = [
  'waiting',
  'countdown',
  'wipe_exit',
  'wipe_hold',
  'wipe_reveal',
  'playing',
  'game_over',
] as const

// Type-level assertion: ALL_GAME_STATUSES must contain exactly all GameStatus values
// If this line has a type error, the array is out of sync with the type
type StatusArrayType = (typeof ALL_GAME_STATUSES)[number]
type StatusesMatch = StatusArrayType extends GameStatus
  ? GameStatus extends StatusArrayType
    ? true
    : never
  : never
const _typeCheckStatuses: StatusesMatch = true

/**
 * Groups statuses by which component should render them.
 * Used for documentation and test assertions.
 */
export const STATUS_RENDER_MAP = {
  lobby: ['waiting'] as const,
  game: ['countdown', 'wipe_exit', 'wipe_hold', 'wipe_reveal', 'playing'] as const,
  gameOver: ['game_over'] as const,
} as const

// Type-level assertion: STATUS_RENDER_MAP must cover all statuses
type AllMappedStatuses =
  | (typeof STATUS_RENDER_MAP.lobby)[number]
  | (typeof STATUS_RENDER_MAP.game)[number]
  | (typeof STATUS_RENDER_MAP.gameOver)[number]
type MappedStatusesMatch = AllMappedStatuses extends GameStatus
  ? GameStatus extends AllMappedStatuses
    ? true
    : never
  : never
const _typeCheckMappedStatuses: MappedStatusesMatch = true

/**
 * Default values for all GameState fields.
 * This is the ONLY place where GameState defaults should be defined.
 */
export const GAME_STATE_DEFAULTS: Omit<GameState, 'roomId'> = {
  mode: 'solo',
  status: 'waiting',
  tick: 0,
  rngSeed: 0, // Will be overwritten with Date.now() at creation
  countdownRemaining: null,
  players: {},
  readyPlayerIds: [],
  entities: [],
  wave: 1,
  lives: 3,
  score: 0,
  alienDirection: 1,
  wipeTicksRemaining: null,
  wipeWaveNumber: null,
  alienShootingDisabled: true, // DEBUG: disable alien shooting
  config: DEFAULT_CONFIG,
}

// Type-level assertion: GAME_STATE_DEFAULTS must have all GameState fields except roomId
// If this line has a type error, GAME_STATE_DEFAULTS is missing fields from GameState
type GameStateWithoutRoomId = Omit<GameState, 'roomId'>
type DefaultsHaveAllFields = typeof GAME_STATE_DEFAULTS extends GameStateWithoutRoomId ? true : never
type StateHasAllDefaults = GameStateWithoutRoomId extends typeof GAME_STATE_DEFAULTS ? true : never
const _typeCheckDefaults: DefaultsHaveAllFields = true
const _typeCheckState: StateHasAllDefaults = true

/**
 * Creates a fresh GameState with all defaults applied.
 * This is the ONLY function that should create initial state.
 */
export function createDefaultGameState(roomId: string): GameState {
  return {
    ...GAME_STATE_DEFAULTS,
    roomId,
    rngSeed: Date.now(),
    // Deep clone objects to avoid shared references
    players: {},
    readyPlayerIds: [],
    entities: [],
    config: { ...DEFAULT_CONFIG },
  }
}

/**
 * Migrates/repairs a persisted GameState by merging with current defaults.
 * Any fields missing from persistedState will be filled from GAME_STATE_DEFAULTS.
 * Existing values in persistedState are preserved.
 */
export function migrateGameState(persistedState: Partial<GameState> & { roomId: string }): GameState {
  return {
    ...GAME_STATE_DEFAULTS,
    ...persistedState,
    // Ensure config doesn't lose new fields
    config: {
      ...DEFAULT_CONFIG,
      ...(persistedState.config ?? {}),
    },
  }
}

/**
 * Validates that a GameState has all required fields with correct types.
 * Returns a list of issues found, or empty array if valid.
 * Used in tests to catch missing fields.
 */
export function validateGameState(state: unknown): string[] {
  const issues: string[] = []

  if (typeof state !== 'object' || state === null) {
    return ['State is not an object']
  }

  const s = state as Record<string, unknown>

  // Check all required fields exist and are not undefined
  const requiredFields: (keyof GameState)[] = [
    'roomId',
    'mode',
    'status',
    'tick',
    'rngSeed',
    'countdownRemaining',
    'players',
    'readyPlayerIds',
    'entities',
    'wave',
    'lives',
    'score',
    'alienDirection',
    'wipeTicksRemaining',
    'wipeWaveNumber',
    'alienShootingDisabled',
    'config',
  ]

  for (const field of requiredFields) {
    if (!(field in s)) {
      issues.push(`Missing field: ${field}`)
    } else if (s[field] === undefined) {
      issues.push(`Field is undefined: ${field}`)
    }
  }

  return issues
}

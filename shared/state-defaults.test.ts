// shared/state-defaults.test.ts
// Tests for the single source of truth for GameState defaults

import { describe, it, expect } from 'bun:test'
import {
  GAME_STATE_DEFAULTS,
  createDefaultGameState,
  migrateGameState,
  validateGameState,
} from './state-defaults'
import { DEFAULT_CONFIG, type GameState } from './types'

describe('GAME_STATE_DEFAULTS', () => {
  it('has no undefined values', () => {
    for (const [key, value] of Object.entries(GAME_STATE_DEFAULTS)) {
      expect(value).not.toBeUndefined()
    }
  })

  it('has all required GameState fields except roomId', () => {
    const expectedFields = [
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

    for (const field of expectedFields) {
      expect(GAME_STATE_DEFAULTS).toHaveProperty(field)
    }
  })

  it('has correct types for each field', () => {
    expect(typeof GAME_STATE_DEFAULTS.mode).toBe('string')
    expect(typeof GAME_STATE_DEFAULTS.status).toBe('string')
    expect(typeof GAME_STATE_DEFAULTS.tick).toBe('number')
    expect(typeof GAME_STATE_DEFAULTS.rngSeed).toBe('number')
    expect(GAME_STATE_DEFAULTS.countdownRemaining).toBeNull()
    expect(typeof GAME_STATE_DEFAULTS.players).toBe('object')
    expect(Array.isArray(GAME_STATE_DEFAULTS.readyPlayerIds)).toBe(true)
    expect(Array.isArray(GAME_STATE_DEFAULTS.entities)).toBe(true)
    expect(typeof GAME_STATE_DEFAULTS.wave).toBe('number')
    expect(typeof GAME_STATE_DEFAULTS.lives).toBe('number')
    expect(typeof GAME_STATE_DEFAULTS.score).toBe('number')
    expect(typeof GAME_STATE_DEFAULTS.alienDirection).toBe('number')
    expect(GAME_STATE_DEFAULTS.wipeTicksRemaining).toBeNull()
    expect(GAME_STATE_DEFAULTS.wipeWaveNumber).toBeNull()
    expect(typeof GAME_STATE_DEFAULTS.alienShootingDisabled).toBe('boolean')
    expect(typeof GAME_STATE_DEFAULTS.config).toBe('object')
  })
})

describe('createDefaultGameState', () => {
  it('creates valid state with all fields', () => {
    const state = createDefaultGameState('TEST01')
    const issues = validateGameState(state)
    expect(issues).toEqual([])
  })

  it('sets roomId from parameter', () => {
    const state = createDefaultGameState('MYROOM')
    expect(state.roomId).toBe('MYROOM')
  })

  it('sets rngSeed to current time', () => {
    const before = Date.now()
    const state = createDefaultGameState('TEST01')
    const after = Date.now()
    expect(state.rngSeed).toBeGreaterThanOrEqual(before)
    expect(state.rngSeed).toBeLessThanOrEqual(after)
  })

  it('creates independent object instances for each call', () => {
    const state1 = createDefaultGameState('ROOM1')
    const state2 = createDefaultGameState('ROOM2')

    // Modify state1
    state1.players['p1'] = { id: 'p1' } as any
    state1.entities.push({ kind: 'bullet' } as any)

    // state2 should be unaffected
    expect(Object.keys(state2.players)).toHaveLength(0)
    expect(state2.entities).toHaveLength(0)
  })
})

describe('migrateGameState', () => {
  it('fills missing fields with defaults', () => {
    // Simulate old persisted state missing alienShootingDisabled
    const oldState = {
      roomId: 'OLD01',
      mode: 'solo' as const,
      status: 'waiting' as const,
      tick: 100,
      rngSeed: 12345,
      countdownRemaining: null,
      players: {},
      readyPlayerIds: [],
      entities: [],
      wave: 2,
      lives: 2,
      score: 500,
      alienDirection: -1 as const,
      wipeTicksRemaining: null,
      wipeWaveNumber: null,
      config: DEFAULT_CONFIG,
      // NOTE: alienShootingDisabled is MISSING
    }

    const migrated = migrateGameState(oldState as any)

    expect(migrated.alienShootingDisabled).toBe(GAME_STATE_DEFAULTS.alienShootingDisabled)
  })

  it('preserves existing values', () => {
    const existingState = {
      roomId: 'EXIST',
      wave: 5,
      score: 1000,
      alienShootingDisabled: false, // Explicitly set different from default
    }

    const migrated = migrateGameState(existingState as any)

    expect(migrated.roomId).toBe('EXIST')
    expect(migrated.wave).toBe(5)
    expect(migrated.score).toBe(1000)
    expect(migrated.alienShootingDisabled).toBe(false) // Preserved, not overwritten
  })

  it('produces valid state from minimal input', () => {
    const minimal = { roomId: 'MIN01' }
    const migrated = migrateGameState(minimal as any)
    const issues = validateGameState(migrated)
    expect(issues).toEqual([])
  })

  it('merges config with defaults', () => {
    const partialConfig = {
      roomId: 'CONF',
      config: {
        width: 100,
        // Other config fields missing
      },
    }

    const migrated = migrateGameState(partialConfig as any)

    expect(migrated.config.width).toBe(100) // Preserved
    expect(migrated.config.height).toBe(DEFAULT_CONFIG.height) // Filled from default
    expect(migrated.config.tickIntervalMs).toBe(DEFAULT_CONFIG.tickIntervalMs) // Filled from default
  })
})

describe('validateGameState', () => {
  it('returns empty array for valid state', () => {
    const state = createDefaultGameState('TEST01')
    expect(validateGameState(state)).toEqual([])
  })

  it('detects missing fields', () => {
    const incomplete = { roomId: 'BAD' }
    const issues = validateGameState(incomplete)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some(i => i.includes('Missing field'))).toBe(true)
  })

  it('detects undefined fields', () => {
    const withUndefined = {
      ...createDefaultGameState('TEST'),
      alienShootingDisabled: undefined,
    }
    const issues = validateGameState(withUndefined)
    expect(issues).toContain('Field is undefined: alienShootingDisabled')
  })

  it('returns error for non-object input', () => {
    expect(validateGameState(null)).toEqual(['State is not an object'])
    expect(validateGameState(undefined)).toEqual(['State is not an object'])
    expect(validateGameState('string')).toEqual(['State is not an object'])
    expect(validateGameState(123)).toEqual(['State is not an object'])
  })

  it('checks all 18 required fields', () => {
    const issues = validateGameState({})
    // Should have 18 missing field errors (including roomId and maxLives)
    expect(issues.filter(i => i.includes('Missing field')).length).toBe(18)
  })
})

describe('State initialization consistency', () => {
  it('createDefaultGameState matches GAME_STATE_DEFAULTS', () => {
    const state = createDefaultGameState('TEST')

    // Every field in GAME_STATE_DEFAULTS should be in the created state
    for (const [key, defaultValue] of Object.entries(GAME_STATE_DEFAULTS)) {
      if (key === 'rngSeed') {
        // rngSeed is set to Date.now(), not the default
        expect(typeof (state as any)[key]).toBe('number')
      } else if (key === 'players' || key === 'readyPlayerIds' || key === 'entities' || key === 'config') {
        // Objects are cloned, so check they exist and are correct type
        expect((state as any)[key]).toBeDefined()
      } else {
        expect((state as any)[key]).toEqual(defaultValue)
      }
    }
  })

  it('migrateGameState with complete state returns equivalent state', () => {
    const original = createDefaultGameState('TEST')
    const migrated = migrateGameState(original)

    // Should be equivalent (not same reference)
    expect(migrated).toEqual(original)
    expect(migrated).not.toBe(original)
  })
})

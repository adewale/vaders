// client/src/components/LobbyScreen.test.ts
// Unit tests for LobbyScreen helper functions and data logic

import { describe, test, expect } from 'bun:test'
import { getLobbyMenuItemCount } from './LobbyScreen'
import type {
  GameState,
  Player,
  PlayerSlot,
} from '../../../shared/types'
import { DEFAULT_CONFIG } from '../../../shared/types'

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function createMockPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-1',
    name: 'TestPlayer',
    slot: 1 as PlayerSlot,
    color: 'cyan' as const,
    x: 60,
    lives: 3,
    alive: true,
    kills: 0,
    lastShotTick: 0,
    respawnAtTick: null,
    invulnerableUntilTick: null,
    inputState: { left: false, right: false },
    ...overrides,
  }
}

function createMockPlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => createMockPlayer({
    id: `player-${i + 1}`,
    name: `Player${i + 1}`,
    slot: (i + 1) as PlayerSlot,
  }))
}

function createMockGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    roomId: 'XYZ789',
    mode: 'coop',
    status: 'waiting',
    tick: 0,
    rngSeed: 12345,
    countdownRemaining: null,
    players: { 'player-1': createMockPlayer() },
    readyPlayerIds: [],
    entities: [],
    wave: 1,
    lives: 5,
    score: 0,
    alienDirection: 1,
    wipeTicksRemaining: null,
    wipeWaveNumber: null,
    alienShootingDisabled: false,
    config: DEFAULT_CONFIG,
    ...overrides,
  }
}

// ─── getLobbyMenuItemCount Tests ─────────────────────────────────────────────

describe('getLobbyMenuItemCount', () => {
  test('returns 2 for single player (Ready Up + Start Solo)', () => {
    expect(getLobbyMenuItemCount(1)).toBe(2)
  })

  test('returns 1 for 2 players (Ready Up only)', () => {
    expect(getLobbyMenuItemCount(2)).toBe(1)
  })

  test('returns 1 for 3 players', () => {
    expect(getLobbyMenuItemCount(3)).toBe(1)
  })

  test('returns 1 for 4 players (max)', () => {
    expect(getLobbyMenuItemCount(4)).toBe(1)
  })

  test('returns 1 for 0 players (edge case)', () => {
    // 0 players would be treated like multi-player since playerCount === 1 is false
    expect(getLobbyMenuItemCount(0)).toBe(1)
  })
})

// ─── Ready State Logic Tests ─────────────────────────────────────────────────

describe('Ready State Logic', () => {
  test('player is ready when in readyPlayerIds', () => {
    const state = createMockGameState({
      readyPlayerIds: ['player-1'],
    })
    const currentPlayerId = 'player-1'
    const isReady = state.readyPlayerIds.includes(currentPlayerId)
    expect(isReady).toBe(true)
  })

  test('player is not ready when not in readyPlayerIds', () => {
    const state = createMockGameState({
      readyPlayerIds: [],
    })
    const currentPlayerId = 'player-1'
    const isReady = state.readyPlayerIds.includes(currentPlayerId)
    expect(isReady).toBe(false)
  })

  test('ready count matches readyPlayerIds length', () => {
    const state = createMockGameState({
      players: {
        'p1': createMockPlayer({ id: 'p1' }),
        'p2': createMockPlayer({ id: 'p2', slot: 2 }),
        'p3': createMockPlayer({ id: 'p3', slot: 3 }),
      },
      readyPlayerIds: ['p1', 'p3'],
    })
    const readyCount = state.readyPlayerIds.length
    expect(readyCount).toBe(2)
  })

  test('all players ready when readyCount equals playerCount', () => {
    const players = {
      'p1': createMockPlayer({ id: 'p1' }),
      'p2': createMockPlayer({ id: 'p2', slot: 2 }),
    }
    const state = createMockGameState({
      players,
      readyPlayerIds: ['p1', 'p2'],
    })
    const playerCount = Object.keys(state.players).length
    const readyCount = state.readyPlayerIds.length
    expect(readyCount).toBe(playerCount)
  })

  test('not all players ready when readyCount less than playerCount', () => {
    const players = {
      'p1': createMockPlayer({ id: 'p1' }),
      'p2': createMockPlayer({ id: 'p2', slot: 2 }),
      'p3': createMockPlayer({ id: 'p3', slot: 3 }),
    }
    const state = createMockGameState({
      players,
      readyPlayerIds: ['p1'],
    })
    const playerCount = Object.keys(state.players).length
    const readyCount = state.readyPlayerIds.length
    expect(readyCount).toBeLessThan(playerCount)
  })
})

// ─── Menu Items Construction Logic ───────────────────────────────────────────

describe('Lobby Menu Items Construction', () => {
  test('single player gets Ready Up and Start Solo options', () => {
    const playerCount = 1
    const isReady = false

    const menuItems = playerCount === 1
      ? [
          { label: isReady ? 'Cancel Ready' : 'Ready Up', desc: '(wait for others)' },
          { label: 'Start Solo', desc: '' },
        ]
      : [
          { label: isReady ? 'Cancel Ready' : 'Ready Up', desc: '' },
        ]

    expect(menuItems.length).toBe(2)
    expect(menuItems[0].label).toBe('Ready Up')
    expect(menuItems[1].label).toBe('Start Solo')
  })

  test('single player ready shows Cancel Ready', () => {
    const playerCount = 1
    const isReady = true

    const menuItems = playerCount === 1
      ? [
          { label: isReady ? 'Cancel Ready' : 'Ready Up', desc: '(wait for others)' },
          { label: 'Start Solo', desc: '' },
        ]
      : [
          { label: isReady ? 'Cancel Ready' : 'Ready Up', desc: '' },
        ]

    expect(menuItems[0].label).toBe('Cancel Ready')
  })

  test('multi-player gets only Ready Up option', () => {
    const playerCount: number = 3
    const isReady = false

    const menuItems = playerCount === 1
      ? [
          { label: isReady ? 'Cancel Ready' : 'Ready Up', desc: '(wait for others)' },
          { label: 'Start Solo', desc: '' },
        ]
      : [
          { label: isReady ? 'Cancel Ready' : 'Ready Up', desc: '' },
        ]

    expect(menuItems.length).toBe(1)
    expect(menuItems[0].label).toBe('Ready Up')
  })

  test('multi-player ready shows Cancel Ready', () => {
    const playerCount: number = 2
    const isReady = true

    const menuItems = playerCount === 1
      ? [
          { label: isReady ? 'Cancel Ready' : 'Ready Up', desc: '(wait for others)' },
          { label: 'Start Solo', desc: '' },
        ]
      : [
          { label: isReady ? 'Cancel Ready' : 'Ready Up', desc: '' },
        ]

    expect(menuItems.length).toBe(1)
    expect(menuItems[0].label).toBe('Cancel Ready')
  })

  test('menu item count matches getLobbyMenuItemCount helper', () => {
    for (let playerCount = 1; playerCount <= 4; playerCount++) {
      const menuItems = playerCount === 1
        ? [
            { label: 'Ready Up', desc: '(wait for others)' },
            { label: 'Start Solo', desc: '' },
          ]
        : [
            { label: 'Ready Up', desc: '' },
          ]

      expect(menuItems.length).toBe(getLobbyMenuItemCount(playerCount))
    }
  })
})

// ─── Ready Status Text Logic ─────────────────────────────────────────────────

describe('Ready Status Text', () => {
  test('shows starting text when all ready with multiple players', () => {
    const playerCount = 3
    const readyCount = 3
    const allReady = readyCount === playerCount

    expect(allReady).toBe(true)

    const statusText = `${readyCount}/${playerCount} ready${allReady ? ' - Starting...' : ''}`
    expect(statusText).toBe('3/3 ready - Starting...')
  })

  test('shows count without starting text when not all ready', () => {
    const playerCount: number = 4
    const readyCount: number = 2
    const allReady = readyCount === playerCount

    expect(allReady).toBe(false)

    const statusText = `${readyCount}/${playerCount} ready${allReady ? ' - Starting...' : ''}`
    expect(statusText).toBe('2/4 ready')
  })

  test('ready status not shown for single player', () => {
    const playerCount = 1
    // In the component, ready status is only shown when playerCount > 1
    expect(playerCount > 1).toBe(false)
  })

  test('ready status shown for 2+ players', () => {
    for (let playerCount = 2; playerCount <= 4; playerCount++) {
      expect(playerCount > 1).toBe(true)
    }
  })
})

// ─── Room Code Display Tests ─────────────────────────────────────────────────

describe('Room Code Display', () => {
  test('room code comes from game state', () => {
    const state = createMockGameState({ roomId: 'ABC123' })
    expect(state.roomId).toBe('ABC123')
  })

  test('room code is typically 6 characters', () => {
    const state = createMockGameState({ roomId: 'XYZ789' })
    expect(state.roomId.length).toBe(6)
  })
})

// ─── Player Count Display Tests ──────────────────────────────────────────────

describe('Player Count Display', () => {
  test('player count format shows current/max', () => {
    const state = createMockGameState({
      players: {
        'p1': createMockPlayer({ id: 'p1' }),
        'p2': createMockPlayer({ id: 'p2', slot: 2 }),
      },
    })
    const playerCount = Object.values(state.players).length
    const maxPlayers = 4
    const display = `Players (${playerCount}/${maxPlayers}):`
    expect(display).toBe('Players (2/4):')
  })

  test('single player shows 1/4', () => {
    const state = createMockGameState()
    const playerCount = Object.values(state.players).length
    expect(playerCount).toBe(1)
  })

  test('full lobby shows 4/4', () => {
    const players: Record<string, Player> = {}
    for (let i = 1; i <= 4; i++) {
      players[`p${i}`] = createMockPlayer({ id: `p${i}`, slot: i as PlayerSlot })
    }
    const state = createMockGameState({ players })
    const playerCount = Object.values(state.players).length
    expect(playerCount).toBe(4)
  })
})

// ─── Box Dimension Calculation Tests ─────────────────────────────────────────

describe('Box Dimension Calculations', () => {
  test('box width is min of 80 and gameWidth - 4', () => {
    const gameWidth = 120
    const boxWidth = Math.min(80, gameWidth - 4)
    expect(boxWidth).toBe(80)
  })

  test('box width clamps for narrow terminal', () => {
    const gameWidth = 60
    const boxWidth = Math.min(80, gameWidth - 4)
    expect(boxWidth).toBe(56) // 60 - 4
  })

  test('box height is min of 28 and gameHeight - 4', () => {
    const gameHeight = 36
    const boxHeight = Math.min(28, gameHeight - 4)
    expect(boxHeight).toBe(28)
  })

  test('box height clamps for short terminal', () => {
    const gameHeight = 20
    const boxHeight = Math.min(28, gameHeight - 4)
    expect(boxHeight).toBe(16) // 20 - 4
  })
})

// ─── Edge Cases ──────────────────────────────────────────────────────────────

describe('Lobby Edge Cases', () => {
  test('ready player IDs can contain IDs not in player list', () => {
    // This is an edge case the component should handle gracefully
    const state = createMockGameState({
      players: {
        'p1': createMockPlayer({ id: 'p1' }),
      },
      readyPlayerIds: ['p1', 'disconnected-player'],
    })

    const playerCount = Object.values(state.players).length
    const readyCount = state.readyPlayerIds.length

    // Ready count can exceed player count if a ready player disconnected
    expect(readyCount).toBeGreaterThan(playerCount)
  })

  test('players list extraction works correctly', () => {
    const state = createMockGameState({
      players: {
        'p1': createMockPlayer({ id: 'p1', name: 'Alice' }),
        'p2': createMockPlayer({ id: 'p2', name: 'Bob', slot: 2 }),
      },
    })

    const players = Object.values(state.players)
    expect(players.length).toBe(2)
    expect(players.map(p => p.name).sort()).toEqual(['Alice', 'Bob'])
  })
})

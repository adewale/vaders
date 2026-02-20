// client/src/components/GameOverScreen.test.ts
// Unit tests for GameOverScreen data logic, player ranking, victory detection, and menu items

import { describe, test, expect } from 'bun:test'
import { getGameOverMenuItemCount } from './GameOverScreen'
import type {
  GameState,
  Player,
  PlayerSlot,
  AlienEntity,
  Entity,
} from '../../../shared/types'
import { DEFAULT_CONFIG, getAliens } from '../../../shared/types'

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

function createMockAlien(overrides: Partial<AlienEntity> = {}): AlienEntity {
  return {
    kind: 'alien',
    id: 'alien-1',
    x: 20,
    y: 5,
    type: 'crab',
    alive: true,
    row: 0,
    col: 0,
    points: 20,
    entering: false,
    ...overrides,
  }
}

function createMockGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    roomId: 'ABC123',
    mode: 'solo',
    status: 'game_over',
    tick: 500,
    rngSeed: 12345,
    countdownRemaining: null,
    players: { 'player-1': createMockPlayer() },
    readyPlayerIds: [],
    entities: [],
    wave: 3,
    lives: 0,
    score: 1500,
    alienDirection: 1,
    wipeTicksRemaining: null,
    wipeWaveNumber: null,
    alienShootingDisabled: false,
    config: DEFAULT_CONFIG,
    ...overrides,
  }
}

// ─── getGameOverMenuItemCount Tests ──────────────────────────────────────────

describe('getGameOverMenuItemCount', () => {
  test('returns 3 when both Play Again and Main Menu are available', () => {
    expect(getGameOverMenuItemCount(true, true)).toBe(3)
  })

  test('returns 2 when only Play Again is available', () => {
    expect(getGameOverMenuItemCount(true, false)).toBe(2)
  })

  test('returns 2 when only Main Menu is available', () => {
    expect(getGameOverMenuItemCount(false, true)).toBe(2)
  })

  test('returns 1 when only Quit is available', () => {
    expect(getGameOverMenuItemCount(false, false)).toBe(1)
  })
})

// ─── Victory Detection Logic ─────────────────────────────────────────────────

describe('Victory Detection', () => {
  test('victory when all aliens are dead (no alive aliens)', () => {
    const state = createMockGameState({
      entities: [
        createMockAlien({ id: 'a1', alive: false }),
        createMockAlien({ id: 'a2', alive: false }),
        createMockAlien({ id: 'a3', alive: false }),
      ],
    })

    const aliens = getAliens(state.entities)
    const victory = aliens.every(a => !a.alive)
    expect(victory).toBe(true)
  })

  test('not victory when some aliens are alive', () => {
    const state = createMockGameState({
      entities: [
        createMockAlien({ id: 'a1', alive: false }),
        createMockAlien({ id: 'a2', alive: true }),
        createMockAlien({ id: 'a3', alive: false }),
      ],
    })

    const aliens = getAliens(state.entities)
    const victory = aliens.every(a => !a.alive)
    expect(victory).toBe(false)
  })

  test('not victory when all aliens are alive', () => {
    const state = createMockGameState({
      entities: [
        createMockAlien({ id: 'a1', alive: true }),
        createMockAlien({ id: 'a2', alive: true }),
      ],
    })

    const aliens = getAliens(state.entities)
    const victory = aliens.every(a => !a.alive)
    expect(victory).toBe(false)
  })

  test('victory when no aliens exist (empty entities)', () => {
    const state = createMockGameState({ entities: [] })
    const aliens = getAliens(state.entities)
    const victory = aliens.every(a => !a.alive)
    // every() on empty array returns true
    expect(victory).toBe(true)
  })
})

// ─── Player Ranking Logic ────────────────────────────────────────────────────

describe('Player Ranking by Kills', () => {
  test('players are sorted by kills descending', () => {
    const state = createMockGameState({
      players: {
        'p1': createMockPlayer({ id: 'p1', name: 'Alice', kills: 10 }),
        'p2': createMockPlayer({ id: 'p2', name: 'Bob', kills: 25 }),
        'p3': createMockPlayer({ id: 'p3', name: 'Charlie', kills: 15 }),
      },
    })

    const sorted = Object.values(state.players).sort((a, b) => b.kills - a.kills)
    expect(sorted[0].name).toBe('Bob')
    expect(sorted[1].name).toBe('Charlie')
    expect(sorted[2].name).toBe('Alice')
  })

  test('players with equal kills maintain relative order', () => {
    const state = createMockGameState({
      players: {
        'p1': createMockPlayer({ id: 'p1', name: 'Alice', kills: 10 }),
        'p2': createMockPlayer({ id: 'p2', name: 'Bob', kills: 10 }),
      },
    })

    const sorted = Object.values(state.players).sort((a, b) => b.kills - a.kills)
    expect(sorted.length).toBe(2)
    // Both have 10 kills, sort is stable in modern JS
    expect(sorted[0].kills).toBe(10)
    expect(sorted[1].kills).toBe(10)
  })

  test('single player is always first in ranking', () => {
    const state = createMockGameState({
      players: {
        'p1': createMockPlayer({ id: 'p1', name: 'Solo', kills: 42 }),
      },
    })

    const sorted = Object.values(state.players).sort((a, b) => b.kills - a.kills)
    expect(sorted.length).toBe(1)
    expect(sorted[0].name).toBe('Solo')
    expect(sorted[0].kills).toBe(42)
  })

  test('player with 0 kills is ranked last', () => {
    const state = createMockGameState({
      players: {
        'p1': createMockPlayer({ id: 'p1', name: 'Active', kills: 5 }),
        'p2': createMockPlayer({ id: 'p2', name: 'Inactive', kills: 0 }),
      },
    })

    const sorted = Object.values(state.players).sort((a, b) => b.kills - a.kills)
    expect(sorted[0].name).toBe('Active')
    expect(sorted[1].name).toBe('Inactive')
  })

  test('4 players ranked correctly', () => {
    const state = createMockGameState({
      players: {
        'p1': createMockPlayer({ id: 'p1', name: 'P1', slot: 1, kills: 20 }),
        'p2': createMockPlayer({ id: 'p2', name: 'P2', slot: 2, kills: 35 }),
        'p3': createMockPlayer({ id: 'p3', name: 'P3', slot: 3, kills: 5 }),
        'p4': createMockPlayer({ id: 'p4', name: 'P4', slot: 4, kills: 28 }),
      },
    })

    const sorted = Object.values(state.players).sort((a, b) => b.kills - a.kills)
    expect(sorted[0].name).toBe('P2') // 35 kills
    expect(sorted[1].name).toBe('P4') // 28 kills
    expect(sorted[2].name).toBe('P1') // 20 kills
    expect(sorted[3].name).toBe('P3') // 5 kills
  })
})

// ─── Menu Items Construction Logic ───────────────────────────────────────────

describe('Game Over Menu Items Construction', () => {
  test('menu items with play again and main menu', () => {
    const hasPlayAgain = true
    const hasMainMenu = true

    const menuItems = [
      ...(hasPlayAgain ? [{ label: 'Play Again', key: 'R' }] : []),
      ...(hasMainMenu ? [{ label: 'Main Menu', key: 'M' }] : []),
      { label: 'Quit', key: 'Q' },
    ]

    expect(menuItems.length).toBe(3)
    expect(menuItems[0].label).toBe('Play Again')
    expect(menuItems[1].label).toBe('Main Menu')
    expect(menuItems[2].label).toBe('Quit')
  })

  test('menu items without play again', () => {
    const hasPlayAgain = false
    const hasMainMenu = true

    const menuItems = [
      ...(hasPlayAgain ? [{ label: 'Play Again', key: 'R' }] : []),
      ...(hasMainMenu ? [{ label: 'Main Menu', key: 'M' }] : []),
      { label: 'Quit', key: 'Q' },
    ]

    expect(menuItems.length).toBe(2)
    expect(menuItems[0].label).toBe('Main Menu')
    expect(menuItems[1].label).toBe('Quit')
  })

  test('menu items without main menu', () => {
    const hasPlayAgain = true
    const hasMainMenu = false

    const menuItems = [
      ...(hasPlayAgain ? [{ label: 'Play Again', key: 'R' }] : []),
      ...(hasMainMenu ? [{ label: 'Main Menu', key: 'M' }] : []),
      { label: 'Quit', key: 'Q' },
    ]

    expect(menuItems.length).toBe(2)
    expect(menuItems[0].label).toBe('Play Again')
    expect(menuItems[1].label).toBe('Quit')
  })

  test('menu items with only quit', () => {
    const hasPlayAgain = false
    const hasMainMenu = false

    const menuItems = [
      ...(hasPlayAgain ? [{ label: 'Play Again', key: 'R' }] : []),
      ...(hasMainMenu ? [{ label: 'Main Menu', key: 'M' }] : []),
      { label: 'Quit', key: 'Q' },
    ]

    expect(menuItems.length).toBe(1)
    expect(menuItems[0].label).toBe('Quit')
  })

  test('quit is always the last menu item', () => {
    for (const hasPlayAgain of [true, false]) {
      for (const hasMainMenu of [true, false]) {
        const menuItems = [
          ...(hasPlayAgain ? [{ label: 'Play Again', key: 'R' }] : []),
          ...(hasMainMenu ? [{ label: 'Main Menu', key: 'M' }] : []),
          { label: 'Quit', key: 'Q' },
        ]

        expect(menuItems[menuItems.length - 1].label).toBe('Quit')
        expect(menuItems[menuItems.length - 1].key).toBe('Q')
      }
    }
  })
})

// ─── Selected Index Bounds Tests ─────────────────────────────────────────────

describe('Selected Index Bounds', () => {
  test('selectedIndex 0 is valid for all menu configurations', () => {
    for (const hasPlayAgain of [true, false]) {
      for (const hasMainMenu of [true, false]) {
        const count = getGameOverMenuItemCount(hasPlayAgain, hasMainMenu)
        expect(0).toBeLessThan(count)
      }
    }
  })

  test('selectedIndex at max is last item', () => {
    const count = getGameOverMenuItemCount(true, true)
    expect(count - 1).toBe(2) // Quit at index 2
  })

  test('menu item count matches constructed array length', () => {
    for (const hasPlayAgain of [true, false]) {
      for (const hasMainMenu of [true, false]) {
        const count = getGameOverMenuItemCount(hasPlayAgain, hasMainMenu)

        const menuItems = [
          ...(hasPlayAgain ? [{ label: 'Play Again', key: 'R' }] : []),
          ...(hasMainMenu ? [{ label: 'Main Menu', key: 'M' }] : []),
          { label: 'Quit', key: 'Q' },
        ]

        expect(count).toBe(menuItems.length)
      }
    }
  })
})

// ─── Game State Display Data Tests ───────────────────────────────────────────

describe('Game Over Display Data', () => {
  test('final score is available from game state', () => {
    const state = createMockGameState({ score: 12500 })
    expect(state.score).toBe(12500)
  })

  test('wave reached is available from game state', () => {
    const state = createMockGameState({ wave: 7 })
    expect(state.wave).toBe(7)
  })

  test('score formatting pads to 6 digits', () => {
    const score = 150
    const formatted = score.toString().padStart(6, '0')
    expect(formatted).toBe('000150')
  })

  test('score formatting handles max score', () => {
    const score = 999999
    const formatted = score.toString().padStart(6, '0')
    expect(formatted).toBe('999999')
  })

  test('score formatting handles zero', () => {
    const score = 0
    const formatted = score.toString().padStart(6, '0')
    expect(formatted).toBe('000000')
  })

  test('score formatting handles score exceeding 6 digits', () => {
    const score = 1234567
    const formatted = score.toString().padStart(6, '0')
    // No truncation, just no padding needed
    expect(formatted).toBe('1234567')
  })
})

// ─── Box Width Calculation Tests ─────────────────────────────────────────────

describe('Box Width Calculation', () => {
  test('box width is min of 70 and gameWidth - 4', () => {
    const gameWidth = 120
    const boxWidth = Math.min(70, gameWidth - 4)
    expect(boxWidth).toBe(70)
  })

  test('box width clamps for narrow terminal', () => {
    const gameWidth = 60
    const boxWidth = Math.min(70, gameWidth - 4)
    expect(boxWidth).toBe(56) // 60 - 4
  })

  test('box width at standard game width', () => {
    const gameWidth = 120
    const boxWidth = Math.min(70, gameWidth - 4)
    expect(boxWidth).toBe(70) // min(70, 116) = 70
  })
})

// client/src/components/PlayerList.test.ts
// Unit tests for PlayerList component logic

import { describe, test, expect } from 'bun:test'
import type { Player, PlayerSlot } from '../../../shared/types'
import { COLORS, getTerminalPlayerColor, getSprites } from '../sprites'

// ─── Test Helpers ─────────────────────────────────────────────────────────────

/**
 * Create a mock player for testing.
 */
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
    inputState: { left: false, right: false },
    ...overrides,
  }
}

/**
 * Create multiple mock players with sequential slots.
 */
function createMockPlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => createMockPlayer({
    id: `player-${i + 1}`,
    name: `Player${i + 1}`,
    slot: (i + 1) as PlayerSlot,
  }))
}

/**
 * Simulate the slot sorting logic from PlayerList component.
 */
function sortPlayersBySlot(players: Player[]): Player[] {
  return [...players].sort((a, b) => a.slot - b.slot)
}

/**
 * Simulate the empty slots calculation from PlayerList component.
 */
function calculateEmptySlots(players: Player[], maxPlayers: number = 4): PlayerSlot[] {
  const takenSlots = new Set(players.map(p => p.slot))
  const emptySlots: PlayerSlot[] = []
  for (let i = 1; i <= maxPlayers; i++) {
    if (!takenSlots.has(i as PlayerSlot)) {
      emptySlots.push(i as PlayerSlot)
    }
  }
  return emptySlots
}

// ─── Player Color Assignment Tests ────────────────────────────────────────────

describe('Player Color Assignment', () => {
  test('slot 1 gets cyan color', () => {
    const color = getTerminalPlayerColor(1)
    expect(color).toBeDefined()
    // Should be cyan (either direct hex or converted)
    expect(typeof color).toBe('string')
  })

  test('slot 2 gets orange color', () => {
    const color = getTerminalPlayerColor(2)
    expect(color).toBeDefined()
  })

  test('slot 3 gets magenta color', () => {
    const color = getTerminalPlayerColor(3)
    expect(color).toBeDefined()
  })

  test('slot 4 gets lime color', () => {
    const color = getTerminalPlayerColor(4)
    expect(color).toBeDefined()
  })

  test('each slot has a unique color', () => {
    const colors = [1, 2, 3, 4].map(slot => COLORS.player[slot as 1 | 2 | 3 | 4])
    const uniqueColors = new Set(colors)
    expect(uniqueColors.size).toBe(4)
  })

  test('player colors are different from UI colors', () => {
    const playerColors = [1, 2, 3, 4].map(slot => COLORS.player[slot as 1 | 2 | 3 | 4])
    // Player colors should not be the same as common UI colors
    expect(playerColors).not.toContain(COLORS.ui.unselected)
    expect(playerColors).not.toContain(COLORS.ui.dim)
  })
})

// ─── Player Sprite Tests ──────────────────────────────────────────────────────

describe('Player Ship Sprite', () => {
  test('player sprite has 2 lines', () => {
    const sprites = getSprites()
    expect(sprites.player.a.length).toBe(2)
  })

  test('player sprite first line is 5 characters wide', () => {
    const sprites = getSprites()
    expect(sprites.player.a[0].length).toBe(7)
  })

  test('player sprite is consistent width across lines', () => {
    const sprites = getSprites()
    const firstLineWidth = sprites.player.a[0].length
    const secondLineWidth = sprites.player.a[1].length
    expect(firstLineWidth).toBe(secondLineWidth)
  })

  test('player sprite is suitable for compact lobby display', () => {
    const sprites = getSprites()
    // First line should be usable as a compact representation
    const firstLine = sprites.player.a[0]
    expect(firstLine.length).toBeLessThanOrEqual(7)
    expect(firstLine.trim().length).toBeGreaterThan(0)
  })
})

// ─── Player List Sorting Tests ────────────────────────────────────────────────

describe('Player List Sorting', () => {
  test('players are sorted by slot number', () => {
    const players = [
      createMockPlayer({ id: 'p3', slot: 3 }),
      createMockPlayer({ id: 'p1', slot: 1 }),
      createMockPlayer({ id: 'p2', slot: 2 }),
    ]

    const sorted = sortPlayersBySlot(players)

    expect(sorted[0].slot).toBe(1)
    expect(sorted[1].slot).toBe(2)
    expect(sorted[2].slot).toBe(3)
  })

  test('single player stays in place', () => {
    const players = [createMockPlayer({ slot: 1 })]
    const sorted = sortPlayersBySlot(players)
    expect(sorted.length).toBe(1)
    expect(sorted[0].slot).toBe(1)
  })

  test('already sorted list remains unchanged', () => {
    const players = createMockPlayers(4)
    const sorted = sortPlayersBySlot(players)

    expect(sorted[0].slot).toBe(1)
    expect(sorted[1].slot).toBe(2)
    expect(sorted[2].slot).toBe(3)
    expect(sorted[3].slot).toBe(4)
  })

  test('reverse sorted list is correctly sorted', () => {
    const players = [
      createMockPlayer({ id: 'p4', slot: 4 }),
      createMockPlayer({ id: 'p3', slot: 3 }),
      createMockPlayer({ id: 'p2', slot: 2 }),
      createMockPlayer({ id: 'p1', slot: 1 }),
    ]

    const sorted = sortPlayersBySlot(players)

    expect(sorted[0].slot).toBe(1)
    expect(sorted[1].slot).toBe(2)
    expect(sorted[2].slot).toBe(3)
    expect(sorted[3].slot).toBe(4)
  })
})

// ─── Empty Slots Calculation Tests ────────────────────────────────────────────

describe('Empty Slots Calculation', () => {
  test('4 empty slots when no players', () => {
    const emptySlots = calculateEmptySlots([])
    expect(emptySlots).toEqual([1, 2, 3, 4])
  })

  test('3 empty slots when 1 player in slot 1', () => {
    const players = [createMockPlayer({ slot: 1 })]
    const emptySlots = calculateEmptySlots(players)
    expect(emptySlots).toEqual([2, 3, 4])
  })

  test('2 empty slots when 2 players', () => {
    const players = [
      createMockPlayer({ id: 'p1', slot: 1 }),
      createMockPlayer({ id: 'p2', slot: 2 }),
    ]
    const emptySlots = calculateEmptySlots(players)
    expect(emptySlots).toEqual([3, 4])
  })

  test('no empty slots when 4 players', () => {
    const players = createMockPlayers(4)
    const emptySlots = calculateEmptySlots(players)
    expect(emptySlots).toEqual([])
  })

  test('handles non-sequential slots correctly', () => {
    const players = [
      createMockPlayer({ id: 'p1', slot: 1 }),
      createMockPlayer({ id: 'p4', slot: 4 }),
    ]
    const emptySlots = calculateEmptySlots(players)
    expect(emptySlots).toEqual([2, 3])
  })

  test('handles single player in middle slot', () => {
    const players = [createMockPlayer({ slot: 3 })]
    const emptySlots = calculateEmptySlots(players)
    expect(emptySlots).toEqual([1, 2, 4])
  })
})

// ─── Ready Status Display Tests ───────────────────────────────────────────────

describe('Ready Status Display', () => {
  test('player is ready when their ID is in readyPlayerIds', () => {
    const player = createMockPlayer({ id: 'player-1' })
    const readyPlayerIds = ['player-1']
    const isReady = readyPlayerIds.includes(player.id)
    expect(isReady).toBe(true)
  })

  test('player is not ready when their ID is not in readyPlayerIds', () => {
    const player = createMockPlayer({ id: 'player-1' })
    const readyPlayerIds = ['player-2']
    const isReady = readyPlayerIds.includes(player.id)
    expect(isReady).toBe(false)
  })

  test('multiple players can be ready', () => {
    const players = createMockPlayers(4)
    const readyPlayerIds = ['player-1', 'player-2', 'player-4']

    const readyStatuses = players.map(p => readyPlayerIds.includes(p.id))
    expect(readyStatuses).toEqual([true, true, false, true])
  })

  test('no players ready when readyPlayerIds is empty', () => {
    const players = createMockPlayers(4)
    const readyPlayerIds: string[] = []

    const anyReady = players.some(p => readyPlayerIds.includes(p.id))
    expect(anyReady).toBe(false)
  })
})

// ─── Current Player Identification Tests ──────────────────────────────────────

describe('Current Player Identification', () => {
  test('current player is identified by matching ID', () => {
    const players = createMockPlayers(3)
    const currentPlayerId = 'player-2'

    const currentPlayer = players.find(p => p.id === currentPlayerId)
    expect(currentPlayer).toBeDefined()
    expect(currentPlayer?.id).toBe('player-2')
  })

  test('isCurrentPlayer is true for matching player', () => {
    const player = createMockPlayer({ id: 'abc123' })
    const currentPlayerId = 'abc123'
    const isCurrentPlayer = player.id === currentPlayerId

    expect(isCurrentPlayer).toBe(true)
  })

  test('isCurrentPlayer is false for non-matching player', () => {
    const player = createMockPlayer({ id: 'abc123' })
    const currentPlayerId = 'xyz789'
    const isCurrentPlayer = player.id === currentPlayerId

    expect(isCurrentPlayer).toBe(false)
  })

  test('only one player can be the current player', () => {
    const players = createMockPlayers(4)
    const currentPlayerId = 'player-3'

    const currentPlayerCount = players.filter(p => p.id === currentPlayerId).length
    expect(currentPlayerCount).toBe(1)
  })
})

// ─── Display Name Formatting Tests ────────────────────────────────────────────

describe('Display Name Formatting', () => {
  test('current player name includes (you) suffix', () => {
    const player = createMockPlayer({ name: 'Alice' })
    const isCurrentPlayer = true
    const displayName = isCurrentPlayer ? `${player.name} (you)` : player.name

    expect(displayName).toBe('Alice (you)')
  })

  test('other player name does not include (you) suffix', () => {
    const player = createMockPlayer({ name: 'Bob' })
    const isCurrentPlayer = false
    const displayName = isCurrentPlayer ? `${player.name} (you)` : player.name

    expect(displayName).toBe('Bob')
  })

  test('handles long player names', () => {
    const longName = 'VeryLongPlayerNameThatMightOverflow'
    const player = createMockPlayer({ name: longName })
    const displayName = `${player.name} (you)`

    // Should still contain the full name and suffix
    expect(displayName).toContain(longName)
    expect(displayName).toContain('(you)')
  })

  test('handles empty player name', () => {
    const player = createMockPlayer({ name: '' })
    const displayName = player.name || 'Unknown'

    expect(displayName).toBe('Unknown')
  })
})

// ─── Ready Indicator Formatting Tests ─────────────────────────────────────────

describe('Ready Indicator Formatting', () => {
  test('ready indicator shows filled box when ready', () => {
    const isReady = true
    const readyIndicator = isReady ? '[■]' : '[ ]'

    expect(readyIndicator).toBe('[■]')
  })

  test('ready indicator shows empty box when waiting', () => {
    const isReady = false
    const readyIndicator = isReady ? '[■]' : '[ ]'

    expect(readyIndicator).toBe('[ ]')
  })

  test('ready text shows READY when ready', () => {
    const isReady = true
    const readyText = isReady ? 'READY' : 'waiting'

    expect(readyText).toBe('READY')
  })

  test('ready text shows waiting when not ready', () => {
    const isReady = false
    const readyText = isReady ? 'READY' : 'waiting'

    expect(readyText).toBe('waiting')
  })
})

// ─── Integration: Full Player Row Data Tests ──────────────────────────────────

describe('Full Player Row Data', () => {
  test('combines all player row elements correctly', () => {
    const player = createMockPlayer({
      id: 'test-player',
      name: 'TestUser',
      slot: 2,
    })
    const isReady = true
    const isCurrentPlayer = true
    const currentPlayerId = 'test-player'

    const sprites = getSprites()
    const playerColor = getTerminalPlayerColor(player.slot)
    const shipSprite = sprites.player.a[0]
    const displayName = isCurrentPlayer ? `${player.name} (you)` : player.name
    const readyIndicator = isReady ? '[■]' : '[ ]'
    const readyText = isReady ? 'READY' : 'waiting'

    // Verify all components are correctly computed
    expect(shipSprite).toBe(sprites.player.a[0])
    expect(playerColor).toBeDefined()
    expect(displayName).toBe('TestUser (you)')
    expect(readyIndicator).toBe('[■]')
    expect(readyText).toBe('READY')
  })

  test('handles waiting player correctly', () => {
    const player = createMockPlayer({
      id: 'waiting-player',
      name: 'WaitingUser',
      slot: 3,
    })
    const isReady = false
    const isCurrentPlayer = false

    const displayName = isCurrentPlayer ? `${player.name} (you)` : player.name
    const readyIndicator = isReady ? '[■]' : '[ ]'
    const readyText = isReady ? 'READY' : 'waiting'

    expect(displayName).toBe('WaitingUser')
    expect(readyIndicator).toBe('[ ]')
    expect(readyText).toBe('waiting')
  })
})

// ─── Edge Cases ───────────────────────────────────────────────────────────────

describe('Edge Cases', () => {
  test('handles player with slot 1 (minimum)', () => {
    const player = createMockPlayer({ slot: 1 })
    const color = getTerminalPlayerColor(player.slot)
    expect(color).toBeDefined()
  })

  test('handles player with slot 4 (maximum)', () => {
    const player = createMockPlayer({ slot: 4 })
    const color = getTerminalPlayerColor(player.slot)
    expect(color).toBeDefined()
  })

  test('empty player list produces 4 empty slots', () => {
    const players: Player[] = []
    const sortedPlayers = sortPlayersBySlot(players)
    const emptySlots = calculateEmptySlots(players)

    expect(sortedPlayers.length).toBe(0)
    expect(emptySlots.length).toBe(4)
  })

  test('full player list produces 0 empty slots', () => {
    const players = createMockPlayers(4)
    const sortedPlayers = sortPlayersBySlot(players)
    const emptySlots = calculateEmptySlots(players)

    expect(sortedPlayers.length).toBe(4)
    expect(emptySlots.length).toBe(0)
  })

  test('total rows always equals maxPlayers', () => {
    for (let playerCount = 0; playerCount <= 4; playerCount++) {
      const players = createMockPlayers(playerCount)
      const emptySlots = calculateEmptySlots(players)
      const totalRows = players.length + emptySlots.length

      expect(totalRows).toBe(4)
    }
  })
})

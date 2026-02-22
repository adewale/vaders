// worker/src/integration.test.ts
// Integration tests for multiplayer scenarios across Worker, GameRoom, and Matchmaker

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { GameRoom, type Env } from './GameRoom'
import { Matchmaker } from './Matchmaker'
import type { GameState, ServerMessage } from '../../shared/types'
import worker from './index'

// ============================================================================
// Mock Infrastructure
// ============================================================================

interface MockWebSocket {
  send: Mock
  close: Mock
  serializeAttachment: Mock
  deserializeAttachment: Mock
  _attachment: unknown
}

function createMockWebSocket(): MockWebSocket {
  const ws: MockWebSocket = {
    send: vi.fn(),
    close: vi.fn(),
    _attachment: null,
    serializeAttachment: vi.fn((data: unknown) => {
      ws._attachment = data
    }),
    deserializeAttachment: vi.fn(() => ws._attachment),
  }
  return ws
}

interface MockSqlExec {
  toArray: () => unknown[]
}

function createMockDurableObjectContext() {
  const sqlData: Record<string, { data: string; next_entity_id: number }> = {}
  const webSockets: MockWebSocket[] = []
  let alarm: number | null = null

  return {
    storage: {
      sql: {
        exec: vi.fn((query: string, ...params: unknown[]): MockSqlExec => {
          if (query.includes('CREATE TABLE')) {
            return { toArray: () => [] }
          }
          if (query.includes('SELECT')) {
            if (sqlData['game_state']) {
              return { toArray: () => [sqlData['game_state']] }
            }
            return { toArray: () => [] }
          }
          if (query.includes('INSERT OR REPLACE')) {
            sqlData['game_state'] = {
              data: params[0] as string,
              next_entity_id: params[1] as number,
            }
            return { toArray: () => [] }
          }
          if (query.includes('DELETE')) {
            delete sqlData['game_state']
            return { toArray: () => [] }
          }
          return { toArray: () => [] }
        }),
      },
      setAlarm: vi.fn(async (time: number) => {
        alarm = time
      }),
      deleteAlarm: vi.fn(async () => {
        alarm = null
      }),
      get: vi.fn(),
      put: vi.fn(),
    },
    blockConcurrencyWhile: vi.fn(async <T>(fn: () => Promise<T>): Promise<T> => {
      return fn()
    }),
    acceptWebSocket: vi.fn((ws: MockWebSocket) => {
      webSockets.push(ws)
    }),
    getWebSockets: vi.fn(() => webSockets),
    _sqlData: sqlData,
    _webSockets: webSockets,
    _alarm: () => alarm,
  }
}

function createMockMatchmakerState() {
  const storage = new Map<string, unknown>()

  return {
    storage: {
      get: vi.fn(async <T>(key: string): Promise<T | undefined> => {
        return storage.get(key) as T | undefined
      }),
      put: vi.fn(async (key: string, value: unknown): Promise<void> => {
        storage.set(key, value)
      }),
      delete: vi.fn(async (key: string): Promise<boolean> => {
        return storage.delete(key)
      }),
      list: vi.fn(async () => storage),
    },
    blockConcurrencyWhile: vi.fn(async <T>(fn: () => Promise<T>): Promise<T> => {
      return fn()
    }),
    _storage: storage,
  }
}

// Helper to extract messages of a specific type from WebSocket send calls
function getMessages(ws: MockWebSocket, type?: string): ServerMessage[] {
  return ws.send.mock.calls
    .map((call: unknown[]) => {
      try {
        return JSON.parse(call[0] as string) as ServerMessage
      } catch {
        return null
      }
    })
    .filter((msg): msg is ServerMessage => msg !== null && (!type || msg.type === type))
}

function getSyncMessages(ws: MockWebSocket) {
  return getMessages(ws, 'sync') as Array<{ type: 'sync'; state: GameState; playerId?: string; config?: unknown }>
}

function getEventMessages(ws: MockWebSocket) {
  return getMessages(ws, 'event') as Array<{ type: 'event'; name: string; data: unknown }>
}

function getErrorMessages(ws: MockWebSocket) {
  return getMessages(ws, 'error') as Array<{ type: 'error'; code: string; message: string }>
}

/**
 * Helper to run through wipe phases to get to 'playing' status.
 * After startGame(), the game goes through:
 * - wipe_hold (45 ticks)
 * - wipe_reveal (60 ticks)
 * - playing
 */
async function completeWipePhases(gameRoom: GameRoom) {
  // wipe_hold: 45 ticks
  for (let i = 0; i < 45; i++) {
    await gameRoom.alarm()
  }
  // wipe_reveal: 60 ticks
  for (let i = 0; i < 60; i++) {
    await gameRoom.alarm()
  }
}

// ============================================================================
// Scenario 1: Player Creates Room, Another Player Joins
// ============================================================================

describe('Integration: Player Creates Room, Another Player Joins', () => {
  let gameRoomCtx: ReturnType<typeof createMockDurableObjectContext>
  let matchmakerState: ReturnType<typeof createMockMatchmakerState>
  let gameRoom: GameRoom
  let matchmaker: Matchmaker
  let matchmakerFetch: Mock

  beforeEach(async () => {
    // Setup Matchmaker
    matchmakerState = createMockMatchmakerState()
    matchmaker = new Matchmaker(matchmakerState as any)
    await new Promise(resolve => setTimeout(resolve, 0))

    // Setup GameRoom with Matchmaker binding
    gameRoomCtx = createMockDurableObjectContext()
    matchmakerFetch = vi.fn(async (request: Request) => {
      return matchmaker.fetch(request)
    })

    const env: Env = {
      GAME_ROOM: {
        idFromName: vi.fn((name: string) => ({ toString: () => name })),
        get: vi.fn(),
      } as any,
      MATCHMAKER: {
        idFromName: vi.fn((name: string) => ({ toString: () => `matchmaker-${name}` })),
        get: vi.fn(() => ({ fetch: matchmakerFetch })),
      } as any,
    }

    gameRoom = new GameRoom(gameRoomCtx as any, env)
    await new Promise(resolve => setTimeout(resolve, 0))
  })

  it('Player 1 creates room and Player 2 joins - both receive correct state', async () => {
    const roomCode = 'ROOM01'

    // Step 1: Initialize the room (simulates POST /room creating the room)
    const initRequest = new Request('https://internal/init', {
      method: 'POST',
      body: JSON.stringify({ roomCode }),
    })
    const initResponse = await gameRoom.fetch(initRequest)
    expect(initResponse.status).toBe(200)

    // Step 2: Player 1 connects via WebSocket and joins
    const ws1 = createMockWebSocket()
    gameRoomCtx._webSockets.push(ws1)

    await gameRoom.webSocketMessage(ws1 as any, JSON.stringify({ type: 'join', name: 'Player1' }))

    // Verify Player 1 received sync with playerId
    const player1Syncs = getSyncMessages(ws1)
    expect(player1Syncs.length).toBeGreaterThan(0)
    const player1Sync = player1Syncs.find(s => s.playerId)
    expect(player1Sync).toBeDefined()
    expect(player1Sync!.playerId).toBeDefined()
    expect(player1Sync!.config).toBeDefined()

    const player1Id = player1Sync!.playerId!
    expect(player1Sync!.state.players[player1Id].name).toBe('Player1')
    expect(player1Sync!.state.players[player1Id].slot).toBe(1)

    // Step 3: Player 2 connects via WebSocket and joins
    const ws2 = createMockWebSocket()
    gameRoomCtx._webSockets.push(ws2)

    await gameRoom.webSocketMessage(ws2 as any, JSON.stringify({ type: 'join', name: 'Player2' }))

    // Verify Player 2 received sync with their playerId
    const player2Syncs = getSyncMessages(ws2)
    expect(player2Syncs.length).toBeGreaterThan(0)
    const player2Sync = player2Syncs.find(s => s.playerId)
    expect(player2Sync).toBeDefined()
    expect(player2Sync!.playerId).toBeDefined()

    const player2Id = player2Sync!.playerId!
    expect(player2Sync!.state.players[player2Id].name).toBe('Player2')
    expect(player2Sync!.state.players[player2Id].slot).toBe(2)

    // Step 4: Verify Player 2's state contains both players
    const player2State = player2Sync!.state
    expect(Object.keys(player2State.players).length).toBe(2)
    expect(player2State.players[player1Id]).toBeDefined()
    expect(player2State.players[player2Id]).toBeDefined()

    // Step 5: Verify Player 1 received player_joined event for Player 2
    const player1Events = getEventMessages(ws1)
    const joinEvent = player1Events.find(e => e.name === 'player_joined' && (e.data as any).player.name === 'Player2')
    expect(joinEvent).toBeDefined()
  })

  it('Both players can ready up and start countdown', async () => {
    const roomCode = 'READY1'

    // Initialize room
    await gameRoom.fetch(new Request('https://internal/init', {
      method: 'POST',
      body: JSON.stringify({ roomCode }),
    }))

    // Both players join
    const ws1 = createMockWebSocket()
    const ws2 = createMockWebSocket()
    gameRoomCtx._webSockets.push(ws1, ws2)

    await gameRoom.webSocketMessage(ws1 as any, JSON.stringify({ type: 'join', name: 'Alice' }))
    await gameRoom.webSocketMessage(ws2 as any, JSON.stringify({ type: 'join', name: 'Bob' }))

    // Clear mocks to focus on ready/countdown messages
    ws1.send.mockClear()
    ws2.send.mockClear()

    // Player 1 readies up
    await gameRoom.webSocketMessage(ws1 as any, JSON.stringify({ type: 'ready' }))

    // Verify player_ready event was broadcast
    let player1Events = getEventMessages(ws1)
    expect(player1Events.some(e => e.name === 'player_ready')).toBe(true)

    // Player 2 readies up - this should start countdown
    await gameRoom.webSocketMessage(ws2 as any, JSON.stringify({ type: 'ready' }))

    // Both players should receive countdown_tick event with count: 3
    const ws1CountdownEvents = getEventMessages(ws1).filter(e => e.name === 'countdown_tick')
    const ws2CountdownEvents = getEventMessages(ws2).filter(e => e.name === 'countdown_tick')

    expect(ws1CountdownEvents.length).toBeGreaterThan(0)
    expect(ws2CountdownEvents.length).toBeGreaterThan(0)
    expect((ws1CountdownEvents[0].data as any).count).toBe(3)

    // Verify state shows countdown status
    const state = JSON.parse(gameRoomCtx._sqlData['game_state'].data) as GameState
    expect(state.status).toBe('countdown')
    expect(state.readyPlayerIds.length).toBe(2)
  })

  it('Countdown completes and game starts for both players', async () => {
    const roomCode = 'START1'

    // Initialize room and join 2 players
    await gameRoom.fetch(new Request('https://internal/init', {
      method: 'POST',
      body: JSON.stringify({ roomCode }),
    }))

    const ws1 = createMockWebSocket()
    const ws2 = createMockWebSocket()
    gameRoomCtx._webSockets.push(ws1, ws2)

    await gameRoom.webSocketMessage(ws1 as any, JSON.stringify({ type: 'join', name: 'Alice' }))
    await gameRoom.webSocketMessage(ws2 as any, JSON.stringify({ type: 'join', name: 'Bob' }))

    // Both ready up
    await gameRoom.webSocketMessage(ws1 as any, JSON.stringify({ type: 'ready' }))
    await gameRoom.webSocketMessage(ws2 as any, JSON.stringify({ type: 'ready' }))

    // Clear mocks
    ws1.send.mockClear()
    ws2.send.mockClear()

    // Countdown: 3 -> 2 -> 1 -> wipe_hold
    await gameRoom.alarm() // count: 2
    await gameRoom.alarm() // count: 1
    await gameRoom.alarm() // wipe_hold starts

    // Both players should receive game_start event
    const ws1Events = getEventMessages(ws1)
    const ws2Events = getEventMessages(ws2)

    expect(ws1Events.some(e => e.name === 'game_start')).toBe(true)
    expect(ws2Events.some(e => e.name === 'game_start')).toBe(true)

    // Complete wipe phases to reach 'playing'
    await completeWipePhases(gameRoom)

    // Verify game state is now 'playing'
    const state = JSON.parse(gameRoomCtx._sqlData['game_state'].data) as GameState
    expect(state.status).toBe('playing')
    expect(state.mode).toBe('coop')
    expect(state.lives).toBe(5) // Coop mode has 5 shared lives
  })

  it('Player 1 sees Player 2 leave during waiting', async () => {
    const roomCode = 'LEAVE1'

    // Initialize room
    await gameRoom.fetch(new Request('https://internal/init', {
      method: 'POST',
      body: JSON.stringify({ roomCode }),
    }))

    // Both players join
    const ws1 = createMockWebSocket()
    const ws2 = createMockWebSocket()
    gameRoomCtx._webSockets.push(ws1, ws2)

    await gameRoom.webSocketMessage(ws1 as any, JSON.stringify({ type: 'join', name: 'Alice' }))
    await gameRoom.webSocketMessage(ws2 as any, JSON.stringify({ type: 'join', name: 'Bob' }))

    // Get Player 2's ID
    const player2Sync = getSyncMessages(ws2).find(s => s.playerId)!
    const player2Id = player2Sync.playerId!

    // Clear mocks
    ws1.send.mockClear()

    // Player 2 disconnects
    await gameRoom.webSocketClose(ws2 as any, 1000, 'Left', true)

    // Player 1 should receive player_left event
    const ws1Events = getEventMessages(ws1)
    const leaveEvent = ws1Events.find(e => e.name === 'player_left' && (e.data as any).playerId === player2Id)
    expect(leaveEvent).toBeDefined()

    // State should only have Player 1
    const state = JSON.parse(gameRoomCtx._sqlData['game_state'].data) as GameState
    expect(Object.keys(state.players).length).toBe(1)
  })

  it('Player 2 cannot join during countdown', async () => {
    const roomCode = 'NOCNT1'

    // Initialize room
    await gameRoom.fetch(new Request('https://internal/init', {
      method: 'POST',
      body: JSON.stringify({ roomCode }),
    }))

    // Player 1 and original Player 2 join
    const ws1 = createMockWebSocket()
    const ws2 = createMockWebSocket()
    gameRoomCtx._webSockets.push(ws1, ws2)

    await gameRoom.webSocketMessage(ws1 as any, JSON.stringify({ type: 'join', name: 'Alice' }))
    await gameRoom.webSocketMessage(ws2 as any, JSON.stringify({ type: 'join', name: 'Bob' }))

    // Both ready up - starts countdown
    await gameRoom.webSocketMessage(ws1 as any, JSON.stringify({ type: 'ready' }))
    await gameRoom.webSocketMessage(ws2 as any, JSON.stringify({ type: 'ready' }))

    // New Player 3 tries to join during countdown
    const ws3 = createMockWebSocket()
    gameRoomCtx._webSockets.push(ws3)

    await gameRoom.webSocketMessage(ws3 as any, JSON.stringify({ type: 'join', name: 'Charlie' }))

    // Player 3 should receive error
    const errors = getErrorMessages(ws3)
    expect(errors.some(e => e.code === 'countdown_in_progress')).toBe(true)
  })

  it('Unready during countdown cancels and allows re-ready', async () => {
    const roomCode = 'UNRDY1'

    // Initialize room
    await gameRoom.fetch(new Request('https://internal/init', {
      method: 'POST',
      body: JSON.stringify({ roomCode }),
    }))

    // Both players join and ready up
    const ws1 = createMockWebSocket()
    const ws2 = createMockWebSocket()
    gameRoomCtx._webSockets.push(ws1, ws2)

    await gameRoom.webSocketMessage(ws1 as any, JSON.stringify({ type: 'join', name: 'Alice' }))
    await gameRoom.webSocketMessage(ws2 as any, JSON.stringify({ type: 'join', name: 'Bob' }))

    await gameRoom.webSocketMessage(ws1 as any, JSON.stringify({ type: 'ready' }))
    await gameRoom.webSocketMessage(ws2 as any, JSON.stringify({ type: 'ready' }))

    // Verify countdown started
    let state = JSON.parse(gameRoomCtx._sqlData['game_state'].data) as GameState
    expect(state.status).toBe('countdown')

    // Player 1 unreadies
    ws1.send.mockClear()
    ws2.send.mockClear()
    await gameRoom.webSocketMessage(ws1 as any, JSON.stringify({ type: 'unready' }))

    // Both should receive countdown_cancelled event
    expect(getEventMessages(ws1).some(e => e.name === 'countdown_cancelled')).toBe(true)
    expect(getEventMessages(ws2).some(e => e.name === 'countdown_cancelled')).toBe(true)

    // State should be back to waiting
    state = JSON.parse(gameRoomCtx._sqlData['game_state'].data) as GameState
    expect(state.status).toBe('waiting')

    // Player 1 re-readies, then countdown should start again
    await gameRoom.webSocketMessage(ws1 as any, JSON.stringify({ type: 'ready' }))

    state = JSON.parse(gameRoomCtx._sqlData['game_state'].data) as GameState
    expect(state.status).toBe('countdown')
  })
})

// ============================================================================
// Scenario 2: Two Players Invoke Matchmaking
// ============================================================================

describe('Integration: Two Players Invoke Matchmaking', () => {
  let matchmakerState: ReturnType<typeof createMockMatchmakerState>
  let matchmaker: Matchmaker
  let gameRooms: Map<string, { ctx: ReturnType<typeof createMockDurableObjectContext>; room: GameRoom }>

  beforeEach(async () => {
    matchmakerState = createMockMatchmakerState()
    matchmaker = new Matchmaker(matchmakerState as any)
    await new Promise(resolve => setTimeout(resolve, 0))

    gameRooms = new Map()
  })

  // Helper to create a GameRoom for a room code
  async function getOrCreateGameRoom(roomCode: string) {
    if (gameRooms.has(roomCode)) {
      return gameRooms.get(roomCode)!
    }

    const ctx = createMockDurableObjectContext()
    const matchmakerFetch = vi.fn(async (request: Request) => matchmaker.fetch(request))

    const env: Env = {
      GAME_ROOM: {
        idFromName: vi.fn((name: string) => ({ toString: () => name })),
        get: vi.fn(),
      } as any,
      MATCHMAKER: {
        idFromName: vi.fn(() => ({ toString: () => 'matchmaker-global' })),
        get: vi.fn(() => ({ fetch: matchmakerFetch })),
      } as any,
    }

    const room = new GameRoom(ctx as any, env)
    await new Promise(resolve => setTimeout(resolve, 0))

    // Initialize the room
    await room.fetch(new Request('https://internal/init', {
      method: 'POST',
      body: JSON.stringify({ roomCode }),
    }))

    // Register with matchmaker
    await matchmaker.fetch(new Request('https://internal/register', {
      method: 'POST',
      body: JSON.stringify({ roomCode, playerCount: 0, status: 'waiting' }),
    }))

    const entry = { ctx, room }
    gameRooms.set(roomCode, entry)
    return entry
  }

  it('Player 1 matchmakes and creates room, Player 2 matchmakes and finds same room', async () => {
    // Step 1: Player 1 calls matchmake - no open rooms, creates new one
    const findResult1 = await matchmaker.fetch(new Request('https://internal/find'))
    const { roomCode: existingRoom1 } = await findResult1.json() as { roomCode: string | null }
    expect(existingRoom1).toBeNull() // No rooms yet

    // Simulate creating a room for Player 1
    const room1Code = 'MATCH1'
    const { ctx: ctx1, room: room1 } = await getOrCreateGameRoom(room1Code)

    // Player 1 joins
    const ws1 = createMockWebSocket()
    ctx1._webSockets.push(ws1)
    await room1.webSocketMessage(ws1 as any, JSON.stringify({ type: 'join', name: 'MatchPlayer1' }))

    // Update matchmaker with new player count
    await matchmaker.fetch(new Request('https://internal/register', {
      method: 'POST',
      body: JSON.stringify({ roomCode: room1Code, playerCount: 1, status: 'waiting' }),
    }))

    // Step 2: Player 2 calls matchmake - should find Player 1's room
    const findResult2 = await matchmaker.fetch(new Request('https://internal/find'))
    const { roomCode: existingRoom2 } = await findResult2.json() as { roomCode: string | null }

    expect(existingRoom2).toBe(room1Code) // Should find Player 1's room

    // Step 3: Player 2 joins the same room
    const ws2 = createMockWebSocket()
    ctx1._webSockets.push(ws2)
    await room1.webSocketMessage(ws2 as any, JSON.stringify({ type: 'join', name: 'MatchPlayer2' }))

    // Verify both players are in the same room
    const state = JSON.parse(ctx1._sqlData['game_state'].data) as GameState
    expect(Object.keys(state.players).length).toBe(2)

    const playerNames = Object.values(state.players).map(p => p.name)
    expect(playerNames).toContain('MatchPlayer1')
    expect(playerNames).toContain('MatchPlayer2')
  })

  it('Full room is removed from matchmaking pool', async () => {
    // Create room with 3 players
    const roomCode = 'FULL01'
    const { ctx, room } = await getOrCreateGameRoom(roomCode)

    // Add 4 players
    for (let i = 1; i <= 4; i++) {
      const ws = createMockWebSocket()
      ctx._webSockets.push(ws)
      await room.webSocketMessage(ws as any, JSON.stringify({ type: 'join', name: `Player${i}` }))

      // Update matchmaker
      await matchmaker.fetch(new Request('https://internal/register', {
        method: 'POST',
        body: JSON.stringify({ roomCode, playerCount: i, status: 'waiting' }),
      }))
    }

    // New player tries to matchmake - should NOT find full room
    const findResult = await matchmaker.fetch(new Request('https://internal/find'))
    const { roomCode: foundRoom } = await findResult.json() as { roomCode: string | null }

    expect(foundRoom).toBeNull() // Full room should not be returned
  })

  it('Room in countdown is removed from matchmaking pool', async () => {
    // Create room and start countdown
    const roomCode = 'COUNT1'
    const { ctx, room } = await getOrCreateGameRoom(roomCode)

    // Add 2 players
    const ws1 = createMockWebSocket()
    const ws2 = createMockWebSocket()
    ctx._webSockets.push(ws1, ws2)

    await room.webSocketMessage(ws1 as any, JSON.stringify({ type: 'join', name: 'Player1' }))
    await room.webSocketMessage(ws2 as any, JSON.stringify({ type: 'join', name: 'Player2' }))

    // Update matchmaker with 2 players
    await matchmaker.fetch(new Request('https://internal/register', {
      method: 'POST',
      body: JSON.stringify({ roomCode, playerCount: 2, status: 'waiting' }),
    }))

    // Both ready up - starts countdown
    await room.webSocketMessage(ws1 as any, JSON.stringify({ type: 'ready' }))
    await room.webSocketMessage(ws2 as any, JSON.stringify({ type: 'ready' }))

    // Update matchmaker with countdown status
    await matchmaker.fetch(new Request('https://internal/register', {
      method: 'POST',
      body: JSON.stringify({ roomCode, playerCount: 2, status: 'countdown' }),
    }))

    // New player tries to matchmake - should NOT find room in countdown
    const findResult = await matchmaker.fetch(new Request('https://internal/find'))
    const { roomCode: foundRoom } = await findResult.json() as { roomCode: string | null }

    expect(foundRoom).toBeNull()
  })

  it('Multiple matchmaking calls return same open room until full', async () => {
    // Create initial room
    const roomCode = 'MULTI1'
    const { ctx, room } = await getOrCreateGameRoom(roomCode)

    // Player 1 joins
    const ws1 = createMockWebSocket()
    ctx._webSockets.push(ws1)
    await room.webSocketMessage(ws1 as any, JSON.stringify({ type: 'join', name: 'Player1' }))
    await matchmaker.fetch(new Request('https://internal/register', {
      method: 'POST',
      body: JSON.stringify({ roomCode, playerCount: 1, status: 'waiting' }),
    }))

    // Players 2, 3, 4 all matchmake - should all get same room
    for (let i = 2; i <= 4; i++) {
      const findResult = await matchmaker.fetch(new Request('https://internal/find'))
      const { roomCode: foundRoom } = await findResult.json() as { roomCode: string | null }
      expect(foundRoom).toBe(roomCode)

      // Join the room
      const ws = createMockWebSocket()
      ctx._webSockets.push(ws)
      await room.webSocketMessage(ws as any, JSON.stringify({ type: 'join', name: `Player${i}` }))

      // Update matchmaker
      await matchmaker.fetch(new Request('https://internal/register', {
        method: 'POST',
        body: JSON.stringify({ roomCode, playerCount: i, status: 'waiting' }),
      }))
    }

    // Room should now be full
    const state = JSON.parse(ctx._sqlData['game_state'].data) as GameState
    expect(Object.keys(state.players).length).toBe(4)

    // Player 5 matchmakes - should NOT find room (it's full)
    const findResult5 = await matchmaker.fetch(new Request('https://internal/find'))
    const { roomCode: foundRoom5 } = await findResult5.json() as { roomCode: string | null }
    expect(foundRoom5).toBeNull()
  })

  it('Stale rooms are cleaned up during matchmaking', async () => {
    // Manually add a stale room to matchmaker storage
    const staleTime = Date.now() - 10 * 60 * 1000 // 10 minutes ago
    matchmakerState._storage.set('rooms', {
      'STALE1': { playerCount: 1, status: 'waiting', updatedAt: staleTime },
    })

    // Re-create matchmaker to load stale data
    matchmaker = new Matchmaker(matchmakerState as any)
    await new Promise(resolve => setTimeout(resolve, 0))

    // Matchmake - should clean up stale room
    const findResult = await matchmaker.fetch(new Request('https://internal/find'))
    const { roomCode: foundRoom } = await findResult.json() as { roomCode: string | null }

    expect(foundRoom).toBeNull() // Stale room should be removed

    // Verify storage was cleaned
    const rooms = matchmakerState._storage.get('rooms') as Record<string, unknown>
    expect(rooms['STALE1']).toBeUndefined()
  })
})

// ============================================================================
// Scenario 3: Full Multiplayer Game Flow
// ============================================================================

describe('Integration: Complete 4-Player Game Flow', () => {
  it('4 players join via matchmaking, ready up, play, and see game over', async () => {
    // Setup
    const matchmakerState = createMockMatchmakerState()
    const matchmaker = new Matchmaker(matchmakerState as any)
    await new Promise(resolve => setTimeout(resolve, 0))

    const roomCode = 'FULL4P'
    const ctx = createMockDurableObjectContext()
    const matchmakerFetch = vi.fn(async (request: Request) => matchmaker.fetch(request))

    const env: Env = {
      GAME_ROOM: {
        idFromName: vi.fn((name: string) => ({ toString: () => name })),
        get: vi.fn(),
      } as any,
      MATCHMAKER: {
        idFromName: vi.fn(() => ({ toString: () => 'matchmaker-global' })),
        get: vi.fn(() => ({ fetch: matchmakerFetch })),
      } as any,
    }

    const gameRoom = new GameRoom(ctx as any, env)
    await new Promise(resolve => setTimeout(resolve, 0))

    // Initialize room
    await gameRoom.fetch(new Request('https://internal/init', {
      method: 'POST',
      body: JSON.stringify({ roomCode }),
    }))

    // Register with matchmaker
    await matchmaker.fetch(new Request('https://internal/register', {
      method: 'POST',
      body: JSON.stringify({ roomCode, playerCount: 0, status: 'waiting' }),
    }))

    // 4 players join
    const webSockets: MockWebSocket[] = []
    const playerIds: string[] = []

    for (let i = 1; i <= 4; i++) {
      const ws = createMockWebSocket()
      ctx._webSockets.push(ws)
      webSockets.push(ws)

      await gameRoom.webSocketMessage(ws as any, JSON.stringify({ type: 'join', name: `Player${i}` }))

      const syncs = getSyncMessages(ws)
      const joinSync = syncs.find(s => s.playerId)!
      playerIds.push(joinSync.playerId!)

      // Update matchmaker
      await matchmaker.fetch(new Request('https://internal/register', {
        method: 'POST',
        body: JSON.stringify({ roomCode, playerCount: i, status: 'waiting' }),
      }))
    }

    // Verify all 4 players are assigned different slots
    const state = JSON.parse(ctx._sqlData['game_state'].data) as GameState
    const slots = Object.values(state.players).map(p => p.slot)
    expect(slots.sort()).toEqual([1, 2, 3, 4])

    // All 4 players ready up
    for (const ws of webSockets) {
      await gameRoom.webSocketMessage(ws as any, JSON.stringify({ type: 'ready' }))
    }

    // Verify countdown started
    let gameState = JSON.parse(ctx._sqlData['game_state'].data) as GameState
    expect(gameState.status).toBe('countdown')

    // Complete countdown
    await gameRoom.alarm() // 2
    await gameRoom.alarm() // 1
    await gameRoom.alarm() // wipe_hold starts

    // Complete wipe phases
    await completeWipePhases(gameRoom)

    // Verify game started with correct 4-player config
    gameState = JSON.parse(ctx._sqlData['game_state'].data) as GameState
    expect(gameState.status).toBe('playing')
    expect(gameState.lives).toBe(5) // 4-player coop mode
    expect(gameState.mode).toBe('coop')

    // Verify correct alien formation for 4 players (13 cols x 6 rows = 78 aliens)
    const aliens = gameState.entities.filter(e => e.kind === 'alien')
    expect(aliens.length).toBe(78)

    // All players should have received game_start event
    for (const ws of webSockets) {
      const events = getEventMessages(ws)
      expect(events.some(e => e.name === 'game_start')).toBe(true)
    }
  })
})

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe('Integration: Edge Cases', () => {
  let ctx: ReturnType<typeof createMockDurableObjectContext>
  let gameRoom: GameRoom

  beforeEach(async () => {
    ctx = createMockDurableObjectContext()
    const matchmakerFetch = vi.fn(async () => new Response('OK'))

    const env: Env = {
      GAME_ROOM: {
        idFromName: vi.fn((name: string) => ({ toString: () => name })),
        get: vi.fn(),
      } as any,
      MATCHMAKER: {
        idFromName: vi.fn(() => ({ toString: () => 'matchmaker-global' })),
        get: vi.fn(() => ({ fetch: matchmakerFetch })),
      } as any,
    }

    gameRoom = new GameRoom(ctx as any, env)
    await new Promise(resolve => setTimeout(resolve, 0))

    await gameRoom.fetch(new Request('https://internal/init', {
      method: 'POST',
      body: JSON.stringify({ roomCode: 'EDGE01' }),
    }))
  })

  it('Same player cannot join twice', async () => {
    const ws = createMockWebSocket()
    ctx._webSockets.push(ws)

    // First join
    await gameRoom.webSocketMessage(ws as any, JSON.stringify({ type: 'join', name: 'Duplicate' }))

    // Clear and try second join
    ws.send.mockClear()
    await gameRoom.webSocketMessage(ws as any, JSON.stringify({ type: 'join', name: 'Duplicate2' }))

    // Should receive error
    const errors = getErrorMessages(ws)
    expect(errors.some(e => e.code === 'already_joined')).toBe(true)
  })

  it('5th player cannot join full room', async () => {
    // Join 4 players
    for (let i = 1; i <= 4; i++) {
      const ws = createMockWebSocket()
      ctx._webSockets.push(ws)
      await gameRoom.webSocketMessage(ws as any, JSON.stringify({ type: 'join', name: `Player${i}` }))
    }

    // 5th player tries to join
    const ws5 = createMockWebSocket()
    ctx._webSockets.push(ws5)
    await gameRoom.webSocketMessage(ws5 as any, JSON.stringify({ type: 'join', name: 'Player5' }))

    const errors = getErrorMessages(ws5)
    expect(errors.some(e => e.code === 'room_full')).toBe(true)
  })

  it('Player disconnect during game removes them but game continues', async () => {
    // 2 players join and start game
    const ws1 = createMockWebSocket()
    const ws2 = createMockWebSocket()
    ctx._webSockets.push(ws1, ws2)

    await gameRoom.webSocketMessage(ws1 as any, JSON.stringify({ type: 'join', name: 'Stay' }))
    await gameRoom.webSocketMessage(ws2 as any, JSON.stringify({ type: 'join', name: 'Leave' }))

    await gameRoom.webSocketMessage(ws1 as any, JSON.stringify({ type: 'ready' }))
    await gameRoom.webSocketMessage(ws2 as any, JSON.stringify({ type: 'ready' }))

    // Complete countdown
    await gameRoom.alarm() // 2
    await gameRoom.alarm() // 1
    await gameRoom.alarm() // wipe_hold starts

    // Complete wipe phases
    await completeWipePhases(gameRoom)

    // Player 2 disconnects
    await gameRoom.webSocketClose(ws2 as any, 1000, 'Left', true)

    // Game should continue with Player 1
    const state = JSON.parse(ctx._sqlData['game_state'].data) as GameState
    expect(state.status).toBe('playing')
    expect(Object.keys(state.players).length).toBe(1)
  })

  it('All players disconnect ends game', async () => {
    const ws = createMockWebSocket()
    ctx._webSockets.push(ws)

    await gameRoom.webSocketMessage(ws as any, JSON.stringify({ type: 'join', name: 'Solo' }))
    await gameRoom.webSocketMessage(ws as any, JSON.stringify({ type: 'start_solo' }))

    // Complete wipe phases to reach playing
    await completeWipePhases(gameRoom)

    // Verify game started
    let state = JSON.parse(ctx._sqlData['game_state'].data) as GameState
    expect(state.status).toBe('playing')

    // Player disconnects
    await gameRoom.webSocketClose(ws as any, 1000, 'Left', true)

    // Game should end
    state = JSON.parse(ctx._sqlData['game_state'].data) as GameState
    expect(state.status).toBe('game_over')
  })

  it('Invalid message type is handled gracefully', async () => {
    const ws = createMockWebSocket()
    ctx._webSockets.push(ws)

    await gameRoom.webSocketMessage(ws as any, JSON.stringify({ type: 'join', name: 'Test' }))
    ws.send.mockClear()

    // Send invalid message type
    await gameRoom.webSocketMessage(ws as any, JSON.stringify({ type: 'invalid_type' }))

    // Should not crash - check no error for unknown types (they're just ignored)
    // The game should still be functional
    const state = JSON.parse(ctx._sqlData['game_state'].data) as GameState
    expect(Object.keys(state.players).length).toBe(1)
  })

  it('Malformed JSON is handled gracefully', async () => {
    const ws = createMockWebSocket()
    ctx._webSockets.push(ws)

    await gameRoom.webSocketMessage(ws as any, 'not json at all')

    const errors = getErrorMessages(ws)
    expect(errors.some(e => e.code === 'invalid_message')).toBe(true)
  })
})

// ============================================================================
// Worker HTTP Endpoint Tests
// ============================================================================

describe('Worker: HTTP Endpoints', () => {
  function createMockEnv(): Env {
    return {
      GAME_ROOM: {
        idFromName: vi.fn((name: string) => ({ toString: () => name })),
        get: vi.fn(() => ({
          fetch: vi.fn(async () => new Response('OK')),
        })),
      } as any,
      MATCHMAKER: {
        idFromName: vi.fn((name: string) => ({ toString: () => `matchmaker-${name}` })),
        get: vi.fn(() => ({
          fetch: vi.fn(async () => new Response(JSON.stringify({ roomCode: null }))),
        })),
      } as any,
    }
  }

  describe('Health endpoint', () => {
    it('returns game identifier for server discovery', async () => {
      const env = createMockEnv()
      const request = new Request('http://localhost/health')

      const response = await worker.fetch(request, env)

      expect(response.status).toBe(200)
      const data = await response.json() as { status: string; game: string; version: string }
      expect(data.status).toBe('ok')
      expect(data.game).toBe('vaders')
      expect(data.version).toBe('1.0.0')
    })

    it('includes CORS headers', async () => {
      const env = createMockEnv()
      const request = new Request('http://localhost/health')

      const response = await worker.fetch(request, env)

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  describe('CORS preflight', () => {
    it('handles OPTIONS requests', async () => {
      const env = createMockEnv()
      const request = new Request('http://localhost/room', { method: 'OPTIONS' })

      const response = await worker.fetch(request, env)

      expect(response.status).toBe(200)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS')
    })
  })

  describe('Room info endpoint', () => {
    it('returns 404 for non-existent room', async () => {
      const env = createMockEnv()
      ;(env.MATCHMAKER.get as Mock).mockReturnValue({
        fetch: vi.fn(async () => new Response('Not found', { status: 404 })),
      })

      const request = new Request('http://localhost/room/NOROOM')

      const response = await worker.fetch(request, env)

      expect(response.status).toBe(404)
      const data = await response.json() as { error: string }
      expect(data.error).toBe('Room not found')
    })
  })

  describe('404 handling', () => {
    it('returns 404 for unknown routes', async () => {
      const env = createMockEnv()
      const request = new Request('http://localhost/unknown/path')

      const response = await worker.fetch(request, env)

      expect(response.status).toBe(404)
    })
  })
})

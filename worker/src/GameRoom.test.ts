// worker/src/GameRoom.test.ts
// Integration tests for the GameRoom Durable Object

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { GameRoom, type Env } from './GameRoom'
import type { ClientMessage, ServerMessage, GameState } from '../../shared/types'

// ============================================================================
// Mock Cloudflare Durable Object Environment
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
            // Schema creation - no-op
            return { toArray: () => [] }
          }
          if (query.includes('SELECT')) {
            // Return existing state
            if (sqlData['game_state']) {
              return {
                toArray: () => [sqlData['game_state']],
              }
            }
            return { toArray: () => [] }
          }
          if (query.includes('INSERT OR REPLACE')) {
            // Persist state
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
    // Test helpers
    _sqlData: sqlData,
    _webSockets: webSockets,
    _alarm: () => alarm,
  }
}

function createMockEnv(): Env {
  const matchmakerFetch = vi.fn(async () => new Response('OK'))

  return {
    GAME_ROOM: {
      idFromName: vi.fn((name: string) => ({ toString: () => name })),
      get: vi.fn(),
    } as any,
    MATCHMAKER: {
      idFromName: vi.fn((name: string) => ({ toString: () => `matchmaker-${name}` })),
      get: vi.fn(() => ({
        fetch: matchmakerFetch,
      })),
    } as any,
  }
}

// Helper to create initialized GameRoom
async function createInitializedGameRoom(roomCode: string = 'TEST01') {
  const ctx = createMockDurableObjectContext()
  const env = createMockEnv()
  const gameRoom = new GameRoom(ctx as any, env)

  // Wait for blockConcurrencyWhile
  await new Promise(resolve => setTimeout(resolve, 0))

  // Initialize the room
  const initRequest = new Request('https://internal/init', {
    method: 'POST',
    body: JSON.stringify({ roomCode }),
  })
  await gameRoom.fetch(initRequest)

  return { gameRoom, ctx, env }
}

// Helper to join a player
async function joinPlayer(
  gameRoom: GameRoom,
  ws: MockWebSocket,
  name: string = 'TestPlayer'
) {
  await gameRoom.webSocketMessage(ws as any, JSON.stringify({ type: 'join', name }))
}

// ============================================================================
// HTTP Endpoints Tests
// ============================================================================

describe('HTTP Endpoints', () => {
  describe('POST /init', () => {
    it('creates initial game state', async () => {
      const ctx = createMockDurableObjectContext()
      const env = createMockEnv()
      const gameRoom = new GameRoom(ctx as any, env)
      await new Promise(resolve => setTimeout(resolve, 0))

      const request = new Request('https://internal/init', {
        method: 'POST',
        body: JSON.stringify({ roomCode: 'ABC123' }),
      })

      const response = await gameRoom.fetch(request)

      expect(response.status).toBe(200)
      expect(await response.text()).toBe('OK')

      // Verify state was persisted
      expect(ctx.storage.sql.exec).toHaveBeenCalled()
      expect(ctx._sqlData['game_state']).toBeDefined()

      const savedState = JSON.parse(ctx._sqlData['game_state'].data) as GameState
      expect(savedState.roomId).toBe('ABC123')
      expect(savedState.status).toBe('waiting')
    })

    it('returns 409 if already initialized', async () => {
      const { gameRoom } = await createInitializedGameRoom('ABC123')

      const request = new Request('https://internal/init', {
        method: 'POST',
        body: JSON.stringify({ roomCode: 'ABC123' }),
      })

      const response = await gameRoom.fetch(request)

      expect(response.status).toBe(409)
      expect(await response.text()).toBe('Already initialized')
    })
  })

  describe('GET /info', () => {
    it('returns room status', async () => {
      const { gameRoom } = await createInitializedGameRoom('INFO01')

      const request = new Request('https://internal/info')
      const response = await gameRoom.fetch(request)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.roomCode).toBe('INFO01')
      expect(result.playerCount).toBe(0)
      expect(result.status).toBe('waiting')
    })

    it('returns 404 for uninitialized room', async () => {
      const ctx = createMockDurableObjectContext()
      const env = createMockEnv()
      const gameRoom = new GameRoom(ctx as any, env)
      await new Promise(resolve => setTimeout(resolve, 0))

      const request = new Request('https://internal/info')
      const response = await gameRoom.fetch(request)

      expect(response.status).toBe(404)
    })
  })

  describe('WebSocket upgrade', () => {
    it('rejected for uninitialized room (404)', async () => {
      const ctx = createMockDurableObjectContext()
      const env = createMockEnv()
      const gameRoom = new GameRoom(ctx as any, env)
      await new Promise(resolve => setTimeout(resolve, 0))

      const request = new Request('https://internal/ws', {
        headers: { Upgrade: 'websocket' },
      })
      const response = await gameRoom.fetch(request)

      expect(response.status).toBe(404)
      const result = await response.json()
      expect(result.code).toBe('invalid_room')
    })

    it('rejected for full room (429)', async () => {
      const { gameRoom, ctx } = await createInitializedGameRoom()

      // Add 4 mock players
      const ws1 = createMockWebSocket()
      const ws2 = createMockWebSocket()
      const ws3 = createMockWebSocket()
      const ws4 = createMockWebSocket()

      ctx._webSockets.push(ws1, ws2, ws3, ws4)

      await joinPlayer(gameRoom, ws1, 'Player1')
      await joinPlayer(gameRoom, ws2, 'Player2')
      await joinPlayer(gameRoom, ws3, 'Player3')
      await joinPlayer(gameRoom, ws4, 'Player4')

      const request = new Request('https://internal/ws', {
        headers: { Upgrade: 'websocket' },
      })
      const response = await gameRoom.fetch(request)

      expect(response.status).toBe(429)
      const result = await response.json()
      expect(result.code).toBe('room_full')
    })

    it('rejected for game in progress (409)', async () => {
      const { gameRoom, ctx } = await createInitializedGameRoom()

      // Set game to playing status
      const state = JSON.parse(ctx._sqlData['game_state'].data) as GameState
      state.status = 'playing'
      ctx._sqlData['game_state'].data = JSON.stringify(state)

      // Re-create gameRoom to load updated state
      const gameRoom2 = new GameRoom(ctx as any, createMockEnv())
      await new Promise(resolve => setTimeout(resolve, 0))

      const request = new Request('https://internal/ws', {
        headers: { Upgrade: 'websocket' },
      })
      const response = await gameRoom2.fetch(request)

      expect(response.status).toBe(409)
      const result = await response.json()
      expect(result.code).toBe('game_in_progress')
    })

    it('accepts upgrade for valid room', async () => {
      const { gameRoom, ctx } = await createInitializedGameRoom()

      // Mock WebSocketPair to return mock sockets
      const mockClient = createMockWebSocket()
      const mockServer = createMockWebSocket()

      vi.stubGlobal('WebSocketPair', function () {
        return [mockClient, mockServer]
      })

      const request = new Request('https://internal/ws', {
        headers: { Upgrade: 'websocket' },
      })

      // The actual Response with status 101 throws in Node environment
      // Just verify acceptWebSocket was called which indicates successful upgrade path
      try {
        await gameRoom.fetch(request)
      } catch (e) {
        // Status 101 is not valid in Node, but we reached the upgrade code path
      }

      // Verify the WebSocket was accepted
      expect(ctx.acceptWebSocket).toHaveBeenCalled()

      vi.unstubAllGlobals()
    })
  })
})

// ============================================================================
// WebSocket Message Handling Tests
// ============================================================================

describe('WebSocket Message Handling', () => {
  describe('join message', () => {
    it('adds player and sends sync with playerId and config', async () => {
      const { gameRoom, ctx } = await createInitializedGameRoom()
      const ws = createMockWebSocket()
      ctx._webSockets.push(ws)

      await joinPlayer(gameRoom, ws, 'Alice')

      // Should have sent sync message
      expect(ws.send).toHaveBeenCalled()
      const syncCall = ws.send.mock.calls.find((call: unknown[]) => {
        const msg = JSON.parse(call[0] as string)
        return msg.type === 'sync' && msg.playerId
      })
      expect(syncCall).toBeDefined()

      const syncMsg = JSON.parse(syncCall![0])
      expect(syncMsg.playerId).toBeDefined()
      expect(syncMsg.config).toBeDefined()
      expect(syncMsg.state.players[syncMsg.playerId]).toBeDefined()
      expect(syncMsg.state.players[syncMsg.playerId].name).toBe('Alice')
    })

    it('broadcasts player_joined event', async () => {
      const { gameRoom, ctx } = await createInitializedGameRoom()
      const ws = createMockWebSocket()
      ctx._webSockets.push(ws)

      await joinPlayer(gameRoom, ws, 'Alice')

      const eventCall = ws.send.mock.calls.find((call: unknown[]) => {
        const msg = JSON.parse(call[0] as string)
        return msg.type === 'event' && msg.name === 'player_joined'
      })
      expect(eventCall).toBeDefined()
    })

    it('returns error when already joined', async () => {
      const { gameRoom, ctx } = await createInitializedGameRoom()
      const ws = createMockWebSocket()
      ctx._webSockets.push(ws)

      await joinPlayer(gameRoom, ws, 'Alice')

      // Reset mock to check next call
      ws.send.mockClear()

      // Try to join again
      await gameRoom.webSocketMessage(
        ws as any,
        JSON.stringify({ type: 'join', name: 'Alice2' })
      )

      const errorCall = ws.send.mock.calls.find((call: unknown[]) => {
        const msg = JSON.parse(call[0] as string)
        return msg.type === 'error'
      })
      expect(errorCall).toBeDefined()
      const errorMsg = JSON.parse(errorCall![0])
      expect(errorMsg.code).toBe('already_joined')
    })

    it('returns error when room full', async () => {
      const { gameRoom, ctx } = await createInitializedGameRoom()

      // Join 4 players
      for (let i = 0; i < 4; i++) {
        const ws = createMockWebSocket()
        ctx._webSockets.push(ws)
        await joinPlayer(gameRoom, ws, `Player${i + 1}`)
      }

      // Try to join 5th player
      const ws5 = createMockWebSocket()
      ctx._webSockets.push(ws5)

      await gameRoom.webSocketMessage(
        ws5 as any,
        JSON.stringify({ type: 'join', name: 'Player5' })
      )

      const errorCall = ws5.send.mock.calls.find((call: unknown[]) => {
        const msg = JSON.parse(call[0] as string)
        return msg.type === 'error' && msg.code === 'room_full'
      })
      expect(errorCall).toBeDefined()
    })

    it('returns error during countdown', async () => {
      const { gameRoom, ctx } = await createInitializedGameRoom()

      // Join 2 players and ready up
      const ws1 = createMockWebSocket()
      const ws2 = createMockWebSocket()
      ctx._webSockets.push(ws1, ws2)

      await joinPlayer(gameRoom, ws1, 'Player1')
      await joinPlayer(gameRoom, ws2, 'Player2')

      await gameRoom.webSocketMessage(ws1 as any, JSON.stringify({ type: 'ready' }))
      await gameRoom.webSocketMessage(ws2 as any, JSON.stringify({ type: 'ready' }))

      // Now try to join during countdown
      const ws3 = createMockWebSocket()
      ctx._webSockets.push(ws3)

      await gameRoom.webSocketMessage(
        ws3 as any,
        JSON.stringify({ type: 'join', name: 'Player3' })
      )

      const errorCall = ws3.send.mock.calls.find((call: unknown[]) => {
        const msg = JSON.parse(call[0] as string)
        return msg.type === 'error' && msg.code === 'countdown_in_progress'
      })
      expect(errorCall).toBeDefined()
    })
  })

  describe('ready message', () => {
    it('adds to readyPlayerIds and broadcasts player_ready', async () => {
      const { gameRoom, ctx } = await createInitializedGameRoom()
      const ws = createMockWebSocket()
      ctx._webSockets.push(ws)

      await joinPlayer(gameRoom, ws, 'Alice')
      ws.send.mockClear()

      await gameRoom.webSocketMessage(ws as any, JSON.stringify({ type: 'ready' }))

      const eventCall = ws.send.mock.calls.find((call: unknown[]) => {
        const msg = JSON.parse(call[0] as string)
        return msg.type === 'event' && msg.name === 'player_ready'
      })
      expect(eventCall).toBeDefined()
    })

    it('starts countdown when all ready (2+ players)', async () => {
      const { gameRoom, ctx } = await createInitializedGameRoom()
      const ws1 = createMockWebSocket()
      const ws2 = createMockWebSocket()
      ctx._webSockets.push(ws1, ws2)

      await joinPlayer(gameRoom, ws1, 'Player1')
      await joinPlayer(gameRoom, ws2, 'Player2')

      await gameRoom.webSocketMessage(ws1 as any, JSON.stringify({ type: 'ready' }))
      await gameRoom.webSocketMessage(ws2 as any, JSON.stringify({ type: 'ready' }))

      // Should have broadcast countdown_tick
      const countdownCall = ws1.send.mock.calls.find((call: unknown[]) => {
        const msg = JSON.parse(call[0] as string)
        return msg.type === 'event' && msg.name === 'countdown_tick'
      })
      expect(countdownCall).toBeDefined()

      const countdownMsg = JSON.parse(countdownCall![0])
      expect(countdownMsg.data.count).toBe(3)

      // Alarm should be set
      expect(ctx.storage.setAlarm).toHaveBeenCalled()
    })
  })

  describe('unready message', () => {
    it('cancels countdown if player unreadies during countdown', async () => {
      const { gameRoom, ctx } = await createInitializedGameRoom()
      const ws1 = createMockWebSocket()
      const ws2 = createMockWebSocket()
      ctx._webSockets.push(ws1, ws2)

      await joinPlayer(gameRoom, ws1, 'Player1')
      await joinPlayer(gameRoom, ws2, 'Player2')

      await gameRoom.webSocketMessage(ws1 as any, JSON.stringify({ type: 'ready' }))
      await gameRoom.webSocketMessage(ws2 as any, JSON.stringify({ type: 'ready' }))

      // Now unready
      await gameRoom.webSocketMessage(ws1 as any, JSON.stringify({ type: 'unready' }))

      // Should have cancelled countdown
      const cancelCall = ws1.send.mock.calls.find((call: unknown[]) => {
        const msg = JSON.parse(call[0] as string)
        return msg.type === 'event' && msg.name === 'countdown_cancelled'
      })
      expect(cancelCall).toBeDefined()
    })
  })

  describe('start_solo message', () => {
    it('starts game immediately with 1 player', async () => {
      const { gameRoom, ctx } = await createInitializedGameRoom()
      const ws = createMockWebSocket()
      ctx._webSockets.push(ws)

      await joinPlayer(gameRoom, ws, 'SoloPlayer')
      ws.send.mockClear()

      await gameRoom.webSocketMessage(ws as any, JSON.stringify({ type: 'start_solo' }))

      // Should have broadcast game_start
      const startCall = ws.send.mock.calls.find((call: unknown[]) => {
        const msg = JSON.parse(call[0] as string)
        return msg.type === 'event' && msg.name === 'game_start'
      })
      expect(startCall).toBeDefined()

      // Should have set alarm for game tick
      expect(ctx.storage.setAlarm).toHaveBeenCalled()
    })
  })

  describe('input message', () => {
    it('queues PLAYER_INPUT action', async () => {
      const { gameRoom, ctx } = await createInitializedGameRoom()
      const ws = createMockWebSocket()
      ctx._webSockets.push(ws)

      await joinPlayer(gameRoom, ws, 'Player')
      await gameRoom.webSocketMessage(ws as any, JSON.stringify({ type: 'start_solo' }))

      // Send input
      await gameRoom.webSocketMessage(
        ws as any,
        JSON.stringify({ type: 'input', held: { left: true, right: false } })
      )

      // Input will be processed on next tick - we just verify no error
      const errorCall = ws.send.mock.calls.find((call: unknown[]) => {
        const msg = JSON.parse(call[0] as string)
        return msg.type === 'error'
      })
      expect(errorCall).toBeUndefined()
    })
  })

  describe('shoot message', () => {
    it('queues PLAYER_SHOOT action during playing', async () => {
      const { gameRoom, ctx } = await createInitializedGameRoom()
      const ws = createMockWebSocket()
      ctx._webSockets.push(ws)

      await joinPlayer(gameRoom, ws, 'Player')
      await gameRoom.webSocketMessage(ws as any, JSON.stringify({ type: 'start_solo' }))

      await gameRoom.webSocketMessage(ws as any, JSON.stringify({ type: 'shoot' }))

      // Shoot will be processed on next tick - verify no error
      const errorCall = ws.send.mock.calls.find((call: unknown[]) => {
        const msg = JSON.parse(call[0] as string)
        return msg.type === 'error'
      })
      expect(errorCall).toBeUndefined()
    })
  })

  describe('ping message', () => {
    it('returns pong with serverTime', async () => {
      const { gameRoom, ctx } = await createInitializedGameRoom()
      const ws = createMockWebSocket()
      ctx._webSockets.push(ws)

      await joinPlayer(gameRoom, ws, 'Player')
      ws.send.mockClear()

      const beforeTime = Date.now()
      await gameRoom.webSocketMessage(ws as any, JSON.stringify({ type: 'ping' }))
      const afterTime = Date.now()

      const pongCall = ws.send.mock.calls.find((call: unknown[]) => {
        const msg = JSON.parse(call[0] as string)
        return msg.type === 'pong'
      })
      expect(pongCall).toBeDefined()

      const pongMsg = JSON.parse(pongCall![0])
      expect(pongMsg.serverTime).toBeGreaterThanOrEqual(beforeTime)
      expect(pongMsg.serverTime).toBeLessThanOrEqual(afterTime)
    })
  })
})

// ============================================================================
// WebSocket Close Handling Tests
// ============================================================================

describe('WebSocket Close Handling', () => {
  it('removes player on disconnect', async () => {
    const { gameRoom, ctx } = await createInitializedGameRoom()
    const ws = createMockWebSocket()
    ctx._webSockets.push(ws)

    await joinPlayer(gameRoom, ws, 'Player')

    // Get player ID from sync message
    const syncCall = ws.send.mock.calls.find((call: unknown[]) => {
      const msg = JSON.parse(call[0] as string)
      return msg.type === 'sync' && msg.playerId
    })
    const playerId = JSON.parse(syncCall![0]).playerId

    // Disconnect
    await gameRoom.webSocketClose(ws as any, 1000, 'Normal closure', true)

    // Verify player_left event was broadcast
    const leftCall = ws.send.mock.calls.find((call: unknown[]) => {
      const msg = JSON.parse(call[0] as string)
      return msg.type === 'event' && msg.name === 'player_left' && msg.data.playerId === playerId
    })
    expect(leftCall).toBeDefined()
  })

  it('cancels countdown if player disconnects during countdown', async () => {
    const { gameRoom, ctx } = await createInitializedGameRoom()
    const ws1 = createMockWebSocket()
    const ws2 = createMockWebSocket()
    ctx._webSockets.push(ws1, ws2)

    await joinPlayer(gameRoom, ws1, 'Player1')
    await joinPlayer(gameRoom, ws2, 'Player2')

    await gameRoom.webSocketMessage(ws1 as any, JSON.stringify({ type: 'ready' }))
    await gameRoom.webSocketMessage(ws2 as any, JSON.stringify({ type: 'ready' }))

    // Disconnect one player
    await gameRoom.webSocketClose(ws1 as any, 1000, 'Left', true)

    // Should cancel countdown
    const cancelCall = ws2.send.mock.calls.find((call: unknown[]) => {
      const msg = JSON.parse(call[0] as string)
      return msg.type === 'event' && msg.name === 'countdown_cancelled'
    })
    expect(cancelCall).toBeDefined()
  })

  it('schedules room cleanup when last player leaves', async () => {
    const { gameRoom, ctx } = await createInitializedGameRoom()
    const ws = createMockWebSocket()
    ctx._webSockets.push(ws)

    await joinPlayer(gameRoom, ws, 'LastPlayer')

    await gameRoom.webSocketClose(ws as any, 1000, 'Left', true)

    // Should schedule cleanup alarm
    expect(ctx.storage.setAlarm).toHaveBeenCalled()
  })
})

// ============================================================================
// Alarm Handling Tests
// ============================================================================

describe('Alarm Handling', () => {
  describe('countdown ticks', () => {
    it('ticks 3 -> 2 -> 1 -> game start', async () => {
      const { gameRoom, ctx } = await createInitializedGameRoom()
      const ws1 = createMockWebSocket()
      const ws2 = createMockWebSocket()
      ctx._webSockets.push(ws1, ws2)

      await joinPlayer(gameRoom, ws1, 'Player1')
      await joinPlayer(gameRoom, ws2, 'Player2')

      await gameRoom.webSocketMessage(ws1 as any, JSON.stringify({ type: 'ready' }))
      await gameRoom.webSocketMessage(ws2 as any, JSON.stringify({ type: 'ready' }))

      // First countdown_tick (3) should have been sent
      let countdownCalls = ws1.send.mock.calls.filter((call: unknown[]) => {
        const msg = JSON.parse(call[0] as string)
        return msg.type === 'event' && msg.name === 'countdown_tick'
      })
      expect(countdownCalls.length).toBeGreaterThanOrEqual(1)

      // Trigger alarm (count 2)
      ws1.send.mockClear()
      ws2.send.mockClear()
      await gameRoom.alarm()

      countdownCalls = ws1.send.mock.calls.filter((call: unknown[]) => {
        const msg = JSON.parse(call[0] as string)
        return msg.type === 'event' && msg.name === 'countdown_tick'
      })
      expect(countdownCalls.length).toBe(1)
      expect(JSON.parse(countdownCalls[0][0]).data.count).toBe(2)

      // Trigger alarm (count 1)
      ws1.send.mockClear()
      await gameRoom.alarm()

      countdownCalls = ws1.send.mock.calls.filter((call: unknown[]) => {
        const msg = JSON.parse(call[0] as string)
        return msg.type === 'event' && msg.name === 'countdown_tick'
      })
      expect(countdownCalls.length).toBe(1)
      expect(JSON.parse(countdownCalls[0][0]).data.count).toBe(1)

      // Trigger alarm (game start)
      ws1.send.mockClear()
      await gameRoom.alarm()

      const startCall = ws1.send.mock.calls.find((call: unknown[]) => {
        const msg = JSON.parse(call[0] as string)
        return msg.type === 'event' && msg.name === 'game_start'
      })
      expect(startCall).toBeDefined()
    })
  })

  describe('game tick', () => {
    it('processes input queue and broadcasts state', async () => {
      const { gameRoom, ctx } = await createInitializedGameRoom()
      const ws = createMockWebSocket()
      ctx._webSockets.push(ws)

      await joinPlayer(gameRoom, ws, 'Player')
      await gameRoom.webSocketMessage(ws as any, JSON.stringify({ type: 'start_solo' }))

      // Queue input
      await gameRoom.webSocketMessage(
        ws as any,
        JSON.stringify({ type: 'input', held: { left: true, right: false } })
      )

      ws.send.mockClear()

      // Trigger game tick
      await gameRoom.alarm()

      // Should have sent sync with updated state
      const syncCall = ws.send.mock.calls.find((call: unknown[]) => {
        const msg = JSON.parse(call[0] as string)
        return msg.type === 'sync'
      })
      expect(syncCall).toBeDefined()

      // Tick should have incremented
      const state = JSON.parse(syncCall![0]).state as GameState
      expect(state.tick).toBeGreaterThan(0)
    })

    it('stops tick alarm on game over', async () => {
      const { gameRoom, ctx } = await createInitializedGameRoom()
      const ws = createMockWebSocket()
      ctx._webSockets.push(ws)

      await joinPlayer(gameRoom, ws, 'Player')
      await gameRoom.webSocketMessage(ws as any, JSON.stringify({ type: 'start_solo' }))

      // Manually set game to game_over state
      const state = JSON.parse(ctx._sqlData['game_state'].data) as GameState
      state.status = 'game_over'
      ctx._sqlData['game_state'].data = JSON.stringify(state)

      // Reload gameRoom with updated state
      const gameRoom2 = new GameRoom(ctx as any, createMockEnv())
      await new Promise(resolve => setTimeout(resolve, 0))

      // Clear the alarm mock
      ;(ctx.storage.setAlarm as Mock).mockClear()

      // Trigger alarm
      await gameRoom2.alarm()

      // Should not schedule another tick (game is over)
      // setAlarm might be called for cleanup, but not for tick interval
      const tickAlarmCalls = (ctx.storage.setAlarm as Mock).mock.calls.filter(
        (call: unknown[]) => {
          const time = call[0] as number
          // Tick alarms are ~33ms from now, cleanup alarms are 5 minutes
          return time - Date.now() < 1000
        }
      )
      expect(tickAlarmCalls.length).toBe(0)
    })
  })
})

// ============================================================================
// Invalid Message Handling Tests
// ============================================================================

describe('Invalid Message Handling', () => {
  it('returns error for invalid JSON', async () => {
    const { gameRoom, ctx } = await createInitializedGameRoom()
    const ws = createMockWebSocket()
    ctx._webSockets.push(ws)

    await gameRoom.webSocketMessage(ws as any, 'not valid json')

    const errorCall = ws.send.mock.calls.find((call: unknown[]) => {
      const msg = JSON.parse(call[0] as string)
      return msg.type === 'error' && msg.code === 'invalid_message'
    })
    expect(errorCall).toBeDefined()
  })
})

// ============================================================================
// Player Slot Assignment Tests
// ============================================================================

describe('Player Slot Assignment', () => {
  it('assigns slot 1 to first player', async () => {
    const { gameRoom, ctx } = await createInitializedGameRoom()
    const ws = createMockWebSocket()
    ctx._webSockets.push(ws)

    await joinPlayer(gameRoom, ws, 'Player1')

    const syncCall = ws.send.mock.calls.find((call: unknown[]) => {
      const msg = JSON.parse(call[0] as string)
      return msg.type === 'sync' && msg.playerId
    })
    const syncMsg = JSON.parse(syncCall![0])
    const player = syncMsg.state.players[syncMsg.playerId]
    expect(player.slot).toBe(1)
  })

  it('assigns slots 1, 2, 3, 4 in order as players join', async () => {
    const { gameRoom, ctx } = await createInitializedGameRoom()
    const playerSlots: number[] = []

    for (let i = 0; i < 4; i++) {
      const ws = createMockWebSocket()
      ctx._webSockets.push(ws)
      await joinPlayer(gameRoom, ws, `Player${i + 1}`)

      const syncCall = ws.send.mock.calls.find((call: unknown[]) => {
        const msg = JSON.parse(call[0] as string)
        return msg.type === 'sync' && msg.playerId
      })
      const syncMsg = JSON.parse(syncCall![0])
      const player = syncMsg.state.players[syncMsg.playerId]
      playerSlots.push(player.slot)
    }

    expect(playerSlots).toEqual([1, 2, 3, 4])
  })

  it('assigns correct colors based on slot', async () => {
    const { gameRoom, ctx } = await createInitializedGameRoom()
    const expectedColors = ['green', 'cyan', 'yellow', 'magenta']
    const playerColors: string[] = []

    for (let i = 0; i < 4; i++) {
      const ws = createMockWebSocket()
      ctx._webSockets.push(ws)
      await joinPlayer(gameRoom, ws, `Player${i + 1}`)

      const syncCall = ws.send.mock.calls.find((call: unknown[]) => {
        const msg = JSON.parse(call[0] as string)
        return msg.type === 'sync' && msg.playerId
      })
      const syncMsg = JSON.parse(syncCall![0])
      const player = syncMsg.state.players[syncMsg.playerId]
      playerColors.push(player.color)
    }

    expect(playerColors).toEqual(expectedColors)
  })

  it('reuses slot when player leaves and new player joins', async () => {
    const { gameRoom, ctx } = await createInitializedGameRoom()

    // Join 2 players
    const ws1 = createMockWebSocket()
    const ws2 = createMockWebSocket()
    ctx._webSockets.push(ws1, ws2)

    await joinPlayer(gameRoom, ws1, 'Player1')
    await joinPlayer(gameRoom, ws2, 'Player2')

    // Player 1 leaves
    await gameRoom.webSocketClose(ws1 as any, 1000, 'Left', true)

    // New player joins - should get slot 1
    const ws3 = createMockWebSocket()
    ctx._webSockets.push(ws3)
    await joinPlayer(gameRoom, ws3, 'Player3')

    const syncCall = ws3.send.mock.calls.find((call: unknown[]) => {
      const msg = JSON.parse(call[0] as string)
      return msg.type === 'sync' && msg.playerId
    })
    const syncMsg = JSON.parse(syncCall![0])
    const player = syncMsg.state.players[syncMsg.playerId]
    expect(player.slot).toBe(1) // Reused slot 1
  })
})

// ============================================================================
// Wave Transition Tests
// ============================================================================

describe('Wave Transition', () => {
  it('increments wave when all aliens are killed', async () => {
    const { gameRoom, ctx } = await createInitializedGameRoom()
    const ws = createMockWebSocket()
    ctx._webSockets.push(ws)

    await joinPlayer(gameRoom, ws, 'Player')
    await gameRoom.webSocketMessage(ws as any, JSON.stringify({ type: 'start_solo' }))

    // Get initial state
    let syncCall = ws.send.mock.calls.find((call: unknown[]) => {
      const msg = JSON.parse(call[0] as string)
      return msg.type === 'sync' && msg.state?.status === 'playing'
    })
    let state = JSON.parse(syncCall![0]).state as GameState
    expect(state.wave).toBe(1)

    // Kill all aliens by setting them to dead
    const aliens = state.entities.filter(e => e.kind === 'alien')
    for (const alien of aliens) {
      ;(alien as any).alive = false
    }
    ctx._sqlData['game_state'].data = JSON.stringify(state)

    // Reload gameRoom to pick up modified state
    const gameRoom2 = new GameRoom(ctx as any, createMockEnv())
    await new Promise(resolve => setTimeout(resolve, 0))

    ws.send.mockClear()

    // Trigger a tick - should detect all aliens dead and trigger wave_complete
    await gameRoom2.alarm()

    // Check for wave_complete event
    const waveCompleteCall = ws.send.mock.calls.find((call: unknown[]) => {
      const msg = JSON.parse(call[0] as string)
      return msg.type === 'event' && msg.name === 'wave_complete'
    })
    expect(waveCompleteCall).toBeDefined()
  })

  it('spawns new aliens on wave transition', async () => {
    const { gameRoom, ctx } = await createInitializedGameRoom()
    const ws = createMockWebSocket()
    ctx._webSockets.push(ws)

    await joinPlayer(gameRoom, ws, 'Player')
    await gameRoom.webSocketMessage(ws as any, JSON.stringify({ type: 'start_solo' }))

    // Get initial state and mark all aliens dead
    let state = JSON.parse(ctx._sqlData['game_state'].data) as GameState
    const aliens = state.entities.filter(e => e.kind === 'alien')
    for (const alien of aliens) {
      ;(alien as any).alive = false
    }
    ctx._sqlData['game_state'].data = JSON.stringify(state)

    // Reload gameRoom
    const gameRoom2 = new GameRoom(ctx as any, createMockEnv())
    await new Promise(resolve => setTimeout(resolve, 0))

    // Trigger tick to process wave transition
    await gameRoom2.alarm()

    // Check that new aliens were spawned
    const newState = JSON.parse(ctx._sqlData['game_state'].data) as GameState
    const newAliens = newState.entities.filter(e => e.kind === 'alien')
    const liveAliens = newAliens.filter((a: any) => a.alive)

    expect(liveAliens.length).toBeGreaterThan(0)
    expect(newState.wave).toBe(2)
  })

  it('preserves barriers through wave transition', async () => {
    const { gameRoom, ctx } = await createInitializedGameRoom()
    const ws = createMockWebSocket()
    ctx._webSockets.push(ws)

    await joinPlayer(gameRoom, ws, 'Player')
    await gameRoom.webSocketMessage(ws as any, JSON.stringify({ type: 'start_solo' }))

    // Get initial state
    let state = JSON.parse(ctx._sqlData['game_state'].data) as GameState
    const initialBarrierCount = state.entities.filter(e => e.kind === 'barrier').length

    // Mark all aliens dead
    const aliens = state.entities.filter(e => e.kind === 'alien')
    for (const alien of aliens) {
      ;(alien as any).alive = false
    }
    ctx._sqlData['game_state'].data = JSON.stringify(state)

    // Reload and trigger wave transition
    const gameRoom2 = new GameRoom(ctx as any, createMockEnv())
    await new Promise(resolve => setTimeout(resolve, 0))
    await gameRoom2.alarm()

    // Check barriers preserved
    const newState = JSON.parse(ctx._sqlData['game_state'].data) as GameState
    const finalBarrierCount = newState.entities.filter(e => e.kind === 'barrier').length

    expect(finalBarrierCount).toBe(initialBarrierCount)
  })
})

// ============================================================================
// WebSocket Error Handler Tests
// ============================================================================

describe('WebSocket Error Handling', () => {
  it('treats WebSocket error same as close', async () => {
    const { gameRoom, ctx } = await createInitializedGameRoom()
    const ws = createMockWebSocket()
    ctx._webSockets.push(ws)

    await joinPlayer(gameRoom, ws, 'Player')

    // Get player ID
    const syncCall = ws.send.mock.calls.find((call: unknown[]) => {
      const msg = JSON.parse(call[0] as string)
      return msg.type === 'sync' && msg.playerId
    })
    const playerId = JSON.parse(syncCall![0]).playerId

    // Simulate WebSocket error
    await gameRoom.webSocketError(ws as any, new Error('Connection reset'))

    // Player should be removed (player_left event broadcast)
    const leftCall = ws.send.mock.calls.find((call: unknown[]) => {
      const msg = JSON.parse(call[0] as string)
      return msg.type === 'event' && msg.name === 'player_left' && msg.data.playerId === playerId
    })
    expect(leftCall).toBeDefined()
  })
})

// ============================================================================
// Player Disconnect During Active Gameplay Tests
// ============================================================================

describe('Player Disconnect During Active Gameplay', () => {
  it('removes player from active game when they disconnect', async () => {
    const { gameRoom, ctx } = await createInitializedGameRoom()
    const ws1 = createMockWebSocket()
    ctx._webSockets.push(ws1)

    await joinPlayer(gameRoom, ws1, 'Player1')
    await gameRoom.webSocketMessage(ws1 as any, JSON.stringify({ type: 'start_solo' }))

    // Verify game is playing
    let state = JSON.parse(ctx._sqlData['game_state'].data) as GameState
    expect(state.status).toBe('playing')
    expect(Object.keys(state.players).length).toBe(1)

    // Player disconnects during gameplay
    await gameRoom.webSocketClose(ws1 as any, 1000, 'Closed', true)

    // Game should end (no players left)
    state = JSON.parse(ctx._sqlData['game_state'].data) as GameState
    expect(Object.keys(state.players).length).toBe(0)
    expect(state.status).toBe('game_over')
  })

  it('game continues when one player disconnects but others remain (coop)', async () => {
    const { gameRoom, ctx } = await createInitializedGameRoom()
    const ws1 = createMockWebSocket()
    const ws2 = createMockWebSocket()
    ctx._webSockets.push(ws1, ws2)

    await joinPlayer(gameRoom, ws1, 'Player1')
    await joinPlayer(gameRoom, ws2, 'Player2')

    // Both players ready up and start game
    await gameRoom.webSocketMessage(ws1 as any, JSON.stringify({ type: 'ready' }))
    await gameRoom.webSocketMessage(ws2 as any, JSON.stringify({ type: 'ready' }))

    // Countdown through to game start
    await gameRoom.alarm() // 2
    await gameRoom.alarm() // 1
    await gameRoom.alarm() // game start

    // Verify game is playing
    let state = JSON.parse(ctx._sqlData['game_state'].data) as GameState
    expect(state.status).toBe('playing')
    expect(Object.keys(state.players).length).toBe(2)

    // Player 1 disconnects during gameplay
    await gameRoom.webSocketClose(ws1 as any, 1000, 'Closed', true)

    // Game should continue with Player 2
    state = JSON.parse(ctx._sqlData['game_state'].data) as GameState
    expect(Object.keys(state.players).length).toBe(1)
    expect(state.status).toBe('playing')

    // player_left event should be broadcast
    const leftCall = ws2.send.mock.calls.find((call: unknown[]) => {
      const msg = JSON.parse(call[0] as string)
      return msg.type === 'event' && msg.name === 'player_left'
    })
    expect(leftCall).toBeDefined()
  })

  it('broadcasts player_left event to remaining players', async () => {
    const { gameRoom, ctx } = await createInitializedGameRoom()
    const ws1 = createMockWebSocket()
    const ws2 = createMockWebSocket()
    ctx._webSockets.push(ws1, ws2)

    await joinPlayer(gameRoom, ws1, 'Player1')
    await joinPlayer(gameRoom, ws2, 'Player2')

    // Get player 1's ID
    const syncCall = ws1.send.mock.calls.find((call: unknown[]) => {
      const msg = JSON.parse(call[0] as string)
      return msg.type === 'sync' && msg.playerId
    })
    const player1Id = JSON.parse(syncCall![0]).playerId

    ws2.send.mockClear()

    // Player 1 disconnects
    await gameRoom.webSocketClose(ws1 as any, 1000, 'Closed', true)

    // Player 2 should receive player_left event
    const leftCall = ws2.send.mock.calls.find((call: unknown[]) => {
      const msg = JSON.parse(call[0] as string)
      return msg.type === 'event' && msg.name === 'player_left' && msg.data.playerId === player1Id
    })
    expect(leftCall).toBeDefined()
  })
})

// ============================================================================
// 4-Player Room Full Scenario Tests
// ============================================================================

describe('4-Player Room Full Scenario', () => {
  it('room correctly reports full after 4 players join', async () => {
    const { gameRoom, ctx } = await createInitializedGameRoom()

    // Join 4 players
    for (let i = 0; i < 4; i++) {
      const ws = createMockWebSocket()
      ctx._webSockets.push(ws)
      await joinPlayer(gameRoom, ws, `Player${i + 1}`)
    }

    // Verify room is full
    const state = JSON.parse(ctx._sqlData['game_state'].data) as GameState
    expect(Object.keys(state.players).length).toBe(4)
  })

  it('all 4 players can ready up and start countdown', async () => {
    const { gameRoom, ctx } = await createInitializedGameRoom()
    const webSockets: MockWebSocket[] = []

    // Join 4 players
    for (let i = 0; i < 4; i++) {
      const ws = createMockWebSocket()
      ctx._webSockets.push(ws)
      webSockets.push(ws)
      await joinPlayer(gameRoom, ws, `Player${i + 1}`)
    }

    // All 4 players ready up
    for (const ws of webSockets) {
      await gameRoom.webSocketMessage(ws as any, JSON.stringify({ type: 'ready' }))
    }

    // Countdown should start
    const countdownCall = webSockets[0].send.mock.calls.find((call: unknown[]) => {
      const msg = JSON.parse(call[0] as string)
      return msg.type === 'event' && msg.name === 'countdown_tick'
    })
    expect(countdownCall).toBeDefined()

    const state = JSON.parse(ctx._sqlData['game_state'].data) as GameState
    expect(state.status).toBe('countdown')
    expect(state.readyPlayerIds.length).toBe(4)
  })

  it('4-player game uses correct scaling configuration', async () => {
    const { gameRoom, ctx } = await createInitializedGameRoom()
    const webSockets: MockWebSocket[] = []

    // Join 4 players
    for (let i = 0; i < 4; i++) {
      const ws = createMockWebSocket()
      ctx._webSockets.push(ws)
      webSockets.push(ws)
      await joinPlayer(gameRoom, ws, `Player${i + 1}`)
    }

    // All ready and start countdown
    for (const ws of webSockets) {
      await gameRoom.webSocketMessage(ws as any, JSON.stringify({ type: 'ready' }))
    }

    // Complete countdown: 3 -> 2 -> 1 -> start
    await gameRoom.alarm() // 2
    await gameRoom.alarm() // 1
    await gameRoom.alarm() // game start

    // Verify game is playing with 4-player scaling
    const state = JSON.parse(ctx._sqlData['game_state'].data) as GameState
    expect(state.status).toBe('playing')

    // 4-player config should have 15 columns and 6 rows of aliens (15*6 = 90 aliens)
    const aliens = state.entities.filter(e => e.kind === 'alien')
    expect(aliens.length).toBe(90) // 15 cols * 6 rows

    // Should have 5 shared lives (coop mode)
    expect(state.lives).toBe(5)
  })
})

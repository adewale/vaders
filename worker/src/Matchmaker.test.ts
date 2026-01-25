// worker/src/Matchmaker.test.ts
// Unit tests for the Matchmaker Durable Object

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Matchmaker } from './Matchmaker'

// ============================================================================
// Mock DurableObjectState
// ============================================================================

function createMockState() {
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
    // Get raw storage for assertions
    _storage: storage,
  }
}

// Helper to create a Matchmaker instance
async function createMatchmaker(initialRooms?: Record<string, { playerCount: number; status: string; updatedAt: number }>) {
  const mockState = createMockState()

  // Pre-populate storage if initial rooms provided
  if (initialRooms) {
    mockState._storage.set('rooms', initialRooms)
  }

  const matchmaker = new Matchmaker(mockState as any)

  // Wait for blockConcurrencyWhile to complete
  await new Promise(resolve => setTimeout(resolve, 0))

  return { matchmaker, mockState }
}

// Helper to make requests
function createRequest(method: string, path: string, body?: object): Request {
  const url = `https://internal${path}`
  const options: RequestInit = { method }

  if (body) {
    options.body = JSON.stringify(body)
    options.headers = { 'Content-Type': 'application/json' }
  }

  return new Request(url, options)
}

// Type for find response
interface FindResponse {
  roomCode: string | null
}

// Type for info response
interface InfoResponse {
  roomCode: string
  playerCount: number
  status: string
  updatedAt: number
}

// ============================================================================
// Room Registration Tests (POST /register)
// ============================================================================

describe('POST /register', () => {
  it('adds new room to registry', async () => {
    const { matchmaker, mockState } = await createMatchmaker()

    const request = createRequest('POST', '/register', {
      roomCode: 'ABC123',
      playerCount: 1,
      status: 'waiting',
    })

    const response = await matchmaker.fetch(request)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('OK')

    // Verify storage was updated
    expect(mockState.storage.put).toHaveBeenCalled()
    const storedRooms = mockState._storage.get('rooms') as Record<string, unknown>
    expect(storedRooms['ABC123']).toBeDefined()
    expect(storedRooms['ABC123']).toMatchObject({
      playerCount: 1,
      status: 'waiting',
    })
  })

  it('updates existing room info', async () => {
    const { matchmaker, mockState } = await createMatchmaker({
      ABC123: { playerCount: 1, status: 'waiting', updatedAt: Date.now() - 1000 },
    })

    const request = createRequest('POST', '/register', {
      roomCode: 'ABC123',
      playerCount: 2,
      status: 'waiting',
    })

    await matchmaker.fetch(request)

    const storedRooms = mockState._storage.get('rooms') as Record<string, any>
    expect(storedRooms['ABC123'].playerCount).toBe(2)
  })

  it('adds to openRooms when status=waiting and playerCount<4', async () => {
    const { matchmaker } = await createMatchmaker()

    await matchmaker.fetch(
      createRequest('POST', '/register', {
        roomCode: 'OPEN01',
        playerCount: 2,
        status: 'waiting',
      })
    )

    // Verify by finding the room
    const findResponse = await matchmaker.fetch(createRequest('GET', '/find'))
    const findResult = await findResponse.json() as FindResponse as FindResponse

    expect(findResult.roomCode).toBe('OPEN01')
  })

  it('removes from openRooms when status is not waiting', async () => {
    const { matchmaker } = await createMatchmaker({
      PLAY01: { playerCount: 2, status: 'waiting', updatedAt: Date.now() },
    })

    // First verify it's findable
    let findResponse = await matchmaker.fetch(createRequest('GET', '/find'))
    let findResult = await findResponse.json() as FindResponse as FindResponse
    expect(findResult.roomCode).toBe('PLAY01')

    // Update to playing status
    await matchmaker.fetch(
      createRequest('POST', '/register', {
        roomCode: 'PLAY01',
        playerCount: 2,
        status: 'playing',
      })
    )

    // Should no longer be findable
    findResponse = await matchmaker.fetch(createRequest('GET', '/find'))
    findResult = await findResponse.json() as FindResponse
    expect(findResult.roomCode).toBeNull()
  })

  it('removes from openRooms when playerCount>=4', async () => {
    const { matchmaker } = await createMatchmaker({
      FULL01: { playerCount: 2, status: 'waiting', updatedAt: Date.now() },
    })

    // Update to full room
    await matchmaker.fetch(
      createRequest('POST', '/register', {
        roomCode: 'FULL01',
        playerCount: 4,
        status: 'waiting',
      })
    )

    // Should no longer be findable
    const findResponse = await matchmaker.fetch(createRequest('GET', '/find'))
    const findResult = await findResponse.json() as FindResponse as FindResponse
    expect(findResult.roomCode).toBeNull()
  })
})

// ============================================================================
// Room Unregistration Tests (POST /unregister)
// ============================================================================

describe('POST /unregister', () => {
  it('removes room from registry', async () => {
    const { matchmaker, mockState } = await createMatchmaker({
      DEL001: { playerCount: 1, status: 'waiting', updatedAt: Date.now() },
    })

    await matchmaker.fetch(
      createRequest('POST', '/unregister', {
        roomCode: 'DEL001',
      })
    )

    const storedRooms = mockState._storage.get('rooms') as Record<string, unknown>
    expect(storedRooms['DEL001']).toBeUndefined()
  })

  it('removes from openRooms', async () => {
    const { matchmaker } = await createMatchmaker({
      DEL002: { playerCount: 1, status: 'waiting', updatedAt: Date.now() },
    })

    // Verify it's findable first
    let findResponse = await matchmaker.fetch(createRequest('GET', '/find'))
    let findResult = await findResponse.json() as FindResponse as FindResponse
    expect(findResult.roomCode).toBe('DEL002')

    // Unregister
    await matchmaker.fetch(
      createRequest('POST', '/unregister', {
        roomCode: 'DEL002',
      })
    )

    // Should no longer be findable
    findResponse = await matchmaker.fetch(createRequest('GET', '/find'))
    findResult = await findResponse.json() as FindResponse
    expect(findResult.roomCode).toBeNull()
  })

  it('returns OK even for non-existent room', async () => {
    const { matchmaker } = await createMatchmaker()

    const response = await matchmaker.fetch(
      createRequest('POST', '/unregister', {
        roomCode: 'NOTEXIST',
      })
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('OK')
  })
})

// ============================================================================
// Find Open Room Tests (GET /find)
// ============================================================================

describe('GET /find', () => {
  it('returns first available open room', async () => {
    const { matchmaker } = await createMatchmaker({
      ROOM01: { playerCount: 1, status: 'waiting', updatedAt: Date.now() },
      ROOM02: { playerCount: 2, status: 'waiting', updatedAt: Date.now() },
    })

    const response = await matchmaker.fetch(createRequest('GET', '/find'))
    const result = await response.json() as InfoResponse

    expect(response.status).toBe(200)
    expect(result.roomCode).toBeDefined()
    expect(['ROOM01', 'ROOM02']).toContain(result.roomCode)
  })

  it('returns roomCode: null when no open rooms', async () => {
    const { matchmaker } = await createMatchmaker()

    const response = await matchmaker.fetch(createRequest('GET', '/find'))
    const result = await response.json() as InfoResponse

    expect(response.status).toBe(200)
    expect(result.roomCode).toBeNull()
  })

  it('cleans up stale rooms (updatedAt > 5 minutes ago)', async () => {
    const fiveMinutesAgo = Date.now() - 6 * 60 * 1000 // 6 minutes ago

    const { matchmaker, mockState } = await createMatchmaker({
      STALE1: { playerCount: 1, status: 'waiting', updatedAt: fiveMinutesAgo },
      FRESH1: { playerCount: 1, status: 'waiting', updatedAt: Date.now() },
    })

    const response = await matchmaker.fetch(createRequest('GET', '/find'))
    const result = await response.json() as InfoResponse

    expect(result.roomCode).toBe('FRESH1')

    // Stale room should be removed from registry
    const storedRooms = mockState._storage.get('rooms') as Record<string, unknown>
    expect(storedRooms['STALE1']).toBeUndefined()
  })

  it('returns null if all rooms are stale', async () => {
    const fiveMinutesAgo = Date.now() - 6 * 60 * 1000

    const { matchmaker } = await createMatchmaker({
      STALE1: { playerCount: 1, status: 'waiting', updatedAt: fiveMinutesAgo },
      STALE2: { playerCount: 2, status: 'waiting', updatedAt: fiveMinutesAgo },
    })

    const response = await matchmaker.fetch(createRequest('GET', '/find'))
    const result = await response.json() as InfoResponse

    expect(result.roomCode).toBeNull()
  })

  it('skips rooms that are playing', async () => {
    const { matchmaker } = await createMatchmaker({
      PLAYING: { playerCount: 2, status: 'playing', updatedAt: Date.now() },
    })

    const response = await matchmaker.fetch(createRequest('GET', '/find'))
    const result = await response.json() as InfoResponse

    expect(result.roomCode).toBeNull()
  })

  it('skips full rooms (4 players)', async () => {
    const { matchmaker } = await createMatchmaker({
      FULL: { playerCount: 4, status: 'waiting', updatedAt: Date.now() },
    })

    const response = await matchmaker.fetch(createRequest('GET', '/find'))
    const result = await response.json() as InfoResponse

    expect(result.roomCode).toBeNull()
  })
})

// ============================================================================
// Room Info Tests (GET /info/:roomCode)
// ============================================================================

describe('GET /info/:roomCode', () => {
  it('returns room info for existing room', async () => {
    const updatedAt = Date.now()
    const { matchmaker } = await createMatchmaker({
      INFO01: { playerCount: 2, status: 'waiting', updatedAt },
    })

    const response = await matchmaker.fetch(createRequest('GET', '/info/INFO01'))
    const result = await response.json() as InfoResponse

    expect(response.status).toBe(200)
    expect(result.roomCode).toBe('INFO01')
    expect(result.playerCount).toBe(2)
    expect(result.status).toBe('waiting')
    expect(result.updatedAt).toBe(updatedAt)
  })

  it('returns 404 for non-existent room', async () => {
    const { matchmaker } = await createMatchmaker()

    const response = await matchmaker.fetch(createRequest('GET', '/info/NOTFND'))

    expect(response.status).toBe(404)
  })

  it('validates room code format (6 alphanumeric characters)', async () => {
    const { matchmaker } = await createMatchmaker()

    // Invalid format should not match the route
    const response = await matchmaker.fetch(createRequest('GET', '/info/invalid'))

    expect(response.status).toBe(404)
  })
})

// ============================================================================
// Not Found Tests
// ============================================================================

describe('Not Found', () => {
  it('returns 404 for unknown routes', async () => {
    const { matchmaker } = await createMatchmaker()

    const response = await matchmaker.fetch(createRequest('GET', '/unknown'))

    expect(response.status).toBe(404)
  })

  it('returns 404 for wrong HTTP method', async () => {
    const { matchmaker } = await createMatchmaker()

    const response = await matchmaker.fetch(createRequest('PUT', '/register'))

    expect(response.status).toBe(404)
  })
})

// ============================================================================
// State Restoration Tests
// ============================================================================

describe('state restoration', () => {
  it('restores rooms from storage on cold start', async () => {
    const { matchmaker, mockState } = await createMatchmaker({
      RESTORED: { playerCount: 1, status: 'waiting', updatedAt: Date.now() },
    })

    // blockConcurrencyWhile should have been called
    expect(mockState.blockConcurrencyWhile).toHaveBeenCalled()

    // Should be able to find the restored room
    const findResponse = await matchmaker.fetch(createRequest('GET', '/find'))
    const findResult = await findResponse.json() as FindResponse as FindResponse
    expect(findResult.roomCode).toBe('RESTORED')
  })

  it('rebuilds openRooms set correctly on restore', async () => {
    const { matchmaker } = await createMatchmaker({
      OPEN: { playerCount: 2, status: 'waiting', updatedAt: Date.now() },
      FULL: { playerCount: 4, status: 'waiting', updatedAt: Date.now() },
      PLAYING: { playerCount: 2, status: 'playing', updatedAt: Date.now() },
    })

    // Only OPEN should be findable
    const findResponse = await matchmaker.fetch(createRequest('GET', '/find'))
    const findResult = await findResponse.json() as FindResponse as FindResponse
    expect(findResult.roomCode).toBe('OPEN')
  })
})

// ============================================================================
// Concurrent Operations Tests
// ============================================================================

describe('concurrent operations', () => {
  it('handles multiple registrations', async () => {
    const { matchmaker, mockState } = await createMatchmaker()

    await Promise.all([
      matchmaker.fetch(
        createRequest('POST', '/register', {
          roomCode: 'ROOM01',
          playerCount: 1,
          status: 'waiting',
        })
      ),
      matchmaker.fetch(
        createRequest('POST', '/register', {
          roomCode: 'ROOM02',
          playerCount: 1,
          status: 'waiting',
        })
      ),
      matchmaker.fetch(
        createRequest('POST', '/register', {
          roomCode: 'ROOM03',
          playerCount: 1,
          status: 'waiting',
        })
      ),
    ])

    const storedRooms = mockState._storage.get('rooms') as Record<string, unknown>
    expect(Object.keys(storedRooms).length).toBe(3)
  })
})

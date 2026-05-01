// worker/src/room-creation.pbt.test.ts
// Property-based tests for the room-creation flow.
//
// Drives the Worker entrypoint (POST /room) AND direct GameRoom construction
// AND matchmaker queries through random command sequences, asserting that:
//   - roomCodes from POST /room are unique across arbitrary volumes.
//   - POST /room always returns a code matching /^[A-Z0-9]{6}$/.
//   - Rooms created via POST /room appear in the matchmaker registry with
//     playerCount=0, status=waiting.
//   - A freshly created (empty) room is NOT returned by /find (regression
//     guard for the LOW-severity empty-room trap fixed in Matchmaker.ts).
//   - POST /room with a saturated matchmaker (1000 pre-existing codes) is
//     either a new unique code or a 503 room_generation_failed — never
//     a duplicate.
//
// DIAGNOSTIC ONLY. Any property violations are captured as `describe.skip
// ('FOUND BUG: …')` below with a minimal reproducer.

import { describe, it, vi, type Mock } from 'vitest'
import fc from 'fast-check'
import worker from './index'
import { GameRoom, type Env } from './GameRoom'
import { Matchmaker } from './Matchmaker'
import type { GameState } from '../../shared/types'

// ============================================================================
// Mock Cloudflare infrastructure
// ============================================================================

interface MockWebSocket {
  send: Mock
  close: Mock
  serializeAttachment: Mock
  deserializeAttachment: Mock
  _attachment: unknown
  _closed: boolean
}

function _createMockWebSocket(): MockWebSocket {
  const ws: MockWebSocket = {
    send: vi.fn(),
    close: vi.fn(() => {
      ws._closed = true
    }),
    _attachment: null,
    _closed: false,
    serializeAttachment: vi.fn((data: unknown) => {
      ws._attachment = data
    }),
    deserializeAttachment: vi.fn(() => ws._attachment),
  }
  return ws
}

function createMockDurableObjectContext() {
  const sqlData: Record<string, { data: string; next_entity_id: number }> = {}
  const webSockets: MockWebSocket[] = []
  let alarm: number | null = null

  return {
    storage: {
      sql: {
        exec: vi.fn((query: string, ...params: unknown[]) => {
          if (query.includes('CREATE TABLE')) return { toArray: () => [] }
          if (query.includes('SELECT')) {
            if (sqlData.game_state) return { toArray: () => [sqlData.game_state] }
            return { toArray: () => [] }
          }
          if (query.includes('INSERT OR REPLACE')) {
            sqlData.game_state = {
              data: params[0] as string,
              next_entity_id: params[1] as number,
            }
            return { toArray: () => [] }
          }
          if (query.includes('DELETE')) {
            sqlData.game_state = undefined
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
    blockConcurrencyWhile: vi.fn(async <T>(fn: () => Promise<T>): Promise<T> => fn()),
    acceptWebSocket: vi.fn((ws: MockWebSocket) => {
      webSockets.push(ws)
    }),
    getWebSockets: vi.fn(() => webSockets.filter((ws) => !ws._closed)),
    _sqlData: sqlData,
    _webSockets: webSockets,
    _alarm: () => alarm,
  }
}

function createMockMatchmakerState() {
  const storage = new Map<string, unknown>()
  return {
    storage: {
      get: vi.fn(async <T>(key: string): Promise<T | undefined> => storage.get(key) as T | undefined),
      put: vi.fn(async (key: string, value: unknown): Promise<void> => {
        storage.set(key, value)
      }),
      delete: vi.fn(async (key: string): Promise<boolean> => storage.delete(key)),
      list: vi.fn(async () => storage),
    },
    blockConcurrencyWhile: vi.fn(async <T>(fn: () => Promise<T>): Promise<T> => fn()),
    _storage: storage,
  }
}

// ============================================================================
// End-to-end Worker harness — wires Matchmaker + GameRoom map behind a
// synthetic Env so `worker.fetch(request, env)` exercises real routing and
// DO construction, not hand-rolled mocks. The GameRoom.get(id) stub
// constructs-or-reuses a GameRoom per roomCode so `createRoom()` actually
// writes to the in-memory SQLite table.
// ============================================================================

class WorkerHarness {
  matchmakerState = createMockMatchmakerState()
  matchmaker: Matchmaker
  rooms = new Map<string, { ctx: ReturnType<typeof createMockDurableObjectContext>; room: GameRoom }>()
  env: Env

  constructor() {
    this.matchmaker = new Matchmaker(this.matchmakerState as unknown as DurableObjectState)
    const matchmakerFetch = async (request: Request) => this.matchmaker.fetch(request)

    this.env = {
      GAME_ROOM: {
        idFromName: vi.fn((name: string) => ({ toString: () => name })),
        get: vi.fn((id: { toString(): string }) => ({
          fetch: async (request: Request): Promise<Response> => {
            const code = id.toString()
            let entry = this.rooms.get(code)
            if (!entry) {
              const ctx = createMockDurableObjectContext()
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const room = new GameRoom(ctx as any, this.env)
              // Wait for blockConcurrencyWhile microtask to drain.
              await new Promise((resolve) => setTimeout(resolve, 0))
              entry = { ctx, room }
              this.rooms.set(code, entry)
            }
            return entry.room.fetch(request)
          },
        })),
      } as unknown as Env['GAME_ROOM'],
      MATCHMAKER: {
        idFromName: vi.fn(() => ({ toString: () => 'matchmaker-global' })),
        get: vi.fn(() => ({ fetch: matchmakerFetch })),
      } as unknown as Env['MATCHMAKER'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ASSETS: undefined as any,
    }
  }

  async postRoom(): Promise<{ status: number; roomCode: string | null; code?: string }> {
    const response = await worker.fetch(new Request('http://localhost/room', { method: 'POST' }), this.env)
    if (response.status !== 200) {
      const body = (await response.json()) as { code?: string; message?: string }
      return { status: response.status, roomCode: null, code: body.code }
    }
    const body = (await response.json()) as { roomCode: string }
    return { status: 200, roomCode: body.roomCode }
  }

  async getMatchmakerInfo(roomCode: string): Promise<{ playerCount: number; status: string } | null> {
    const response = await this.matchmaker.fetch(new Request(`https://internal/info/${roomCode}`))
    if (response.status !== 200) return null
    return (await response.json()) as { playerCount: number; status: string }
  }

  async matchmakerFind(): Promise<string | null> {
    const response = await this.matchmaker.fetch(new Request('https://internal/find'))
    const body = (await response.json()) as { roomCode: string | null }
    return body.roomCode
  }

  async registerExternal(roomCode: string, playerCount: number, status: string): Promise<void> {
    await this.matchmaker.fetch(
      new Request('https://internal/register', {
        method: 'POST',
        body: JSON.stringify({ roomCode, playerCount, status }),
      }),
    )
  }

  getRoomState(roomCode: string): GameState | null {
    const entry = this.rooms.get(roomCode)
    if (!entry) return null
    const row = entry.ctx._sqlData.game_state
    if (!row) return null
    return JSON.parse(row.data) as GameState
  }

  /** Direct GameRoom construction + init, bypassing the Worker router. */
  async directCreate(roomCode: string): Promise<void> {
    const id = this.env.GAME_ROOM.idFromName(roomCode)
    const stub = this.env.GAME_ROOM.get(id)
    await stub.fetch(
      new Request('https://internal/init', {
        method: 'POST',
        body: JSON.stringify({ roomCode }),
      }),
    )
  }
}

const ROOM_CODE_RE = /^[A-Z0-9]{6}$/

// ============================================================================
// Property 1: POST /room returns unique codes matching the 6-char regex
// ============================================================================

describe('PBT Room Creation: POST /room uniqueness + format', () => {
  it('100 consecutive POST /room calls return distinct codes, all matching regex', async () => {
    // Not a randomized property — this is a tight contract the generator
    // must satisfy for the whole system to work. The value of the PBT
    // wrapper is that `fc.assert` runs this under the same harness as
    // the others, so any change to Matchmaker that breaks uniqueness
    // under volume fails the whole suite consistently.
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        const harness = new WorkerHarness()
        const codes: string[] = []
        for (let i = 0; i < 100; i++) {
          const result = await harness.postRoom()
          if (result.status !== 200 || !result.roomCode) {
            throw new Error(`POST /room #${i} failed: status=${result.status} code=${result.code}`)
          }
          if (!ROOM_CODE_RE.test(result.roomCode)) {
            throw new Error(`POST /room #${i} returned ${result.roomCode} which does not match ${ROOM_CODE_RE}`)
          }
          codes.push(result.roomCode)
        }
        const unique = new Set(codes)
        if (unique.size !== codes.length) {
          throw new Error(
            `POST /room returned duplicates: ${codes.length - unique.size} ` + `duplicate(s) in ${codes.length} calls`,
          )
        }
      }),
      { numRuns: 5 }, // 5 runs × 100 calls = 500 room creations per property
    )
  }, 120_000)

  it('POST /room always returns a valid 6-char uppercase alphanumeric code', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 20 }), async (n) => {
        const harness = new WorkerHarness()
        for (let i = 0; i < n; i++) {
          const result = await harness.postRoom()
          if (result.status === 200) {
            if (!result.roomCode || !ROOM_CODE_RE.test(result.roomCode)) {
              throw new Error(`POST /room returned invalid code: ${JSON.stringify(result)}`)
            }
          } else {
            // Only acceptable non-200 is 503 room_generation_failed.
            if (result.status !== 503 || result.code !== 'room_generation_failed') {
              throw new Error(`POST /room returned unexpected non-200: ${JSON.stringify(result)}`)
            }
          }
        }
      }),
      { numRuns: 50 },
    )
  }, 120_000)
})

// ============================================================================
// Property 2: created room ↔ matchmaker registry consistency
// ============================================================================

describe('PBT Room Creation: matchmaker sees the new room', () => {
  it('POST /room → matchmaker /info/:code returns playerCount=0, status=waiting', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 10 }), async (n) => {
        const harness = new WorkerHarness()
        const codes: string[] = []
        for (let i = 0; i < n; i++) {
          const result = await harness.postRoom()
          if (result.status === 200 && result.roomCode) {
            codes.push(result.roomCode)
          }
        }
        for (const code of codes) {
          const info = await harness.getMatchmakerInfo(code)
          if (!info) {
            throw new Error(`Room ${code} created but /info/${code} returned 404`)
          }
          if (info.playerCount !== 0) {
            throw new Error(`Room ${code} just created; matchmaker playerCount=${info.playerCount} expected 0`)
          }
          if (info.status !== 'waiting') {
            throw new Error(`Room ${code} just created; matchmaker status=${info.status} expected 'waiting'`)
          }
        }
      }),
      { numRuns: 50 },
    )
  }, 120_000)
})

// ============================================================================
// Property 3: initial GameState after creation
// ============================================================================

describe('PBT Room Creation: initial GameState is clean', () => {
  it('freshly created room has status=waiting, playerCount=0, empty players map', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 10 }), async (n) => {
        const harness = new WorkerHarness()
        const codes: string[] = []
        for (let i = 0; i < n; i++) {
          const result = await harness.postRoom()
          if (result.status === 200 && result.roomCode) {
            codes.push(result.roomCode)
          }
        }
        for (const code of codes) {
          const state = harness.getRoomState(code)
          if (!state) {
            throw new Error(`Room ${code} created but has no persisted state`)
          }
          if (state.status !== 'waiting') {
            throw new Error(`Room ${code} status=${state.status}, expected 'waiting'`)
          }
          if (Object.keys(state.players).length !== 0) {
            throw new Error(`Room ${code} has ${Object.keys(state.players).length} players at creation`)
          }
          if (state.score !== 0) {
            throw new Error(`Room ${code} score=${state.score} at creation`)
          }
          if (state.roomCode !== code) {
            throw new Error(`Room ${code} has roomCode=${state.roomCode} in persisted state (mismatch)`)
          }
        }
      }),
      { numRuns: 50 },
    )
  }, 120_000)
})

// ============================================================================
// Property 4: REGRESSION — a freshly created room is NOT returned by /find
// until someone joins. This pins the LOW-severity bug fixed in Matchmaker.ts
// (empty-room trap).
// ============================================================================

describe('PBT Room Creation: empty room NOT findable (regression guard)', () => {
  it('POST /room → /find does not return the empty room', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (n) => {
        const harness = new WorkerHarness()
        const codes: string[] = []
        for (let i = 0; i < n; i++) {
          const result = await harness.postRoom()
          if (result.status === 200 && result.roomCode) {
            codes.push(result.roomCode)
          }
        }
        // /find should NOT return any of these empty rooms.
        for (let i = 0; i < n + 2; i++) {
          const found = await harness.matchmakerFind()
          if (found !== null && codes.includes(found)) {
            throw new Error(
              `Empty freshly created room ${found} was returned by /find. ` +
                `This is the LOW-severity empty-room trap — Matchmaker.ts should ` +
                `require playerCount > 0 to include a room in /find.`,
            )
          }
        }
      }),
      { numRuns: 50 },
    )
  }, 120_000)
})

// ============================================================================
// Property 5: saturation behaviour — POST /room either succeeds with a new
// unique code OR returns 503 room_generation_failed, never a duplicate.
// ============================================================================

describe('PBT Room Creation: saturation safety', () => {
  it('POST /room under pre-saturated matchmaker returns unique-or-503, never duplicate', async () => {
    // fc.integer generator: how many pre-existing rooms (up to ~1000) to
    // seed the matchmaker with before the focus POST /room call.
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 1000 }), async (preExistingCount) => {
        const harness = new WorkerHarness()
        const seededCodes = new Set<string>()
        // Seed via matchmaker.register directly — this simulates a huge
        // corpus of already-taken codes without going through the Worker
        // (faster, and we don't want to exercise the generator with itself).
        for (let i = 0; i < preExistingCount; i++) {
          // Pad with zeros to 6 chars; use hex to avoid colliding with
          // the generator's 36-char set.
          const code = `SEED${i.toString(36).padStart(2, '0').slice(-2).toUpperCase()}`
          // Only accept codes that pass the regex.
          if (ROOM_CODE_RE.test(code)) {
            await harness.registerExternal(code, 1, 'waiting')
            seededCodes.add(code)
          }
        }
        const result = await harness.postRoom()
        if (result.status === 200) {
          if (!result.roomCode || !ROOM_CODE_RE.test(result.roomCode)) {
            throw new Error(`Saturated POST /room returned invalid code: ${result.roomCode}`)
          }
          if (seededCodes.has(result.roomCode)) {
            throw new Error(
              `Saturated POST /room returned ${result.roomCode} which is already in the seeded set — DUPLICATE`,
            )
          }
        } else if (result.status === 503) {
          if (result.code !== 'room_generation_failed') {
            throw new Error(
              `Saturated POST /room returned 503 with code=${result.code}, expected 'room_generation_failed'`,
            )
          }
        } else {
          throw new Error(`Saturated POST /room returned unexpected status=${result.status}`)
        }
      }),
      { numRuns: 5 }, // each run seeds up to 1000 rooms so keep count modest
    )
  }, 300_000)
})

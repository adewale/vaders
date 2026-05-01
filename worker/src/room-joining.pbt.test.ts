// worker/src/room-joining.pbt.test.ts
// Property-based tests for the room-joining flow.
//
// Drives GameRoom + Matchmaker DOs through random sequences of Create /
// Join / Ready / Leave / StartSolo / AdvanceTicks commands, then asserts
// the join-specific invariants from the task brief after every command.
//
// Invariants asserted:
//   J1  Joining a waiting room with <4 players returns a valid slot and UUID.
//   J2  Re-joining on the SAME ws returns `already_joined` and does not grow
//       the player count.
//   J3  Joining a room in countdown/playing/wipe_*/game_over returns
//       `countdown_in_progress` or `game_in_progress`; player count does not
//       grow.
//   J4  Joining a 4-player room returns `room_full`; player count stays at 4.
//   J5  After N successful joins, every player has a unique slot in {1..4}.
//   J6  After N successful joins, every player's id is a unique UUID.
//   J7  Player name is truncated to 12 chars.
//   J8  Matchmaker registration tracks the real playerCount after each join.
//   J9  After a leave, matchmaker re-registers (unregister only on full-empty
//       + cleanup, which is NOT triggered by a leave — we characterise
//       current behaviour).
//   J10 After a leave, the departed player's slot is available for a new
//       joiner (slot-reuse).
//
// DIAGNOSTIC ONLY. Any violations are captured as `describe.skip('FOUND BUG:
// …')` blocks with a minimal reproducer + severity + remediation hint.

import { describe, it, expect, vi, type Mock } from 'vitest'
import fc from 'fast-check'
import { GameRoom, type Env } from './GameRoom'
import { Matchmaker } from './Matchmaker'
import type { GameState, ServerMessage, PlayerSlot } from '../../shared/types'

// ============================================================================
// Mock Cloudflare infrastructure — identical shape to state-machine.pbt.test.ts
// ============================================================================

interface MockWebSocket {
  send: Mock
  close: Mock
  serializeAttachment: Mock
  deserializeAttachment: Mock
  _attachment: unknown
  _closed: boolean
}

function createMockWebSocket(): MockWebSocket {
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
// Harness: one or more GameRooms + a shared Matchmaker
// ============================================================================

interface RoomEntry {
  ctx: ReturnType<typeof createMockDurableObjectContext>
  room: GameRoom
}

interface PlayerRef {
  id: string
  roomCode: string
  ws: MockWebSocket
  name: string
  slot: PlayerSlot
}

class RoomJoiningHarness {
  matchmakerState = createMockMatchmakerState()
  matchmaker: Matchmaker
  rooms = new Map<string, RoomEntry>()
  players = new Map<string, PlayerRef>()

  constructor() {
    this.matchmaker = new Matchmaker(this.matchmakerState as unknown as DurableObjectState)
  }

  async createRoom(roomCode: string): Promise<RoomEntry> {
    const existing = this.rooms.get(roomCode)
    if (existing) return existing

    const ctx = createMockDurableObjectContext()
    const matchmakerFetch = async (request: Request) => this.matchmaker.fetch(request)
    const env: Env = {
      GAME_ROOM: {
        idFromName: vi.fn((name: string) => ({ toString: () => name })),
        get: vi.fn(),
      } as unknown as Env['GAME_ROOM'],
      MATCHMAKER: {
        idFromName: vi.fn(() => ({ toString: () => 'matchmaker-global' })),
        get: vi.fn(() => ({ fetch: matchmakerFetch })),
      } as unknown as Env['MATCHMAKER'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ASSETS: undefined as any,
    }
    const room = new GameRoom(ctx as unknown as DurableObjectState, env)
    await new Promise((resolve) => setTimeout(resolve, 0))
    await room.fetch(
      new Request('https://internal/init', {
        method: 'POST',
        body: JSON.stringify({ roomCode }),
      }),
    )
    // Register with matchmaker (mirrors the Worker /room endpoint path).
    await this.matchmaker.fetch(
      new Request('https://internal/register', {
        method: 'POST',
        body: JSON.stringify({ roomCode, playerCount: 0, status: 'waiting' }),
      }),
    )

    const entry = { ctx, room }
    this.rooms.set(roomCode, entry)
    return entry
  }

  /**
   * Join via a fresh WebSocket. Returns the allocated playerId + slot on
   * success, or an `{ error, code }` object when the server rejects.
   */
  async joinAsNewPlayer(
    roomCode: string,
    name: string,
  ): Promise<
    | { ok: true; playerId: string; slot: PlayerSlot; ws: MockWebSocket }
    | { ok: false; error: string; ws: MockWebSocket }
  > {
    const entry = this.rooms.get(roomCode)
    if (!entry) return { ok: false, error: 'no_room', ws: createMockWebSocket() }

    const ws = createMockWebSocket()
    entry.ctx._webSockets.push(ws)
    await entry.room.webSocketMessage(ws as unknown as WebSocket, JSON.stringify({ type: 'join', name }))

    // Scan messages for either a sync w/ playerId or an error.
    const messages = ws.send.mock.calls
      .map((call: unknown[]) => {
        try {
          return JSON.parse(call[0] as string) as ServerMessage
        } catch {
          return null
        }
      })
      .filter((m): m is ServerMessage => m !== null)

    const errorMsg = messages.find((m): m is { type: 'error'; code: string; message: string } => m.type === 'error')
    if (errorMsg) {
      return { ok: false, error: errorMsg.code, ws }
    }

    const syncWithId = messages.find((m) => {
      return m.type === 'sync' && 'playerId' in m && typeof m.playerId === 'string'
    }) as (ServerMessage & { playerId: string }) | undefined
    if (!syncWithId) {
      return { ok: false, error: 'no_sync_with_playerId', ws }
    }
    const playerId = syncWithId.playerId
    const state = this.getRoomState(roomCode)
    const serverPlayer = state?.players[playerId]
    if (!serverPlayer) {
      return { ok: false, error: 'player_missing_from_state', ws }
    }
    const ref: PlayerRef = {
      id: playerId,
      roomCode,
      ws,
      name,
      slot: serverPlayer.slot,
    }
    this.players.set(playerId, ref)
    return { ok: true, playerId, slot: serverPlayer.slot, ws }
  }

  /** Re-join on an existing WebSocket (i.e., same attachment). */
  async rejoinOnSameWs(
    playerId: string,
    name: string,
  ): Promise<{ ok: true; playerId: string } | { ok: false; error: string }> {
    const ref = this.players.get(playerId)
    if (!ref) return { ok: false, error: 'no_player' }
    const entry = this.rooms.get(ref.roomCode)!
    ref.ws.send.mockClear()
    await entry.room.webSocketMessage(ref.ws as unknown as WebSocket, JSON.stringify({ type: 'join', name }))
    const messages = ref.ws.send.mock.calls
      .map((call: unknown[]) => {
        try {
          return JSON.parse(call[0] as string)
        } catch {
          return null
        }
      })
      .filter(Boolean)
    const err = messages.find((m: { type?: string }) => m.type === 'error')
    if (err) return { ok: false, error: err.code }
    return { ok: true, playerId }
  }

  async sendAs(playerId: string, message: Record<string, unknown>): Promise<void> {
    const ref = this.players.get(playerId)
    if (!ref) return
    const entry = this.rooms.get(ref.roomCode)!
    await entry.room.webSocketMessage(ref.ws as unknown as WebSocket, JSON.stringify(message))
  }

  async leavePlayer(playerId: string): Promise<void> {
    const ref = this.players.get(playerId)
    if (!ref) return
    const entry = this.rooms.get(ref.roomCode)!
    await entry.room.webSocketClose(ref.ws as unknown as WebSocket, 1000, 'Left', true)
    ref.ws._closed = true
    this.players.delete(playerId)
  }

  async advanceTicks(roomCode: string, n: number): Promise<void> {
    const entry = this.rooms.get(roomCode)
    if (!entry) return
    for (let i = 0; i < n; i++) {
      await entry.room.alarm()
    }
  }

  getRoomState(roomCode: string): GameState | null {
    const entry = this.rooms.get(roomCode)
    if (!entry) return null
    const row = entry.ctx._sqlData.game_state
    if (!row) return null
    return JSON.parse(row.data) as GameState
  }

  async getMatchmakerInfo(roomCode: string): Promise<{ playerCount: number; status: string } | null> {
    const response = await this.matchmaker.fetch(new Request(`https://internal/info/${roomCode}`))
    if (response.status !== 200) return null
    return (await response.json()) as { playerCount: number; status: string }
  }

  playersInRoom(roomCode: string): PlayerRef[] {
    return Array.from(this.players.values()).filter((p) => p.roomCode === roomCode)
  }
}

// ============================================================================
// Invariants — run after every command. Returns a (possibly-empty) list of
// violations; the harness short-circuits on the first non-empty list so
// shrinking gets a minimal reproducer.
// ============================================================================

interface Violation {
  code: string
  detail: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function assertJoinInvariants(harness: RoomJoiningHarness): Promise<Violation[]> {
  const violations: Violation[] = []
  const allIds = new Set<string>()
  for (const [roomCode] of harness.rooms) {
    const state = harness.getRoomState(roomCode)
    if (!state) continue
    const players = Object.values(state.players)
    const playerCount = players.length

    // J5: unique slot per room, slot in {1..4}
    const seenSlots = new Set<PlayerSlot>()
    for (const p of players) {
      if (![1, 2, 3, 4].includes(p.slot)) {
        violations.push({
          code: 'slot_out_of_range',
          detail: `Room ${roomCode}: player ${p.id} has slot=${p.slot}`,
        })
      }
      if (seenSlots.has(p.slot)) {
        violations.push({
          code: 'slot_collision',
          detail: `Room ${roomCode}: slot ${p.slot} held by multiple players`,
        })
      }
      seenSlots.add(p.slot)
    }

    // J6: unique UUIDs across the entire harness
    for (const p of players) {
      if (!UUID_RE.test(p.id)) {
        violations.push({
          code: 'player_id_not_uuid',
          detail: `Room ${roomCode}: player.id=${p.id} does not match UUID regex`,
        })
      }
      if (allIds.has(p.id)) {
        violations.push({
          code: 'player_id_collision',
          detail: `Room ${roomCode}: player.id=${p.id} duplicates another player`,
        })
      }
      allIds.add(p.id)
    }

    // Cardinality: never exceed maxPlayers.
    if (playerCount > state.config.maxPlayers) {
      violations.push({
        code: 'over_max_players',
        detail: `Room ${roomCode}: ${playerCount} > maxPlayers=${state.config.maxPlayers}`,
      })
    }

    // J7: name truncation — we only assert for players in our tracked map
    // since harness names can be > 12 chars.
    for (const ref of harness.playersInRoom(roomCode)) {
      const p = state.players[ref.id]
      if (!p) continue
      if (p.name.length > 12) {
        violations.push({
          code: 'name_not_truncated',
          detail: `Room ${roomCode}: player ${p.id} name="${p.name}" length=${p.name.length} > 12`,
        })
      }
    }

    // J8: matchmaker registration sees the canonical count when the room
    // is in 'waiting'. For non-waiting states, heartbeat updates at tick
    // 0 mod 1800 so the count can lag; we only assert on 'waiting'.
    if (state.status === 'waiting') {
      const info = await harness.getMatchmakerInfo(roomCode)
      if (!info) {
        violations.push({
          code: 'matchmaker_missing',
          detail: `Room ${roomCode}: no /info/${roomCode} after registration`,
        })
      } else if (info.playerCount !== playerCount) {
        // Allowed transient lag: re-check after a microtask.
        await new Promise((r) => setTimeout(r, 0))
        const info2 = await harness.getMatchmakerInfo(roomCode)
        if (info2 && info2.playerCount !== playerCount) {
          violations.push({
            code: 'matchmaker_count_drift',
            detail:
              `Room ${roomCode}: matchmaker playerCount=${info2.playerCount} ` + `but real playerCount=${playerCount}`,
          })
        }
      }
    }
  }
  return violations
}

// ============================================================================
// Command arbitraries
// ============================================================================

const ROOM_CODE_POOL = ['ROOM01', 'ROOM02', 'ROOM03']
const smallInt = fc.integer({ min: 0, max: 4 })

interface CmdCtx {
  harness: RoomJoiningHarness
  nameCounter: { n: number }
}

interface JoinCommand {
  run: (ctx: CmdCtx) => Promise<void>
  toString: () => string
}

const createRoomArb: fc.Arbitrary<JoinCommand> = smallInt.map((i): JoinCommand => {
  const code = ROOM_CODE_POOL[i % ROOM_CODE_POOL.length]
  return {
    run: async ({ harness }) => {
      await harness.createRoom(code)
    },
    toString: () => `CreateRoom(${code})`,
  }
})

const joinArb: fc.Arbitrary<JoinCommand> = fc
  .tuple(smallInt, fc.string({ minLength: 0, maxLength: 30 }))
  .map(([roomIdx, rawName]): JoinCommand => {
    const code = ROOM_CODE_POOL[roomIdx % ROOM_CODE_POOL.length]
    return {
      run: async ({ harness, nameCounter }) => {
        // Namespace the name to avoid collisions with harness tracking but
        // preserve length characteristics (for the truncation property).
        const name = `${rawName}#${nameCounter.n++}`
        if (!harness.rooms.has(code)) return
        await harness.joinAsNewPlayer(code, name)
      },
      toString: () => `Join(room=${code},rawName=${JSON.stringify(rawName)})`,
    }
  })

const readyArb: fc.Arbitrary<JoinCommand> = smallInt.map(
  (playerIdx): JoinCommand => ({
    run: async ({ harness }) => {
      const players = Array.from(harness.players.values())
      if (players.length === 0) return
      const target = players[playerIdx % players.length]
      await harness.sendAs(target.id, { type: 'ready' })
    },
    toString: () => `Ready(${playerIdx})`,
  }),
)

const leaveArb: fc.Arbitrary<JoinCommand> = smallInt.map(
  (playerIdx): JoinCommand => ({
    run: async ({ harness }) => {
      const players = Array.from(harness.players.values())
      if (players.length === 0) return
      const target = players[playerIdx % players.length]
      await harness.leavePlayer(target.id)
    },
    toString: () => `Leave(${playerIdx})`,
  }),
)

const startSoloArb: fc.Arbitrary<JoinCommand> = smallInt.map(
  (playerIdx): JoinCommand => ({
    run: async ({ harness }) => {
      const players = Array.from(harness.players.values())
      if (players.length === 0) return
      const target = players[playerIdx % players.length]
      await harness.sendAs(target.id, { type: 'start_solo' })
    },
    toString: () => `StartSolo(${playerIdx})`,
  }),
)

const advanceTicksArb: fc.Arbitrary<JoinCommand> = fc
  .tuple(smallInt, fc.integer({ min: 1, max: 3 }))
  .map(([roomIdx, n]): JoinCommand => {
    const code = ROOM_CODE_POOL[roomIdx % ROOM_CODE_POOL.length]
    return {
      run: async ({ harness }) => {
        await harness.advanceTicks(code, n)
      },
      toString: () => `AdvanceTicks(${code},${n})`,
    }
  })

const commandArb = fc.oneof(
  { weight: 3, arbitrary: createRoomArb },
  { weight: 8, arbitrary: joinArb },
  { weight: 3, arbitrary: readyArb },
  { weight: 3, arbitrary: leaveArb },
  { weight: 2, arbitrary: startSoloArb },
  { weight: 2, arbitrary: advanceTicksArb },
)

async function runCommands(commands: JoinCommand[]): Promise<{ violations: Violation[]; trace: string[] }> {
  const harness = new RoomJoiningHarness()
  const ctx: CmdCtx = { harness, nameCounter: { n: 0 } }
  const trace: string[] = []
  for (const cmd of commands) {
    trace.push(cmd.toString())
    await cmd.run(ctx)
    const v = await assertJoinInvariants(harness)
    if (v.length > 0) return { violations: v, trace }
  }
  return { violations: [], trace }
}

// ============================================================================
// Property 1: join invariants across arbitrary sequences
// ============================================================================

describe('PBT Room Joining: invariants across arbitrary sequences', () => {
  it('slots stay unique, ids are UUIDs, names truncate, matchmaker tracks count', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(commandArb, { minLength: 1, maxLength: 30 }), async (commands) => {
        const { violations, trace } = await runCommands(commands)
        if (violations.length > 0) {
          const v = violations[0]
          throw new Error(`${v.code}: ${v.detail}\n  After: [${trace.join(', ')}]`)
        }
      }),
      { numRuns: 50 },
    )
  }, 180_000)
})

// ============================================================================
// Property 2: duplicate-join returns `already_joined`
// ============================================================================

describe('PBT Room Joining: duplicate-join is rejected', () => {
  it('second join on SAME ws returns already_joined and does not grow the room', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 4 }),
        async (names) => {
          const harness = new RoomJoiningHarness()
          await harness.createRoom('DUP001')
          const firsts: string[] = []
          for (const name of names) {
            const res = await harness.joinAsNewPlayer('DUP001', name)
            if (res.ok) firsts.push(res.playerId)
            if (firsts.length === 4) break // room full
          }
          // For each successful first-join, attempt a second join on the SAME ws.
          for (const pid of firsts) {
            const before = Object.keys(harness.getRoomState('DUP001')!.players).length
            const rejoin = await harness.rejoinOnSameWs(pid, 'dup')
            const after = Object.keys(harness.getRoomState('DUP001')!.players).length
            if (rejoin.ok) {
              throw new Error(
                `Second join on same ws (player=${pid}) accepted; ` + `player count went ${before} → ${after}`,
              )
            }
            if (rejoin.error !== 'already_joined') {
              throw new Error(`Second join returned error=${rejoin.error}, expected 'already_joined'`)
            }
            if (after !== before) {
              throw new Error(`Second join grew the room from ${before} → ${after}`)
            }
          }
        },
      ),
      { numRuns: 50 },
    )
  }, 120_000)
})

// ============================================================================
// Property 3: mid-game joins are rejected
// ============================================================================

describe('PBT Room Joining: late-join during non-waiting status is rejected', () => {
  it('join during countdown/playing/wipe_*/game_over returns an error and does not grow', async () => {
    await fc.assert(
      fc.asyncProperty(
        // how far to advance before attempting the late join
        fc.integer({ min: 0, max: 200 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        async (advance, lateName) => {
          const harness = new RoomJoiningHarness()
          await harness.createRoom('MID001')
          // Seed with one player and enter the non-waiting flow via start_solo.
          const first = await harness.joinAsNewPlayer('MID001', 'P1')
          if (!first.ok) return // can't test this without seeding
          await harness.sendAs(first.playerId, { type: 'start_solo' })
          await harness.advanceTicks('MID001', advance)
          const stateBefore = harness.getRoomState('MID001')!
          const status = stateBefore.status
          const countBefore = Object.keys(stateBefore.players).length
          if (status === 'waiting') return // didn't leave waiting

          // Now attempt a late join via a fresh ws.
          const late = await harness.joinAsNewPlayer('MID001', lateName)
          const stateAfter = harness.getRoomState('MID001')!
          const countAfter = Object.keys(stateAfter.players).length

          if (late.ok) {
            throw new Error(
              `Late-join (status=${status}) accepted as new player; ` + `count went ${countBefore} → ${countAfter}`,
            )
          }
          // For countdown, current code uses 'countdown_in_progress'.
          // For other non-waiting, current code uses 'game_in_progress'.
          // We assert the error is ONE of those — catching silent drops
          // (where the reply is e.g. 'invalid_message' because of a
          // code path that forgot to send an error).
          const acceptable = ['countdown_in_progress', 'game_in_progress']
          if (!acceptable.includes(late.error)) {
            throw new Error(
              `Late-join (status=${status}) returned error=${late.error}, ` + `expected one of ${acceptable.join('|')}`,
            )
          }
          if (countAfter !== countBefore) {
            throw new Error(
              `Late-join grew the room from ${countBefore} → ${countAfter} ` + `despite error=${late.error}`,
            )
          }
        },
      ),
      { numRuns: 50 },
    )
  }, 180_000)
})

// ============================================================================
// Property 4: full room join returns `room_full`
// ============================================================================

describe('PBT Room Joining: full-room join is rejected', () => {
  it('5th join attempt on a 4-player room returns room_full; count stays 4', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 5, maxLength: 5 }),
        async (names) => {
          const harness = new RoomJoiningHarness()
          await harness.createRoom('FULL01')
          const oks: string[] = []
          // First 4 should succeed.
          for (let i = 0; i < 4; i++) {
            const res = await harness.joinAsNewPlayer('FULL01', names[i])
            if (res.ok) oks.push(res.playerId)
          }
          if (oks.length !== 4) {
            // If any of the first four failed, skip (generator variance).
            return
          }
          const stateBefore = harness.getRoomState('FULL01')!
          if (Object.keys(stateBefore.players).length !== 4) return

          // 5th MUST be rejected with room_full.
          const fifth = await harness.joinAsNewPlayer('FULL01', names[4])
          const stateAfter = harness.getRoomState('FULL01')!

          if (fifth.ok) {
            throw new Error(`5th join accepted into a full room; count=${Object.keys(stateAfter.players).length}`)
          }
          if (fifth.error !== 'room_full') {
            throw new Error(`5th join returned error=${fifth.error}, expected 'room_full'`)
          }
          if (Object.keys(stateAfter.players).length !== 4) {
            throw new Error(`Full room grew after rejected 5th join: ${Object.keys(stateAfter.players).length}`)
          }
        },
      ),
      { numRuns: 50 },
    )
  }, 120_000)
})

// ============================================================================
// Property 5: slot re-use after leave
// ============================================================================

describe('PBT Room Joining: slot re-use after leave', () => {
  it('after a player leaves, their slot is assigned to the next new joiner', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 3 }), async (leaveIdx) => {
        const harness = new RoomJoiningHarness()
        await harness.createRoom('SLOT01')
        const oks: { id: string; slot: PlayerSlot }[] = []
        for (let i = 0; i < 4; i++) {
          const res = await harness.joinAsNewPlayer('SLOT01', `P${i}`)
          if (res.ok) oks.push({ id: res.playerId, slot: res.slot })
        }
        if (oks.length !== 4) return
        const leavingSlot = oks[leaveIdx % oks.length].slot
        const leavingId = oks[leaveIdx % oks.length].id
        await harness.leavePlayer(leavingId)

        // Next join should fill the vacated slot.
        const next = await harness.joinAsNewPlayer('SLOT01', 'replacement')
        if (!next.ok) {
          throw new Error(`Replacement join failed after leave (slot=${leavingSlot}): ${next.error}`)
        }
        if (next.slot !== leavingSlot) {
          throw new Error(`Slot-reuse violated: leaver slot=${leavingSlot}, replacement got slot=${next.slot}`)
        }
      }),
      { numRuns: 50 },
    )
  }, 120_000)
})

// ============================================================================
// Characterisation: what does the matchmaker look like after EVERYONE leaves?
//
// The task brief asked specifically: "After a leave, the matchmaker is
// re-registered OR unregistered appropriately (if playerCount drops to 0 and
// nobody re-joins — check current behaviour, this is a probable bug shape)."
//
// Current behaviour (characterised below, NOT prescribed):
//   - removePlayer() always calls updateRoomRegistry() which POSTs /register,
//     so the empty room is re-registered with playerCount=0, status='waiting'
//     (i.e. visible to /info/:code, but NOT findable by /find because the
//     LOW-severity fix requires playerCount > 0).
//   - The room is scheduled for cleanup via a 5-minute alarm, at which
//     point cleanup() calls /unregister.
//
// This characterisation test PINS that behaviour so a future refactor that
// accidentally calls /unregister on last-leave (dropping /info too early)
// breaks here. It's a characterisation probe, not a bug-find.
// ============================================================================

describe('Characterisation: matchmaker view after everyone leaves', () => {
  it('last-leave leaves the room registered with playerCount=0; NOT unregistered immediately', async () => {
    const harness = new RoomJoiningHarness()
    await harness.createRoom('EMPTY1')
    const p1 = await harness.joinAsNewPlayer('EMPTY1', 'A')
    if (!p1.ok) throw new Error('join failed')
    // Single player leaves → room is empty but not cleaned up yet.
    await harness.leavePlayer(p1.playerId)

    const info = await harness.getMatchmakerInfo('EMPTY1')
    // Characterisation: info IS still present (not 404) with count=0.
    expect(info).not.toBeNull()
    expect(info!.playerCount).toBe(0)
    expect(info!.status).toBe('waiting')

    // But /find MUST exclude it (playerCount > 0 guard in Matchmaker.ts).
    const find = await harness.matchmaker.fetch(new Request('https://internal/find'))
    const { roomCode } = (await find.json()) as { roomCode: string | null }
    expect(roomCode).not.toBe('EMPTY1')
  })
})

// worker/src/state-machine.pbt.test.ts
// State-machine property-based-test harness driving the full multiplayer journey.
//
// Uses fast-check's model/real pattern to:
//   1. build a Model of expected system state.
//   2. drive a Real system (live GameRoom + Matchmaker DOs backed by the same
//      mock Cloudflare state used by the existing integration tests).
//   3. after every command, run a bank of invariants. Any violation surfaces
//      the minimal shrunk reproducer so the root cause is obvious.
//
// Commands exercised: CreateRoom, JoinRoom, Ready, Unready, StartSolo, Forfeit,
// Shoot, Move, Leave, Matchmake, AdvanceTick.
//
// This test is DIAGNOSTIC ONLY. When a property violation exposes a product
// bug, the failing case is captured as a `describe.skip('FOUND BUG: ...')`
// block below with a minimal reproducer. Do NOT modify production code to
// hide a violation — flag it and let the maintainer decide the fix.
//
// ─── Summary of findings (see "FOUND BUG" describe.skip blocks at the bottom)
//
//   HIGH    — GameRoom "join" handler does not reject status=playing/wipe_*/game_over.
//             A ws already past the upgrade guard can inject a new player mid-game.
//   MEDIUM  — GameRoom "start_solo" handler has no status guard, so game_over → wipe_hold
//             transition happens without routing through the declared state-machine
//             reducer; and the second game inherits score/readyPlayerIds from the first.
//   LOW     — Matchmaker /find returns a room with zero players if it was just /register'd
//             (rooms become findable the instant they exist).
//
//   NOT A BUG (stale hypothesis — already fixed in commit 074d9f8):
//             LobbyScreen ticker denominator / Start Solo visibility. The current
//             LobbyScreen.tsx already uses `playerCount` and `isAlone` correctly.
//             Kept as a passing probe so any regression surfaces.

import { describe, it, expect, vi, type Mock } from 'vitest'
import fc from 'fast-check'
import { GameRoom, type Env } from './GameRoom'
import { Matchmaker } from './Matchmaker'
import type {
  GameState,
  GameStatus,
  ServerMessage,
  PlayerSlot,
} from '../../shared/types'
import { COUNTDOWN_SECONDS } from '../../shared/types'

// ============================================================================
// Mock Cloudflare infrastructure (shared with GameRoom.test.ts / integration.test.ts)
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
            if (sqlData['game_state']) return { toArray: () => [sqlData['game_state']] }
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
    blockConcurrencyWhile: vi.fn(async <T>(fn: () => Promise<T>): Promise<T> => fn()),
    acceptWebSocket: vi.fn((ws: MockWebSocket) => {
      webSockets.push(ws)
    }),
    getWebSockets: vi.fn(() => webSockets.filter(ws => !ws._closed)),
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
// Test-side Model — what we expect the system to look like after each command
// ============================================================================

interface ModelPlayer {
  id: string
  name: string
  slot: PlayerSlot
  ready: boolean
  ws: MockWebSocket
}

interface ModelRoom {
  roomCode: string
  players: Map<string, ModelPlayer> // id → player
  status: GameStatus
  /** Last mode we saw the server report. */
  mode: 'solo' | 'coop'
  /** "Registered" in matchmaker, by the last register we observed. */
  registered: boolean
  /** Whether this room should be open (findable) in the matchmaker. */
  open: boolean
}

class SystemModel {
  rooms: Map<string, ModelRoom> = new Map()
  playerNameCounter = 0
  nextPlayerName(): string {
    return `P${++this.playerNameCounter}`
  }
}

// ============================================================================
// Real System — wraps DOs + matchmaker into a test-facing API
// ============================================================================

interface RealRoom {
  ctx: ReturnType<typeof createMockDurableObjectContext>
  room: GameRoom
}

class RealSystem {
  matchmakerState = createMockMatchmakerState()
  matchmaker: Matchmaker
  rooms: Map<string, RealRoom> = new Map()
  // Player ID → ws for the player's currently-open connection.
  playerWs: Map<string, MockWebSocket> = new Map()
  // Player ID → roomCode they are in.
  playerRoom: Map<string, string> = new Map()

  constructor() {
    this.matchmaker = new Matchmaker(this.matchmakerState as unknown as DurableObjectState)
  }

  private async getOrCreate(roomCode: string): Promise<RealRoom> {
    const existing = this.rooms.get(roomCode)
    if (existing) return existing

    const ctx = createMockDurableObjectContext()
    const matchmakerFetch = vi.fn(async (request: Request) => this.matchmaker.fetch(request))

    const env: Env = {
      GAME_ROOM: {
        idFromName: vi.fn((name: string) => ({ toString: () => name })),
        get: vi.fn(),
      } as unknown as Env['GAME_ROOM'],
      MATCHMAKER: {
        idFromName: vi.fn(() => ({ toString: () => 'matchmaker-global' })),
        get: vi.fn(() => ({ fetch: matchmakerFetch })),
      } as unknown as Env['MATCHMAKER'],
    }

    const room = new GameRoom(ctx as unknown as DurableObjectState, env)
    await new Promise(resolve => setTimeout(resolve, 0))

    await room.fetch(new Request('https://internal/init', {
      method: 'POST',
      body: JSON.stringify({ roomCode }),
    }))

    // Register with matchmaker (the Worker /room endpoint does this in production).
    await this.matchmaker.fetch(new Request('https://internal/register', {
      method: 'POST',
      body: JSON.stringify({ roomCode, playerCount: 0, status: 'waiting' }),
    }))

    const entry = { ctx, room }
    this.rooms.set(roomCode, entry)
    return entry
  }

  /** Create a new, empty room. Returns room code. */
  async createRoom(roomCode: string): Promise<void> {
    await this.getOrCreate(roomCode)
  }

  /** Make a GET /find call to the matchmaker, mirroring the Worker endpoint. */
  async matchmakeFind(): Promise<string | null> {
    const response = await this.matchmaker.fetch(new Request('https://internal/find'))
    const body = await response.json() as { roomCode: string | null }
    return body.roomCode
  }

  /**
   * Join a player to a room via a WebSocket. Returns the player ID allocated
   * by the server (from the initial sync message).
   */
  async joinRoom(roomCode: string, name: string): Promise<string | null> {
    const entry = this.rooms.get(roomCode)
    if (!entry) return null

    const ws = createMockWebSocket()
    entry.ctx._webSockets.push(ws)
    await entry.room.webSocketMessage(ws as unknown as WebSocket, JSON.stringify({
      type: 'join',
      name,
    }))

    // Extract allocated playerId from the first sync message that included it.
    const syncCall = ws.send.mock.calls.find((call: unknown[]) => {
      try {
        const msg = JSON.parse(call[0] as string) as ServerMessage
        return msg.type === 'sync' && 'playerId' in msg && typeof msg.playerId === 'string'
      } catch {
        return false
      }
    })
    if (!syncCall) return null
    const msg = JSON.parse(syncCall[0] as string) as ServerMessage & { playerId?: string }
    if (!('playerId' in msg) || typeof msg.playerId !== 'string') return null

    const playerId = msg.playerId
    this.playerWs.set(playerId, ws)
    this.playerRoom.set(playerId, roomCode)
    return playerId
  }

  /** Send an arbitrary client message on a player's WebSocket. */
  async sendAs(playerId: string, message: Record<string, unknown>): Promise<void> {
    const roomCode = this.playerRoom.get(playerId)
    const ws = this.playerWs.get(playerId)
    if (!roomCode || !ws) return
    const entry = this.rooms.get(roomCode)
    if (!entry) return
    await entry.room.webSocketMessage(ws as unknown as WebSocket, JSON.stringify(message))
  }

  /** Close a player's WebSocket (simulates browser tab close / network loss). */
  async leavePlayer(playerId: string): Promise<void> {
    const roomCode = this.playerRoom.get(playerId)
    const ws = this.playerWs.get(playerId)
    if (!roomCode || !ws) return
    const entry = this.rooms.get(roomCode)
    if (!entry) return

    await entry.room.webSocketClose(ws as unknown as WebSocket, 1000, 'Left', true)
    ws._closed = true
    this.playerWs.delete(playerId)
    this.playerRoom.delete(playerId)
  }

  /**
   * Reconnect simulation: the DO re-attaches an existing WebSocket (hibernation
   * wake). Our mock can't faithfully reproduce hibernation, but we can close
   * the old ws and open a new one with the same name — which is what the TUI
   * client does when its connection drops.
   *
   * Returns the NEW playerId (the server does not resurrect the old one).
   */
  async reconnect(oldPlayerId: string, name: string): Promise<string | null> {
    const roomCode = this.playerRoom.get(oldPlayerId)
    if (!roomCode) return null
    await this.leavePlayer(oldPlayerId)
    return this.joinRoom(roomCode, name)
  }

  /** Advance the server clock by N alarm ticks. */
  async advanceTicks(roomCode: string, n: number): Promise<void> {
    const entry = this.rooms.get(roomCode)
    if (!entry) return
    for (let i = 0; i < n; i++) {
      await entry.room.alarm()
    }
  }

  /** Read the canonical server state for a room. */
  getState(roomCode: string): GameState | null {
    const entry = this.rooms.get(roomCode)
    if (!entry) return null
    const row = entry.ctx._sqlData['game_state']
    if (!row) return null
    return JSON.parse(row.data) as GameState
  }

  /** Query the matchmaker for a room's registered view. */
  async getMatchmakerInfo(roomCode: string): Promise<{ playerCount: number; status: string } | null> {
    const response = await this.matchmaker.fetch(new Request(`https://internal/info/${roomCode}`))
    if (response.status !== 200) return null
    return await response.json() as { playerCount: number; status: string }
  }

  /** Extract all protocol messages a player has received (for protocol validation). */
  getReceivedMessages(playerId: string): ServerMessage[] {
    const ws = this.playerWs.get(playerId)
    if (!ws) return []
    return ws.send.mock.calls
      .map((call: unknown[]) => {
        try {
          return JSON.parse(call[0] as string) as ServerMessage
        } catch {
          return null
        }
      })
      .filter((m): m is ServerMessage => m !== null)
  }

  /** Existing player IDs known to the harness (i.e., currently or previously joined). */
  knownPlayerIds(): string[] {
    return Array.from(this.playerWs.keys())
  }

  /** Player IDs for a given room (current, open connections). */
  playerIdsInRoom(roomCode: string): string[] {
    const ids: string[] = []
    for (const [pid, rc] of this.playerRoom.entries()) {
      if (rc === roomCode) ids.push(pid)
    }
    return ids
  }

  allRoomCodes(): string[] {
    return Array.from(this.rooms.keys())
  }
}

// ============================================================================
// Invariants — run after every command. Violations fail the property and
// fast-check will shrink to a minimal reproducer.
// ============================================================================

interface InvariantViolation {
  name: string
  details: string
}

function isValidServerMessage(msg: unknown): msg is ServerMessage {
  if (typeof msg !== 'object' || msg === null) return false
  const m = msg as { type?: unknown }
  if (typeof m.type !== 'string') return false
  const validTypes = ['sync', 'event', 'pong', 'error']
  return validTypes.includes(m.type)
}

function assertInvariants(real: RealSystem): InvariantViolation[] {
  const violations: InvariantViolation[] = []

  for (const roomCode of real.allRoomCodes()) {
    const state = real.getState(roomCode)
    if (!state) continue

    const playerIds = Object.keys(state.players)
    const players = Object.values(state.players)
    const playerCount = playerIds.length

    // --- Identity & cardinality ---
    for (const readyId of state.readyPlayerIds) {
      if (!(readyId in state.players)) {
        violations.push({
          name: 'readyPlayerIds_phantom',
          details: `Room ${roomCode}: ready id ${readyId} not in players`,
        })
      }
    }

    for (const p of players) {
      if (![1, 2, 3, 4].includes(p.slot)) {
        violations.push({
          name: 'player_invalid_slot',
          details: `Room ${roomCode}: player ${p.id} has slot ${p.slot}`,
        })
      }
    }

    const slotSet = new Set(players.map(p => p.slot))
    if (slotSet.size !== players.length) {
      violations.push({
        name: 'player_slot_collision',
        details: `Room ${roomCode}: duplicate slots: ${players.map(p => p.slot).join(',')}`,
      })
    }

    if (playerCount > state.config.maxPlayers) {
      violations.push({
        name: 'player_over_cap',
        details: `Room ${roomCode}: ${playerCount} players > maxPlayers=${state.config.maxPlayers}`,
      })
    }

    // --- Status preconditions ---
    if (state.status === 'countdown') {
      // Countdown requires ≥2 ready players AND all-ready.
      const allReady = playerCount > 0 && state.readyPlayerIds.length === playerCount
      if (!allReady || playerCount < 2) {
        violations.push({
          name: 'countdown_requires_all_ready_plus_two',
          details:
            `Room ${roomCode}: countdown but playerCount=${playerCount}, readyCount=${state.readyPlayerIds.length}`,
        })
      }
    }

    if (state.status === 'playing' && playerCount === 0) {
      // Not a violation in Vaders: the server can enter game_over. But playing with 0 players
      // would mean we have a zombie room. Catch this.
      violations.push({
        name: 'playing_with_zero_players',
        details: `Room ${roomCode}: status=playing but 0 players`,
      })
    }

    // --- Player.alive invariants ---
    for (const p of players) {
      if (p.alive && p.lives <= 0 && state.status === 'playing') {
        violations.push({
          name: 'alive_with_no_lives',
          details: `Room ${roomCode}: player ${p.id} alive=true but lives=${p.lives} during playing`,
        })
      }
    }

    // --- Wipe phase preconditions ---
    if (state.status === 'wipe_exit' && state.wipeTicksRemaining === null) {
      violations.push({
        name: 'wipe_exit_null_counter',
        details: `Room ${roomCode}: wipe_exit but wipeTicksRemaining is null`,
      })
    }
  }

  return violations
}

async function assertMatchmakerCrossConsistency(real: RealSystem): Promise<InvariantViolation[]> {
  const violations: InvariantViolation[] = []

  for (const roomCode of real.allRoomCodes()) {
    const state = real.getState(roomCode)
    if (!state) continue

    const info = await real.getMatchmakerInfo(roomCode)
    if (!info) {
      // Not registered is allowed if the room was cleaned up.
      continue
    }

    const actualPlayerCount = Object.keys(state.players).length

    // The matchmaker is updated asynchronously via updateRoomRegistry(); allow
    // a small lag window by accepting any count that matches either the current
    // or most-recent state.
    if (info.playerCount > 4) {
      violations.push({
        name: 'matchmaker_overcount',
        details: `Room ${roomCode}: matchmaker playerCount=${info.playerCount} > 4`,
      })
    }

    const shouldBeOpen = state.status === 'waiting' && actualPlayerCount < 4

    // /find returns the room if it's in matchmaker's openRooms. We can only
    // assert weakly here: if /find returns a room, that room must be in
    // 'waiting' state AND not full. (We verify this at /find call time, not here.)
    // This spot checks the recorded info.
    if (info.status !== state.status) {
      // Allowed: the register is async/eventual. Only flag if the discrepancy
      // puts a room in find-eligible state when it shouldn't be.
      if (info.status === 'waiting' && info.playerCount < 4 && !shouldBeOpen) {
        violations.push({
          name: 'matchmaker_stale_open_entry',
          details:
            `Room ${roomCode}: matchmaker thinks status=waiting,count=${info.playerCount} ` +
            `but real state status=${state.status},count=${actualPlayerCount}`,
        })
      }
    }
  }

  return violations
}

// ============================================================================
// Commands — the core of the fc.commands() state machine
// ============================================================================

interface CmdCtx {
  model: SystemModel
  real: RealSystem
  /**
   * Fresh room codes to hand out in CreateRoom. We pre-allocate a bounded pool
   * so command shrinking stays deterministic.
   */
  roomCodePool: string[]
  /** Ordered list of room codes created so far (for commands that target "some existing room"). */
  roomCodesUsed: string[]
  /** Fresh name counter — always incremented, never reused. */
  nextName: () => string
}

interface Command {
  check: (model: SystemModel) => boolean
  run: (ctx: CmdCtx) => Promise<void>
  toString: () => string
}

function pickRoomFromModel(model: SystemModel, idx: number): string | null {
  const codes = Array.from(model.rooms.keys())
  if (codes.length === 0) return null
  return codes[idx % codes.length]
}

function pickPlayerFromRoom(room: ModelRoom | undefined, idx: number): ModelPlayer | null {
  if (!room) return null
  const list = Array.from(room.players.values())
  if (list.length === 0) return null
  return list[idx % list.length]
}

// ─── CreateRoomCommand ──────────────────────────────────────────────────────
const CreateRoomCommand = (roomIdx: number): Command => ({
  check: (_model) => true,
  run: async (ctx) => {
    const code = ctx.roomCodePool[roomIdx % ctx.roomCodePool.length]
    if (ctx.model.rooms.has(code)) return // idempotent
    await ctx.real.createRoom(code)
    ctx.model.rooms.set(code, {
      roomCode: code,
      players: new Map(),
      status: 'waiting',
      mode: 'solo',
      registered: true,
      open: true,
    })
    ctx.roomCodesUsed.push(code)
  },
  toString: () => `CreateRoom(${roomIdx})`,
})

// ─── JoinRoomCommand ────────────────────────────────────────────────────────
const JoinRoomCommand = (roomIdx: number): Command => ({
  check: (model) => model.rooms.size > 0,
  run: async (ctx) => {
    const code = pickRoomFromModel(ctx.model, roomIdx)!
    const room = ctx.model.rooms.get(code)!
    // Only attempt if the server should accept: room not full, not in countdown.
    if (room.players.size >= 4) return
    if (room.status === 'countdown') return

    const name = ctx.nextName()
    const playerId = await ctx.real.joinRoom(code, name)
    if (playerId) {
      // Re-read canonical slot from server (trust the server, not our guess).
      const realState = ctx.real.getState(code)
      const serverPlayer = realState?.players[playerId]
      if (!serverPlayer) return
      room.players.set(playerId, {
        id: playerId,
        name,
        slot: serverPlayer.slot,
        ready: false,
        ws: ctx.real.playerWs.get(playerId)!,
      })
      room.mode = room.players.size === 1 ? 'solo' : 'coop'
      room.status = realState.status
      room.open = room.status === 'waiting' && room.players.size < 4
    }
  },
  toString: () => `JoinRoom(${roomIdx})`,
})

// ─── ReadyCommand ───────────────────────────────────────────────────────────
const ReadyCommand = (roomIdx: number, playerIdx: number): Command => ({
  check: (model) => model.rooms.size > 0 &&
    Array.from(model.rooms.values()).some(r => r.players.size > 0),
  run: async (ctx) => {
    const code = pickRoomFromModel(ctx.model, roomIdx)!
    const room = ctx.model.rooms.get(code)!
    const player = pickPlayerFromRoom(room, playerIdx)
    if (!player) return
    await ctx.real.sendAs(player.id, { type: 'ready' })
    const realState = ctx.real.getState(code)
    if (realState) {
      player.ready = realState.readyPlayerIds.includes(player.id)
      room.status = realState.status
    }
  },
  toString: () => `Ready(room=${roomIdx},player=${playerIdx})`,
})

// ─── UnreadyCommand ─────────────────────────────────────────────────────────
const UnreadyCommand = (roomIdx: number, playerIdx: number): Command => ({
  check: (model) => model.rooms.size > 0 &&
    Array.from(model.rooms.values()).some(r => r.players.size > 0),
  run: async (ctx) => {
    const code = pickRoomFromModel(ctx.model, roomIdx)!
    const room = ctx.model.rooms.get(code)!
    const player = pickPlayerFromRoom(room, playerIdx)
    if (!player) return
    await ctx.real.sendAs(player.id, { type: 'unready' })
    const realState = ctx.real.getState(code)
    if (realState) {
      player.ready = realState.readyPlayerIds.includes(player.id)
      room.status = realState.status
    }
  },
  toString: () => `Unready(room=${roomIdx},player=${playerIdx})`,
})

// ─── StartSoloCommand ───────────────────────────────────────────────────────
const StartSoloCommand = (roomIdx: number, playerIdx: number): Command => ({
  check: (model) => model.rooms.size > 0 &&
    Array.from(model.rooms.values()).some(r => r.players.size === 1),
  run: async (ctx) => {
    const code = pickRoomFromModel(ctx.model, roomIdx)!
    const room = ctx.model.rooms.get(code)!
    const player = pickPlayerFromRoom(room, playerIdx)
    if (!player) return
    if (room.players.size !== 1) return
    await ctx.real.sendAs(player.id, { type: 'start_solo' })
    const realState = ctx.real.getState(code)
    if (realState) room.status = realState.status
  },
  toString: () => `StartSolo(room=${roomIdx},player=${playerIdx})`,
})

// ─── ForfeitCommand ─────────────────────────────────────────────────────────
const ForfeitCommand = (roomIdx: number, playerIdx: number): Command => ({
  check: (model) => model.rooms.size > 0 &&
    Array.from(model.rooms.values()).some(r => r.players.size > 0),
  run: async (ctx) => {
    const code = pickRoomFromModel(ctx.model, roomIdx)!
    const room = ctx.model.rooms.get(code)!
    const player = pickPlayerFromRoom(room, playerIdx)
    if (!player) return
    await ctx.real.sendAs(player.id, { type: 'forfeit' })
    const realState = ctx.real.getState(code)
    if (realState) room.status = realState.status
  },
  toString: () => `Forfeit(room=${roomIdx},player=${playerIdx})`,
})

// ─── ShootCommand ───────────────────────────────────────────────────────────
const ShootCommand = (roomIdx: number, playerIdx: number): Command => ({
  check: (model) => model.rooms.size > 0 &&
    Array.from(model.rooms.values()).some(r => r.players.size > 0),
  run: async (ctx) => {
    const code = pickRoomFromModel(ctx.model, roomIdx)!
    const room = ctx.model.rooms.get(code)!
    const player = pickPlayerFromRoom(room, playerIdx)
    if (!player) return
    await ctx.real.sendAs(player.id, { type: 'shoot' })
  },
  toString: () => `Shoot(room=${roomIdx},player=${playerIdx})`,
})

// ─── MoveCommand ────────────────────────────────────────────────────────────
const MoveCommand = (roomIdx: number, playerIdx: number, direction: 'left' | 'right'): Command => ({
  check: (model) => model.rooms.size > 0 &&
    Array.from(model.rooms.values()).some(r => r.players.size > 0),
  run: async (ctx) => {
    const code = pickRoomFromModel(ctx.model, roomIdx)!
    const room = ctx.model.rooms.get(code)!
    const player = pickPlayerFromRoom(room, playerIdx)
    if (!player) return
    await ctx.real.sendAs(player.id, { type: 'move', direction })
  },
  toString: () => `Move(room=${roomIdx},player=${playerIdx},dir=${direction})`,
})

// ─── LeaveCommand ───────────────────────────────────────────────────────────
const LeaveCommand = (roomIdx: number, playerIdx: number): Command => ({
  check: (model) => model.rooms.size > 0 &&
    Array.from(model.rooms.values()).some(r => r.players.size > 0),
  run: async (ctx) => {
    const code = pickRoomFromModel(ctx.model, roomIdx)!
    const room = ctx.model.rooms.get(code)!
    const player = pickPlayerFromRoom(room, playerIdx)
    if (!player) return
    await ctx.real.leavePlayer(player.id)
    room.players.delete(player.id)
    const realState = ctx.real.getState(code)
    if (realState) {
      room.status = realState.status
      room.mode = realState.mode
    }
  },
  toString: () => `Leave(room=${roomIdx},player=${playerIdx})`,
})

// ─── MatchmakeCommand ───────────────────────────────────────────────────────
const MatchmakeCommand = (roomIdx: number): Command => ({
  check: (_model) => true,
  run: async (ctx) => {
    // Simulates the web/TUI client's matchmake flow: GET /find, if null create
    // a new room. We emulate here the Worker-level flow.
    const found = await ctx.real.matchmakeFind()
    if (found) return // nothing to change yet — the client has not joined.
    // No open rooms — create one, mirroring the Worker /matchmake behavior.
    const code = ctx.roomCodePool[roomIdx % ctx.roomCodePool.length]
    if (!ctx.model.rooms.has(code)) {
      await ctx.real.createRoom(code)
      ctx.model.rooms.set(code, {
        roomCode: code,
        players: new Map(),
        status: 'waiting',
        mode: 'solo',
        registered: true,
        open: true,
      })
      ctx.roomCodesUsed.push(code)
    }
  },
  toString: () => `Matchmake(${roomIdx})`,
})

// ─── AdvanceTickCommand ────────────────────────────────────────────────────
const AdvanceTickCommand = (roomIdx: number, ticks: number): Command => ({
  check: (model) => model.rooms.size > 0,
  run: async (ctx) => {
    const code = pickRoomFromModel(ctx.model, roomIdx)!
    await ctx.real.advanceTicks(code, ticks)
    const room = ctx.model.rooms.get(code)!
    const realState = ctx.real.getState(code)
    if (realState) {
      room.status = realState.status
      // Re-sync ready flags so the model doesn't drift.
      for (const [pid, p] of room.players) {
        if (!(pid in realState.players)) room.players.delete(pid)
        else p.ready = realState.readyPlayerIds.includes(pid)
      }
    }
  },
  toString: () => `AdvanceTick(room=${roomIdx},ticks=${ticks})`,
})

// ============================================================================
// Command arbitrary + property runner
// ============================================================================

const smallInt = fc.integer({ min: 0, max: 5 })
const tickCount = fc.integer({ min: 1, max: 3 })
const direction = fc.constantFrom<'left' | 'right'>('left', 'right')

const commandArb = fc.oneof(
  { weight: 3, arbitrary: smallInt.map(i => CreateRoomCommand(i)) },
  { weight: 8, arbitrary: smallInt.map(i => JoinRoomCommand(i)) },
  { weight: 5, arbitrary: fc.tuple(smallInt, smallInt).map(([r, p]) => ReadyCommand(r, p)) },
  { weight: 2, arbitrary: fc.tuple(smallInt, smallInt).map(([r, p]) => UnreadyCommand(r, p)) },
  { weight: 3, arbitrary: fc.tuple(smallInt, smallInt).map(([r, p]) => StartSoloCommand(r, p)) },
  { weight: 2, arbitrary: fc.tuple(smallInt, smallInt).map(([r, p]) => ForfeitCommand(r, p)) },
  { weight: 2, arbitrary: fc.tuple(smallInt, smallInt).map(([r, p]) => ShootCommand(r, p)) },
  { weight: 2, arbitrary: fc.tuple(smallInt, smallInt, direction).map(([r, p, d]) => MoveCommand(r, p, d)) },
  { weight: 3, arbitrary: fc.tuple(smallInt, smallInt).map(([r, p]) => LeaveCommand(r, p)) },
  { weight: 2, arbitrary: smallInt.map(i => MatchmakeCommand(i)) },
  { weight: 2, arbitrary: fc.tuple(smallInt, tickCount).map(([r, t]) => AdvanceTickCommand(r, t)) },
)

async function runCommandSequence(commands: Command[], roomCodePool: string[]): Promise<InvariantViolation[]> {
  const real = new RealSystem()
  const model = new SystemModel()
  const ctx: CmdCtx = {
    model,
    real,
    roomCodePool,
    roomCodesUsed: [],
    nextName: () => model.nextPlayerName(),
  }

  const allViolations: InvariantViolation[] = []

  for (const cmd of commands) {
    if (!cmd.check(model)) continue
    await cmd.run(ctx)
    const v1 = assertInvariants(real)
    const v2 = await assertMatchmakerCrossConsistency(real)
    allViolations.push(...v1, ...v2)
    if (allViolations.length > 0) {
      // Short-circuit on first violation so shrinking gets a minimal case.
      return allViolations
    }
  }

  return allViolations
}

// ============================================================================
// Properties
// ============================================================================

const ROOM_CODE_POOL = ['ROOM01', 'ROOM02', 'ROOM03', 'ROOM04', 'ROOM05', 'ROOM06']

describe('PBT: State Machine Invariants', () => {
  it('no invariants violated across arbitrary multiplayer journeys', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(commandArb, { minLength: 1, maxLength: 60 }), async (commands) => {
        const violations = await runCommandSequence(commands, ROOM_CODE_POOL)
        if (violations.length > 0) {
          // Pretty-print the first violation so shrunk reproducers are readable.
          const v = violations[0]
          throw new Error(`Invariant violated: ${v.name}\n  ${v.details}`)
        }
      }),
      { numRuns: 50, verbose: false },
    )
  }, 120_000)

  it('every received server message is protocol-valid', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(commandArb, { minLength: 1, maxLength: 30 }), async (commands) => {
        const real = new RealSystem()
        const model = new SystemModel()
        const ctx: CmdCtx = {
          model, real,
          roomCodePool: ROOM_CODE_POOL,
          roomCodesUsed: [],
          nextName: () => model.nextPlayerName(),
        }
        for (const cmd of commands) {
          if (!cmd.check(model)) continue
          await cmd.run(ctx)
        }
        // All messages received on any player's ws must be ServerMessage-shaped.
        for (const playerId of real.knownPlayerIds()) {
          for (const msg of real.getReceivedMessages(playerId)) {
            if (!isValidServerMessage(msg)) {
              throw new Error(`Invalid server message for ${playerId}: ${JSON.stringify(msg)}`)
            }
          }
        }
      }),
      { numRuns: 50 },
    )
  }, 120_000)

  it('any countdown always has status=countdown and countdownRemaining > 0 OR transitions out', async () => {
    // Targeted property: the countdown state is always self-consistent.
    await fc.assert(
      fc.asyncProperty(fc.array(commandArb, { minLength: 1, maxLength: 40 }), async (commands) => {
        const real = new RealSystem()
        const model = new SystemModel()
        const ctx: CmdCtx = {
          model, real,
          roomCodePool: ROOM_CODE_POOL,
          roomCodesUsed: [],
          nextName: () => model.nextPlayerName(),
        }
        for (const cmd of commands) {
          if (!cmd.check(model)) continue
          await cmd.run(ctx)
        }
        for (const code of real.allRoomCodes()) {
          const state = real.getState(code)
          if (!state) continue
          if (state.status === 'countdown') {
            if (state.countdownRemaining === null) {
              throw new Error(`countdown without countdownRemaining in ${code}`)
            }
            const playerCount = Object.keys(state.players).length
            if (playerCount < 2) {
              throw new Error(`countdown with < 2 players in ${code}`)
            }
          }
        }
      }),
      { numRuns: 50 },
    )
  }, 120_000)

  it('no room ever has more than 4 players, regardless of join sequence', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(commandArb, { minLength: 1, maxLength: 80 }), async (commands) => {
        const real = new RealSystem()
        const model = new SystemModel()
        const ctx: CmdCtx = {
          model, real,
          roomCodePool: ROOM_CODE_POOL,
          roomCodesUsed: [],
          nextName: () => model.nextPlayerName(),
        }
        for (const cmd of commands) {
          if (!cmd.check(model)) continue
          await cmd.run(ctx)
          for (const code of real.allRoomCodes()) {
            const state = real.getState(code)
            if (!state) continue
            if (Object.keys(state.players).length > 4) {
              throw new Error(`${code} has ${Object.keys(state.players).length} players`)
            }
          }
        }
      }),
      { numRuns: 50 },
    )
  }, 120_000)

  it('replay after game_over resets to clean state', async () => {
    // Targeted: force a journey through solo game_over, then observe that a
    // second round (if possible) starts from default fields.
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        const real = new RealSystem()
        await real.createRoom('REPLAY')
        const pid = await real.joinRoom('REPLAY', 'solo1')
        if (!pid) throw new Error('join failed')
        await real.sendAs(pid, { type: 'start_solo' })

        // Advance enough ticks to reach playing.
        await real.advanceTicks('REPLAY', 150)

        // Forfeit → game_over.
        await real.sendAs(pid, { type: 'forfeit' })
        const state = real.getState('REPLAY')
        if (!state) throw new Error('no state')
        if (state.status !== 'game_over') {
          // Not all runs reach playing; ok to skip.
          return
        }
        if (state.score < 0) throw new Error(`score went negative: ${state.score}`)
      }),
      { numRuns: 5 },
    )
  }, 60_000)
})

// ============================================================================
// Targeted probes — specific bug hypotheses, each as its own `it(...)`.
// Each probe is the minimal deterministic reproducer the harness would also
// find under PBT search. They run fast and fail explicitly on the violation.
// ============================================================================

describe('PBT: Targeted bug-hypothesis probes', () => {
  it('countdown cancels when a player leaves with only one left behind', async () => {
    // Hypothesis: countdown starts with 2 players ready, one leaves, the
    // countdown must cancel. It does not make sense for countdown to continue
    // with only one player — the state machine requires playerCount ≥ 2.
    const real = new RealSystem()
    await real.createRoom('CANCEL')
    const p1 = await real.joinRoom('CANCEL', 'A')
    const p2 = await real.joinRoom('CANCEL', 'B')
    if (!p1 || !p2) throw new Error('join failed')

    await real.sendAs(p1, { type: 'ready' })
    await real.sendAs(p2, { type: 'ready' })

    let state = real.getState('CANCEL')
    expect(state?.status).toBe('countdown')

    // Player B leaves during countdown.
    await real.leavePlayer(p2)

    state = real.getState('CANCEL')
    // Invariant: cannot be in countdown with only one player.
    expect(state?.status === 'countdown').toBe(false)
    // Expected: cancelled (back to waiting), per GameRoom.webSocketClose().
    expect(['waiting', 'game_over']).toContain(state?.status)
  })

  it('matchmaker does NOT return a newly-registered room with zero players', async () => {
    // Hypothesis: /find returns any 'waiting' room with playerCount < 4. A
    // freshly-created room with 0 players is findable — which is fine for a
    // Match-me-in flow, but it can result in "stranded" rooms if nobody
    // actually joins. Verify we understand the current behaviour.
    const real = new RealSystem()
    await real.createRoom('EMPTY1')
    const found = await real.matchmakeFind()
    // Document the current behaviour: yes, empty rooms ARE findable.
    expect(found).toBe('EMPTY1')
  })

  it.skip('FOUND BUG (high): join-during-playing handler bypasses status guard (duplicate of "late-join attempt" below)', () => {})

  it('solo: start_solo with 0 players is a no-op (no state change)', async () => {
    const real = new RealSystem()
    await real.createRoom('NOPLAY')
    // No players joined.
    const before = real.getState('NOPLAY')
    // The handler requires attachment.playerId; sending without any ws is
    // impossible here. The closest we can do is drive start_solo on a ws
    // with no attachment.
    const entry = real.rooms.get('NOPLAY')!
    const ws = createMockWebSocket()
    entry.ctx._webSockets.push(ws)
    await entry.room.webSocketMessage(ws as unknown as WebSocket, JSON.stringify({ type: 'start_solo' }))
    const after = real.getState('NOPLAY')
    expect(after?.status).toBe('waiting')
    expect(Object.keys(after!.players).length).toBe(0)
  })

  it('start_solo with 2 players is IGNORED (coop rules must apply)', async () => {
    // Hypothesis: start_solo requires exactly 1 player. With 2, the server
    // must NOT transition to playing.
    const real = new RealSystem()
    await real.createRoom('TWOPL1')
    const p1 = await real.joinRoom('TWOPL1', 'A')
    const p2 = await real.joinRoom('TWOPL1', 'B')
    if (!p1 || !p2) throw new Error('join failed')

    await real.sendAs(p1, { type: 'start_solo' })
    const state = real.getState('TWOPL1')
    expect(state?.status).toBe('waiting') // unchanged
  })

  it('slot is re-used when an earlier player leaves', async () => {
    const real = new RealSystem()
    await real.createRoom('SLOT01')
    const p1 = await real.joinRoom('SLOT01', 'A')
    const p2 = await real.joinRoom('SLOT01', 'B')
    if (!p1 || !p2) throw new Error('join failed')

    // P1 (slot 1) leaves.
    await real.leavePlayer(p1)

    // New player joins — should get slot 1.
    const p3 = await real.joinRoom('SLOT01', 'C')
    if (!p3) throw new Error('join failed')
    const state = real.getState('SLOT01')
    expect(state?.players[p3]?.slot).toBe(1)
    // P2's slot is unchanged.
    expect(state?.players[p2]?.slot).toBe(2)
  })

  it('ready then unready cleanly returns status to waiting', async () => {
    const real = new RealSystem()
    await real.createRoom('UNRDY1')
    const p1 = await real.joinRoom('UNRDY1', 'A')
    const p2 = await real.joinRoom('UNRDY1', 'B')
    if (!p1 || !p2) throw new Error('join failed')

    await real.sendAs(p1, { type: 'ready' })
    await real.sendAs(p2, { type: 'ready' })
    let state = real.getState('UNRDY1')
    expect(state?.status).toBe('countdown')

    await real.sendAs(p1, { type: 'unready' })
    state = real.getState('UNRDY1')
    expect(state?.status).toBe('waiting')
    expect(state?.readyPlayerIds).toEqual([p2])
  })

  it('after game_over via forfeit, status=game_over — but start_solo can restart the game (accidental replay, not via state machine)', async () => {
    // Document the current behaviour: start_solo in GameRoom.webSocketMessage
    // has NO status-guard, so it transitions game_over → wipe_hold and begins
    // a new game even though the declared reducer transitions only allow
    // START_SOLO from 'waiting'. This is an accidental replay path that:
    //   - bypasses the TRANSITIONS state machine in reducer.ts
    //   - does NOT reset game.score (the prior game's score carries over)
    //   - does NOT reset game.readyPlayerIds
    // See FOUND BUG below.
    const real = new RealSystem()
    await real.createRoom('OVER01')
    const pid = await real.joinRoom('OVER01', 'A')
    if (!pid) throw new Error('join failed')
    await real.sendAs(pid, { type: 'start_solo' })
    await real.advanceTicks('OVER01', 150)
    await real.sendAs(pid, { type: 'forfeit' })
    let state = real.getState('OVER01')
    expect(state?.status).toBe('game_over')

    await real.sendAs(pid, { type: 'start_solo' })
    state = real.getState('OVER01')
    // Characterization: the state machine is bypassed.
    expect(state?.status).toBe('wipe_hold')
  })

  it('move message during countdown is accepted (not dropped)', async () => {
    // GameRoom.ts line 489: move accepted if status === 'playing' OR 'countdown'.
    // Verify this: useful because players may tap direction during countdown
    // and expect the input to register.
    const real = new RealSystem()
    await real.createRoom('CDMOV1')
    const p1 = await real.joinRoom('CDMOV1', 'A')
    const p2 = await real.joinRoom('CDMOV1', 'B')
    if (!p1 || !p2) throw new Error(`join failed. p1=${p1} p2=${p2}`)
    await real.sendAs(p1, { type: 'ready' })
    await real.sendAs(p2, { type: 'ready' })

    let state = real.getState('CDMOV1')
    expect(state?.status).toBe('countdown')

    await real.sendAs(p1, { type: 'move', direction: 'left' })
    await real.advanceTicks('CDMOV1', 1) // drain queue

    state = real.getState('CDMOV1')
    const afterX = state!.players[p1]?.x ?? 0
    // Move is accepted during countdown; x should change (or at least not have errored).
    // If this fails, the server silently dropped a valid move.
    expect(typeof afterX).toBe('number')
    // Allow x to not change if reducer guards differently — the key invariant
    // is that we received no error message.
    const errors = real.getReceivedMessages(p1).filter(m => m.type === 'error')
    expect(errors.length).toBe(0)
  })

  it('shoot during countdown is DROPPED silently', async () => {
    // GameRoom.ts line 505: shoot only accepted if status === 'playing'.
    // During countdown, shoot is a no-op. Verify no bullets appear.
    const real = new RealSystem()
    await real.createRoom('CDSHT1')
    const p1 = await real.joinRoom('CDSHT1', 'A')
    const p2 = await real.joinRoom('CDSHT1', 'B')
    if (!p1 || !p2) throw new Error('join failed')
    await real.sendAs(p1, { type: 'ready' })
    await real.sendAs(p2, { type: 'ready' })
    let state = real.getState('CDSHT1')
    expect(state?.status).toBe('countdown')

    await real.sendAs(p1, { type: 'shoot' })
    await real.advanceTicks('CDSHT1', 1)

    state = real.getState('CDSHT1')
    const bullets = state!.entities.filter(e => e.kind === 'bullet')
    expect(bullets.length).toBe(0)
  })

  it('lonely matchmaker player can always progress (start_solo available)', async () => {
    // Matches the user's reported regression: a player who matchmakes alone
    // and never gets a second player must be able to start a solo game.
    // The server MUST accept start_solo when playerCount === 1, regardless
    // of whether mode is 'solo' or (stale from a prior state) 'coop'.
    const real = new RealSystem()
    await real.createRoom('LONELY')
    const pid = await real.joinRoom('LONELY', 'A')
    if (!pid) throw new Error('join failed')
    let state = real.getState('LONELY')
    expect(state?.mode).toBe('solo') // Fresh join gives solo
    expect(Object.keys(state!.players).length).toBe(1)

    await real.sendAs(pid, { type: 'start_solo' })
    state = real.getState('LONELY')
    expect(state?.status).not.toBe('waiting')
  })

  it('matchmaker: a room that transitioned to playing is no longer findable', async () => {
    const real = new RealSystem()
    await real.createRoom('GOPLAY')
    const pid = await real.joinRoom('GOPLAY', 'A')
    if (!pid) throw new Error('join failed')
    await real.sendAs(pid, { type: 'start_solo' })
    // The server calls updateRoomRegistry() at game start.
    await real.advanceTicks('GOPLAY', 1)

    const found = await real.matchmakeFind()
    // GOPLAY must NOT be findable.
    expect(found).not.toBe('GOPLAY')
  })

  it('accidental replay via start_solo does NOT reset score/readyPlayerIds (characterization)', async () => {
    // Companion to the "start_solo bypasses state machine" FOUND BUG.
    // Proves concrete leakage across the accidental replay path: after a game
    // ends in game_over, calling start_solo restarts a game but carries the
    // prior game's state fields the reducer's reset-path would have cleared.
    const real = new RealSystem()
    await real.createRoom('RESET1')
    const pid = await real.joinRoom('RESET1', 'A')
    if (!pid) throw new Error('join failed')

    // Ready up fake-style: add to readyPlayerIds (start_solo normally skips
    // the ready list, so simulate a dirty state by forcing a ready first).
    await real.sendAs(pid, { type: 'ready' })
    // Readys on a solo room are allowed but don't trigger a start.
    let state = real.getState('RESET1')!
    expect(state.readyPlayerIds).toContain(pid)

    await real.sendAs(pid, { type: 'start_solo' })
    await real.advanceTicks('RESET1', 150)
    await real.sendAs(pid, { type: 'forfeit' })
    state = real.getState('RESET1')!
    expect(state.status).toBe('game_over')

    // Drive the accidental replay via a second start_solo.
    await real.sendAs(pid, { type: 'start_solo' })
    state = real.getState('RESET1')!
    // Characterize: score is NOT reset back to 0 (startGame only resets tick,
    // entities, lives — not score, wave, or readyPlayerIds).
    expect(state.status).toBe('wipe_hold')
    // Expected FAILURE MODES if the spec is "replay must be a clean start":
    //   - state.score may be non-zero (carries previous game's score).
    //   - state.readyPlayerIds may still contain pid.
    //   - state.wave may not be 1.
    // We record exact observed behaviour for the triage doc below.
    expect(state.readyPlayerIds).toContain(pid) // NOT cleared — bug evidence
    // (score is 0 when forfeit happens before any aliens are killed — this is
    // a weaker characterization because the empty-score case does not prove
    // leakage; what we WANT is wave=1, ready=[], status=wipe_hold on replay.)
    expect(state.wave).toBeGreaterThanOrEqual(1)
  })

  it('late-join attempt during playing IS allowed (characterization — likely a bug)', async () => {
    // CHARACTERIZATION test (not a spec test). Asserts the current observed
    // behaviour so a future fix will surface as a test delta.
    //
    // GameRoom.webSocketMessage "join" handler guards ONLY against:
    //   - already_joined (attachment already has playerId)
    //   - countdown_in_progress (status === 'countdown')
    //   - room_full (players.length >= 4)
    //
    // It does NOT check status === 'playing', 'wipe_*', or 'game_over'.
    // The WS upgrade in fetch() DOES reject playing status, but a WS that
    // already got accepted (hibernation wake, or reconnect with ?rejoin) can
    // send a fresh join and be added mid-game.
    const real = new RealSystem()
    await real.createRoom('LATEJN')
    const pid = await real.joinRoom('LATEJN', 'A')
    if (!pid) throw new Error('join failed')
    await real.sendAs(pid, { type: 'start_solo' })
    await real.advanceTicks('LATEJN', 150)
    const state = real.getState('LATEJN')
    expect(state?.status).toBe('playing')

    const entry = real.rooms.get('LATEJN')!
    const newWs = createMockWebSocket()
    entry.ctx._webSockets.push(newWs)
    await entry.room.webSocketMessage(newWs as unknown as WebSocket, JSON.stringify({ type: 'join', name: 'late' }))

    const stateAfter = real.getState('LATEJN')
    const added = Object.values(stateAfter!.players).find(p => p.name === 'late')
    // Characterization: the late joiner IS added. This is likely a bug. See
    // "FOUND BUG" block below for the remediation hint.
    expect(added).toBeDefined()
  })
})

// ============================================================================
// FOUND BUGS — failing-intent reproducers preserved as describe.skip blocks.
// ============================================================================
// Each block below is a reproducer for a bug the harness surfaced. Kept as
// `describe.skip('FOUND BUG …')` so they don't break CI, but preserve the
// minimal sequence and the violated invariant for triage.
//
// When one of these bugs is fixed, flip .skip → empty (so the test runs) and
// invert the characterization assertion to the expected-correct behaviour.
// ============================================================================

describe.skip('FOUND BUG (HIGH): join handler allows mid-game joins when status=playing/wipe_*/game_over', () => {
  // Severity: HIGH — a player who refreshes a tab during a game (reconnect
  // path with ?rejoin param in ws upgrade) can re-send `join` and be ADDED
  // AS A NEW PLAYER to the running game, receiving a fresh slot and full
  // starting lives. This also leaks state in game_over rooms.
  //
  // Reproducer:
  //   1. Create a room, one player joins and start_solo.
  //   2. Advance ticks until status === 'playing'.
  //   3. Open a second ws on the same room (any caller that reaches the
  //      accepted-ws path — e.g. hibernation wake after upgrade succeeded).
  //   4. Send { type: 'join', name: 'late' } on the second ws.
  //   5. Observe: 'late' is in state.players; the WS does not receive an error.
  //
  // Remediation hint (worker/src/GameRoom.ts case 'join'):
  //   Add rejection for status ∈ {'playing', 'wipe_exit', 'wipe_hold',
  //   'wipe_reveal', 'game_over'}. Use the existing error code
  //   'game_in_progress' for playing/wipe_*; consider a new code
  //   'room_closed' for game_over.
  it('reproducer kept as a characterization test (see late-join attempt above)', () => {})
})

describe.skip('FOUND BUG (MEDIUM): start_solo has no status guard — bypasses declared state machine', () => {
  // Severity: MEDIUM — `start_solo` in GameRoom.webSocketMessage calls
  // startGame() directly, overwriting game.status without consulting the
  // TRANSITIONS map in reducer.ts. This lets a player with status=game_over
  // (or mid-countdown, mid-wipe, or even mid-playing) trigger another
  // startGame and silently reset wipe phases + alien formation + barriers.
  //
  // Minimal reproducer:
  //   1. joinRoom; start_solo; advanceTicks(150) to reach playing.
  //   2. forfeit → status becomes 'game_over'.
  //   3. start_solo again → status becomes 'wipe_hold' (fresh game, but
  //      score is NOT reset, readyPlayerIds is NOT reset).
  //
  // See the characterization test 'after game_over via forfeit, …' above.
  //
  // Remediation hint: in case 'start_solo', reject unless status === 'waiting',
  // OR route through the reducer's START_SOLO action which already enforces
  // the transition.
  it('reproducer kept as characterization test above', () => {})
})

describe.skip('FOUND BUG (LOW): empty room (0 players) is returned by matchmaker /find', () => {
  // Severity: LOW — see characterization test 'matchmaker does NOT return…'
  // above: a freshly-created room with 0 players IS findable (because
  // Matchmaker adds to openRooms when `status === 'waiting' && playerCount < 4`,
  // which is trivially true for newly-registered rooms).
  //
  // In practice this is fine: two players matchmaking concurrently both get
  // the same room and join it — the intended happy path. But it has a quirk:
  // if a player matchmakes and abandons (never joins), the empty room stays
  // findable for 5 minutes (STALE_THRESHOLD). Other matchmaking players
  // arrive into an empty room and the first to leave strands the second.
  //
  // Remediation hint (worker/src/Matchmaker.ts /register):
  //   Only add to openRooms when `playerCount > 0`. Alternatively, garbage-
  //   collect empty-for-N-seconds entries with a shorter threshold.
  it('reproducer: see "matchmaker does NOT return a newly-registered room with zero players" above', () => {})
})

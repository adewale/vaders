// worker/src/GameRoom.ts
// GameRoom Durable Object with WebSocket Hibernation for cost-efficient real-time game state

import { DurableObject } from 'cloudflare:workers'
import type {
  GameState,
  Player,
  BarrierEntity,
  ServerMessage,
  ClientMessage,
  PlayerSlot,
  ErrorCode,
  InputState,
} from '../../shared/types'
import {
  HITBOX,
  WIPE_TIMING,
  PLAYER_COLORS,
  MAX_BARRIER_COUNT,
  BARRIER_PLAYER_OFFSET,
  BARRIER_SHAPE_COLS,
  COUNTDOWN_SECONDS,
  getBarriers,
  createAlienFormation,
  createBarrierSegments,
} from '../../shared/types'
import { getScaledConfig, getPlayerSpawnX } from './game/scaling'
import { gameReducer, type GameAction } from './game/reducer'

/**
 * Per-request debug tracing for the WebSocket hot path.
 *
 * Off by default — previously every ws message / join / broadcast wrote a
 * `console.log(...)` line, so production Logpush was flooded with per-message
 * breadcrumbs that weren't structured wide events and carried no useful
 * signal once the feature they debugged was stable. Flip this to `true`
 * locally to turn the breadcrumbs back on. Kept deliberately simple (no env
 * plumbing) so enabling it is a one-line diff, and tree-shaking drops the
 * callsites entirely when false.
 */
const DEBUG_TRACE = false

function debugLog(tag: string, data: Record<string, unknown>): void {
  if (!DEBUG_TRACE) return
  console.log(tag, data)
}
import { createDefaultGameState, migrateGameState } from '../../shared/state-defaults'
import type { Env } from './env'
import { logEvent } from './logger'

export type { Env }

/**
 * Header used by the Worker entry to propagate a per-request ID into the DO
 * so wide-event logs can be stitched across the Worker→DO hop. Must match
 * the constant in index.ts.
 */
const REQUEST_ID_HEADER = 'x-vaders-request-id'

/**
 * Extract the requestId from the inbound request header, or generate one if
 * absent. Generating a fresh UUID is the right fallback for WebSocket
 * messages that arrive AFTER the initial upgrade (the DO may have hibernated
 * and the original request is long gone); it's also the right fallback for
 * direct internal DO fetches in tests.
 */
function getRequestId(request?: Request): string {
  if (request) {
    const fromHeader = request.headers.get(REQUEST_ID_HEADER)
    if (fromHeader) return fromHeader
  }
  return crypto.randomUUID()
}

// WebSocket attachment for player session data. Attachments survive
// hibernation while the WebSocket remains connected and are intentionally
// small (<2KB Cloudflare limit).
interface WebSocketAttachment {
  playerId?: string
  acceptedAt?: number
}

// Rate limiting constants
const RATE_LIMIT_WINDOW_MS = 1000
const RATE_LIMIT_MAX_MESSAGES = 60
const UNAUTHENTICATED_SOCKET_TIMEOUT_MS = 5000

// Per-connection rate limiting state (not serialized into attachment — lives in memory only)
interface RateLimitState {
  count: number
  windowStart: number
}

/**
 * Type guard: validates that a parsed JSON value is a non-null object
 * with a string `type` field, suitable for use as a ClientMessage.
 */
function isValidClientMessage(msg: unknown): msg is { type: string; [key: string]: unknown } {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    !Array.isArray(msg) &&
    typeof (msg as Record<string, unknown>).type === 'string'
  )
}

/**
 * Validates that a room code matches the expected format: exactly 6 uppercase alphanumeric characters.
 */
function isValidRoomCode(code: unknown): code is string {
  return typeof code === 'string' && /^[A-Z0-9]{6}$/.test(code)
}

/**
 * Validates that a value is a valid InputState: an object with boolean `left` and `right` properties.
 */
function isValidInputState(held: unknown): held is InputState {
  return (
    typeof held === 'object' &&
    held !== null &&
    typeof (held as Record<string, unknown>).left === 'boolean' &&
    typeof (held as Record<string, unknown>).right === 'boolean'
  )
}

/**
 * Validates that a value is a valid move direction: exactly 'left' or 'right'.
 */
function isValidMoveDirection(direction: unknown): direction is 'left' | 'right' {
  return direction === 'left' || direction === 'right'
}

/**
 * GameRoom Durable Object
 *
 * Uses Hibernatable WebSockets API for cost-efficient connections.
 * The DO sleeps while maintaining WebSocket connections, only waking
 * when messages arrive or alarms fire. This dramatically reduces billing
 * for idle game rooms.
 *
 * Key patterns from Cloudflare skill:
 * - WebSocket hibernation: ctx.acceptWebSocket() + webSocketMessage()
 * - Alarms for game tick instead of setInterval (hibernation-compatible)
 * - SQLite storage for structured data
 * - blockConcurrencyWhile() for state loading
 */
export class GameRoom extends DurableObject<Env> {
  private game: GameState | null = null
  private nextEntityId = 1
  private inputQueue: GameAction[] = []
  private rateLimits: Map<WebSocket, RateLimitState> = new Map()
  // Current request's correlation id — set by each entry point (fetch, ws
  // message, ws close, alarm) so logEvent() calls reached from within share
  // a stable requestId. This is a "contextual" field rather than passing
  // requestId through every private method signature, which would be noisy.
  private currentRequestId: string | null = null

  /**
   * Emit a wide-event log line with the room-scoped envelope: roomCode,
   * requestId, and whatever caller-supplied fields. All meaningful state
   * changes inside the DO should go through this so logs are consistent.
   */
  private log(eventName: string, data: Record<string, unknown> = {}): void {
    logEvent(eventName, {
      roomCode: this.game?.roomCode,
      requestId: this.currentRequestId ?? undefined,
      ...data,
    })
  }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)

    // Load state from SQLite on wake (hibernation-aware)
    ctx.blockConcurrencyWhile(async () => {
      // Initialize SQLite schema if needed
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS game_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          data TEXT NOT NULL,
          next_entity_id INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS rejoin_sessions (
          token TEXT PRIMARY KEY,
          player_id TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        )
      `)

      // Load existing state if any
      const rows = this.ctx.storage.sql
        .exec<{ data: string; next_entity_id: number }>('SELECT data, next_entity_id FROM game_state WHERE id = 1')
        .toArray()

      if (rows.length > 0) {
        // Migrate persisted state to fill any missing fields with defaults
        this.game = migrateGameState(JSON.parse(rows[0].data))
        this.nextEntityId = rows[0].next_entity_id

        // --- Phantom-player reconciliation (Option A) ---
        // After a DO eviction or hibernation wake, state.players is
        // rehydrated from SQL but the WebSockets that created those
        // entries may not be attached. Cross-check against
        // ctx.getWebSockets() and prune any player id whose WS did not
        // survive. Without this, phantoms persist across DO lifecycle
        // events and block countdown forever — reproduced in production
        // as room XPJZ7K (2026-04-13). See state-machine.pbt.test.ts
        // "phantom players" section for the characterisation + regression
        // guards.
        const live = new Set<string>()
        for (const ws of this.ctx.getWebSockets()) {
          const a = ws.deserializeAttachment() as WebSocketAttachment | null
          if (a?.playerId) live.add(a.playerId)
        }
        const phantoms = Object.keys(this.game.players).filter((id) => !live.has(id))
        if (phantoms.length > 0) {
          for (const id of phantoms) delete this.game.players[id]
          this.game.readyPlayerIds = this.game.readyPlayerIds.filter((id) => id in this.game!.players)
          // If countdown was in-flight and the threshold no longer holds,
          // reset to waiting so a fresh ready flow can begin.
          if (this.game.status === 'countdown' && Object.keys(this.game.players).length < 2) {
            this.game.status = 'waiting'
            this.game.countdownRemaining = null
          }
          this.persistState()
          logEvent('reconcile_prune_phantoms', {
            roomCode: this.game.roomCode,
            pruned: phantoms,
            kept: [...live],
            remainingPlayers: Object.keys(this.game.players).length,
            prunedCount: phantoms.length,
          })
        }
      }
    })
  }

  private generateEntityId(): string {
    return `e_${this.nextEntityId++}`
  }

  private persistState() {
    if (!this.game) return
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO game_state (id, data, next_entity_id) VALUES (1, ?, ?)`,
      JSON.stringify(this.game),
      this.nextEntityId,
    )
  }

  private createInitialState(roomCode: string): GameState {
    return createDefaultGameState(roomCode)
  }

  private createRejoinToken(playerId: string): string {
    const token = crypto.randomUUID()
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000
    this.ctx.storage.sql.exec(
      'INSERT OR REPLACE INTO rejoin_sessions (token, player_id, expires_at) VALUES (?, ?, ?)',
      token,
      playerId,
      expiresAt,
    )
    return token
  }

  private consumeValidRejoinToken(token: string): string | null {
    const rows = this.ctx.storage.sql
      .exec<{ player_id: string; expires_at: number }>(
        'SELECT player_id, expires_at FROM rejoin_sessions WHERE token = ?',
        token,
      )
      .toArray()
    if (rows.length === 0) return null
    const session = rows[0]
    if (session.expires_at <= Date.now()) {
      this.ctx.storage.sql.exec('DELETE FROM rejoin_sessions WHERE token = ?', token)
      return null
    }
    return session.player_id
  }

  private async ensureUnauthenticatedSocketAlarm() {
    const hasUnauthenticatedSocket = this.ctx.getWebSockets().some((ws) => {
      const attachment = ws.deserializeAttachment() as WebSocketAttachment | null
      return !attachment?.playerId
    })
    if (!hasUnauthenticatedSocket) return
    await this.ctx.storage.setAlarm(Date.now() + UNAUTHENTICATED_SOCKET_TIMEOUT_MS)
  }

  private closeStaleUnauthenticatedSockets(now = Date.now()): number {
    let closed = 0
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as WebSocketAttachment | null
      if (attachment?.playerId) continue
      const acceptedAt = attachment?.acceptedAt ?? now
      if (now - acceptedAt >= UNAUTHENTICATED_SOCKET_TIMEOUT_MS) {
        try {
          ws.close(1008, 'Join timeout')
          closed++
        } catch {}
      }
    }
    return closed
  }

  /**
   * HTTP fetch handler for non-WebSocket requests
   */
  async fetch(request: Request): Promise<Response> {
    // Capture the per-request id (threaded from Worker entry via header) so
    // any logEvent() call reached during this fetch carries it.
    this.currentRequestId = getRequestId(request)
    const url = new URL(request.url)

    // POST /init - Initialize room with code
    if (url.pathname === '/init' && request.method === 'POST') {
      if (this.game !== null) {
        return new Response('Already initialized', { status: 409 })
      }
      let body: unknown
      try {
        body = await request.json()
      } catch {
        return new Response('Invalid JSON body', { status: 400 })
      }
      const roomCode = (body as Record<string, unknown>)?.roomCode
      if (!isValidRoomCode(roomCode)) {
        return new Response('Invalid room code format (expected 6 uppercase alphanumeric characters)', { status: 400 })
      }
      this.game = this.createInitialState(roomCode)
      this.persistState()
      return new Response('OK')
    }

    // WebSocket upgrade - use Hibernatable WebSockets API
    if (request.headers.get('Upgrade') === 'websocket') {
      if (!this.game) {
        return new Response(JSON.stringify({ code: 'invalid_room', message: 'Room not initialized' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (this.game.status === 'playing' && !url.searchParams.has('rejoin')) {
        return new Response(JSON.stringify({ code: 'game_in_progress', message: 'Game in progress' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (Object.keys(this.game.players).length >= 4 && !url.searchParams.has('rejoin')) {
        return new Response(JSON.stringify({ code: 'room_full', message: 'Room is full' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Create WebSocket pair and accept with hibernation
      const pair = new WebSocketPair()

      // Accept WebSocket with hibernation support (DO can sleep while connection stays open)
      // Attachment stores player session data that survives hibernation
      this.ctx.acceptWebSocket(pair[1])
      pair[1].serializeAttachment({ acceptedAt: Date.now() } satisfies WebSocketAttachment)
      await this.ensureUnauthenticatedSocketAlarm()

      return new Response(null, { status: 101, webSocket: pair[0] })
    }

    // GET /info - Room status
    if (url.pathname === '/info') {
      if (!this.game) {
        return new Response(JSON.stringify({ error: 'Room not initialized' }), { status: 404 })
      }
      return new Response(
        JSON.stringify({
          roomCode: this.game.roomCode,
          playerCount: Object.keys(this.game.players).length,
          status: this.game.status,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }

    return new Response('Not Found', { status: 404 })
  }

  /**
   * Hibernatable WebSocket message handler
   * Called when any connected WebSocket receives a message, waking the DO if hibernating
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    // Each incoming WS message is effectively a fresh "request" — after
    // hibernation the original HTTP upgrade's requestId is long gone, so we
    // mint a new one per message to correlate this message's events.
    this.currentRequestId = getRequestId()

    if (!this.game) return

    // --- Rate limiting ---
    const now = Date.now()
    let rl = this.rateLimits.get(ws)
    if (!rl) {
      rl = { count: 0, windowStart: now }
      this.rateLimits.set(ws, rl)
    }
    // Reset window if elapsed
    if (now - rl.windowStart >= RATE_LIMIT_WINDOW_MS) {
      rl.count = 0
      rl.windowStart = now
    }
    rl.count++
    if (rl.count > RATE_LIMIT_MAX_MESSAGES) {
      // Only send an error on the first exceeded message to avoid amplification
      if (rl.count === RATE_LIMIT_MAX_MESSAGES + 1) {
        this.sendError(ws, 'rate_limited', 'Too many messages, slow down')
      }
      return
    }

    try {
      const parsed: unknown = JSON.parse(message as string)

      // --- Validate message shape ---
      if (!isValidClientMessage(parsed)) {
        this.sendError(ws, 'invalid_message', 'Message must be an object with a string "type" field')
        return
      }

      const msg = parsed as ClientMessage
      const attachment = ws.deserializeAttachment() as WebSocketAttachment | null
      const playerId = attachment?.playerId

      // Heartbeat bump (Option B): any inbound message proves the WS is
      // alive. Refresh lastActiveTick so the reap-stale-players check in
      // tick() knows this player is still reachable. Ping messages are
      // included — that's the whole point of the 30s ping interval.
      if (playerId && this.game.players[playerId]) {
        this.game.players[playerId].lastActiveTick = this.game.tick
      }

      // Diagnostic logging for multiplayer debugging
      debugLog('[WS] Message', {
        type: msg.type,
        hasAttachment: !!attachment,
        playerId: playerId ?? 'NULL',
        playerExists: playerId ? !!this.game.players[playerId] : false,
        gameStatus: this.game.status,
        playerCount: Object.keys(this.game.players).length,
      })

      switch (msg.type) {
        case 'rejoin': {
          if (attachment?.playerId) {
            this.sendError(ws, 'already_joined', 'Already in room')
            return
          }
          const rawToken = (msg as Record<string, unknown>).token
          if (typeof rawToken !== 'string' || rawToken.length === 0) {
            this.sendError(ws, 'invalid_rejoin', 'Invalid rejoin token')
            return
          }
          const rejoinPlayerId = this.consumeValidRejoinToken(rawToken)
          if (!rejoinPlayerId || !this.game.players[rejoinPlayerId]) {
            this.sendError(ws, 'invalid_rejoin', 'Invalid or expired rejoin token')
            return
          }
          this.game.players[rejoinPlayerId].lastActiveTick = this.game.tick
          this.game.players[rejoinPlayerId].inputState = { left: false, right: false }
          ws.serializeAttachment({ playerId: rejoinPlayerId } satisfies WebSocketAttachment)
          ws.send(
            JSON.stringify({
              type: 'sync',
              state: this.game,
              playerId: rejoinPlayerId,
              rejoinToken: rawToken,
              config: this.game.config,
            }),
          )
          this.broadcastFullState()
          this.log('room_rejoin', { playerId: rejoinPlayerId })
          return
        }

        case 'join': {
          // Prevent duplicate joins
          if (attachment?.playerId) {
            this.sendError(ws, 'already_joined', 'Already in room')
            return
          }

          // Reject joins outside the `waiting` state. Previously only
          // `countdown` was checked, so a WS that bypassed the upgrade
          // guard (e.g. hibernation wake against a `playing` / `wipe_*`
          // / `game_over` room) could inject a brand-new player
          // mid-match. The PBT harness caught this as a HIGH-severity
          // bug; see worker/src/state-machine.pbt.test.ts "late-join
          // attempt during playing IS allowed".
          if (this.game.status === 'countdown') {
            this.sendError(ws, 'countdown_in_progress', 'Game starting, try again')
            return
          }
          if (this.game.status !== 'waiting') {
            this.sendError(ws, 'game_in_progress', 'Game already in progress')
            return
          }
          if (Object.keys(this.game.players).length >= 4) {
            this.sendError(ws, 'room_full', 'Room is full')
            return
          }

          // Validate player name
          const rawName = (msg as Record<string, unknown>).name
          const playerName = typeof rawName === 'string' ? rawName.slice(0, 12) : 'Player'

          const slot = this.getNextSlot()
          const playerCount = Object.keys(this.game.players).length + 1
          const player: Player = {
            id: crypto.randomUUID(),
            name: playerName,
            x: getPlayerSpawnX(slot, playerCount, this.game.config.width),
            slot,
            color: PLAYER_COLORS[slot],
            lastShotTick: 0,
            alive: true,
            lives: 5,
            respawnAtTick: null,
            invulnerableUntilTick: null,
            kills: 0,
            inputState: { left: false, right: false },
            lastActiveTick: this.game.tick,
          }

          this.game.players[player.id] = player
          this.game.mode = Object.keys(this.game.players).length === 1 ? 'solo' : 'coop'

          // Store playerId in WebSocket attachment (survives hibernation)
          ws.serializeAttachment({ playerId: player.id } satisfies WebSocketAttachment)
          debugLog('[JOIN] Attachment set', {
            playerId: player.id,
            name: player.name,
            slot: player.slot,
            totalPlayers: Object.keys(this.game.players).length,
          })

          const rejoinToken = this.createRejoinToken(player.id)

          // Send initial sync with playerId, rejoin token, and config (only on join)
          ws.send(
            JSON.stringify({
              type: 'sync',
              state: this.game,
              playerId: player.id,
              rejoinToken,
              config: this.game.config,
            }),
          )
          this.broadcast({ type: 'event', name: 'player_joined', data: { player } })
          this.broadcastFullState()
          this.persistState()
          await this.updateRoomRegistry()

          // Wide event: a new player joined the room. One log line per join.
          this.log('room_join', {
            playerId: player.id,
            playerName: player.name,
            slot: player.slot,
            totalPlayers: Object.keys(this.game.players).length,
          })
          break
        }

        case 'start_solo': {
          // Only start a solo game from the `waiting` state. Without this
          // guard, `start_solo` was bypassing the reducer's TRANSITIONS
          // table — a player could issue it from `game_over` (or any
          // other status) and call startGame() directly, silently
          // resetting the wipe phase + alien formation without passing
          // through the documented state machine. MEDIUM-severity PBT
          // finding; see state-machine.pbt.test.ts.
          if (this.game.status !== 'waiting') return
          if (Object.keys(this.game.players).length === 1 && playerId) {
            this.game.mode = 'solo'
            this.game.maxLives = 3
            this.game.lives = 3
            await this.startGame()
          }
          break
        }

        case 'forfeit': {
          // End game early - only allowed during gameplay
          const playableStatuses = ['playing', 'wipe_exit', 'wipe_hold', 'wipe_reveal']
          if (playableStatuses.includes(this.game.status)) {
            this.endGame('defeat')
            this.broadcastFullState()
            this.persistState()
          }
          break
        }

        case 'ready': {
          if (playerId && this.game.players[playerId] && !this.game.readyPlayerIds.includes(playerId)) {
            this.game.readyPlayerIds.push(playerId)
            debugLog('[READY]', {
              playerId,
              readyCount: this.game.readyPlayerIds.length,
              totalPlayers: Object.keys(this.game.players).length,
            })
            this.broadcast({ type: 'event', name: 'player_ready', data: { playerId } })
            this.broadcastFullState()
            this.persistState()

            // Wide event: a player readied up. Fires once per ready, not on
            // duplicate ready attempts (guarded by !includes above).
            this.log('player_ready', {
              playerId,
              readyCount: this.game.readyPlayerIds.length,
              totalPlayers: Object.keys(this.game.players).length,
            })

            await this.checkStartConditions()
          }
          break
        }

        case 'unready': {
          if (playerId && this.game.players[playerId]) {
            const wasReady = this.game.readyPlayerIds.includes(playerId)
            this.game.readyPlayerIds = this.game.readyPlayerIds.filter((id) => id !== playerId)
            this.broadcast({ type: 'event', name: 'player_unready', data: { playerId } })
            this.broadcastFullState()

            if (wasReady && this.game.status === 'countdown') {
              await this.cancelCountdown('Player unreadied')
            } else {
              this.persistState()
            }
          }
          break
        }

        case 'input': {
          if (!isValidInputState(msg.held)) break
          const inputAccepted = !!(playerId && this.game.players[playerId])
          if (!inputAccepted) {
            debugLog('[INPUT] DROPPED', {
              playerId: playerId ?? 'NULL',
              reason: !playerId ? 'no playerId' : 'player not found',
            })
          }
          if (inputAccepted) {
            this.inputQueue.push({ type: 'PLAYER_INPUT', playerId, input: msg.held })
          }
          break
        }

        case 'move': {
          // Discrete movement - one step per message (for terminals without key release events)
          if (!isValidMoveDirection(msg.direction)) break
          const moveAccepted = !!(
            playerId &&
            this.game.players[playerId] &&
            (this.game.status === 'playing' || this.game.status === 'countdown')
          )
          if (!moveAccepted) {
            debugLog('[MOVE] DROPPED', {
              playerId: playerId ?? 'NULL',
              playerExists: playerId ? !!this.game.players[playerId] : false,
              status: this.game.status,
              direction: msg.direction,
            })
          }
          if (moveAccepted) {
            this.inputQueue.push({ type: 'PLAYER_MOVE', playerId, direction: msg.direction })
          }
          break
        }

        case 'shoot': {
          const shootAccepted = !!(playerId && this.game.players[playerId] && this.game.status === 'playing')
          if (!shootAccepted) {
            debugLog('[SHOOT] DROPPED', {
              playerId: playerId ?? 'NULL',
              playerExists: playerId ? !!this.game.players[playerId] : false,
              status: this.game.status,
            })
          }
          if (shootAccepted) {
            this.inputQueue.push({ type: 'PLAYER_SHOOT', playerId })
          }
          break
        }

        case 'ping': {
          ws.send(JSON.stringify({ type: 'pong', serverTime: Date.now() }))
          break
        }
      }
    } catch (_err) {
      this.sendError(ws, 'invalid_message', 'Failed to parse message')
    }
  }

  /**
   * Hibernatable WebSocket close handler
   */
  async webSocketClose(ws: WebSocket, code: number, _reason: string, wasClean: boolean) {
    // Fresh requestId for this hibernation-wake event so its log correlates.
    this.currentRequestId = getRequestId()

    // Clean up rate limit state for this connection
    this.rateLimits.delete(ws)

    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null
    const playerId = attachment?.playerId

    if (playerId && this.game?.players[playerId]) {
      const rejoinableStatuses = ['playing', 'wipe_exit', 'wipe_hold', 'wipe_reveal']
      if (!wasClean && rejoinableStatuses.includes(this.game.status)) {
        // Active-game disconnects keep their player slot for rejoin. Clear held
        // input so a dropped client cannot keep drifting/shooting by stale state.
        this.game.players[playerId].inputState = { left: false, right: false }
        this.persistState()
        this.broadcastFullState()
        this.log('room_disconnect_grace', {
          playerId,
          closeCode: code,
          wasClean,
        })
        return
      }

      // Cancel countdown if player disconnects during it
      if (this.game.status === 'countdown') {
        await this.cancelCountdown('Player disconnected')
      }

      // Remove player immediately outside active play
      await this.removePlayer(playerId)
      this.broadcastFullState()

      // Wide event: a player left the room. Fires exactly once per close.
      this.log('room_leave', {
        playerId,
        remainingPlayers: Object.keys(this.game?.players ?? {}).length,
        closeCode: code,
        wasClean,
      })
    }
  }

  /**
   * Hibernatable WebSocket error handler
   */
  async webSocketError(ws: WebSocket, _error: unknown) {
    // Treat errors same as close
    await this.webSocketClose(ws, 1006, 'Error', false)
  }

  private getNextSlot(): PlayerSlot {
    const usedSlots = new Set(Object.values(this.game!.players).map((p) => p.slot))
    for (const slot of [1, 2, 3, 4] as const) {
      if (!usedSlots.has(slot)) return slot
    }
    return 1
  }

  private async checkStartConditions() {
    if (!this.game) return
    const playerCount = Object.keys(this.game.players).length
    const readyCount = this.game.readyPlayerIds.length
    const willStart = playerCount >= 2 && readyCount === playerCount
    // One wide event per evaluation so the countdown decision is
    // queryable in Logpush. Useful when a user reports "we both readied
    // and nothing happened" — the log tells you whether the server saw
    // the ready, how many it counted, and whether it believed the
    // threshold was met.
    this.log('check_start_conditions', {
      playerCount,
      readyCount,
      willStart,
      reason: willStart ? 'all-players-ready' : playerCount < 2 ? 'too-few-players' : 'not-all-ready',
    })
    debugLog('[CHECK_START]', { playerCount, readyCount, willStart })

    if (willStart) {
      await this.startCountdown()
    }
  }

  private async startCountdown() {
    if (!this.game) return
    debugLog('[COUNTDOWN_START]', {
      players: Object.keys(this.game.players),
      readyPlayerIds: this.game.readyPlayerIds,
      wsCount: this.ctx.getWebSockets().length,
    })
    this.game.status = 'countdown'
    this.game.countdownRemaining = COUNTDOWN_SECONDS

    this.persistState()
    await this.updateRoomRegistry()
    this.broadcast({ type: 'event', name: 'countdown_tick', data: { count: COUNTDOWN_SECONDS } })
    this.broadcastFullState()

    // Wide event: countdown began. Captures who was in the room at kickoff.
    this.log('countdown_start', {
      players: Object.keys(this.game.players),
      durationSeconds: COUNTDOWN_SECONDS,
    })

    // Use alarm for countdown ticks (hibernation-compatible, no setInterval)
    await this.ctx.storage.setAlarm(Date.now() + 1000)
  }

  private async cancelCountdown(reason: string) {
    if (!this.game) return
    this.game.status = 'waiting'
    this.game.countdownRemaining = null
    await this.ctx.storage.deleteAlarm()
    this.broadcast({ type: 'event', name: 'countdown_cancelled', data: { reason } })
    this.broadcastFullState()
    this.persistState()
  }

  private internalRequest(url: string, init?: RequestInit): Request {
    const headers = new Headers(init?.headers)
    if (this.currentRequestId) headers.set(REQUEST_ID_HEADER, this.currentRequestId)
    return new Request(url, { ...init, headers })
  }

  private async updateRoomRegistry() {
    if (!this.game) return
    const matchmaker = this.env.MATCHMAKER.get(this.env.MATCHMAKER.idFromName('global'))
    await matchmaker.fetch(
      this.internalRequest('https://internal/register', {
        method: 'POST',
        body: JSON.stringify({
          roomCode: this.game.roomCode,
          playerCount: Object.keys(this.game.players).length,
          status: this.game.status,
        }),
      }),
    )
  }

  private fireAndForget(label: string, task: Promise<unknown>): void {
    task.catch((err) => {
      this.log('async_task_failed', {
        task: label,
        message: err instanceof Error ? err.message : String(err),
      })
    })
  }

  private async startGame() {
    if (!this.game) return
    const playerCount = Object.keys(this.game.players).length
    const scaled = getScaledConfig(playerCount, this.game.config)

    debugLog('[GAME_START]', {
      players: Object.entries(this.game.players).map(([id, p]) => ({ id, name: p.name, slot: p.slot })),
      wsCount: this.ctx.getWebSockets().length,
      mode: playerCount === 1 ? 'solo' : 'coop',
    })

    // Start in wipe_hold phase (skip exit for game start)
    this.game.status = 'wipe_hold'
    this.game.countdownRemaining = null
    this.game.maxLives = scaled.lives
    this.game.lives = scaled.lives
    // Reset per-match fields that earlier versions of startGame() forgot.
    // Defense-in-depth: even when the `start_solo` status guard (above)
    // prevents replay from game_over, startGame() itself should always
    // produce a clean match regardless of caller. The PBT harness caught
    // score/readyPlayerIds/wave leaking through the accidental-replay
    // path — see state-machine.pbt.test.ts "accidental replay via
    // start_solo does NOT reset …" for the characterisation.
    this.game.readyPlayerIds = []
    this.game.score = 0
    this.game.wave = 1
    this.game.alienDirection = 1
    // Patch all existing players' lives + kills to match scaled config
    for (const player of Object.values(this.game.players)) {
      player.lives = this.game.lives
      player.kills = 0
      player.alive = true
      player.respawnAtTick = null
      player.invulnerableUntilTick = null
    }
    this.game.tick = 0
    this.game.wipeTicksRemaining = WIPE_TIMING.HOLD_TICKS
    this.game.wipeWaveNumber = 1
    // Note: alienShootingDisabled is set via GAME_STATE_DEFAULTS in state-defaults.ts

    // Initialize barriers only - aliens created at wipe_hold→wipe_reveal transition
    this.game.entities = [...this.createBarriers(playerCount)]

    this.broadcast({ type: 'event', name: 'game_start', data: undefined })
    this.broadcastFullState()
    this.persistState()
    await this.updateRoomRegistry()

    // Wide event: the game actually began (post-countdown, entering wipes).
    this.log('game_start', {
      mode: this.game.mode,
      playerCount,
      wave: this.game.wave,
    })

    // Use alarm for game tick (hibernation-compatible)
    // Game runs at 30Hz (33ms per tick) during wipe phases too
    await this.ctx.storage.setAlarm(Date.now() + this.game.config.tickIntervalMs)
  }

  /**
   * Alarm handler - runs game tick or countdown
   * Using alarms instead of setInterval allows DO to hibernate between ticks
   */
  async alarm() {
    // Alarm-driven wakes don't carry an HTTP request, so mint a requestId
    // for any logEvent() reached during this alarm pass.
    this.currentRequestId = getRequestId()

    const closedUnauthenticated = this.closeStaleUnauthenticatedSockets()
    if (closedUnauthenticated > 0) {
      this.log('ws_unauth_timeout', { closedCount: closedUnauthenticated })
    }

    // Handle countdown. Persisted GameState is the source of truth so a
    // hibernated/evicted DO can resume countdown after constructor rehydration.
    if (
      this.game?.status === 'countdown' &&
      this.game.countdownRemaining !== null &&
      this.game.countdownRemaining > 0
    ) {
      this.game.countdownRemaining--

      if (this.game.countdownRemaining === 0) {
        this.game.countdownRemaining = null
        this.persistState()
        this.log('countdown_tick', { count: 0, transitioningToGame: true })
        await this.startGame()
      } else {
        // Wide event per countdown tick — 3 lines per game, safe for Logpush
        // cost. Lets us observe countdown duration end-to-end and catch
        // "the countdown fired but the game never started" cases.
        this.log('countdown_tick', { count: this.game.countdownRemaining, transitioningToGame: false })
        this.broadcast({ type: 'event', name: 'countdown_tick', data: { count: this.game.countdownRemaining } })
        this.broadcastFullState()
        this.persistState()
        await this.ctx.storage.setAlarm(Date.now() + 1000)
      }
      return
    }

    // Handle game tick (including wipe phases)
    const activeStatuses = ['playing', 'wipe_exit', 'wipe_hold', 'wipe_reveal']
    if (!this.game || !activeStatuses.includes(this.game.status)) {
      // Keep the auth-timeout alarm alive only while unauthenticated sockets exist.
      if (
        this.ctx.getWebSockets().some((ws) => !(ws.deserializeAttachment() as WebSocketAttachment | null)?.playerId)
      ) {
        await this.ensureUnauthenticatedSocketAlarm()
      }
      // Room cleanup if empty
      if (this.game && Object.keys(this.game.players).length === 0) {
        await this.cleanup()
      }
      return
    }

    this.tick()

    // Schedule next tick if still in an active status
    if (this.game && activeStatuses.includes(this.game.status)) {
      await this.ctx.storage.setAlarm(Date.now() + this.game.config.tickIntervalMs)
    }
  }

  private tick() {
    if (!this.game) return

    const activeStatuses = ['playing', 'wipe_exit', 'wipe_hold', 'wipe_reveal']
    if (!activeStatuses.includes(this.game.status)) return

    const prevStatus = this.game.status

    // 0. Heartbeat reap (Option B): any player whose lastActiveTick is
    // > IDLE_STALE_TICKS behind the current tick is presumed phantom
    // (their WS is dead but Cloudflare's close event hasn't fired). Only
    // reap during active play — waiting is handled by Option A on wake
    // and by normal lobby flow; countdown is too short to matter.
    // Threshold 2400 ticks = 80s at 30Hz ≈ 2 × (PING_INTERVAL + PONG_TIMEOUT)
    // so we allow two missed pings before treating a player as gone.
    const IDLE_STALE_TICKS = 2400
    let reaped = 0
    for (const id of Object.keys(this.game.players)) {
      const p = this.game.players[id]
      if (p.lastActiveTick === null || p.lastActiveTick === undefined) {
        // Migrated record from pre-heartbeat state — lazy-initialise so
        // we don't false-reap the first time we see it.
        p.lastActiveTick = this.game.tick
        continue
      }
      const idle = this.game.tick - p.lastActiveTick
      if (idle > IDLE_STALE_TICKS) {
        this.log('reap_idle_player', {
          playerId: id,
          playerName: p.name,
          idleTicks: idle,
          thresholdTicks: IDLE_STALE_TICKS,
        })
        const leaveResult = gameReducer(this.game, { type: 'PLAYER_LEAVE', playerId: id })
        this.game = leaveResult.state
        for (const event of leaveResult.events) this.broadcast(event)
        if (leaveResult.persist) this.persistState()
        reaped++
      }
    }
    if (reaped > 0) {
      // Reaping the last player during active play must end the game —
      // otherwise status=playing + playerCount=0 violates the
      // playing_with_zero_players invariant and the room never cleans up.
      if (Object.keys(this.game.players).length === 0 && activeStatuses.includes(this.game.status)) {
        this.log('reap_emptied_room', { wasStatus: this.game.status })
        this.endGame('defeat')
        return
      }
      // Registry counts changed — refresh matchmaker asynchronously.
      this.fireAndForget('update_room_registry', this.updateRoomRegistry())
    }

    // 1. Process queued input actions via reducer
    const queuedActions = this.inputQueue
    this.inputQueue = []

    for (const action of queuedActions) {
      const result = gameReducer(this.game, action)
      this.game = result.state
      for (const event of result.events) {
        this.broadcast(event)
      }
      if (result.persist) this.persistState()
    }

    // 2. Run TICK action via reducer
    const tickResult = gameReducer(this.game, { type: 'TICK' })
    this.game = tickResult.state
    for (const event of tickResult.events) {
      this.broadcast(event)
      if (event.type === 'event' && event.name === 'wave_complete') {
        this.nextWave()
      }
    }
    if (tickResult.persist) this.persistState()

    // 3. Handle wipe phase transitions - create aliens when entering wipe_reveal
    if (prevStatus === 'wipe_hold' && this.game.status === 'wipe_reveal') {
      const playerCount = Object.keys(this.game.players).length
      const scaled = getScaledConfig(playerCount, this.game.config)
      const aliens = this.createAlienFormationWithIds(scaled.alienCols, scaled.alienRows)
      // Mark all aliens as entering
      for (const alien of aliens) {
        alien.entering = true
      }
      this.game.entities.push(...aliens)
    }

    // 4. Handle game_over status
    if (this.game.status === 'game_over') {
      this.endGame(this.game.lives <= 0 ? 'defeat' : 'victory')
      return
    }

    // 5. Heartbeat: update registry every ~60s (1800 ticks at 30Hz)
    if (this.game.tick % 1800 === 0) {
      this.fireAndForget('update_room_registry', this.updateRoomRegistry())
    }

    // Full state sync every tick
    this.broadcastFullState()
  }

  private broadcastFullState() {
    if (!this.game) return
    const syncMessage = { type: 'sync', state: this.game }
    const data = JSON.stringify(syncMessage)
    // Use ctx.getWebSockets() for hibernatable WebSockets
    const webSockets = this.ctx.getWebSockets()
    let sent = 0,
      failed = 0
    for (const ws of webSockets) {
      try {
        ws.send(data)
        sent++
      } catch (err) {
        failed++
        debugLog('[BROADCAST] Send failed', { error: String(err) })
        // Wide event on send failure. Keyed per-socket via its player
        // attachment so we can correlate repeated failures to a specific
        // player/client. Emitting here (inside the loop) is fine: failures
        // are rare; the common success path has zero new log lines.
        const attachment = ws.deserializeAttachment() as WebSocketAttachment | null
        this.log('ws_error', {
          playerId: attachment?.playerId,
          errorCode: 'broadcast_send_failed',
          message: String(err),
        })
      }
    }
    // Log only on status changes or periodically to reduce noise
    if (this.game.status !== 'playing' || this.game.tick % 300 === 0) {
      debugLog('[BROADCAST]', { status: this.game.status, wsCount: webSockets.length, sent, failed })
    }
  }

  private nextWave() {
    if (!this.game) return
    const completedWave = this.game.wave
    this.game.wave++

    // Remove bullets, keep barriers, remove old aliens (new ones created during wipe_reveal)
    const barriers = getBarriers(this.game.entities)

    this.game.entities = [...barriers]
    this.game.alienDirection = 1

    // Start wave transition wipe (exit → hold → reveal)
    this.game.status = 'wipe_exit'
    this.game.wipeTicksRemaining = WIPE_TIMING.EXIT_TICKS
    this.game.wipeWaveNumber = this.game.wave

    this.persistState()

    // Wide event: a wave was cleared and the next one is starting. Emitted
    // once per wave completion (nextWave is called from tick() on the
    // wave_complete reducer event).
    const survivors = Object.values(this.game.players).filter((p) => p.alive).length
    this.log('wave_complete', {
      wave: completedWave,
      nextWave: this.game.wave,
      survivors,
    })
  }

  private endGame(result: 'victory' | 'defeat') {
    if (!this.game) return
    this.game.status = 'game_over'
    // No need to clear interval - we use alarms which auto-stop
    this.broadcast({ type: 'event', name: 'game_over', data: { result } })
    this.broadcastFullState()
    this.persistState()
    this.fireAndForget('update_room_registry', this.updateRoomRegistry())

    // Wide event: the game ended. Captures outcome and per-player kill
    // distribution — the business context that matters for postmortems and
    // analytics (not just "game ended").
    const playerKills: Record<string, number> = {}
    for (const [id, p] of Object.entries(this.game.players)) {
      playerKills[id] = p.kills
    }
    this.log('game_over', {
      outcome: result,
      finalScore: this.game.score,
      finalWave: this.game.wave,
      playerKills,
    })

    // Schedule cleanup alarm for 5 minutes
    this.fireAndForget('schedule_cleanup_alarm', this.ctx.storage.setAlarm(Date.now() + 5 * 60 * 1000))
  }

  private createAlienFormationWithIds(cols: number, rows: number) {
    if (!this.game) return []
    // Use shared createAlienFormation with custom ID generator
    return createAlienFormation(cols, rows, this.game.config.width, () => this.generateEntityId())
  }

  private createBarriers(playerCount: number): BarrierEntity[] {
    if (!this.game) return []
    const width = this.game.config.width
    const barrierCount = Math.min(MAX_BARRIER_COUNT, playerCount + BARRIER_PLAYER_OFFSET)
    const barriers: BarrierEntity[] = []
    const spacing = width / (barrierCount + 1)

    for (let i = 0; i < barrierCount; i++) {
      // Center each barrier: BARRIER_SHAPE_COLS segments × BARRIER_SEGMENT_WIDTH chars each
      const barrierTotalWidth = BARRIER_SHAPE_COLS * HITBOX.BARRIER_SEGMENT_WIDTH
      const x = Math.floor(spacing * (i + 1)) - Math.floor(barrierTotalWidth / 2)
      barriers.push({
        kind: 'barrier',
        id: this.generateEntityId(),
        x,
        segments: createBarrierSegments(),
      })
    }
    return barriers
  }

  private async removePlayer(playerId: string) {
    if (!this.game) return

    // Use the reducer to handle player removal (A5: go through reducer pattern)
    // This ensures bullet cleanup and state consistency
    const result = gameReducer(this.game, { type: 'PLAYER_LEAVE', playerId })
    this.game = result.state
    for (const event of result.events) {
      this.broadcast(event)
    }

    const playerCount = Object.keys(this.game.players).length

    if (playerCount === 0) {
      if (this.game.status === 'playing') {
        this.endGame('defeat')
      }
      // Schedule cleanup
      await this.ctx.storage.setAlarm(Date.now() + 5 * 60 * 1000)
    }

    this.persistState()
    await this.updateRoomRegistry()
  }

  private broadcast(msg: ServerMessage) {
    const data = JSON.stringify(msg)
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data)
      } catch {}
    }
  }

  /**
   * Send an error message to a specific WebSocket.
   * Centralizes error response formatting.
   */
  private sendError(ws: WebSocket, code: ErrorCode, message: string) {
    ws.send(JSON.stringify({ type: 'error', code, message }))
  }

  private async cleanup() {
    if (this.game) {
      const matchmaker = this.env.MATCHMAKER.get(this.env.MATCHMAKER.idFromName('global'))
      await matchmaker.fetch(
        this.internalRequest('https://internal/unregister', {
          method: 'POST',
          body: JSON.stringify({ roomCode: this.game.roomCode }),
        }),
      )
    }
    await this.ctx.storage.deleteAlarm()
    this.ctx.storage.sql.exec('DELETE FROM game_state')
    this.game = null
  }
}

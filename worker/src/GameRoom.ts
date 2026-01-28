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
} from '../../shared/types'
import {
  DEFAULT_CONFIG,
  LAYOUT,
  WIPE_TIMING,
  PLAYER_COLORS,
  getBarriers,
  createAlienFormation,
  createBarrierSegments,
} from '../../shared/types'
import { getScaledConfig, getPlayerSpawnX } from './game/scaling'
import { gameReducer, type GameAction } from './game/reducer'
import { createDefaultGameState, migrateGameState } from '../../shared/state-defaults'

export interface Env {
  GAME_ROOM: DurableObjectNamespace
  MATCHMAKER: DurableObjectNamespace
}

// WebSocket attachment for player session data
interface WebSocketAttachment {
  playerId: string
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
  private countdownRemaining: number | null = null

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
        )
      `)

      // Load existing state if any
      const rows = this.ctx.storage.sql.exec<{ data: string; next_entity_id: number }>(
        'SELECT data, next_entity_id FROM game_state WHERE id = 1'
      ).toArray()

      if (rows.length > 0) {
        // Migrate persisted state to fill any missing fields with defaults
        this.game = migrateGameState(JSON.parse(rows[0].data))
        this.nextEntityId = rows[0].next_entity_id
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
      this.nextEntityId
    )
  }

  private createInitialState(roomCode: string): GameState {
    return createDefaultGameState(roomCode)
  }

  /**
   * HTTP fetch handler for non-WebSocket requests
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // POST /init - Initialize room with code
    if (url.pathname === '/init' && request.method === 'POST') {
      if (this.game !== null) {
        return new Response('Already initialized', { status: 409 })
      }
      const { roomCode } = await request.json() as { roomCode: string }
      this.game = this.createInitialState(roomCode)
      this.persistState()
      return new Response('OK')
    }

    // WebSocket upgrade - use Hibernatable WebSockets API
    if (request.headers.get('Upgrade') === 'websocket') {
      if (!this.game) {
        return new Response(JSON.stringify({ code: 'invalid_room', message: 'Room not initialized' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      if (this.game.status === 'playing' && !url.searchParams.has('rejoin')) {
        return new Response(JSON.stringify({ code: 'game_in_progress', message: 'Game in progress' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      if (Object.keys(this.game.players).length >= 4) {
        return new Response(JSON.stringify({ code: 'room_full', message: 'Room is full' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      // Create WebSocket pair and accept with hibernation
      const pair = new WebSocketPair()

      // Accept WebSocket with hibernation support (DO can sleep while connection stays open)
      // Attachment stores player session data that survives hibernation
      this.ctx.acceptWebSocket(pair[1])

      return new Response(null, { status: 101, webSocket: pair[0] })
    }

    // GET /info - Room status
    if (url.pathname === '/info') {
      if (!this.game) {
        return new Response(JSON.stringify({ error: 'Room not initialized' }), { status: 404 })
      }
      return new Response(JSON.stringify({
        roomCode: this.game.roomId,
        playerCount: Object.keys(this.game.players).length,
        status: this.game.status
      }), { headers: { 'Content-Type': 'application/json' } })
    }

    return new Response('Not Found', { status: 404 })
  }

  /**
   * Hibernatable WebSocket message handler
   * Called when any connected WebSocket receives a message, waking the DO if hibernating
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (!this.game) return

    try {
      const msg: ClientMessage = JSON.parse(message as string)
      const attachment = ws.deserializeAttachment() as WebSocketAttachment | null
      const playerId = attachment?.playerId

      // Diagnostic logging for multiplayer debugging
      console.log('[WS] Message', {
        type: msg.type,
        hasAttachment: !!attachment,
        playerId: playerId ?? 'NULL',
        playerExists: playerId ? !!this.game.players[playerId] : false,
        gameStatus: this.game.status,
        playerCount: Object.keys(this.game.players).length,
      })

      switch (msg.type) {
        case 'join': {
          // Prevent duplicate joins
          if (attachment?.playerId) {
            this.sendError(ws, 'already_joined', 'Already in room')
            return
          }

          if (this.game.status === 'countdown') {
            this.sendError(ws, 'countdown_in_progress', 'Game starting, try again')
            return
          }
          if (Object.keys(this.game.players).length >= 4) {
            this.sendError(ws, 'room_full', 'Room is full')
            return
          }

          const slot = this.getNextSlot()
          const playerCount = Object.keys(this.game.players).length + 1
          const player: Player = {
            id: crypto.randomUUID(),
            name: msg.name.slice(0, 12),
            x: getPlayerSpawnX(slot, playerCount, this.game.config.width),
            slot,
            color: PLAYER_COLORS[slot],
            lastShotTick: 0,
            alive: true,
            lives: 5,
            respawnAtTick: null,
            kills: 0,
            inputState: { left: false, right: false },
          }

          this.game.players[player.id] = player
          this.game.mode = Object.keys(this.game.players).length === 1 ? 'solo' : 'coop'

          // Store playerId in WebSocket attachment (survives hibernation)
          ws.serializeAttachment({ playerId: player.id } satisfies WebSocketAttachment)
          console.log('[JOIN] Attachment set', {
            playerId: player.id,
            name: player.name,
            slot: player.slot,
            totalPlayers: Object.keys(this.game.players).length,
          })

          // Send initial sync with playerId and config (only on join)
          ws.send(JSON.stringify({ type: 'sync', state: this.game, playerId: player.id, config: this.game.config }))
          this.broadcast({ type: 'event', name: 'player_joined', data: { player } })
          this.broadcastFullState()
          this.persistState()
          await this.updateRoomRegistry()
          break
        }

        case 'start_solo': {
          if (Object.keys(this.game.players).length === 1 && playerId) {
            this.game.mode = 'solo'
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
            console.log('[READY]', {
              playerId,
              readyCount: this.game.readyPlayerIds.length,
              totalPlayers: Object.keys(this.game.players).length,
            })
            this.broadcast({ type: 'event', name: 'player_ready', data: { playerId } })
            this.broadcastFullState()
            this.persistState()
            await this.checkStartConditions()
          }
          break
        }

        case 'unready': {
          if (playerId && this.game.players[playerId]) {
            const wasReady = this.game.readyPlayerIds.includes(playerId)
            this.game.readyPlayerIds = this.game.readyPlayerIds.filter(id => id !== playerId)
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
          const inputAccepted = !!(playerId && this.game.players[playerId])
          if (!inputAccepted) {
            console.log('[INPUT] DROPPED', { playerId: playerId ?? 'NULL', reason: !playerId ? 'no playerId' : 'player not found' })
          }
          if (inputAccepted) {
            this.inputQueue.push({ type: 'PLAYER_INPUT', playerId, input: msg.held })
          }
          break
        }

        case 'move': {
          // Discrete movement - one step per message (for terminals without key release events)
          const moveAccepted = !!(playerId && this.game.players[playerId] && (this.game.status === 'playing' || this.game.status === 'countdown'))
          if (!moveAccepted) {
            console.log('[MOVE] DROPPED', {
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
            console.log('[SHOOT] DROPPED', {
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
    } catch (err) {
      this.sendError(ws, 'invalid_message', 'Failed to parse message')
    }
  }

  /**
   * Hibernatable WebSocket close handler
   */
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null
    const playerId = attachment?.playerId

    if (playerId && this.game?.players[playerId]) {
      // Cancel countdown if player disconnects during it
      if (this.game.status === 'countdown') {
        await this.cancelCountdown('Player disconnected')
      }

      // Remove player immediately
      await this.removePlayer(playerId)
      this.broadcastFullState()
    }
  }

  /**
   * Hibernatable WebSocket error handler
   */
  async webSocketError(ws: WebSocket, error: unknown) {
    // Treat errors same as close
    await this.webSocketClose(ws, 1006, 'Error', false)
  }

  private getNextSlot(): PlayerSlot {
    const usedSlots = new Set(Object.values(this.game!.players).map(p => p.slot))
    for (const slot of [1, 2, 3, 4] as const) {
      if (!usedSlots.has(slot)) return slot
    }
    return 1
  }

  private async checkStartConditions() {
    if (!this.game) return
    const playerCount = Object.keys(this.game.players).length
    const readyCount = this.game.readyPlayerIds.length

    console.log('[CHECK_START]', { playerCount, readyCount, willStart: playerCount >= 2 && readyCount === playerCount })

    if (playerCount >= 2 && readyCount === playerCount) {
      await this.startCountdown()
    }
  }

  private async startCountdown() {
    if (!this.game) return
    console.log('[COUNTDOWN_START]', {
      players: Object.keys(this.game.players),
      readyPlayerIds: this.game.readyPlayerIds,
      wsCount: this.ctx.getWebSockets().length,
    })
    this.game.status = 'countdown'
    this.game.countdownRemaining = 3
    this.countdownRemaining = 3

    this.persistState()
    await this.updateRoomRegistry()
    this.broadcast({ type: 'event', name: 'countdown_tick', data: { count: 3 } })
    this.broadcastFullState()

    // Use alarm for countdown ticks (hibernation-compatible, no setInterval)
    await this.ctx.storage.setAlarm(Date.now() + 1000)
  }

  private async cancelCountdown(reason: string) {
    if (!this.game) return
    this.countdownRemaining = null
    this.game.status = 'waiting'
    this.game.countdownRemaining = null
    await this.ctx.storage.deleteAlarm()
    this.broadcast({ type: 'event', name: 'countdown_cancelled', data: { reason } })
    this.broadcastFullState()
    this.persistState()
  }

  private async updateRoomRegistry() {
    if (!this.game) return
    const matchmaker = this.env.MATCHMAKER.get(this.env.MATCHMAKER.idFromName('global'))
    await matchmaker.fetch(new Request('https://internal/register', {
      method: 'POST',
      body: JSON.stringify({
        roomCode: this.game.roomId,
        playerCount: Object.keys(this.game.players).length,
        status: this.game.status,
      })
    }))
  }

  private async startGame() {
    if (!this.game) return
    const playerCount = Object.keys(this.game.players).length
    const scaled = getScaledConfig(playerCount, this.game.config)

    console.log('[GAME_START]', {
      players: Object.entries(this.game.players).map(([id, p]) => ({ id, name: p.name, slot: p.slot })),
      wsCount: this.ctx.getWebSockets().length,
      mode: playerCount === 1 ? 'solo' : 'coop',
    })

    // Start in wipe_hold phase (skip exit for game start)
    this.game.status = 'wipe_hold'
    this.game.countdownRemaining = null
    this.countdownRemaining = null
    this.game.lives = scaled.lives
    this.game.tick = 0
    this.game.wipeTicksRemaining = WIPE_TIMING.HOLD_TICKS
    this.game.wipeWaveNumber = 1
    // Note: alienShootingDisabled is set via GAME_STATE_DEFAULTS in state-defaults.ts

    // Initialize barriers only - aliens created at wipe_hold→wipe_reveal transition
    this.game.entities = [
      ...this.createBarriers(playerCount),
    ]

    this.broadcast({ type: 'event', name: 'game_start', data: undefined })
    this.broadcastFullState()
    this.persistState()
    await this.updateRoomRegistry()

    // Use alarm for game tick (hibernation-compatible)
    // Game runs at 30Hz (33ms per tick) during wipe phases too
    await this.ctx.storage.setAlarm(Date.now() + this.game.config.tickIntervalMs)
  }

  /**
   * Alarm handler - runs game tick or countdown
   * Using alarms instead of setInterval allows DO to hibernate between ticks
   */
  async alarm() {
    // Handle countdown
    if (this.countdownRemaining !== null && this.countdownRemaining > 0) {
      this.countdownRemaining--
      if (this.game) this.game.countdownRemaining = this.countdownRemaining

      if (this.countdownRemaining === 0) {
        this.countdownRemaining = null
        await this.startGame()
      } else {
        this.broadcast({ type: 'event', name: 'countdown_tick', data: { count: this.countdownRemaining } })
        this.broadcastFullState()
        await this.ctx.storage.setAlarm(Date.now() + 1000)
      }
      return
    }

    // Handle game tick (including wipe phases)
    const activeStatuses = ['playing', 'wipe_exit', 'wipe_hold', 'wipe_reveal']
    if (!this.game || !activeStatuses.includes(this.game.status)) {
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
      void this.updateRoomRegistry()
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
    let sent = 0, failed = 0
    for (const ws of webSockets) {
      try {
        ws.send(data)
        sent++
      } catch (err) {
        failed++
        console.log('[BROADCAST] Send failed', { error: String(err) })
      }
    }
    // Log only on status changes or periodically to reduce noise
    if (this.game.status !== 'playing' || this.game.tick % 300 === 0) {
      console.log('[BROADCAST]', { status: this.game.status, wsCount: webSockets.length, sent, failed })
    }
  }

  private nextWave() {
    if (!this.game) return
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
  }

  private endGame(result: 'victory' | 'defeat') {
    if (!this.game) return
    this.game.status = 'game_over'
    // No need to clear interval - we use alarms which auto-stop
    this.broadcast({ type: 'event', name: 'game_over', data: { result } })
    this.broadcastFullState()
    this.persistState()
    void this.updateRoomRegistry()

    // Schedule cleanup alarm for 5 minutes
    void this.ctx.storage.setAlarm(Date.now() + 5 * 60 * 1000)
  }

  private createAlienFormationWithIds(cols: number, rows: number) {
    if (!this.game) return []
    // Use shared createAlienFormation with custom ID generator
    return createAlienFormation(
      cols,
      rows,
      this.game.config.width,
      () => this.generateEntityId()
    )
  }

  private createBarriers(playerCount: number): BarrierEntity[] {
    if (!this.game) return []
    const width = this.game.config.width
    const barrierCount = Math.min(4, playerCount + 2)
    const barriers: BarrierEntity[] = []
    const spacing = width / (barrierCount + 1)

    for (let i = 0; i < barrierCount; i++) {
      const x = Math.floor(spacing * (i + 1)) - 3
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
    delete this.game.players[playerId]
    this.game.readyPlayerIds = this.game.readyPlayerIds.filter(id => id !== playerId)

    const playerCount = Object.keys(this.game.players).length

    if (playerCount === 0) {
      if (this.game.status === 'playing') {
        this.endGame('defeat')
      }
      // Schedule cleanup
      await this.ctx.storage.setAlarm(Date.now() + 5 * 60 * 1000)
    } else if (playerCount === 1 && this.game.status === 'waiting') {
      this.game.mode = 'solo'
    }

    this.broadcast({ type: 'event', name: 'player_left', data: { playerId } })
    this.persistState()
    await this.updateRoomRegistry()
  }

  private broadcast(msg: ServerMessage) {
    const data = JSON.stringify(msg)
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(data) } catch {}
    }
  }

  /**
   * Send an error message to a specific WebSocket.
   * Centralizes error response formatting.
   */
  private sendError(ws: WebSocket, code: string, message: string) {
    ws.send(JSON.stringify({ type: 'error', code, message }))
  }

  private async cleanup() {
    if (this.game) {
      const matchmaker = this.env.MATCHMAKER.get(this.env.MATCHMAKER.idFromName('global'))
      await matchmaker.fetch(new Request('https://internal/unregister', {
        method: 'POST',
        body: JSON.stringify({ roomCode: this.game.roomId })
      }))
    }
    await this.ctx.storage.deleteAlarm()
    this.ctx.storage.sql.exec('DELETE FROM game_state')
    this.game = null
  }
}

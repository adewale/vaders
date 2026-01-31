#!/usr/bin/env bun
// client/src/observer.ts
// CLI diagnostic tool for observing game server messages in real-time

import type { GameState, ServerMessage, ServerEvent, ClientMessage, Entity } from '../../shared/types'

// ─── Configuration ───────────────────────────────────────────────────────────

const DEFAULT_SERVER_URL = 'https://vaders.adewale-883.workers.dev'
const LOCAL_SERVER_URL = 'http://localhost:8787'
const RECONNECT_DELAY_MS = 3000
const OBSERVER_NAME = 'Observer'

// ─── ANSI Color Codes ────────────────────────────────────────────────────────

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',

  // Message type colors
  sync: '\x1b[36m',      // cyan
  tick: '\x1b[90m',      // gray
  event: '\x1b[33m',     // yellow
  error: '\x1b[31m',     // red
  status: '\x1b[35m',    // magenta
  info: '\x1b[34m',      // blue
  success: '\x1b[32m',   // green

  // Entity colors
  alien: '\x1b[32m',     // green
  bullet: '\x1b[33m',    // yellow
  player: '\x1b[36m',    // cyan
  barrier: '\x1b[90m',   // gray
}

// ─── CLI Argument Parsing ────────────────────────────────────────────────────

interface ObserverOptions {
  serverUrl: string
  roomCode: string | null
  verbose: boolean
  name: string
  solo: boolean
}

function parseArgs(): ObserverOptions {
  const args = process.argv.slice(2)
  let serverUrl = DEFAULT_SERVER_URL
  let roomCode: string | null = null
  let verbose = false
  let name = OBSERVER_NAME
  let solo = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--local' || arg === '-l') {
      serverUrl = LOCAL_SERVER_URL
    } else if ((arg === '--room' || arg === '-r') && args[i + 1]) {
      roomCode = args[++i].toUpperCase()
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true
    } else if ((arg === '--name' || arg === '-n') && args[i + 1]) {
      name = args[++i]
    } else if (arg === '--solo' || arg === '-s') {
      solo = true
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else if (arg.startsWith('-')) {
      console.error(`${colors.error}Unknown option: ${arg}${colors.reset}`)
      printHelp()
      process.exit(1)
    }
  }

  return { serverUrl, roomCode, verbose, name, solo }
}

function printHelp() {
  console.log(`
${colors.bold}Vaders Observer${colors.reset} - Real-time game state diagnostic tool

${colors.bold}USAGE:${colors.reset}
  bun run observer [OPTIONS]

${colors.bold}OPTIONS:${colors.reset}
  --solo, -s            Start a solo game immediately after joining
  --local, -l           Connect to local server (localhost:8787)
  --room, -r CODE       Join specific room (auto-create if not specified)
  --verbose, -v         Show full state dump on status changes
  --name, -n NAME       Set observer name (default: Observer)
  --help, -h            Show this help message

${colors.bold}EXAMPLES:${colors.reset}
  bun run observer --solo            # Create room, start solo game, observe
  bun run observer --solo --verbose  # Solo game with full state dumps
  bun run observer --local --solo    # Solo game on local server
  bun run observer --room ABC123     # Join and observe existing room

${colors.bold}OUTPUT FORMAT:${colors.reset}
  ${colors.sync}[HH:MM:SS.mmm] SYNC${colors.reset}   Full state synchronization
  ${colors.tick}[HH:MM:SS.mmm] TICK${colors.reset}   Game tick update
  ${colors.event}[HH:MM:SS.mmm] EVENT${colors.reset}  Game event (kills, spawns, etc)
  ${colors.error}[HH:MM:SS.mmm] ERROR${colors.reset}  Server error
  ${colors.status}>>> STATUS CHANGE${colors.reset}    Game status transition
`)
}

// ─── Formatting Utilities ────────────────────────────────────────────────────

function timestamp(): string {
  const now = new Date()
  const h = now.getHours().toString().padStart(2, '0')
  const m = now.getMinutes().toString().padStart(2, '0')
  const s = now.getSeconds().toString().padStart(2, '0')
  const ms = now.getMilliseconds().toString().padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

function formatEntityCounts(entities: Entity[]): string {
  const counts = {
    aliens: 0,
    bullets: 0,
    barriers: 0,
    ufos: 0,
    entering: 0,
  }

  for (const entity of entities) {
    switch (entity.kind) {
      case 'alien':
        counts.aliens++
        if (entity.entering) counts.entering++
        break
      case 'bullet':
        counts.bullets++
        break
      case 'barrier':
        counts.barriers++
        break
      case 'ufo':
        counts.ufos++
        break
    }
  }

  const parts: string[] = []
  if (counts.aliens > 0) {
    const enteringStr = counts.entering > 0 ? ` (${counts.entering} entering)` : ''
    parts.push(`${colors.alien}aliens=${counts.aliens}${enteringStr}${colors.reset}`)
  }
  if (counts.bullets > 0) {
    parts.push(`${colors.bullet}bullets=${counts.bullets}${colors.reset}`)
  }
  if (counts.barriers > 0) {
    parts.push(`${colors.barrier}barriers=${counts.barriers}${colors.reset}`)
  }
  if (counts.ufos > 0) {
    parts.push(`${colors.event}ufos=${counts.ufos}${colors.reset}`)
  }

  return parts.length > 0 ? parts.join(' ') : 'entities=0'
}

function formatWipeState(state: GameState): string {
  if (state.wipeTicksRemaining != null) {
    return `wipeRemaining=${state.wipeTicksRemaining} wave=${state.wipeWaveNumber ?? '?'}`
  }
  return ''
}

function formatCompactState(state: GameState): string {
  const parts: string[] = [
    `status=${colors.bold}${state.status}${colors.reset}`,
  ]

  // Add wipe state if applicable
  const wipeStr = formatWipeState(state)
  if (wipeStr) parts.push(wipeStr)

  // Add entity counts
  parts.push(formatEntityCounts(state.entities))

  // Add game info
  parts.push(`score=${state.score}`)
  parts.push(`lives=${state.lives}`)
  parts.push(`wave=${state.wave}`)

  return parts.join(' ')
}

function formatVerboseState(state: GameState): string {
  const lines: string[] = []

  lines.push(`{`)
  lines.push(`  status: '${state.status}',`)
  lines.push(`  tick: ${state.tick},`)
  lines.push(`  wave: ${state.wave},`)
  lines.push(`  score: ${state.score},`)
  lines.push(`  lives: ${state.lives},`)

  if (state.wipeTicksRemaining !== null) {
    lines.push(`  wipeTicksRemaining: ${state.wipeTicksRemaining},`)
    lines.push(`  wipeWaveNumber: ${state.wipeWaveNumber},`)
  }

  if (state.countdownRemaining !== null) {
    lines.push(`  countdownRemaining: ${state.countdownRemaining},`)
  }

  // Players
  const playerCount = Object.keys(state.players).length
  lines.push(`  players: { // ${playerCount} player(s)`)
  for (const [id, player] of Object.entries(state.players)) {
    const readyStr = state.readyPlayerIds.includes(id) ? ' [READY]' : ''
    const aliveStr = player.alive ? '' : ' [DEAD]'
    lines.push(`    '${player.name}': x=${player.x} slot=${player.slot} lives=${player.lives}${readyStr}${aliveStr}`)
  }
  lines.push(`  },`)

  // Entity summary by type
  const byKind: Record<string, Entity[]> = {}
  for (const entity of state.entities) {
    if (!byKind[entity.kind]) byKind[entity.kind] = []
    byKind[entity.kind].push(entity)
  }

  lines.push(`  entities: [ // ${state.entities.length} total`)
  for (const [kind, entities] of Object.entries(byKind)) {
    if (kind === 'alien') {
      const entering = entities.filter(e => e.kind === 'alien' && e.entering).length
      const enteringStr = entering > 0 ? ` (${entering} entering)` : ''
      lines.push(`    // ${kind}: ${entities.length}${enteringStr}`)
    } else {
      lines.push(`    // ${kind}: ${entities.length}`)
    }
  }
  lines.push(`  ],`)

  lines.push(`}`)

  return lines.join('\n')
}

function formatEvent(event: ServerEvent): string {
  const name = event.name
  const data = event.data as Record<string, unknown>

  switch (name) {
    case 'player_joined':
      return `${colors.success}player_joined${colors.reset}: ${(data.player as { name: string }).name}`
    case 'player_left':
      return `${colors.event}player_left${colors.reset}: ${data.playerId}${data.reason ? ` (${data.reason})` : ''}`
    case 'player_ready':
      return `${colors.info}player_ready${colors.reset}: ${data.playerId}`
    case 'player_unready':
      return `${colors.dim}player_unready${colors.reset}: ${data.playerId}`
    case 'player_died':
      return `${colors.error}player_died${colors.reset}: ${data.playerId}`
    case 'player_respawned':
      return `${colors.success}player_respawned${colors.reset}: ${data.playerId}`
    case 'countdown_tick':
      return `${colors.bold}countdown_tick${colors.reset}: ${data.count}`
    case 'countdown_cancelled':
      return `${colors.event}countdown_cancelled${colors.reset}: ${data.reason}`
    case 'game_start':
      return `${colors.success}${colors.bold}game_start${colors.reset}`
    case 'alien_killed':
      return `${colors.alien}alien_killed${colors.reset}: ${data.alienId} by ${data.playerId ?? 'unknown'}`
    case 'score_awarded':
      return `${colors.success}score_awarded${colors.reset}: +${data.points} (${data.source}) to ${data.playerId ?? 'team'}`
    case 'wave_complete':
      return `${colors.success}${colors.bold}wave_complete${colors.reset}: wave ${data.wave}`
    case 'game_over':
      const result = data.result as string
      const resultColor = result === 'victory' ? colors.success : colors.error
      return `${resultColor}${colors.bold}game_over${colors.reset}: ${result}`
    case 'ufo_spawn':
      return `${colors.event}ufo_spawn${colors.reset}: x=${data.x}`
    default:
      return `${name}: ${JSON.stringify(data)}`
  }
}

// ─── Observer Class ──────────────────────────────────────────────────────────

class Observer {
  private options: ObserverOptions
  private ws: WebSocket | null = null
  private roomCode: string | null = null
  private playerId: string | null = null
  private lastStatus: string | null = null
  private connected = false
  private shouldReconnect = true

  constructor(options: ObserverOptions) {
    this.options = options
  }

  async start() {
    console.log(`\n${colors.bold}Vaders Observer${colors.reset}`)
    console.log(`${colors.dim}Server: ${this.options.serverUrl}${colors.reset}`)

    // Get or create room
    if (this.options.roomCode) {
      this.roomCode = this.options.roomCode
      console.log(`${colors.dim}Room: ${this.roomCode}${colors.reset}`)
    } else {
      console.log(`${colors.dim}Creating new room...${colors.reset}`)
      try {
        const response = await fetch(`${this.options.serverUrl}/room`, { method: 'POST' })
        const data = await response.json() as { roomCode: string }
        this.roomCode = data.roomCode
        console.log(`${colors.success}Room created: ${colors.bold}${this.roomCode}${colors.reset}`)
      } catch (err) {
        console.error(`${colors.error}Failed to create room: ${err}${colors.reset}`)
        process.exit(1)
      }
    }

    const modeStr = [
      this.options.verbose ? 'verbose' : 'compact',
      this.options.solo ? 'solo' : null,
    ].filter(Boolean).join(', ')
    console.log(`${colors.dim}Mode: ${modeStr}${colors.reset}`)
    console.log(`${colors.dim}Press Ctrl+C to exit${colors.reset}\n`)
    console.log(`${colors.dim}${'─'.repeat(80)}${colors.reset}\n`)

    this.connect()

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      this.shouldReconnect = false
      this.disconnect()
      console.log(`\n${colors.dim}Observer disconnected${colors.reset}`)
      process.exit(0)
    })
  }

  private connect() {
    const wsUrl = `${this.options.serverUrl.replace('http', 'ws')}/room/${this.roomCode}/ws`

    console.log(`${colors.info}[${timestamp()}] CONNECTING${colors.reset} ${wsUrl}`)

    try {
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        this.connected = true
        console.log(`${colors.success}[${timestamp()}] CONNECTED${colors.reset}`)

        // Send join message
        this.send({ type: 'join', name: this.options.name })

        // If solo mode, start solo game after a short delay to allow join to complete
        if (this.options.solo) {
          setTimeout(() => {
            console.log(`${colors.info}[${timestamp()}] STARTING SOLO GAME${colors.reset}`)
            this.send({ type: 'start_solo' })
          }, 100)
        }
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data as string)
      }

      this.ws.onclose = () => {
        this.connected = false
        console.log(`${colors.error}[${timestamp()}] DISCONNECTED${colors.reset}`)

        if (this.shouldReconnect) {
          console.log(`${colors.dim}Reconnecting in ${RECONNECT_DELAY_MS / 1000}s...${colors.reset}`)
          setTimeout(() => this.connect(), RECONNECT_DELAY_MS)
        }
      }

      this.ws.onerror = (err) => {
        console.error(`${colors.error}[${timestamp()}] WebSocket error${colors.reset}`)
      }
    } catch (err) {
      console.error(`${colors.error}[${timestamp()}] Failed to connect: ${err}${colors.reset}`)

      if (this.shouldReconnect) {
        setTimeout(() => this.connect(), RECONNECT_DELAY_MS)
      }
    }
  }

  private disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  private send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  private handleMessage(data: string) {
    try {
      const msg: ServerMessage = JSON.parse(data)

      switch (msg.type) {
        case 'sync':
          this.handleSync(msg.state, msg.playerId)
          break
        case 'event':
          this.handleEvent(msg as ServerEvent)
          break
        case 'error':
          this.handleError(msg.code, msg.message)
          break
        case 'pong':
          // Ignore pong messages
          break
      }
    } catch (err) {
      console.error(`${colors.error}[${timestamp()}] Failed to parse message: ${err}${colors.reset}`)
    }
  }

  private handleSync(state: GameState, playerId?: string) {
    // Store player ID on first sync
    if (playerId && !this.playerId) {
      this.playerId = playerId
    }

    // Check for status change
    const statusChanged = this.lastStatus !== null && this.lastStatus !== state.status

    if (statusChanged) {
      console.log(`\n${colors.status}${colors.bold}>>> STATUS CHANGE: ${this.lastStatus} -> ${state.status}${colors.reset}`)

      if (this.options.verbose) {
        console.log(formatVerboseState(state))
      }

      console.log()
    }

    this.lastStatus = state.status

    // Determine if this is initial sync or tick
    const isInitialSync = !statusChanged && state.tick === 0
    const playerCount = Object.keys(state.players).length

    if (isInitialSync || statusChanged) {
      // Full sync output
      console.log(
        `${colors.sync}[${timestamp()}] SYNC${colors.reset} ` +
        `roomId=${state.roomId} players=${playerCount} ` +
        formatCompactState(state)
      )
    } else {
      // Tick output (compact)
      console.log(
        `${colors.tick}[${timestamp()}] TICK${colors.reset} ` +
        `#${state.tick.toString().padStart(4)} ` +
        formatCompactState(state)
      )
    }
  }

  private handleEvent(event: ServerEvent) {
    console.log(
      `${colors.event}[${timestamp()}] EVENT${colors.reset} ` +
      formatEvent(event)
    )
  }

  private handleError(code: string, message: string) {
    console.log(
      `${colors.error}[${timestamp()}] ERROR${colors.reset} ` +
      `${colors.bold}${code}${colors.reset}: ${message}`
    )
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const options = parseArgs()
  const observer = new Observer(options)
  await observer.start()
}

main().catch((err) => {
  console.error(`${colors.error}Fatal error: ${err}${colors.reset}`)
  process.exit(1)
})

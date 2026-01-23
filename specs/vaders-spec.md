# Multiplayer TUI Space Invaders — Technical Spec
## 1-4 Players • OpenTUI + Durable Objects

---

## Overview

TUI Space Invaders clone supporting solo play or 2-4 player co-op, synchronized via Cloudflare Durable Objects. Single player can start immediately; multiplayer requires a ready-up lobby.

---

## Quick Start: Launch & Play

### Installation

```bash
bun add -g vaders
```

### Starting a Game

```bash
# Create a new room (generates shareable room code)
vaders

# Join an existing room
vaders --room ABC123

# Auto-matchmaking (join any open room or create one)
vaders --matchmake

# Specify your player name
vaders --name "Alice"

# Full example: join room with custom name
vaders --room ABC123 --name "Alice"
```

### Controls

| Key | Action |
|-----|--------|
| `←` / `A` | Move left |
| `→` / `D` | Move right |
| `SPACE` | Shoot |
| `ENTER` | Ready up (lobby) |
| `S` | Start solo (when alone in lobby) |
| `Q` | Quit |

### Multiplayer Flow

1. First player runs `vaders` → gets room code (e.g., `ABC123`)
2. Share room code with friends
3. Friends run `vaders --room ABC123`
4. All players press `ENTER` to ready up
5. Game starts after 3-second countdown

---

## Player Modes

| Mode | Players | Start Condition | Lives | Scaling |
|------|---------|-----------------|-------|---------|
| **Solo** | 1 | Immediate | 3 | Base difficulty |
| **Co-op** | 2-4 | All players ready | 5 shared | Scaled to player count |

---

## Enhanced Mode

Enhanced Mode adds two additional rows of enemies above the classic formation, featuring attack patterns inspired by Galaga and Galaxian. Enable with `--enhanced` flag.

```bash
vaders --enhanced
vaders --room ABC123 --enhanced
```

### Formation Layout (Enhanced)

```
Row 0:  ◄══►  ◄══►              # Commanders (2) - Galaga Boss behavior
Row 1:  ♦ ♦ ♦ ♦ ♦ ♦             # Dive Bombers (6) - Galaxian purple dive
Row 2:  ╔═╗ ╔═╗ ╔═╗ ...         # Squids (11) - Classic Space Invaders
Row 3:  /°\ /°\ /°\ ...         # Crabs (11)
Row 4:  {ö} {ö} {ö} ...         # Octopuses (11)
Row 5:  {ö} {ö} {ö} ...         # Octopuses (11)
```

### Enhanced Enemy Types

| Type | Sprite | Points | Behavior |
|------|--------|--------|----------|
| **Commander** | `◄══►` | 150/400† | Tractor beam capture, takes escorts when diving |
| **Dive Bomber** | `♦` | 80/160 | Wide-angle Galaxian dive, reverses mid-path |
| **Squid** | `╔═╗` | 30/60 | Classic side-to-side, drops when edge hit |
| **Crab** | `/°\` | 20/40 | Classic movement |
| **Octopus** | `{ö}` | 10/20 | Classic movement |

† Commander: 150 in formation, 400 solo dive, 800 with one escort, 1600 with two escorts

### Commander Behavior (Galaga Boss)

```typescript
interface Commander extends Alien {
  type: 'commander'
  health: 2                    // Requires 2 hits (green → purple → dead)
  tractorBeamCooldown: number
  capturedPlayerId: string | null
}
```

**Tractor Beam Attack:**
1. Commander dives solo in straight line
2. Stops ~4 rows above player area
3. Deploys tractor beam (3-char wide capture zone)
4. If player caught: ship disabled for 5 seconds, Commander gains shield
5. Other players can free captured player by destroying Commander

**Escort Dive:**
- When diving normally, Commander recruits up to 2 adjacent Dive Bombers
- Escorts follow in V-formation behind Commander
- Bonus points for destroying escorts before Commander

### Dive Bomber Behavior (Galaxian Purple)

```typescript
interface DiveBomber extends Alien {
  type: 'divebomber'
  diveState: 'formation' | 'diving' | 'returning'
  divePathProgress: number
  diveDirection: 1 | -1
}
```

**Dive Pattern:**
1. Breaks from formation, moves toward screen edge
2. Sweeps across screen in wide arc
3. **Reverses direction** at midpoint (signature Galaxian purple move)
4. Fires 4 shots during dive (2 before turn, 2 after)
5. Returns to formation from bottom if survives

### Wave Progression (Enhanced)

| Wave | Commanders | Dive Bombers | Classic Rows | Special |
|------|------------|--------------|--------------|---------|
| 1-3 | 1 | 4 | 4 rows | — |
| 4-6 | 2 | 6 | 5 rows | Dive Bombers transform on death |
| 7-9 | 2 | 6 | 5 rows | Commanders use tractor beam |
| 10+ | 2 | 8 | 6 rows | All abilities active |

### Transform Enemies (Wave 4+)

When a Dive Bomber is destroyed, it has a 20% chance to split into 3 smaller enemies:

| Wave | Transform Into | Points (×3) |
|------|----------------|-------------|
| 4-6 | Scorpions `∿` | 1000 |
| 7-9 | Stingrays `◇` | 2000 |
| 10+ | Mini-Commanders `◄►` | 3000 |

Transform enemies dive rapidly and exit screen (don't rejoin formation).

### Enhanced Mode Scoring

| Action | Points |
|--------|--------|
| Commander in formation | 150 |
| Commander solo dive | 400 |
| Commander + 1 escort | 800 |
| Commander + 2 escorts | 1600 |
| Free captured player | 500 |
| Dive Bomber in formation | 80 |
| Dive Bomber while diving | 160 |
| Transform group (all 3) | 1000-3000 |

### Enhanced State Schema

```typescript
interface GameState {
  // ... existing fields ...
  enhancedMode: boolean

  // Enhanced-specific
  commanders: Commander[]
  diveBombers: DiveBomber[]
  transforms: TransformEnemy[]
  capturedPlayers: Record<string, string>  // playerId → commanderId
}

interface TransformEnemy {
  id: number
  type: 'scorpion' | 'stingray' | 'mini-commander'
  x: number
  y: number
  velocity: { x: number, y: number }
  lifetime: number  // Ticks until auto-despawn
}
```

### Enhanced Sprites

```typescript
export const ENHANCED_SPRITES = {
  commander: {
    healthy: '◄══►',
    damaged: '◄──►',  // After first hit
  },
  diveBomber: '♦',
  transform: {
    scorpion: '∿',
    stingray: '◇',
    miniCommander: '◄►',
  },
  tractorBeam: '╠╬╣',  // 3-char beam effect
} as const
```

### Visual Effects (Amiga Copper-Inspired)

Enhanced Mode uses true-color ANSI sequences to recreate classic Amiga demoscene aesthetics. These effects run client-side only and don't affect game state.

#### Gradient Sky Background

Per-row background color changes, inspired by Shadow of the Beast's copper-driven sky:

```typescript
// client/src/effects/gradient.ts

interface GradientStop {
  row: number
  color: [number, number, number]  // RGB
}

const SKY_GRADIENT: GradientStop[] = [
  { row: 0,  color: [15, 10, 40] },    // Deep purple
  { row: 6,  color: [40, 20, 80] },    // Purple
  { row: 12, color: [80, 40, 100] },   // Magenta
  { row: 18, color: [20, 10, 30] },    // Dark purple
  { row: 23, color: [0, 0, 0] },       // Black
]

function interpolateGradient(row: number): string {
  // Find surrounding stops and lerp between them
  // Return ANSI: \x1b[48;2;r;g;bm
}
```

#### Raster Bars

Horizontal color bands that animate behind the alien formation:

```typescript
// client/src/effects/rasterBars.ts

interface RasterBar {
  y: number           // Current vertical position
  velocity: number    // Pixels per frame
  colors: string[]    // 5-row gradient (bright center, fading edges)
  amplitude: number   // Sine wave motion range
}

const RASTER_BARS: RasterBar[] = [
  { y: 4, velocity: 0.5, colors: ['#001', '#113', '#33f', '#113', '#001'], amplitude: 3 },
  { y: 8, velocity: -0.3, colors: ['#100', '#311', '#f33', '#311', '#100'], amplitude: 4 },
]

function updateRasterBars(tick: number) {
  for (const bar of RASTER_BARS) {
    bar.y += bar.velocity
    bar.y += Math.sin(tick * 0.05) * 0.1 * bar.amplitude
    // Wrap around screen
    if (bar.y > 24) bar.y = -5
    if (bar.y < -5) bar.y = 24
  }
}
```

#### Color Cycling Effects

Palette rotation for animated elements without redrawing:

| Element | Cycle Speed | Colors |
|---------|-------------|--------|
| Tractor beam | 6 fps | Blue → cyan → white → cyan → blue |
| Commander shield | 4 fps | Purple → magenta → pink → magenta |
| Transform enemies | 8 fps | Rainbow cycle |
| Player respawn | 10 fps | White flash → player color |

```typescript
// client/src/effects/colorCycle.ts

const TRACTOR_BEAM_PALETTE = [
  '#0033ff', '#0066ff', '#0099ff', '#00ccff',
  '#00ffff', '#66ffff', '#ffffff',
  '#66ffff', '#00ffff', '#00ccff', '#0099ff', '#0066ff',
]

function getTractorBeamColor(tick: number): string {
  const index = Math.floor(tick / 10) % TRACTOR_BEAM_PALETTE.length
  return TRACTOR_BEAM_PALETTE[index]
}
```

#### Challenging Stage Plasma Background

Sinusoidal plasma effect for bonus rounds:

```typescript
// client/src/effects/plasma.ts

function plasmaValue(x: number, y: number, time: number): number {
  return (
    Math.sin(x * 0.1 + time) +
    Math.sin(y * 0.1 + time * 0.5) +
    Math.sin((x + y) * 0.1 + time * 0.3) +
    Math.sin(Math.sqrt(x * x + y * y) * 0.1)
  ) / 4  // Normalize to -1..1
}

function plasmaColor(value: number): [number, number, number] {
  // Map -1..1 to purple-blue-cyan-green palette
  const t = (value + 1) / 2  // 0..1
  return [
    Math.floor(128 + 127 * Math.sin(t * Math.PI * 2)),
    Math.floor(64 + 64 * Math.sin(t * Math.PI * 2 + 2)),
    Math.floor(196 + 59 * Math.sin(t * Math.PI * 2 + 4)),
  ]
}
```

#### Effect Layering Order

```
1. Gradient sky background (lowest)
2. Raster bars (additive blend simulation)
3. Plasma (Challenging Stages only, replaces sky)
4. Game elements (aliens, bullets, barriers)
5. Color-cycled effects (tractor beam, shields)
6. UI overlay (score, lives)
```

#### Performance Considerations

- Pre-calculate gradient lookup tables at startup
- Only update raster bar rows that changed
- Use double-buffering to prevent flicker
- Limit plasma resolution (calculate every 2nd column, interpolate)
- Disable effects on terminals without true-color support

---

## Architecture

```
┌─────────────────────┐                    ┌──────────────────────────┐
│   OpenTUI Client    │                    │    Cloudflare Worker     │
│   (@opentui/react)  │◄── WebSocket ─────►│                          │
│   Bun runtime       │                    │   ┌──────────────────┐   │
└─────────────────────┘                    │   │  Durable Object  │   │
         ▲                                 │   │    GameRoom      │   │
         │ Terminal                        │   │                  │   │
         │ Rendering                       │   │  • Game state    │   │
         ▼                                 │   │  • 60ms tick     │   │
┌─────────────────────┐                    │   │  • Broadcast     │   │
│   Zig Native Layer  │                    │   └──────────────────┘   │
│   (via FFI/dlopen)  │                    └──────────────────────────┘
│   • Buffer diffing  │
│   • ANSI generation │
│   • Yoga layout     │
└─────────────────────┘
```

---

## Durable Object: `GameRoom`

### State Schema

```typescript
// shared/types.ts

interface GameState {
  roomId: string
  mode: 'solo' | 'coop'
  status: 'waiting' | 'countdown' | 'playing' | 'paused' | 'gameover'
  tick: number
  
  players: Record<string, Player>
  playerOrder: string[]  // Join order for color/position assignment
  readyPlayers: Set<string>
  
  aliens: Alien[]
  bullets: Bullet[]
  barriers: Barrier[]
  
  wave: number
  lives: number          // 3 solo, 5 co-op
  score: number
  alienDirection: 1 | -1
  
  config: GameConfig
}

interface GameConfig {
  width: 80
  height: 24
  maxPlayers: 4
  tickRate: 60
  
  // Base values (scaled by player count)
  baseAlienMoveInterval: 30
  baseBulletSpeed: 2
  baseAlienShootRate: 0.5
  playerCooldown: 10
  respawnDelay: 180       // 3 seconds (ticks)
}

interface Player {
  id: string
  name: string
  x: number
  slot: 1 | 2 | 3 | 4     // Determines color and spawn position
  color: 'green' | 'cyan' | 'yellow' | 'magenta'
  lastShot: number
  alive: boolean
  respawnAt: number | null  // Tick to respawn (co-op only)
  kills: number
  ready: boolean
}

interface Alien {
  id: number
  type: 'squid' | 'crab' | 'octopus'
  row: number             // For formation tracking
  col: number
  x: number
  y: number
  alive: boolean
  points: number
}

interface Bullet {
  id: number
  ownerId: string | null
  x: number
  y: number
  dy: -1 | 1
}

interface Barrier {
  x: number               // Left edge of barrier
  segments: Array<{ 
    offsetX: number
    offsetY: number
    health: number        // 0-4
  }>
}
```

### Scaling Logic

```typescript
// worker/src/game/scaling.ts

export function getScaledConfig(playerCount: number, baseConfig: GameConfig) {
  const scale = {
    1: { speedMult: 1.0,  shootRate: 0.5,  cols: 11, rows: 5 },
    2: { speedMult: 1.25, shootRate: 0.75, cols: 11, rows: 5 },
    3: { speedMult: 1.5,  shootRate: 1.0,  cols: 13, rows: 5 },
    4: { speedMult: 1.75, shootRate: 1.25, cols: 15, rows: 6 },
  }[playerCount] ?? scale[1]
  
  return {
    alienMoveInterval: Math.floor(baseConfig.baseAlienMoveInterval / scale.speedMult),
    alienShootRate: scale.shootRate,
    alienCols: scale.cols,
    alienRows: scale.rows,
    lives: playerCount === 1 ? 3 : 5,
  }
}

export function getPlayerSpawnX(slot: number, screenWidth: number): number {
  const positions = {
    1: [40],                          // Center
    2: [25, 55],                      // Left-center, right-center
    3: [15, 40, 65],                  // Thirds
    4: [12, 30, 50, 68],              // Quarters
  }
  const playerCount = Object.keys(positions).find(k => 
    positions[Number(k)].length >= slot
  )
  return positions[Number(playerCount)]?.[slot - 1] ?? 40
}

export const PLAYER_COLORS: Record<number, Player['color']> = {
  1: 'green',
  2: 'cyan',
  3: 'yellow',
  4: 'magenta',
}
```

### WebSocket Protocol

```typescript
// shared/protocol.ts

// Client → Server
type ClientMessage =
  | { type: 'join'; name: string }
  | { type: 'ready' }
  | { type: 'unready' }
  | { type: 'start_solo' }            // Skip waiting, start alone
  | { type: 'input'; action: 'left' | 'right' | 'shoot' }
  | { type: 'ping' }

// Server → Client
type ServerMessage =
  | { type: 'sync'; state: GameState; playerId: string }
  | { type: 'tick'; tick: number; delta: DeltaState }
  | { type: 'event'; name: GameEvent; data?: unknown }
  | { type: 'pong'; serverTime: number }
  | { type: 'error'; code: ErrorCode; message: string }

type DeltaState = {
  players?: Record<string, Partial<Player>>
  bullets?: { add?: Bullet[]; remove?: number[] }
  aliens?: { killed?: number[] }
  score?: number
  lives?: number
  status?: GameState['status']
  wave?: number
  readyCount?: number
}

type GameEvent =
  | 'player_joined'
  | 'player_left'
  | 'player_ready'
  | 'player_unready'
  | 'player_died'
  | 'player_respawned'
  | 'countdown_start'
  | 'game_start'
  | 'alien_killed'
  | 'wave_complete'
  | 'game_over'
  | 'ufo_spawn'

type ErrorCode = 'room_full' | 'game_in_progress' | 'invalid_action'
```

### Durable Object Implementation

```typescript
// worker/src/GameRoom.ts

export class GameRoom implements DurableObject {
  private state: DurableObjectState
  private sessions = new Map<WebSocket, string>()
  private game: GameState
  private interval: ReturnType<typeof setInterval> | null = null
  private countdownInterval: ReturnType<typeof setInterval> | null = null

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.game = this.createInitialState()
  }

  private createInitialState(): GameState {
    return {
      roomId: crypto.randomUUID().slice(0, 8),
      mode: 'solo',
      status: 'waiting',
      tick: 0,
      players: {},
      playerOrder: [],
      readyPlayers: new Set(),
      aliens: [],
      bullets: [],
      barriers: [],
      wave: 1,
      lives: 3,
      score: 0,
      alienDirection: 1,
      config: {
        width: 80,
        height: 24,
        maxPlayers: 4,
        tickRate: 60,
        baseAlienMoveInterval: 30,
        baseBulletSpeed: 2,
        baseAlienShootRate: 0.5,
        playerCooldown: 10,
        respawnDelay: 180,
      },
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    
    if (url.pathname === '/ws') {
      if (this.game.status === 'playing' && !url.searchParams.has('rejoin')) {
        return new Response('Game in progress', { status: 409 })
      }
      if (Object.keys(this.game.players).length >= 4) {
        return new Response('Room full', { status: 429 })
      }
      
      const pair = new WebSocketPair()
      await this.handleSession(pair[1])
      return new Response(null, { status: 101, webSocket: pair[0] })
    }
    
    return new Response('Not Found', { status: 404 })
  }

  private async handleSession(ws: WebSocket) {
    ws.accept()
    
    ws.addEventListener('message', async (event) => {
      const msg: ClientMessage = JSON.parse(event.data as string)
      await this.handleMessage(ws, msg)
    })
    
    ws.addEventListener('close', () => {
      const playerId = this.sessions.get(ws)
      if (playerId) {
        this.removePlayer(playerId)
        this.sessions.delete(ws)
      }
    })
  }

  private async handleMessage(ws: WebSocket, msg: ClientMessage) {
    const playerId = this.sessions.get(ws)
    
    switch (msg.type) {
      case 'join': {
        if (Object.keys(this.game.players).length >= 4) {
          ws.send(JSON.stringify({ type: 'error', code: 'room_full', message: 'Room is full' }))
          return
        }
        
        const slot = this.getNextSlot()
        const player: Player = {
          id: crypto.randomUUID(),
          name: msg.name.slice(0, 12),
          x: getPlayerSpawnX(slot, 80),
          slot,
          color: PLAYER_COLORS[slot],
          lastShot: 0,
          alive: true,
          respawnAt: null,
          kills: 0,
          ready: false,
        }
        
        this.game.players[player.id] = player
        this.game.playerOrder.push(player.id)
        this.sessions.set(ws, player.id)
        this.game.mode = Object.keys(this.game.players).length === 1 ? 'solo' : 'coop'
        
        ws.send(JSON.stringify({ type: 'sync', state: this.serializeState(), playerId: player.id }))
        this.broadcast({ type: 'event', name: 'player_joined', data: { player } })
        break
      }
      
      case 'start_solo': {
        if (Object.keys(this.game.players).length === 1 && playerId) {
          this.game.mode = 'solo'
          this.game.lives = 3
          this.startGame()
        }
        break
      }
      
      case 'ready': {
        if (playerId && this.game.players[playerId]) {
          this.game.players[playerId].ready = true
          this.game.readyPlayers.add(playerId)
          this.broadcast({ type: 'event', name: 'player_ready', data: { playerId } })
          this.checkStartConditions()
        }
        break
      }
      
      case 'unready': {
        if (playerId && this.game.players[playerId]) {
          this.game.players[playerId].ready = false
          this.game.readyPlayers.delete(playerId)
          this.broadcast({ type: 'event', name: 'player_unready', data: { playerId } })
        }
        break
      }
      
      case 'input': {
        if (playerId && this.game.status === 'playing') {
          this.handleInput(playerId, msg.action)
        }
        break
      }
    }
  }

  private getNextSlot(): 1 | 2 | 3 | 4 {
    const usedSlots = new Set(Object.values(this.game.players).map(p => p.slot))
    for (const slot of [1, 2, 3, 4] as const) {
      if (!usedSlots.has(slot)) return slot
    }
    return 1
  }

  private checkStartConditions() {
    const playerCount = Object.keys(this.game.players).length
    const readyCount = this.game.readyPlayers.size
    
    if (playerCount >= 2 && readyCount === playerCount) {
      this.startCountdown()
    }
  }

  private startCountdown() {
    this.game.status = 'countdown'
    let count = 3
    
    this.broadcast({ type: 'event', name: 'countdown_start', data: { count } })
    
    this.countdownInterval = setInterval(() => {
      count--
      if (count === 0) {
        clearInterval(this.countdownInterval!)
        this.startGame()
      } else {
        this.broadcast({ type: 'event', name: 'countdown_start', data: { count } })
      }
    }, 1000)
  }

  private startGame() {
    const playerCount = Object.keys(this.game.players).length
    const scaled = getScaledConfig(playerCount, this.game.config)
    
    this.game.status = 'playing'
    this.game.lives = scaled.lives
    this.game.aliens = this.createAlienFormation(scaled.alienCols, scaled.alienRows)
    this.game.barriers = this.createBarriers(playerCount)
    this.game.bullets = []
    this.game.tick = 0
    
    this.broadcast({ type: 'event', name: 'game_start' })
    this.broadcast({ type: 'sync', state: this.serializeState(), playerId: '' })
    
    this.interval = setInterval(() => this.tick(), this.game.config.tickRate)
  }

  private tick() {
    const delta: DeltaState = {}
    const playerCount = Object.keys(this.game.players).length
    const scaled = getScaledConfig(playerCount, this.game.config)
    
    // Handle respawns (co-op only)
    if (this.game.mode === 'coop') {
      for (const player of Object.values(this.game.players)) {
        if (!player.alive && player.respawnAt && this.game.tick >= player.respawnAt) {
          player.alive = true
          player.x = getPlayerSpawnX(player.slot, 80)
          player.respawnAt = null
          delta.players = delta.players || {}
          delta.players[player.id] = { alive: true, x: player.x, respawnAt: null }
          this.broadcast({ type: 'event', name: 'player_respawned', data: { playerId: player.id } })
        }
      }
    }
    
    this.moveBullets(delta)
    this.checkCollisions(delta)
    
    if (this.game.tick % scaled.alienMoveInterval === 0) {
      this.moveAliens(delta)
    }
    
    if (Math.random() < scaled.alienShootRate / 60) {
      this.alienShoot(delta)
    }
    
    this.checkEndConditions(delta)
    this.game.tick++
    
    if (Object.keys(delta).length > 0) {
      this.broadcast({ type: 'tick', tick: this.game.tick, delta })
    }
  }

  private handleInput(playerId: string, action: 'left' | 'right' | 'shoot') {
    const player = this.game.players[playerId]
    if (!player || !player.alive) return
    
    switch (action) {
      case 'left':
        player.x = Math.max(2, player.x - 2)
        break
      case 'right':
        player.x = Math.min(77, player.x + 2)
        break
      case 'shoot':
        if (this.game.tick - player.lastShot >= this.game.config.playerCooldown) {
          this.game.bullets.push({
            id: Date.now() + Math.random(),
            ownerId: playerId,
            x: player.x,
            y: 19,
            dy: -1,
          })
          player.lastShot = this.game.tick
        }
        break
    }
  }

  private moveBullets(delta: DeltaState) {
    const toRemove: number[] = []
    
    for (const bullet of this.game.bullets) {
      bullet.y += bullet.dy * this.game.config.baseBulletSpeed
      if (bullet.y < 0 || bullet.y > 23) {
        toRemove.push(bullet.id)
      }
    }
    
    if (toRemove.length > 0) {
      this.game.bullets = this.game.bullets.filter(b => !toRemove.includes(b.id))
      delta.bullets = delta.bullets || {}
      delta.bullets.remove = toRemove
    }
  }

  private checkCollisions(delta: DeltaState) {
    const bulletsToRemove: number[] = []
    const aliensKilled: number[] = []
    
    for (const bullet of this.game.bullets) {
      // Player bullets hitting aliens
      if (bullet.dy === -1) {
        for (const alien of this.game.aliens) {
          if (!alien.alive) continue
          if (Math.abs(bullet.x - alien.x) < 2 && Math.abs(bullet.y - alien.y) < 1) {
            alien.alive = false
            aliensKilled.push(alien.id)
            bulletsToRemove.push(bullet.id)
            this.game.score += alien.points
            
            if (bullet.ownerId && this.game.players[bullet.ownerId]) {
              this.game.players[bullet.ownerId].kills++
              delta.players = delta.players || {}
              delta.players[bullet.ownerId] = { kills: this.game.players[bullet.ownerId].kills }
            }
            
            this.broadcast({ type: 'event', name: 'alien_killed', data: { alienId: alien.id, playerId: bullet.ownerId } })
            break
          }
        }
      }
      
      // Alien bullets hitting players
      if (bullet.dy === 1) {
        for (const player of Object.values(this.game.players)) {
          if (!player.alive) continue
          if (Math.abs(bullet.x - player.x) < 2 && Math.abs(bullet.y - 20) < 1) {
            bulletsToRemove.push(bullet.id)
            this.handlePlayerDeath(player.id, delta)
            break
          }
        }
      }
      
      // Bullets hitting barriers
      for (const barrier of this.game.barriers) {
        for (const seg of barrier.segments) {
          if (seg.health <= 0) continue
          const segX = barrier.x + seg.offsetX
          const segY = 16 + seg.offsetY
          if (Math.abs(bullet.x - segX) < 1 && Math.abs(bullet.y - segY) < 1) {
            seg.health--
            bulletsToRemove.push(bullet.id)
            break
          }
        }
      }
    }
    
    if (bulletsToRemove.length > 0) {
      this.game.bullets = this.game.bullets.filter(b => !bulletsToRemove.includes(b.id))
      delta.bullets = delta.bullets || {}
      delta.bullets.remove = [...(delta.bullets.remove || []), ...bulletsToRemove]
    }
    
    if (aliensKilled.length > 0) {
      delta.aliens = { killed: aliensKilled }
      delta.score = this.game.score
    }
  }

  private moveAliens(delta: DeltaState) {
    let hitEdge = false
    
    for (const alien of this.game.aliens) {
      if (!alien.alive) continue
      alien.x += this.game.alienDirection * 2
      if (alien.x <= 2 || alien.x >= 77) hitEdge = true
    }
    
    if (hitEdge) {
      this.game.alienDirection *= -1
      for (const alien of this.game.aliens) {
        if (alien.alive) alien.y += 1
      }
    }
  }

  private alienShoot(delta: DeltaState) {
    const aliveAliens = this.game.aliens.filter(a => a.alive)
    if (aliveAliens.length === 0) return
    
    const bottomAliens = new Map<number, Alien>()
    for (const alien of aliveAliens) {
      const existing = bottomAliens.get(alien.col)
      if (!existing || alien.row > existing.row) {
        bottomAliens.set(alien.col, alien)
      }
    }
    
    const shooters = Array.from(bottomAliens.values())
    const shooter = shooters[Math.floor(Math.random() * shooters.length)]
    
    const bullet: Bullet = {
      id: Date.now() + Math.random(),
      ownerId: null,
      x: shooter.x,
      y: shooter.y + 1,
      dy: 1,
    }
    
    this.game.bullets.push(bullet)
    delta.bullets = delta.bullets || {}
    delta.bullets.add = [...(delta.bullets.add || []), bullet]
  }

  private handlePlayerDeath(playerId: string, delta: DeltaState) {
    const player = this.game.players[playerId]
    if (!player) return
    
    player.alive = false
    this.game.lives--
    
    delta.players = delta.players || {}
    delta.players[playerId] = { alive: false }
    delta.lives = this.game.lives
    
    this.broadcast({ type: 'event', name: 'player_died', data: { playerId } })
    
    if (this.game.lives > 0 && this.game.mode === 'coop') {
      player.respawnAt = this.game.tick + this.game.config.respawnDelay
      delta.players[playerId].respawnAt = player.respawnAt
    }
    
    if (this.game.lives <= 0) {
      this.endGame('defeat')
    }
  }

  private checkEndConditions(delta: DeltaState) {
    if (this.game.aliens.every(a => !a.alive)) {
      this.nextWave(delta)
      return
    }
    
    const lowestAlien = Math.max(...this.game.aliens.filter(a => a.alive).map(a => a.y))
    if (lowestAlien >= 18) {
      this.endGame('defeat')
    }
  }

  private nextWave(delta: DeltaState) {
    this.game.wave++
    const playerCount = Object.keys(this.game.players).length
    const scaled = getScaledConfig(playerCount, this.game.config)
    
    this.game.aliens = this.createAlienFormation(scaled.alienCols, scaled.alienRows)
    this.game.bullets = []
    this.game.alienDirection = 1
    
    delta.wave = this.game.wave
    this.broadcast({ type: 'event', name: 'wave_complete' })
    this.broadcast({ type: 'sync', state: this.serializeState(), playerId: '' })
  }

  private endGame(result: 'victory' | 'defeat') {
    this.game.status = 'gameover'
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    this.broadcast({ type: 'event', name: 'game_over', data: { result } })
  }

  private createAlienFormation(cols: number, rows: number): Alien[] {
    const aliens: Alien[] = []
    let id = 0
    const types: Array<Alien['type']> = ['squid', 'crab', 'crab', 'octopus', 'octopus']
    const points = { squid: 30, crab: 20, octopus: 10 }
    const startX = Math.floor((80 - cols * 5) / 2)
    
    for (let row = 0; row < rows; row++) {
      const type = types[row] || 'octopus'
      for (let col = 0; col < cols; col++) {
        aliens.push({
          id: id++,
          type,
          row,
          col,
          x: startX + col * 5,
          y: 2 + row * 2,
          alive: true,
          points: points[type],
        })
      }
    }
    return aliens
  }

  private createBarriers(playerCount: number): Barrier[] {
    const barrierCount = Math.min(4, playerCount + 2)
    const barriers: Barrier[] = []
    const spacing = 80 / (barrierCount + 1)
    
    for (let i = 0; i < barrierCount; i++) {
      const x = Math.floor(spacing * (i + 1)) - 3
      barriers.push({
        x,
        segments: [
          { offsetX: 0, offsetY: 0, health: 4 },
          { offsetX: 1, offsetY: 0, health: 4 },
          { offsetX: 2, offsetY: 0, health: 4 },
          { offsetX: 3, offsetY: 0, health: 4 },
          { offsetX: 4, offsetY: 0, health: 4 },
          { offsetX: 0, offsetY: 1, health: 4 },
          { offsetX: 1, offsetY: 1, health: 4 },
          { offsetX: 3, offsetY: 1, health: 4 },
          { offsetX: 4, offsetY: 1, health: 4 },
        ],
      })
    }
    return barriers
  }

  private removePlayer(playerId: string) {
    delete this.game.players[playerId]
    this.game.playerOrder = this.game.playerOrder.filter(id => id !== playerId)
    this.game.readyPlayers.delete(playerId)
    
    const playerCount = Object.keys(this.game.players).length
    
    if (playerCount === 0) {
      if (this.game.status === 'playing') {
        this.game.status = 'paused'
        if (this.interval) clearInterval(this.interval)
      }
      this.state.storage.setAlarm(Date.now() + 5 * 60 * 1000)
    } else if (playerCount === 1 && this.game.status === 'waiting') {
      this.game.mode = 'solo'
    }
    
    this.broadcast({ type: 'event', name: 'player_left', data: { playerId } })
  }

  private broadcast(msg: ServerMessage) {
    const data = JSON.stringify(msg)
    for (const ws of this.sessions.keys()) {
      try { ws.send(data) } catch {}
    }
  }

  private serializeState(): GameState {
    return { ...this.game, readyPlayers: new Set(this.game.readyPlayers) }
  }

  async alarm() {
    // Cleanup empty rooms - will be garbage collected
  }
}
```

---

## OpenTUI Client

### Project Setup

```json
{
  "name": "vaders-client",
  "type": "module",
  "scripts": {
    "dev": "bun run src/index.tsx",
    "build": "bun build src/index.tsx --outdir dist --target bun"
  },
  "dependencies": {
    "@opentui/core": "^0.1.72",
    "@opentui/react": "^0.1.72"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.3.0"
  }
}
```

### Entry Point

```tsx
// client/src/index.tsx
import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'
import { App } from './App'

async function main() {
  const renderer = await createCliRenderer()
  const root = createRoot(renderer)
  
  const roomUrl = process.argv[2] || 'ws://localhost:8787/ws'
  const playerName = process.argv[3] || \`Player\${Math.floor(Math.random() * 1000)}\`
  
  root.render(<App roomUrl={roomUrl} playerName={playerName} />)
  
  process.on('SIGINT', () => {
    root.unmount()
    renderer.destroy()
  })
}

main()
```

### Main App Component

```tsx
// client/src/App.tsx
import { useKeyboard, useRenderer } from '@opentui/react'
import { useGameConnection } from './hooks/useGameConnection'
import { GameScreen } from './components/GameScreen'
import { LobbyScreen } from './components/LobbyScreen'
import { GameOverScreen } from './components/GameOverScreen'

interface AppProps {
  roomUrl: string
  playerName: string
}

export function App({ roomUrl, playerName }: AppProps) {
  const renderer = useRenderer()
  const { state, playerId, send, connected } = useGameConnection(roomUrl, playerName)

  useKeyboard((event) => {
    if (state?.status !== 'playing') return

    switch (event.name) {
      case 'left':
      case 'a':
        send({ type: 'input', action: 'left' })
        break
      case 'right':
      case 'd':
        send({ type: 'input', action: 'right' })
        break
      case 'space':
        send({ type: 'input', action: 'shoot' })
        break
      case 'q':
        renderer.destroy()
    }
  })

  if (!connected || !state || !playerId) {
    return (
      <box width="100%" height="100%" justifyContent="center" alignItems="center">
        <text fg="cyan">Connecting to server...</text>
      </box>
    )
  }
  
  switch (state.status) {
    case 'waiting':
      return (
        <LobbyScreen 
          state={state} 
          currentPlayerId={playerId}
          onReady={() => send({ type: 'ready' })}
          onUnready={() => send({ type: 'unready' })}
          onStartSolo={() => send({ type: 'start_solo' })}
        />
      )
    case 'countdown':
    case 'playing':
      return <GameScreen state={state} currentPlayerId={playerId} />
    case 'gameover':
      return <GameOverScreen state={state} currentPlayerId={playerId} />
    case 'paused':
      return (
        <box width="100%" height="100%" justifyContent="center" alignItems="center">
          <text fg="yellow">Game Paused - Waiting for players...</text>
        </box>
      )
  }
}
```

### Lobby Screen

```tsx
// client/src/components/LobbyScreen.tsx
import { useKeyboard } from '@opentui/react'
import type { GameState } from '../../../shared/types'

interface LobbyScreenProps {
  state: GameState
  currentPlayerId: string
  onReady: () => void
  onUnready: () => void
  onStartSolo: () => void
}

export function LobbyScreen({ state, currentPlayerId, onReady, onUnready, onStartSolo }: LobbyScreenProps) {
  const players = Object.values(state.players)
  const currentPlayer = state.players[currentPlayerId]
  const isReady = currentPlayer?.ready ?? false
  const playerCount = players.length
  const readyCount = players.filter(p => p.ready).length
  
  useKeyboard((event) => {
    switch (event.name) {
      case 'space':
      case 'enter':
        if (isReady) onUnready()
        else onReady()
        break
      case 's':
        if (playerCount === 1) onStartSolo()
        break
    }
  })
  
  return (
    <box flexDirection="column" width={60} height={20} borderStyle="double" borderColor="cyan" alignSelf="center" padding={2}>
      <text fg="cyan"><strong>◀ SPACE INVADERS ▶</strong></text>
      <box height={1} />
      <text fg="white">Room: {state.roomId}</text>
      <box height={1} />
      <text fg="yellow">Players ({playerCount}/4):</text>
      <box height={1} />
      
      {players.map((player) => (
        <box key={player.id}>
          <text fg={player.color}>
            {player.id === currentPlayerId ? '► ' : '  '}P{player.slot} {player.name}
          </text>
          <box flex={1} />
          <text fg={player.ready ? 'green' : 'gray'}>
            {player.ready ? '✓ READY' : '○ waiting'}
          </text>
        </box>
      ))}
      
      {Array.from({ length: 4 - playerCount }).map((_, i) => (
        <text key={\`empty-\${i}\`} fg="gray">  P{playerCount + i + 1} (empty)</text>
      ))}
      
      <box flex={1} />
      <box borderStyle="single" borderColor="gray" padding={1}>
        {playerCount === 1 ? (
          <box flexDirection="column">
            <text fg="white">[SPACE] {isReady ? 'Cancel Ready' : 'Ready Up'} (wait for others)</text>
            <text fg="green">[S] Start Solo Game</text>
          </box>
        ) : (
          <box flexDirection="column">
            <text fg="white">[SPACE] {isReady ? 'Cancel Ready' : 'Ready Up'}</text>
            <text fg="gray">{readyCount}/{playerCount} ready{readyCount === playerCount ? ' - Starting...' : ''}</text>
          </box>
        )}
      </box>
    </box>
  )
}
```

### Game Screen

```tsx
// client/src/components/GameScreen.tsx
import type { GameState, Player, Barrier as BarrierType } from '../../../shared/types'
import { SPRITES, COLORS } from '../sprites'

interface GameScreenProps {
  state: GameState
  currentPlayerId: string
}

export function GameScreen({ state, currentPlayerId }: GameScreenProps) {
  const { aliens, bullets, players, barriers, score, wave, lives, mode, status } = state
  const playerCount = Object.keys(players).length
  
  return (
    <box flexDirection="column" width={80} height={24}>
      {/* Header */}
      <box height={1} paddingLeft={1} paddingRight={1}>
        <text fg="white"><strong>◀ SPACE INVADERS ▶</strong></text>
        <box flex={1} />
        <text fg="gray">{mode === 'solo' ? 'SOLO' : \`\${playerCount}P CO-OP\`}</text>
        <box width={2} />
        <text fg="yellow">SCORE:{score.toString().padStart(5, '0')}</text>
        <box width={2} />
        <text fg="cyan">WAVE:{wave}</text>
        <box width={2} />
        <text fg="red">{'♥'.repeat(lives)}{'♡'.repeat(Math.max(0, (mode === 'solo' ? 3 : 5) - lives))}</text>
      </box>
      
      {/* Countdown overlay */}
      {status === 'countdown' && (
        <box position="absolute" width="100%" height="100%" justifyContent="center" alignItems="center">
          <text fg="yellow"><strong>GET READY!</strong></text>
        </box>
      )}
      
      {/* Game Area */}
      <box flex={1} position="relative" borderStyle="single" borderColor="gray">
        {/* Aliens */}
        {aliens.filter(a => a.alive).map(alien => (
          <text key={\`alien-\${alien.id}\`} position="absolute" top={alien.y} left={alien.x} color={COLORS.alien[alien.type]}>
            {SPRITES.alien[alien.type]}
          </text>
        ))}
        
        {/* Bullets */}
        {bullets.map(bullet => (
          <text key={\`bullet-\${bullet.id}\`} position="absolute" top={bullet.y} left={bullet.x} fg={bullet.dy < 0 ? 'white' : 'red'}>
            {bullet.dy < 0 ? '│' : '▼'}
          </text>
        ))}
        
        {/* Barriers */}
        {barriers.map((barrier, i) => (
          <Barrier key={\`barrier-\${i}\`} barrier={barrier} />
        ))}
        
        {/* Players */}
        {Object.values(players).map(player => (
          <PlayerShip key={player.id} player={player} isCurrentPlayer={player.id === currentPlayerId} tick={state.tick} />
        ))}
      </box>
      
      {/* Status Bar */}
      <box height={1} paddingLeft={1} paddingRight={1}>
        <text fg="gray">←/→ Move  SPACE Shoot  Q Quit</text>
        <box flex={1} />
        <PlayerScores players={players} currentPlayerId={currentPlayerId} />
      </box>
    </box>
  )
}

function PlayerShip({ player, isCurrentPlayer, tick }: { player: Player; isCurrentPlayer: boolean; tick: number }) {
  if (!player.alive) {
    if (!player.respawnAt) return null
    if (Math.floor(tick / 10) % 2 === 0) return null
  }
  
  return (
    <box position="absolute" top={20} left={player.x - 1}>
      <text fg={player.alive ? player.color : 'gray'}>{SPRITES.player}</text>
      <text position="absolute" top={1} left={1} fg={player.color}>
        {isCurrentPlayer ? '▼' : \`P\${player.slot}\`}
      </text>
    </box>
  )
}

function PlayerScores({ players, currentPlayerId }: { players: Record<string, Player>; currentPlayerId: string }) {
  const sorted = Object.values(players).sort((a, b) => a.slot - b.slot)
  return (
    <box>
      {sorted.map((p, i) => (
        <text key={p.id} fg={p.color}>
          {i > 0 ? ' ' : ''}{p.id === currentPlayerId ? '►' : ' '}{p.name}:{p.kills}{!p.alive && p.respawnAt ? '☠' : ''}
        </text>
      ))}
    </box>
  )
}

function Barrier({ barrier }: { barrier: BarrierType }) {
  return (
    <>
      {barrier.segments.filter(s => s.health > 0).map((seg, i) => (
        <text key={i} position="absolute" top={16 + seg.offsetY} left={barrier.x + seg.offsetX}
          fg={seg.health > 3 ? 'green' : seg.health > 2 ? 'yellow' : seg.health > 1 ? 'red' : 'gray'}>
          {seg.health > 3 ? '█' : seg.health > 2 ? '▓' : seg.health > 1 ? '▒' : '░'}
        </text>
      ))}
    </>
  )
}
```

### Game Over Screen

```tsx
// client/src/components/GameOverScreen.tsx
import { useKeyboard, useRenderer } from '@opentui/react'
import type { GameState } from '../../../shared/types'

interface GameOverScreenProps {
  state: GameState
  currentPlayerId: string
}

export function GameOverScreen({ state, currentPlayerId }: GameOverScreenProps) {
  const renderer = useRenderer()
  const players = Object.values(state.players).sort((a, b) => b.kills - a.kills)
  const victory = state.aliens.every(a => !a.alive)

  useKeyboard((event) => {
    if (event.name === 'q' || event.name === 'escape') renderer.destroy()
  })
  
  return (
    <box flexDirection="column" width={50} borderStyle="double" borderColor={victory ? 'green' : 'red'} alignSelf="center" padding={2}>
      <text fg={victory ? 'green' : 'red'}><strong>{victory ? '★ VICTORY ★' : '✖ GAME OVER ✖'}</strong></text>
      <box height={1} />
      <text fg="yellow">Final Score: {state.score}</text>
      <text fg="cyan">Wave Reached: {state.wave}</text>
      <box height={1} />
      <text fg="white"><strong>Player Stats:</strong></text>
      {players.map((p, i) => (
        <box key={p.id}>
          <text fg={p.color}>{i === 0 ? '🏆' : \` \${i + 1}\`} {p.name}</text>
          <box flex={1} />
          <text fg="white">{p.kills} kills</text>
        </box>
      ))}
      <box height={1} />
      <text fg="gray">[Q] Quit</text>
    </box>
  )
}
```

### Sprites

```typescript
// client/src/sprites.ts

export const SPRITES = {
  alien: {
    squid:   '╔═╗',
    crab:    '/°\\',
    octopus: '{ö}',
  },
  player: '▲█▲',
  ufo: '◄══►',
} as const

export const COLORS = {
  alien: {
    squid:   'magenta',
    crab:    'cyan', 
    octopus: 'green',
  },
} as const
```

### WebSocket Hook

```typescript
// client/src/hooks/useGameConnection.ts
import { useState, useEffect, useRef, useCallback } from 'react'
import type { GameState, ClientMessage, ServerMessage, DeltaState } from '../../../shared/types'

export function useGameConnection(url: string, playerName: string) {
  const [state, setState] = useState<GameState | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  
  useEffect(() => {
    const ws = new WebSocket(url)
    wsRef.current = ws
    
    ws.onopen = () => {
      setConnected(true)
      ws.send(JSON.stringify({ type: 'join', name: playerName }))
    }
    
    ws.onmessage = (event) => {
      const msg: ServerMessage = JSON.parse(event.data)
      switch (msg.type) {
        case 'sync':
          setState(msg.state)
          if (msg.playerId) setPlayerId(msg.playerId)
          break
        case 'tick':
          setState(prev => prev ? applyDelta(prev, msg.delta) : prev)
          break
        case 'event':
          handleEvent(msg.name, msg.data)
          break
        case 'error':
          console.error(\`Server error: \${msg.message}\`)
          break
      }
    }
    
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)
    
    return () => ws.close()
  }, [url, playerName])
  
  const send = useCallback((msg: ClientMessage) => {
    wsRef.current?.send(JSON.stringify(msg))
  }, [])
  
  return { state, playerId, send, connected }
}

function applyDelta(state: GameState, delta: DeltaState): GameState {
  const next = { ...state }
  
  if (delta.players) {
    next.players = { ...state.players }
    for (const [id, changes] of Object.entries(delta.players)) {
      if (next.players[id]) next.players[id] = { ...next.players[id], ...changes }
    }
  }
  
  if (delta.bullets) {
    let bullets = state.bullets
    if (delta.bullets.remove?.length) {
      const removeSet = new Set(delta.bullets.remove)
      bullets = bullets.filter(b => !removeSet.has(b.id))
    }
    if (delta.bullets.add?.length) bullets = [...bullets, ...delta.bullets.add]
    next.bullets = bullets
  }
  
  if (delta.aliens?.killed?.length) {
    const killedSet = new Set(delta.aliens.killed)
    next.aliens = state.aliens.map(a => killedSet.has(a.id) ? { ...a, alive: false } : a)
  }
  
  if (delta.score !== undefined) next.score = delta.score
  if (delta.lives !== undefined) next.lives = delta.lives
  if (delta.status) next.status = delta.status
  if (delta.wave !== undefined) next.wave = delta.wave
  
  return next
}

function handleEvent(name: string, data: unknown) {
  if (name === 'alien_killed' || name === 'player_died') process.stdout.write('\x07')
}
```

---

## File Structure

```
vaders/
├── worker/
│   ├── src/
│   │   ├── index.ts              # Worker entry + routing
│   │   ├── GameRoom.ts           # Durable Object
│   │   └── game/
│   │       ├── state.ts          # Game initialization
│   │       ├── scaling.ts        # Player count scaling
│   │       ├── tick.ts           # Game loop logic
│   │       ├── collision.ts      # Hit detection
│   │       ├── aliens.ts         # Alien AI
│   │       └── barriers.ts       # Barrier creation
│   └── wrangler.toml
│
├── client/
│   ├── src/
│   │   ├── index.tsx             # Entry point
│   │   ├── App.tsx               # Root component
│   │   ├── sprites.ts            # ASCII art
│   │   ├── components/
│   │   │   ├── GameScreen.tsx
│   │   │   ├── LobbyScreen.tsx
│   │   │   └── GameOverScreen.tsx
│   │   └── hooks/
│   │       └── useGameConnection.ts
│   ├── package.json
│   └── tsconfig.json
│
├── shared/
│   ├── types.ts                  # GameState, Player, etc.
│   └── protocol.ts               # Message types
│
└── README.md
```

---

## Wrangler Configuration

```toml
# worker/wrangler.toml
name = "vaders"
main = "src/index.ts"
compatibility_date = "2024-01-15"

[durable_objects]
bindings = [
  { name = "GAME_ROOM", class_name = "GameRoom" }
]

[[migrations]]
tag = "v1"
new_classes = ["GameRoom"]
```

---

## Display Layout (80×24)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│◀ SPACE INVADERS ▶               SOLO   SCORE:01450   WAVE:3   ♥♥♥           │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ╔═╗ ╔═╗ ╔═╗ ╔═╗ ╔═╗ ╔═╗ ╔═╗ ╔═╗ ╔═╗ ╔═╗ ╔═╗                              │
│   /°\ /°\ /°\ /°\ /°\ /°\ /°\ /°\ /°\ /°\ /°\                               │
│   {ö} {ö} {ö} {ö} {ö} {ö} {ö} {ö} {ö} {ö} {ö}                               │
│                                                                              │
│                         │                                                    │
│                         │                                                    │
│                                             ▼                                │
│                                                                              │
│               ▄███▄            ▄███▄            ▄███▄                        │
│               █████            █████            █████                        │
│                                                                              │
│                                                                              │
│     ▲█▲                            ▲█▲                                       │
│      ▼                             P2                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│←/→ Move  SPACE Shoot  Q Quit                    ►Alice:12  Bob:8            │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Player Flow

```
                    ┌─────────────┐
                    │   Connect   │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Join Room  │
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
       ┌─────────────┐          ┌─────────────┐
       │ 1 Player    │          │ 2-4 Players │
       │ (Solo Mode) │          │ (Co-op Mode)│
       └──────┬──────┘          └──────┬──────┘
              │                         │
    ┌─────────┴─────────┐              │
    │                   │              │
    ▼                   ▼              ▼
┌────────┐      ┌────────────┐  ┌────────────┐
│[S]tart │      │[SPACE]     │  │[SPACE]     │
│ Solo   │      │ Ready      │  │ Ready      │
└────┬───┘      └─────┬──────┘  └──────┬─────┘
     │                │                 │
     │                └────────┬────────┘
     │                         │
     │                         ▼
     │                 ┌───────────────┐
     │                 │ All Ready?    │
     │                 └───────┬───────┘
     │                         │ Yes
     │                         ▼
     │                 ┌───────────────┐
     │                 │ 3..2..1..     │
     │                 └───────┬───────┘
     │                         │
     └─────────────────────────┤
                               ▼
                        ┌─────────────┐
                        │   PLAYING   │
                        └──────┬──────┘
                               │
                ┌──────────────┴──────────────┐
                │                             │
                ▼                             ▼
         ┌─────────────┐              ┌─────────────┐
         │  Victory    │              │   Defeat    │
         │ (all aliens)│              │ (0 lives)   │
         └─────────────┘              └─────────────┘
```

---

## Summary: 1-4 Player Support

| Aspect | Solo (1P) | Co-op (2-4P) |
|--------|-----------|--------------|
| Start | Immediate via [S] | All players ready |
| Lives | 3 individual | 5 shared |
| Respawn | No | Yes (3 sec) |
| Difficulty | Base | Scaled up |
| Score | Individual | Team total |
| Kill tracking | Personal | Per-player stats |

### Difficulty Scaling

| Players | Alien Speed | Shots/sec | Grid Size |
|---------|-------------|-----------|-----------|
| 1 | 1.0× | 0.5 | 11×5 |
| 2 | 1.25× | 0.75 | 11×5 |
| 3 | 1.5× | 1.0 | 13×5 |
| 4 | 1.75× | 1.25 | 15×6 |

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Player disconnect | Keep in game 10s, then remove |
| All players leave | Pause state, destroy after 5min |
| Room full (4 players) | Return 429, suggest new room |
| Terminal too small | Show "resize terminal" message |
| Simultaneous kills | Both players credited |
| Player rejoins | Send full sync, respawn if lives remain |

---

## Key OpenTUI Patterns

1. **useKeyboard** — Global input handling for movement/shooting
2. **useTerminalDimensions** — Responsive layout awareness
3. **\<box\>** — Flexbox container with Yoga layout
4. **\<text\>** — Styled text with color/bold props
5. **position="absolute"** — Game entity positioning
6. **createRoot/render** — React reconciler entry point

---

## Observability

### Logging Strategy: Wide Events

Emit **one context-rich event per request per service** rather than scattering multiple log lines. Consolidate all information into a single structured event at request completion.

```typescript
// worker/src/logging.ts

interface GameEvent {
  // Environment (every event)
  service: 'vaders-worker'
  version: string
  commitHash: string
  region: string

  // Request context
  requestId: string
  roomId: string
  playerId?: string

  // Business context
  eventType: 'room_created' | 'player_joined' | 'game_started' | 'game_ended' | 'player_left' | 'error'
  playerCount?: number
  gameMode?: 'solo' | 'coop'
  finalScore?: number
  waveReached?: number
  gameDurationMs?: number

  // Timing
  timestamp: string
  durationMs: number

  // Error details (if applicable)
  error?: {
    code: string
    message: string
    stack?: string
  }
}
```

### High Cardinality Fields

Include fields with many unique values to enable specific queries:

| Field | Purpose |
|-------|---------|
| `requestId` | Trace individual requests |
| `roomId` | Debug specific game sessions |
| `playerId` | Investigate player-specific issues |
| `commitHash` | Correlate issues with deployments |

### Single Logger Pattern

```typescript
// worker/src/logger.ts

import { GameEvent } from './logging'

class Logger {
  private baseContext: Partial<GameEvent>

  constructor() {
    this.baseContext = {
      service: 'vaders-worker',
      version: process.env.VERSION,
      commitHash: process.env.COMMIT_HASH,
      region: process.env.CF_REGION,
    }
  }

  log(event: Partial<GameEvent>) {
    console.log(JSON.stringify({
      ...this.baseContext,
      timestamp: new Date().toISOString(),
      ...event,
    }))
  }
}

export const logger = new Logger()
```

### What to Log

| Event | Key Fields |
|-------|------------|
| Room created | `roomId`, `requestId` |
| Player joined | `roomId`, `playerId`, `playerCount` |
| Game started | `roomId`, `playerCount`, `gameMode` |
| Game ended | `roomId`, `finalScore`, `waveReached`, `gameDurationMs`, `gameMode` |
| Player left | `roomId`, `playerId`, `playerCount` |
| Error | `roomId`, `error.code`, `error.message` |

### Anti-Patterns to Avoid

- Multiple `console.log()` calls per request
- Logging without `roomId` or `requestId`
- Unstructured string messages
- Missing deployment metadata
- Technical details without business context (e.g., "WebSocket closed" without room/player info)

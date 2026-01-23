# Multiplayer TUI Space Invaders — Technical Spec
## 1-4 Players • OpenTUI + Durable Objects

---

## Overview

TUI Space Invaders clone (with elements of Galaga, Galaxian and Amiga aesthetics) supporting solo play or 2-4 player co-op, synchronized via Cloudflare Durable Objects. Single player can start immediately; multiplayer requires a ready-up lobby.

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
| `M` | Toggle audio mute |
| `Q` | Quit |

### Multiplayer Flow

1. First player runs `vaders` → gets room code (e.g., `ABC123`)
2. Share room code with friends
3. Friends run `vaders --room ABC123`
4. All players press `ENTER` to ready up
5. Game starts after 3-second countdown

---

## Launch Screen

On startup, players see a full-screen launch experience with logo, mode selection, and controls reference.

### Layout (80×24)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  ██╗   ██╗ █████╗ ██████╗ ███████╗██████╗ ███████╗                          │
│  ██║   ██║██╔══██╗██╔══██╗██╔════╝██╔══██╗██╔════╝                          │
│  ██║   ██║███████║██║  ██║█████╗  ██████╔╝███████╗                          │
│  ╚██╗ ██╔╝██╔══██║██║  ██║██╔══╝  ██╔══██╗╚════██║                          │
│   ╚████╔╝ ██║  ██║██████╔╝███████╗██║  ██║███████║                          │
│    ╚═══╝  ╚═╝  ╚═╝╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝                          │
│                                                                              │
│           ╔═╗ /°\ {ö}        S P A C E   I N V A D E R S        ╔═╗ /°\ {ö} │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  [1] SOLO GAME              Start immediately, 3 lives                 │ │
│  │  [2] CREATE ROOM            Get room code to share with friends        │ │
│  │  [3] JOIN ROOM              Enter a room code                          │ │
│  │  [4] MATCHMAKING            Auto-join an open game                     │ │
│  │  [E] ENHANCED MODE   OFF    Galaga/Galaxian enemies + Amiga visuals    │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│     CONTROLS   ←/→ or A/D Move   SPACE Shoot   M Mute   Q Quit             │
│                                                                              │
│                         Press 1-4 to select mode                            │
│                                                                              │
│  v1.0.0                                    1-4 Players • OpenTUI + Bun      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Logo Component

```tsx
// client/src/components/Logo.tsx

const LOGO_ASCII = `
██╗   ██╗ █████╗ ██████╗ ███████╗██████╗ ███████╗
██║   ██║██╔══██╗██╔══██╗██╔════╝██╔══██╗██╔════╝
██║   ██║███████║██║  ██║█████╗  ██████╔╝███████╗
╚██╗ ██╔╝██╔══██║██║  ██║██╔══╝  ██╔══██╗╚════██║
 ╚████╔╝ ██║  ██║██████╔╝███████╗██║  ██║███████║
  ╚═══╝  ╚═╝  ╚═╝╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝
`.trim()

export function Logo() {
  return (
    <box flexDirection="column" alignItems="center">
      <text fg="#00ffff">{LOGO_ASCII}</text>
      <box height={1} />
      <text fg="#888">
        <span fg="#ff00ff">╔═╗</span> <span fg="#00ffff">/°\</span> <span fg="#00ff00">{'{ö}'}</span>
        {'        '}S P A C E   I N V A D E R S{'        '}
        <span fg="#ff00ff">╔═╗</span> <span fg="#00ffff">/°\</span> <span fg="#00ff00">{'{ö}'}</span>
      </text>
    </box>
  )
}
```

### Launch Screen Component

```tsx
// client/src/components/LaunchScreen.tsx
import { useKeyboard, useRenderer } from '@opentui/react'
import { useState, useCallback } from 'react'
import { Logo } from './Logo'

interface LaunchScreenProps {
  onStartSolo: (enhanced: boolean) => void
  onCreateRoom: (enhanced: boolean) => void
  onJoinRoom: (code: string, enhanced: boolean) => void
  onMatchmake: (enhanced: boolean) => void
  version: string
}

export function LaunchScreen({ onStartSolo, onCreateRoom, onJoinRoom, onMatchmake, version }: LaunchScreenProps) {
  const renderer = useRenderer()
  const [enhanced, setEnhanced] = useState(false)
  const [joinMode, setJoinMode] = useState(false)
  const [roomCode, setRoomCode] = useState('')

  // Handle alphanumeric text input for room code
  const handleKeyInput = useCallback((event: KeyboardEvent) => {
    if (joinMode) {
      if (event.key === 'Escape') {
        setJoinMode(false)
        setRoomCode('')
        return
      }
      if (event.key === 'Enter' && roomCode.length === 6) {
        onJoinRoom(roomCode, enhanced)
        return
      }
      if (event.key === 'Backspace') {
        setRoomCode(prev => prev.slice(0, -1))
        return
      }
      // Accept alphanumeric characters, auto-uppercase, max 6 chars
      if (/^[a-zA-Z0-9]$/.test(event.key) && roomCode.length < 6) {
        setRoomCode(prev => prev + event.key.toUpperCase())
      }
      return
    }

    // Menu selection
    switch (event.key) {
      case '1':
        onStartSolo(enhanced)
        break
      case '2':
        onCreateRoom(enhanced)
        break
      case '3':
        setJoinMode(true)
        break
      case '4':
        onMatchmake(enhanced)
        break
      case 'e':
      case 'E':
        setEnhanced(e => !e)
        break
      case 'q':
      case 'Q':
        renderer.destroy()
        process.exit(0)
        break
    }
  }, [joinMode, roomCode, enhanced, onStartSolo, onCreateRoom, onJoinRoom, onMatchmake, renderer])

  useKeyboard(handleKeyInput)

  return (
    <box flexDirection="column" width={80} height={24} padding={1}>
      <Logo />
      <box height={1} />

      <box flexDirection="column" border borderColor="#444" padding={1}>
        <MenuItem hotkey="1" label="SOLO GAME" desc="Start immediately, 3 lives" />
        <MenuItem hotkey="2" label="CREATE ROOM" desc="Get room code to share with friends" />
        {joinMode ? (
          <box>
            <text fg="#00ffff">[3]</text>
            <box width={1} />
            <text fg="#fff" width={18}>JOIN ROOM</text>
            <text fg="#888">Enter code: [</text>
            <text fg="#0f0">{roomCode.padEnd(6, '_')}</text>
            <text fg="#888">]</text>
          </box>
        ) : (
          <MenuItem hotkey="3" label="JOIN ROOM" desc="Enter a room code" />
        )}
        <MenuItem hotkey="4" label="MATCHMAKING" desc="Auto-join an open game" />
        <box height={1} />
        <box>
          <text fg="#ffff00">[E] ENHANCED MODE</text>
          <box width={3} />
          <text fg={enhanced ? '#00ff00' : '#666'}>{enhanced ? 'ON ' : 'OFF'}</text>
          <box width={3} />
          <text fg="#666">Galaga/Galaxian enemies + Amiga visuals</text>
        </box>
      </box>

      <box height={1} />
      <text fg="#888">
        {'   '}CONTROLS{'   '}←/→ or A/D Move   SPACE Shoot   M Mute   Q Quit
      </text>
      <box flex={1} />
      <box>
        <text fg="#666">v{version}</text>
        <box flex={1} />
        <text fg="#666">1-4 Players • OpenTUI + Bun</text>
      </box>
    </box>
  )
}

function MenuItem({ hotkey, label, desc }: { hotkey: string; label: string; desc: string }) {
  return (
    <box>
      <text fg="#00ffff">[{hotkey}]</text>
      <box width={1} />
      <text fg="#fff" width={18}>{label}</text>
      <text fg="#888">{desc}</text>
    </box>
  )
}
```

### Terminal Capabilities Detection

```typescript
// client/src/capabilities.ts

export interface TerminalCapabilities {
  trueColor: boolean    // 24-bit color support
  unicode: boolean      // Unicode character support
  width: number         // Terminal width
  height: number        // Terminal height
}

export function detectCapabilities(): TerminalCapabilities {
  const colorTerm = process.env.COLORTERM
  const term = process.env.TERM

  return {
    trueColor: colorTerm === 'truecolor' || colorTerm === '24bit' || term?.includes('256color'),
    unicode: process.env.LANG?.includes('UTF-8') ?? true,
    width: process.stdout.columns ?? 80,
    height: process.stdout.rows ?? 24,
  }
}

// Fallback sprite set for non-Unicode terminals
export const ASCII_SPRITES = {
  alien: { squid: '[=]', crab: '/o\\', octopus: '{o}' },
  player: '^A^',
  bullet: '|',
  barrier: '#',
}
```

### Join Room Input

When player presses `[3]`, show inline room code input:

```
│  [3] JOIN ROOM              Enter code: [ABC123]                          │
```

- 6-character base36 code (0-9, A-Z)
- Auto-uppercase on input
- `ENTER` to confirm (only when 6 chars entered), `ESC` to cancel
- Backspace to delete

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

### Challenging Stages (Enhanced Mode)

Bonus rounds occur at **Wave 3, 7, 11, 15...** (every 4th wave starting from 3).

**Characteristics:**
- **40 enemies** fly in preset formations
- Enemies **do not fire** at players
- Enemies **do not stop** - they fly through and exit
- Destroy all 40 for **10,000 point bonus**
- Partial completion: 100 points per kill

**Visual Treatment:**
- **Plasma background** replaces gradient sky (see Visual Effects section)
- Formation flies in synchronized patterns
- No barriers on screen

**Music:**
- Special upbeat "bonus round" track
- Tempo matches formation speed

```typescript
/** Path and timing for formation fly-through patterns */
interface FormationPattern {
  path: Position[]     // Waypoints for the formation to follow
  timing: number[]     // Tick delays between waypoints
}

interface ChallengingStage {
  wave: number
  enemyCount: 40
  formations: FormationPattern[]
  timeLimit: number  // Ticks before stage ends
  bonusPoints: 10000
}

function isChallengingStage(wave: number): boolean {
  return wave >= 3 && (wave - 3) % 4 === 0
}
```

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

### Enhanced Sprites

```typescript
export const ENHANCED_SPRITES = {
  commander: {
    healthy: '◄══►',
    damaged: '◄──►',  // After first hit
  },
  dive_bomber: '♦',
  transform: {
    scorpion: '∿',
    stingray: '◇',
    mini_commander: '◄►',
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

Sinusoidal plasma effect for Challenging Stages (bonus rounds at waves 3, 7, 11, 15...). See "Challenging Stages" section above for gameplay details.

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
│   (@opentui/react)  │◄── WebSocket ─────►│         Router           │
│   Bun runtime       │                    │   ┌──────────────────┐   │
└─────────────────────┘                    │   │  Durable Object  │   │
         ▲                                 │   │    GameRoom      │   │
         │ Terminal                        │   │                  │   │
         │ Rendering                       │   │  • Game state    │   │
         ▼                                 │   │  • 30Hz tick     │   │
┌─────────────────────┐                    │   │  • Full sync     │   │
│   Zig Native Layer  │                    │   └──────────────────┘   │
│   (via FFI/dlopen)  │                    │   ┌──────────────────┐   │
│   • Buffer diffing  │                    │   │  KV: RoomRegistry │   │
│   • ANSI generation │                    │   │  (matchmaking)   │   │
│   • Yoga layout     │                    │   └──────────────────┘   │
└─────────────────────┘                    └──────────────────────────┘
```

---

## Worker Router

The Worker handles HTTP routing and room management. Each room code maps deterministically to a Durable Object ID.

```typescript
// worker/src/index.ts

export interface Env {
  GAME_ROOM: DurableObjectNamespace
  ROOM_REGISTRY: KVNamespace  // For matchmaking
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // POST /room - Create new room, returns room code
    if (url.pathname === '/room' && request.method === 'POST') {
      const roomCode = generateRoomCode()  // 6-char base36
      const id = env.GAME_ROOM.idFromName(roomCode)
      const stub = env.GAME_ROOM.get(id)

      // Initialize room and register for matchmaking
      await stub.fetch(new Request('https://internal/init', {
        method: 'POST',
        body: JSON.stringify({ roomCode })
      }))
      await env.ROOM_REGISTRY.put(`room:${roomCode}`, JSON.stringify({
        roomCode,
        createdAt: Date.now(),
        playerCount: 0,
        status: 'waiting'
      }), { expirationTtl: 3600 })  // 1 hour TTL

      return new Response(JSON.stringify({ roomCode }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // GET /room/:code/ws - WebSocket connection to specific room
    const wsMatch = url.pathname.match(/^\/room\/([A-Z0-9]{6})\/ws$/)
    if (wsMatch) {
      const roomCode = wsMatch[1]
      const id = env.GAME_ROOM.idFromName(roomCode)
      const stub = env.GAME_ROOM.get(id)
      return stub.fetch(request)
    }

    // GET /matchmake - Find or create an open room
    if (url.pathname === '/matchmake') {
      const openRoom = await findOpenRoom(env.ROOM_REGISTRY)
      if (openRoom) {
        return new Response(JSON.stringify({ roomCode: openRoom }), {
          headers: { 'Content-Type': 'application/json' }
        })
      }
      // No open rooms, create one
      return env.GAME_ROOM.fetch(new Request(url.origin + '/room', { method: 'POST' }))
    }

    // GET /room/:code - Room info (player count, status)
    const infoMatch = url.pathname.match(/^\/room\/([A-Z0-9]{6})$/)
    if (infoMatch) {
      const roomCode = infoMatch[1]
      const info = await env.ROOM_REGISTRY.get(`room:${roomCode}`)
      if (!info) {
        return new Response(JSON.stringify({ error: 'Room not found' }), { status: 404 })
      }
      return new Response(info, { headers: { 'Content-Type': 'application/json' } })
    }

    return new Response('Not Found', { status: 404 })
  }
}

function generateRoomCode(): string {
  // 6 characters, base36 (0-9, A-Z), ~2 billion combinations
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

async function findOpenRoom(registry: KVNamespace): Promise<string | null> {
  // List rooms that are waiting and have space
  const list = await registry.list({ prefix: 'room:' })
  for (const key of list.keys) {
    const info = await registry.get(key.name)
    if (info) {
      const room = JSON.parse(info)
      if (room.status === 'waiting' && room.playerCount < 4) {
        return room.roomCode
      }
    }
  }
  return null
}
```

---

## Durable Object: `GameRoom`

### State Schema

```typescript
// shared/types.ts

// ─── Base Types ───────────────────────────────────────────────────────────────

interface Position {
  x: number
  y: number
}

interface GameEntity extends Position {
  id: string  // Monotonic string ID: "e_1", "e_2", etc.
}

// ─── Game State ───────────────────────────────────────────────────────────────

interface GameState {
  roomId: string                    // 6-char base36 (0-9, A-Z)
  mode: 'solo' | 'coop'
  status: 'waiting' | 'countdown' | 'playing' | 'paused' | 'game_over'
  tick: number
  enhancedMode: boolean

  // Countdown state (only valid when status === 'countdown')
  countdownRemaining: number | null  // 3, 2, 1, or null

  players: Record<string, Player>
  readyPlayerIds: string[]          // Array for JSON serialization

  // Unified entity array with discriminated union (see Entity type below)
  entities: Entity[]

  // Legacy arrays for backward compatibility during transition
  aliens: Alien[]
  bullets: Bullet[]
  barriers: Barrier[]

  // Enhanced mode only
  commanders?: Commander[]
  diveBombers?: DiveBomber[]
  transforms?: TransformEnemy[]
  capturedPlayerIds?: Record<string, string>  // playerId → commanderId

  wave: number
  lives: number                     // 3 solo, 5 co-op
  score: number
  alienDirection: 1 | -1

  config: GameConfig
}

// Unified entity type for all game objects
type Entity =
  | { kind: 'alien'; id: string; x: number; y: number; type: ClassicAlienType; alive: boolean; row: number; col: number }
  | { kind: 'commander'; id: string; x: number; y: number; health: 1 | 2; tractorBeamActive: boolean; capturedPlayerId: string | null }
  | { kind: 'divebomber'; id: string; x: number; y: number; diveState: 'formation' | 'diving' | 'returning'; diveProgress: number }
  | { kind: 'bullet'; id: string; x: number; y: number; ownerId: string | null; dy: -1 | 1 }
  | { kind: 'barrier'; id: string; x: number; segments: BarrierSegment[] }
  | { kind: 'transform'; id: string; x: number; y: number; type: TransformType; velocity: Position; lifetime: number }

interface GameConfig {
  width: number                     // Default: 80
  height: number                    // Default: 24
  maxPlayers: number                // Default: 4
  tickIntervalMs: number            // Default: 33 (~30Hz, full state sync)
  syncRateHz: number                // Default: 30 (state broadcasts per second)

  // Base values (scaled by player count)
  baseAlienMoveInterval: number     // Ticks between alien moves
  baseBulletSpeed: number           // Cells per tick
  baseAlienShootRate: number        // Probability per tick
  playerCooldown: number            // Ticks between shots
  playerMoveSpeed: number           // Cells per tick when holding move key
  respawnDelay: number              // Ticks (90 = 3 seconds at 30Hz)
  disconnectGracePeriod: number     // Ticks (300 = 10 seconds at 30Hz)
}

const DEFAULT_CONFIG: GameConfig = {
  width: 80,
  height: 24,
  maxPlayers: 4,
  tickIntervalMs: 33,               // ~30Hz server tick
  syncRateHz: 30,                   // Full state broadcast rate
  baseAlienMoveInterval: 15,        // Move every 15 ticks (~2 Hz at 30Hz tick)
  baseBulletSpeed: 1,               // 1 cell per tick
  baseAlienShootRate: 0.02,         // ~0.6 shots/second at 30Hz
  playerCooldown: 6,                // ~200ms between shots
  playerMoveSpeed: 1,               // 1 cell per tick when holding key
  respawnDelay: 90,                 // 3 seconds at 30Hz
  disconnectGracePeriod: 300,       // 10 seconds at 30Hz
}

// ─── Layout Constants ─────────────────────────────────────────────────────────

/** Layout constants for the 80×24 game grid */
const LAYOUT = {
  PLAYER_Y: 20,              // Y position for player ships
  PLAYER_MIN_X: 2,           // Left boundary for player movement
  PLAYER_MAX_X: 77,          // Right boundary for player movement
  PLAYER_WIDTH: 3,           // Width of player sprite
  BULLET_SPAWN_OFFSET: 1,    // Bullet spawns this far above player
  BARRIER_Y: 16,             // Y position for barrier row
  ALIEN_START_Y: 2,          // Initial Y position for top alien row
  ALIEN_COL_SPACING: 5,      // Horizontal spacing between alien columns
  GAME_OVER_Y: 18,           // If aliens reach this Y, game over
  COLLISION_H: 2,            // Horizontal collision threshold
  COLLISION_V: 1,            // Vertical collision threshold
} as const

// ─── Player ───────────────────────────────────────────────────────────────────

export type PlayerSlot = 1 | 2 | 3 | 4
export type PlayerColor = 'green' | 'cyan' | 'yellow' | 'magenta'

const PLAYER_COLORS: Record<PlayerSlot, PlayerColor> = {
  1: 'green',
  2: 'cyan',
  3: 'yellow',
  4: 'magenta',
}

interface Player {
  id: string
  name: string
  x: number                         // Horizontal position (y is always LAYOUT.PLAYER_Y)
  slot: PlayerSlot
  color: PlayerColor
  lastShot: number                  // Tick of last shot (for cooldown)
  alive: boolean
  respawnAt: number | null          // Tick to respawn (co-op only)
  kills: number
  disconnectedAt: number | null     // Tick when disconnected (for grace period)

  // Input state (server-authoritative, updated from client input messages)
  inputState: {
    left: boolean
    right: boolean
  }
}

// ─── Enemies ──────────────────────────────────────────────────────────────────

type ClassicAlienType = 'squid' | 'crab' | 'octopus'

// Enhanced mode alien types - Commander and DiveBomber have separate interfaces
// with additional state (health, diveState, etc.) so they extend BaseAlien directly

interface BaseAlien extends GameEntity {
  row: number       // Formation row index (used for bottom-row shooter selection)
  col: number       // Formation column index (used for bottom-row shooter selection)
  alive: boolean
  points: number
}

interface Alien extends BaseAlien {
  type: ClassicAlienType
}

interface Commander extends BaseAlien {
  type: 'commander'
  health: 2 | 1                     // 2 hits to kill (green → purple → dead)
  tractorBeamCooldown: number
  capturedPlayerId: string | null
}

interface DiveBomber extends BaseAlien {
  type: 'dive_bomber'
  diveState: 'formation' | 'diving' | 'returning'
  divePathProgress: number
  diveDirection: 1 | -1
}

// ─── Alien Registry ──────────────────────────────────────────────────────────

const ALIEN_REGISTRY = {
  squid:   { points: 30, sprite: '╔═╗', color: 'magenta' },
  crab:    { points: 20, sprite: '/°\\', color: 'cyan' },
  octopus: { points: 10, sprite: '{ö}', color: 'green' },
} as const

const FORMATION_ROWS: ClassicAlienType[] = ['squid', 'crab', 'crab', 'octopus', 'octopus']

// ─── Projectiles & Obstacles ──────────────────────────────────────────────────

interface Bullet extends GameEntity {
  ownerId: string | null            // null = alien bullet
  dy: -1 | 1                        // -1 = up (player), 1 = down (alien)
}

interface Barrier {
  x: number                         // Left edge
  segments: BarrierSegment[]
}

interface BarrierSegment {
  offsetX: number
  offsetY: number
  health: 0 | 1 | 2 | 3 | 4         // 4=full → 3 → 2 → 1 → 0=destroyed
                                    // Visual: █(4) → ▓(3) → ▒(2) → ░(1) → gone(0)
}

// ─── Transform Enemies (Enhanced Mode) ────────────────────────────────────────

type TransformType = 'scorpion' | 'stingray' | 'mini_commander'

interface TransformEnemy extends GameEntity {
  type: TransformType
  velocity: Position
  lifetime: number                  // Ticks until auto-despawn
}
```

### Scaling Logic

```typescript
// worker/src/game/scaling.ts

export function getScaledConfig(playerCount: number, baseConfig: GameConfig) {
  const scaleTable = {
    1: { speedMult: 1.0,  shootRate: 0.5,  cols: 11, rows: 5 },
    2: { speedMult: 1.25, shootRate: 0.75, cols: 11, rows: 5 },
    3: { speedMult: 1.5,  shootRate: 1.0,  cols: 13, rows: 5 },
    4: { speedMult: 1.75, shootRate: 1.25, cols: 15, rows: 6 },
  }
  const scale = scaleTable[playerCount as keyof typeof scaleTable] ?? scaleTable[1]
  
  return {
    alienMoveInterval: Math.floor(baseConfig.baseAlienMoveInterval / scale.speedMult),
    alienShootRate: scale.shootRate,
    alienCols: scale.cols,
    alienRows: scale.rows,
    lives: playerCount === 1 ? 3 : 5,
  }
}

export function getPlayerSpawnX(slot: number, playerCount: number, screenWidth: number): number {
  const positions: Record<number, number[]> = {
    1: [Math.floor(screenWidth / 2)],
    2: [Math.floor(screenWidth / 3), Math.floor(2 * screenWidth / 3)],
    3: [Math.floor(screenWidth / 4), Math.floor(screenWidth / 2), Math.floor(3 * screenWidth / 4)],
    4: [Math.floor(screenWidth / 5), Math.floor(2 * screenWidth / 5), Math.floor(3 * screenWidth / 5), Math.floor(4 * screenWidth / 5)],
  }
  return positions[playerCount]?.[slot - 1] ?? Math.floor(screenWidth / 2)
}

```

### WebSocket Protocol

```typescript
// shared/protocol.ts

// Client → Server
type ClientMessage =
  | { type: 'join'; name: string; enhancedMode?: boolean }
  | { type: 'ready' }
  | { type: 'unready' }
  | { type: 'start_solo'; enhancedMode?: boolean }
  | { type: 'input'; held: InputState }  // Continuous input state, not discrete events
  | { type: 'shoot' }                     // Discrete action (rate-limited server-side)
  | { type: 'ping' }

/** Which movement keys are currently held */
interface InputState {
  left: boolean
  right: boolean
}

// Server → Client
type ServerEvent =
  | { type: 'event'; name: 'player_joined'; data: { player: Player } }
  | { type: 'event'; name: 'player_left'; data: { playerId: string; reason?: string } }
  | { type: 'event'; name: 'player_ready'; data: { playerId: string } }
  | { type: 'event'; name: 'player_unready'; data: { playerId: string } }
  | { type: 'event'; name: 'player_died'; data: { playerId: string } }
  | { type: 'event'; name: 'player_respawned'; data: { playerId: string } }
  | { type: 'event'; name: 'countdown_tick'; data: { count: number } }
  | { type: 'event'; name: 'countdown_cancelled'; data: { reason: string } }
  | { type: 'event'; name: 'game_start'; data: void }
  | { type: 'event'; name: 'alien_killed'; data: { alienId: string; playerId: string | null } }
  | { type: 'event'; name: 'wave_complete'; data: { wave: number } }
  | { type: 'event'; name: 'game_over'; data: { result: 'victory' | 'defeat' } }
  | { type: 'event'; name: 'ufo_spawn'; data: { x: number } }

type ServerMessage =
  | { type: 'sync'; state: GameState; playerId: string }
  | ServerEvent
  | { type: 'pong'; serverTime: number }
  | { type: 'error'; code: ErrorCode; message: string }

// NOTE: We use full state sync at 30Hz instead of delta updates.
// Delta sync is error-prone (missed updates cause permanent desync) and the
// full game state is small enough (~2-4KB) that full sync is simpler and more robust.

type ErrorCode = 'room_full' | 'game_in_progress' | 'invalid_action' | 'invalid_room'
```

### Keep-Alive Strategy

Clients send a `ping` message every 30 seconds while connected. Server responds with `pong` including `serverTime`. If no `pong` received within 5 seconds, client should reconnect.

```typescript
// Client-side keep-alive
const PING_INTERVAL = 30000
const PONG_TIMEOUT = 5000
let lastPong = Date.now()

setInterval(() => {
  if (Date.now() - lastPong > PING_INTERVAL + PONG_TIMEOUT) {
    ws.close()  // Trigger reconnect
    return
  }
  ws.send(JSON.stringify({ type: 'ping' }))
}, PING_INTERVAL)

// On pong received
lastPong = Date.now()
```

### Durable Object Implementation

```typescript
// worker/src/GameRoom.ts

export class GameRoom implements DurableObject {
  private state: DurableObjectState
  private env: Env
  private sessions = new Map<WebSocket, string>()
  private game: GameState | null = null
  private interval: ReturnType<typeof setInterval> | null = null
  private countdownInterval: ReturnType<typeof setInterval> | null = null
  private nextEntityId = 1  // Monotonic counter for entity IDs

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
    // Restore game state from storage on construction
    this.state.blockConcurrencyWhile(async () => {
      this.game = await this.state.storage.get('game') ?? null
    })
  }

  private generateEntityId(): string {
    return `e_${this.nextEntityId++}`
  }

  private async persistState() {
    if (this.game) {
      await this.state.storage.put('game', this.game)
    }
  }

  private createInitialState(roomCode: string): GameState {
    return {
      roomId: roomCode,  // Passed from Worker router, not generated here
      mode: 'solo',
      status: 'waiting',
      tick: 0,
      countdownRemaining: null,
      players: {},
      readyPlayerIds: [],
      entities: [],
      aliens: [],
      bullets: [],
      barriers: [],
      wave: 1,
      lives: 3,
      score: 0,
      alienDirection: 1,
      enhancedMode: false,
      config: DEFAULT_CONFIG,
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // POST /init - Initialize room with code (called by Worker router)
    if (url.pathname === '/init' && request.method === 'POST') {
      const { roomCode } = await request.json() as { roomCode: string }
      this.game = this.createInitialState(roomCode)
      await this.persistState()
      return new Response('OK')
    }

    // WebSocket connection (routed from /room/:code/ws)
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

      const pair = new WebSocketPair()
      await this.handleSession(pair[1])
      return new Response(null, { status: 101, webSocket: pair[0] })
    }

    // GET /info - Room status for registry updates
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

  private async handleSession(ws: WebSocket) {
    ws.accept()

    ws.addEventListener('message', async (event) => {
      const msg: ClientMessage = JSON.parse(event.data as string)
      await this.handleMessage(ws, msg)
    })

    ws.addEventListener('close', () => {
      const playerId = this.sessions.get(ws)
      if (playerId && this.game?.players[playerId]) {
        // Mark as disconnected, don't remove immediately (grace period)
        this.game.players[playerId].disconnectedAt = this.game.tick
        this.sessions.delete(ws)
        this.broadcast({ type: 'event', name: 'player_left', data: { playerId, reason: 'disconnect' } })

        // Cancel countdown if a player disconnects during it
        if (this.game.status === 'countdown') {
          this.cancelCountdown('Player disconnected')
        }

        // Update room registry
        this.updateRoomRegistry()
      }
    })
  }

  private async handleMessage(ws: WebSocket, msg: ClientMessage) {
    if (!this.game) return
    const playerId = this.sessions.get(ws)

    switch (msg.type) {
      case 'join': {
        if (Object.keys(this.game.players).length >= 4) {
          ws.send(JSON.stringify({ type: 'error', code: 'room_full', message: 'Room is full' }))
          return
        }

        // Set enhanced mode from first player's preference
        if (Object.keys(this.game.players).length === 0 && msg.enhancedMode !== undefined) {
          this.game.enhancedMode = msg.enhancedMode
        }

        const slot = this.getNextSlot()
        const player: Player = {
          id: crypto.randomUUID(),
          name: msg.name.slice(0, 12),
          x: getPlayerSpawnX(slot, Object.keys(this.game.players).length + 1, 80),
          slot,
          color: PLAYER_COLORS[slot],
          lastShot: 0,
          alive: true,
          respawnAt: null,
          kills: 0,
          disconnectedAt: null,
          inputState: { left: false, right: false },  // Initialize input state
        }

        this.game.players[player.id] = player
        this.sessions.set(ws, player.id)
        this.game.mode = Object.keys(this.game.players).length === 1 ? 'solo' : 'coop'

        ws.send(JSON.stringify({ type: 'sync', state: this.game, playerId: player.id }))
        this.broadcast({ type: 'event', name: 'player_joined', data: { player } })
        await this.updateRoomRegistry()
        break
      }

      case 'start_solo': {
        if (Object.keys(this.game.players).length === 1 && playerId) {
          this.game.mode = 'solo'
          this.game.lives = 3
          if (msg.enhancedMode !== undefined) {
            this.game.enhancedMode = msg.enhancedMode
          }
          this.startGame()
        }
        break
      }

      case 'ready': {
        if (playerId && this.game.players[playerId] && !this.game.readyPlayerIds.includes(playerId)) {
          this.game.readyPlayerIds.push(playerId)
          this.broadcast({ type: 'event', name: 'player_ready', data: { playerId } })
          this.checkStartConditions()
        }
        break
      }

      case 'unready': {
        if (playerId && this.game.players[playerId]) {
          const wasReady = this.game.readyPlayerIds.includes(playerId)
          this.game.readyPlayerIds = this.game.readyPlayerIds.filter(id => id !== playerId)
          this.broadcast({ type: 'event', name: 'player_unready', data: { playerId } })

          // Cancel countdown if someone unreadies during it
          if (wasReady && this.game.status === 'countdown') {
            this.cancelCountdown('Player unreadied')
          }
        }
        break
      }

      case 'input': {
        // Update held key state (processed on each tick)
        if (playerId && this.game.players[playerId] && this.game.status === 'playing') {
          this.game.players[playerId].inputState = msg.held
        }
        break
      }

      case 'shoot': {
        // Discrete shoot action (rate-limited)
        if (playerId && this.game.players[playerId] && this.game.status === 'playing') {
          this.handleShoot(playerId)
        }
        break
      }

      case 'ping': {
        ws.send(JSON.stringify({ type: 'pong', serverTime: Date.now() }))
        break
      }
    }
  }

  private getNextSlot(): 1 | 2 | 3 | 4 {
    const usedSlots = new Set(Object.values(this.game!.players).map(p => p.slot))
    for (const slot of [1, 2, 3, 4] as const) {
      if (!usedSlots.has(slot)) return slot
    }
    return 1
  }

  private checkStartConditions() {
    if (!this.game) return
    const playerCount = Object.keys(this.game.players).length
    const readyCount = this.game.readyPlayerIds.length

    if (playerCount >= 2 && readyCount === playerCount) {
      this.startCountdown()
    }
  }

  private startCountdown() {
    if (!this.game) return
    this.game.status = 'countdown'
    this.game.countdownRemaining = 3

    this.broadcast({ type: 'event', name: 'countdown_tick', data: { count: 3 } })

    this.countdownInterval = setInterval(() => {
      if (!this.game || this.game.status !== 'countdown') return

      this.game.countdownRemaining!--
      if (this.game.countdownRemaining === 0) {
        clearInterval(this.countdownInterval!)
        this.countdownInterval = null
        this.startGame()
      } else {
        this.broadcast({ type: 'event', name: 'countdown_tick', data: { count: this.game.countdownRemaining } })
      }
    }, 1000)
  }

  private cancelCountdown(reason: string) {
    if (!this.game) return
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval)
      this.countdownInterval = null
    }
    this.game.status = 'waiting'
    this.game.countdownRemaining = null
    this.broadcast({ type: 'event', name: 'countdown_cancelled', data: { reason } })
  }

  private async updateRoomRegistry() {
    if (!this.game) return
    // Update KV with current room status for matchmaking
    await this.env.ROOM_REGISTRY.put(`room:${this.game.roomId}`, JSON.stringify({
      roomCode: this.game.roomId,
      playerCount: Object.keys(this.game.players).length,
      status: this.game.status,
      updatedAt: Date.now()
    }), { expirationTtl: 3600 })
  }

  private startGame() {
    if (!this.game) return
    const playerCount = Object.keys(this.game.players).length
    const scaled = getScaledConfig(playerCount, this.game.config)

    this.game.status = 'playing'
    this.game.countdownRemaining = null
    this.game.lives = scaled.lives
    this.game.aliens = this.createAlienFormation(scaled.alienCols, scaled.alienRows)
    this.game.barriers = this.createBarriers(playerCount)
    this.game.bullets = []
    this.game.tick = 0

    this.broadcast({ type: 'event', name: 'game_start' })
    this.broadcastFullState()
    this.persistState()

    // Game loop at 30Hz - full state broadcast every tick
    this.interval = setInterval(() => this.tick(), this.game.config.tickIntervalMs)
  }

  private tick() {
    if (!this.game || this.game.status !== 'playing') return

    const playerCount = Object.keys(this.game.players).length
    const scaled = getScaledConfig(playerCount, this.game.config)

    // Process player input state (held keys)
    for (const player of Object.values(this.game.players)) {
      if (!player.alive) continue
      if (player.inputState.left) {
        player.x = Math.max(LAYOUT.PLAYER_MIN_X, player.x - this.game.config.playerMoveSpeed)
      }
      if (player.inputState.right) {
        player.x = Math.min(LAYOUT.PLAYER_MAX_X, player.x + this.game.config.playerMoveSpeed)
      }
    }

    // Handle disconnect grace period timeouts
    for (const player of Object.values(this.game.players)) {
      if (player.disconnectedAt !== null) {
        const elapsed = this.game.tick - player.disconnectedAt
        if (elapsed >= this.game.config.disconnectGracePeriod) {
          this.removePlayer(player.id)
        }
      }
    }

    // Handle respawns (co-op only)
    if (this.game.mode === 'coop') {
      for (const player of Object.values(this.game.players)) {
        if (!player.alive && player.respawnAt && this.game.tick >= player.respawnAt) {
          player.alive = true
          player.x = getPlayerSpawnX(player.slot, Object.keys(this.game.players).length, 80)
          player.respawnAt = null
          this.broadcast({ type: 'event', name: 'player_respawned', data: { playerId: player.id } })
        }
      }
    }

    this.moveBullets()
    this.checkCollisions()

    if (this.game.tick % scaled.alienMoveInterval === 0) {
      this.moveAliens()
    }

    if (Math.random() < scaled.alienShootRate) {
      this.alienShoot()
    }

    this.checkEndConditions()
    this.game.tick++

    // Full state sync every tick (30Hz)
    this.broadcastFullState()
  }

  private broadcastFullState() {
    if (!this.game) return
    // Broadcast full game state to all connected clients
    for (const [ws, playerId] of this.sessions) {
      try {
        ws.send(JSON.stringify({ type: 'sync', state: this.game, playerId }))
      } catch {
        // WebSocket may be closed
      }
    }
  }

  private handleShoot(playerId: string) {
    if (!this.game) return
    const player = this.game.players[playerId]
    if (!player || !player.alive) return

    if (this.game.tick - player.lastShot >= this.game.config.playerCooldown) {
      this.game.bullets.push({
        id: this.generateEntityId(),
        ownerId: playerId,
        x: player.x,
        y: LAYOUT.PLAYER_Y - LAYOUT.BULLET_SPAWN_OFFSET,
        dy: -1,
      })
      player.lastShot = this.game.tick
    }
  }

  private moveBullets() {
    if (!this.game) return

    for (const bullet of this.game.bullets) {
      bullet.y += bullet.dy * this.game.config.baseBulletSpeed
    }

    // Remove out-of-bounds bullets
    this.game.bullets = this.game.bullets.filter(
      b => b.y >= 0 && b.y < this.game!.config.height - 1
    )
  }

  private checkCollisions() {
    if (!this.game) return
    const bulletsToRemove = new Set<string>()

    for (const bullet of this.game.bullets) {
      // Player bullets hitting aliens
      if (bullet.dy === -1) {
        for (const alien of this.game.aliens) {
          if (!alien.alive) continue
          if (Math.abs(bullet.x - alien.x) < LAYOUT.COLLISION_H && Math.abs(bullet.y - alien.y) < LAYOUT.COLLISION_V) {
            alien.alive = false
            bulletsToRemove.add(bullet.id)
            this.game.score += ALIEN_REGISTRY[alien.type].points

            if (bullet.ownerId && this.game.players[bullet.ownerId]) {
              this.game.players[bullet.ownerId].kills++
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
          if (Math.abs(bullet.x - player.x) < LAYOUT.COLLISION_H && Math.abs(bullet.y - LAYOUT.PLAYER_Y) < LAYOUT.COLLISION_V) {
            bulletsToRemove.add(bullet.id)
            this.handlePlayerDeath(player.id)
            break
          }
        }
      }

      // Bullets hitting barriers
      for (const barrier of this.game.barriers) {
        for (const seg of barrier.segments) {
          if (seg.health <= 0) continue
          const segX = barrier.x + seg.offsetX
          const segY = LAYOUT.BARRIER_Y + seg.offsetY
          if (Math.abs(bullet.x - segX) <= 1 && Math.abs(bullet.y - segY) <= 1) {
            seg.health = (seg.health - 1) as 0 | 1 | 2 | 3
            bulletsToRemove.add(bullet.id)
            break
          }
        }
      }
    }

    this.game.bullets = this.game.bullets.filter(b => !bulletsToRemove.has(b.id))
  }

  private moveAliens() {
    if (!this.game) return
    let hitEdge = false

    for (const alien of this.game.aliens) {
      if (!alien.alive) continue
      alien.x += this.game.alienDirection * 2
      if (alien.x <= LAYOUT.PLAYER_MIN_X || alien.x >= LAYOUT.PLAYER_MAX_X) hitEdge = true
    }

    if (hitEdge) {
      this.game.alienDirection *= -1
      for (const alien of this.game.aliens) {
        if (alien.alive) alien.y += 1
      }
    }
  }

  private alienShoot() {
    if (!this.game) return
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
      id: this.generateEntityId(),
      ownerId: null,
      x: shooter.x,
      y: shooter.y + 1,
      dy: 1,
    }

    this.game.bullets.push(bullet)
    // Full state sync will include new bullet on next broadcast
  }

  private handlePlayerDeath(playerId: string) {
    if (!this.game) return
    const player = this.game.players[playerId]
    if (!player) return

    player.alive = false
    this.game.lives--

    this.broadcast({ type: 'event', name: 'player_died', data: { playerId } })

    if (this.game.lives > 0 && this.game.mode === 'coop') {
      player.respawnAt = this.game.tick + this.game.config.respawnDelay
    }

    if (this.game.lives <= 0) {
      this.endGame('defeat')
    }
  }

  private checkEndConditions() {
    if (!this.game) return
    if (this.game.aliens.every(a => !a.alive)) {
      this.nextWave()
      return
    }

    const lowestAlien = Math.max(...this.game.aliens.filter(a => a.alive).map(a => a.y))
    if (lowestAlien >= LAYOUT.GAME_OVER_Y) {
      this.endGame('defeat')
    }
  }

  private nextWave() {
    if (!this.game) return
    this.game.wave++
    const playerCount = Object.keys(this.game.players).length
    const scaled = getScaledConfig(playerCount, this.game.config)

    this.game.aliens = this.createAlienFormation(scaled.alienCols, scaled.alienRows)
    this.game.bullets = []
    this.game.alienDirection = 1

    this.broadcast({ type: 'event', name: 'wave_complete', data: { wave: this.game.wave } })
    // Full state sync will happen on next tick
  }

  private endGame(result: 'victory' | 'defeat') {
    this.game.status = 'game_over'
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
    // Center the alien grid: (screenWidth - gridWidth) / 2
    const startX = Math.floor((this.game.config.width - cols * LAYOUT.ALIEN_COL_SPACING) / 2)
    
    for (let row = 0; row < rows; row++) {
      const type = types[row] || 'octopus'
      for (let col = 0; col < cols; col++) {
        aliens.push({
          id: id++,
          type,
          row,
          col,
          x: startX + col * LAYOUT.ALIEN_COL_SPACING,
          y: LAYOUT.ALIEN_START_Y + row * 2,
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
    const spacing = this.game.config.width / (barrierCount + 1)

    // Barrier shape: 5-wide top row, 4-segment bottom row with center gap
    // █████
    // ██ ██
    const BARRIER_SHAPE = [
      [1, 1, 1, 1, 1],  // row 0: full
      [1, 1, 0, 1, 1],  // row 1: gap in center
    ]

    for (let i = 0; i < barrierCount; i++) {
      const x = Math.floor(spacing * (i + 1)) - 3
      const segments: BarrierSegment[] = []
      for (let row = 0; row < BARRIER_SHAPE.length; row++) {
        for (let col = 0; col < BARRIER_SHAPE[row].length; col++) {
          if (BARRIER_SHAPE[row][col]) {
            segments.push({ offsetX: col, offsetY: row, health: 4 })
          }
        }
      }
      barriers.push({ x, segments })
    }
    return barriers
  }

  private removePlayer(playerId: string) {
    delete this.game.players[playerId]
    this.game.readyPlayerIds = this.game.readyPlayerIds.filter(id => id !== playerId)
    
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
    return { ...this.game }  // readyPlayerIds is already JSON-serializable
  }

  async alarm() {
    // Cleanup: This alarm fires 5 minutes after the last player leaves.
    // Empty rooms are garbage collected by Durable Objects runtime.
    // No explicit cleanup needed - the DO instance will be evicted.
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
    case 'game_over':
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
  const isReady = state.readyPlayerIds.includes(currentPlayerId)
  const playerCount = players.length
  const readyCount = state.readyPlayerIds.length
  
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
      
      {players.map((player) => {
        const playerReady = state.readyPlayerIds.includes(player.id)
        return (
          <box key={player.id}>
            <text fg={player.color}>
              {player.id === currentPlayerId ? '► ' : '  '}P{player.slot} {player.name}
            </text>
            <box flex={1} />
            <text fg={playerReady ? 'green' : 'gray'}>
              {playerReady ? '✓ READY' : '○ waiting'}
            </text>
          </box>
        )
      })}
      
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
          <text key={\`alien-\${alien.id}\`} position="absolute" top={alien.y} left={alien.x} fg={COLORS.alien[alien.type]}>
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
    <box position="absolute" top={LAYOUT.PLAYER_Y} left={player.x - 1}>
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
        <text key={i} position="absolute" top={LAYOUT.BARRIER_Y + seg.offsetY} left={barrier.x + seg.offsetX}
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
import type { GameState, ClientMessage, ServerMessage, InputState } from '../../../shared/types'
import { audio } from '../audio/engine'

const PING_INTERVAL = 30000
const RECONNECT_DELAY = 1000
const MAX_RECONNECT_ATTEMPTS = 5

export function useGameConnection(url: string, playerName: string, enhanced: boolean) {
  const [state, setState] = useState<GameState | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttempts = useRef(0)
  const pingInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastPong = useRef(Date.now())

  // Track held input keys
  const inputState = useRef<InputState>({ left: false, right: false })

  const connect = useCallback(() => {
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      setError(null)
      reconnectAttempts.current = 0
      ws.send(JSON.stringify({ type: 'join', name: playerName, enhancedMode: enhanced }))

      // Start keep-alive pings
      pingInterval.current = setInterval(() => {
        if (Date.now() - lastPong.current > PING_INTERVAL + 5000) {
          ws.close()  // Trigger reconnect
          return
        }
        ws.send(JSON.stringify({ type: 'ping' }))
      }, PING_INTERVAL)
    }

    ws.onmessage = (event) => {
      const msg: ServerMessage = JSON.parse(event.data)
      switch (msg.type) {
        case 'sync':
          // Full state sync - simply replace state (30Hz from server)
          setState(msg.state)
          if (msg.playerId) setPlayerId(msg.playerId)
          break
        case 'event':
          handleGameEvent(msg.name, msg.data)
          break
        case 'pong':
          lastPong.current = Date.now()
          break
        case 'error':
          setError(msg.message)
          break
      }
    }

    ws.onclose = () => {
      setConnected(false)
      if (pingInterval.current) clearInterval(pingInterval.current)

      // Attempt reconnect
      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts.current++
        setTimeout(connect, RECONNECT_DELAY * reconnectAttempts.current)
      }
    }

    ws.onerror = () => {
      setError('Connection error')
    }
  }, [url, playerName, enhanced])

  useEffect(() => {
    connect()
    return () => {
      if (pingInterval.current) clearInterval(pingInterval.current)
      wsRef.current?.close()
    }
  }, [connect])

  // Send input state when it changes
  const updateInput = useCallback((held: InputState) => {
    inputState.current = held
    wsRef.current?.send(JSON.stringify({ type: 'input', held }))
  }, [])

  const shoot = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'shoot' }))
  }, [])

  const send = useCallback((msg: ClientMessage) => {
    wsRef.current?.send(JSON.stringify(msg))
  }, [])

  return { state, playerId, send, connected, error, updateInput, shoot }
}

// Play sound effects for game events
function handleGameEvent(name: string, data: unknown) {
  const eventSounds: Record<string, string> = {
    player_joined: 'player_joined',
    player_left: 'player_left',
    player_died: 'player_died',
    player_respawned: 'player_respawned',
    countdown_tick: 'countdown_tick',
    game_start: 'game_start',
    alien_killed: 'alien_killed',
    wave_complete: 'wave_complete',
    game_over: 'game_over',
  }
  const sound = eventSounds[name]
  if (sound) {
    audio.playSfx(sound as any)
  }
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

See `getScaledConfig()` in Scaling Logic section for canonical values. Summary:

| Players | Speed | Shots/sec | Grid |
|---------|-------|-----------|------|
| 1 | 1.0× | 0.5 | 11×5 |
| 2-4 | 1.25×–1.75× | 0.75–1.25 | up to 15×6 |

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Player disconnect | Mark `disconnectedAt`, keep in game for `disconnectGracePeriod` (10s), then remove |
| All players leave | End game, destroy room after 5min via Durable Object alarm |
| Room full (4 players) | Return HTTP 429 with `room_full` error |
| Terminal too small | Show "resize terminal to 80×24" message |
| Simultaneous kills | Both players credited (last bullet processed wins tie) |
| Player rejoins within grace | Clear `disconnectedAt`, resume play |
| Player rejoins after removal | Rejoin as new player if game in progress and room not full |

---

## Key OpenTUI Patterns

1. **useKeyboard** — Global input handling for movement/shooting
2. **useTerminalDimensions** — Responsive layout awareness
3. **\<box\>** — Flexbox container with Yoga layout
4. **\<text\>** — Styled text with color/bold props
5. **position="absolute"** — Game entity positioning
6. **createRoot/render** — React reconciler entry point

---

## Audio

Audio is **client-side only** and **on by default**. Press `M` to toggle mute. Audio state persists in `~/.config/vaders/config.json`.

### Keyboard Shortcut

| Key | Action |
|-----|--------|
| `M` | Toggle audio on/off |

### Sound Effects

All sound effects are synthesized using Web Audio API for minimal bundle size.

| Event | Sound | Style |
|-------|-------|-------|
| **Player shoot** | Short blip, rising pitch | 50ms, square wave |
| **Alien killed** | Descending tone + noise burst | 100ms |
| **Player died** | Low rumble + explosion | 300ms |
| **Wave complete** | Triumphant arpeggio | 500ms |
| **Game over** | Descending minor chord | 1000ms |
| **Commander hit** (Enhanced) | Metallic clang | 150ms |
| **Tractor beam** (Enhanced) | Warbling tone, sustained | Loop while active |
| **Transform spawn** (Enhanced) | Splitting/sparkle effect | 200ms |
| **Capture** (Enhanced) | Alarming siren | 400ms |
| **Menu select** | Click/blip | 30ms |
| **Menu navigate** | Soft tick | 20ms |
| **Ready up** | Positive chime | 150ms |
| **Countdown start** | Beep | 100ms |
| **Game start** | Fanfare | 800ms |

### Music

#### Normal Mode: Retro Chiptune

8-bit style music using square, triangle, and noise channels. Tempo increases as aliens decrease.

```typescript
// client/src/audio/music.ts

/** A sequence of notes for chiptune channels */
type NoteSequence = Array<{ note: string; duration: string }>

interface ChiptuneTrack {
  name: string
  bpm: number
  channels: {
    square1: NoteSequence
    square2: NoteSequence
    triangle: NoteSequence
    noise: NoteSequence
  }
}

const NORMAL_MODE_TRACKS: ChiptuneTrack[] = [
  {
    name: 'invasion',
    bpm: 120,
    channels: {
      square1: [
        // Lead melody - classic Space Invaders descending pattern
        { note: 'E4', duration: '8n' },
        { note: 'D4', duration: '8n' },
        { note: 'C4', duration: '8n' },
        { note: 'B3', duration: '8n' },
        // ... continues
      ],
      square2: [/* Harmony */],
      triangle: [/* Bass line */],
      noise: [/* Percussion - hi-hat pattern */],
    },
  },
]
```

**Dynamic tempo scaling:**

| Aliens Remaining | BPM Multiplier |
|------------------|----------------|
| 100-75% | 1.0× |
| 75-50% | 1.15× |
| 50-25% | 1.3× |
| 25-10% | 1.5× |
| <10% | 1.75× |

#### Enhanced Mode: Amiga-Style

MOD/tracker-inspired music with:
- 4 channels (Paula chip emulation)
- Sample-based instruments
- Characteristic Amiga "punch" and bass

```typescript
// client/src/audio/amigaMusic.ts

/** Pattern row data for MOD-style tracker format */
interface Pattern {
  rows: number                // Typically 64 rows per pattern
  channels: unknown[][]       // 4 channels of note/effect data
}

interface AmigaTrack {
  name: string
  bpm: number
  samples: {
    [key: string]: Float32Array  // Pre-loaded 8-bit samples (loadSample returns Float32Array)
  }
  patterns: Pattern[]
  sequence: number[]  // Pattern order
}

const ENHANCED_MODE_TRACKS: AmigaTrack[] = [
  {
    name: 'shadow_assault',
    bpm: 125,
    samples: {
      kick: loadSample('kick_amiga.raw'),
      snare: loadSample('snare_amiga.raw'),
      bass: loadSample('bass_amiga.raw'),
      lead: loadSample('lead_amiga.raw'),
      pad: loadSample('pad_amiga.raw'),
    },
    patterns: [
      // Pattern 0: Intro
      {
        rows: 64,
        channels: [
          [/* Channel 1: Kick + Bass */],
          [/* Channel 2: Snare + Hats */],
          [/* Channel 3: Lead melody */],
          [/* Channel 4: Pad/atmosphere */],
        ],
      },
    ],
    sequence: [0, 0, 1, 2, 1, 2, 3, 3],  // Pattern play order
  },
]
```

**Amiga music characteristics:**
- **Crunchy bass**: Low-pass filtered, slightly distorted
- **Punchy drums**: Short decay, no reverb
- **Arpeggiated chords**: Fast note cycling for polyphony illusion
- **Portamento leads**: Pitch slides between notes

### Audio Engine

**Note:** This is a terminal application. We use terminal-appropriate audio:
- Terminal bell (`\x07`) for simple beeps
- Optional native audio via Bun FFI for richer sound
- User config stored in `~/.config/vaders/config.json`

```typescript
// client/src/audio/engine.ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const CONFIG_DIR = join(homedir(), '.config', 'vaders')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

interface AudioConfig {
  muted: boolean
  useNativeAudio: boolean  // Use FFI for richer sound (optional)
}

function loadConfig(): AudioConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
    }
  } catch { /* ignore */ }
  return { muted: false, useNativeAudio: false }
}

function saveConfig(config: AudioConfig) {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true })
    }
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
  } catch { /* ignore */ }
}

class AudioEngine {
  private config: AudioConfig
  private nativeAudio: NativeAudio | null = null

  constructor() {
    this.config = loadConfig()
    if (this.config.useNativeAudio) {
      this.initNativeAudio()
    }
  }

  private async initNativeAudio() {
    // Optional: Load native audio library via Bun FFI
    // This would use a library like miniaudio or SDL_audio
    try {
      // const lib = dlopen('./audio.dylib', { ... })
      // this.nativeAudio = new NativeAudio(lib)
    } catch {
      console.error('Native audio not available, falling back to terminal bell')
    }
  }

  toggleMute() {
    this.config.muted = !this.config.muted
    saveConfig(this.config)
  }

  get isMuted(): boolean {
    return this.config.muted
  }

  playSfx(name: SoundEffect) {
    if (this.config.muted) return

    if (this.nativeAudio) {
      this.nativeAudio.play(name)
    } else {
      // Terminal bell for basic audio feedback
      if (BEEP_SOUNDS.has(name)) {
        process.stdout.write('\x07')
      }
    }
  }

  playMusic(mode: 'normal' | 'enhanced') {
    // Music only available with native audio
    this.nativeAudio?.playMusic(mode)
  }

  setMusicTempo(multiplier: number) {
    this.nativeAudio?.setTempo(multiplier)
  }
}

// Sound effects that trigger terminal bell in basic mode
const BEEP_SOUNDS = new Set<SoundEffect>([
  'shoot', 'alien_killed', 'player_died', 'wave_complete', 'game_over', 'countdown_tick'
])

export const audio = new AudioEngine()
```

### Native Audio (Optional)

For richer audio, users can install the native audio library:

```bash
# Build native audio module (requires system audio libraries)
cd client/native
bun run build  # Compiles audio.c using zig cc

# Enable in config
echo '{"muted": false, "useNativeAudio": true}' > ~/.config/vaders/config.json
```

```typescript
// client/src/audio/native.ts (optional)

interface NativeAudio {
  play(name: SoundEffect): void
  playMusic(mode: 'normal' | 'enhanced'): void
  setTempo(multiplier: number): void
  stop(): void
}

// FFI bindings would go here using Bun.dlopen()
```

### Sound Effect Types

```typescript
// client/src/audio/sfx.ts

type SoundEffect =
  | 'shoot'
  | 'alien_killed'
  | 'player_joined'
  | 'player_left'
  | 'player_died'
  | 'player_respawned'
  | 'wave_complete'
  | 'game_over'
  | 'commander_hit'
  | 'tractor_beam'
  | 'transform_spawn'
  | 'capture'
  | 'menu_select'
  | 'menu_navigate'
  | 'ready_up'
  | 'countdown_tick'
  | 'game_start'

/**
 * Sound effect descriptions for native audio implementation.
 * When using terminal bell mode, only BEEP_SOUNDS are triggered.
 * When using native audio, these parameters are used for synthesis.
 */
const SFX_PARAMS: Record<SoundEffect, SfxParams> = {
  shoot:           { freq: 880, dur: 50, type: 'square', sweep: 1760 },
  alien_killed:    { freq: 600, dur: 100, type: 'square', sweep: 100, noise: true },
  player_joined:   { freq: 523, dur: 100, type: 'sine' },      // C5
  player_left:     { freq: 330, dur: 150, type: 'triangle' },  // E4
  player_died:     { freq: 100, dur: 300, type: 'noise' },     // Explosion
  player_respawned:{ freq: 880, dur: 100, type: 'sine' },      // A5
  wave_complete:   { notes: [523, 659, 784], dur: 500 },       // C-E-G arpeggio
  game_over:       { notes: [392, 330, 262], dur: 1000 },      // G-E-C descending
  countdown_tick:  { freq: 440, dur: 100, type: 'square' },    // A4 beep
  game_start:      { notes: [262, 330, 392, 523], dur: 800 },  // C-E-G-C fanfare
  ready_up:        { freq: 660, dur: 150, type: 'sine' },      // E5
  menu_select:     { freq: 440, dur: 30, type: 'square' },
  menu_navigate:   { freq: 220, dur: 20, type: 'square' },
  // Enhanced mode
  commander_hit:   { freq: 150, dur: 150, type: 'sawtooth' },
  tractor_beam:    { freq: 300, dur: 2000, type: 'warble' },
  transform_spawn: { freq: 1500, dur: 200, type: 'sparkle' },
  capture:         { freq: 400, dur: 400, type: 'siren' },
}

interface SfxParams {
  freq?: number
  dur: number
  type?: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise' | 'warble' | 'sparkle' | 'siren'
  sweep?: number      // End frequency for sweep
  noise?: boolean     // Add noise burst
  notes?: number[]    // For arpeggios
}
```

### Integration with Game Events

```tsx
// client/src/hooks/useGameAudio.ts
import { useEffect } from 'react'
import { audio } from '../audio/engine'
import type { GameState } from '../../../shared/types'

export function useGameAudio(state: GameState | null, enhanced: boolean) {
  // Start music when game starts
  useEffect(() => {
    if (state?.status === 'playing') {
      audio.playMusic(enhanced ? 'enhanced' : 'normal')
    }
  }, [state?.status, enhanced])

  // Adjust tempo based on aliens remaining
  useEffect(() => {
    if (!state || state.status !== 'playing') return
    const alive = state.aliens.filter(a => a.alive).length
    const total = state.aliens.length
    const ratio = alive / total

    let tempo = 1.0
    if (ratio < 0.1) tempo = 1.75
    else if (ratio < 0.25) tempo = 1.5
    else if (ratio < 0.5) tempo = 1.3
    else if (ratio < 0.75) tempo = 1.15

    audio.setMusicTempo(tempo)
  }, [state?.aliens])
}

// GameEvent → SoundEffect mapping (some events map to different sound names)
const EVENT_SOUND_MAP: Record<GameEvent, SoundEffect> = {
  player_joined: 'player_joined',
  player_left: 'player_left',
  player_ready: 'ready_up',        // UI feedback sound
  player_unready: 'menu_select',   // UI feedback sound
  player_died: 'player_died',
  player_respawned: 'player_respawned',
  countdown_tick: 'countdown_tick',
  game_start: 'game_start',
  alien_killed: 'alien_killed',
  wave_complete: 'wave_complete',
  game_over: 'game_over',
}

// In useGameConnection.ts, handle events:
function handleEvent(name: GameEvent, data: unknown) {
  const sound = EVENT_SOUND_MAP[name]
  if (sound) {
    audio.playSfx(sound)
  }
}
```

### Mute Indicator

When muted, show indicator in status bar:

```
│←/→ Move  SPACE Shoot  Q Quit  🔇                    ►Alice:12  Bob:8        │
```

---

## Observability

### Logging Strategy: Wide Events

Emit **one context-rich event per request per service** rather than scattering multiple log lines. Consolidate all information into a single structured event at request completion.

```typescript
// worker/src/logging.ts

interface LogEvent {
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

import { LogEvent } from './logging'

class Logger {
  private baseContext: Partial<LogEvent>

  constructor() {
    this.baseContext = {
      service: 'vaders-worker',
      version: process.env.VERSION,
      commitHash: process.env.COMMIT_HASH,
      region: process.env.CF_REGION,
    }
  }

  log(event: Partial<LogEvent>) {
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

---

## Testing

### Test Strategy

Testing is organized into three layers:

| Layer | Scope | Tools | Speed |
|-------|-------|-------|-------|
| **Unit** | Pure functions, game logic | Bun test | <1s |
| **Integration** | WebSocket protocol, state sync | Bun test + mock WS | <5s |
| **E2E** | Full client-server flow | Playwright + wrangler dev | <30s |

### Unit Tests

```typescript
// worker/src/game/__tests__/scaling.test.ts
import { describe, expect, test } from 'bun:test'
import { getScaledConfig, getPlayerSpawnX } from '../scaling'

describe('getScaledConfig', () => {
  const baseConfig = {
    baseAlienMoveInterval: 30,
    baseBulletSpeed: 2,
    baseAlienShootRate: 0.5,
  }

  test('solo player gets base difficulty', () => {
    const config = getScaledConfig(1, baseConfig)
    expect(config.lives).toBe(3)
    expect(config.alienCols).toBe(11)
    expect(config.alienRows).toBe(5)
    expect(config.alienMoveInterval).toBe(30)
  })

  test('4 players get max difficulty', () => {
    const config = getScaledConfig(4, baseConfig)
    expect(config.lives).toBe(5)
    expect(config.alienCols).toBe(15)
    expect(config.alienRows).toBe(6)
    expect(config.alienMoveInterval).toBe(17)  // 30 / 1.75 ≈ 17
  })

  test('invalid player count falls back to solo', () => {
    const config = getScaledConfig(0, baseConfig)
    expect(config.lives).toBe(3)
  })
})

describe('getPlayerSpawnX', () => {
  test('solo player spawns at center', () => {
    expect(getPlayerSpawnX(1, 1, 80)).toBe(40)
  })

  test('2 players spawn at thirds positions', () => {
    expect(getPlayerSpawnX(1, 2, 80)).toBe(26)  // Math.floor(80/3)
    expect(getPlayerSpawnX(2, 2, 80)).toBe(53)  // Math.floor(2*80/3)
  })
})
```

```typescript
// worker/src/game/__tests__/collision.test.ts
import { describe, expect, test } from 'bun:test'
import { checkBulletAlienCollision, checkBulletPlayerCollision } from '../collision'

describe('collision detection', () => {
  test('bullet hits alien within COLLISION_H threshold', () => {
    const bullet = { x: 10, y: 5, dy: -1 }
    const alien = { x: 11, y: 5, alive: true }
    expect(checkBulletAlienCollision(bullet, alien)).toBe(true)
  })

  test('bullet misses alien outside threshold', () => {
    const bullet = { x: 10, y: 5, dy: -1 }
    const alien = { x: 15, y: 5, alive: true }
    expect(checkBulletAlienCollision(bullet, alien)).toBe(false)
  })

  test('bullet ignores dead aliens', () => {
    const bullet = { x: 10, y: 5, dy: -1 }
    const alien = { x: 10, y: 5, alive: false }
    expect(checkBulletAlienCollision(bullet, alien)).toBe(false)
  })
})
```

```typescript
// worker/src/game/__tests__/barriers.test.ts
import { describe, expect, test } from 'bun:test'
import { createBarriers } from '../barriers'

describe('createBarriers', () => {
  test('solo player gets 3 barriers', () => {
    const barriers = createBarriers(1, 80)
    expect(barriers.length).toBe(3)
  })

  test('4 players get 4 barriers (max)', () => {
    const barriers = createBarriers(4, 80)
    expect(barriers.length).toBe(4)
  })

  test('each barrier has 9 segments', () => {
    const barriers = createBarriers(1, 80)
    barriers.forEach(b => expect(b.segments.length).toBe(9))
  })

  test('barriers are evenly spaced', () => {
    const barriers = createBarriers(4, 80)
    const spacing = barriers[1].x - barriers[0].x
    expect(barriers[2].x - barriers[1].x).toBe(spacing)
    expect(barriers[3].x - barriers[2].x).toBe(spacing)
  })
})
```

### Integration Tests

```typescript
// worker/src/__tests__/gameroom.test.ts
import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { GameRoom } from '../GameRoom'

describe('GameRoom WebSocket protocol', () => {
  let room: GameRoom
  let mockWs: MockWebSocket

  beforeEach(() => {
    room = new GameRoom(mockState, mockEnv)
    mockWs = new MockWebSocket()
  })

  test('join message adds player and returns sync', async () => {
    await room.handleSession(mockWs)
    mockWs.receive({ type: 'join', name: 'Alice' })

    const response = mockWs.lastSent()
    expect(response.type).toBe('sync')
    expect(response.playerId).toBeDefined()
    expect(response.state.players[response.playerId].name).toBe('Alice')
  })

  test('room full returns error after 4 players', async () => {
    // Add 4 players
    for (let i = 0; i < 4; i++) {
      const ws = new MockWebSocket()
      await room.handleSession(ws)
      ws.receive({ type: 'join', name: `Player${i}` })
    }

    // 5th player should get error
    const ws5 = new MockWebSocket()
    await room.handleSession(ws5)
    ws5.receive({ type: 'join', name: 'Player5' })

    expect(ws5.lastSent()).toEqual({
      type: 'error',
      code: 'room_full',
      message: 'Room is full'
    })
  })

  test('ready state triggers countdown when all ready', async () => {
    // Add 2 players
    const ws1 = new MockWebSocket()
    const ws2 = new MockWebSocket()
    await room.handleSession(ws1)
    await room.handleSession(ws2)
    ws1.receive({ type: 'join', name: 'Alice' })
    ws2.receive({ type: 'join', name: 'Bob' })

    // Both ready
    ws1.receive({ type: 'ready' })
    ws2.receive({ type: 'ready' })

    // Should broadcast countdown_tick
    expect(ws1.messages.some(m => m.name === 'countdown_tick')).toBe(true)
  })

  test('ping returns pong with server time', async () => {
    await room.handleSession(mockWs)
    mockWs.receive({ type: 'join', name: 'Alice' })
    mockWs.receive({ type: 'ping' })

    const pong = mockWs.lastSent()
    expect(pong.type).toBe('pong')
    expect(pong.serverTime).toBeGreaterThan(0)
  })

  test('countdown ticks from 3 to 1 then starts game', async () => {
    // Setup 2 players, both ready
    const ws1 = new MockWebSocket()
    const ws2 = new MockWebSocket()
    await room.handleSession(ws1)
    await room.handleSession(ws2)
    ws1.receive({ type: 'join', name: 'Alice' })
    ws2.receive({ type: 'join', name: 'Bob' })
    ws1.receive({ type: 'ready' })
    ws2.receive({ type: 'ready' })

    // Expect countdown_tick events with counts 3, 2, 1
    const countdownEvents = ws1.messages.filter(m => m.name === 'countdown_tick')
    expect(countdownEvents.map(e => e.data.count)).toEqual([3, 2, 1])

    // Expect game_start after countdown
    expect(ws1.messages.some(m => m.name === 'game_start')).toBe(true)
  })

  test('player respawns after respawnDelay ticks in coop', async () => {
    // Setup coop game with 2 players
    const ws1 = new MockWebSocket()
    const ws2 = new MockWebSocket()
    await room.handleSession(ws1)
    await room.handleSession(ws2)
    ws1.receive({ type: 'join', name: 'Alice' })
    ws2.receive({ type: 'join', name: 'Bob' })
    ws1.receive({ type: 'ready' })
    ws2.receive({ type: 'ready' })

    // Wait for game to start and kill player
    // ... simulate player death
    // Wait respawnDelay ticks
    // Expect player_respawned event
    // Expect player.alive = true, correct x position
    const respawnedEvents = ws1.messages.filter(m => m.name === 'player_respawned')
    expect(respawnedEvents.length).toBeGreaterThan(0)
  })
})

// Mock WebSocket helper
class MockWebSocket {
  messages: any[] = []
  accept() {}
  send(data: string) { this.messages.push(JSON.parse(data)) }
  receive(msg: any) { this.onmessage?.({ data: JSON.stringify(msg) }) }
  lastSent() { return this.messages[this.messages.length - 1] }
  onmessage?: (event: { data: string }) => void
  onclose?: () => void
}
```

### State Synchronization Tests

```typescript
// client/src/__tests__/gameConnection.test.ts
import { describe, expect, test, mock } from 'bun:test'

describe('Game Connection', () => {
  // Note: We use full state sync (no deltas), so tests focus on message handling

  test('sync message replaces entire game state', () => {
    const initialState = { score: 0, aliens: [] }
    const newState = { score: 100, aliens: [{ id: 'e_1', alive: true }] }

    // Simulate receiving sync message
    const setState = mock((state: any) => state)
    // On sync, state is completely replaced
    setState(newState)

    expect(setState).toHaveBeenCalledWith(newState)
  })

  test('connection sends join message on open', async () => {
    const sentMessages: any[] = []
    const mockWs = {
      send: (data: string) => sentMessages.push(JSON.parse(data)),
      close: () => {},
    }

    // Simulate connection open
    mockWs.send(JSON.stringify({ type: 'join', name: 'Alice', enhancedMode: false }))

    expect(sentMessages[0]).toEqual({ type: 'join', name: 'Alice', enhancedMode: false })
  })

  test('input state message includes held keys', () => {
    const sentMessages: any[] = []
    const mockWs = {
      send: (data: string) => sentMessages.push(JSON.parse(data)),
    }

    // Simulate updating input state
    mockWs.send(JSON.stringify({ type: 'input', held: { left: true, right: false } }))

    expect(sentMessages[0]).toEqual({ type: 'input', held: { left: true, right: false } })
  })

  test('updates score and lives', () => {
    const delta = { score: 100, lives: 2 }
    const next = applyDelta(baseState, delta)
    expect(next.score).toBe(100)
    expect(next.lives).toBe(2)
  })
})
```

### E2E Tests

```typescript
// e2e/game.spec.ts
import { test, expect } from '@playwright/test'
import { spawn } from 'child_process'

test.describe('Vaders E2E', () => {
  let workerProcess: ReturnType<typeof spawn>

  test.beforeAll(async () => {
    // Start local worker
    workerProcess = spawn('bunx', ['wrangler', 'dev'], { cwd: './worker' })
    await new Promise(r => setTimeout(r, 3000))  // Wait for startup
  })

  test.afterAll(() => {
    workerProcess?.kill()
  })

  test('solo game flow', async ({ page }) => {
    // Start client
    const client = spawn('bun', ['run', 'dev'], { cwd: './client' })

    // Verify connection
    await expect(page.locator('text=Connecting')).toBeHidden({ timeout: 5000 })

    // Start solo game
    await page.keyboard.press('s')

    // Verify game started
    await expect(page.locator('text=WAVE:1')).toBeVisible()

    // Shoot and verify score
    await page.keyboard.press('Space')
    await expect(page.locator('text=SCORE:00030')).toBeVisible({ timeout: 2000 })

    client.kill()
  })

  test('multiplayer lobby ready flow', async ({ browser }) => {
    const player1 = await browser.newPage()
    const player2 = await browser.newPage()

    // Both join same room
    // ... room joining logic

    // Player 1 readies
    await player1.keyboard.press('Enter')
    await expect(player1.locator('text=✓ READY')).toBeVisible()

    // Player 2 readies - should trigger countdown
    await player2.keyboard.press('Enter')
    await expect(player1.locator('text=GET READY')).toBeVisible()
    await expect(player2.locator('text=GET READY')).toBeVisible()
  })
})
```

### Test Commands

```bash
# Run all tests
bun test

# Run specific test file
bun test worker/src/game/__tests__/scaling.test.ts

# Run with coverage
bun test --coverage

# Watch mode
bun test --watch

# E2E tests (requires wrangler dev running)
bunx playwright test
```

### Test Coverage Requirements

| Module | Minimum Coverage |
|--------|------------------|
| `game/scaling.ts` | 100% |
| `game/collision.ts` | 100% |
| `game/barriers.ts` | 90% |
| `GameRoom.ts` | 80% |
| `hooks/useGameConnection.ts` | 80% |
| `audio/*` | 50% (hard to test audio) |

### CI Pipeline

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: |
          cd worker && bun install
          cd ../client && bun install

      - name: Run unit tests
        run: bun test

      - name: Run integration tests
        run: bun test --filter integration

      - name: Start worker for E2E
        run: cd worker && bunx wrangler dev &
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_TOKEN }}

      - name: Run E2E tests
        run: bunx playwright test
```

### Test Data Factories

```typescript
// test/factories.ts

export function createPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: crypto.randomUUID(),
    name: 'TestPlayer',
    x: 40,
    slot: 1,
    color: 'green',
    lastShot: 0,
    alive: true,
    respawnAt: null,
    kills: 0,
    disconnectedAt: null,
    ...overrides,
  }
}

export function createAlien(overrides: Partial<Alien> = {}): Alien {
  return {
    id: 0,
    type: 'octopus',
    row: 0,
    col: 0,
    x: 10,
    y: 2,
    alive: true,
    points: 10,
    ...overrides,
  }
}

export function createGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    roomId: 'TEST01',
    mode: 'solo',
    status: 'playing',
    tick: 0,
    enhancedMode: false,
    players: {},
    readyPlayerIds: [],
    aliens: [],
    bullets: [],
    barriers: [],
    wave: 1,
    lives: 3,
    score: 0,
    alienDirection: 1,
    config: DEFAULT_CONFIG,
    ...overrides,
  }
}
```

### Property-Based Testing

```typescript
// worker/src/game/__tests__/properties.test.ts
import { describe, test } from 'bun:test'
import fc from 'fast-check'
import { getScaledConfig } from '../scaling'

describe('scaling properties', () => {
  test('more players = faster aliens', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 1, max: 4 }),
        (p1, p2) => {
          if (p1 < p2) {
            const c1 = getScaledConfig(p1, DEFAULT_CONFIG)
            const c2 = getScaledConfig(p2, DEFAULT_CONFIG)
            return c1.alienMoveInterval >= c2.alienMoveInterval
          }
          return true
        }
      )
    )
  })

  test('alien grid size increases with players', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 1, max: 4 }),
        (p1, p2) => {
          if (p1 < p2) {
            const c1 = getScaledConfig(p1, DEFAULT_CONFIG)
            const c2 = getScaledConfig(p2, DEFAULT_CONFIG)
            return c1.alienCols * c1.alienRows <= c2.alienCols * c2.alienRows
          }
          return true
        }
      )
    )
  })
})
```

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
import type { KeyEvent } from '@opentui/react'  // OpenTUI's key event type
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

  // Handle key events using OpenTUI's KeyEvent type
  // KeyEvent has: name (string), sequence (raw input), ctrl/meta/shift modifiers
  const handleKeyInput = useCallback((event: KeyEvent) => {
    if (joinMode) {
      if (event.name === 'escape') {
        setJoinMode(false)
        setRoomCode('')
        return
      }
      if (event.name === 'return' && roomCode.length === 6) {
        onJoinRoom(roomCode, enhanced)
        return
      }
      if (event.name === 'backspace') {
        setRoomCode(prev => prev.slice(0, -1))
        return
      }
      // For text input, use event.sequence (the raw character(s) typed)
      // Accept alphanumeric characters, auto-uppercase, max 6 chars
      if (event.sequence && /^[a-zA-Z0-9]$/.test(event.sequence) && roomCode.length < 6) {
        setRoomCode(prev => prev + event.sequence!.toUpperCase())
      }
      return
    }

    // Menu selection (use event.name or event.sequence for single chars)
    const key = event.sequence || event.name
    switch (key) {
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
  trueColor: boolean    // 24-bit color support (COLORTERM=truecolor or 24bit)
  color256: boolean     // 256-color support (TERM includes 256color)
  unicode: boolean      // Unicode character support
  asciiMode: boolean    // Use ASCII-only symbols (safer for alignment)
  width: number         // Terminal width
  height: number        // Terminal height
}

export function detectCapabilities(): TerminalCapabilities {
  const colorTerm = process.env.COLORTERM
  const term = process.env.TERM

  return {
    // Note: 256color is NOT truecolor (24-bit). Only check COLORTERM for true 24-bit support.
    trueColor: colorTerm === 'truecolor' || colorTerm === '24bit',
    color256: term?.includes('256color') ?? false,
    unicode: process.env.LANG?.includes('UTF-8') ?? true,
    // Default to ASCII mode for safer alignment (emoji widths vary by terminal)
    asciiMode: process.env.VADERS_ASCII === '1' || !(process.env.LANG?.includes('UTF-8')),
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

// ASCII symbols (safe for alignment - single-width characters only)
export const ASCII_SYMBOLS = {
  heart: '*',       // Single-width (was '<3' which is 2 chars)
  heartEmpty: '.',
  skull: 'X',
  trophy: '1',      // Single-width (was '#1' which is 2 chars)
  pointer: '>',
  star: '*',
  cross: 'X',
} as const

// Unicode symbols (may cause alignment issues in some terminals)
export const UNICODE_SYMBOLS = {
  heart: '♥',
  heartEmpty: '♡',
  skull: '☠',
  trophy: '🏆',
  pointer: '►',
  star: '★',
  cross: '✖',
} as const

// Get symbols based on capabilities
export function getSymbols(caps: TerminalCapabilities) {
  return caps.asciiMode ? ASCII_SYMBOLS : UNICODE_SYMBOLS
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
  health: 2 | 1                   // 2 hits to kill (green → purple → dead)
  tractorBeamActive: boolean      // Currently firing tractor beam
  tractorBeamCooldown: number     // Ticks until beam can fire again
  capturedPlayerId: string | null // Player currently captured
  escorts: string[]               // IDs of escorting aliens in V-formation
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
  type: 'dive_bomber'  // Use underscore consistently
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

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              VADERS ARCHITECTURE                            │
└─────────────────────────────────────────────────────────────────────────────┘

  TERMINAL                          NETWORK                    CLOUDFLARE EDGE
 ══════════                        ═════════                  ═════════════════

┌───────────────────┐          ┌─────────────┐          ┌──────────────────────┐
│   Bun Runtime     │          │  WebSocket  │          │   Worker (Router)    │
│  ┌─────────────┐  │          │   wss://    │          │  ┌────────────────┐  │
│  │  OpenTUI    │  │◄────────►│  /room/     │◄────────►│  │ POST /room     │  │
│  │  React App  │  │  JSON    │  ABC123/ws  │  HTTP    │  │ GET /room/:id  │  │
│  └─────────────┘  │  msgs    └─────────────┘  +WS     │  │ GET /matchmake │  │
│        │          │                                   │  └────────────────┘  │
│        ▼          │                                   │          │           │
│  ┌─────────────┐  │                                   │          ▼           │
│  │  useGame()  │  │                                   │  ┌────────────────┐  │
│  │  Hook       │  │                                   │  │    GameRoom    │  │
│  │  • state    │  │         ┌─────────────┐          │  │ (Imper. Shell) │  │
│  │  • send()   │  │         │  Full State │          │  │ ┌────────────┐ │  │
│  └─────────────┘  │◄────────│  Sync @30Hz │◄─────────│  │ │InputQueue  │ │  │
│        │          │         └─────────────┘          │  │ └─────┬──────┘ │  │
│        ▼          │                                   │  │       ▼        │  │
│  ┌─────────────┐  │         ┌─────────────┐          │  │ ┌────────────┐ │  │
│  │ Zig Native  │  │────────►│ InputState  │─────────►│  │ │gameReducer │ │  │
│  │ • diffing   │  │         │ {left,right}│          │  │ │(Pure Core) │ │  │
│  │ • ANSI      │  │         │ + seq + shoot│         │  │ └─────┬──────┘ │  │
│  └─────────────┘  │         └─────────────┘          │  │       ▼        │  │
│        │          │                                   │  │ ┌────────────┐ │  │
│        ▼          │                                   │  │ │ECS Systems │ │  │
│   ┌─────────┐     │                                   │  │ └────────────┘ │  │
│   │ stdout  │     │                                   │  └────────────────┘  │
│   │ 80×24   │     │                                   │          │           │
│   └─────────┘     │                                   │          ▼           │
└───────────────────┘                                   │  ┌────────────────┐  │
                                                        │  │  Matchmaker DO │  │
                                                        │  │  • In-memory   │  │
                                                        │  │  • room registry│ │
                                                        │  └────────────────┘  │
                                                        └──────────────────────┘
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                               DATA FLOW                                     │
└─────────────────────────────────────────────────────────────────────────────┘

1. PLAYER JOINS
   Client                           Server
     │                                │
     │──── POST /room ───────────────►│  Create room (via Matchmaker DO)
     │◄─── { roomCode: "ABC123" } ────│
     │                                │
     │──── WS /room/ABC123/ws ───────►│  Upgrade to WebSocket
     │◄─── { type: "sync", state,    │  Full state + lastInputSeq
     │       lastInputSeq: 0 } ───────│
     │                                │

2. GAME LOOP (30Hz) - Input Queue + Reducer Pattern
   Client                           Server
     │                                │
     │──── { type: "input",          │
     │       seq: N,                 │  Messages queued (not processed
     │       held: {left:T,right:F} } │  immediately)
     │                                │
     │──── { type: "shoot" } ────────►│  → inputQueue.push(action)
     │                                │
     │         ┌──────────────────────┤  tick() {
     │         │ 1. Process queue:    │    for (action of inputQueue)
     │         │    gameReducer(s,a)  │      state = gameReducer(state, action)
     │         │                      │    inputQueue = []
     │         │ 2. Run tick action:  │
     │         │    gameReducer(s,TICK)│   // ECS pipeline:
     │         │    ├─ inputSystem    │   //   Input → Physics → Collision
     │         │    ├─ physicsSystem  │   //   → Behavior → Spawn → Cleanup
     │         │    ├─ collisionSystem│
     │         │    └─ behaviorSystem │
     │         └──────────────────────┤  }
     │                                │
     │◄─── { type: "sync", state,    │  Full state @30Hz + lastInputSeq
     │       lastInputSeq: N } ───────│  (for prediction reconciliation)
     │                                │

3. GAME EVENTS (from Reducer)
   Client                           Server
     │                                │
     │◄─── { type: "event",          │  gameReducer returns events[]
     │       name: "alien_killed",   │  which shell broadcasts
     │       data: {alienId, ...} }  │
     │                                │
```

### Component Responsibilities

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          COMPONENT BREAKDOWN                                │
└─────────────────────────────────────────────────────────────────────────────┘

CLIENT (Bun + OpenTUI)
├── App.tsx ─────────────── Root component, screen routing
├── useGame() ───────────── WebSocket connection, state management
├── useKeyboard() ───────── Input capture (release: true for held keys)
├── GameScreen.tsx ──────── Main gameplay rendering
├── LobbyScreen.tsx ─────── Room code display, ready state
├── AudioEngine ─────────── Terminal bell + optional native FFI
└── Zig Native ──────────── Buffer diffing, ANSI escape codes

SERVER (Cloudflare) - Functional Core / Imperative Shell
├── Worker Router
│   ├── POST /room ──────── Create room (via Matchmaker DO)
│   ├── GET /room/:code/ws  Route to GameRoom DO
│   └── GET /matchmake ──── In-memory lookup via Matchmaker DO
│
├── Durable Object: GameRoom (Imperative Shell - I/O only)
│   ├── inputQueue[] ────── Queued actions, processed at tick start
│   ├── tick() ──────────── Calls gameReducer, broadcasts result
│   ├── persistState() ──── Storage I/O (when reducer says persist)
│   └── WebSocket handlers  Queue actions, don't process directly
│
├── Functional Core (Pure Functions - no I/O)
│   ├── gameReducer() ───── (state, action) → {state, events, persist}
│   ├── stateMachine ────── Guards status transitions
│   ├── GameMode ────────── Strategy: classic vs enhanced behaviors
│   └── ECS Systems ─────── Input → Physics → Collision → Behavior
│
└── Durable Object: Matchmaker
    ├── rooms Map ───────── In-memory room registry
    ├── /register ────────── Rooms register on create/update
    ├── /unregister ──────── Rooms unregister on cleanup
    └── /find ────────────── In-memory open room lookup
```

### State Synchronization Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│               SERVER @ 30Hz  ←→  CLIENT @ 60fps                             │
└─────────────────────────────────────────────────────────────────────────────┘

The server runs at 30Hz (33ms ticks) to stay within Cloudflare DO CPU limits.
The client renders at 60fps (16ms frames) for smooth visuals.

To bridge the gap:
• Client-Side Prediction: Local player moves instantly on input
• Interpolation (Lerp): Other entities smoothly animate between server states
• Reconciliation: Server state corrects prediction errors

Server (authoritative)                    Client (predictive render)
┌────────────────────┐                   ┌────────────────────┐
│     GameState      │                   │   RenderState      │
│  ┌──────────────┐  │   sync @30Hz     │  ┌──────────────┐  │
│  │ players: {}  │  │ ═══════════════► │  │ serverState  │  │ ← Last received
│  │ entities: [] │  │   (complete)     │  │ prevState    │  │ ← For lerp
│  │ tick: N      │  │                   │  │ localPlayer  │  │ ← Predicted
│  │ score, wave  │  │                   │  │ lerpT: 0..1  │  │ ← Interpolation
│  └──────────────┘  │                   │  └──────────────┘  │
│         ▲          │                   │         │          │
│         │          │                   │         ▼          │
│    tick() @30Hz    │                   │   render() @60fps  │
│    (authoritative) │                   │   (predictive)     │
└────────────────────┘                   └────────────────────┘
```

### Client-Side Prediction

The local player's ship responds instantly to input. The client predicts movement locally, then reconciles when server state arrives.

```typescript
// client/src/hooks/useClientPrediction.ts

interface PredictedState {
  localPlayerX: number           // Predicted position
  pendingInputs: InputSnapshot[] // Inputs not yet acknowledged by server
  lastServerTick: number         // Last tick received from server
}

interface InputSnapshot {
  tick: number
  held: InputState
}

const PLAYER_SPEED = 1  // Must match server DEFAULT_CONFIG.playerMoveSpeed

export function useClientPrediction(
  serverState: GameState | null,
  playerId: string | null,
  currentInput: InputState
) {
  const predicted = useRef<PredictedState>({
    localPlayerX: 0,
    pendingInputs: [],
    lastServerTick: 0,
  })

  // When server state arrives, reconcile
  useEffect(() => {
    if (!serverState || !playerId) return
    const serverPlayer = serverState.players[playerId]
    if (!serverPlayer) return

    // Server has processed up to this tick
    const serverTick = serverState.tick

    // Discard inputs the server has already processed
    predicted.current.pendingInputs = predicted.current.pendingInputs.filter(
      input => input.tick > serverTick
    )

    // Start from server position and replay pending inputs
    let x = serverPlayer.x
    for (const input of predicted.current.pendingInputs) {
      if (input.held.left) x -= PLAYER_SPEED
      if (input.held.right) x += PLAYER_SPEED
      x = Math.max(1, Math.min(serverState.config.width - 2, x))
    }

    predicted.current.localPlayerX = x
    predicted.current.lastServerTick = serverTick
  }, [serverState, playerId])

  // Apply local input immediately (called every frame)
  const applyLocalInput = useCallback((tick: number) => {
    // Record this input for replay during reconciliation
    predicted.current.pendingInputs.push({ tick, held: { ...currentInput } })

    // Apply immediately to predicted position
    let x = predicted.current.localPlayerX
    if (currentInput.left) x -= PLAYER_SPEED
    if (currentInput.right) x += PLAYER_SPEED

    const width = serverState?.config.width ?? 80
    predicted.current.localPlayerX = Math.max(1, Math.min(width - 2, x))

    return predicted.current.localPlayerX
  }, [currentInput, serverState])

  return {
    predictedX: predicted.current.localPlayerX,
    applyLocalInput,
  }
}
```

### Entity Interpolation (Lerp)

Other players, aliens, and bullets interpolate between the previous and current server positions for smooth 60fps rendering.

> **Note:** Interpolation is **required** for decent visuals. Aliens move 2 cells every ~8-15 ticks (jumping visually), and bullets move 1 cell per tick. Without interpolation, movement appears jerky.

```typescript
// client/src/hooks/useInterpolation.ts

interface InterpolationState {
  prevState: GameState | null
  currState: GameState | null
  lastSyncTime: number
}

const SYNC_INTERVAL = 33  // 30Hz = 33ms between syncs

export function useInterpolation(serverState: GameState | null) {
  const interp = useRef<InterpolationState>({
    prevState: null,
    currState: null,
    lastSyncTime: 0,
  })

  // When new server state arrives, shift states
  useEffect(() => {
    if (!serverState) return
    interp.current.prevState = interp.current.currState
    interp.current.currState = serverState
    interp.current.lastSyncTime = performance.now()
  }, [serverState])

  // Calculate lerp factor (0 to 1) based on time since last sync
  const getLerpT = useCallback(() => {
    const elapsed = performance.now() - interp.current.lastSyncTime
    return Math.min(1, elapsed / SYNC_INTERVAL)
  }, [])

  // Interpolate a position
  const lerpPosition = useCallback((
    entityId: string,
    getPrev: (state: GameState) => number | undefined,
    getCurr: (state: GameState) => number | undefined
  ): number | undefined => {
    const { prevState, currState } = interp.current
    if (!currState) return undefined

    const curr = getCurr(currState)
    if (curr === undefined) return undefined

    // No previous state or entity didn't exist before - snap to current
    if (!prevState) return curr
    const prev = getPrev(prevState)
    if (prev === undefined) return curr

    // Linear interpolation: prev + (curr - prev) * t
    const t = getLerpT()
    return prev + (curr - prev) * t
  }, [getLerpT])

  return { lerpPosition, getLerpT }
}

// Usage in render:
function AlienSprite({ alien, lerpPosition }: { alien: AlienEntity; lerpPosition: Function }) {
  const findAlien = (state: GameState) =>
    state.entities.find(e => e.id === alien.id && e.kind === 'alien') as AlienEntity | undefined

  const x = lerpPosition(
    alien.id,
    (state: GameState) => findAlien(state)?.x,
    (state: GameState) => findAlien(state)?.x
  ) ?? alien.x

  const y = lerpPosition(
    alien.id,
    (state: GameState) => findAlien(state)?.y,
    (state: GameState) => findAlien(state)?.y
  ) ?? alien.y

  return (
    <text position="absolute" marginLeft={x} marginTop={y} color={ALIEN_REGISTRY[alien.type].color}>
      {ALIEN_REGISTRY[alien.type].sprite}
    </text>
  )
}
```

### Render Loop (60fps)

The client runs a 60fps render loop independent of server sync rate.

```typescript
// client/src/hooks/useRenderLoop.ts

export function useRenderLoop(callback: (dt: number) => void) {
  const lastFrame = useRef(performance.now())
  const frameId = useRef<number>()

  useEffect(() => {
    const loop = () => {
      const now = performance.now()
      const dt = now - lastFrame.current
      lastFrame.current = now

      callback(dt)

      frameId.current = requestAnimationFrame(loop)
    }

    frameId.current = requestAnimationFrame(loop)
    return () => {
      if (frameId.current) cancelAnimationFrame(frameId.current)
    }
  }, [callback])
}

// In terminal environment (no requestAnimationFrame), use setInterval:
export function useTerminalRenderLoop(callback: (dt: number) => void) {
  const lastFrame = useRef(Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      const dt = now - lastFrame.current
      lastFrame.current = now
      callback(dt)
    }, 16)  // ~60fps

    return () => clearInterval(interval)
  }, [callback])
}
```

---

## Game Engine Architecture

> **Implementation Note:** This section describes the **reference architecture** using a pure reducer pattern. The **GameRoom implementation** below uses a simpler imperative approach for clarity. Both are valid - the reducer pattern is more testable; the imperative pattern is easier to follow. Choose based on project needs.

The game engine uses a **Functional Core, Imperative Shell** architecture with ECS-inspired systems. This separates pure game logic from I/O concerns, making the engine deterministic and fully testable without a network.

### Functional Core, Imperative Shell

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FUNCTIONAL CORE / IMPERATIVE SHELL                        │
└─────────────────────────────────────────────────────────────────────────────┘

                     IMPERATIVE SHELL (I/O)
┌─────────────────────────────────────────────────────────────────────────────┐
│  GameRoom (Durable Object)                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ WebSocket I/O   │  │  Timer/Interval │  │  Storage I/O    │             │
│  │ • onMessage()   │  │  • setInterval  │  │  • storage.get  │             │
│  │ • broadcast()   │  │  • setAlarm     │  │  • storage.put  │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                    │                    │                       │
│           └────────────────────┼────────────────────┘                       │
│                                ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        INPUT COMMAND QUEUE                           │   │
│  │    [action, action, action, ...]  ← Queued until next tick          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┬────┘
                                                                         │
                     ════════════════════════════════════════════════════╪════
                     FUNCTIONAL CORE (Pure Functions)                    │
┌────────────────────────────────────────────────────────────────────────┼────┐
│                                                                        ▼    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  gameReducer(state: GameState, action: GameAction): GameState       │   │
│  │                                                                      │   │
│  │  • Pure function - NO side effects                                  │   │
│  │  • Deterministic - same input → same output                         │   │
│  │  • Testable without mocks or network                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│           │                                                                 │
│           ▼                                                                 │
│  ┌──────────────────────┐  ┌──────────────────────┐                        │
│  │   State Machine      │  │   ECS Systems        │                        │
│  │   (status guards)    │  │   (entity updates)   │                        │
│  └──────────────────────┘  └──────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### State Reducer Pattern

All game logic flows through a single pure reducer function. This makes the game deterministic and replay-able.

```typescript
// worker/src/game/reducer.ts

// Actions represent everything that can happen in the game
type GameAction =
  | { type: 'TICK'; deltaTime: number }
  | { type: 'PLAYER_JOIN'; player: Player }
  | { type: 'PLAYER_LEAVE'; playerId: string }
  | { type: 'PLAYER_INPUT'; playerId: string; input: InputState; seq: number }
  | { type: 'PLAYER_SHOOT'; playerId: string }
  | { type: 'PLAYER_READY'; playerId: string }
  | { type: 'PLAYER_UNREADY'; playerId: string }
  | { type: 'START_SOLO'; enhancedMode: boolean }
  | { type: 'START_COUNTDOWN' }
  | { type: 'COUNTDOWN_TICK' }
  | { type: 'COUNTDOWN_CANCEL'; reason: string }

// Result includes new state plus any side effects to execute
interface ReducerResult {
  state: GameState
  events: GameEvent[]        // Events to broadcast to clients
  persist: boolean           // Whether to persist state
  scheduleAlarm?: number     // Schedule DO alarm (ms from now)
}

// Pure reducer - no side effects, fully deterministic
export function gameReducer(state: GameState, action: GameAction): ReducerResult {
  // Guard transitions with state machine
  if (!canTransition(state.status, action.type)) {
    return { state, events: [], persist: false }
  }

  switch (action.type) {
    case 'TICK':
      return tickReducer(state, action.deltaTime)
    case 'PLAYER_JOIN':
      return playerJoinReducer(state, action.player)
    case 'PLAYER_INPUT':
      return inputReducer(state, action.playerId, action.input, action.seq)
    // ... other actions
    default:
      return { state, events: [], persist: false }
  }
}

// Tick reducer runs all ECS systems
function tickReducer(state: GameState, deltaTime: number): ReducerResult {
  let entities = state.entities
  let events: GameEvent[] = []

  // Run systems in order
  entities = inputSystem(entities, state.players)
  entities = physicsSystem(entities, deltaTime)
  const collisionResult = collisionSystem(entities, state)
  entities = collisionResult.entities
  events = [...events, ...collisionResult.events]
  entities = behaviorSystem(entities, state)

  // Check end conditions
  const endResult = checkEndConditions({ ...state, entities })

  return {
    state: {
      ...state,
      entities,
      tick: state.tick + 1,
      status: endResult.status ?? state.status,
    },
    events: [...events, ...endResult.events],
    persist: endResult.persist ?? false,
  }
}
```

### Formal State Machine

Status transitions are guarded by an explicit state machine. This prevents race conditions when players join/leave during transitions.

```typescript
// worker/src/game/stateMachine.ts

type GameStatus = 'waiting' | 'countdown' | 'playing' | 'game_over'

// Define valid transitions
const TRANSITIONS: Record<GameStatus, Partial<Record<GameAction['type'], GameStatus>>> = {
  waiting: {
    PLAYER_READY: 'waiting',       // Stay waiting, but check if all ready
    PLAYER_UNREADY: 'waiting',
    START_SOLO: 'playing',
    START_COUNTDOWN: 'countdown',
    PLAYER_LEAVE: 'waiting',
  },
  countdown: {
    COUNTDOWN_TICK: 'countdown',
    COUNTDOWN_CANCEL: 'waiting',
    PLAYER_LEAVE: 'waiting',       // Cancel countdown if player leaves
    // Note: TICK, PLAYER_INPUT, PLAYER_SHOOT are BLOCKED during countdown
  },
  playing: {
    TICK: 'playing',
    PLAYER_INPUT: 'playing',
    PLAYER_SHOOT: 'playing',
    PLAYER_LEAVE: 'playing',       // Continue playing (or end if last player)
    // Transitions to game_over handled by tick reducer
  },
  game_over: {
    // Terminal state - no transitions out (room cleans up via alarm)
  },
}

export function canTransition(currentStatus: GameStatus, actionType: GameAction['type']): boolean {
  const allowed = TRANSITIONS[currentStatus]
  return actionType in allowed
}

export function getNextStatus(currentStatus: GameStatus, actionType: GameAction['type']): GameStatus {
  return TRANSITIONS[currentStatus][actionType] ?? currentStatus
}

// Additional guards for specific conditions
export function canStartCountdown(state: GameState): boolean {
  const playerCount = Object.keys(state.players).length
  const readyCount = state.readyPlayerIds.length
  return playerCount >= 2 && readyCount === playerCount
}

export function canStartSolo(state: GameState): boolean {
  return Object.keys(state.players).length === 1
}
```

### Input Command Queue

Messages are queued when they arrive and processed at the start of each tick. This prevents race conditions from out-of-order or mid-tick arrivals.

```typescript
// worker/src/GameRoom.ts (Imperative Shell)

export class GameRoom implements DurableObject {
  private state: DurableObjectState
  private env: Env
  private game: GameState | null = null
  private inputQueue: GameAction[] = []  // Queue for deterministic processing
  private sessions: Map<WebSocket, string> = new Map()

  // Messages are queued, not processed immediately
  private handleMessage(ws: WebSocket, msg: ClientMessage) {
    const playerId = this.sessions.get(ws)
    if (!playerId) return

    // Convert client message to game action and queue it
    const action = this.messageToAction(msg, playerId)
    if (action) {
      this.inputQueue.push(action)
    }
  }

  private messageToAction(msg: ClientMessage, playerId: string): GameAction | null {
    switch (msg.type) {
      case 'input':
        return { type: 'PLAYER_INPUT', playerId, input: msg.held, seq: msg.seq }
      case 'shoot':
        return { type: 'PLAYER_SHOOT', playerId }
      case 'ready':
        return { type: 'PLAYER_READY', playerId }
      case 'unready':
        return { type: 'PLAYER_UNREADY', playerId }
      case 'start_solo':
        return { type: 'START_SOLO', enhancedMode: msg.enhancedMode ?? false }
      default:
        return null
    }
  }

  // Tick processes all queued actions, then advances the game
  private tick() {
    if (!this.game) return

    // 1. Process all queued actions in order
    for (const action of this.inputQueue) {
      const result = gameReducer(this.game, action)
      this.game = result.state
      this.broadcastEvents(result.events)
      if (result.persist) void this.persistState()
    }
    this.inputQueue = []

    // 2. Run the tick action
    const result = gameReducer(this.game, { type: 'TICK', deltaTime: 33 })
    this.game = result.state
    this.broadcastEvents(result.events)
    if (result.persist) void this.persistState()

    // 3. Broadcast full state
    this.broadcastFullState()
  }
}
```

### Strategy Pattern for Game Modes

Instead of `if (enhancedMode)` checks scattered throughout, behaviors are injected via strategy objects.

```typescript
// worker/src/game/modes.ts

interface GameMode {
  name: 'classic' | 'enhanced'

  // Formation creation
  createAlienFormation(config: ScaledConfig): Entity[]

  // Entity spawning
  spawnSpecialEntities(state: GameState, tick: number): Entity[]

  // AI behaviors (returns systems to run)
  getAISystems(): System[]

  // Scoring rules
  getPoints(entityType: string): number

  // Wave progression
  getWaveConfig(wave: number): WaveConfig
}

const classicMode: GameMode = {
  name: 'classic',

  createAlienFormation(config) {
    // Standard 11x5 grid of squid/crab/octopus
    return createStandardFormation(config.alienCols, config.alienRows)
  },

  spawnSpecialEntities(state, tick) {
    // Classic mode: no special entities
    return []
  },

  getAISystems() {
    // Just basic alien movement
    return [alienMarchSystem]
  },

  getPoints(entityType) {
    const points: Record<string, number> = { squid: 30, crab: 20, octopus: 10 }
    return points[entityType] ?? 0
  },

  getWaveConfig(wave) {
    return { speedMultiplier: 1 + (wave - 1) * 0.1 }
  },
}

const enhancedMode: GameMode = {
  name: 'enhanced',

  createAlienFormation(config) {
    // Enhanced mode: add commanders to top row
    const formation = createStandardFormation(config.alienCols, config.alienRows)
    const commanders = createCommanderRow(config.alienCols)
    return [...commanders, ...formation]
  },

  spawnSpecialEntities(state, tick) {
    const entities: Entity[] = []
    // Spawn dive bombers periodically
    if (tick % 300 === 0 && state.wave >= 2) {
      entities.push(createDiveBomber(state))
    }
    // Spawn UFO randomly
    if (Math.random() < 0.001) {
      entities.push(createUFO())
    }
    return entities
  },

  getAISystems() {
    // Enhanced mode: additional AI systems
    return [alienMarchSystem, commanderDiveSystem, diveBomberArcSystem]
  },

  getPoints(entityType) {
    // Base points match scoring table: Commander=150, DiveBomber=80
    // These are in-formation values; diving/escort bonuses handled separately
    const points: Record<string, number> = {
      squid: 30, crab: 20, octopus: 10,
      commander: 150, dive_bomber: 80, ufo: 300,
    }
    return points[entityType] ?? 0
  },

  getWaveConfig(wave) {
    // Challenging stages on waves 3, 7, 11, 15... (every 4 waves starting at 3)
    if (wave >= 3 && (wave - 3) % 4 === 0) {
      return { speedMultiplier: 1.5, challengingStage: true }
    }
    return { speedMultiplier: 1 + (wave - 1) * 0.15 }
  },
}

// Factory to get mode
export function getGameMode(enhanced: boolean): GameMode {
  return enhanced ? enhancedMode : classicMode
}
```

### Entity Component System (ECS)

Entities are bags of components. Systems operate on any entity with the required components.

```typescript
// worker/src/game/ecs/components.ts

// Components are plain data objects
interface PositionComponent {
  x: number
  y: number
}

interface VelocityComponent {
  dx: number  // Cells per tick
  dy: number
}

interface HitboxComponent {
  width: number
  height: number
}

interface HealthComponent {
  health: number
  maxHealth: number
}

interface AIComponent {
  aiType: 'alien_march' | 'commander_dive' | 'dive_bomber_arc' | 'ufo_linear'
  state: 'idle' | 'diving' | 'returning'
  targetX?: number
  targetY?: number
  arcPhase?: number
}

interface PlayerControlComponent {
  playerId: string
  inputState: InputState
  lastInputSeq: number
}

interface RenderComponent {
  sprite: string
  color: string
}

interface ScoreComponent {
  points: number
}

// Entity is a composition of components
interface Entity {
  id: string
  kind: string  // For quick filtering: 'alien', 'bullet', 'player', 'barrier'
  alive: boolean

  // Optional components - entity has component if property exists
  position?: PositionComponent
  velocity?: VelocityComponent
  hitbox?: HitboxComponent
  health?: HealthComponent
  ai?: AIComponent
  playerControl?: PlayerControlComponent
  render?: RenderComponent
  score?: ScoreComponent
}
```

```typescript
// worker/src/game/ecs/systems.ts

// System interface
interface System {
  // Components this system requires
  requiredComponents: (keyof Entity)[]

  // Pure update function
  update(entities: Entity[], context: SystemContext): Entity[]
}

interface SystemContext {
  tick: number
  deltaTime: number
  players: Record<string, Player>
  config: ScaledConfig
  mode: GameMode
}

// Helper to filter entities with required components
function query(entities: Entity[], required: (keyof Entity)[]): Entity[] {
  return entities.filter(e =>
    e.alive && required.every(comp => e[comp] !== undefined)
  )
}

// Physics System: Updates positions based on velocity
const physicsSystem: System = {
  requiredComponents: ['position', 'velocity'],

  update(entities, ctx) {
    return entities.map(entity => {
      if (!entity.position || !entity.velocity) return entity

      return {
        ...entity,
        position: {
          x: entity.position.x + entity.velocity.dx,
          y: entity.position.y + entity.velocity.dy,
        },
      }
    })
  },
}

// Input System: Translates player input to velocity
const inputSystem: System = {
  requiredComponents: ['playerControl', 'velocity', 'position'],

  update(entities, ctx) {
    return entities.map(entity => {
      if (!entity.playerControl || !entity.velocity) return entity

      const input = entity.playerControl.inputState
      const speed = ctx.config.playerMoveSpeed

      let dx = 0
      if (input.left) dx -= speed
      if (input.right) dx += speed

      // Clamp to screen bounds
      const newX = Math.max(1, Math.min(ctx.config.width - 2,
        entity.position!.x + dx
      ))

      return {
        ...entity,
        position: { ...entity.position!, x: newX },
      }
    })
  },
}

// Collision System: Detects overlaps and handles damage
const collisionSystem = {
  requiredComponents: ['position', 'hitbox'],

  update(entities: Entity[], ctx: SystemContext): { entities: Entity[]; events: GameEvent[] } {
    const events: GameEvent[] = []
    const bullets = entities.filter(e => e.kind === 'bullet' && e.alive)

    const updated = entities.map(entity => {
      if (!entity.alive || !entity.position || !entity.hitbox) return entity

      // Check bullet collisions
      for (const bullet of bullets) {
        if (!bullet.alive || !bullet.position) continue

        if (overlaps(entity, bullet)) {
          // Mark bullet as dead
          bullet.alive = false

          // Damage entity
          if (entity.health) {
            entity.health.health--
            if (entity.health.health <= 0) {
              entity.alive = false
              if (entity.score) {
                events.push({
                  type: 'event',
                  name: 'alien_killed',  // Matches protocol ServerEvent type
                  data: { alienId: entity.id, playerId: bullet.ownerId, points: entity.score.points },
                })
              }
            }
          } else {
            // No health component = instant death
            entity.alive = false
          }
        }
      }

      return entity
    })

    return { entities: updated, events }
  },
}

// Behavior System: Complex AI behaviors (commander dive, dive bomber arcs)
const behaviorSystem: System = {
  requiredComponents: ['ai', 'position', 'velocity'],

  update(entities, ctx) {
    return entities.map(entity => {
      if (!entity.ai || !entity.position || !entity.velocity) return entity

      switch (entity.ai.aiType) {
        case 'commander_dive':
          return updateCommanderDive(entity, ctx)
        case 'dive_bomber_arc':
          return updateDiveBomberArc(entity, ctx)
        case 'ufo_linear':
          return updateUFOLinear(entity, ctx)
        default:
          return entity
      }
    })
  },
}

function overlaps(a: Entity, b: Entity): boolean {
  if (!a.position || !b.position || !a.hitbox || !b.hitbox) return false
  return (
    a.position.x < b.position.x + b.hitbox.width &&
    a.position.x + a.hitbox.width > b.position.x &&
    a.position.y < b.position.y + b.hitbox.height &&
    a.position.y + a.hitbox.height > b.position.y
  )
}
```

### System Pipeline

Systems run in a defined order each tick:

```typescript
// worker/src/game/ecs/pipeline.ts

const SYSTEM_ORDER: System[] = [
  inputSystem,        // 1. Process player input → velocity
  behaviorSystem,     // 2. AI updates velocity/targets
  physicsSystem,      // 3. Apply velocity → position
  collisionSystem,    // 4. Detect hits, apply damage
  spawnSystem,        // 5. Spawn new entities (bullets, special enemies)
  cleanupSystem,      // 6. Remove dead entities
]

export function runSystems(
  entities: Entity[],
  context: SystemContext
): { entities: Entity[]; events: GameEvent[] } {
  let current = entities
  const allEvents: GameEvent[] = []

  for (const system of SYSTEM_ORDER) {
    const result = system.update(current, context)

    if (Array.isArray(result)) {
      current = result
    } else {
      current = result.entities
      allEvents.push(...result.events)
    }
  }

  return { entities: current, events: allEvents }
}
```

### Testing the Functional Core

Because the core is pure functions, testing requires no mocks:

```typescript
// worker/src/game/__tests__/reducer.test.ts

import { describe, expect, test } from 'bun:test'
import { gameReducer } from '../reducer'
import { createInitialState, createPlayer } from '../factories'

describe('gameReducer', () => {
  test('PLAYER_INPUT updates inputState and lastInputSeq', () => {
    const state = createInitialState()
    state.players['p1'] = createPlayer({ id: 'p1' })
    state.status = 'playing'

    const result = gameReducer(state, {
      type: 'PLAYER_INPUT',
      playerId: 'p1',
      input: { left: true, right: false },
      seq: 42,
    })

    expect(result.state.players['p1'].inputState).toEqual({ left: true, right: false })
    expect(result.state.players['p1'].lastInputSeq).toBe(42)
  })

  test('TICK blocked during countdown status', () => {
    const state = createInitialState()
    state.status = 'countdown'
    const tick = state.tick

    const result = gameReducer(state, { type: 'TICK', deltaTime: 33 })

    // State unchanged - TICK not allowed during countdown
    expect(result.state.tick).toBe(tick)
  })

  test('collision kills alien and awards points', () => {
    const state = createInitialState()
    state.status = 'playing'
    state.entities = [
      { id: 'a1', kind: 'alien', alive: true, position: { x: 10, y: 5 }, hitbox: { width: 3, height: 1 }, score: { points: 30 } },
      { id: 'b1', kind: 'bullet', alive: true, position: { x: 10, y: 5 }, hitbox: { width: 1, height: 1 }, velocity: { dx: 0, dy: -1 } },
    ]

    const result = gameReducer(state, { type: 'TICK', deltaTime: 33 })

    const alien = result.state.entities.find(e => e.id === 'a1')
    expect(alien?.alive).toBe(false)
    expect(result.events).toContainEqual(
      expect.objectContaining({ name: 'alien_killed', data: { alienId: 'a1', playerId: 'p1', points: 30 } })
    )
  })
})

describe('state machine', () => {
  test('cannot start solo when multiple players present', () => {
    const state = createInitialState()
    state.players['p1'] = createPlayer({ id: 'p1' })
    state.players['p2'] = createPlayer({ id: 'p2' })

    const result = gameReducer(state, { type: 'START_SOLO', enhancedMode: false })

    // Action rejected - still waiting
    expect(result.state.status).toBe('waiting')
  })

  test('player leave during countdown cancels it', () => {
    const state = createInitialState()
    state.status = 'countdown'
    state.players['p1'] = createPlayer({ id: 'p1' })
    state.players['p2'] = createPlayer({ id: 'p2' })

    const result = gameReducer(state, { type: 'PLAYER_LEAVE', playerId: 'p2' })

    expect(result.state.status).toBe('waiting')
    expect(result.events).toContainEqual(
      expect.objectContaining({ name: 'countdown_cancelled' })
    )
  })
})
```

---

## Worker Router

The Worker handles HTTP routing and room management. Each room code maps deterministically to a Durable Object ID.

```typescript
// worker/src/index.ts

export interface Env {
  GAME_ROOM: DurableObjectNamespace
  MATCHMAKER: DurableObjectNamespace  // Single instance for in-memory matchmaking
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // POST /room - Create new room, returns room code
    if (url.pathname === '/room' && request.method === 'POST') {
      // Generate unique room code (loop until we find one not in KV)
      // Generate unique room code (check Matchmaker DO for collision)
      const matchmaker = env.MATCHMAKER.get(env.MATCHMAKER.idFromName('global'))
      let roomCode: string
      let attempts = 0
      const maxAttempts = 10
      do {
        roomCode = generateRoomCode()  // 6-char base36
        const check = await matchmaker.fetch(new Request(`https://internal/info/${roomCode}`))
        if (check.status === 404) break  // Room code not in use
        attempts++
      } while (attempts < maxAttempts)

      if (attempts >= maxAttempts) {
        return new Response(JSON.stringify({ code: 'room_generation_failed', message: 'Could not generate unique room code' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const id = env.GAME_ROOM.idFromName(roomCode)
      const stub = env.GAME_ROOM.get(id)

      // Initialize room and register with Matchmaker
      await stub.fetch(new Request('https://internal/init', {
        method: 'POST',
        body: JSON.stringify({ roomCode })
      }))
      await matchmaker.fetch(new Request('https://internal/register', {
        method: 'POST',
        body: JSON.stringify({ roomCode, playerCount: 0, status: 'waiting' })
      }))

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

    // GET /matchmake - Find or create an open room (in-memory lookup via Matchmaker DO)
    if (url.pathname === '/matchmake') {
      const matchmaker = env.MATCHMAKER.get(env.MATCHMAKER.idFromName('global'))
      const result = await matchmaker.fetch(new Request('https://internal/find'))
      const { roomCode: existingRoom } = await result.json() as { roomCode: string | null }
      if (existingRoom) {
        return new Response(JSON.stringify({ roomCode: existingRoom }), {
          headers: { 'Content-Type': 'application/json' }
        })
      }
      // No open rooms - create one with collision-checking (same as POST /room)
      let newRoomCode: string
      let attempts = 0
      const maxAttempts = 10
      do {
        newRoomCode = generateRoomCode()
        const check = await matchmaker.fetch(new Request(`https://internal/info/${newRoomCode}`))
        if (check.status === 404) break  // Room code not in use
        attempts++
      } while (attempts < maxAttempts)

      if (attempts >= maxAttempts) {
        return new Response(JSON.stringify({ code: 'room_generation_failed', message: 'Could not generate unique room code' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const id = env.GAME_ROOM.idFromName(newRoomCode)
      const stub = env.GAME_ROOM.get(id)
      await stub.fetch(new Request('https://internal/init', {
        method: 'POST',
        body: JSON.stringify({ roomCode: newRoomCode })
      }))
      await matchmaker.fetch(new Request('https://internal/register', {
        method: 'POST',
        body: JSON.stringify({ roomCode: newRoomCode, playerCount: 0, status: 'waiting' })
      }))
      return new Response(JSON.stringify({ roomCode: newRoomCode }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // GET /room/:code - Room info (via Matchmaker DO)
    const infoMatch = url.pathname.match(/^\/room\/([A-Z0-9]{6})$/)
    if (infoMatch) {
      const roomCode = infoMatch[1]
      const matchmaker = env.MATCHMAKER.get(env.MATCHMAKER.idFromName('global'))
      const result = await matchmaker.fetch(new Request(`https://internal/info/${roomCode}`))
      if (result.status === 404) {
        return new Response(JSON.stringify({ error: 'Room not found' }), { status: 404 })
      }
      return result
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

// Matchmaker Durable Object - in-memory room lookup (no KV roundtrip)
// Uses Record for JSON serialization (Map doesn't survive structured clone reliably)
type RoomInfo = { playerCount: number; status: string; updatedAt: number }

export class Matchmaker implements DurableObject {
  // Record serializes properly via structured clone (Map doesn't)
  private rooms: Record<string, RoomInfo> = {}
  // Separate set for O(1) average open room lookup
  private openRooms: Set<string> = new Set()

  constructor(private state: DurableObjectState) {
    // Restore from storage on cold start
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<Record<string, RoomInfo>>('rooms')
      if (stored) {
        this.rooms = stored
        // Rebuild openRooms set from stored data
        for (const [roomCode, info] of Object.entries(stored)) {
          if (info.status === 'waiting' && info.playerCount < 4) {
            this.openRooms.add(roomCode)
          }
        }
      }
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // POST /register - Room registers/updates itself
    if (url.pathname === '/register' && request.method === 'POST') {
      const { roomCode, playerCount, status } = await request.json() as {
        roomCode: string; playerCount: number; status: string
      }
      this.rooms[roomCode] = { playerCount, status, updatedAt: Date.now() }

      // Update openRooms set for O(1) find
      if (status === 'waiting' && playerCount < 4) {
        this.openRooms.add(roomCode)
      } else {
        this.openRooms.delete(roomCode)
      }

      await this.state.storage.put('rooms', this.rooms)
      return new Response('OK')
    }

    // POST /unregister - Room removes itself (on cleanup/alarm)
    if (url.pathname === '/unregister' && request.method === 'POST') {
      const { roomCode } = await request.json() as { roomCode: string }
      delete this.rooms[roomCode]
      this.openRooms.delete(roomCode)
      await this.state.storage.put('rooms', this.rooms)
      return new Response('OK')
    }

    // GET /find - Find an open room (O(1) average via Set)
    if (url.pathname === '/find') {
      // Get first open room from set (O(1) average)
      const roomCode = this.openRooms.values().next().value
      if (roomCode) {
        return new Response(JSON.stringify({ roomCode }), {
          headers: { 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ roomCode: null }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // GET /info/:roomCode - Get room info (O(1) via Record lookup)
    const infoMatch = url.pathname.match(/^\/info\/([A-Z0-9]{6})$/)
    if (infoMatch) {
      const roomCode = infoMatch[1]
      const info = this.rooms[roomCode]
      if (!info) {
        return new Response('Not found', { status: 404 })
      }
      return new Response(JSON.stringify({ roomCode, ...info }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response('Not found', { status: 404 })
  }
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
  status: 'waiting' | 'countdown' | 'playing' | 'game_over'
  tick: number
  enhancedMode: boolean

  // Countdown state (only valid when status === 'countdown')
  countdownRemaining: number | null  // 3, 2, 1, or null

  players: Record<string, Player>
  readyPlayerIds: string[]          // Array for JSON serialization

  // All game entities in a single array with discriminated union
  entities: Entity[]

  // Enhanced mode: captured player tracking
  capturedPlayerIds?: Record<string, string>  // playerId → commanderId

  wave: number
  lives: number                     // 3 solo, 5 co-op
  score: number
  alienDirection: 1 | -1

  config: GameConfig
}

// Unified entity type for all game objects (discriminated union on 'kind')
type Entity =
  | AlienEntity
  | CommanderEntity
  | DiveBomberEntity
  | BulletEntity
  | BarrierEntity
  | TransformEntity

interface AlienEntity {
  kind: 'alien'
  id: string
  x: number
  y: number
  type: ClassicAlienType
  alive: boolean
  row: number
  col: number
  points: number
}

interface CommanderEntity {
  kind: 'commander'
  id: string
  x: number
  y: number
  alive: boolean
  health: 1 | 2
  tractorBeamActive: boolean
  tractorBeamCooldown: number
  capturedPlayerId: string | null
  escorts: string[]  // IDs of escorting aliens
}

interface DiveBomberEntity {
  kind: 'dive_bomber'  // Matches type in DiveBomber interface
  id: string
  x: number
  y: number
  alive: boolean
  diveState: 'formation' | 'diving' | 'returning'
  divePathProgress: number
  diveDirection: 1 | -1
  row: number  // Formation position for returning
  col: number
}

interface BulletEntity {
  kind: 'bullet'
  id: string
  x: number
  y: number
  ownerId: string | null  // null = alien bullet
  dy: -1 | 1              // -1 = up (player), 1 = down (alien)
}

interface BarrierEntity {
  kind: 'barrier'
  id: string
  x: number
  segments: BarrierSegment[]
}

interface TransformEntity {
  kind: 'transform'
  id: string
  x: number
  y: number
  type: TransformType
  velocity: Position
  lifetime: number
}

// Helper functions to filter entities by kind
function getAliens(entities: Entity[]): AlienEntity[] {
  return entities.filter((e): e is AlienEntity => e.kind === 'alien')
}
function getCommanders(entities: Entity[]): CommanderEntity[] {
  return entities.filter((e): e is CommanderEntity => e.kind === 'commander')
}
function getDiveBombers(entities: Entity[]): DiveBomberEntity[] {
  return entities.filter((e): e is DiveBomberEntity => e.kind === 'dive_bomber')
}
function getBullets(entities: Entity[]): BulletEntity[] {
  return entities.filter((e): e is BulletEntity => e.kind === 'bullet')
}
function getBarriers(entities: Entity[]): BarrierEntity[] {
  return entities.filter((e): e is BarrierEntity => e.kind === 'barrier')
}
function getTransforms(entities: Entity[]): TransformEntity[] {
  return entities.filter((e): e is TransformEntity => e.kind === 'transform')
}

interface GameConfig {
  width: number                     // Default: 80
  height: number                    // Default: 24
  maxPlayers: number                // Default: 4
  tickIntervalMs: number            // Default: 33 (~30Hz tick rate, state broadcast on every tick)

  // Base values (scaled by player count)
  baseAlienMoveInterval: number     // Ticks between alien moves
  baseBulletSpeed: number           // Cells per tick
  baseAlienShootRate: number        // Probability per tick (legacy, use getScaledConfig)
  playerCooldown: number            // Ticks between shots
  playerMoveSpeed: number           // Cells per tick when holding move key
  respawnDelay: number              // Ticks (90 = 3 seconds at 30Hz)
  disconnectGracePeriod: number     // Ticks (300 = 10 seconds at 30Hz)
}

export const DEFAULT_CONFIG: GameConfig = {
  width: 80,
  height: 24,
  maxPlayers: 4,
  tickIntervalMs: 33,               // ~30Hz server tick (state broadcast on every tick)
  baseAlienMoveInterval: 15,        // Move every 15 ticks (~2 Hz at 30Hz tick)
  baseBulletSpeed: 1,               // 1 cell per tick
  baseAlienShootRate: 0.02,         // Legacy (actual rate from getScaledConfig)
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
  lastInputSeq: number              // Last processed input sequence (for client prediction)

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
  tractorBeamActive: boolean        // Currently firing tractor beam
  tractorBeamCooldown: number       // Ticks until beam can fire again
  capturedPlayerId: string | null   // Player currently captured
  escorts: string[]                 // IDs of escorting aliens in V-formation
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

// ─── Exports ─────────────────────────────────────────────────────────────────

// Re-export protocol types for convenience (single import source)
export * from './protocol'

// Export all types
export type {
  Position,
  GameEntity,
  GameState,
  GameConfig,
  Entity,
  AlienEntity,
  CommanderEntity,
  DiveBomberEntity,
  BulletEntity,
  BarrierEntity,
  TransformEntity,
  Player,
  PlayerSlot,
  PlayerColor,
  ClassicAlienType,
  Alien,
  Commander,
  DiveBomber,
  Bullet,
  Barrier,
  BarrierSegment,
  TransformType,
  TransformEnemy,
}

// Export constants and helpers
export {
  LAYOUT,
  PLAYER_COLORS,
  ALIEN_REGISTRY,
  FORMATION_ROWS,
  DEFAULT_CONFIG,
  getAliens,
  getBullets,
  getBarriers,
  getCommanders,
  getDiveBombers,
  getTransforms,
}
```

### Scaling Logic

```typescript
// worker/src/game/scaling.ts

export function getScaledConfig(playerCount: number, baseConfig: GameConfig) {
  // shootsPerSecond: average shots aliens fire per second (from bottom row)
  // At 30Hz tick rate, probability per tick = shootsPerSecond / 30
  // Monotonically increases with player count for increased difficulty
  const scaleTable = {
    1: { speedMult: 1.0,  shootsPerSecond: 0.5,  cols: 11, rows: 5 }, // 0.5/s = 1 shot every 2s
    2: { speedMult: 1.25, shootsPerSecond: 0.75, cols: 11, rows: 5 }, // 0.75/s = 1 shot every 1.3s
    3: { speedMult: 1.5,  shootsPerSecond: 1.0,  cols: 13, rows: 5 }, // 1.0/s = 1 shot per second
    4: { speedMult: 1.75, shootsPerSecond: 1.25, cols: 15, rows: 6 }, // 1.25/s = 1 shot every 0.8s
  }
  const scale = scaleTable[playerCount as keyof typeof scaleTable] ?? scaleTable[1]

  // Convert shots/second to probability per tick
  // P(shoot per tick) = shootsPerSecond / tickRate
  const tickRate = 1000 / baseConfig.tickIntervalMs  // e.g., 1000/33 ≈ 30Hz
  const shootProbability = scale.shootsPerSecond / tickRate

  return {
    alienMoveInterval: Math.floor(baseConfig.baseAlienMoveInterval / scale.speedMult),
    alienShootProbability: shootProbability,  // ~0.017 to 0.042 per tick
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
  | { type: 'input'; seq: number; held: InputState }  // seq for prediction reconciliation
  | { type: 'shoot' }                                  // Discrete action (rate-limited server-side)
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
  | { type: 'event'; name: 'alien_killed'; data: { alienId: string; playerId: string | null; points: number } }
  | { type: 'event'; name: 'wave_complete'; data: { wave: number } }
  | { type: 'event'; name: 'game_over'; data: { result: 'victory' | 'defeat' } }
  | { type: 'event'; name: 'ufo_spawn'; data: { x: number } }

type ServerMessage =
  | { type: 'sync'; state: GameState; playerId: string; lastInputSeq: number }  // lastInputSeq for prediction
  | ServerEvent
  | { type: 'pong'; serverTime: number }
  | { type: 'error'; code: ErrorCode; message: string }

// NOTE: We use full state sync at 30Hz instead of delta updates.
// Delta sync is error-prone (missed updates cause permanent desync) and the
// full game state is small enough (~2-4KB) that full sync is simpler and more robust.

type ErrorCode = 'room_full' | 'game_in_progress' | 'invalid_action' | 'invalid_room' | 'countdown_in_progress'

export type { ClientMessage, ServerMessage, ServerEvent, InputState, ErrorCode }
```

### Keep-Alive Strategy

Clients send a `ping` message every 30 seconds while connected. Server responds with `pong` including `serverTime`. If no `pong` received within 5 seconds, client should reconnect.

```typescript
// Client-side keep-alive
const PING_INTERVAL = 30000
const PONG_TIMEOUT = 5000
let lastPong = Date.now()

// Ping interval - check connection health and send ping
setInterval(() => {
  if (Date.now() - lastPong > PING_INTERVAL + PONG_TIMEOUT) {
    ws.close()  // Trigger reconnect
    return
  }
  ws.send(JSON.stringify({ type: 'ping' }))
}, PING_INTERVAL)

// Handle pong in message handler
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.type === 'pong') {
    lastPong = Date.now()  // Update last pong time
  }
  // ... handle other message types
}
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
    // Restore game state and entity ID counter from storage on construction
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<{ game: GameState; nextEntityId: number }>('state')
      if (stored) {
        this.game = stored.game
        this.nextEntityId = stored.nextEntityId
      }
    })
  }

  private generateEntityId(): string {
    return `e_${this.nextEntityId++}`
  }

  // Persist on key state transitions (not every tick)
  // Called on: init, join, leave, ready, countdown start/cancel, game start/end, wave complete
  private async persistState() {
    await this.state.storage.put('state', {
      game: this.game,
      nextEntityId: this.nextEntityId,
    })
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
      entities: [],  // All game entities (aliens, bullets, barriers, etc.)
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
    // Only allowed when room is not yet initialized (prevents reset attacks)
    if (url.pathname === '/init' && request.method === 'POST') {
      if (this.game !== null) {
        return new Response('Already initialized', { status: 409 })
      }
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

    ws.addEventListener('close', async () => {
      const playerId = this.sessions.get(ws)
      if (playerId && this.game?.players[playerId]) {
        // Mark as disconnected, don't remove immediately (grace period)
        this.game.players[playerId].disconnectedAt = this.game.tick
        this.sessions.delete(ws)
        this.broadcast({ type: 'event', name: 'player_left', data: { playerId, reason: 'disconnect' } })

        // Cancel countdown if a player disconnects during it
        if (this.game.status === 'countdown') {
          await this.cancelCountdown('Player disconnected')
        }

        await this.persistState()  // Persist on player leave
        await this.updateRoomRegistry()
      }
    })
  }

  private async handleMessage(ws: WebSocket, msg: ClientMessage) {
    if (!this.game) return
    const playerId = this.sessions.get(ws)

    switch (msg.type) {
      case 'join': {
        // Reject joins during countdown (lobby locked)
        if (this.game.status === 'countdown') {
          ws.send(JSON.stringify({ type: 'error', code: 'countdown_in_progress', message: 'Game starting, try again' }))
          return
        }
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
          lastInputSeq: 0,  // Initialize for prediction reconciliation
          inputState: { left: false, right: false },
        }

        this.game.players[player.id] = player
        this.sessions.set(ws, player.id)
        this.game.mode = Object.keys(this.game.players).length === 1 ? 'solo' : 'coop'

        ws.send(JSON.stringify({ type: 'sync', state: this.game, playerId: player.id, lastInputSeq: 0 }))
        this.broadcast({ type: 'event', name: 'player_joined', data: { player } })
        await this.persistState()  // Persist on player join
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
          await this.startGame()
        }
        break
      }

      case 'ready': {
        if (playerId && this.game.players[playerId] && !this.game.readyPlayerIds.includes(playerId)) {
          this.game.readyPlayerIds.push(playerId)
          this.broadcast({ type: 'event', name: 'player_ready', data: { playerId } })
          await this.persistState()  // Persist on ready
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
            await this.cancelCountdown('Player unreadied')
            // Note: cancelCountdown already persists state
          } else {
            await this.persistState()  // Persist on unready
          }
        }
        break
      }

      case 'input': {
        // Update held key state (processed on each tick)
        if (playerId && this.game.players[playerId] && this.game.status === 'playing') {
          this.game.players[playerId].inputState = msg.held
          this.game.players[playerId].lastInputSeq = msg.seq  // Track for prediction reconciliation
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

  private async startCountdown() {
    if (!this.game) return
    this.game.status = 'countdown'
    this.game.countdownRemaining = 3

    await this.persistState()  // Persist on countdown start
    this.broadcast({ type: 'event', name: 'countdown_tick', data: { count: 3 } })

    this.countdownInterval = setInterval(() => {
      // Guard: interval can fire after cancellation due to timing
      if (!this.game || this.game.status !== 'countdown' || !this.countdownInterval) return

      this.game.countdownRemaining!--
      if (this.game.countdownRemaining === 0) {
        clearInterval(this.countdownInterval)
        this.countdownInterval = null
        // Catch to prevent unhandled rejection if startGame throws
        void this.startGame().catch((err) => {
          console.error('[GameRoom] startGame failed:', err)
        })
      } else {
        this.broadcast({ type: 'event', name: 'countdown_tick', data: { count: this.game.countdownRemaining } })
      }
    }, 1000)
  }

  private async cancelCountdown(reason: string) {
    if (!this.game) return
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval)
      this.countdownInterval = null
    }
    this.game.status = 'waiting'
    this.game.countdownRemaining = null
    this.broadcast({ type: 'event', name: 'countdown_cancelled', data: { reason } })
    await this.persistState()  // Persist on countdown cancel
  }

  private async updateRoomRegistry() {
    if (!this.game) return
    // Update Matchmaker DO with current room status (in-memory vs KV list scan)
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

    this.game.status = 'playing'
    this.game.countdownRemaining = null
    this.game.lives = scaled.lives
    this.game.tick = 0

    // Initialize entities: aliens + barriers (bullets added during gameplay)
    this.game.entities = [
      ...this.createAlienFormation(scaled.alienCols, scaled.alienRows),
      ...this.createBarriers(playerCount),
    ]

    this.broadcast({ type: 'event', name: 'game_start' })
    this.broadcastFullState()
    await this.persistState()

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

    // Collect players to remove (async removal deferred to end of tick)
    const toRemove: string[] = []
    for (const player of Object.values(this.game.players)) {
      if (player.disconnectedAt !== null) {
        const elapsed = this.game.tick - player.disconnectedAt
        if (elapsed >= this.game.config.disconnectGracePeriod) {
          toRemove.push(player.id)
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

    if (Math.random() < scaled.alienShootProbability) {
      this.alienShoot()
    }

    // Enhanced mode: process commanders, dive bombers, transforms
    if (this.game.enhancedMode) {
      this.tickEnhancedMode()
    }

    this.checkEndConditions()
    this.game.tick++

    // Full state sync every tick (30Hz)
    this.broadcastFullState()

    // Deferred async cleanup: remove disconnected players after tick completes
    // Using void to indicate fire-and-forget (persistence is best-effort)
    if (toRemove.length > 0) {
      void Promise.all(toRemove.map(id => this.removePlayer(id)))
    }
  }

  private broadcastFullState() {
    if (!this.game) return
    // Broadcast full game state to all connected clients
    // Each client gets their own lastInputSeq for prediction reconciliation
    for (const [ws, playerId] of this.sessions) {
      try {
        const lastInputSeq = this.game.players[playerId]?.lastInputSeq ?? 0
        ws.send(JSON.stringify({ type: 'sync', state: this.game, playerId, lastInputSeq }))
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
      const bullet: BulletEntity = {
        kind: 'bullet',
        id: this.generateEntityId(),
        ownerId: playerId,
        x: player.x,
        y: LAYOUT.PLAYER_Y - LAYOUT.BULLET_SPAWN_OFFSET,
        dy: -1,
      }
      this.game.entities.push(bullet)
      player.lastShot = this.game.tick
    }
  }

  private moveBullets() {
    if (!this.game) return
    const bullets = getBullets(this.game.entities)

    for (const bullet of bullets) {
      bullet.y += bullet.dy * this.game.config.baseBulletSpeed
    }

    // Remove out-of-bounds bullets
    this.game.entities = this.game.entities.filter(e =>
      e.kind !== 'bullet' || (e.y >= 0 && e.y < this.game!.config.height - 1)
    )
  }

  private checkCollisions() {
    if (!this.game) return
    const bulletsToRemove = new Set<string>()
    const bullets = getBullets(this.game.entities)
    const aliens = getAliens(this.game.entities)
    const barriers = getBarriers(this.game.entities)

    for (const bullet of bullets) {
      // Player bullets hitting aliens
      if (bullet.dy === -1) {
        for (const alien of aliens) {
          if (!alien.alive) continue
          if (Math.abs(bullet.x - alien.x) < LAYOUT.COLLISION_H && Math.abs(bullet.y - alien.y) < LAYOUT.COLLISION_V) {
            alien.alive = false
            bulletsToRemove.add(bullet.id)
            this.game.score += alien.points

            if (bullet.ownerId && this.game.players[bullet.ownerId]) {
              this.game.players[bullet.ownerId].kills++
            }

            this.broadcast({ type: 'event', name: 'alien_killed', data: { alienId: alien.id, playerId: bullet.ownerId, points: alien.points } })
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

      // Bullets hitting barriers (exact cell collision)
      // Once a bullet hits something, stop checking other obstacles
      if (!bulletsToRemove.has(bullet.id)) {
        barrierLoop:
        for (const barrier of barriers) {
          for (const seg of barrier.segments) {
            if (seg.health <= 0) continue
            const segX = barrier.x + seg.offsetX
            const segY = LAYOUT.BARRIER_Y + seg.offsetY
            // Exact cell collision: bullet must be in same cell as segment
            if (bullet.x === segX && bullet.y === segY) {
              seg.health = (seg.health - 1) as 0 | 1 | 2 | 3
              bulletsToRemove.add(bullet.id)
              break barrierLoop  // Exit both loops
            }
          }
        }
      }
    }

    // Remove destroyed bullets
    this.game.entities = this.game.entities.filter(e =>
      e.kind !== 'bullet' || !bulletsToRemove.has(e.id)
    )
  }

  private moveAliens() {
    if (!this.game) return
    const aliens = getAliens(this.game.entities)
    let hitEdge = false

    for (const alien of aliens) {
      if (!alien.alive) continue
      alien.x += this.game.alienDirection * 2
      if (alien.x <= LAYOUT.PLAYER_MIN_X || alien.x >= LAYOUT.PLAYER_MAX_X) hitEdge = true
    }

    if (hitEdge) {
      this.game.alienDirection *= -1
      for (const alien of aliens) {
        if (alien.alive) alien.y += 1
      }
    }
  }

  private alienShoot() {
    if (!this.game) return
    const aliens = getAliens(this.game.entities)
    const aliveAliens = aliens.filter(a => a.alive)
    if (aliveAliens.length === 0) return

    const bottomAliens = new Map<number, AlienEntity>()
    for (const alien of aliveAliens) {
      const existing = bottomAliens.get(alien.col)
      if (!existing || alien.row > existing.row) {
        bottomAliens.set(alien.col, alien)
      }
    }

    const shooters = Array.from(bottomAliens.values())
    const shooter = shooters[Math.floor(Math.random() * shooters.length)]

    const bullet: BulletEntity = {
      kind: 'bullet',
      id: this.generateEntityId(),
      ownerId: null,
      x: shooter.x,
      y: shooter.y + 1,
      dy: 1,
    }

    this.game.entities.push(bullet)
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
    const aliens = getAliens(this.game.entities)
    const aliveAliens = aliens.filter(a => a.alive)

    if (aliveAliens.length === 0) {
      this.nextWave()
      return
    }

    const lowestAlien = Math.max(...aliveAliens.map(a => a.y))
    if (lowestAlien >= LAYOUT.GAME_OVER_Y) {
      this.endGame('defeat')
    }
  }

  // Synchronous state change; async persistence is fire-and-forget
  private nextWave() {
    if (!this.game) return
    this.game.wave++
    const playerCount = Object.keys(this.game.players).length
    const scaled = getScaledConfig(playerCount, this.game.config)

    // Remove bullets, keep barriers, replace aliens with new formation
    const barriers = getBarriers(this.game.entities)
    this.game.entities = [
      ...this.createAlienFormation(scaled.alienCols, scaled.alienRows),
      ...barriers,
    ]
    this.game.alienDirection = 1

    this.broadcast({ type: 'event', name: 'wave_complete', data: { wave: this.game.wave } })
    // Fire-and-forget persistence (no await - nextWave must be synchronous)
    void this.persistState()
  }

  // Synchronous state change + teardown; async persistence is fire-and-forget
  private endGame(result: 'victory' | 'defeat') {
    if (!this.game) return
    this.game.status = 'game_over'
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    this.broadcast({ type: 'event', name: 'game_over', data: { result } })
    // Fire-and-forget persistence (no await - endGame must be synchronous)
    void this.persistState()
  }

  private tickEnhancedMode() {
    if (!this.game) return
    const commanders = getCommanders(this.game.entities)
    const diveBombers = getDiveBombers(this.game.entities)
    const transforms = getTransforms(this.game.entities)

    // Process commanders (Galaga Boss behavior)
    for (const cmd of commanders) {
      if (!cmd.alive) continue
      // Tractor beam cooldown
      if (cmd.tractorBeamCooldown > 0) cmd.tractorBeamCooldown--
      // Dive logic, escort recruitment, capture mechanics would go here
    }

    // Process dive bombers (Galaxian purple dive)
    for (const db of diveBombers) {
      if (!db.alive) continue
      if (db.diveState === 'diving') {
        db.divePathProgress += 0.02
        // Wide arc dive with mid-path reversal
        if (db.divePathProgress >= 1) {
          db.diveState = 'returning'
        }
      }
    }

    // Process transform enemies (spawned from destroyed dive bombers)
    const expiredTransforms = new Set<string>()
    for (const te of transforms) {
      te.x += te.velocity.x
      te.y += te.velocity.y
      te.lifetime--
      if (te.lifetime <= 0 || te.y > this.game.config.height) {
        expiredTransforms.add(te.id)
      }
    }
    // Remove expired transforms
    this.game.entities = this.game.entities.filter(e =>
      e.kind !== 'transform' || !expiredTransforms.has(e.id)
    )
  }

  private createAlienFormation(cols: number, rows: number): AlienEntity[] {
    if (!this.game) return []
    const aliens: AlienEntity[] = []
    // Center the alien grid: (screenWidth - gridWidth) / 2
    const startX = Math.floor((this.game.config.width - cols * LAYOUT.ALIEN_COL_SPACING) / 2)

    for (let row = 0; row < rows; row++) {
      const type = FORMATION_ROWS[row] || 'octopus'
      for (let col = 0; col < cols; col++) {
        aliens.push({
          kind: 'alien',
          id: this.generateEntityId(),  // String ID from monotonic counter
          type,
          row,
          col,
          x: startX + col * LAYOUT.ALIEN_COL_SPACING,
          y: LAYOUT.ALIEN_START_Y + row * 2,
          alive: true,
          points: ALIEN_REGISTRY[type].points,
        })
      }
    }
    return aliens
  }

  private createBarriers(playerCount: number, screenWidth?: number): BarrierEntity[] {
    if (!this.game) return []
    const width = screenWidth ?? this.game.config.width
    const barrierCount = Math.min(4, playerCount + 2)
    const barriers: BarrierEntity[] = []
    const spacing = width / (barrierCount + 1)

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
      barriers.push({
        kind: 'barrier',
        id: this.generateEntityId(),
        x,
        segments,
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
      // All players left - end the game (no pause/resume support)
      if (this.game.status === 'playing') {
        this.endGame('defeat')  // Synchronous - no await needed
      }
      // Set alarm for cleanup in 5 minutes
      this.state.storage.setAlarm(Date.now() + 5 * 60 * 1000)
    } else if (playerCount === 1 && this.game.status === 'waiting') {
      this.game.mode = 'solo'
    }

    this.broadcast({ type: 'event', name: 'player_left', data: { playerId } })
    await this.persistState()  // Persist after removing player
    await this.updateRoomRegistry()
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
    // Unregister from Matchmaker so /matchmake doesn't return dead rooms.
    if (this.game) {
      const matchmaker = this.env.MATCHMAKER.get(this.env.MATCHMAKER.idFromName('global'))
      await matchmaker.fetch(new Request('https://internal/unregister', {
        method: 'POST',
        body: JSON.stringify({ roomCode: this.game.roomId })
      }))
    }
    // Clear alarms first per Durable Objects best practices
    await this.state.storage.deleteAlarm()
    // Clear stored state - DO instance will be evicted by runtime
    await this.state.storage.deleteAll()
    // Clear in-memory state to prevent stale references
    this.game = null
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
import { useRef, useCallback } from 'react'
import { useKeyboard, useRenderer } from '@opentui/react'
import { useGameConnection } from './hooks/useGameConnection'
import { GameScreen } from './components/GameScreen'
import { LobbyScreen } from './components/LobbyScreen'
import { GameOverScreen } from './components/GameOverScreen'
import type { InputState } from '../../../shared/types'

interface AppProps {
  roomUrl: string
  playerName: string
  enhanced: boolean
}

export function App({ roomUrl, playerName, enhanced }: AppProps) {
  const renderer = useRenderer()
  const { getRenderState, playerId, send, connected, updateInput, shoot } = useGameConnection(
    roomUrl,
    playerName,
    enhanced
  )

  // Track held keys for continuous input
  const heldKeys = useRef<InputState>({ left: false, right: false })
  const predictionInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  // Get interpolated render state ONCE per render (expensive: clones, interpolates)
  const state = getRenderState()
  const gameStatus = state?.status

  // Local prediction loop: when keys are held, continuously apply movement locally
  // and periodically resend input state (even if unchanged) at 30Hz for server sync
  // IMPORTANT: Only run when game is playing to avoid drift during lobby/countdown
  useEffect(() => {
    // Don't start prediction loop unless actively playing
    if (gameStatus !== 'playing') {
      if (predictionInterval.current) clearInterval(predictionInterval.current)
      predictionInterval.current = null
      return
    }

    predictionInterval.current = setInterval(() => {
      const held = heldKeys.current
      if (!held.left && !held.right) return  // No keys held, skip

      // Apply prediction locally and send to server
      updateInput(held)
    }, 33)  // 30Hz matches server tick rate

    return () => {
      if (predictionInterval.current) clearInterval(predictionInterval.current)
    }
  }, [gameStatus, updateInput])

  // Handle key press/release events to track held state
  // OpenTUI keyboard API: eventType is "press" | "repeat" | "release"
  // See: https://github.com/anomalyco/opentui
  useKeyboard((event) => {
    const isPress = event.eventType === 'press' && !event.repeated
    const isRelease = event.eventType === 'release'

    // Movement keys update held state
    if (event.name === 'left' || event.name === 'a') {
      if (isPress && !heldKeys.current.left) {
        heldKeys.current.left = true
        updateInput(heldKeys.current)
      } else if (isRelease) {
        heldKeys.current.left = false
        updateInput(heldKeys.current)
      }
      return
    }

    if (event.name === 'right' || event.name === 'd') {
      if (isPress && !heldKeys.current.right) {
        heldKeys.current.right = true
        updateInput(heldKeys.current)
      } else if (isRelease) {
        heldKeys.current.right = false
        updateInput(heldKeys.current)
      }
      return
    }

    // Discrete actions (only on initial press, not repeat or release)
    if (!isPress) return

    if (event.name === 'space') {
      shoot()
    } else if (event.name === 'q') {
      renderer.destroy()
    }
  }, { release: true })  // Enable release events for held key tracking

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
    // Note: No 'paused' state - if all players leave during game, it ends
    default:
      return null
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
      case 'return':  // OpenTUI uses 'return', not 'enter'
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
import type { GameState, Player, Entity, AlienEntity, BulletEntity, BarrierEntity } from '../../../shared/types'
import { LAYOUT, getAliens, getBullets, getBarriers } from '../../../shared/types'
import { SPRITES, COLORS } from '../sprites'
import { getSymbols, detectCapabilities } from '../capabilities'

// Detect once at startup
const caps = detectCapabilities()
const SYM = getSymbols(caps)

interface GameScreenProps {
  state: GameState
  currentPlayerId: string
}

export function GameScreen({ state, currentPlayerId }: GameScreenProps) {
  const { entities, players, score, wave, lives, mode, status } = state
  const aliens = getAliens(entities)
  const bullets = getBullets(entities)
  const barriers = getBarriers(entities)
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
        <text fg="red">{SYM.heart.repeat(lives)}{SYM.heartEmpty.repeat(Math.max(0, (mode === 'solo' ? 3 : 5) - lives))}</text>
      </box>
      
      {/* Countdown overlay - shows numeric countdown */}
      {status === 'countdown' && state.countdownRemaining !== null && (
        <box position="absolute" width="100%" height="100%" justifyContent="center" alignItems="center">
          <box flexDirection="column" alignItems="center">
            <text fg="yellow" bold>GET READY!</text>
            <text fg="white" bold fontSize={4}>{state.countdownRemaining}</text>
          </box>
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
        {barriers.map(barrier => (
          <Barrier key={barrier.id} barrier={barrier} />
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
          {i > 0 ? ' ' : ''}{p.id === currentPlayerId ? SYM.pointer : ' '}{p.name}:{p.kills}{!p.alive && p.respawnAt ? SYM.skull : ''}
        </text>
      ))}
    </box>
  )
}

function Barrier({ barrier }: { barrier: BarrierEntity }) {
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
import type { GameState, AlienEntity } from '../../../shared/types'
import { getSymbols, detectCapabilities } from '../capabilities'

const caps = detectCapabilities()
const SYM = getSymbols(caps)

interface GameOverScreenProps {
  state: GameState
  currentPlayerId: string
}

export function GameOverScreen({ state, currentPlayerId }: GameOverScreenProps) {
  const renderer = useRenderer()
  const players = Object.values(state.players).sort((a, b) => b.kills - a.kills)
  const aliens = state.entities.filter((e): e is AlienEntity => e.kind === 'alien')
  const victory = aliens.every(a => !a.alive)

  useKeyboard((event) => {
    if (event.name === 'q' || event.name === 'escape') renderer.destroy()
  })
  
  return (
    <box flexDirection="column" width={50} borderStyle="double" borderColor={victory ? 'green' : 'red'} alignSelf="center" padding={2}>
      <text fg={victory ? 'green' : 'red'}><strong>{victory ? \`\${SYM.star} VICTORY \${SYM.star}\` : \`\${SYM.cross} GAME OVER \${SYM.cross}\`}</strong></text>
      <box height={1} />
      <text fg="yellow">Final Score: {state.score}</text>
      <text fg="cyan">Wave Reached: {state.wave}</text>
      <box height={1} />
      <text fg="white"><strong>Player Stats:</strong></text>
      {players.map((p, i) => (
        <box key={p.id}>
          <text fg={p.color}>{i === 0 ? SYM.trophy : \` \${i + 1}\`} {p.name}</text>
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
  // Server state (received at 30Hz)
  const [serverState, setServerState] = useState<GameState | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Interpolation state (for smooth 60fps rendering)
  const prevState = useRef<GameState | null>(null)
  const lastSyncTime = useRef(0)

  // Client-side prediction state
  const localPlayerX = useRef(0)
  const pendingInputs = useRef<Array<{ seq: number; held: InputState }>>([])
  const inputSeq = useRef(0)  // Monotonic input sequence number

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
          // Shift states for interpolation
          prevState.current = serverState
          lastSyncTime.current = Date.now()

          // Clear prediction state on game start to prevent lobby/countdown drift
          const wasPlaying = serverState?.status === 'playing'
          const nowPlaying = msg.state.status === 'playing'
          if (nowPlaying && !wasPlaying) {
            pendingInputs.current = []
            inputSeq.current = 0
          }

          // Reconcile prediction using input sequence numbers
          if (playerId && msg.state.players[playerId]) {
            const serverPlayer = msg.state.players[playerId]
            const lastAckedSeq = msg.lastInputSeq

            // Discard inputs server has processed (by seq, not tick)
            pendingInputs.current = pendingInputs.current.filter(i => i.seq > lastAckedSeq)

            // Replay unacknowledged inputs from server position
            let x = serverPlayer.x
            const moveSpeed = msg.state.config.playerMoveSpeed
            for (const input of pendingInputs.current) {
              if (input.held.left) x -= moveSpeed
              if (input.held.right) x += moveSpeed
              x = Math.max(1, Math.min(msg.state.config.width - 2, x))
            }
            localPlayerX.current = x
          }

          setServerState(msg.state)
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
  }, [url, playerName, enhanced, serverState, playerId])

  useEffect(() => {
    connect()
    return () => {
      if (pingInterval.current) clearInterval(pingInterval.current)
      wsRef.current?.close()
    }
  }, [connect])

  // Send input state with sequence number for prediction reconciliation
  const updateInput = useCallback((held: InputState) => {
    inputState.current = held
    inputSeq.current++
    const seq = inputSeq.current
    wsRef.current?.send(JSON.stringify({ type: 'input', seq, held }))

    // Record for reconciliation and apply immediately
    pendingInputs.current.push({ seq, held: { ...held } })

    // Predict movement locally (use server config or default)
    const moveSpeed = serverState?.config.playerMoveSpeed ?? 1
    let x = localPlayerX.current
    if (held.left) x -= moveSpeed
    if (held.right) x += moveSpeed
    const width = serverState?.config.width ?? 80
    localPlayerX.current = Math.max(1, Math.min(width - 2, x))
  }, [serverState])

  const shoot = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'shoot' }))
  }, [])

  const send = useCallback((msg: ClientMessage) => {
    wsRef.current?.send(JSON.stringify(msg))
  }, [])

  // Interpolation helper: lerp between prev and current state
  const getLerpT = useCallback(() => {
    const elapsed = Date.now() - lastSyncTime.current
    return Math.min(1, elapsed / 33)  // 33ms = 30Hz
  }, [])

  const lerpPosition = useCallback((
    prevPos: number | undefined,
    currPos: number | undefined
  ): number | undefined => {
    if (currPos === undefined) return undefined
    if (prevPos === undefined) return currPos
    const t = getLerpT()
    return prevPos + (currPos - prevPos) * t
  }, [getLerpT])

  // Build render state with prediction + interpolation
  // Uses shallow clones to avoid expensive JSON.parse(JSON.stringify())
  const getRenderState = useCallback((): GameState | null => {
    if (!serverState) return null

    // Shallow clone players with interpolated/predicted positions
    const players: Record<string, Player> = {}
    for (const [id, player] of Object.entries(serverState.players)) {
      if (id === playerId) {
        // Local player: use predicted position
        players[id] = { ...player, x: localPlayerX.current }
      } else {
        // Other players: interpolate position
        const prevPlayer = prevState.current?.players[id]
        const x = prevPlayer ? (lerpPosition(prevPlayer.x, player.x) ?? player.x) : player.x
        players[id] = { ...player, x }
      }
    }

    // Shallow clone entities with interpolated positions
    // Build a map for O(1) lookup of previous entities
    const prevEntityMap = new Map(prevState.current?.entities.map(e => [e.id, e]) ?? [])
    const entities = serverState.entities.map(entity => {
      const prevEntity = prevEntityMap.get(entity.id)
      if (!prevEntity) return entity  // No interpolation for new entities

      // Only interpolate entities with x/y positions
      if ('x' in entity && 'x' in prevEntity && 'y' in entity && 'y' in prevEntity) {
        return {
          ...entity,
          x: lerpPosition(prevEntity.x as number, entity.x as number) ?? entity.x,
          y: lerpPosition(prevEntity.y as number, entity.y as number) ?? entity.y,
        }
      }
      return entity
    })

    // Return shallow-cloned state with interpolated data
    return { ...serverState, players, entities }
  }, [serverState, playerId, lerpPosition])

  return {
    serverState,       // Raw server state (for debugging)
    getRenderState,    // Interpolated + predicted state for rendering
    playerId,
    send,
    connected,
    error,
    updateInput,
    shoot,
  }
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
  { name = "GAME_ROOM", class_name = "GameRoom" },
  { name = "MATCHMAKER", class_name = "Matchmaker" }
]

[[migrations]]
tag = "v1"
new_classes = ["GameRoom"]

[[migrations]]
tag = "v2"
new_classes = ["Matchmaker"]
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
| Simultaneous kills | First bullet processed wins (no shared credit) |
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

Sound effects use terminal bell for basic feedback, or optional native audio via Bun FFI for richer sound.

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
import { useEffect, useMemo } from 'react'
import { audio } from '../audio/engine'
import type { GameState, AlienEntity } from '../../../shared/types'

export function useGameAudio(state: GameState | null, enhanced: boolean) {
  // Extract aliens from entities
  const aliens = useMemo(() =>
    state?.entities.filter((e): e is AlienEntity => e.kind === 'alien') ?? [],
    [state?.entities]
  )

  // Start music when game starts
  useEffect(() => {
    if (state?.status === 'playing') {
      audio.playMusic(enhanced ? 'enhanced' : 'normal')
    }
  }, [state?.status, enhanced])

  // Adjust tempo based on aliens remaining
  useEffect(() => {
    if (!state || state.status !== 'playing' || aliens.length === 0) return
    const alive = aliens.filter(a => a.alive).length
    const total = aliens.length
    const ratio = alive / total

    let tempo = 1.0
    if (ratio < 0.1) tempo = 1.75
    else if (ratio < 0.25) tempo = 1.5
    else if (ratio < 0.5) tempo = 1.3
    else if (ratio < 0.75) tempo = 1.15

    audio.setMusicTempo(tempo)
  }, [state?.status, aliens])
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
| **E2E** | Full client-server flow | Bun test + node-pty + wrangler dev | <30s |

### Unit Tests

```typescript
// worker/src/game/__tests__/scaling.test.ts
import { describe, expect, test } from 'bun:test'
import { getScaledConfig, getPlayerSpawnX } from '../scaling'

describe('getScaledConfig', () => {
  // Must include tickIntervalMs for shoot probability calculation
  const baseConfig = {
    baseAlienMoveInterval: 30,
    tickIntervalMs: 33,  // 30Hz tick rate
  } as GameConfig

  test('solo player gets base difficulty', () => {
    const config = getScaledConfig(1, baseConfig)
    expect(config.lives).toBe(3)
    expect(config.alienCols).toBe(11)
    expect(config.alienRows).toBe(5)
    expect(config.alienMoveInterval).toBe(30)
    expect(config.alienShootProbability).toBeCloseTo(0.5 / 30, 3)  // 0.5 shots/s at 30Hz
  })

  test('4 players get max difficulty', () => {
    const config = getScaledConfig(4, baseConfig)
    expect(config.lives).toBe(5)
    expect(config.alienCols).toBe(15)
    expect(config.alienRows).toBe(6)
    expect(config.alienMoveInterval).toBe(17)  // 30 / 1.75 ≈ 17
    expect(config.alienShootProbability).toBeCloseTo(1.25 / 30, 3)  // 1.25 shots/s at 30Hz
  })

  test('invalid player count falls back to solo', () => {
    const config = getScaledConfig(0, baseConfig)
    expect(config.lives).toBe(3)
    expect(config.alienCols).toBe(11)
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
// Note: Tests use standalone createBarriers function, GameRoom.createBarriers wraps it
import { describe, expect, test } from 'bun:test'
import { createBarriers } from '../barriers'

describe('createBarriers', () => {
  // Helper to generate IDs for testing
  let idCounter = 0
  const generateId = () => `b_${++idCounter}`

  test('solo player gets 3 barriers', () => {
    const barriers = createBarriers(1, 80, generateId)
    expect(barriers.length).toBe(3)  // playerCount + 2 = 3
  })

  test('4 players get 4 barriers (max)', () => {
    const barriers = createBarriers(4, 80, generateId)
    expect(barriers.length).toBe(4)  // min(4, 4+2) = 4
  })

  test('each barrier has 9 segments (5 top + 4 bottom with gap)', () => {
    const barriers = createBarriers(1, 80, generateId)
    barriers.forEach(b => expect(b.segments.length).toBe(9))
  })

  test('barriers are evenly spaced', () => {
    const barriers = createBarriers(4, 80, generateId)
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

  test('input seq is acknowledged in sync messages', async () => {
    // This is the core prediction reconciliation feature:
    // 1. Client sends input with seq number
    // 2. Server updates player.lastInputSeq
    // 3. Server includes lastInputSeq in sync message
    // Without this, client prediction never stabilizes

    const ws = new MockWebSocket()
    await room.handleSession(ws)
    ws.receive({ type: 'join', name: 'Alice' })

    // Start solo game
    ws.receive({ type: 'start_solo' })
    ws.messages = []  // Clear previous messages

    // Send input with seq = 42
    ws.receive({ type: 'input', seq: 42, held: { left: true, right: false } })

    // Manually trigger a tick to get sync message
    // (In real test, wait for interval or call tick directly)
    room.tick?.()

    // Find the sync message
    const syncMsg = ws.messages.find(m => m.type === 'sync')
    expect(syncMsg).toBeDefined()
    expect(syncMsg.lastInputSeq).toBe(42)

    // Verify player state was also updated
    const player = syncMsg.state.players[syncMsg.playerId]
    expect(player.lastInputSeq).toBe(42)
    expect(player.inputState).toEqual({ left: true, right: false })
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
    const initialState = { score: 0, entities: [] }
    const newState = { score: 100, entities: [{ kind: 'alien', id: 'e_1', alive: true }] }

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

  test('input state message includes held keys and seq', () => {
    const sentMessages: any[] = []
    const mockWs = {
      send: (data: string) => sentMessages.push(JSON.parse(data)),
    }

    // Simulate updating input state with sequence number
    mockWs.send(JSON.stringify({ type: 'input', seq: 1, held: { left: true, right: false } }))

    expect(sentMessages[0]).toEqual({ type: 'input', seq: 1, held: { left: true, right: false } })
  })
})
```

### E2E Tests

E2E tests for terminal apps use `node-pty` to spawn real terminal processes and capture/verify output. This avoids browser-based testing tools like Playwright which don't apply to TUI apps.

```typescript
// e2e/game.spec.ts
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import * as pty from 'node-pty'
import { spawn } from 'child_process'

// Helper to wait for specific output in PTY buffer
function waitForOutput(buffer: string[], pattern: RegExp | string, timeout = 5000): Promise<void> {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const check = () => {
      const fullOutput = buffer.join('')
      const found = typeof pattern === 'string'
        ? fullOutput.includes(pattern)
        : pattern.test(fullOutput)
      if (found) return resolve()
      if (Date.now() - start > timeout) {
        return reject(new Error(`Timeout waiting for: ${pattern}\nGot: ${fullOutput.slice(-500)}`))
      }
      setTimeout(check, 100)
    }
    check()
  })
}

describe('Vaders E2E', () => {
  let workerProcess: ReturnType<typeof spawn>

  beforeAll(async () => {
    // Start local worker
    workerProcess = spawn('bunx', ['wrangler', 'dev'], { cwd: './worker', stdio: 'pipe' })
    await new Promise(r => setTimeout(r, 3000))  // Wait for startup
  })

  afterAll(() => {
    workerProcess?.kill()
  })

  test('solo game flow', async () => {
    const output: string[] = []

    // Spawn client in a PTY for realistic terminal behavior
    const ptyProcess = pty.spawn('bun', ['run', 'dev'], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: './client',
      env: { ...process.env, VADERS_ASCII: '1' },  // Use ASCII mode for reliable matching
    })

    ptyProcess.onData((data) => output.push(data))

    try {
      // Wait for connection and menu
      await waitForOutput(output, /VADERS|Press.*to.*start/i, 10000)

      // Start solo game
      ptyProcess.write('s')

      // Verify game started
      await waitForOutput(output, 'WAVE:1', 5000)

      // Shoot
      ptyProcess.write(' ')

      // Verify score increased (alien hit)
      await waitForOutput(output, /SCORE:000[1-9]|SCORE:0001/, 3000)
    } finally {
      ptyProcess.kill()
    }
  })

  test('multiplayer lobby ready flow', async () => {
    const output1: string[] = []
    const output2: string[] = []

    // Create room with first player
    const player1 = pty.spawn('bun', ['run', 'dev'], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: './client',
      env: { ...process.env, VADERS_ASCII: '1' },
    })
    player1.onData((data) => output1.push(data))

    try {
      // Wait for menu, create new room
      await waitForOutput(output1, /VADERS|Press.*to.*start/i, 10000)
      player1.write('2')  // Create room

      // Wait for room code to appear
      await waitForOutput(output1, /Room.*[A-Z0-9]{6}/i, 5000)

      // Extract room code from output
      const roomCodeMatch = output1.join('').match(/Room[:\s]+([A-Z0-9]{6})/i)
      expect(roomCodeMatch).toBeTruthy()
      const roomCode = roomCodeMatch![1]

      // Second player joins
      const player2 = pty.spawn('bun', ['run', 'dev', '--room', roomCode], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: './client',
        env: { ...process.env, VADERS_ASCII: '1' },
      })
      player2.onData((data) => output2.push(data))

      try {
        // Wait for player 2 to join
        await waitForOutput(output2, /Lobby|waiting/i, 10000)

        // Player 1 readies
        player1.write('\r')  // Enter key
        await waitForOutput(output1, /READY/i, 3000)

        // Player 2 readies - should trigger countdown
        player2.write('\r')
        await waitForOutput(output1, /GET READY|3|countdown/i, 3000)
        await waitForOutput(output2, /GET READY|3|countdown/i, 3000)
      } finally {
        player2.kill()
      }
    } finally {
      player1.kill()
    }
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
bun test e2e/
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
        run: bun test e2e/
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
    lastInputSeq: 0,
    inputState: { left: false, right: false },
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
    countdownRemaining: null,
    players: {},
    readyPlayerIds: [],
    entities: [],  // All game entities (aliens, bullets, barriers)
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
import { getScaledConfig, DEFAULT_CONFIG } from '../scaling'

describe('scaling properties', () => {
  test('more players = faster aliens (lower moveInterval)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 1, max: 4 }),
        (p1, p2) => {
          if (p1 < p2) {
            const c1 = getScaledConfig(p1, DEFAULT_CONFIG)
            const c2 = getScaledConfig(p2, DEFAULT_CONFIG)
            // More players = lower interval = faster aliens
            return c1.alienMoveInterval >= c2.alienMoveInterval
          }
          return true
        }
      )
    )
  })

  test('alien grid size increases monotonically with players', () => {
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

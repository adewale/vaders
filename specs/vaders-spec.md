# Vaders — Technical Spec
## Multiplayer TUI Space Invaders • 1-4 Players • OpenTUI + Durable Objects

---

## Overview

**Vaders** is a TUI Space Invaders clone (with elements of Galaga, Galaxian and Amiga aesthetics) supporting solo play or 2-4 player co-op, synchronized via Cloudflare Durable Objects. Single player can start immediately; multiplayer requires a ready-up lobby.

---

## Architectural Principles

These principles guide all design decisions in this project.

### 1. One Source of Truth per Concern

| Concern | Authority | Examples |
|---------|-----------|----------|
| **Game state** | Server (Durable Object) | Collisions, deaths, scoring, wave transitions |
| **Presentation** | Client | Effects, interpolation, color cycling, sprites |
| **Input** | Client captures, server interprets | Client: what keys are held. Server: what that means (movement, cooldowns) |

### 2. Determinism over Cleverness

- Same inputs + same initial state → same state evolution on the server
- Avoid `Math.random()` in the hot loop unless seeded and stored in state
- For randomness, store `rngSeed` in `GameState` and advance deterministically

### 3. Keep Network Contracts Tiny and Stable

- Define a strict protocol module (`shared/protocol.ts`) and treat it like an API
- Never "just add a field" without versioning or making it optional
- Prefer full-state sync until it hurts, then event + snapshot (not diffs that desync forever)

### 4. Separate Simulation from I/O

Even without a full reducer pattern, enforce this split:

| Layer | Responsibility |
|-------|----------------|
| **Simulation** | Pure functions: take state + inputs → return next state + events |
| **Shell** | WebSocket, timers, storage, matchmaker updates |

This split makes debugging and testing possible.

### 5. Make Time Explicit (Don't Mix Units)

Pick one time basis for game logic. We use:
- **Ticks** for gameplay timing (movement, cooldowns, respawn)
- **Milliseconds** for real-world timing (keep-alive, timeouts)

Put units in names: `respawnDelayTicks`, `tickIntervalMs`.

### 6. State Machines for Lifecycle Transitions

Guard `waiting → countdown → wipe_hold → wipe_reveal → playing → game_over` with explicit state machine:
- Inputs that don't apply in a state are ignored or rejected
- Countdown cancellation, join blocking, and game start are impossible to race
- See `canTransition()` function in reducer

### 7. Idempotency and Monotonicity

- Events/IDs are monotonic: `tick`, `entityId` (via `e_${counter++}`)
- Matchmaker registration/unregistration must be idempotent (repeated calls don't corrupt)
- Reconnect: either support properly (token + reclaim slot) or explicitly reject everywhere

### 8. Do Less Work on the Server

Durable Objects have CPU limits:
- Keep server loop simple and branch-free
- Don't stringify giant objects more than needed
- Don't run background effects server-side (visuals are client-only)

### 9. Fail Safe: Drift is OK, Desync is Not

When something goes wrong:
- Client may snap/teleport a sprite, but state must remain correct
- Missing an event is tolerable if full-state snapshots catch up
- Never rely on "deltas must arrive" logic without recovery mechanism

### 10. Observability is First-Class

- Every room has a `roomId`, every connection has a `playerId`
- Log one wide event per transition (join/leave/start/end/error)
- Include `tick`, `wave`, entity counts in server logs for performance debugging

### 11. Compatibility and Sharp Edges

OpenTUI is pre-1.0:
- Pin versions, upgrade intentionally
- Isolate OpenTUI-specific quirks behind adapters (`input.ts`, `capabilities.ts`)
- Don't leak OpenTUI event shapes into the rest of the codebase

### 12. Keep Enhanced Mode as a Plugin, Not a Fork

Enhanced behaviors are additive via:
- Mode strategy object (`GameMode` interface)
- Additional logic phases registered by mode

Do NOT scatter `if (enhancedMode)` checks throughout the tick loop.

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
| `←` | Move left |
| `→` | Move right |
| `SPACE` | Shoot |
| `ENTER` | Ready up (lobby) — *OpenTUI reports as 'return'* |
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

### Layout (120×36)

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
│     CONTROLS   ←/→ Move   SPACE Shoot   M Mute   Q Quit                    │
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
      case 'm':
      case 'M':
        audio.toggleMute()
        break
    }
  }, [joinMode, roomCode, enhanced, onStartSolo, onCreateRoom, onJoinRoom, onMatchmake, renderer])

  useKeyboard(handleKeyInput)

  return (
    <box flexDirection="column" width={120} height={36} padding={1}>
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
        {'   '}CONTROLS{'   '}←/→ Move   SPACE Shoot   M Mute   Q Quit
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

> **NOTE: Enhanced Mode is NOT IMPLEMENTED.** The following section documents a planned feature that has not been built. Commander, DiveBomber, and Transform entity types exist in `shared/types.ts` but are never instantiated or processed by the game reducer. The game currently only supports classic Space Invaders gameplay with squid/crab/octopus aliens and UFO bonus enemies.

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
│  │ useGame    │  │                                   │  ┌────────────────┐  │
│  │ Connection │  │                                   │  │    GameRoom    │  │
│  │  • state    │  │         ┌─────────────┐          │  │ (Imper. Shell) │  │
│  │  • send()   │  │         │  Full State │          │  │ ┌────────────┐ │  │
│  └─────────────┘  │◄────────│  Sync @30Hz │◄─────────│  │ │InputQueue  │ │  │
│        │          │         └─────────────┘          │  │ └─────┬──────┘ │  │
│        ▼          │                                   │  │       ▼        │  │
│  ┌─────────────┐  │         ┌─────────────┐          │  │ ┌────────────┐ │  │
│  │  OpenTUI    │  │────────►│ InputState  │─────────►│  │ │gameReducer │ │  │
│  │  Renderer   │  │         │ {left,right}│          │  │ │(Pure Core) │ │  │
│  │  • diffing  │  │         │ + shoot     │          │  │ └─────┬──────┘ │  │
│  └─────────────┘  │         └─────────────┘          │  │       ▼        │  │
│        │          │                                   │  │ ┌────────────┐ │  │
│        ▼          │                                   │  │ │TickPhases  │ │  │
│   ┌─────────┐     │                                   │  │ └────────────┘ │  │
│   │ stdout  │     │                                   │  └────────────────┘  │
│   │ 120×36  │     │                                   │          │           │
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
     │◄─── { type: "sync", state,    │  Full state sent to client
     │       playerId: "..." } ───────│
     │                                │

2. GAME LOOP (30Hz) - Input Queue + Reducer Pattern
   Client                           Server
     │                                │
     │──── { type: "input",          │
     │       held: {left:T,right:F} } │  Messages queued (not processed
     │                                │  immediately)
     │──── { type: "shoot" } ────────►│  → inputQueue.push(action)
     │                                │
     │         ┌──────────────────────┤  tick() {
     │         │ 1. Process queue:    │    for (action of inputQueue)
     │         │    gameReducer(s,a)  │      state = gameReducer(state, action)
     │         │                      │    inputQueue = []
     │         │ 2. Run tick action:  │
     │         │    gameReducer(s,TICK)│   // Tick phases:
     │         │    ├─ movement       │   //   Movement → Physics → Collision
     │         │    ├─ physics        │   //   → Spawning → End conditions
     │         │    ├─ collision      │
     │         │    └─ endConditions  │
     │         └──────────────────────┤  }
     │                                │
     │◄─── { type: "sync", state,    │  Full state @30Hz
     │       playerId: "..." } ───────│  (client applies held input locally)
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
├── input.ts ────────────── Input adapter (normalizes OpenTUI → VadersKey)
├── useGameConnection() ─── WebSocket connection, state management
├── GameScreen.tsx ──────── Main gameplay rendering
├── LobbyScreen.tsx ─────── Room code display, ready state
├── useGameAudio() ──────── Sound effects triggered by state changes
└── OpenTUI Renderer ────── React-based TUI with automatic diffing

### Input Adapter Layer

Normalize OpenTUI's KeyEvent into a stable internal type. This prevents OpenTUI's
API changes from leaking into components.

```typescript
// client/src/input.ts

// Internal key event type (stable, not tied to OpenTUI)
type VadersKey =
  | { type: 'key'; key: 'left' | 'right' | 'up' | 'down' | 'space' | 'enter' | 'escape' | 'q' | 'm' | 'n' | 's' | 'r' | 'x' }
  | { type: 'char'; char: string }  // For text input (room codes, names)

// Normalize OpenTUI KeyEvent → VadersKey
function normalizeKey(event: OpenTUIKeyEvent): VadersKey | null {
  // Map OpenTUI key names to our internal names
  if (event.name === 'left' || event.sequence === '\x1b[D') return { type: 'key', key: 'left' }
  if (event.name === 'right' || event.sequence === '\x1b[C') return { type: 'key', key: 'right' }
  if (event.name === 'up' || event.sequence === '\x1b[A') return { type: 'key', key: 'up' }
  if (event.name === 'down' || event.sequence === '\x1b[B') return { type: 'key', key: 'down' }
  if (event.name === 'space' || event.sequence === ' ') return { type: 'key', key: 'space' }
  if (event.name === 'return') return { type: 'key', key: 'enter' }
  if (event.name === 'escape') return { type: 'key', key: 'escape' }
  if (event.sequence?.length === 1) {
    const char = event.sequence.toLowerCase()
    if (char === 'q') return { type: 'key', key: 'q' }
    if (char === 'm') return { type: 'key', key: 'm' }
    if (char === 'n') return { type: 'key', key: 'n' }
    if (char === 's') return { type: 'key', key: 's' }
    if (char === 'r') return { type: 'key', key: 'r' }
    if (char === 'x') return { type: 'key', key: 'x' }
    return { type: 'char', char }
  }
  return null  // Ignore unrecognized keys
}
```

Components use `VadersKey`, never `OpenTUIKeyEvent`.

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
│   └── Tick Phases ─────── Movement → Physics → Collision → Spawning
│
└── Durable Object: Matchmaker
    ├── rooms Map ───────── In-memory room registry
    ├── /register ────────── Rooms register on create/update
    ├── /unregister ──────── Rooms unregister on cleanup
    └── /find ────────────── In-memory open room lookup
```

### Held-Input + Full-State Snapshot Model

This game uses **held-state networking** with **full-state snapshots**. These rules must be true:

#### Input Rules

1. **Client sends state, not events**
   - Client sends `{ type: 'input', held: {left, right} }` on change AND periodically (10Hz) while any key held
   - Periodic resends prevent dropped packets from freezing movement
   - Do NOT send discrete "left pressed" / "left released" events

2. **Server applies input on tick boundaries only**
   - WebSocket handler only updates `player.inputState`
   - Movement happens inside `tick()`, not in message handler
   - This keeps simulation deterministic

#### Timing Rules

3. **Tick is the only clock for gameplay**
   - Movement, cooldowns, shooting, collisions, waves: all driven by `state.tick`
   - Wall-clock time only for connection management: pings, timeouts

4. **Snapshot cadence is fixed**
   - Server sends full state at fixed 30Hz (every `tickIntervalMs`)
   - Client assumes this cadence for interpolation (`SYNC_INTERVAL_MS = 33`)

#### Prediction Rules

5. **Local prediction is cosmetic and limited**
   - Predict local player X only
   - Clamp to bounds
   - On every snapshot: snap to server X, then apply currently-held input
   - NO replay queue (that's for seq/ack models)

6. **Interpolation is for remote entities only**
   - Other players: interpolate X
   - Aliens/bullets: interpolate or accept chunky movement
   - Local player: render predicted X, never interpolate (causes laggy controls)

#### Shooting Rules

7. **Shooting is server-authoritative with client feedback**
   - Client sends `{type:'shoot'}` discrete message
   - Server rate-limits via `player.lastShotTick`
   - Client can play sound immediately, but bullet appears in next snapshot

#### Consistency Rules

8. **Snapshots must be internally consistent**
   - All positions correspond to `state.tick`
   - Score/lives updated atomically
   - Dead entities removed (we filter, not mark `alive:false` on bullets)

9. **Dropped packets must not break correctness**
   - Missing snapshots: fine (client waits, lerps less)
   - Missing input: NOT fine unless client resends periodically
   - Always resend held input while held

#### Lifecycle Rules

10. **Join/leave during countdown**
    - During countdown: reject new joins (return error)
    - If player disconnects during countdown: cancel, return to waiting

#### Edge Cases (Decided)

| Scenario | Decision |
|----------|----------|
| Input during waiting/countdown | Accept and store `inputState`, apply movement only in `playing` |
| Player disconnect in lobby | Remove immediately, broadcast full sync |
| Player disconnect mid-game | Remove immediately, deduct life (co-op) or end game (solo) |
| Reconnect | **Not supported** - no grace period, no rejoin protocol |

---

### State Synchronization Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│               SERVER @ 30Hz  ←→  CLIENT @ 60fps                             │
└─────────────────────────────────────────────────────────────────────────────┘

The server runs at 30Hz (33ms ticks) to stay within Cloudflare DO CPU limits.
The client renders at 60fps (16ms frames) for smooth visuals.

To bridge the gap:
• Local Smoothing: Local player moves instantly on input (held-state applied locally)
• Server Snap: On each sync, snap local player to server position + apply held input
• Interpolation (Lerp): Other entities smoothly animate between server states

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

### Client-Side Smoothing

The client implements three techniques for smooth 60fps rendering despite 30Hz server updates:

1. **Local Player Smoothing** (`useLocalSmoothing`)
   - Instantly responds to local input
   - On server sync: snap to server position, then re-apply held input
   - No replay queue or sequence numbers needed

2. **Entity Interpolation** (`useInterpolation`)
   - Other players, aliens, and bullets lerp between previous and current server positions
   - Calculates lerp factor: `t = min(1, elapsed / 33ms)`
   - Linear interpolation: `prev + (curr - prev) * t`
   - Required for smooth visuals (aliens jump 2 cells every ~8-15 ticks)

3. **Render Loop** (`useTerminalRenderLoop`)
   - 60fps loop via `setInterval(callback, 16)`
   - Independent of server sync rate
   - Applies local smoothing and interpolation each frame

---

## Game Engine Architecture

> **Implementation Note:** This section describes the **reference architecture** using a pure reducer pattern. The **GameRoom implementation** below uses a simpler imperative approach for clarity. Both are valid - the reducer pattern is more testable; the imperative pattern is easier to follow. Choose based on project needs.

The game engine uses a **Functional Core, Imperative Shell** architecture with a procedural tick reducer. This separates pure game logic from I/O concerns, making the engine deterministic and fully testable without a network.

### Functional Core, Imperative Shell

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FUNCTIONAL CORE / IMPERATIVE SHELL                        │
└─────────────────────────────────────────────────────────────────────────────┘

                     IMPERATIVE SHELL (I/O)
┌─────────────────────────────────────────────────────────────────────────────┐
│  GameRoom (Durable Object)                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ WebSocket I/O   │  │  Timer/Alarm    │  │  Storage I/O    │             │
│  │ • onMessage()   │  │  • setAlarm     │  │  • storage.sql  │             │
│  │ • broadcast()   │  │  • alarm()      │  │  • storage.put  │             │
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
│  │   State Machine      │  │   Tick Phases        │                        │
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
  | { type: 'TICK' }  // Fixed cadence, no deltaTime needed
  | { type: 'PLAYER_JOIN'; player: Player }
  | { type: 'PLAYER_LEAVE'; playerId: string }
  | { type: 'PLAYER_INPUT'; playerId: string; input: InputState }
  | { type: 'PLAYER_MOVE'; playerId: string; direction: 'left' | 'right' }  // Discrete movement (one step)
  | { type: 'PLAYER_SHOOT'; playerId: string }
  | { type: 'PLAYER_READY'; playerId: string }
  | { type: 'PLAYER_UNREADY'; playerId: string }
  | { type: 'START_SOLO' }
  | { type: 'START_COUNTDOWN' }
  | { type: 'COUNTDOWN_TICK' }
  | { type: 'COUNTDOWN_CANCEL'; reason: string }

// Result includes new state plus any side effects to execute
interface ReducerResult {
  state: GameState
  events: ServerEvent[]      // Events to broadcast to clients
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
      // Handle wipe phase ticks separately
      if (state.status === 'wipe_exit' || state.status === 'wipe_hold' || state.status === 'wipe_reveal') {
        return wipeTickReducer(state)
      }
      return tickReducer(state)  // Fixed cadence, no deltaTime
    case 'PLAYER_JOIN':
      return playerJoinReducer(state, action.player)
    case 'PLAYER_INPUT':
      return inputReducer(state, action.playerId, action.input)
    case 'PLAYER_MOVE':
      return moveReducer(state, action.playerId, action.direction)
    // ... other actions
    default:
      return { state, events: [], persist: false }
  }
}

// Tick reducer runs all game systems (pure, deterministic)
// Uses seeded RNG (stored in state.rngSeed) for all random decisions
// Fixed tick cadence - no deltaTime parameter needed
function tickReducer(state: GameState): ReducerResult {
  // Steps (all pure, no I/O):
  // 1. Apply player movement from held input (inputState.left/right)
  // 2. Move bullets (physics) - remove off-screen bullets
  // 3. Check collisions → emit alien_killed, player_died events
  // 4. Move aliens (at scaled interval) - side-to-side, drop at edges
  // 5. Alien shooting (seeded RNG) - bottom row aliens only
  // 6. UFO spawning and movement
  // 7. Check end conditions → wave_complete or game_over events

  // Returns: { state, events, persist }
}
```

### Formal State Machine

Status transitions are guarded by an explicit state machine. This prevents race conditions when players join/leave during transitions.

```typescript
// worker/src/game/reducer.ts

type GameStatus = 'waiting' | 'countdown' | 'wipe_exit' | 'wipe_hold' | 'wipe_reveal' | 'playing' | 'game_over'

// Define valid transitions
const TRANSITIONS: Record<GameStatus, Partial<Record<GameAction['type'], GameStatus>>> = {
  waiting: {
    PLAYER_JOIN: 'waiting',
    PLAYER_READY: 'waiting',       // Stay waiting, but check if all ready
    PLAYER_UNREADY: 'waiting',
    PLAYER_INPUT: 'waiting',       // Accept input anytime, store in inputState
    START_SOLO: 'wipe_hold',       // Skip exit, go straight to hold for game start
    START_COUNTDOWN: 'countdown',
    PLAYER_LEAVE: 'waiting',
  },
  countdown: {
    COUNTDOWN_TICK: 'countdown',
    COUNTDOWN_CANCEL: 'waiting',
    PLAYER_LEAVE: 'waiting',       // Cancel countdown if player leaves
    PLAYER_INPUT: 'countdown',     // Accept input anytime, store in inputState
    PLAYER_MOVE: 'countdown',      // Discrete movement accepted during countdown
  },
  wipe_exit: {
    TICK: 'wipe_exit',
    PLAYER_INPUT: 'wipe_exit',
    PLAYER_LEAVE: 'wipe_exit',
  },
  wipe_hold: {
    TICK: 'wipe_hold',
    PLAYER_INPUT: 'wipe_hold',
    PLAYER_LEAVE: 'wipe_hold',
  },
  wipe_reveal: {
    TICK: 'wipe_reveal',
    PLAYER_INPUT: 'wipe_reveal',
    PLAYER_LEAVE: 'wipe_reveal',
  },
  playing: {
    TICK: 'playing',
    PLAYER_INPUT: 'playing',
    PLAYER_MOVE: 'playing',        // Discrete movement (one step per message)
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
// Uses Hibernatable WebSockets API and WebSocket attachments (not sessions Map)

export class GameRoom extends DurableObject<Env> {
  private game: GameState | null = null
  private inputQueue: GameAction[] = []  // Queue for deterministic processing

  // Messages are queued in webSocketMessage(), not processed immediately
  // Player ID is stored in WebSocket attachment (survives hibernation):
  //   ws.serializeAttachment({ playerId })
  //   const { playerId } = ws.deserializeAttachment()

  private messageToAction(msg: ClientMessage, playerId: string): GameAction | null {
    switch (msg.type) {
      case 'input':
        return { type: 'PLAYER_INPUT', playerId, input: msg.held }
      case 'move':
        return { type: 'PLAYER_MOVE', playerId, direction: msg.direction }
      case 'shoot':
        return { type: 'PLAYER_SHOOT', playerId }
      case 'ready':
        return { type: 'PLAYER_READY', playerId }
      case 'unready':
        return { type: 'PLAYER_UNREADY', playerId }
      case 'start_solo':
        return { type: 'START_SOLO' }
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
      if (result.persist) this.persistState()
    }
    this.inputQueue = []

    // 2. Run the tick action
    const result = gameReducer(this.game, { type: 'TICK' })
    this.game = result.state
    this.broadcastEvents(result.events)
    if (result.persist) this.persistState()

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
    // Spawn UFO randomly (uses seeded RNG for determinism)
    if (seededRandom(state) < 0.001) {
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

export class Matchmaker {
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

    // GET /find - Find an open room (iterates Set to skip stale entries)
    if (url.pathname === '/find') {
      const STALE_THRESHOLD = 5 * 60 * 1000  // 5 minutes without update = stale
      const now = Date.now()

      // Find first non-stale open room
      for (const roomCode of this.openRooms) {
        const info = this.rooms[roomCode]
        if (!info) {
          // Orphaned entry in openRooms, clean it up
          this.openRooms.delete(roomCode)
          continue
        }
        if (now - info.updatedAt > STALE_THRESHOLD) {
          // Stale room (crashed or never unregistered), evict it
          delete this.rooms[roomCode]
          this.openRooms.delete(roomCode)
          continue
        }
        return new Response(JSON.stringify({ roomCode }), {
          headers: { 'Content-Type': 'application/json' }
        })
      }

      // Persist cleanup if we modified anything
      await this.state.storage.put('rooms', this.rooms)

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

// ─── Coordinate System ────────────────────────────────────────────────────────
// All entity positions are TOP-LEFT origin:
// - x: 0 = left edge, increases rightward
// - y: 0 = top edge, increases downward
// - Entity sprites render from their (x, y) position rightward/downward
// Screen is 120×36 cells (columns × rows)

interface Position {
  x: number  // Top-left x coordinate
  y: number  // Top-left y coordinate
}

interface GameEntity extends Position {
  id: string  // Monotonic string ID: "e_1", "e_2", etc.
}

// ─── Game State ───────────────────────────────────────────────────────────────

interface GameState {
  roomId: string                    // 6-char base36 (0-9, A-Z)
  mode: 'solo' | 'coop'
  status: GameStatus
  tick: number
  rngSeed: number                   // Seeded RNG state for determinism

  // Countdown state (only valid when status === 'countdown')
  countdownRemaining: number | null  // 3, 2, 1, or null

  players: Record<string, Player>
  readyPlayerIds: string[]          // Array for JSON serialization

  // All game entities in a single array with discriminated union
  entities: Entity[]

  wave: number
  lives: number                     // 3 solo, 5 co-op
  score: number
  alienDirection: 1 | -1

  // Wipe state: server-controlled transition timing
  wipeTicksRemaining: number | null  // Countdown for current wipe phase
  wipeWaveNumber: number | null      // Wave number to display during wipe

  // Debug flag: completely disable alien shooting
  alienShootingDisabled: boolean

  config: GameConfig
}

// Seeded random number generator for deterministic simulation
// Uses any fast PRNG (e.g., mulberry32, xorshift)
// Mutates state.rngSeed and returns value in [0, 1)
function seededRandom(state: GameState): number

// Unified entity type for all game objects (discriminated union on 'kind')
type Entity =
  | AlienEntity
  | BulletEntity
  | BarrierEntity
  | UFOEntity

interface AlienEntity {
  kind: 'alien'
  id: string
  x: number  // LEFT EDGE of sprite (unlike Player which uses CENTER)
  y: number
  type: ClassicAlienType
  alive: boolean
  row: number
  col: number
  points: number
  entering: boolean  // True during wipe_reveal phase, prevents shooting
}

interface BulletEntity {
  kind: 'bullet'
  id: string
  x: number  // CENTER of bullet (spawns from center of player/alien)
  y: number
  ownerId: string | null  // null = alien bullet
  dy: -1 | 1              // -1 = up (player), 1 = down (alien)
}
// Bullets removed by filtering entities array, not by alive flag

interface BarrierEntity {
  kind: 'barrier'
  id: string
  x: number               // Left edge (y is always LAYOUT.BARRIER_Y)
  segments: BarrierSegment[]
}

interface UFOEntity {
  kind: 'ufo'
  id: string
  x: number  // LEFT EDGE of sprite (unlike Player which uses CENTER)
  y: number  // Always 1 (top row)
  direction: 1 | -1  // 1 = right, -1 = left
  alive: boolean
  points: number     // 50-300 (mystery score)
}

// Helper functions to filter entities by kind
function getAliens(entities: Entity[]): AlienEntity[] {
  return entities.filter((e): e is AlienEntity => e.kind === 'alien')
}
function getBullets(entities: Entity[]): BulletEntity[] {
  return entities.filter((e): e is BulletEntity => e.kind === 'bullet')
}
function getBarriers(entities: Entity[]): BarrierEntity[] {
  return entities.filter((e): e is BarrierEntity => e.kind === 'barrier')
}
function getUFOs(entities: Entity[]): UFOEntity[] {
  return entities.filter((e): e is UFOEntity => e.kind === 'ufo')
}

interface GameConfig {
  width: number                        // Default: 120
  height: number                       // Default: 36
  maxPlayers: number                   // Default: 4
  tickIntervalMs: number               // Default: 33 (~30Hz tick rate)

  // Tick-based timing (game loop)
  baseAlienMoveIntervalTicks: number   // Ticks between alien moves
  baseBulletSpeed: number              // Cells per tick
  baseAlienShootRate: number           // Probability per tick (use getScaledConfig)
  playerCooldownTicks: number          // Ticks between shots
  playerMoveSpeed: number              // Cells per tick when holding move key
  respawnDelayTicks: number            // Ticks until respawn (90 = 3s at 30Hz)

}

export const DEFAULT_CONFIG: GameConfig = {
  width: 120,                            // Standard screen width
  height: 36,                            // Standard screen height
  maxPlayers: 4,
  tickIntervalMs: 33,                  // ~30Hz server tick

  // Tick-based timing
  baseAlienMoveIntervalTicks: 18,      // Move every 18 ticks
  baseBulletSpeed: 1,                  // 1 cell per tick (player bullets)
  baseAlienShootRate: 0.016,           // Base probability per tick
  playerCooldownTicks: 6,              // ~200ms between shots
  playerMoveSpeed: 1,                  // 1 cell per tick when holding key (Space Invaders style)
  respawnDelayTicks: 90,               // 3 seconds at 30Hz

}

/** Return type of getScaledConfig() - player-count-scaled game parameters */
interface ScaledConfig {
  alienMoveIntervalTicks: number    // Ticks between alien moves (scaled from base)
  alienShootProbability: number     // Probability per tick (~0.017 to 0.042)
  alienCols: number                 // Grid columns (11-15 based on player count)
  alienRows: number                 // Grid rows (5-6 based on player count)
  lives: number                     // Shared lives (3 solo, 5 coop)
}

/** Event names that can be emitted during gameplay (matches ServerEvent.name) */
type GameEvent =
  | 'player_joined'
  | 'player_left'
  | 'player_ready'
  | 'player_unready'
  | 'player_died'
  | 'player_respawned'
  | 'countdown_tick'
  | 'countdown_cancelled'
  | 'game_start'
  | 'alien_killed'
  | 'score_awarded'
  | 'wave_complete'
  | 'game_over'
  | 'invasion'
  | 'ufo_spawn'

// ─── Layout Constants ─────────────────────────────────────────────────────────

/** Layout constants for the 120×36 game grid */
const LAYOUT = {
  PLAYER_Y: 31,              // Y position for player ships (5 rows from bottom)
  PLAYER_MIN_X: 2,           // Left boundary for player movement
  PLAYER_MAX_X: 114,         // Right boundary for player movement (120 - 5 - 1)
  PLAYER_WIDTH: 5,           // Width of player sprite (2-line sprite)
  PLAYER_HEIGHT: 2,          // Height of player sprite
  BULLET_SPAWN_OFFSET: 2,    // Bullet spawns this far above player
  BARRIER_Y: 25,             // Y position for barrier row
  ALIEN_START_Y: 3,          // Initial Y position for top alien row
  ALIEN_COL_SPACING: 7,      // Horizontal spacing between alien columns (wider for 5-char sprites)
  ALIEN_ROW_SPACING: 3,      // Vertical spacing between alien rows (for 2-line sprites)
  ALIEN_MIN_X: 2,            // Left boundary for alien movement
  ALIEN_MAX_X: 114,          // Right boundary for alien movement
  ALIEN_WIDTH: 5,            // Width of alien sprite
  ALIEN_HEIGHT: 2,           // Height of alien sprite
  GAME_OVER_Y: 28,           // If aliens reach this Y, game over
  COLLISION_H: 3,            // Horizontal collision threshold (for 5-wide sprites)
  COLLISION_V: 2,            // Vertical collision threshold (for 2-tall sprites)
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
  x: number                         // Horizontal position CENTER of sprite (y is always LAYOUT.PLAYER_Y)
  slot: PlayerSlot
  color: PlayerColor
  lastShotTick: number              // Tick of last shot (for cooldown)
  alive: boolean
  lives: number                     // Individual lives (starts at 3)
  respawnAtTick: number | null      // Tick to respawn after death
  kills: number

  // Input state (server-authoritative, updated from client input messages)
  inputState: {
    left: boolean
    right: boolean
  }
}

// ─── Enemies ──────────────────────────────────────────────────────────────────

type ClassicAlienType = 'squid' | 'crab' | 'octopus'

// ─── Alien Registry ──────────────────────────────────────────────────────────

const ALIEN_REGISTRY = {
  squid:   { points: 30, sprite: '╔═╗', color: 'magenta' },
  crab:    { points: 20, sprite: '/°\\', color: 'cyan' },
  octopus: { points: 10, sprite: '{ö}', color: 'green' },
} as const

const FORMATION_ROWS: ClassicAlienType[] = ['squid', 'crab', 'crab', 'octopus', 'octopus']

// ─── Obstacles ────────────────────────────────────────────────────────────────

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

// ─── Exports ─────────────────────────────────────────────────────────────────

// Re-export protocol types for convenience (single import source)
export * from './protocol'

// Export all types
export type {
  Position,
  GameEntity,
  GameState,
  GameConfig,
  ScaledConfig,
  GameEvent,
  Entity,
  AlienEntity,
  BulletEntity,
  BarrierEntity,
  UFOEntity,
  Player,
  PlayerSlot,
  PlayerColor,
  ClassicAlienType,
  BarrierSegment,
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
  getUFOs,
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
    alienMoveIntervalTicks: Math.floor(baseConfig.baseAlienMoveIntervalTicks / scale.speedMult),
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

// Pure movement-only tick for testing (no collisions, shooting, waves, etc.)
// Does NOT validate full game loop - only tests basic movement physics
export function tickMovementOnly(state: GameState, config: GameConfig): GameState {
  const playerCount = Object.keys(state.players).length
  const scaled = getScaledConfig(playerCount, config)

  // Clone state to avoid mutation
  const next = structuredClone(state)
  next.tick++

  // Process player input (uses LAYOUT constants)
  for (const player of Object.values(next.players)) {
    if (!player.alive) continue
    if (player.inputState.left) {
      player.x = Math.max(LAYOUT.PLAYER_MIN_X, player.x - config.playerMoveSpeed)
    }
    if (player.inputState.right) {
      player.x = Math.min(LAYOUT.PLAYER_MAX_X, player.x + config.playerMoveSpeed)
    }
  }

  // Move bullets
  const bullets = next.entities.filter((e): e is BulletEntity => e.kind === 'bullet')
  for (const bullet of bullets) {
    bullet.y += bullet.dy * config.baseBulletSpeed
  }

  // Remove off-screen bullets (y <= 0 is top, y >= height is bottom)
  next.entities = next.entities.filter(e =>
    e.kind !== 'bullet' || (e.y > 0 && e.y < config.height)
  )

  // Move aliens (if on move interval, uses LAYOUT constants)
  if (next.tick % scaled.alienMoveIntervalTicks === 0) {
    const aliens = next.entities.filter((e): e is AlienEntity => e.kind === 'alien' && e.alive)
    for (const alien of aliens) {
      alien.x += next.alienDirection * 2
    }
    // Check for wall collision and reverse (uses LAYOUT.ALIEN_MIN_X/MAX_X)
    const hitWall = aliens.some(a => a.x <= LAYOUT.ALIEN_MIN_X || a.x >= LAYOUT.ALIEN_MAX_X)
    if (hitWall) {
      next.alienDirection *= -1
      for (const alien of aliens) {
        alien.y += 1
      }
    }
  }

  return next
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
  | { type: 'start_solo' }
  | { type: 'forfeit' }                                // End game early (go to game_over)
  | { type: 'input'; held: InputState }               // Held-state networking (no seq needed)
  | { type: 'move'; direction: 'left' | 'right' }     // Discrete movement (one step per message)
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
  | { type: 'event'; name: 'game_start' }
  | { type: 'event'; name: 'alien_killed'; data: { alienId: string; playerId: string | null } }
  | { type: 'event'; name: 'score_awarded'; data: { playerId: string | null; points: number; source: 'alien' | 'ufo' | 'commander' | 'wave_bonus' } }
  | { type: 'event'; name: 'wave_complete'; data: { wave: number } }
  | { type: 'event'; name: 'game_over'; data: { result: 'victory' | 'defeat' } }
  | { type: 'event'; name: 'invasion'; data?: undefined }
  | { type: 'event'; name: 'ufo_spawn'; data: { x: number } }

type ServerMessage =
  | { type: 'sync'; state: GameState; playerId?: string; config?: GameConfig }
  | ServerEvent
  | { type: 'pong'; serverTime: number }
  | { type: 'error'; code: ErrorCode; message: string }

// Sync optimization:
// - playerId: sent ONCE on initial join sync, omitted thereafter (client caches it)
// - config: sent ONCE on initial join sync, omitted thereafter (config is static)
// - state: sent at 30Hz but omits config field (client uses cached config)
// This reduces per-sync payload from ~4KB to ~2KB.

type ErrorCode =
  | 'room_full'              // 4 players already in room
  | 'game_in_progress'       // Can't join mid-game
  | 'invalid_room'           // Room code doesn't exist
  | 'invalid_action'         // Action not allowed in current state
  | 'invalid_message'        // Malformed WebSocket message
  | 'name_taken'             // Player name already in use in room
  | 'not_in_room'            // Action requires being in room first
  | 'rate_limited'           // Too many requests
  | 'countdown_in_progress'  // Can't join during countdown

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

import { DurableObject } from 'cloudflare:workers'

// WebSocket attachment for player session data
interface WebSocketAttachment {
  playerId: string
}

export class GameRoom extends DurableObject<Env> {
  private game: GameState | null = null
  private nextEntityId = 1  // Monotonic counter for entity IDs
  private inputQueue: GameAction[] = []  // Queued actions processed on tick
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
        this.game = JSON.parse(rows[0].data)
        this.nextEntityId = rows[0].next_entity_id
      }
    })
  }

  private generateEntityId(): string {
    return `e_${this.nextEntityId++}`
  }

  // Persist on key state transitions (not every tick)
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

      // Create WebSocket pair and accept with hibernation
      const pair = new WebSocketPair()

      // Accept WebSocket with hibernation support (DO can sleep while connection stays open)
      // Attachment stores player session data that survives hibernation
      this.ctx.acceptWebSocket(pair[1])

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

  /**
   * Hibernatable WebSocket message handler
   * Called when any connected WebSocket receives a message, waking the DO if hibernating
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (!this.game) return

    const msg = JSON.parse(message as string) as ClientMessage
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null
    const playerId = attachment?.playerId

    switch (msg.type) {
      case 'join': {
        // Prevent duplicate joins
        if (attachment?.playerId) return

        if (this.game.status === 'countdown') {
          this.sendError(ws, 'countdown_in_progress', 'Game starting, try again')
          return
        }
        if (Object.keys(this.game.players).length >= 4) {
          this.sendError(ws, 'room_full', 'Room is full')
          return
        }

        const playerName = typeof msg.name === 'string' ? msg.name.slice(0, 12) : 'Player'
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
          kills: 0,
          inputState: { left: false, right: false },
        }

        this.game.players[player.id] = player
        this.game.mode = Object.keys(this.game.players).length === 1 ? 'solo' : 'coop'

        // Store playerId in WebSocket attachment (survives hibernation)
        ws.serializeAttachment({ playerId: player.id } satisfies WebSocketAttachment)

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
        if (playerId && this.game.players[playerId]) {
          this.inputQueue.push({ type: 'PLAYER_INPUT', playerId, input: msg.held })
        }
        break
      }

      case 'move': {
        // Discrete movement - one step per message (for terminals without key release events)
        if (playerId && this.game.players[playerId] && (this.game.status === 'playing' || this.game.status === 'countdown')) {
          this.inputQueue.push({ type: 'PLAYER_MOVE', playerId, direction: msg.direction })
        }
        break
      }

      case 'shoot': {
        if (playerId && this.game.players[playerId] && this.game.status === 'playing') {
          this.inputQueue.push({ type: 'PLAYER_SHOOT', playerId })
        }
        break
      }

      case 'ping': {
        ws.send(JSON.stringify({ type: 'pong', serverTime: Date.now() }))
        break
      }
    }
  }

  /**
   * Hibernatable WebSocket close handler
   */
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null
    const playerId = attachment?.playerId

    if (playerId && this.game?.players[playerId]) {
      if (this.game.status === 'countdown') {
        await this.cancelCountdown('Player disconnected')
      }
      await this.removePlayer(playerId)
      this.broadcastFullState()
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

    // Start in wipe_hold phase (skip exit for game start)
    this.game.status = 'wipe_hold'
    this.game.countdownRemaining = null
    this.countdownRemaining = null
    this.game.lives = scaled.lives
    this.game.tick = 0
    this.game.wipeTicksRemaining = WIPE_TIMING.HOLD_TICKS
    this.game.wipeWaveNumber = 1

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
      for (const alien of aliens) { alien.entering = true }
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
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(data) } catch {}
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

  private createAlienFormationWithIds(cols: number, rows: number): AlienEntity[] {
    if (!this.game) return []
    // Use shared createAlienFormation with custom ID generator
    return createAlienFormation(
      cols,
      rows,
      this.game.config.width,
      () => this.generateEntityId()
    )
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

  private sendError(ws: WebSocket, code: string, message: string) {
    ws.send(JSON.stringify({ type: 'error', code, message }))
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
    "@opentui/core": "0.1.72",
    "@opentui/react": "0.1.72"
  },
  "devDependencies": {
    "@types/bun": "^1.0.0",
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

// Parse CLI flags: --room ABC123 --name Alice --matchmake --enhanced
function parseArgs(): { room?: string; name: string; matchmake: boolean; enhanced: boolean } {
  const args = process.argv.slice(2)
  const flags: Record<string, string | boolean> = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--room' && args[i + 1]) flags.room = args[++i]
    else if (args[i] === '--name' && args[i + 1]) flags.name = args[++i]
    else if (args[i] === '--matchmake') flags.matchmake = true
    else if (args[i] === '--enhanced') flags.enhanced = true
  }
  return {
    room: flags.room as string | undefined,
    name: (flags.name as string) || `Player${Math.floor(Math.random() * 1000)}`,
    matchmake: !!flags.matchmake,
    enhanced: !!flags.enhanced,
  }
}

async function main() {
  const { room, name, matchmake, enhanced } = parseArgs()
  const renderer = await createCliRenderer()
  const root = createRoot(renderer)

  root.render(<App roomCode={room} playerName={name} matchmake={matchmake} enhanced={enhanced} />)

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
import { useRef, useCallback, useEffect } from 'react'
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

  // Held-input resend loop: resend while any key held (handles dropped packets)
  // Per networking rules: must resend periodically, not just on change
  useEffect(() => {
    // Only run when game is playing
    if (gameStatus !== 'playing') {
      if (predictionInterval.current) clearInterval(predictionInterval.current)
      predictionInterval.current = null
      return
    }

    predictionInterval.current = setInterval(() => {
      const held = heldKeys.current
      // Always resend while any key is held (dropped packet recovery)
      if (held.left || held.right) {
        updateInput(held)
      }
    }, 100)  // 10Hz resend rate while keys held

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
    if (event.name === 'left') {
      if (isPress && !heldKeys.current.left) {
        heldKeys.current.left = true
        updateInput(heldKeys.current)
      } else if (isRelease) {
        heldKeys.current.left = false
        updateInput(heldKeys.current)
      }
      return
    }

    if (event.name === 'right') {
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
      <text fg="cyan"><strong>◀ VADERS ▶</strong></text>
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
            <text fg="white">[ENTER] {isReady ? 'Cancel Ready' : 'Ready Up'} (wait for others)</text>
            <text fg="green">[S] Start Solo Game</text>
          </box>
        ) : (
          <box flexDirection="column">
            <text fg="white">[ENTER] {isReady ? 'Cancel Ready' : 'Ready Up'}</text>
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
    <box flexDirection="column" width={120} height={36}>
      {/* Header */}
      <box height={1} paddingLeft={1} paddingRight={1}>
        <text fg="white"><strong>◀ VADERS ▶</strong></text>
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
    if (!player.respawnAtTick) return null
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
          {i > 0 ? ' ' : ''}{p.id === currentPlayerId ? SYM.pointer : ' '}{p.name}:{p.kills}{!p.alive && p.respawnAtTick ? SYM.skull : ''}
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

The `useGameConnection` hook manages the WebSocket lifecycle and provides:

```typescript
function useGameConnection(url: string, playerName: string, enhanced: boolean): {
  serverState: GameState | null    // Raw server state
  getRenderState: () => GameState  // Interpolated + predicted state for rendering
  playerId: string | null
  connected: boolean
  error: string | null
  send: (msg: ClientMessage) => void
  updateInput: (held: InputState) => void
  shoot: () => void
}
```

**Responsibilities:**
- Connect to WebSocket, send `join` message with player name
- Handle `sync`, `event`, `pong`, `error` messages
- Keep-alive pings every 30 seconds
- Auto-reconnect with exponential backoff (max 5 attempts)
- Local prediction: apply held input immediately, snap on server sync
- Interpolation: lerp other players/entities between server updates
- Trigger audio on game events

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
│   └── wrangler.jsonc
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

```jsonc
// worker/wrangler.jsonc
{
  "name": "vaders",
  "main": "src/index.ts",
  "compatibility_date": "2026-01-24",  // Use current date at time of deployment
  "durable_objects": {
    "bindings": [
      { "name": "GAME_ROOM", "class_name": "GameRoom" },
      { "name": "MATCHMAKER", "class_name": "Matchmaker" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_classes": ["GameRoom"] },
    { "tag": "v2", "new_classes": ["Matchmaker"] }
  ]
}
```

---

## Display Layout (120×36)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│◀ VADERS ▶               SOLO   SCORE:01450   WAVE:3   ♥♥♥           │
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
| Player disconnect | Remove player immediately, broadcast full sync |
| All players leave | End game, destroy room after 5min via Durable Object alarm |
| Room full (4 players) | Return HTTP 429 with `room_full` error |
| Terminal too small | Show "resize terminal to 120×36" message |
| Simultaneous kills | First bullet processed wins (no shared credit) |
| Reconnect during game | Not supported — no rejoin protocol implemented |

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

Terminal-appropriate audio with optional native FFI support:

- **Terminal bell** (`\x07`) for basic feedback
- **Optional native audio** via Bun FFI for richer sound
- **Config** stored in `~/.config/vaders/config.json`

**Sound Effects:**

| Sound | Description |
|-------|-------------|
| `shoot` | Square wave sweep 880→1760Hz |
| `alien_killed` | Square + noise burst |
| `player_died` | Low noise explosion |
| `wave_complete` | C-E-G arpeggio |
| `game_over` | G-E-C descending |
| `countdown_tick` | A4 beep |

**Music Tempo** scales with alien count (1.0× → 1.75× as aliens decrease).

### Mute Indicator

When muted, show 🔇 in status bar.


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

| Layer | Scope | Tools | Speed |
|-------|-------|-------|-------|
| **Unit** | Pure functions, game logic | Bun test | <1s |
| **Integration** | WebSocket protocol, state sync | Bun test + mock WS | <5s |
| **E2E** | Full client-server flow | Bun test + node-pty | <30s |

### Unit Tests

Test pure functions in isolation:

- **Scaling**: `getScaledConfig(playerCount)` returns correct lives, alien grid, speed
- **Collision**: bullet-alien, bullet-player, bullet-barrier hit detection
- **Barriers**: correct count and spacing for player count
- **Spawn positions**: `getPlayerSpawnX(slot, playerCount, width)` distributes evenly

### Integration Tests

Test WebSocket protocol with mock connections:

- `join` → returns `sync` with playerId and initial state
- `ready` when all ready → triggers `countdown_tick` events
- 5th player join → returns `error` with `room_full`
- `ping` → returns `pong` with serverTime
- Player disconnect during countdown → cancels countdown
- Input during gameplay → updates player position in next tick

### E2E Tests

Test full client-server flow:

- Solo game: start → shoot aliens → wave complete → victory/defeat
- 2-player co-op: both join → ready → countdown → game starts
- Reconnection: disconnect → reconnect within grace period → resume
- Enhanced mode: commanders, dive bombers, UFOs spawn correctly

### Coverage Targets

| Component | Target |
|-----------|--------|
| `game/scaling.ts` | 100% |
| `game/collision.ts` | 100% |
| `GameRoom.ts` | 80% |
| `hooks/useGameConnection.ts` | 80% |


## Compatibility

### OpenTUI Version Requirements

> **Warning:** OpenTUI is pre-1.0 and not production-ready. APIs may change between versions. This spec pins to 0.1.72 for stability; check [releases](https://github.com/anomalyco/opentui/releases) for updates.

Pin all `@opentui/*` packages to the same version to avoid reconciler mismatches:

```json
{
  "dependencies": {
    "@opentui/core": "0.1.72",
    "@opentui/react": "0.1.72"
  }
}
```

**Upgrading:** When upgrading OpenTUI, update both packages together and test keyboard input handling, as the `KeyEvent` shape may change between versions.

**Build Requirements:**
- **Zig**: OpenTUI requires Zig for native builds. Install via `brew install zig` or see [ziglang.org](https://ziglang.org/download/)
- **Bun**: v1.0+ required for client runtime
- **Node.js**: v18+ for Wrangler/Cloudflare Workers

### Cloudflare Workers

- Wrangler v4.6.0+ Make sure the version date is set to today.

---

## References

- **OpenTUI**: https://github.com/anomalyco/opentui
- **Cloudflare Durable Objects**: https://developers.cloudflare.com/durable-objects/
- **Durable Objects Best Practices**: https://developers.cloudflare.com/durable-objects/best-practices/
- **Bun Runtime**: https://bun.sh/
- **Space Invaders (1978)**: https://en.wikipedia.org/wiki/Space_Invaders
- **Galaga (1981)**: https://en.wikipedia.org/wiki/Galaga
- **Galaxian (1979)**: https://en.wikipedia.org/wiki/Galaxian

---

## Dependencies

### Client (Bun)

```json
{
  "dependencies": {
    "@opentui/core": "0.1.72",
    "@opentui/react": "0.1.72",
    "react": "^18.2.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/react": "^18.2.0"
  }
}
```

### Worker (Cloudflare)

```json
{
  "dependencies": {},
  "devDependencies": {
    "wrangler": "^3.0.0",
    "typescript": "^5.0.0",
    "@cloudflare/workers-types": "^4.0.0"
  }
}
```

### Testing

```json
{
  "devDependencies": {
    "fast-check": "^3.0.0",
    "node-pty": "^1.0.0"
  }
}
```

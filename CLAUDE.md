# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multiplayer TUI Space Invaders clone (1-4 players) using OpenTUI for terminal rendering and Cloudflare Durable Objects for real-time multiplayer synchronization.

## Architecture

The project has three main parts:

1. **Worker** (`worker/`) - Cloudflare Worker with Durable Object (`GameRoom`) that manages game state, runs the 30Hz game loop, and broadcasts full state via WebSocket
2. **Client** (`client/`) - Bun + OpenTUI React app that renders the TUI, handles keyboard input, and maintains WebSocket connection
3. **Shared** (`shared/`) - TypeScript types (`GameState`, `Player`, `Alien`, etc.) and WebSocket protocol definitions

## Quick Start

```bash
# From project root - connects to remote server, shows launch menu
bun run vaders
```

The launch screen provides all options:
- **Solo Game** - Start immediately with 3 lives
- **Create Room** - Get a room code to share with friends
- **Join Room** - Enter a friend's room code
- **Matchmaking** - Auto-join an open game

## Command-Line Options

```bash
bun run vaders                     # Show launch menu (connects to remote server)
bun run vaders -- --room ABC123    # Join room directly
bun run vaders -- --matchmake      # Auto-matchmake directly
bun run vaders -- --name "Alice"   # Set player name
bun run vaders -- --local          # Run local server for development
bun run vaders -- --solo           # Start solo game directly
bun run vaders -- --check          # Run system diagnostics
bun run vaders -- --no-audio-check # Skip audio verification
```

## Development Commands

```bash
# Run game (connects to deployed remote server by default)
bun run vaders

# Run with local server for development
bun run vaders -- --local

# Run components separately
bun run dev:client             # Client only (needs worker running)
bun run dev:worker             # Worker only

# Deploy to Cloudflare
cd worker && bunx wrangler deploy
```

## Key Technical Details

- **Game tick rate**: 33ms intervals (~30Hz) in Durable Object
- **State sync**: Full state sync on every tick (30Hz)
- **Screen size**: Fixed 120×36 terminal grid
- **Sprites**: 2-line tall, 5-char wide for players/aliens/UFO; bullets 1×1; barrier segments 2×2
- **Player display colors**: cyan (P1), orange (P2), magenta (P3), lime (P4) — note: `PLAYER_COLORS` in types.ts uses different names (green/cyan/yellow/magenta) for protocol-level identification
- **Movement**: Space Invaders-style (1 cell/tick, no inertia)
- **Game statuses**: `waiting` → `countdown` → `wipe_hold` → `wipe_reveal` → `playing` → `game_over` (wave transitions add `wipe_exit` → `wipe_hold` → `wipe_reveal` loop)

### Scaling by Player Count

| Players | Lives | Alien Speed | Grid |
|---------|-------|-------------|------|
| 1 (solo) | 3 | 1.0× | 11×5 |
| 2 | 5 shared | 1.25× | 11×5 |
| 3 | 5 shared | 1.5× | 13×5 |
| 4 | 5 shared | 1.75× | 15×6 |

### WebSocket Protocol

- Client sends: `join`, `ready`, `unready`, `start_solo`, `forfeit`, `input` (held keys), `move` (discrete), `shoot`, `ping`
- Server sends: `sync` (full state), `event` (game events), `error`, `pong`

### OpenTUI Patterns

- `useKeyboard` for input handling
- `<box>` with flexbox layout (Yoga)
- `position="absolute"` for game entity positioning
- `<text color="...">` for styled output

### Observability

Use **wide events** pattern: emit one context-rich JSON log per request, not scattered console.logs. Every log must include `roomId`, `requestId`, and deployment metadata (`version`, `commitHash`, `region`). See spec for full logging schema.

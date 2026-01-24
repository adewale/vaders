# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multiplayer TUI Space Invaders clone (1-4 players) using OpenTUI for terminal rendering and Cloudflare Durable Objects for real-time multiplayer synchronization.

## Architecture

The project has three main parts:

1. **Worker** (`worker/`) - Cloudflare Worker with Durable Object (`GameRoom`) that manages game state, runs the 60fps game loop, and broadcasts delta updates via WebSocket
2. **Client** (`client/`) - Bun + OpenTUI React app that renders the TUI, handles keyboard input, and maintains WebSocket connection
3. **Shared** (`shared/`) - TypeScript types (`GameState`, `Player`, `Alien`, etc.) and WebSocket protocol definitions

## Quick Start

```bash
# From project root - starts server and client, shows launch menu
bun run vaders
```

The launch screen provides all options:
- **Solo Game** - Start immediately with 3 lives
- **Create Room** - Get a room code to share with friends
- **Join Room** - Enter a friend's room code
- **Matchmaking** - Auto-join an open game
- **Enhanced Mode** - Toggle Galaga/Galaxian style enemies

## Command-Line Options

```bash
bun run vaders                     # Show launch menu (default)
bun run vaders -- --room ABC123    # Join room directly
bun run vaders -- --matchmake      # Auto-matchmake directly
bun run vaders -- --name "Alice"   # Set player name
bun run vaders -- --remote         # Use deployed server instead of local
```

## Development Commands

```bash
# Run game (unified - starts worker and client together)
bun run vaders                 # Solo mode by default

# Run components separately
bun run dev:client             # Client only (needs worker running)
bun run dev:worker             # Worker only

# Deploy to Cloudflare
cd worker && bunx wrangler deploy
```

## Key Technical Details

- **Game tick rate**: 60ms intervals in Durable Object
- **State sync**: Full sync on join, delta updates on each tick
- **Screen size**: Fixed 80×24 terminal grid
- **Player colors**: green (P1), cyan (P2), yellow (P3), magenta (P4)

### Scaling by Player Count

| Players | Lives | Alien Speed | Grid |
|---------|-------|-------------|------|
| 1 (solo) | 3 | 1.0× | 11×5 |
| 2 | 5 shared | 1.25× | 11×5 |
| 3 | 5 shared | 1.5× | 13×5 |
| 4 | 5 shared | 1.75× | 15×6 |

### WebSocket Protocol

- Client sends: `join`, `ready`, `unready`, `start_solo`, `input` (left/right/shoot)
- Server sends: `sync` (full state), `tick` (delta), `event` (game events), `error`

### OpenTUI Patterns

- `useKeyboard` for input handling
- `<box>` with flexbox layout (Yoga)
- `position="absolute"` for game entity positioning
- `<text color="...">` for styled output

### Observability

Use **wide events** pattern: emit one context-rich JSON log per request, not scattered console.logs. Every log must include `roomId`, `requestId`, and deployment metadata (`version`, `commitHash`, `region`). See spec for full logging schema.

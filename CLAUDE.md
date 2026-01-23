# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multiplayer TUI Space Invaders clone (1-4 players) using OpenTUI for terminal rendering and Cloudflare Durable Objects for real-time multiplayer synchronization.

## Architecture

The project has three main parts:

1. **Worker** (`worker/`) - Cloudflare Worker with Durable Object (`GameRoom`) that manages game state, runs the 60fps game loop, and broadcasts delta updates via WebSocket
2. **Client** (`client/`) - Bun + OpenTUI React app that renders the TUI, handles keyboard input, and maintains WebSocket connection
3. **Shared** (`shared/`) - TypeScript types (`GameState`, `Player`, `Alien`, etc.) and WebSocket protocol definitions

## Installation & Usage

```bash
# Install globally
bun add -g vaders

# Start a new game (creates room, shows room code)
vaders

# Join existing room
vaders --room ABC123

# Auto-matchmaking
vaders --matchmake

# With player name
vaders --name "Alice" --room ABC123
```

## Development Commands

```bash
# Client
cd client
bun install
bun run dev                    # Run client (connects to ws://localhost:8787/ws)

# Worker
cd worker
bun install
bunx wrangler dev              # Local development
bunx wrangler deploy           # Deploy to Cloudflare
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

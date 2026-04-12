# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multiplayer TUI Space Invaders clone (1-4 players) using OpenTUI for terminal rendering and Cloudflare Durable Objects for real-time multiplayer synchronization.

## Architecture

The project has five packages in a Bun workspace:

1. **Shared** (`shared/`) - TypeScript types (`GameState`, `Player`, `Alien`, etc.) and WebSocket protocol definitions
2. **Client Core** (`client-core/`) - Platform-agnostic client library shared between TUI and web frontends. Contains animation math, connection hooks, input types, audio triggers, sprite data, and adapter interfaces
3. **Client** (`client/`) - Bun + OpenTUI React app that renders the TUI, handles keyboard input, and maintains WebSocket connection
4. **Web** (`web/`) - Browser-based React DOM + Canvas frontend. Uses Vite, vitest, and Playwright
5. **Worker** (`worker/`) - Cloudflare Worker with Durable Object (`GameRoom`) that manages game state, runs the 30Hz game loop, and broadcasts full state via WebSocket

### Multi-Frontend Architecture

Both frontends share `client-core/` for platform-agnostic logic. Each frontend implements platform adapters (`InputAdapter`, `AudioAdapter`, `FrameScheduler`, `VisualConfig`) defined in `client-core/src/adapters.ts`.

Key constraint: `client-core/` must NOT import from `@opentui/*`, `bun:*`, or `node:*`. CI enforces this.

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
# Run TUI game (connects to deployed remote server by default)
bun run vaders

# Run with local server for development
bun run vaders -- --local

# Run components separately
bun run dev:client             # TUI client only (needs worker running)
bun run dev:worker             # Worker only

# Web frontend development
cd web && npx vite             # Start Vite dev server at localhost:5173

# Deploy (single Worker serves both API and static assets)
cd web && npx vite build               # Build web frontend → web/dist
cd worker && npx wrangler deploy       # Deploy unified Worker (API + static assets)
```

## Cross-frontend multiplayer test (manual)

Verify TUI and web players can play together in the same room:

1. **Start the local worker** (one terminal):
   ```bash
   cd worker && npx wrangler dev --port 8787
   ```
2. **Start the web dev server** (second terminal):
   ```bash
   cd web && VITE_SERVER_URL=http://localhost:8787 npx vite --port 5173
   ```
3. **Create a room in the web client**: open `http://localhost:5173`, press `2` (CREATE ROOM). Note the 6-char room code from the URL (`/room/ABC123`).
4. **Join from the TUI** (third terminal):
   ```bash
   VADERS_SERVER=http://localhost:8787 bun run vaders -- --room ABC123 --name "TUI"
   ```
5. **Verify both see 2 players in the lobby** — web shows "Players (2/4)", TUI shows both names.
6. **Both players press ENTER to ready up** — game starts after countdown.
7. **Verify gameplay**:
   - Same aliens, same positions, same HP on both clients (server is authoritative).
   - Shooting an alien on one client makes it disappear on the other.
   - Player colors are distinct: cyan (slot 1), orange (slot 2).

This is the acceptance test for the "one game, two frontends" design goal.

## Testing Commands

```bash
# Run all tests
bun run test                   # shared + client-core + client + worker

# Per-package
bun test shared/               # Shared types, protocol, collision
bun test client-core/          # Animation, connection, input, sprites
bun test client/               # TUI components, hooks, terminal
cd web && npx vitest run       # Web adapters, renderer, contracts, routing
cd worker && bun run test      # Worker, GameRoom, reducer, matchmaker

# Web E2E (requires local servers running)
cd web && npx playwright test

# CI checks
grep -r 'opentui' client-core/src/   # Should find nothing
grep -r 'opentui' web/src/           # Should find nothing
```

## Key Technical Details

- **Game tick rate**: 33ms intervals (~30Hz) in Durable Object
- **State sync**: Full state sync on every tick (30Hz)
- **Screen size**: Fixed 120×36 terminal grid
- **Sprites**: 2-line tall, 5-char wide for players/aliens/UFO; bullets 1×1; barrier segments 3×2
- **Player colors**: cyan (P1), orange (P2), magenta (P3), lime (P4)
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

### Web Frontend

- **Rendering**: HTML Canvas (120×36 grid → 960×576px at 8×16px per cell)
- **Responsive scaling**: Canvas scales to viewport preserving 5:3 aspect ratio
- **Mobile**: Viewports <600px show "Play on desktop" message (touch controls Phase 3)
- **URL routing**: `/` (launch), `/room/:code` (join), `/solo` (solo), `/?matchmake=true`
- **Input**: Browser KeyboardEvent → WebInputAdapter → heldKeys tracker → server
- **Audio**: Web Audio API (user-gesture-gated AudioContext)
- **Canvas renderer**: Pure `buildDrawCommands()` function → `executeDrawCommands()` side effect
- **Tab handling**: `visibilitychange` and `blur` release all held keys
- **Testing**: vitest (unit/property/contract), Playwright (E2E)
- **Deploy**: Single Cloudflare Worker with Static Assets binding (same-origin API + frontend)

### Observability

Use **wide events** pattern: emit one context-rich JSON log per request, not scattered console.logs. Every log must include `roomId`, `requestId`, and deployment metadata (`version`, `commitHash`, `region`). See spec for full logging schema.

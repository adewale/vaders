# Vaders

Multiplayer Space Invaders clone (1-4 players) built with OpenTUI and Cloudflare Durable Objects. Play in your terminal or your browser — one authoritative server, two frontends.

![Version: 1.1.0](https://img.shields.io/badge/version-1.1.0-blue)
![Terminal Size: 120x36](https://img.shields.io/badge/terminal-120x36-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

<p align="center">
  <img src="docs/launch-screen.png" alt="Vaders launch screen" width="480">
  <img src="docs/gameplay.png" alt="Vaders gameplay" width="480">
</p>

<details>
<summary>Spritesheet (all game graphics)</summary>
<img src="docs/spritesheet.png" alt="Vaders spritesheet — all sprites, colors, animations" width="720">
</details>

## Now available in browser

Vaders now runs in the browser as well as the terminal. Play the live deploy at **<https://vaders.adewale-883.workers.dev>** — no install, just open the link. TUI and web players can share a room: the server is authoritative at 30Hz and both frontends render the same game state. Web and TUI are paired via `client-core/`, a platform-agnostic library containing animation, connection, input, audio, and sprite logic.

## Quick Start

```bash
bun install
bun run vaders
```

## Controls

| Key | Action |
|-----|--------|
| Arrow Keys | Move left/right |
| Space | Shoot |
| Enter | Ready up / Select |
| S | Start solo game (in lobby) |
| Escape | Back / Cancel |
| M | Toggle sound effects |
| N | Toggle music |
| ? | Show controls cheatsheet (web) |
| Q | Quit (TUI) |

## Game Modes

- **Solo** - 3 lives, standard alien grid
- **Co-op** (2-4 players) - 5 shared lives, larger grid, faster aliens

## Requirements

**TUI**
- [Bun](https://bun.sh) runtime
- Terminal with 120x36 minimum size
- macOS (uses `afplay` for audio) or Linux (uses `aplay`)

**Web**
- Modern browser (Chrome, Firefox, Safari, Edge)
- Desktop viewport ≥600px wide (mobile shows a gate screen; touch controls are not yet shipped)

## Architecture

Five-package Bun workspace:

```
shared/        TypeScript types, WebSocket protocol, collision, TUI-compat contract
client-core/   Platform-agnostic client library (animation, connection, input, audio, sprites)
client/        Bun + OpenTUI React TUI frontend
web/           Browser React + HTML5 Canvas frontend (Vite, vitest, Playwright)
worker/        Cloudflare Worker + Durable Object authoritative 30Hz game server
```

`client-core/` is forbidden from importing `@opentui/*`, `bun:*`, or `node:*` — CI enforces this. Each frontend plugs in platform adapters (`InputAdapter`, `AudioAdapter`, `FrameScheduler`, `VisualConfig`).

## Web Frontend

- **Stack** - React + HTML5 Canvas renderer, Vite build, deployed via a single Cloudflare Worker (same-origin API + static assets)
- **Rendering** - Pure `buildDrawCommands()` → `executeDrawCommands()`; CRT scanlines, starfield, multi-stage smooth explosions, barrier damage scars
- **Audio** - Web Audio API with split SFX/music mute: **M** toggles sound effects, **N** toggles music; user-gesture-gated AudioContext
- **Controls cheatsheet** - Press **?** on the launch screen to see all keybindings
- **Multiplayer UI** - Slot-coloured ship icons in the lobby with empty-seat placeholders and a ready ticker; match scoreboard ranks all players by kills with MVP trophy on game over
- **URL-based rooms** - Share a link like `/room/ABC123` to join directly; `/solo` starts a solo game; `/?matchmake=true` auto-matchmakes
- **Mobile gate** - Viewports under 600px show a "Play on desktop" message (touch controls not yet shipped)
- **Responsive scaling** - Canvas scales to viewport preserving the 5:3 aspect ratio (base 960×576 from the 120×36 grid at 8×16px/cell)

## Development

```bash
bun run vaders              # Start TUI (connects to remote server)
bun run vaders -- --local   # Start TUI with local server
bun run vaders -- --check   # Run system diagnostics
bun run dev:worker          # Worker only
bun run dev:client          # TUI client only
cd web && npx vite          # Web dev server on localhost:5173
```

### Cross-frontend multiplayer (manual test)

Start worker (`cd worker && npx wrangler dev --port 8787`), start web (`cd web && VITE_SERVER_URL=http://localhost:8787 npx vite --port 5173`), create a room in the browser, then join from the TUI with `VADERS_SERVER=http://localhost:8787 bun run vaders -- --room ABC123`.

## Deploy

```bash
cd web && npx vite build
cd worker && npx wrangler deploy   # Single Worker serves API + static assets
```

## Credits

- Background music: [HydroGene](https://opengameart.org/content/8-bit-epic-space-shooter-music) (CC0)

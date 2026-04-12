# Changelog

All notable changes to Vaders are documented in this file.

## [1.1.0] — 2026-04-12

### Added

- **Web frontend** at <https://vaders.adewale-883.workers.dev> — React + HTML5 Canvas, Vite build, deployed via a single Cloudflare Worker serving both the API and static assets (same-origin)
- **`client-core/` platform-agnostic library** — animation, connection hook, input types, audio triggers, sprite data, and adapter interfaces shared between TUI and web; CI blocks `@opentui/*`, `bun:*`, and `node:*` imports
- **URL-based room joining** — `/room/:code` joins directly, `/solo` starts solo, `/?matchmake=true` auto-matchmakes
- **Split audio controls** — **M** toggles sound effects, **N** toggles music (both frontends); Web Audio API with stereo pan, countdown ticks, and menu navigation beeps on the web
- **`?` controls cheatsheet** on the web launch screen
- **Match scoreboard** on game over — ranks all players by kills with MVP trophy, dense ranking (1,2,2,4), slot-coloured badges, and share-score button
- **Slot-coloured multiplayer lobby** — ship icons, empty-seat placeholders, ready ticker
- **Full-screen wave announcements** with pulsing border and alien slide-in entrance during `wipe_reveal`; HUD player legend in multiplayer; FIGHT! / WAVE CLEARED! transition flashes
- **`/health` endpoint** and structured `worker_boot` log exposing version, commit hash, and build timestamp; launch-screen footer shows `v1.1.0 · <commit>`
- **Responsive web rendering** with 5:3 aspect-ratio scaling and a mobile gate for viewports under 600px

### Changed

- **Workspace restructured to five packages** — `shared/`, `client-core/` (new), `client/` (thinned to TUI-only), `web/` (new), `worker/` (unchanged)
- **Worker per-request `console.log` breadcrumbs** gated behind a `DEBUG_TRACE` flag (off in production)

### Fixed

- **Lives-heart misalignment** in the web HUD — mixed-font segments now laid out with `ctx.measureText` instead of hand-rolled `fontSize * 0.6` approximations
- **Flickering screen-shake** — replaced `Math.random()` jitter with deterministic sine decay keyed on tick
- **Full-screen white flash on every alien kill** removed (strobed in busy waves)
- **UFO warp-ghost, rainbow trail, motion-blur streaks, energy glow halo, and trail particles** removed per user feedback
- **Replay state leak** — accumulators between matches now reset on tick rewind inside `buildDrawCommands`
- **Red-damage flash and shake intensity** softened; score-bump retriggers debounced

## [1.0.0] - 2026-02-22

### Added

- **Core game** — 1-4 player Space Invaders clone in the terminal (120x36 grid)
- **Multiplayer** — Real-time co-op via Cloudflare Durable Objects and WebSocket
- **Game modes** — Solo (3 lives), Co-op 2-4 players (5 shared lives, scaled grids)
- **Launch menu** — Solo game, Create Room, Join Room, Matchmaking
- **Audio** — Sound effects (shoot, explosion, UFO) and looping background music via system player (afplay/mpv)
- **Braille pixel art sprites** — 7-wide animated sprites for players, aliens, UFO, barriers, and bullets with gradient coloring
- **Alien grid** — Squids, crabs, and octopuses with two animation frames, classic march pattern
- **UFO** — Bonus target with color-cycling rainbow effect
- **Barriers** — 4 destructible barriers with braille segments and per-health color
- **Wave progression** — Escalating difficulty across waves with faster aliens and tighter grids
- **Wave transitions** — Animated border with wave announce, wipe-exit/hold/reveal phases
- **Dissolve effects** — Braille particle system for entity deaths and barrier damage
- **Explosion effects** — Directional shrapnel + gravity debris for player ships, multi-phase flash/ring/sparks/fragments for UFOs
- **Confetti system** — Victory celebration particle effect
- **Entrance animations** — Rain, wave, scatter, and slide patterns for alien grid entry
- **Smooth movement** — Entity interpolation between server ticks
- **Terminal compatibility** — Cross-terminal support with ASCII fallbacks for non-braille terminals
- **Player colors** — Cyan (P1), orange (P2), magenta (P3), lime (P4)
- **Lobby** — Player list with colored ship sprites, ready-up system
- **Scoring** — Per-alien-type scores, UFO bonus, high score display
- **Respawn** — Players respawn at death position after brief invulnerability
- **Per-wave border colors** — Rainbow gradient border colors cycle through waves
- **Spritesheet tool** — Visual catalog of all game graphics with animation frames and explosion strips
- **CI** — GitHub Actions workflow for type-checking and tests
- **620+ tests** — Comprehensive test suite across all workspaces including property-based collision tests
- **Documentation** — README with screenshots, server architecture docs, architecture diagrams

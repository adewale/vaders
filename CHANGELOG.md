# Changelog

All notable changes to Vaders are documented in this file.

## [1.2.0] — 2026-06-10

A deep-audit hardening pass. Every fix below shipped test-first (red → green) with
a regression guard; see `Lessons_learned.md` §21 for the full postmortem.

### Fixed

- **Reconnection watchdog killed every recovery** (`client-core`, both frontends) — the heartbeat watchdog measured liveness from the last `pong` only, and the `onopen` handler never refreshed it, so a freshly reconnected socket inherited the dead socket's stale timestamp and was force-closed ~30 s later, every time. Liveness is now an explicit mark set on **both** socket-open and pong (`client-core/src/connection/liveness.ts`), so the reset cannot be forgotten. Regression: `web/src/connection-reconnect.test.tsx` drives the real hook through a reconnect.
- **Single-alarm clobber froze live rooms for 5 s** (`worker`) — a Durable Object has one alarm and `setAlarm` overwrites; `ensureUnauthenticatedSocketAlarm` fired on every WS upgrade and set `now + 5 s` unconditionally, so a mid-match reconnect pushed the pending 33 ms game-tick alarm out by 5 s. Now min-merges via `getAlarm()` (Cloudflare's documented "Multiple Events / Single Alarm" pattern).
- **`game_over` leaked rooms forever** (`worker`) — `PLAYER_LEAVE` was blocked in `game_over`, so a disconnect at the game-over screen never removed the player; `playerCount` never reached 0, `cleanup()` never ran, and the room + its matchmaker registry entry persisted indefinitely. `PLAYER_LEAVE` is now permitted out of `game_over`.
- **`ready` bypassed the state machine** (`worker`) — the `ready` handler had no status guard, so a scripted client could send `ready` mid-match and, once every live player's id was collected, force a countdown whose completion wiped the live match (tick/score/wave reset). `ready`/`unready`/`checkStartConditions` are now status-guarded to the lobby.
- **Matchmaker registry grew without bound** (`worker`) — `/find` only swept rooms in `openRooms`, so created-but-never-joined rooms (and other non-open entries) lived in the single-value `rooms` blob forever, heading for the **128 KiB KV-value ceiling** (this DO is KV-backed) that would break matchmaking for everyone. `/find` now sweeps **all** rooms by staleness, `game_over` registrations are dropped, and a `MAX_TRACKED_ROOMS` cap (sized to fit 128 KiB) refuses new rooms past the limit (the Worker surfaces 503).
- **Room creation ignored downstream failures** (`worker`) — `createRoom` ignored the `/init` and `/register` responses, so `POST /room` could hand a client a roomCode for a room the registry had rejected. It now checks both and propagates the failure.
- **Rejoin-token table leaked per room** (`worker`) — `cleanup()` dropped `game_state` but left `rejoin_sessions` behind, so each dead room's tokens persisted in SQLite. Cleanup now clears them too.
- **Asymmetric player bounds** (`shared`) — `PLAYER_MAX_X` was computed with the left-edge formula (`120 − 7 − 1 = 112`) on a center-based coordinate, leaving the rightmost 4 columns unreachable while the ship could touch the left wall. Corrected to `116` so the reachable margins mirror.
- **Malformed / unknown server messages were swallowed silently** (`client-core`) — the WebSocket hook now emits a dev-visible `console.warn` instead of dropping unparseable frames and unknown message types with no signal.
- **`buildWsUrl` used substring surgery** (`web`) — scheme derivation now uses the URL parser (`deriveWsUrl`), which handles ports, path prefixes, and scheme-case correctly.
- **TUI audio backend mismatch** (`client`) — the startup probe and `MusicManager` disagreed on the Linux audio binary (probe accepted `aplay`; music hardcoded `mpv`), so music silently failed on `aplay`-only hosts. Both now resolve through one source of truth (`client/src/audio/audioPlayers.ts`) with graceful fallback.
- **TUI default server URL** (`client`) — running the client directly defaulted to `localhost:8787` while the launcher defaulted to production, silently targeting a dead server. Both now agree on the production default.

## [1.1.1] — 2026-04-13

### Fixed

- **Phantom players in matchmaking** (reproduced in production as room `XPJZ7K`) — a `GameRoom` rehydrated from SQL after eviction kept `state.players` entries whose WebSockets had died, trapping every subsequent matchmaker in "0/N ready" forever. Shipped three orthogonal mitigations as defence-in-depth; see `Lessons_learned.md` §20 and `docs/TODO.md` for the full postmortem:
  - **A. Reconcile on wake** — `GameRoom` constructor now prunes `state.players` against `ctx.getWebSockets()` on every rehydrate. Emits `reconcile_prune_phantoms` wide event.
  - **B. Heartbeat timeout** — new `Player.lastActiveTick` refreshed on every inbound message; the game tick reaps any player idle > 2400 ticks (~80 s at 30 Hz) during `playing` / `wipe_*` statuses. Emits `reap_idle_player` / `reap_emptied_room` wide events.
  - **C. Progress-stale matchmaker prune** — `Matchmaker` tracks `lastStatusChangeAt` separately from `updatedAt`. `/find` prunes any `waiting` room whose `lastStatusChangeAt` is > 10 min old even when `updatedAt` is fresh (the signature of a phantom-trapped room cycling through victims). Emits `mm_prune_stale_by_progress` wide event.

### Changed

- `shared/types.ts` — added optional `lastActiveTick: number | null` to `Player`. Backward-compatible: `migrateGameState` lazy-initialises legacy records.
- `worker/src/Matchmaker.ts` — `RoomInfo` gains `lastStatusChangeAt: number`. Legacy persisted records backfill on rehydrate using `updatedAt` as a conservative proxy.
- **Launch screen footer** — replaced the abbreviated "GitHub" link with the explicit URL `github.com/adewale/vaders`, and moved "Built on the Cloudflare Developer Platform" onto its own line underneath.

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

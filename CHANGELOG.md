# Changelog

All notable changes to Vaders are documented in this file.

## [1.1.0] - Unreleased

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

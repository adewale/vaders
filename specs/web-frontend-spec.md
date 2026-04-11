# Web Frontend — Technical Spec
## Multi-Frontend Architecture • Refactoring Strategy • Testing Plan

---

## Overview

This spec describes what is involved in refactoring the Vaders codebase to support multiple frontend implementations — specifically adding a browser-based web UI alongside the existing TUI client. It covers the architectural changes needed, the constraints that apply, and the testing strategy to ensure the refactoring doesn't break the TUI and that the web frontend achieves feature parity.

---

## Table of Contents

1. [Current Architecture Assessment](#1-current-architecture-assessment)
2. [Refactoring for Multi-Frontend Support](#2-refactoring-for-multi-frontend-support)
3. [Web Frontend Design](#3-web-frontend-design)
4. [Constraints](#4-constraints)
5. [Testing Strategy](#5-testing-strategy)
6. [Migration Plan](#6-migration-plan)
7. [Experience Quality](#7-experience-quality)

---

## 1. Current Architecture Assessment

### What already works well

The codebase already has strong separation between concerns, following the architectural principle "One Source of Truth per Concern" from the main spec. The key separations:

| Layer | Location | Coupling to TUI |
|-------|----------|-----------------|
| Game state & logic | `worker/src/game/` | None |
| Types & constants | `shared/types.ts` | None |
| Protocol & messages | `shared/protocol.ts` | None |
| State defaults | `shared/state-defaults.ts` | None |
| WebSocket connection | `client/src/hooks/useGameConnection.ts` | Minimal (React hooks, but no OpenTUI imports) |
| Animation math | `client/src/animation/` | Mostly none (see dependency graph below) |
| Color math | `client/src/gradient.ts` | None (pure RGB interpolation) |
| Input normalization | `client/src/input.ts` | Light (maps OpenTUI key names) |
| Rendering | `client/src/components/` | Heavy (OpenTUI `<box>`/`<text>` elements) |
| Sprites | `client/src/sprites.ts` | Heavy (braille encoding + terminal color conversion) |
| Audio | `client/src/audio/` | Heavy (child process `afplay`/`aplay`) |
| Color effects | `client/src/effects.ts` | None (pure color cycling functions) |
| Terminal compat | `client/src/terminal/` | Total (terminal-only concern) |
| Entry point | `client/src/index.tsx` | Total (CLI/OpenTUI bootstrap) |

### Coupling inventory — verified by import tracing

The initial version of this spec made claims about coupling without tracing actual imports. This section is corrected from a full `import` analysis of every file.

**Zero coupling** (use as-is from web frontend):
- All of `shared/` — types, protocol, state defaults, helpers like `applyPlayerInput`, `getAliens`, `LAYOUT`, `PLAYER_COLORS`
- `useGameConnection` hook — imports only from `react` and `shared/types`. Uses standard `WebSocket`, `structuredClone`, `JSON.parse`, `Date.now`, `setInterval`, `setTimeout` — all available in browsers
- `animation/easing.ts` — no imports outside itself
- `animation/entrance.ts` — imports only from `./easing`
- `animation/starfield.ts` — no external imports
- `animation/confetti.ts` — imports only from `./easing`
- `animation/interpolation.ts` — imports only from `./easing`. Uses `performance.now()` (available in browsers and Bun)
- `gradient.ts` — pure RGB math, no platform imports
- `effects.ts` — re-exports animation module + `getUFOColor()` (pure color cycling)

**Light coupling** (needs adapter or small refactor):
- `input.ts` — key normalization maps OpenTUI key names to `VadersKey`. Web version maps `KeyboardEvent.key` instead
- `useGameAudio` hook — trigger logic (which state change fires which sound) is reusable; playback mechanism (child process vs Web Audio API) is not
- `config/featureFlags.ts` — just `export const ENABLE_STARFIELD = true`. Trivially portable, but hooks like `useStarfield` import it

**Medium coupling** (needs surgery to extract):
- `animation/dissolve.ts` — imports `BRAILLE_DENSITY` and `MAX_DENSITY` from `./waveBorder`, plus `clamp` from `./easing`. The braille density table is data (an array of Unicode characters), not terminal-specific logic. Can be extracted as-is since braille characters are valid Unicode in browsers too. The `DissolveSystem` class itself is platform-agnostic
- `animation/waveBorder.ts` — imports from `./easing` and from `../gradient`. The gradient import is pure math (no terminal dependency), but this cross-directory dependency means `gradient.ts` must move to `client-core/` alongside `waveBorder.ts`
- `useStarfield` hook — imports `ENABLE_STARFIELD` from `../config/featureFlags`. Either move `featureFlags.ts` to core or inject the flag as a parameter
- `useInterpolation` hook — **uses `requestAnimationFrame` / `cancelAnimationFrame` in its render loop** (lines 114-117). This API exists in browsers natively but does NOT exist in Bun's runtime. It currently works in the TUI because OpenTUI provides a polyfill. Moving to `client-core/` requires injecting a `FrameScheduler` adapter or restructuring to let the caller drive the render loop

**Heavy coupling** (must stay in TUI client, rewrite for web):
- `useDissolveEffects` hook — imports from `../sprites` (`COLORS`, `SPRITE_SIZE`, `SPRITES`, `getPlayerColor`), from `../effects` (`getUFOColor`), and from `../terminal` (`supportsBraille`, `getTerminalCapabilities`). The *detection logic* (which entity died, where to spawn an effect) is reusable, but the *color/sprite lookups* are TUI-specific. Must be split: core detects events → platform provides visual parameters
- All `components/*.tsx` — OpenTUI JSX elements (`<box>`, `<text>`, `position="absolute"`)
- `sprites.ts` — 14×8 pixel bitmaps are extractable as data, but the file also imports `getTerminalCapabilities`, `convertColorForTerminal`, `supportsBraille` from `./terminal`. Extraction requires separating the bitmap data from the terminal rendering layer
- `AudioManager.ts`, `MusicManager.ts` — spawn `afplay`/`aplay` child processes
- `index.tsx` — CLI arg parsing, OpenTUI `createCliRenderer`
- `terminal/compatibility.ts` — Kitty protocol detection, color depth probing

### Full dependency graph for extraction

These are the transitive import chains that must move together:

```
client-core/ must contain:
  easing.ts                          (no deps)
  gradient.ts                        (no deps)
  interpolation.ts                   → easing
  entrance.ts                        → easing
  starfield.ts                       (no deps)
  confetti.ts                        → easing
  waveBorder.ts                      → easing, gradient
  dissolve.ts                        → waveBorder, easing
  effects.ts                         → re-exports animation (getUFOColor is pure)
  useGameConnection.ts               → shared/types (React hook)
  featureFlags.ts                    (trivial constants)

Hooks that need splitting before extraction:
  useInterpolation.ts                → needs FrameScheduler adapter for requestAnimationFrame
  useDissolveEffects.ts              → needs platform-injected colors/sprites/capabilities
  useStarfield.ts                    → needs featureFlags moved or injected
```

---

## 2. Refactoring for Multi-Frontend Support

### 2.1 Extract a platform-agnostic client core

Create a new package `client-core/` containing everything both frontends need:

```
client-core/
  src/
    connection/
      useGameConnection.ts    ← moved from client/src/hooks/
      reconnection.ts         ← extracted reconnection logic
    animation/
      easing.ts               ← moved from client/src/animation/
      interpolation.ts        ← moved (imports only easing)
      entrance.ts             ← moved (imports only easing)
      dissolve.ts             ← moved (imports waveBorder, easing)
      waveBorder.ts           ← moved (imports easing, gradient)
      starfield.ts            ← moved (no deps)
      confetti.ts             ← moved (imports easing)
      gradient.ts             ← moved from client/src/gradient.ts
    input/
      types.ts                ← VadersKey, InputState (platform-agnostic)
      heldKeys.ts             ← createHeldKeysTracker (platform-agnostic)
    audio/
      triggers.ts             ← extracted from useGameAudio (state→sound mapping)
      types.ts                ← SoundEvent enum, AudioAdapter interface
    effects/
      colorCycling.ts         ← getUFOColor and similar pure functions from effects.ts
    sprites/
      bitmaps.ts              ← PIXEL_ART data, SPRITE_SIZE, animation frame selection
      colors.ts               ← canonical color definitions (hex strings)
    state/
      renderState.ts          ← getRenderState logic (prediction + interpolation)
    config/
      featureFlags.ts         ← moved from client/src/config/
    adapters.ts               ← platform adapter interfaces
```

### 2.2 Define platform adapter interfaces

Each frontend implements these interfaces:

```typescript
// client-core/src/adapters.ts

interface InputAdapter {
  /** Subscribe to normalized key events */
  onKey(callback: (key: VadersKey, type: 'down' | 'up') => void): () => void
  /** Whether the platform supports held-key detection natively */
  supportsKeyRelease: boolean
}

interface AudioAdapter {
  play(sound: SoundEvent): void
  startMusic(): void
  stopMusic(): void
  setMuted(muted: boolean): void
}

interface StorageAdapter {
  get(key: string): string | null
  set(key: string, value: string): void
}

interface FrameScheduler {
  /** Schedule a callback for the next render frame. Returns a cancel handle. */
  requestFrame(callback: () => void): number
  cancelFrame(handle: number): void
}

interface VisualConfig {
  /** Whether the platform supports braille Unicode characters */
  supportsBraille: boolean
  /** Get the display color for a player slot */
  getPlayerColor(slot: number): string
  /** Get sprite visual data for a given entity type (platform-specific format) */
  getSpriteData(entityType: string): unknown
}
```

The `FrameScheduler` adapter solves the `requestAnimationFrame` portability issue: browsers provide it natively, OpenTUI provides a polyfill, and the core never calls it directly.

### 2.3 Keep sprites as data, render per-platform

The current `sprites.ts` stores 14×8 pixel bitmaps in a `number[][]` format (`PIXEL_ART`), then converts to braille via `pixelsToBraille()`. It also imports terminal compatibility functions for color conversion. Refactor into three parts:

1. **Bitmap data** (`client-core/src/sprites/bitmaps.ts`): `PIXEL_ART` arrays, `SPRITE_SIZE` constants, `getAnimationFrame()` logic — pure data, no imports from terminal
2. **TUI renderer** (`client/src/sprites-tui.ts`): `pixelsToBraille()`, `getTerminalPlayerColor()`, color conversion — imports from `./terminal`
3. **Web renderer** (`web/src/sprites-web.ts`): converts bitmaps → canvas pixel art, or renders pre-generated PNG assets at the appropriate scale

### 2.4 Refactoring the hooks

| Hook | Strategy | Extraction difficulty |
|------|----------|----------------------|
| `useGameConnection` | Move to `client-core/`. Already platform-agnostic | Easy — no platform imports |
| `useGameAudio` | Split: trigger logic (core) detects state changes and emits `SoundEvent`s; playback (adapter) is platform-specific | Medium — need to define event→sound mapping as data |
| `useInterpolation` | Extract `InterpolationManager` (already pure math). Refactor the *hook* to accept a `FrameScheduler` instead of calling `requestAnimationFrame` directly | Medium — hook restructuring required |
| `useEntranceAnimation` | Move to core. Produces `{x, y}` positions over time | Easy — pure math |
| `useDissolveEffects` | Split: *event detection* (which entity died, at what position) → core. *Visual parameters* (braille support, TUI colors, sprite data for shrapnel) → injected via `VisualConfig` adapter | Hard — 4 imports from TUI-specific modules |
| `useStarfield` | Move to core, inject `ENABLE_STARFIELD` as parameter instead of importing | Easy — one-line refactor |
| `useTerminalSize` | Keep in TUI client. Web equivalent is `useWindowSize` / `useCanvasSize` | N/A |

### 2.5 Refactoring the screens

The five screens (`LaunchScreen`, `LobbyScreen`, `GameScreen`, `GameOverScreen`) plus the `WaveAnnounce` overlay contain two kinds of logic:

1. **Behavioral logic**: what to show based on game state, menu navigation, countdown display, score formatting
2. **Rendering logic**: OpenTUI `<box>`/`<text>` layout

Note: `WaveAnnounce` is a sub-component rendered during `wipe_hold`/`wipe_reveal` status, not a top-level screen like the others.

Extract behavioral logic into shared hooks or functions. Each frontend provides its own rendering. For example:

```typescript
// client-core/src/screens/useGameScreenState.ts
function useGameScreenState(state: GameState, playerId: string) {
  return {
    score: state.score,
    wave: state.wave,
    livesRemaining: state.lives,
    aliens: getAliens(state.entities).map(a => ({
      ...a,
      animationFrame: getAnimationFrame(a.type, state.tick),
    })),
    bullets: getBullets(state.entities),
    barriers: getBarriers(state.entities),
    players: Object.entries(state.players).map(([id, p]) => ({
      ...p,
      isLocal: id === playerId,
      color: PLAYER_COLORS[p.slot],
    })),
    // ... etc
  }
}
```

### 2.6 Monorepo package management

The `client-core/` package must be consumable by both Bun (TUI) and Vite (web). This is a non-trivial tooling decision.

**Recommended approach: Bun workspace with TypeScript path aliases**

```jsonc
// root package.json
{
  "workspaces": ["shared", "client-core", "client", "web", "worker"]
}

// client-core/package.json
{
  "name": "@vaders/client-core",
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

Each consumer references `@vaders/client-core` in its dependencies. Bun resolves workspace packages natively. Vite resolves them via its `resolve.alias` or `tsconfig` paths.

**Constraints**:
- `client-core/package.json` must NOT list `@anthropic/opentui-*` as a dependency
- `client-core/` must not import from `bun:*`, `node:*`, or any Bun/Node built-in modules
- React is a peer dependency of `client-core/` — both consumers provide their own React version

**React version risk**: The TUI uses React via OpenTUI. The web client uses React DOM. If OpenTUI pins to a specific React version, `client-core/` hooks that use React will face peer dependency conflicts. Mitigation: declare React as a peer dependency with a compatible range (e.g., `^18.0.0 || ^19.0.0`), and verify both consumers resolve to compatible versions in CI.

### 2.7 Directory structure after refactoring

```
vaders/
  shared/                    # Types, protocol, constants (unchanged)
  client-core/               # Platform-agnostic client logic (NEW)
    src/
      connection/
      animation/             # easing, interpolation, entrance, dissolve, waveBorder,
                             # starfield, confetti, gradient
      input/
      audio/
      effects/
      sprites/               # bitmap data + colors (no rendering)
      state/
      config/
      adapters.ts
  client/                    # TUI frontend (refactored, thinner)
    src/
      adapters/              # TUI implementations of InputAdapter, AudioAdapter,
                             # FrameScheduler, VisualConfig
      components/            # OpenTUI rendering (unchanged internally)
      terminal/              # Terminal compat (unchanged)
      sprites-tui.ts         # Braille conversion, terminal color mapping
      index.tsx              # CLI entry point (unchanged)
  web/                       # Web frontend (NEW)
    src/
      adapters/              # Browser implementations
      components/            # React DOM + Canvas components
      sprites-web.ts         # Canvas/image rendering
      index.tsx              # Vite/browser entry point
  worker/                    # Server (unchanged)
  specs/
```

---

## 3. Web Frontend Design

### 3.1 Rendering approach

Two viable options:

**Option A: HTML Canvas** (recommended)
- Render the 120×36 grid onto a `<canvas>` element
- Each "cell" maps to a pixel region (e.g., 8×16px per cell → 960×576px canvas)
- Sprites render as scaled pixel art from the same bitmap data
- Supports effects (dissolve, starfield, color cycling) natively via canvas API
- 60fps rendering independent of 30Hz state sync via `requestAnimationFrame`
- Better performance for particle effects and animations

**Option B: React DOM with CSS Grid**
- 120×36 grid of `<span>` elements
- Simpler to build, harder to make performant
- DOM updates at 30Hz with 4000+ elements may stutter
- Effects are harder (dissolve would need per-cell style updates)

**Recommendation**: Canvas for the game area, DOM for UI chrome (menus, HUD, lobby). This mirrors how the TUI client uses absolute-positioned text for game entities but flexbox for layout.

**Testing the canvas renderer**: The rendering function that converts game state into draw calls must be testable *without* a real canvas. Structure it as:

```typescript
// Pure function: state → draw commands
function buildDrawCommands(screenState: GameScreenState): DrawCommand[] {
  return [
    { type: 'rect', x: 0, y: 0, w: 960, h: 576, fill: '#000' },
    ...screenState.aliens.map(a => ({
      type: 'sprite', x: a.x * CELL_W, y: a.y * CELL_H, sprite: a.type, frame: a.frame
    })),
    // ...
  ]
}

// Side-effectful: commands → canvas
function executeDrawCommands(ctx: CanvasRenderingContext2D, commands: DrawCommand[]) {
  for (const cmd of commands) { /* ctx.fillRect, ctx.drawImage, etc. */ }
}
```

This separation lets unit tests verify `buildDrawCommands` without a DOM. Only `executeDrawCommands` needs a real (or mock) canvas.

### 3.2 Responsive scaling

The game logic uses a fixed 120×36 coordinate grid. The web client must handle varying browser window sizes.

**Strategy**: Scale the canvas uniformly to fit the viewport while preserving aspect ratio (960:576 = 5:3). Use CSS `object-fit: contain` or compute the scale factor manually:

```typescript
const scale = Math.min(
  window.innerWidth / CANVAS_WIDTH,
  window.innerHeight / CANVAS_HEIGHT
)
canvas.style.width = `${CANVAS_WIDTH * scale}px`
canvas.style.height = `${CANVAS_HEIGHT * scale}px`
```

**Breakpoints**:
- Desktop (>960px wide): full-size canvas, DOM chrome alongside
- Tablet (600-960px): scaled canvas, chrome overlaid
- Mobile (<600px): too small for keyboard gameplay. Show a "play on desktop" message. Touch controls are Phase 3

### 3.3 Input handling

Browser `KeyboardEvent` provides `keydown`/`keyup` natively — no need for Kitty protocol detection or timeout-based key release simulation. The web `InputAdapter`:

```typescript
class WebInputAdapter implements InputAdapter {
  supportsKeyRelease = true  // Always true in browsers

  onKey(callback) {
    const down = (e: KeyboardEvent) => {
      e.preventDefault()  // Prevent arrow keys scrolling the page
      const key = mapWebKey(e.key)  // 'ArrowLeft' → 'left', ' ' → 'shoot', etc.
      if (key) callback(key, 'down')
    }
    const up = (e: KeyboardEvent) => {
      const key = mapWebKey(e.key)
      if (key) callback(key, 'up')
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }
}
```

**Browser-specific input quirk**: When the browser tab loses focus, `keyup` events don't fire for keys that were held. The `heldKeys` tracker must listen for `blur` events and release all held keys:

```typescript
window.addEventListener('blur', () => {
  heldKeys.releaseAll()
  send({ type: 'input', held: { left: false, right: false } })
})
```

### 3.4 Audio

Use the Web Audio API:

```typescript
class WebAudioAdapter implements AudioAdapter {
  private ctx: AudioContext | null = null
  private buffers = new Map<SoundEvent, AudioBuffer>()

  /** Must be called from a user gesture handler (click, keydown) */
  async initialize() {
    this.ctx = new AudioContext()
    await this.preloadAll()
  }

  private async preloadAll() {
    const entries = Object.entries(SOUND_REGISTRY)
    await Promise.all(entries.map(async ([name, url]) => {
      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      const audioBuffer = await this.ctx!.decodeAudioData(arrayBuffer)
      this.buffers.set(name as SoundEvent, audioBuffer)
    }))
  }

  play(sound: SoundEvent) {
    if (!this.ctx) return  // Not yet initialized — silent
    const buffer = this.buffers.get(sound)
    if (!buffer) return
    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    source.connect(this.ctx.destination)
    source.start()
  }

  setMuted(muted: boolean) {
    if (this.ctx) this.ctx.destination.channelCount = muted ? 0 : 2
  }
}
```

**User gesture requirement**: `AudioContext` must be created or resumed during a user interaction event handler. The launch screen's "Start" / "Join" button click is the natural place. If the user navigates directly to a room URL, prompt for a "Click to start" overlay first.

### 3.5 Loading and startup UX

Unlike the TUI (which launches instantly via `bun run vaders`), the web client has a loading phase:

1. **HTML shell loads** — show a minimal loading indicator (CSS-only, no JS required)
2. **JS bundle loads** — Vite code-splits; the main bundle should be <100KB gzipped
3. **React mounts** — show the launch screen immediately
4. **Audio preloads in background** — don't block the UI. Show a mute icon if audio isn't ready when gameplay starts
5. **WebSocket connects on room join** — show a "Connecting..." state (already handled by `useGameConnection`)

**Target**: Interactive launch screen within 1 second on a fast connection. Audio fully loaded within 3 seconds.

### 3.6 URL routing

Web users expect shareable URLs. Implement client-side routing:

| URL | Behavior |
|-----|----------|
| `/` | Launch screen (create room, matchmake, solo) |
| `/room/:code` | Join room directly. If room doesn't exist, show error with link back to `/` |
| `/solo` | Start solo game immediately |
| `/?matchmake=true` | Auto-matchmake on load |

Use the History API or a lightweight router (e.g., React Router). Room codes in URLs enable the "share a link to play" flow that web users expect.

### 3.7 Hosting, deployment, and CORS

**Recommendation**: Cloudflare Pages for static assets, same domain as the Worker.

**CORS configuration**: If Pages and the Worker are on different subdomains (e.g., `vaders.pages.dev` and `vaders-api.workers.dev`), the Worker must respond to WebSocket upgrade requests from the Pages origin. Add CORS headers to the Worker's HTTP responses:

```typescript
// worker/src/index.ts — add to HTTP handler
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://vaders.pages.dev',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}
```

WebSocket connections themselves don't enforce CORS after the handshake, but the initial HTTP upgrade request does check the `Origin` header. The Worker should validate `Origin` to prevent unauthorized connections.

**Preferred alternative**: Deploy both on the same domain using Cloudflare's [Pages Functions](https://developers.cloudflare.com/pages/functions/) or a custom domain that routes `/ws/*` to the Worker and everything else to Pages. Same-origin eliminates CORS entirely.

### 3.8 WebSocket connectivity

The browser's native `WebSocket` API is compatible with the existing protocol. The `useGameConnection` hook already uses the standard `WebSocket` constructor — it works in browsers without modification.

One difference: the TUI client constructs the WebSocket URL from CLI args and a local HTTP call to create/join rooms. The web client needs its own room management UI that calls the same Worker HTTP endpoints via `fetch`.

**Browser-specific concerns**:
- **Tab backgrounding**: Browsers throttle `setInterval` and `requestAnimationFrame` when a tab is not visible. The WebSocket stays connected, but the client stops processing state updates and sending input. When the tab regains focus, the client will snap to the current state (which is correct — the server is authoritative). Add a `document.visibilitychange` listener to pause/resume the render loop cleanly.
- **Corporate proxies**: Some corporate networks block WebSocket upgrade requests. No fallback (long-polling) is planned — the game requires low-latency bidirectional communication. Show a clear error message if the WebSocket fails to connect: "WebSocket connection failed. Your network may block WebSocket connections."
- **Content Security Policy**: If serving from Cloudflare Pages, ensure the CSP `connect-src` directive allows WebSocket connections to the Worker domain. If using same-origin deployment, this is automatic.

---

## 4. Constraints

### 4.1 Protocol and server constraints

- **No server changes required for basic support.** The Worker speaks standard WebSocket with JSON messages. A browser client connects identically to a TUI client.
- **No protocol changes needed.** `ClientMessage` and `ServerMessage` types are frontend-agnostic.
- **Mixed lobbies work automatically.** A TUI player and a web player in the same room will work because the server doesn't know or care about the client type.
- **Constraint**: If the web client needs features the TUI doesn't (e.g., spectator mode, chat), those require protocol additions and server changes. Keep the protocol shared — do not fork it.

### 4.2 Visual fidelity constraints

- **The TUI renders at 120×36 character resolution.** The web client is not bound by this — it can render at higher resolution, use true-color sprites, add smooth animations.
- **Constraint**: The game logic uses 120×36 coordinates. All entity positions are in this grid. The web client must scale from logical coordinates to pixel coordinates, but the coordinate space is fixed server-side.
- **Constraint**: Sprite hitboxes (`HITBOX` in `shared/types.ts`) are defined in grid cells. Web sprites can look different but must occupy the same logical space for consistent gameplay.
- **Opportunity**: The web client can use higher-fidelity sprites (actual pixel art images) while the TUI continues using braille characters. Both are valid renderings of the same game state.

### 4.3 Input model constraints

- **The server accepts two input modes**: held-key state (`{ type: 'input', held: { left, right } }`) and discrete movement (`{ type: 'move', direction }`). Both work for any client.
- **Browsers support held-key detection natively**, so the web client should use the `input` message type (like terminals with Kitty protocol). This gives smoother movement.
- **Constraint**: Touch/mobile input would require a new input abstraction (virtual d-pad). This is out of scope for the initial web frontend but the `InputAdapter` interface accommodates it.
- **Constraint**: Browser `keydown` events auto-repeat when held. The `WebInputAdapter` must ignore repeat events (`e.repeat === true`) to avoid flooding the server with duplicate input messages.

### 4.4 Audio constraints

- **Browser audio requires user gesture** before playback. The first user interaction (clicking "Start" or "Join") must initialize `AudioContext`.
- **Sound files are MP3/WAV**, which browsers support natively. No format conversion needed, but compressing to opus/webm reduces download size.
- **Constraint**: The TUI's terminal bell fallback is not applicable. Web has no equivalent "degraded audio" — it either works or is silent.

### 4.5 Build and deployment constraints

- **The TUI client uses Bun** for execution. The web client needs a browser bundler (Vite recommended — fast, supports React, good dev experience).
- **Shared code** (`shared/` and `client-core/`) must be consumable by both Bun (TUI) and Vite (web). Use Bun workspaces with TypeScript path aliases (see section 2.6).
- **Constraint**: `client-core/` must not import any Node/Bun-specific APIs (`process`, `child_process`, `fs`, `bun:*`, `node:*`). It must be pure browser-compatible TypeScript.
- **Constraint**: The `shared/` package already meets this requirement — it's pure types and functions with no runtime dependencies.
- **Constraint**: Tree-shaking. `shared/types.ts` exports game logic functions (collision detection, formation creation, seeded RNG). Ensure the web client's build only includes what it actually imports. Vite's tree-shaking handles this if modules use named exports (which they do).

### 4.6 Testing constraints

- **The refactoring must not break existing TUI tests.** All 46 existing test files must continue passing after extraction to `client-core/`.
- **Constraint**: Tests that currently import from `client/src/animation/` or `client/src/hooks/useGameConnection` will need import path updates when those modules move to `client-core/`.
- **Constraint**: Property-based tests for animation functions transfer directly — they test pure functions.
- **Constraint**: Component tests that mock OpenTUI elements stay in `client/` — they're TUI-specific.

### 4.7 Scope constraints

- **Phase 1 should be the refactoring only** — extract `client-core/`, update imports, verify all tests pass. No new features.
- **Phase 2 is the web frontend** — build it against the `client-core/` interfaces.
- **Do not attempt both simultaneously.** Refactoring the TUI client while building a new web client creates two moving targets and makes regressions hard to attribute.

---

## 5. Testing Strategy

### 5.1 Philosophy

The testing strategy serves three goals:

1. **Refactoring safety**: Prove the extraction to `client-core/` changes no behavior
2. **Feature parity**: Prove the web frontend handles all game states the TUI handles
3. **Ongoing confidence**: Prevent regressions as both frontends evolve independently

### 5.2 Development methodology: Red-Green TDD

All new code — adapters, renderers, screens, hooks — should be developed using **red-green-refactor TDD**:

1. **Red**: Write a failing test that describes the desired behavior
2. **Green**: Write the minimum code to make the test pass
3. **Refactor**: Clean up without changing behavior, re-run tests to verify

This applies at every level of the test taxonomy. Concretely:

**Phase 1 (refactoring)**: TDD is not the primary methodology — the tests already exist. Instead, use the tests as a **refactoring safety harness**: run them after every file move, and treat any failure as a stop signal. The development loop is: move → test → fix imports → test → next.

**Phase 2 (web frontend)**: TDD is the primary methodology. For each screen and adapter:
1. Write the contract test (red — "renders something for status `playing`")
2. Write the adapter unit test (red — "WebInputAdapter emits `left` on ArrowLeft keydown")
3. Implement the minimum code to pass (green)
4. Refactor (clean up, extract helpers, remove duplication)

**Phase 2 canvas renderer**: TDD the `buildDrawCommands` function:
1. Red: `buildDrawCommands(stateWithOneAlien)` includes a sprite draw command at the alien's position
2. Green: implement the mapping
3. Refactor: extract entity-type-specific renderers

This means the rendering logic is fully tested *before* it ever hits a real canvas.

### 5.3 Test taxonomy

We use five levels of testing, each with a specific purpose:

#### Level 1: Unit tests with property-based testing (pure functions)

**What**: Individual functions in isolation — animation math, input normalization, state computation, audio trigger mapping, draw command generation.

**Where they live**: Next to the code they test, in `client-core/`, `shared/`, and each frontend.

**Quantity**: High coverage. Every exported function in `client-core/` should have unit tests. Target: every branch and edge case.

**Quality bar**: Tests must be deterministic, fast (<1ms each), and test behavior not implementation. No mocks for pure functions — pass inputs, assert outputs.

**Property-based testing (PBT) with fast-check**: Mandatory for all pure math functions in `client-core/`. PBT catches edge cases that example-based tests miss (NaN inputs, extreme values, boundary conditions). The existing codebase already uses PBT extensively for easing, interpolation, starfield, and color conversion — extend this to all new pure functions.

**PBT properties to verify**:
- **Boundary conditions**: `f(0)`, `f(1)`, empty inputs, maximum values
- **Monotonicity**: easing functions never decrease on [0,1]
- **Idempotency**: `lerp(a, a, t) === a` for any `t`
- **Bounds**: output always within expected range
- **Symmetry**: where applicable (e.g., `interpolateGradient` midpoint)
- **Round-trip**: `mapWebKey(key)` → `VadersKey` → consistent for all valid keys
- **Invariant preservation**: `buildDrawCommands(state)` always includes exactly one command per visible entity

**New PBT for web-specific code**:
- `buildDrawCommands`: for any valid `GameScreenState`, output has no overlapping opaque commands for the same z-layer
- `WebInputAdapter.mapWebKey`: for all `KeyboardEvent.key` values that have a mapping, the output is a valid `VadersKey`
- Canvas scale factor: for any positive window dimensions, the scaled canvas fits within the viewport

**Examples of example-based unit tests**:
- `interpolation.ts`: `lerp(0, 10, 0.5) === 5`
- `easing.ts`: `easeInOut(0) === 0`, `easeInOut(1) === 1`
- `heldKeys.ts`: pressing left then right → `{ left: true, right: true }`; releasing left → `{ left: false, right: true }`
- Audio trigger mapping: state with increased score → emits `'alien_killed'` sound event
- `buildDrawCommands(stateWithAlien)` → includes sprite command at alien's grid position

#### Level 2: Integration tests (connected subsystems)

**What**: Multiple modules working together — connection hook processing real WebSocket messages, render state computation combining interpolation + prediction + server state, adapter + core hook wiring.

**Where they live**: In `client-core/` test files (for core integrations) and in each frontend (for adapter integrations).

**Quantity**: Moderate. Cover the critical paths: connect → receive state → compute render state → handle disconnect. Cover error paths: invalid messages, reconnection, timeout.

**Quality bar**: May use mocks for WebSocket, but test real message serialization/deserialization. Tests should verify the integration contract, not just that mock was called.

**Examples**:
- `useGameConnection` receives a `sync` message → `getRenderState()` returns interpolated positions
- Connection drops → reconnection fires → state recovers after new `sync`
- Server sends `error` message → hook surfaces error to caller
- 100 rapid `sync` messages → no memory leaks, latest state wins
- `WebAudioAdapter.play()` after `initialize()` → no errors; before `initialize()` → silent (no crash)
- `WebInputAdapter` + `heldKeys` tracker → full integration: keydown → held state → keyup → released state
- Tab blur → all held keys released → server notified

**Key integration to test**: The render state pipeline.
```
ServerMessage (JSON) → parse → store → interpolate → predict → RenderState
```
This pipeline is the critical path for both frontends. If it's correct in `client-core/`, both UIs render correctly.

#### Level 3: Contract tests (frontend exhaustiveness)

**What**: Verify that both frontends handle every game status, every entity type, every event type, and every error code. These are exhaustiveness checks — they verify behavioral completeness, not visual correctness.

**Why "contract tests" (not "consumer-driven contracts")**: These are not Pact-style CDC tests between services. They are *exhaustiveness checks* — ensuring that every variant of every discriminated union in `shared/` is handled by each frontend. The term "contract" here means "the contract between `shared/` type definitions and frontend implementations."

**How**: Each frontend has a test file that imports canonical lists from `shared/` and verifies coverage:

```typescript
// Example: verify all GameStatus values are handled
import { ALL_GAME_STATUSES } from 'shared/state-defaults'

test('renders every game status', () => {
  for (const status of ALL_GAME_STATUSES) {
    const state = createStateWithStatus(status)
    const result = renderScreen(state)  // frontend-specific
    expect(result).not.toBeNull()       // must produce output
  }
})
```

The TUI client already has a version of this pattern in `App.test.ts` (checks exhaustive switch over `GameStatus`). Formalize it and require it of both frontends.

**Quantity**: One contract test file per frontend. Coverage is enumeration-complete (every variant of every discriminated union).

**Quality bar**: These tests catch "I forgot to handle the new `wipe_exit` status in the web UI" errors. They must break the build if a new status/event/entity type is added to `shared/` but not handled by a frontend.

#### Level 4: End-to-end tests (full stack)

**What**: Tests that exercise the full path: browser → WebSocket → Worker → game logic → state sync → browser rendering. These verify that the pieces actually work together in a real environment, not just in isolation.

**Where they live**: `e2e/` directory at the repo root.

**Implementation**: Playwright tests against a locally-running Worker (via `wrangler dev`) and the web client (via `vite dev`):

```typescript
test('solo game: shoot an alien', async ({ page }) => {
  await page.goto('http://localhost:5173/solo')
  await page.waitForSelector('[data-testid="game-canvas"]')

  // Fire a shot
  await page.keyboard.press('Space')

  // Wait for score to increase (alien hit)
  await expect(page.locator('[data-testid="score"]')).not.toHaveText('0', {
    timeout: 5000
  })
})

test('multiplayer: two players join same room', async ({ browser }) => {
  const page1 = await browser.newPage()
  const page2 = await browser.newPage()

  await page1.goto('http://localhost:5173')
  await page1.click('[data-testid="create-room"]')
  const roomCode = await page1.locator('[data-testid="room-code"]').textContent()

  await page2.goto(`http://localhost:5173/room/${roomCode}`)
  await expect(page1.locator('[data-testid="player-count"]')).toHaveText('2')
})
```

**Quantity**: Low — 5-8 scenarios covering critical paths:
1. Solo game starts and score increases
2. Two players join the same room
3. Game over screen shows after all lives lost
4. Reconnection after brief disconnect
5. Cross-frontend play (TUI + web in same room — manual test, documented procedure)

**Quality bar**: E2E tests are slow and flaky by nature. Accept this tradeoff: run them in CI on merge to main (not every PR), with retry logic. Don't let E2E flakes block development.

**What about TUI E2E?**: True E2E testing for the TUI is harder (requires terminal emulation). The TUI's existing integration tests + manual play-through serve this role. No additional TUI E2E automation is planned.

#### Level 5: Visual snapshot tests (rendering correctness)

**What**: Verify that the rendered output for known game states matches expected snapshots. Catch unintended visual regressions.

**For TUI**: Capture the terminal output (character grid) for a given state and compare to a stored snapshot. OpenTUI's test utilities or a custom renderer that produces a string grid.

**For Web**: Playwright screenshots of the canvas at known states. Visual regression testing with pixel-diff tool (e.g., Playwright's built-in `toHaveScreenshot`).

**Quantity**: Low — a handful of critical scenarios:
- Empty game (waiting screen)
- Full game in progress (aliens, bullets, players, barriers)
- Game over screen with scores
- Wave transition animation frame
- Lobby with 4 players ready

**Quality bar**: Snapshots are brittle by nature. Keep the count low, update intentionally, and treat unexpected diffs as signals to investigate, not auto-approve.

**Alternative to pixel snapshots**: Structural snapshots. Instead of comparing pixels, compare the draw command list — what entities are rendered, at what positions, with what properties. Less brittle, still catches missing elements. Can be used alongside pixel snapshots.

### 5.4 What NOT to test

- **Don't test the server from the frontend tests.** The server has its own test suite (5400+ lines of reducer tests). Frontend tests assume the server is correct and test how the frontend reacts to server output.
- **Don't test OpenTUI internals.** If `<text color="cyan">` renders cyan, that's OpenTUI's problem. Test that we pass `"cyan"` to it.
- **Don't test browser APIs.** If `canvas.fillRect()` draws a rectangle, that's the browser's problem. Test that we call it with the right coordinates.
- **Don't duplicate shared/ tests.** Protocol validation, type helpers, and collision detection are already tested in `shared/`. Frontend tests should test frontend logic.
- **Don't write PBT for trivial mappings.** A lookup table from `KeyboardEvent.key` to `VadersKey` doesn't benefit from property-based testing — example-based tests covering each key are clearer.

### 5.5 Test infrastructure requirements

| Need | Solution |
|------|----------|
| Mock WebSocket server | In-process mock that sends/receives `ServerMessage`/`ClientMessage`. Already partially exists in `useGameConnection.test.ts` |
| Game state factories | Already exist in `worker/src/test-utils.ts`. Extract to `shared/test-utils.ts` so both frontends can create test states |
| Property-based testing | fast-check. Already used for animation and color functions. Extend to all new pure functions |
| Browser test environment | Vitest with jsdom for unit/integration tests in `web/`. Playwright for E2E and visual snapshots |
| Visual regression | Playwright's `toHaveScreenshot` with configurable diff thresholds |
| Contract test runner | Standard test runner (bun test / vitest). Contract tests are fast — just enumeration checks |
| Local dev stack for E2E | `wrangler dev` for Worker + `vite dev` for web client. Script to start both |
| Cross-browser testing | Playwright's multi-browser support (Chromium, Firefox, WebKit). Run in CI weekly, not every PR |

### 5.6 Test quantity guidance

| Layer | Approximate count | Run time target | When to run |
|-------|-------------------|-----------------|-------------|
| Unit tests + PBT (client-core) | 200-300 assertions | <2s total | Every commit |
| Integration tests (connection, adapters) | 50-80 assertions | <5s total | Every commit |
| Contract tests (per frontend) | 20-30 assertions | <1s total | Every commit |
| E2E tests (web) | 5-8 scenarios | <60s total | Merge to main |
| Visual snapshots (per frontend) | 5-10 scenarios | <30s TUI, <60s web | Merge to main |
| Cross-browser (web) | Same as unit + integration | <30s total | Weekly in CI |

Total fast path (unit + PBT + integration + contract): ~300-400 assertions in under 10 seconds. This runs on every commit and blocks the build.

Slow path (E2E + visual + cross-browser): runs on merge to main or on a schedule. Does not block individual PRs.

### 5.7 Testing the refactoring itself (Phase 1)

The refactoring has a specific testing protocol:

1. **Before any code moves**: Run all tests, record results. `bun run test` must pass.
2. **After each module extraction**: Run all tests. Import paths change, but behavior must not.
3. **After all extractions**: Run full test suite. Zero test failures. Zero new test skips.
4. **Verify no accidental dependencies**: `client-core/` must build without `@anthropic/opentui-*` in its dependency graph. Add a CI check: `grep -r "opentui" client-core/src/ && exit 1`.
5. **Verify no platform imports**: `grep -rE "from ['\"]bun:|from ['\"]node:" client-core/src/ && exit 1`.
6. **Verify TUI still works**: Manual smoke test — launch the game, play through one wave, verify audio/visuals/input all work.

### 5.8 Testing the web frontend (Phase 2) — TDD workflow

Development follows red-green-refactor at each stage:

1. **Contract tests first** (RED): Before writing any rendering code, write the contract test file. Import `ALL_GAME_STATUSES`, all entity types, all event types, all error codes. Every assertion fails. This is your checklist.

2. **Adapter unit tests** (RED → GREEN → REFACTOR):
   - Write tests for `WebInputAdapter`: keydown/keyup mapping, repeat filtering, blur handling
   - Write tests for `WebAudioAdapter`: initialize, play, mute, play-before-initialize
   - Write tests for `WebStorageAdapter`: get/set round-trip, missing keys
   - Implement each adapter to pass its tests

3. **Renderer tests** (RED → GREEN → REFACTOR):
   - Write tests for `buildDrawCommands`: one alien → one sprite command, empty state → background only, all entity types → all draw command types
   - Write PBT for `buildDrawCommands`: for any valid state, output count equals entity count + background
   - Implement the renderer to pass

4. **Screen tests** (RED → GREEN → REFACTOR):
   - For each screen, write tests for the behavioral hook (`useGameScreenState`, `useLobbyState`, etc.)
   - Implement the hooks to pass
   - Wire up React components

5. **Integration tests**: Wire up `useGameConnection` + adapters + renderer. Test the full client-side flow with a mock WebSocket.

6. **E2E tests**: Start local dev stack, run Playwright scenarios.

7. **Visual snapshots last**: Once rendering is stable, capture baseline screenshots.

### 5.9 Continuous integration

```yaml
# Updated CI pipeline
jobs:
  test-shared:
    run: bun test --cwd shared
  test-core:
    run: bun test --cwd client-core
  test-tui:
    run: bun test --cwd client
  test-web-unit:
    run: cd web && bun run test          # vitest for browser compat
  test-worker:
    run: cd worker && bun run test
  contract-check:
    run: bun run test:contracts           # contract tests for all frontends
  no-opentui-in-core:
    run: "! grep -r 'opentui' client-core/src/"
  no-platform-imports-in-core:
    run: "! grep -rE 'from .bun:|from .node:' client-core/src/"

  # Slow path — merge to main only
  e2e-web:
    needs: [test-shared, test-core, test-web-unit, test-worker]
    run: bun run e2e:web                  # Playwright against local dev stack
  visual-snapshots:
    needs: [test-shared, test-core, test-web-unit]
    run: bun run test:snapshots

  # Weekly schedule
  cross-browser:
    schedule: weekly
    run: bun run test:cross-browser       # Playwright with Chromium, Firefox, WebKit
```

---

## 6. Migration Plan

### Phase 1: Extract client-core (refactoring only)

**Goal**: All platform-agnostic code lives in `client-core/`. TUI client is thinner but functionally identical. All tests pass.

Steps:
1. Create `client-core/` directory and `package.json` with Bun workspace setup
2. Move `animation/` modules — `easing.ts`, `interpolation.ts`, `entrance.ts`, `starfield.ts`, `confetti.ts` — these have no external deps. Update imports in `client/`. Run tests.
3. Move `gradient.ts` to `client-core/src/animation/`. Update `waveBorder.ts` import. Run tests.
4. Move `waveBorder.ts` and `dissolve.ts` together (they depend on each other). Run tests.
5. Move `effects.ts` (re-export + `getUFOColor`). Run tests.
6. Move `useGameConnection` hook. Run tests.
7. Extract `InputAdapter` interface and `heldKeys` logic — TUI implements `TuiInputAdapter`. Run tests.
8. Extract audio trigger logic from `useGameAudio` — define `AudioAdapter` interface. Run tests.
9. Extract sprite bitmap data (`PIXEL_ART`, `SPRITE_SIZE`, colors) — keep braille conversion in `client/`. Run tests.
10. Refactor `useInterpolation` to accept `FrameScheduler` adapter. TUI adapter wraps OpenTUI's `requestAnimationFrame`. Run tests.
11. Split `useDissolveEffects`: event detection → core, visual parameters → `VisualConfig` adapter. Run tests.
12. Move `featureFlags.ts` to `client-core/`. Update `useStarfield` import. Run tests.
13. Extract screen behavioral hooks. Run tests.
14. Add CI checks for no OpenTUI and no platform imports in `client-core/`. Run full suite.
15. Manual smoke test: play through two waves with audio on.

**Exit criteria**: `bun run test` passes. Manual play-through works. No behavior changes. CI checks pass.

### Phase 2: Build web frontend

**Goal**: A working web client with feature parity, deployed to Cloudflare Pages.

Steps (TDD — see section 5.8 for detailed workflow):
1. Scaffold web project with Vite + React
2. Write contract tests (all red)
3. TDD `WebInputAdapter`, `WebAudioAdapter`, `WebStorageAdapter`, `WebFrameScheduler`
4. TDD `buildDrawCommands` canvas renderer
5. TDD DOM-based UI screens (launch, lobby, game over)
6. Wire up `useGameConnection` with browser WebSocket
7. Implement URL routing
8. Implement responsive scaling
9. Pass all contract tests (all green)
10. Add E2E tests against local dev stack
11. Add visual snapshot baselines
12. Deploy to Cloudflare Pages
13. Test cross-frontend play (TUI + web players in same room)

**Exit criteria**: All contract tests pass. E2E tests pass. Visual snapshots captured. Cross-frontend multiplayer verified manually.

### Phase 3: Polish and diverge (optional)

Once both frontends share `client-core/` and satisfy the contract tests, they can evolve independently:
- Web can add touch controls, spectator mode, higher-res sprites
- TUI can add sixel graphics support, mouse input
- New features requiring protocol changes go through `shared/protocol.ts` and both frontends update their contract tests

---

## 7. Experience Quality

### Will the web experience be as good as the TUI?

The TUI experience has a specific charm: retro braille-art sprites, terminal color cycling, the surprise of a real game running in your terminal. The web frontend will not replicate that charm — it shouldn't try. Instead, it should be good *in a different way*:

**Where web will be better than TUI**:
- **Accessibility**: No terminal setup, no Bun installation, no CLI fluency required. Click a link, play a game. This is the single biggest improvement — it removes the entire onboarding funnel.
- **Shareability**: Room codes as URLs. "Join my game" becomes a link in Slack, not "open your terminal and run `bun run vaders -- --room ABC123`."
- **Visual fidelity**: True-color sprites, anti-aliased canvas rendering, smooth 60fps animations independent of the 30Hz state sync. The pixel art can be much richer than 7-wide braille characters.
- **Input reliability**: Browser keyboard events are standardized and well-tested. No Kitty protocol detection, no timeout-based key release fallback, no terminal compatibility matrix.
- **Audio reliability**: Web Audio API is mature and consistent. No `afplay` vs `aplay` platform detection, no missing sound file fallbacks.

**Where web will be worse than TUI**:
- **Latency feel**: A terminal renders instantly. A browser has layout, paint, and compositor overhead. For a 30Hz game this is negligible, but the TUI will always *feel* more immediate.
- **Character**: The braille sprites, the terminal aesthetic, the feeling of "I can't believe this runs in a terminal" — that's the TUI's identity. The web version is just another browser game. It needs its own visual identity to feel special, not a pale imitation of the TUI.
- **Startup time**: `bun run vaders` takes <1 second. The web client needs DNS, TLS, HTML, JS bundle, React hydration. Target is under 2 seconds, but it won't match the TUI.

### What makes the total experience good?

The goal is not two identical experiences — it's **one game, two good ways to play it, together**. The multiplayer cross-play is the key feature: a developer in their terminal and a friend in their browser, in the same room, shooting the same aliens.

**Quality signals to target**:
1. A TUI player and a web player in the same room have identical gameplay — same hitboxes, same scoring, same difficulty scaling, same state. This is guaranteed by the server-authoritative architecture.
2. Either player can create a room and share the code. The web player shares a URL; the TUI player shares a room code. Both work.
3. Neither frontend feels like a second-class citizen. The TUI has its terminal charm; the web has visual polish and accessibility. Both are complete.
4. Adding a feature to the game (new alien type, new power-up) means updating `shared/`, `worker/`, and `client-core/`. The contract tests force both frontends to implement the new feature before CI passes.

**Quality signals to avoid**:
- The web frontend looking like a "terminal emulator in a browser" — green text on black, monospace font. That's the worst of both worlds: no terminal charm, no web polish.
- The web frontend having fewer features because extracting shared code was too hard. This is why Phase 1 (refactoring) is separate from Phase 2 (building).
- Input feeling different between platforms. Movement speed and responsiveness are server-determined (1 cell/tick). Both clients should feel equally responsive.

---

## Appendix A: Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Refactoring introduces subtle behavior change | TUI breaks in ways tests don't catch | Run tests after every file move. Property-based tests catch edge cases. Manual play-through after Phase 1 |
| `requestAnimationFrame` not available in Bun | `useInterpolation` breaks after extraction | Introduce `FrameScheduler` adapter. TUI wraps OpenTUI's polyfill; browser uses native. Test both |
| React version conflict between OpenTUI and React DOM | Peer dependency resolution failure | Declare React as peer dependency with compatible range. Verify in CI. Pin compatible versions in each frontend |
| Workspace tooling complexity | Bun, Vite, and TypeScript disagree on module resolution | Prototype the workspace setup as the first step of Phase 1. Validate imports from all consumers before moving code |
| Canvas rendering performance | Janky gameplay on low-end devices | Profile early. 120×36 grid is small — canvas should handle it easily. Budget: <2ms per frame |
| Sound files too large for web | Slow initial load | Compress to opus/webm. Lazy-load non-critical sounds. Total current size is small (~1MB) |
| Two frontends drift in behavior | Players have different gameplay experiences | Contract tests enforce parity. Behavioral logic lives in `client-core/`, not in frontends |
| Refactoring scope creep | Phase 1 takes too long, blocks Phase 2 | Move modules one at a time, testing after each. Don't redesign while extracting |
| Browser tab backgrounding | Player's ship stops responding when tab is hidden | Listen for `visibilitychange`, pause input, accept state snap on return |
| WebSocket blocked by corporate proxy | Web client unusable on some networks | Show clear error message. No fallback — game requires WebSocket. Document in FAQ |
| CORS misconfiguration | WebSocket upgrade fails from Pages to Worker | Prefer same-origin deployment. If cross-origin, test CORS headers in E2E |
| `useDissolveEffects` extraction harder than expected | TUI-coupled imports block extraction | Split into event detection (core) + visual config (adapter). Accept that this hook requires the most surgery |
| Bundle size bloat | Web client ships server-side code from shared/ | Verify tree-shaking works. Check bundle size in CI. Vite's default tree-shaking is good |
| No mobile support | Users try to play on phones, get frustrated | Show "play on desktop" message for viewports under 600px. Phase 3 adds touch controls |

## Appendix B: Glossary

| Term | Meaning in this spec |
|------|---------------------|
| `client-core/` | Platform-agnostic client library shared by TUI and web frontends |
| Contract test | Exhaustiveness check verifying a frontend handles all variants of shared types |
| PBT | Property-based testing via fast-check |
| Adapter | Platform-specific implementation of an interface defined in `client-core/` |
| Grid coordinates | The 120×36 logical coordinate space used by game logic |
| Pixel coordinates | The rendered canvas coordinates (e.g., 960×576 at 8×16px per cell) |
| Red-green-refactor | TDD cycle: write failing test → make it pass → clean up |
| Draw command | Intermediate representation between game state and canvas rendering |

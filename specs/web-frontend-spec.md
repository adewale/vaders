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
| WebSocket connection | `client/src/hooks/useGameConnection.ts` | Minimal (React hook, but no OpenTUI imports) |
| Animation math | `client/src/animation/` | None (pure functions) |
| Input normalization | `client/src/input.ts` | Light (maps OpenTUI key names) |
| Rendering | `client/src/components/` | Heavy (OpenTUI `<box>`/`<text>` elements) |
| Sprites | `client/src/sprites.ts` | Heavy (braille character encoding) |
| Audio | `client/src/audio/` | Heavy (child process `afplay`/`aplay`) |
| Terminal compat | `client/src/terminal/` | Total (terminal-only concern) |
| Entry point | `client/src/index.tsx` | Total (CLI/OpenTUI bootstrap) |

### Coupling inventory

**Zero coupling** (use as-is from web frontend):
- All of `shared/` — types, protocol, state defaults, helpers like `applyPlayerInput`, `getAliens`, `LAYOUT`, `PLAYER_COLORS`
- `useGameConnection` hook — pure WebSocket + state management, no rendering
- Animation pure functions — `easing.ts`, `interpolation.ts`, `entrance.ts`, `dissolve.ts`, `starfield.ts`, `confetti.ts`

**Light coupling** (needs adapter, not rewrite):
- `input.ts` — key normalization maps OpenTUI key names to `VadersKey`. Web version needs the same concept but mapping `KeyboardEvent.key` instead
- `useGameAudio` hook — trigger logic (which state change fires which sound) is reusable; playback mechanism (child process vs Web Audio API) is not

**Heavy coupling** (must rewrite for web):
- All `components/*.tsx` — OpenTUI JSX elements (`<box>`, `<text>`, `position="absolute"`)
- `sprites.ts` — 14×8 pixel bitmaps encoded as braille Unicode characters for terminal display
- `AudioManager.ts`, `MusicManager.ts` — spawn `afplay`/`aplay` child processes
- `index.tsx` — CLI arg parsing, OpenTUI `createCliRenderer`
- `terminal/compatibility.ts` — Kitty protocol detection, color depth probing

---

## 2. Refactoring for Multi-Frontend Support

### 2.1 Extract a platform-agnostic client core

Create a new package `client-core/` (or directory within `client/`) containing everything both frontends need:

```
client-core/
  src/
    connection/
      useGameConnection.ts    ← moved from client/src/hooks/
      reconnection.ts         ← extracted reconnection logic
    animation/
      easing.ts               ← moved from client/src/animation/
      interpolation.ts
      entrance.ts
      dissolve.ts
      starfield.ts
      confetti.ts
    input/
      types.ts                ← VadersKey, InputState (platform-agnostic)
      heldKeys.ts             ← createHeldKeysTracker (platform-agnostic)
    audio/
      triggers.ts             ← extracted from useGameAudio (state→sound mapping)
      types.ts                ← SoundEvent enum, AudioAdapter interface
    state/
      renderState.ts          ← getRenderState logic (prediction + interpolation)
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
```

### 2.3 Keep sprites as data, render per-platform

The current `sprites.ts` stores 14×8 pixel bitmaps in a `number[][]` format, then converts to braille. This is good — the bitmap data is the canonical source. Refactor:

1. **Keep the bitmap definitions** in `client-core/` as the single source of truth
2. **TUI renderer**: converts bitmaps → braille characters (current behavior)
3. **Web renderer**: converts bitmaps → canvas pixels or SVG paths, or uses image assets generated from the same bitmaps

### 2.4 Refactoring the hooks

| Hook | Strategy |
|------|----------|
| `useGameConnection` | Move to `client-core/`. Already platform-agnostic — uses standard `WebSocket` API available in both Bun and browsers |
| `useGameAudio` | Split into trigger logic (core) and playback (adapter). Trigger logic detects state changes and emits `SoundEvent`s. Each platform provides an `AudioAdapter` |
| `useInterpolation` | Move to core. Pure math over `GameState` |
| `useEntranceAnimation` | Move to core. Produces `{x, y}` positions over time — rendering is caller's concern |
| `useDissolveEffects` | Move to core. Produces cell positions + characters — rendering is caller's concern |
| `useStarfield` | Move to core. Produces star positions + colors — rendering is caller's concern |
| `useTerminalSize` | Keep in TUI client. Web equivalent is a `useWindowSize` or `useCanvasSize` hook |

### 2.5 Refactoring the screens

The five screens (`LaunchScreen`, `LobbyScreen`, `GameScreen`, `GameOverScreen`, `WaveAnnounce`) contain two kinds of logic:

1. **Behavioral logic**: what to show based on game state, menu navigation, countdown display, score formatting
2. **Rendering logic**: OpenTUI `<box>`/`<text>` layout

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

### 2.6 Directory structure after refactoring

```
vaders/
  shared/                    # Types, protocol, constants (unchanged)
  client-core/               # Platform-agnostic client logic (NEW)
    src/
      connection/
      animation/
      input/
      audio/
      state/
      screens/
      adapters.ts
  client/                    # TUI frontend (refactored, thinner)
    src/
      adapters/              # TUI implementations of InputAdapter, AudioAdapter, etc.
      components/            # OpenTUI rendering (unchanged internally)
      terminal/              # Terminal compat (unchanged)
      sprites-tui.ts         # Braille conversion (moved from sprites.ts)
      index.tsx              # CLI entry point (unchanged)
  web/                       # Web frontend (NEW)
    src/
      adapters/              # Browser implementations
      components/            # React DOM or Canvas components
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
- 60fps rendering independent of 30Hz state sync
- Better performance for particle effects and animations

**Option B: React DOM with CSS Grid**
- 120×36 grid of `<span>` elements
- Simpler to build, harder to make performant
- DOM updates at 30Hz with 4000+ elements may stutter
- Effects are harder (dissolve would need per-cell style updates)

**Recommendation**: Canvas for the game area, DOM for UI chrome (menus, HUD, lobby). This mirrors how the TUI client uses absolute-positioned text for game entities but flexbox for layout.

### 3.2 Input handling

Browser `KeyboardEvent` provides `keydown`/`keyup` natively — no need for Kitty protocol detection or timeout-based key release simulation. The web `InputAdapter`:

```typescript
class WebInputAdapter implements InputAdapter {
  supportsKeyRelease = true  // Always true in browsers

  onKey(callback) {
    const down = (e: KeyboardEvent) => {
      const key = mapWebKey(e.key)  // 'ArrowLeft' → 'left', ' ' → 'shoot', etc.
      if (key) callback(key, 'down')
    }
    const up = (e: KeyboardEvent) => {
      const key = mapWebKey(e.key)
      if (key) callback(key, 'up')
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { /* cleanup */ }
  }
}
```

### 3.3 Audio

Use the Web Audio API or HTML `<audio>` elements:

```typescript
class WebAudioAdapter implements AudioAdapter {
  private ctx = new AudioContext()
  private buffers = new Map<SoundEvent, AudioBuffer>()

  async preload() { /* fetch and decode all sound files */ }

  play(sound: SoundEvent) {
    const source = this.ctx.createBufferSource()
    source.buffer = this.buffers.get(sound)
    source.connect(this.ctx.destination)
    source.start()
  }
}
```

Note: browsers require a user gesture before `AudioContext` can play. The launch screen's "Start" button provides this naturally.

### 3.4 Hosting and deployment

The web client is static files (HTML + JS + assets). Options:
- **Cloudflare Pages**: same platform as the Worker, automatic CDN, zero-config CORS
- **Same Worker**: serve static assets from the Worker itself (adds complexity)
- **Separate origin**: requires CORS headers on the Worker's WebSocket endpoint

**Recommendation**: Cloudflare Pages, with the Worker WebSocket URL configured at build time.

### 3.5 WebSocket connectivity

The browser's native `WebSocket` API is compatible with the existing protocol. The `useGameConnection` hook already uses the standard `WebSocket` constructor — it works in browsers without modification, because Bun's `WebSocket` matches the browser API.

One difference: the TUI client constructs the WebSocket URL from CLI args and a local HTTP call to create/join rooms. The web client needs its own room management UI (create, join, matchmake) that calls the same Worker HTTP endpoints via `fetch`.

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

### 4.4 Audio constraints

- **Browser audio requires user gesture** before playback. The first user interaction (clicking "Start" or "Join") must initialize `AudioContext`.
- **Sound files are MP3/WAV**, which browsers support natively. No format conversion needed.
- **Constraint**: The TUI's terminal bell fallback is not applicable. Web has no equivalent "degraded audio" — it either works or is silent.

### 4.5 Build and deployment constraints

- **The TUI client uses Bun** for execution. The web client needs a browser bundler (Vite recommended — fast, supports React, good dev experience).
- **Shared code** (`shared/` and `client-core/`) must be consumable by both Bun (TUI) and Vite (web). TypeScript path aliases or workspace package references handle this.
- **Constraint**: `client-core/` must not import any Node/Bun-specific APIs (`process`, `child_process`, `fs`). It must be pure browser-compatible TypeScript.
- **Constraint**: The `shared/` package already meets this requirement — it's pure types and functions with no runtime dependencies.

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

### 5.2 Test taxonomy

We use four levels of testing, each with a specific purpose:

#### Level 1: Unit tests (pure functions)

**What**: Individual functions in isolation — animation math, input normalization, state computation, audio trigger mapping.

**Where they live**: Next to the code they test, in `client-core/`, `shared/`, and each frontend.

**Quantity**: High coverage. Every exported function in `client-core/` should have unit tests. Target: every branch and edge case.

**Quality bar**: Tests must be deterministic, fast (<1ms each), and test behavior not implementation. No mocks for pure functions — pass inputs, assert outputs.

**Examples**:
- `interpolation.ts`: `lerp(0, 10, 0.5) === 5`
- `easing.ts`: `easeInOut(0) === 0`, `easeInOut(1) === 1`, monotonically increasing
- `heldKeys.ts`: pressing left then right → `{ left: true, right: true }`; releasing left → `{ left: false, right: true }`
- Audio trigger mapping: state with increased score → emits `'alien_killed'` sound event

**Property-based tests**: Continue using fast-check for animation and math functions. Properties to verify:
- Boundary conditions (f(0), f(1))
- Monotonicity (easing functions never decrease)
- Idempotency (applying interpolation with t=0 returns start state)
- Bounds (output always within expected range)
- Symmetry where applicable

#### Level 2: Integration tests (connected subsystems)

**What**: Multiple modules working together — connection hook processing real WebSocket messages, render state computation combining interpolation + prediction + server state.

**Where they live**: In `client-core/` test files, using mock WebSocket servers.

**Quantity**: Moderate. Cover the critical paths: connect → receive state → compute render state → handle disconnect. Cover error paths: invalid messages, reconnection, timeout.

**Quality bar**: May use mocks for WebSocket, but test real message serialization/deserialization. Tests should verify the integration contract, not just that mock was called.

**Examples**:
- `useGameConnection` receives a `sync` message → `getRenderState()` returns interpolated positions
- Connection drops → reconnection fires → state recovers after new `sync`
- Server sends `error` message → hook surfaces error to caller
- 100 rapid `sync` messages → no memory leaks, latest state wins

**Key integration to test**: The render state pipeline.
```
ServerMessage (JSON) → parse → store → interpolate → predict → RenderState
```
This pipeline is the critical path for both frontends. If it's correct in `client-core/`, both UIs render correctly.

#### Level 3: Contract tests (frontend feature parity)

**What**: Verify that both frontends handle every game status, every entity type, every event type, and every error code. These are not visual tests — they verify behavioral completeness.

**How**: A shared test suite that each frontend must satisfy. Define it as an interface:

```typescript
// client-core/src/tests/frontend-contract.ts

/**
 * Every frontend must demonstrate handling for:
 */
interface FrontendContract {
  /** Renders something for every GameStatus */
  handlesAllStatuses: true
  /** Renders every entity type (alien, bullet, barrier, ufo, player) */
  rendersAllEntityTypes: true
  /** Responds to every ServerEvent (for audio, effects, etc.) */
  handlesAllServerEvents: true
  /** Displays all ErrorCode values to the user */
  displaysAllErrors: true
  /** Supports all input actions (left, right, shoot, pause, mute) */
  supportsAllInputs: true
}
```

**Implementation**: Each frontend has a contract test file that imports the canonical lists from `shared/` and verifies coverage:

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

**Quality bar**: These tests catch "I forgot to handle the new `wipe_exit` status in the web UI" errors. They should break the build if a new status/event/entity type is added to `shared/` but not handled by a frontend.

#### Level 4: Visual snapshot tests (rendering correctness)

**What**: Verify that the rendered output for known game states matches expected snapshots. Catch unintended visual regressions.

**For TUI**: Capture the terminal output (character grid) for a given state and compare to a stored snapshot. OpenTUI's test utilities or a custom renderer that produces a string grid.

**For Web**: Use a headless browser (Playwright) to screenshot the canvas at known states. Visual regression testing with pixel-diff tools.

**Quantity**: Low — a handful of critical scenarios:
- Empty game (waiting screen)
- Full game in progress (aliens, bullets, players, barriers)
- Game over screen with scores
- Wave transition animation frame
- Lobby with 4 players ready

**Quality bar**: Snapshots are brittle by nature. Keep the count low, update intentionally, and treat unexpected diffs as signals to investigate, not auto-approve.

**Alternative to pixel snapshots**: Structural snapshots. Instead of comparing pixels, compare the scene graph — what entities are rendered, at what positions, with what properties. Less brittle, still catches missing elements.

### 5.3 What NOT to test

- **Don't test the server from the frontend tests.** The server has its own test suite (5400+ lines of reducer tests). Frontend tests assume the server is correct and test how the frontend reacts to server output.
- **Don't test OpenTUI internals.** If `<text color="cyan">` renders cyan, that's OpenTUI's problem. Test that we pass `"cyan"` to it.
- **Don't test browser APIs.** If `canvas.fillRect()` draws a rectangle, that's the browser's problem. Test that we call it with the right coordinates.
- **Don't duplicate shared/ tests.** Protocol validation, type helpers, and collision detection are already tested in `shared/`. Frontend tests should test frontend logic.

### 5.4 Test infrastructure requirements

| Need | Solution |
|------|----------|
| Mock WebSocket server | In-process mock that sends/receives `ServerMessage`/`ClientMessage`. Already partially exists in `useGameConnection.test.ts` |
| Game state factories | Already exist in `worker/src/test-utils.ts`. Extract to `shared/test-utils.ts` so both frontends can create test states |
| Property-based testing | Continue using fast-check. Already used for animation and color functions |
| Visual regression (web) | Playwright + screenshot comparison. Run in CI on a schedule, not every PR (too slow) |
| Contract test runner | Standard test runner (bun test / vitest). Contract tests are fast — just enumeration checks |

### 5.5 Test quantity guidance

| Layer | Approximate count | Run time target |
|-------|-------------------|-----------------|
| Unit tests (client-core) | 200-300 assertions | <2s total |
| Integration tests (connection) | 30-50 assertions | <5s total |
| Contract tests (per frontend) | 20-30 assertions | <1s total |
| Visual snapshots (per frontend) | 5-10 scenarios | <30s total (TUI), <60s total (web with Playwright) |

Total: ~300-400 assertions across both frontends, running in under 10 seconds for the fast path (unit + integration + contract). Visual snapshots run separately.

### 5.6 Testing the refactoring itself

The refactoring (Phase 1) has a specific testing protocol:

1. **Before any code moves**: Run all tests, record results. `bun run test` must pass.
2. **After each module extraction**: Run all tests. Import paths change, but behavior must not.
3. **After all extractions**: Run full test suite. Zero test failures. Zero new test skips.
4. **Verify no accidental dependencies**: `client-core/` must build without `@anthropic/opentui-*` in its dependency graph. Add a CI check: `grep -r "opentui" client-core/src/ && exit 1`.
5. **Verify TUI still works**: Manual smoke test — launch the game, play through one wave, verify audio/visuals/input all work.

### 5.7 Testing the web frontend (Phase 2)

1. **Contract tests first**: Before writing any rendering code, write the contract test file. It will fail on every assertion. Use it as a checklist.
2. **Unit test adapters**: `WebInputAdapter`, `WebAudioAdapter`, `WebStorageAdapter` — test that they correctly translate browser APIs to the adapter interface.
3. **Integration test the connection**: Verify `useGameConnection` works in a browser environment (jsdom or Playwright).
4. **Visual smoke tests last**: Once rendering is complete, add snapshot tests for the critical scenarios.

### 5.8 Continuous integration

```yaml
# Updated CI pipeline
jobs:
  test-shared:
    run: bun test --cwd shared
  test-core:
    run: bun test --cwd client-core
  test-tui:
    run: bun test --cwd client
  test-web:
    run: bun test --cwd web         # vitest for browser compat
  test-worker:
    run: cd worker && bun run test
  contract-check:
    run: bun run test:contracts      # runs contract tests for all frontends
  no-opentui-in-core:
    run: "! grep -r 'opentui' client-core/src/"
```

---

## 6. Migration Plan

### Phase 1: Extract client-core (refactoring only)

**Goal**: All platform-agnostic code lives in `client-core/`. TUI client is thinner but functionally identical. All tests pass.

Steps:
1. Create `client-core/` directory structure
2. Move `animation/` modules (easing, interpolation, entrance, dissolve, starfield, confetti) — update imports in `client/`
3. Move `useGameConnection` hook — update imports
4. Extract `InputAdapter` interface and `heldKeys` logic — TUI implements `TuiInputAdapter`
5. Extract audio trigger logic from `useGameAudio` — define `AudioAdapter` interface
6. Extract sprite bitmap data — keep braille conversion in `client/`
7. Extract screen state hooks (behavioral logic from components)
8. Move and update all tests — ensure zero failures
9. Add CI check for no OpenTUI imports in `client-core/`

**Exit criteria**: `bun run test` passes. Manual play-through works. No behavior changes.

### Phase 2: Build web frontend

**Goal**: A working web client with feature parity, deployed to Cloudflare Pages.

Steps:
1. Scaffold web project with Vite + React
2. Implement `WebInputAdapter`, `WebAudioAdapter`, `WebStorageAdapter`
3. Build canvas-based game renderer
4. Build DOM-based UI screens (launch, lobby, game over)
5. Wire up `useGameConnection` with browser WebSocket
6. Write and pass all contract tests
7. Add visual snapshot tests
8. Deploy to Cloudflare Pages
9. Test cross-frontend play (TUI + web players in same room)

**Exit criteria**: All contract tests pass. All visual snapshots captured. Cross-frontend multiplayer verified manually.

### Phase 3: Polish and diverge (optional)

Once both frontends share `client-core/` and satisfy the contract tests, they can evolve independently:
- Web can add touch controls, spectator mode, higher-res sprites
- TUI can add sixel graphics support, mouse input
- New features requiring protocol changes go through `shared/protocol.ts` and both frontends update their contract tests

---

## Appendix: Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Refactoring introduces subtle behavior change | TUI breaks in ways tests don't catch | Manual play-through after each extraction step. Property-based tests catch edge cases |
| `useGameConnection` has hidden Bun dependency | Won't work in browser | Test in jsdom early. WebSocket API is standard — low risk |
| Canvas rendering performance | Janky gameplay on low-end devices | Profile early. 120×36 grid is small — canvas should handle it easily |
| Sound files too large for web | Slow initial load | Compress to opus/webm. Lazy-load non-critical sounds. Total current size is small |
| Two frontends drift in behavior | Players have different gameplay experiences | Contract tests enforce parity. Behavioral logic lives in `client-core/`, not in frontends |
| Refactoring scope creep | Phase 1 takes too long, blocks Phase 2 | Move modules one at a time. Each move is independently shippable. Don't redesign while extracting |

# Lessons Learned: Building Vaders

A multiplayer TUI Space Invaders clone with OpenTUI and Cloudflare Durable Objects.

---

## 1. TUI/Terminal Development

### What Works Well in Terminals

**Color cycling for animation.** The classic Amiga technique of rotating through a color palette creates compelling visual effects without requiring per-pixel rendering. Each sprite gets a solid foreground color that changes over time:

```typescript
// Simple, effective animation that works within terminal constraints
const TRACTOR_BEAM_PALETTE = [
  '#0033ff', '#0066ff', '#0099ff', '#00ccff',
  '#00ffff', '#66ffff', '#ffffff',
]

function getTractorBeamColor(tick: number): string {
  const index = Math.floor(tick / 10) % TRACTOR_BEAM_PALETTE.length
  return TRACTOR_BEAM_PALETTE[index]
}
```

**Unicode box-drawing characters for sprites.** Characters like `╔═╗`, `╚═╝`, `▕█▏` create recognizable game entities at character scale:

```typescript
const SPRITES = {
  alien: {
    squid: ['╔═══╗', '╚═╦═╝'],
    crab: ['/°°°\\', '╚═══╝'],
  },
  player: [' ╱█╲ ', '▕███▏'],
}
```

**Multi-line sprites for larger display areas.** Moving from 80x24 to 120x36 allowed 2-line sprites that are much more readable than single-line alternatives.

### What Does NOT Work in Terminals

**Gradients and per-pixel effects.** Terminals render character cells with a single foreground and background color. There is no sub-pixel rendering. Do not attempt:
- Plasma effects
- Smooth color gradients
- Anti-aliasing
- Partial transparency

**Smooth sub-cell animations.** Movement is inherently "chunky" - entities jump by whole character cells. Accept this limitation rather than fighting it. Aliens moving 2 cells every 15 ticks looks correct for the genre.

**Complex background patterns.** Background colors apply to entire cells. Tiled patterns or textures are impractical.

### OpenTUI Patterns and Gotchas

**Always use `renderer.destroy()` before exit.** Direct `process.exit()` leaves the terminal in a broken state:

```typescript
// WRONG - Terminal left in raw mode, cursor hidden
process.exit(0)

// CORRECT
import { useRenderer } from '@opentui/react'
const renderer = useRenderer()
renderer.destroy()  // Restores terminal state
process.exit(0)
```

**Normalize keyboard input through an adapter layer.** OpenTUI's `KeyEvent` shape may change. Isolate this behind a stable internal type:

```typescript
// client/src/input.ts
export type VadersKey =
  | { type: 'key'; key: 'left' | 'right' | 'up' | 'down' | 'space' | 'enter' | 'escape' | 'q' | 'm' | 'n' | 's' | 'r' }
  | { type: 'char'; char: string }

export function normalizeKey(event: KeyEvent): VadersKey | null {
  if (event.name === 'left' || event.sequence === '\x1b[D')
    return { type: 'key', key: 'left' }
  // ... map all keys
}
```

**Handle both press and release events for movement.** Terminal key repeat sends repeated press events. Track held state with timeouts for terminals that do not report releases:

```typescript
const KEY_RELEASE_TIMEOUT_MS = 200

function createHeldKeysTracker() {
  const held = { left: false, right: false }
  const timeouts = { left: null, right: null }

  function onPress(key) {
    held[key.key] = true
    clearTimeout(timeouts[key.key])
    timeouts[key.key] = setTimeout(() => held[key.key] = false, KEY_RELEASE_TIMEOUT_MS)
  }
  // ...
}
```

**Use `useLayoutEffect` for ref updates that keyboard handlers depend on.** Regular `useEffect` can leave stale values in closures during rapid state changes.

---

## 2. Game Architecture

### Pure Reducer Pattern for Game Logic

All game state changes flow through a single reducer function. This makes the game deterministic and testable:

```typescript
export function gameReducer(state: GameState, action: GameAction): ReducerResult {
  if (!canTransition(state.status, action.type)) {
    return { state, events: [], persist: false }
  }

  switch (action.type) {
    case 'TICK': return tickReducer(state)
    case 'PLAYER_JOIN': return playerJoinReducer(state, action.player)
    case 'PLAYER_SHOOT': return shootReducer(state, action.playerId)
    // ...
  }
}
```

The reducer returns:
- `state`: The new game state
- `events`: Array of events to broadcast to clients
- `persist`: Whether to save state to storage

### State Machine for Game Status

Guard all transitions explicitly. This prevents race conditions during countdown and join:

```typescript
const TRANSITIONS: Record<GameStatus, Partial<Record<GameAction['type'], GameStatus>>> = {
  waiting: {
    PLAYER_JOIN: 'waiting',
    START_SOLO: 'playing',
    START_COUNTDOWN: 'countdown',
  },
  countdown: {
    COUNTDOWN_TICK: 'countdown',
    COUNTDOWN_CANCEL: 'waiting',
  },
  playing: {
    TICK: 'playing',
    PLAYER_INPUT: 'playing',
    PLAYER_SHOOT: 'playing',
  },
  game_over: {
    // Terminal state - no transitions out
  },
}
```

### Seeded RNG for Determinism

Store the RNG seed in game state. Mutate it on each random call:

```typescript
export function seededRandom(state: GameState): number {
  let t = (state.rngSeed += 0x6d2b79f5)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  state.rngSeed = t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
```

This ensures identical gameplay given identical inputs - essential for debugging and replays.

### Entity System with Discriminated Unions

Use a `kind` discriminator for type-safe entity handling:

```typescript
export type Entity =
  | AlienEntity
  | BulletEntity
  | BarrierEntity
  | UFOEntity

// Type-safe filtering
export function getAliens(entities: Entity[]): AlienEntity[] {
  return entities.filter((e): e is AlienEntity => e.kind === 'alien')
}

export function getBullets(entities: Entity[]): BulletEntity[] {
  return entities.filter((e): e is BulletEntity => e.kind === 'bullet')
}
```

This pattern provides exhaustiveness checking in switch statements and enables IDE autocomplete.

---

## 3. Multiplayer/Networking

### WebSocket Hibernation with Cloudflare Durable Objects

Use the Hibernatable WebSockets API. The Durable Object can sleep while maintaining WebSocket connections:

```typescript
export class GameRoom extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)

    // Auto-respond to pings without waking the DO
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}')
    )
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    // DO wakes only when actual game messages arrive
  }
}
```

Use alarms instead of `setInterval` for the game tick. Alarms are hibernation-compatible:

```typescript
async alarm() {
  if (this.game?.status === 'playing') {
    this.tick()
    await this.ctx.storage.setAlarm(Date.now() + this.game.config.tickIntervalMs)
  }
}
```

### Full Sync vs Delta Updates

Start with full state sync. Only optimize if bandwidth becomes a problem:

```typescript
// Initial approach: full sync at 30Hz
this.broadcast({ type: 'sync', state: this.game })

// Later optimization: delta updates most ticks, full sync periodically
if (this.game.tick % 30 === 0) {
  this.broadcastFullState()
} else {
  this.broadcastDelta()
}
```

For this game, full state is ~2KB. Delta updates reduce this but add complexity. The optimization was added late and provides modest benefit.

### Input Handling: Held-State vs Discrete Actions

**Movement uses held-state networking.** Client sends which keys are currently pressed:

```typescript
// Client sends
{ type: 'input', held: { left: true, right: false } }

// Server stores in player state
player.inputState = input

// Server applies in tick
if (player.inputState.left) {
  player.x = Math.max(LAYOUT.PLAYER_MIN_X, player.x - config.playerMoveSpeed)
}
```

**Shooting uses discrete actions.** Each shot is a separate message:

```typescript
{ type: 'shoot' }
```

The server rate-limits via cooldown:

```typescript
if (state.tick - player.lastShotTick < state.config.playerCooldownTicks) {
  return { state, events: [], persist: false }  // Ignore shot
}
```

### Player Synchronization Challenges

**Problem:** Stale closures in keyboard handlers caused keys to "stick" during screen transitions.

**Solution:** Use refs for values that keyboard callbacks depend on:

```typescript
const gameStatusRef = useRef(gameStatus)
useLayoutEffect(() => { gameStatusRef.current = gameStatus }, [gameStatus])

useKeyboard((event) => {
  const currentStatus = gameStatusRef.current  // Always current
  if (currentStatus === 'playing') {
    // Handle gameplay input
  }
})
```

**Problem:** Players appeared to teleport on reconnect or state sync.

**Solution:** Accept teleportation. For a 30Hz sync rate, smooth interpolation is not worth the complexity. The "chunky" movement matches the retro aesthetic.

---

## 4. Spec Writing

### What to Include

**Type definitions with comments.** These serve as executable documentation:

```typescript
interface GameConfig {
  tickIntervalMs: number               // Default: 33 (~30Hz server tick)
  baseAlienMoveIntervalTicks: number   // Ticks between alien moves
  playerCooldownTicks: number          // Ticks between shots
  respawnDelayTicks: number            // Ticks until respawn (90 = 3s at 30Hz)
}
```

**ASCII diagrams of architecture and data flow.** These survive copy-paste and work in any editor.

**Explicit edge case decisions in tables:**

| Scenario | Decision |
|----------|----------|
| Player disconnect in lobby | Remove immediately, broadcast full sync |
| Player disconnect mid-game | Remove immediately, continue game |
| Reconnect | Not supported - no rejoin protocol |

**Layout constants with formulas:**

```typescript
export const LAYOUT = {
  PLAYER_Y: 31,              // Y position for player ships (5 rows from bottom)
  PLAYER_MIN_X: 2,           // Left boundary for player movement
  PLAYER_MAX_X: 114,         // Right boundary (120 - 5 - 1)
  ALIEN_COL_SPACING: 7,      // Horizontal spacing between alien columns
}
```

### What to Defer or Cut

**"Phase 2" features.** If a feature is marked "future" or "planned," cut it from the spec entirely. Either implement it now or remove it. Leaving placeholders creates confusion about what the system actually does.

Features that were cut:
- A/D key alternatives for movement
- Client-side interpolation of remote players
- Replay system
- Spectator mode

### Keeping Spec in Sync with Implementation

**Run periodic audits.** Compare spec assertions against actual code. Document findings:

```
Audit Issue #1: Spec says PLAYER_MAX_X = 75, code says 114
Resolution: Update spec to 114 (120 - 5 - 1 for 120-wide screen)
```

**Put types in shared module, reference from spec.** When types change, the spec examples break visibly.

### Level of Detail Needed

**Too little:** "Server handles collisions" - How? What order? What happens on hit?

**Too much:** Line-by-line pseudocode that duplicates the implementation

**Right level:** Key algorithms with rationale, decision tables for edge cases, type definitions that compile

---

## 5. Classic Game Design

### What Makes Space Invaders Work

**Relentless forward progress.** Aliens descend inexorably. The player cannot simply avoid them - they must be destroyed before reaching the bottom.

**Escalating tension.** Fewer aliens remaining means faster movement. The final alien is terrifyingly quick.

**Limited resources.** One bullet on screen at a time (original). We allow multiple but with cooldown. This forces positioning decisions.

**Barriers as temporary safety.** Barriers degrade from both sides. They buy time but are not permanent cover.

### Enhanced Mode Features (Galaga/Galaxian Inspiration)

**Commanders (Boss Galaga):** Two-hit enemies at the top of formation. Worth more points when diving.

**Challenging Stages:** Bonus rounds where aliens fly through without shooting. Kill all 40 for 10,000 points.

**Tractor beam:** Commanders can capture players (disabled for initial release - too complex).

**Point scaling based on context:**

```typescript
// Commander scoring
if (diving) {
  const escorts = context.escortCount ?? 0
  if (escorts >= 2) return 1600
  if (escorts >= 1) return 800
  return 400  // Solo dive
}
return 150  // In formation
```

### Balancing for Multiplayer

**More players = harder game.** Scale alien count, speed, and shoot rate:

```typescript
const scaleTable = {
  1: { speedMult: 1.0,  shootsPerSecond: 0.5,  cols: 11, rows: 5 },
  2: { speedMult: 1.25, shootsPerSecond: 0.75, cols: 11, rows: 5 },
  3: { speedMult: 1.5,  shootsPerSecond: 1.0,  cols: 13, rows: 5 },
  4: { speedMult: 1.75, shootsPerSecond: 1.25, cols: 15, rows: 6 },
}
```

**Shared lives in co-op.** 5 lives shared (vs 3 solo). Creates team tension without punishing individual deaths too harshly.

**Spread spawn positions.** Players start evenly distributed across the screen width:

```typescript
const positions: Record<number, number[]> = {
  1: [Math.floor(screenWidth / 2)],
  2: [Math.floor(screenWidth / 3), Math.floor(2 * screenWidth / 3)],
  3: [Math.floor(screenWidth / 4), Math.floor(screenWidth / 2), Math.floor(3 * screenWidth / 4)],
  // ...
}
```

---

## 6. Performance

### structuredClone Costs

The reducer uses `structuredClone(state)` at the start of each action. For small state (~2KB), this is fine. For larger games:

- Clone only what changes
- Use immutable data structures
- Profile before optimizing

### Entity Cleanup (Dead Aliens Accumulating)

**Problem:** Dead aliens with `alive: false` accumulated in the entity array, growing memory over time.

**Solution:** Filter out dead entities at the end of each tick:

```typescript
// Clean up dead aliens to prevent memory growth
next.entities = next.entities.filter(e =>
  e.kind !== 'alien' || (e as AlienEntity).alive
)
```

Do the same for off-screen bullets:

```typescript
next.entities = next.entities.filter(e =>
  e.kind !== 'bullet' || (e.y > 0 && e.y < config.height)
)
```

### Broadcast Frequency

At 30Hz with 4 players, the server sends 120 messages/second. Each message is JSON-stringified game state.

**Optimizations applied:**
1. Reuse stringified message for all WebSockets in broadcast
2. Send delta updates 29/30 ticks, full sync 1/30 ticks
3. Omit config and playerId after initial sync

**Not worth optimizing:**
- Binary protocol (JSON is fine at this scale)
- Compression (messages are ~2KB, below compression benefit threshold)

---

## 7. Audio in Terminal Games

### System Audio Player Approach

Instead of FFI bindings or Web Audio, use the system's command-line audio player via subprocess:

```typescript
import { spawn } from 'bun'

const player = process.platform === 'darwin' ? 'afplay' : 'aplay'

function playSound(path: string): void {
  spawn({
    cmd: [player, path],
    stdout: 'ignore',
    stderr: 'ignore',
  })
}
```

**Advantages:**
- No native dependencies or FFI complexity
- Works with WAV, MP3, and other formats the system supports
- Fire-and-forget (no need to manage audio contexts)

**Disadvantages:**
- Subprocess overhead (~5-10ms latency)
- No fine-grained volume control per-sound
- Platform-specific player detection needed

### Process Cleanup for Background Music

Spawned audio processes outlive the parent if not explicitly killed:

```typescript
class MusicManager {
  private process: Subprocess | null = null

  constructor() {
    // Register cleanup handlers
    process.on('exit', () => this.stop())
    process.on('SIGINT', () => this.stop())
    process.on('SIGTERM', () => this.stop())
  }

  stop(): void {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
  }
}
```

Also call `stop()` explicitly before any `process.exit()` call in the application.

### Debouncing Rapid Sound Effects

Prevent audio spam during rapid-fire gameplay:

```typescript
const DEBOUNCE_MS = 50
const lastPlayTime = new Map<string, number>()

function play(sound: string): void {
  const now = Date.now()
  const lastTime = lastPlayTime.get(sound) ?? 0
  if (now - lastTime < DEBOUNCE_MS) return
  lastPlayTime.set(sound, now)
  // ... play sound
}
```

### Startup Verification

Check audio system at launch and inform users of issues:

```typescript
async function runStartupChecks(): Promise<StartupReport> {
  const checks = []

  // Check audio player exists
  const which = spawn({ cmd: ['which', 'afplay'], ... })
  await which.exited
  checks.push({ name: 'Audio Player', passed: which.exitCode === 0 })

  // Check sound files exist
  const soundsExist = existsSync(join(__dirname, '../sounds/shoot.wav'))
  checks.push({ name: 'Sound Effects', passed: soundsExist })

  // Play test sound
  // ...

  return { checks, allPassed: checks.every(c => c.passed) }
}
```

### Separate Controls for Music vs SFX

Users expect independent control over background music and sound effects:

```typescript
interface UserConfig {
  audioMuted: boolean   // Sound effects
  musicMuted: boolean   // Background music
}
```

Expose via separate hotkeys (M for SFX, N for music) and persist to config file.

---

## 8. Common Pitfalls Avoided

### Over-Engineering Avoided

**Cut: Client-side prediction with rollback.** For a 30Hz game with chunky movement, prediction is unnecessary. Snap to server position and accept slight latency.

**Cut: Sequence numbers and acknowledgment.** Held-state networking with periodic resends handles dropped packets naturally.

**Cut: ECS with component pools.** A simple entity array with discriminated unions is sufficient for hundreds of entities.

**Simplified: Audio via system player.** Instead of FFI bindings, audio uses `afplay` (macOS) / `aplay` (Linux) via subprocess. WAV files for effects, MP3 for background music. Separate mute toggles (M for SFX, N for music) with config persistence.

### Terminal Limitations Discovered

**Key repeat rates vary by terminal.** Some terminals send repeat events every 30ms, others every 100ms. The held-state model with timeout fallback handles this variation.

**Color support varies.** Some terminals support 24-bit color, others only 256. Use hex colors and let the terminal approximate.

**Unicode support varies.** Box-drawing characters work everywhere. Exotic Unicode (emoji, CJK) may render incorrectly. Stick to block elements and Latin-1.

### Sprite/Collision Alignment Issues

**Problem:** Bullets spawned at player center but collision checked against alien top-left, causing misses.

**Solution:** Be consistent about sprite anchors:

```typescript
// Bullet spawns at center of player sprite
const bullet = {
  x: player.x + Math.floor(LAYOUT.PLAYER_WIDTH / 2),
  y: LAYOUT.PLAYER_Y - LAYOUT.BULLET_SPAWN_OFFSET,
}

// Collision checks center-to-center
if (
  Math.abs(bullet.x - alien.x - Math.floor(LAYOUT.ALIEN_WIDTH / 2)) < LAYOUT.COLLISION_H &&
  Math.abs(bullet.y - alien.y - Math.floor(LAYOUT.ALIEN_HEIGHT / 2)) < LAYOUT.COLLISION_V
) {
  // Hit
}
```

### Entity-Specific Hitbox Functions

**Problem:** A generic `checkBulletCollision()` function with magic `offsetX` parameters produced wrong results because different entities use different coordinate conventions:

- **Player**: `x` is CENTER of sprite
- **Alien/UFO**: `x` is LEFT EDGE of sprite
- **Barrier segments**: Used 1x offset multiplier in collision but 2x in rendering

```typescript
// OLD: Generic function with confusing offset parameter
checkBulletCollision(bullet.x, bullet.y, target.x, target.y, offsetX = 1)
// What does offsetX=1 mean? Different for each entity type!
```

**Solution:** Create entity-specific collision functions that encode the coordinate convention:

```typescript
// NEW: Self-documenting functions that match visual rendering
export const HITBOX = {
  PLAYER_HALF_WIDTH: 2,      // Player.x is center
  ALIEN_WIDTH: 5,            // Alien.x is left edge
  BARRIER_SEGMENT_WIDTH: 2,  // Each segment is 2 chars wide
} as const

export function checkPlayerHit(bX, bY, pX, pY): boolean {
  return bX >= pX - HITBOX.PLAYER_HALF_WIDTH &&
         bX < pX + HITBOX.PLAYER_HALF_WIDTH + 1 &&
         Math.abs(bY - pY) < LAYOUT.COLLISION_V
}

export function checkAlienHit(bX, bY, aX, aY): boolean {
  return bX >= aX && bX < aX + HITBOX.ALIEN_WIDTH &&
         Math.abs(bY - aY) < LAYOUT.COLLISION_V
}
```

**Lesson:** Entity-specific functions are harder to misuse than generic functions with offset parameters. The function name documents what it does.

### Visual Rendering Code is the Source of Truth

**Problem:** Barrier collision used `barrier.x + seg.offsetX` (1x multiplier) but rendering used `barrier.x + seg.offsetX * 2` (2x multiplier). Bullets passed through visually-solid barriers.

**Solution:** Copy the exact formula from rendering code into collision code:

```typescript
// Client rendering (GameScreen.tsx)
left={barrier.x + seg.offsetX * SPRITE_SIZE.barrier.width}

// Server collision (reducer.ts) - must match!
const segX = barrier.x + seg.offsetX * HITBOX.BARRIER_SEGMENT_WIDTH
```

**Lesson:** When visual and collision drift apart, always trust the visual rendering code - that's what players see and expect.

### Tests That Document Bugs Can Mask Problems

**Problem:** Tests like `it('MISMATCH: bullet at visual right edge misses alien')` asserted the *buggy* behavior. They passed, giving false confidence that collision was "working."

```typescript
// BAD: Test documents and asserts bug
it('MISMATCH: bullet at visual right edge misses alien', () => {
  // ... setup bullet at right edge of alien sprite ...
  expect(alienAfter.alive).toBe(true)  // Documents bug: right edge misses
})
```

**Solution:** Either skip tests for known bugs OR write tests that assert correct behavior and let them fail:

```typescript
// GOOD: Test asserts correct behavior, skip until fixed
it.skip('bullet at visual right edge should hit alien', () => {
  expect(alienAfter.alive).toBe(false)  // Correct behavior
})
```

**Lesson:** A passing test suite with bug-documenting tests is worse than a failing test suite with correct assertions.

### Y-Axis Tolerance is Intentional

**Problem:** Initial fix made Y-axis collision strict (`bY >= aY && bY < aY + height`), which broke existing tests.

**Root cause:** Bullets move BEFORE collision detection. A bullet at y=10 moves to y=9, then collision is checked. Strict bounds meant bullets "tunneled" through entities.

```typescript
// Bullet moves first
bullet.y += bullet.dy  // y=10 → y=9

// Then collision is checked against alien at y=10
// Strict: 9 >= 10? No → MISS (bullet tunneled through!)
// Tolerant: |9 - 10| < 2? Yes → HIT (correct)
```

**Solution:** Keep Y tolerance for bullet movement, only fix X bounds:

```typescript
export function checkAlienHit(bX, bY, aX, aY): boolean {
  return bX >= aX && bX < aX + HITBOX.ALIEN_WIDTH &&  // Fixed X bounds
         Math.abs(bY - aY) < LAYOUT.COLLISION_V       // Keep Y tolerance
}
```

**Lesson:** Understand WHY existing code has "tolerance" before removing it. It may compensate for timing in the game loop.

---

## 9. Testing Gaps Discovered

### Unit Tests Don't Catch Client-Side Protocol Issues

**Problem:** Server-side unit tests verified events were *sent* but not *received and processed*. All tests passed while the client silently ignored event messages.

```typescript
// Server test passes - event was sent
it('broadcasts player_joined event', async () => {
  await joinPlayer(gameRoom, ws, 'Alice')
  const eventCall = ws.send.mock.calls.find(call => {
    const msg = JSON.parse(call[0])
    return msg.type === 'event' && msg.name === 'player_joined'
  })
  expect(eventCall).toBeDefined()  // ✓ Passes
})

// But client IGNORES event messages entirely
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.type === 'sync') { /* handled */ }
  if (msg.type === 'error') { /* handled */ }
  if (msg.type === 'pong') { /* handled */ }
  // msg.type === 'event' → SILENTLY DROPPED
}
```

**Fix applied:** Added event handling to `useGameConnection.ts`:

```typescript
if (msg.type === 'event') {
  setState(s => {
    const updates: Partial<ConnectionState> = { lastEvent: msg }
    if (msg.name === 'game_over') {
      updates.gameResult = msg.data.result
    }
    return { ...s, ...updates }
  })
  return
}
```

**Lesson:** Integration tests must verify the full flow across client and server. Unit tests for protocol messages should exist on both sides.

### Coordinate System Mismatches

**Problem:** Server treated `player.x` as left edge, client treated it as center. Bullets appeared 2 columns off-center.

```typescript
// Server (WRONG - treating player.x as left edge)
bullet.x = player.x + Math.floor(LAYOUT.PLAYER_WIDTH / 2)

// Client (treating player.x as center)
const spriteX = player.x - Math.floor(SPRITE_SIZE.player.width / 2)
```

**Solution:** Document coordinate system contract and add tests that verify visual alignment:

```typescript
// Coordinate System Contract Tests
test('bullet spawns at visual center of player sprite', () => {
  const playerX = 50  // player.x IS the center
  const correctBulletX = playerX  // No offset needed
  expect(correctBulletX).toBe(50)
})

test('DOCUMENTS: adding SPRITE_WIDTH/2 offset would be WRONG', () => {
  const playerX = 50
  const wrongBulletX = playerX + Math.floor(SPRITE_SIZE.player.width / 2)
  expect(wrongBulletX).toBe(52)  // 2 columns off!
})
```

**Lesson:** When client and server share coordinate semantics, add contract tests on both sides that document and enforce the same understanding.

### Missing Game Result in State

**Problem:** `game_over` event contains victory/defeat result, but `GameState` has no `result` field:

```typescript
// Event has result
this.broadcast({ type: 'event', name: 'game_over', data: { result: 'victory' } })

// But GameState doesn't
interface GameState {
  status: GameStatus  // 'game_over' but no victory/defeat field
}
```

**Fix applied:** Client now extracts `gameResult` from `game_over` event and exposes it:

```typescript
interface ConnectionState {
  // ...
  gameResult: 'victory' | 'defeat' | null
}

// In event handler:
if (msg.name === 'game_over') {
  updates.gameResult = msg.data.result
}
```

**Lesson:** If information is only in events and clients ignore events, that information is lost. Critical game state should be in `GameState`, not only in events.

---

## Summary: Key Principles

1. **Server is authoritative.** Client renders, server decides.

2. **Make time explicit.** Use ticks for gameplay, milliseconds for networking. Put units in names.

3. **Prefer full sync until it hurts.** Delta updates add complexity. Start simple.

4. **Isolate framework-specific code.** OpenTUI is pre-1.0. Wrap it in adapters.

5. **Cut features, do not defer them.** "Phase 2" thinking creates spec rot.

6. **Test the reducer.** Pure functions are trivially testable without network mocks.

7. **Accept terminal constraints.** Chunky movement and solid colors are features, not bugs.

8. **Clean up entities.** Dead entities accumulate. Filter them out each tick.

9. **Use hibernation-friendly patterns.** Alarms, not intervals. Auto-ping responses.

10. **Log wide events.** One structured log per significant action, not scattered console.logs.

11. **Integration tests across protocol boundaries.** Unit tests that verify "message sent" don't catch "message ignored." Test the full client-server flow.

12. **Document coordinate system contracts.** When client and server share spatial semantics, add explicit tests that enforce the same interpretation (center vs left edge, etc.).

13. **Use entity-specific collision functions.** Generic collision functions with offset parameters are error-prone. Named functions like `checkAlienHit()` encode coordinate conventions and are harder to misuse.

14. **Visual rendering is the source of truth for hitboxes.** When collision and rendering formulas drift apart, copy the rendering formula into collision code - that's what players see and expect.

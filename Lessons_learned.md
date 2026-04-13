# Lessons Learned: Building Vaders

A multiplayer TUI Space Invaders clone with OpenTUI and Cloudflare Durable Objects.

---

## 1. TUI/Terminal Development

### What Works Well in Terminals

**Color cycling for animation.** The classic Amiga technique of rotating through a color palette creates compelling visual effects without requiring per-pixel rendering. Each sprite gets a solid foreground color that changes over time:

```typescript
// Simple, effective animation that works within terminal constraints
// From client/src/effects.ts
export function getUFOColor(tick: number): string {
  const colors = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#00ffff', '#ff00ff']
  return colors[Math.floor(tick / 5) % colors.length]
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

**Smooth sub-cell animations.** Movement is inherently "chunky" - entities jump by whole character cells. Accept this limitation rather than fighting it. Aliens moving 2 cells every 18 ticks looks correct for the genre.

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
// Timeout varies by terminal - 0 for Kitty (has key release), 40ms default for others
const KEY_RELEASE_TIMEOUT_MS = getKeyReleaseTimeoutMs()  // from terminal/compatibility.ts

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
- `scheduleAlarm?`: Optional alarm to schedule (ms from now)

### State Machine for Game Status

Guard all transitions explicitly. This prevents race conditions during countdown and join:

```typescript
const TRANSITIONS: Record<GameStatus, Partial<Record<GameAction['type'], GameStatus>>> = {
  waiting: {
    PLAYER_JOIN: 'waiting',
    START_SOLO: 'wipe_hold',        // Game start goes through wipe phases
    START_COUNTDOWN: 'countdown',
  },
  countdown: {
    COUNTDOWN_TICK: 'countdown',    // Transitions to wipe_hold when countdown reaches 0
    COUNTDOWN_CANCEL: 'waiting',
  },
  // Wave transition wipe phases (wipe_exit → wipe_hold → wipe_reveal → playing)
  wipe_exit: { TICK: 'wipe_exit', PLAYER_INPUT: 'wipe_exit' },
  wipe_hold: { TICK: 'wipe_hold', PLAYER_INPUT: 'wipe_hold' },
  wipe_reveal: { TICK: 'wipe_reveal', PLAYER_INPUT: 'wipe_reveal' },
  playing: {
    TICK: 'playing',
    PLAYER_INPUT: 'playing',
    PLAYER_MOVE: 'playing',
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
export class GameRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Load state from SQLite on wake (hibernation-aware)
    ctx.blockConcurrencyWhile(async () => { /* load from SQLite */ })
  }

  // DO wakes when messages arrive or alarms fire
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const msg = JSON.parse(message as string)
    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', serverTime: Date.now() }))
      return  // Quick response, no heavy processing
    }
    // Handle game messages...
  }
}
```

Use alarms instead of `setInterval` for the game tick. Alarms are hibernation-compatible:

```typescript
async alarm() {
  // Countdown ticks (1s interval)
  if (this.countdownRemaining !== null && this.countdownRemaining > 0) {
    // Handle countdown...
    return
  }
  // Game ticks at 30Hz during playing AND wipe phases
  const activeStatuses = ['playing', 'wipe_exit', 'wipe_hold', 'wipe_reveal']
  if (this.game && activeStatuses.includes(this.game.status)) {
    this.tick()
    await this.ctx.storage.setAlarm(Date.now() + this.game.config.tickIntervalMs)
  }
}
```

### Full Sync vs Delta Updates

Start with full state sync. Only optimize if bandwidth becomes a problem:

```typescript
// Full sync at 30Hz — simple and correct
this.broadcast({ type: 'sync', state: this.game })
```

For this game, full state is ~2KB per tick. At 30Hz with 4 players, this is 120 messages/second, which is well within WebSocket limits. The optimization applied was omitting `playerId` and `config` from subsequent syncs (they're sent once on join), roughly halving payload size. Delta updates were considered but not implemented — the simplicity of full sync outweighs the bandwidth savings at this scale.

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
  width: number                        // Default: 120
  height: number                       // Default: 36
  maxPlayers: number                   // Default: 4
  tickIntervalMs: number               // Default: 33 (~30Hz server tick)
  baseAlienMoveIntervalTicks: number   // Ticks between alien moves (default: 18)
  baseBulletSpeed: number              // Cells per tick (default: 1)
  baseAlienShootRate: number           // Probability per tick
  playerCooldownTicks: number          // Ticks between shots (default: 6)
  playerMoveSpeed: number              // Cells per tick (default: 1)
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

**Shared lives in co-op.** 5 lives shared across all players in co-op (vs 3 in solo). Any player death costs one shared life.

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
2. Omit config and playerId after initial sync (~halves payload)

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

---

## 10. Property-Based Testing

### Property Tests Find Bugs Example Tests Miss

**Problem:** `hexTo256Color` had been working fine in production and passing all example-based tests. Property-based testing with `fast-check` immediately found a counterexample:

```typescript
// Counterexample: gray = 243
Math.round((243 - 8) / 10) + 232  // = Math.round(23.5) + 232 = 24 + 232 = 256
// 256 is OUT OF RANGE — valid indices are [16, 255]
```

Gray values 239–248 all produced index 256 due to the white threshold being too high (`> 248` instead of `> 238`). No hand-written test had exercised these specific values.

**Fix:** Lower the white detection threshold from `> 248` to `> 238`.

**Lesson:** Functions that map continuous inputs to bounded outputs (color conversion, coordinate snapping, index calculation) are ideal property-based testing candidates. The invariant "output is always in [16, 255]" is trivial to assert but hard to exhaustively verify with examples.

### IEEE 754 Edge Cases Surface Naturally

Property-based testing generators produce values like `-0`, `5e-324` (smallest subnormal), and `-5e-324` that hand-written tests never include. These revealed:

- `lerp(-0, 0, 0)` returns `0`, not `-0` — because `-0 + (0 - (-0)) * 0 = -0 + 0 = 0` and `Object.is(-0, 0)` is false
- `Math.floor(-5e-324)` returns `-1`, making the subcell offset `≈ 1.0` (violating the `[0, 1)` invariant)

**Solution:** For game code operating on pixel positions, these values are meaningless. Constrain generators to realistic ranges rather than patching the code:

```typescript
// BAD: fc.double() generates subnormals and -0
const arbPosition = fc.double({ min: -50, max: 200, noNaN: true })

// GOOD: Integer-derived values avoid IEEE 754 edge cases
const arbPosition = fc.integer({ min: -5000, max: 20000 }).map(n => n / 100)
```

**Lesson:** Constrain generators to the domain the code actually handles. Testing `lerp` with `-0` is testing JavaScript's floating-point semantics, not your game logic.

### Best Candidates for Property-Based Testing

Functions with **universal invariants** — properties that must hold for ANY valid input:

| Pattern | Example | Invariant |
|---------|---------|-----------|
| Bounded output | `hexTo256Color` | Result ∈ [16, 255] |
| Idempotence | `clamp(clamp(v, min, max), min, max)` | Same as single clamp |
| Boundary conditions | `lerp(a, b, 0) = a`, `lerp(a, b, 1) = b` | Identity at endpoints |
| Monotonicity | `easeOutQuad` | `a ≤ b → f(a) ≤ f(b)` |
| Decomposition | `toRenderPosition` | `cellX + subX ≈ visualX` |
| Determinism | `StarfieldSystem` | Same config → same output |
| No duplicates | Star positions | Unique `(x, y)` pairs |
| Memoization | `getCells(tick)` | Same bucket → same reference |

**Not good candidates:** Stateful systems with complex setup (game reducer), UI components, anything requiring mocks.

---

## 11. Visual Effects in Terminals

### Color Visibility on Black Backgrounds

**Problem:** Initial starfield used very dark colors (`#1a1a3a` = RGB 26,26,58) that were completely invisible on black terminal backgrounds.

**Fix:** Brightened palette to values like `#4444aa` (RGB 68,68,170) — clearly visible but still subdued.

**Lesson:** Terminal backgrounds are pure black (RGB 0,0,0). Colors need RGB components of at least ~60-70 to be distinguishable. Test visual effects on actual terminals, not in color pickers.

### Amiga Color Cycling Techniques Apply to TUI

Classic Amiga palette animation techniques from the 1980s map directly to terminal color cycling:

1. **Brightness ramps, not color jumps.** Cycle through `dim → bright → dim` within a single hue, not between unrelated colors. This produces a natural "twinkle" or "pulse" effect.

2. **Multiple depth layers at different speeds.** Far stars cycle slowly and dimly; near stars cycle faster and brighter. Creates a sense of depth from flat rendering.

3. **Desynchronized cycle periods.** Using coprime tick rates (15, 20, 28) across layers prevents the lockstep "Christmas lights" effect where everything changes simultaneously.

4. **Rare bright spikes for scintillation.** One bright frame in an otherwise dim ramp (`#444466 → #555577 → #aaaaee → #555577`) creates an eye-catching flash without constant brightness.

5. **Spatial phase offsets.** Hash-based phase distribution `(x * 7 + y * 13) % rampLength` ensures neighboring stars don't pulse in sync, even within the same layer.

**Lesson:** Constraints breed creativity. The Amiga's 32-color palette forced artists to develop techniques that produce compelling animation from minimal state changes — exactly what terminal rendering needs.

---

## 12. Multi-Frontend Extraction

### Three layers, not two

When adding a browser frontend to a TUI, the naive split is `client/` vs `web/` sharing `shared/`. That breaks: hooks, animation math, sprite data, connection logic, input types, audio triggers — all live in a middle tier that is neither pure types nor platform-specific rendering. Force that middle tier into its own package with hard isolation:

```
shared/       types, protocol, state defaults — zero deps
client-core/  platform-agnostic logic — forbidden from @opentui/*, bun:*, node:*
client/       TUI (OpenTUI, braille, terminal)
web/          browser (React DOM, Canvas, Web Audio)
worker/       authoritative state
```

**The isolation has to be enforced by CI, not convention.** Three grep checks:

```yaml
- name: No OpenTUI in client-core
  run: if grep -r 'opentui' client-core/src/; then exit 1; fi

- name: No platform imports in client-core
  run: |
    if grep -rE "from ['\"]bun:|from ['\"]node:" client-core/src/ \
         --include='*.ts' --exclude='*.test.ts'; then exit 1; fi

- name: No OpenTUI in web
  run: if grep -r 'opentui' web/src/; then exit 1; fi
```

Without these, every new contributor "helpfully" imports `child_process` into shared animation code and breaks the web build a week later.

### Adapter interfaces are the API between core and frontend

`InputAdapter`, `AudioAdapter`, `FrameScheduler`, `VisualConfig` in `client-core/src/adapters.ts`. The TUI has a concrete `TUIInputAdapter`; the web has `WebInputAdapter`. Shared code takes the interface, not the implementation.

Two properties make this work:
1. **Narrow adapter surface.** Don't sprawl; 3–5 methods each.
2. **Events flow one way.** Input → core → state. Core → adapter → side effects. Never core ← input.

### Test both adapters against the same core

The adapter types are a cross-frontend contract. Every audio trigger, input type, or frame-scheduling primitive needs a contract test that asserts parity. See §15.

---

## 13. Determinism Discipline for Rendering

### The Math.random flicker

A "screen shake" effect translated the canvas by `(Math.random() - 0.5) * 2 * intensity` on every animation frame. Looked like flicker, not shake.

Root cause: `Math.random()` ran in the rAF callback (60 Hz) while game state ticked at 30 Hz. Each tick the user experienced *two* independent random displacements at ~16 ms apart — a strobe, not a shake.

**The rule**: state transitions must be deterministic (reducer on worker), but **cosmetics should also be deterministic per tick** so they're testable, replayable, and visually stable within a frame. Use seeded PRNG or tick-indexed sine:

```typescript
function shakeJitter(tick: number): { dx: number; dy: number } {
  if (shakeTicks <= 0) return { dx: 0, dy: 0 }
  const decay = shakeTicks / shakeDuration
  const dx = Math.sin(tick * 3.73) * shakeIntensity * decay
  const dy = Math.cos(tick * 4.19) * shakeIntensity * decay
  return { dx, dy }
}
```

Incommensurate frequencies so the trace isn't periodic; linear decay so the shake fades; tick-indexed so identical ticks produce identical displacements.

### Where Math.random() is legitimately OK

| Site | Why OK |
|---|---|
| `worker/src/index.ts` — room code generation | One roll per room; random-by-design so codes aren't guessable |
| `WebAudioAdapter` — noise buffer fill for explosion SFX | Literally supposed to be noise |
| `client-core/animation/confetti` — per-client cosmetic | Never sync'd; purely local polish |
| `client-core/animation/entrance` — alien slide-in jitter | Same |

Where it's NOT OK: anywhere inside a per-frame rendering hot path. A grep for `Math.random()` in `web/src/renderer/` is a useful pre-commit check.

### Property-based test for determinism

```typescript
it('PBT: (triggerShake params, tick) is a pure function of jitter', () => {
  fc.assert(fc.property(
    fc.integer({ min: 1, max: 10 }),
    fc.integer({ min: 1, max: 30 }),
    fc.integer({ min: 0, max: 10_000 }),
    (intensity, duration, tick) => {
      resetEffects(); triggerShake(intensity, duration)
      const a = runOnce(tick)
      resetEffects(); triggerShake(intensity, duration)
      const b = runOnce(tick)
      return JSON.stringify(a) === JSON.stringify(b)
    },
  ), { numRuns: 60 })
})
```

The property is the contract: same inputs → same outputs. A non-deterministic bug fails this in the first handful of runs.

---

## 14. Ephemeral Data, Persistent Labels, and State Reset

### The leaderboard lesson

User: "Why does the leaderboard only ever show one record when I've played multiple games?"

The UI said `LEADERBOARD`. The implementation was a per-match scoreboard rendered from `state.players`. Solo play → one player → one row, every game. The **name** set an expectation (persistent cross-game history) the **scope** (current match only) couldn't meet.

**The lesson**: label the scope you implement, not the feature you imagine. Rename `LEADERBOARD` → `MATCH SCOREBOARD` and `Aliens destroyed: N` → `Aliens destroyed this run: N`. Free, communicates honestly, avoids the "missing feature that everyone assumes exists" trap.

If you DO want persistent history, build it — localStorage match log + top-N render + cross-session test. The decision is yours; the sin is the mislabelling.

### In-place replay state leaks

`GameScreen` in the web frontend stayed mounted across waves and into the next match (same room, no route change). The only `resetEffects()` call was on unmount. Module-level accumulators (`seenDeadAlienIds`, `confettiStarted`, `barrierDamageScars`, `barrierLastHealth`, `barrierShimmers`, `trackedPrevBulletIds`, `prevGameStatus`, `lastProcessedTick`) silently carried state from match N to match N+1. Symptoms: confetti never re-fires on a second victory, barrier scars from wave 3 of the previous match appear on wave 1 of the next, `seenDeadAlienIds` grows unbounded (slow memory leak).

**The fix**: detect "new game" at the renderer layer, not the component layer.

```typescript
// At top of buildDrawCommands — triggers on server tick rewind.
if (lastProcessedTick > 0 && state.tick < lastProcessedTick) {
  resetEffects()
}
```

Tick-rewind is the one signal that reliably distinguishes "new game" from "wave transition" without coupling the renderer to route transitions.

**The anti-pattern**: `useEffect(() => return resetEffects, [])` — runs only on unmount. In real SPA flows, components survive state transitions the original author didn't anticipate.

### Why tests didn't catch it

Every renderer test called `resetEffects()` in `beforeEach`. That's correct test hygiene for isolation, but it **structurally prevents** the test from observing cross-match state leaks — the very thing we needed to test. The fix: a dedicated `replay-state-reset.test.ts` that deliberately does NOT `beforeEach(resetEffects)`, drives the renderer through two games back-to-back, and asserts the accumulators clean up on their own.

---

## 15. Cross-Surface Contract Tests

When two independent surfaces must agree — TUI audio vs web audio, web JS bundle vs Worker `/health`, rendering layer N vs rendering layer N+1 — each surface has its own tests but nobody tests the agreement. Drift goes unnoticed until a human stumbles on it.

### The `shoot` audio drift

TUI's `useGameAudio.ts` plays `shoot` on SPACE keypress. `WebAudioAdapter` had the synthesis branch. The web frontend's `App.tsx` never called `audio.play('shoot')`. Silent on web for months of commits.

The preventative:

```typescript
// web/src/audio-parity.contract.test.ts
const tuiSounds = extractPlayedSounds(read('client/src/hooks/useGameAudio.ts'))
const webReachable = new Set([
  ...extractPlayedSounds(read('web/src/App.tsx')),
  ...extractPlayedSounds(read('web/src/adapters/WebAudioAdapter.ts')),
  ...extractTriggerSounds(read('client-core/src/audio/triggers.ts')),
])

expect([...tuiSounds].filter(s => !webReachable.has(s))).toEqual([])
```

Scrape both surfaces, diff, fail with a useful message. First run caught `menu_navigate` / `menu_select` hiding inside a ternary — forced a refactor to literal `.play()` calls so the static extractor could see them. **Greppability is a contract.**

### The deploy-surface drift

User reports `eb2a171a01c1-dirty` in the launch-screen footer; `/health` shows a clean `3fe4dd51c28e`. Two surfaces disagree about which commit is deployed.

Root cause: `wrangler deploy`'s `build.command` regenerates `worker/src/buildInfo.ts` but does NOT re-run `vite build`. If you build the web bundle on a dirty tree, then commit, then wrangler-deploy, the Worker reports the clean hash (rebuilt at deploy time) but the already-built JS bundle still has the dirty hash baked in.

The preventative:

```
scripts/verify-deploy-coherence.mjs
  ↓
GET /health           → commitHash X
GET /                 → <script src="/assets/index-HASH.js">
GET /assets/…         → greps for commitHash:"Y"
assert X === Y, else exit(1)
```

Wired into `bun run deploy` as the final step: `vite build → wrangler deploy → verify-coherence`. Drift fails loud; developer gets a diagnostic telling them exactly how to recover.

### The visual-identity drift

Player bullets rendered identical cyan across 11 layers despite the ship firing them being slot-coloured. No test compared slot 1's bullet commands against slot 2's — tests asserted existence ("a glow command fires"), not identity ("the glow reflects the shooter's slot").

```typescript
// Contract A: bullet decorations differ across any pair of slots
it('bullet decoration layers differ across any pair of slots', () => {
  fc.assert(fc.property(
    fc.constantFrom<PlayerSlot>(1, 2, 3, 4),
    fc.constantFrom<PlayerSlot>(1, 2, 3, 4),
    (slotA, slotB) => {
      if (slotA === slotB) return true
      const a = renderBulletColours(slotA, SLOT_THREADED_BULLET_LAYERS)
      const b = renderBulletColours(slotB, SLOT_THREADED_BULLET_LAYERS)
      return a.size > 0 && b.size > 0 && symmetricDifferenceNonEmpty(a, b)
    },
  ))
})
```

Plus a **classification contract**: every `bullet-*` and `player-*` draw-command `kind` must be either slot-threaded OR listed in a `STATIC_PLAYER_OWNED_KINDS` allowlist with a one-line justification. New unclassified kinds fail the test — you can't add a layer without consciously recording whether it carries identity.

### The shape

Whenever two or more surfaces must agree, pick a machine-verifiable invariant and write the contract test. The tests are small (regex-scrape + set diff) and the failures are immediate and actionable.

---

## 16. Observability: Wide Events over Per-Message Breadcrumbs

### Before: 11 `console.log` breadcrumbs

The Worker's `GameRoom` had 11 per-WebSocket-message `console.log('[TAG]', {…})` calls: `[WS] Message`, `[JOIN] Attachment set`, `[READY]`, `[INPUT] DROPPED`, `[BROADCAST]`, and so on. They flooded Cloudflare Logpush, cost-accumulated, and carried no deployment metadata so you couldn't cross-reference them against a specific release.

### After: wide events + debug breadcrumbs

Two logging tiers:

**1. Wide events** — one structured JSON line per meaningful state change. Envelope includes `event`, `version`, `commitHash`, `buildTime`, `timestamp`, `region`, `roomCode`, `requestId` + caller fields. 8 events instrumented: `room_join`, `room_leave`, `player_ready`, `countdown_start`, `game_start`, `wave_complete`, `game_over`, `ws_error`. Plus `request_received` at Worker entry and `worker_boot` at isolate load.

```typescript
logEvent('game_over', {
  roomCode, outcome: 'victory', finalScore, finalWave,
  playerKills: Object.fromEntries(players.map(p => [p.id, p.kills])),
})
```

**2. Debug breadcrumbs** — the old per-message logs, now gated behind `const DEBUG_TRACE = false`. Tree-shaken in production; flip to `true` locally to re-enable the chatty path. No env plumbing needed.

### Request ID threading

Workers don't naturally give you a per-request correlation key across the HTTP → Durable Object hop. Mint a UUID at the entry point, thread it through via a custom header:

```typescript
const requestId = crypto.randomUUID()
logEvent('request_received', { method, path, requestId })
return stub.fetch(withRequestId(request, requestId))  // x-vaders-request-id
```

The DO reads the header in its `fetch` and sets a per-request field. Every subsequent `logEvent` from the DO includes the same `requestId`. Log lines can now be stitched across service hops.

### Region capture

Cloudflare exposes `request.cf.colo` per request. Capture it once into a module-level `globalThis.CF_REGION`, pass through as `region` on every `logEvent` in that request's scope. Tests mock by setting the global directly.

### The lesson

Observability tiers are distinct:
- **Boot-time identity** (`worker_boot`) — pre-request, stable envelope.
- **Request-level wide events** — one per user-visible state change. Low volume, high signal.
- **Per-message breadcrumbs** — off by default; flip for local diagnosis.

Mix them and you get either noise (every tick logging) or silence (only boot logged). Keep the tiers separate.

---

## 17. Sub-Agent Delegation Patterns

### Wave batching

Twelve independent fix items landed via three parallel sub-agents on non-overlapping files, then a second wave of two agents after the first wave's touched-files settled, then a third. Parallel where file scopes disjoint; sequential where conflicts possible.

The briefing shape that worked:

1. **Hard constraints up front**: "Do NOT modify `shared/`, `worker/`, `client/`. Read-only." File-path allow/denylists are unambiguous.
2. **Test commands that must stay green**: list all suites with current baselines. Agent runs them before reporting complete.
3. **TDD mandate**: write failing test first, confirm RED, implement, confirm GREEN. Fast-check PBT where property is genuine.
4. **Report format**: constrained word count + specific fields. Prevents sprawling prose.
5. **Scope**: one coherent job per agent. Splitting a feature across two agents creates merge conflicts and half-finished state.

### Self-audit pass is required

After the main fix batch, a sub-agent audits what the first pass did or didn't cover. Example question: "Where else have we made similar mistakes?" Surfaces class-of-bug drift the per-item tests can't catch. Then another agent (or main) writes the cross-cutting contract tests that enforce the class rule forever.

The audit-then-contract pattern generalises: **every bug class deserves a contract test, not just a per-instance test.**

### Sub-agents lie about green

Twice in this session an agent self-reported "all suites green" while the next agent found real failures. **Trust but verify** — re-run the suites in the main session before committing. The extra ~10 seconds saves an hour of "why did that deploy fail".

### When NOT to delegate

Small, surgical edits with low ambiguity: do them yourself. Briefing cost > execution cost. Sub-agents shine on: parallel independent tasks, long searches through large files, or work that'd blow the main context budget.

---

## 18. Test Quality Lessons

### Assertion density

Tests with one `expect()` are smoke tests dressed as behaviour tests. They prove the code path runs; they don't pin its output. A cyan glow and a magenta glow both satisfy `expect(cmds.find(c => c.kind === 'bullet-glow')).toBeDefined()`.

The skill (`.claude/skills/testing-best-practices`) calls for ≥3 meaningful assertions. Enforcement: `scripts/audit-assertion-density.mjs` scans every test file, counts `expect(` + `fc.assert(` (weighted ×3), reports the lowest-density tests. Informational in CI for now; can be flipped to blocking once the backlog drains.

### Both-directions, always

Positive assertion (X appears when expected) without the negative (X doesn't appear when it shouldn't) leaves half the space uncovered. Every test should answer: does the behaviour fire when I turn it on, and does it STAY off when I don't? The full-screen flash bug survived because tests checked that the flash fires — nobody wrote the mirror test for "no flash on unrelated state changes". Had they, we'd have caught the per-kill strobe the day it shipped.

### Multi-player test fixtures

Default fixtures shape the bugs you find. Single-player fixtures → bugs that only appear with ≥2 players stay invisible. Added `web/src/testing/coopFixture.ts`: `coopState(n)`, `coopPlayer(slot)`, `coopBullet(slot)`, `coopDeathPair(n, slot)`. New renderer tests default to `coopState(2|3|4)`; single-player ambient shape is no longer the easy path.

### The "what would break next time" test

When you fix a bug, also write the test that catches the NEXT bug of the same shape. Per-bug tests lock today's fix; class-of-bug contract tests lock the rule. The visual-identity audit found eleven bullet-layer instances of one bug; one PBT over (slot A, slot B) pairs catches the class regardless of how many layers exist. **Invest in the class test.**

### Characterise before refactor

Before removing dead code, characterise its behaviour so the removal is observable. We deleted an `aliveFlipped` branch as unreachable, and only a later review confirmed the impact-shield burst was still firing via the `invulnChanged` path. Without that check, "looks unreachable" is a guess.

---

## 19. The Audit-Driven Workflow

The session's most productive rhythm:

1. User flags a symptom ("explosions flicker the whole screen", "only one row on the leaderboard").
2. Diagnose root cause. **Don't fix yet.**
3. Ask: what CLASS of bug is this? Where else does that class manifest?
4. Sub-agent audit scoped to the class. Returns a triaged list.
5. Fix the listed items with TDD.
6. Write a class-of-bug contract test that prevents recurrence.
7. Deploy. Verify both surfaces agree.

The audit step is the force multiplier. A 2-minute sub-agent sweep of "where else do we have this shape?" routinely finds 5–15 additional instances. Without that step, each bug gets fixed individually and the class drifts until the next user report.

**The anti-pattern**: user reports bug → fix that bug → close ticket → repeat. No class-level enforcement, no contract test, no audit. The same class reappears in a different surface three commits later and nobody connects the two reports.

---

## 20. Phantom Players: When Hibernation Separates State From Reality

### The bug

Production room `XPJZ7K` (observed 2026-04-13 via `wrangler tail`) had 3 phantom players — entries in `state.players` whose WebSockets were dead. The Matchmaker kept handing it out as the only open room. Every new matchmaker joined as player 4/4, saw "0/4 ready", waited forever because the phantoms never readied, then closed the tab — which dropped playerCount back to 3, re-opened the room, and trapped the next victim. The bug had existed since the initial commit (c222282, 2026-01-24) and affected TUI and web users equally because it's purely server-side.

### Why state and reality drift

A Cloudflare Durable Object persists two layers of information:

| Layer | Where it lives | Survives hibernation? | Survives eviction? |
|---|---|---|---|
| Game state | SQL storage | Yes | Yes |
| WebSocket set | `ctx.getWebSockets()` | Yes (hibernation-only) | No |

On a full eviction — process migration, memory pressure, etc. — the DO is reconstructed from SQL but the WebSocket set comes back empty. Cloudflare will re-attach WSes whose underlying TCP connection is still alive, but if any of them were force-killed without a FIN (phone died, browser hard-close, laptop lid shut on Wi-Fi), their entries in `state.players` persist forever with no living socket.

The Cloudflare docs ([Rules of Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)) imply this — `ctx.getWebSockets()` is described as authoritative for attached connections — but no rule says "reconcile your per-player state against it on wake." A careful reader infers it. Nobody else does. The Keyboardia [LESSONS-LEARNED.md](https://github.com/adewale/keyboardia/blob/main/docs/LESSONS-LEARNED.md) is more explicit — Lesson 13 "WebSocket Connection Storm — Phantom Players" describes this exact shape, and Lesson 3 "DO Hibernation Breaks setTimeout" establishes the principle that anything you assume lives in memory across hibernation is fair game to disappear.

### Three compounding failures

1. **No reconciliation on DO wake.** `GameRoom` constructor loaded `state.players` from SQL without cross-checking `ctx.getWebSockets()`.
2. **No server-side heartbeat timeout.** The only heartbeat was client-initiated (`ping` → `pong`). A dead client that stopped pinging kept its slot indefinitely while the DO stayed alive.
3. **Cloudflare close-event lag.** Close events usually fire promptly (`1006 / wasClean=false` was observed in logs), but force-killed clients without TCP FIN rely on the underlying TCP timeout — minutes, not seconds. That's the window where phantoms are born.

(1) is the source of cross-eviction phantoms. (2) is the source of in-session phantoms. (3) is the timing window that creates them.

### Fix: defence-in-depth (A + B + C)

We shipped all three because they're orthogonal — each catches a different subset of the phantom-producing paths — and the code cost was low.

**A. Reconcile on wake** (`worker/src/GameRoom.ts` constructor, ~15 LoC):

```typescript
if (rows.length > 0) {
  this.game = migrateGameState(JSON.parse(rows[0].data))
  this.nextEntityId = rows[0].next_entity_id

  const live = new Set<string>()
  for (const ws of this.ctx.getWebSockets()) {
    const a = ws.deserializeAttachment() as WebSocketAttachment | null
    if (a?.playerId) live.add(a.playerId)
  }
  const phantoms = Object.keys(this.game.players).filter(id => !live.has(id))
  if (phantoms.length > 0) {
    for (const id of phantoms) delete this.game.players[id]
    this.game.readyPlayerIds = this.game.readyPlayerIds.filter(id => id in this.game!.players)
    if (this.game.status === 'countdown' && Object.keys(this.game.players).length < 2) {
      this.game.status = 'waiting'
      this.game.countdownRemaining = null
    }
    this.persistState()
    void this.updateRoomRegistry()
    logEvent('reconcile_prune_phantoms', { roomCode, pruned: phantoms, kept: [...live] })
  }
}
```

Low risk — runs inside the existing `blockConcurrencyWhile`, no new race surface. Closes the cross-eviction path.

**B. Heartbeat timeout** (`shared/types.ts` + `worker/src/GameRoom.ts`):

```typescript
// shared/types.ts
interface Player {
  // ...
  lastActiveTick: number | null   // refreshed on every webSocketMessage
}

// GameRoom.ts webSocketMessage, after playerId extraction:
if (playerId && this.game.players[playerId]) {
  this.game.players[playerId].lastActiveTick = this.game.tick
}

// GameRoom.ts tick(), during active statuses only:
const IDLE_STALE_TICKS = 2400  // 80s at 30Hz ≈ 2× (PING_INTERVAL + PONG_TIMEOUT)
for (const id of Object.keys(this.game.players)) {
  const p = this.game.players[id]
  if (p.lastActiveTick === null) { p.lastActiveTick = this.game.tick; continue }
  if (this.game.tick - p.lastActiveTick > IDLE_STALE_TICKS) {
    // reap via PLAYER_LEAVE reducer — cleans up bullets too
    this.game = gameReducer(this.game, { type: 'PLAYER_LEAVE', playerId: id }).state
  }
}
```

Key tuning: the threshold must be ≥ 2× (client `PING_INTERVAL + PONG_TIMEOUT`). Too tight and one dropped ping reaps a healthy player; too loose and phantoms linger longer than needed. 2400 ticks = 80s for our 30s ping interval felt right.

Subtle constraint — reap only during active statuses (`playing`, `wipe_*`). Waiting lobbies legitimately have idle players: someone in a lobby for 5 minutes is not a phantom, they're reading Slack.

Another subtle constraint — if reaping drops playerCount to 0 during `playing`, call `endGame('defeat')` explicitly. Otherwise `status=playing && playerCount=0` violates the `playing_with_zero_players` invariant forever.

**C. Progress-stale matchmaker prune** (`worker/src/Matchmaker.ts`):

```typescript
type RoomInfo = {
  playerCount: number
  status: string
  updatedAt: number                // refreshes on every /register (inc. playerCount churn)
  lastStatusChangeAt: number       // refreshes ONLY on status transitions
}

// On /register:
const prev = this.rooms[roomCode]
const statusChanged = !prev || prev.status !== status
this.rooms[roomCode] = {
  playerCount,
  status,
  updatedAt: now,
  lastStatusChangeAt: statusChanged ? now : prev!.lastStatusChangeAt,
}

// On /find, after the existing 5-min STALE_THRESHOLD check:
const PROGRESS_STALE_THRESHOLD = 10 * 60 * 1000
if (info.status === 'waiting' && now - info.lastStatusChangeAt > PROGRESS_STALE_THRESHOLD) {
  delete this.rooms[roomCode]
  this.openRooms.delete(roomCode)
  continue
}
```

The insight: a phantom-trapped room's `updatedAt` stays fresh — each new victim refreshes it on join — but `lastStatusChangeAt` freezes at the moment the room entered `waiting`. Tracking them separately gives the matchmaker a way to recognise "churning through victims without ever making progress."

### Why all three and not just A

A alone covers the production bug cleanly. B and C are cheap insurance against failure modes we haven't observed yet but know are structurally possible:

- **A alone, B+C missing:** if a player's tab dies and the DO stays alive for hours (plausible during peak traffic), the phantom sits in state until the next eviction. No user-visible symptom unless someone joins the same room.
- **B added:** phantoms die within 80s of their last message, regardless of DO lifecycle.
- **C added:** even if A and B fail for some unforeseen reason, the matchmaker stops feeding victims to a stuck room after 10 minutes of no status progress.

Layered defences don't duplicate work — they each close a different hole. The combined marginal cost was ~60 lines of production code and ~300 lines of regression tests.

### Instrumentation that made the diagnosis possible

The phantom state would have been undebuggable with `console.log` breadcrumbs. It needed the wide-event pipeline from §16:

- `mm_rehydrate { totalRoomsStored: 74, openRoomsRebuilt: 1 }` — first hint that the matchmaker was working from a narrow slice of stored rooms.
- `mm_find_result { result: "hit", roomCode: "XPJZ7K", playerCount: 3 }` — matchmaker returned a non-empty room before the test player joined. That's the smoking gun.
- `http_matchmake { outcome: "joined_existing" }` — confirmed the client's symptom corresponded to the server's view.
- `mm_register { openTransition: "closed→opened" }` after a player left — showed the room oscillating 3 ↔ 4 without ever unregistering.

Without these, we'd have seen "Alice reports 0/4 ready" and nothing else.

### New regression posture

The [`testing-best-practices`](.claude/skills/testing-best-practices) skill calls for writing the reproducer BEFORE the fix. We did, in `worker/src/state-machine.pbt.test.ts`:

- Two REGRESSION tests for A (full eviction + partial loss) using a fresh mock `ctx` with persisted SQL but empty `_webSockets`.
- Four REGRESSION tests for B (reap fires during playing; doesn't fire during waiting; `lastActiveTick` bumps on every message type; active player survives).
- Four REGRESSION tests for C (progress-stale prune fires with fresh `updatedAt`; recent `lastStatusChangeAt` survives; playerCount churn preserves `lastStatusChangeAt`; real status transitions refresh it).

The first B tests initially used natural solo-game flow and failed — aliens killed the solo player before the 2400-tick idle threshold, so the reap path was never exercised. Switching to direct mutation of `player.lastActiveTick` decoupled the tests from gameplay mechanics. **When a regression guard depends on a long time horizon, don't fight the simulation — mutate the trigger condition directly.**

### The lesson

1. **Persistent state lies about reality.** SQL tells you what you stored; `ctx.getWebSockets()` tells you what's reachable. Always cross-check on wake.
2. **Server-initiated heartbeats are non-negotiable.** Client pings tell you when the client is alive; they don't tell you when the server should give up waiting. For a DO holding per-player state, `lastActiveTick` plus a periodic reap is the minimum viable liveness protocol.
3. **Matchmakers need a progress signal, not just an update signal.** `updatedAt` refreshes on any registration — including churn. `lastStatusChangeAt` refreshes only on productive transitions. They measure different things, and you need both.
4. **Wide events made the undebuggable debuggable.** With per-message `console.log` the phantom state would have been invisible.
5. **Write the reproducer before the fix, but pick the right harness.** A 2400-tick natural gameplay sim is too brittle; direct mutation is more honest.

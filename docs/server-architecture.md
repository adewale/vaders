# Server Architecture

This document describes the architecture of the Vaders multiplayer server, built on Cloudflare Workers with Durable Objects.

## Overview

The server is a serverless real-time multiplayer backend consisting of:

- **Worker** - HTTP router handling room creation, matchmaking, and WebSocket upgrades
- **GameRoom** - Durable Object running the game loop for each room
- **Matchmaker** - Durable Object managing room registry and discovery

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Worker                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    HTTP Router                            │  │
│  │  POST /room      → Create room                            │  │
│  │  GET  /matchmake → Find/create open room                  │  │
│  │  GET  /room/:code/ws → WebSocket upgrade                  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                  │
│         ┌────────────────────┼────────────────────┐             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐      │
│  │  GameRoom   │      │  GameRoom   │      │ Matchmaker  │      │
│  │   ABC123    │      │   XYZ789    │      │  (singleton)│      │
│  │             │      │             │      │             │      │
│  │ - WebSockets│      │ - WebSockets│      │ - Registry  │      │
│  │ - Game loop │      │ - Game loop │      │ - Open rooms│      │
│  │ - SQLite    │      │ - SQLite    │      │             │      │
│  └─────────────┘      └─────────────┘      └─────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Entry Point (`worker/src/index.ts`)

The main Worker handles HTTP routing:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/room` | POST | Creates a new room with 6-char code |
| `/room/:code/ws` | GET | WebSocket upgrade for game clients |
| `/matchmake` | GET | Finds an open room or creates one |
| `/room/:code` | GET | Room info (player count, status) |
| `/health` | GET | Health check |

### Room Code Generation

- 6-character codes from charset `0-9A-Z` (36^6 = 2.1 billion combinations)
- Uniqueness verified against Matchmaker before returning
- Max 10 generation attempts; returns error on failure

```typescript
// Room creation flow:
// 1. Generate unique 6-char code
// 2. Call GameRoom.fetch('/init') to initialize
// 3. Register room with Matchmaker
// 4. Return roomCode to client
```

---

## Durable Objects

### GameRoom (`worker/src/GameRoom.ts`)

The core game server. Each room is a separate Durable Object instance.

#### Key Features

| Feature | Implementation |
|---------|----------------|
| **Hibernatable WebSockets** | DO sleeps between messages/alarms; connections stay open |
| **SQLite Storage** | Persists game state across hibernation |
| **Alarm-based Timing** | Uses `ctx.storage.setAlarm()` instead of `setInterval` |
| **WebSocket Attachments** | Stores `playerId` with each WebSocket (survives hibernation) |

#### State Structure

```typescript
// SQLite schema
{
  id: 1,
  data: JSON.stringify(GameState),
  next_entity_id: number
}

// GameState
{
  roomId: string,
  mode: 'solo' | 'coop',
  status: 'waiting' | 'countdown' | 'playing' | 'game_over',
  tick: number,
  rngSeed: number,
  countdownRemaining: number | null,
  players: { [playerId]: Player },
  readyPlayerIds: string[],
  entities: Entity[],  // aliens, bullets, barriers, UFO
  wave: number,
  lives: number,
  score: number,
  alienDirection: 1 | -1,
  config: GameConfig
}
```

#### WebSocket Message Handlers

| Message | Description |
|---------|-------------|
| `join` | Player joins room, assigned slot (1-4), receives full state |
| `start_solo` | Start solo game (1 player only) |
| `ready` / `unready` | Toggle readiness for multiplayer countdown |
| `input` | Continuous key state `{ left: bool, right: bool }` |
| `move` | Discrete movement for terminals without key release |
| `shoot` | Fire player bullet (respects cooldown) |
| `ping` | Liveness check, server responds with `pong` |

#### Room Lifecycle

```
Created (POST /room)
    │
    ▼
┌─────────┐    players join    ┌───────────┐
│ waiting │ ◄────────────────► │ countdown │
└─────────┘    all ready       └───────────┘
    │                               │
    │ start_solo                    │ 3...2...1...
    │                               │
    ▼                               ▼
┌─────────┐                   ┌─────────┐
│ playing │ ◄─────────────────┤ playing │
└─────────┘                   └─────────┘
    │
    │ all aliens dead OR players dead
    ▼
┌───────────┐    5 min timeout    ┌─────────┐
│ game_over │ ──────────────────► │ cleanup │
└───────────┘                     └─────────┘
```

### Matchmaker (`worker/src/Matchmaker.ts`)

In-memory room registry for matchmaking.

```typescript
// Data structure
{
  rooms: {
    [roomCode]: {
      playerCount: number,
      status: string,
      updatedAt: timestamp
    }
  },
  openRooms: Set<roomCode>  // status='waiting' && playerCount < 4
}
```

| Endpoint | Purpose |
|----------|---------|
| `POST /register` | Room registers/updates status |
| `POST /unregister` | Room cleanup on timeout |
| `GET /find` | Find open room for matchmaking |
| `GET /info/:code` | Get specific room info |

**Stale Room Cleanup**: Rooms not updated in 5+ minutes are removed from registry.

---

## Game Loop

The game runs at **30Hz** (33ms tick interval) using the `alarm()` handler.

```
alarm() fires every 33ms
    │
    ▼
┌────────────────────────────────┐
│  1. Process input queue        │  ← input, move, shoot actions
├────────────────────────────────┤
│  2. Run game reducer           │  ← pure function: state → state
├────────────────────────────────┤
│  3. Broadcast events           │  ← alien_killed, player_died, etc.
├────────────────────────────────┤
│  4. Check end conditions       │  ← wave complete? game over?
├────────────────────────────────┤
│  5. Broadcast full state       │  ← all clients get GameState
├────────────────────────────────┤
│  6. Schedule next alarm        │  ← now + 33ms
└────────────────────────────────┘
```

---

## Game Reducer (`worker/src/game/reducer.ts`)

A pure state machine that computes the next game state.

### TICK Action (Main Loop)

Each tick performs these steps in order:

1. **Player Movement**
   - Apply `inputState` (left/right) to alive players
   - Check respawn timers for dead players

2. **Bullet Movement**
   - Player bullets: move up at `baseBulletSpeed`
   - Alien bullets: move down at 80% speed (4 out of 5 ticks)

3. **Collision Detection**
   ```
   Player bullets vs aliens  → score points, destroy alien
   Player bullets vs UFO     → bonus points
   Alien bullets vs players  → lose life, respawn or game over
   All bullets vs barriers   → damage barrier segment
   ```

4. **Alien Movement** (every N ticks based on speed)
   - Move horizontally in formation
   - Reverse direction and drop when hitting boundary

5. **Alien Shooting**
   - Find bottom alien in each column
   - Use seeded RNG to determine if alien fires

6. **UFO Spawning**
   - ~0.5% chance per tick (~every 6-7 seconds)
   - Random direction and point value

7. **End Conditions**
   - Wave complete: all aliens dead → spawn next wave
   - Game over: aliens reach bottom OR all players out of lives

### State Machine Transitions

```
Action              │ From        │ To
────────────────────┼─────────────┼─────────────
START_SOLO          │ waiting     │ playing
START_COUNTDOWN     │ waiting     │ countdown
COUNTDOWN_TICK      │ countdown   │ countdown/playing
COUNTDOWN_CANCEL    │ countdown   │ waiting
TICK                │ playing     │ playing/game_over
```

### Reducer Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            GAME REDUCER ARCHITECTURE                         │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────┐
                              │   GameAction    │
                              │                 │
                              │ • TICK          │
                              │ • PLAYER_JOIN   │
                              │ • PLAYER_LEAVE  │
                              │ • PLAYER_INPUT  │
                              │ • PLAYER_MOVE   │
                              │ • PLAYER_SHOOT  │
                              │ • PLAYER_READY  │
                              │ • PLAYER_UNREADY│
                              │ • START_SOLO    │
                              │ • START_COUNTDOWN│
                              │ • COUNTDOWN_TICK│
                              │ • COUNTDOWN_CANCEL│
                              └────────┬────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              gameReducer()                                    │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                    STATE MACHINE GUARD                                  │  │
│  │         canTransition(state.status, action.type) ?                     │  │
│  │                                                                         │  │
│  │   waiting ──┬── PLAYER_JOIN/LEAVE/READY/UNREADY ──▶ waiting            │  │
│  │             ├── START_SOLO ──────────────────────▶ playing             │  │
│  │             └── START_COUNTDOWN ─────────────────▶ countdown           │  │
│  │                                                                         │  │
│  │   countdown ─┬─ COUNTDOWN_TICK ──────────────────▶ countdown/playing   │  │
│  │              └─ COUNTDOWN_CANCEL/PLAYER_LEAVE ───▶ waiting             │  │
│  │                                                                         │  │
│  │   playing ───┬─ TICK ────────────────────────────▶ playing/game_over   │  │
│  │              └─ PLAYER_INPUT/MOVE/SHOOT/LEAVE ───▶ playing             │  │
│  │                                                                         │  │
│  │   game_over ─── (terminal state, no transitions)                       │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                       │                                       │
│                                       ▼                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                         ACTION DISPATCH                                 │  │
│  │                                                                         │  │
│  │   TICK ─────────────▶ tickReducer()          (main game loop)          │  │
│  │   PLAYER_JOIN ──────▶ playerJoinReducer()                              │  │
│  │   PLAYER_LEAVE ─────▶ playerLeaveReducer()                             │  │
│  │   PLAYER_INPUT ─────▶ inputReducer()         (held keys state)         │  │
│  │   PLAYER_MOVE ──────▶ moveReducer()          (discrete step)           │  │
│  │   PLAYER_SHOOT ─────▶ shootReducer()                                   │  │
│  │   PLAYER_READY ─────▶ readyReducer()                                   │  │
│  │   PLAYER_UNREADY ───▶ unreadyReducer()                                 │  │
│  │   START_SOLO ───────▶ startSoloReducer()                               │  │
│  │   START_COUNTDOWN ──▶ startCountdownReducer()                          │  │
│  │   COUNTDOWN_TICK ───▶ countdownTickReducer()                           │  │
│  │   COUNTDOWN_CANCEL ─▶ countdownCancelReducer()                         │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                       │                                       │
│                                       ▼                                       │
│                            ┌─────────────────┐                                │
│                            │  ReducerResult  │                                │
│                            │                 │                                │
│                            │ • state         │                                │
│                            │ • events[]      │                                │
│                            │ • persist       │                                │
│                            │ • scheduleAlarm?│                                │
│                            └─────────────────┘                                │
└──────────────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────────────┐
│                           tickReducer() DETAIL                                │
│                         (called every 33ms / ~30Hz)                           │
└──────────────────────────────────────────────────────────────────────────────┘

     ┌─────────────┐
     │ GameState   │
     └──────┬──────┘
            │
            ▼
┌───────────────────────┐
│ 1. Move Players       │  Apply held input (left/right) via applyPlayerInput()
│    (continuous)       │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ 2. Move Bullets       │  Player bullets: y -= 1 (up)
│                       │  Alien bullets:  y += 1 (down)
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ 3. Move Aliens        │  Every N ticks (alienMoveIntervalTicks):
│    (periodic)         │  • Move horizontally (alienDirection)
│                       │  • Reverse + descend at edges
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ 4. Move UFO           │  If UFO exists: x += direction
│                       │  Random spawn chance per tick
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ 5. Collision Detection│
│   ┌─────────────────┐ │
│   │ Player bullets  │ │──▶ checkAlienHit() ──▶ alien killed, score++
│   │ vs Aliens       │ │
│   └─────────────────┘ │
│   ┌─────────────────┐ │
│   │ Player bullets  │ │──▶ checkUfoHit() ──▶ UFO killed, bonus score
│   │ vs UFO          │ │
│   └─────────────────┘ │
│   ┌─────────────────┐ │
│   │ Player bullets  │ │──▶ checkBarrierSegmentHit() ──▶ segment.health--
│   │ vs Barriers     │ │
│   └─────────────────┘ │
│   ┌─────────────────┐ │
│   │ Alien bullets   │ │──▶ checkPlayerHit() ──▶ player dies, respawn timer
│   │ vs Players      │ │
│   └─────────────────┘ │
│   ┌─────────────────┐ │
│   │ Alien bullets   │ │──▶ checkBarrierSegmentHit() ──▶ segment.health--
│   │ vs Barriers     │ │
│   └─────────────────┘ │
│   ┌─────────────────┐ │
│   │ Aliens vs       │ │──▶ Contact destroys segments
│   │ Barriers        │ │
│   └─────────────────┘ │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ 6. Alien Shooting     │  Probability-based (alienShootProbability)
│                       │  Paused when all players respawning
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ 7. Cleanup            │  Remove: off-screen bullets,
│                       │          dead aliens, dead UFOs
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ 8. End Conditions     │
│   ┌─────────────────┐ │
│   │ All aliens dead │ │──▶ wave++, respawn formation
│   └─────────────────┘ │
│   ┌─────────────────┐ │
│   │ Aliens reach    │ │──▶ status = 'game_over' (invasion)
│   │ GAME_OVER_Y     │ │
│   └─────────────────┘ │
│   ┌─────────────────┐ │
│   │ Lives == 0      │ │──▶ status = 'game_over'
│   └─────────────────┘ │
└───────────┬───────────┘
            │
            ▼
     ┌─────────────┐
     │ReducerResult│
     └─────────────┘
```

---

## WebSocket Protocol

### Client → Server

```typescript
{ type: 'join', name: string }
{ type: 'ready' }
{ type: 'unready' }
{ type: 'start_solo' }
{ type: 'input', held: { left: boolean, right: boolean } }
{ type: 'move', direction: 'left' | 'right' }
{ type: 'shoot' }
{ type: 'ping' }
```

### Server → Client

```typescript
// Full state sync
{ type: 'sync', state: GameState, playerId?: string, config?: GameConfig }

// Game events
{ type: 'event', name: string, data: any }
// Event names: player_joined, player_ready, player_unready, countdown_tick,
//              game_start, alien_killed, player_died, player_respawned,
//              wave_complete, game_over, player_left

// Errors
{ type: 'error', code: string, message: string }

// Ping response
{ type: 'pong', serverTime: number }
```

---

## Scaling by Player Count

Game difficulty scales with the number of players:

| Players | Lives | Alien Speed | Grid Size | Alien Shots/s |
|---------|-------|-------------|-----------|---------------|
| 1 (solo) | 3 | 1.0x | 11x5 | 0.5 |
| 2 | 5 shared | 1.25x | 11x5 | 0.75 |
| 3 | 5 shared | 1.5x | 13x5 | 1.0 |
| 4 | 5 shared | 1.75x | 15x6 | 1.25 |

### Player Spawn Positions

```
1 player:  ────────────P1────────────  (50%)
2 players: ────P1────────────P2────── (33%, 67%)
3 players: ──P1──────P2──────P3────── (25%, 50%, 75%)
4 players: ─P1───P2───P3───P4──────── (20%, 40%, 60%, 80%)
```

### Scaling Calculations

```typescript
// Alien movement interval (lower = faster)
alienMoveIntervalTicks = baseInterval / speedMultiplier

// Alien shooting probability per tick
alienShootProbability = shotsPerSecond / 30  // 30Hz tick rate
```

---

## State Synchronization

The server uses **full state sync** - every tick, all connected clients receive the complete `GameState`.

### Why Full Sync?

| Advantage | Description |
|-----------|-------------|
| Simplicity | No client-side prediction or reconciliation |
| Correctness | Clients always have ground truth |
| Debuggability | Easy to inspect state at any point |
| Suitable for 30Hz | Low tick rate makes bandwidth acceptable |

### Sync Points

- **On Join**: Client receives full state + their `playerId` + game config
- **Every Tick**: All clients receive complete game state
- **Tick Counter**: Clients can detect missed frames via `state.tick`

---

## Persistence & Recovery

### When State is Persisted

```typescript
// Persisted (important transitions)
join, ready, game_start, game_over → persist = true

// Not persisted (too frequent)
tick, input → persist = false
```

### Cold Start Recovery

```typescript
// On DO rehydration (after hibernation/crash)
blockConcurrencyWhile(async () => {
  const saved = await ctx.storage.sql.exec('SELECT * FROM game_state');
  if (saved) {
    this.game = JSON.parse(saved.data);
    this.nextEntityId = saved.next_entity_id;
  }
});
```

---

## Concurrency Model

### Actor Pattern

Each `GameRoom` is a single-threaded actor:
- All WebSocket messages processed sequentially
- All state mutations happen in order
- No race conditions possible

### Input Queuing

```
webSocketMessage() → inputQueue.push(action)
                            │
                            ▼
tick()             → process inputQueue in FIFO order
                            │
                            ▼
                   → clear queue
```

### Alarm Scheduling

```typescript
// Only one alarm pending at a time
setAlarm(now + 33ms) → wakes DO
                     → calls alarm()
                     → reschedules if still playing
```

---

## File Structure

```
worker/
├── src/
│   ├── index.ts              # HTTP router
│   ├── GameRoom.ts           # Game Durable Object (~800 lines)
│   ├── Matchmaker.ts         # Room registry DO (~100 lines)
│   └── game/
│       ├── reducer.ts        # Pure game logic (~600 lines)
│       ├── scaling.ts        # Player count scaling
│       ├── reducer.test.ts
│       └── scaling.test.ts
├── wrangler.jsonc            # DO bindings config
├── package.json
└── vitest.config.ts
```

---

## Key Design Patterns

| Pattern | Implementation |
|---------|----------------|
| **Actor Model** | Single DO instance per room; sequential processing |
| **Hibernation-First** | Alarms over intervals; attachments survive sleep |
| **Pure Reducer** | Game logic is a pure function: `(state, action) → state` |
| **Input Queuing** | Messages queued, processed atomically each tick |
| **Seeded RNG** | Deterministic alien behavior from tick + seed |
| **Full State Sync** | Simple correctness over bandwidth optimization |
| **Wide Events** | One context-rich JSON log per request |

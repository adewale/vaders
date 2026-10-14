# Difficulty Tuning — Technical Spec
## Data-Driven Config • Bot Simulation Harness • Telemetry Analysis

---

## Overview

Players report that Vaders is fun in solo mode but not in multiplayer: difficulty
ramps too steeply with player count, and games with 3–4 players feel unfair from
the first wave. Separately, waves never get harder — `nextWave()` respawns the
same grid at the same speed and shoot rate, so the only across-wave pressure is
barrier decay (barriers persist between waves with accumulated damage).

A static model of the current scaling (see `tools/difficulty-curve.html`)
estimates wave-1 difficulty per player at roughly **1.8× solo for 2p, 4.2× for
3p, and 7.5× for 4p**, driven by two compounding factors: the shared lives pool
divides by player count while the alien shoot rate multiplies by up to 2.5×.

This spec covers three deliverables that together give us a repeatable tuning
loop:

1. **Data-driven difficulty config** — extract the hardcoded scaling table so
   alternative configs can be loaded without code changes.
2. **Bot simulation harness** — drive the pure game reducer with scripted
   players to measure difficulty objectively across thousands of simulated
   games per config.
3. **Telemetry analysis** — aggregate the wide-event logs we already emit to
   measure the real difficulty curve from production play.

The visualizer proposes configs; the simulator screens them; telemetry
validates the winner. Section 6 defines how we judge results at each stage.

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Part 1: Data-Driven Difficulty Config](#2-part-1-data-driven-difficulty-config)
3. [Part 2: Bot Simulation Harness](#3-part-2-bot-simulation-harness)
4. [Part 3: Telemetry Analysis](#4-part-3-telemetry-analysis)
5. [Constraints](#5-constraints)
6. [Judging Results](#6-judging-results)
7. [Delivery Plan](#7-delivery-plan)

---

## 1. Current State Assessment

### Where difficulty lives today

| Concern | Location | Notes |
|---------|----------|-------|
| Scaling table (speed/shoot/grid/lives) | `worker/src/game/scaling.ts` `getScaledConfig()` | Hardcoded object literal |
| Base rates | `shared/types.ts` `DEFAULT_CONFIG` | `baseAlienShootRate: 0.016`, `baseAlienMoveIntervalTicks: 18` |
| Barrier count | `worker/src/GameRoom.ts` `createBarriers()` | `min(4, playerCount + 2)` |
| Barrier persistence across waves | `worker/src/GameRoom.ts` `nextWave()` | Keeps barriers, discards everything else |
| Wave progression | `worker/src/GameRoom.ts` `nextWave()` | Increments counter only — **no difficulty change** |
| Lives | `getScaledConfig()` | 3 solo / 5 shared co-op, hardcoded |

### Properties that make simulation cheap

- The entire game loop is a pure reducer: `gameReducer(state, action) → { state, events }`
  (`worker/src/game/reducer.ts`). No I/O, no timers.
- Randomness goes through `seededRandom(state)` — runs are **deterministic given
  a starting seed**, so every simulated game is replayable.
- `full-game-loop.test.ts` already demonstrates driving full games (spawn →
  shoot → wave clear → game over) through the reducer with a `runTicks` helper.

### What telemetry already exists

`GameRoom` emits wide events through `this.log()`:

- `wave_complete` — `{ wave, nextWave, survivors }`
- `game_over` — `{ outcome, finalScore, finalWave, playerKills }`
- `game_start` / `countdown_start` — includes player count
- All events carry `roomCode`, `requestId`, version/deploy metadata

Missing fields needed for difficulty analysis are listed in §4.1.

---

## 2. Part 1: Data-Driven Difficulty Config

### 2.1 Goal

Any difficulty configuration can be expressed as one JSON document, loaded at
game start, with zero code changes. The shipped defaults are just one such
document.

### 2.2 Schema

New type in `shared/types.ts`:

```ts
/** Complete difficulty tuning surface. One document = one named config. */
export interface DifficultyConfig {
  name: string                          // e.g. "ship-v1", "flatter-multi-A"
  base: {
    alienShootRate: number              // probability per tick
    alienMoveIntervalTicks: number      // ticks between alien moves
  }
  perPlayerCount: Record<1 | 2 | 3 | 4, {
    speedMult: number
    shootMult: number
    cols: number
    rows: number
    lives: number                       // total pool (shared) — see livesMode
    barriers: number
  }>
  livesMode: 'shared' | 'per-player'    // per-player multiplies lives by count
  waveRamp: {
    speedPctPerWave: number             // 0 = current behavior
    shootPctPerWave: number             // 0 = current behavior
    maxWaveForRamp: number              // ramp caps here (classic SI capped at wave 8)
  }
}
```

`DEFAULT_DIFFICULTY: DifficultyConfig` reproduces today's exact values
(including `waveRamp` of all zeros and `livesMode: 'shared'`) so behavior is
unchanged until we deliberately change it.

### 2.3 Code changes

1. **`getScaledConfig(playerCount, baseConfig)` → `getScaledConfig(playerCount, wave, difficulty)`**
   — reads from the `DifficultyConfig` instead of the inline table and applies
   the wave ramp:
   ```
   speedMult(wave)  = speedMult  * (1 + speedPctPerWave * (min(wave, maxWaveForRamp) - 1))
   shootMult(wave)  = shootMult  * (1 + shootPctPerWave * (min(wave, maxWaveForRamp) - 1))
   ```
2. **`createBarriers()`** reads barrier count from the config instead of
   `min(MAX_BARRIER_COUNT, playerCount + BARRIER_PLAYER_OFFSET)`.
3. **Wave ramp takes effect in the reducer tick** — `getScaledConfig` is
   already called per tick with current state, so passing `state.wave` is a
   one-line change at each call site.
4. **Override loading** in `GameRoom`: on game start, check
   `env.DIFFICULTY_CONFIG` (a JSON string var in `wrangler.jsonc` / `.dev.vars`).
   If present and valid, use it; otherwise `DEFAULT_DIFFICULTY`. Log the
   resolved config `name` in the `game_start` wide event.
   - Local playtest loop becomes: edit `.dev.vars`, restart `wrangler dev`.
   - Invalid JSON → log `difficulty_config_invalid` and fall back to defaults
     (never crash a room on a bad config).
5. **Snapshot the config into `GameState`** (`state.difficulty: DifficultyConfig`)
   so a running game is self-describing, sims can vary it per run, and the
   client could later display the config name.

### 2.4 Tests

- `scaling.test.ts`: existing assertions move to "DEFAULT_DIFFICULTY reproduces
  shipped values" golden tests; new tests for wave ramp math and `livesMode`.
- Round-trip test: serialize → parse → identical behavior.
- Fallback test: malformed `DIFFICULTY_CONFIG` env → defaults used, event logged.

---

## 3. Part 2: Bot Simulation Harness

### 3.1 Goal

Answer "how hard is config X for N players?" in seconds, not playtest-hours.
Run thousands of full games headlessly through `gameReducer` with scripted
players, and emit distribution statistics per (config, playerCount) cell.

### 3.2 Location and shape

New package directory: `worker/src/sim/` (worker-side so it can import the
reducer directly without crossing the client-core import boundary).

```
worker/src/sim/
  bot.ts          // bot policies (pure functions: GameState → intent)
  runner.ts       // drives gameReducer for one full game, returns GameResult
  experiment.ts   // runs a grid of (config × playerCount × seeds), aggregates
  report.ts       // formats aggregate stats as markdown table + JSON
  cli.ts          // `bun run sim -- --configs a.json,b.json --games 500`
```

No new dependencies. Runs under `bun` like existing worker tests.

### 3.3 Bot design

Bots act through the same actions real clients send (`INPUT` with held keys,
shoot intent) — they go through the reducer's normal input path, not a side
door.

Three fixed policies, in increasing skill:

| Policy | Movement | Shooting | Purpose |
|--------|----------|----------|---------|
| `random` | random direction changes | random | Floor — worst realistic player |
| `novice` | dodge nearest bullet if within 3 cells, else drift toward nearest alien column | shoot when any alien is within ±2 columns, 50% of cooldown opportunities | Approximates a casual player |
| `competent` | dodge bullets, position under alien formation edge, retreat behind barriers under fire | shoot every cooldown when aligned | Approximates a player who has played a few games |

Bot skill is a **fixed instrument, not a tuning variable**: we compare configs
against the same bots, so absolute survival times don't need to match human
times — only the *relative* ordering across player counts matters (see §6.2).

Determinism: bot decisions use a seeded RNG derived from the game seed + slot
index. Same seed → identical game, so anomalous runs are replayable for
debugging.

### 3.4 Prerequisite: make the reducer the complete state machine

The reducer is almost — but not quite — a complete single-machine simulation
target. An audit (June 2026) found no wall-clock, unseeded randomness, timers,
or network use anywhere in `reducer.ts` or `shared/types.ts`. Time is already
logical (tick counters), and randomness already flows through
`seededRandom(state)`. This matches the two patterns from the testing
research we are following: TigerBeetle's VOPR (whole system on one machine,
seed = perfect reproduction) and Jane Street's library-level simulation
(nondeterminism as explicit parameters, so the real code runs unmodified in
tests).

However, three pieces of game-progression logic live in `GameRoom.tick()`
orchestration rather than the reducer, and a reducer-only simulation would
silently skip them:

1. **Wave-2+ alien spawning** — aliens for a new wave are created by
   `GameRoom` at the `wipe_hold → wipe_reveal` transition
   (`GameRoom.ts:1059-1069`), not by the reducer (which explicitly comments
   "Aliens are created by GameRoom"). A reducer-only sim would clear wave 1
   and then face an empty screen forever.
2. **`nextWave()`** — wave increment and barrier persistence (the only
   across-wave difficulty ramp we have) run in `GameRoom` when it observes the
   reducer's `wave_complete` event (`GameRoom.ts:1053-1055`).
3. **Entity ID generation** — `this.nextEntityId` is Durable Object instance
   state, outside `GameState`.

**Decision: move all three into the reducer** (the reducer handles
`wave_complete` internally; `nextEntityId` becomes a `GameState` field) rather
than re-implementing them in the sim runner. Re-implementation would create a
second copy of game-progression logic that drifts from production — the exact
failure mode the Jane Street notes warn about with per-component mocks
("duplicating protocol details in every test"). After this move,
`GameRoom.tick()` shrinks to: dispatch `TICK`, broadcast, persist — pure
transport/persistence shell around a complete state machine. This is also a
correctness win independent of simulation: wave progression becomes unit-testable
and is covered by the same golden tests as the config extraction (Gate 1).

With that prerequisite met, **nothing stops the simulation from running on one
machine with zero network traffic**: one process, a for-loop over
`gameReducer`, no wrangler, no Durable Objects, no WebSockets, no miniflare.

### 3.5 Runner

One simulated game:

1. Build initial `GameState` for N players with the candidate `DifficultyConfig`
   (reusing `createTestPlayingState`-style helpers from `worker/src/test-utils`).
2. Loop: each tick, ask each living bot for its input, apply input actions,
   then dispatch `TICK`. Skip wipe phases by fast-forwarding (configurable).
3. Stop at `game_over` or at a tick cap (e.g. 30 sim-minutes = 54,000 ticks —
   counts as "survived cap").
4. Record a `GameResult`:

```ts
interface GameResult {
  configName: string
  playerCount: number
  botPolicy: string
  seed: number
  outcome: 'defeat' | 'cap'
  finalWave: number
  survivalTicks: number
  livesLostByWave: number[]      // index = wave
  waveClearTicks: number[]       // ticks each wave took to clear
  barrierHpAtWaveStart: number[] // measures the implicit barrier-decay ramp
  totalAlienShots: number
  totalPlayerDeaths: number
}
```

### 3.6 Experiment runner & report

`experiment.ts` runs the full grid — typically:

```
configs × playerCounts(1..4) × policies(novice, competent) × 500 seeds
```

At ~54k ticks max per game and a pure-function reducer, 500 games per cell is
expected to run in well under a minute per config on a laptop; if it's slower
we lower the tick cap before lowering the sample count.

Output per cell: median / p25 / p75 of `finalWave` and `survivalTicks`, defeat
rate before wave 2, mean lives lost in wave 1. Report as a markdown table
(human review) plus JSON (regression tracking in CI later).

### 3.7 Validation of the harness itself

Before trusting it for tuning:

- **Sanity ordering**: `competent` must outlast `novice` must outlast `random`
  on every config. If not, bots are broken.
- **Determinism test**: same seed twice → identical `GameResult`.
- **Calibration against telemetry** (after Part 3 ships): pick the bot policy
  whose median `finalWave` on the *current shipped config* is closest to the
  real-player median from telemetry, per player count. That policy becomes the
  reference instrument.

---

## 4. Part 3: Telemetry Analysis

### 4.1 Logging additions

The wide events are close to sufficient. Additions:

1. `game_start`: add `difficultyConfigName`, `playerCount`, `mode` (some
   already present — make all three guaranteed).
2. `wave_complete`: add `waveDurationTicks`, `livesRemaining`,
   `barrierSegmentsRemaining`.
3. `game_over`: add `playerCount`, `gameDurationTicks`, `livesRemaining`
   (victory case), `difficultyConfigName`.
4. New event `life_lost`: `{ wave, tick, playerCount, livesRemaining }` — one
   per death, cheap, and gives us the within-wave pressure curve.

All additions are fields on existing log calls plus one new call in the
death-handling path; no schema migration needed.

### 4.2 Analysis path

Logs flow to Cloudflare Logpush / Workers Logs as JSON lines. Analysis is a
script, not infrastructure:

```
scripts/difficulty-report.ts   // input: NDJSON log export; output: markdown report
```

Report contents, grouped by `playerCount` × `difficultyConfigName`:

- Number of games, median/p25/p75 `finalWave`
- % of games ending before wave 2 ("bounce rate" — the headline frustration metric)
- Median game duration
- Lives lost in wave 1 vs later waves
- Defeat/victory(cap)/abandon breakdown (abandon = `room_leave` during `playing`
  with no `game_over`)

Minimum sample: treat cells with < 30 games as directional only; don't make
tuning decisions on them.

### 4.3 Privacy

Aggregates only. No player names in the report; `playerKills` keys are already
opaque ids.

---

## 5. Constraints

- `client-core/` must not be touched by any of this (no `@opentui/*`, `bun:*`,
  `node:*` rules unaffected — all work is in `worker/`, `shared/`, `scripts/`).
- `DEFAULT_DIFFICULTY` must reproduce current shipped behavior bit-for-bit;
  golden tests enforce this. Tuning changes ship as deliberate config changes,
  never as side effects of the refactor.
- Sim code must not leak into the production worker bundle: `sim/` is excluded
  from the wrangler entry graph (verify with `wrangler deploy --dry-run --outdir`
  and assert no `sim/` modules in the bundle).
- The reducer stays pure. Bots live outside it.

---

## 6. Judging Results

Three gates, in order. Each produces a number we can argue about, replacing
"feels too hard."

### 6.1 Gate 1 — Refactor correctness (Part 1)

**Question**: did extracting the config change anything?

**Judge by**: golden tests pass (`DEFAULT_DIFFICULTY` ≡ shipped values); the
sim harness (Part 2) run on old code vs refactored code with identical seeds
produces identical `GameResult`s. This is binary: any drift fails.

### 6.2 Gate 2 — Candidate config screening (Part 2)

**Question**: which candidate config best achieves "multiplayer as fun as solo,
and waves that ramp"?

We operationalize the player complaints as three measurable targets, judged on
simulator output with the `competent` bot policy:

| # | Target | Metric | Pass band |
|---|--------|--------|-----------|
| T1 | **Parity across player counts** | median `finalWave` at 2p/3p/4p vs solo | within **±1 wave** of solo median |
| T2 | **No first-minute wipeouts** | defeat rate before wave 2, any player count | ≤ **1.5× solo's** rate |
| T3 | **Later waves get harder** | per-wave clear time and lives-lost slope | wave 5 clear takes ≥ 1.3× wave-1 time *or* lives-lost/wave strictly increases through wave 5 |

Additional guardrails so we don't overshoot into boring:

- **G1 — solo unchanged**: solo metrics for the winning config within ±10% of
  the shipped config (players say solo is fun; don't break it).
- **G2 — still losable**: with the `novice` policy, ≥ 60% of games at every
  player count end in defeat by wave 8. A game nobody can lose isn't fun either.
- **G3 — monotone difficulty**: median survival must not *increase* with player
  count (4p shouldn't become easier than solo — co-op should feel like more
  firepower against proportionally more threat, not a cheat code).

Because bot skill ≠ human skill, all bands are **relative to solo on the same
bot**, never absolute times. The bots are the measuring stick; solo is the
anchor.

**Deliverable**: a one-page report ranking candidates against T1–T3/G1–G3, with
the recommended config and its full simulated distribution table.

### 6.3 Gate 3 — Production validation (Part 3)

**Question**: did the shipped tuning actually fix what players complained about?

Compare ≥ 2 weeks (or ≥ 30 games per player-count cell, whichever is later) of
telemetry before vs after the config change:

| Metric | Today's hypothesis (to be measured) | Success after tuning |
|--------|--------------------------------------|----------------------|
| Median `finalWave` by player count | drops steeply: 3–4p well below solo | 2–4p within ±1 wave of solo |
| Bounce rate (defeat before wave 2) | much higher at 3–4p | ≤ 1.5× solo rate |
| Abandon rate mid-game | elevated in multiplayer | falls toward solo's rate |
| Median waves in long games | flat difficulty → long games stall at high waves with no losses | wave-ramp configs show games ending by defeat at higher waves, not by boredom/abandon |
| Repeat play (same roomCode players returning) | unknown | directionally up for multiplayer |

The **primary success metric is the bounce-rate gap**: the complaint "too hard
too quickly with lots of players" is precisely "defeat before wave 2 at 3–4p."
If that gap closes to within 1.5× of solo while solo metrics stay flat, the
project succeeded. Everything else is secondary evidence.

If simulation predictions (Gate 2) and telemetry (Gate 3) disagree
significantly, the calibration step in §3.7 is rerun and the bands in §6.2 are
recalibrated — the sim is a screening tool, telemetry is the truth.

---

## 7. Delivery Plan

| Phase | Scope | Depends on | Est. size |
|-------|-------|-----------|-----------|
| 1 | `DifficultyConfig` type + extraction + golden tests + env override | — | S |
| 2 | Bot policies + runner + determinism tests | Phase 1 | M |
| 3 | Experiment grid + report + sanity/ordering validation | Phase 2 | S |
| 4 | Logging field additions + `life_lost` event | — (parallel) | S |
| 5 | `scripts/difficulty-report.ts` telemetry analysis | Phase 4 + log data | S |
| 6 | Candidate configs from visualizer → Gate 2 screening → pick winner | Phases 3, 5 | S |
| 7 | Ship winner via config change; Gate 3 validation after 2 weeks | Phase 6 | XS + wait |

Phases 1–3 and 4–5 are independent tracks. The visualizer
(`tools/difficulty-curve.html`) gains an "export DifficultyConfig JSON" button
in Phase 6 so candidates flow directly into the sim CLI.

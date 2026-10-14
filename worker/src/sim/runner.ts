// worker/src/sim/runner.ts
// Drives gameReducer for one full headless game and returns a GameResult.
// (specs/difficulty-tuning-spec.md §3.5)
//
// One process, a for-loop over gameReducer — no Durable Objects, no
// WebSockets, no timers. The initial state mirrors GameRoom.startGame():
// status starts at wipe_hold with barriers placed, and the reducer itself
// spawns each wave's formation at the wipe_hold → wipe_reveal transition.

import type { BarrierEntity, DifficultyConfig, GameState, Player, PlayerSlot } from '../../../shared/types'
import {
  BARRIER_SHAPE_COLS,
  DEFAULT_CONFIG,
  HITBOX,
  PLAYER_COLORS,
  WIPE_TIMING,
  createBarrierSegments,
  getBarriers,
} from '../../../shared/types'
import { GAME_STATE_DEFAULTS } from '../../../shared/state-defaults'
import { gameReducer } from '../game/reducer'
import { getScaledConfig, getPlayerSpawnX } from '../game/scaling'
import { BOT_POLICIES, type BotIntent, type BotPolicyName } from './bot'

// Default tick cap: 10 sim-minutes at 30Hz. Games that reach the cap count
// as outcome 'cap'. The spec (§3.5) suggests 30 sim-minutes (54,000 ticks),
// but the reducer's per-tick structuredClone limits throughput to ~5k
// ticks/s under bun, which would make 500-game cells take ~30 minutes when
// a good bot keeps surviving. Per the spec's own §3.6 escape hatch ("we
// lower the tick cap before lowering the sample count") the default is
// 18,000; pass --cap 54000 to the CLI for full-length games.
export const DEFAULT_TICK_CAP = 18000

// ─── Result (spec §3.5) ───────────────────────────────────────────────────────

export interface GameResult {
  configName: string
  playerCount: number
  botPolicy: string
  seed: number
  outcome: 'defeat' | 'cap'
  finalWave: number
  survivalTicks: number
  livesLostByWave: number[] // index = wave (index 0 unused)
  waveClearTicks: number[] // index = wave; ticks of 'playing' the wave took to clear
  barrierHpAtWaveStart: number[] // index = wave; sum of segment HP when the wave starts playing
  totalAlienShots: number
  totalPlayerDeaths: number
}

export interface SimGameOptions {
  difficulty: DifficultyConfig
  playerCount: number
  policy: BotPolicyName
  seed: number
  tickCap?: number // default DEFAULT_TICK_CAP
}

// ─── Initial state ────────────────────────────────────────────────────────────

/**
 * Barrier placement, replicating GameRoom.createBarriers() exactly:
 * evenly spaced, each centered on width / (count + 1) multiples.
 */
function createSimBarriers(barrierCount: number, width: number, nextId: () => string): BarrierEntity[] {
  const barriers: BarrierEntity[] = []
  const spacing = width / (barrierCount + 1)
  const barrierTotalWidth = BARRIER_SHAPE_COLS * HITBOX.BARRIER_SEGMENT_WIDTH

  for (let i = 0; i < barrierCount; i++) {
    const x = Math.floor(spacing * (i + 1)) - Math.floor(barrierTotalWidth / 2)
    barriers.push({ kind: 'barrier', id: nextId(), x, segments: createBarrierSegments() })
  }
  return barriers
}

/**
 * Build a playing-ready initial GameState for N bots, mirroring
 * GameRoom.startGame(): wipe_hold status (countdown skipped), barriers from
 * the difficulty config, lives from getScaledConfig, rngSeed = seed.
 * The reducer takes it from here (wipe_hold → wipe_reveal spawns wave 1).
 */
export function buildInitialSimState(difficulty: DifficultyConfig, playerCount: number, seed: number): GameState {
  const scaled = getScaledConfig(playerCount, 1, difficulty)
  const width = DEFAULT_CONFIG.width

  let nextEntityId = 1
  const barriers = createSimBarriers(scaled.barriers, width, () => `e_${nextEntityId++}`)

  const players: Record<string, Player> = {}
  for (let i = 0; i < playerCount; i++) {
    const slot = (i + 1) as PlayerSlot
    const id = `bot-${slot}`
    players[id] = {
      id,
      name: `Bot ${slot}`,
      x: getPlayerSpawnX(slot, playerCount, width),
      slot,
      color: PLAYER_COLORS[slot],
      lastShotTick: 0,
      alive: true,
      lives: scaled.lives, // matches startGame(): player.lives = game.lives
      respawnAtTick: null,
      invulnerableUntilTick: null,
      kills: 0,
      lastActiveTick: 0,
      inputState: { left: false, right: false },
    }
  }

  return {
    ...GAME_STATE_DEFAULTS,
    roomCode: 'SIM000',
    mode: playerCount === 1 ? 'solo' : 'coop',
    status: 'wipe_hold',
    tick: 0,
    rngSeed: seed,
    countdownRemaining: null,
    players,
    readyPlayerIds: [],
    entities: barriers,
    wave: 1,
    maxLives: scaled.lives,
    lives: scaled.lives,
    score: 0,
    alienDirection: 1,
    wipeTicksRemaining: WIPE_TIMING.HOLD_TICKS,
    wipeWaveNumber: 1,
    alienShootingDisabled: false,
    nextEntityId,
    difficulty: structuredClone(difficulty),
    config: { ...DEFAULT_CONFIG },
  }
}

// ─── Game loop ────────────────────────────────────────────────────────────────

function sumBarrierHp(state: GameState): number {
  let hp = 0
  for (const barrier of getBarriers(state.entities)) {
    for (const seg of barrier.segments) hp += seg.health
  }
  return hp
}

function setWaveStat(arr: number[], wave: number, value: number): void {
  while (arr.length <= wave) arr.push(0)
  arr[wave] = value
}

function bumpWaveStat(arr: number[], wave: number, by: number): void {
  while (arr.length <= wave) arr.push(0)
  arr[wave] += by
}

/**
 * Run one full simulated game. Deterministic: same options → same GameResult.
 */
export function runSimGame(options: SimGameOptions): GameResult {
  const tickCap = options.tickCap ?? DEFAULT_TICK_CAP
  const policy = BOT_POLICIES[options.policy]
  if (!policy) throw new Error(`Unknown bot policy: ${options.policy}`)

  let state = buildInitialSimState(options.difficulty, options.playerCount, options.seed)

  const livesLostByWave: number[] = [0]
  const waveClearTicks: number[] = [0]
  const barrierHpAtWaveStart: number[] = [0]
  let totalAlienShots = 0
  let totalPlayerDeaths = 0
  let prevStatus = state.status
  let waveStartTick = 0

  while (state.status !== 'game_over' && state.tick < tickCap) {
    // 1. Ask each living bot for its intent (all from the same pre-tick state,
    //    like real clients deciding off the same broadcast sync) ...
    if (state.status === 'playing') {
      const intents: Array<{ id: string; intent: BotIntent }> = []
      for (const player of Object.values(state.players)) {
        if (!player.alive) continue
        intents.push({ id: player.id, intent: policy(state, player.slot, options.seed) })
      }
      // 2. ... then dispatch through the same actions GameRoom queues for
      //    real `input` / `shoot` WS messages.
      for (const { id, intent } of intents) {
        const held = state.players[id].inputState
        if (intent.input.left !== held.left || intent.input.right !== held.right) {
          state = gameReducer(state, { type: 'PLAYER_INPUT', playerId: id, input: intent.input }).state
        }
        if (intent.shoot) {
          state = gameReducer(state, { type: 'PLAYER_SHOOT', playerId: id }).state
        }
      }
    }

    // 3. Advance the world one tick.
    const waveBefore = state.wave
    const result = gameReducer(state, { type: 'TICK' })
    state = result.state

    // Alien shots fired this tick: reducer ids them `ab_<tick>_<alienId>`.
    for (const e of state.entities) {
      if (e.kind === 'bullet' && e.dy === 1 && e.id.startsWith(`ab_${state.tick}_`)) totalAlienShots++
    }

    for (const ev of result.events) {
      if (ev.name === 'player_died') {
        totalPlayerDeaths++
        bumpWaveStat(livesLostByWave, waveBefore, 1)
      } else if (ev.name === 'wave_complete') {
        setWaveStat(waveClearTicks, ev.data.wave, state.tick - waveStartTick)
      }
    }

    // Wave starts "playing" (wipe_reveal → playing): mark clear-timer start
    // and snapshot barrier HP (the implicit barrier-decay ramp, spec §3.5).
    if (state.status === 'playing' && prevStatus !== 'playing') {
      waveStartTick = state.tick
      setWaveStat(barrierHpAtWaveStart, state.wave, sumBarrierHp(state))
    }
    prevStatus = state.status
  }

  return {
    configName: options.difficulty.name,
    playerCount: options.playerCount,
    botPolicy: options.policy,
    seed: options.seed,
    outcome: state.status === 'game_over' ? 'defeat' : 'cap',
    finalWave: state.wave,
    survivalTicks: state.tick,
    livesLostByWave,
    waveClearTicks,
    barrierHpAtWaveStart,
    totalAlienShots,
    totalPlayerDeaths,
  }
}

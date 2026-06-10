// worker/src/sim/experiment.ts
// Runs a grid of (config × playerCount × policy × seed) simulated games and
// aggregates distribution statistics per cell. (spec §3.6)

import type { DifficultyConfig } from '../../../shared/types'
import type { BotPolicyName } from './bot'
import { runSimGame, DEFAULT_TICK_CAP, type GameResult } from './runner'

// ─── Aggregates ───────────────────────────────────────────────────────────────

export interface QuantileStats {
  p25: number
  median: number
  p75: number
}

export interface CellAggregate {
  configName: string
  playerCount: number
  botPolicy: string
  games: number
  finalWave: QuantileStats
  survivalTicks: QuantileStats
  /** Fraction of games that ended in defeat before reaching wave 2. */
  defeatBeforeWave2Rate: number
  /** Mean lives lost during wave 1 (per game). */
  meanLivesLostWave1: number
  outcomes: { defeat: number; cap: number }
}

export interface ExperimentResult {
  aggregates: CellAggregate[]
  results: GameResult[]
}

// ─── Stats helpers ────────────────────────────────────────────────────────────

/** Linear-interpolation quantile of a sorted array. */
function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export function quantiles(values: number[]): QuantileStats {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    p25: quantileSorted(sorted, 0.25),
    median: quantileSorted(sorted, 0.5),
    p75: quantileSorted(sorted, 0.75),
  }
}

export function aggregateCell(results: GameResult[]): CellAggregate {
  const first = results[0]
  let defeatBeforeWave2 = 0
  let livesLostWave1 = 0
  let defeats = 0
  let caps = 0

  for (const r of results) {
    if (r.outcome === 'defeat') defeats++
    else caps++
    if (r.outcome === 'defeat' && r.finalWave < 2) defeatBeforeWave2++
    livesLostWave1 += r.livesLostByWave[1] ?? 0
  }

  return {
    configName: first.configName,
    playerCount: first.playerCount,
    botPolicy: first.botPolicy,
    games: results.length,
    finalWave: quantiles(results.map((r) => r.finalWave)),
    survivalTicks: quantiles(results.map((r) => r.survivalTicks)),
    defeatBeforeWave2Rate: defeatBeforeWave2 / results.length,
    meanLivesLostWave1: livesLostWave1 / results.length,
    outcomes: { defeat: defeats, cap: caps },
  }
}

// ─── Experiment grid ──────────────────────────────────────────────────────────

/**
 * Run the full (config × playerCount × policy × seed) grid. Seeds are 1..N —
 * deterministic, so the whole experiment is replayable. `onGameDone` is an
 * optional progress callback (used by the CLI).
 */
export function runExperiment(
  configs: DifficultyConfig[],
  playerCounts: number[],
  policies: BotPolicyName[],
  numSeeds: number,
  tickCap: number = DEFAULT_TICK_CAP,
  onGameDone?: (done: number, total: number, last: GameResult) => void,
): ExperimentResult {
  const total = configs.length * playerCounts.length * policies.length * numSeeds
  const results: GameResult[] = []
  const aggregates: CellAggregate[] = []
  let done = 0

  for (const difficulty of configs) {
    for (const playerCount of playerCounts) {
      for (const policy of policies) {
        const cellResults: GameResult[] = []
        for (let seed = 1; seed <= numSeeds; seed++) {
          const result = runSimGame({ difficulty, playerCount, policy, seed, tickCap })
          cellResults.push(result)
          results.push(result)
          done++
          onGameDone?.(done, total, result)
        }
        aggregates.push(aggregateCell(cellResults))
      }
    }
  }

  return { aggregates, results }
}

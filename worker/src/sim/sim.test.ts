// worker/src/sim/sim.test.ts
// Validation of the simulation harness itself (spec §3.7):
// determinism, bot skill ordering, and config sanity.
//
// Tick caps here are deliberately small to keep the suite fast — the full
// 54000-tick cap is for real experiments via the CLI, not for CI.

import { describe, it, expect } from 'vitest'
import { DEFAULT_DIFFICULTY, validateDifficultyConfig, getBarriers } from '../../../shared/types'
import { validateGameState } from '../../../shared/state-defaults'
import { runSimGame, buildInitialSimState, type GameResult } from './runner'
import { BUILTIN_CONFIGS } from './cli'
import { aggregateCell, quantiles } from './experiment'
import { formatMarkdownReport } from './report'
import type { BotPolicyName } from './bot'

function median(values: number[]): number {
  return quantiles(values).median
}

// ─── Built-in configs ─────────────────────────────────────────────────────────

describe('sim built-in configs', () => {
  const names = [
    'ship-v1',
    'ship-v2',
    'ship-v2.1',
    'ship-v2.2',
    'easier-multi',
    'flat',
    'classic-ramp',
  ]

  it('registers every shipped config as a built-in', () => {
    expect(Object.keys(BUILTIN_CONFIGS).sort()).toEqual([...names].sort())
  })

  it.each(names)('%s passes validateDifficultyConfig', (name) => {
    expect(validateDifficultyConfig(BUILTIN_CONFIGS[name])).toEqual([])
  })

  it('ship-v1.json is DEFAULT_DIFFICULTY exactly', () => {
    expect(BUILTIN_CONFIGS['ship-v1']).toEqual(DEFAULT_DIFFICULTY)
  })
})

// ─── Initial state ────────────────────────────────────────────────────────────

describe('buildInitialSimState', () => {
  it('produces a valid GameState in wipe_hold with barriers from the config', () => {
    const state = buildInitialSimState(DEFAULT_DIFFICULTY, 1, 1234)
    expect(validateGameState(state)).toEqual([])
    expect(state.status).toBe('wipe_hold')
    expect(state.rngSeed).toBe(1234)
    expect(getBarriers(state.entities)).toHaveLength(3) // ship-v1 solo: 3 barriers

    const state4 = buildInitialSimState(DEFAULT_DIFFICULTY, 4, 1234)
    expect(Object.keys(state4.players)).toHaveLength(4)
    expect(getBarriers(state4.entities)).toHaveLength(4) // ship-v1 4p: 4 barriers
    expect(state4.maxLives).toBe(5)
  })
})

// ─── Determinism (spec §3.7) ──────────────────────────────────────────────────

describe('sim determinism', () => {
  it('same seed/config/policy twice → deep-equal GameResult (solo novice)', () => {
    const opts = { difficulty: DEFAULT_DIFFICULTY, playerCount: 1, policy: 'novice' as const, seed: 7, tickCap: 2500 }
    expect(runSimGame(opts)).toEqual(runSimGame(opts))
  })

  it('same seed/config/policy twice → deep-equal GameResult (2p competent)', () => {
    const opts = { difficulty: DEFAULT_DIFFICULTY, playerCount: 2, policy: 'competent' as const, seed: 42, tickCap: 2500 }
    expect(runSimGame(opts)).toEqual(runSimGame(opts))
  })
})

// ─── Skill ordering + wave progression (spec §3.7) ────────────────────────────

describe('bot skill ordering on ship-v1 solo', () => {
  const SEEDS = 20
  const TICK_CAP = 4000 // games that outlive the cap count as survivalTicks = cap

  const byPolicy = new Map<BotPolicyName, GameResult[]>()
  for (const policy of ['random', 'novice', 'competent'] as const) {
    const results: GameResult[] = []
    for (let seed = 1; seed <= SEEDS; seed++) {
      results.push(runSimGame({ difficulty: DEFAULT_DIFFICULTY, playerCount: 1, policy, seed, tickCap: TICK_CAP }))
    }
    byPolicy.set(policy, results)
  }

  it('median survivalTicks: competent > novice > random', () => {
    const med = (p: BotPolicyName) => median(byPolicy.get(p)!.map((r) => r.survivalTicks))
    const random = med('random')
    const novice = med('novice')
    const competent = med('competent')
    expect(novice).toBeGreaterThan(random)
    expect(competent).toBeGreaterThan(novice)
  })

  it('competent clears wave 1 at least sometimes (waves actually progress)', () => {
    const competent = byPolicy.get('competent')!
    const clearedWave1 = competent.filter((r) => r.finalWave >= 2)
    expect(clearedWave1.length).toBeGreaterThan(0)
    // And the per-wave instrumentation recorded the clear.
    const sample = clearedWave1[0]
    expect(sample.waveClearTicks[1]).toBeGreaterThan(0)
    expect(sample.barrierHpAtWaveStart[1]).toBeGreaterThan(0)
  })

  it('aggregation + report cover the cells without NaN', () => {
    const aggregates = (['random', 'novice', 'competent'] as const).map((p) => aggregateCell(byPolicy.get(p)!))
    for (const cell of aggregates) {
      expect(cell.games).toBe(SEEDS)
      expect(Number.isFinite(cell.finalWave.median)).toBe(true)
      expect(Number.isFinite(cell.survivalTicks.median)).toBe(true)
      expect(cell.outcomes.defeat + cell.outcomes.cap).toBe(SEEDS)
      expect(cell.defeatBeforeWave2Rate).toBeGreaterThanOrEqual(0)
      expect(cell.defeatBeforeWave2Rate).toBeLessThanOrEqual(1)
    }
    const markdown = formatMarkdownReport(aggregates)
    expect(markdown).toContain('## Config: ship-v1')
    expect(markdown).toContain('| 1 | competent | 20 |')
    expect(markdown).not.toContain('NaN')
  })
})

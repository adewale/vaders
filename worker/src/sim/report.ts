// worker/src/sim/report.ts
// Formats experiment aggregates as a markdown table (human review) and JSON
// (regression tracking). (spec §3.6)

import type { CellAggregate, ExperimentResult } from './experiment'

function fmtQ(q: { p25: number; median: number; p75: number }, digits = 0): string {
  const f = (n: number) => n.toFixed(digits)
  return `${f(q.p25)} / ${f(q.median)} / ${f(q.p75)}`
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

/**
 * Markdown report grouped by config: one table per config with a row per
 * (playerCount, policy) cell.
 */
export function formatMarkdownReport(aggregates: CellAggregate[]): string {
  const byConfig = new Map<string, CellAggregate[]>()
  for (const cell of aggregates) {
    const list = byConfig.get(cell.configName) ?? []
    list.push(cell)
    byConfig.set(cell.configName, list)
  }

  const lines: string[] = ['# Difficulty simulation report', '']
  for (const [configName, cells] of byConfig) {
    lines.push(`## Config: ${configName}`, '')
    lines.push(
      '| players | policy | games | finalWave (p25/med/p75) | survivalTicks (p25/med/p75) | defeat<wave2 | lives lost W1 (mean) | defeats | caps |',
    )
    lines.push('|---|---|---|---|---|---|---|---|---|')
    const sorted = [...cells].sort(
      (a, b) => a.playerCount - b.playerCount || a.botPolicy.localeCompare(b.botPolicy),
    )
    for (const c of sorted) {
      lines.push(
        `| ${c.playerCount} | ${c.botPolicy} | ${c.games} | ${fmtQ(c.finalWave, 1)} | ${fmtQ(c.survivalTicks)} | ${fmtPct(
          c.defeatBeforeWave2Rate,
        )} | ${c.meanLivesLostWave1.toFixed(2)} | ${c.outcomes.defeat} | ${c.outcomes.cap} |`,
      )
    }
    lines.push('')
  }
  return lines.join('\n')
}

/** JSON report: aggregates plus the full per-game results for replay/debug. */
export function formatJsonReport(experiment: ExperimentResult): string {
  return JSON.stringify({ aggregates: experiment.aggregates, results: experiment.results }, null, 2)
}

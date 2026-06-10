// worker/src/sim/cli.ts
// CLI entry point for the bot simulation harness. Runs under bun only:
//
//   bun worker/src/sim/cli.ts --configs ship-v1,easier-multi --games 500 \
//     --policies novice,competent --players 1,2,3,4 --cap 54000 --out sim-out
//
// Built-in config names resolve from worker/src/sim/configs/; anything else
// is treated as a path to a DifficultyConfig JSON file.
//
// NOT part of the production worker bundle: nothing under src/sim/ is
// imported from src/index.ts (the wrangler entry graph).
//
// Note on determinism: the simulation itself (bot.ts / runner.ts /
// experiment.ts) uses no Math.random or Date.now. Date.now appears below
// for throughput display only.

import { validateDifficultyConfig, type DifficultyConfig } from '../../../shared/types'
import { runExperiment } from './experiment'
import { formatMarkdownReport, formatJsonReport } from './report'
import { DEFAULT_TICK_CAP } from './runner'
import { isBotPolicyName, type BotPolicyName } from './bot'
import shipV1 from './configs/ship-v1.json'
import easierMulti from './configs/easier-multi.json'
import flat from './configs/flat.json'
import classicRamp from './configs/classic-ramp.json'

// Bun-only globals (the CLI never runs in the Workers runtime, so these are
// not in @cloudflare/workers-types).
declare const Bun: {
  file(path: string): { text(): Promise<string> }
  write(path: string, data: string): Promise<number>
}
declare const process: { argv: string[]; exit(code?: number): never }

// ─── Built-in configs ─────────────────────────────────────────────────────────

export const BUILTIN_CONFIGS: Record<string, unknown> = {
  'ship-v1': shipV1,
  'easier-multi': easierMulti,
  flat,
  'classic-ramp': classicRamp,
}

async function resolveConfig(token: string): Promise<DifficultyConfig> {
  let raw: unknown
  if (token in BUILTIN_CONFIGS) {
    raw = BUILTIN_CONFIGS[token]
  } else {
    raw = JSON.parse(await Bun.file(token).text())
  }
  const issues = validateDifficultyConfig(raw)
  if (issues.length > 0) {
    throw new Error(`Invalid difficulty config "${token}":\n  - ${issues.join('\n  - ')}`)
  }
  return raw as DifficultyConfig
}

// ─── Arg parsing ──────────────────────────────────────────────────────────────

interface CliOptions {
  configs: string[]
  games: number
  policies: BotPolicyName[]
  players: number[]
  cap: number
  out: string | null
}

export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    configs: ['ship-v1'],
    games: 100,
    policies: ['novice', 'competent'],
    players: [1, 2, 3, 4],
    cap: DEFAULT_TICK_CAP,
    out: null,
  }

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (!flag.startsWith('--')) continue
    const value = argv[++i]
    if (value === undefined) throw new Error(`Missing value for ${flag}`)

    switch (flag) {
      case '--configs':
        opts.configs = value.split(',').filter(Boolean)
        break
      case '--games':
        opts.games = Number(value)
        if (!Number.isInteger(opts.games) || opts.games < 1) throw new Error(`--games must be a positive integer`)
        break
      case '--policies':
        opts.policies = value.split(',').filter(Boolean).map((p) => {
          if (!isBotPolicyName(p)) throw new Error(`Unknown policy "${p}" (random | novice | competent)`)
          return p
        })
        break
      case '--players':
        opts.players = value.split(',').filter(Boolean).map((p) => {
          const n = Number(p)
          if (![1, 2, 3, 4].includes(n)) throw new Error(`--players entries must be 1-4, got "${p}"`)
          return n
        })
        break
      case '--cap':
        opts.cap = Number(value)
        if (!Number.isInteger(opts.cap) || opts.cap < 1) throw new Error(`--cap must be a positive integer`)
        break
      case '--out':
        opts.out = value
        break
      default:
        throw new Error(`Unknown flag: ${flag}`)
    }
  }
  return opts
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  const configs = await Promise.all(opts.configs.map(resolveConfig))

  const total = configs.length * opts.players.length * opts.policies.length * opts.games
  console.error(
    `Running ${total} games: configs=[${configs.map((c) => c.name).join(', ')}] ` +
      `players=[${opts.players.join(',')}] policies=[${opts.policies.join(',')}] ` +
      `seeds=1..${opts.games} cap=${opts.cap}`,
  )

  const startedAt = Date.now() // timing display only — sim logic is wall-clock-free
  let simulatedTicks = 0
  const progressEvery = Math.max(1, Math.floor(total / 20))

  const experiment = runExperiment(configs, opts.players, opts.policies, opts.games, opts.cap, (done, all, last) => {
    simulatedTicks += last.survivalTicks
    if (done % progressEvery === 0 || done === all) {
      console.error(`  ${done}/${all} games done`)
    }
  })

  const elapsedMs = Date.now() - startedAt
  const markdown = formatMarkdownReport(experiment.aggregates)
  console.log(markdown)
  console.error(
    `Done in ${(elapsedMs / 1000).toFixed(1)}s — ` +
      `${(total / (elapsedMs / 1000)).toFixed(1)} games/s, ` +
      `${Math.round(simulatedTicks / (elapsedMs / 1000)).toLocaleString()} ticks/s`,
  )

  if (opts.out) {
    await Bun.write(`${opts.out}/report.md`, markdown)
    await Bun.write(`${opts.out}/results.json`, formatJsonReport(experiment))
    console.error(`Wrote ${opts.out}/report.md and ${opts.out}/results.json`)
  }
}

// Only run when executed directly under bun (`bun worker/src/sim/cli.ts`),
// never when imported by tests (vitest leaves import.meta.main undefined).
if ((import.meta as { main?: boolean }).main) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}

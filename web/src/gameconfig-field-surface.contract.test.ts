// web/src/gameconfig-field-surface.contract.test.ts
//
// `GameConfig` field coverage contract.
//
// **Why this exists**: `shared/types.ts` declares `GameConfig` with a set
// of tunable fields (tick rate, bullet speed, cooldowns, etc). These are
// server-authoritative — the server applies them in the reducer — and
// the client OPTIONALLY reads a subset for display (currently only
// `maxPlayers` in the lobby screen).
//
// The drift pattern: add a new field to `GameConfig` to expose it to
// the UI, forget to actually wire the UI reader. TypeScript doesn't
// notice because the renderer isn't forced to read any particular field.
// This test scrapes both sides:
//
//   - Field names declared on `GameConfig` in `shared/types.ts`.
//   - Field accesses (`config.<name>`) across `web/src`.
//
// Every `GameConfig` field must either be read by a web surface OR be
// explicitly classified as server-only in `GAMECONFIG_SERVER_ONLY_FIELDS`
// with a reason. This gives reviewers a single place to record "field X
// stays on the server; here's why" when adding new tunables.
//
// Reverse direction (web reads a field not on GameConfig) is
// TypeScript-checked already.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..')

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8')
}

// ─── Scrapers ───────────────────────────────────────────────────────────────

function extractGameConfigFields(source: string): Set<string> {
  const out = new Set<string>()
  const match = source.match(/export\s+interface\s+GameConfig\s*\{([\s\S]*?)\n\}/)
  if (!match) return out
  const body = match[1]
  const re = /^\s{2}([a-zA-Z_][a-zA-Z0-9_]*)\s*\??\s*:/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) out.add(m[1])
  return out
}

/**
 * Scrape GameConfig field accesses across a source.
 *
 * Carrier variables we recognise:
 *   - `state.config.<field>` and `(state as any).config.<field>`
 *   - `serverState.config.<field>` / `prevState.config.<field>`
 *   - A bare `config.<field>` where `config` is a module-local typed name
 *     AND the surrounding source imports `GameConfig` (else it's some
 *     other local object).
 *
 * We err on the side of INCLUSION — the goal is to catch fields NOT read
 * anywhere. False positives (an unrelated local `config` object that
 * happens to share a field name) just mean the field looks "read" and
 * doesn't need allowlisting. That's fine.
 */
function extractGameConfigFieldReads(source: string): Set<string> {
  const out = new Set<string>()
  // Match any of: `state.config.foo`, `(state as any)?.config?.foo`,
  // `serverState.config.foo`, `prevState.config.foo`, plain `config.foo`.
  const res = [
    /\bstate\??\.config\??\.([a-zA-Z_][a-zA-Z0-9_]*)/g,
    /\(state\s+as\s+any\)\??\.config\??\.([a-zA-Z_][a-zA-Z0-9_]*)/g,
    /\b(?:serverState|prevState|renderState|currState|curr|prev|gameState)\??\.config\??\.([a-zA-Z_][a-zA-Z0-9_]*)/g,
    // DEFAULT_CONFIG is the GameConfig defaults export — accesses like
    // `DEFAULT_CONFIG.maxPlayers` are legitimate reads.
    /\bDEFAULT_CONFIG\??\.([a-zA-Z_][a-zA-Z0-9_]*)/g,
  ]
  for (const re of res) {
    let m: RegExpExecArray | null
    while ((m = re.exec(source)) !== null) out.add(m[1])
  }
  return out
}

function walkProduction(root: string): string[] {
  const files: string[] = []
  function recurse(dir: string) {
    for (const ent of readdirSync(dir)) {
      const full = join(dir, ent)
      if (ent === 'node_modules' || ent === 'dist' || ent === 'testing') continue
      const s = statSync(full)
      if (s.isDirectory()) recurse(full)
      else if (
        /\.(ts|tsx)$/.test(ent) &&
        !/\.test\.(ts|tsx)$/.test(ent) &&
        !/\.contract\.test\.(ts|tsx)$/.test(ent)
      ) {
        files.push(full)
      }
    }
  }
  recurse(root)
  return files
}

// ─── Server-only allowlist ──────────────────────────────────────────────────
//
// GameConfig fields the web frontend legitimately doesn't read. Each
// needs a one-line reason: reviewers reading a failing test output
// should be able to see WHY the field is legal to leave orphaned.

const GAMECONFIG_SERVER_ONLY_FIELDS: Record<string, string> = {
  // Reducer-internal: how fast the server advances its game loop. The
  // client doesn't need to know — it just renders `sync` frames as they
  // arrive, interpolated at 60Hz via requestAnimationFrame.
  tickIntervalMs: 'server-only: server tick cadence; client uses rAF for render pacing',
  // All of the `base*` tuning parameters feed the server reducer and are
  // never directly displayed. If a future UI shows a settings panel (e.g.,
  // "Slow aliens"), lift them to UI consumers and remove the entries.
  baseAlienMoveIntervalTicks: 'server-only: reducer alien-move cadence',
  baseBulletSpeed: 'server-only: reducer bullet velocity',
  baseAlienShootRate: 'server-only: reducer alien-fire probability',
  playerCooldownTicks: 'server-only: reducer shot cooldown enforcement',
  playerMoveSpeed: 'server-only: reducer movement speed',
  respawnDelayTicks: 'server-only: reducer respawn timing',
  invulnerabilityTicks: 'server-only: reducer post-respawn invulnerability window',
  // Grid dimensions — the web client hard-codes a 120×36 render grid
  // (CANVAS_WIDTH = 120 * CELL_W, CANVAS_HEIGHT = 36 * CELL_H). If / when
  // the client becomes responsive to arbitrary server dimensions, lift
  // `width`/`height` to a consumer and delete these entries.
  width: 'server-only: client hard-codes 120 cells (CANVAS_WIDTH / CELL_W)',
  height: 'server-only: client hard-codes 36 cells (CANVAS_HEIGHT / CELL_H)',
}

describe('GameConfig field-surface coverage', () => {
  const typesSrc = read('shared/types.ts')
  const gameConfigFields = extractGameConfigFields(typesSrc)

  const webFiles = walkProduction(join(repoRoot, 'web', 'src'))
  const reads = new Set<string>()
  for (const f of webFiles) {
    const body = readFileSync(f, 'utf8')
    for (const field of extractGameConfigFieldReads(body)) reads.add(field)
  }

  it('baseline sanity: extractors find at least something', () => {
    expect(gameConfigFields.size).toBeGreaterThan(0)
    // Spot-check canonical field names.
    expect(gameConfigFields.has('maxPlayers')).toBe(true)
    expect(gameConfigFields.has('tickIntervalMs')).toBe(true)
    expect(gameConfigFields.has('baseBulletSpeed')).toBe(true)
    // At least the one real UI consumer: maxPlayers in LobbyScreen.
    expect(reads.has('maxPlayers')).toBe(true)
  })

  it('every GameConfig field is read by the web OR classified as server-only', () => {
    const orphans = [...gameConfigFields].filter(
      (f) => !reads.has(f) && !(f in GAMECONFIG_SERVER_ONLY_FIELDS),
    )
    expect(orphans).toEqual([])
  })

  it('server-only allowlist entries actually exist on GameConfig', () => {
    // Stale allowlist entries rot silently — fail so they get cleaned up.
    for (const field of Object.keys(GAMECONFIG_SERVER_ONLY_FIELDS)) {
      expect(gameConfigFields.has(field)).toBe(true)
    }
  })

  it('every server-only allowlist field is NOT actually read by the web', () => {
    // A field listed as "server-only" that IS consumed by the web is a
    // contradictory allowlist entry. Fail so it gets deleted.
    for (const field of Object.keys(GAMECONFIG_SERVER_ONLY_FIELDS)) {
      expect(reads.has(field)).toBe(false)
    }
  })

  it('the allowlist covers every GameConfig field not read by the web (completeness)', () => {
    // Complement of the orphan check: every declared field is either in
    // the allowlist OR consumed. This catches the situation where a new
    // field is added to GameConfig and the author updates neither.
    const unclassified = [...gameConfigFields].filter(
      (f) => !reads.has(f) && !(f in GAMECONFIG_SERVER_ONLY_FIELDS),
    )
    expect(unclassified).toEqual([])
  })
})

// web/src/gamestate-field-surface.contract.test.ts
//
// `GameState` field coverage contract.
//
// **Why this exists**: `shared/types.ts` declares `GameState` with a set
// of top-level fields. The web frontend (`canvasRenderer.ts`, screen
// components) reads a SUBSET. When the worker adds a new field, the
// frontend can still compile — but nothing tells us whether the new
// field is intentionally server-only (`rngSeed` determinism) or a UI
// surface we forgot to plumb (e.g., a newly-added `wipeMessage`).
//
// This test scrapes both sides:
//   - Field names declared on `GameState` in `shared/types.ts`.
//   - Field accesses (`state.<name>`) across `web/src`.
//
// Every GameState field must either be read by the renderer / a
// component, OR be explicitly classified as server-only in the
// `GAMESTATE_SERVER_ONLY_FIELDS` allowlist with a reason.
//
// Reverse direction (renderer reads a field not on GameState) is
// already enforced by TypeScript — skipped here.

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

/**
 * Extract every top-level field declared on `GameState` in shared/types.ts.
 * Handles single-line `fieldName: Type` and comment-carrying lines.
 *
 * The interface is multi-line; we match from `export interface GameState {`
 * to the closing brace of the top-level block, then each `^  fieldName:`
 * declaration.
 */
function extractGameStateFields(source: string): Set<string> {
  const out = new Set<string>()
  const match = source.match(/export\s+interface\s+GameState\s*\{([\s\S]*?)\n\}/)
  if (!match) return out
  const body = match[1]
  // Each field: two-space indent (interface body), name, optional `?`, then `:`
  // Skip lines inside inline object types by only matching at the
  // immediate indent level (2 spaces).
  const re = /^\s{2}([a-zA-Z_][a-zA-Z0-9_]*)\s*\??\s*:/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) out.add(m[1])
  return out
}

/**
 * Scrape every `state.FIELD` or `serverState.FIELD` / `prevState.FIELD` /
 * `renderState.FIELD` / `curr.FIELD` / `prev.FIELD` access across a source.
 * These names match the conventions used in web/src for GameState-typed
 * variables.
 */
function extractStateFieldReads(source: string): Set<string> {
  const out = new Set<string>()
  // Variables typed as GameState in the web codebase.
  const vars = ['state', 'serverState', 'prevState', 'renderState', 'curr', 'prev', 'currState', 'gameState']
  const re = new RegExp(String.raw`\b(?:${vars.join('|')})\.([a-zA-Z_][a-zA-Z0-9_]*)`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    // Skip method-like accesses by excluding names followed immediately by `(`.
    // We want field reads, not method calls. But GameState has no methods,
    // so this is a belt-and-braces filter.
    const nextChar = source[re.lastIndex]
    if (nextChar !== '(') out.add(m[1])
  }
  return out
}

/** Walk every .ts / .tsx production file under a root (excluding tests). */
function walkProduction(root: string): string[] {
  const files: string[] = []
  function recurse(dir: string) {
    for (const ent of readdirSync(dir)) {
      const full = join(dir, ent)
      if (ent === 'node_modules' || ent === 'dist' || ent === 'testing') continue
      const s = statSync(full)
      if (s.isDirectory()) recurse(full)
      else if (/\.(ts|tsx)$/.test(ent) && !/\.test\.(ts|tsx)$/.test(ent) && !/\.contract\.test\.(ts|tsx)$/.test(ent)) {
        files.push(full)
      }
    }
  }
  recurse(root)
  return files
}

// ─── Server-only allowlist ──────────────────────────────────────────────────
//
// Fields on `GameState` that are deliberately not read by the web frontend.
// Each entry has a one-line reason so a failing test points at WHY.

const GAMESTATE_SERVER_ONLY_FIELDS: Record<string, string> = {
  // RNG state is only consumed by the server-side reducer (determinism
  // guarantee). The client never needs to re-roll — the server authoritatively
  // syncs every tick.
  rngSeed: 'server-only: mulberry32 state for deterministic reducer',
  // Alien movement direction is visible to the client purely through the
  // rendered positions (which already come down in state.entities). The
  // client doesn't need to inspect the direction flag; it's server-only
  // metadata that influences alien movement & wall-drop timing.
  alienDirection: 'server-only: drives alien step/drop logic server-side; client sees positions',
  // Debug flag that disables alien shooting for playtesting; the client
  // doesn't need it because the absence of bullets IS the effect.
  alienShootingDisabled: 'server-only: debug flag; client infers from bullet absence',
  // Config is exposed through a component-local helper (`state.config.maxPlayers`
  // in LobbyScreen), accessed via `(state as any).config`. That `as any`
  // access is invisible to the plain `state.config` scraper, so we
  // conservatively list it as "covered elsewhere" to avoid a false positive.
  // If the entire `config` field becomes truly unused, this entry should be
  // promoted to a real missing-consumer failure by deleting the allowlist
  // line.
  config: 'accessed in LobbyScreen.tsx via `(state as any).config.maxPlayers`',
}

describe('GameState field-surface coverage', () => {
  const typesSrc = read('shared/types.ts')
  const gameStateFields = extractGameStateFields(typesSrc)

  // Collect every field-read across the web production source tree.
  const webFiles = walkProduction(join(repoRoot, 'web', 'src'))
  const reads = new Set<string>()
  for (const f of webFiles) {
    const body = readFileSync(f, 'utf8')
    for (const field of extractStateFieldReads(body)) reads.add(field)
  }

  it('baseline sanity: extractors find at least something', () => {
    // A broken regex would falsely pass downstream assertions.
    expect(gameStateFields.size).toBeGreaterThan(0)
    // Spot-check: long-standing field names should always appear.
    expect(gameStateFields.has('tick')).toBe(true)
    expect(gameStateFields.has('players')).toBe(true)
    expect(gameStateFields.has('status')).toBe(true)
    expect(reads.size).toBeGreaterThan(0)
    expect(reads.has('tick')).toBe(true)
  })

  it('every GameState field is read by the web OR classified as server-only', () => {
    const orphans = [...gameStateFields].filter((f) => !reads.has(f) && !(f in GAMESTATE_SERVER_ONLY_FIELDS))
    expect(orphans).toEqual([])
  })

  it('server-only allowlist entries actually exist on GameState', () => {
    // Stale allowlist entries rot silently. If a field was renamed or
    // removed, the entry becomes dead weight — fail so it gets cleaned up.
    for (const field of Object.keys(GAMESTATE_SERVER_ONLY_FIELDS)) {
      expect(gameStateFields.has(field)).toBe(true)
    }
  })

  it('every server-only allowlist field is NOT actually read by the web', () => {
    // A field listed as "server-only" that IS consumed by the web is a
    // contradictory comment. Fail so the entry gets deleted.
    for (const field of Object.keys(GAMESTATE_SERVER_ONLY_FIELDS)) {
      if (field === 'config') continue // see allowlist comment — accessed via `as any`.
      expect(reads.has(field)).toBe(false)
    }
  })
})

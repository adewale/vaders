// web/src/server-event-coverage.contract.test.ts
//
// Worker ⇄ web consumer coverage contract.
//
// **Why this exists**: the worker broadcasts `{type: 'event', name: '…'}`
// messages for game-state transitions (e.g. `alien_killed`, `wave_complete`).
// The web frontend either:
//   - Consumes them directly via `lastEvent.name === '…'` checks in hooks
//     / components, OR
//   - Derives sounds / effects from state deltas in
//     `client-core/src/audio/triggers.ts` (which the web then plays).
//
// The drift pattern: add a new broadcast in `GameRoom.ts`, forget to wire
// up any consumer, and the event goes on the wire with no effect. This
// test scrapes both surfaces and fails fast when a broadcast has no
// matching consumer (or an explicit `CLIENT_IGNORED_EVENTS` allowlist
// entry).
//
// Converse direction (consumer references event name not in the worker)
// is partially type-checked by `ServerEvent` in `shared/protocol.ts`, so
// we don't re-assert it here.

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
 * Extract every event `name` emitted from `GameRoom.ts` via
 * `this.broadcast({ type: 'event', name: '…', data: … })`. The regex
 * spans multiple lines and is tolerant to trailing whitespace / data
 * shape variations.
 */
function extractBroadcastEventNames(source: string): Set<string> {
  const out = new Set<string>()
  // Match either:
  //   this.broadcast({ type: 'event', name: 'X', data: … })
  //   this.broadcast({ type: 'event', name: 'X' })
  const re = /broadcast\s*\(\s*\{\s*type\s*:\s*'event'\s*,\s*name\s*:\s*'([a-z_]+)'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) out.add(m[1])
  return out
}

/**
 * Extract every event name referenced by the trigger detector. Looks for
 * `currentState.status === '…'` isn't quite right (those are statuses);
 * we want explicit event-name references. The trigger module derives
 * sounds from STATE deltas rather than events directly, so we conservatively
 * extract nothing from it — but we DO track the consumed event-name
 * surface elsewhere.
 *
 * For this test we rely on state-delta derivations (triggers.ts) being
 * accepted as a "consumer" of the semantically-equivalent event. The
 * mapping from broadcast-event-name to state-delta is recorded inline.
 */

/**
 * Extract every `lastEvent.name === 'X'` / `event.name === 'X'` /
 * `ServerEvent.name === 'X'` literal from the web frontend.
 */
function extractLastEventRefs(source: string): Set<string> {
  const out = new Set<string>()
  const re = /(?:lastEvent|event|ev)\s*[?.]?\.name\s*===\s*'([a-z_]+)'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) out.add(m[1])
  return out
}

/** Walk every .ts / .tsx source file under a root. */
function walkSource(root: string): string[] {
  const files: string[] = []
  function recurse(dir: string) {
    for (const ent of readdirSync(dir)) {
      const full = join(dir, ent)
      if (ent === 'node_modules' || ent === 'dist') continue
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

// ─── Broadcast-event → state-delta mapping ──────────────────────────────────
//
// `detectAudioTriggers` consumes STATE DELTAS, not event names. This table
// documents which broadcast-event names are semantically covered by at least
// one state-delta check in the trigger detector. An entry here means
// "a consumer exists; the coupling is just not a string match".

const EVENT_COVERED_BY_STATE_DELTA: Record<string, string> = {
  // triggers.ts detects `prevState.status !== currentState.status` and
  // plays game_start / game_over sounds.
  game_start: 'triggers.ts: status transition → playing plays game_start',
  game_over: 'triggers.ts: status transition → game_over plays game_over sound + stopMusic',
  // `countdownRemaining` delta drives countdown_tick sound (fires on each
  // countdown transition 3→2→1).
  countdown_tick: 'triggers.ts: countdownRemaining delta plays countdown_tick',
  // NOTE on absent entries: several `ServerEvent` union members —
  // `alien_killed`, `wave_complete`, `player_died`, `player_respawned`,
  // `player_left`, `score_awarded`, `invasion`, `ufo_spawn` — are declared
  // in shared/protocol.ts but NOT currently broadcast by GameRoom.ts.
  // triggers.ts already derives the audio for those via state deltas, so
  // wiring a future broadcast is purely additive. The stale-entry guard
  // below will catch any drift if / when GameRoom starts broadcasting them
  // and we forget to promote the state-delta comment to an entry here.
}

// ─── Intentionally ignored events ──────────────────────────────────────────
//
// Broadcasts that are legitimately not consumed by the web frontend. Each
// entry has a written reason so a failing test points at "why is this
// legal", not just "it's legal".

const CLIENT_IGNORED_EVENTS: Record<string, string> = {
  // `player_joined` / `player_ready` / `player_unready` — the web re-renders
  // the lobby on every `sync` (full state), so the lobby roster & ready
  // column already reflect these changes. The event itself is server-side
  // diagnostics / future-hook ground.
  player_joined: 'Lobby re-renders from full sync state; explicit event consumption not needed',
  player_ready: 'Lobby re-renders readyPlayerIds from full sync; event is diagnostic',
  player_unready: 'Lobby re-renders readyPlayerIds from full sync; event is diagnostic',
  // `countdown_cancelled` transitions state.status back to 'waiting'; the
  // web re-renders from state, no explicit consumer needed.
  countdown_cancelled: 'Reflected via state.status transition back to waiting',
}

describe('worker → web server-event coverage', () => {
  const gameRoomSrc = read('worker/src/GameRoom.ts')
  const broadcastEvents = extractBroadcastEventNames(gameRoomSrc)

  // Collect every explicit `event.name === '…'` reference across the web +
  // client-core source tree.
  const webFiles = walkSource(join(repoRoot, 'web', 'src'))
  const coreFiles = walkSource(join(repoRoot, 'client-core', 'src'))
  const consumedRefs = new Set<string>()
  for (const f of [...webFiles, ...coreFiles]) {
    const body = readFileSync(f, 'utf8')
    for (const name of extractLastEventRefs(body)) consumedRefs.add(name)
  }

  it('baseline sanity: broadcast scraper finds the expected events', () => {
    // Pin non-emptiness so a broken regex fails loudly.
    expect(broadcastEvents.size).toBeGreaterThan(0)
    // Spot-check: these are long-standing names that should always appear.
    expect(broadcastEvents.has('game_start')).toBe(true)
    expect(broadcastEvents.has('game_over')).toBe(true)
    expect(broadcastEvents.has('countdown_tick')).toBe(true)
  })

  it('every worker broadcast event has a consumer, a state-delta derivation, or an explicit ignore', () => {
    const uncovered = [...broadcastEvents].filter(
      (name) =>
        !consumedRefs.has(name) &&
        !(name in EVENT_COVERED_BY_STATE_DELTA) &&
        !(name in CLIENT_IGNORED_EVENTS),
    )
    expect(uncovered).toEqual([])
  })

  it('state-delta coverage entries actually correspond to worker broadcasts', () => {
    // Stale coverage entries rot silently — a state-delta marked as
    // "covers X" that no longer corresponds to any X broadcast should fail.
    for (const name of Object.keys(EVENT_COVERED_BY_STATE_DELTA)) {
      expect(broadcastEvents.has(name)).toBe(true)
    }
  })

  it('CLIENT_IGNORED_EVENTS allowlist entries actually correspond to worker broadcasts', () => {
    for (const name of Object.keys(CLIENT_IGNORED_EVENTS)) {
      expect(broadcastEvents.has(name)).toBe(true)
    }
  })

  it('every consumed event reference is declared in the shared protocol', () => {
    // Fast catch for "consumer listens for an event the protocol doesn't
    // declare" — a typo that compiles because the protocol's ServerEvent
    // union is wide. We check that every scraped consumer name appears in
    // the protocol source, either as the actual event type or as a
    // scrapable literal.
    const protocolSrc = read('shared/protocol.ts')
    const missingInProtocol: string[] = []
    for (const name of consumedRefs) {
      if (!protocolSrc.includes(`'${name}'`)) {
        missingInProtocol.push(name)
      }
    }
    expect(missingInProtocol).toEqual([])
  })
})

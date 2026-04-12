// worker/src/logger.ts
// Structured "wide events" logger for Cloudflare Worker.
//
// Emits a single JSON line per meaningful state change, combining deployment
// metadata (version/commitHash/buildTime), region, timestamp, and caller-
// supplied fields. This satisfies the CLAUDE.md observability mandate:
// every log line MUST include roomCode, requestId, and deployment metadata.
//
// Design notes:
// - One log line per meaningful event, NOT per tick. The 30Hz game loop would
//   otherwise flood Logpush and blow costs. Use the existing DEBUG_TRACE path
//   in GameRoom.ts for per-message breadcrumbs.
// - `undefined` fields are stripped before emit so JSON output stays clean
//   and queryable in log aggregators (undefined → missing key, not "null").
// - Region is read lazily from `globalThis.CF_REGION` so a per-request middleware
//   can set it from `request.cf?.colo` without threading the value everywhere.

import { BUILD_INFO } from './buildInfo'

/**
 * Emit a single structured log event as one JSON line on stdout.
 *
 * The output is augmented with:
 *   - `event`    — the eventName
 *   - `version`, `commitHash`, `buildTime` — from ./buildInfo
 *   - `timestamp` — ISO-8601 at emit time
 *   - `region` — from globalThis.CF_REGION (may be undefined → omitted)
 *
 * Caller-supplied fields in `data` override nothing in the envelope; they are
 * merged alongside. `undefined` values (from either envelope or data) are
 * stripped before serialization so downstream log queries don't hit "null"
 * surprises.
 */
export function logEvent(eventName: string, data: Record<string, unknown>): void {
  const region = (globalThis as { CF_REGION?: string }).CF_REGION

  const envelope: Record<string, unknown> = {
    event: eventName,
    version: BUILD_INFO.version,
    commitHash: BUILD_INFO.commitHash,
    buildTime: BUILD_INFO.buildTime,
    timestamp: new Date().toISOString(),
    region,
    ...data,
  }

  // Strip undefined before emitting: JSON.stringify would omit them anyway,
  // but doing it explicitly makes the contract observable in tests and keeps
  // the output schema stable regardless of V8's stringify ordering quirks.
  for (const key of Object.keys(envelope)) {
    if (envelope[key] === undefined) {
      delete envelope[key]
    }
  }

  console.log(JSON.stringify(envelope))
}

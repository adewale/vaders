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
// - `region` (the edge colo) is a caller-supplied field passed explicitly in
//   `data`, threaded from the Worker entry's `request.cf?.colo` through RPC
//   contexts and the WS-upgrade header. It is NOT read from a global: a global
//   set in the Worker isolate is never visible inside a Durable Object's own
//   isolate (so DO logs would lack region) and is clobbered across concurrent
//   requests in one isolate.

import { BUILD_INFO } from './buildInfo'

/**
 * Emit a single structured log event as one JSON line on stdout.
 *
 * The output is augmented with:
 *   - `event`    — the eventName
 *   - `version`, `commitHash`, `buildTime` — from ./buildInfo
 *   - `timestamp` — ISO-8601 at emit time
 *
 * Caller-supplied fields in `data` (including `region`, `roomCode`, `requestId`)
 * are merged alongside. `undefined` values are stripped before serialization so
 * downstream log queries don't hit "null" surprises.
 */
export function logEvent(eventName: string, data: Record<string, unknown>): void {
  const envelope: Record<string, unknown> = {
    event: eventName,
    version: BUILD_INFO.version,
    commitHash: BUILD_INFO.commitHash,
    buildTime: BUILD_INFO.buildTime,
    timestamp: new Date().toISOString(),
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

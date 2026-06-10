// client-core/src/connection/liveness.ts
// Connection liveness model shared by the WebSocket hook's heartbeat watchdog.
//
// The watchdog must answer one question: "has this connection gone silent long
// enough that we should give up and reconnect?" The subtlety that caused a
// production bug is that *two* distinct events prove a connection is alive:
//   1. a `pong` arriving, and
//   2. the socket `open`ing (a brand-new socket has never received a pong, so
//      the previous socket's pong timestamp says nothing about it).
//
// Modelling "alive" as an explicit mark set on BOTH events makes the reset
// impossible to forget: staleness is always measured from the last proof of
// life, never from a timestamp belonging to a socket that is already gone.

/** Application-level heartbeat interval (browsers can't send protocol pings). */
export const PING_INTERVAL = 30000
/** Grace period after a missed ping before the connection is presumed dead. */
export const PONG_TIMEOUT = 5000
/** Total silence tolerated before the watchdog closes the socket. */
export const LIVENESS_TIMEOUT = PING_INTERVAL + PONG_TIMEOUT

/** Mutable liveness handle. `lastSeen` is the timestamp of the last proof of life. */
export interface Liveness {
  lastSeen: number
}

/** Create a liveness handle marked alive as of `now` (call when a socket opens). */
export function createLiveness(now: number): Liveness {
  return { lastSeen: now }
}

/**
 * Record a proof of life. Call on socket `open` AND on every `pong`. Both are
 * evidence the connection is reachable; either one resets the staleness clock.
 */
export function markAlive(liveness: Liveness, now: number): void {
  liveness.lastSeen = now
}

/**
 * True when the connection has been silent strictly longer than LIVENESS_TIMEOUT.
 * The boundary is inclusive-alive: exactly LIVENESS_TIMEOUT of silence is still
 * considered alive (matches the pre-existing watchdog threshold).
 */
export function isConnectionStale(liveness: Liveness, now: number): boolean {
  return now - liveness.lastSeen > LIVENESS_TIMEOUT
}

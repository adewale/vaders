// client-core/src/connection/liveness.test.ts
// Unit tests for the connection liveness model.
//
// Regression home for the "ping watchdog kills every reconnection" bug:
// the watchdog measured staleness from the last pong only, and the onopen
// handler never refreshed it — so a freshly reconnected socket inherited a
// stale pong timestamp from the dead socket and was closed ~30s later, every
// time, forever. The fix makes "alive" a first-class mark set on BOTH events
// that prove liveness (socket open AND pong), so the reset cannot be forgotten.

import { describe, test, expect } from 'bun:test'
import {
  PING_INTERVAL,
  PONG_TIMEOUT,
  LIVENESS_TIMEOUT,
  createLiveness,
  markAlive,
  isConnectionStale,
} from './liveness'

describe('liveness constants', () => {
  test('PING_INTERVAL is 30s and PONG_TIMEOUT is 5s', () => {
    expect(PING_INTERVAL).toBe(30000)
    expect(PONG_TIMEOUT).toBe(5000)
  })

  test('LIVENESS_TIMEOUT is the sum (35s)', () => {
    expect(LIVENESS_TIMEOUT).toBe(35000)
    expect(LIVENESS_TIMEOUT).toBe(PING_INTERVAL + PONG_TIMEOUT)
  })
})

describe('isConnectionStale — both directions', () => {
  test('fresh liveness is not stale at the first ping check', () => {
    const l = createLiveness(1000)
    // The watchdog runs one PING_INTERVAL after the mark; that is NOT stale.
    expect(isConnectionStale(l, 1000 + PING_INTERVAL)).toBe(false)
  })

  test('not stale exactly at the timeout boundary', () => {
    const l = createLiveness(0)
    expect(isConnectionStale(l, LIVENESS_TIMEOUT)).toBe(false)
  })

  test('stale once strictly past the timeout', () => {
    const l = createLiveness(0)
    expect(isConnectionStale(l, LIVENESS_TIMEOUT + 1)).toBe(true)
  })
})

describe('markAlive resets the staleness clock', () => {
  test('a pong refreshes liveness so an old socket stays open', () => {
    const l = createLiveness(0)
    expect(isConnectionStale(l, LIVENESS_TIMEOUT + 1)).toBe(true) // would close...
    markAlive(l, LIVENESS_TIMEOUT + 1) // ...but a pong just arrived
    expect(isConnectionStale(l, LIVENESS_TIMEOUT + 1)).toBe(false)
    expect(isConnectionStale(l, 2 * LIVENESS_TIMEOUT)).toBe(false)
  })

  test('REGRESSION: reopening marks alive, so a stale prior pong cannot close the new socket', () => {
    // Simulate the exact bug: a pong from a previous socket at t=1000, then a
    // long outage, then a reconnect 5 minutes later.
    const priorPong = 1000
    const reconnectAt = priorPong + 5 * 60_000

    const l = createLiveness(priorPong)
    // Without a reset, the watchdog would see the new socket as long-dead:
    expect(isConnectionStale(l, reconnectAt)).toBe(true)

    // onopen marks the connection alive — this is the fix.
    markAlive(l, reconnectAt)

    // The first watchdog tick is one ping interval after open: must NOT close.
    expect(isConnectionStale(l, reconnectAt + PING_INTERVAL)).toBe(false)
    // Only after a genuine silence past the timeout does it go stale again.
    expect(isConnectionStale(l, reconnectAt + LIVENESS_TIMEOUT + 1)).toBe(true)
  })
})

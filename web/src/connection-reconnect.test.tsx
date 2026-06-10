// web/src/connection-reconnect.test.tsx
// Integration regression for the "ping watchdog kills every reconnection" bug.
//
// This renders the REAL useGameConnection hook (from client-core) against a
// controllable mock WebSocket and fake timers, and asserts the hook does not
// inflict a spurious close on a freshly reconnected socket. A pure-math unit
// test (see client-core/src/connection/liveness.test.ts) cannot catch this —
// the bug was in the wiring (onopen forgetting to refresh liveness), so the
// regression must drive the wiring.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGameConnection } from '../../client-core/src/connection/useGameConnection'

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: MockWebSocket[] = []

  url: string
  readyState = MockWebSocket.CONNECTING
  onopen: ((e?: unknown) => void) | null = null
  onclose: ((e?: unknown) => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: ((e?: unknown) => void) | null = null
  send = vi.fn()
  close = vi.fn(() => {
    if (this.readyState === MockWebSocket.CLOSED) return
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({})
  })

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  // Test drivers
  open() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.({})
  }
  message(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }
}

describe('useGameConnection reconnect watchdog', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('does not self-close a freshly reconnected socket whose prior pong is stale', () => {
    renderHook(() => useGameConnection('ws://localhost/room/ABC123/ws', 'Alice'))

    const first = MockWebSocket.instances[0]
    expect(first).toBeDefined()
    act(() => first.open())
    // A pong establishes the liveness baseline on the first socket.
    act(() => first.message({ type: 'pong', serverTime: Date.now() }))

    // Outage: the socket drops after a long silence (well past the 35s window).
    act(() => {
      vi.advanceTimersByTime(60_000)
      first.close()
    })

    // Reconnect backoff elapses and a second socket is created.
    act(() => vi.advanceTimersByTime(2_000))
    const second = MockWebSocket.instances[1]
    expect(second).toBeDefined()

    // The reconnect opens. With the fix, onopen refreshes liveness here; the
    // stale baseline from `first` (now ~62s old) must NOT count against `second`.
    act(() => second.open())
    second.close.mockClear()

    // One full ping interval passes. The watchdog must send a heartbeat ping,
    // NOT close the healthy socket.
    act(() => vi.advanceTimersByTime(30_000))

    expect(second.close).not.toHaveBeenCalled()
    expect(second.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }))
  })

  it('still closes a genuinely silent socket after the timeout (watchdog not disabled)', () => {
    renderHook(() => useGameConnection('ws://localhost/room/ABC123/ws', 'Bob'))

    const ws = MockWebSocket.instances[0]
    act(() => ws.open())
    ws.close.mockClear()

    // No pong ever arrives. After PING_INTERVAL the watchdog sends a ping;
    // by the next interval (>35s of total silence) it must close.
    act(() => vi.advanceTimersByTime(30_000)) // first tick: sends ping
    expect(ws.close).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(30_000)) // second tick: 60s silent -> close
    expect(ws.close).toHaveBeenCalled()
  })
})

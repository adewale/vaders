// web/src/connection-message-diagnostics.test.tsx
// Regression: the WebSocket hook used to swallow malformed JSON and unknown
// server message types with an empty catch / no-op fall-through, giving zero
// signal when the protocol drifted (e.g. a server rollout sending a new type
// before the client understood it). The hook must not crash on bad input, and
// must emit a dev-visible warning rather than silently dropping it.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGameConnection } from '../../client-core/src/connection/useGameConnection'

class MockWebSocket {
  static OPEN = 1
  static CLOSED = 3
  static instances: MockWebSocket[] = []
  readyState = 0
  onopen: ((e?: unknown) => void) | null = null
  onclose: ((e?: unknown) => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: ((e?: unknown) => void) | null = null
  send = vi.fn()
  close = vi.fn()
  constructor(public url: string) {
    MockWebSocket.instances.push(this)
  }
  open() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.({})
  }
  raw(data: string) {
    this.onmessage?.({ data })
  }
}

describe('useGameConnection message diagnostics', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
    vi.unstubAllGlobals()
  })

  it('warns (and does not throw) on malformed JSON', () => {
    renderHook(() => useGameConnection('ws://localhost/room/ABC123/ws', 'Alice'))
    const ws = MockWebSocket.instances[0]
    act(() => ws.open())

    expect(() => act(() => ws.raw('this is not json {{{'))).not.toThrow()
    expect(warn).toHaveBeenCalled()
  })

  it('warns (and does not throw) on an unknown message type', () => {
    renderHook(() => useGameConnection('ws://localhost/room/ABC123/ws', 'Bob'))
    const ws = MockWebSocket.instances[0]
    act(() => ws.open())
    warn.mockClear()

    expect(() => act(() => ws.raw(JSON.stringify({ type: 'totally_new_server_type', payload: 1 })))).not.toThrow()
    expect(warn).toHaveBeenCalled()
  })

  it('does NOT warn on a well-formed known message (pong)', () => {
    renderHook(() => useGameConnection('ws://localhost/room/ABC123/ws', 'Carol'))
    const ws = MockWebSocket.instances[0]
    act(() => ws.open())
    warn.mockClear()

    act(() => ws.raw(JSON.stringify({ type: 'pong', serverTime: 123 })))
    expect(warn).not.toHaveBeenCalled()
  })
})

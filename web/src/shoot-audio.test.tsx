// shoot-audio.test.tsx
// Verifies the web frontend plays a local 'shoot' sound with stereo pan
// derived from the local player's x position when SPACE is pressed.
//
// This mirrors the TUI's `playShootSound()` call in `client/src/hooks/useGameAudio.ts`.
// The web GameContainer's keydown handler must both send the `shoot` protocol
// message AND fire `audio.play('shoot', { panX })` so local shots are audible.
//
// We mock `useGameConnection` (so no real WebSocket is opened) and
// `WebAudioAdapter` (so no real AudioContext is allocated), then assert the
// key handler wiring in App.tsx behaves as specified.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { GAME_STATE_DEFAULTS } from '../../shared/state-defaults'
import type { GameState, Player, PlayerSlot } from '../../shared/types'

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Shared spy handles exposed to the tests via the module mocks below. We
// declare them at module scope so the mock factories can close over them
// and tests can reach in to assert / reconfigure per test.
const playSpy = vi.fn()
const shootSpy = vi.fn()
const sendSpy = vi.fn()
const updateInputSpy = vi.fn()
let mockConnectionState: {
  serverState: GameState | null
  prevState: GameState | null
  playerId: string | null
  connected: boolean
  reconnecting: boolean
  error: string | null
  lastEvent: null
  gameResult: null
} = {
  serverState: null,
  prevState: null,
  playerId: null,
  connected: false,
  reconnecting: false,
  error: null,
  lastEvent: null,
  gameResult: null,
}

vi.mock('../../client-core/src/connection/useGameConnection', () => {
  return {
    useGameConnection: () => ({
      serverState: mockConnectionState.serverState,
      prevState: mockConnectionState.prevState,
      getRenderState: () => mockConnectionState.serverState,
      playerId: mockConnectionState.playerId,
      connected: mockConnectionState.connected,
      reconnecting: mockConnectionState.reconnecting,
      error: mockConnectionState.error,
      lastEvent: mockConnectionState.lastEvent,
      gameResult: mockConnectionState.gameResult,
      send: sendSpy,
      updateInput: updateInputSpy,
      shoot: shootSpy,
    }),
  }
})

vi.mock('./adapters/WebAudioAdapter', () => {
  // Fake WebAudioAdapter — records play() calls via the shared spy, no-ops
  // everything else. Constructor accepts (ctx?) to match the real signature.
  class FakeWebAudioAdapter {
    constructor(_ctx?: unknown) {
      // ignore
    }
    play = playSpy
    startMusic = vi.fn()
    stopMusic = vi.fn()
    resume = vi.fn()
    setMuted = vi.fn()
    isMuted = vi.fn(() => false)
    setMusicMuted = vi.fn()
    isMusicMuted = vi.fn(() => false)
    loadSamples = vi.fn(() => Promise.resolve())
  }
  return { WebAudioAdapter: FakeWebAudioAdapter }
})

// Stub navigator.clipboard so child components (LobbyScreen) don't throw
// during render. Not needed for this test's assertions but keeps the tree
// clean.
beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
})

// Import App AFTER vi.mock registrations. These are hoisted by vitest so
// the order actually does not matter — kept here for readability.
import { App } from './App'

// ─── Fixtures ──────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    name: 'Alice',
    x: 60,
    slot: 1 as PlayerSlot,
    color: 'cyan',
    lastShotTick: 0,
    alive: true,
    lives: 3,
    respawnAtTick: null,
    invulnerableUntilTick: null,
    kills: 0,
    inputState: { left: false, right: false },
    ...overrides,
  }
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    ...GAME_STATE_DEFAULTS,
    roomCode: 'ABC123',
    status: 'playing',
    ...overrides,
  }
}

function setConnection(opts: {
  serverState?: GameState | null
  prevState?: GameState | null
  playerId?: string | null
  connected?: boolean
}) {
  mockConnectionState = {
    ...mockConnectionState,
    serverState: opts.serverState ?? null,
    prevState: opts.prevState ?? null,
    playerId: opts.playerId ?? null,
    connected: opts.connected ?? true,
  }
}

function navigateToRoom(code: string = 'ABC123') {
  window.history.replaceState(null, '', `/room/${code}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function dispatchKey(key: string, type: 'keydown' | 'keyup' = 'keydown') {
  window.dispatchEvent(new KeyboardEvent(type, { key, cancelable: true }))
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('local shoot audio wiring', () => {
  beforeEach(() => {
    playSpy.mockClear()
    shootSpy.mockClear()
    sendSpy.mockClear()
    updateInputSpy.mockClear()
    mockConnectionState = {
      serverState: null,
      prevState: null,
      playerId: null,
      connected: false,
      reconnecting: false,
      error: null,
      lastEvent: null,
      gameResult: null,
    }
  })

  afterEach(() => {
    cleanup()
    window.history.replaceState(null, '', '/')
  })

  it('plays local shoot audio with panX≈0 when local player is centred (x=60)', () => {
    const player = makePlayer({ id: 'p1', x: 60 })
    setConnection({
      serverState: makeState({ players: { p1: player } }),
      playerId: 'p1',
      connected: true,
    })
    navigateToRoom()
    render(<App />)

    act(() => {
      dispatchKey(' ')
    })

    // Regression: the shoot protocol message still fires — audio is layered
    // on top, not a swap.
    expect(shootSpy).toHaveBeenCalledTimes(1)

    const shootCalls = playSpy.mock.calls.filter((c) => c[0] === 'shoot')
    expect(shootCalls).toHaveLength(1)
    const opts = shootCalls[0][1] as { panX?: number } | undefined
    expect(opts?.panX).toBeCloseTo(0, 5)
  })

  it('plays local shoot audio with panX≈-0.5 when player x=30 (left half)', () => {
    const player = makePlayer({ id: 'p1', x: 30 })
    setConnection({
      serverState: makeState({ players: { p1: player } }),
      playerId: 'p1',
      connected: true,
    })
    navigateToRoom()
    render(<App />)

    act(() => {
      dispatchKey(' ')
    })

    const shootCalls = playSpy.mock.calls.filter((c) => c[0] === 'shoot')
    expect(shootCalls).toHaveLength(1)
    const opts = shootCalls[0][1] as { panX?: number } | undefined
    expect(opts?.panX).toBeCloseTo(-0.5, 5)
  })

  it('plays local shoot audio with panX≈+0.5 when player x=90 (right half)', () => {
    const player = makePlayer({ id: 'p1', x: 90 })
    setConnection({
      serverState: makeState({ players: { p1: player } }),
      playerId: 'p1',
      connected: true,
    })
    navigateToRoom()
    render(<App />)

    act(() => {
      dispatchKey(' ')
    })

    const shootCalls = playSpy.mock.calls.filter((c) => c[0] === 'shoot')
    expect(shootCalls).toHaveLength(1)
    const opts = shootCalls[0][1] as { panX?: number } | undefined
    expect(opts?.panX).toBeCloseTo(0.5, 5)
  })

  it('clamps panX to [-1, +1] for extreme x positions', () => {
    // x=0 → (0/60)-1 = -1 ; x=120 → (120/60)-1 = +1. Both already on the
    // clamp boundary.
    const player = makePlayer({ id: 'p1', x: 0 })
    setConnection({
      serverState: makeState({ players: { p1: player } }),
      playerId: 'p1',
      connected: true,
    })
    navigateToRoom()
    render(<App />)

    act(() => {
      dispatchKey(' ')
    })

    const shootCalls = playSpy.mock.calls.filter((c) => c[0] === 'shoot')
    expect(shootCalls).toHaveLength(1)
    const opts = shootCalls[0][1] as { panX?: number } | undefined
    expect(opts?.panX).toBeGreaterThanOrEqual(-1)
    expect(opts?.panX).toBeLessThanOrEqual(1)
    expect(opts?.panX).toBeCloseTo(-1, 5)
  })

  it('does NOT play shoot audio when playerId is null', () => {
    // State exists but we don't know which slot is ours — pan would be
    // ambiguous, so skip the local audio entirely.
    setConnection({
      serverState: makeState({ players: {} }),
      playerId: null,
      connected: true,
    })
    navigateToRoom()
    render(<App />)

    act(() => {
      dispatchKey(' ')
    })

    // Protocol message still fires — the server will ignore it if the
    // handshake isn't complete, but the client shouldn't silently drop it.
    expect(shootSpy).toHaveBeenCalledTimes(1)
    const shootCalls = playSpy.mock.calls.filter((c) => c[0] === 'shoot')
    expect(shootCalls).toHaveLength(0)
  })

  it('does NOT play shoot audio when pressing other mapped keys', () => {
    const player = makePlayer({ id: 'p1', x: 60 })
    setConnection({
      serverState: makeState({ players: { p1: player } }),
      playerId: 'p1',
      connected: true,
    })
    navigateToRoom()
    render(<App />)

    act(() => {
      dispatchKey('ArrowLeft')
      dispatchKey('ArrowRight')
      dispatchKey('x') // forfeit
    })

    const shootCalls = playSpy.mock.calls.filter((c) => c[0] === 'shoot')
    expect(shootCalls).toHaveLength(0)
    expect(shootSpy).not.toHaveBeenCalled()
  })
})

// Manual-only: bun test ./client/src/App.render-check.tsx
// This real-render check is intentionally outside Bun's automatic test glob
// because it adds native-render CPU/time compared with the old source checks.
// Which screen the TUI shows for each GameStatus, observed by rendering the
// real <App> in OpenTUI's headless test renderer and reading the character
// frame. Guards the "no flash" contract: during countdown and wipe_hold the
// game screen (border + HUD) must not be drawn, and an auto-started solo game
// must not show the lobby while waiting for the server.
//
// Doubles: the WebSocket hook (a fake that holds server state in React state,
// as the real hook does), the audio hook (it spawns system audio players;
// sound is not under test here), and, in the solo test only, global fetch
// (the room-creation request).

import { describe, test, expect, mock, afterEach } from 'bun:test'
import { useState } from 'react'
import { GAME_STATE_DEFAULTS } from '../../shared/state-defaults'
import type { ClientMessage, GameState, GameStatus, Player } from '../../shared/types'

let initialState: GameState | null = null
let pushState: ((s: GameState) => void) | null = null
const sent: ClientMessage[] = []

mock.module('./hooks/useGameConnection', () => ({
  useGameConnection: () => {
    const [state, setState] = useState<GameState | null>(initialState)
    pushState = setState
    return {
      getRenderState: () => state,
      prevState: null,
      playerId: 'p1',
      connected: true,
      reconnecting: false,
      error: null,
      lastEvent: null,
      send: (msg: ClientMessage) => sent.push(msg),
      updateInput: () => {},
      move: () => {},
      shoot: () => {},
    }
  },
}))

mock.module('./hooks/useGameAudio', () => ({
  useGameAudio: () => {},
  playShootSound: () => {},
  playMenuNavigateSound: () => {},
  playMenuSelectSound: () => {},
}))

// @opentui/react/test-utils bundles its own copy of the renderer context, so
// App's useRenderer() cannot see it. Mount with the same createRoot App uses.
const { createTestRenderer } = await import('@opentui/core/testing')
const { createRoot } = await import('@opentui/react')
const { act } = await import('react')
const { App } = await import('./App')
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const alice: Player = {
  id: 'p1',
  name: 'Alice',
  x: 60,
  slot: 1,
  color: 'cyan',
  lastShotTick: 0,
  alive: true,
  lives: 3,
  respawnAtTick: null,
  invulnerableUntilTick: null,
  kills: 0,
  inputState: { left: false, right: false },
}

function stateFor(status: GameStatus): GameState {
  return {
    ...GAME_STATE_DEFAULTS,
    roomCode: 'TEST01',
    status,
    countdownRemaining: status === 'countdown' ? 3 : null,
    wipeWaveNumber: status.startsWith('wipe_') ? 2 : null,
    players: { p1: alice },
  }
}

let teardown: (() => void) | null = null
afterEach(() => {
  teardown?.()
  teardown = null
  initialState = null
  pushState = null
  sent.length = 0
})

async function mountApp(props: { roomCode?: string; solo?: boolean }) {
  const setup = await createTestRenderer({ width: 120, height: 36 })
  const root = createRoot(setup.renderer)
  act(() => {
    root.render(<App playerName="Alice" matchmake={false} solo={false} {...props} />)
  })
  teardown = () => {
    act(() => root.unmount())
    setup.renderer.destroy()
  }
  // Let App's effects run (room URL, fetch promise chains) and paint.
  const frame = async () => {
    await act(async () => {
      for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await act(() => setup.renderOnce())
    return setup.captureCharFrame()
  }
  return { frame }
}

// Text each screen prints (from the components), used as the screen's marker.
const LOBBY = 'Room: TEST01'
const COUNTDOWN = 'GET READY!'
const WAVE_BANNER = 'WAVE'
const GAME_HUD = 'SPACE Shoot'
const GAME_OVER = 'Final Score:'
const MARKERS = [LOBBY, COUNTDOWN, WAVE_BANNER, GAME_HUD, GAME_OVER]

const EXPECTED_SCREEN: Record<GameStatus, string> = {
  waiting: LOBBY,
  countdown: COUNTDOWN,
  wipe_hold: WAVE_BANNER,
  wipe_exit: GAME_HUD,
  wipe_reveal: GAME_HUD,
  playing: GAME_HUD,
  game_over: GAME_OVER,
}

function screensShown(frame: string): string[] {
  return MARKERS.filter((m) => frame.includes(m))
}

describe('TUI App renders one screen per GameStatus', () => {
  for (const [status, marker] of Object.entries(EXPECTED_SCREEN) as [GameStatus, string][]) {
    test(`${status} shows only its own screen`, async () => {
      initialState = stateFor(status)
      const app = await mountApp({ roomCode: 'TEST01' })
      expect(screensShown(await app.frame())).toEqual([marker])
    })
  }

  test('countdown shows the remaining seconds', async () => {
    initialState = stateFor('countdown')
    const app = await mountApp({ roomCode: 'TEST01' })
    const lines = (await app.frame()).split('\n').map((l) => l.trim())
    const nextText = lines.slice(lines.indexOf(COUNTDOWN) + 1).find(Boolean)
    expect(nextText).toBe('3')
  })
})

describe('TUI App status transitions never flash the game screen early', () => {
  async function trace(statuses: GameStatus[]): Promise<string[][]> {
    initialState = stateFor(statuses[0])
    const app = await mountApp({ roomCode: 'TEST01' })
    const shown = [screensShown(await app.frame())]
    for (const status of statuses.slice(1)) {
      act(() => pushState?.(stateFor(status)))
      shown.push(screensShown(await app.frame()))
    }
    return shown
  }

  test('co-op start: lobby → countdown → wave banner → game', async () => {
    expect(await trace(['waiting', 'countdown', 'wipe_hold', 'wipe_reveal', 'playing'])).toEqual([
      [LOBBY],
      [COUNTDOWN],
      [WAVE_BANNER],
      [GAME_HUD],
      [GAME_HUD],
    ])
  })

  test('next wave: game → (iris closes in game) → wave banner → game', async () => {
    expect(await trace(['playing', 'wipe_exit', 'wipe_hold', 'wipe_reveal', 'playing'])).toEqual([
      [GAME_HUD],
      [GAME_HUD],
      [WAVE_BANNER],
      [GAME_HUD],
      [GAME_HUD],
    ])
  })
})

describe('TUI App solo start', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  test('shows "Starting game..." instead of the lobby and asks the server to start', async () => {
    globalThis.fetch = (async () => Response.json({ roomCode: 'TEST01' })) as unknown as typeof fetch
    initialState = stateFor('waiting')
    const app = await mountApp({ solo: true })
    const frame = await app.frame()
    expect(frame).toContain('Starting game...')
    expect(screensShown(frame)).toEqual([])
    expect(sent).toEqual([{ type: 'start_solo' }])
  })
})

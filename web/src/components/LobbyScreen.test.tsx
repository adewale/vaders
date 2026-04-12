import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import fc from 'fast-check'
import { LobbyScreen } from './LobbyScreen'
import { PlayerShipIcon } from './PlayerShipIcon'
import type { GameState, PlayerSlot } from '../../../shared/types'
import { COLORS } from '../../../client-core/src/sprites/colors'

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    roomId: 'ABC123',
    status: 'waiting',
    mode: 'coop',
    wave: 1,
    score: 0,
    lives: 3,
    entities: [],
    players: {
      p1: { id: 'p1', name: 'Alice', slot: 1, color: 'cyan', kills: 0 } as any,
    },
    readyPlayerIds: [],
    ...overrides,
  } as any
}

describe('LobbyScreen', () => {
  const originalClipboard = navigator.clipboard
  let writeTextMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    })
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, href: 'http://localhost/room/ABC123' },
    })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    })
    cleanup()
    vi.useRealTimers()
  })

  it('renders a Copy Link button that copies the current URL to clipboard', async () => {
    render(
      <LobbyScreen state={makeState()} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />,
    )
    const btn = screen.getByRole('button', { name: /copy link/i })
    fireEvent.click(btn)
    expect(writeTextMock).toHaveBeenCalledWith('http://localhost/room/ABC123')
  })

  it('shows "Copied!" feedback after clicking Copy Link', async () => {
    render(
      <LobbyScreen state={makeState()} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />,
    )
    const btn = screen.getByRole('button', { name: /copy link/i })
    fireEvent.click(btn)
    await waitFor(() => {
      expect(screen.getByText(/copied!/i)).toBeDefined()
    })
  })

  it('renders a QR code element for the room URL', () => {
    render(
      <LobbyScreen state={makeState()} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />,
    )
    expect(screen.getByTestId('room-qr')).toBeDefined()
  })

  // ─── Slot-coloured player rows + empty seats ──────────────────────────────

  it('renders one lobby-player-row per player and fills the rest with lobby-empty-seat', () => {
    const state = makeState({
      players: {
        p1: { id: 'p1', name: 'Alice', slot: 1, color: 'cyan', kills: 0 } as any,
        p2: { id: 'p2', name: 'Bob', slot: 2, color: 'orange', kills: 0 } as any,
      },
    })
    render(<LobbyScreen state={state} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />)
    const rows = screen.getAllByTestId('lobby-player-row')
    expect(rows).toHaveLength(2)
    // Default coop mode derives 4 seats
    const empties = screen.getAllByTestId('lobby-empty-seat')
    expect(empties).toHaveLength(2)
  })

  it('gives player 1 row slot colour cyan and player 2 row slot colour orange', () => {
    const state = makeState({
      players: {
        p1: { id: 'p1', name: 'Alice', slot: 1, color: 'cyan', kills: 0 } as any,
        p2: { id: 'p2', name: 'Bob', slot: 2, color: 'orange', kills: 0 } as any,
      },
    })
    render(<LobbyScreen state={state} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />)
    const rows = screen.getAllByTestId('lobby-player-row')
    const p1Row = rows.find((r) => r.getAttribute('data-slot') === '1')!
    const p2Row = rows.find((r) => r.getAttribute('data-slot') === '2')!
    expect(p1Row.style.color).toBe(hexToRgb(COLORS.player[1]))
    expect(p2Row.style.color).toBe(hexToRgb(COLORS.player[2]))
  })

  it('appends "(you)" only on the row matching playerId', () => {
    const state = makeState({
      players: {
        p1: { id: 'p1', name: 'Alice', slot: 1, color: 'cyan', kills: 0 } as any,
        p2: { id: 'p2', name: 'Bob', slot: 2, color: 'orange', kills: 0 } as any,
      },
    })
    render(<LobbyScreen state={state} playerId="p2" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />)
    const rows = screen.getAllByTestId('lobby-player-row')
    const p1Row = rows.find((r) => r.getAttribute('data-slot') === '1')!
    const p2Row = rows.find((r) => r.getAttribute('data-slot') === '2')!
    expect(p2Row.textContent).toMatch(/\(you\)/)
    expect(p1Row.textContent).not.toMatch(/\(you\)/)
  })

  it('shows ✓ Ready for ready players and WAITING for unready', () => {
    const state = makeState({
      players: {
        p1: { id: 'p1', name: 'Alice', slot: 1, color: 'cyan', kills: 0 } as any,
        p2: { id: 'p2', name: 'Bob', slot: 2, color: 'orange', kills: 0 } as any,
      },
      readyPlayerIds: ['p1'],
    })
    render(<LobbyScreen state={state} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />)
    const rows = screen.getAllByTestId('lobby-player-row')
    const p1 = rows.find((r) => r.getAttribute('data-slot') === '1')!
    const p2 = rows.find((r) => r.getAttribute('data-slot') === '2')!
    expect(p1.textContent).toMatch(/Ready/)
    expect(p2.textContent).toMatch(/WAITING/)
  })

  it('renders solo mode with only 1 seat (0 empty if filled)', () => {
    const state = makeState({
      mode: 'solo',
      players: {
        p1: { id: 'p1', name: 'Alice', slot: 1, color: 'cyan', kills: 0 } as any,
      },
    })
    render(<LobbyScreen state={state} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />)
    expect(screen.getAllByTestId('lobby-player-row')).toHaveLength(1)
    expect(screen.queryAllByTestId('lobby-empty-seat')).toHaveLength(0)
  })

  it('honours state.config.maxPlayers when present', () => {
    const state = makeState({
      mode: 'coop',
      players: {
        p1: { id: 'p1', name: 'Alice', slot: 1, color: 'cyan', kills: 0 } as any,
      },
      config: { maxPlayers: 3 } as any,
    })
    render(<LobbyScreen state={state} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />)
    expect(screen.getAllByTestId('lobby-player-row')).toHaveLength(1)
    expect(screen.getAllByTestId('lobby-empty-seat')).toHaveLength(2)
  })

  // ─── Ready ticker ─────────────────────────────────────────────────────────

  it('renders a ticker showing "N/M ready" where M is max seats', () => {
    const state = makeState({
      players: {
        p1: { id: 'p1', name: 'Alice', slot: 1, color: 'cyan', kills: 0 } as any,
        p2: { id: 'p2', name: 'Bob', slot: 2, color: 'orange', kills: 0 } as any,
        p3: { id: 'p3', name: 'Cara', slot: 3, color: 'magenta', kills: 0 } as any,
      },
      readyPlayerIds: ['p1', 'p2'],
    })
    render(<LobbyScreen state={state} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />)
    const ticker = screen.getByTestId('lobby-ready-ticker')
    expect(ticker.textContent).toMatch(/2\/4 ready/)
  })

  it('ticker shows "Starting in X" during countdown', () => {
    const state = makeState({
      status: 'countdown',
      countdownRemaining: 3,
      players: {
        p1: { id: 'p1', name: 'Alice', slot: 1, color: 'cyan', kills: 0 } as any,
      },
      readyPlayerIds: ['p1'],
    })
    render(<LobbyScreen state={state} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />)
    const ticker = screen.getByTestId('lobby-ready-ticker')
    expect(ticker.textContent).toMatch(/Starting in 3/)
  })

  // ─── Property-based test ──────────────────────────────────────────────────

  it('[PBT] row counts and slot invariants hold for any combination of players', () => {
    const slotArb = fc.constantFrom<PlayerSlot>(1, 2, 3, 4)
    fc.assert(
      fc.property(
        fc.uniqueArray(slotArb, { minLength: 0, maxLength: 4 }),
        fc.constantFrom<'solo' | 'coop'>('solo', 'coop'),
        fc.integer({ min: 0, max: 4 }),
        (slots, mode, readyCountRaw) => {
          // Build players keyed by p<slot>, with unique IDs
          const players: Record<string, any> = {}
          for (const s of slots) {
            players[`p${s}`] = { id: `p${s}`, name: `P${s}`, slot: s, color: 'cyan', kills: 0 }
          }
          // In solo mode, at most 1 player is possible
          const effectivePlayers =
            mode === 'solo'
              ? slots.length > 0
                ? { p1: { id: 'p1', name: 'P1', slot: 1 as PlayerSlot, color: 'cyan', kills: 0 } }
                : {}
              : players
          const ids = Object.keys(effectivePlayers)
          const readyIds = ids.slice(0, Math.min(readyCountRaw, ids.length))
          const state = makeState({
            mode,
            players: effectivePlayers as any,
            readyPlayerIds: readyIds,
          })

          const { unmount } = render(
            <LobbyScreen
              state={state}
              playerId={ids[0] ?? null}
              onReady={() => {}}
              onUnready={() => {}}
              onStartSolo={() => {}}
            />,
          )

          const maxPlayers = mode === 'solo' ? 1 : 4
          const rows = screen.queryAllByTestId('lobby-player-row')
          const empties = screen.queryAllByTestId('lobby-empty-seat')

          const occupied = rows.length
          const empty = empties.length
          if (occupied + empty !== maxPlayers) {
            unmount()
            return false
          }

          // Slot uniqueness + in {1..4}
          const rowSlots = rows.map((r) => Number(r.getAttribute('data-slot')))
          const uniqueSlots = new Set(rowSlots)
          if (uniqueSlots.size !== rowSlots.length) {
            unmount()
            return false
          }
          for (const s of rowSlots) {
            if (!(s >= 1 && s <= 4)) {
              unmount()
              return false
            }
          }

          // Ticker ready count <= occupied
          const ticker = screen.getByTestId('lobby-ready-ticker')
          const match = ticker.textContent?.match(/(\d+)\/(\d+)/)
          if (match) {
            const rc = Number(match[1])
            if (rc > occupied) {
              unmount()
              return false
            }
          }

          unmount()
          return true
        },
      ),
      { numRuns: 30 },
    )
  })
})

describe('LobbyScreen - hints bar', () => {
  afterEach(() => cleanup())

  it('renders a HintsBar with role="lobby"', () => {
    render(
      <LobbyScreen state={makeState()} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />,
    )
    const bar = screen.getByTestId('hints-bar')
    expect(bar.getAttribute('data-role')).toBe('lobby')
  })

  it('includes ENTER, ESC, M, N, ? hints in the lobby hints bar', () => {
    render(
      <LobbyScreen state={makeState()} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />,
    )
    const bar = screen.getByTestId('hints-bar')
    const text = bar.textContent ?? ''
    expect(text).toContain('ENTER')
    expect(text).toContain('ESC')
    expect(text).toContain('M')
    expect(text).toContain('N')
    expect(text).toContain('?')
  })

  it('shows a Start Solo hint only in solo mode', () => {
    const soloState = makeState({
      mode: 'solo',
      players: {
        p1: { id: 'p1', name: 'Alice', slot: 1, color: 'cyan', kills: 0 } as any,
      },
    })
    const { unmount } = render(
      <LobbyScreen state={soloState} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />,
    )
    const barSolo = screen.getByTestId('hints-bar')
    expect((barSolo.textContent ?? '').toLowerCase()).toContain('start solo')
    unmount()

    render(
      <LobbyScreen
        state={makeState({ mode: 'coop' })}
        playerId="p1"
        onReady={() => {}}
        onUnready={() => {}}
        onStartSolo={() => {}}
      />,
    )
    const barCoop = screen.getByTestId('hints-bar')
    expect((barCoop.textContent ?? '').toLowerCase()).not.toContain('start solo')
  })
})

describe('PlayerShipIcon', () => {
  afterEach(() => cleanup())

  it('renders a canvas with the expected dimensions', () => {
    render(<PlayerShipIcon slot={1} />)
    const canvas = screen.getByTestId('player-ship-icon') as HTMLCanvasElement
    expect(canvas.tagName).toBe('CANVAS')
    expect(canvas.width).toBeGreaterThan(0)
    expect(canvas.height).toBeGreaterThan(0)
  })

  it('attempts to paint player sprite pixels into the canvas', () => {
    // Patch getContext to return a recording mock
    const fillRect = vi.fn()
    const ctxMock = {
      fillStyle: '#000',
      clearRect: vi.fn(),
      fillRect,
    }
    const original = HTMLCanvasElement.prototype.getContext
    ;(HTMLCanvasElement.prototype as any).getContext = vi.fn(() => ctxMock)
    try {
      render(<PlayerShipIcon slot={2} />)
      expect(fillRect).toHaveBeenCalled()
    } finally {
      HTMLCanvasElement.prototype.getContext = original
    }
  })

  it('uses the slot colour when painting (fillStyle observed at paint time)', () => {
    const painted: string[] = []
    let current = '#000' as string
    const ctxMock = {
      get fillStyle() {
        return current
      },
      set fillStyle(v: string) {
        current = v
      },
      clearRect: vi.fn(),
      fillRect: vi.fn(() => {
        painted.push(current)
      }),
    }
    const original = HTMLCanvasElement.prototype.getContext
    ;(HTMLCanvasElement.prototype as any).getContext = vi.fn(() => ctxMock)
    try {
      render(<PlayerShipIcon slot={3} />)
      // Player slot 3 is magenta (#ff55ff)
      expect(painted.some((c) => c.toLowerCase() === COLORS.player[3].toLowerCase())).toBe(true)
    } finally {
      HTMLCanvasElement.prototype.getContext = original
    }
  })
})

/** Convert hex "#rrggbb" to "rgb(r, g, b)" for comparison with element.style.color */
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const r = Number.parseInt(h.slice(0, 2), 16)
  const g = Number.parseInt(h.slice(2, 4), 16)
  const b = Number.parseInt(h.slice(4, 6), 16)
  return `rgb(${r}, ${g}, ${b})`
}

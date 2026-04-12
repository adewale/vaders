import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import fc from 'fast-check'
import { LobbyScreen } from './LobbyScreen'
import { PlayerShipIcon } from './PlayerShipIcon'
import type { GameState, PlayerSlot } from '../../../shared/types'
import { COLORS } from '../../../client-core/src/sprites/colors'

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    roomCode: 'ABC123',
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

  it('ticker denominator is current playerCount, NOT room max — prevents the "I need 4 players to play" misread', () => {
    // Regression: the previous ticker read "2/4 ready" using the room cap
    // as the denominator, so a player who matchmaked alone saw "1/4 ready
    // — starting when all ready" and reasonably concluded they needed
    // four players. The server's actual start condition is ≥2 players
    // all ready, so the denominator must reflect the current player count.
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
    expect(ticker.textContent).toMatch(/2\/3 ready/)
    expect(ticker.textContent).not.toMatch(/2\/4 ready/)
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

  it('ticker says "Waiting for another player…" when alone in a coop room (no 1/1 display)', () => {
    // Regression: the previous ticker read "1/4 ready — starting when
    // all ready" when matchmaked alone. The TUI handles this by hiding
    // the ready ticker entirely when playerCount === 1. The web variant
    // shows an unambiguous "Waiting for another player" message instead,
    // so the user knows exactly what blocks progress.
    const state = makeState({
      mode: 'coop',
      players: {
        p1: { id: 'p1', name: 'Alice', slot: 1, color: 'cyan', kills: 0 } as any,
      },
      readyPlayerIds: ['p1'],
    })
    render(<LobbyScreen state={state} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />)
    const ticker = screen.getByTestId('lobby-ready-ticker')
    const text = ticker.textContent ?? ''
    expect(text.toLowerCase()).toContain('waiting for another player')
    expect(text).not.toMatch(/\d+\/\d+ ready/)
    expect(text).not.toMatch(/\/4/)
  })

  it('Ready button has "(wait for others)" subtitle when alone — mirrors TUI', () => {
    // TUI's lobby shows "Ready Up (wait for others)" when playerCount
    // === 1 so the user understands what Ready does in an empty room.
    // Web mirrors this.
    const state = makeState({
      mode: 'coop',
      players: {
        p1: { id: 'p1', name: 'Alice', slot: 1, color: 'cyan', kills: 0 } as any,
      },
    })
    render(<LobbyScreen state={state} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />)
    const readyBtn = screen.getByRole('button', { name: /ready/i })
    const text = readyBtn.textContent ?? ''
    expect(text.toLowerCase()).toContain('wait for others')
  })

  it('Ready button has no "(wait for others)" subtitle when ≥2 players', () => {
    // Negative of the above.
    const state = makeState({
      mode: 'coop',
      players: {
        p1: { id: 'p1', name: 'Alice', slot: 1, color: 'cyan', kills: 0 } as any,
        p2: { id: 'p2', name: 'Bob', slot: 2, color: 'orange', kills: 0 } as any,
      },
    })
    render(<LobbyScreen state={state} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />)
    const readyBtn = screen.getByRole('button', { name: /ready/i })
    const text = readyBtn.textContent ?? ''
    expect(text.toLowerCase()).not.toContain('wait for others')
  })

  it('Start Solo button visible when playerCount === 1 regardless of state.mode (escape hatch)', () => {
    // Regression: previously the Start Solo button only rendered when
    // state.mode === 'solo'. After matchmaking, mode === 'coop', so a
    // user stuck alone had no way to bail out to solo without leaving
    // the lobby entirely. Now: the button is the escape hatch.
    const state = makeState({
      mode: 'coop', // matchmaked alone
      players: {
        p1: { id: 'p1', name: 'Alice', slot: 1, color: 'cyan', kills: 0 } as any,
      },
    })
    render(<LobbyScreen state={state} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />)
    const startSoloBtn = screen.queryByRole('button', { name: /start solo/i })
    expect(startSoloBtn).not.toBeNull()
  })

  it('Start Solo button hidden when ≥2 players (coop IS an option — no escape needed)', () => {
    // Negative: two or more players means coop is live; the Start Solo
    // button would be misleading.
    const state = makeState({
      mode: 'coop',
      players: {
        p1: { id: 'p1', name: 'Alice', slot: 1, color: 'cyan', kills: 0 } as any,
        p2: { id: 'p2', name: 'Bob', slot: 2, color: 'orange', kills: 0 } as any,
      },
    })
    render(<LobbyScreen state={state} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />)
    const startSoloBtn = screen.queryByRole('button', { name: /start solo/i })
    expect(startSoloBtn).toBeNull()
  })

  it('Start Solo click invokes onStartSolo handler', () => {
    const onStartSolo = vi.fn()
    const state = makeState({
      mode: 'coop',
      players: {
        p1: { id: 'p1', name: 'Alice', slot: 1, color: 'cyan', kills: 0 } as any,
      },
    })
    render(<LobbyScreen state={state} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={onStartSolo} />)
    fireEvent.click(screen.getByRole('button', { name: /start solo/i }))
    expect(onStartSolo).toHaveBeenCalledTimes(1)
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

  it('shows a Start Solo hint whenever playerCount === 1 (solo OR coop-alone)', () => {
    // Updated from "shows a Start Solo hint only in solo mode". The hint
    // is the keyboard mirror of the Start Solo button, which is now an
    // escape hatch for matchmaked-alone players (coop mode, 1 player).
    const soloState = makeState({
      mode: 'solo',
      players: {
        p1: { id: 'p1', name: 'Alice', slot: 1, color: 'cyan', kills: 0 } as any,
      },
    })
    const { unmount: unmountSolo } = render(
      <LobbyScreen state={soloState} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />,
    )
    expect((screen.getByTestId('hints-bar').textContent ?? '').toLowerCase()).toContain('start solo')
    unmountSolo()

    // Coop-alone: also shows the hint (the regression fix).
    const coopAloneState = makeState({
      mode: 'coop',
      players: {
        p1: { id: 'p1', name: 'Alice', slot: 1, color: 'cyan', kills: 0 } as any,
      },
    })
    const { unmount: unmountCoopAlone } = render(
      <LobbyScreen state={coopAloneState} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />,
    )
    expect((screen.getByTestId('hints-bar').textContent ?? '').toLowerCase()).toContain('start solo')
    unmountCoopAlone()

    // Coop with ≥2 players: hint hidden (no escape needed).
    const coopFullState = makeState({
      mode: 'coop',
      players: {
        p1: { id: 'p1', name: 'Alice', slot: 1, color: 'cyan', kills: 0 } as any,
        p2: { id: 'p2', name: 'Bob', slot: 2, color: 'orange', kills: 0 } as any,
      },
    })
    render(
      <LobbyScreen state={coopFullState} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />,
    )
    expect((screen.getByTestId('hints-bar').textContent ?? '').toLowerCase()).not.toContain('start solo')
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

// ─── #12 Caption casing consistency (lobby) ────────────────────────────────
//
// "Room:" and "Players (X/Y):" share a panel. We enforce sentence-case so
// that drift ("Room: ABC" + "Players (2/4):" side-by-side with a future
// "Match Time:" doesn't sneak in). ALL CAPS heading "LOBBY" is excluded —
// it's intentional emphasis at a different tier.

/**
 * Same sentence-case predicate used in GameOverScreen.test.tsx. Kept local
 * to each test file so each suite can evolve its captions independently
 * without cross-file test coupling.
 *
 * Rule:
 *   - First word starts uppercase AND (if length ≥ 2) contains at least
 *     one lowercase letter — this rejects ALL-CAPS single words like
 *     "LOBBY" / "ROOM".
 *   - No subsequent word of length ≥ 2 starts with an uppercase letter.
 */
function isSentenceCase(label: string): boolean {
  const trimmed = label.trim()
  if (trimmed.length === 0) return false
  const words = trimmed.split(/\s+/)
  const first = words[0]
  if (first.length === 0) return false
  const firstChar = first[0]
  if (!(firstChar >= 'A' && firstChar <= 'Z')) return false
  if (first.length >= 2) {
    const hasLower = /[a-z]/.test(first.slice(1))
    if (!hasLower) return false
  }
  for (let i = 1; i < words.length; i++) {
    const w = words[i]
    if (w.length < 2) continue
    const c = w[0]
    if (c >= 'A' && c <= 'Z') return false
  }
  return true
}

describe('LobbyScreen - caption casing (#12)', () => {
  afterEach(() => cleanup())

  it('Room and Players captions are sentence-case', () => {
    const state = makeState({
      mode: 'coop',
      players: {
        p1: { id: 'p1', name: 'Alice', slot: 1, color: 'cyan', kills: 0 } as any,
        p2: { id: 'p2', name: 'Bob', slot: 2, color: 'orange', kills: 0 } as any,
      },
    })
    render(<LobbyScreen state={state} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />)
    const body = document.body.textContent ?? ''
    // "Room:" caption (value is the room code — dynamic)
    expect(body).toMatch(/Room:\s/)
    // "Players (X/Y):" caption — X and Y are dynamic but the word is fixed
    expect(body).toMatch(/Players \(\d+\/\d+\):/)
    // Check the fixed word parts explicitly with the shared helper.
    for (const caption of ['Room', 'Players']) {
      expect(isSentenceCase(caption)).toBe(true)
    }
  })

  it('negative: ALL CAPS "LOBBY" heading is not flagged', () => {
    expect(isSentenceCase('LOBBY')).toBe(false)
  })

  it('negative: "Room" / "Players" Title Case drift would be rejected', () => {
    // These are the variations we want future drift to fail on. They are
    // not in the current DOM; the negative check keeps the predicate honest.
    expect(isSentenceCase('ROOM')).toBe(false)
  })

  it('ALL CAPS "LOBBY" heading still renders (casing rule is caption-only)', () => {
    render(
      <LobbyScreen state={makeState()} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />,
    )
    const body = document.body.textContent ?? ''
    expect(body).toContain('LOBBY')
  })
})

// ─── #13 Empty-seat vs filled-row font consistency ─────────────────────────
//
// Filled rows inherit var(--font-body); empty seats previously hard-coded
// `fontFamily: 'monospace'` on the [—] / ───── / [ ] spans. The mismatch
// read as two visually different fonts in the same column. Assert that
// spans inside `lobby-empty-seat` do NOT set their own fontFamily, so
// both row types resolve to the same body font.

describe('LobbyScreen - empty-seat font consistency (#13)', () => {
  afterEach(() => cleanup())

  it('empty-seat spans do not hard-code font-family: monospace', () => {
    const state = makeState({
      mode: 'coop',
      players: {
        p1: { id: 'p1', name: 'Alice', slot: 1, color: 'cyan', kills: 0 } as any,
      },
    })
    render(<LobbyScreen state={state} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />)
    const empties = screen.getAllByTestId('lobby-empty-seat')
    // 1 filled + 3 empty in a 4-seat coop lobby
    expect(empties.length).toBeGreaterThanOrEqual(1)
    for (const seat of empties) {
      // The empty-seat container itself must not set a font-family.
      expect(seat.style.fontFamily).toBe('')
      // Any descendant span also must not explicitly set fontFamily:
      // monospace — the whole point is that empty seats inherit the body
      // font just like filled rows.
      const spans = seat.querySelectorAll('span')
      for (const span of Array.from(spans)) {
        const fontFamily = (span as HTMLElement).style.fontFamily
        expect(fontFamily.toLowerCase()).not.toContain('monospace')
      }
    }
  })

  it('filled rows do not set an explicit font-family (inherit body font)', () => {
    const state = makeState({
      mode: 'coop',
      players: {
        p1: { id: 'p1', name: 'Alice', slot: 1, color: 'cyan', kills: 0 } as any,
      },
    })
    render(<LobbyScreen state={state} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />)
    const rows = screen.getAllByTestId('lobby-player-row')
    expect(rows).toHaveLength(1)
    // Filled row itself has no font-family override (inherits from the
    // vaders-screen container which sets var(--font-body)).
    expect(rows[0].style.fontFamily).toBe('')
  })

  it('filled rows and empty seats share the same font-family policy', () => {
    // Positive symmetry: whatever font-family is on a filled row must also
    // be on an empty-seat row (currently both are "" so both inherit).
    const state = makeState({
      mode: 'coop',
      players: {
        p1: { id: 'p1', name: 'Alice', slot: 1, color: 'cyan', kills: 0 } as any,
      },
    })
    render(<LobbyScreen state={state} playerId="p1" onReady={() => {}} onUnready={() => {}} onStartSolo={() => {}} />)
    const rows = screen.getAllByTestId('lobby-player-row')
    const empties = screen.getAllByTestId('lobby-empty-seat')
    const rowFont = rows[0].style.fontFamily
    for (const seat of empties) {
      expect(seat.style.fontFamily).toBe(rowFont)
    }
  })
})

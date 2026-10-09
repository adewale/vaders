import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import fc from 'fast-check'
import { GameOverScreen } from './GameOverScreen'
import type { GameState, Player, PlayerSlot } from '../../../shared/types'
import { COLORS } from '../../../client-core/src/sprites/colors'

function makePlayer(overrides: Partial<Player> & { id: string; slot: PlayerSlot }): Player {
  const slotColorMap: Record<PlayerSlot, Player['color']> = {
    1: 'cyan',
    2: 'orange',
    3: 'magenta',
    4: 'lime',
  }
  // Defaults first, overrides applied via spread at the end. The spread
  // provides `id` and `slot` (both required on the argument type), so we
  // don't re-list them here — TypeScript flags the duplicate keys if we do.
  return {
    name: `P${overrides.slot}`,
    x: 60,
    color: slotColorMap[overrides.slot],
    lastShotTick: 0,
    alive: true,
    lives: 3,
    respawnAtTick: null,
    invulnerableUntilTick: null,
    kills: 0,
    inputState: { left: false, right: false },
    ...overrides,
  } as Player
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    roomCode: 'ABC123',
    status: 'game_over',
    mode: 'solo',
    wave: 4,
    score: 1250,
    lives: 0,
    entities: [],
    players: {
      p1: { id: 'p1', name: 'Alice', color: 'cyan', kills: 7 } as any,
    },
    readyPlayerIds: [],
    ...overrides,
  } as any
}

describe('GameOverScreen - share score', () => {
  let openSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    openSpy = vi.fn().mockReturnValue(null)
    // Override window.open so TS doesn't complain about spyOn overload types.
    Object.defineProperty(window, 'open', {
      configurable: true,
      writable: true,
      value: openSpy,
    })
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, href: 'http://vaders.example.com/' },
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders a Share Score button', () => {
    render(<GameOverScreen state={makeState()} playerId="p1" onReplay={() => {}} onQuit={() => {}} />)
    expect(screen.getByRole('button', { name: /share score/i })).toBeDefined()
  })

  it('opens twitter intent with correct text when clicked', () => {
    render(<GameOverScreen state={makeState()} playerId="p1" onReplay={() => {}} onQuit={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /share score/i }))
    expect(openSpy).toHaveBeenCalled()
    const [url, target] = openSpy.mock.calls[0]
    expect(String(url)).toContain('twitter.com/intent/tweet')
    const decoded = decodeURIComponent(String(url))
    expect(decoded).toContain('1250')
    expect(decoded).toContain('wave 4')
    expect(decoded).toContain('http://vaders.example.com/')
    expect(target).toBe('_blank')
  })
})

describe('GameOverScreen - keyboard shortcuts', () => {
  let openSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    openSpy = vi.fn().mockReturnValue(null)
    Object.defineProperty(window, 'open', {
      configurable: true,
      writable: true,
      value: openSpy,
    })
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, href: 'http://vaders.example.com/' },
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders keyboard hint row with R, X, Q', () => {
    render(<GameOverScreen state={makeState()} playerId="p1" onReplay={() => {}} onQuit={() => {}} />)
    const hints = screen.getByTestId('hints-bar')
    expect(hints).toBeDefined()
    expect(hints.getAttribute('data-role')).toBe('game-over')
    const text = hints.textContent ?? ''
    expect(text).toContain('R')
    expect(text).toContain('ENTER')
    expect(text).toContain('X')
    expect(text).toContain('Q')
    expect(text).toContain('ESC')
    expect(text).toContain('?')
  })

  it('pressing R calls onReplay', () => {
    const onReplay = vi.fn()
    render(<GameOverScreen state={makeState()} playerId="p1" onReplay={onReplay} onQuit={() => {}} />)
    fireEvent.keyDown(window, { key: 'r' })
    expect(onReplay).toHaveBeenCalledTimes(1)
  })

  it('pressing Enter calls onReplay', () => {
    const onReplay = vi.fn()
    render(<GameOverScreen state={makeState()} playerId="p1" onReplay={onReplay} onQuit={() => {}} />)
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onReplay).toHaveBeenCalledTimes(1)
  })

  it('pressing Q calls onQuit', () => {
    const onQuit = vi.fn()
    render(<GameOverScreen state={makeState()} playerId="p1" onReplay={() => {}} onQuit={onQuit} />)
    fireEvent.keyDown(window, { key: 'q' })
    expect(onQuit).toHaveBeenCalledTimes(1)
  })

  it('pressing Escape calls onQuit', () => {
    const onQuit = vi.fn()
    render(<GameOverScreen state={makeState()} playerId="p1" onReplay={() => {}} onQuit={onQuit} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onQuit).toHaveBeenCalledTimes(1)
  })

  it('pressing X calls share handler', () => {
    render(<GameOverScreen state={makeState()} playerId="p1" onReplay={() => {}} onQuit={() => {}} />)
    fireEvent.keyDown(window, { key: 'x' })
    expect(openSpy).toHaveBeenCalled()
    const [url] = openSpy.mock.calls[0]
    expect(String(url)).toContain('twitter.com/intent/tweet')
  })

  it('keyboard listener is removed on unmount', () => {
    const onReplay = vi.fn()
    const onQuit = vi.fn()
    const { unmount } = render(<GameOverScreen state={makeState()} playerId="p1" onReplay={onReplay} onQuit={onQuit} />)
    unmount()
    fireEvent.keyDown(window, { key: 'r' })
    fireEvent.keyDown(window, { key: 'q' })
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'x' })
    expect(onReplay).not.toHaveBeenCalled()
    expect(onQuit).not.toHaveBeenCalled()
    expect(openSpy).not.toHaveBeenCalled()
  })
})

// Normalises CSS color strings (e.g. "rgb(0, 255, 255)" vs "#00ffff") into the
// 6-digit lowercase hex form that COLORS.player[slot] uses, so we can assert on
// the exact colour without worrying about how jsdom serialises styles.
function normaliseColor(value: string | undefined | null): string | null {
  if (!value) return null
  const trimmed = value.trim().toLowerCase()
  if (trimmed.startsWith('#')) {
    if (trimmed.length === 4) {
      // Expand #rgb → #rrggbb
      return (
        '#' +
        trimmed
          .slice(1)
          .split('')
          .map((c) => c + c)
          .join('')
      )
    }
    return trimmed
  }
  const rgb = trimmed.match(/^rgba?\(([^)]+)\)$/)
  if (rgb) {
    const parts = rgb[1].split(',').map((s) => Number.parseInt(s.trim(), 10))
    const [r, g, b] = parts
    const hex = (n: number) => n.toString(16).padStart(2, '0')
    return `#${hex(r)}${hex(g)}${hex(b)}`
  }
  return trimmed
}

describe('GameOverScreen - leaderboard', () => {
  afterEach(() => cleanup())

  it('renders a leaderboard container with one row per player', () => {
    const state = makeState({
      mode: 'coop',
      players: {
        p1: makePlayer({ id: 'p1', slot: 1, name: 'Alice', kills: 7 }),
        p2: makePlayer({ id: 'p2', slot: 2, name: 'Bob', kills: 3 }),
        p3: makePlayer({ id: 'p3', slot: 3, name: 'Cleo', kills: 5 }),
      },
    })
    render(<GameOverScreen state={state} playerId="p1" onReplay={() => {}} onQuit={() => {}} />)
    expect(screen.getByTestId('leaderboard')).toBeDefined()
    const rows = screen.getAllByTestId('leaderboard-row')
    expect(rows).toHaveLength(3)
  })

  it('orders rows by kills descending', () => {
    const state = makeState({
      mode: 'coop',
      players: {
        p1: makePlayer({ id: 'p1', slot: 1, name: 'Alice', kills: 7 }),
        p2: makePlayer({ id: 'p2', slot: 2, name: 'Bob', kills: 3 }),
        p3: makePlayer({ id: 'p3', slot: 3, name: 'Cleo', kills: 12 }),
      },
    })
    render(<GameOverScreen state={state} playerId="p1" onReplay={() => {}} onQuit={() => {}} />)
    const rows = screen.getAllByTestId('leaderboard-row')
    const slots = rows.map((r) => r.getAttribute('data-slot'))
    expect(slots).toEqual(['3', '1', '2']) // kills 12, 7, 3
  })

  it('gives the top scorer a trophy and others numeric ranks', () => {
    const state = makeState({
      mode: 'coop',
      players: {
        p1: makePlayer({ id: 'p1', slot: 1, name: 'Alice', kills: 7 }),
        p2: makePlayer({ id: 'p2', slot: 2, name: 'Bob', kills: 3 }),
        p3: makePlayer({ id: 'p3', slot: 3, name: 'Cleo', kills: 5 }),
      },
    })
    render(<GameOverScreen state={state} playerId="p1" onReplay={() => {}} onQuit={() => {}} />)
    const rows = screen.getAllByTestId('leaderboard-row')
    // Row 0 is the top scorer (Alice, 7 kills) -> trophy
    expect(rows[0].textContent).toContain('🏆')
    expect(rows[0].getAttribute('data-rank')).toBe('1')
    // Row 1 (Cleo, 5 kills) -> "2."
    expect(rows[1].textContent).toContain('2.')
    expect(rows[1].textContent).not.toContain('🏆')
    expect(rows[1].getAttribute('data-rank')).toBe('2')
    // Row 2 (Bob, 3 kills) -> "3."
    expect(rows[2].textContent).toContain('3.')
    expect(rows[2].getAttribute('data-rank')).toBe('3')
  })

  it('awards a trophy to every player tied for first', () => {
    const state = makeState({
      mode: 'coop',
      players: {
        p1: makePlayer({ id: 'p1', slot: 1, name: 'Alice', kills: 7 }),
        p2: makePlayer({ id: 'p2', slot: 2, name: 'Bob', kills: 7 }),
        p3: makePlayer({ id: 'p3', slot: 3, name: 'Cleo', kills: 7 }),
        p4: makePlayer({ id: 'p4', slot: 4, name: 'Dan', kills: 2 }),
      },
    })
    render(<GameOverScreen state={state} playerId="p1" onReplay={() => {}} onQuit={() => {}} />)
    const rows = screen.getAllByTestId('leaderboard-row')
    expect(rows).toHaveLength(4)
    // First three all tied at 7 kills -> all trophy, rank 1
    for (let i = 0; i < 3; i++) {
      expect(rows[i].textContent).toContain('🏆')
      expect(rows[i].getAttribute('data-rank')).toBe('1')
    }
    // Dan (kills 2) -> rank 4 (dense ranking: 1,1,1,4)
    expect(rows[3].textContent).not.toContain('🏆')
    expect(rows[3].textContent).toContain('4.')
    expect(rows[3].getAttribute('data-rank')).toBe('4')
  })

  it('heading reads "MATCH SCOREBOARD" — not "LEADERBOARD" (per-match, not historical)', () => {
    // The previous heading "LEADERBOARD" implied cross-game persistence —
    // users reasonably expected accumulated scores across multiple plays.
    // The implementation is a per-match ranking of state.players only, so
    // the label now matches the scope.
    const state = makeState({
      mode: 'coop',
      players: {
        p1: makePlayer({ id: 'p1', slot: 1, name: 'Alice', kills: 7 }),
        p2: makePlayer({ id: 'p2', slot: 2, name: 'Bob', kills: 3 }),
      },
    })
    render(<GameOverScreen state={state} playerId="p1" onReplay={() => {}} onQuit={() => {}} />)
    const section = screen.getByTestId('leaderboard')
    const text = section.textContent ?? ''
    expect(text.toUpperCase()).toContain('MATCH SCOREBOARD')
    expect(text.toUpperCase()).not.toContain('LEADERBOARD')
  })

  it('kill caption reads "Aliens destroyed this run" — not a cumulative stat', () => {
    // Same lesson: "Aliens destroyed: 42" reads as an accumulated career
    // stat. Scope it to the current run so it can't be misread.
    const state = makeState({
      mode: 'solo',
      players: {
        p1: makePlayer({ id: 'p1', slot: 1, name: 'Alice', kills: 42 }),
      },
    })
    render(<GameOverScreen state={state} playerId="p1" onReplay={() => {}} onQuit={() => {}} />)
    // The caption lives outside the scoreboard block but on the game-over
    // screen. Looking for the exact phrase is enough — the old wording
    // ("Aliens destroyed: ...") must not appear verbatim.
    const body = document.body.textContent ?? ''
    expect(body).toContain('Aliens destroyed this run')
    // Guard against the old unqualified phrasing reappearing.
    expect(body).not.toMatch(/Aliens destroyed:\s*\d/)
  })

  it('uses dense ranking for ties below first (1, 2, 2, 4)', () => {
    const state = makeState({
      mode: 'coop',
      players: {
        p1: makePlayer({ id: 'p1', slot: 1, name: 'Alice', kills: 10 }),
        p2: makePlayer({ id: 'p2', slot: 2, name: 'Bob', kills: 5 }),
        p3: makePlayer({ id: 'p3', slot: 3, name: 'Cleo', kills: 5 }),
        p4: makePlayer({ id: 'p4', slot: 4, name: 'Dan', kills: 1 }),
      },
    })
    render(<GameOverScreen state={state} playerId="p1" onReplay={() => {}} onQuit={() => {}} />)
    const rows = screen.getAllByTestId('leaderboard-row')
    expect(rows[0].getAttribute('data-rank')).toBe('1')
    expect(rows[1].getAttribute('data-rank')).toBe('2')
    expect(rows[2].getAttribute('data-rank')).toBe('2')
    expect(rows[3].getAttribute('data-rank')).toBe('4')
  })

  it('renders a slot badge [N] in the slot colour', () => {
    const state = makeState({
      mode: 'coop',
      players: {
        p1: makePlayer({ id: 'p1', slot: 1, name: 'Alice', kills: 7 }),
        p2: makePlayer({ id: 'p2', slot: 2, name: 'Bob', kills: 3 }),
      },
    })
    render(<GameOverScreen state={state} playerId="p1" onReplay={() => {}} onQuit={() => {}} />)
    const rows = screen.getAllByTestId('leaderboard-row')
    for (const row of rows) {
      const slot = Number(row.getAttribute('data-slot')) as PlayerSlot
      const badge = row.querySelector('[data-testid="slot-badge"]') as HTMLElement
      expect(badge).toBeTruthy()
      expect(badge.textContent).toBe(`[${slot}]`)
      const expected = COLORS.player[slot].toLowerCase()
      expect(normaliseColor(badge.style.color)).toBe(expected)
    }
  })

  it('appends "(you)" only on the row matching playerId', () => {
    const state = makeState({
      mode: 'coop',
      players: {
        p1: makePlayer({ id: 'p1', slot: 1, name: 'Alice', kills: 7 }),
        p2: makePlayer({ id: 'p2', slot: 2, name: 'Bob', kills: 3 }),
      },
    })
    render(<GameOverScreen state={state} playerId="p2" onReplay={() => {}} onQuit={() => {}} />)
    const rows = screen.getAllByTestId('leaderboard-row')
    const aliceRow = rows.find((r) => r.getAttribute('data-slot') === '1')!
    const bobRow = rows.find((r) => r.getAttribute('data-slot') === '2')!
    expect(aliceRow.getAttribute('data-is-you')).toBe('false')
    expect(aliceRow.textContent).not.toContain('(you)')
    expect(bobRow.getAttribute('data-is-you')).toBe('true')
    expect(bobRow.textContent).toContain('(you)')
  })

  it('shows a kill count on every row', () => {
    const state = makeState({
      mode: 'coop',
      players: {
        p1: makePlayer({ id: 'p1', slot: 1, name: 'Alice', kills: 7 }),
        p2: makePlayer({ id: 'p2', slot: 2, name: 'Bob', kills: 3 }),
      },
    })
    render(<GameOverScreen state={state} playerId="p1" onReplay={() => {}} onQuit={() => {}} />)
    const rows = screen.getAllByTestId('leaderboard-row')
    const aliceRow = rows.find((r) => r.getAttribute('data-slot') === '1')!
    const bobRow = rows.find((r) => r.getAttribute('data-slot') === '2')!
    expect(aliceRow.textContent).toContain('7')
    expect(bobRow.textContent).toContain('3')
  })

  it('solo play still renders the leaderboard with one trophied row', () => {
    const state = makeState({
      mode: 'solo',
      players: {
        p1: makePlayer({ id: 'p1', slot: 1, name: 'You', kills: 42 }),
      },
    })
    render(<GameOverScreen state={state} playerId="p1" onReplay={() => {}} onQuit={() => {}} />)
    const rows = screen.getAllByTestId('leaderboard-row')
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toContain('🏆')
    expect(rows[0].textContent).toContain('(you)')
    expect(rows[0].textContent).toContain('42')
    expect(rows[0].getAttribute('data-rank')).toBe('1')
  })

  it('PBT: leaderboard is sorted desc and trophies go to all top-kill players', () => {
    fc.assert(
      fc.property(
        // 1-4 unique slots with arbitrary kill counts
        fc.uniqueArray(fc.integer({ min: 1, max: 4 }), { minLength: 1, maxLength: 4 }).chain((slots) =>
          fc.tuple(
            fc.constant(slots),
            fc.array(fc.integer({ min: 0, max: 50 }), {
              minLength: slots.length,
              maxLength: slots.length,
            }),
          ),
        ),
        ([slots, kills]) => {
          const players: Record<string, Player> = {}
          slots.forEach((slot, i) => {
            const id = `p${slot}`
            players[id] = makePlayer({
              id,
              slot: slot as PlayerSlot,
              name: `Player${slot}`,
              kills: kills[i],
            })
          })
          const state = makeState({ mode: 'coop', players })
          const { unmount } = render(
            <GameOverScreen state={state} playerId="p1" onReplay={() => {}} onQuit={() => {}} />,
          )
          try {
            const rows = screen.getAllByTestId('leaderboard-row')
            // Count matches
            expect(rows).toHaveLength(slots.length)

            const rowKills = rows.map((r) => Number(r.getAttribute('data-kills')))
            // Non-increasing order
            for (let i = 1; i < rowKills.length; i++) {
              expect(rowKills[i - 1]).toBeGreaterThanOrEqual(rowKills[i])
            }

            // All top-kill players (and only them) get a trophy
            const maxKills = Math.max(...kills)
            for (const row of rows) {
              const kc = Number(row.getAttribute('data-kills'))
              const hasTrophy = (row.textContent ?? '').includes('🏆')
              expect(hasTrophy).toBe(kc === maxKills)
            }

            // Every row's data-slot refers to an actual player and the name matches
            for (const row of rows) {
              const slotAttr = Number(row.getAttribute('data-slot')) as PlayerSlot
              expect(slots).toContain(slotAttr)
              const expectedName = `Player${slotAttr}`
              expect(row.textContent).toContain(expectedName)
            }
          } finally {
            unmount()
          }
        },
      ),
      { numRuns: 50 },
    )
  })
})

// ─── #12 Caption casing consistency ────────────────────────────────────────
//
// The stat captions inside GameOverScreen (Score, Wave reached, Aliens
// destroyed this run) share a panel — mixing "Wave Reached" with "Score:"
// would look sloppy. We pick sentence-case (first letter capital, rest
// lowercase unless a proper noun) and assert it at the caption level.
//
// ALL CAPS headlines like VICTORY / GAME OVER / MATCH SCOREBOARD are a
// different tier of emphasis and must NOT be flagged by this rule.

/**
 * Return true if `label` is a sentence-case caption:
 *   - First non-whitespace char is an uppercase letter.
 *   - The first word has at least one lowercase letter (rejects ALL-CAPS
 *     single words like "VICTORY" / "LOBBY").
 *   - No word after the first starts with an uppercase letter (rejects
 *     Title Case drift like "Wave Reached").
 *
 * A caption like "Score" or "Wave reached" passes. "Wave Reached" fails.
 * "VICTORY" fails (no lowercase in first word). "GAME OVER" fails (both
 * words all-caps).
 */
function isSentenceCase(label: string): boolean {
  const trimmed = label.trim()
  if (trimmed.length === 0) return false
  const words = trimmed.split(/\s+/)
  const first = words[0]
  if (first.length === 0) return false
  const firstChar = first[0]
  // Must start uppercase
  if (!(firstChar >= 'A' && firstChar <= 'Z')) return false
  // If the first word is longer than 1 char, at least one char after the
  // initial must be lowercase. This rejects "VICTORY" / "LOBBY" / "ROOM".
  if (first.length >= 2) {
    const tail = first.slice(1)
    const hasLower = /[a-z]/.test(tail)
    if (!hasLower) return false
  }
  // No subsequent word may start with an uppercase letter (length ≥ 2).
  for (let i = 1; i < words.length; i++) {
    const w = words[i]
    if (w.length < 2) continue
    const c = w[0]
    if (c >= 'A' && c <= 'Z') return false
  }
  return true
}

describe('GameOverScreen - caption casing (#12)', () => {
  afterEach(() => cleanup())

  it('Score / Wave reached / Aliens destroyed this run captions are sentence-case', () => {
    const state = makeState({
      mode: 'solo',
      score: 1250,
      wave: 4,
      players: {
        p1: makePlayer({ id: 'p1', slot: 1, name: 'Alice', kills: 9 }),
      },
    })
    render(<GameOverScreen state={state} playerId="p1" onReplay={() => {}} onQuit={() => {}} />)
    // Grab the panel by looking for the Score paragraph's ancestor.
    const body = document.body.textContent ?? ''
    // Extract each "Label: value" caption. The colon is the caption terminator.
    const captions = ['Score', 'Wave reached', 'Aliens destroyed this run']
    for (const caption of captions) {
      // Caption must appear verbatim followed by a colon (value is dynamic).
      expect(body).toContain(`${caption}:`)
      expect(isSentenceCase(caption)).toBe(true)
    }
  })

  it('negative: ALL CAPS headings are not flagged as sentence-case', () => {
    // Sanity check the helper itself — VICTORY / GAME OVER / MATCH SCOREBOARD
    // must fail the sentence-case check so the positive assertions are
    // meaningful.
    expect(isSentenceCase('VICTORY')).toBe(false)
    expect(isSentenceCase('GAME OVER')).toBe(false)
    expect(isSentenceCase('MATCH SCOREBOARD')).toBe(false)
  })

  it('negative: Title Case drift ("Wave Reached") would be rejected', () => {
    expect(isSentenceCase('Wave Reached')).toBe(false)
    expect(isSentenceCase('Aliens Destroyed This Run')).toBe(false)
  })

  it('positive sanity: lowercase-body words are accepted', () => {
    expect(isSentenceCase('Score')).toBe(true)
    expect(isSentenceCase('Wave reached')).toBe(true)
    expect(isSentenceCase('Aliens destroyed this run')).toBe(true)
  })

  it('ALL CAPS headlines survive in the DOM (not altered by the casing rule)', () => {
    // Rule applies to captions only; VICTORY / GAME OVER / MATCH SCOREBOARD
    // must still render ALL CAPS as intentional emphasis.
    const state = makeState({
      mode: 'coop',
      lives: 1, // victory
      players: {
        p1: makePlayer({ id: 'p1', slot: 1, name: 'Alice', kills: 7 }),
        p2: makePlayer({ id: 'p2', slot: 2, name: 'Bob', kills: 3 }),
      },
    })
    render(<GameOverScreen state={state} playerId="p1" onReplay={() => {}} onQuit={() => {}} />)
    const headline = screen.getByTestId('game-over-headline')
    expect(headline.textContent).toBe('VICTORY')
    const leaderboard = screen.getByTestId('leaderboard')
    expect(leaderboard.textContent ?? '').toContain('MATCH SCOREBOARD')
  })
})

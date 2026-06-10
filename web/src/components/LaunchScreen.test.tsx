import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { LaunchScreen } from './LaunchScreen'

describe('LaunchScreen aesthetics', () => {
  afterEach(() => {
    cleanup()
  })

  const noop = () => {}

  it('renders a gradient VADERS logo with background-clip text', () => {
    const { container } = render(
      <LaunchScreen onStartSolo={noop} onCreateRoom={noop} onJoinRoom={noop} onMatchmake={noop} />,
    )
    const logo = container.querySelector('[data-testid="vaders-logo"]') as HTMLElement
    expect(logo).not.toBeNull()
    const style = logo.getAttribute('style') ?? ''
    // gradient background + transparent text colour
    expect(style).toMatch(/linear-gradient/)
    // jsdom may normalize to "color: transparent"
    expect(style).toMatch(/color:\s*transparent/)
  })

  it('renders the alien parade decoration', () => {
    const { container } = render(
      <LaunchScreen onStartSolo={noop} onCreateRoom={noop} onJoinRoom={noop} onMatchmake={noop} />,
    )
    expect(container.querySelector('[data-testid="alien-parade"]')).not.toBeNull()
  })

  it('menu items have a focusable button with an outline-capable class', () => {
    const { container } = render(
      <LaunchScreen onStartSolo={noop} onCreateRoom={noop} onJoinRoom={noop} onMatchmake={noop} />,
    )
    const items = container.querySelectorAll('[data-testid="menu-item"]')
    expect(items.length).toBeGreaterThanOrEqual(4)
    items.forEach((item) => {
      expect(item.className).toContain('vaders-menu-item')
    })
  })

  it('embeds stylesheet with hover and focus rules', () => {
    const { container } = render(
      <LaunchScreen onStartSolo={noop} onCreateRoom={noop} onJoinRoom={noop} onMatchmake={noop} />,
    )
    const style = container.querySelector('style')
    expect(style).not.toBeNull()
    const css = style!.textContent ?? ''
    expect(css).toMatch(/\.vaders-menu-item:hover/)
    expect(css).toMatch(/\.vaders-menu-item:focus/)
    expect(css).toMatch(/scale\(1\.02\)/)
  })

  it('wraps content in a MenuBackground', () => {
    const { container } = render(
      <LaunchScreen onStartSolo={noop} onCreateRoom={noop} onJoinRoom={noop} onMatchmake={noop} />,
    )
    expect(container.querySelector('[data-testid="menu-background-canvas"]')).not.toBeNull()
  })

  it('hotkey 1 still triggers solo start', () => {
    let started = false
    render(
      <LaunchScreen
        onStartSolo={() => {
          started = true
        }}
        onCreateRoom={noop}
        onJoinRoom={noop}
        onMatchmake={noop}
      />,
    )
    fireEvent.keyDown(window, { key: '1' })
    expect(started).toBe(true)
  })

  it('does not render a "SPACE INVADERS" subtitle under the logo', () => {
    const { container } = render(
      <LaunchScreen onStartSolo={noop} onCreateRoom={noop} onJoinRoom={noop} onMatchmake={noop} />,
    )
    // Collapse whitespace + NBSPs to a single space so the spaced-letter
    // layout "S P A C E  I N V A D E R S" collapses to a matchable string.
    const text = (container.textContent ?? '').replace(/\s+/g, ' ').toUpperCase()
    expect(text).not.toContain('S P A C E I N V A D E R S')
    expect(text).not.toContain('SPACE INVADERS')
  })
})

describe('LaunchScreen TUI-aligned keyboard shortcuts', () => {
  afterEach(() => {
    cleanup()
  })
  const noop = () => {}

  it('pressing M invokes onToggleMute', () => {
    let toggled = 0
    render(
      <LaunchScreen
        onStartSolo={noop}
        onCreateRoom={noop}
        onJoinRoom={noop}
        onMatchmake={noop}
        onToggleMute={() => {
          toggled++
        }}
      />,
    )
    fireEvent.keyDown(window, { key: 'm' })
    expect(toggled).toBe(1)
  })

  it('pressing N invokes onToggleMusicMute', () => {
    let toggled = 0
    render(
      <LaunchScreen
        onStartSolo={noop}
        onCreateRoom={noop}
        onJoinRoom={noop}
        onMatchmake={noop}
        onToggleMusicMute={() => {
          toggled++
        }}
      />,
    )
    fireEvent.keyDown(window, { key: 'n' })
    expect(toggled).toBe(1)
  })

  it('footer shows build version and commit hash', () => {
    // The footer should surface the generated BUILD_INFO so users can report
    // which deploy they're on. We don't pin exact values (they change every
    // deploy) — we just assert the shape:
    //   v<semver>  ·  <commit-hash-or-dev>
    const { container } = render(
      <LaunchScreen onStartSolo={noop} onCreateRoom={noop} onJoinRoom={noop} onMatchmake={noop} />,
    )
    const text = container.textContent ?? ''
    expect(text).toMatch(/v\d+\.\d+\.\d+/)
    // commitHash: a git short SHA, "dev", optionally suffixed -dirty
    expect(text).toMatch(/([0-9a-f]{7,40}|dev)(-dirty)?/)
  })

  it('homepage footer links to the GitHub repo (new tab, safe rel)', () => {
    const { container } = render(
      <LaunchScreen onStartSolo={noop} onCreateRoom={noop} onJoinRoom={noop} onMatchmake={noop} />,
    )
    const githubLink = container.querySelector('a[href*="github.com/adewale/vaders"]') as HTMLAnchorElement | null
    expect(githubLink).not.toBeNull()
    expect(githubLink!.getAttribute('target')).toBe('_blank')
    expect(githubLink!.getAttribute('rel') ?? '').toMatch(/noopener/)
  })

  it('homepage footer links to the Cloudflare Developer Platform', () => {
    const { container } = render(
      <LaunchScreen onStartSolo={noop} onCreateRoom={noop} onJoinRoom={noop} onMatchmake={noop} />,
    )
    const cfLink = container.querySelector('a[href*="developers.cloudflare.com"]') as HTMLAnchorElement | null
    expect(cfLink).not.toBeNull()
    expect((cfLink!.textContent ?? '').toLowerCase()).toContain('cloudflare')
    expect(cfLink!.getAttribute('target')).toBe('_blank')
    expect(cfLink!.getAttribute('rel') ?? '').toMatch(/noopener/)
  })

  it('M/N do not activate when typing a room code (input focused)', () => {
    let toggled = 0
    const { container } = render(
      <LaunchScreen
        onStartSolo={noop}
        onCreateRoom={noop}
        onJoinRoom={noop}
        onMatchmake={noop}
        onToggleMute={() => {
          toggled++
        }}
        onToggleMusicMute={() => {
          toggled++
        }}
      />,
    )
    // Open join mode by pressing 3 — that focuses the room-code input.
    fireEvent.keyDown(window, { key: '3' })
    const input = container.querySelector('#room-code-input') as HTMLInputElement | null
    expect(input).not.toBeNull()
    input!.focus()
    // Typing "m" or "n" into the room-code input must become part of the code,
    // not a mute toggle.
    fireEvent.keyDown(input!, { key: 'm', target: input })
    fireEvent.keyDown(input!, { key: 'n', target: input })
    expect(toggled).toBe(0)
  })
})

describe('LaunchScreen menu sounds (onMenuSound)', () => {
  afterEach(() => {
    cleanup()
  })
  const noop = () => {}

  function renderWithSound() {
    const calls: Array<'navigate' | 'select'> = []
    const onMenuSound = (kind: 'navigate' | 'select') => {
      calls.push(kind)
    }
    const utils = render(
      <LaunchScreen
        onStartSolo={noop}
        onCreateRoom={noop}
        onJoinRoom={noop}
        onMatchmake={noop}
        onMenuSound={onMenuSound}
      />,
    )
    return { calls, ...utils }
  }

  it('fires "navigate" on ArrowDown', () => {
    const { calls } = renderWithSound()
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(calls).toEqual(['navigate'])
  })

  it('fires "navigate" on ArrowUp', () => {
    const { calls } = renderWithSound()
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(calls).toEqual(['navigate'])
  })

  it('fires "select" on Enter', () => {
    const { calls } = renderWithSound()
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(calls).toEqual(['select'])
  })

  it.each(['1', '2', '3', '4'])('fires "select" on hotkey %s', (key) => {
    const { calls } = renderWithSound()
    fireEvent.keyDown(window, { key })
    expect(calls).toEqual(['select'])
  })

  it('does NOT fire on unrelated keys (M, N, ?, Escape, Backspace, letters)', () => {
    const { calls } = renderWithSound()
    for (const key of ['m', 'n', '?', 'Escape', 'Backspace', 'a', 'z', 'Tab', 'Shift']) {
      fireEvent.keyDown(window, { key })
    }
    expect(calls).toEqual([])
  })

  it('does NOT fire when e.repeat is true (auto-repeat suppression)', () => {
    const { calls } = renderWithSound()
    fireEvent.keyDown(window, { key: 'ArrowDown', repeat: true })
    fireEvent.keyDown(window, { key: 'ArrowUp', repeat: true })
    fireEvent.keyDown(window, { key: 'Enter', repeat: true })
    fireEvent.keyDown(window, { key: '1', repeat: true })
    expect(calls).toEqual([])
  })

  it('does NOT fire when user is typing in the room-code input', () => {
    const { calls, container } = renderWithSound()
    // Enter join mode so room-code input renders.
    fireEvent.keyDown(window, { key: '3' })
    // That 3 counts as a select — clear the log so the assertion focuses on
    // the input-focused typing case.
    calls.length = 0
    const input = container.querySelector('#room-code-input') as HTMLInputElement | null
    expect(input).not.toBeNull()
    input!.focus()
    // Typing alphanumerics into the input must not trigger menu sounds.
    // (Handler early-returns for INPUT targets other than Escape/Enter.)
    for (const key of ['A', 'B', '1', '2', '3', '4']) {
      fireEvent.keyDown(input!, { key, target: input })
    }
    expect(calls).toEqual([])
  })

  it('is optional — omitting onMenuSound does not break navigation', () => {
    // Sanity: LaunchScreen still works without the prop wired up.
    render(<LaunchScreen onStartSolo={noop} onCreateRoom={noop} onJoinRoom={noop} onMatchmake={noop} />)
    expect(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown' })
      fireEvent.keyDown(window, { key: 'Enter' })
    }).not.toThrow()
  })
})

describe('LaunchScreen menu sounds — property-based', () => {
  afterEach(() => {
    cleanup()
  })
  const noop = () => {}

  // Keys we care about. The positive set always fires onMenuSound (when not
  // repeated, not typing in an input). The negative set never does.
  const POSITIVE_KEYS = ['ArrowUp', 'ArrowDown', 'Enter', '1', '2', '3', '4'] as const
  const NEGATIVE_KEYS = ['m', 'n', '?', 'Escape', 'a', 'z', 'Tab', 'Shift', 'Backspace'] as const

  /**
   * Model of LaunchScreen's keydown handler, covering exactly the state that
   * decides whether a key produces a menu sound: `joinMode` and
   * `selectedIndex`. Join mode is entered by the '3' hotkey OR by Enter while
   * JOIN ROOM (index 2) is selected; inside join mode NO key fires a sound,
   * and Escape returns to the menu.
   *
   * The previous oracle was a linear count that special-cased only the
   * literal key '3'. CI's fast-check seed -366879321 found the gap:
   * ['2', 'ArrowDown', 'Enter', 'ArrowUp'] — '2' selects index 1, ArrowDown
   * moves to index 2, Enter activates JOIN ROOM (entering join mode), and
   * ArrowUp is then correctly silent. The component was right; the model was
   * wrong. This oracle simulates the handler instead of counting keys.
   */
  function expectedMenuSounds(events: ReadonlyArray<{ key: string; repeat: boolean }>): Array<'navigate' | 'select'> {
    const expected: Array<'navigate' | 'select'> = []
    let joinMode = false
    let selectedIndex = 0
    for (const e of events) {
      if (e.repeat) continue
      if (joinMode) {
        // Room-code entry: every key is silent; Escape exits back to the menu.
        if (e.key === 'Escape') joinMode = false
        continue
      }
      const lowered = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (lowered === 'm' || lowered === 'n') continue // audio toggles, no menu sound
      switch (e.key) {
        case 'ArrowDown':
          expected.push('navigate')
          selectedIndex = (selectedIndex + 1) % 4
          break
        case 'ArrowUp':
          expected.push('navigate')
          selectedIndex = (selectedIndex + 3) % 4
          break
        case 'Enter':
          expected.push('select')
          if (selectedIndex === 2) joinMode = true // JOIN ROOM
          break
        case '1':
          expected.push('select')
          selectedIndex = 0
          break
        case '2':
          expected.push('select')
          selectedIndex = 1
          break
        case '3':
          expected.push('select')
          selectedIndex = 2
          joinMode = true
          break
        case '4':
          expected.push('select')
          selectedIndex = 3
          break
        // every other key: no sound
      }
    }
    return expected
  }

  function playSequence(events: ReadonlyArray<{ key: string; repeat: boolean }>): Array<'navigate' | 'select'> {
    const calls: Array<'navigate' | 'select'> = []
    const { unmount } = render(
      <LaunchScreen
        onStartSolo={noop}
        onCreateRoom={noop}
        onJoinRoom={noop}
        onMatchmake={noop}
        onMenuSound={(kind) => calls.push(kind)}
      />,
    )
    for (const e of events) {
      fireEvent.keyDown(window, { key: e.key, repeat: e.repeat })
    }
    unmount()
    return calls
  }

  it('REGRESSION: Enter on JOIN ROOM enters join mode and silences later menu keys (CI seed -366879321)', () => {
    // The shrunk counterexample from the CI failure, pinned as a
    // deterministic example so the case is exercised on every run
    // regardless of the PBT's seed.
    const calls = playSequence([
      { key: '2', repeat: false }, // select (CREATE ROOM hotkey), index -> 1
      { key: 'ArrowDown', repeat: false }, // navigate, index -> 2 (JOIN ROOM)
      { key: 'Enter', repeat: false }, // select, activates JOIN ROOM -> join mode
      { key: 'ArrowUp', repeat: false }, // join mode: silent
    ])
    expect(calls).toEqual(['select', 'navigate', 'select'])
  })

  it('menu sound sequence matches the handler model for any key sequence (PBT)', async () => {
    const fc = await import('fast-check')
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            key: fc.constantFrom(...POSITIVE_KEYS, ...NEGATIVE_KEYS),
            repeat: fc.boolean(),
          }),
          { maxLength: 40 },
        ),
        async (events) => {
          const calls = playSequence(events)
          const expected = expectedMenuSounds(events)
          // Full-sequence identity (kinds in order), not just a count —
          // a navigate misreported as select would fail here.
          return JSON.stringify(calls) === JSON.stringify(expected)
        },
      ),
      // 40 runs fits the 5s test timeout (each case renders + replays up to
      // 40 events). Verified once at 1500 runs across fresh seeds; the known
      // CI counterexample is pinned as the deterministic REGRESSION case above.
      { numRuns: 40 },
    )
  })

  it('never fires on any purely-negative key sequence (PBT)', async () => {
    const fc = await import('fast-check')
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            key: fc.constantFrom(...NEGATIVE_KEYS),
            repeat: fc.boolean(),
          }),
          { maxLength: 30 },
        ),
        async (events) => {
          const calls: Array<'navigate' | 'select'> = []
          const { unmount } = render(
            <LaunchScreen
              onStartSolo={noop}
              onCreateRoom={noop}
              onJoinRoom={noop}
              onMatchmake={noop}
              onMenuSound={(kind) => calls.push(kind)}
            />,
          )
          for (const e of events) {
            fireEvent.keyDown(window, { key: e.key, repeat: e.repeat })
          }
          unmount()
          return calls.length === 0
        },
      ),
      { numRuns: 40 },
    )
  })
})

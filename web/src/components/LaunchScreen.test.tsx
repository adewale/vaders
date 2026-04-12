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

  it('call count equals number of non-repeat positive key presses (PBT)', async () => {
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
          // Pressing '3' opens join mode, which changes focus/handling —
          // exclude it from the oracle's positive set for this property and
          // skip generated events after join-mode opens. Simplest approach:
          // filter out '3' entirely for this PBT (covered by explicit tests).
          const filtered = events.filter((e) => e.key !== '3')
          const expected = filtered.filter(
            (e) => !e.repeat && (POSITIVE_KEYS as readonly string[]).includes(e.key),
          ).length
          for (const e of filtered) {
            fireEvent.keyDown(window, { key: e.key, repeat: e.repeat })
          }
          unmount()
          return calls.length === expected
        },
      ),
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

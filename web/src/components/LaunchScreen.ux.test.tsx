import { describe, it, expect, afterEach, beforeAll } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { LaunchScreen, extractRoomCode } from './LaunchScreen'

// jsdom 29 under vitest ships an unusable `{}` for window.localStorage, so we
// install a minimal Storage-compatible shim once per file.
beforeAll(() => {
  const store = new Map<string, string>()
  const shim: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (k) => store.get(k) ?? null,
    key: (i) => Array.from(store.keys())[i] ?? null,
    removeItem: (k) => {
      store.delete(k)
    },
    setItem: (k, v) => {
      store.set(k, String(v))
    },
  }
  Object.defineProperty(window, 'localStorage', { configurable: true, value: shim })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: shim })
})

describe('LaunchScreen - player name persistence', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('renders an input for player name with default "Player" when no storage', () => {
    localStorage.clear()
    render(<LaunchScreen onStartSolo={() => {}} onCreateRoom={() => {}} onJoinRoom={() => {}} onMatchmake={() => {}} />)
    const input = screen.getByLabelText(/name/i) as HTMLInputElement
    expect(input.value).toBe('Player')
  })

  it('loads saved name from localStorage', () => {
    localStorage.setItem('vaders.playerName', 'Zaphod')
    render(<LaunchScreen onStartSolo={() => {}} onCreateRoom={() => {}} onJoinRoom={() => {}} onMatchmake={() => {}} />)
    const input = screen.getByLabelText(/name/i) as HTMLInputElement
    expect(input.value).toBe('Zaphod')
  })

  it('persists name changes to localStorage', () => {
    localStorage.clear()
    render(<LaunchScreen onStartSolo={() => {}} onCreateRoom={() => {}} onJoinRoom={() => {}} onMatchmake={() => {}} />)
    const input = screen.getByLabelText(/name/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Arthur' } })
    expect(localStorage.getItem('vaders.playerName')).toBe('Arthur')
  })
})

describe('extractRoomCode', () => {
  it('extracts 6-char code from a /room/ URL', () => {
    expect(extractRoomCode('http://vaders.example.com/room/ABC123')).toBe('ABC123')
  })

  it('extracts 6-char code from bare code', () => {
    expect(extractRoomCode('ABC123')).toBe('ABC123')
  })

  it('uppercases lowercase codes', () => {
    expect(extractRoomCode('abc123')).toBe('ABC123')
  })

  it('returns null for invalid text', () => {
    expect(extractRoomCode('hello world')).toBeNull()
    expect(extractRoomCode('')).toBeNull()
    expect(extractRoomCode('1234')).toBeNull()
  })

  it('extracts first 6-char alphanumeric sequence from longer text', () => {
    expect(extractRoomCode('please join XYZ789 now')).toBe('XYZ789')
  })
})

describe('LaunchScreen - keyboard navigation', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  const noop = () => {}

  function getMenuItems(container: HTMLElement) {
    return Array.from(container.querySelectorAll('[data-testid="menu-item"]')) as HTMLElement[]
  }

  function selectedIndex(container: HTMLElement): number {
    const items = getMenuItems(container)
    return items.findIndex((el) => el.getAttribute('data-selected') === 'true')
  }

  it('defaults to selecting the first menu item', () => {
    const { container } = render(
      <LaunchScreen onStartSolo={noop} onCreateRoom={noop} onJoinRoom={noop} onMatchmake={noop} />,
    )
    expect(selectedIndex(container)).toBe(0)
  })

  it('ArrowDown advances selected index', () => {
    const { container } = render(
      <LaunchScreen onStartSolo={noop} onCreateRoom={noop} onJoinRoom={noop} onMatchmake={noop} />,
    )
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(selectedIndex(container)).toBe(1)
  })

  it('ArrowUp decreases selected index', () => {
    const { container } = render(
      <LaunchScreen onStartSolo={noop} onCreateRoom={noop} onJoinRoom={noop} onMatchmake={noop} />,
    )
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(selectedIndex(container)).toBe(2)
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(selectedIndex(container)).toBe(1)
  })

  it('ArrowDown wraps from 3 back to 0', () => {
    const { container } = render(
      <LaunchScreen onStartSolo={noop} onCreateRoom={noop} onJoinRoom={noop} onMatchmake={noop} />,
    )
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(selectedIndex(container)).toBe(3)
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(selectedIndex(container)).toBe(0)
  })

  it('ArrowUp wraps from 0 to 3', () => {
    const { container } = render(
      <LaunchScreen onStartSolo={noop} onCreateRoom={noop} onJoinRoom={noop} onMatchmake={noop} />,
    )
    expect(selectedIndex(container)).toBe(0)
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(selectedIndex(container)).toBe(3)
  })

  it('Enter activates the selected item (solo by default)', () => {
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
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(started).toBe(true)
  })

  it('ArrowDown then Enter activates CREATE ROOM', () => {
    let created = false
    render(
      <LaunchScreen
        onStartSolo={noop}
        onCreateRoom={() => {
          created = true
        }}
        onJoinRoom={noop}
        onMatchmake={noop}
      />,
    )
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(created).toBe(true)
  })

  it('Enter on MATCHMAKING activates onMatchmake', () => {
    let matched = false
    render(
      <LaunchScreen
        onStartSolo={noop}
        onCreateRoom={noop}
        onJoinRoom={noop}
        onMatchmake={() => {
          matched = true
        }}
      />,
    )
    fireEvent.keyDown(window, { key: 'ArrowUp' }) // wrap to 3 (MATCHMAKING)
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(matched).toBe(true)
  })

  it('Enter on JOIN ROOM enters join mode (does not call onJoinRoom)', () => {
    let joined = false
    render(
      <LaunchScreen
        onStartSolo={noop}
        onCreateRoom={noop}
        onJoinRoom={() => {
          joined = true
        }}
        onMatchmake={noop}
      />,
    )
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(joined).toBe(false)
    // Join mode is now active — the room code input should exist.
    expect(screen.getByLabelText(/room code/i)).not.toBeNull()
  })

  it('direct hotkey 1 still calls onStartSolo', () => {
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

  it('direct hotkey also updates selected index for consistency', () => {
    const { container } = render(
      <LaunchScreen onStartSolo={noop} onCreateRoom={noop} onJoinRoom={noop} onMatchmake={noop} />,
    )
    fireEvent.keyDown(window, { key: '4' })
    // Matchmaking fired, but the selected index should also be 3 now.
    expect(selectedIndex(container)).toBe(3)
  })

  it('menu controls hint lists ArrowUp/ArrowDown/Enter', () => {
    const { container } = render(
      <LaunchScreen onStartSolo={noop} onCreateRoom={noop} onJoinRoom={noop} onMatchmake={noop} />,
    )
    const text = container.textContent ?? ''
    expect(text).toMatch(/Navigate/i)
    expect(text).toMatch(/ENTER/i)
    expect(text).toMatch(/1-?4/i)
  })

  it('Escape while in join mode cancels and returns to menu', () => {
    const { container } = render(
      <LaunchScreen onStartSolo={noop} onCreateRoom={noop} onJoinRoom={noop} onMatchmake={noop} />,
    )
    fireEvent.keyDown(window, { key: '3' })
    expect(screen.getByLabelText(/room code/i)).not.toBeNull()
    // Escape targets the input
    fireEvent.keyDown(screen.getByLabelText(/room code/i), { key: 'Escape' })
    expect(screen.queryByLabelText(/room code/i)).toBeNull()
    // Selected index should still be valid after cancelling.
    expect(selectedIndex(container)).toBeGreaterThanOrEqual(0)
  })
})

describe('LaunchScreen - paste handling for room code', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('populates the room code when pasted text contains /room/CODE', () => {
    render(<LaunchScreen onStartSolo={() => {}} onCreateRoom={() => {}} onJoinRoom={() => {}} onMatchmake={() => {}} />)

    fireEvent.keyDown(window, { key: '3' })

    const input = screen.getByLabelText(/room code/i) as HTMLInputElement

    fireEvent.paste(input, {
      clipboardData: { getData: () => 'http://localhost/room/XYZ789' },
    })

    expect(input.value).toBe('XYZ789')
  })

  it('ignores paste of invalid text', () => {
    render(<LaunchScreen onStartSolo={() => {}} onCreateRoom={() => {}} onJoinRoom={() => {}} onMatchmake={() => {}} />)
    fireEvent.keyDown(window, { key: '3' })

    const input = screen.getByLabelText(/room code/i) as HTMLInputElement
    fireEvent.paste(input, {
      clipboardData: { getData: () => 'hi' },
    })

    expect(input.value).toBe('')
  })
})

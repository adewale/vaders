import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MobileGate } from './MobileGate'

describe('MobileGate', () => {
  let originalInnerWidth: number
  let originalMatchMedia: typeof window.matchMedia

  beforeEach(() => {
    originalInnerWidth = window.innerWidth
    originalMatchMedia = window.matchMedia
    // Default to a desktop-style matchMedia: neither coarse-pointer nor
    // no-hover; tests that need touch detection override per-case.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (_query: string) => ({
        matches: false,
        media: _query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    })
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: originalMatchMedia,
    })
    cleanup()
  })

  it('renders children when viewport is wide enough AND input is not touch-primary', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 })
    render(
      <MobileGate>
        <div data-testid="game-content">Game Content</div>
      </MobileGate>,
    )
    const gameContent = screen.getByTestId('game-content')
    expect(gameContent).toBeDefined()
    expect(gameContent.textContent).toBe('Game Content')
    expect(screen.queryByTestId('mobile-gate')).toBeNull()
  })

  it('shows the unsupported-platform screen on narrow viewports', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 400 })
    render(
      <MobileGate>
        <div data-testid="game-content">Game Content</div>
      </MobileGate>,
    )
    expect(screen.queryByTestId('game-content')).toBeNull()
    const gate = screen.getByTestId('mobile-gate')
    const text = gate.textContent ?? ''
    // Plain-language "not supported" explanation.
    expect(text.toLowerCase()).toContain('keyboard-only')
    expect(text.toLowerCase()).toContain('mobile')
    // Explicit "not on the roadmap" so users don't assume it's coming.
    expect(text.toLowerCase()).toContain('not on the roadmap')
    expect(screen.getByText('VADERS')).toBeDefined()
  })

  it('treats exactly 600px as desktop (not blocked)', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 600 })
    render(
      <MobileGate>
        <div data-testid="game-content">Game Content</div>
      </MobileGate>,
    )
    expect(screen.getByTestId('game-content')).toBeDefined()
    expect(screen.queryByTestId('mobile-gate')).toBeNull()
  })

  it('treats 599px as mobile', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 599 })
    render(
      <MobileGate>
        <div data-testid="game-content">Game Content</div>
      </MobileGate>,
    )
    expect(screen.queryByTestId('game-content')).toBeNull()
    expect(screen.getByTestId('mobile-gate')).toBeDefined()
  })

  it('blocks touch-primary devices even when viewport is wide (e.g. iPad Pro, touch Chromebook)', () => {
    // Wide viewport but coarse-pointer + no-hover → touch-primary device.
    // Previously such a device would pass the viewport gate and land in
    // the game with no working input; now it gets the clear "not
    // supported" message up front.
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1280 })
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: query === '(pointer: coarse)' || query === '(hover: none)',
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    })
    render(
      <MobileGate>
        <div data-testid="game-content">Game Content</div>
      </MobileGate>,
    )
    expect(screen.queryByTestId('game-content')).toBeNull()
    expect(screen.getByTestId('mobile-gate')).toBeDefined()
  })

  it('does NOT block touch-capable-but-hover-supported devices (laptop with touchscreen)', () => {
    // A laptop with a touchscreen reports coarse-pointer = false (primary
    // is mouse/trackpad) OR hover = true (cursor-based). Only the
    // "primary pointer is finger AND no hover" combination blocks.
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1920 })
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false, // neither coarse NOR no-hover
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    })
    render(
      <MobileGate>
        <div data-testid="game-content">Game Content</div>
      </MobileGate>,
    )
    expect(screen.getByTestId('game-content')).toBeDefined()
    expect(screen.queryByTestId('mobile-gate')).toBeNull()
  })
})

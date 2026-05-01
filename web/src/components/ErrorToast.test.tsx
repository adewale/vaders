import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, screen, act, fireEvent } from '@testing-library/react'
import { ErrorToast } from './ErrorToast'

describe('ErrorToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('renders nothing when message is null', () => {
    render(<ErrorToast message={null} />)
    expect(screen.queryByTestId('in-game-error-toast')).toBeNull()
  })

  it('renders a banner with the error message when provided', () => {
    render(<ErrorToast message="rate_limited: slow down" />)
    const toast = screen.getByTestId('in-game-error-toast')
    expect(toast).not.toBeNull()
    expect(toast.textContent).toContain('slow down')
  })

  it('uses red/warning palette styling', () => {
    render(<ErrorToast message="room_full: nope" />)
    const toast = screen.getByTestId('in-game-error-toast')
    const color = toast.style.color + toast.style.background + toast.style.borderColor
    // Should reference a red/warning color somewhere (#ff.. or rgb(r,g,b) with r high)
    expect(color.toLowerCase()).toMatch(/ff|red|error|255/)
  })

  it('positions fixed at top with high z-index so it is non-blocking', () => {
    render(<ErrorToast message="invalid_message: bad" />)
    const toast = screen.getByTestId('in-game-error-toast')
    expect(toast.style.position).toBe('fixed')
    const z = Number.parseInt(toast.style.zIndex || '0', 10)
    expect(z).toBeGreaterThanOrEqual(9000)
  })

  it('auto-dismisses after 4 seconds', () => {
    render(<ErrorToast message="rate_limited: slow" />)
    expect(screen.getByTestId('in-game-error-toast')).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(3999)
    })
    expect(screen.queryByTestId('in-game-error-toast')).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(2)
    })
    expect(screen.queryByTestId('in-game-error-toast')).toBeNull()
  })

  it('can be dismissed by clicking the close button before timer expires', () => {
    render(<ErrorToast message="room_full: nope" />)
    const closeBtn = screen.getByTestId('in-game-error-toast-close')
    fireEvent.click(closeBtn)
    expect(screen.queryByTestId('in-game-error-toast')).toBeNull()
  })

  it('replaces a current toast when a new distinct message arrives (replace semantics)', () => {
    const { rerender } = render(<ErrorToast message="room_full: nope" />)
    expect(screen.getByTestId('in-game-error-toast').textContent).toContain('nope')

    // Advance halfway through the timer
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.queryByTestId('in-game-error-toast')).not.toBeNull()

    // New error arrives: previous is replaced, timer resets
    rerender(<ErrorToast message="rate_limited: slow" />)
    expect(screen.getByTestId('in-game-error-toast').textContent).toContain('slow')

    // Advance by 2s more — if the timer had NOT reset, the first toast (now 4s
    // old) would have vanished. Assert new toast still present (timer reset).
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.queryByTestId('in-game-error-toast')).not.toBeNull()
    expect(screen.getByTestId('in-game-error-toast').textContent).toContain('slow')

    // Another 2s and the new toast should dismiss (4s total since replacement)
    act(() => {
      vi.advanceTimersByTime(2001)
    })
    expect(screen.queryByTestId('in-game-error-toast')).toBeNull()
  })

  it('parses ErrorCode-prefixed messages and exposes a human title', () => {
    render(<ErrorToast message="rate_limited: Too many messages, slow down" />)
    const toast = screen.getByTestId('in-game-error-toast')
    // Title area should surface a human-readable error code
    const title = toast.querySelector('[data-testid="in-game-error-toast-title"]')
    expect(title).not.toBeNull()
    // Should show some rendering of rate_limited (rendered as "rate limited" / "Rate Limited" / etc.)
    expect(title!.textContent!.toLowerCase()).toMatch(/rate.?limited|rate limit/)
  })

  it('handles non-code messages (no colon) by rendering them verbatim', () => {
    render(<ErrorToast message="Connection lost" />)
    const toast = screen.getByTestId('in-game-error-toast')
    expect(toast.textContent).toContain('Connection lost')
  })

  it('dismissing then receiving the same message re-shows the toast', () => {
    const { rerender } = render(<ErrorToast message="room_full: nope" />)
    fireEvent.click(screen.getByTestId('in-game-error-toast-close'))
    expect(screen.queryByTestId('in-game-error-toast')).toBeNull()

    // Parent sends the same message again (e.g. key-prop bumped). We assert via
    // the explicit `messageKey` prop: if the caller bumps it, the toast re-renders.
    rerender(<ErrorToast message="room_full: nope" messageKey={2} />)
    expect(screen.getByTestId('in-game-error-toast')).not.toBeNull()
  })
})

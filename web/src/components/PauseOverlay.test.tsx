import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen, act, fireEvent } from '@testing-library/react'
import { PauseOverlay } from './PauseOverlay'

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  })
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  })
}

describe('PauseOverlay', () => {
  afterEach(() => {
    cleanup()
    setHidden(false)
  })

  it('does not render while document is visible', () => {
    setHidden(false)
    render(<PauseOverlay />)
    expect(screen.queryByText(/paused/i)).toBeNull()
  })

  it('renders overlay when document becomes hidden', () => {
    setHidden(false)
    render(<PauseOverlay />)

    act(() => {
      setHidden(true)
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(screen.getByText(/paused/i)).toBeDefined()
  })

  it('dismisses overlay when document becomes visible again', () => {
    setHidden(true)
    render(<PauseOverlay />)

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(screen.getByText(/paused/i)).toBeDefined()

    act(() => {
      setHidden(false)
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(screen.queryByText(/paused/i)).toBeNull()
  })

  it('dismisses when overlay is clicked', () => {
    setHidden(true)
    render(<PauseOverlay />)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    const overlay = screen.getByTestId('pause-overlay')
    fireEvent.click(overlay)
    expect(screen.queryByText(/paused/i)).toBeNull()
  })
})

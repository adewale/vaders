import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MobileGate } from './MobileGate'

describe('MobileGate', () => {
  let originalInnerWidth: number

  beforeEach(() => {
    originalInnerWidth = window.innerWidth
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    })
    cleanup()
  })

  it('renders children when viewport is wide enough', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })

    render(
      <MobileGate>
        <div data-testid="game-content">Game Content</div>
      </MobileGate>,
    )

    const gameContent = screen.getByTestId('game-content')
    expect(gameContent).toBeDefined()
    expect(gameContent.textContent).toBe('Game Content')
    expect(screen.queryByText('Please play on a desktop or tablet.')).toBeNull()
  })

  it('shows desktop message when viewport is narrow', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 400,
    })

    render(
      <MobileGate>
        <div data-testid="game-content">Game Content</div>
      </MobileGate>,
    )

    expect(screen.queryByTestId('game-content')).toBeNull()
    const message = screen.getByText('Please play on a desktop or tablet.')
    expect(message).toBeDefined()
    expect(screen.getByText('VADERS')).toBeDefined()
    expect(screen.queryByText('SPACE INVADERS')).toBeNull()
  })

  it('treats exactly 600px as desktop (not mobile)', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 600,
    })

    render(
      <MobileGate>
        <div data-testid="game-content">Game Content</div>
      </MobileGate>,
    )

    expect(screen.getByTestId('game-content')).toBeDefined()
    expect(screen.queryByText('Please play on a desktop or tablet.')).toBeNull()
    expect(screen.getByTestId('game-content').textContent).toBe('Game Content')
  })

  it('treats 599px as mobile', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 599,
    })

    render(
      <MobileGate>
        <div data-testid="game-content">Game Content</div>
      </MobileGate>,
    )

    expect(screen.queryByTestId('game-content')).toBeNull()
    expect(screen.getByText('This game requires a larger screen.')).toBeDefined()
    expect(screen.getByText('Please play on a desktop or tablet.')).toBeDefined()
  })
})

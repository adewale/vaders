import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { GameScreen } from './GameScreen'
import { createDefaultGameState } from '../../../shared/state-defaults'
import type { GameState } from '../../../shared/types'

describe('GameScreen in-game hints bar', () => {
  afterEach(() => cleanup())

  function makePlayingState(): GameState {
    const s = createDefaultGameState('TEST01')
    s.status = 'playing'
    return s
  }

  it('renders a HintsBar with role="game"', () => {
    render(<GameScreen state={makePlayingState()} playerId={null} />)
    const bar = screen.getByTestId('hints-bar')
    expect(bar).not.toBeNull()
    expect(bar.getAttribute('data-role')).toBe('game')
  })

  it('lists the core gameplay shortcuts (move, shoot, forfeit, mute, help)', () => {
    render(<GameScreen state={makePlayingState()} playerId={null} />)
    const bar = screen.getByTestId('hints-bar')
    const items = Array.from(bar.querySelectorAll('[data-testid="hint-item"]'))
    const text = items.map((el) => el.textContent ?? '').join(' ')
    // Movement + shoot
    expect(text).toMatch(/←.*→|Move/i)
    expect(text).toMatch(/SPACE/)
    expect(text).toMatch(/Shoot/i)
    // Forfeit
    expect(text).toMatch(/\bX\b/)
    expect(text).toMatch(/Forfeit/i)
    // Audio + help
    expect(text).toMatch(/\bM\b/)
    expect(text).toMatch(/Mute/i)
    expect(text).toMatch(/\?/)
    expect(text).toMatch(/Help/i)
  })
})

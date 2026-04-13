import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, screen, act } from '@testing-library/react'
import { PlayerDepartureNotice } from './PlayerDepartureNotice'
import { coopState } from '../testing/coopFixture'
import type { GameState } from '../../../shared/types'

function withoutPlayer(state: GameState, id: string): GameState {
  const next: GameState = { ...state, players: { ...state.players } }
  delete next.players[id]
  return next
}

describe('PlayerDepartureNotice', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('renders nothing when prev and curr have the same players', () => {
    const prev = coopState(3)
    const curr = coopState(3)
    render(<PlayerDepartureNotice prevState={prev} state={curr} />)
    expect(screen.queryByTestId('player-departure-notice')).toBeNull()
  })

  it('surfaces a toast when a player present in prev is missing from curr', () => {
    const prev = coopState(3) // slots 1, 2, 3 present
    const curr = withoutPlayer(prev, 'player-2')
    render(<PlayerDepartureNotice prevState={prev} state={curr} />)
    const toast = screen.getByTestId('player-departure-notice')
    expect(toast).not.toBeNull()
    // Identify the departing slot/name in the message
    expect(toast.textContent).toMatch(/P2|Player 2|slot 2|left|disconnected/i)
  })

  it('auto-dismisses after 3 seconds', () => {
    const prev = coopState(3)
    const curr = withoutPlayer(prev, 'player-2')
    render(<PlayerDepartureNotice prevState={prev} state={curr} />)
    expect(screen.queryByTestId('player-departure-notice')).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(2999)
    })
    expect(screen.queryByTestId('player-departure-notice')).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(2)
    })
    expect(screen.queryByTestId('player-departure-notice')).toBeNull()
  })

  it('handles two departures in the same tick by listing both', () => {
    const prev = coopState(3) // 1, 2, 3
    // Remove slots 2 AND 3 — only slot 1 remains
    let curr = withoutPlayer(prev, 'player-2')
    curr = withoutPlayer(curr, 'player-3')
    render(<PlayerDepartureNotice prevState={prev} state={curr} />)
    const toast = screen.getByTestId('player-departure-notice')
    expect(toast.textContent).toMatch(/P2/)
    expect(toast.textContent).toMatch(/P3/)
  })

  it('does not re-trigger when prev is null (first sync)', () => {
    const curr = coopState(3)
    render(<PlayerDepartureNotice prevState={null} state={curr} />)
    expect(screen.queryByTestId('player-departure-notice')).toBeNull()
  })

  it('does not surface a notice for players who joined (opposite transition)', () => {
    const prev = coopState(2) // 1, 2
    const curr = coopState(3) // 1, 2, 3 — player joined, nobody left
    render(<PlayerDepartureNotice prevState={prev} state={curr} />)
    expect(screen.queryByTestId('player-departure-notice')).toBeNull()
  })

  it('detects the transition even when curr has 2 players and prev had 3', () => {
    // The audit case: "prev state with 3 players, curr state with 2 → UI
    // surfaces the departure".
    const prev = coopState(3)
    const curr = withoutPlayer(prev, 'player-3')
    render(<PlayerDepartureNotice prevState={prev} state={curr} />)
    const toast = screen.getByTestId('player-departure-notice')
    expect(toast).not.toBeNull()
    // Only slot 3 should be mentioned, not slots 1 or 2
    expect(toast.textContent).toMatch(/P3/)
  })

  it('uses the departing player name when available rather than slot number', () => {
    const prev = coopState(2)
    // Rename player-2 to "Alice" so the toast surfaces the human name.
    prev.players['player-2'].name = 'Alice'
    const curr = withoutPlayer(prev, 'player-2')
    render(<PlayerDepartureNotice prevState={prev} state={curr} />)
    const toast = screen.getByTestId('player-departure-notice')
    expect(toast.textContent).toContain('Alice')
  })
})

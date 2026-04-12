import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { ControlsCheatsheet } from './ControlsCheatsheet'

describe('ControlsCheatsheet', () => {
  afterEach(() => cleanup())

  it('is hidden by default', () => {
    render(<ControlsCheatsheet />)
    expect(screen.queryByTestId('controls-cheatsheet')).toBeNull()
  })

  it('opens when ? key is pressed', () => {
    render(<ControlsCheatsheet />)
    fireEvent.keyDown(window, { key: '?' })
    expect(screen.getByTestId('controls-cheatsheet')).toBeDefined()
  })

  it('closes when ? key is pressed while open', () => {
    render(<ControlsCheatsheet />)
    fireEvent.keyDown(window, { key: '?' })
    fireEvent.keyDown(window, { key: '?' })
    expect(screen.queryByTestId('controls-cheatsheet')).toBeNull()
  })

  it('closes when Escape is pressed while open', () => {
    render(<ControlsCheatsheet />)
    fireEvent.keyDown(window, { key: '?' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('controls-cheatsheet')).toBeNull()
  })

  it('lists expected controls', () => {
    render(<ControlsCheatsheet />)
    fireEvent.keyDown(window, { key: '?' })
    const text = screen.getByTestId('controls-cheatsheet').textContent ?? ''
    expect(text).toMatch(/Move/i)
    expect(text).toMatch(/Shoot/i)
    expect(text).toMatch(/Ready/i)
    expect(text).toMatch(/Forfeit/i)
    expect(text).toMatch(/Mute/i)
    expect(text).toMatch(/help/i)
    expect(text).toMatch(/menu/i)
  })

  it('lists TUI-aligned menu + audio shortcuts (1-4, arrows, N music)', () => {
    render(<ControlsCheatsheet />)
    fireEvent.keyDown(window, { key: '?' })
    const root = screen.getByTestId('controls-cheatsheet')
    // Each shortcut lives in its own <td>, so we can exact-match cell text.
    const cells = Array.from(root.querySelectorAll('td')).map((td) => td.textContent?.trim())
    // Music mute (N) — matches the TUI's separate music toggle
    expect(cells).toContain('N')
    expect(cells).toContain('Mute music')
    // Menu navigation keys
    expect(cells).toContain('1-4')
    expect(cells.some((c) => /navigate/i.test(c ?? ''))).toBe(true)
    // Separate SFX mute (M), distinct from music mute
    expect(cells).toContain('M')
    expect(cells).toContain('Mute SFX')
  })
})

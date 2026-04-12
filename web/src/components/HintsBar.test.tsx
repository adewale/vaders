import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import fc from 'fast-check'
import { HintsBar } from './HintsBar'

describe('HintsBar', () => {
  afterEach(() => cleanup())

  it('renders each [key, desc] pair as visible text', () => {
    render(
      <HintsBar
        role="lobby"
        hints={[
          ['ENTER', 'Ready'],
          ['ESC', 'Leave'],
          ['M', 'Mute SFX'],
        ]}
      />,
    )
    const bar = screen.getByTestId('hints-bar')
    const text = bar.textContent ?? ''
    expect(text).toContain('ENTER')
    expect(text).toContain('Ready')
    expect(text).toContain('ESC')
    expect(text).toContain('Leave')
    expect(text).toContain('M')
    expect(text).toContain('Mute SFX')
  })

  it('exposes data-testid="hints-bar" and the correct data-role', () => {
    render(<HintsBar role="game-over" hints={[['R', 'Play Again']]} />)
    const bar = screen.getByTestId('hints-bar')
    expect(bar.getAttribute('data-role')).toBe('game-over')
  })

  it('returns null when hints is empty (nothing to render)', () => {
    const { container } = render(<HintsBar role="lobby" hints={[]} />)
    expect(screen.queryByTestId('hints-bar')).toBeNull()
    expect(container.firstChild).toBeNull()
  })

  it('renders hints in the order given by the input array', () => {
    render(
      <HintsBar
        role="lobby"
        hints={[
          ['A', 'first'],
          ['B', 'second'],
          ['C', 'third'],
        ]}
      />,
    )
    const items = screen.getAllByTestId('hint-item')
    expect(items).toHaveLength(3)
    expect(items[0].textContent).toContain('A')
    expect(items[0].textContent).toContain('first')
    expect(items[1].textContent).toContain('B')
    expect(items[1].textContent).toContain('second')
    expect(items[2].textContent).toContain('C')
    expect(items[2].textContent).toContain('third')
    // Ordering: "first" appears before "second" in DOM text.
    const bar = screen.getByTestId('hints-bar')
    const fullText = bar.textContent ?? ''
    expect(fullText.indexOf('first')).toBeLessThan(fullText.indexOf('second'))
    expect(fullText.indexOf('second')).toBeLessThan(fullText.indexOf('third'))
  })

  it('[PBT] renders exactly hints.length items preserving every key and desc', () => {
    const tokenArb = fc
      .string({ minLength: 1, maxLength: 8 })
      // Exclude whitespace-only strings and characters that would get normalised
      // away so textContent assertions remain deterministic.
      .filter((s) => s.trim().length > 0 && !/[\s\u00a0]/.test(s))

    fc.assert(
      fc.property(fc.array(fc.tuple(tokenArb, tokenArb), { minLength: 0, maxLength: 8 }), (hints) => {
        const { unmount } = render(<HintsBar role="lobby" hints={hints} />)
        try {
          if (hints.length === 0) {
            expect(screen.queryByTestId('hints-bar')).toBeNull()
            return
          }
          const items = screen.getAllByTestId('hint-item')
          expect(items).toHaveLength(hints.length)
          const bar = screen.getByTestId('hints-bar')
          const text = bar.textContent ?? ''
          for (const [key, desc] of hints) {
            expect(text).toContain(key)
            expect(text).toContain(desc)
          }
        } finally {
          unmount()
        }
      }),
      { numRuns: 40 },
    )
  })
})

import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MenuBackground } from './MenuBackground'

describe('MenuBackground', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders a canvas element', () => {
    const { container } = render(
      <MenuBackground>
        <div data-testid="child">content</div>
      </MenuBackground>,
    )
    const canvas = container.querySelector('canvas')
    expect(canvas).not.toBeNull()
  })

  it('renders children on top of the canvas', () => {
    const { getByTestId } = render(
      <MenuBackground>
        <div data-testid="child">content</div>
      </MenuBackground>,
    )
    expect(getByTestId('child')).toBeDefined()
    expect(getByTestId('child').textContent).toBe('content')
  })

  it('has a data-testid on the canvas for targeting', () => {
    const { container } = render(
      <MenuBackground>
        <span>x</span>
      </MenuBackground>,
    )
    const canvas = container.querySelector('[data-testid="menu-background-canvas"]')
    expect(canvas).not.toBeNull()
  })
})

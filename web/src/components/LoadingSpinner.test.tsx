import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { LoadingSpinner } from './LoadingSpinner'

describe('LoadingSpinner', () => {
  afterEach(() => cleanup())

  it('renders with a label', () => {
    render(<LoadingSpinner label="Connecting" />)
    expect(screen.getByText(/connecting/i)).toBeDefined()
  })

  it('renders the spinner element', () => {
    const { container } = render(<LoadingSpinner label="Loading" />)
    expect(container.querySelector('[data-testid="loading-spinner"]')).not.toBeNull()
  })

  it('accepts and displays attempt number', () => {
    render(<LoadingSpinner label="Reconnecting" attempt={3} />)
    expect(screen.getByText(/attempt 3/i)).toBeDefined()
  })

  it('does not show attempt when undefined or zero', () => {
    const { container } = render(<LoadingSpinner label="Connecting" />)
    expect(container.textContent).not.toMatch(/attempt/i)
  })
})

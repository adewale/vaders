import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { AlienParade } from './AlienParade'

describe('AlienParade', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders a canvas element', () => {
    const { container } = render(<AlienParade />)
    const canvas = container.querySelector('canvas')
    expect(canvas).not.toBeNull()
  })

  it('exposes the 3 alien types it renders', () => {
    const { container } = render(<AlienParade />)
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    // Encoded as a data attribute so tests can assert the 3 alien types
    // without introspecting canvas pixels (which jsdom can't render).
    expect(canvas.dataset.aliens).toBe('squid,crab,octopus')
  })

  it('has sensible default dimensions', () => {
    const { container } = render(<AlienParade />)
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.width).toBe(400)
    expect(canvas.height).toBe(60)
  })
})

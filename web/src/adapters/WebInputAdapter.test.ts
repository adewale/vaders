import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WebInputAdapter } from './WebInputAdapter'

describe('WebInputAdapter', () => {
  let adapter: WebInputAdapter
  let target: EventTarget

  beforeEach(() => {
    target = new EventTarget()
    adapter = new WebInputAdapter(target)
  })

  it('maps ArrowLeft keydown to VadersKey left', () => {
    const callback = vi.fn()
    adapter.onKey(callback)

    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' })
    target.dispatchEvent(event)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith('left', 'down')
    expect(callback.mock.calls[0][0]).toBe('left')
  })

  it('maps ArrowRight keydown to VadersKey right', () => {
    const callback = vi.fn()
    adapter.onKey(callback)

    const event = new KeyboardEvent('keydown', { key: 'ArrowRight' })
    target.dispatchEvent(event)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith('right', 'down')
    expect(callback.mock.calls[0][0]).toBe('right')
  })

  it('maps space keydown to VadersKey shoot', () => {
    const callback = vi.fn()
    adapter.onKey(callback)

    const event = new KeyboardEvent('keydown', { key: ' ' })
    target.dispatchEvent(event)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith('shoot', 'down')
    expect(callback.mock.calls[0][0]).toBe('shoot')
  })

  it('maps Enter keydown to VadersKey enter', () => {
    const callback = vi.fn()
    adapter.onKey(callback)

    const event = new KeyboardEvent('keydown', { key: 'Enter' })
    target.dispatchEvent(event)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith('enter', 'down')
    expect(callback.mock.calls[0][0]).toBe('enter')
  })

  it('maps Escape keydown to VadersKey escape', () => {
    const callback = vi.fn()
    adapter.onKey(callback)

    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    target.dispatchEvent(event)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith('escape', 'down')
    expect(callback.mock.calls[0][0]).toBe('escape')
  })

  it('filters repeat events so callback is not called', () => {
    const callback = vi.fn()
    adapter.onKey(callback)

    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', repeat: true })
    target.dispatchEvent(event)

    expect(callback).not.toHaveBeenCalled()
    expect(callback).toHaveBeenCalledTimes(0)
    // Verify the event was indeed a repeat
    expect(event.repeat).toBe(true)
  })

  it('calls preventDefault on arrow and space keys', () => {
    const callback = vi.fn()
    adapter.onKey(callback)

    const arrowEvent = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true })
    const spaceEvent = new KeyboardEvent('keydown', { key: ' ', cancelable: true })
    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })

    const arrowSpy = vi.spyOn(arrowEvent, 'preventDefault')
    const spaceSpy = vi.spyOn(spaceEvent, 'preventDefault')
    const escapeSpy = vi.spyOn(escapeEvent, 'preventDefault')

    target.dispatchEvent(arrowEvent)
    target.dispatchEvent(spaceEvent)
    target.dispatchEvent(escapeEvent)

    expect(arrowSpy).toHaveBeenCalled()
    expect(spaceSpy).toHaveBeenCalled()
    // Escape should not be prevented (browser may need it)
    expect(escapeSpy).not.toHaveBeenCalled()
  })

  it('reports up type on keyup events', () => {
    const callback = vi.fn()
    adapter.onKey(callback)

    const event = new KeyboardEvent('keyup', { key: 'ArrowLeft' })
    target.dispatchEvent(event)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith('left', 'up')
    expect(callback.mock.calls[0][1]).toBe('up')
  })

  it('has supportsKeyRelease set to true', () => {
    expect(adapter.supportsKeyRelease).toBe(true)
    expect(typeof adapter.supportsKeyRelease).toBe('boolean')
    expect(adapter.supportsKeyRelease).not.toBe(false)
  })

  it('cleanup (unsubscribe) removes event listeners', () => {
    const callback = vi.fn()
    const unsubscribe = adapter.onKey(callback)

    // First event should fire
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    expect(callback).toHaveBeenCalledTimes(1)

    // Unsubscribe
    unsubscribe()

    // Second event should not fire
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith('left', 'down')
  })

  it('ignores unmapped keys', () => {
    const callback = vi.fn()
    adapter.onKey(callback)

    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1' }))
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))

    expect(callback).not.toHaveBeenCalled()
    expect(callback).toHaveBeenCalledTimes(0)
    // Verify none of the 3 unmapped keys triggered the callback
    expect(callback.mock.calls).toHaveLength(0)
  })

  it('maps number keys 1-4 for player slot selection', () => {
    const callback = vi.fn()
    adapter.onKey(callback)

    target.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }))
    target.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }))
    target.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }))
    target.dispatchEvent(new KeyboardEvent('keydown', { key: '4' }))

    expect(callback).toHaveBeenCalledTimes(4)
    expect(callback).toHaveBeenNthCalledWith(1, '1', 'down')
    expect(callback).toHaveBeenNthCalledWith(2, '2', 'down')
    expect(callback).toHaveBeenNthCalledWith(3, '3', 'down')
    expect(callback).toHaveBeenNthCalledWith(4, '4', 'down')
  })

  it('maps letter keys q, m, s, r, x to game actions', () => {
    const callback = vi.fn()
    adapter.onKey(callback)

    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }))
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }))
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }))
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }))
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }))

    expect(callback).toHaveBeenCalledTimes(5)
    expect(callback).toHaveBeenNthCalledWith(1, 'quit', 'down')
    expect(callback).toHaveBeenNthCalledWith(2, 'mute', 'down')
    expect(callback).toHaveBeenNthCalledWith(3, 'solo', 'down')
    expect(callback).toHaveBeenNthCalledWith(4, 'ready', 'down')
    expect(callback).toHaveBeenNthCalledWith(5, 'forfeit', 'down')
  })
})

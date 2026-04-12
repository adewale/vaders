import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WebFrameScheduler } from './WebFrameScheduler'

describe('WebFrameScheduler', () => {
  let originalRAF: typeof globalThis.requestAnimationFrame
  let originalCAF: typeof globalThis.cancelAnimationFrame

  beforeEach(() => {
    originalRAF = globalThis.requestAnimationFrame
    originalCAF = globalThis.cancelAnimationFrame
  })

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRAF
    globalThis.cancelAnimationFrame = originalCAF
  })

  it('requestFrame calls requestAnimationFrame and returns the handle', () => {
    const expectedHandle = 42
    globalThis.requestAnimationFrame = vi.fn(() => expectedHandle)

    const scheduler = new WebFrameScheduler()
    const callback = vi.fn()
    const handle = scheduler.requestFrame(callback)

    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledWith(callback)
    expect(handle).toBe(expectedHandle)
  })

  it('cancelFrame calls cancelAnimationFrame with the handle', () => {
    globalThis.cancelAnimationFrame = vi.fn()

    const scheduler = new WebFrameScheduler()
    const handle = 99

    scheduler.cancelFrame(handle)

    expect(globalThis.cancelAnimationFrame).toHaveBeenCalledTimes(1)
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalledWith(handle)
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalledWith(99)
  })

  it('returns the frame handle from requestAnimationFrame', () => {
    let counter = 100
    globalThis.requestAnimationFrame = vi.fn(() => counter++)

    const scheduler = new WebFrameScheduler()

    const handle1 = scheduler.requestFrame(() => {})
    const handle2 = scheduler.requestFrame(() => {})

    expect(handle1).toBe(100)
    expect(handle2).toBe(101)
    expect(handle1).not.toBe(handle2)
  })
})

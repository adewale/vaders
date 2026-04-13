import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseRoute, navigateTo } from './router'

describe('parseRoute', () => {
  it('returns launch route for root path', () => {
    const route = parseRoute('/', '')
    expect(route.type).toBe('launch')
    expect(route).toEqual({ type: 'launch' })
    expect(Object.keys(route)).toHaveLength(1)
  })

  it('returns solo route for /solo path', () => {
    const route = parseRoute('/solo', '')
    expect(route.type).toBe('solo')
    expect(route).toEqual({ type: 'solo' })
    expect(Object.keys(route)).toHaveLength(1)
  })

  it('returns room route with code for /room/ABC123', () => {
    const route = parseRoute('/room/ABC123', '')
    expect(route.type).toBe('room')
    expect(route).toEqual({ type: 'room', code: 'ABC123' })
    expect('code' in route && route.code).toBe('ABC123')
  })

  it('uppercases room codes from lowercase paths', () => {
    const route = parseRoute('/room/abc123', '')
    expect(route.type).toBe('room')
    expect(route).toEqual({ type: 'room', code: 'ABC123' })
    expect('code' in route && route.code).toBe('ABC123')
  })

  it('returns matchmake route when search contains matchmake=true', () => {
    const route = parseRoute('/', '?matchmake=true')
    expect(route.type).toBe('matchmake')
    expect(route).toEqual({ type: 'matchmake' })
    expect(Object.keys(route)).toHaveLength(1)
  })

  it('returns launch route for unknown paths as fallback', () => {
    const route = parseRoute('/unknown', '')
    expect(route.type).toBe('launch')
    expect(route).toEqual({ type: 'launch' })

    const route2 = parseRoute('/foo/bar/baz', '')
    expect(route2.type).toBe('launch')
  })

  it('rejects room codes that are not exactly 6 alphanumeric chars', () => {
    const short = parseRoute('/room/ABC', '')
    expect(short.type).toBe('launch')
    expect(short).toEqual({ type: 'launch' })
    expect('code' in short).toBe(false)

    const long = parseRoute('/room/ABCDEFG', '')
    expect(long.type).toBe('launch')

    const special = parseRoute('/room/ABC!23', '')
    expect(special.type).toBe('launch')
  })

  it('handles mixed-case room codes', () => {
    const route = parseRoute('/room/AbC1d2', '')
    expect(route.type).toBe('room')
    expect('code' in route && route.code).toBe('ABC1D2')
    expect(route).toEqual({ type: 'room', code: 'ABC1D2' })
  })

  it('does not match matchmake in path, only in search', () => {
    const route = parseRoute('/matchmake', '')
    expect(route.type).toBe('launch')
    expect(route).toEqual({ type: 'launch' })
    expect(Object.keys(route)).toHaveLength(1)
  })
})

describe('navigateTo', () => {
  let pushSpy: ReturnType<typeof vi.spyOn>
  let replaceSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Reset location to a known baseline before each test. jsdom allows
    // `history.pushState` / `replaceState` to mutate location.
    window.history.replaceState(null, '', '/')
    pushSpy = vi.spyOn(window.history, 'pushState')
    replaceSpy = vi.spyOn(window.history, 'replaceState')
  })

  afterEach(() => {
    pushSpy.mockRestore()
    replaceSpy.mockRestore()
  })

  it('calls pushState by default when navigating to a different path', () => {
    navigateTo('/room/ABC123')
    expect(pushSpy).toHaveBeenCalledTimes(1)
    expect(pushSpy).toHaveBeenCalledWith(null, '', '/room/ABC123')
    expect(replaceSpy).not.toHaveBeenCalled()
  })

  it('calls replaceState when { replace: true } is passed', () => {
    navigateTo('/room/ABC123', { replace: true })
    expect(replaceSpy).toHaveBeenCalledTimes(1)
    expect(replaceSpy).toHaveBeenCalledWith(null, '', '/room/ABC123')
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('auto-replaces when navigating to the current URL (pathname only)', () => {
    window.history.replaceState(null, '', '/room/ABC123')
    // Clear the spy call history from the setup above
    pushSpy.mockClear()
    replaceSpy.mockClear()

    navigateTo('/room/ABC123')
    expect(replaceSpy).toHaveBeenCalledTimes(1)
    expect(replaceSpy).toHaveBeenCalledWith(null, '', '/room/ABC123')
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('auto-replaces when navigating to the current URL (pathname + search)', () => {
    window.history.replaceState(null, '', '/?matchmake=true')
    pushSpy.mockClear()
    replaceSpy.mockClear()

    navigateTo('/?matchmake=true')
    expect(replaceSpy).toHaveBeenCalledTimes(1)
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('uses push when target path differs from current (even same pathname, different search)', () => {
    window.history.replaceState(null, '', '/')
    pushSpy.mockClear()
    replaceSpy.mockClear()

    navigateTo('/?matchmake=true')
    expect(pushSpy).toHaveBeenCalledTimes(1)
    expect(replaceSpy).not.toHaveBeenCalled()
  })

  it('dispatches popstate after pushState so useRoute subscribers update', () => {
    const handler = vi.fn()
    window.addEventListener('popstate', handler)

    navigateTo('/room/ABC123')
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0]).toBeInstanceOf(PopStateEvent)

    window.removeEventListener('popstate', handler)
  })

  it('dispatches popstate after replaceState so useRoute subscribers update', () => {
    const handler = vi.fn()
    window.addEventListener('popstate', handler)

    navigateTo('/room/ABC123', { replace: true })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0]).toBeInstanceOf(PopStateEvent)

    window.removeEventListener('popstate', handler)
  })

  it('dispatches popstate after auto-replace when navigating to current URL', () => {
    window.history.replaceState(null, '', '/room/ABC123')
    const handler = vi.fn()
    window.addEventListener('popstate', handler)

    navigateTo('/room/ABC123')
    expect(handler).toHaveBeenCalledTimes(1)

    window.removeEventListener('popstate', handler)
  })

  it('explicit { replace: false } still auto-replaces when URL matches current', () => {
    // Auto-replace triggers when currentUrl === path, regardless of the
    // replace option — this is a deliberate guard against back-stack bloat.
    window.history.replaceState(null, '', '/room/ABC123')
    pushSpy.mockClear()
    replaceSpy.mockClear()

    navigateTo('/room/ABC123', { replace: false })
    expect(replaceSpy).toHaveBeenCalledTimes(1)
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('PBT: navigating to the current URL never grows the history stack', async () => {
    // The auto-replace behaviour is property-shaped: for ANY path, if
    // you're already at that path and navigate to it again, push must
    // not fire. Previously only a handful of example tests covered
    // this; a PBT over arbitrary paths catches the class.
    const fc = await import('fast-check')
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^\/(?:room\/[A-Z0-9]{6}|solo|\?matchmake=true|)?$/),
        async (path) => {
          window.history.replaceState(null, '', path || '/')
          pushSpy.mockClear()
          replaceSpy.mockClear()
          navigateTo(path || '/')
          // Same URL → zero pushes, exactly one replace.
          return pushSpy.mock.calls.length === 0 && replaceSpy.mock.calls.length === 1
        },
      ),
      { numRuns: 40 },
    )
  })

  it('PBT: navigating to a DIFFERENT URL always pushes (back-stack grows by one)', async () => {
    // Mirror property: if the target differs from the current URL, we
    // push. Guards against an over-eager auto-replace that would swallow
    // genuine forward navigation.
    const fc = await import('fast-check')
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^\/[a-z]{3,6}$/),
        fc.stringMatching(/^\/[a-z]{3,6}$/),
        async (from, to) => {
          if (from === to) return true // same-URL case covered by sibling PBT
          window.history.replaceState(null, '', from)
          pushSpy.mockClear()
          replaceSpy.mockClear()
          navigateTo(to)
          // Different URL, default push path.
          return pushSpy.mock.calls.length === 1 && replaceSpy.mock.calls.length === 0
        },
      ),
      { numRuns: 40 },
    )
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoom, createSoloRoom, matchmake, getRoomInfo, buildWsUrl } from './roomApi'

// ─── Helpers ────────────────────────────────────────────────────────────────

function mockFetchResponse(body: unknown, init?: ResponseInit): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), init)))
}

function mockFetchFailure(status: number, statusText = 'Error'): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status, statusText })))
}

// ─── Setup / Teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── 1. createRoom calls POST /room and returns roomId + wsUrl ──────────────

describe('createRoom', () => {
  it('calls POST /room and returns roomId + wsUrl', async () => {
    mockFetchResponse({ roomId: 'ABC123' })

    const result = await createRoom()

    expect(result.roomId).toBe('ABC123')
    expect(result.wsUrl).toContain('ABC123')
    expect(result.wsUrl).toMatch(/^wss?:\/\//)
    expect(result.wsUrl).toMatch(/\/room\/ABC123\/ws$/)

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(fetchCall[0]).toContain('/room')
    expect(fetchCall[1]).toEqual({ method: 'POST' })
  })

  // ─── 2. createRoom throws on non-OK response ───────────────────────────────

  it('throws on non-OK response', async () => {
    mockFetchFailure(500, 'Internal Server Error')

    await expect(createRoom()).rejects.toThrow('Failed to create room: 500')
    expect(fetch).toHaveBeenCalledTimes(1)

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(fetchCall[1]).toEqual({ method: 'POST' })
  })

  it('throws on 503 service unavailable', async () => {
    mockFetchFailure(503, 'Service Unavailable')

    await expect(createRoom()).rejects.toThrow('Failed to create room: 503')
    await expect(createRoom()).rejects.toBeInstanceOf(Error)
    expect(fetch).toHaveBeenCalled()
  })
})

// ─── 3. matchmake calls GET /matchmake ──────────────────────────────────────

describe('matchmake', () => {
  it('calls GET /matchmake and returns roomId + wsUrl', async () => {
    mockFetchResponse({ roomId: 'MATCH42' })

    const result = await matchmake()

    expect(result.roomId).toBe('MATCH42')
    expect(result.wsUrl).toContain('MATCH42')
    expect(result.wsUrl).toMatch(/\/room\/MATCH42\/ws$/)

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(fetchCall[0]).toContain('/matchmake')
    // GET is the default method, so no explicit method should be set
    expect(fetchCall[1]).toBeUndefined()
  })

  it('throws on non-OK response', async () => {
    mockFetchFailure(502, 'Bad Gateway')

    await expect(matchmake()).rejects.toThrow('Failed to matchmake: 502')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('/matchmake')
  })
})

// ─── 4. getRoomInfo returns null on 404 ─────────────────────────────────────

describe('getRoomInfo', () => {
  it('returns null on 404', async () => {
    mockFetchFailure(404, 'Not Found')

    const result = await getRoomInfo('NONEXIST')

    expect(result).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('/room/NONEXIST')
  })

  // ─── 5. getRoomInfo returns data on 200 ───────────────────────────────────

  it('returns data on 200', async () => {
    mockFetchResponse({ roomId: 'XYZ789', status: 'waiting', playerCount: 2 })

    const result = await getRoomInfo('XYZ789')

    expect(result).not.toBeNull()
    expect(result!.status).toBe('waiting')
    expect(result!.playerCount).toBe(2)
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('/room/XYZ789')
  })

  it('returns null on any non-OK status (e.g. 500)', async () => {
    mockFetchFailure(500, 'Internal Server Error')

    const result = await getRoomInfo('BROKEN')

    expect(result).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('/room/BROKEN')
  })
})

// ─── 6. buildWsUrl converts https to wss ────────────────────────────────────

describe('buildWsUrl', () => {
  it('converts http(s) to ws(s)', () => {
    // SERVER_URL defaults to same-origin (window.location.origin in browsers).
    // The function must convert http→ws and https→wss regardless of source.
    const url = buildWsUrl('ROOM01')

    expect(url).toMatch(/^wss?:\/\//)
    expect(url).toContain('ROOM01')
    expect(url).toMatch(/\/room\/ROOM01\/ws$/)
    // No leftover http scheme
    expect(url).not.toMatch(/^http/)
  })

  it('produces a valid WebSocket URL with path', () => {
    const url = buildWsUrl('TEST99')

    expect(url).toMatch(/^wss?:\/\//)
    expect(url).toMatch(/\/room\/TEST99\/ws$/)
    expect(url.split('/').length).toBeGreaterThan(3)
  })

  it('handles room codes with various formats', () => {
    const shortUrl = buildWsUrl('A')
    const longUrl = buildWsUrl('ABCDEF123456')
    const soloUrl = buildWsUrl('SOLO')

    expect(shortUrl).toMatch(/\/room\/A\/ws$/)
    expect(longUrl).toMatch(/\/room\/ABCDEF123456\/ws$/)
    expect(soloUrl).toMatch(/\/room\/SOLO\/ws$/)
    // buildWsUrl is also used by createSoloRoom internally
    expect(buildWsUrl('TEST')).toMatch(/\/room\/TEST\/ws$/)
  })
})

// ─── 8. createSoloRoom ─────────────────────────────────────────────────────

describe('createSoloRoom', () => {
  it('creates a room via POST /room for solo play', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ roomId: 'SOLO01' }),
      }),
    )

    const result = await createSoloRoom()

    expect(result.roomId).toBe('SOLO01')
    expect(result.wsUrl).toContain('SOLO01')
    expect(result.wsUrl).toMatch(/\/room\/SOLO01\/ws$/)
  })
})

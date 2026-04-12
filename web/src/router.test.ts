import { describe, it, expect } from 'vitest'
import { parseRoute } from './router'

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

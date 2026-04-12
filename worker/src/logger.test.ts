// worker/src/logger.test.ts
// Tests for the structured "wide events" logger.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logEvent } from './logger'
import { BUILD_INFO } from './buildInfo'

describe('logEvent', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    // Clean up any CF_REGION we stub between tests
    delete (globalThis as { CF_REGION?: string }).CF_REGION
  })

  it('emits a single line to console.log', () => {
    logEvent('test_event', { roomCode: 'ABC123' })

    expect(consoleLogSpy).toHaveBeenCalledTimes(1)
    const output = consoleLogSpy.mock.calls[0][0] as string
    // Must be a single line: no newlines inside the emitted string
    expect(output).not.toContain('\n')
  })

  it('emits valid JSON', () => {
    logEvent('test_event', { roomCode: 'ABC123' })

    const output = consoleLogSpy.mock.calls[0][0] as string
    expect(() => JSON.parse(output)).not.toThrow()
  })

  it('includes all required envelope fields', () => {
    logEvent('test_event', { roomCode: 'ABC123' })

    const output = consoleLogSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(output)

    expect(parsed.event).toBe('test_event')
    expect(parsed.version).toBe(BUILD_INFO.version)
    expect(parsed.commitHash).toBe(BUILD_INFO.commitHash)
    expect(parsed.buildTime).toBe(BUILD_INFO.buildTime)
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/)
  })

  it('includes caller-supplied fields alongside the envelope', () => {
    logEvent('room_join', {
      roomCode: 'ABC123',
      playerId: 'player-42',
      slot: 2,
      totalPlayers: 3,
    })

    const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0] as string)

    expect(parsed.roomCode).toBe('ABC123')
    expect(parsed.playerId).toBe('player-42')
    expect(parsed.slot).toBe(2)
    expect(parsed.totalPlayers).toBe(3)
  })

  it('omits undefined fields from the output', () => {
    logEvent('test_event', {
      roomCode: 'ABC123',
      requestId: undefined,
      optionalField: undefined,
    })

    const output = consoleLogSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(output)

    expect('requestId' in parsed).toBe(false)
    expect('optionalField' in parsed).toBe(false)
    // And the stringified output should not contain the keys at all
    expect(output).not.toContain('requestId')
    expect(output).not.toContain('optionalField')
    // But defined fields must still be present
    expect(parsed.roomCode).toBe('ABC123')
  })

  it('omits region when globalThis.CF_REGION is unset', () => {
    // Default state (afterEach deletes CF_REGION)
    logEvent('test_event', { roomCode: 'ABC123' })

    const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0] as string)
    expect('region' in parsed).toBe(false)
  })

  it('includes region from globalThis.CF_REGION when set (simulating request.cf?.colo)', () => {
    // Simulate the HTTP middleware setting CF_REGION from request.cf.colo
    ;(globalThis as { CF_REGION?: string }).CF_REGION = 'LHR'

    logEvent('request_received', { method: 'POST', path: '/room' })

    const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0] as string)
    expect(parsed.region).toBe('LHR')
  })

  it('allows caller fields to override envelope fields (e.g. custom timestamp)', () => {
    // This is a documented property: caller fields are spread AFTER envelope,
    // so a caller can override timestamp/version if they really need to.
    logEvent('test_event', { version: 'custom-version' })

    const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0] as string)
    expect(parsed.version).toBe('custom-version')
  })

  it('emits a fresh timestamp on each call', () => {
    logEvent('first', { n: 1 })
    // Bump virtual clock by ≥1ms so ISO strings differ
    const before = JSON.parse(consoleLogSpy.mock.calls[0][0] as string).timestamp as string
    // Ensure at least a millisecond has elapsed — spin a tight loop rather
    // than relying on fake timers (we want real Date behavior here).
    const start = Date.now()
    while (Date.now() - start < 2) { /* spin */ }
    logEvent('second', { n: 2 })
    const after = JSON.parse(consoleLogSpy.mock.calls[1][0] as string).timestamp as string

    expect(after >= before).toBe(true)
  })

  it('handles nested object data without errors', () => {
    logEvent('game_over', {
      roomCode: 'ABC123',
      outcome: 'defeat',
      playerKills: { 'player-1': 5, 'player-2': 3 },
    })

    const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0] as string)
    expect(parsed.playerKills).toEqual({ 'player-1': 5, 'player-2': 3 })
  })

  it('handles empty data object', () => {
    logEvent('boot', {})

    const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0] as string)
    expect(parsed.event).toBe('boot')
    // Envelope fields should still be present
    expect(parsed.version).toBe(BUILD_INFO.version)
  })
})

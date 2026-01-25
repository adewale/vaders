// client/src/input.test.ts
// Unit tests for input adapter

import { describe, test, expect } from 'bun:test'
import { normalizeKey, createHeldKeysTracker, type VadersKey } from './input'

describe('normalizeKey', () => {
  test('normalizes left arrow', () => {
    const result = normalizeKey({ name: 'left', sequence: '\x1b[D', ctrl: false, meta: false, shift: false })
    expect(result).toEqual({ type: 'key', key: 'left' })
  })

  test('normalizes right arrow', () => {
    const result = normalizeKey({ name: 'right', sequence: '\x1b[C', ctrl: false, meta: false, shift: false })
    expect(result).toEqual({ type: 'key', key: 'right' })
  })

  test('normalizes up arrow', () => {
    const result = normalizeKey({ name: 'up', sequence: '\x1b[A', ctrl: false, meta: false, shift: false })
    expect(result).toEqual({ type: 'key', key: 'up' })
  })

  test('normalizes down arrow', () => {
    const result = normalizeKey({ name: 'down', sequence: '\x1b[B', ctrl: false, meta: false, shift: false })
    expect(result).toEqual({ type: 'key', key: 'down' })
  })

  test('normalizes space', () => {
    const result = normalizeKey({ name: 'space', sequence: ' ', ctrl: false, meta: false, shift: false })
    expect(result).toEqual({ type: 'key', key: 'space' })
  })

  test('normalizes enter/return', () => {
    const result = normalizeKey({ name: 'return', sequence: '\r', ctrl: false, meta: false, shift: false })
    expect(result).toEqual({ type: 'key', key: 'enter' })
  })

  test('normalizes escape', () => {
    const result = normalizeKey({ name: 'escape', sequence: '\x1b', ctrl: false, meta: false, shift: false })
    expect(result).toEqual({ type: 'key', key: 'escape' })
  })

  test('normalizes q key', () => {
    const result = normalizeKey({ name: 'q', sequence: 'q', ctrl: false, meta: false, shift: false })
    expect(result).toEqual({ type: 'key', key: 'q' })
  })

  test('normalizes Q key (uppercase) to lowercase', () => {
    const result = normalizeKey({ name: 'Q', sequence: 'Q', ctrl: false, meta: false, shift: true })
    expect(result).toEqual({ type: 'key', key: 'q' })
  })

  test('normalizes m key (mute toggle)', () => {
    const result = normalizeKey({ name: 'm', sequence: 'm', ctrl: false, meta: false, shift: false })
    expect(result).toEqual({ type: 'key', key: 'm' })
  })

  test('normalizes n key (music toggle)', () => {
    const result = normalizeKey({ name: 'n', sequence: 'n', ctrl: false, meta: false, shift: false })
    expect(result).toEqual({ type: 'key', key: 'n' })
  })

  test('normalizes s key (start solo)', () => {
    const result = normalizeKey({ name: 's', sequence: 's', ctrl: false, meta: false, shift: false })
    expect(result).toEqual({ type: 'key', key: 's' })
  })

  test('normalizes r key (ready)', () => {
    const result = normalizeKey({ name: 'r', sequence: 'r', ctrl: false, meta: false, shift: false })
    expect(result).toEqual({ type: 'key', key: 'r' })
  })

  test('returns char type for other single characters', () => {
    const result = normalizeKey({ name: 'a', sequence: 'a', ctrl: false, meta: false, shift: false })
    expect(result).toEqual({ type: 'char', char: 'a' })
  })

  test('returns null for unrecognized keys', () => {
    const result = normalizeKey({ name: 'f1', sequence: '\x1bOP', ctrl: false, meta: false, shift: false })
    expect(result).toBeNull()
  })

  test('normalizes arrow keys by sequence when name is not set', () => {
    const result = normalizeKey({ name: undefined, sequence: '\x1b[D', ctrl: false, meta: false, shift: false } as any)
    expect(result).toEqual({ type: 'key', key: 'left' })
  })
})

describe('createHeldKeysTracker', () => {
  test('initial state has no keys held', () => {
    const tracker = createHeldKeysTracker()
    expect(tracker.held.left).toBe(false)
    expect(tracker.held.right).toBe(false)
  })

  test('onPress sets left key held', () => {
    const tracker = createHeldKeysTracker()
    const changed = tracker.onPress({ type: 'key', key: 'left' })
    expect(changed).toBe(true)
    expect(tracker.held.left).toBe(true)
    expect(tracker.held.right).toBe(false)
    tracker.cleanup()
  })

  test('onPress sets right key held', () => {
    const tracker = createHeldKeysTracker()
    const changed = tracker.onPress({ type: 'key', key: 'right' })
    expect(changed).toBe(true)
    expect(tracker.held.left).toBe(false)
    expect(tracker.held.right).toBe(true)
    tracker.cleanup()
  })

  test('onPress returns false when key already held', () => {
    const tracker = createHeldKeysTracker()
    tracker.onPress({ type: 'key', key: 'left' })
    const changed = tracker.onPress({ type: 'key', key: 'left' })
    expect(changed).toBe(false)
    expect(tracker.held.left).toBe(true)
    tracker.cleanup()
  })

  test('onRelease clears left key', () => {
    const tracker = createHeldKeysTracker()
    tracker.onPress({ type: 'key', key: 'left' })
    const changed = tracker.onRelease({ type: 'key', key: 'left' })
    expect(changed).toBe(true)
    expect(tracker.held.left).toBe(false)
    tracker.cleanup()
  })

  test('onRelease clears right key', () => {
    const tracker = createHeldKeysTracker()
    tracker.onPress({ type: 'key', key: 'right' })
    const changed = tracker.onRelease({ type: 'key', key: 'right' })
    expect(changed).toBe(true)
    expect(tracker.held.right).toBe(false)
    tracker.cleanup()
  })

  test('onRelease returns false when key not held', () => {
    const tracker = createHeldKeysTracker()
    const changed = tracker.onRelease({ type: 'key', key: 'left' })
    expect(changed).toBe(false)
    tracker.cleanup()
  })

  test('ignores non-movement keys', () => {
    const tracker = createHeldKeysTracker()
    const pressChanged = tracker.onPress({ type: 'key', key: 'space' })
    expect(pressChanged).toBe(false)
    expect(tracker.held.left).toBe(false)
    expect(tracker.held.right).toBe(false)
    tracker.cleanup()
  })

  test('ignores char type keys', () => {
    const tracker = createHeldKeysTracker()
    const changed = tracker.onPress({ type: 'char', char: 'a' })
    expect(changed).toBe(false)
    tracker.cleanup()
  })

  test('can hold both keys simultaneously', () => {
    const tracker = createHeldKeysTracker()
    tracker.onPress({ type: 'key', key: 'left' })
    tracker.onPress({ type: 'key', key: 'right' })
    expect(tracker.held.left).toBe(true)
    expect(tracker.held.right).toBe(true)
    tracker.cleanup()
  })

  test('cleanup clears timeouts without error', () => {
    const tracker = createHeldKeysTracker()
    tracker.onPress({ type: 'key', key: 'left' })
    tracker.onPress({ type: 'key', key: 'right' })
    expect(() => tracker.cleanup()).not.toThrow()
  })

  test('exposes usesTimeoutFallback flag', () => {
    const tracker = createHeldKeysTracker()
    expect(typeof tracker.usesTimeoutFallback).toBe('boolean')
    tracker.cleanup()
  })
})

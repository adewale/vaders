// client/src/input.test.ts
// Unit tests for keyboard input handling

import { describe, test, expect } from 'bun:test'
import { normalizeKey, createHeldKeysTracker, type VadersKey } from './input'

// Mock KeyEvent for testing
function mockKeyEvent(opts: {
  name?: string
  sequence?: string
  eventType?: 'press' | 'release'
  repeated?: boolean
}) {
  return {
    name: opts.name ?? '',
    sequence: opts.sequence ?? '',
    eventType: opts.eventType ?? 'press',
    repeated: opts.repeated ?? false,
    ctrl: false,
    meta: false,
    shift: false,
  } as Parameters<typeof normalizeKey>[0]
}

describe('normalizeKey', () => {
  test('normalizes arrow keys by name', () => {
    expect(normalizeKey(mockKeyEvent({ name: 'left' }))).toEqual({ type: 'key', key: 'left' })
    expect(normalizeKey(mockKeyEvent({ name: 'right' }))).toEqual({ type: 'key', key: 'right' })
    expect(normalizeKey(mockKeyEvent({ name: 'up' }))).toEqual({ type: 'key', key: 'up' })
    expect(normalizeKey(mockKeyEvent({ name: 'down' }))).toEqual({ type: 'key', key: 'down' })
  })

  test('normalizes arrow keys by escape sequence', () => {
    expect(normalizeKey(mockKeyEvent({ sequence: '\x1b[D' }))).toEqual({ type: 'key', key: 'left' })
    expect(normalizeKey(mockKeyEvent({ sequence: '\x1b[C' }))).toEqual({ type: 'key', key: 'right' })
    expect(normalizeKey(mockKeyEvent({ sequence: '\x1b[A' }))).toEqual({ type: 'key', key: 'up' })
    expect(normalizeKey(mockKeyEvent({ sequence: '\x1b[B' }))).toEqual({ type: 'key', key: 'down' })
  })

  test('normalizes space key', () => {
    expect(normalizeKey(mockKeyEvent({ name: 'space' }))).toEqual({ type: 'key', key: 'space' })
    expect(normalizeKey(mockKeyEvent({ sequence: ' ' }))).toEqual({ type: 'key', key: 'space' })
  })

  test('normalizes enter/return key', () => {
    expect(normalizeKey(mockKeyEvent({ name: 'return' }))).toEqual({ type: 'key', key: 'enter' })
  })

  test('returns char type for other single characters', () => {
    expect(normalizeKey(mockKeyEvent({ sequence: 'x' }))).toEqual({ type: 'char', char: 'x' })
    expect(normalizeKey(mockKeyEvent({ sequence: '5' }))).toEqual({ type: 'char', char: '5' })
  })

  test('returns null for unrecognized keys', () => {
    expect(normalizeKey(mockKeyEvent({ name: 'unknown', sequence: '\x1b[99~' }))).toBeNull()
  })
})

describe('createHeldKeysTracker', () => {
  test('initial state is both keys released', () => {
    const tracker = createHeldKeysTracker()
    expect(tracker.held).toEqual({ left: false, right: false })
  })

  test('onPress sets key to held', () => {
    const tracker = createHeldKeysTracker()

    const leftChanged = tracker.onPress({ type: 'key', key: 'left' })
    expect(leftChanged).toBe(true)
    expect(tracker.held).toEqual({ left: true, right: false })

    const rightChanged = tracker.onPress({ type: 'key', key: 'right' })
    expect(rightChanged).toBe(true)
    expect(tracker.held).toEqual({ left: true, right: true })
  })

  test('onPress returns false if already held', () => {
    const tracker = createHeldKeysTracker()

    tracker.onPress({ type: 'key', key: 'left' })
    const secondPress = tracker.onPress({ type: 'key', key: 'left' })
    expect(secondPress).toBe(false)
    expect(tracker.held.left).toBe(true)
  })

  test('onRelease clears key', () => {
    const tracker = createHeldKeysTracker()

    tracker.onPress({ type: 'key', key: 'left' })
    tracker.onPress({ type: 'key', key: 'right' })

    const leftReleased = tracker.onRelease({ type: 'key', key: 'left' })
    expect(leftReleased).toBe(true)
    expect(tracker.held).toEqual({ left: false, right: true })
  })

  test('onRelease returns false if not held', () => {
    const tracker = createHeldKeysTracker()

    const released = tracker.onRelease({ type: 'key', key: 'left' })
    expect(released).toBe(false)
    expect(tracker.held.left).toBe(false)
  })

  test('ignores non-movement keys', () => {
    const tracker = createHeldKeysTracker()

    const spacePress = tracker.onPress({ type: 'key', key: 'space' })
    expect(spacePress).toBe(false)

    const charPress = tracker.onPress({ type: 'char', char: 'x' })
    expect(charPress).toBe(false)

    expect(tracker.held).toEqual({ left: false, right: false })
  })

  test('press-release-press sequence works correctly', () => {
    const tracker = createHeldKeysTracker()

    // Press left
    tracker.onPress({ type: 'key', key: 'left' })
    expect(tracker.held.left).toBe(true)

    // Release left
    tracker.onRelease({ type: 'key', key: 'left' })
    expect(tracker.held.left).toBe(false)

    // Press left again
    tracker.onPress({ type: 'key', key: 'left' })
    expect(tracker.held.left).toBe(true)
  })

  test('simultaneous left and right handling', () => {
    const tracker = createHeldKeysTracker()

    // Press left, then right
    tracker.onPress({ type: 'key', key: 'left' })
    tracker.onPress({ type: 'key', key: 'right' })
    expect(tracker.held).toEqual({ left: true, right: true })

    // Release left (right should stay)
    tracker.onRelease({ type: 'key', key: 'left' })
    expect(tracker.held).toEqual({ left: false, right: true })

    // Press left again while right is still held
    tracker.onPress({ type: 'key', key: 'left' })
    expect(tracker.held).toEqual({ left: true, right: true })
  })
})

describe('keyboard state machine simulation', () => {
  // Simulates the actual keyboard handling flow

  test('game state transitions should not lose key state', () => {
    const tracker = createHeldKeysTracker()
    const events: string[] = []

    // Simulate: press right during 'waiting' state
    // (This shouldn't affect held state since we're not in gameplay)

    // Now transition to 'playing' and press right
    tracker.onPress({ type: 'key', key: 'right' })
    events.push('press:right')
    expect(tracker.held.right).toBe(true)

    // Simulate game state change (e.g., wave complete)
    // Key should still be held
    expect(tracker.held.right).toBe(true)

    // Now release
    tracker.onRelease({ type: 'key', key: 'right' })
    events.push('release:right')
    expect(tracker.held.right).toBe(false)
  })

  test('rapid press-release cycles', () => {
    const tracker = createHeldKeysTracker()

    for (let i = 0; i < 100; i++) {
      tracker.onPress({ type: 'key', key: 'right' })
      expect(tracker.held.right).toBe(true)

      tracker.onRelease({ type: 'key', key: 'right' })
      expect(tracker.held.right).toBe(false)
    }
  })

  test('alternating left-right movement', () => {
    const tracker = createHeldKeysTracker()

    // Quick left-right-left pattern
    tracker.onPress({ type: 'key', key: 'left' })
    expect(tracker.held).toEqual({ left: true, right: false })

    tracker.onRelease({ type: 'key', key: 'left' })
    tracker.onPress({ type: 'key', key: 'right' })
    expect(tracker.held).toEqual({ left: false, right: true })

    tracker.onRelease({ type: 'key', key: 'right' })
    tracker.onPress({ type: 'key', key: 'left' })
    expect(tracker.held).toEqual({ left: true, right: false })
  })
})

describe('movement without getting stuck', () => {
  // These tests verify that keys don't get stuck in the held state

  test('releasing a key always clears it regardless of press order', () => {
    const tracker = createHeldKeysTracker()

    // Press left, press right, release left, release right
    tracker.onPress({ type: 'key', key: 'left' })
    tracker.onPress({ type: 'key', key: 'right' })
    expect(tracker.held).toEqual({ left: true, right: true })

    tracker.onRelease({ type: 'key', key: 'left' })
    expect(tracker.held).toEqual({ left: false, right: true })

    tracker.onRelease({ type: 'key', key: 'right' })
    expect(tracker.held).toEqual({ left: false, right: false })
  })

  test('releasing in reverse order still works', () => {
    const tracker = createHeldKeysTracker()

    // Press left, press right, release right, release left
    tracker.onPress({ type: 'key', key: 'left' })
    tracker.onPress({ type: 'key', key: 'right' })

    tracker.onRelease({ type: 'key', key: 'right' })
    expect(tracker.held).toEqual({ left: true, right: false })

    tracker.onRelease({ type: 'key', key: 'left' })
    expect(tracker.held).toEqual({ left: false, right: false })
  })

  test('duplicate press events do not cause issues', () => {
    const tracker = createHeldKeysTracker()

    // Multiple presses without releases (simulates missed release events)
    tracker.onPress({ type: 'key', key: 'right' })
    tracker.onPress({ type: 'key', key: 'right' })
    tracker.onPress({ type: 'key', key: 'right' })
    expect(tracker.held.right).toBe(true)

    // Single release should clear it
    tracker.onRelease({ type: 'key', key: 'right' })
    expect(tracker.held.right).toBe(false)
  })

  test('duplicate release events do not cause issues', () => {
    const tracker = createHeldKeysTracker()

    tracker.onPress({ type: 'key', key: 'left' })
    expect(tracker.held.left).toBe(true)

    // Multiple releases (simulates spurious events)
    tracker.onRelease({ type: 'key', key: 'left' })
    tracker.onRelease({ type: 'key', key: 'left' })
    tracker.onRelease({ type: 'key', key: 'left' })
    expect(tracker.held.left).toBe(false)

    // Should still be able to press again
    tracker.onPress({ type: 'key', key: 'left' })
    expect(tracker.held.left).toBe(true)
  })

  test('release without prior press is safe', () => {
    const tracker = createHeldKeysTracker()

    // Release without press should be a no-op
    const changed = tracker.onRelease({ type: 'key', key: 'right' })
    expect(changed).toBe(false)
    expect(tracker.held).toEqual({ left: false, right: false })

    // Should still work normally after
    tracker.onPress({ type: 'key', key: 'right' })
    expect(tracker.held.right).toBe(true)
  })

  test('fresh tracker after reset has no stuck keys', () => {
    const tracker1 = createHeldKeysTracker()

    // Simulate stuck state
    tracker1.onPress({ type: 'key', key: 'left' })
    tracker1.onPress({ type: 'key', key: 'right' })
    expect(tracker1.held).toEqual({ left: true, right: true })

    // Create fresh tracker (simulates what happens on screen transition)
    const tracker2 = createHeldKeysTracker()
    expect(tracker2.held).toEqual({ left: false, right: false })
  })

  test('movement after shooting does not get stuck', () => {
    const tracker = createHeldKeysTracker()

    // Press right to move
    tracker.onPress({ type: 'key', key: 'right' })
    expect(tracker.held.right).toBe(true)

    // Space (shooting) should not affect movement state
    // (Space is not tracked by the held keys tracker)
    const spacePress = tracker.onPress({ type: 'key', key: 'space' })
    expect(spacePress).toBe(false) // Space is not a movement key
    expect(tracker.held.right).toBe(true) // Right should still be held

    // Release right
    tracker.onRelease({ type: 'key', key: 'right' })
    expect(tracker.held.right).toBe(false)
  })

})

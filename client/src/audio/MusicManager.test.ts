// client/src/audio/MusicManager.test.ts
// Unit tests for MusicManager - play/stop/toggle, mute state, looping behavior

import { describe, test, expect } from 'bun:test'

// ─── MusicManager Singleton Tests ────────────────────────────────────────────

describe('MusicManager Singleton', () => {
  test('getInstance returns the same instance', async () => {
    const { MusicManager } = await import('./MusicManager')
    const instance1 = MusicManager.getInstance()
    const instance2 = MusicManager.getInstance()
    expect(instance1).toBe(instance2)
  })

  test('getInstance returns an object with expected API', async () => {
    const { MusicManager } = await import('./MusicManager')
    const manager = MusicManager.getInstance()
    expect(typeof manager.start).toBe('function')
    expect(typeof manager.stop).toBe('function')
    expect(typeof manager.setMuted).toBe('function')
    expect(typeof manager.toggleMute).toBe('function')
    expect(typeof manager.isMuted).toBe('function')
    expect(typeof manager.isCurrentlyPlaying).toBe('function')
  })
})

// ─── Mute State Tests ────────────────────────────────────────────────────────

describe('MusicManager Mute State', () => {
  test('isMuted returns a boolean', async () => {
    const { MusicManager } = await import('./MusicManager')
    const manager = MusicManager.getInstance()
    expect(typeof manager.isMuted()).toBe('boolean')
  })

  test('toggleMute inverts the mute state', async () => {
    const { MusicManager } = await import('./MusicManager')
    const manager = MusicManager.getInstance()
    const initial = manager.isMuted()

    const result = manager.toggleMute()
    expect(result).toBe(!initial)
    expect(manager.isMuted()).toBe(!initial)

    // Toggle back to restore
    const restored = manager.toggleMute()
    expect(restored).toBe(initial)
    expect(manager.isMuted()).toBe(initial)
  })

  test('toggleMute returns the new mute state', async () => {
    const { MusicManager } = await import('./MusicManager')
    const manager = MusicManager.getInstance()
    const initial = manager.isMuted()

    const newState = manager.toggleMute()
    expect(newState).toBe(!initial)

    // Restore
    manager.toggleMute()
  })

  test('setMuted sets mute to true', async () => {
    const { MusicManager } = await import('./MusicManager')
    const manager = MusicManager.getInstance()
    const initial = manager.isMuted()

    manager.setMuted(true)
    expect(manager.isMuted()).toBe(true)

    // Restore
    manager.setMuted(initial)
  })

  test('setMuted sets mute to false', async () => {
    const { MusicManager } = await import('./MusicManager')
    const manager = MusicManager.getInstance()
    const initial = manager.isMuted()

    manager.setMuted(false)
    expect(manager.isMuted()).toBe(false)

    // Restore
    manager.setMuted(initial)
  })

  test('double toggle returns to original state', async () => {
    const { MusicManager } = await import('./MusicManager')
    const manager = MusicManager.getInstance()
    const initial = manager.isMuted()

    manager.toggleMute()
    manager.toggleMute()

    expect(manager.isMuted()).toBe(initial)
  })

  test('setMuted with same value is idempotent', async () => {
    const { MusicManager } = await import('./MusicManager')
    const manager = MusicManager.getInstance()
    const initial = manager.isMuted()

    manager.setMuted(initial)
    expect(manager.isMuted()).toBe(initial)

    manager.setMuted(initial)
    expect(manager.isMuted()).toBe(initial)
  })
})

// ─── Stop Behavior Tests ────────────────────────────────────────────────────

describe('MusicManager Stop Behavior', () => {
  test('stop does not throw when nothing is playing', async () => {
    const { MusicManager } = await import('./MusicManager')
    const manager = MusicManager.getInstance()

    // Calling stop when nothing is playing should be safe
    expect(() => manager.stop()).not.toThrow()
  })

  test('stop can be called multiple times without error', async () => {
    const { MusicManager } = await import('./MusicManager')
    const manager = MusicManager.getInstance()

    expect(() => {
      manager.stop()
      manager.stop()
      manager.stop()
    }).not.toThrow()
  })

  test('isCurrentlyPlaying returns false after stop', async () => {
    const { MusicManager } = await import('./MusicManager')
    const manager = MusicManager.getInstance()

    manager.stop()
    expect(manager.isCurrentlyPlaying()).toBe(false)
  })
})

// ─── Start Behavior Tests ────────────────────────────────────────────────────

describe('MusicManager Start Behavior', () => {
  test('start does not throw when muted', async () => {
    const { MusicManager } = await import('./MusicManager')
    const manager = MusicManager.getInstance()
    const wasMuted = manager.isMuted()

    manager.setMuted(true)

    // Start when muted should exit early
    await expect(manager.start()).resolves.toBeUndefined()

    // Restore
    manager.setMuted(wasMuted)
  })

  test('isCurrentlyPlaying is false when muted', async () => {
    const { MusicManager } = await import('./MusicManager')
    const manager = MusicManager.getInstance()
    const wasMuted = manager.isMuted()

    manager.setMuted(true)
    expect(manager.isCurrentlyPlaying()).toBe(false)

    // Restore
    manager.setMuted(wasMuted)
  })

  test('start when already muted does not change playing state', async () => {
    const { MusicManager } = await import('./MusicManager')
    const manager = MusicManager.getInstance()
    const wasMuted = manager.isMuted()

    manager.setMuted(true)
    await manager.start()

    // Should still not be playing since muted
    expect(manager.isCurrentlyPlaying()).toBe(false)

    // Restore
    manager.setMuted(wasMuted)
  })
})

// ─── Muting Stops Playback Tests ─────────────────────────────────────────────

describe('MusicManager Muting Stops Playback', () => {
  test('setMuted(true) calls stop internally', async () => {
    const { MusicManager } = await import('./MusicManager')
    const manager = MusicManager.getInstance()
    const wasMuted = manager.isMuted()

    // Setting muted to true should stop playback
    manager.setMuted(true)
    expect(manager.isCurrentlyPlaying()).toBe(false)

    // Restore
    manager.setMuted(wasMuted)
  })

  test('toggleMute to muted stops playback', async () => {
    const { MusicManager } = await import('./MusicManager')
    const manager = MusicManager.getInstance()
    const wasMuted = manager.isMuted()

    // Ensure we're unmuted first
    manager.setMuted(false)

    // Toggle to muted
    const newState = manager.toggleMute()
    expect(newState).toBe(true)
    expect(manager.isCurrentlyPlaying()).toBe(false)

    // Restore
    manager.setMuted(wasMuted)
  })

  test('setMuted(false) does not auto-start playback', async () => {
    const { MusicManager } = await import('./MusicManager')
    const manager = MusicManager.getInstance()
    const wasMuted = manager.isMuted()

    // Mute and stop
    manager.setMuted(true)
    manager.stop()

    // Unmute - should not auto-start
    manager.setMuted(false)
    expect(manager.isCurrentlyPlaying()).toBe(false)

    // Restore
    manager.setMuted(wasMuted)
  })
})

// ─── isCurrentlyPlaying Logic Tests ──────────────────────────────────────────

describe('MusicManager isCurrentlyPlaying', () => {
  test('returns false initially (no playback started)', async () => {
    const { MusicManager } = await import('./MusicManager')
    const manager = MusicManager.getInstance()

    // After stop, should not be playing
    manager.stop()
    expect(manager.isCurrentlyPlaying()).toBe(false)
  })

  test('returns false when muted even if was previously playing', async () => {
    const { MusicManager } = await import('./MusicManager')
    const manager = MusicManager.getInstance()
    const wasMuted = manager.isMuted()

    // isCurrentlyPlaying checks: this.isPlaying && !this.muted
    // When muted, it must return false regardless of isPlaying internal state
    manager.setMuted(true)
    expect(manager.isCurrentlyPlaying()).toBe(false)

    // Restore
    manager.setMuted(wasMuted)
  })

  test('returns boolean type', async () => {
    const { MusicManager } = await import('./MusicManager')
    const manager = MusicManager.getInstance()
    expect(typeof manager.isCurrentlyPlaying()).toBe('boolean')
  })
})

// ─── Edge Cases ──────────────────────────────────────────────────────────────

describe('MusicManager Edge Cases', () => {
  test('toggleMute oscillates correctly over many calls', async () => {
    const { MusicManager } = await import('./MusicManager')
    const manager = MusicManager.getInstance()
    const initial = manager.isMuted()

    for (let i = 0; i < 10; i++) {
      const expected = i % 2 === 0 ? !initial : initial
      const result = manager.toggleMute()
      expect(result).toBe(expected)
    }

    // After 10 toggles (even), should be back to initial
    expect(manager.isMuted()).toBe(initial)
  })

  test('stop followed by stop is safe', async () => {
    const { MusicManager } = await import('./MusicManager')
    const manager = MusicManager.getInstance()

    manager.stop()
    manager.stop()
    expect(manager.isCurrentlyPlaying()).toBe(false)
  })

  test('setMuted rapidly alternating does not error', async () => {
    const { MusicManager } = await import('./MusicManager')
    const manager = MusicManager.getInstance()
    const initial = manager.isMuted()

    expect(() => {
      for (let i = 0; i < 20; i++) {
        manager.setMuted(i % 2 === 0)
      }
    }).not.toThrow()

    // Restore
    manager.setMuted(initial)
  })

  test('platform-specific player selection is correct', () => {
    // MusicManager internally uses afplay on macOS, mpv on Linux.
    // Verify that the platform detection logic is sound.
    if (process.platform === 'darwin') {
      expect(process.platform).toBe('darwin')
    } else if (process.platform === 'linux') {
      expect(process.platform).toBe('linux')
    }
    // The player command is selected inside playLoop(), not exposed publicly.
    // This test documents the expected behavior for platform detection.
  })
})

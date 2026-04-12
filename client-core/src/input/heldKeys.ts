// client-core/src/input/heldKeys.ts
// Platform-agnostic held-key state tracker

import type { VadersKey } from './types'

// ─── Key State Tracking ───────────────────────────────────────────────────────

export interface HeldKeys {
  left: boolean
  right: boolean
}

/**
 * Create a held-keys tracker for movement input.
 *
 * @param timeoutMs - Key release timeout in ms. When > 0, keys auto-release
 *   after this duration (for terminals without native key-release support).
 *   When 0 (default), timeout fallback is disabled.
 */
export function createHeldKeysTracker(timeoutMs: number = 0): {
  held: HeldKeys
  onPress: (key: VadersKey) => boolean // Returns true if held state changed
  onRelease: (key: VadersKey) => boolean
  cleanup: () => void // Call to clear timeouts
  usesTimeoutFallback: boolean // Whether timeout-based release is used
} {
  const useTimeoutFallback = timeoutMs > 0
  const held: HeldKeys = { left: false, right: false }
  const timeouts: { left: ReturnType<typeof setTimeout> | null; right: ReturnType<typeof setTimeout> | null } = {
    left: null,
    right: null,
  }

  function clearKeyTimeout(key: 'left' | 'right') {
    if (timeouts[key]) {
      clearTimeout(timeouts[key]!)
      timeouts[key] = null
    }
  }

  function setKeyTimeout(key: 'left' | 'right') {
    // Only use timeout fallback when explicitly enabled
    if (!useTimeoutFallback) return

    clearKeyTimeout(key)
    timeouts[key] = setTimeout(() => {
      // Auto-release if no new press or release event received
      held[key] = false
      timeouts[key] = null
    }, timeoutMs)
  }

  function onPress(key: VadersKey): boolean {
    if (key.type !== 'key') return false

    let changed = false
    if (key.key === 'left') {
      if (!held.left) changed = true
      held.left = true
      setKeyTimeout('left') // Reset timeout on each press (if fallback enabled)
    }
    if (key.key === 'right') {
      if (!held.right) changed = true
      held.right = true
      setKeyTimeout('right') // Reset timeout on each press (if fallback enabled)
    }
    return changed
  }

  function onRelease(key: VadersKey): boolean {
    if (key.type !== 'key') return false

    let changed = false
    if (key.key === 'left' && held.left) {
      held.left = false
      clearKeyTimeout('left')
      changed = true
    }
    if (key.key === 'right' && held.right) {
      held.right = false
      clearKeyTimeout('right')
      changed = true
    }
    return changed
  }

  function cleanup() {
    clearKeyTimeout('left')
    clearKeyTimeout('right')
  }

  return { held, onPress, onRelease, cleanup, usesTimeoutFallback: useTimeoutFallback }
}

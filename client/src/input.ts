// client/src/input.ts
// Input adapter - normalizes OpenTUI KeyEvent to stable VadersKey type
// Uses terminal compatibility layer for keyboard protocol detection

import type { KeyEvent } from '@opentui/core'
import { getKeyReleaseTimeoutMs } from './terminal'

// ─── Internal Key Type (stable, not tied to OpenTUI) ──────────────────────────

export type VadersKey =
  | { type: 'key'; key: 'left' | 'right' | 'up' | 'down' | 'space' | 'enter' | 'escape' | 'q' | 'm' | 'n' | 's' | 'r' | 'x' }
  | { type: 'char'; char: string }  // For text input (room codes, names)

// ─── Normalize OpenTUI KeyEvent → VadersKey ───────────────────────────────────

export function normalizeKey(event: KeyEvent): VadersKey | null {
  // Map OpenTUI key names to our internal names
  if (event.name === 'left' || event.sequence === '\x1b[D') return { type: 'key', key: 'left' }
  if (event.name === 'right' || event.sequence === '\x1b[C') return { type: 'key', key: 'right' }
  if (event.name === 'up' || event.sequence === '\x1b[A') return { type: 'key', key: 'up' }
  if (event.name === 'down' || event.sequence === '\x1b[B') return { type: 'key', key: 'down' }
  if (event.name === 'space' || event.sequence === ' ') return { type: 'key', key: 'space' }
  if (event.name === 'return') return { type: 'key', key: 'enter' }
  if (event.name === 'escape') return { type: 'key', key: 'escape' }

  // Single character keys
  if (event.sequence?.length === 1) {
    const char = event.sequence.toLowerCase()
    if (char === 'q') return { type: 'key', key: 'q' }
    if (char === 'm') return { type: 'key', key: 'm' }
    if (char === 'n') return { type: 'key', key: 'n' }
    if (char === 's') return { type: 'key', key: 's' }
    if (char === 'r') return { type: 'key', key: 'r' }
    if (char === 'x') return { type: 'key', key: 'x' }
    return { type: 'char', char: event.sequence }
  }

  return null  // Ignore unrecognized keys
}

// ─── Key State Tracking ───────────────────────────────────────────────────────

export interface HeldKeys {
  left: boolean
  right: boolean
}

// Get key release timeout from terminal compatibility layer
// Returns 0 for terminals with native key release support (Kitty protocol)
// Returns timeout in ms for terminals that need timeout-based detection
const KEY_RELEASE_TIMEOUT_MS = getKeyReleaseTimeoutMs()
const useTimeoutFallback = KEY_RELEASE_TIMEOUT_MS > 0

export function createHeldKeysTracker(): {
  held: HeldKeys
  onPress: (key: VadersKey) => boolean  // Returns true if held state changed
  onRelease: (key: VadersKey) => boolean
  cleanup: () => void  // Call to clear timeouts
  usesTimeoutFallback: boolean  // Whether timeout-based release is used
} {
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
    // Only use timeout fallback for terminals without Kitty keyboard protocol
    // (e.g., Apple Terminal, iTerm2)
    if (!useTimeoutFallback) return

    clearKeyTimeout(key)
    timeouts[key] = setTimeout(() => {
      // Auto-release if no new press or release event received
      held[key] = false
      timeouts[key] = null
    }, KEY_RELEASE_TIMEOUT_MS)
  }

  function onPress(key: VadersKey): boolean {
    if (key.type !== 'key') return false

    let changed = false
    if (key.key === 'left') {
      if (!held.left) changed = true
      held.left = true
      setKeyTimeout('left')  // Reset timeout on each press (if fallback enabled)
    }
    if (key.key === 'right') {
      if (!held.right) changed = true
      held.right = true
      setKeyTimeout('right')  // Reset timeout on each press (if fallback enabled)
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

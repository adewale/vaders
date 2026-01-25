// client/src/input.ts
// Input adapter - normalizes OpenTUI KeyEvent to stable VadersKey type

import type { KeyEvent } from '@opentui/core'

// ─── Internal Key Type (stable, not tied to OpenTUI) ──────────────────────────

export type VadersKey =
  | { type: 'key'; key: 'left' | 'right' | 'up' | 'down' | 'space' | 'enter' | 'escape' | 'q' | 'm' | 'n' | 's' | 'r' }
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
    return { type: 'char', char: event.sequence }
  }

  return null  // Ignore unrecognized keys
}

// ─── Key State Tracking ───────────────────────────────────────────────────────

export interface HeldKeys {
  left: boolean
  right: boolean
}

// Timeout for auto-releasing keys (fallback for terminals without release events)
// Set longer than typical key repeat interval (~30-50ms) to allow continuous movement
const KEY_RELEASE_TIMEOUT_MS = 200

export function createHeldKeysTracker(): {
  held: HeldKeys
  onPress: (key: VadersKey) => boolean  // Returns true if held state changed
  onRelease: (key: VadersKey) => boolean
  cleanup: () => void  // Call to clear timeouts
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
      setKeyTimeout('left')  // Reset timeout on each press
    }
    if (key.key === 'right') {
      if (!held.right) changed = true
      held.right = true
      setKeyTimeout('right')  // Reset timeout on each press
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

  return { held, onPress, onRelease, cleanup }
}

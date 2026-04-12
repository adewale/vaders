// client/src/input.ts
// Input adapter - normalizes OpenTUI KeyEvent to stable VadersKey type
// Uses terminal compatibility layer for keyboard protocol detection

import type { KeyEvent } from '@opentui/core'
import { getKeyReleaseTimeoutMs } from './terminal'

// Re-export platform-agnostic types and tracker from client-core
export type { VadersKey } from '../../client-core/src/input/types'
export type { HeldKeys } from '../../client-core/src/input/heldKeys'
export { createHeldKeysTracker as _createHeldKeysTracker } from '../../client-core/src/input/heldKeys'

import type { VadersKey } from '../../client-core/src/input/types'
import { createHeldKeysTracker as _createHeldKeysTracker } from '../../client-core/src/input/heldKeys'

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

// ─── TUI-specific held keys tracker ──────────────────────────────────────────
// Injects the terminal-detected key release timeout into the platform-agnostic tracker

/**
 * Create a held-keys tracker with TUI-specific key release timeout.
 * Reads the timeout from the terminal compatibility layer at call time.
 */
export function createHeldKeysTracker() {
  return _createHeldKeysTracker(getKeyReleaseTimeoutMs())
}

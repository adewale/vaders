// client/src/terminal/index.ts
// Terminal compatibility layer - central module for terminal detection and workarounds
//
// Usage:
//   import { getTerminalCapabilities, getTerminalName } from '../terminal'
//
//   const caps = getTerminalCapabilities()
//   if (!caps.supportsUnicode) {
//     // Use ASCII sprites
//   }

export {
  // Terminal detection
  detectTerminal,
  getTerminalDisplayName,
  type TerminalName,

  // Capabilities
  detectCapabilities,
  type TerminalCapabilities,

  // Helper functions
  getColorDepth,
  type ColorDepth,
  needsKeyReleaseTimeout,
  needsEscapePassthrough,
  wrapForPassthrough,

  // Color conversion utilities
  hexTo256Color,
  hexTo16Color,
  formatColor,

  // Diagnostics
  getTerminalQuirks,

  // Singleton instances (for convenience)
  TERMINAL_NAME,
  TERMINAL_CAPABILITIES,
} from './compatibility'

// ─── Convenience Functions ───────────────────────────────────────────────────

import {
  TERMINAL_NAME,
  TERMINAL_CAPABILITIES,
  detectTerminal,
  detectCapabilities,
  getTerminalDisplayName as _getDisplayName,
} from './compatibility'

/**
 * Get the current terminal name.
 * This is a cached value detected at startup.
 *
 * @returns The terminal name identifier
 */
export function getTerminalName(): string {
  return TERMINAL_NAME
}

/**
 * Get the human-readable terminal display name.
 * This is a cached value detected at startup.
 *
 * @returns Human-readable terminal name (e.g., "Apple Terminal", "Kitty")
 */
export function getTerminalDisplayNameCached(): string {
  return _getDisplayName(TERMINAL_NAME)
}

/**
 * Get the current terminal capabilities.
 * This is a cached value detected at startup.
 *
 * @returns Terminal capabilities object
 */
export function getTerminalCapabilities() {
  return TERMINAL_CAPABILITIES
}

/**
 * Force re-detection of terminal and capabilities.
 * Useful if environment variables have changed (rare).
 *
 * Note: This returns new objects and does NOT update the cached singletons.
 *
 * @returns Object with fresh terminal name and capabilities
 */
export function refreshTerminalDetection() {
  return {
    terminal: detectTerminal(),
    capabilities: detectCapabilities(),
  }
}

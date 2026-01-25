// client/src/capabilities.ts
// Terminal capabilities detection - wraps the terminal compatibility layer

import {
  TERMINAL_CAPABILITIES,
  TERMINAL_NAME,
  getTerminalDisplayName,
  getColorDepth,
  getTerminalQuirks,
  type TerminalCapabilities as FullTerminalCapabilities,
} from './terminal'

// Re-export the full terminal capabilities for advanced usage
export type { FullTerminalCapabilities }
export { TERMINAL_NAME, getTerminalDisplayName, getColorDepth, getTerminalQuirks }

/**
 * Simplified capabilities interface for backwards compatibility
 */
export interface TerminalCapabilities {
  trueColor: boolean    // 24-bit color support
  color256: boolean     // 256-color support
  unicode: boolean      // Unicode character support
  asciiMode: boolean    // Use ASCII-only symbols (safer for alignment)
  width: number         // Terminal width
  height: number        // Terminal height
  // New fields from terminal compatibility layer
  terminal: string      // Terminal name
  supportsKittyKeyboard: boolean
  supportsWideCharacters: boolean
  insideMultiplexer: boolean
}

/**
 * Detect terminal capabilities using the compatibility layer
 */
export function detectCapabilities(): TerminalCapabilities {
  const caps = TERMINAL_CAPABILITIES

  return {
    trueColor: caps.supportsTrueColor,
    color256: caps.supports256Color,
    unicode: caps.supportsUnicode,
    asciiMode: !caps.supportsUnicode,
    width: process.stdout.columns ?? 80,
    height: process.stdout.rows ?? 24,
    terminal: caps.terminal,
    supportsKittyKeyboard: caps.supportsKittyKeyboard,
    supportsWideCharacters: caps.supportsWideCharacters,
    insideMultiplexer: caps.insideMultiplexer,
  }
}

// ASCII symbols (safe for alignment - single-width characters only)
export const ASCII_SYMBOLS = {
  heart: '*',
  heartEmpty: '.',
  skull: 'X',
  trophy: '1',
  pointer: '>',
  star: '*',
  cross: 'X',
} as const

// Unicode symbols (may cause alignment issues in some terminals)
export const UNICODE_SYMBOLS = {
  heart: '♥',
  heartEmpty: '♡',
  skull: '☠',
  trophy: '🏆',
  pointer: '►',
  star: '★',
  cross: '✖',
} as const

// Get symbols based on capabilities
export function getSymbols(caps: TerminalCapabilities) {
  return caps.asciiMode ? ASCII_SYMBOLS : UNICODE_SYMBOLS
}

// ─── Singleton for App-Wide Use ───────────────────────────────────────────────

/** Cached terminal capabilities detected at startup */
export const TERMINAL_CAPS = detectCapabilities()

/** Cached symbols based on terminal capabilities */
export const SYMBOLS = getSymbols(TERMINAL_CAPS)

// Fallback sprite set for non-Unicode terminals
export const ASCII_SPRITES = {
  alien: { squid: '[=]', crab: '/o\\', octopus: '{o}' },
  player: '^A^',
  bullet: '|',
  barrier: '#',
}

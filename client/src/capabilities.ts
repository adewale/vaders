// client/src/capabilities.ts
// Terminal capabilities detection

export interface TerminalCapabilities {
  trueColor: boolean    // 24-bit color support (COLORTERM=truecolor or 24bit)
  color256: boolean     // 256-color support (TERM includes 256color)
  unicode: boolean      // Unicode character support
  asciiMode: boolean    // Use ASCII-only symbols (safer for alignment)
  width: number         // Terminal width
  height: number        // Terminal height
}

export function detectCapabilities(): TerminalCapabilities {
  const colorTerm = process.env.COLORTERM
  const term = process.env.TERM

  return {
    trueColor: colorTerm === 'truecolor' || colorTerm === '24bit',
    color256: term?.includes('256color') ?? false,
    unicode: process.env.LANG?.includes('UTF-8') ?? true,
    asciiMode: process.env.VADERS_ASCII === '1' || !(process.env.LANG?.includes('UTF-8')),
    width: process.stdout.columns ?? 80,
    height: process.stdout.rows ?? 24,
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

// client/src/terminal/compatibility.ts
// Terminal compatibility layer for handling differences between terminal emulators
//
// This module provides:
// - Terminal detection (identify which terminal is being used)
// - Capabilities detection (what features are supported)
// - Helper functions for common workarounds
//
// Supported terminals:
// - Kitty: Full modern terminal with keyboard protocol
// - Ghostty: Full modern terminal support
// - iTerm2: Good support with some quirks
// - Alacritty: Modern GPU-accelerated terminal
// - WezTerm: Cross-platform with good compatibility
// - Apple Terminal: Limited capabilities (no true color, no keyboard protocol)
// - tmux/screen: May need passthrough for some features
// - xterm: Classic terminal with variable capabilities
// - VS Code integrated terminal

// ─── Terminal Identification ─────────────────────────────────────────────────

/**
 * Known terminal emulators with specific handling requirements
 */
export type TerminalName =
  | 'kitty'
  | 'ghostty'
  | 'iterm2'
  | 'alacritty'
  | 'wezterm'
  | 'apple-terminal'
  | 'vscode'
  | 'tmux'
  | 'screen'
  | 'xterm'
  | 'linux-console'
  | 'unknown'

/**
 * Detect which terminal emulator is being used.
 * Uses environment variables that terminals typically set.
 *
 * Detection order matters - more specific checks come first.
 */
export function detectTerminal(): TerminalName {
  const env = process.env

  // TERM_PROGRAM is set by many modern terminals
  const termProgram = env.TERM_PROGRAM?.toLowerCase() ?? ''
  const term = env.TERM?.toLowerCase() ?? ''

  // Kitty sets KITTY_WINDOW_ID and TERM=xterm-kitty
  if (env.KITTY_WINDOW_ID || term === 'xterm-kitty') {
    return 'kitty'
  }

  // Ghostty sets TERM_PROGRAM=ghostty
  if (termProgram === 'ghostty' || term === 'xterm-ghostty') {
    return 'ghostty'
  }

  // iTerm2 sets TERM_PROGRAM=iTerm.app and ITERM_SESSION_ID
  if (termProgram === 'iterm.app' || env.ITERM_SESSION_ID) {
    return 'iterm2'
  }

  // Alacritty sets TERM=alacritty
  if (term === 'alacritty' || env.ALACRITTY_WINDOW_ID) {
    return 'alacritty'
  }

  // WezTerm sets TERM_PROGRAM=WezTerm
  if (termProgram === 'wezterm') {
    return 'wezterm'
  }

  // VS Code integrated terminal
  if (termProgram === 'vscode' || env.VSCODE_INJECTION) {
    return 'vscode'
  }

  // Apple Terminal sets TERM_PROGRAM=Apple_Terminal
  if (termProgram === 'apple_terminal') {
    return 'apple-terminal'
  }

  // tmux sets TMUX and TERM typically starts with "tmux" or "screen"
  if (env.TMUX) {
    return 'tmux'
  }

  // GNU Screen sets STY
  if (env.STY) {
    return 'screen'
  }

  // Linux virtual console
  if (term === 'linux') {
    return 'linux-console'
  }

  // Generic xterm detection (must be after other xterm-* checks)
  if (term.startsWith('xterm')) {
    return 'xterm'
  }

  return 'unknown'
}

/**
 * Get a human-readable display name for the terminal
 */
export function getTerminalDisplayName(terminal: TerminalName): string {
  const names: Record<TerminalName, string> = {
    'kitty': 'Kitty',
    'ghostty': 'Ghostty',
    'iterm2': 'iTerm2',
    'alacritty': 'Alacritty',
    'wezterm': 'WezTerm',
    'apple-terminal': 'Apple Terminal',
    'vscode': 'VS Code Terminal',
    'tmux': 'tmux',
    'screen': 'GNU Screen',
    'xterm': 'xterm',
    'linux-console': 'Linux Console',
    'unknown': 'Unknown Terminal',
  }
  return names[terminal]
}

// ─── Terminal Capabilities ───────────────────────────────────────────────────

/**
 * Terminal capability flags
 */
export interface TerminalCapabilities {
  /**
   * Terminal name/identifier
   */
  terminal: TerminalName

  /**
   * Whether the terminal supports Unicode characters.
   * When false, use ASCII-only fallbacks for sprites and UI elements.
   * Detection: Based on LANG/LC_ALL containing UTF-8
   */
  supportsUnicode: boolean

  /**
   * Whether the terminal supports 24-bit true color (16.7M colors).
   * When false, fall back to 256-color or 16-color palette.
   * Detection: COLORTERM=truecolor or 24bit, or known terminal support
   */
  supportsTrueColor: boolean

  /**
   * Whether the terminal supports 256 colors.
   * Detection: TERM contains "256color"
   */
  supports256Color: boolean

  /**
   * Whether the terminal supports the Kitty keyboard protocol.
   * This protocol provides key release events and precise key identification.
   * When false, use timeout-based key release detection.
   * Detection: Only Kitty and Ghostty fully support this currently
   */
  supportsKittyKeyboard: boolean

  /**
   * Whether the terminal renders bright/bold colors correctly.
   * Some terminals (especially older ones) render bright colors as bold text.
   * When false, prefer non-bright color alternatives.
   * Detection: Based on known terminal behavior
   */
  supportsBrightColors: boolean

  /**
   * Whether the terminal supports italic text rendering.
   * Some terminals render italic as reverse video or ignore it entirely.
   * Detection: Based on known terminal behavior
   */
  supportsItalic: boolean

  /**
   * Whether the terminal supports bold text rendering.
   * Nearly all terminals support this, but some may render it as bright colors.
   * Detection: Assumed true for most terminals
   */
  supportsBold: boolean

  /**
   * Whether the terminal supports underline text.
   * Detection: Assumed true for most terminals
   */
  supportsUnderline: boolean

  /**
   * Whether running inside a terminal multiplexer (tmux/screen).
   * May need escape sequence passthrough for some features.
   */
  insideMultiplexer: boolean

  /**
   * Whether wide characters (emoji, CJK) render at correct width.
   * Some terminals have issues with emoji rendering causing alignment problems.
   */
  supportsWideCharacters: boolean

  /**
   * Whether the terminal supports sixel graphics.
   * Not currently used, but may be useful for future enhancements.
   */
  supportsSixel: boolean

  /**
   * Whether the terminal supports OSC 8 hyperlinks.
   * Allows clickable links in terminal output.
   */
  supportsHyperlinks: boolean
}

/**
 * Known capabilities for specific terminals.
 * These are baseline assumptions that may be overridden by environment detection.
 */
const TERMINAL_DEFAULTS: Record<TerminalName, Partial<TerminalCapabilities>> = {
  'kitty': {
    supportsTrueColor: true,
    supports256Color: true,
    supportsKittyKeyboard: true,
    supportsBrightColors: true,
    supportsItalic: true,
    supportsBold: true,
    supportsUnderline: true,
    supportsWideCharacters: true,
    supportsSixel: true,
    supportsHyperlinks: true,
  },
  'ghostty': {
    supportsTrueColor: true,
    supports256Color: true,
    supportsKittyKeyboard: true,
    supportsBrightColors: true,
    supportsItalic: true,
    supportsBold: true,
    supportsUnderline: true,
    supportsWideCharacters: true,
    supportsSixel: false,
    supportsHyperlinks: true,
  },
  'iterm2': {
    supportsTrueColor: true,
    supports256Color: true,
    supportsKittyKeyboard: false,
    supportsBrightColors: true,
    supportsItalic: true,
    supportsBold: true,
    supportsUnderline: true,
    supportsWideCharacters: true, // Some emoji quirks but generally good
    supportsSixel: false,
    supportsHyperlinks: true,
  },
  'alacritty': {
    supportsTrueColor: true,
    supports256Color: true,
    supportsKittyKeyboard: false,
    supportsBrightColors: true,
    supportsItalic: true,
    supportsBold: true,
    supportsUnderline: true,
    supportsWideCharacters: true,
    supportsSixel: false,
    supportsHyperlinks: true,
  },
  'wezterm': {
    supportsTrueColor: true,
    supports256Color: true,
    supportsKittyKeyboard: true, // WezTerm has experimental support
    supportsBrightColors: true,
    supportsItalic: true,
    supportsBold: true,
    supportsUnderline: true,
    supportsWideCharacters: true,
    supportsSixel: true,
    supportsHyperlinks: true,
  },
  'apple-terminal': {
    supportsTrueColor: false, // Apple Terminal only supports 256 colors
    supports256Color: true,
    supportsKittyKeyboard: false,
    supportsBrightColors: true,
    supportsItalic: true,
    supportsBold: true,
    supportsUnderline: true,
    supportsWideCharacters: false, // Known emoji width issues
    supportsSixel: false,
    supportsHyperlinks: false,
  },
  'vscode': {
    supportsTrueColor: true,
    supports256Color: true,
    supportsKittyKeyboard: false,
    supportsBrightColors: true,
    supportsItalic: true,
    supportsBold: true,
    supportsUnderline: true,
    supportsWideCharacters: true,
    supportsSixel: false,
    supportsHyperlinks: true,
  },
  'tmux': {
    supportsTrueColor: true, // With proper configuration
    supports256Color: true,
    supportsKittyKeyboard: false, // Requires passthrough
    supportsBrightColors: true,
    supportsItalic: true, // May need terminfo config
    supportsBold: true,
    supportsUnderline: true,
    supportsWideCharacters: true,
    supportsSixel: false,
    supportsHyperlinks: true, // With passthrough
  },
  'screen': {
    supportsTrueColor: false,
    supports256Color: true,
    supportsKittyKeyboard: false,
    supportsBrightColors: true,
    supportsItalic: false, // Often broken in screen
    supportsBold: true,
    supportsUnderline: true,
    supportsWideCharacters: true,
    supportsSixel: false,
    supportsHyperlinks: false,
  },
  'xterm': {
    supportsTrueColor: true, // Modern xterm supports it
    supports256Color: true,
    supportsKittyKeyboard: false,
    supportsBrightColors: true,
    supportsItalic: true,
    supportsBold: true,
    supportsUnderline: true,
    supportsWideCharacters: true,
    supportsSixel: false,
    supportsHyperlinks: true,
  },
  'linux-console': {
    supportsTrueColor: false,
    supports256Color: false, // Only 16 colors
    supportsKittyKeyboard: false,
    supportsBrightColors: true,
    supportsItalic: false,
    supportsBold: true,
    supportsUnderline: false, // Usually renders as bright
    supportsWideCharacters: false,
    supportsSixel: false,
    supportsHyperlinks: false,
  },
  'unknown': {
    supportsTrueColor: false,
    supports256Color: true,
    supportsKittyKeyboard: false,
    supportsBrightColors: true,
    supportsItalic: true,
    supportsBold: true,
    supportsUnderline: true,
    supportsWideCharacters: true,
    supportsSixel: false,
    supportsHyperlinks: false,
  },
}

/**
 * Detect terminal capabilities based on environment variables and terminal type.
 * Combines terminal-specific defaults with environment-based detection.
 */
export function detectCapabilities(): TerminalCapabilities {
  const terminal = detectTerminal()
  const defaults = TERMINAL_DEFAULTS[terminal]
  const env = process.env

  // Detect Unicode support from locale settings
  const lang = env.LANG ?? env.LC_ALL ?? ''
  const supportsUnicode = lang.toUpperCase().includes('UTF-8') || lang.toUpperCase().includes('UTF8')

  // Detect true color from COLORTERM environment variable
  const colorTerm = env.COLORTERM?.toLowerCase() ?? ''
  const hasTrueColorEnv = colorTerm === 'truecolor' || colorTerm === '24bit'

  // Detect 256 color from TERM
  const term = env.TERM?.toLowerCase() ?? ''
  const has256ColorTerm = term.includes('256color') || term.includes('direct')

  // Check if inside a multiplexer
  const insideMultiplexer = Boolean(env.TMUX || env.STY)

  // Override VADERS_ASCII forces ASCII mode
  const forceAscii = env.VADERS_ASCII === '1'

  return {
    terminal,
    supportsUnicode: forceAscii ? false : supportsUnicode,
    supportsTrueColor: hasTrueColorEnv || (defaults.supportsTrueColor ?? false),
    supports256Color: has256ColorTerm || (defaults.supports256Color ?? true),
    supportsKittyKeyboard: defaults.supportsKittyKeyboard ?? false,
    supportsBrightColors: defaults.supportsBrightColors ?? true,
    supportsItalic: defaults.supportsItalic ?? true,
    supportsBold: defaults.supportsBold ?? true,
    supportsUnderline: defaults.supportsUnderline ?? true,
    insideMultiplexer,
    supportsWideCharacters: defaults.supportsWideCharacters ?? true,
    supportsSixel: defaults.supportsSixel ?? false,
    supportsHyperlinks: defaults.supportsHyperlinks ?? false,
  }
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Color depth supported by the terminal
 */
export type ColorDepth = 'truecolor' | '256' | '16' | 'none'

/**
 * Get the color depth supported by the terminal.
 * Useful for selecting appropriate color palettes.
 */
export function getColorDepth(caps: TerminalCapabilities): ColorDepth {
  if (caps.supportsTrueColor) return 'truecolor'
  if (caps.supports256Color) return '256'
  if (caps.terminal === 'linux-console') return '16'
  return '256' // Safe default
}

/**
 * Check if the terminal needs timeout-based key release detection.
 * Terminals without Kitty keyboard protocol support need to use timeouts
 * to detect when a key has been released.
 */
export function needsKeyReleaseTimeout(caps: TerminalCapabilities): boolean {
  return !caps.supportsKittyKeyboard
}

/**
 * Check if escape sequence passthrough is needed.
 * Required when running inside tmux/screen to send certain escape sequences
 * directly to the outer terminal.
 */
export function needsEscapePassthrough(caps: TerminalCapabilities): boolean {
  return caps.insideMultiplexer
}

/**
 * Wrap an escape sequence for passthrough through tmux/screen.
 * This allows escape sequences to reach the outer terminal.
 *
 * @param sequence - The escape sequence to wrap
 * @returns The wrapped sequence for passthrough
 */
export function wrapForPassthrough(sequence: string, caps: TerminalCapabilities): string {
  if (!caps.insideMultiplexer) {
    return sequence
  }

  // tmux passthrough: \ePtmux;\e<sequence>\e\\
  // screen passthrough: \eP<sequence>\e\\
  if (process.env.TMUX) {
    // For tmux, double the escape characters in the sequence
    const escaped = sequence.replace(/\x1b/g, '\x1b\x1b')
    return `\x1bPtmux;${escaped}\x1b\\`
  }

  if (process.env.STY) {
    return `\x1bP${sequence}\x1b\\`
  }

  return sequence
}

/**
 * Convert a true color hex value to the nearest 256-color palette index.
 * Useful for terminals that don't support true color.
 *
 * @param hex - Hex color string (e.g., "#ff5500" or "ff5500")
 * @returns The nearest 256-color palette index (16-255)
 */
export function hexTo256Color(hex: string): number {
  // Remove # prefix if present
  const cleanHex = hex.replace(/^#/, '')

  // Parse RGB components
  const r = parseInt(cleanHex.slice(0, 2), 16)
  const g = parseInt(cleanHex.slice(2, 4), 16)
  const b = parseInt(cleanHex.slice(4, 6), 16)

  // Check for grayscale (when r, g, b are similar)
  if (Math.abs(r - g) < 8 && Math.abs(g - b) < 8) {
    const gray = Math.round((r + g + b) / 3)
    if (gray < 8) return 16 // black
    if (gray > 248) return 231 // white
    // 24 grayscale steps from index 232-255
    return Math.round((gray - 8) / 10) + 232
  }

  // Map to 6x6x6 color cube (indices 16-231)
  // Each component maps to 0-5 (6 levels)
  const ri = Math.round((r / 255) * 5)
  const gi = Math.round((g / 255) * 5)
  const bi = Math.round((b / 255) * 5)

  return 16 + 36 * ri + 6 * gi + bi
}

/**
 * Convert a true color hex value to the nearest 16-color ANSI code.
 * Useful for very limited terminals like Linux console.
 *
 * @param hex - Hex color string (e.g., "#ff5500")
 * @returns ANSI color code (30-37 for normal, 90-97 for bright)
 */
export function hexTo16Color(hex: string): number {
  const cleanHex = hex.replace(/^#/, '')
  const r = parseInt(cleanHex.slice(0, 2), 16)
  const g = parseInt(cleanHex.slice(2, 4), 16)
  const b = parseInt(cleanHex.slice(4, 6), 16)

  // Determine brightness
  const brightness = (r + g + b) / 3
  const isBright = brightness > 128

  // Determine primary color (very simplified)
  const max = Math.max(r, g, b)
  const threshold = max * 0.5

  const hasRed = r > threshold
  const hasGreen = g > threshold
  const hasBlue = b > threshold

  // Map to ANSI colors
  // 0=black, 1=red, 2=green, 3=yellow, 4=blue, 5=magenta, 6=cyan, 7=white
  let color = 0
  if (hasRed) color |= 1
  if (hasGreen) color |= 2
  if (hasBlue) color |= 4

  // Return foreground color code (30-37 or 90-97 for bright)
  return (isBright ? 90 : 30) + color
}

/**
 * Format a color for terminal output based on capabilities.
 *
 * @param hex - Hex color string
 * @param caps - Terminal capabilities
 * @returns ANSI escape sequence for the color (foreground)
 */
export function formatColor(hex: string, caps: TerminalCapabilities): string {
  const depth = getColorDepth(caps)

  switch (depth) {
    case 'truecolor': {
      const cleanHex = hex.replace(/^#/, '')
      const r = parseInt(cleanHex.slice(0, 2), 16)
      const g = parseInt(cleanHex.slice(2, 4), 16)
      const b = parseInt(cleanHex.slice(4, 6), 16)
      return `\x1b[38;2;${r};${g};${b}m`
    }
    case '256':
      return `\x1b[38;5;${hexTo256Color(hex)}m`
    case '16':
      return `\x1b[${hexTo16Color(hex)}m`
    default:
      return ''
  }
}

/**
 * Get terminal-specific quirks and workarounds as a human-readable summary.
 * Useful for debugging and displaying in a diagnostics screen.
 */
export function getTerminalQuirks(caps: TerminalCapabilities): string[] {
  const quirks: string[] = []

  switch (caps.terminal) {
    case 'apple-terminal':
      quirks.push('No true color support - using 256-color palette')
      quirks.push('No Kitty keyboard protocol - using timeout-based key release')
      quirks.push('Emoji may cause alignment issues')
      break

    case 'iterm2':
      quirks.push('Some emoji may render at incorrect width')
      quirks.push('No Kitty keyboard protocol - using timeout-based key release')
      break

    case 'tmux':
      quirks.push('Running inside tmux - some features may need passthrough')
      quirks.push('No Kitty keyboard protocol - using timeout-based key release')
      break

    case 'screen':
      quirks.push('Running inside GNU Screen - limited feature support')
      quirks.push('Italic text may not render correctly')
      break

    case 'linux-console':
      quirks.push('Limited to 16 colors')
      quirks.push('No Unicode support')
      quirks.push('No italic or underline')
      break

    case 'kitty':
    case 'ghostty':
      // These terminals have full support, no quirks
      break
  }

  if (!caps.supportsUnicode) {
    quirks.push('ASCII-only mode active')
  }

  if (caps.insideMultiplexer && caps.terminal !== 'tmux' && caps.terminal !== 'screen') {
    quirks.push('Running inside terminal multiplexer')
  }

  return quirks
}

// ─── Singleton Instance ──────────────────────────────────────────────────────

/**
 * Cached terminal name detected at startup
 */
export const TERMINAL_NAME = detectTerminal()

/**
 * Cached terminal capabilities detected at startup.
 * Use this for quick access without re-detecting.
 */
export const TERMINAL_CAPABILITIES = detectCapabilities()

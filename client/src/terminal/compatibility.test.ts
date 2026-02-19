// client/src/terminal/compatibility.test.ts
// Unit tests for terminal compatibility layer

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  detectTerminal,
  detectCapabilities,
  getTerminalDisplayName,
  getColorDepth,
  needsKeyReleaseTimeout,
  getKeyReleaseTimeoutMs,
  shouldEnableKittyKeyboard,
  usesDiscreteMovement,
  needsEscapePassthrough,
  wrapForPassthrough,
  hexTo256Color,
  hexTo16Color,
  formatColor,
  getTerminalQuirks,
  supportsRichColor,
  supportsBraille,
  type TerminalName,
  type TerminalCapabilities,
} from './compatibility'

// All terminal-related environment variables that need to be controlled
const TERMINAL_ENV_KEYS = [
  'TERM', 'TERM_PROGRAM', 'COLORTERM',
  'KITTY_WINDOW_ID', 'ITERM_SESSION_ID', 'ALACRITTY_WINDOW_ID',
  'VSCODE_INJECTION', 'TMUX', 'STY',
  'LANG', 'LC_ALL', 'VADERS_ASCII',
]

// Helper to mock environment variables with full isolation
function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const original: Record<string, string | undefined> = {}

  // Save ALL terminal-related env vars
  for (const key of TERMINAL_ENV_KEYS) {
    original[key] = process.env[key]
  }

  // Clear ALL terminal-related env vars first
  for (const key of TERMINAL_ENV_KEYS) {
    delete process.env[key]
  }

  // Set the ones specified in env
  for (const key of Object.keys(env)) {
    if (env[key] !== undefined) {
      process.env[key] = env[key]
    }
  }

  try {
    fn()
  } finally {
    // Restore ALL terminal-related env vars
    for (const key of TERMINAL_ENV_KEYS) {
      if (original[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = original[key]
      }
    }
  }
}

describe('detectTerminal', () => {
  test('detects Kitty via KITTY_WINDOW_ID', () => {
    withEnv({ KITTY_WINDOW_ID: '1', TERM_PROGRAM: undefined }, () => {
      expect(detectTerminal()).toBe('kitty')
    })
  })

  test('detects Kitty via TERM=xterm-kitty', () => {
    withEnv({ TERM: 'xterm-kitty', KITTY_WINDOW_ID: undefined }, () => {
      expect(detectTerminal()).toBe('kitty')
    })
  })

  test('detects Ghostty via TERM_PROGRAM', () => {
    withEnv({ TERM_PROGRAM: 'ghostty', KITTY_WINDOW_ID: undefined }, () => {
      expect(detectTerminal()).toBe('ghostty')
    })
  })

  test('detects Ghostty via TERM=xterm-ghostty', () => {
    withEnv({ TERM: 'xterm-ghostty', TERM_PROGRAM: undefined, KITTY_WINDOW_ID: undefined }, () => {
      expect(detectTerminal()).toBe('ghostty')
    })
  })

  test('detects iTerm2 via TERM_PROGRAM', () => {
    withEnv({ TERM_PROGRAM: 'iTerm.app', KITTY_WINDOW_ID: undefined }, () => {
      expect(detectTerminal()).toBe('iterm2')
    })
  })

  test('detects iTerm2 via ITERM_SESSION_ID', () => {
    withEnv({ ITERM_SESSION_ID: 'w0t0p0', TERM_PROGRAM: undefined, KITTY_WINDOW_ID: undefined }, () => {
      expect(detectTerminal()).toBe('iterm2')
    })
  })

  test('detects Apple Terminal', () => {
    withEnv({ TERM_PROGRAM: 'Apple_Terminal', KITTY_WINDOW_ID: undefined, ITERM_SESSION_ID: undefined }, () => {
      expect(detectTerminal()).toBe('apple-terminal')
    })
  })

  test('detects Alacritty via TERM', () => {
    withEnv({ TERM: 'alacritty', TERM_PROGRAM: undefined, KITTY_WINDOW_ID: undefined }, () => {
      expect(detectTerminal()).toBe('alacritty')
    })
  })

  test('detects WezTerm via TERM_PROGRAM', () => {
    withEnv({ TERM_PROGRAM: 'WezTerm', KITTY_WINDOW_ID: undefined }, () => {
      expect(detectTerminal()).toBe('wezterm')
    })
  })

  test('detects VS Code terminal', () => {
    withEnv({ TERM_PROGRAM: 'vscode', KITTY_WINDOW_ID: undefined }, () => {
      expect(detectTerminal()).toBe('vscode')
    })
  })

  test('detects tmux', () => {
    withEnv({ TMUX: '/tmp/tmux-501/default,12345,0', TERM_PROGRAM: undefined, KITTY_WINDOW_ID: undefined }, () => {
      expect(detectTerminal()).toBe('tmux')
    })
  })

  test('detects GNU Screen', () => {
    withEnv({ STY: '12345.pts-0.hostname', TMUX: undefined, TERM_PROGRAM: undefined, KITTY_WINDOW_ID: undefined }, () => {
      expect(detectTerminal()).toBe('screen')
    })
  })

  test('detects Linux console', () => {
    withEnv({ TERM: 'linux', TERM_PROGRAM: undefined, KITTY_WINDOW_ID: undefined, TMUX: undefined, STY: undefined }, () => {
      expect(detectTerminal()).toBe('linux-console')
    })
  })

  test('detects generic xterm', () => {
    withEnv({ TERM: 'xterm-256color', TERM_PROGRAM: undefined, KITTY_WINDOW_ID: undefined, TMUX: undefined, STY: undefined }, () => {
      expect(detectTerminal()).toBe('xterm')
    })
  })

  test('returns unknown for unrecognized terminal', () => {
    withEnv({ TERM: 'dumb', TERM_PROGRAM: undefined, KITTY_WINDOW_ID: undefined, TMUX: undefined, STY: undefined }, () => {
      expect(detectTerminal()).toBe('unknown')
    })
  })
})

describe('getTerminalDisplayName', () => {
  test('returns human-readable names', () => {
    expect(getTerminalDisplayName('kitty')).toBe('Kitty')
    expect(getTerminalDisplayName('ghostty')).toBe('Ghostty')
    expect(getTerminalDisplayName('iterm2')).toBe('iTerm2')
    expect(getTerminalDisplayName('apple-terminal')).toBe('Apple Terminal')
    expect(getTerminalDisplayName('vscode')).toBe('VS Code Terminal')
    expect(getTerminalDisplayName('tmux')).toBe('tmux')
    expect(getTerminalDisplayName('screen')).toBe('GNU Screen')
    expect(getTerminalDisplayName('linux-console')).toBe('Linux Console')
    expect(getTerminalDisplayName('unknown')).toBe('Unknown Terminal')
  })
})

describe('detectCapabilities', () => {
  test('detects Unicode from LANG', () => {
    withEnv({ LANG: 'en_US.UTF-8', TERM_PROGRAM: 'ghostty', KITTY_WINDOW_ID: undefined }, () => {
      const caps = detectCapabilities()
      expect(caps.supportsUnicode).toBe(true)
    })
  })

  test('detects no Unicode without UTF-8 in LANG', () => {
    withEnv({ LANG: 'C', LC_ALL: undefined, TERM_PROGRAM: 'ghostty', KITTY_WINDOW_ID: undefined }, () => {
      const caps = detectCapabilities()
      expect(caps.supportsUnicode).toBe(false)
    })
  })

  test('VADERS_ASCII=1 forces ASCII mode', () => {
    withEnv({ VADERS_ASCII: '1', LANG: 'en_US.UTF-8', TERM_PROGRAM: 'ghostty', KITTY_WINDOW_ID: undefined }, () => {
      const caps = detectCapabilities()
      expect(caps.supportsUnicode).toBe(false)
    })
  })

  test('detects true color from COLORTERM', () => {
    withEnv({ COLORTERM: 'truecolor', TERM_PROGRAM: undefined, KITTY_WINDOW_ID: undefined }, () => {
      const caps = detectCapabilities()
      expect(caps.supportsTrueColor).toBe(true)
    })
  })

  test('detects 256 color from TERM', () => {
    withEnv({ TERM: 'xterm-256color', COLORTERM: undefined, TERM_PROGRAM: undefined, KITTY_WINDOW_ID: undefined }, () => {
      const caps = detectCapabilities()
      expect(caps.supports256Color).toBe(true)
    })
  })

  test('Kitty supports Kitty keyboard protocol', () => {
    withEnv({ KITTY_WINDOW_ID: '1', LANG: 'en_US.UTF-8' }, () => {
      const caps = detectCapabilities()
      expect(caps.supportsKittyKeyboard).toBe(true)
    })
  })

  test('Ghostty supports Kitty keyboard protocol', () => {
    withEnv({ TERM_PROGRAM: 'ghostty', KITTY_WINDOW_ID: undefined, LANG: 'en_US.UTF-8' }, () => {
      const caps = detectCapabilities()
      expect(caps.supportsKittyKeyboard).toBe(true)
    })
  })

  test('Apple Terminal does not support Kitty keyboard protocol', () => {
    withEnv({ TERM_PROGRAM: 'Apple_Terminal', KITTY_WINDOW_ID: undefined, LANG: 'en_US.UTF-8' }, () => {
      const caps = detectCapabilities()
      expect(caps.supportsKittyKeyboard).toBe(false)
    })
  })

  test('detects multiplexer from TMUX', () => {
    withEnv({ TMUX: '/tmp/tmux', TERM_PROGRAM: undefined, KITTY_WINDOW_ID: undefined }, () => {
      const caps = detectCapabilities()
      expect(caps.insideMultiplexer).toBe(true)
    })
  })

  test('detects multiplexer from STY', () => {
    withEnv({ STY: '12345.pts', TMUX: undefined, TERM_PROGRAM: undefined, KITTY_WINDOW_ID: undefined }, () => {
      const caps = detectCapabilities()
      expect(caps.insideMultiplexer).toBe(true)
    })
  })
})

describe('getColorDepth', () => {
  test('returns truecolor when supported', () => {
    const caps = { supportsTrueColor: true, supports256Color: true, terminal: 'kitty' } as TerminalCapabilities
    expect(getColorDepth(caps)).toBe('truecolor')
  })

  test('returns 256 when only 256 color supported', () => {
    const caps = { supportsTrueColor: false, supports256Color: true, terminal: 'apple-terminal' } as TerminalCapabilities
    expect(getColorDepth(caps)).toBe('256')
  })

  test('returns 16 for Linux console', () => {
    const caps = { supportsTrueColor: false, supports256Color: false, terminal: 'linux-console' } as TerminalCapabilities
    expect(getColorDepth(caps)).toBe('16')
  })
})

describe('needsKeyReleaseTimeout', () => {
  test('returns false for Kitty keyboard protocol', () => {
    const caps = { supportsKittyKeyboard: true } as TerminalCapabilities
    expect(needsKeyReleaseTimeout(caps)).toBe(false)
  })

  test('returns true without Kitty keyboard protocol', () => {
    const caps = { supportsKittyKeyboard: false } as TerminalCapabilities
    expect(needsKeyReleaseTimeout(caps)).toBe(true)
  })
})

describe('getKeyReleaseTimeoutMs', () => {
  test('returns 0 for terminals with Kitty keyboard protocol', () => {
    const caps = { supportsKittyKeyboard: true, terminal: 'kitty' } as TerminalCapabilities
    expect(getKeyReleaseTimeoutMs(caps)).toBe(0)
  })

  test('returns 0 for Ghostty', () => {
    const caps = { supportsKittyKeyboard: true, terminal: 'ghostty' } as TerminalCapabilities
    expect(getKeyReleaseTimeoutMs(caps)).toBe(0)
  })

  test('returns positive timeout for Apple Terminal', () => {
    const caps = { supportsKittyKeyboard: false, terminal: 'apple-terminal' } as TerminalCapabilities
    const timeout = getKeyReleaseTimeoutMs(caps)
    expect(timeout).toBeGreaterThan(0)
    expect(timeout).toBeLessThanOrEqual(200) // Should be reasonable
  })

  test('returns positive timeout for iTerm2', () => {
    const caps = { supportsKittyKeyboard: false, terminal: 'iterm2' } as TerminalCapabilities
    const timeout = getKeyReleaseTimeoutMs(caps)
    expect(timeout).toBeGreaterThan(0)
  })

  test('returns positive timeout for unknown terminals without Kitty protocol', () => {
    const caps = { supportsKittyKeyboard: false, terminal: 'unknown' } as TerminalCapabilities
    const timeout = getKeyReleaseTimeoutMs(caps)
    expect(timeout).toBeGreaterThan(0)
  })
})

describe('shouldEnableKittyKeyboard', () => {
  test('returns true (always try to enable)', () => {
    expect(shouldEnableKittyKeyboard()).toBe(true)
  })
})

describe('usesDiscreteMovement', () => {
  test('returns false for terminals with Kitty keyboard protocol (smooth movement)', () => {
    const caps = { supportsKittyKeyboard: true, terminal: 'kitty' } as TerminalCapabilities
    expect(usesDiscreteMovement(caps)).toBe(false)
  })

  test('returns false for Ghostty (smooth movement)', () => {
    const caps = { supportsKittyKeyboard: true, terminal: 'ghostty' } as TerminalCapabilities
    expect(usesDiscreteMovement(caps)).toBe(false)
  })

  test('returns true for Apple Terminal (discrete movement, no skating)', () => {
    const caps = { supportsKittyKeyboard: false, terminal: 'apple-terminal' } as TerminalCapabilities
    expect(usesDiscreteMovement(caps)).toBe(true)
  })

  test('returns true for iTerm2 (discrete movement)', () => {
    const caps = { supportsKittyKeyboard: false, terminal: 'iterm2' } as TerminalCapabilities
    expect(usesDiscreteMovement(caps)).toBe(true)
  })

  test('returns true for unknown terminals without Kitty protocol', () => {
    const caps = { supportsKittyKeyboard: false, terminal: 'unknown' } as TerminalCapabilities
    expect(usesDiscreteMovement(caps)).toBe(true)
  })
})

describe('needsEscapePassthrough', () => {
  test('returns true inside multiplexer', () => {
    const caps = { insideMultiplexer: true } as TerminalCapabilities
    expect(needsEscapePassthrough(caps)).toBe(true)
  })

  test('returns false outside multiplexer', () => {
    const caps = { insideMultiplexer: false } as TerminalCapabilities
    expect(needsEscapePassthrough(caps)).toBe(false)
  })
})

describe('wrapForPassthrough', () => {
  test('returns unchanged sequence outside multiplexer', () => {
    const caps = { insideMultiplexer: false } as TerminalCapabilities
    expect(wrapForPassthrough('\x1b[?1049h', caps)).toBe('\x1b[?1049h')
  })

  test('wraps sequence for tmux', () => {
    withEnv({ TMUX: '/tmp/tmux', STY: undefined }, () => {
      const caps = { insideMultiplexer: true } as TerminalCapabilities
      const wrapped = wrapForPassthrough('\x1b[?1049h', caps)
      expect(wrapped).toContain('Ptmux')
    })
  })

  test('wraps sequence for screen', () => {
    withEnv({ STY: '12345.pts', TMUX: undefined }, () => {
      const caps = { insideMultiplexer: true } as TerminalCapabilities
      const wrapped = wrapForPassthrough('\x1b[?1049h', caps)
      expect(wrapped.startsWith('\x1bP')).toBe(true)
    })
  })
})

describe('hexTo256Color', () => {
  test('converts pure red', () => {
    expect(hexTo256Color('#ff0000')).toBe(196) // Bright red in 256 palette
  })

  test('converts pure green', () => {
    expect(hexTo256Color('#00ff00')).toBe(46) // Bright green in 256 palette
  })

  test('converts pure blue', () => {
    expect(hexTo256Color('#0000ff')).toBe(21) // Bright blue in 256 palette
  })

  test('converts white', () => {
    expect(hexTo256Color('#ffffff')).toBe(231) // White
  })

  test('converts black', () => {
    expect(hexTo256Color('#000000')).toBe(16) // Black
  })

  test('converts grayscale', () => {
    const gray = hexTo256Color('#808080')
    expect(gray).toBeGreaterThanOrEqual(232) // Should be in grayscale range
    expect(gray).toBeLessThanOrEqual(255)
  })

  test('handles hex without #', () => {
    expect(hexTo256Color('ff0000')).toBe(196)
  })
})

describe('hexTo16Color', () => {
  test('converts red to ANSI red', () => {
    const color = hexTo16Color('#ff0000')
    // Red component should be set (bit 0 = 1)
    expect(color % 10).toBe(1)
  })

  test('converts green to ANSI green', () => {
    const color = hexTo16Color('#00ff00')
    // Green component should be set (bit 1 = 2)
    expect(color % 10).toBe(2)
  })

  test('converts blue to ANSI blue', () => {
    const color = hexTo16Color('#0000ff')
    // Blue component should be set (bit 2 = 4)
    expect(color % 10).toBe(4)
  })

  test('converts bright white to bright ANSI', () => {
    const color = hexTo16Color('#ffffff')
    expect(color).toBeGreaterThanOrEqual(90) // Bright (high brightness)
    expect(color % 10).toBe(7) // White = all bits set
  })

  test('converts dark red to non-bright ANSI red', () => {
    const color = hexTo16Color('#800000')
    expect(color).toBeLessThan(90) // Non-bright (low brightness)
    expect(color % 10).toBe(1) // Red component
  })

  test('converts cyan to ANSI cyan', () => {
    const color = hexTo16Color('#00ffff')
    // Cyan = green + blue (bits 1 and 2 = 6)
    expect(color % 10).toBe(6)
  })

  test('converts yellow to ANSI yellow', () => {
    const color = hexTo16Color('#ffff00')
    // Yellow = red + green (bits 0 and 1 = 3)
    expect(color % 10).toBe(3)
  })
})

describe('formatColor', () => {
  test('formats truecolor escape sequence', () => {
    const caps = { supportsTrueColor: true, supports256Color: true, terminal: 'kitty' } as TerminalCapabilities
    const seq = formatColor('#ff5500', caps)
    expect(seq).toBe('\x1b[38;2;255;85;0m')
  })

  test('formats 256 color escape sequence', () => {
    const caps = { supportsTrueColor: false, supports256Color: true, terminal: 'apple-terminal' } as TerminalCapabilities
    const seq = formatColor('#ff0000', caps)
    expect(seq).toMatch(/^\x1b\[38;5;\d+m$/)
  })

  test('formats 16 color escape sequence', () => {
    const caps = { supportsTrueColor: false, supports256Color: false, terminal: 'linux-console' } as TerminalCapabilities
    const seq = formatColor('#ff0000', caps)
    expect(seq).toMatch(/^\x1b\[\d+m$/)
  })
})

describe('getTerminalQuirks', () => {
  test('returns quirks for Apple Terminal', () => {
    const caps = { terminal: 'apple-terminal', supportsUnicode: true, insideMultiplexer: false } as TerminalCapabilities
    const quirks = getTerminalQuirks(caps)
    expect(quirks.length).toBeGreaterThan(0)
    expect(quirks.some(q => q.includes('true color'))).toBe(true)
  })

  test('returns no quirks for Kitty', () => {
    const caps = { terminal: 'kitty', supportsUnicode: true, insideMultiplexer: false } as TerminalCapabilities
    const quirks = getTerminalQuirks(caps)
    expect(quirks.length).toBe(0)
  })

  test('returns ASCII quirk when Unicode disabled', () => {
    const caps = { terminal: 'kitty', supportsUnicode: false, insideMultiplexer: false } as TerminalCapabilities
    const quirks = getTerminalQuirks(caps)
    expect(quirks.some(q => q.includes('ASCII'))).toBe(true)
  })

  test('returns multiplexer quirk when inside tmux', () => {
    const caps = { terminal: 'xterm', supportsUnicode: true, insideMultiplexer: true } as TerminalCapabilities
    const quirks = getTerminalQuirks(caps)
    expect(quirks.some(q => q.includes('multiplexer'))).toBe(true)
  })

  test('returns quirks for Linux console', () => {
    const caps = { terminal: 'linux-console', supportsUnicode: false, insideMultiplexer: false } as TerminalCapabilities
    const quirks = getTerminalQuirks(caps)
    expect(quirks.some(q => q.includes('16 colors'))).toBe(true)
    expect(quirks.some(q => q.includes('Unicode'))).toBe(true)
    // Also triggers ASCII mode quirk
    expect(quirks.some(q => q.includes('ASCII'))).toBe(true)
  })

  test('returns quirks for iTerm2', () => {
    const caps = { terminal: 'iterm2', supportsUnicode: true, insideMultiplexer: false } as TerminalCapabilities
    const quirks = getTerminalQuirks(caps)
    expect(quirks.length).toBeGreaterThan(0)
    expect(quirks.some(q => q.includes('emoji'))).toBe(true)
  })

  test('returns quirks for GNU Screen', () => {
    const caps = { terminal: 'screen', supportsUnicode: true, insideMultiplexer: true } as TerminalCapabilities
    const quirks = getTerminalQuirks(caps)
    expect(quirks.some(q => q.includes('Screen'))).toBe(true)
    expect(quirks.some(q => q.includes('Italic'))).toBe(true)
  })

  test('returns no quirks for Ghostty with full support', () => {
    const caps = { terminal: 'ghostty', supportsUnicode: true, insideMultiplexer: false } as TerminalCapabilities
    const quirks = getTerminalQuirks(caps)
    expect(quirks.length).toBe(0)
  })

  test('returns quirks for tmux', () => {
    const caps = { terminal: 'tmux', supportsUnicode: true, insideMultiplexer: true } as TerminalCapabilities
    const quirks = getTerminalQuirks(caps)
    expect(quirks.some(q => q.includes('tmux'))).toBe(true)
  })
})

// ============================================================================
// Terminal Capability Detection (Issue #13 additions)
// ============================================================================

describe('detectCapabilities: full terminal profiles', () => {
  test('Kitty has full modern capabilities', () => {
    withEnv({ KITTY_WINDOW_ID: '1', LANG: 'en_US.UTF-8', COLORTERM: 'truecolor' }, () => {
      const caps = detectCapabilities()
      expect(caps.terminal).toBe('kitty')
      expect(caps.supportsTrueColor).toBe(true)
      expect(caps.supports256Color).toBe(true)
      expect(caps.supportsKittyKeyboard).toBe(true)
      expect(caps.supportsUnicode).toBe(true)
      expect(caps.supportsBold).toBe(true)
      expect(caps.supportsItalic).toBe(true)
      expect(caps.supportsUnderline).toBe(true)
      expect(caps.supportsBrightColors).toBe(true)
      expect(caps.supportsWideCharacters).toBe(true)
      expect(caps.supportsHyperlinks).toBe(true)
      expect(caps.insideMultiplexer).toBe(false)
    })
  })

  test('Linux console has minimal capabilities', () => {
    withEnv({ TERM: 'linux', LANG: 'C' }, () => {
      const caps = detectCapabilities()
      expect(caps.terminal).toBe('linux-console')
      expect(caps.supportsTrueColor).toBe(false)
      expect(caps.supports256Color).toBe(false)
      expect(caps.supportsKittyKeyboard).toBe(false)
      expect(caps.supportsUnicode).toBe(false)
      expect(caps.supportsItalic).toBe(false)
      expect(caps.supportsUnderline).toBe(false)
      expect(caps.supportsWideCharacters).toBe(false)
      expect(caps.supportsHyperlinks).toBe(false)
      expect(caps.supportsSixel).toBe(false)
    })
  })

  test('VS Code terminal has good but not full capabilities', () => {
    withEnv({ TERM_PROGRAM: 'vscode', LANG: 'en_US.UTF-8', COLORTERM: 'truecolor' }, () => {
      const caps = detectCapabilities()
      expect(caps.terminal).toBe('vscode')
      expect(caps.supportsTrueColor).toBe(true)
      expect(caps.supportsKittyKeyboard).toBe(false)
      expect(caps.supportsUnicode).toBe(true)
    })
  })

  test('WezTerm has experimental Kitty keyboard support', () => {
    withEnv({ TERM_PROGRAM: 'WezTerm', LANG: 'en_US.UTF-8', COLORTERM: 'truecolor' }, () => {
      const caps = detectCapabilities()
      expect(caps.terminal).toBe('wezterm')
      expect(caps.supportsKittyKeyboard).toBe(true)
      expect(caps.supportsTrueColor).toBe(true)
      expect(caps.supportsSixel).toBe(true)
    })
  })

  test('Alacritty has true color but no Kitty keyboard', () => {
    withEnv({ TERM: 'alacritty', LANG: 'en_US.UTF-8', COLORTERM: 'truecolor' }, () => {
      const caps = detectCapabilities()
      expect(caps.terminal).toBe('alacritty')
      expect(caps.supportsTrueColor).toBe(true)
      expect(caps.supportsKittyKeyboard).toBe(false)
      expect(caps.supportsHyperlinks).toBe(true)
    })
  })

  test('unknown terminal falls back to safe defaults', () => {
    withEnv({ TERM: 'dumb', LANG: 'en_US.UTF-8' }, () => {
      const caps = detectCapabilities()
      expect(caps.terminal).toBe('unknown')
      expect(caps.supportsTrueColor).toBe(false)
      expect(caps.supports256Color).toBe(true)
      expect(caps.supportsKittyKeyboard).toBe(false)
      expect(caps.supportsHyperlinks).toBe(false)
    })
  })
})

// ============================================================================
// Color Fallback Logic (Issue #13)
// ============================================================================

describe('Color fallback logic', () => {
  test('getColorDepth returns appropriate depth for each terminal tier', () => {
    // Tier 1: True color
    expect(getColorDepth({ supportsTrueColor: true, supports256Color: true, terminal: 'kitty' } as TerminalCapabilities)).toBe('truecolor')
    expect(getColorDepth({ supportsTrueColor: true, supports256Color: true, terminal: 'ghostty' } as TerminalCapabilities)).toBe('truecolor')

    // Tier 2: 256 colors
    expect(getColorDepth({ supportsTrueColor: false, supports256Color: true, terminal: 'apple-terminal' } as TerminalCapabilities)).toBe('256')
    expect(getColorDepth({ supportsTrueColor: false, supports256Color: true, terminal: 'unknown' } as TerminalCapabilities)).toBe('256')

    // Tier 3: 16 colors
    expect(getColorDepth({ supportsTrueColor: false, supports256Color: false, terminal: 'linux-console' } as TerminalCapabilities)).toBe('16')
  })

  test('formatColor produces correct escape sequence format for each depth', () => {
    const trueColorCaps = { supportsTrueColor: true, supports256Color: true, terminal: 'kitty' } as TerminalCapabilities
    const color256Caps = { supportsTrueColor: false, supports256Color: true, terminal: 'apple-terminal' } as TerminalCapabilities
    const color16Caps = { supportsTrueColor: false, supports256Color: false, terminal: 'linux-console' } as TerminalCapabilities

    // True color: \x1b[38;2;R;G;Bm
    const tcSeq = formatColor('#ff8800', trueColorCaps)
    expect(tcSeq).toBe('\x1b[38;2;255;136;0m')

    // 256 color: \x1b[38;5;Nm
    const c256Seq = formatColor('#ff8800', color256Caps)
    expect(c256Seq).toMatch(/^\x1b\[38;5;\d+m$/)

    // 16 color: \x1b[Nm
    const c16Seq = formatColor('#ff8800', color16Caps)
    expect(c16Seq).toMatch(/^\x1b\[\d+m$/)
  })

  test('hexTo256Color produces consistent results for same input', () => {
    const first = hexTo256Color('#abcdef')
    const second = hexTo256Color('#abcdef')
    expect(first).toBe(second)
  })

  test('hexTo256Color maps primary colors correctly', () => {
    expect(hexTo256Color('#ff0000')).toBe(196) // Red
    expect(hexTo256Color('#00ff00')).toBe(46)  // Green
    expect(hexTo256Color('#0000ff')).toBe(21)  // Blue
    expect(hexTo256Color('#ffffff')).toBe(231)  // White
    expect(hexTo256Color('#000000')).toBe(16)   // Black
  })

  test('hexTo16Color maps to valid ANSI range', () => {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff', '#000000']
    for (const hex of colors) {
      const code = hexTo16Color(hex)
      // Valid ANSI foreground codes: 30-37 (normal) or 90-97 (bright)
      expect(code >= 30 && code <= 37 || code >= 90 && code <= 97).toBe(true)
    }
  })
})

// ============================================================================
// VS Code Terminal Timeout Override (Issue #13)
// ============================================================================

describe('Terminal-specific key release timeouts', () => {
  test('VS Code has higher timeout than default', () => {
    const vscodeCaps = { supportsKittyKeyboard: false, terminal: 'vscode' } as TerminalCapabilities
    const defaultCaps = { supportsKittyKeyboard: false, terminal: 'iterm2' } as TerminalCapabilities

    const vscodeTimeout = getKeyReleaseTimeoutMs(vscodeCaps)
    const defaultTimeout = getKeyReleaseTimeoutMs(defaultCaps)

    expect(vscodeTimeout).toBeGreaterThan(defaultTimeout)
  })

  test('WezTerm with Kitty keyboard has 0 timeout', () => {
    const caps = { supportsKittyKeyboard: true, terminal: 'wezterm' } as TerminalCapabilities
    expect(getKeyReleaseTimeoutMs(caps)).toBe(0)
  })
})

// ============================================================================
// Rich Color and Braille Feature Gating
// ============================================================================

describe('supportsRichColor', () => {
  test('enabled only when terminal has 24-bit truecolor', () => {
    // Rich color features (gradients, smooth interpolation) require truecolor
    const truecolorCaps = { supportsTrueColor: true } as TerminalCapabilities
    const limitedCaps = { supportsTrueColor: false } as TerminalCapabilities
    expect(supportsRichColor(truecolorCaps)).toBe(true)
    expect(supportsRichColor(limitedCaps)).toBe(false)
  })
})

// ============================================================================
// Braille Support Detection
// ============================================================================

describe('supportsBraille', () => {
  test('enabled only when terminal supports Unicode', () => {
    // Braille characters (U+2800 block) need Unicode but NOT truecolor
    const unicodeCaps = { supportsUnicode: true } as TerminalCapabilities
    const asciiCaps = { supportsUnicode: false } as TerminalCapabilities
    expect(supportsBraille(unicodeCaps)).toBe(true)
    expect(supportsBraille(asciiCaps)).toBe(false)
  })

  test('VADERS_ASCII=1 disables braille even on Unicode-capable terminals', () => {
    withEnv({ VADERS_ASCII: '1', LANG: 'en_US.UTF-8', TERM_PROGRAM: 'ghostty', KITTY_WINDOW_ID: undefined }, () => {
      const caps = detectCapabilities()
      expect(supportsBraille(caps)).toBe(false)
    })
  })

  test('braille and rich color are independent capabilities', () => {
    // Apple Terminal: Unicode (braille) but no truecolor (no rich color)
    const unicodeOnly = { supportsUnicode: true, supportsTrueColor: false } as TerminalCapabilities
    expect(supportsBraille(unicodeOnly)).toBe(true)
    expect(supportsRichColor(unicodeOnly)).toBe(false)
  })
})

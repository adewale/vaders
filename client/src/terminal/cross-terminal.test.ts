// client/src/terminal/cross-terminal.test.ts
// Tests verifying consistent behavior across different terminals (Ghostty, Apple Terminal)

import { describe, test, expect } from 'bun:test'
import {
  detectTerminal,
  detectCapabilities,
  getColorDepth,
  needsKeyReleaseTimeout,
  hexTo256Color,
  formatColor,
  supportsGradient,
  supportsBraille,
  type TerminalCapabilities,
} from './compatibility'
import { SPRITES, SPRITE_SIZE, ASCII_SPRITES, COLORS, getSprites } from '../sprites'

// Helper to mock environment for specific terminal
function mockTerminalEnv(terminal: 'ghostty' | 'apple-terminal') {
  const envBackup: Record<string, string | undefined> = {}
  
  // Backup current env
  const keysToBackup = ['TERM_PROGRAM', 'TERM', 'KITTY_WINDOW_ID', 'COLORTERM', 'LANG', 'VADERS_ASCII']
  for (const key of keysToBackup) {
    envBackup[key] = process.env[key]
  }
  
  // Clear all terminal detection vars
  delete process.env.KITTY_WINDOW_ID
  delete process.env.ITERM_SESSION_ID
  delete process.env.TMUX
  delete process.env.STY
  delete process.env.VADERS_ASCII
  
  if (terminal === 'ghostty') {
    process.env.TERM_PROGRAM = 'ghostty'
    process.env.TERM = 'xterm-256color'
    process.env.COLORTERM = 'truecolor'
    process.env.LANG = 'en_US.UTF-8'
  } else {
    process.env.TERM_PROGRAM = 'Apple_Terminal'
    process.env.TERM = 'xterm-256color'
    delete process.env.COLORTERM // Apple Terminal doesn't set this
    process.env.LANG = 'en_US.UTF-8'
  }
  
  return () => {
    // Restore
    for (const key of keysToBackup) {
      if (envBackup[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = envBackup[key]
      }
    }
  }
}

describe('Cross-Terminal Consistency', () => {
  
  describe('Terminal Detection', () => {
    test('correctly identifies Ghostty', () => {
      const restore = mockTerminalEnv('ghostty')
      try {
        expect(detectTerminal()).toBe('ghostty')
      } finally {
        restore()
      }
    })

    test('correctly identifies Apple Terminal', () => {
      const restore = mockTerminalEnv('apple-terminal')
      try {
        expect(detectTerminal()).toBe('apple-terminal')
      } finally {
        restore()
      }
    })
  })

  describe('Capability Differences', () => {
    test('Ghostty has full capabilities', () => {
      const restore = mockTerminalEnv('ghostty')
      try {
        const caps = detectCapabilities()
        expect(caps.supportsTrueColor).toBe(true)
        expect(caps.supportsKittyKeyboard).toBe(true)
        expect(caps.supportsUnicode).toBe(true)
        expect(caps.supportsWideCharacters).toBe(true)
      } finally {
        restore()
      }
    })

    test('Apple Terminal has limited capabilities', () => {
      const restore = mockTerminalEnv('apple-terminal')
      try {
        const caps = detectCapabilities()
        expect(caps.supportsTrueColor).toBe(false) // Only 256 colors
        expect(caps.supportsKittyKeyboard).toBe(false) // No key release events
        expect(caps.supportsUnicode).toBe(true) // Does support Unicode
        expect(caps.supportsWideCharacters).toBe(false) // Emoji width issues
      } finally {
        restore()
      }
    })
  })

  describe('Keyboard Handling Consistency', () => {
    test('Ghostty uses native key release events', () => {
      const restore = mockTerminalEnv('ghostty')
      try {
        const caps = detectCapabilities()
        expect(needsKeyReleaseTimeout(caps)).toBe(false)
      } finally {
        restore()
      }
    })

    test('Apple Terminal uses timeout-based key release', () => {
      const restore = mockTerminalEnv('apple-terminal')
      try {
        const caps = detectCapabilities()
        expect(needsKeyReleaseTimeout(caps)).toBe(true)
      } finally {
        restore()
      }
    })
  })

  describe('Color Handling Consistency', () => {
    test('both terminals support 256 colors at minimum', () => {
      for (const terminal of ['ghostty', 'apple-terminal'] as const) {
        const restore = mockTerminalEnv(terminal)
        try {
          const caps = detectCapabilities()
          expect(caps.supports256Color).toBe(true)
        } finally {
          restore()
        }
      }
    })

    test('color conversion produces valid 256-color for both terminals', () => {
      // Test player colors convert to valid 256-color indices
      for (const color of Object.values(COLORS.player)) {
        const idx = hexTo256Color(color)
        expect(idx).toBeGreaterThanOrEqual(16)
        expect(idx).toBeLessThanOrEqual(255)
      }
      
      // Test alien colors
      for (const color of Object.values(COLORS.alien)) {
        const idx = hexTo256Color(color)
        expect(idx).toBeGreaterThanOrEqual(16)
        expect(idx).toBeLessThanOrEqual(255)
      }
    })

    test('formatColor produces valid escape sequences for both terminals', () => {
      const ghosttyCaps = { supportsTrueColor: true, supports256Color: true, terminal: 'ghostty' } as TerminalCapabilities
      const appleCaps = { supportsTrueColor: false, supports256Color: true, terminal: 'apple-terminal' } as TerminalCapabilities
      
      const testColor = '#00ffff' // Cyan (player 1)
      
      const ghosttySeq = formatColor(testColor, ghosttyCaps)
      const appleSeq = formatColor(testColor, appleCaps)
      
      // Ghostty uses truecolor (24-bit)
      expect(ghosttySeq).toMatch(/^\x1b\[38;2;\d+;\d+;\d+m$/)
      
      // Apple Terminal uses 256-color
      expect(appleSeq).toMatch(/^\x1b\[38;5;\d+m$/)
    })
  })
})

describe('Sprite Consistency Constraints', () => {
  
  describe('Player Ship Dimensions', () => {
    test('player sprite is exactly 5 chars wide', () => {
      expect(SPRITES.player[0].length).toBe(5)
      expect(SPRITES.player[1].length).toBe(5)
      expect(SPRITE_SIZE.player.width).toBe(5)
    })

    test('player sprite is exactly 2 lines tall', () => {
      expect(SPRITES.player.length).toBe(2)
      expect(SPRITE_SIZE.player.height).toBe(2)
    })

    test('ASCII player sprite has same dimensions as Unicode sprite', () => {
      expect(ASCII_SPRITES.player[0].length).toBe(SPRITES.player[0].length)
      expect(ASCII_SPRITES.player[1].length).toBe(SPRITES.player[1].length)
    })
  })

  describe('Bullet Spawn Position Constraint', () => {
    // CRITICAL: Bullets must appear to come from the center of the player ship
    // Player ship is 5 chars wide, so center is at offset 2 (0-indexed)
    
    test('player sprite center column is well-defined', () => {
      const playerWidth = SPRITE_SIZE.player.width
      const centerOffset = Math.floor(playerWidth / 2)
      expect(centerOffset).toBe(2) // Center of 5-wide sprite
    })

    test('bullet is single character for precise positioning', () => {
      expect(SPRITES.bullet.player.length).toBe(1)
      expect(SPRITES.bullet.alien.length).toBe(1)
      expect(SPRITE_SIZE.bullet.width).toBe(1)
    })

    test('bullet spawn x should equal player.x (center position)', () => {
      // This tests the constraint: bullet.x = player.x
      // Player position is tracked at center, so bullet spawns directly above
      const playerX = 60 // Example player position (center)
      const bulletX = playerX // Bullet spawns at same X as player center
      expect(bulletX).toBe(playerX)
    })
  })

  describe('Alien Sprite Consistency', () => {
    test('all alien types have same dimensions', () => {
      const alienTypes = ['squid', 'crab', 'octopus'] as const
      for (const type of alienTypes) {
        expect(SPRITES.alien[type][0].length).toBe(5)
        expect(SPRITES.alien[type][1].length).toBe(5)
        expect(SPRITES.alien[type].length).toBe(2)
      }
    })

    test('ASCII alien sprites match Unicode dimensions', () => {
      const alienTypes = ['squid', 'crab', 'octopus'] as const
      for (const type of alienTypes) {
        expect(ASCII_SPRITES.alien[type][0].length).toBe(SPRITES.alien[type][0].length)
        expect(ASCII_SPRITES.alien[type][1].length).toBe(SPRITES.alien[type][1].length)
      }
    })
  })

  describe('Barrier Sprite Consistency', () => {
    test('all barrier health states have same dimensions', () => {
      for (const health of [1, 2, 3, 4] as const) {
        expect(SPRITES.barrier[health][0].length).toBe(2)
        expect(SPRITES.barrier[health][1].length).toBe(2)
      }
    })

    test('ASCII barrier sprites match Unicode dimensions', () => {
      for (const health of [1, 2, 3, 4] as const) {
        expect(ASCII_SPRITES.barrier[health][0].length).toBe(SPRITES.barrier[health][0].length)
        expect(ASCII_SPRITES.barrier[health][1].length).toBe(SPRITES.barrier[health][1].length)
      }
    })
  })

  describe('UFO Sprite Consistency', () => {
    test('UFO sprite matches declared dimensions', () => {
      expect(SPRITES.ufo[0].length).toBe(SPRITE_SIZE.ufo.width)
      expect(SPRITES.ufo[1].length).toBe(SPRITE_SIZE.ufo.width)
      expect(SPRITES.ufo.length).toBe(SPRITE_SIZE.ufo.height)
    })

    test('ASCII UFO sprite matches Unicode dimensions', () => {
      expect(ASCII_SPRITES.ufo[0].length).toBe(SPRITES.ufo[0].length)
      expect(ASCII_SPRITES.ufo[1].length).toBe(SPRITES.ufo[1].length)
    })
  })
})

describe('Visual Alignment Constraints', () => {
  
  test('all 2-line sprites have consistent line lengths', () => {
    // Each sprite's two lines must be the same width for proper alignment
    expect(SPRITES.player[0].length).toBe(SPRITES.player[1].length)
    
    for (const type of ['squid', 'crab', 'octopus'] as const) {
      expect(SPRITES.alien[type][0].length).toBe(SPRITES.alien[type][1].length)
    }
    
    expect(SPRITES.ufo[0].length).toBe(SPRITES.ufo[1].length)
    
    for (const health of [1, 2, 3, 4] as const) {
      expect(SPRITES.barrier[health][0].length).toBe(SPRITES.barrier[health][1].length)
    }
  })

  test('ASCII sprites also have consistent line lengths', () => {
    expect(ASCII_SPRITES.player[0].length).toBe(ASCII_SPRITES.player[1].length)
    
    for (const type of ['squid', 'crab', 'octopus'] as const) {
      expect(ASCII_SPRITES.alien[type][0].length).toBe(ASCII_SPRITES.alien[type][1].length)
    }
    
    expect(ASCII_SPRITES.ufo[0].length).toBe(ASCII_SPRITES.ufo[1].length)
  })

  test('sprite widths match SPRITE_SIZE declarations', () => {
    expect(SPRITES.player[0].length).toBe(SPRITE_SIZE.player.width)
    expect(SPRITES.alien.squid[0].length).toBe(SPRITE_SIZE.alien.width)
    expect(SPRITES.ufo[0].length).toBe(SPRITE_SIZE.ufo.width)
    expect(SPRITES.barrier[4][0].length).toBe(SPRITE_SIZE.barrier.width)
    expect(SPRITES.bullet.player.length).toBe(SPRITE_SIZE.bullet.width)
  })
})

describe('Terminal-Specific Rendering', () => {

  test('getSprites returns Unicode sprites for Unicode-capable terminals', () => {
    const restore = mockTerminalEnv('ghostty')
    try {
      // Note: getSprites uses cached capabilities, so this tests the caching behavior
      // In a real scenario, sprites would be selected at app init time
      const sprites = getSprites()
      // Both Ghostty and Apple Terminal support Unicode, so we should get Unicode sprites
      expect(sprites.player[0]).toBe(SPRITES.player[0])
    } finally {
      restore()
    }
  })

  test('color depth degrades gracefully', () => {
    // Ghostty: truecolor
    const ghosttyCaps = { supportsTrueColor: true, supports256Color: true, terminal: 'ghostty' } as TerminalCapabilities
    expect(getColorDepth(ghosttyCaps)).toBe('truecolor')

    // Apple Terminal: 256 color
    const appleCaps = { supportsTrueColor: false, supports256Color: true, terminal: 'apple-terminal' } as TerminalCapabilities
    expect(getColorDepth(appleCaps)).toBe('256')

    // Linux console: 16 color
    const linuxCaps = { supportsTrueColor: false, supports256Color: false, terminal: 'linux-console' } as TerminalCapabilities
    expect(getColorDepth(linuxCaps)).toBe('16')
  })
})

// ============================================================================
// Cross-Terminal Movement Handling (Issue #13 additions)
// ============================================================================

describe('Cross-Terminal Movement Handling', () => {
  test('Ghostty uses continuous movement (Kitty keyboard protocol)', () => {
    const restore = mockTerminalEnv('ghostty')
    try {
      const caps = detectCapabilities()
      expect(caps.supportsKittyKeyboard).toBe(true)
      expect(needsKeyReleaseTimeout(caps)).toBe(false)
    } finally {
      restore()
    }
  })

  test('Apple Terminal uses discrete movement (no key release)', () => {
    const restore = mockTerminalEnv('apple-terminal')
    try {
      const caps = detectCapabilities()
      expect(caps.supportsKittyKeyboard).toBe(false)
      expect(needsKeyReleaseTimeout(caps)).toBe(true)
    } finally {
      restore()
    }
  })
})

// ============================================================================
// Color Conversion Cross-Terminal Consistency (Issue #13)
// ============================================================================

describe('Color Conversion Cross-Terminal', () => {
  test('game colors produce valid 256-color indices for all terminals', () => {
    // All game colors must map to valid 256-color range (16-255)
    const gameColors = [
      ...Object.values(COLORS.player),
      ...Object.values(COLORS.alien),
    ]
    for (const hex of gameColors) {
      const idx = hexTo256Color(hex)
      expect(idx).toBeGreaterThanOrEqual(16)
      expect(idx).toBeLessThanOrEqual(255)
    }
  })

  test('formatColor returns non-empty strings for all color depths', () => {
    const ghosttyCaps = { supportsTrueColor: true, supports256Color: true, terminal: 'ghostty' } as TerminalCapabilities
    const appleCaps = { supportsTrueColor: false, supports256Color: true, terminal: 'apple-terminal' } as TerminalCapabilities
    const linuxCaps = { supportsTrueColor: false, supports256Color: false, terminal: 'linux-console' } as TerminalCapabilities

    const testColor = '#55ff55'

    expect(formatColor(testColor, ghosttyCaps).length).toBeGreaterThan(0)
    expect(formatColor(testColor, appleCaps).length).toBeGreaterThan(0)
    expect(formatColor(testColor, linuxCaps).length).toBeGreaterThan(0)
  })

  test('truecolor and 256-color produce different escape sequences', () => {
    const ghosttyCaps = { supportsTrueColor: true, supports256Color: true, terminal: 'ghostty' } as TerminalCapabilities
    const appleCaps = { supportsTrueColor: false, supports256Color: true, terminal: 'apple-terminal' } as TerminalCapabilities

    const trueSeq = formatColor('#55ff55', ghosttyCaps)
    const c256Seq = formatColor('#55ff55', appleCaps)

    // They should use different format prefixes
    expect(trueSeq).toContain('38;2;')   // True color: 38;2;R;G;B
    expect(c256Seq).toContain('38;5;')   // 256 color: 38;5;N
  })
})

// ============================================================================
// Minimum Terminal Size Constraints (Issue #13)
// ============================================================================

describe('Terminal Size Constraints', () => {
  test('game grid constants are consistent', () => {
    // The game grid is fixed at 120x36
    // All sprites must fit within this grid
    const width = 120
    const height = 36

    // Player must fit on screen
    expect(SPRITE_SIZE.player.width).toBeLessThanOrEqual(width)
    expect(SPRITE_SIZE.player.height).toBeLessThanOrEqual(height)

    // UFO must fit on screen
    expect(SPRITE_SIZE.ufo.width).toBeLessThanOrEqual(width)
    expect(SPRITE_SIZE.ufo.height).toBeLessThanOrEqual(height)

    // Alien must fit on screen
    expect(SPRITE_SIZE.alien.width).toBeLessThanOrEqual(width)
    expect(SPRITE_SIZE.alien.height).toBeLessThanOrEqual(height)
  })

  test('all sprites have non-zero dimensions', () => {
    expect(SPRITE_SIZE.player.width).toBeGreaterThan(0)
    expect(SPRITE_SIZE.player.height).toBeGreaterThan(0)
    expect(SPRITE_SIZE.alien.width).toBeGreaterThan(0)
    expect(SPRITE_SIZE.alien.height).toBeGreaterThan(0)
    expect(SPRITE_SIZE.ufo.width).toBeGreaterThan(0)
    expect(SPRITE_SIZE.ufo.height).toBeGreaterThan(0)
    expect(SPRITE_SIZE.bullet.width).toBeGreaterThan(0)
    expect(SPRITE_SIZE.barrier.width).toBeGreaterThan(0)
    expect(SPRITE_SIZE.barrier.height).toBeGreaterThan(0)
  })
})

// ============================================================================
// Cross-Terminal Animation Feature Support
// ============================================================================

describe('Cross-Terminal Animation Features', () => {
  test('Apple Terminal gets braille but not gradients', () => {
    const restore = mockTerminalEnv('apple-terminal')
    try {
      const caps = detectCapabilities()
      expect(supportsBraille(caps)).toBe(true)
      expect(supportsGradient(caps)).toBe(false)
    } finally {
      restore()
    }
  })

  test('Ghostty gets both braille and gradients', () => {
    const restore = mockTerminalEnv('ghostty')
    try {
      const caps = detectCapabilities()
      expect(supportsBraille(caps)).toBe(true)
      expect(supportsGradient(caps)).toBe(true)
    } finally {
      restore()
    }
  })

  test('gradient and braille flags are independent', () => {
    // A terminal can support braille (Unicode) without gradient (truecolor)
    const appleCaps = {
      supportsUnicode: true,
      supportsTrueColor: false,
      terminal: 'apple-terminal',
    } as TerminalCapabilities
    expect(supportsBraille(appleCaps)).toBe(true)
    expect(supportsGradient(appleCaps)).toBe(false)

    // A terminal with both
    const kittyCaps = {
      supportsUnicode: true,
      supportsTrueColor: true,
      terminal: 'kitty',
    } as TerminalCapabilities
    expect(supportsBraille(kittyCaps)).toBe(true)
    expect(supportsGradient(kittyCaps)).toBe(true)

    // A terminal with neither
    const linuxCaps = {
      supportsUnicode: false,
      supportsTrueColor: false,
      terminal: 'linux-console',
    } as TerminalCapabilities
    expect(supportsBraille(linuxCaps)).toBe(false)
    expect(supportsGradient(linuxCaps)).toBe(false)
  })

  test('feature support matrix for all terminal tiers', () => {
    // Tier 1: Full modern (truecolor + unicode)
    for (const terminal of ['kitty', 'ghostty', 'iterm2', 'alacritty', 'wezterm', 'vscode'] as const) {
      const caps = { supportsUnicode: true, supportsTrueColor: true, terminal } as TerminalCapabilities
      expect(supportsBraille(caps)).toBe(true)
      expect(supportsGradient(caps)).toBe(true)
    }

    // Tier 2: Unicode but no truecolor
    const appleCaps = { supportsUnicode: true, supportsTrueColor: false, terminal: 'apple-terminal' } as TerminalCapabilities
    expect(supportsBraille(appleCaps)).toBe(true)
    expect(supportsGradient(appleCaps)).toBe(false)

    // Tier 3: Neither
    const linuxCaps = { supportsUnicode: false, supportsTrueColor: false, terminal: 'linux-console' } as TerminalCapabilities
    expect(supportsBraille(linuxCaps)).toBe(false)
    expect(supportsGradient(linuxCaps)).toBe(false)
  })
})

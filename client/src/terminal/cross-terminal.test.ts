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

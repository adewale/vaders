// client/src/sprites.ts
// Game sprites for 120x36 standard size - 2-line sprites for larger display

// Import standard dimensions from shared (single source of truth)
import { STANDARD_WIDTH, STANDARD_HEIGHT } from '../../shared/types'
export { STANDARD_WIDTH, STANDARD_HEIGHT }

// Import terminal capabilities for sprite selection and color conversion
import { getTerminalCapabilities, hexTo256Color } from './terminal'

export const SPRITES = {
  // Classic alien sprites (2 lines each, 5 chars wide)
  alien: {
    squid: [
      '╔═══╗',
      '╚═╦═╝',
    ],
    crab: [
      '/°°°\\',
      '╚═══╝',
    ],
    octopus: [
      '(╭ö╮)',
      '(╰─╯)',
    ],
  },

  // Player ship (2 lines, 5 chars wide)
  player: [
    ' ╱█╲ ',
    '▕███▏',
  ],

  // UFO (mystery ship) - 2 lines, 7 chars wide
  ufo: [
    '╭─●─╮',
    '╰═══╯',
  ],

  // Bullets (1 char)
  bullet: {
    player: '║',   // Moving up (thicker for visibility)
    alien: '▼',    // Moving down
  },

  // Barrier states (based on health) - 2x2 blocks
  barrier: {
    4: ['██', '██'],  // Full health
    3: ['▓▓', '▓▓'],  // 3/4 health
    2: ['▒▒', '▒▒'],  // 2/4 health
    1: ['░░', '░░'],  // 1/4 health
    0: ['  ', '  '],  // Destroyed
  },

  // Enhanced mode sprites (2 lines each)
  enhanced: {
    commander: {
      healthy: ['◄════►', '╚════╝'],
      damaged: ['◄────►', '╚────╝'],
    },
    transform: {
      scorpion: ['∿∿', '╰╯'],
      stingray: ['◇◇', '╲╱'],
      mini_commander: ['◄►', '╚╝'],
    },
    tractorBeam: ['╠╬╬╣', '║║║║'],
  },
} as const

// Sprite dimensions (width x height in characters)
export const SPRITE_SIZE = {
  alien: { width: 5, height: 2 },
  player: { width: 5, height: 2 },
  ufo: { width: 5, height: 2 },
  bullet: { width: 1, height: 1 },
  barrier: { width: 2, height: 2 },
} as const

// Retro Arcade Color Palette
// Inspired by Galaga, Space Invaders, Pac-Man
export const COLORS = {
  // Aliens: threat-based colors (top rows = more dangerous)
  alien: {
    squid:   '#ff5555',   // Red - top row, highest threat
    crab:    '#ffaa00',   // Orange - middle row, medium threat
    octopus: '#55ff55',   // Green - bottom row, lowest threat
  },
  // Players: distinct vibrant colors for each slot
  player: {
    1: '#00ffff',  // Cyan - classic hero color (think Galaga ship)
    2: '#ff8800',  // Orange - warm contrast
    3: '#ff55ff',  // Magenta/pink - stands out
    4: '#88ff00',  // Lime green - high visibility
  },
  bullet: {
    player: '#ffffff',  // Bright white for visibility
    alien:  '#ff3333',  // Red - danger
  },
  barrier: {
    4: '#00ff00',  // Bright green - full health
    3: '#ffff00',  // Yellow - damaged
    2: '#ff8800',  // Orange - critical
    1: '#ff0000',  // Red - nearly destroyed
  },
  enhanced: {
    commander: '#ff0000',     // Red - boss enemy
    transform: '#00ffff',     // Cyan - special enemy
  },
  // UI Colors for consistency across screens
  ui: {
    title: '#00ffff',         // Cyan - main titles
    border: '#5555ff',        // Blue - borders (arcade cabinet feel)
    borderHighlight: '#00ffff', // Cyan - highlighted borders
    selected: '#ffff00',      // Yellow - selected items
    selectedText: '#ffffff',  // White - selected item text
    unselected: '#888888',    // Gray - unselected items
    hotkey: '#ff8800',        // Orange - hotkey brackets (arcade button color)
    label: '#aaaaaa',         // Light gray - labels
    dim: '#666666',           // Dark gray - dimmed text
    score: '#ffff00',         // Yellow - scores (classic arcade)
    wave: '#00ffff',          // Cyan - wave number
    lives: '#ff5555',         // Red - lives/hearts
    livesEmpty: '#553333',    // Dark red - empty hearts
    success: '#00ff00',       // Green - success/victory
    error: '#ff0000',         // Red - errors/game over
    warning: '#ffff00',       // Yellow - warnings
  },
} as const

// Logo ASCII art - larger for 120 width
export const LOGO_ASCII = `
██╗   ██╗ █████╗ ██████╗ ███████╗██████╗ ███████╗
██║   ██║██╔══██╗██╔══██╗██╔════╝██╔══██╗██╔════╝
██║   ██║███████║██║  ██║█████╗  ██████╔╝███████╗
╚██╗ ██╔╝██╔══██║██║  ██║██╔══╝  ██╔══██╗╚════██║
 ╚████╔╝ ██║  ██║██████╔╝███████╗██║  ██║███████║
  ╚═══╝  ╚═╝  ╚═╝╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝
`.trim()

// Decorative alien parade for launch screen (2-line)
export const ALIEN_PARADE = [
  '╔═══╗  /°°°\\  (╭ö╮)',
  '╚═╦═╝  ╚═══╝  (╰─╯)',
]

// ─── ASCII Fallback Sprites ──────────────────────────────────────────────────
// Used for terminals without Unicode support (e.g., Linux console)

export const ASCII_SPRITES = {
  alien: {
    squid: [
      '+===+',
      '+-+-+',
    ],
    crab: [
      '/ooo\\',
      '+===+',
    ],
    octopus: [
      '(o^o)',
      '(---)',
    ],
  },
  player: [
    ' /A\\ ',
    '|===|',
  ],
  ufo: [
    '+-o-+',
    '+===+',
  ],
  bullet: {
    player: '|',
    alien: 'v',
  },
  barrier: {
    4: ['##', '##'],
    3: ['%%', '%%'],
    2: ['::','::'],
    1: ['..', '..'],
    0: ['  ', '  '],
  },
  enhanced: {
    commander: {
      healthy: ['<====>','+=====+'],
      damaged: ['<---->','+-----+'],
    },
    transform: {
      scorpion: ['~~', 'vv'],
      stingray: ['<>', '\\/',],
      mini_commander: ['<>','++'],
    },
    tractorBeam: ['||||', '||||'],
  },
} as const

// ASCII logo for non-Unicode terminals
export const ASCII_LOGO = `
 _   _____  ___  ___ ___  ___
| | / / _ |/ _ \\/ __| _ \\/ __|
| |/ / __ / / / / _|| / \\__ \\
|___/_/ |_/_/|_/|___|_|\\_|___/
`.trim()

// ─── Sprite Selection Based on Terminal Capabilities ─────────────────────────

/**
 * Get the appropriate sprites based on terminal capabilities.
 * Returns Unicode sprites for modern terminals, ASCII for limited ones.
 */
export function getSprites() {
  const caps = getTerminalCapabilities()
  return caps.supportsUnicode ? SPRITES : ASCII_SPRITES
}

/**
 * Get the appropriate logo based on terminal capabilities.
 */
export function getLogo() {
  const caps = getTerminalCapabilities()
  return caps.supportsUnicode ? LOGO_ASCII : ASCII_LOGO
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

import type { PlayerSlot } from '../../shared/types'

/**
 * Get the display color for a player based on their slot.
 * This centralizes the repeated pattern: COLORS.player[slot as 1|2|3|4] || fallback
 */
export function getPlayerColor(slot: PlayerSlot, fallbackColor?: string): string {
  return COLORS.player[slot] ?? fallbackColor ?? COLORS.player[1]
}

// ─── Terminal-Aware Color Conversion ──────────────────────────────────────────

/**
 * Convert a hex color to terminal-appropriate format.
 * - True color terminals: returns hex as-is (e.g., "#ff5555")
 * - 256-color terminals: returns ANSI 256 format (e.g., "color256:196")
 *
 * Note: OpenTUI may need to handle the "color256:N" format specially,
 * or we fall back to closest approximation the terminal can render.
 */
function convertColor(hex: string): string {
  const caps = getTerminalCapabilities()
  if (caps.supportsTrueColor) {
    return hex
  }
  // For 256-color terminals, return the 256-color index
  // OpenTUI should interpret this as \x1b[38;5;Nm
  const idx = hexTo256Color(hex)
  return `ansi256:${idx}`
}

/**
 * Deep convert all color values in a color object.
 * Recursively processes nested objects to convert all hex strings.
 */
function convertColorObject<T>(obj: T): T {
  if (typeof obj === 'string') {
    // It's a hex color string
    return convertColor(obj) as T
  }
  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = convertColorObject(value)
    }
    return result as T
  }
  return obj
}

// Cache the converted colors (computed once at module load)
const _termCaps = getTerminalCapabilities()
const _needsConversion = !_termCaps.supportsTrueColor

/**
 * Get colors appropriate for the current terminal.
 * For true color terminals, returns original hex colors.
 * For 256-color terminals (Apple Terminal), returns converted colors.
 *
 * Usage: Replace `COLORS.alien.squid` with `getColors().alien.squid`
 */
export function getColors(): typeof COLORS {
  if (!_needsConversion) {
    return COLORS
  }
  // Return converted colors for 256-color terminals
  return convertColorObject(COLORS)
}

/**
 * Get a terminal-appropriate color for a player slot.
 * This is the terminal-aware version of getPlayerColor.
 */
export function getTerminalPlayerColor(slot: PlayerSlot, fallbackColor?: string): string {
  const colors = getColors()
  return colors.player[slot] ?? fallbackColor ?? colors.player[1]
}

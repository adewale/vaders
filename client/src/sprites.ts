// client/src/sprites.ts
// Game sprites for 120x36 standard size - 7-wide braille sprites with animation frames

// Import standard dimensions from shared (single source of truth)
import { STANDARD_WIDTH, STANDARD_HEIGHT } from '../../shared/types'
export { STANDARD_WIDTH, STANDARD_HEIGHT }

// Import bitmap data and colors from client-core
import { PIXEL_ART } from '../../client-core/src/sprites/bitmaps'
import type { AnimatedSprite } from '../../client-core/src/sprites/bitmaps'
export { PIXEL_ART, SPRITE_SIZE, getAnimationFrame, type AnimatedSprite } from '../../client-core/src/sprites/bitmaps'
import { COLORS } from '../../client-core/src/sprites/colors'
export { COLORS, GRADIENT_COLORS, getPlayerColor } from '../../client-core/src/sprites/colors'

// Import terminal capabilities for sprite selection and color conversion
import { getTerminalCapabilities, convertColorForTerminal, convertColorObject, supportsBraille } from './terminal'
import type { TerminalCapabilities } from './terminal'

// ─── Braille Bitmap Converter ───────────────────────────────────────────────────

const BRAILLE_BASE = 0x2800
const BRAILLE_DOTS: number[][] = [
  [0x01, 0x08],  // row 0: dot1, dot4
  [0x02, 0x10],  // row 1: dot2, dot5
  [0x04, 0x20],  // row 2: dot3, dot6
  [0x40, 0x80],  // row 3: dot7, dot8
]

/** Convert a 4-row × 2-col boolean grid to a single braille character */
function bitmapToBraille(dots: boolean[][]): string {
  let code = BRAILLE_BASE
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 2; col++) {
      if (dots[row]?.[col]) {
        code |= BRAILLE_DOTS[row][col]
      }
    }
  }
  return String.fromCharCode(code)
}

/** Convert a pixel grid (rows × cols) into braille character lines.
 *  Each braille char represents a 2×4 block of pixels. */
function pixelsToBraille(pixels: number[][]): string[] {
  const rows = pixels.length
  const cols = pixels[0]?.length ?? 0
  const brailleRows = Math.ceil(rows / 4)
  const brailleCols = Math.ceil(cols / 2)
  const lines: string[] = []

  for (let br = 0; br < brailleRows; br++) {
    let line = ''
    for (let bc = 0; bc < brailleCols; bc++) {
      const dots: boolean[][] = []
      for (let dr = 0; dr < 4; dr++) {
        const row: boolean[] = []
        for (let dc = 0; dc < 2; dc++) {
          const pr = br * 4 + dr
          const pc = bc * 2 + dc
          row.push(pr < rows && pc < cols ? pixels[pr][pc] === 1 : false)
        }
        dots.push(row)
      }
      line += bitmapToBraille(dots)
    }
    lines.push(line)
  }
  return lines
}

// ─── Braille Pixel Art ────────────────────────────────────────────────────────
// PIXEL_ART is imported from client-core/src/sprites/bitmaps.ts

// Pre-render braille sprites at module load
function renderBrailleSprites() {
  return {
    alien: {
      squid: {
        a: pixelsToBraille(PIXEL_ART.squid.a) as [string, string],
        b: pixelsToBraille(PIXEL_ART.squid.b) as [string, string],
      },
      crab: {
        a: pixelsToBraille(PIXEL_ART.crab.a) as [string, string],
        b: pixelsToBraille(PIXEL_ART.crab.b) as [string, string],
      },
      octopus: {
        a: pixelsToBraille(PIXEL_ART.octopus.a) as [string, string],
        b: pixelsToBraille(PIXEL_ART.octopus.b) as [string, string],
      },
    },
    player: {
      a: pixelsToBraille(PIXEL_ART.player) as [string, string],
      b: pixelsToBraille(PIXEL_ART.player) as [string, string],
    },
    ufo: {
      a: pixelsToBraille(PIXEL_ART.ufo.a) as [string, string],
      b: pixelsToBraille(PIXEL_ART.ufo.b) as [string, string],
    },
  }
}

const _brailleSprites = renderBrailleSprites()

// ─── Main Sprites ───────────────────────────────────────────────────────────────
// AnimatedSprite is re-exported from client-core/src/sprites/bitmaps.ts

export const SPRITES = {
  // Classic alien sprites (2 lines each, 7 chars wide, braille pixel art)
  alien: {
    squid: _brailleSprites.alien.squid,
    crab: _brailleSprites.alien.crab,
    octopus: _brailleSprites.alien.octopus,
  } as Record<string, AnimatedSprite>,

  // Player ship (2 lines, 7 chars wide)
  player: _brailleSprites.player,

  // UFO (mystery ship) - 2 lines, 7 chars wide
  ufo: _brailleSprites.ufo,

  // Bullets (1 char)
  bullet: {
    player: '║',   // Moving up (thicker for visibility)
    alien: '▼',    // Moving down
  },

  // Barrier states (based on health) - braille pixel art, 3x2
  barrier: {
    4: ['⣿⣿⣿', '⣿⣿⣿'],  // Full health - solid
    3: ['⣾⣿⡿', '⡿⣿⣿'],  // 3/4 health - edge erosion
    2: ['⣞⣿⡵', '⢞⣯⢟'],  // 2/4 health - holes forming
    1: ['⠔⡩⢂', '⠌⠔⡐'],  // 1/4 health - sparse, crumbling
    0: ['⠀⠀⠀', '⠀⠀⠀'],  // Destroyed - empty braille
  },

} as const

// SPRITE_SIZE, GRADIENT_COLORS, COLORS, getPlayerColor are re-exported from client-core

// Logo ASCII art - larger for 120 width
export const LOGO_ASCII = `
██╗   ██╗ █████╗ ██████╗ ███████╗██████╗ ███████╗
██║   ██║██╔══██╗██╔══██╗██╔════╝██╔══██╗██╔════╝
██║   ██║███████║██║  ██║█████╗  ██████╔╝███████╗
╚██╗ ██╔╝██╔══██║██║  ██║██╔══╝  ██╔══██╗╚════██║
 ╚████╔╝ ██║  ██║██████╔╝███████╗██║  ██║███████║
  ╚═══╝  ╚═╝  ╚═╝╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝
`.trim()

// Decorative alien parade for launch screen (2-line, using frame A)
export const ALIEN_PARADE = [
  `${_brailleSprites.alien.squid.a[0]}  ${_brailleSprites.alien.crab.a[0]}  ${_brailleSprites.alien.octopus.a[0]}`,
  `${_brailleSprites.alien.squid.a[1]}  ${_brailleSprites.alien.crab.a[1]}  ${_brailleSprites.alien.octopus.a[1]}`,
]

// ─── ASCII Fallback Sprites ──────────────────────────────────────────────────
// Used for terminals without Unicode support (e.g., Linux console)

export const ASCII_SPRITES = {
  alien: {
    squid: {
      a: ['+==+==+', '+-=+=-+'],
      b: ['+==+==+', '=+-+-+='],
    },
    crab: {
      a: ['/ooooo\\', '+=====+'],
      b: ['\\ooooo/', '+=====+'],
    },
    octopus: {
      a: ['(o---o)', '(--v--)'],
      b: ['(o---o)', '\\--v--/'],
    },
  } as Record<string, AnimatedSprite>,
  player: {
    a: ['  /A\\  ', '|=====|'],
    b: ['  /A\\  ', '|=====|'],
  },
  ufo: {
    a: ['+--o--+', '+=====+'],
    b: ['+--*--+', '+=====+'],
  },
  bullet: {
    player: '|',
    alien: 'v',
  },
  barrier: {
    4: ['###', '###'],
    3: ['%##', '#%#'],
    2: ['.#.', '#..'],
    1: ['...', '...'],
    0: ['   ', '   '],
  },
} as const

// ASCII logo for non-Unicode terminals
export const ASCII_LOGO = `
 _   _____  ___  ___ ___  ___
| | / / _ |/ _ \\/ __| _ \\/ __|
| |/ / __ / / / / _|| / \\__ \\
|___/_/ |_/_/|_/|___|_|\\_|___/
`.trim()

// ─── Braille Spinner Frames ─────────────────────────────────────────────────
// Braille characters (U+2800 block) for smooth loading animations.
// Works on any Unicode-capable terminal including Apple Terminal.
// Falls back to classic ASCII twirl for non-Unicode terminals.

/** Braille dot spinner — 8 frames, one dot orbiting */
export const BRAILLE_SPINNER_FRAMES = [
  '\u2801', // ⠁
  '\u2802', // ⠂
  '\u2804', // ⠄
  '\u2840', // ⡀
  '\u2880', // ⢀
  '\u2820', // ⠠
  '\u2810', // ⠐
  '\u2808', // ⠈
] as const

/** ASCII fallback spinner — 4 frames, classic twirl */
export const ASCII_SPINNER_FRAMES = [
  '-',
  '\\',
  '|',
  '/',
] as const

/**
 * Get spinner frames appropriate for the current terminal.
 * Returns braille frames for Unicode terminals, ASCII twirl for limited ones.
 */
export function getSpinnerFrames(caps?: TerminalCapabilities): readonly string[] {
  return supportsBraille(caps) ? BRAILLE_SPINNER_FRAMES : ASCII_SPINNER_FRAMES
}

// ─── Sprite Selection Based on Terminal Capabilities ─────────────────────────

/**
 * Get the appropriate sprites based on terminal capabilities.
 * Returns braille sprites for modern terminals, ASCII for limited ones.
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

// Color conversion is now handled by the terminal compatibility layer
// via convertColorForTerminal() and convertColorObject() imports

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

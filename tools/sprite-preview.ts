#!/usr/bin/env bun
// tools/sprite-preview.ts
// Standalone sprite preview script — renders all game sprites in 7 visual configurations
// using ANSI true color output. No imports from client/ or shared/.
//
// Usage: bun run tools/sprite-preview.ts
//        bun run tools/sprite-preview.ts | less -R

// ─── ANSI Utilities ─────────────────────────────────────────────────────────────

const ESC = '\x1b'
const RST = `${ESC}[0m`
const BOLD = `${ESC}[1m`
const DIM = `${ESC}[2m`

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function fg(hex: string): string {
  const [r, g, b] = hexToRgb(hex)
  return `${ESC}[38;2;${r};${g};${b}m`
}

function bg(hex: string): string {
  const [r, g, b] = hexToRgb(hex)
  return `${ESC}[48;2;${r};${g};${b}m`
}

function interpolateColor(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const bl = Math.round(b1 + (b2 - b1) * t)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`
}

// ─── Sprite Data (copied from sprites.ts to keep script self-contained) ─────

const SPRITES = {
  alien: {
    squid:   ['╔═══╗', '╚═╦═╝'],
    crab:    ['/°°°\\', '╚═══╝'],
    octopus: ['(╭ö╮)', '(╰─╯)'],
  },
  player: [' ╱█╲ ', '▕███▏'],
  ufo:    ['╭─●─╮', '╰═══╯'],
  bullet: { player: '║', alien: '▼' },
  barrier: {
    4: ['██', '██'],
    3: ['▓▓', '▓▓'],
    2: ['▒▒', '▒▒'],
    1: ['░░', '░░'],
  },
} as const

const COLORS = {
  alien: {
    squid:   '#ff5555',
    crab:    '#ffaa00',
    octopus: '#55ff55',
  },
  player: '#00ffff',
  ufo:    '#ff55ff',
  bullet: { player: '#ffffff', alien: '#ff3333' },
  barrier: {
    4: '#00ff00',
    3: '#ffff00',
    2: '#ff8800',
    1: '#ff0000',
  },
} as const

// ─── Wider Sprites (7 chars wide) ──────────────────────────────────────────────

const WIDER_SPRITES = {
  alien: {
    squid:   ['╔══╦══╗', '╚╦═╬═╦╝'],
    crab:    ['/°°°°°\\', '╚═════╝'],
    octopus: ['(╭─ö─╮)', '(╰─▼─╯)'],
  },
  player: [' ╱███╲ ', '▕█████▏'],
  ufo:    ['╭──●──╮', '╰═════╯'],
}

// ─── Braille-Enhanced Sprites ───────────────────────────────────────────────────

// Braille dot positions in a 2×4 grid:
// col0: bit0=row0, bit1=row1, bit2=row2, bit6=row3
// col1: bit3=row0, bit4=row1, bit5=row2, bit7=row3
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

/** Convert a larger pixel grid (rows × cols) into braille characters.
 *  Each braille char represents a 2×4 block of pixels.
 *  Returns array of strings (lines of braille chars). */
function pixelsToBraille(pixels: boolean[][]): string[] {
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
          row.push(pr < rows && pc < cols ? pixels[pr][pc] : false)
        }
        dots.push(row)
      }
      line += bitmapToBraille(dots)
    }
    lines.push(line)
  }
  return lines
}

// Pixel art for braille sprites (each is an 8×10 grid → 5 braille chars × 2 lines)
// 1 = filled, 0 = empty

const BRAILLE_PIXEL_ART = {
  squid: [
    // Classic Space Invaders squid — helmet shape with dangling legs
    // 8 rows × 10 cols → 5 braille × 2 lines
    [0,0,0,1,1,1,1,0,0,0],
    [0,1,1,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1,1,1],
    [1,1,1,0,0,0,0,1,1,1],
    [1,1,1,1,1,1,1,1,1,1],
    [0,0,0,1,0,0,1,0,0,0],
    [0,0,1,0,1,1,0,1,0,0],
    [0,1,0,0,0,0,0,0,1,0],
  ],
  crab: [
    // Classic crab — round body, pincers on top, stubby legs
    [1,0,0,1,0,0,1,0,0,1],
    [0,1,0,0,1,1,0,0,1,0],
    [0,1,1,1,1,1,1,1,1,0],
    [0,1,0,1,1,1,1,0,1,0],
    [1,1,1,1,1,1,1,1,1,1],
    [1,0,1,1,1,1,1,1,0,1],
    [1,0,1,0,0,0,0,1,0,1],
    [0,0,0,1,1,1,1,0,0,0],
  ],
  octopus: [
    // Classic octopus — round dome, eyes, wavy tentacles
    [0,0,0,1,1,1,1,0,0,0],
    [0,0,1,1,1,1,1,1,0,0],
    [0,1,1,0,1,1,0,1,1,0],
    [0,1,1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,1,0],
    [0,0,0,1,0,0,1,0,0,0],
    [0,0,1,0,1,1,0,1,0,0],
    [0,1,0,1,0,0,1,0,1,0],
  ],
  player: [
    // Player ship — pointed nose, wide hull
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,1,1,1,1,0,0,0],
    [0,0,0,1,1,1,1,0,0,0],
    [0,0,1,1,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1],
    [1,1,0,1,1,1,1,0,1,1],
  ],
  ufo: [
    // Mystery ship — dome with porthole, wide saucer body
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,1,1,1,1,1,1,0,0],
    [0,1,1,0,1,1,0,1,1,0],
    [1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1],
    [0,1,1,1,1,1,1,1,1,0],
    [0,0,1,1,0,0,1,1,0,0],
    [0,0,0,0,0,0,0,0,0,0],
  ],
}

// Pre-render braille sprites
const BRAILLE_SPRITES: Record<string, string[]> = {}
for (const [name, pixels] of Object.entries(BRAILLE_PIXEL_ART)) {
  BRAILLE_SPRITES[name] = pixelsToBraille(pixels.map(row => row.map(v => v === 1)))
}

// ─── Wide Braille Sprites (7-wide = 14×8 pixel grids → 7 braille × 2 lines) ──

const WIDE_BRAILLE_PIXEL_ART = {
  squid: {
    a: [
      [0,0,0,0,0,1,1,1,1,0,0,0,0,0],
      [0,0,0,1,1,1,1,1,1,1,1,0,0,0],
      [0,0,1,1,1,1,1,1,1,1,1,1,0,0],
      [0,1,1,1,0,0,1,1,0,0,1,1,1,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,1,0],
      [0,0,0,0,1,0,0,0,0,1,0,0,0,0],
      [0,0,0,1,0,1,0,0,1,0,1,0,0,0],
      [0,0,1,0,0,0,1,1,0,0,0,1,0,0],
    ],
    b: [
      [0,0,0,0,0,1,1,1,1,0,0,0,0,0],
      [0,0,0,1,1,1,1,1,1,1,1,0,0,0],
      [0,0,1,1,1,1,1,1,1,1,1,1,0,0],
      [0,1,1,1,0,0,1,1,0,0,1,1,1,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,1,0],
      [0,0,1,0,0,1,0,0,1,0,0,1,0,0],
      [0,1,0,0,0,0,0,0,0,0,0,0,1,0],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,1],
    ],
  },
  crab: {
    a: [
      [1,0,0,0,1,0,0,0,0,1,0,0,0,1],
      [0,1,0,0,0,1,0,0,1,0,0,0,1,0],
      [0,0,1,1,1,1,1,1,1,1,1,1,0,0],
      [0,1,1,0,1,1,1,1,1,1,0,1,1,0],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,0,1,1,1,1,1,1,1,1,1,1,0,1],
      [1,0,1,0,0,0,0,0,0,0,0,1,0,1],
      [0,0,0,0,1,1,0,0,1,1,0,0,0,0],
    ],
    b: [
      [0,0,0,0,1,0,0,0,0,1,0,0,0,0],
      [0,0,0,0,0,1,0,0,1,0,0,0,0,0],
      [0,0,1,1,1,1,1,1,1,1,1,1,0,0],
      [0,1,1,0,1,1,1,1,1,1,0,1,1,0],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,0,1,1,1,1,1,1,1,1,1,1,0,1],
      [1,0,0,0,1,0,0,0,0,1,0,0,0,1],
      [0,0,0,1,0,0,0,0,0,0,1,0,0,0],
    ],
  },
  octopus: {
    a: [
      [0,0,0,0,1,1,1,1,1,1,0,0,0,0],
      [0,0,1,1,1,1,1,1,1,1,1,1,0,0],
      [0,1,1,1,0,0,1,1,0,0,1,1,1,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,1,0],
      [0,0,1,1,1,1,1,1,1,1,1,1,0,0],
      [0,0,0,1,1,0,0,0,0,1,1,0,0,0],
      [0,0,1,1,0,1,0,0,1,0,1,1,0,0],
      [0,1,1,0,0,0,0,0,0,0,0,1,1,0],
    ],
    b: [
      [0,0,0,0,1,1,1,1,1,1,0,0,0,0],
      [0,0,1,1,1,1,1,1,1,1,1,1,0,0],
      [0,1,1,1,0,0,1,1,0,0,1,1,1,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,1,0],
      [0,0,1,1,1,1,1,1,1,1,1,1,0,0],
      [0,0,0,1,0,0,1,1,0,0,1,0,0,0],
      [0,0,1,0,0,1,0,0,1,0,0,1,0,0],
      [1,1,0,0,0,0,0,0,0,0,0,0,1,1],
    ],
  },
  player: {
    a: [
      [0,0,0,0,0,1,1,1,0,0,0,0,0,0],
      [0,0,0,0,1,1,1,1,1,0,0,0,0,0],
      [0,0,0,1,1,1,1,1,1,1,0,0,0,0],
      [0,0,1,1,1,1,1,1,1,1,1,0,0,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,0,0],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,1,0,0,1,1,1,1,1,0,0,0,1,1],
    ],
    b: [
      [0,0,0,0,0,1,1,1,0,0,0,0,0,0],
      [0,0,0,0,1,1,1,1,1,0,0,0,0,0],
      [0,0,0,1,1,1,1,1,1,1,0,0,0,0],
      [0,0,1,1,1,1,1,1,1,1,1,0,0,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,0,0],
      [1,1,1,0,1,1,1,1,1,0,1,1,1,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,1,0,0,1,1,1,1,1,0,0,0,1,1],
    ],
  },
  ufo: {
    a: [
      [0,0,0,0,0,1,1,1,1,0,0,0,0,0],
      [0,0,0,1,1,1,1,1,1,1,1,0,0,0],
      [0,0,1,1,0,0,1,1,0,0,1,1,0,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,1,0],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [0,1,1,1,1,1,1,1,1,1,1,1,1,0],
      [0,0,1,1,0,0,0,0,0,0,1,1,0,0],
      [0,0,0,0,1,0,0,0,0,1,0,0,0,0],
    ],
    b: [
      [0,0,0,0,0,1,1,1,1,0,0,0,0,0],
      [0,0,0,1,1,1,1,1,1,1,1,0,0,0],
      [0,0,1,1,0,1,0,0,1,0,1,1,0,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,1,0],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [0,1,1,1,1,1,1,1,1,1,1,1,1,0],
      [0,0,1,1,0,0,0,0,0,0,1,1,0,0],
      [0,0,0,0,0,1,0,0,1,0,0,0,0,0],
    ],
  },
}

// Pre-render wide braille sprites (both animation frames)
const WIDE_BRAILLE_SPRITES: Record<string, { a: string[]; b: string[] }> = {}
for (const [name, frames] of Object.entries(WIDE_BRAILLE_PIXEL_ART)) {
  WIDE_BRAILLE_SPRITES[name] = {
    a: pixelsToBraille(frames.a.map(row => row.map(v => v === 1))),
    b: pixelsToBraille(frames.b.map(row => row.map(v => v === 1))),
  }
}

// ─── Expressive Box-Drawing Sprites ─────────────────────────────────────────────

const EXPRESSIVE_SPRITES = {
  alien: {
    squid:   ['┏━┳━┓', '┗╋━╋┛'],
    crab:    ['╱°°°╲', '╰═══╯'],
    octopus: ['⟨╭ö╮⟩', '⟨╰─╯⟩'],
  },
  player: [' ╱▲╲ ', '╠███╣'],
  ufo:    ['╭─◆─╮', '╰═══╯'],
}

// ─── Animation Frame Sprites ────────────────────────────────────────────────────

const ANIMATION_SPRITES = {
  alien: {
    squid: {
      a: ['╔═══╗', '╚═╦═╝'],
      b: ['╔═══╗', '═╩═╩═'],
    },
    crab: {
      a: ['/°°°\\', '╚═══╝'],
      b: ['\\°°°/', '╔═══╗'],
    },
    octopus: {
      a: ['(╭ö╮)', '(╰─╯)'],
      b: ['(╭ö╮)', '╚╰─╯╝'],
    },
  },
  player: {
    a: [' ╱█╲ ', '▕███▏'],
    b: [' ╱█╲ ', '▕▓█▓▏'],
  },
  ufo: {
    a: ['╭─●─╮', '╰═══╯'],
    b: ['╭─○─╮', '╰═══╯'],
  },
}

// ─── Half-Block Barrier Variants ────────────────────────────────────────────────

const HALFBLOCK_BARRIERS = {
  4: ['████', '████'],
  3: ['▓█▓█', '█▓█▓'],
  2: ['▒▓▒▓', '▓▒▓▒'],
  1: ['░▒░▒', '▒░▒░'],
}

// ─── Layout Helpers ─────────────────────────────────────────────────────────────

const SECTION_WIDTH = 76

function printDivider() {
  console.log(`${fg('#5555ff')}${'═'.repeat(SECTION_WIDTH)}${RST}`)
}

function printTitle(title: string) {
  printDivider()
  console.log(`${fg('#5555ff')}  ${BOLD}${fg('#00ffff')}${title}${RST}`)
  printDivider()
  console.log()
}

/** Print a colored 2-line sprite with a label above it */
function printSprite(lines: string[], color: string, label: string, indent: string = '  ') {
  console.log(`${indent}${DIM}${fg('#888888')}${label}${RST}`)
  for (const line of lines) {
    console.log(`${indent}${fg(color)}${line}${RST}`)
  }
}

/** Print multiple sprites side by side with labels */
function printSpritesRow(
  sprites: { lines: string[]; color: string; label: string }[],
  gap: number = 4
) {
  // Determine max width and max lines
  const maxLines = Math.max(...sprites.map(s => s.lines.length))
  const gapStr = ' '.repeat(gap)
  const indent = '  '

  // Print labels
  let labelLine = indent
  for (let i = 0; i < sprites.length; i++) {
    const s = sprites[i]
    const width = maxVisualWidth(s.lines)
    labelLine += `${DIM}${fg('#888888')}${s.label.padEnd(width)}${RST}`
    if (i < sprites.length - 1) labelLine += gapStr
  }
  console.log(labelLine)

  // Print sprite lines
  for (let row = 0; row < maxLines; row++) {
    let line = indent
    for (let i = 0; i < sprites.length; i++) {
      const s = sprites[i]
      const text = s.lines[row] ?? ''
      const width = maxVisualWidth(s.lines)
      line += `${fg(s.color)}${visualPadEnd(text, width)}${RST}`
      if (i < sprites.length - 1) line += gapStr
    }
    console.log(line)
  }
}

/** Get the visual width of a string (accounting for wide Unicode chars) */
function visualWidth(str: string): number {
  // Strip ANSI escape codes for measurement
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '')
  let w = 0
  for (const ch of stripped) {
    // Most characters are 1 cell wide in a monospace terminal
    // Full-width CJK and some block elements might be 2, but for our sprites
    // we treat everything as 1 cell since that's how they're designed
    w++
  }
  return w
}

/** Get the max visual width across all lines of a sprite */
function maxVisualWidth(lines: string[]): number {
  return Math.max(...lines.map(l => visualWidth(l)))
}

/** Pad a string to a visual width */
function visualPadEnd(str: string, width: number): string {
  const currentWidth = visualWidth(str)
  if (currentWidth >= width) return str
  return str + ' '.repeat(width - currentWidth)
}

// ─── Gradient Renderer ──────────────────────────────────────────────────────────

/** Render a sprite with per-character color gradient */
function renderGradientSprite(
  lines: string[],
  fromColor: string,
  toColor: string,
  direction: 'vertical' | 'horizontal'
): string[] {
  const result: string[] = []
  const totalLines = lines.length

  for (let row = 0; row < totalLines; row++) {
    const chars = [...lines[row]]
    const totalChars = chars.length
    let line = ''

    for (let col = 0; col < totalChars; col++) {
      const ch = chars[col]
      if (ch === ' ') {
        line += ' '
        continue
      }

      let t: number
      if (direction === 'vertical') {
        t = totalLines > 1 ? row / (totalLines - 1) : 0
      } else {
        t = totalChars > 1 ? col / (totalChars - 1) : 0
      }

      const color = interpolateColor(fromColor, toColor, t)
      line += `${fg(color)}${ch}${RST}`
    }
    result.push(line)
  }
  return result
}

/** Print a gradient sprite with label */
function printGradientSprite(
  lines: string[],
  fromColor: string,
  toColor: string,
  direction: 'vertical' | 'horizontal',
  label: string,
  gradientLabel: string,
  indent: string = '  '
) {
  console.log(`${indent}${DIM}${fg('#888888')}${label} ${fg('#666666')}(${gradientLabel})${RST}`)
  const rendered = renderGradientSprite(lines, fromColor, toColor, direction)
  for (const line of rendered) {
    console.log(`${indent}${line}`)
  }
}

// ─── Section Renderers ──────────────────────────────────────────────────────────

function renderBaseline() {
  printTitle('BASELINE (current sprites from sprites.ts)')

  printSpritesRow([
    { lines: [...SPRITES.alien.squid], color: COLORS.alien.squid, label: 'Squid' },
    { lines: [...SPRITES.alien.crab], color: COLORS.alien.crab, label: 'Crab' },
    { lines: [...SPRITES.alien.octopus], color: COLORS.alien.octopus, label: 'Octopus' },
    { lines: [...SPRITES.player], color: COLORS.player, label: 'Player' },
    { lines: [...SPRITES.ufo], color: COLORS.ufo, label: 'UFO' },
  ])

  console.log()

  // Barriers
  const barrierSprites: { lines: string[]; color: string; label: string }[] = []
  for (const health of [4, 3, 2, 1] as const) {
    barrierSprites.push({
      lines: [...SPRITES.barrier[health]],
      color: COLORS.barrier[health],
      label: `HP ${health}`,
    })
  }
  // Bullets
  barrierSprites.push(
    { lines: [SPRITES.bullet.player], color: COLORS.bullet.player, label: 'P.Bullet' },
    { lines: [SPRITES.bullet.alien], color: COLORS.bullet.alien, label: 'A.Bullet' },
  )
  printSpritesRow(barrierSprites)
  console.log()
}

function renderWider() {
  printTitle('VARIANT 1: Wider Sprites (7 chars wide)')

  printSpritesRow([
    { lines: [...WIDER_SPRITES.alien.squid], color: COLORS.alien.squid, label: 'Squid' },
    { lines: [...WIDER_SPRITES.alien.crab], color: COLORS.alien.crab, label: 'Crab' },
    { lines: [...WIDER_SPRITES.alien.octopus], color: COLORS.alien.octopus, label: 'Octopus' },
    { lines: [...WIDER_SPRITES.player], color: COLORS.player, label: 'Player' },
    { lines: [...WIDER_SPRITES.ufo], color: COLORS.ufo, label: 'UFO' },
  ])
  console.log()
}

function renderBraille() {
  printTitle('VARIANT 2: Braille-Enhanced Sprites (sub-cell detail)')

  printSpritesRow([
    { lines: BRAILLE_SPRITES.squid, color: COLORS.alien.squid, label: 'Squid' },
    { lines: BRAILLE_SPRITES.crab, color: COLORS.alien.crab, label: 'Crab' },
    { lines: BRAILLE_SPRITES.octopus, color: COLORS.alien.octopus, label: 'Octopus' },
    { lines: BRAILLE_SPRITES.player, color: COLORS.player, label: 'Player' },
    { lines: BRAILLE_SPRITES.ufo, color: COLORS.ufo, label: 'UFO' },
  ])
  console.log()
}

function renderExpressive() {
  printTitle('VARIANT 3: Expressive Box-Drawing (richer characters)')

  printSpritesRow([
    { lines: [...EXPRESSIVE_SPRITES.alien.squid], color: COLORS.alien.squid, label: 'Squid' },
    { lines: [...EXPRESSIVE_SPRITES.alien.crab], color: COLORS.alien.crab, label: 'Crab' },
    { lines: [...EXPRESSIVE_SPRITES.alien.octopus], color: COLORS.alien.octopus, label: 'Octopus' },
    { lines: [...EXPRESSIVE_SPRITES.player], color: COLORS.player, label: 'Player' },
    { lines: [...EXPRESSIVE_SPRITES.ufo], color: COLORS.ufo, label: 'UFO' },
  ])
  console.log()
}

function renderAnimation() {
  printTitle('VARIANT 4: Animation Frames (2 poses per entity)')

  console.log(`  ${DIM}${fg('#888888')}Aliens:${RST}`)
  console.log()

  for (const type of ['squid', 'crab', 'octopus'] as const) {
    const frames = ANIMATION_SPRITES.alien[type]
    const color = COLORS.alien[type]
    printSpritesRow([
      { lines: [...frames.a], color, label: `${type} (A)` },
      { lines: [...frames.b], color, label: `${type} (B)` },
    ])
    console.log()
  }

  console.log(`  ${DIM}${fg('#888888')}Player & UFO:${RST}`)
  console.log()
  printSpritesRow([
    { lines: [...ANIMATION_SPRITES.player.a], color: COLORS.player, label: 'Player (A)' },
    { lines: [...ANIMATION_SPRITES.player.b], color: COLORS.player, label: 'Player (B)' },
    { lines: [...ANIMATION_SPRITES.ufo.a], color: COLORS.ufo, label: 'UFO (A)' },
    { lines: [...ANIMATION_SPRITES.ufo.b], color: COLORS.ufo, label: 'UFO (B)' },
  ])
  console.log()
}

function renderHalfBlockBarriers() {
  printTitle('VARIANT 5: Half-Block Barriers (higher density damage patterns)')

  console.log(`  ${DIM}${fg('#888888')}Current barriers:${RST}`)
  printSpritesRow([
    { lines: [...SPRITES.barrier[4]], color: COLORS.barrier[4], label: 'HP 4' },
    { lines: [...SPRITES.barrier[3]], color: COLORS.barrier[3], label: 'HP 3' },
    { lines: [...SPRITES.barrier[2]], color: COLORS.barrier[2], label: 'HP 2' },
    { lines: [...SPRITES.barrier[1]], color: COLORS.barrier[1], label: 'HP 1' },
  ])

  console.log()
  console.log(`  ${DIM}${fg('#888888')}Half-block barriers (wider for visibility):${RST}`)
  printSpritesRow([
    { lines: [...HALFBLOCK_BARRIERS[4]], color: COLORS.barrier[4], label: 'HP 4' },
    { lines: [...HALFBLOCK_BARRIERS[3]], color: COLORS.barrier[3], label: 'HP 3' },
    { lines: [...HALFBLOCK_BARRIERS[2]], color: COLORS.barrier[2], label: 'HP 2' },
    { lines: [...HALFBLOCK_BARRIERS[1]], color: COLORS.barrier[1], label: 'HP 1' },
  ])
  console.log()
}

function renderGradients() {
  printTitle('VARIANT 6: Color Gradients (per-character color interpolation)')

  // Vertical gradients (top bright → bottom dark)
  console.log(`  ${DIM}${fg('#888888')}Vertical gradients (bright top → dark bottom):${RST}`)
  console.log()

  const gradients: Array<{
    lines: string[]
    from: string
    to: string
    label: string
  }> = [
    { lines: [...SPRITES.alien.squid], from: '#ff8888', to: '#881111', label: 'Squid' },
    { lines: [...SPRITES.alien.crab], from: '#ffcc44', to: '#884400', label: 'Crab' },
    { lines: [...SPRITES.alien.octopus], from: '#88ff88', to: '#118811', label: 'Octopus' },
    { lines: [...SPRITES.player], from: '#44ffff', to: '#115555', label: 'Player' },
    { lines: [...SPRITES.ufo], from: '#ff88ff', to: '#881188', label: 'UFO' },
  ]

  for (const g of gradients) {
    printGradientSprite(g.lines, g.from, g.to, 'vertical', g.label, `${g.from} → ${g.to}`)
    console.log()
  }

  // Horizontal gradients
  console.log(`  ${DIM}${fg('#888888')}Horizontal gradients (color varies left → right):${RST}`)
  console.log()

  const hGradients: Array<{
    lines: string[]
    from: string
    to: string
    label: string
  }> = [
    { lines: [...SPRITES.alien.squid], from: '#ff5555', to: '#ffff55', label: 'Squid' },
    { lines: [...SPRITES.alien.crab], from: '#ffaa00', to: '#ff5500', label: 'Crab' },
    { lines: [...SPRITES.alien.octopus], from: '#55ff55', to: '#55ffff', label: 'Octopus' },
    { lines: [...SPRITES.player], from: '#00ffff', to: '#0088ff', label: 'Player' },
    { lines: [...SPRITES.ufo], from: '#ff55ff', to: '#5555ff', label: 'UFO' },
  ]

  for (const g of hGradients) {
    printGradientSprite(g.lines, g.from, g.to, 'horizontal', g.label, `${g.from} → ${g.to}`)
    console.log()
  }
}

function renderCombined() {
  printTitle('COMBINED: All Recommendations (wider + braille + animation + gradients + half-block)')

  console.log(`  ${DIM}${fg('#888888')}7-wide braille sprites with vertical gradient coloring, 2 animation frames${RST}`)
  console.log(`  ${DIM}${fg('#666666')}(Variants 1+2+4+6 merged — expressive box-drawing is an alt to braille, not combined)${RST}`)
  console.log()

  // Gradient specs for each entity (bright → dark, top to bottom)
  const gradSpec = {
    squid:   { from: '#ff8888', to: '#aa1111' },
    crab:    { from: '#ffcc44', to: '#aa5500' },
    octopus: { from: '#88ff88', to: '#11aa11' },
    player:  { from: '#44ffff', to: '#116666' },
    ufo:     { from: '#ff88ff', to: '#aa11aa' },
  }

  // Aliens — show both frames with gradient
  console.log(`  ${DIM}${fg('#888888')}Aliens:${RST}`)
  console.log()

  for (const type of ['squid', 'crab', 'octopus'] as const) {
    const spec = gradSpec[type]
    const framesA = WIDE_BRAILLE_SPRITES[type].a
    const framesB = WIDE_BRAILLE_SPRITES[type].b
    const gradA = renderGradientSprite(framesA, spec.from, spec.to, 'vertical')
    const gradB = renderGradientSprite(framesB, spec.from, spec.to, 'vertical')

    // Print labels
    const width = maxVisualWidth(framesA)
    console.log(`  ${DIM}${fg('#888888')}${`${type} (A)`.padEnd(width)}${RST}    ${DIM}${fg('#888888')}${type} (B)${RST}`)

    // Print gradient lines side by side
    const maxLines = Math.max(gradA.length, gradB.length)
    for (let i = 0; i < maxLines; i++) {
      const lineA = gradA[i] ?? ' '.repeat(width)
      const lineB = gradB[i] ?? ''
      console.log(`  ${lineA}    ${lineB}`)
    }
    console.log()
  }

  // Player & UFO — both frames with gradient
  console.log(`  ${DIM}${fg('#888888')}Player & UFO:${RST}`)
  console.log()

  const entities: Array<{ name: string; key: string; spec: { from: string; to: string } }> = [
    { name: 'Player', key: 'player', spec: gradSpec.player },
    { name: 'UFO', key: 'ufo', spec: gradSpec.ufo },
  ]

  for (const ent of entities) {
    const framesA = WIDE_BRAILLE_SPRITES[ent.key].a
    const framesB = WIDE_BRAILLE_SPRITES[ent.key].b
    const gradA = renderGradientSprite(framesA, ent.spec.from, ent.spec.to, 'vertical')
    const gradB = renderGradientSprite(framesB, ent.spec.from, ent.spec.to, 'vertical')

    const width = maxVisualWidth(framesA)
    console.log(`  ${DIM}${fg('#888888')}${`${ent.name} (A)`.padEnd(width)}${RST}    ${DIM}${fg('#888888')}${ent.name} (B)${RST}`)
    const maxLines = Math.max(gradA.length, gradB.length)
    for (let i = 0; i < maxLines; i++) {
      const lineA = gradA[i] ?? ' '.repeat(width)
      const lineB = gradB[i] ?? ''
      console.log(`  ${lineA}    ${lineB}`)
    }
    console.log()
  }

  // Half-block barriers with gradient coloring
  console.log(`  ${DIM}${fg('#888888')}Half-block barriers with vertical gradient:${RST}`)
  console.log()

  const barrierGrads: Record<number, { from: string; to: string }> = {
    4: { from: '#44ff44', to: '#008800' },
    3: { from: '#ffff44', to: '#888800' },
    2: { from: '#ffaa44', to: '#884400' },
    1: { from: '#ff4444', to: '#880000' },
  }

  // Print all barrier levels side-by-side with gradients
  const barrierWidth = 4 // each half-block barrier is 4 chars
  const gap = '    '
  let labelLine = '  '
  for (const health of [4, 3, 2, 1]) {
    labelLine += `${DIM}${fg('#888888')}${'HP ' + health}${RST}`.padEnd(barrierWidth + gap.length + DIM.length + fg('#888888').length + RST.length)
  }
  // Simpler label approach
  console.log(`  ${DIM}${fg('#888888')}HP 4${RST}        ${DIM}${fg('#888888')}HP 3${RST}        ${DIM}${fg('#888888')}HP 2${RST}        ${DIM}${fg('#888888')}HP 1${RST}`)

  const barrierGradLines: string[][] = []
  for (const health of [4, 3, 2, 1]) {
    const lines = [...(HALFBLOCK_BARRIERS as Record<number, string[]>)[health]]
    const spec = barrierGrads[health]
    barrierGradLines.push(renderGradientSprite(lines, spec.from, spec.to, 'vertical'))
  }

  for (let row = 0; row < 2; row++) {
    let line = '  '
    for (let i = 0; i < barrierGradLines.length; i++) {
      line += barrierGradLines[i][row]
      if (i < barrierGradLines.length - 1) line += '        '
    }
    console.log(line)
  }

  // Bullets with gradient
  console.log()
  console.log(`  ${DIM}${fg('#888888')}Bullets:${RST}`)
  const pBullet = renderGradientSprite(['║'], '#ffffff', '#aaaaff', 'vertical')
  const aBullet = renderGradientSprite(['▼'], '#ff5555', '#ff0000', 'vertical')
  console.log(`  ${pBullet[0]}  ${DIM}${fg('#888888')}player${RST}    ${aBullet[0]}  ${DIM}${fg('#888888')}alien${RST}`)
  console.log()
}

// ─── Main ───────────────────────────────────────────────────────────────────────

console.log()
console.log(`${BOLD}${fg('#00ffff')}  VADERS Sprite Preview — 8 Visual Configurations${RST}`)
console.log(`${DIM}${fg('#888888')}  Comparing baseline sprites with 6 proposed improvements + combined${RST}`)
console.log()

renderBaseline()
renderWider()
renderBraille()
renderExpressive()
renderAnimation()
renderHalfBlockBarriers()
renderGradients()
renderCombined()

printDivider()
console.log(`${fg('#888888')}  End of preview. Pipe to ${fg('#00ffff')}less -R${fg('#888888')} for scrolling.${RST}`)
console.log()

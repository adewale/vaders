#!/usr/bin/env bun
// tools/spritesheet.ts
// Visual catalog of all Vaders graphics — imports from production code to stay in sync.
//
// Usage: bun run tools/spritesheet.ts
//        bun run tools/spritesheet.ts | less -R

// ─── Production Imports ─────────────────────────────────────────────────────────

import {
  SPRITES, ASCII_SPRITES, COLORS, GRADIENT_COLORS, SPRITE_SIZE,
  LOGO_ASCII, ASCII_LOGO, ALIEN_PARADE,
  BRAILLE_SPINNER_FRAMES, ASCII_SPINNER_FRAMES,
  type AnimatedSprite, getAnimationFrame, getPlayerColor,
} from '../client/src/sprites'

import {
  LAYOUT, HITBOX, STANDARD_WIDTH, STANDARD_HEIGHT,
  ALIEN_REGISTRY, type ClassicAlienType,
} from '../shared/types'

import {
  DIGIT_FONT, DIGIT_FONT_ASCII, DIGIT_HEIGHT, DIGIT_WIDTH, DIGIT_GAP,
  composeDigits,
} from '../client/src/digitFont'

import { GRADIENT_PRESETS, interpolateGradient } from '../client/src/gradient'
import { BRAILLE_DENSITY, MAX_DENSITY } from '../client/src/animation/waveBorder'
import { DISSOLVE_ASCII_CHARS } from '../client/src/animation/dissolve'
import { CONFETTI_CHARS, CONFETTI_COLORS } from '../client/src/animation/confetti'
import { WIPE_BLOCKS } from '../client/src/animation/wipe'
import { HALF_BLOCKS } from '../client/src/animation/interpolation'

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

// ─── Layout Helpers ─────────────────────────────────────────────────────────────

const SECTION_WIDTH = 76

function section(title: string): void {
  console.log()
  console.log(`${fg('#5555ff')}${'═'.repeat(SECTION_WIDTH)}${RST}`)
  console.log(`  ${BOLD}${fg('#00ffff')}${title}${RST}`)
  console.log(`${fg('#5555ff')}${'═'.repeat(SECTION_WIDTH)}${RST}`)
  console.log()
}

function label(text: string, indent: string = '  '): void {
  console.log(`${indent}${DIM}${fg('#888888')}${text}${RST}`)
}

function swatch(color: string, name: string): void {
  console.log(`  ${fg(color)}████${RST}  ${DIM}${fg('#aaaaaa')}${color}${RST}  ${fg('#cccccc')}${name}${RST}`)
}

/** Get visual width of a string (strip ANSI, count characters) */
function visualWidth(str: string): number {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '')
  let w = 0
  for (const _ of stripped) w++
  return w
}

/** Pad string to visual width */
function visualPadEnd(str: string, width: number): string {
  const cur = visualWidth(str)
  return cur >= width ? str : str + ' '.repeat(width - cur)
}

/** Max visual width across lines */
function maxVisualWidth(lines: string[]): number {
  return Math.max(...lines.map(l => visualWidth(l)), 0)
}

/** Render a 2-line sprite with vertical gradient (bright top, dark bottom) */
function renderGradientLines(lines: readonly string[], gradient: { bright: string; dark: string }): string[] {
  return lines.map((line, row) => {
    const color = row === 0 ? gradient.bright : gradient.dark
    let result = ''
    for (const ch of line) {
      if (ch === ' ') {
        result += ' '
      } else {
        result += `${fg(color)}${ch}${RST}`
      }
    }
    return result
  })
}

/** Print multiple items side-by-side with labels */
function printSpriteRow(
  items: { lines: string[]; label: string }[],
  gap: number = 4,
): void {
  const gapStr = ' '.repeat(gap)
  const indent = '  '

  // Compute widths from raw lines (before any ANSI was added)
  const widths = items.map(it => maxVisualWidth(it.lines))
  const maxLines = Math.max(...items.map(it => it.lines.length))

  // Labels
  let labelLine = indent
  for (let i = 0; i < items.length; i++) {
    labelLine += `${DIM}${fg('#888888')}${items[i].label.padEnd(widths[i])}${RST}`
    if (i < items.length - 1) labelLine += gapStr
  }
  console.log(labelLine)

  // Sprite lines
  for (let row = 0; row < maxLines; row++) {
    let line = indent
    for (let i = 0; i < items.length; i++) {
      const text = items[i].lines[row] ?? ''
      line += visualPadEnd(text, widths[i])
      if (i < items.length - 1) line += gapStr
    }
    console.log(line)
  }
}

// ─── Section 1: Header ─────────────────────────────────────────────────────────

function renderHeader(): void {
  console.log()
  console.log(`${fg('#5555ff')}${'═'.repeat(SECTION_WIDTH)}${RST}`)
  console.log(`${BOLD}${fg('#00ffff')}  VADERS SPRITESHEET${RST}`)
  console.log(`${DIM}${fg('#aaaaaa')}  Grid: ${STANDARD_WIDTH}x${STANDARD_HEIGHT}  Tick: 33ms (~30Hz)  Sprites: 7-wide braille${RST}`)
  console.log(`${fg('#5555ff')}${'═'.repeat(SECTION_WIDTH)}${RST}`)
}

// ─── Section 2: Logo & Title Art ────────────────────────────────────────────────

function renderLogos(): void {
  section('LOGO & TITLE ART')

  // Unicode logo with gradient
  label('LOGO_ASCII (Unicode 6-line, gradient)')
  const logoLines = LOGO_ASCII.split('\n')
  const gradientColors = interpolateGradient(GRADIENT_PRESETS.vaders, logoLines[0].length)
  for (const line of logoLines) {
    let rendered = '  '
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === ' ') {
        rendered += ' '
      } else {
        const color = gradientColors[i] ?? gradientColors[gradientColors.length - 1]
        rendered += `${fg(color)}${ch}${RST}`
      }
    }
    console.log(rendered)
  }

  console.log()

  // ASCII logo fallback
  label('ASCII_LOGO (4-line fallback)')
  for (const line of ASCII_LOGO.split('\n')) {
    console.log(`  ${fg('#00ffff')}${line}${RST}`)
  }

  console.log()

  // Alien parade
  label('ALIEN_PARADE (decorative)')
  for (const line of ALIEN_PARADE) {
    console.log(`  ${fg('#ffaa00')}${line}${RST}`)
  }
}

// ─── Section 3: Alien Gallery ───────────────────────────────────────────────────

function renderAliens(): void {
  section('ALIEN GALLERY')

  const alienTypes: ClassicAlienType[] = ['squid', 'crab', 'octopus']

  for (const type of alienTypes) {
    const sprite = SPRITES.alien[type] as AnimatedSprite
    const asciiSprite = ASCII_SPRITES.alien[type] as AnimatedSprite
    const gradient = GRADIENT_COLORS.alien[type]
    const registry = ALIEN_REGISTRY[type]

    const gradA = renderGradientLines(sprite.a, gradient)
    const gradB = renderGradientLines(sprite.b, gradient)
    const asciiA = sprite.a.map(l => `${fg(COLORS.alien[type])}${l}${RST}`) as unknown as string[]

    printSpriteRow([
      { lines: gradA, label: `${type} (A)` },
      { lines: gradB, label: `${type} (B)` },
      { lines: asciiSprite.a.map(l => `${fg(COLORS.alien[type])}${l}${RST}`), label: 'ASCII (A)' },
    ])

    label(`  ${registry.points} pts  ${SPRITE_SIZE.alien.width}x${SPRITE_SIZE.alien.height} chars  row: ${type === 'squid' ? '0' : type === 'crab' ? '1-2' : '3-4'}`, '  ')
    console.log()
  }
}

// ─── Section 4: Player Ships ────────────────────────────────────────────────────

function renderPlayers(): void {
  section('PLAYER SHIPS')

  const colorNames: Record<number, string> = { 1: 'cyan', 2: 'orange', 3: 'magenta', 4: 'lime' }
  const items: { lines: string[]; label: string }[] = []

  for (const slot of [1, 2, 3, 4] as const) {
    const gradient = GRADIENT_COLORS.player[slot]
    const gradLines = renderGradientLines(SPRITES.player.a, gradient)
    items.push({
      lines: gradLines,
      label: `P${slot} (${colorNames[slot]})`,
    })
  }

  printSpriteRow(items)

  console.log()
  for (const slot of [1, 2, 3, 4] as const) {
    const color = getPlayerColor(slot as 1 | 2 | 3 | 4)
    label(`  P${slot}: ${color} (${colorNames[slot]})  ${SPRITE_SIZE.player.width}x${SPRITE_SIZE.player.height} chars`, '  ')
  }
}

// ─── Section 5: UFO (Mystery Ship) ─────────────────────────────────────────────

function renderUFO(): void {
  section('UFO (MYSTERY SHIP)')

  const gradient = GRADIENT_COLORS.ufo
  const gradA = renderGradientLines(SPRITES.ufo.a, gradient)
  const gradB = renderGradientLines(SPRITES.ufo.b, gradient)

  printSpriteRow([
    { lines: gradA, label: 'Frame A' },
    { lines: gradB, label: 'Frame B' },
    { lines: ASCII_SPRITES.ufo.a.map(l => `${fg('#ff55ff')}${l}${RST}`), label: 'ASCII (A)' },
  ])

  console.log()
  label(`${SPRITE_SIZE.ufo.width}x${SPRITE_SIZE.ufo.height} chars  50-300 pts (mystery)  color cycles`)
}

// ─── Section 6: Projectiles ─────────────────────────────────────────────────────

function renderProjectiles(): void {
  section('PROJECTILES')

  console.log(`  ${fg(COLORS.bullet.player)}${SPRITES.bullet.player}${RST}  Player bullet (${SPRITES.bullet.player})  ${DIM}${fg('#888888')}white, dy=-1 (up), 1 cell/tick${RST}`)
  console.log(`  ${fg(COLORS.bullet.alien)}${SPRITES.bullet.alien}${RST}  Alien bullet  (${SPRITES.bullet.alien})  ${DIM}${fg('#888888')}red,   dy=+1 (down), 1 cell/tick${RST}`)
  console.log()
  console.log(`  ${DIM}${fg('#888888')}ASCII fallback:  player=${ASCII_SPRITES.bullet.player}  alien=${ASCII_SPRITES.bullet.alien}${RST}`)
}

// ─── Section 7: Barriers ───────────────────────────────────────────────────────

function renderBarriers(): void {
  section('BARRIERS (DAMAGE PROGRESSION)')

  // Unicode barriers
  label('Unicode half-block barriers (health 4 → 0)')
  const unicodeItems: { lines: string[]; label: string }[] = []
  for (const health of [4, 3, 2, 1, 0] as const) {
    const color = health === 0 ? '#333333' : COLORS.barrier[health as 1 | 2 | 3 | 4]
    const lines = (SPRITES.barrier[health] as string[]).map(l => `${fg(color)}${l}${RST}`)
    unicodeItems.push({ lines, label: `HP ${health}` })
  }
  printSpriteRow(unicodeItems)

  console.log()

  // ASCII barriers
  label('ASCII fallback barriers')
  const asciiItems: { lines: string[]; label: string }[] = []
  for (const health of [4, 3, 2, 1, 0] as const) {
    const color = health === 0 ? '#333333' : COLORS.barrier[health as 1 | 2 | 3 | 4]
    const lines = (ASCII_SPRITES.barrier[health] as string[]).map(l => `${fg(color)}${l}${RST}`)
    asciiItems.push({ lines, label: `HP ${health}` })
  }
  printSpriteRow(asciiItems)

  console.log()

  // Barrier shape layout
  label('BARRIER_SHAPE layout (5x2 segments, arch with center gap)')
  const BARRIER_SHAPE = [
    [1, 1, 1, 1, 1],
    [1, 1, 0, 1, 1],
  ]
  for (const row of BARRIER_SHAPE) {
    const rendered = row.map(v => v ? `${fg('#00ff00')}██${RST}` : `${DIM}${fg('#333333')}..${RST}`).join('')
    console.log(`  ${rendered}`)
  }
  label(`Each segment: ${HITBOX.BARRIER_SEGMENT_WIDTH}x${HITBOX.BARRIER_SEGMENT_HEIGHT} chars  Barrier Y: ${LAYOUT.BARRIER_Y}`)
}

// ─── Section 8: Wave Announce Digits ────────────────────────────────────────────

function renderDigits(): void {
  section('WAVE ANNOUNCE DIGITS')

  // Unicode digits 0-9 with gradient
  label('DIGIT_FONT (Unicode, gradient colored)')
  const gradient = interpolateGradient(GRADIENT_PRESETS.vaders, DIGIT_WIDTH)

  // Print digits in two rows (0-4, 5-9)
  for (const range of [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]]) {
    const items: { lines: string[]; label: string }[] = []
    for (const d of range) {
      const glyph = DIGIT_FONT[String(d)]
      const coloredLines = glyph.map(line => {
        let result = ''
        for (let i = 0; i < line.length; i++) {
          const ch = line[i]
          if (ch === ' ') {
            result += ' '
          } else {
            const color = gradient[i] ?? gradient[gradient.length - 1]
            result += `${fg(color)}${ch}${RST}`
          }
        }
        return result
      })
      items.push({ lines: coloredLines, label: String(d) })
    }
    printSpriteRow(items, 2)
    console.log()
  }

  // ASCII fallback digits 0-4
  label('DIGIT_FONT_ASCII (fallback, first 5)')
  const asciiItems: { lines: string[]; label: string }[] = []
  for (let d = 0; d <= 4; d++) {
    const glyph = DIGIT_FONT_ASCII[String(d)]
    const coloredLines = glyph.map(l => `${fg('#00ffff')}${l}${RST}`)
    asciiItems.push({ lines: coloredLines, label: String(d) })
  }
  printSpriteRow(asciiItems, 2)

  console.log()

  // Composed example
  label('composeDigits(42) — composed example')
  const composed = composeDigits(42)
  for (const line of composed.text.split('\n')) {
    let result = '  '
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === ' ') {
        result += ' '
      } else {
        const color = gradient[i % gradient.length]
        result += `${fg(color)}${ch}${RST}`
      }
    }
    console.log(result)
  }
  label(`${composed.width}x${composed.height} chars  DIGIT_WIDTH=${DIGIT_WIDTH}  DIGIT_GAP=${DIGIT_GAP}`)
}

// ─── Section 9: Effect Characters & Animations ─────────────────────────────────

function renderEffects(): void {
  section('EFFECT CHARACTERS & ANIMATIONS')

  // Braille density scale
  label('Braille density scale (BRAILLE_DENSITY, 0-8 dots)')
  let densityLine = '  '
  for (let i = 0; i <= MAX_DENSITY; i++) {
    densityLine += `${fg('#5555ff')}${BRAILLE_DENSITY[i]}${RST} `
  }
  console.log(densityLine)
  let indexLine = '  '
  for (let i = 0; i <= MAX_DENSITY; i++) {
    indexLine += `${DIM}${fg('#666666')}${i} ${RST}`
  }
  console.log(indexLine)

  console.log()

  // Dissolve chars
  label('Dissolve ASCII chars (DISSOLVE_ASCII_CHARS, heavy → light)')
  let dissolveLine = '  '
  for (const ch of DISSOLVE_ASCII_CHARS) {
    const display = ch === ' ' ? '␣' : ch
    dissolveLine += `${fg('#ff8888')}${display}${RST}  `
  }
  console.log(dissolveLine)

  console.log()

  // Spinner frames
  label('Braille spinner frames (BRAILLE_SPINNER_FRAMES, 8 frames)')
  let spinnerLine = '  '
  for (let i = 0; i < BRAILLE_SPINNER_FRAMES.length; i++) {
    spinnerLine += `${fg('#00ffff')}${BRAILLE_SPINNER_FRAMES[i]}${RST}  `
  }
  console.log(spinnerLine)

  label('ASCII spinner frames (ASCII_SPINNER_FRAMES, 4 frames)')
  let asciiSpinnerLine = '  '
  for (const frame of ASCII_SPINNER_FRAMES) {
    asciiSpinnerLine += `${fg('#00ffff')}${frame}${RST}  `
  }
  console.log(asciiSpinnerLine)

  console.log()

  // Confetti chars in colors
  label('Confetti chars (CONFETTI_CHARS) in CONFETTI_COLORS')
  let confettiLine = '  '
  for (let i = 0; i < CONFETTI_CHARS.length; i++) {
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
    confettiLine += `${fg(color)}${CONFETTI_CHARS[i]}${RST}  `
  }
  console.log(confettiLine)

  console.log()

  // Wipe blocks
  label('Wipe blocks (WIPE_BLOCKS)')
  const wipeEntries: [string, string][] = [
    ['full', WIPE_BLOCKS.full],
    ['top', WIPE_BLOCKS.top],
    ['bottom', WIPE_BLOCKS.bottom],
    ['left', WIPE_BLOCKS.left],
    ['right', WIPE_BLOCKS.right],
  ]
  let wipeLine = '  '
  for (const [name, ch] of wipeEntries) {
    wipeLine += `${fg('#ffffff')}${ch}${RST} ${DIM}${fg('#888888')}${name}${RST}   `
  }
  console.log(wipeLine)

  console.log()

  // Half blocks
  label('Half blocks (HALF_BLOCKS)')
  const halfEntries: [string, string][] = [
    ['left', HALF_BLOCKS.left],
    ['right', HALF_BLOCKS.right],
    ['full', HALF_BLOCKS.full],
  ]
  let halfLine = '  '
  for (const [name, ch] of halfEntries) {
    halfLine += `${fg('#ffffff')}${ch}${RST} ${DIM}${fg('#888888')}${name}${RST}   `
  }
  console.log(halfLine)

  console.log()

  // Gradient presets
  label('Gradient presets (GRADIENT_PRESETS)')
  for (const [name, stops] of Object.entries(GRADIENT_PRESETS)) {
    const colors = interpolateGradient(stops, 20)
    let line = `  ${fg('#aaaaaa')}${name.padEnd(10)}${RST} `
    for (const c of colors) {
      line += `${fg(c)}█${RST}`
    }
    line += `  ${DIM}${fg('#666666')}${(stops as readonly string[]).join(' → ')}${RST}`
    console.log(line)
  }
}

// ─── Section 10: Color Palette ──────────────────────────────────────────────────

function renderColorPalette(): void {
  section('COLOR PALETTE')

  // Alien colors
  label('Alien colors')
  for (const type of ['squid', 'crab', 'octopus'] as const) {
    const flat = COLORS.alien[type]
    const grad = GRADIENT_COLORS.alien[type]
    console.log(`  ${fg(flat)}████${RST}  ${DIM}${fg('#aaaaaa')}${flat}${RST}  ${fg('#cccccc')}${type}${RST}   ${DIM}${fg('#888888')}gradient:${RST} ${fg(grad.bright)}██${RST}${fg(grad.dark)}██${RST} ${DIM}${fg('#666666')}${grad.bright} → ${grad.dark}${RST}`)
  }

  console.log()

  // Player colors
  label('Player slot colors')
  for (const slot of [1, 2, 3, 4] as const) {
    const flat = COLORS.player[slot]
    const grad = GRADIENT_COLORS.player[slot]
    const name = slot === 1 ? 'cyan' : slot === 2 ? 'orange' : slot === 3 ? 'magenta' : 'lime'
    console.log(`  ${fg(flat)}████${RST}  ${DIM}${fg('#aaaaaa')}${flat}${RST}  ${fg('#cccccc')}P${slot} ${name}${RST}   ${DIM}${fg('#888888')}gradient:${RST} ${fg(grad.bright)}██${RST}${fg(grad.dark)}██${RST} ${DIM}${fg('#666666')}${grad.bright} → ${grad.dark}${RST}`)
  }

  console.log()

  // Barrier health colors
  label('Barrier health colors')
  for (const health of [4, 3, 2, 1] as const) {
    const color = COLORS.barrier[health]
    const state = health === 4 ? 'full' : health === 3 ? 'damaged' : health === 2 ? 'critical' : 'destroyed'
    swatch(color, `HP ${health} (${state})`)
  }

  console.log()

  // Bullet colors
  label('Bullet colors')
  swatch(COLORS.bullet.player, 'player bullet')
  swatch(COLORS.bullet.alien, 'alien bullet')

  console.log()

  // UI colors
  label('UI colors')
  for (const [name, color] of Object.entries(COLORS.ui)) {
    swatch(color, name)
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────────

renderHeader()
renderLogos()
renderAliens()
renderPlayers()
renderUFO()
renderProjectiles()
renderBarriers()
renderDigits()
renderEffects()
renderColorPalette()

console.log()
console.log(`${fg('#5555ff')}${'═'.repeat(SECTION_WIDTH)}${RST}`)
console.log(`${DIM}${fg('#888888')}  End of spritesheet. Pipe to ${fg('#00ffff')}less -R${fg('#888888')} for scrolling.${RST}`)
console.log()

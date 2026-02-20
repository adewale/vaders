// client/src/digitFont.ts
// Block-character digit font for wave announce screen.
// Each glyph is 6 lines tall and 9 chars wide, using the same
// box-drawing palette as LOGO_ASCII in sprites.ts.

export const DIGIT_HEIGHT = 6
export const DIGIT_WIDTH = 9
export const DIGIT_GAP = 2

/** Block-character digit glyphs (0-9). Each is 6 lines × 9 chars. */
export const DIGIT_FONT: Record<string, string[]> = {
  '0': [
    ' ██████  ',
    '██╔══██╗ ',
    '██║  ██║ ',
    '██║  ██║ ',
    '╚██████║ ',
    ' ╚═════╝ ',
  ],
  '1': [
    '   ██╗   ',
    '  ███║   ',
    '   ██║   ',
    '   ██║   ',
    '   ██║   ',
    '   ╚═╝   ',
  ],
  '2': [
    '██████╗  ',
    '╚════██╗ ',
    ' █████╔╝ ',
    '██╔═══╝  ',
    '███████╗ ',
    '╚══════╝ ',
  ],
  '3': [
    '██████╗  ',
    '╚════██╗ ',
    ' █████╔╝ ',
    ' ╚═══██╗ ',
    '██████╔╝ ',
    '╚═════╝  ',
  ],
  '4': [
    '██╗ ██╗  ',
    '██║ ██║  ',
    '███████╗ ',
    '╚════██║ ',
    '     ██║ ',
    '     ╚═╝ ',
  ],
  '5': [
    '███████╗ ',
    '██╔════╝ ',
    '██████╗  ',
    '╚════██╗ ',
    '██████╔╝ ',
    '╚═════╝  ',
  ],
  '6': [
    ' ██████╗ ',
    '██╔════╝ ',
    '██████╗  ',
    '██╔══██╗ ',
    '╚██████╔╝',
    ' ╚═════╝ ',
  ],
  '7': [
    '███████╗ ',
    '╚════██║ ',
    '    ██╔╝ ',
    '   ██╔╝  ',
    '   ██║   ',
    '   ╚═╝   ',
  ],
  '8': [
    ' █████╗  ',
    '██╔══██╗ ',
    '╚█████╔╝ ',
    '██╔══██╗ ',
    '╚█████╔╝ ',
    ' ╚════╝  ',
  ],
  '9': [
    ' ██████╗ ',
    '██╔══██║ ',
    '╚██████║ ',
    ' ╚════██║',
    ' █████╔╝ ',
    ' ╚════╝  ',
  ],
}

/** ASCII fallback digit glyphs for non-Unicode terminals. */
export const DIGIT_FONT_ASCII: Record<string, string[]> = {
  '0': [
    ' +----+  ',
    '|  /\\  | ',
    '| /  \\ | ',
    '| \\  / | ',
    '|  \\/  | ',
    ' +----+  ',
  ],
  '1': [
    '   /|    ',
    '  / |    ',
    '    |    ',
    '    |    ',
    '    |    ',
    ' -------+',
  ],
  '2': [
    ' +----+  ',
    '      |  ',
    ' +----+  ',
    '|        ',
    '|------+ ',
    ' +----+  ',
  ],
  '3': [
    ' +----+  ',
    '      |  ',
    ' +----+  ',
    '      |  ',
    ' +----+  ',
    ' +----+  ',
  ],
  '4': [
    '|    |   ',
    '|    |   ',
    '+-------+',
    '     |   ',
    '     |   ',
    '     +   ',
  ],
  '5': [
    '+-------+',
    '|        ',
    '+------+ ',
    '       | ',
    '+------+ ',
    '+------+ ',
  ],
  '6': [
    ' +------+',
    '|        ',
    '+------+ ',
    '|      | ',
    '+------+ ',
    ' +-----+ ',
  ],
  '7': [
    '+-------+',
    '      |  ',
    '     |   ',
    '    |    ',
    '    |    ',
    '    +    ',
  ],
  '8': [
    ' +-----+ ',
    '|       |',
    ' +-----+ ',
    '|       |',
    ' +-----+ ',
    ' +-----+ ',
  ],
  '9': [
    ' +------+',
    '|      | ',
    '+------+ ',
    '       | ',
    ' +-----+ ',
    ' +-----+ ',
  ],
}

/**
 * Compose a multi-digit number into a single multiline string.
 * Joins digit glyphs side-by-side with DIGIT_GAP spaces between them.
 */
export function composeDigits(
  n: number,
  useAscii: boolean = false,
): { text: string; width: number; height: number } {
  const font = useAscii ? DIGIT_FONT_ASCII : DIGIT_FONT
  if (!Number.isFinite(n) || n < 0) n = 0
  const digits = String(Math.max(0, Math.floor(n))).split('')
  const glyphs = digits.map(d => font[d] ?? font['0'])
  const width = digits.length * DIGIT_WIDTH + (digits.length - 1) * DIGIT_GAP
  const lines: string[] = []
  for (let row = 0; row < DIGIT_HEIGHT; row++) {
    lines.push(glyphs.map(g => g[row]).join(' '.repeat(DIGIT_GAP)))
  }
  return { text: lines.join('\n'), width, height: DIGIT_HEIGHT }
}

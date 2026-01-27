// client/src/animation/borders.ts
// Box-drawing border system for TUI elements
//
// Features:
// - Multiple border styles: single, double, rounded, heavy
// - Title integration with decorative brackets
// - Color customization
// - ASCII fallback for limited terminals

// ─── Border Character Sets ───────────────────────────────────────────────────

/**
 * Border style character set
 */
export interface BorderCharset {
  /** Top-left corner */
  topLeft: string
  /** Top-right corner */
  topRight: string
  /** Bottom-left corner */
  bottomLeft: string
  /** Bottom-right corner */
  bottomRight: string
  /** Horizontal line */
  horizontal: string
  /** Vertical line */
  vertical: string
  /** Left title bracket */
  titleLeft: string
  /** Right title bracket */
  titleRight: string
}

/**
 * Single-line border style (standard)
 */
export const BORDER_SINGLE: BorderCharset = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
  titleLeft: '╡',
  titleRight: '╞',
}

/**
 * Double-line border style (prominent)
 */
export const BORDER_DOUBLE: BorderCharset = {
  topLeft: '╔',
  topRight: '╗',
  bottomLeft: '╚',
  bottomRight: '╝',
  horizontal: '═',
  vertical: '║',
  titleLeft: '╡',
  titleRight: '╞',
}

/**
 * Rounded corner border style (soft/modern)
 */
export const BORDER_ROUNDED: BorderCharset = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
  titleLeft: '┤',
  titleRight: '├',
}

/**
 * Heavy/thick border style (bold)
 */
export const BORDER_HEAVY: BorderCharset = {
  topLeft: '┏',
  topRight: '┓',
  bottomLeft: '┗',
  bottomRight: '┛',
  horizontal: '━',
  vertical: '┃',
  titleLeft: '┫',
  titleRight: '┣',
}

/**
 * Dashed border style (subtle)
 */
export const BORDER_DASHED: BorderCharset = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '┄',
  vertical: '┆',
  titleLeft: '┤',
  titleRight: '├',
}

/**
 * ASCII fallback border style
 */
export const BORDER_ASCII: BorderCharset = {
  topLeft: '+',
  topRight: '+',
  bottomLeft: '+',
  bottomRight: '+',
  horizontal: '-',
  vertical: '|',
  titleLeft: '[',
  titleRight: ']',
}

/**
 * Named border styles
 */
export type BorderStyleName = 'single' | 'double' | 'rounded' | 'heavy' | 'dashed' | 'ascii'

/**
 * Map of border style names to character sets
 */
export const BORDER_STYLES: Record<BorderStyleName, BorderCharset> = {
  single: BORDER_SINGLE,
  double: BORDER_DOUBLE,
  rounded: BORDER_ROUNDED,
  heavy: BORDER_HEAVY,
  dashed: BORDER_DASHED,
  ascii: BORDER_ASCII,
}

// ─── Border Configuration ────────────────────────────────────────────────────

/**
 * Configuration for creating a bordered box
 */
export interface BorderConfig {
  /** Width of the box (including borders) */
  width: number
  /** Height of the box (including borders) */
  height: number
  /** Border style to use */
  style: BorderStyleName | BorderCharset
  /** Optional title to display in top border */
  title?: string
  /** Title alignment within the border */
  titleAlign?: 'left' | 'center' | 'right'
  /** Padding around title text */
  titlePadding?: number
  /** Border color (hex) */
  borderColor?: string
  /** Title color (hex) - defaults to borderColor */
  titleColor?: string
  /** Fill character for interior (default: space) */
  fillChar?: string
  /** Fill color (hex) */
  fillColor?: string
}

/**
 * Default border configuration
 */
export const DEFAULT_BORDER_CONFIG: Required<Omit<BorderConfig, 'title'>> & { title?: string } = {
  width: 40,
  height: 10,
  style: 'single',
  titleAlign: 'center',
  titlePadding: 1,
  borderColor: '#5555ff',
  titleColor: '#ffffff',
  fillChar: ' ',
  fillColor: '#000000',
}

// ─── Border Rendering ────────────────────────────────────────────────────────

/**
 * Rendered border cell
 */
export interface BorderCell {
  /** X position */
  x: number
  /** Y position */
  y: number
  /** Character to render */
  char: string
  /** Color (hex) */
  color: string
  /** Whether this is part of the title */
  isTitle: boolean
}

/**
 * Rendered border result
 */
export interface RenderedBorder {
  /** All cells making up the border */
  cells: BorderCell[]
  /** Inner content area bounds */
  innerBounds: {
    x: number
    y: number
    width: number
    height: number
  }
  /** Top border line as string (for simple rendering) */
  topLine: string
  /** Bottom border line as string */
  bottomLine: string
  /** Left border character */
  leftChar: string
  /** Right border character */
  rightChar: string
}

/**
 * Get the border charset from a style name or charset
 */
function getCharset(style: BorderStyleName | BorderCharset): BorderCharset {
  if (typeof style === 'string') {
    return BORDER_STYLES[style]
  }
  return style
}

/**
 * Create the top border line with optional title
 */
function createTopLine(
  charset: BorderCharset,
  width: number,
  title?: string,
  titleAlign: 'left' | 'center' | 'right' = 'center',
  titlePadding: number = 1
): { line: string; titleStart: number; titleEnd: number } {
  const innerWidth = width - 2 // Excluding corners

  if (!title || title.length === 0) {
    return {
      line: charset.topLeft + charset.horizontal.repeat(innerWidth) + charset.topRight,
      titleStart: -1,
      titleEnd: -1,
    }
  }

  // Calculate title with brackets and padding
  const paddedTitle = ' '.repeat(titlePadding) + title + ' '.repeat(titlePadding)
  const titleWithBrackets = charset.titleLeft + paddedTitle + charset.titleRight
  const titleLen = titleWithBrackets.length

  // Ensure title fits
  if (titleLen > innerWidth - 2) {
    // Truncate title if too long
    const maxTitleLen = innerWidth - 4 - titlePadding * 2
    const truncatedTitle = title.slice(0, maxTitleLen)
    return createTopLine(charset, width, truncatedTitle, titleAlign, titlePadding)
  }

  // Calculate position based on alignment
  let leftPadding: number
  const remainingWidth = innerWidth - titleLen

  switch (titleAlign) {
    case 'left':
      leftPadding = 1
      break
    case 'right':
      leftPadding = remainingWidth - 1
      break
    case 'center':
    default:
      leftPadding = Math.floor(remainingWidth / 2)
      break
  }

  const rightPadding = remainingWidth - leftPadding
  const line =
    charset.topLeft +
    charset.horizontal.repeat(leftPadding) +
    titleWithBrackets +
    charset.horizontal.repeat(rightPadding) +
    charset.topRight

  return {
    line,
    titleStart: 1 + leftPadding + 1, // After corner + left padding + bracket
    titleEnd: 1 + leftPadding + titleLen - 1, // Before closing bracket
  }
}

/**
 * Create the bottom border line
 */
function createBottomLine(charset: BorderCharset, width: number): string {
  const innerWidth = width - 2
  return charset.bottomLeft + charset.horizontal.repeat(innerWidth) + charset.bottomRight
}

/**
 * Render a bordered box.
 *
 * Returns structured data for rendering the border including:
 * - Individual cells for position-based rendering
 * - Pre-composed strings for line-based rendering
 * - Inner bounds for content placement
 *
 * Usage:
 * ```typescript
 * const border = renderBorder({
 *   width: 60,
 *   height: 20,
 *   style: 'double',
 *   title: 'GAME OVER',
 *   borderColor: '#ff5555',
 * })
 *
 * // Use border.topLine, border.bottomLine for string rendering
 * // Or use border.cells for position-based rendering
 * // Place content within border.innerBounds
 * ```
 */
export function renderBorder(config: BorderConfig): RenderedBorder {
  const opts = { ...DEFAULT_BORDER_CONFIG, ...config }
  const charset = getCharset(opts.style)

  const { line: topLine, titleStart, titleEnd } = createTopLine(
    charset,
    opts.width,
    opts.title,
    opts.titleAlign,
    opts.titlePadding
  )
  const bottomLine = createBottomLine(charset, opts.width)

  const cells: BorderCell[] = []
  const titleColor = opts.titleColor ?? opts.borderColor

  // Top border cells
  for (let x = 0; x < opts.width; x++) {
    const char = topLine[x]
    const isTitle = opts.title && x >= titleStart && x < titleEnd
    cells.push({
      x,
      y: 0,
      char,
      color: isTitle ? titleColor : opts.borderColor,
      isTitle: Boolean(isTitle),
    })
  }

  // Side borders
  for (let y = 1; y < opts.height - 1; y++) {
    // Left border
    cells.push({
      x: 0,
      y,
      char: charset.vertical,
      color: opts.borderColor,
      isTitle: false,
    })
    // Right border
    cells.push({
      x: opts.width - 1,
      y,
      char: charset.vertical,
      color: opts.borderColor,
      isTitle: false,
    })
  }

  // Bottom border cells
  for (let x = 0; x < opts.width; x++) {
    cells.push({
      x,
      y: opts.height - 1,
      char: bottomLine[x],
      color: opts.borderColor,
      isTitle: false,
    })
  }

  return {
    cells,
    innerBounds: {
      x: 1,
      y: 1,
      width: opts.width - 2,
      height: opts.height - 2,
    },
    topLine,
    bottomLine,
    leftChar: charset.vertical,
    rightChar: charset.vertical,
  }
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Create a simple bordered text box (returns string array)
 */
export function createBorderedBox(
  content: string[],
  style: BorderStyleName = 'single',
  title?: string,
  minWidth?: number
): string[] {
  const charset = getCharset(style)
  const contentWidth = Math.max(
    minWidth ?? 0,
    ...content.map((line) => line.length),
    (title?.length ?? 0) + 4
  )
  const width = contentWidth + 2 // Add border width

  const { line: topLine } = createTopLine(charset, width, title)
  const bottomLine = createBottomLine(charset, width)

  const lines: string[] = [topLine]

  for (const line of content) {
    const paddedLine = line.padEnd(contentWidth)
    lines.push(charset.vertical + paddedLine + charset.vertical)
  }

  lines.push(bottomLine)

  return lines
}

/**
 * Wrap text in a border style (single line)
 */
export function borderWrap(
  text: string,
  style: BorderStyleName = 'single',
  padding: number = 1
): string {
  const charset = getCharset(style)
  const pad = ' '.repeat(padding)
  return charset.vertical + pad + text + pad + charset.vertical
}

/**
 * Create a horizontal divider line
 */
export function createDivider(
  width: number,
  style: BorderStyleName = 'single',
  withConnectors: boolean = false
): string {
  const charset = getCharset(style)
  if (withConnectors) {
    // T-junction connectors for boxes that divide
    const leftT = style === 'double' ? '╠' : style === 'heavy' ? '┣' : '├'
    const rightT = style === 'double' ? '╣' : style === 'heavy' ? '┫' : '┤'
    return leftT + charset.horizontal.repeat(width - 2) + rightT
  }
  return charset.horizontal.repeat(width)
}

/**
 * Create a title bar (top line only with title)
 */
export function createTitleBar(
  title: string,
  width: number,
  style: BorderStyleName = 'single',
  align: 'left' | 'center' | 'right' = 'center'
): string {
  const charset = getCharset(style)
  const { line } = createTopLine(charset, width, title, align)
  return line
}

// ─── Preset Border Boxes ─────────────────────────────────────────────────────

/**
 * Create a game UI panel border
 */
export function createGamePanel(
  width: number,
  height: number,
  title?: string
): RenderedBorder {
  return renderBorder({
    width,
    height,
    style: 'single',
    title,
    borderColor: '#5555ff',
    titleColor: '#00ffff',
  })
}

/**
 * Create a dialog/modal border
 */
export function createDialogBorder(
  width: number,
  height: number,
  title?: string
): RenderedBorder {
  return renderBorder({
    width,
    height,
    style: 'double',
    title,
    borderColor: '#ffffff',
    titleColor: '#ffff00',
  })
}

/**
 * Create an error/warning border
 */
export function createAlertBorder(
  width: number,
  height: number,
  title?: string
): RenderedBorder {
  return renderBorder({
    width,
    height,
    style: 'heavy',
    title,
    borderColor: '#ff5555',
    titleColor: '#ffffff',
  })
}

/**
 * Create a success/info border
 */
export function createSuccessBorder(
  width: number,
  height: number,
  title?: string
): RenderedBorder {
  return renderBorder({
    width,
    height,
    style: 'rounded',
    title,
    borderColor: '#55ff55',
    titleColor: '#ffffff',
  })
}

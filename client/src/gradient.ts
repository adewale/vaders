// client/src/gradient.ts
// Pure gradient color interpolation — no terminal/rendering dependencies
//
// Lessons from gradient-string:
//   - Keep color math separate from rendering (separation of concerns)
//   - Use index counters, not .shift() (O(1) vs O(n))
//   - Column-aligned multiline: same color array per line
//   - Skip whitespace only in single-line mode

// ─── Types ──────────────────────────────────────────────────────────────────

interface RGB {
  r: number
  g: number
  b: number
}

// ─── Color Math ─────────────────────────────────────────────────────────────

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return (
    '#' +
    clamp(r).toString(16).padStart(2, '0') +
    clamp(g).toString(16).padStart(2, '0') +
    clamp(b).toString(16).padStart(2, '0')
  )
}

/** A character with its gradient color */
export interface ColoredChar {
  char: string
  color: string
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate an array of interpolated hex colors across multiple color stops.
 *
 * @param colors - Array of hex color stops (e.g., ['#ff0000', '#0000ff'])
 * @param count  - Number of colors to generate
 * @returns Array of hex strings, length === count
 */
export function interpolateGradient(colors: readonly string[], count: number): string[] {
  if (count <= 0) return []
  if (colors.length === 0) return Array(count).fill('#000000')
  if (colors.length === 1 || count === 1) return Array(count).fill(colors[0])

  const result: string[] = []
  const stops = colors.map(hexToRgb)

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1)
    // Map t to segment between two stops
    const segment = t * (stops.length - 1)
    const idx = Math.min(Math.floor(segment), stops.length - 2)
    const frac = segment - idx

    const c1 = stops[idx]
    const c2 = stops[idx + 1]
    result.push(
      rgbToHex(
        c1.r + (c2.r - c1.r) * frac,
        c1.g + (c2.g - c1.g) * frac,
        c1.b + (c2.b - c1.b) * frac,
      )
    )
  }

  return result
}

/**
 * Apply a gradient across multiline text (e.g., ASCII art).
 *
 * Lesson from gradient-string: each line gets the same color array,
 * so the same column position has the same color across all rows.
 * This creates a vertical-stripe effect essential for ASCII art.
 *
 * @param text   - Multiline string (lines separated by \n)
 * @param colors - Array of hex color stops
 * @returns Array of lines, each line is an array of {char, color}
 */
export function gradientMultiline(text: string, colors: readonly string[]): ColoredChar[][] {
  const lines = text.split('\n')
  const maxWidth = Math.max(...lines.map(l => l.length), 1)
  const palette = interpolateGradient(colors, maxWidth)

  return lines.map(line => {
    const chars: ColoredChar[] = []
    for (let i = 0; i < line.length; i++) {
      chars.push({ char: line[i], color: palette[i] })
    }
    return chars
  })
}

// ─── Presets ────────────────────────────────────────────────────────────────
// Inspired by gradient-string's presets, tuned for terminal aesthetics.

export const GRADIENT_PRESETS = {
  /** Cyan → Magenta — the game's signature arcade palette */
  vaders:    ['#00ffff', '#ff55ff'],
  /** Warm arcade CRT glow */
  retro:     ['#3f51b1', '#5a55ae', '#8f6aae', '#cc6b8e', '#f18271', '#f7c978'],
  /** Classic full-spectrum rainbow */
  rainbow:   ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#8800ff'],
  /** Victory screen flash */
  victory:   ['#ffff00', '#ffffff', '#00ffff'],
  /** Danger / game over */
  danger:    ['#ff0000', '#ff8800', '#ffff00'],
  /** Cool ocean tones */
  ocean:     ['#0077ff', '#00ffff', '#00ff88'],
} as const

// ─── Wave Gradient Selection ────────────────────────────────────────────────

/**
 * Pick a gradient preset based on wave number.
 * Early waves are cool/calm, later waves escalate to hot/dangerous.
 */
export function getWaveGradient(waveNumber: number): readonly string[] {
  if (waveNumber <= 2) return GRADIENT_PRESETS.ocean
  if (waveNumber <= 4) return GRADIENT_PRESETS.vaders
  if (waveNumber <= 6) return GRADIENT_PRESETS.retro
  if (waveNumber <= 8) return GRADIENT_PRESETS.rainbow
  return GRADIENT_PRESETS.danger
}

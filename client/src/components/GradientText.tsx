// client/src/components/GradientText.tsx
// Renders text with per-character gradient coloring.
//
// For multiline text (ASCII art), columns are color-aligned across all rows
// so the gradient sweeps left-to-right consistently.
//
// Gate behind supportsRichColor() — falls back to flat color on limited terminals.

import { gradientMultiline } from '../gradient'

interface GradientTextProps {
  /** The text to render (can be multiline) */
  text: string
  /** Array of hex color stops for the gradient */
  colors: readonly string[]
  /** Flat fallback color for terminals without truecolor */
  fallbackColor?: string
  /** Whether the terminal supports rich (truecolor) rendering */
  richColor?: boolean
}

/**
 * Renders text with a horizontal gradient applied per-character.
 *
 * When richColor is false (or on limited terminals), renders with
 * a single flat fallbackColor instead — no per-character spans.
 */
export function GradientText({
  text,
  colors,
  fallbackColor = '#00ffff',
  richColor = true,
}: GradientTextProps) {
  // Fast path: flat color for terminals that can't render truecolor
  if (!richColor || colors.length < 2) {
    return <text fg={colors[0] ?? fallbackColor}>{text}</text>
  }

  const lines = gradientMultiline(text, colors)

  return (
    <box flexDirection="column">
      {lines.map((line, lineIdx) => (
        <text key={`line-${lineIdx}`}>
          {line.map((ch, charIdx) => (
            <span fg={ch.color} key={`${lineIdx}-${charIdx}`}>{ch.char}</span>
          ))}
        </text>
      ))}
    </box>
  )
}

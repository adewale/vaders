// client/src/components/WaveAnnounce.tsx
// Dramatic wave announcement: gradient digits + animated braille border.
//
// Three degradation tiers:
// - Truecolor + Unicode: gradient digits, animated braille border + ripple
// - 256-color + Unicode: flat color digits, animated braille border + ripple
// - ASCII-only: plain ASCII digit font, no animation

import { useState, useEffect, useMemo } from 'react'
import { GradientText } from './GradientText'
import { composeDigits } from '../digitFont'
import { getWaveGradient } from '../gradient'
import { WaveBorderAnimation, type BorderCell } from '../animation/waveBorder'
import { supportsRichColor, supportsBraille, getTerminalCapabilities, convertColorForTerminal } from '../terminal'

const ANIMATION_INTERVAL_MS = 70

interface WaveAnnounceProps {
  waveNumber: number
  terminalWidth: number
  terminalHeight: number
}

export function WaveAnnounce({ waveNumber, terminalWidth, terminalHeight }: WaveAnnounceProps) {
  const caps = getTerminalCapabilities()
  const richColor = supportsRichColor(caps)
  const braille = supportsBraille(caps)
  const useAscii = !caps.supportsUnicode

  // Compose digit art
  const { text: digitText, width: digitWidth, height: digitHeight } = useMemo(
    () => composeDigits(waveNumber, useAscii),
    [waveNumber, useAscii],
  )

  // Select gradient
  const gradientColors = useMemo(
    () => getWaveGradient(waveNumber),
    [waveNumber],
  )

  // Box dimensions — fill most of the screen for dramatic effect
  const boxWidth = Math.max(digitWidth + 10, Math.floor(terminalWidth * 0.6))
  const boxHeight = Math.max(digitHeight + 12, Math.floor(terminalHeight * 0.75))
  const boxLeft = Math.max(0, Math.floor((terminalWidth - boxWidth) / 2))
  const boxTop = Math.max(0, Math.floor((terminalHeight - boxHeight) / 2))
  const padding = Math.floor((boxWidth - digitWidth) / 2) - 1

  // Content placement within the box (vertically centered)
  const contentTop = Math.floor((boxHeight - digitHeight - 2) / 2) // -2 for WAVE label + gap
  const labelTop = boxTop + contentTop
  const digitTop = boxTop + contentTop + 2
  const digitLeft = Math.floor((terminalWidth - digitWidth) / 2)

  // Build animation config (shared between initial frame and effect)
  const animConfig = useMemo(() => ({
    boxWidth,
    boxHeight,
    waveNumber,
    contentWidth: digitWidth,
    contentHeight: digitHeight + 2, // include "WAVE" label
    innerPadding: padding,
  }), [boxWidth, boxHeight, waveNumber, digitWidth, digitHeight, padding])

  // Compute first frame synchronously so the initial render isn't empty
  const initialCells = useMemo(() => {
    if (!braille) return []
    const anim = new WaveBorderAnimation(animConfig)
    anim.update()
    return anim.getCells()
  }, [braille, animConfig])

  // Animation state — seeded with the first frame to avoid flash
  const [borderCells, setBorderCells] = useState<BorderCell[]>(initialCells)

  useEffect(() => {
    // Sync initial cells when config changes (useMemo runs before useEffect)
    setBorderCells(initialCells)
  }, [initialCells])

  useEffect(() => {
    if (!braille) return

    const anim = new WaveBorderAnimation(animConfig)
    // Skip ahead past frame 0 since initialCells already rendered it
    anim.update()

    const id = setInterval(() => {
      anim.update()
      setBorderCells(anim.getCells())
    }, ANIMATION_INTERVAL_MS)

    return () => clearInterval(id)
  }, [braille, animConfig])

  // ASCII-only fallback: simple centered text
  if (useAscii) {
    return (
      <box width={terminalWidth} height={terminalHeight} justifyContent="center" alignItems="center" flexDirection="column">
        <text fg="yellow"><b>WAVE</b></text>
        <box height={1} />
        <text fg="yellow"><b>{digitText}</b></text>
      </box>
    )
  }

  return (
    <box width={terminalWidth} height={terminalHeight}>
      {/* "WAVE" label */}
      <text
        position="absolute"
        top={labelTop}
        left={Math.floor((terminalWidth - 4) / 2)}
        fg={richColor ? gradientColors[0] : convertColorForTerminal('#ffff00', caps)}
      >
        <b>WAVE</b>
      </text>

      {/* Digit art with gradient */}
      <box position="absolute" top={digitTop} left={digitLeft}>
        <GradientText
          text={digitText}
          colors={gradientColors}
          fallbackColor="#ffff00"
          richColor={richColor}
        />
      </box>

      {/* Braille border + ripple cells */}
      {braille && borderCells.map((cell, i) => (
        <text
          key={`${cell.x}-${cell.y}`}
          position="absolute"
          top={boxTop + cell.y}
          left={boxLeft + cell.x}
          fg={convertColorForTerminal(cell.color, caps)}
        >
          {cell.char}
        </text>
      ))}
    </box>
  )
}

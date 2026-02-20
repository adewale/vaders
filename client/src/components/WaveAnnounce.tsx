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

  // Box dimensions
  const padding = 4
  const boxWidth = digitWidth + padding * 2 + 2
  const boxHeight = digitHeight + padding * 2 + 4 // +4 for "WAVE" label + spacing + border
  const boxLeft = Math.max(0, Math.floor((terminalWidth - boxWidth) / 2))
  const boxTop = Math.max(0, Math.floor((terminalHeight - boxHeight) / 2))

  // Content placement within the box
  const labelTop = boxTop + 2
  const digitTop = boxTop + 4
  const digitLeft = Math.floor((terminalWidth - digitWidth) / 2)

  // Animation state
  const [borderCells, setBorderCells] = useState<BorderCell[]>([])

  useEffect(() => {
    if (!braille) return

    const anim = new WaveBorderAnimation({
      boxWidth,
      boxHeight,
      waveNumber,
      contentWidth: digitWidth,
      contentHeight: digitHeight + 2, // include "WAVE" label
      innerPadding: padding,
    })

    // Render first frame immediately to avoid a blank-border flash
    anim.update()
    setBorderCells(anim.getCells())

    const id = setInterval(() => {
      anim.update()
      setBorderCells(anim.getCells())
    }, ANIMATION_INTERVAL_MS)

    return () => clearInterval(id)
  }, [waveNumber, braille, boxWidth, boxHeight, digitWidth, digitHeight])

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

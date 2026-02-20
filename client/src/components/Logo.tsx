// client/src/components/Logo.tsx
// Logo component with ASCII art and alien parade.
// Uses gradient text on truecolor terminals, flat cyan fallback otherwise.

import { useState, useEffect } from 'react'
import { LOGO_ASCII, COLORS, getSprites } from '../sprites'
import { GRADIENT_PRESETS } from '../gradient'
import { GradientText } from './GradientText'
import { supportsRichColor, supportsBraille, getTerminalCapabilities } from '../terminal'

export function Logo() {
  const richColor = supportsRichColor()
  const caps = getTerminalCapabilities()
  const braille = supportsBraille(caps)
  const sprites = getSprites()

  const [frame, setFrame] = useState<'a' | 'b'>('a')

  useEffect(() => {
    const id = setInterval(() => {
      setFrame(f => f === 'a' ? 'b' : 'a')
    }, 500)
    return () => clearInterval(id)
  }, [])

  // Braille: use first line of actual game sprites (7 chars wide)
  // ASCII: mirror chars on alternate frame for wiggle effect
  const squid = braille ? sprites.alien.squid[frame][0] : (frame === 'a' ? '╔═╗' : '╗═╔')
  const crab = braille ? sprites.alien.crab[frame][0] : (frame === 'a' ? '/°\\' : '\\°/')
  const octopus = braille ? sprites.alien.octopus[frame][0] : (frame === 'a' ? '{ö}' : '}ö{')
  const pad = braille ? '   ' : '        '

  return (
    <box flexDirection="column" alignItems="center">
      <GradientText
        text={LOGO_ASCII}
        colors={GRADIENT_PRESETS.vaders}
        fallbackColor={COLORS.ui.title}
        richColor={richColor}
      />
      <box height={1} />
      <text fg={COLORS.ui.dim}>
        <span fg={COLORS.alien.squid}>{squid}</span>{' '}
        <span fg={COLORS.alien.crab}>{crab}</span>{' '}
        <span fg={COLORS.alien.octopus}>{octopus}</span>
        {pad}S P A C E   I N V A D E R S{pad}
        <span fg={COLORS.alien.squid}>{squid}</span>{' '}
        <span fg={COLORS.alien.crab}>{crab}</span>{' '}
        <span fg={COLORS.alien.octopus}>{octopus}</span>
      </text>
    </box>
  )
}

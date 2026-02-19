// client/src/components/Logo.tsx
// Logo component with ASCII art and alien parade.
// Uses gradient text on truecolor terminals, flat cyan fallback otherwise.

import { LOGO_ASCII, COLORS } from '../sprites'
import { GRADIENT_PRESETS } from '../gradient'
import { GradientText } from './GradientText'
import { supportsRichColor } from '../terminal'

export function Logo() {
  const richColor = supportsRichColor()
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
        <span fg={COLORS.alien.squid}>{'╔═╗'}</span>{' '}
        <span fg={COLORS.alien.crab}>{'/°\\'}</span>{' '}
        <span fg={COLORS.alien.octopus}>{'{ö}'}</span>
        {'        '}S P A C E   I N V A D E R S{'        '}
        <span fg={COLORS.alien.squid}>{'╔═╗'}</span>{' '}
        <span fg={COLORS.alien.crab}>{'/°\\'}</span>{' '}
        <span fg={COLORS.alien.octopus}>{'{ö}'}</span>
      </text>
    </box>
  )
}

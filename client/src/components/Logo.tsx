// client/src/components/Logo.tsx
// Logo component with ASCII art and alien parade

import { LOGO_ASCII, COLORS } from '../sprites'

export function Logo() {
  return (
    <box flexDirection="column" alignItems="center">
      <text fg={COLORS.ui.title}>{LOGO_ASCII}</text>
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

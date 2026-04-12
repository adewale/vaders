// web/src/renderer/colorSchemes.ts
// Selectable color palettes for the web renderer. The default scheme reuses
// client-core's GRADIENT_COLORS for exact parity with the TUI client.

import { GRADIENT_COLORS } from '../../../client-core/src/sprites/colors'

export type ColorScheme = 'default' | 'neon' | 'retro' | 'phosphor'

export interface GradientPair {
  bright: string
  dark: string
}

export interface SchemeOverride {
  aliens: {
    squid: GradientPair
    crab: GradientPair
    octopus: GradientPair
  }
  player: {
    1: GradientPair
    2: GradientPair
    3: GradientPair
    4: GradientPair
  }
}

const DEFAULT_SCHEME: SchemeOverride = {
  aliens: {
    squid: { ...GRADIENT_COLORS.alien.squid },
    crab: { ...GRADIENT_COLORS.alien.crab },
    octopus: { ...GRADIENT_COLORS.alien.octopus },
  },
  player: {
    1: { ...GRADIENT_COLORS.player[1] },
    2: { ...GRADIENT_COLORS.player[2] },
    3: { ...GRADIENT_COLORS.player[3] },
    4: { ...GRADIENT_COLORS.player[4] },
  },
}

const NEON_SCHEME: SchemeOverride = {
  aliens: {
    squid: { bright: '#ff00ff', dark: '#880088' }, // hot magenta
    crab: { bright: '#ffff00', dark: '#886600' }, // pure yellow
    octopus: { bright: '#00ffcc', dark: '#008866' }, // cyan-green
  },
  player: {
    1: { bright: '#00ffff', dark: '#006688' },
    2: { bright: '#ff33ff', dark: '#881188' },
    3: { bright: '#ffcc00', dark: '#886600' },
    4: { bright: '#66ff00', dark: '#226600' },
  },
}

const RETRO_SCHEME: SchemeOverride = {
  // CGA-style muted amber / brown palette
  aliens: {
    squid: { bright: '#cc8844', dark: '#664422' },
    crab: { bright: '#bb7733', dark: '#553311' },
    octopus: { bright: '#aa6622', dark: '#442211' },
  },
  player: {
    1: { bright: '#eebb66', dark: '#664422' },
    2: { bright: '#cc9944', dark: '#553311' },
    3: { bright: '#bb8855', dark: '#442211' },
    4: { bright: '#aa7744', dark: '#332211' },
  },
}

const PHOSPHOR_SCHEME: SchemeOverride = {
  // Monochrome green CRT
  aliens: {
    squid: { bright: '#88ff88', dark: '#228822' },
    crab: { bright: '#66ee66', dark: '#225522' },
    octopus: { bright: '#44cc44', dark: '#114411' },
  },
  player: {
    1: { bright: '#aaffaa', dark: '#227722' },
    2: { bright: '#88dd88', dark: '#225522' },
    3: { bright: '#66bb66', dark: '#114411' },
    4: { bright: '#44aa44', dark: '#113311' },
  },
}

const SCHEMES: Record<ColorScheme, SchemeOverride> = {
  default: DEFAULT_SCHEME,
  neon: NEON_SCHEME,
  retro: RETRO_SCHEME,
  phosphor: PHOSPHOR_SCHEME,
}

let currentScheme: ColorScheme = 'default'

export function getSchemeOverride(scheme: ColorScheme): SchemeOverride {
  return SCHEMES[scheme] ?? DEFAULT_SCHEME
}

export function setCurrentScheme(scheme: ColorScheme): void {
  currentScheme = scheme
}

export function getCurrentScheme(): ColorScheme {
  return currentScheme
}

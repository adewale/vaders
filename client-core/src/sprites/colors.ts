// client-core/src/sprites/colors.ts
// Platform-agnostic color definitions for game sprites and UI

import type { PlayerSlot } from '../../../shared/types'

// Retro Arcade Color Palette
// Inspired by classic arcade games (Space Invaders, Pac-Man)
export const COLORS = {
  // Aliens: threat-based colors (top rows = more dangerous)
  alien: {
    squid: '#ff5555', // Red - top row, highest threat
    crab: '#ffaa00', // Orange - middle row, medium threat
    octopus: '#55ff55', // Green - bottom row, lowest threat
  },
  // Players: distinct vibrant colors for each slot
  player: {
    1: '#00ffff', // Cyan - classic hero color
    2: '#ff8800', // Orange - warm contrast
    3: '#ff55ff', // Magenta/pink - stands out
    4: '#88ff00', // Lime green - high visibility
  },
  bullet: {
    player: '#ffffff', // Bright white for visibility
    alien: '#ff3333', // Red - danger
  },
  barrier: {
    4: '#00ff00', // Bright green - full health
    3: '#ffff00', // Yellow - damaged
    2: '#ff8800', // Orange - critical
    1: '#ff0000', // Red - nearly destroyed
  },
  // UI Colors for consistency across screens
  ui: {
    title: '#00ffff', // Cyan - main titles
    border: '#5555ff', // Blue - borders (arcade cabinet feel)
    borderHighlight: '#00ffff', // Cyan - highlighted borders
    selected: '#ffff00', // Yellow - selected items
    selectedText: '#ffffff', // White - selected item text
    unselected: '#888888', // Gray - unselected items
    hotkey: '#ff8800', // Orange - hotkey brackets (arcade button color)
    label: '#aaaaaa', // Light gray - labels
    dim: '#666666', // Dark gray - dimmed text
    score: '#ffff00', // Yellow - scores (classic arcade)
    wave: '#00ffff', // Cyan - wave number
    lives: '#ff5555', // Red - lives/hearts
    livesEmpty: '#553333', // Dark red - empty hearts
    success: '#00ff00', // Green - success/victory
    error: '#ff0000', // Red - errors/game over
    warning: '#ffff00', // Yellow - warnings
  },
} as const

// ─── Gradient Colors ────────────────────────────────────────────────────────────
// Vertical gradient: bright top row, dark bottom row

export const GRADIENT_COLORS = {
  alien: {
    squid: { bright: '#ff8888', dark: '#aa1111' },
    crab: { bright: '#ffcc44', dark: '#aa5500' },
    octopus: { bright: '#88ff88', dark: '#11aa11' },
  },
  player: {
    1: { bright: '#44ffff', dark: '#116666' },
    2: { bright: '#ffaa44', dark: '#884400' },
    3: { bright: '#ff88ff', dark: '#881188' },
    4: { bright: '#aaff44', dark: '#448800' },
  },
  ufo: { bright: '#ff88ff', dark: '#aa11aa' },
} as const

/**
 * Get the display color for a player based on their slot.
 * This centralizes the repeated pattern: COLORS.player[slot as 1|2|3|4] || fallback
 */
export function getPlayerColor(slot: PlayerSlot, fallbackColor?: string): string {
  return COLORS.player[slot] ?? fallbackColor ?? COLORS.player[1]
}

// client-core/src/effects/colorCycling.ts
// Color cycling effects and visual enhancements for game entities

// ─── Color Cycling Effects ───────────────────────────────────────────────────

/**
 * Get UFO color based on game tick for color cycling effect
 */
export function getUFOColor(tick: number): string {
  const colors = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#00ffff', '#ff00ff']
  return colors[Math.floor(tick / 5) % colors.length]
}

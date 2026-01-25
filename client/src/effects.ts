// client/src/effects.ts
// Color cycling effects for game entities

/**
 * Get UFO color based on game tick for color cycling effect
 */
export function getUFOColor(tick: number): string {
  const colors = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#00ffff', '#ff00ff']
  return colors[Math.floor(tick / 5) % colors.length]
}

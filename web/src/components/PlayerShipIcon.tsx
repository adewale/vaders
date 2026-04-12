import React, { useEffect, useRef } from 'react'
import type { PlayerSlot } from '../../../shared/types'
import { COLORS } from '../../../client-core/src/sprites/colors'
import { PIXEL_ART } from '../../../client-core/src/sprites/bitmaps'

export interface PlayerShipIconProps {
  slot: PlayerSlot
  /** Pixel size per sprite cell. Default: 3 → 14*3 × 8*3 = 42×24 canvas. */
  pixelSize?: number
}

/**
 * Tiny canvas that paints the player ship sprite in the given slot's colour.
 * Used as a visual identifier in the lobby. Gracefully no-ops if getContext
 * returns null (jsdom, SSR).
 */
export function PlayerShipIcon({ slot, pixelSize = 3 }: PlayerShipIconProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sprite = PIXEL_ART.player
  const rows = sprite.length
  const cols = sprite[0]?.length ?? 14
  const width = cols * pixelSize
  const height = rows * pixelSize

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return // jsdom returns null — fail silently
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = COLORS.player[slot] ?? COLORS.player[1]
    for (let y = 0; y < rows; y++) {
      const row = sprite[y]
      for (let x = 0; x < cols; x++) {
        if (row[x]) {
          ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize)
        }
      }
    }
  }, [slot, pixelSize, cols, rows, sprite, width, height])

  return (
    <canvas
      ref={canvasRef}
      data-testid="player-ship-icon"
      data-slot={slot}
      width={width}
      height={height}
      style={{
        width,
        height,
        imageRendering: 'pixelated',
        verticalAlign: 'middle',
      }}
    />
  )
}

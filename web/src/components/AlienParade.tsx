// web/src/components/AlienParade.tsx
// A small decorative canvas that animates the three alien types (squid,
// crab, octopus) side-by-side, gently swaying through their A/B frames.
// Used on the LaunchScreen under the logo.

import { useEffect, useRef } from 'react'
import { PIXEL_ART } from '../../../client-core/src/sprites/bitmaps'
import { COLORS } from '../../../client-core/src/sprites/colors'

const WIDTH = 400
const HEIGHT = 60
const PIXEL = 3 // scale factor — each "pixel" is PIXEL x PIXEL canvas px

const ALIENS: Array<{
  type: 'squid' | 'crab' | 'octopus'
  color: string
}> = [
  { type: 'squid', color: COLORS.alien.squid },
  { type: 'crab', color: COLORS.alien.crab },
  { type: 'octopus', color: COLORS.alien.octopus },
]

function drawPixels(ctx: CanvasRenderingContext2D, grid: number[][], ox: number, oy: number, color: string) {
  ctx.fillStyle = color
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y]
    for (let x = 0; x < row.length; x++) {
      if (row[x]) {
        ctx.fillRect(ox + x * PIXEL, oy + y * PIXEL, PIXEL, PIXEL)
      }
    }
  }
}

export function AlienParade() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let rafId = 0
    let tick = 0
    let lastTime = performance.now()

    const frame = (now: number) => {
      if (now - lastTime >= 33) {
        lastTime = now
        tick++
      }

      ctx.clearRect(0, 0, WIDTH, HEIGHT)

      const spriteW = 14 * PIXEL
      const spriteH = 8 * PIXEL
      const gap = (WIDTH - spriteW * ALIENS.length) / (ALIENS.length + 1)

      for (let i = 0; i < ALIENS.length; i++) {
        const { type, color } = ALIENS[i]
        const sprite = PIXEL_ART[type]
        const bitmap = (Math.floor(tick / 15) % 2 === 0 ? sprite.a : sprite.b) as unknown as number[][]
        const ox = gap + i * (spriteW + gap)
        const sway = Math.round(Math.sin((tick + i * 10) / 10) * 2)
        const oy = Math.floor((HEIGHT - spriteH) / 2) + sway
        drawPixels(ctx, bitmap, ox, oy, color)
      }

      rafId = requestAnimationFrame(frame)
    }

    rafId = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      width={WIDTH}
      height={HEIGHT}
      data-testid="alien-parade"
      data-aliens={ALIENS.map((a) => a.type).join(',')}
      style={{ display: 'block', margin: '0 auto' }}
    />
  )
}

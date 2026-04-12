// web/src/components/MenuBackground.tsx
// Full-screen animated background for menu screens:
//   - Twinkling starfield (StarfieldSystem from client-core)
//   - Soft CRT scanlines
//   - 60fps requestAnimationFrame loop
//
// Children render on top, centered over the canvas.

import type React from 'react'
import { useEffect, useRef } from 'react'
import { StarfieldSystem } from '../../../client-core/src/animation/starfield'
import { COLORS } from '../../../client-core/src/sprites/colors'

const GRID_W = 120
const GRID_H = 36
const CELL_W = 8
const CELL_H = 16
const WIDTH = GRID_W * CELL_W // 960
const HEIGHT = GRID_H * CELL_H // 576

// Stylesheet shared across all menu screens. Hover/focus rings for
// .vaders-menu-item, screen fade-in, gradient logo pulse + float, and
// game-over headline scale-in + pulse.
const MENU_STYLESHEET = `
@keyframes vaders-logo-pulse {
  0%, 100% { text-shadow: 0 0 10px rgba(0, 255, 255, 0.35), 0 0 28px rgba(255, 85, 255, 0.15); }
  50%      { text-shadow: 0 0 18px rgba(0, 255, 255, 0.75), 0 0 48px rgba(255, 85, 255, 0.45); }
}
@keyframes vaders-logo-float {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-6px); }
}
@keyframes vaders-screen-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes vaders-headline-scale-in {
  from { transform: scale(0.6); opacity: 0; }
  to   { transform: scale(1);   opacity: 1; }
}
@keyframes vaders-headline-pulse-victory {
  0%, 100% { text-shadow: 0 0 24px rgba(0, 255, 0, 0.55), 0 0 48px rgba(0, 255, 0, 0.25); }
  50%      { text-shadow: 0 0 42px rgba(0, 255, 0, 0.95), 0 0 72px rgba(0, 255, 0, 0.55); }
}
@keyframes vaders-headline-pulse-defeat {
  0%, 100% { text-shadow: 0 0 24px rgba(255, 0, 0, 0.55), 0 0 48px rgba(255, 0, 0, 0.25); }
  50%      { text-shadow: 0 0 42px rgba(255, 0, 0, 0.95), 0 0 72px rgba(255, 0, 0, 0.55); }
}
.vaders-logo {
  background: linear-gradient(90deg, #00ffff 0%, #ff55ff 50%, #ffff00 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  /* Two layered animations: pulsing glow (2.4s) + slow vertical float (6s). */
  animation: vaders-logo-pulse 2.4s ease-in-out infinite,
             vaders-logo-float 6s ease-in-out infinite;
  letter-spacing: 0.2em;
  font-weight: bold;
}
.vaders-headline {
  animation: vaders-headline-scale-in 400ms cubic-bezier(0.2, 1, 0.3, 1.2) 1 both;
  will-change: transform, text-shadow;
}
.vaders-headline--victory {
  animation: vaders-headline-scale-in 400ms cubic-bezier(0.2, 1, 0.3, 1.2) 1 both,
             vaders-headline-pulse-victory 2s ease-in-out infinite 400ms;
}
.vaders-headline--defeat {
  animation: vaders-headline-scale-in 400ms cubic-bezier(0.2, 1, 0.3, 1.2) 1 both,
             vaders-headline-pulse-defeat 2s ease-in-out infinite 400ms;
}
.vaders-menu-item {
  display: flex;
  gap: 8px;
  padding: 6px 10px;
  margin: 2px 0;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  width: 100%;
  transition: transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease, background 150ms ease;
}
.vaders-menu-item:hover {
  transform: scale(1.04);
  border-color: ${COLORS.ui.borderHighlight};
  box-shadow: 0 0 22px rgba(0, 255, 255, 0.7), 0 0 44px rgba(0, 255, 255, 0.25);
  background: rgba(0, 255, 255, 0.08);
}
.vaders-menu-item:focus {
  outline: none;
  transform: scale(1.04);
  border-color: ${COLORS.ui.selected};
  box-shadow: 0 0 22px rgba(255, 255, 0, 0.75), 0 0 44px rgba(255, 255, 0, 0.3);
}
.vaders-menu-item:focus-visible {
  outline: 2px solid ${COLORS.ui.selected};
  outline-offset: 2px;
}
.vaders-menu-item:active {
  /* Gentler press-in before the glow builds. */
  transform: scale(1.02);
}
.vaders-screen {
  animation: vaders-screen-fade-in 300ms ease-out;
}
`

interface MenuBackgroundProps {
  children: React.ReactNode
}

export function MenuBackground({ children }: MenuBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const starfield = new StarfieldSystem({ width: GRID_W, height: GRID_H, density: 0.015, unicode: false })

    let rafId = 0
    let tick = 0
    let lastTime = performance.now()

    const frame = (now: number) => {
      // 30Hz game tick equivalent; RAF is ~60Hz so advance every other frame.
      const elapsed = now - lastTime
      if (elapsed >= 16) {
        lastTime = now
        tick++
      }

      // Black base
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, WIDTH, HEIGHT)

      // Starfield: draw each cell as a tiny filled rect (parallax by layer index)
      const cells = starfield.getCells(tick)
      for (const c of cells) {
        ctx.fillStyle = c.color
        const px = c.x * CELL_W
        const py = c.y * CELL_H
        ctx.fillRect(px, py, 2, 2)
      }

      // Soft CRT scanlines: every 2nd row with translucent black
      ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
      for (let y = 0; y < HEIGHT; y += 2) {
        ctx.fillRect(0, y, WIDTH, 1)
      }

      rafId = requestAnimationFrame(frame)
    }

    rafId = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <div
      style={{
        position: 'relative',
        width: WIDTH,
        height: HEIGHT,
        background: '#000',
        overflow: 'hidden',
      }}
    >
      <style>{MENU_STYLESHEET}</style>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        data-testid="menu-background-canvas"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: WIDTH,
          height: HEIGHT,
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: WIDTH,
          height: HEIGHT,
        }}
      >
        {children}
      </div>
    </div>
  )
}

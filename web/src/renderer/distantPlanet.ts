// web/src/renderer/distantPlanet.ts
// Pre-rendered distant planet — a soft radial gradient parked near the
// bottom-right corner at very low alpha. Provides a subtle depth cue.

type PlanetImage = OffscreenCanvas | HTMLCanvasElement | null

const PLANET_DIAMETER = 180
const PLANET_ALPHA = 0.2

let cached: PlanetImage = null

function renderPlanetImage(): PlanetImage {
  const d = PLANET_DIAMETER
  let canvas: OffscreenCanvas | HTMLCanvasElement
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(d, d)
  } else if (typeof document !== 'undefined') {
    const c = document.createElement('canvas')
    c.width = d
    c.height = d
    canvas = c
  } else {
    return null
  }

  const ctxRaw = (canvas as unknown as { getContext: (id: '2d') => CanvasRenderingContext2D | null }).getContext('2d')
  if (!ctxRaw) return canvas

  try {
    const cx = d * 0.4 // light source slightly up-left of center
    const cy = d * 0.4
    const grad = ctxRaw.createRadialGradient(cx, cy, 0, d / 2, d / 2, d / 2)
    grad.addColorStop(0, 'rgba(120, 180, 255, 1)')
    grad.addColorStop(0.5, 'rgba(60, 80, 200, 0.9)')
    grad.addColorStop(0.85, 'rgba(40, 30, 110, 0.6)')
    grad.addColorStop(1, 'rgba(20, 10, 60, 0)')
    ctxRaw.fillStyle = grad
    ctxRaw.beginPath?.()
    ctxRaw.arc?.(d / 2, d / 2, d / 2, 0, Math.PI * 2)
    ctxRaw.fill?.()
    // Fallback fillRect in case arc/beginPath aren't available in jsdom
    ctxRaw.fillRect(0, 0, d, d)
  } catch {
    // ignore rendering failures in test environments
  }
  return canvas
}

export function getDistantPlanetImage(): CanvasImageSource | null {
  if (cached === null) cached = renderPlanetImage()
  return cached as CanvasImageSource | null
}

export const DISTANT_PLANET_ALPHA = PLANET_ALPHA
export const DISTANT_PLANET_DIAMETER = PLANET_DIAMETER

/** Compute the planet's top-left position for a given canvas size. */
export function getDistantPlanetPosition(canvasW: number, canvasH: number): { x: number; y: number } {
  // Parked in the bottom-right, slightly off-screen so only part is visible.
  return {
    x: canvasW - PLANET_DIAMETER + 40,
    y: canvasH - PLANET_DIAMETER + 30,
  }
}

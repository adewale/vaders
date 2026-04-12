import { useState, useEffect } from 'react'

export interface CanvasScale {
  scale: number
  offsetX: number
  offsetY: number
}

function computeScale(
  canvasWidth: number,
  canvasHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): CanvasScale {
  const scaleX = viewportWidth / canvasWidth
  const scaleY = viewportHeight / canvasHeight
  const scale = Math.min(scaleX, scaleY)

  const scaledWidth = canvasWidth * scale
  const scaledHeight = canvasHeight * scale
  const offsetX = (viewportWidth - scaledWidth) / 2
  const offsetY = (viewportHeight - scaledHeight) / 2

  return { scale, offsetX, offsetY }
}

export { computeScale as _computeScale }

export function useCanvasScale(canvasWidth: number, canvasHeight: number): CanvasScale {
  const [result, setResult] = useState(() =>
    computeScale(canvasWidth, canvasHeight, window.innerWidth, window.innerHeight),
  )

  useEffect(() => {
    const handler = () => {
      setResult(computeScale(canvasWidth, canvasHeight, window.innerWidth, window.innerHeight))
    }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [canvasWidth, canvasHeight])

  return result
}

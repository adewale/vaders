// client/src/components/Spinner.tsx
// Animated spinner using braille characters (Unicode) or ASCII twirl fallback.

import { useState, useEffect, useMemo } from 'react'
import { getSpinnerFrames } from '../sprites'

const SPINNER_INTERVAL_MS = 80

/**
 * Animated spinner that cycles through braille or ASCII frames.
 * Automatically selects the right frame set based on terminal Unicode support.
 *
 * Usage: <Spinner /> or <Spinner fg="cyan" />
 */
export function Spinner({ fg }: { fg?: string }) {
  const frames = useMemo(() => getSpinnerFrames(), [])
  const [frameIndex, setFrameIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setFrameIndex(i => (i + 1) % frames.length)
    }, SPINNER_INTERVAL_MS)
    return () => clearInterval(id)
  }, [frames.length])

  return <text fg={fg}>{frames[frameIndex]}</text>
}

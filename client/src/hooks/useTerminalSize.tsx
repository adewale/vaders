// client/src/hooks/useTerminalSize.tsx
// Hook and context for terminal dimensions with fixed game size

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { useRenderer } from '@opentui/react'
import { STANDARD_WIDTH, STANDARD_HEIGHT } from '../../../shared/types'

// Re-export standard size for convenience
export { STANDARD_WIDTH, STANDARD_HEIGHT }

export interface TerminalSize {
  // Actual terminal dimensions
  terminalWidth: number
  terminalHeight: number

  // Standard game dimensions (always fixed)
  gameWidth: number
  gameHeight: number

  // Offset to center game in terminal (0 if terminal <= standard)
  offsetX: number
  offsetY: number

  // Is terminal too small to display the game?
  isTooSmall: boolean
}

const TerminalSizeContext = createContext<TerminalSize>({
  terminalWidth: STANDARD_WIDTH,
  terminalHeight: STANDARD_HEIGHT,
  gameWidth: STANDARD_WIDTH,
  gameHeight: STANDARD_HEIGHT,
  offsetX: 0,
  offsetY: 0,
  isTooSmall: false,
})

export function useTerminalSize(): TerminalSize {
  return useContext(TerminalSizeContext)
}

function calculateSize(width: number, height: number): TerminalSize {
  const isTooSmall = width < STANDARD_WIDTH || height < STANDARD_HEIGHT

  // Calculate centering offsets (game floats in center if terminal is larger)
  const offsetX = Math.max(0, Math.floor((width - STANDARD_WIDTH) / 2))
  const offsetY = Math.max(0, Math.floor((height - STANDARD_HEIGHT) / 2))

  return {
    terminalWidth: width,
    terminalHeight: height,
    gameWidth: STANDARD_WIDTH,
    gameHeight: STANDARD_HEIGHT,
    offsetX,
    offsetY,
    isTooSmall,
  }
}

export function TerminalSizeProvider({ children }: { children: ReactNode }) {
  const renderer = useRenderer()
  const [size, setSize] = useState<TerminalSize>(() =>
    calculateSize(renderer.width, renderer.height)
  )

  useEffect(() => {
    // Update size when terminal resizes
    const checkSize = () => {
      const newSize = calculateSize(renderer.width, renderer.height)
      setSize(prev => {
        // Only update if something changed
        if (prev.terminalWidth !== newSize.terminalWidth ||
            prev.terminalHeight !== newSize.terminalHeight) {
          return newSize
        }
        return prev
      })
    }

    // Check periodically for resize (OpenTUI handles SIGWINCH internally)
    const interval = setInterval(checkSize, 500)
    checkSize()

    return () => clearInterval(interval)
  }, [renderer])

  return (
    <TerminalSizeContext.Provider value={size}>
      {children}
    </TerminalSizeContext.Provider>
  )
}

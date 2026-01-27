// client/src/hooks/useWaveWipe.ts
// React hook for wave transition wipe effects

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  WipeTransition,
  type WipeConfig,
  type WipeState,
  type WipeCell,
} from '../animation'

/**
 * Options for the wave wipe hook
 */
export interface UseWaveWipeOptions {
  /** Screen width */
  width: number
  /** Screen height */
  height: number
  /** Wipe configuration */
  config?: Partial<WipeConfig>
}

/**
 * Return type of useWaveWipe hook
 */
export interface UseWaveWipeReturn {
  /** Start a wave transition */
  startTransition: (waveNumber: number) => void
  /** Cancel the transition */
  cancel: () => void
  /** Current wipe state */
  state: WipeState
  /** Whether wipe is active */
  isActive: boolean
  /** Whether in hold phase (show title) */
  isInHold: boolean
  /** Current wave number */
  waveNumber: number
  /** Mask cells for rendering */
  maskCells: WipeCell[]
  /** Mask color */
  maskColor: string
  /** Check if a cell is visible through the mask */
  isCellVisible: (x: number, y: number) => boolean
  /** Current progress (0-1) */
  progress: number
}

/**
 * Hook for managing wave transition wipe effects.
 *
 * Usage:
 * ```tsx
 * function GameScreen({ wave }) {
 *   const { startTransition, isActive, isInHold, waveNumber, maskCells } =
 *     useWaveWipe({ width: 120, height: 36 })
 *
 *   useEffect(() => {
 *     if (wave > prevWave) {
 *       startTransition(wave)
 *     }
 *   }, [wave])
 *
 *   return (
 *     <>
 *       {isInHold && <WaveTitle wave={waveNumber} />}
 *       {maskCells.map((cell, i) => (
 *         <text key={i} position="absolute" top={cell.y} left={cell.x}>
 *           {cell.char}
 *         </text>
 *       ))}
 *     </>
 *   )
 * }
 * ```
 *
 * @note Config objects should be memoized (useMemo) or defined outside the component
 * to prevent unnecessary re-initialization on every render.
 */
export function useWaveWipe(options: UseWaveWipeOptions): UseWaveWipeReturn {
  const { width, height, config = {} } = options

  const [state, setState] = useState<WipeState>('idle')
  const [waveNumber, setWaveNumber] = useState(0)
  const [maskCells, setMaskCells] = useState<WipeCell[]>([])
  const [progress, setProgress] = useState(0)
  const [maskColor, setMaskColor] = useState('#000000')

  // Create wipe system ref
  const wipeRef = useRef<WipeTransition | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  // Initialize wipe system
  useEffect(() => {
    wipeRef.current = new WipeTransition({
      width,
      height,
      pattern: 'iris',
      ...config,
    })

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      wipeRef.current = null
    }
  }, [width, height, config])

  // Animation loop
  const updateLoop = useCallback(() => {
    if (!wipeRef.current) return

    wipeRef.current.update()

    const currentState = wipeRef.current.getState()
    setState(currentState)
    setProgress(wipeRef.current.getProgress())
    setMaskCells(wipeRef.current.getMaskCells())
    setMaskColor(wipeRef.current.getMaskColor())

    if (wipeRef.current.isActive()) {
      animationFrameRef.current = requestAnimationFrame(updateLoop)
    }
  }, [])

  // Start transition
  const startTransition = useCallback((wave: number) => {
    if (!wipeRef.current) return

    setWaveNumber(wave)
    wipeRef.current.start(wave)
    setState('exiting')

    // Start animation loop
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    animationFrameRef.current = requestAnimationFrame(updateLoop)
  }, [updateLoop])

  // Cancel transition
  const cancel = useCallback(() => {
    if (!wipeRef.current) return

    wipeRef.current.cancel()
    setState('idle')
    setMaskCells([])

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  // Check if cell is visible
  const isCellVisible = useCallback((x: number, y: number): boolean => {
    if (!wipeRef.current) return true
    return wipeRef.current.isCellVisible(x, y)
  }, [])

  return {
    startTransition,
    cancel,
    state,
    isActive: state !== 'idle',
    isInHold: state === 'hold',
    waveNumber,
    maskCells,
    maskColor,
    isCellVisible,
    progress,
  }
}

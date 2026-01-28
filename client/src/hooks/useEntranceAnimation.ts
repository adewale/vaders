// client/src/hooks/useEntranceAnimation.ts
// React hook for alien entrance animations

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  EntranceAnimation,
  type EntranceConfig,
  type AlienAnimState,
} from '../animation'

/**
 * Alien data for entrance animation
 */
export interface EntranceAlien {
  id: string
  row: number
  col: number
  targetX: number
  targetY: number
}

/**
 * Options for the entrance animation hook
 */
export interface UseEntranceAnimationOptions {
  /** Entrance animation configuration */
  config?: Partial<EntranceConfig>
}

/**
 * Visual position for an alien
 */
export interface AlienVisualPosition {
  x: number
  y: number
  animState: AlienAnimState
}

/**
 * Return type of useEntranceAnimation hook
 */
export interface UseEntranceAnimationReturn {
  /** Start entrance animation with aliens */
  start: (aliens: EntranceAlien[]) => void
  /** Stop and snap to formation */
  stop: () => void
  /** Whether animation is running */
  isRunning: boolean
  /** Whether animation is complete */
  isComplete: boolean
  /** Get visual position for an alien by ID */
  getPosition: (id: string) => AlienVisualPosition | null
  /** Get all visual positions */
  positions: Map<string, AlienVisualPosition>
  /** Animation progress (0-1) */
  progress: number
}

/**
 * Hook for managing alien entrance animations.
 *
 * Usage:
 * ```tsx
 * function GameScreen({ aliens, wave }) {
 *   const { start, getPosition, isRunning } =
 *     useEntranceAnimation()
 *
 *   // Start entrance on new wave
 *   useEffect(() => {
 *     const entranceAliens = aliens.map(a => ({
 *       id: a.id,
 *       row: a.row,
 *       col: a.col,
 *       targetX: a.x,
 *       targetY: a.y,
 *     }))
 *     start(entranceAliens)
 *   }, [wave])
 *
 *   return (
 *     <>
 *       {aliens.map(alien => {
 *         const pos = getPosition(alien.id)
 *         const x = pos?.x ?? alien.x
 *         const y = pos?.y ?? alien.y
 *         return <AlienSprite key={alien.id} x={x} y={y} />
 *       })}
 *     </>
 *   )
 * }
 * ```
 *
 * @note Config objects should be memoized (useMemo) or defined outside the component
 * to prevent unnecessary re-initialization on every render.
 */
// Stable empty config to avoid re-creating on every render
const EMPTY_CONFIG: Partial<EntranceConfig> = {}

export function useEntranceAnimation(
  options: UseEntranceAnimationOptions = {}
): UseEntranceAnimationReturn {
  // Use stable reference for empty config
  const config = options.config ?? EMPTY_CONFIG

  const [isRunning, setIsRunning] = useState(false)
  const [isComplete, setIsComplete] = useState(true)
  const [positions, setPositions] = useState<Map<string, AlienVisualPosition>>(new Map())
  const [progress, setProgress] = useState(1)

  // Create entrance system ref - initialized synchronously to avoid race conditions
  // (other useEffects might try to call start() before an initialization effect runs)
  const entranceRef = useRef<EntranceAnimation>(new EntranceAnimation(config))
  const animationFrameRef = useRef<number | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  // Animation loop
  const updateLoop = useCallback(() => {
    entranceRef.current.update()

    const running = entranceRef.current.isRunning()
    const complete = entranceRef.current.isComplete()

    setIsRunning(running)
    setIsComplete(complete)
    setProgress(entranceRef.current.getProgress())
    setPositions(new Map(entranceRef.current.getVisualPositions()))

    if (running) {
      animationFrameRef.current = requestAnimationFrame(updateLoop)
    }
  }, [])

  // Start entrance animation
  const start = useCallback((aliens: EntranceAlien[]) => {
    entranceRef.current.start(aliens)
    setIsRunning(true)
    setIsComplete(false)

    // Start animation loop
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    animationFrameRef.current = requestAnimationFrame(updateLoop)
  }, [updateLoop])

  // Stop and snap to formation
  const stop = useCallback(() => {
    entranceRef.current.stop()
    setIsRunning(false)
    setIsComplete(true)
    setPositions(new Map(entranceRef.current.getVisualPositions()))

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  // Get position for single alien
  const getPosition = useCallback((id: string): AlienVisualPosition | null => {
    return entranceRef.current.getVisualPosition(id)
  }, [])

  return {
    start,
    stop,
    isRunning,
    isComplete,
    getPosition,
    positions,
    progress,
  }
}

// client/src/hooks/useConfetti.ts
// React hook for confetti particle system

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  ConfettiSystem,
  type ConfettiConfig,
  type ConfettiParticleRenderProps,
  getConfettiDisplayColor,
} from '../animation'

/**
 * Options for the confetti hook
 */
export interface UseConfettiOptions {
  /** Screen width for particle bounds */
  width: number
  /** Screen height for particle bounds */
  height: number
  /** Auto-start when triggered */
  autoStart?: boolean
  /** Confetti system configuration */
  config?: Partial<ConfettiConfig>
}

/**
 * Return type of useConfetti hook
 */
export interface UseConfettiReturn {
  /** Start the confetti celebration */
  start: () => void
  /** Stop the confetti */
  stop: () => void
  /** Whether confetti is currently running */
  isRunning: boolean
  /** Current visible particles for rendering */
  particles: ConfettiParticleRenderProps[]
  /** Get display color for a particle (handles fading) */
  getDisplayColor: (color: string, opacity: number) => string
}

/**
 * Hook for managing confetti particle system.
 *
 * Usage:
 * ```tsx
 * function VictoryScreen() {
 *   const { start, particles, isRunning } = useConfetti({ width: 120, height: 36 })
 *
 *   useEffect(() => {
 *     start() // Start confetti on mount
 *   }, [])
 *
 *   return (
 *     <>
 *       {particles.map((p, i) => (
 *         <text key={i} position="absolute" top={p.y} left={p.x} fg={p.color}>
 *           {p.char}
 *         </text>
 *       ))}
 *     </>
 *   )
 * }
 * ```
 */
export function useConfetti(options: UseConfettiOptions): UseConfettiReturn {
  const { width, height, autoStart = false, config = {} } = options

  const [isRunning, setIsRunning] = useState(false)
  const [particles, setParticles] = useState<ConfettiParticleRenderProps[]>([])

  // Create confetti system ref (persists across renders)
  const confettiRef = useRef<ConfettiSystem | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  // Initialize confetti system
  useEffect(() => {
    confettiRef.current = new ConfettiSystem({ width, height }, config)

    return () => {
      // Cleanup on unmount
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      confettiRef.current = null
    }
  }, [width, height, config])

  // Animation loop
  const updateLoop = useCallback(() => {
    if (!confettiRef.current) return

    confettiRef.current.update()
    const visibleParticles = confettiRef.current.getVisibleParticles()
    setParticles(visibleParticles)

    // Check if still running
    if (confettiRef.current.isRunning() || confettiRef.current.hasVisibleParticles()) {
      animationFrameRef.current = requestAnimationFrame(updateLoop)
    } else {
      setIsRunning(false)
    }
  }, [])

  // Start function
  const start = useCallback(() => {
    if (!confettiRef.current) return

    confettiRef.current.start()
    setIsRunning(true)

    // Start animation loop
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    animationFrameRef.current = requestAnimationFrame(updateLoop)
  }, [updateLoop])

  // Stop function
  const stop = useCallback(() => {
    if (!confettiRef.current) return

    confettiRef.current.stop()
    setIsRunning(false)
    setParticles([])

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  // Auto-start if enabled
  useEffect(() => {
    if (autoStart) {
      start()
    }
  }, [autoStart, start])

  return {
    start,
    stop,
    isRunning,
    particles,
    getDisplayColor: getConfettiDisplayColor,
  }
}

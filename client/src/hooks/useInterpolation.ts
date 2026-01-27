// client/src/hooks/useInterpolation.ts
// React hook for smooth movement interpolation

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  InterpolationManager,
  type InterpolationConfig,
  type RenderPosition,
  toRenderPosition,
} from '../animation'

/**
 * Entity update data
 */
export interface EntityUpdate {
  id: string
  x: number
  y: number
}

/**
 * Options for the interpolation hook
 */
export interface UseInterpolationOptions {
  /** Interpolation configuration */
  config?: Partial<InterpolationConfig>
}

/**
 * Return type of useInterpolation hook
 */
export interface UseInterpolationReturn {
  /** Update entities from game state (call on each game tick) */
  updateEntities: (entities: EntityUpdate[], gameTick: number) => void
  /** Update a single entity */
  updateEntity: (id: string, x: number, y: number, gameTick: number) => void
  /** Remove an entity from tracking */
  removeEntity: (id: string) => void
  /** Clear all entities */
  clear: () => void
  /** Get visual position for an entity */
  getPosition: (id: string) => { x: number; y: number } | null
  /** Get render position with sub-cell info */
  getRenderPosition: (id: string) => RenderPosition | null
  /** Get all visual positions */
  positions: Map<string, { x: number; y: number }>
  /** Current interpolation factor (0-1) */
  factor: number
  /** Mark start of new game tick */
  markTick: (gameTick: number) => void
}

/**
 * Hook for managing smooth movement interpolation.
 *
 * Interpolates entity positions between game ticks for smoother
 * visual movement. Game logic runs at 30Hz, but rendering can
 * be smoother by interpolating between known positions.
 *
 * Usage:
 * ```tsx
 * function GameScreen({ gameState }) {
 *   const { updateEntities, getPosition, markTick } = useInterpolation()
 *
 *   // On each game tick, update entity positions
 *   useEffect(() => {
 *     markTick()
 *     updateEntities(
 *       gameState.players.map(p => ({ id: p.id, x: p.x, y: p.y })),
 *       gameState.tick
 *     )
 *   }, [gameState.tick])
 *
 *   // Render at interpolated positions
 *   return (
 *     <>
 *       {gameState.players.map(player => {
 *         const pos = getPosition(player.id)
 *         return <Ship key={player.id} x={pos?.x ?? player.x} y={pos?.y ?? player.y} />
 *       })}
 *     </>
 *   )
 * }
 * ```
 *
 * @note Config objects should be memoized (useMemo) or defined outside the component
 * to prevent unnecessary re-initialization on every render.
 */
export function useInterpolation(
  options: UseInterpolationOptions = {}
): UseInterpolationReturn {
  const { config = {} } = options

  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map())
  const [factor, setFactor] = useState(0)

  // Create interpolation manager ref
  const managerRef = useRef<InterpolationManager | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  // Initialize manager
  useEffect(() => {
    let isActive = true
    managerRef.current = new InterpolationManager(config)

    // Start render loop
    const renderLoop = () => {
      if (!isActive) return
      if (managerRef.current) {
        managerRef.current.interpolate()
        setPositions(new Map(managerRef.current.getAllVisualPositions()))
        setFactor(managerRef.current.getInterpolationFactor())
      }
      animationFrameRef.current = requestAnimationFrame(renderLoop)
    }

    animationFrameRef.current = requestAnimationFrame(renderLoop)

    return () => {
      isActive = false
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      managerRef.current = null
    }
  }, [config])

  // Update multiple entities
  const updateEntities = useCallback((entities: EntityUpdate[], gameTick: number) => {
    if (!managerRef.current) return
    for (const entity of entities) {
      managerRef.current.updateEntity(entity.id, entity.x, entity.y, gameTick)
    }
  }, [])

  // Update single entity
  const updateEntity = useCallback((id: string, x: number, y: number, gameTick: number) => {
    if (!managerRef.current) return
    managerRef.current.updateEntity(id, x, y, gameTick)
  }, [])

  // Remove entity
  const removeEntity = useCallback((id: string) => {
    if (!managerRef.current) return
    managerRef.current.removeEntity(id)
  }, [])

  // Clear all
  const clear = useCallback(() => {
    if (!managerRef.current) return
    managerRef.current.clear()
    setPositions(new Map())
  }, [])

  // Get visual position
  const getPosition = useCallback((id: string): { x: number; y: number } | null => {
    if (!managerRef.current) return null
    return managerRef.current.getVisualPosition(id)
  }, [])

  // Get render position with sub-cell info
  const getRenderPosition = useCallback((id: string): RenderPosition | null => {
    if (!managerRef.current) return null
    const pos = managerRef.current.getVisualPosition(id)
    if (!pos) return null
    return toRenderPosition(pos.x, pos.y, config.useAscii)
  }, [config.useAscii])

  // Mark tick start
  const markTickFn = useCallback((gameTick: number) => {
    if (!managerRef.current) return
    managerRef.current.startTick(gameTick)
  }, [])

  return {
    updateEntities,
    updateEntity,
    removeEntity,
    clear,
    getPosition,
    getRenderPosition,
    positions,
    factor,
    markTick: markTickFn,
  }
}

// client/src/animation/interpolation.ts
// Smooth movement interpolation for entities
//
// Features:
// - Lerp between previous and current positions
// - Separate render loop concept (60fps visual) from game logic (30Hz)
// - Half-block characters for sub-cell horizontal precision
// - Previous position tracking for smooth state updates

import { lerp, clamp } from './easing'

// ─── Half-Block Characters ───────────────────────────────────────────────────

/**
 * Half-block characters for sub-cell horizontal precision
 */
export const HALF_BLOCKS = {
  /** Left half-block (shows left half of cell) */
  left: '▌',
  /** Right half-block (shows right half of cell) */
  right: '▐',
  /** Full block */
  full: '█',
  /** Empty (space) */
  empty: ' ',
} as const

/**
 * ASCII fallback half-blocks
 */
export const HALF_BLOCKS_ASCII = {
  left: '[',
  right: ']',
  full: '#',
  empty: ' ',
} as const

// ─── Position Types ──────────────────────────────────────────────────────────

/**
 * Entity position with previous state for interpolation
 */
export interface InterpolatedPosition {
  /** Current logical X position */
  x: number
  /** Current logical Y position */
  y: number
  /** Previous X position (from last state update) */
  prevX: number
  /** Previous Y position (from last state update) */
  prevY: number
  /** Visual X position (interpolated) */
  visualX: number
  /** Visual Y position (interpolated) */
  visualY: number
  /** Last update tick */
  lastUpdateTick: number
}

/**
 * Configuration for interpolation system
 */
export interface InterpolationConfig {
  /** Game tick duration in milliseconds (default: 33ms for 30Hz) */
  tickDurationMs: number
  /** Target render rate in fps (default: 60) */
  targetFps: number
  /** Maximum interpolation distance (to avoid teleport lerping) */
  maxLerpDistance: number
  /** Use ASCII half-blocks for compatibility */
  useAscii: boolean
}

/**
 * Default interpolation configuration
 */
export const DEFAULT_INTERPOLATION_CONFIG: InterpolationConfig = {
  tickDurationMs: 33, // ~30Hz game tick
  targetFps: 60,
  maxLerpDistance: 10, // Don't lerp if distance > 10 cells
  useAscii: false,
}

// ─── Interpolation Manager ───────────────────────────────────────────────────

/**
 * Smooth movement interpolation manager.
 *
 * Manages smooth visual movement between game state updates.
 * The game logic runs at 30Hz, but rendering can be at 60fps.
 * This system interpolates entity positions for smooth visuals.
 *
 * Usage:
 * ```typescript
 * const interpolator = new InterpolationManager()
 *
 * // When game state updates (30Hz tick):
 * interpolator.updateEntity('player1', newX, newY, gameTick)
 *
 * // When rendering (60fps):
 * const elapsed = performance.now() - lastTickTime
 * interpolator.interpolate(elapsed)
 * const pos = interpolator.getVisualPosition('player1')
 * // Render at pos.visualX, pos.visualY
 * ```
 */
export class InterpolationManager {
  private config: InterpolationConfig
  private entities: Map<string, InterpolatedPosition> = new Map()
  private halfBlocks: typeof HALF_BLOCKS | typeof HALF_BLOCKS_ASCII
  private lastGameTick: number = 0
  private lastTickTimestamp: number = 0

  constructor(config: Partial<InterpolationConfig> = {}) {
    this.config = { ...DEFAULT_INTERPOLATION_CONFIG, ...config }
    this.halfBlocks = this.config.useAscii ? HALF_BLOCKS_ASCII : HALF_BLOCKS
  }

  /**
   * Update an entity's position from game state.
   * Call this when the game logic tick updates entity positions.
   *
   * @param id - Entity unique identifier
   * @param x - New X position
   * @param y - New Y position
   * @param gameTick - Current game tick number
   */
  updateEntity(id: string, x: number, y: number, gameTick: number): void {
    const existing = this.entities.get(id)

    if (existing) {
      // Check if this is a new tick
      if (gameTick > existing.lastUpdateTick) {
        // Store previous position for interpolation
        existing.prevX = existing.x
        existing.prevY = existing.y
        existing.lastUpdateTick = gameTick
      }
      // Update current position
      existing.x = x
      existing.y = y
    } else {
      // New entity - no interpolation for first frame
      this.entities.set(id, {
        x,
        y,
        prevX: x, // Same as current for first frame
        prevY: y,
        visualX: x,
        visualY: y,
        lastUpdateTick: gameTick,
      })
    }
  }

  /**
   * Remove an entity from tracking
   */
  removeEntity(id: string): void {
    this.entities.delete(id)
  }

  /**
   * Clear all tracked entities
   */
  clear(): void {
    this.entities.clear()
  }

  /**
   * Mark the start of a new game tick.
   * Call this when the game logic tick begins.
   *
   * @param gameTick - Current game tick number
   */
  startTick(gameTick: number): void {
    this.lastGameTick = gameTick
    this.lastTickTimestamp = performance.now()
  }

  /**
   * Calculate interpolated positions for all entities.
   * Call this before rendering, passing the time elapsed since last game tick.
   *
   * @param elapsedMs - Milliseconds elapsed since last game tick started
   */
  interpolate(elapsedMs?: number): void {
    // Calculate elapsed time if not provided
    const elapsed = elapsedMs ?? (performance.now() - this.lastTickTimestamp)

    // Calculate interpolation factor (0 = at prevPosition, 1 = at current position)
    const t = clamp(elapsed / this.config.tickDurationMs, 0, 1)

    for (const entity of this.entities.values()) {
      // Calculate distance to check if we should interpolate
      const dx = entity.x - entity.prevX
      const dy = entity.y - entity.prevY
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance > this.config.maxLerpDistance) {
        // Teleport - don't interpolate large distances
        entity.visualX = entity.x
        entity.visualY = entity.y
      } else {
        // Interpolate smoothly
        entity.visualX = lerp(entity.prevX, entity.x, t)
        entity.visualY = lerp(entity.prevY, entity.y, t)
      }
    }
  }

  /**
   * Get the visual position for an entity.
   * Returns null if entity not found.
   */
  getVisualPosition(id: string): { x: number; y: number } | null {
    const entity = this.entities.get(id)
    if (!entity) return null
    return { x: entity.visualX, y: entity.visualY }
  }

  /**
   * Get the integer cell position and sub-cell offset for half-block rendering.
   * Returns the cell X, cell Y, and horizontal sub-cell offset (0, 0.5, or 1).
   */
  getCellPosition(id: string): { cellX: number; cellY: number; subX: number } | null {
    const entity = this.entities.get(id)
    if (!entity) return null

    const cellX = Math.floor(entity.visualX)
    const cellY = Math.round(entity.visualY) // Round Y for cleaner vertical positioning
    const subX = entity.visualX - cellX // 0 to 1

    return { cellX, cellY, subX }
  }

  /**
   * Get half-block character for horizontal sub-cell precision.
   *
   * @param subX - Sub-cell X offset (0-1)
   * @returns Half-block character to use
   */
  getHalfBlockChar(subX: number): string {
    if (subX < 0.25) {
      return this.halfBlocks.full // Show full at current cell
    } else if (subX < 0.75) {
      return this.halfBlocks.right // Show right half (transitioning)
    } else {
      return this.halfBlocks.empty // Almost at next cell
    }
  }

  /**
   * Get all visual positions as a map
   */
  getAllVisualPositions(): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>()
    for (const [id, entity] of this.entities) {
      positions.set(id, { x: entity.visualX, y: entity.visualY })
    }
    return positions
  }

  /**
   * Check if an entity is being tracked
   */
  hasEntity(id: string): boolean {
    return this.entities.has(id)
  }

  /**
   * Get entity count (for debugging)
   */
  getEntityCount(): number {
    return this.entities.size
  }

  /**
   * Get current interpolation factor
   */
  getInterpolationFactor(): number {
    const elapsed = performance.now() - this.lastTickTimestamp
    return clamp(elapsed / this.config.tickDurationMs, 0, 1)
  }
}

// ─── Render Position Utilities ───────────────────────────────────────────────

/**
 * Render position with sub-cell precision information
 */
export interface RenderPosition {
  /** Integer X cell position */
  cellX: number
  /** Integer Y cell position */
  cellY: number
  /** Sub-cell X offset (0-1) */
  subX: number
  /** Sub-cell Y offset (0-1) */
  subY: number
  /** Half-block character for sub-cell horizontal precision */
  halfBlock: string
  /** Whether position has significant sub-cell offset */
  hasSubCellOffset: boolean
}

/**
 * Convert visual position to render position with sub-cell information.
 *
 * @param visualX - Interpolated X position (float)
 * @param visualY - Interpolated Y position (float)
 * @param useAscii - Use ASCII half-block characters
 */
export function toRenderPosition(
  visualX: number,
  visualY: number,
  useAscii: boolean = false
): RenderPosition {
  const halfBlocks = useAscii ? HALF_BLOCKS_ASCII : HALF_BLOCKS

  const cellX = Math.floor(visualX)
  const cellY = Math.floor(visualY)
  const subX = visualX - cellX
  const subY = visualY - cellY

  // Determine half-block character based on sub-cell offset
  let halfBlock: string
  if (subX < 0.25) {
    halfBlock = halfBlocks.full
  } else if (subX < 0.75) {
    halfBlock = halfBlocks.right
  } else {
    halfBlock = halfBlocks.empty
  }

  return {
    cellX,
    cellY,
    subX,
    subY,
    halfBlock,
    hasSubCellOffset: subX > 0.1 || subY > 0.1,
  }
}

/**
 * Batch update multiple entities from game state.
 * Useful for updating all entities at once during a game tick.
 *
 * @param manager - Interpolation manager instance
 * @param entities - Array of entities with id, x, y
 * @param gameTick - Current game tick number
 */
export function batchUpdateEntities(
  manager: InterpolationManager,
  entities: Array<{ id: string; x: number; y: number }>,
  gameTick: number
): void {
  for (const entity of entities) {
    manager.updateEntity(entity.id, entity.x, entity.y, gameTick)
  }
}

// ─── Frame Timing Utilities ──────────────────────────────────────────────────

/**
 * Frame timing helper for render loop
 */
export interface FrameTiming {
  /** Timestamp of last game tick */
  lastTickTimestamp: number
  /** Game tick duration in ms */
  tickDurationMs: number
  /** Current interpolation factor (0-1) */
  t: number
}

/**
 * Create frame timing helper
 */
export function createFrameTiming(tickDurationMs: number = 33): FrameTiming {
  return {
    lastTickTimestamp: performance.now(),
    tickDurationMs,
    t: 0,
  }
}

/**
 * Update frame timing for rendering.
 * Call this at the start of each render frame.
 */
export function updateFrameTiming(timing: FrameTiming): void {
  const elapsed = performance.now() - timing.lastTickTimestamp
  timing.t = clamp(elapsed / timing.tickDurationMs, 0, 1)
}

/**
 * Mark start of new game tick in frame timing.
 * Call this when game logic tick begins.
 */
export function markTick(timing: FrameTiming): void {
  timing.lastTickTimestamp = performance.now()
  timing.t = 0
}

/**
 * Simple lerp for position interpolation using frame timing
 */
export function lerpPosition(
  prevX: number,
  prevY: number,
  currX: number,
  currY: number,
  t: number
): { x: number; y: number } {
  return {
    x: lerp(prevX, currX, t),
    y: lerp(prevY, currY, t),
  }
}

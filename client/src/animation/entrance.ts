// client/src/animation/entrance.ts
// Alien entrance animations for wave starts
//
// Features:
// - "Rain" pattern: aliens fall from top with bounce easing
// - Staggered start times per alien (column-first ordering)
// - Visual positions separate from logical positions
// - Multiple entrance patterns support

import { easeOutBounce, easeOutQuad, easeOutElastic, lerp, clamp } from './easing'
import type { EasingFunction } from './easing'

// ─── Animation State Types ───────────────────────────────────────────────────

/**
 * Animation state for an alien
 */
export type AlienAnimState = 'entering' | 'formation'

/**
 * Animated alien position data
 */
export interface AnimatedAlien {
  /** Unique identifier */
  id: string
  /** Grid row */
  row: number
  /** Grid column */
  col: number
  /** Logical (target) X position */
  targetX: number
  /** Logical (target) Y position */
  targetY: number
  /** Visual X position (float for smooth animation) */
  visualX: number
  /** Visual Y position (float for smooth animation) */
  visualY: number
  /** Current animation state */
  animState: AlienAnimState
  /** Tick when this alien starts animating */
  startTick: number
  /** Duration of the entrance animation in ticks */
  duration: number
}

/**
 * Entrance pattern types
 */
export type EntrancePattern = 'rain' | 'wave' | 'spiral' | 'scatter' | 'slide'

/**
 * Configuration for entrance animations
 */
export interface EntranceConfig {
  /** Animation pattern */
  pattern: EntrancePattern
  /** Base duration of entrance animation in ticks */
  baseDuration: number
  /** Delay between aliens starting (in ticks) */
  staggerDelay: number
  /** Starting Y position off-screen */
  startY: number
  /** Easing function to use */
  easing: EasingFunction
  /** Whether to animate X position as well */
  animateX: boolean
}

/**
 * Default entrance configuration
 */
export const DEFAULT_ENTRANCE_CONFIG: EntranceConfig = {
  pattern: 'rain',
  baseDuration: 30, // ~1 second at 30fps
  staggerDelay: 2,
  startY: -5,
  easing: easeOutBounce,
  animateX: false,
}

// ─── Entrance Pattern Functions ──────────────────────────────────────────────

/**
 * Calculate stagger order for rain pattern (column-first)
 */
function rainStaggerOrder(row: number, col: number, cols: number): number {
  // Column-first: aliens in the same column start together,
  // then next column starts, creating a "rain" effect
  return col * 0.8 + row * 0.2
}

/**
 * Calculate stagger order for wave pattern (diagonal)
 */
function waveStaggerOrder(row: number, col: number): number {
  return row + col
}

/**
 * Calculate stagger order for spiral pattern (outside-in)
 */
function spiralStaggerOrder(row: number, col: number, rows: number, cols: number): number {
  const centerRow = (rows - 1) / 2
  const centerCol = (cols - 1) / 2
  const distance = Math.max(Math.abs(row - centerRow), Math.abs(col - centerCol))
  return (Math.max(rows, cols) - distance) // Invert so outside comes first
}

/**
 * Calculate stagger order for scatter pattern (random but deterministic)
 */
function scatterStaggerOrder(row: number, col: number): number {
  // Use a deterministic hash based on position
  const hash = Math.sin(row * 12.9898 + col * 78.233) * 43758.5453
  return (hash - Math.floor(hash)) * 10
}

/**
 * Calculate stagger order for slide pattern (row by row)
 */
function slideStaggerOrder(row: number, _col: number): number {
  return row
}

// ─── Entrance Animation System ───────────────────────────────────────────────

/**
 * Alien entrance animation system.
 *
 * Manages the animated entrance of aliens at the start of each wave.
 * Aliens fall from above the screen to their formation positions
 * with a bounce easing effect.
 *
 * Usage:
 * ```typescript
 * const entrance = new EntranceAnimation()
 *
 * // When wave starts, initialize with alien positions
 * entrance.start([
 *   { id: 'a1', row: 0, col: 0, targetX: 10, targetY: 5 },
 *   { id: 'a2', row: 0, col: 1, targetX: 17, targetY: 5 },
 *   // ...
 * ])
 *
 * // Each frame:
 * entrance.update()
 * const positions = entrance.getVisualPositions()
 * // Use positions.get(id) to get { visualX, visualY, animState }
 * ```
 */
export class EntranceAnimation {
  private config: EntranceConfig
  private aliens: Map<string, AnimatedAlien> = new Map()
  private tick: number = 0
  private running: boolean = false
  private maxStartTick: number = 0

  constructor(config: Partial<EntranceConfig> = {}) {
    this.config = { ...DEFAULT_ENTRANCE_CONFIG, ...config }
  }

  /**
   * Get the stagger order for an alien based on the current pattern
   */
  private getStaggerOrder(row: number, col: number, rows: number, cols: number): number {
    switch (this.config.pattern) {
      case 'rain':
        return rainStaggerOrder(row, col, cols)
      case 'wave':
        return waveStaggerOrder(row, col)
      case 'spiral':
        return spiralStaggerOrder(row, col, rows, cols)
      case 'scatter':
        return scatterStaggerOrder(row, col)
      case 'slide':
        return slideStaggerOrder(row, col)
      default:
        return rainStaggerOrder(row, col, cols)
    }
  }

  /**
   * Start the entrance animation for a set of aliens
   */
  start(
    aliens: Array<{
      id: string
      row: number
      col: number
      targetX: number
      targetY: number
    }>
  ): void {
    this.aliens.clear()
    this.tick = 0
    this.running = true
    this.maxStartTick = 0

    if (aliens.length === 0) {
      this.running = false
      return
    }

    // Find grid dimensions
    const maxRow = Math.max(...aliens.map((a) => a.row))
    const maxCol = Math.max(...aliens.map((a) => a.col))
    const rows = maxRow + 1
    const cols = maxCol + 1

    // Calculate stagger orders and normalize to ticks
    const orders = aliens.map((a) => ({
      ...a,
      order: this.getStaggerOrder(a.row, a.col, rows, cols),
    }))

    const minOrder = Math.min(...orders.map((o) => o.order))
    const maxOrder = Math.max(...orders.map((o) => o.order))
    const orderRange = maxOrder - minOrder || 1

    // Create animated aliens
    for (const alien of orders) {
      const normalizedOrder = (alien.order - minOrder) / orderRange
      const startTick = Math.floor(normalizedOrder * this.config.staggerDelay * aliens.length)

      this.maxStartTick = Math.max(this.maxStartTick, startTick + this.config.baseDuration)

      const startX = this.config.animateX
        ? alien.targetX + (Math.random() - 0.5) * 20
        : alien.targetX

      this.aliens.set(alien.id, {
        id: alien.id,
        row: alien.row,
        col: alien.col,
        targetX: alien.targetX,
        targetY: alien.targetY,
        visualX: startX,
        visualY: this.config.startY,
        animState: 'entering',
        startTick,
        duration: this.config.baseDuration,
      })
    }
  }

  /**
   * Stop the animation and snap all aliens to formation
   */
  stop(): void {
    this.running = false
    for (const alien of this.aliens.values()) {
      alien.visualX = alien.targetX
      alien.visualY = alien.targetY
      alien.animState = 'formation'
    }
  }

  /**
   * Update all alien animations (call once per frame/tick)
   */
  update(): void {
    if (!this.running) return

    this.tick++

    let allInFormation = true

    for (const alien of this.aliens.values()) {
      if (alien.animState === 'formation') continue

      // Check if animation has started for this alien
      if (this.tick < alien.startTick) {
        allInFormation = false
        continue
      }

      // Calculate progress
      const elapsed = this.tick - alien.startTick
      const progress = clamp(elapsed / alien.duration, 0, 1)
      const easedProgress = this.config.easing(progress)

      // Interpolate position
      alien.visualY = lerp(this.config.startY, alien.targetY, easedProgress)

      if (this.config.animateX) {
        // For X, we use a different easing (smoother)
        const xProgress = easeOutQuad(progress)
        alien.visualX = lerp(alien.visualX, alien.targetX, xProgress * 0.1 + progress * 0.9)
      }

      // Check if animation complete
      if (progress >= 1) {
        alien.visualX = alien.targetX
        alien.visualY = alien.targetY
        alien.animState = 'formation'
      } else {
        allInFormation = false
      }
    }

    // Stop running when all aliens are in formation
    if (allInFormation) {
      this.running = false
    }
  }

  /**
   * Check if the animation is still running
   */
  isRunning(): boolean {
    return this.running
  }

  /**
   * Check if all aliens have reached formation
   */
  isComplete(): boolean {
    if (this.aliens.size === 0) return true
    for (const alien of this.aliens.values()) {
      if (alien.animState !== 'formation') return false
    }
    return true
  }

  /**
   * Get animation state for a specific alien
   */
  getAlienState(id: string): AnimatedAlien | undefined {
    return this.aliens.get(id)
  }

  /**
   * Get visual position for a specific alien.
   * Returns null if alien not found.
   */
  getVisualPosition(id: string): { x: number; y: number; animState: AlienAnimState } | null {
    const alien = this.aliens.get(id)
    if (!alien) return null
    return {
      x: alien.visualX,
      y: alien.visualY,
      animState: alien.animState,
    }
  }

  /**
   * Get all visual positions as a map
   */
  getVisualPositions(): Map<string, { x: number; y: number; animState: AlienAnimState }> {
    const positions = new Map<string, { x: number; y: number; animState: AlienAnimState }>()
    for (const [id, alien] of this.aliens) {
      positions.set(id, {
        x: alien.visualX,
        y: alien.visualY,
        animState: alien.animState,
      })
    }
    return positions
  }

  /**
   * Get current tick
   */
  getTick(): number {
    return this.tick
  }

  /**
   * Get estimated total duration
   */
  getEstimatedDuration(): number {
    return this.maxStartTick
  }

  /**
   * Get overall progress (0-1)
   */
  getProgress(): number {
    if (!this.running || this.maxStartTick === 0) return 1
    return clamp(this.tick / this.maxStartTick, 0, 1)
  }
}

// ─── Preset Configurations ───────────────────────────────────────────────────

/**
 * Rain pattern: aliens fall from top with bounce
 */
export const RAIN_ENTRANCE: Partial<EntranceConfig> = {
  pattern: 'rain',
  baseDuration: 35,
  staggerDelay: 2,
  startY: -4,
  easing: easeOutBounce,
  animateX: false,
}

/**
 * Wave pattern: diagonal entrance
 */
export const WAVE_ENTRANCE: Partial<EntranceConfig> = {
  pattern: 'wave',
  baseDuration: 25,
  staggerDelay: 3,
  startY: -4,
  easing: easeOutQuad,
  animateX: false,
}

/**
 * Scatter pattern: random entrance order
 */
export const SCATTER_ENTRANCE: Partial<EntranceConfig> = {
  pattern: 'scatter',
  baseDuration: 30,
  staggerDelay: 1,
  startY: -4,
  easing: easeOutElastic,
  animateX: true,
}

/**
 * Slide pattern: row by row entrance
 */
export const SLIDE_ENTRANCE: Partial<EntranceConfig> = {
  pattern: 'slide',
  baseDuration: 20,
  staggerDelay: 5,
  startY: -4,
  easing: easeOutQuad,
  animateX: false,
}

/**
 * Create entrance animation with rain pattern (default for game)
 */
export function createRainEntrance(): EntranceAnimation {
  return new EntranceAnimation(RAIN_ENTRANCE)
}

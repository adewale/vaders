// client/src/animation/wipe.ts
// Wave transition wipe effects for screen transitions
//
// Features:
// - Iris wipe (circle close -> title -> circle open)
// - Mask function for visibility testing
// - Half-cell block characters for edge precision
// - State machine for transition phases
// - Multiple wipe patterns (iris, horizontal, vertical)

import { easeInQuad, easeOutQuad, clamp } from './easing'

// ─── Block Characters for Edge Precision ─────────────────────────────────────

/**
 * Half-cell block characters for smoother wipe edges
 */
export const WIPE_BLOCKS = {
  full: '█',
  top: '▀',
  bottom: '▄',
  left: '▌',
  right: '▐',
  empty: ' ',
} as const

/**
 * ASCII fallback blocks
 */
export const WIPE_BLOCKS_ASCII = {
  full: '#',
  top: '^',
  bottom: 'v',
  left: '[',
  right: ']',
  empty: ' ',
} as const

// ─── Wipe Types ──────────────────────────────────────────────────────────────

/**
 * Wipe transition state machine states
 */
export type WipeState = 'idle' | 'exiting' | 'hold' | 'entering'

/**
 * Wipe pattern types
 */
export type WipePattern = 'iris' | 'horizontal' | 'vertical' | 'diagonal' | 'dissolve'

/**
 * Mask function signature: determines if a cell should be visible
 * @param x - Cell X coordinate
 * @param y - Cell Y coordinate
 * @param progress - Transition progress (0-1)
 * @returns true if the cell should be visible (show content), false if masked (show wipe)
 */
export type MaskFunction = (x: number, y: number, progress: number) => boolean

/**
 * Configuration for wipe transitions
 */
export interface WipeConfig {
  /** Screen width in cells */
  width: number
  /** Screen height in cells */
  height: number
  /** Duration of exit phase in ticks */
  exitDuration: number
  /** Duration of hold phase in ticks (title display) */
  holdDuration: number
  /** Duration of enter phase in ticks */
  enterDuration: number
  /** Center X for iris wipe (default: center of screen) */
  centerX?: number
  /** Center Y for iris wipe (default: center of screen) */
  centerY?: number
  /** Wipe pattern to use */
  pattern: WipePattern
  /** Use ASCII characters for blocks */
  useAscii: boolean
  /** Color for the wipe mask */
  maskColor: string
}

/**
 * Default wipe configuration.
 *
 * NOTE: These durations intentionally differ from the server's WIPE_TIMING
 * constants (EXIT_TICKS=60, HOLD_TICKS=90, REVEAL_TICKS=120 in shared/types.ts).
 * The server controls the authoritative status transitions (wipe_exit → wipe_hold
 * → wipe_reveal → playing). This client-side animation is purely visual and runs
 * independently — it just needs to complete within the server's timing window.
 * Shorter durations here ensure the visual effect finishes before the server
 * transitions to the next phase, avoiding visual glitches.
 */
export const DEFAULT_WIPE_CONFIG: WipeConfig = {
  width: 120,
  height: 36,
  exitDuration: 30, // ~1 second at 30fps (server: 60 ticks = 2s)
  holdDuration: 45, // ~1.5 seconds (server: 90 ticks = 3s)
  enterDuration: 30, // ~1 second at 30fps (server: 120 ticks = 4s)
  pattern: 'iris',
  useAscii: false,
  maskColor: '#000000',
}

// ─── Mask Functions ──────────────────────────────────────────────────────────

/**
 * Create an iris (circular) mask function
 * Progress 0 = fully visible, Progress 1 = fully masked
 */
export function createIrisMask(
  centerX: number,
  centerY: number,
  maxRadius: number
): MaskFunction {
  return (x: number, y: number, progress: number): boolean => {
    // Calculate distance from center, accounting for aspect ratio
    // Terminal cells are typically ~2:1 aspect ratio (taller than wide)
    const dx = (x - centerX) * 0.5 // Adjust for aspect ratio
    const dy = y - centerY
    const distance = Math.sqrt(dx * dx + dy * dy)

    // Current radius shrinks as progress increases (closing iris)
    const currentRadius = maxRadius * (1 - progress)

    return distance <= currentRadius
  }
}

/**
 * Create an inverse iris mask (expands from center)
 * Progress 0 = fully masked, Progress 1 = fully visible
 */
export function createIrisOpenMask(
  centerX: number,
  centerY: number,
  maxRadius: number
): MaskFunction {
  return (x: number, y: number, progress: number): boolean => {
    const dx = (x - centerX) * 0.5
    const dy = y - centerY
    const distance = Math.sqrt(dx * dx + dy * dy)

    // Current radius grows as progress increases (opening iris)
    const currentRadius = maxRadius * progress

    return distance <= currentRadius
  }
}

/**
 * Create a horizontal wipe mask (left to right)
 */
export function createHorizontalMask(width: number): MaskFunction {
  return (x: number, _y: number, progress: number): boolean => {
    return x < width * (1 - progress)
  }
}

/**
 * Create a vertical wipe mask (top to bottom)
 */
export function createVerticalMask(height: number): MaskFunction {
  return (_x: number, y: number, progress: number): boolean => {
    return y < height * (1 - progress)
  }
}

/**
 * Create a diagonal wipe mask
 */
export function createDiagonalMask(width: number, height: number): MaskFunction {
  const maxDist = width + height
  return (x: number, y: number, progress: number): boolean => {
    const threshold = maxDist * progress
    return x + y < maxDist - threshold
  }
}

/**
 * Create a dissolve mask (random pixel threshold)
 * Uses deterministic noise based on coordinates
 */
export function createDissolveMask(): MaskFunction {
  return (x: number, y: number, progress: number): boolean => {
    // Simple hash function for deterministic noise
    const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
    const noise = hash - Math.floor(hash)
    return noise > progress
  }
}

// ─── Wipe Transition System ──────────────────────────────────────────────────

/**
 * Cell rendering information for the wipe effect
 */
export interface WipeCell {
  /** Cell X position */
  x: number
  /** Cell Y position */
  y: number
  /** Character to render (block character or empty) */
  char: string
  /** Whether this cell should show game content (true) or wipe mask (false) */
  visible: boolean
  /** Edge type for half-block precision */
  edge: 'none' | 'top' | 'bottom' | 'left' | 'right'
}

/**
 * Wave transition wipe system.
 *
 * Manages screen transitions between waves with:
 * - Iris close effect (game fades to center)
 * - Hold phase for title display
 * - Iris open effect (new wave reveals from center)
 *
 * Usage:
 * ```typescript
 * const wipe = new WipeTransition({ width: 120, height: 36 })
 * wipe.start(2) // Start transition to wave 2
 *
 * // Each frame:
 * wipe.update()
 * if (wipe.isInHold()) {
 *   // Display wave title
 * }
 * const cells = wipe.getMaskCells()
 * // Render mask cells over game content...
 * ```
 */
export class WipeTransition {
  private config: WipeConfig
  private state: WipeState = 'idle'
  private tick: number = 0
  private waveNumber: number = 0
  private closeMask: MaskFunction
  private openMask: MaskFunction
  private blocks: typeof WIPE_BLOCKS | typeof WIPE_BLOCKS_ASCII
  private maxRadius: number

  constructor(config: Partial<WipeConfig> = {}) {
    this.config = { ...DEFAULT_WIPE_CONFIG, ...config }
    this.blocks = this.config.useAscii ? WIPE_BLOCKS_ASCII : WIPE_BLOCKS

    // Calculate max radius for iris wipe
    const cx = this.config.centerX ?? this.config.width / 2
    const cy = this.config.centerY ?? this.config.height / 2
    this.maxRadius = Math.sqrt(
      Math.pow(Math.max(cx, this.config.width - cx) * 0.5, 2) +
      Math.pow(Math.max(cy, this.config.height - cy), 2)
    ) * 1.2 // Extra margin to ensure full coverage

    // Create mask functions based on pattern
    this.closeMask = this.createCloseMask()
    this.openMask = this.createOpenMask()
  }

  /**
   * Create the closing mask function based on pattern
   */
  private createCloseMask(): MaskFunction {
    const cx = this.config.centerX ?? this.config.width / 2
    const cy = this.config.centerY ?? this.config.height / 2

    switch (this.config.pattern) {
      case 'iris':
        return createIrisMask(cx, cy, this.maxRadius)
      case 'horizontal':
        return createHorizontalMask(this.config.width)
      case 'vertical':
        return createVerticalMask(this.config.height)
      case 'diagonal':
        return createDiagonalMask(this.config.width, this.config.height)
      case 'dissolve':
        return createDissolveMask()
      default:
        return createIrisMask(cx, cy, this.maxRadius)
    }
  }

  /**
   * Create the opening mask function based on pattern
   */
  private createOpenMask(): MaskFunction {
    const cx = this.config.centerX ?? this.config.width / 2
    const cy = this.config.centerY ?? this.config.height / 2

    switch (this.config.pattern) {
      case 'iris':
        return createIrisOpenMask(cx, cy, this.maxRadius)
      case 'horizontal':
        // Reverse horizontal wipe
        return (x, y, p) => !createHorizontalMask(this.config.width)(x, y, 1 - p)
      case 'vertical':
        return (x, y, p) => !createVerticalMask(this.config.height)(x, y, 1 - p)
      case 'diagonal':
        return (x, y, p) => !createDiagonalMask(this.config.width, this.config.height)(x, y, 1 - p)
      case 'dissolve':
        return (x, y, p) => !createDissolveMask()(x, y, 1 - p)
      default:
        return createIrisOpenMask(cx, cy, this.maxRadius)
    }
  }

  /**
   * Start a wave transition
   * @param waveNumber - The wave number to display during hold
   * @param reverse - If true, skip exit phase and start from hold (for game start)
   */
  start(waveNumber: number, reverse: boolean = false): void {
    this.waveNumber = waveNumber
    if (reverse) {
      // Skip exit phase, go straight to hold then enter
      this.state = 'hold'
    } else {
      this.state = 'exiting'
    }
    this.tick = 0
  }

  /**
   * Cancel the transition and return to idle
   */
  cancel(): void {
    this.state = 'idle'
    this.tick = 0
  }

  /**
   * Update the transition (call once per frame/tick)
   */
  update(): void {
    if (this.state === 'idle') return

    this.tick++

    // State transitions
    switch (this.state) {
      case 'exiting':
        if (this.tick >= this.config.exitDuration) {
          this.state = 'hold'
          this.tick = 0
        }
        break
      case 'hold':
        if (this.tick >= this.config.holdDuration) {
          this.state = 'entering'
          this.tick = 0
        }
        break
      case 'entering':
        if (this.tick >= this.config.enterDuration) {
          this.state = 'idle'
          this.tick = 0
        }
        break
    }
  }

  /**
   * Get current wipe state
   */
  getState(): WipeState {
    return this.state
  }

  /**
   * Check if wipe is active (not idle)
   */
  isActive(): boolean {
    return this.state !== 'idle'
  }

  /**
   * Check if currently in hold phase (for title display)
   */
  isInHold(): boolean {
    return this.state === 'hold'
  }

  /**
   * Get the wave number being transitioned to
   */
  getWaveNumber(): number {
    return this.waveNumber
  }

  /**
   * Get current transition progress (0-1) within current phase
   */
  getProgress(): number {
    switch (this.state) {
      case 'exiting':
        return clamp(this.tick / this.config.exitDuration, 0, 1)
      case 'hold':
        return 1
      case 'entering':
        return clamp(this.tick / this.config.enterDuration, 0, 1)
      default:
        return 0
    }
  }

  /**
   * Get eased progress with appropriate easing for current phase
   */
  getEasedProgress(): number {
    const progress = this.getProgress()
    switch (this.state) {
      case 'exiting':
        return easeInQuad(progress)
      case 'entering':
        return easeOutQuad(progress)
      default:
        return progress
    }
  }

  /**
   * Check if a specific cell should show game content (visible) or mask
   */
  isCellVisible(x: number, y: number): boolean {
    if (this.state === 'idle') return true
    if (this.state === 'hold') return false // Fully masked during hold

    const progress = this.getEasedProgress()

    if (this.state === 'exiting') {
      // Closing: cells become masked
      return this.closeMask(x, y, progress)
    } else {
      // Opening: cells become visible
      return this.openMask(x, y, progress)
    }
  }

  /**
   * Get cells that should be rendered as mask (wipe overlay).
   * Only returns cells that are masked (not visible).
   */
  getMaskCells(): WipeCell[] {
    if (this.state === 'idle') return []

    const cells: WipeCell[] = []
    const progress = this.getEasedProgress()

    for (let y = 0; y < this.config.height; y++) {
      for (let x = 0; x < this.config.width; x++) {
        const visible = this.isCellVisible(x, y)
        if (!visible) {
          // Check neighbors for edge detection
          const topVisible = y > 0 ? this.isCellVisible(x, y - 1) : false
          const bottomVisible = y < this.config.height - 1 ? this.isCellVisible(x, y + 1) : false
          const leftVisible = x > 0 ? this.isCellVisible(x - 1, y) : false
          const rightVisible = x < this.config.width - 1 ? this.isCellVisible(x + 1, y) : false

          let edge: WipeCell['edge'] = 'none'
          let char: string = this.blocks.full

          // Use half-blocks for edges (smoothing)
          if (topVisible && !bottomVisible) {
            edge = 'top'
            char = this.blocks.bottom // Show bottom half
          } else if (bottomVisible && !topVisible) {
            edge = 'bottom'
            char = this.blocks.top // Show top half
          } else if (leftVisible && !rightVisible) {
            edge = 'left'
            char = this.blocks.right // Show right half
          } else if (rightVisible && !leftVisible) {
            edge = 'right'
            char = this.blocks.left // Show left half
          }

          cells.push({ x, y, char, visible: false, edge })
        }
      }
    }

    return cells
  }

  /**
   * Get current tick count
   */
  getTick(): number {
    return this.tick
  }

  /**
   * Get total duration of the entire transition
   */
  getTotalDuration(): number {
    return (
      this.config.exitDuration +
      this.config.holdDuration +
      this.config.enterDuration
    )
  }

  /**
   * Get mask color
   */
  getMaskColor(): string {
    return this.config.maskColor
  }
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Create a standard iris wipe for wave transitions.
 *
 * Uses shorter durations than DEFAULT_WIPE_CONFIG for snappier wave transitions.
 * Like DEFAULT_WIPE_CONFIG, these are client-side visual durations that run
 * independently from the server's WIPE_TIMING phase durations.
 */
export function createWaveWipe(
  width: number,
  height: number,
  useAscii: boolean = false
): WipeTransition {
  return new WipeTransition({
    width,
    height,
    pattern: 'iris',
    exitDuration: 25,  // Client-only visual (server: 60 ticks)
    holdDuration: 50,  // Client-only visual (server: 90 ticks)
    enterDuration: 25, // Client-only visual (server: 120 ticks)
    useAscii,
    maskColor: '#000000',
  })
}

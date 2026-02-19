// client/src/animation/dissolve.ts
// Braille dissolve/shimmer effects for entity deaths and barrier damage.
//
// Two variants:
// - 'dissolve': Alien/player death — cells scatter outward, density fades
// - 'shimmer': Barrier hit — brief flash near origin, fast fade
//
// Follows the ConfettiSystem pattern: pre-allocated pool, update() + getCells() API.

import { BRAILLE_DENSITY, MAX_DENSITY } from './waveBorder'
import { clamp } from './easing'

// ─── ASCII Fallback ──────────────────────────────────────────────────────────

/** ASCII fallback characters ordered by visual density (heaviest to lightest). */
export const DISSOLVE_ASCII_CHARS = ['#', '%', '*', '.', ' '] as const

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DissolveConfig {
  /** Max concurrent dissolve effects (default: 20) */
  maxEffects: number
  /** Max cells per effect (default: 15) */
  maxCellsPerEffect: number
  /** Default lifetime in ticks for dissolve variant (default: 18 — ~1.3s at 70ms) */
  dissolveLifetime: number
  /** Default lifetime in ticks for shimmer variant (default: 8 — ~0.56s at 70ms) */
  shimmerLifetime: number
  /** Use ASCII characters instead of braille (default: false) */
  useAscii: boolean
  /** Screen width for bounds filtering (default: 120 — STANDARD_WIDTH) */
  screenWidth: number
  /** Screen height for bounds filtering (default: 36 — STANDARD_HEIGHT) */
  screenHeight: number
}

export const DEFAULT_DISSOLVE_CONFIG: DissolveConfig = {
  maxEffects: 20,
  maxCellsPerEffect: 15,
  dissolveLifetime: 18,
  shimmerLifetime: 8,
  useAscii: false,
  screenWidth: 120,
  screenHeight: 36,
}

export type DissolveVariant = 'dissolve' | 'shimmer'

/** A single cell within a dissolve effect. */
interface DissolveCell {
  /** Offset from effect origin x */
  offsetX: number
  /** Offset from effect origin y */
  offsetY: number
  /** Horizontal drift per tick */
  driftX: number
  /** Vertical drift per tick (negative = upward) */
  driftY: number
  /** Ticks before this cell appears */
  delay: number
}

/** A single dissolve/shimmer effect instance. */
export interface DissolveEffect {
  active: boolean
  x: number
  y: number
  width: number
  height: number
  color: string
  variant: DissolveVariant
  tick: number
  lifetime: number
  cells: DissolveCell[]
  cellCount: number
}

/** Output cell for rendering. */
export interface DissolveCellOutput {
  x: number
  y: number
  char: string
  color: string
}

// ─── Seeded Random (for testability) ─────────────────────────────────────────

type RandomFn = () => number

// ─── Shared Constants ────────────────────────────────────────────────────────

/** Shared empty array returned when no effects are active, to avoid allocations. */
const EMPTY_CELLS: DissolveCellOutput[] = []

// ─── DissolveSystem ──────────────────────────────────────────────────────────

export class DissolveSystem {
  private effects: DissolveEffect[]
  private config: DissolveConfig
  private randomFn: RandomFn

  constructor(config: Partial<DissolveConfig> = {}, randomFn?: RandomFn) {
    this.config = { ...DEFAULT_DISSOLVE_CONFIG, ...config }
    this.randomFn = randomFn ?? Math.random

    // Pre-allocate effect pool
    this.effects = Array.from({ length: this.config.maxEffects }, () =>
      this.createInactiveEffect()
    )
  }

  private createInactiveEffect(): DissolveEffect {
    return {
      active: false,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      color: '',
      variant: 'dissolve',
      tick: 0,
      lifetime: 0,
      cells: Array.from({ length: this.config.maxCellsPerEffect }, () => ({
        offsetX: 0,
        offsetY: 0,
        driftX: 0,
        driftY: 0,
        delay: 0,
      })),
      cellCount: 0,
    }
  }

  private random(min: number, max: number): number {
    return min + this.randomFn() * (max - min)
  }

  /**
   * Spawn a dissolve or shimmer effect at the given position.
   * Returns true if the effect was spawned, false if pool is full.
   */
  spawn(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    variant: DissolveVariant,
  ): boolean {
    // Find an inactive slot
    const effect = this.effects.find(e => !e.active)
    if (!effect) return false

    effect.active = true
    effect.x = x
    effect.y = y
    effect.width = width
    effect.height = height
    effect.color = color
    effect.variant = variant
    effect.tick = 0
    effect.lifetime = variant === 'shimmer'
      ? this.config.shimmerLifetime
      : this.config.dissolveLifetime

    // Generate cells based on variant
    const cellCount = variant === 'shimmer'
      ? Math.min(clamp(Math.round(this.random(4, 6)), 4, 6), this.config.maxCellsPerEffect)
      : Math.min(clamp(Math.round(this.random(10, 15)), 10, 15), this.config.maxCellsPerEffect)

    effect.cellCount = cellCount

    for (let i = 0; i < cellCount; i++) {
      const cell = effect.cells[i]

      if (variant === 'shimmer') {
        // Shimmer: cells stay near origin
        cell.offsetX = Math.round(this.random(0, width - 1))
        cell.offsetY = Math.round(this.random(0, height - 1))
        cell.driftX = this.random(-0.1, 0.1)
        cell.driftY = this.random(-0.15, 0.05)
        cell.delay = Math.floor(this.random(0, 2))
      } else {
        // Dissolve: cells scatter outward from sprite footprint
        cell.offsetX = Math.round(this.random(-1, width))
        cell.offsetY = Math.round(this.random(-1, height))
        cell.driftX = this.random(-0.4, 0.4)
        cell.driftY = this.random(-0.5, -0.1) // Upward drift
        cell.delay = Math.floor(this.random(0, 4))
      }
    }

    return true
  }

  /** Advance all active effects by one tick. */
  update(): void {
    for (const effect of this.effects) {
      if (!effect.active) continue
      effect.tick++
      if (effect.tick >= effect.lifetime) {
        effect.active = false
      }
    }
  }

  /** Get all visible cells for rendering. */
  getCells(): DissolveCellOutput[] {
    // Early-out: no allocations when idle
    if (this.getActiveCount() === 0) return EMPTY_CELLS

    const output: DissolveCellOutput[] = []

    for (const effect of this.effects) {
      if (!effect.active) continue

      for (let i = 0; i < effect.cellCount; i++) {
        const cell = effect.cells[i]

        // Skip cells that haven't appeared yet
        if (effect.tick < cell.delay) continue

        const age = effect.tick - cell.delay
        const progress = age / effect.lifetime

        // Density curve: fast initial fade, slow tail
        const densityFrac = Math.pow(1 - clamp(progress, 0, 1), 1.5)
        const densityIndex = Math.round(densityFrac * MAX_DENSITY)

        if (densityIndex <= 0) continue

        // Calculate position with drift
        const x = Math.round(effect.x + cell.offsetX + cell.driftX * age)
        const y = Math.round(effect.y + cell.offsetY + cell.driftY * age)

        // Bounds check: skip cells outside the screen
        if (x < 0 || x >= this.config.screenWidth || y < 0 || y >= this.config.screenHeight) continue

        // Get character
        const char = this.config.useAscii
          ? this.getAsciiChar(densityFrac)
          : BRAILLE_DENSITY[clamp(densityIndex, 0, MAX_DENSITY)]

        output.push({ x, y, char, color: effect.color })
      }
    }

    return output
  }

  private getAsciiChar(densityFrac: number): string {
    // Map density fraction to ASCII chars (index 0 = heaviest, last = lightest)
    const index = Math.round((1 - densityFrac) * (DISSOLVE_ASCII_CHARS.length - 1))
    return DISSOLVE_ASCII_CHARS[clamp(index, 0, DISSOLVE_ASCII_CHARS.length - 1)]
  }

  /** Get count of active effects. */
  getActiveCount(): number {
    return this.effects.filter(e => e.active).length
  }

  /** Get total pool size. */
  getPoolSize(): number {
    return this.effects.length
  }
}

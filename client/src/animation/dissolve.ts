// client/src/animation/dissolve.ts
// Braille dissolve/shimmer effects for entity deaths and barrier damage.
//
// Four variants:
// - 'dissolve': Alien death — cells scatter outward, density fades
// - 'shimmer': Barrier hit — brief flash near origin, fast fade
// - 'shrapnel': Player death — directional debris + gravity arcs
// - 'ufo_explosion': UFO death — flash + expanding ring + sparks + tumbling fragments
//
// Follows the ConfettiSystem pattern: pre-allocated pool, update() + getCells() API.

import { BRAILLE_DENSITY, MAX_DENSITY } from './waveBorder'
import { clamp } from './easing'

// ─── Dissolve Braille Characters ──────────────────────────────────────────────

/**
 * Braille characters for dissolve effects, organized by density level (0-8).
 * Multiple variants per level create scattered debris/spark visuals instead of
 * the monotonous progressive fill of BRAILLE_DENSITY.
 * Cell index modulo variant count selects a stable char per cell (no flicker).
 */
export const DISSOLVE_BRAILLE: readonly (readonly string[])[] = [
  ['\u2800'],                                                         // 0: empty
  ['\u2801', '\u2808', '\u2802', '\u2810', '\u2840', '\u2880'],       // 1: single sparks
  ['\u2881', '\u2848', '\u2822', '\u2814', '\u2821', '\u280A'],       // 2: scattered pairs
  ['\u2851', '\u288A', '\u2861', '\u288C', '\u284A', '\u28A1'],       // 3: triangular scatters
  ['\u2895', '\u286A', '\u2869', '\u2896', '\u2871', '\u288E'],       // 4: checkerboard fragments
  ['\u2873', '\u289E', '\u28AD', '\u28CB', '\u287A', '\u28D5'],       // 5: dense scatters
  ['\u28DB', '\u28ED', '\u28F6', '\u28F3', '\u287D', '\u28EE'],       // 6: near-full, 2 holes
  ['\u28FE', '\u28FD', '\u28FB', '\u28F7', '\u28EF', '\u28DF'],       // 7: near-full, 1 hole
  ['\u28FF'],                                                         // 8: full block
] as const

// ─── Shrapnel & Explosion Braille Characters ────────────────────────────────

/** Single-dot directional chars for shrapnel (indexed by row 0-3, col 0-1). */
export const DIRECTIONAL_DOTS: readonly (readonly string[])[] = [
  ['\u2801', '\u2808'],  // row 0: top-left, top-right
  ['\u2802', '\u2810'],  // row 1
  ['\u2804', '\u2820'],  // row 2
  ['\u2840', '\u2880'],  // row 3: bottom-left, bottom-right
]

/** Medium debris chars (2-3 dots) for gravity debris. */
export const DEBRIS_MEDIUM: readonly string[] = [
  '\u2809', '\u2812', '\u2824', '\u28C0', '\u2803', '\u2818',
]

/** Heavy debris chars (4+ dots) for initial explosion. */
export const DEBRIS_HEAVY: readonly string[] = [
  '\u2813', '\u284B', '\u2869', '\u28C9', '\u2833', '\u28D0',
]

/** Tumbling fragment patterns — each sub-array is a rotation cycle. */
export const TUMBLE_PATTERNS: readonly (readonly string[])[] = [
  ['\u2809', '\u2812', '\u2824', '\u28C0'],  // 2-dot rotation
  ['\u2813', '\u2836', '\u28E4', '\u28C9'],  // 4-dot rotation
  ['\u281B', '\u2833', '\u28E6', '\u28CD'],  // dense rotation
]

// ─── ASCII Fallback ──────────────────────────────────────────────────────────

/** ASCII fallback characters ordered by visual density (heaviest to lightest). */
export const DISSOLVE_ASCII_CHARS = ['#', '%', '*', '.', ' '] as const

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DissolveConfig {
  /** Max concurrent dissolve effects (default: 20) */
  maxEffects: number
  /** Max cells per effect (default: 35) */
  maxCellsPerEffect: number
  /** Default lifetime in ticks for dissolve variant (default: 18 — ~1.3s at 70ms) */
  dissolveLifetime: number
  /** Default lifetime in ticks for shimmer variant (default: 8 — ~0.56s at 70ms) */
  shimmerLifetime: number
  /** Default lifetime in ticks for shrapnel variant (default: 22 — ~1.5s at 70ms) */
  shrapnelLifetime: number
  /** Default lifetime in ticks for ufo_explosion variant (default: 26 — ~1.8s at 70ms) */
  ufoExplosionLifetime: number
  /** Use ASCII characters instead of braille (default: false) */
  useAscii: boolean
  /** Screen width for bounds filtering (default: 120 — STANDARD_WIDTH) */
  screenWidth: number
  /** Screen height for bounds filtering (default: 36 — STANDARD_HEIGHT) */
  screenHeight: number
}

export const DEFAULT_DISSOLVE_CONFIG: DissolveConfig = {
  maxEffects: 20,
  maxCellsPerEffect: 35,
  dissolveLifetime: 18,
  shimmerLifetime: 8,
  shrapnelLifetime: 22,
  ufoExplosionLifetime: 26,
  useAscii: false,
  screenWidth: 120,
  screenHeight: 36,
}

export type DissolveVariant = 'dissolve' | 'shimmer' | 'shrapnel' | 'ufo_explosion'

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
  /** Downward acceleration per tick² (0 = linear drift) */
  gravity: number
  /** Cell size class: 0=spark (single dot), 1=medium (2-3 dots), 2=heavy (4+ dots) */
  mass: number
  /** Rendering layer: 0=normal, 1=ring, 2=flash, 3=spark */
  layer: number
  /** Index into TUMBLE_PATTERNS for fragments (0 = no tumble) */
  tumbleId: number
  /** Fixed braille character (overrides computed char when non-empty) */
  fixedChar: string
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
// Frozen at runtime to prevent accidental mutation (tested in dissolve.test.ts).
// Cast preserves the mutable return type to avoid cascading readonly changes through callers.
const EMPTY_CELLS = Object.freeze([] as DissolveCellOutput[]) as DissolveCellOutput[]

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
        gravity: 0,
        mass: 0,
        layer: 0,
        tumbleId: 0,
        fixedChar: '',
      })),
      cellCount: 0,
    }
  }

  private random(min: number, max: number): number {
    return min + this.randomFn() * (max - min)
  }

  /**
   * Spawn a dissolve or shimmer effect at the given position.
   * For shrapnel/ufo_explosion, pass spriteChars (braille lines of the dying sprite)
   * so the initial flash frame reproduces the exact sprite shape.
   * Returns true if the effect was spawned, false if pool is full.
   */
  spawn(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    variant: DissolveVariant,
    spriteChars?: readonly string[],
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
      : variant === 'shrapnel'
        ? this.config.shrapnelLifetime
        : variant === 'ufo_explosion'
          ? this.config.ufoExplosionLifetime
          : this.config.dissolveLifetime

    // Generate cells based on variant
    if (variant === 'shrapnel') {
      this.spawnShrapnel(effect, width, height, spriteChars)
    } else if (variant === 'ufo_explosion') {
      this.spawnUfoExplosion(effect, width, height, spriteChars)
    } else {
      const cellCount = variant === 'shimmer'
        ? Math.min(clamp(Math.round(this.random(4, 6)), 4, 6), this.config.maxCellsPerEffect)
        : Math.min(clamp(Math.round(this.random(10, 15)), 10, 15), this.config.maxCellsPerEffect)

      effect.cellCount = cellCount

      for (let i = 0; i < cellCount; i++) {
        const cell = effect.cells[i]
        this.resetCell(cell)

        if (variant === 'shimmer') {
          cell.offsetX = Math.round(this.random(0, width - 1))
          cell.offsetY = Math.round(this.random(0, height - 1))
          cell.driftX = this.random(-0.1, 0.1)
          cell.driftY = this.random(-0.15, 0.05)
          cell.delay = Math.floor(this.random(0, 2))
        } else {
          cell.offsetX = Math.round(this.random(-1, width))
          cell.offsetY = Math.round(this.random(-1, height))
          cell.driftX = this.random(-0.4, 0.4)
          cell.driftY = this.random(-0.5, -0.1)
          cell.delay = Math.floor(this.random(0, 4))
        }
      }
    }

    return true
  }

  /** Reset a cell's extended fields to defaults. */
  private resetCell(cell: DissolveCell): void {
    cell.gravity = 0
    cell.mass = 0
    cell.layer = 0
    cell.tumbleId = 0
    cell.fixedChar = ''
  }

  /** Spawn shrapnel effect: sprite flash + directional debris + gravity arcs. */
  private spawnShrapnel(effect: DissolveEffect, width: number, height: number, spriteChars?: readonly string[]): void {
    const cx = width / 2
    const cy = height / 2
    let i = 0

    // Flash cells from actual sprite chars — initial frame reproduces the sprite exactly
    if (spriteChars) {
      for (let row = 0; row < spriteChars.length && i < this.config.maxCellsPerEffect; row++) {
        let col = 0
        for (const ch of spriteChars[row]) {
          if (i >= this.config.maxCellsPerEffect) break
          if (ch !== ' ' && ch !== '\u2800') {
            const cell = effect.cells[i]
            this.resetCell(cell)
            cell.offsetX = col
            cell.offsetY = row
            cell.driftX = 0
            cell.driftY = 0
            cell.delay = 0
            cell.layer = 2 // flash
            cell.fixedChar = ch
            i++
          }
          col++
        }
      }
    }

    const remaining = this.config.maxCellsPerEffect - i
    const heavyCount = Math.min(3, remaining)
    const sparkCount = Math.min(8, remaining - heavyCount)
    const mediumCount = Math.max(0, remaining - heavyCount - sparkCount)

    // Heavy debris — start at center, strong outward drift, slight gravity
    for (let h = 0; h < heavyCount && i < this.config.maxCellsPerEffect; h++, i++) {
      const cell = effect.cells[i]
      this.resetCell(cell)
      const angle = this.random(0, Math.PI * 2)
      cell.offsetX = Math.round(cx)
      cell.offsetY = Math.round(cy)
      cell.driftX = Math.cos(angle) * this.random(0.4, 0.7)
      cell.driftY = Math.sin(angle) * this.random(0.3, 0.5)
      cell.delay = 0
      cell.gravity = 0.02
      cell.mass = 2
    }

    // Medium debris — radial spread, gravity pulls down
    for (let m = 0; m < mediumCount && i < this.config.maxCellsPerEffect; m++, i++) {
      const cell = effect.cells[i]
      this.resetCell(cell)
      const angle = this.random(0, Math.PI * 2)
      const dist = this.random(0, Math.max(width, height) * 0.5)
      cell.offsetX = Math.round(cx + Math.cos(angle) * dist * 0.5)
      cell.offsetY = Math.round(cy + Math.sin(angle) * dist * 0.3)
      cell.driftX = Math.cos(angle) * this.random(0.2, 0.5)
      cell.driftY = Math.sin(angle) * this.random(0.1, 0.3) - 0.15
      cell.delay = Math.floor(this.random(0, 3))
      cell.gravity = 0.04
      cell.mass = 1
    }

    // Sparks — fast single-dot outward, no gravity
    for (let s = 0; s < sparkCount && i < this.config.maxCellsPerEffect; s++, i++) {
      const cell = effect.cells[i]
      this.resetCell(cell)
      const angle = this.random(0, Math.PI * 2)
      cell.offsetX = Math.round(cx)
      cell.offsetY = Math.round(cy)
      cell.driftX = Math.cos(angle) * this.random(0.5, 0.9)
      cell.driftY = Math.sin(angle) * this.random(0.3, 0.6)
      cell.delay = Math.floor(this.random(1, 4))
      cell.layer = 3 // spark
    }

    effect.cellCount = i
  }

  /** Spawn UFO explosion: flash + expanding ring + sparks + tumbling fragments. */
  private spawnUfoExplosion(effect: DissolveEffect, width: number, height: number, spriteChars?: readonly string[]): void {
    const cx = width / 2
    const cy = height / 2
    let i = 0

    // Flash cells from actual sprite chars — initial frame reproduces the sprite exactly
    if (spriteChars) {
      for (let row = 0; row < spriteChars.length && i < this.config.maxCellsPerEffect; row++) {
        let col = 0
        for (const ch of spriteChars[row]) {
          if (i >= this.config.maxCellsPerEffect) break
          if (ch !== ' ' && ch !== '\u2800') {
            const cell = effect.cells[i]
            this.resetCell(cell)
            cell.offsetX = col
            cell.offsetY = row
            cell.driftX = 0
            cell.driftY = 0
            cell.delay = 0
            cell.layer = 2 // flash
            cell.fixedChar = ch
            i++
          }
          col++
        }
      }
    } else {
      // Fallback: generic flash cells when no sprite chars provided
      for (let f = 0; f < 7 && i < this.config.maxCellsPerEffect; f++, i++) {
        const cell = effect.cells[i]
        this.resetCell(cell)
        cell.offsetX = Math.round(this.random(0, width - 1))
        cell.offsetY = Math.round(this.random(0, height - 1))
        cell.driftX = 0
        cell.driftY = 0
        cell.delay = 0
        cell.layer = 2 // flash
      }
    }

    const remaining = this.config.maxCellsPerEffect - i
    const ringCount = Math.min(8, remaining)
    const sparkCount = Math.min(8, remaining - ringCount)
    const fragCount = Math.min(5, remaining - ringCount - sparkCount)

    // Ring cells — expand outward radially from center
    for (let r = 0; r < ringCount && i < this.config.maxCellsPerEffect; r++, i++) {
      const cell = effect.cells[i]
      this.resetCell(cell)
      const angle = (r / ringCount) * Math.PI * 2
      cell.offsetX = Math.round(cx)
      cell.offsetY = Math.round(cy)
      cell.driftX = Math.cos(angle) * 0.6
      cell.driftY = Math.sin(angle) * 0.35 // aspect ratio compensation
      cell.delay = 1
      cell.layer = 1 // ring
    }

    // Sparks — random fast outward
    for (let s = 0; s < sparkCount && i < this.config.maxCellsPerEffect; s++, i++) {
      const cell = effect.cells[i]
      this.resetCell(cell)
      const angle = this.random(0, Math.PI * 2)
      cell.offsetX = Math.round(cx + this.random(-1, 1))
      cell.offsetY = Math.round(cy)
      cell.driftX = Math.cos(angle) * this.random(0.4, 0.8)
      cell.driftY = Math.sin(angle) * this.random(0.2, 0.5)
      cell.delay = Math.floor(this.random(2, 4))
      cell.layer = 3 // spark
    }

    // Fragments — slow outward + gravity, tumble
    for (let f = 0; f < fragCount && i < this.config.maxCellsPerEffect; f++, i++) {
      const cell = effect.cells[i]
      this.resetCell(cell)
      const angle = this.random(0, Math.PI * 2)
      cell.offsetX = Math.round(cx + this.random(-1, 1))
      cell.offsetY = Math.round(cy)
      cell.driftX = Math.cos(angle) * this.random(0.15, 0.35)
      cell.driftY = Math.sin(angle) * this.random(0.05, 0.2) - 0.1
      cell.delay = Math.floor(this.random(1, 3))
      cell.gravity = 0.05
      cell.mass = 2
      cell.tumbleId = (f % TUMBLE_PATTERNS.length) + 1
    }

    effect.cellCount = i
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

  /** Get all visible cells for rendering. Deduplicates by (x,y), keeping the highest density. */
  getCells(): DissolveCellOutput[] {
    // Early-out: no allocations when idle
    if (this.getActiveCount() === 0) return EMPTY_CELLS

    // Deduplicate by position: when multiple effects produce cells at the same
    // (x,y), keep the highest-density one. This prevents duplicate React keys
    // which cause ghost elements that never get cleaned up.
    const deduped = new Map<number, DissolveCellOutput>()

    for (const effect of this.effects) {
      if (!effect.active) continue

      for (let i = 0; i < effect.cellCount; i++) {
        const cell = effect.cells[i]

        // Skip cells that haven't appeared yet
        if (effect.tick < cell.delay) continue

        const age = effect.tick - cell.delay

        // Flash cells (layer=2) fade after 3 ticks — quick initial burst
        if (cell.layer === 2 && age > 3) continue

        const progress = age / effect.lifetime

        // Density curve: fast initial fade, slow tail
        const densityFrac = Math.pow(1 - clamp(progress, 0, 1), 1.5)
        const densityIndex = Math.round(densityFrac * MAX_DENSITY)

        if (densityIndex <= 0) continue

        // Calculate position with drift + gravity
        const x = Math.round(effect.x + cell.offsetX + cell.driftX * age)
        const y = Math.round(effect.y + cell.offsetY + cell.driftY * age + 0.5 * cell.gravity * age * age)

        // Bounds check: skip cells outside the screen
        if (x < 0 || x >= this.config.screenWidth || y < 0 || y >= this.config.screenHeight) continue

        // Get character — variant-specific rendering
        const char = this.config.useAscii
          ? this.getAsciiChar(densityFrac)
          : this.getVariantChar(cell, densityIndex, i, age)

        // Deduplicate: pack (x,y) into a single number key for fast Map lookup
        const key = y * this.config.screenWidth + x
        const existing = deduped.get(key)
        if (!existing || char.charCodeAt(0) > existing.char.charCodeAt(0)) {
          deduped.set(key, { x, y, char, color: effect.color })
        }
      }
    }

    return Array.from(deduped.values())
  }

  /** Select the right braille char based on cell properties. */
  private getVariantChar(cell: DissolveCell, densityIndex: number, cellIndex: number, age: number): string {
    // Fixed char (e.g. flash cells with actual sprite braille chars)
    if (cell.fixedChar) {
      return cell.fixedChar
    }

    // Flash layer without fixedChar: full block fallback
    if (cell.layer === 2) {
      return DISSOLVE_BRAILLE[MAX_DENSITY][0]
    }

    // Ring layer: directional dot based on drift angle
    if (cell.layer === 1) {
      return this.getDirectionalDot(cell.driftX, cell.driftY)
    }

    // Heavy with tumble: rotating fragment pattern
    if (cell.mass === 2 && cell.tumbleId > 0) {
      const pattern = TUMBLE_PATTERNS[cell.tumbleId - 1]
      return pattern[age % pattern.length]
    }

    // Medium debris
    if (cell.mass === 1) {
      return DEBRIS_MEDIUM[cellIndex % DEBRIS_MEDIUM.length]
    }

    // Heavy debris (no tumble)
    if (cell.mass === 2) {
      return DEBRIS_HEAVY[cellIndex % DEBRIS_HEAVY.length]
    }

    // Spark: single directional dot
    if (cell.layer === 3) {
      return this.getDirectionalDot(cell.driftX, cell.driftY)
    }

    // Default: density-based dissolve
    return this.getDissolveBraille(densityIndex, cellIndex)
  }

  /** Get a single-dot directional braille char based on drift direction. */
  private getDirectionalDot(dx: number, dy: number): string {
    const col = dx >= 0 ? 1 : 0
    // Map vertical drift to 4 rows (dy < 0 = upward = top rows)
    const row = clamp(Math.floor((dy + 0.5) * 4), 0, 3)
    return DIRECTIONAL_DOTS[row][col]
  }

  private getDissolveBraille(densityIndex: number, cellIndex: number): string {
    const level = DISSOLVE_BRAILLE[clamp(densityIndex, 0, MAX_DENSITY)]
    return level[cellIndex % level.length]
  }

  private getAsciiChar(densityFrac: number): string {
    // Map density fraction to ASCII chars (index 0 = heaviest, last = lightest)
    const index = Math.round((1 - densityFrac) * (DISSOLVE_ASCII_CHARS.length - 1))
    return DISSOLVE_ASCII_CHARS[clamp(index, 0, DISSOLVE_ASCII_CHARS.length - 1)]
  }

  /** Get count of active effects. */
  getActiveCount(): number {
    let count = 0
    for (const effect of this.effects) {
      if (effect.active) count++
    }
    return count
  }

  /** Get total pool size. */
  getPoolSize(): number {
    return this.effects.length
  }
}

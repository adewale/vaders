// client/src/animation/waveBorder.ts
// Animated braille border for wave announce screen.
//
// Three layers combined:
// 1. Snake trails orbiting the border perimeter clockwise
// 2. Heartbeat pulse modulating all border cell density
// 3. Radial ripple expanding from center toward the border

import { clamp } from './easing'
import { interpolateGradient, getWaveGradient } from '../gradient'

// ─── Braille Density Table ──────────────────────────────────────────────────

/** Braille characters ordered by visual density (0-8 dots filled). */
export const BRAILLE_DENSITY = [
  '\u2800', // ⠀ empty (0 dots)
  '\u2801', // ⠁ (1 dot)
  '\u2803', // ⠃ (2 dots)
  '\u2807', // ⠇ (3 dots)
  '\u2847', // ⡇ (4 dots)
  '\u28C7', // ⣇ (5 dots)
  '\u28E7', // ⣧ (6 dots)
  '\u28F7', // ⣷ (7 dots)
  '\u28FF', // ⣿ (8 dots - full)
] as const

export const MAX_DENSITY = BRAILLE_DENSITY.length - 1 // 8

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WaveBorderConfig {
  /** Outer box width (chars) */
  boxWidth: number
  /** Outer box height (lines) */
  boxHeight: number
  /** Wave number — affects snake count, speed, heartbeat rate */
  waveNumber: number
  /** Width of the digit art content area */
  contentWidth: number
  /** Height of the digit art content area */
  contentHeight: number
  /** Padding between content and border */
  innerPadding: number
}

/** A single cell to render. */
export interface BorderCell {
  x: number
  y: number
  char: string
  color: string
}

interface Snake {
  /** Fractional position along the perimeter (0 to perimeterLength-1) */
  position: number
}

interface Ripple {
  /** Current radius in cells */
  radius: number
  /** Intensity (1.0 at spawn, fades as it expands) */
  intensity: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_SNAKES = 6
const SNAKE_TAIL_LENGTH = 5
const MIN_SPEED = 0.5
const SPEED_PER_WAVE = 0.1
const MAX_SPEED = 2.0

const HEARTBEAT_MAX_PERIOD_MS = 1200
const HEARTBEAT_MIN_PERIOD_MS = 600
const HEARTBEAT_PERIOD_PER_WAVE_MS = 50
const HEARTBEAT_RESTING = 0.3
const HEARTBEAT_PEAK = 1.0

const RIPPLE_SPEED = 1.5       // cells per tick
const RIPPLE_RING_WIDTH = 2.0  // how thick the ring appears
const RIPPLE_MIN_INTENSITY = 0.15 // minimum intensity when ripple reaches border

/** Terminal cells are ~2:1 aspect ratio (taller than wide). */
export const ASPECT_RATIO = 0.5

/** Per-wave rainbow color palette. Each entry is [borderColor, rippleColor]. */
export const WAVE_COLORS: readonly [string, string][] = [
  ['#ff0000', '#ff6666'], // Wave 1: Red
  ['#ff8800', '#ffbb44'], // Wave 2: Orange
  ['#ffff00', '#ffff88'], // Wave 3: Yellow
  ['#00ff00', '#66ff66'], // Wave 4: Green
  ['#00ffff', '#88ffff'], // Wave 5: Cyan
  ['#5555ff', '#8888ff'], // Wave 6: Blue
  ['#8800ff', '#bb66ff'], // Wave 7: Indigo
  ['#ff00ff', '#ff88ff'], // Wave 8: Magenta
]

// ─── WaveBorderAnimation ────────────────────────────────────────────────────

export class WaveBorderAnimation {
  private config: WaveBorderConfig
  private tick = 0

  // Perimeter cells in clockwise order
  private perimeter: Array<{ x: number; y: number }> = []

  // Snake state
  private snakes: Snake[] = []
  private snakeSpeed: number
  private snakeCount: number

  // Heartbeat state
  private heartbeatPeriodTicks: number
  private heartbeatPhase = 0 // 0 to 1

  // Ripple state
  private ripples: Ripple[] = []
  private centerX: number
  private centerY: number
  private maxRippleRadius: number
  private rippleFade: number

  // Per-wave colors
  private borderColor: string
  private rippleGradient: string[]

  // Content bounding box (to avoid rendering ripples over digits)
  private contentLeft: number
  private contentTop: number
  private contentRight: number
  private contentBottom: number

  constructor(config: WaveBorderConfig) {
    this.config = config

    // Select wave colors from rainbow palette
    const colorIndex = ((config.waveNumber - 1) % WAVE_COLORS.length + WAVE_COLORS.length) % WAVE_COLORS.length
    const [waveBorder] = WAVE_COLORS[colorIndex]
    this.borderColor = waveBorder

    // Ripple gradient: same colors as the digit art, interpolated across box width
    const gradientStops = getWaveGradient(config.waveNumber)
    this.rippleGradient = interpolateGradient(gradientStops, Math.max(1, config.boxWidth))

    this.buildPerimeter()

    // Snakes
    this.snakeCount = Math.min(Math.max(config.waveNumber, 1), MAX_SNAKES)
    this.snakeSpeed = clamp(MIN_SPEED + config.waveNumber * SPEED_PER_WAVE, MIN_SPEED, MAX_SPEED)
    this.snakes = []
    const spacing = this.perimeter.length / this.snakeCount
    for (let i = 0; i < this.snakeCount; i++) {
      this.snakes.push({ position: i * spacing })
    }

    // Heartbeat timing (convert ms to ticks at ~70ms per tick)
    const tickMs = 70
    const periodMs = clamp(
      HEARTBEAT_MAX_PERIOD_MS - config.waveNumber * HEARTBEAT_PERIOD_PER_WAVE_MS,
      HEARTBEAT_MIN_PERIOD_MS,
      HEARTBEAT_MAX_PERIOD_MS,
    )
    this.heartbeatPeriodTicks = Math.max(1, Math.round(periodMs / tickMs))

    // Center of the box (for ripple origin)
    this.centerX = config.boxWidth / 2
    this.centerY = config.boxHeight / 2

    // Content bounding box
    this.contentLeft = Math.floor((config.boxWidth - config.contentWidth) / 2)
    this.contentTop = Math.floor((config.boxHeight - config.contentHeight) / 2)
    this.contentRight = this.contentLeft + config.contentWidth
    this.contentBottom = this.contentTop + config.contentHeight

    // Max ripple radius = distance from center to corner (aspect-corrected)
    const cornerDx = (config.boxWidth / 2) * ASPECT_RATIO
    const cornerDy = config.boxHeight / 2
    this.maxRippleRadius = Math.sqrt(cornerDx * cornerDx + cornerDy * cornerDy)

    // Calculate fade rate so ripples reach the farthest border point with visible intensity.
    // After N ticks: intensity = fade^N. We want fade^N >= RIPPLE_MIN_INTENSITY
    // where N = maxRippleRadius / RIPPLE_SPEED.
    const ticksToReachBorder = Math.ceil(this.maxRippleRadius / RIPPLE_SPEED)
    this.rippleFade = Math.pow(RIPPLE_MIN_INTENSITY, 1 / Math.max(1, ticksToReachBorder))
  }

  /** Build the ordered perimeter cells (clockwise from top-left). */
  private buildPerimeter(): void {
    const { boxWidth: w, boxHeight: h } = this.config
    this.perimeter = []
    // Top edge: left to right
    for (let x = 0; x < w; x++) this.perimeter.push({ x, y: 0 })
    // Right edge: top+1 to bottom-1
    for (let y = 1; y < h - 1; y++) this.perimeter.push({ x: w - 1, y })
    // Bottom edge: right to left
    for (let x = w - 1; x >= 0; x--) this.perimeter.push({ x, y: h - 1 })
    // Left edge: bottom-1 to top+1
    for (let y = h - 2; y >= 1; y--) this.perimeter.push({ x: 0, y })
  }

  /** Advance animation by one frame. */
  update(): void {
    this.tick++

    // Advance snakes
    for (const snake of this.snakes) {
      snake.position = (snake.position + this.snakeSpeed) % this.perimeter.length
    }

    // Advance heartbeat phase
    this.heartbeatPhase = (this.tick % this.heartbeatPeriodTicks) / this.heartbeatPeriodTicks

    // Spawn ripple on heartbeat peak (first beat of double-pulse)
    if (this.tick % this.heartbeatPeriodTicks === 0) {
      this.ripples.push({ radius: 0, intensity: 1.0 })
    }

    // Advance ripples
    for (const ripple of this.ripples) {
      ripple.radius += RIPPLE_SPEED
      ripple.intensity *= this.rippleFade
    }

    // Cull expired ripples (in-place swap to avoid allocation)
    let writeIdx = 0
    for (let i = 0; i < this.ripples.length; i++) {
      const r = this.ripples[i]
      if (r.radius < this.maxRippleRadius && r.intensity > 0.05) {
        this.ripples[writeIdx++] = r
      }
    }
    this.ripples.length = writeIdx
  }

  /** Get all cells to render for the current frame. */
  getCells(): BorderCell[] {
    const cells: BorderCell[] = []
    const heartbeatMul = this.getHeartbeatMultiplier()

    // --- Border cells ---
    const borderDensity = new Float32Array(this.perimeter.length)

    // Layer 1: snake trails
    for (const snake of this.snakes) {
      for (let t = 0; t <= SNAKE_TAIL_LENGTH; t++) {
        let idx = Math.round(snake.position - t)
        if (idx < 0) idx += this.perimeter.length
        idx = idx % this.perimeter.length
        const tailFactor = 1 - t / (SNAKE_TAIL_LENGTH + 1)
        borderDensity[idx] = Math.max(borderDensity[idx], tailFactor * MAX_DENSITY)
      }
    }

    // Layer 2: heartbeat pulse — modulate all border densities
    for (let i = 0; i < borderDensity.length; i++) {
      // Blend: snake density at full, empty cells get heartbeat glow
      const snakeDensity = borderDensity[i]
      if (snakeDensity > 0) {
        borderDensity[i] = clamp(snakeDensity * heartbeatMul, 0, MAX_DENSITY)
      } else {
        // Empty border cells get a faint pulse
        borderDensity[i] = heartbeatMul > 0.6 ? (heartbeatMul - 0.6) * 2 * MAX_DENSITY * 0.3 : 0
      }
    }

    // Layer 3: ripple hitting the border — boost density where ripple wavefront is near
    for (const ripple of this.ripples) {
      for (let i = 0; i < this.perimeter.length; i++) {
        const cell = this.perimeter[i]
        const dx = (cell.x - this.centerX) * ASPECT_RATIO // aspect ratio correction
        const dy = cell.y - this.centerY
        const dist = Math.sqrt(dx * dx + dy * dy)
        const ringDist = Math.abs(dist - ripple.radius)
        if (ringDist < RIPPLE_RING_WIDTH) {
          const boost = (1 - ringDist / RIPPLE_RING_WIDTH) * ripple.intensity * MAX_DENSITY
          borderDensity[i] = clamp(borderDensity[i] + boost, 0, MAX_DENSITY)
        }
      }
    }

    // Ensure border outline is always faintly visible
    for (let i = 0; i < borderDensity.length; i++) {
      borderDensity[i] = Math.max(1, borderDensity[i])
    }

    // Emit border cells
    for (let i = 0; i < this.perimeter.length; i++) {
      const density = Math.round(borderDensity[i])
      if (density <= 0) continue
      const { x, y } = this.perimeter[i]
      cells.push({
        x,
        y,
        char: BRAILLE_DENSITY[clamp(density, 0, MAX_DENSITY)],
        color: this.borderColor,
      })
    }

    // --- Interior ripple cells ---
    for (const ripple of this.ripples) {
      if (ripple.intensity < 0.05) continue
      // Scan the interior area (between border and content)
      for (let y = 1; y < this.config.boxHeight - 1; y++) {
        for (let x = 1; x < this.config.boxWidth - 1; x++) {
          // Skip content area
          if (
            x >= this.contentLeft && x < this.contentRight &&
            y >= this.contentTop && y < this.contentBottom
          ) {
            continue
          }
          const dx = (x - this.centerX) * ASPECT_RATIO // aspect ratio
          const dy = y - this.centerY
          const dist = Math.sqrt(dx * dx + dy * dy)
          const ringDist = Math.abs(dist - ripple.radius)
          if (ringDist < RIPPLE_RING_WIDTH) {
            const density = Math.round(
              (1 - ringDist / RIPPLE_RING_WIDTH) * ripple.intensity * MAX_DENSITY,
            )
            if (density > 0) {
              cells.push({
                x,
                y,
                char: BRAILLE_DENSITY[clamp(density, 0, MAX_DENSITY)],
                color: this.rippleGradient[x],
              })
            }
          }
        }
      }
    }

    // Deduplicate cells by (x,y), keeping the highest density cell
    const deduped = new Map<string, BorderCell>()
    for (const cell of cells) {
      const key = `${cell.x},${cell.y}`
      const existing = deduped.get(key)
      if (!existing) {
        deduped.set(key, cell)
      } else {
        // Keep the cell with higher braille density (more dots = later in BRAILLE_DENSITY)
        if (cell.char.charCodeAt(0) > existing.char.charCodeAt(0)) {
          deduped.set(key, cell)
        }
      }
    }
    return Array.from(deduped.values())
  }

  /** Double-pulse heartbeat: two peaks per cycle. */
  private getHeartbeatMultiplier(): number {
    const p = this.heartbeatPhase
    // First beat: phase 0.0 - 0.15
    if (p < 0.15) {
      const t = p / 0.15
      return HEARTBEAT_RESTING + (HEARTBEAT_PEAK - HEARTBEAT_RESTING) * Math.sin(t * Math.PI)
    }
    // Second beat: phase 0.25 - 0.40
    if (p >= 0.25 && p < 0.40) {
      const t = (p - 0.25) / 0.15
      return HEARTBEAT_RESTING + (HEARTBEAT_PEAK - HEARTBEAT_RESTING) * 0.7 * Math.sin(t * Math.PI)
    }
    // Resting
    return HEARTBEAT_RESTING
  }

  /** Reset to initial state. */
  reset(): void {
    this.tick = 0
    this.heartbeatPhase = 0
    this.ripples = []
    const spacing = this.perimeter.length / this.snakeCount
    for (let i = 0; i < this.snakeCount; i++) {
      this.snakes[i].position = i * spacing
    }
  }

  getTick(): number {
    return this.tick
  }

  getSnakeCount(): number {
    return this.snakeCount
  }

  getHeartbeatPeriodTicks(): number {
    return this.heartbeatPeriodTicks
  }

  getPerimeterLength(): number {
    return this.perimeter.length
  }
}

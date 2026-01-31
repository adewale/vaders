// client/src/animation/confetti.ts
// Confetti particle system for victory celebrations
//
// Features:
// - Pre-allocated particle pool for performance
// - Gravity and friction physics
// - Multiple spawn origins with staggered timing
// - Celebration-themed characters and colors

import { clamp } from './easing'

// ─── Confetti Characters ─────────────────────────────────────────────────────

/**
 * Particle characters for confetti - mix of block and star shapes
 */
export const CONFETTI_CHARS = ['█', '▓', '▒', '●', '◆', '★', '✦', '✧'] as const

/**
 * ASCII fallback characters for terminals without Unicode
 */
export const CONFETTI_CHARS_ASCII = ['#', '%', '*', 'o', '+', 'x', '.', '*'] as const

/**
 * Bright celebration colors (hex values)
 */
export const CONFETTI_COLORS = [
  '#ff5555', // Red
  '#ffaa00', // Orange
  '#ffff55', // Yellow
  '#55ff55', // Green
  '#55ffff', // Cyan
  '#5555ff', // Blue
  '#ff55ff', // Magenta
  '#ffffff', // White
] as const

// ─── Particle Types ──────────────────────────────────────────────────────────

/**
 * Single confetti particle
 */
export interface ConfettiParticle {
  /** Current X position (float for smooth movement) */
  x: number
  /** Current Y position (float for smooth movement) */
  y: number
  /** Horizontal velocity */
  vx: number
  /** Vertical velocity */
  vy: number
  /** Particle character */
  char: string
  /** Particle color (hex) */
  color: string
  /** Remaining lifetime in ticks */
  life: number
  /** Maximum lifetime (for fading) */
  maxLife: number
  /** Whether particle is currently active */
  active: boolean
  /** Rotation/wobble phase */
  phase: number
}

/**
 * Spawn origin for confetti burst
 */
export interface ConfettiOrigin {
  /** X coordinate (center of burst) */
  x: number
  /** Y coordinate (center of burst) */
  y: number
  /** Delay in ticks before spawning */
  delayTicks: number
  /** Number of particles to spawn */
  count: number
  /** Has this origin spawned yet? */
  spawned: boolean
}

/**
 * Configuration for the confetti system
 */
export interface ConfettiConfig {
  /** Gravity acceleration (positive = down) */
  gravity: number
  /** Velocity friction multiplier (0-1, applied each tick) */
  friction: number
  /** Initial upward velocity range [min, max] */
  initialVelocityY: [number, number]
  /** Initial horizontal velocity range [min, max] */
  initialVelocityX: [number, number]
  /** Particle lifetime range in ticks [min, max] */
  lifetime: [number, number]
  /** Maximum particle pool size */
  maxParticles: number
  /** Particles to spawn per origin burst */
  particlesPerBurst: number
  /** Use ASCII characters (for compatibility) */
  useAscii: boolean
}

/**
 * Default confetti configuration
 */
export const DEFAULT_CONFETTI_CONFIG: ConfettiConfig = {
  gravity: 0.12,
  friction: 0.985,
  initialVelocityY: [-2.5, -1.0],
  initialVelocityX: [-1.5, 1.5],
  lifetime: [80, 150],
  maxParticles: 150,
  particlesPerBurst: 25,
  useAscii: false,
}

// ─── Confetti System ─────────────────────────────────────────────────────────

/**
 * Confetti particle system for victory celebrations.
 *
 * Usage:
 * ```typescript
 * const confetti = new ConfettiSystem({ width: 120, height: 36 })
 * confetti.start() // Begins the confetti burst
 *
 * // Each frame:
 * confetti.update()
 * const particles = confetti.getVisibleParticles()
 * // Render particles...
 * ```
 */
export class ConfettiSystem {
  private particles: ConfettiParticle[] = []
  private origins: ConfettiOrigin[] = []
  private config: ConfettiConfig
  private tick: number = 0
  private running: boolean = false
  private screenWidth: number
  private screenHeight: number
  private chars: readonly string[]

  constructor(
    options: { width: number; height: number },
    config: Partial<ConfettiConfig> = {}
  ) {
    this.screenWidth = options.width
    this.screenHeight = options.height
    this.config = { ...DEFAULT_CONFETTI_CONFIG, ...config }
    this.chars = this.config.useAscii ? CONFETTI_CHARS_ASCII : CONFETTI_CHARS

    // Pre-allocate particle pool
    this.particles = Array.from({ length: this.config.maxParticles }, () =>
      this.createInactiveParticle()
    )
  }

  /**
   * Create an inactive particle for the pool
   */
  private createInactiveParticle(): ConfettiParticle {
    return {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      char: this.chars[0],
      color: CONFETTI_COLORS[0],
      life: 0,
      maxLife: 0,
      active: false,
      phase: 0,
    }
  }

  /**
   * Get a particle from the pool (or null if pool exhausted)
   */
  private getParticleFromPool(): ConfettiParticle | null {
    for (const particle of this.particles) {
      if (!particle.active) {
        return particle
      }
    }
    return null
  }

  /**
   * Random number in range [min, max]
   */
  private random(min: number, max: number): number {
    return min + Math.random() * (max - min)
  }

  /**
   * Random integer in range [min, max]
   */
  private randomInt(min: number, max: number): number {
    return Math.floor(this.random(min, max + 1))
  }

  /**
   * Pick random item from array
   */
  private randomPick<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)]
  }

  /**
   * Spawn a burst of particles at the given origin
   */
  private spawnBurst(origin: ConfettiOrigin): void {
    const count = Math.min(
      origin.count,
      this.particles.filter((p) => !p.active).length
    )

    for (let i = 0; i < count; i++) {
      const particle = this.getParticleFromPool()
      if (!particle) break

      const angle = this.random(-Math.PI, 0) // Upper half circle
      const speed = this.random(1.0, 2.5)

      particle.x = origin.x + this.random(-2, 2)
      particle.y = origin.y
      particle.vx =
        Math.cos(angle) * speed +
        this.random(this.config.initialVelocityX[0], this.config.initialVelocityX[1])
      particle.vy = Math.sin(angle) * speed + this.random(this.config.initialVelocityY[0], this.config.initialVelocityY[1])
      particle.char = this.randomPick(this.chars)
      particle.color = this.randomPick(CONFETTI_COLORS)
      particle.maxLife = this.randomInt(
        this.config.lifetime[0],
        this.config.lifetime[1]
      )
      particle.life = particle.maxLife
      particle.active = true
      particle.phase = this.random(0, Math.PI * 2)
    }
  }

  /**
   * Start the confetti celebration.
   * Creates spawn origins across the screen with staggered timing.
   */
  start(): void {
    this.tick = 0
    this.running = true

    // Reset all particles
    for (const particle of this.particles) {
      particle.active = false
    }

    // Create spawn origins across the screen
    // Multiple bursts from different horizontal positions
    const originCount = 5
    const spacing = this.screenWidth / (originCount + 1)

    this.origins = []
    for (let i = 0; i < originCount; i++) {
      this.origins.push({
        x: spacing * (i + 1),
        y: this.screenHeight - 3, // Near bottom
        delayTicks: i * 8, // Stagger by 8 ticks
        count: this.config.particlesPerBurst,
        spawned: false,
      })
    }

    // Add a second wave from the top
    for (let i = 0; i < 3; i++) {
      this.origins.push({
        x: spacing * (i * 2 + 1),
        y: 2,
        delayTicks: 30 + i * 10,
        count: Math.floor(this.config.particlesPerBurst * 0.7),
        spawned: false,
      })
    }
  }

  /**
   * Stop the confetti system
   */
  stop(): void {
    this.running = false
    for (const particle of this.particles) {
      particle.active = false
    }
    this.origins = []
  }

  /**
   * Check if the confetti system is currently running
   */
  isRunning(): boolean {
    return this.running
  }

  /**
   * Check if any particles are still visible
   */
  hasVisibleParticles(): boolean {
    return this.particles.some((p) => p.active)
  }

  /**
   * Update all particles (call once per frame/tick)
   */
  update(): void {
    if (!this.running) return

    this.tick++

    // Check for origins that should spawn
    for (const origin of this.origins) {
      if (!origin.spawned && this.tick >= origin.delayTicks) {
        this.spawnBurst(origin)
        origin.spawned = true
      }
    }

    // Update active particles
    for (const particle of this.particles) {
      if (!particle.active) continue

      // Apply physics
      particle.vy += this.config.gravity
      particle.vx *= this.config.friction
      particle.vy *= this.config.friction

      particle.x += particle.vx
      particle.y += particle.vy

      // Update phase for wobble effect
      particle.phase += 0.15

      // Decrease lifetime
      particle.life--

      // Deactivate if out of bounds or lifetime expired
      if (
        particle.life <= 0 ||
        particle.x < -2 ||
        particle.x > this.screenWidth + 2 ||
        particle.y > this.screenHeight + 2
      ) {
        particle.active = false
      }
    }

    // Stop running if all origins spawned and no active particles
    if (
      this.origins.every((o) => o.spawned) &&
      !this.particles.some((p) => p.active)
    ) {
      this.running = false
    }
  }

  /**
   * Get all visible particles for rendering.
   * Returns particles with integer positions and opacity based on remaining life.
   */
  getVisibleParticles(): Array<{
    x: number
    y: number
    char: string
    color: string
    opacity: number
  }> {
    return this.particles
      .filter((p) => p.active && p.y >= 0 && p.y < this.screenHeight)
      .map((p) => ({
        x: Math.round(p.x),
        y: Math.round(p.y),
        char: p.char,
        color: p.color,
        opacity: clamp(p.life / p.maxLife, 0, 1),
      }))
  }

  /**
   * Get current tick count
   */
  getTick(): number {
    return this.tick
  }

  /**
   * Get active particle count (for debugging)
   */
  getActiveCount(): number {
    return this.particles.filter((p) => p.active).length
  }
}

// ─── React Component Helper ──────────────────────────────────────────────────

/**
 * Props for rendering a single confetti particle
 */
export interface ConfettiParticleRenderProps {
  x: number
  y: number
  char: string
  color: string
  opacity: number
}

/**
 * Get the color with adjusted alpha based on opacity
 * Since terminals don't support alpha, we use color intensity instead
 */
export function getConfettiDisplayColor(color: string, opacity: number): string {
  if (opacity >= 0.7) return color
  if (opacity >= 0.4) return '#888888' // Dimmed
  return '#555555' // Very dim
}

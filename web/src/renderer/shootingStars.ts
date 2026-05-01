// web/src/renderer/shootingStars.ts
// Periodic shooting stars: bright diagonal streaks that cross the screen and
// leave a fading trail.

import type { DrawCommand } from './canvasRenderer'

interface ActiveStar {
  /** Starting screen x in pixels. */
  startX: number
  /** Starting screen y in pixels. */
  startY: number
  /** Per-tick dx in pixels. */
  dx: number
  /** Per-tick dy in pixels. */
  dy: number
  /** Tick at which this star was spawned. */
  spawnTick: number
  /** Total ticks this star lives for. */
  lifetime: number
  /** Trail length in cells. */
  trailLength: number
  /** Seed used for deterministic pseudo-random variation per-star. */
  seed: number
}

const _CELL_W = 8
const _CELL_H = 16

/** Average spawn interval in ticks. */
export const SPAWN_INTERVAL = 150

/** Deterministic pseudo-random based on integer seed. Returns [0, 1). */
function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

export class ShootingStarSystem {
  private readonly width: number
  private readonly height: number
  private active: ActiveStar[] = []
  private lastUpdateTick = -1
  private lastSpawnTick = -SPAWN_INTERVAL

  constructor(config: { width: number; height: number }) {
    this.width = config.width
    this.height = config.height
  }

  /** Clear all active shooting stars and reset the spawn timer. */
  reset(): void {
    this.active = []
    this.lastUpdateTick = -1
    this.lastSpawnTick = -SPAWN_INTERVAL
  }

  /** Advance to the given tick. Idempotent for a given tick. */
  update(tick: number): void {
    if (tick === this.lastUpdateTick) return
    this.lastUpdateTick = tick

    // Maybe spawn a new star — every ~SPAWN_INTERVAL ticks on average.
    if (tick - this.lastSpawnTick >= SPAWN_INTERVAL) {
      this.spawn(tick)
      this.lastSpawnTick = tick
    }

    // Cull finished stars.
    this.active = this.active.filter((s) => tick - s.spawnTick < s.lifetime)
  }

  private spawn(tick: number): void {
    const seed = tick
    // Random angle within a diagonal range (roughly 20°–50° below horizontal).
    const angle = (Math.PI / 180) * (20 + rand(seed * 7 + 1) * 30)
    const speed = 40 + rand(seed * 11 + 3) * 20 // pixels per tick
    // Start from top or left edge.
    const fromLeft = rand(seed * 13 + 5) < 0.5
    const startX = fromLeft ? -20 : rand(seed * 17) * this.width
    const startY = fromLeft ? rand(seed * 19) * this.height * 0.4 : -20
    const dx = Math.cos(angle) * speed
    const dy = Math.sin(angle) * speed
    const lifetime = 20
    const trailLength = 5 + Math.floor(rand(seed * 23) * 4) // 5-8
    this.active.push({ startX, startY, dx, dy, spawnTick: tick, lifetime, trailLength, seed })
  }

  /** Number of currently-active stars — exposed for tests. */
  activeCount(): number {
    return this.active.length
  }

  /** Build draw commands for the current tick. */
  getDrawCalls(): DrawCommand[] {
    const commands: DrawCommand[] = []
    for (const star of this.active) {
      const elapsed = this.lastUpdateTick - star.spawnTick
      const headX = star.startX + star.dx * elapsed
      const headY = star.startY + star.dy * elapsed

      // Head (bright, largest). Near-white but slightly warm so it can be
      // distinguished from pure-white player bullets by tests and the eye.
      commands.push({
        type: 'rect',
        x: headX,
        y: headY,
        width: 3,
        height: 3,
        fill: '#fffbe8',
        alpha: 1,
        kind: 'shooting-star',
      })

      // Trail — fading cells behind the head.
      for (let i = 1; i <= star.trailLength; i++) {
        const tx = headX - star.dx * (i / star.trailLength) * 0.8
        const ty = headY - star.dy * (i / star.trailLength) * 0.8
        const alpha = Math.max(0, 0.7 * (1 - i / star.trailLength))
        commands.push({
          type: 'rect',
          x: tx,
          y: ty,
          width: 2,
          height: 2,
          fill: '#aaddff',
          alpha,
          kind: 'shooting-star-trail',
        })
      }
    }
    return commands
  }
}

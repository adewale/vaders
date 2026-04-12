// web/src/renderer/explosions.ts
// Smooth multi-stage explosions using canvas radial gradients and circles.
//
// Previous iterations used blocky rect cells which looked pixellated and harsh.
// This version draws a fireball with a proper radial gradient (white-hot core
// fading through yellow → orange → deep red → transparent), a smooth expanding
// shockwave ring, soft debris discs with motion blur, and a lingering smoke
// cloud. The result is a localised, painterly explosion instead of
// retina-burning square flashes.
//
// The system remains deterministic per-origin via a seeded PRNG so the same
// explosion at the same tick always looks identical.

import type { DrawCommand } from './canvasRenderer'

// Local copies of CELL_W / CELL_H to avoid a circular import with canvasRenderer.
const CELL_W = 8
const CELL_H = 16

export interface ExplosionOrigin {
  x: number // cell
  y: number // cell
  width: number // cells
  height: number // cells
  color: string
  tickCreated: number
}

/** Seeded PRNG so angles/offsets for a given explosion are stable frame-to-frame. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedOf(exp: ExplosionOrigin): number {
  return (((exp.x & 0xff) << 24) ^ ((exp.y & 0xff) << 16) ^ (exp.tickCreated & 0xffff) ^ 0x9e3779b9) >>> 0
}

// ─── Tuning ──────────────────────────────────────────────────────────────────
// Total lifetime and per-stage durations.
const EXPLOSION_TOTAL_LIFETIME = 28

// Fireball: the hot radial-gradient heart of the explosion.
// Peak alpha capped well below 1.0 because it's drawn with compositeOp='lighter'
// which ADDS to whatever's already on the canvas — stacked with the glow halo
// and shockwave, higher alphas saturate to white.
const FIREBALL_MAX_AGE = 8
const FIREBALL_BASE_RADIUS_CELLS = 2.2 // slightly tighter than before
const FIREBALL_PEAK_ALPHA = 0.55 // was 0.9 — reduced to avoid additive white-out

// Soft glow halo behind the fireball (low-intensity, larger radius).
const GLOW_MAX_AGE = 12
const GLOW_RADIUS_CELLS = 4
const GLOW_PEAK_ALPHA = 0.22 // was 0.35 — reduced for same reason

// Shockwave: thin expanding bright ring — drawn as two concentric circles
// using a narrow radial-gradient band so it renders as a smooth ring, not 16 dots.
const SHOCKWAVE_MAX_AGE = 10
const SHOCKWAVE_MAX_RADIUS_CELLS = 4.5
const SHOCKWAVE_PEAK_ALPHA = 0.35 // was 0.55 — reduced, 'lighter' stacks

// Debris: soft coloured particles drifting outward with gravity.
const DEBRIS_MAX_AGE = 16
const DEBRIS_MIN = 7
const DEBRIS_MAX = 10
const DEBRIS_RADIUS_PX = 3.5
const DEBRIS_MAX_SPEED = 0.35 // cells/tick
const DEBRIS_GRAVITY = 0.04

// Smoke: wispy grey cloud that lingers and drifts upward.
const SMOKE_START_AGE = 4
const SMOKE_MAX_AGE = 24
const SMOKE_MIN = 4
const SMOKE_MAX = 6
const SMOKE_RADIUS_PX = 9

// Embers: tiny slow-falling sparks late in the animation.
const EMBER_START_AGE = 6
const EMBER_MAX_AGE = 22
const EMBER_MIN = 3
const EMBER_MAX = 5
const EMBER_RADIUS_PX = 1.5

export class ExplosionSystem {
  private explosions: ExplosionOrigin[] = []
  private readonly MAX = 30

  spawn(x: number, y: number, width: number, height: number, color: string, tick: number): void {
    if (this.explosions.length >= this.MAX) {
      this.explosions.shift()
    }
    this.explosions.push({ x, y, width, height, color, tickCreated: tick })
  }

  prune(currentTick: number): void {
    this.explosions = this.explosions.filter((e) => currentTick - e.tickCreated < EXPLOSION_TOTAL_LIFETIME)
  }

  getDrawCalls(currentTick: number): DrawCommand[] {
    const out: DrawCommand[] = []
    for (const exp of this.explosions) {
      const age = currentTick - exp.tickCreated
      if (age < 0 || age >= EXPLOSION_TOTAL_LIFETIME) continue

      const cx = (exp.x + exp.width / 2) * CELL_W
      const cy = (exp.y + exp.height / 2) * CELL_H
      const rand = mulberry32(seedOf(exp))

      // ─── Stage 1: soft glow halo (behind fireball) ─────────────────────
      if (age <= GLOW_MAX_AGE) {
        const t = age / GLOW_MAX_AGE
        const alpha = GLOW_PEAK_ALPHA * (1 - t)
        const radius = (GLOW_RADIUS_CELLS + t * 1.5) * CELL_W
        out.push({
          type: 'radial',
          cx,
          cy,
          radius,
          stops: [
            { offset: 0, color: '#ffccaa', alpha: alpha },
            { offset: 0.4, color: '#ff6622', alpha: alpha * 0.6 },
            { offset: 1, color: '#000000', alpha: 0 },
          ],
          compositeOp: 'lighter',
          kind: 'explosion-flash',
        })
      }

      // ─── Stage 2: fireball (radial gradient from white-hot centre) ─────
      if (age <= FIREBALL_MAX_AGE) {
        const t = age / FIREBALL_MAX_AGE
        const radius = FIREBALL_BASE_RADIUS_CELLS * CELL_W * (0.6 + 0.9 * t)
        const a = Math.max(0, 1 - t)
        out.push({
          type: 'radial',
          cx,
          cy,
          radius,
          stops: [
            { offset: 0, color: '#ffffee', alpha: FIREBALL_PEAK_ALPHA * a },
            { offset: 0.25, color: '#ffdd66', alpha: 0.85 * a },
            { offset: 0.55, color: '#ff7722', alpha: 0.65 * a },
            { offset: 0.85, color: '#992200', alpha: 0.25 * a },
            { offset: 1, color: '#200000', alpha: 0 },
          ],
          compositeOp: 'lighter',
          kind: 'explosion-fireball',
        })
      }

      // ─── Stage 3: expanding shockwave ring ─────────────────────────────
      // Implemented as an outer bright gradient annulus: two radial commands —
      // a solid bright ring band plus a transparent core that "cuts out" the
      // middle via destination-out. But destination-out breaks with compositeOp
      // stacks, so instead we approximate with a very narrow gradient band.
      if (age <= SHOCKWAVE_MAX_AGE) {
        const t = age / SHOCKWAVE_MAX_AGE
        const outerR = t * SHOCKWAVE_MAX_RADIUS_CELLS * CELL_W
        const innerT = Math.max(0, outerR - CELL_W * 0.8) / outerR
        const a = SHOCKWAVE_PEAK_ALPHA * (1 - t)
        out.push({
          type: 'radial',
          cx,
          cy,
          radius: outerR,
          stops: [
            { offset: 0, color: '#88ccff', alpha: 0 },
            { offset: Math.max(0, innerT - 0.05), color: '#88ccff', alpha: 0 },
            { offset: innerT, color: '#ccffff', alpha: a },
            { offset: 1, color: '#ccffff', alpha: 0 },
          ],
          compositeOp: 'lighter',
          kind: 'explosion-shockwave',
        })
      }

      // ─── Stage 4: soft debris discs ────────────────────────────────────
      if (age <= DEBRIS_MAX_AGE) {
        const debrisCount = DEBRIS_MIN + Math.floor(rand() * (DEBRIS_MAX - DEBRIS_MIN + 1))
        const alpha = Math.max(0, 0.85 * (1 - age / (DEBRIS_MAX_AGE + 1)))
        for (let i = 0; i < debrisCount; i++) {
          const angle = rand() * Math.PI * 2
          const speed = 0.15 + rand() * DEBRIS_MAX_SPEED
          const dx = Math.cos(angle) * speed * age
          const dy = Math.sin(angle) * speed * age + 0.5 * DEBRIS_GRAVITY * age * age
          const px = cx + dx * CELL_W
          const py = cy + dy * CELL_H
          out.push({
            type: 'circle',
            cx: px,
            cy: py,
            radius: DEBRIS_RADIUS_PX,
            fill: exp.color,
            alpha,
            blur: 0.5, // subtle edge softening
            kind: 'explosion-debris',
          })
        }
      }

      // ─── Stage 5: smoke cloud (drifts up, spreads out) ─────────────────
      if (age >= SMOKE_START_AGE && age <= SMOKE_MAX_AGE) {
        const smokeAge = age - SMOKE_START_AGE
        const smokeLife = SMOKE_MAX_AGE - SMOKE_START_AGE
        const smokeCount = SMOKE_MIN + Math.floor(rand() * (SMOKE_MAX - SMOKE_MIN + 1))
        const a = Math.max(0, 0.4 * (1 - smokeAge / smokeLife))
        for (let i = 0; i < smokeCount; i++) {
          // Puff positions drift up and spread
          const offsetAngle = (i / smokeCount) * Math.PI * 2 + rand() * 0.4
          const drift = smokeAge * 0.15 // cells
          const spread = (0.5 + rand() * 1.0) * drift
          const px = cx + Math.cos(offsetAngle) * spread * CELL_W
          const py = cy + Math.sin(offsetAngle) * spread * CELL_H - drift * CELL_H * 0.6
          const r = SMOKE_RADIUS_PX + smokeAge * 0.4
          out.push({
            type: 'radial',
            cx: px,
            cy: py,
            radius: r,
            stops: [
              { offset: 0, color: '#666666', alpha: a },
              { offset: 0.6, color: '#333344', alpha: a * 0.5 },
              { offset: 1, color: '#111122', alpha: 0 },
            ],
            kind: 'explosion-smoke',
          })
        }
      }

      // ─── Stage 6: ember sparks (tiny bright dots falling) ──────────────
      if (age >= EMBER_START_AGE && age <= EMBER_MAX_AGE) {
        const emberCount = EMBER_MIN + Math.floor(rand() * (EMBER_MAX - EMBER_MIN + 1))
        const emberAge = age - EMBER_START_AGE
        const emberLife = EMBER_MAX_AGE - EMBER_START_AGE
        const fade = Math.max(0, 1 - emberAge / emberLife)
        for (let i = 0; i < emberCount; i++) {
          const spreadX = (rand() - 0.5) * 2 * exp.width
          const wobble = Math.sin(age * 0.2 + i) * 0.3
          const dy = 0.18 * emberAge
          const px = cx + (spreadX + wobble) * CELL_W
          const py = cy + dy * CELL_H
          const fill = i % 2 === 0 ? '#ffaa22' : '#ffdd55'
          out.push({
            type: 'circle',
            cx: px,
            cy: py,
            radius: EMBER_RADIUS_PX,
            fill,
            alpha: fade,
            blur: 0.4,
            kind: 'explosion-ember',
          })
        }
      }
    }
    return out
  }

  reset(): void {
    this.explosions = []
  }
}

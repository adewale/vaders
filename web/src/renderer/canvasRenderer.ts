// web/src/renderer/canvasRenderer.ts
// Canvas renderer: converts GameState to draw commands, then paints to canvas 2D context.

import type { GameState } from '../../../shared/types'
import {
  getAliens,
  getBullets,
  getBarriers,
  getUFOs,
  LAYOUT,
  STANDARD_WIDTH,
  STANDARD_HEIGHT,
} from '../../../shared/types'
import { PIXEL_ART, SPRITE_SIZE } from '../../../client-core/src/sprites/bitmaps'
import { COLORS, GRADIENT_COLORS } from '../../../client-core/src/sprites/colors'
import { getUFOColor } from '../../../client-core/src/effects/colorCycling'
import { StarfieldSystem } from '../../../client-core/src/animation/starfield'
import { ConfettiSystem } from '../../../client-core/src/animation/confetti'
import { easeOutQuad } from '../../../client-core/src/animation/easing'
// DissolveSystem removed from web renderer — replaced by ExplosionSystem which
// uses smooth radial gradients instead of blocky CELL-sized rects.
import { ExplosionSystem } from './explosions'
import { applyCRTEffect } from './crtEffect'
import { NebulaSystem } from './nebula'
import { ShootingStarSystem } from './shootingStars'
import { getDistantPlanetImage, getDistantPlanetPosition, DISTANT_PLANET_ALPHA } from './distantPlanet'
import { getSpriteImage } from './spriteAtlas'
import { getSchemeOverride, getCurrentScheme } from './colorSchemes'
import { FONT_HUD, FONT_DISPLAY, canvasFont, canvasFontBold } from '../typography'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Pixel width of one terminal cell on the canvas */
export const CELL_W = 8

/** Pixel height of one terminal cell on the canvas */
export const CELL_H = 16

// ─── Draw Command Types ──────────────────────────────────────────────────────

/**
 * A single stop in a radial gradient: offset in 0..1, hex color with optional
 * alpha (0..1). Used to describe smooth explosions, glows, and nebula highlights
 * without pixellated rects.
 */
export interface GradientStop {
  offset: number // 0..1
  color: string // e.g. '#ffeeaa'
  alpha: number // 0..1
}

export type DrawCommand =
  | { type: 'clear'; width: number; height: number; fill: string }
  | {
      type: 'sprite'
      x: number
      y: number
      width: number
      height: number
      pixels: number[][]
      color: string
      gradientColors?: { bright: string; dark: string }
      alpha?: number
      kind?: string
    }
  | {
      type: 'rect'
      x: number
      y: number
      width: number
      height: number
      fill: string
      alpha?: number
      isStar?: boolean
      isParticle?: boolean
      isConfetti?: boolean
      kind?: string
    }
  | {
      type: 'text'
      x: number
      y: number
      text: string
      color: string
      font?: string
      shadowBlur?: number
      kind?: string
    }
  /**
   * Right- or left-aligned horizontal row of text segments sharing a y and a
   * baseline. The executor uses ctx.measureText to lay segments out at render
   * time, which fixes alignment when per-glyph widths differ from the
   * hand-rolled `fontSize * 0.6`-style estimates that the build step can't
   * know accurately (notably the mixed-font lives HUD: VT323 label +
   * Unicode hearts).
   *
   *  align='right': x is the RIGHT edge of the row; segments are laid out
   *    so the last segment's right edge lands at x and preceding segments
   *    stack to the left.
   *  align='left':  x is the LEFT edge of the row; segments flow rightward.
   *  baseline: forwarded to ctx.textBaseline. 'top' means y is the top edge.
   */
  | {
      type: 'text-row'
      x: number
      y: number
      align: 'left' | 'right'
      baseline?: 'top' | 'alphabetic'
      segments: Array<{ text: string; color: string; font?: string; shadowBlur?: number }>
      kind?: string
    }
  | {
      type: 'image'
      x: number
      y: number
      image: CanvasImageSource
      alpha: number
      kind?: string
      compositeOp?: GlobalCompositeOperation
    }
  /**
   * Smooth filled circle. Used for explosion particles & glows so they don't
   * look like pixellated rectangles. (cx, cy) is the centre in canvas pixels.
   */
  | {
      type: 'circle'
      cx: number
      cy: number
      radius: number
      fill: string
      alpha?: number
      blur?: number
      kind?: string
      compositeOp?: GlobalCompositeOperation
    }
  /**
   * Radial gradient disk — centred at (cx, cy) with the given radius. Stops
   * describe how colour/alpha fades from centre to edge. Ideal for fireball
   * explosions, soft glows, or shockwave blooms.
   */
  | {
      type: 'radial'
      cx: number
      cy: number
      radius: number
      stops: GradientStop[]
      blur?: number
      kind?: string
      compositeOp?: GlobalCompositeOperation
    }

// ─── Build Draw Commands ──────────────────────────────────────────────────────

// Module-level effect systems (stateful across frames)
const starfield = new StarfieldSystem({ width: 120, height: 36, density: 0.015, unicode: false })
const nebula = new NebulaSystem({ width: 120 * 8, height: 36 * 16 })
const shootingStars = new ShootingStarSystem({ width: STANDARD_WIDTH * CELL_W, height: STANDARD_HEIGHT * CELL_H })

/**
 * Minimum tick gap between two score-bump arms. With a 3-tick bump window,
 * a cooldown of 10 ticks (~333ms at 30Hz) caps retriggers to ~3/sec even
 * in rapid chain-kill situations.
 */
const SCORE_BUMP_COOLDOWN_TICKS = 10
/** Ticks remaining to render a score "bump" — SCORE text briefly larger/glowing. */
let scoreBumpTicks = 0
/**
 * Last tick on which the score bump was armed. Used to debounce rapid-fire
 * kills: without this, every `score > prevScore` comparison set
 * `scoreBumpTicks = 3`, so a chain of kills kept the HUD SCORE text popped
 * continuously — visible as an HUD flicker during busy waves. Now the bump
 * only re-arms if >= SCORE_BUMP_COOLDOWN_TICKS have passed since the
 * previous arm.
 */
let lastScoreBumpTick = -SCORE_BUMP_COOLDOWN_TICKS
/** Ticks remaining to render a wave glow burst around WAVE text. */
let waveBurstTicks = 0
/** Ticks remaining to render FIGHT! flash (triggered on wipe_reveal→playing). */
let fightFlashTicks = 0
/** Ticks remaining to render WAVE CLEARED! flash (triggered on playing→wipe_exit). */
let clearedFlashTicks = 0
/** Previous status seen across buildDrawCommands calls (for transition detection). */
let prevGameStatus: string | null = null
/** Total duration of each flash when triggered (for alpha ramp). */
const FLASH_DURATION_TICKS = 15

// ─── Screen Shake & Damage Flash ──────────────────────────────────────────────
// Module-level state so renderer stays synchronous and tests can inspect it.
let shakeTicks = 0
let shakeIntensity = 0
/**
 * Duration originally requested when the shake was armed — kept so the
 * executor can compute a linear decay factor (current / duration) without
 * separately storing progress.
 */
let shakeDuration = 0
let flashTicks = 0
let flashDuration = 0
let flashColor = 'rgba(255, 255, 255, 1)'

export function triggerShake(intensity: number, duration = 12): void {
  shakeTicks = duration
  shakeDuration = duration
  shakeIntensity = intensity
}

/**
 * Deterministic 2D jitter for the screen shake.
 *
 * Originally the executor called `Math.random()` on every rAF frame (~60Hz)
 * while the shake window was open. Because the renderer runs at 60Hz but the
 * server ticks at 30Hz, that re-rolled the displacement twice per tick and
 * read as whole-scene flicker rather than a shake. Using two out-of-phase
 * sines with a linear decay factor driven off (shakeTicks / shakeDuration):
 *
 *   - Stable within a single tick: same inputs → same outputs. Tests can
 *     assert this without mocking Math.random.
 *   - Varies across ticks: the shake still looks alive, not a static offset.
 *   - Bounded: |dx|, |dy| ≤ shakeIntensity * decay ≤ shakeIntensity.
 *   - Decays smoothly to zero by end of the shake window.
 *
 * The frequency multipliers (3.73 and 4.19) are intentionally incommensurate
 * so the (dx, dy) trace traces a lissajous-ish path instead of returning to
 * the same point each tick.
 */
function shakeJitter(tick: number): { dx: number; dy: number } {
  if (shakeTicks <= 0 || shakeIntensity <= 0 || shakeDuration <= 0) {
    return { dx: 0, dy: 0 }
  }
  const decay = shakeTicks / shakeDuration
  const dx = Math.sin(tick * 3.73) * shakeIntensity * decay
  const dy = Math.cos(tick * 4.19) * shakeIntensity * decay
  return { dx, dy }
}

export function triggerFlash(color: string, duration: number): void {
  flashTicks = duration
  flashDuration = duration
  flashColor = color
}

export function _getShakeStateForTests(): { ticks: number; intensity: number } {
  return { ticks: shakeTicks, intensity: shakeIntensity }
}

export function _getFlashStateForTests(): { ticks: number; duration: number; color: string } {
  return { ticks: flashTicks, duration: flashDuration, color: flashColor }
}

/** Inspector for the set of already-seen dead alien ids. Used by tests to
 * assert that the in-place replay reset clears match-level accumulators. */
export function _getSeenDeadIdsForTests(): { size: number } {
  return { size: seenDeadAlienIds.size + seenDeadUfoIds.size }
}

/** Inspector for the victory-confetti latch. See replay-state-reset tests. */
export function _getConfettiStartedForTests(): boolean {
  return confettiStarted
}

/**
 * Inspector for the score-bump debounce mechanism. Exposes both the
 * currently-armed bump-ticks counter and the tick the bump was last armed.
 * Tests use this to verify the cooldown gate directly rather than only
 * observing the downstream font-size effect.
 */
export function _getScoreBumpStateForTests(): { ticks: number; lastArmedTick: number } {
  return { ticks: scoreBumpTicks, lastArmedTick: lastScoreBumpTick }
}

/**
 * Comprehensive match-scoped inspector. Returns plain data (sizes, lengths,
 * counter values) for EVERY module-level accumulator that must be reset on
 * tick-rewind (i.e. when the server starts a new match in the same room and
 * the GameScreen stays mounted). Does NOT leak internal Set/Map references.
 *
 * Paired with the replay-state-reset tests to assert exhaustively that
 * resetEffects() — and the tick-rewind path that calls it — clears
 * everything that could carry state from match N into match N+1.
 */
export function _getMatchStateForTests(): {
  seenDeadAlienIdsSize: number
  seenDeadUfoIdsSize: number
  confettiStarted: boolean
  barrierDamageScarsSize: number
  barrierLastHealthSize: number
  barrierShimmersLength: number
  trackedPrevBulletIdsSize: number
  prevGameStatus: string | null
  lastProcessedTick: number
  scoreBumpTicks: number
  lastScoreBumpTick: number
  waveBurstTicks: number
  fightFlashTicks: number
  clearedFlashTicks: number
  shakeTicks: number
  shakeIntensity: number
  shakeDuration: number
  flashTicks: number
  flashDuration: number
  flashColor: string
} {
  return {
    seenDeadAlienIdsSize: seenDeadAlienIds.size,
    seenDeadUfoIdsSize: seenDeadUfoIds.size,
    confettiStarted,
    barrierDamageScarsSize: barrierDamageScars.size,
    barrierLastHealthSize: barrierLastHealth.size,
    barrierShimmersLength: barrierShimmers.length,
    trackedPrevBulletIdsSize: trackedPrevBulletIds.size,
    prevGameStatus,
    lastProcessedTick,
    scoreBumpTicks,
    lastScoreBumpTick,
    waveBurstTicks,
    fightFlashTicks,
    clearedFlashTicks,
    shakeTicks,
    shakeIntensity,
    shakeDuration,
    flashTicks,
    flashDuration,
    flashColor,
  }
}

/**
 * The expected "clean slate" values for every field reported by
 * _getMatchStateForTests(). Exposed as a constant so tests can do a full
 * struct-equality assertion rather than repeating the literal values.
 * lastScoreBumpTick starts at -SCORE_BUMP_COOLDOWN_TICKS so the very first
 * score change can arm the bump without waiting for the cooldown window.
 */
export const _RESET_MATCH_STATE = {
  seenDeadAlienIdsSize: 0,
  seenDeadUfoIdsSize: 0,
  confettiStarted: false,
  barrierDamageScarsSize: 0,
  barrierLastHealthSize: 0,
  barrierShimmersLength: 0,
  trackedPrevBulletIdsSize: 0,
  prevGameStatus: null as string | null,
  lastProcessedTick: -1,
  scoreBumpTicks: 0,
  lastScoreBumpTick: -SCORE_BUMP_COOLDOWN_TICKS,
  waveBurstTicks: 0,
  fightFlashTicks: 0,
  clearedFlashTicks: 0,
  shakeTicks: 0,
  shakeIntensity: 0,
  shakeDuration: 0,
  flashTicks: 0,
  flashDuration: 0,
  flashColor: 'rgba(255, 255, 255, 1)',
} as const

/** Per-layer star dot sizes (px) — creates parallax: bigger = closer. */
const STAR_LAYER_SIZES = [1, 2, 3] as const
// (dissolveSystem removed — ExplosionSystem owns all death particles)
const explosionSystem = new ExplosionSystem()
const confettiSystem = new ConfettiSystem(
  { width: 120, height: 36 },
  { useAscii: true, particlesPerBurst: 30, maxParticles: 150 },
)

// Tick tracking to only advance systems on frame changes
let lastProcessedTick = -1
let confettiStarted = false
const seenDeadAlienIds = new Set<string>()
const seenDeadUfoIds = new Set<string>()

// ─── Barrier elevation state ────────────────────────────────────────────────
// Per-segment cumulative damage scars. Each entry is a small offset within the
// segment where a "hit" has been recorded. Segments are keyed by barrier id +
// offsetX + offsetY. Reset via resetEffects().
interface DamageScar {
  offsetX: number // px within segment
  offsetY: number // px within segment
  radius: number // px
}
const barrierDamageScars = new Map<string, DamageScar[]>()
/** Last-seen health per segment — used to detect health transitions. */
const barrierLastHealth = new Map<string, number>()

// Active shimmer rings on barrier segments. Each has an origin + remaining ticks.
interface ShimmerRing {
  cx: number
  cy: number
  ticksRemaining: number
}
const barrierShimmers: ShimmerRing[] = []
/** Last-seen bullet IDs (module-scope) for barrier shimmer impact detection. */
// eslint-disable-next-line prefer-const
let trackedPrevBulletIds: Set<string> = new Set<string>()

/** Reset all stateful effect systems. Call between unrelated test runs. */
export function resetEffects(): void {
  lastProcessedTick = -1
  confettiStarted = false
  seenDeadAlienIds.clear()
  seenDeadUfoIds.clear()
  shakeTicks = 0
  shakeIntensity = 0
  shakeDuration = 0
  flashTicks = 0
  flashDuration = 0
  flashColor = 'rgba(255, 255, 255, 1)'
  scoreBumpTicks = 0
  lastScoreBumpTick = -SCORE_BUMP_COOLDOWN_TICKS
  waveBurstTicks = 0
  fightFlashTicks = 0
  clearedFlashTicks = 0
  prevGameStatus = null
  starfield.reset()
  shootingStars.reset()
  confettiSystem.stop()
  // (legacy DissolveSystem removed from web renderer)
  explosionSystem.reset()
  barrierDamageScars.clear()
  barrierLastHealth.clear()
  barrierShimmers.length = 0
  trackedPrevBulletIds = new Set()
}

/**
 * Convert game state into an ordered list of draw commands.
 * This is a pure function with no side effects (except starfield memoization).
 */
export function buildDrawCommands(
  state: GameState,
  playerId: string | null,
  prevState?: GameState | null,
  scale?: number,
  lerpT?: number,
): DrawCommand[] {
  // In-place replay detection. GameScreen stays mounted across waves and
  // into the next match (same room), so `useEffect(() => resetEffects, [])`
  // on unmount doesn't fire between games. Without this guard, module
  // accumulators (seenDeadAlienIds, confettiStarted, barrierDamageScars,
  // prevGameStatus, etc.) carry forward from one match to the next and
  // cause subtle bugs: phantom explosion suppression, confetti that doesn't
  // re-fire on a second victory, scars on fresh barriers. The heuristic is
  // "tick went backwards after we'd already processed a meaningful tick" —
  // that only happens when the server restarts the game. Ignore the very
  // first call (lastProcessedTick === -1) so fresh mounts aren't clobbered.
  if (lastProcessedTick > 0 && state.tick < lastProcessedTick) {
    resetEffects()
  }

  const commands: DrawCommand[] = []

  // 1. Clear background
  commands.push({
    type: 'clear',
    width: STANDARD_WIDTH * CELL_W,
    height: STANDARD_HEIGHT * CELL_H,
    fill: '#000000',
  })

  // 1a. Nebula parallax clouds (drawn under stars)
  for (const call of nebula.getDrawCalls(state.tick)) {
    commands.push({
      type: 'image',
      x: call.x,
      y: call.y,
      image: call.image,
      alpha: call.alpha,
      kind: 'nebula',
      compositeOp: call.compositeOp as GlobalCompositeOperation,
    })
  }

  // 1a-bis. Distant planet — a single low-alpha radial gradient parked in the
  // bottom-right corner. Renders once per frame.
  {
    const planetImage = getDistantPlanetImage()
    if (planetImage) {
      const pos = getDistantPlanetPosition(STANDARD_WIDTH * CELL_W, STANDARD_HEIGHT * CELL_H)
      commands.push({
        type: 'image',
        x: pos.x,
        y: pos.y,
        image: planetImage,
        alpha: DISTANT_PLANET_ALPHA,
        kind: 'distant-planet',
      })
    }
  }

  // 1b. Starfield background — size reflects depth (parallax via brightness)
  const stars = starfield.getCells(state.tick)
  for (const star of stars) {
    const size = starSizeFromColor(star.color)
    commands.push({
      type: 'rect',
      x: star.x * CELL_W,
      y: star.y * CELL_H,
      width: size,
      height: size,
      fill: star.color,
      isStar: true,
      kind: 'star',
    })
  }

  // 1b-bis. Shooting stars — periodic diagonal streaks with fading trails.
  shootingStars.update(state.tick)
  for (const cmd of shootingStars.getDrawCalls()) {
    commands.push(cmd)
  }

  // 1c. Wave transition announcement — render during wipe_hold AND wipe_reveal.
  // Text pulses alpha/glow; a thin border rect expands with tick for drama.
  // Emitted inline here (so during wipe_hold the screen stays mostly black with
  // just the announcement) and again after the entity pipeline for wipe_reveal
  // (so aliens appear to slide in BEHIND the announcement as it fades).
  const announcingWave =
    (state.status === 'wipe_hold' || state.status === 'wipe_reveal') && state.wipeWaveNumber != null

  if (state.status === 'wipe_hold' && state.wipeWaveNumber != null) {
    emitWaveAnnouncement(commands, state.wipeWaveNumber, state.tick, scale)
    prevGameStatus = state.status
    return commands
  }

  // 2. Aliens (alive only) — with color cycling (sine-wave brightness modulation)
  // During wipe_reveal, aliens rain in from above screen to their formation y.
  const aliens = getAliens(state.entities)
  const tick = state.tick
  const isEntering = state.status === 'wipe_reveal'
  for (const alien of aliens) {
    if (!alien.alive) continue
    const spriteData = PIXEL_ART[alien.type]
    const frame = Math.floor(tick / 15) % 2 === 0 ? spriteData.a : spriteData.b
    const scheme = getSchemeOverride(getCurrentScheme())
    const baseGradient = scheme.aliens[alien.type]
    const renderY = isEntering ? entranceY(alien.y, alien.col ?? 0, state.wipeTicksRemaining, alien.row ?? 0) : alien.y
    commands.push({
      type: 'sprite',
      x: alien.x * CELL_W,
      y: renderY * CELL_H,
      width: SPRITE_SIZE.alien.width * CELL_W,
      height: SPRITE_SIZE.alien.height * CELL_H,
      pixels: frame as unknown as number[][],
      color: COLORS.alien[alien.type],
      gradientColors: cycleGradient(baseGradient, tick, alien.row ?? 0),
    })
  }

  // 3. UFOs (alive only)
  const ufos = getUFOs(state.entities)
  const prevUfosById = new Map<string, { x: number; y: number }>()
  const prevUfoIdsAlive = new Set<string>()
  if (prevState) {
    for (const pu of getUFOs(prevState.entities)) {
      if (pu.alive) {
        prevUfosById.set(pu.id, { x: pu.x, y: pu.y })
        prevUfoIdsAlive.add(pu.id)
      }
    }
  }
  const ufoW = SPRITE_SIZE.ufo.width * CELL_W
  const ufoH = SPRITE_SIZE.ufo.height * CELL_H
  for (const ufo of ufos) {
    if (!ufo.alive) continue
    const frame = Math.floor(tick / 15) % 2 === 0 ? PIXEL_ART.ufo.a : PIXEL_ART.ufo.b
    const ufoColor = getUFOColor(tick)
    const ufoPxX = ufo.x * CELL_W
    const ufoPxY = ufo.y * CELL_H
    const isNewlySpawned = prevState != null && !prevUfoIdsAlive.has(ufo.id)

    // 3a. Shock wave on spawn — single frame, 8 small rects in a ring around UFO center
    if (isNewlySpawned) {
      const cx = ufoPxX + ufoW / 2
      const cy = ufoPxY + ufoH / 2
      const ringRadius = ufoW * 0.7
      const ringCells = 8
      for (let i = 0; i < ringCells; i++) {
        const angle = (i / ringCells) * Math.PI * 2
        const rx = cx + Math.cos(angle) * ringRadius - 2
        const ry = cy + Math.sin(angle) * ringRadius - 2
        commands.push({
          type: 'rect',
          x: rx,
          y: ry,
          width: 4,
          height: 4,
          fill: ufoColor,
          alpha: 0.8,
          kind: 'ufo-shockwave',
        })
      }
    }

    // 3b. (rainbow trail removed — user rejected as too busy)
    // 3c. (energy-pulse glow halo removed — user rejected as ugly)
    // 3d. (motion-blur streak ghosts removed — user rejected as noisy)
    // 3f. (abduction beam removed per earlier user feedback)
    // 3g. (pulsar rings removed — they looked like a weird outline around the UFO)
    // 3h. (trail particle stragglers removed alongside the rainbow trail)
    // 3i. (warp-distortion ghost removed — it read as a shadow/duplicate below the UFO)

    // 3e. Primary UFO sprite — CONTRACT: exactly at ufo.x * CELL_W, ufo.y * CELL_H.
    // Gradient shading (bright top row / dark bottom row) matches the treatment
    // regular aliens get, so the UFO reads as a shaded 3D-ish sprite instead of
    // a flat blob. Colors cycle with the UFO's rainbow, anchored to the canonical
    // GRADIENT_COLORS.ufo pair for consistency.
    const ufoGrad = GRADIENT_COLORS.ufo
    commands.push({
      type: 'sprite',
      x: ufoPxX,
      y: ufoPxY,
      width: ufoW,
      height: ufoH,
      pixels: frame as unknown as number[][],
      color: ufoColor,
      gradientColors: {
        // Lean bright-row toward the cycled color so it feels alive with the trail
        bright: ufoColor,
        dark: ufoGrad.dark,
      },
    })
  }

  // 4. Bullets — interpolate y between prevState and state for smooth motion
  const bullets = getBullets(state.entities)
  const prevBulletById = new Map<string, { x: number; y: number }>()
  const prevBulletIds = new Set<string>()
  if (prevState) {
    for (const pb of getBullets(prevState.entities)) {
      prevBulletById.set(pb.id, { x: pb.x, y: pb.y })
      prevBulletIds.add(pb.id)
    }
  }
  // Default to midpoint (0.5) for backward compat when lerpT is not supplied.
  const t = lerpT ?? 0.5
  // Track muzzle flash effects keyed by bullet id — briefly show on first frame.
  for (const bullet of bullets) {
    const isPlayerBullet = bullet.ownerId !== null
    const prev = prevBulletById.get(bullet.id)
    // Linear interpolate from prev→current using lerpT; callers driving a
    // requestAnimationFrame loop compute t from elapsed time since the last
    // server tick to produce smooth per-frame motion.
    const renderX = prev ? prev.x + (bullet.x - prev.x) * t : bullet.x
    const renderY = prev ? prev.y + (bullet.y - prev.y) * t : bullet.y
    const centerPxX = renderX * CELL_W
    const centerPxY = renderY * CELL_H

    // Primary bullet fill
    // - Player bullet: steady cyan/white
    // - Alien bullet: flicker between red shades over time
    let mainFill: string
    if (isPlayerBullet) {
      mainFill = COLORS.bullet.player
    } else {
      // Flicker red shades modulated by state.tick
      const shades = ['#ff3333', '#ff5555', '#cc2222', '#ff7777']
      mainFill = shades[state.tick % shades.length]
    }

    // 4a. Glow halo — 3× sprite size for player bullets; smaller for alien.
    // Player bullets get a stronger halo; alien bullets get a more menacing smaller one.
    if (isPlayerBullet) {
      const glowW = CELL_W * 3
      const glowH = CELL_H * 3
      commands.push({
        type: 'rect',
        x: centerPxX - CELL_W,
        y: centerPxY - CELL_H,
        width: glowW,
        height: glowH,
        fill: '#66ffff',
        alpha: 0.25,
        kind: 'bullet-glow',
      })
      // Inner bright core overlay — smaller, higher alpha.
      // Fill deliberately differs from COLORS.bullet.player so pre-existing
      // bullet-rect finders that key on fill color still locate the primary.
      commands.push({
        type: 'rect',
        x: centerPxX - CELL_W / 4,
        y: centerPxY - CELL_H / 4,
        width: CELL_W * 1.5,
        height: CELL_H * 1.5,
        fill: '#eeffff',
        alpha: 0.7,
        kind: 'bullet-core',
      })
    } else {
      // Alien bullet glow stays smaller to keep chromatic budget for the aura
      const glowPadX = CELL_W
      const glowPadY = CELL_H / 2
      commands.push({
        type: 'rect',
        x: centerPxX - glowPadX,
        y: centerPxY - glowPadY,
        width: CELL_W + glowPadX * 2,
        height: CELL_H + glowPadY * 2,
        fill: '#ff6666',
        alpha: 0.25,
        kind: 'bullet-glow',
      })
    }

    // 4a.i. Chromatic aberration (player bullet only) — two side-offset ghost rects
    if (isPlayerBullet) {
      commands.push({
        type: 'rect',
        x: centerPxX + 1,
        y: centerPxY,
        width: CELL_W,
        height: CELL_H,
        fill: '#00ffff',
        alpha: 0.4,
        kind: 'bullet-chromatic',
      })
      commands.push({
        type: 'rect',
        x: centerPxX - 1,
        y: centerPxY,
        width: CELL_W,
        height: CELL_H,
        fill: '#ff00ff',
        alpha: 0.4,
        kind: 'bullet-chromatic',
      })
    }

    // 4a.ii. Electric fizzle particles (player bullet) — 1-2 sparkles every 3 ticks
    if (isPlayerBullet && state.tick % 3 === 0) {
      const count = 1 + ((state.tick / 3) % 2 === 0 ? 1 : 0)
      for (let i = 0; i < count; i++) {
        // Deterministic pseudo-random offset based on tick + bullet id char sum
        const seed = state.tick * 31 + i * 17 + bullet.id.length
        const dx = ((seed * 13) % 7) - 3
        const dy = ((seed * 7) % 7) - 3
        commands.push({
          type: 'rect',
          x: centerPxX + dx,
          y: centerPxY + dy,
          width: 2,
          height: 2,
          fill: '#aaffff',
          alpha: 0.9,
          kind: 'bullet-fizzle',
        })
      }
    }

    // 4a.iii. Alien bullet red pulsing aura
    if (!isPlayerBullet) {
      const auraAlpha = 0.2 + 0.2 * (0.5 + 0.5 * Math.sin(state.tick * 0.4))
      commands.push({
        type: 'rect',
        x: centerPxX - CELL_W / 2,
        y: centerPxY - CELL_H / 4,
        width: CELL_W * 2,
        height: CELL_H * 1.5,
        fill: '#cc2222',
        alpha: auraAlpha,
        kind: 'bullet-aura',
      })
    }

    // 4a.iv. Alien bullet occasional spark flash — every 10 ticks, 1-2 bright whites
    if (!isPlayerBullet && state.tick % 10 === 0) {
      const count = 1 + ((state.tick / 10) % 2 === 0 ? 1 : 0)
      for (let i = 0; i < count; i++) {
        const seed = state.tick + i * 11 + bullet.id.length
        const dx = ((seed * 5) % 5) - 2
        const dy = ((seed * 3) % 5) - 2
        commands.push({
          type: 'rect',
          x: centerPxX + dx,
          y: centerPxY + dy,
          width: 1,
          height: 1,
          fill: '#ffffff',
          alpha: 1,
          kind: 'bullet-spark',
        })
      }
    }

    // 4b. Trail — 3 cells behind the bullet along travel direction.
    // Player bullet dy=-1 (travels up), trail is BELOW (higher y).
    // Alien bullet dy=+1 (travels down), trail is ABOVE (lower y).
    const trailDir = -bullet.dy // opposite to travel
    const trailFill = isPlayerBullet ? '#aaffff' : '#ff4444'
    const trailAlphas = [0.5, 0.3, 0.15]
    for (let i = 0; i < trailAlphas.length; i++) {
      const offsetCells = i + 1 // 1, 2, 3 cells behind
      commands.push({
        type: 'rect',
        x: centerPxX,
        y: centerPxY + trailDir * offsetCells * (CELL_H / 2),
        width: CELL_W,
        height: CELL_H / 2,
        fill: trailFill,
        alpha: trailAlphas[i],
        kind: 'bullet-trail',
      })
    }

    // 4b.ii. Alien bullet ember trail — 5 fading yellow→orange→red cells behind.
    if (!isPlayerBullet) {
      const emberDir = -bullet.dy // opposite of travel
      // yellow → orange → red → dim red → darker red
      const emberColors = ['#ffff66', '#ffaa33', '#ff5522', '#aa2200', '#661100']
      const emberAlphas = [0.9, 0.75, 0.55, 0.35, 0.2]
      for (let i = 0; i < emberColors.length; i++) {
        const offsetCells = i + 1
        // Small random horizontal wobble to read as fluttering embers
        const wobbleX = Math.sin((state.tick + i * 7) * 0.5) * 1.5
        commands.push({
          type: 'rect',
          x: centerPxX + wobbleX + CELL_W / 4,
          y: centerPxY + emberDir * offsetCells * (CELL_H / 2),
          width: CELL_W / 2,
          height: CELL_H / 2,
          fill: emberColors[i],
          alpha: emberAlphas[i],
          kind: 'bullet-ember',
        })
      }
    }

    // 4b.iii. Laser beam taper (player bullet only) — 3 stacked cells forming
    // a tapered beam shape. Outer is widest (>CELL_W) at dim cyan; mid is 80%
    // width in cyan; core is bright white at center. All three stay inside a
    // 3×3 pixel-cell area around the main bullet cell.
    if (isPlayerBullet) {
      // Outer (widest, dim cyan) — 120% width, behind the main bullet
      const outerW = Math.round(CELL_W * 1.2)
      commands.push({
        type: 'rect',
        x: centerPxX - Math.floor((outerW - CELL_W) / 2),
        y: centerPxY,
        width: outerW,
        height: CELL_H,
        fill: '#004466',
        alpha: 0.55,
        kind: 'bullet-taper-outer',
      })
      // Mid (80% width, cyan)
      const midW = Math.round(CELL_W * 0.8)
      commands.push({
        type: 'rect',
        x: centerPxX + Math.floor((CELL_W - midW) / 2),
        y: centerPxY,
        width: midW,
        height: CELL_H,
        fill: '#66ffff',
        alpha: 0.85,
        kind: 'bullet-taper-mid',
      })
      // Core (bright white-yellow, tiny center). Fill is intentionally
      // near-white (not pure #ffffff) so bullet-fill finders don't grab it
      // instead of the primary bullet rect.
      const coreW = Math.max(1, Math.floor(CELL_W / 3))
      commands.push({
        type: 'rect',
        x: centerPxX + Math.floor((CELL_W - coreW) / 2),
        y: centerPxY + Math.floor(CELL_H / 4),
        width: coreW,
        height: Math.floor(CELL_H / 2),
        fill: '#fefeff',
        alpha: 1,
        kind: 'bullet-taper-core',
      })
    }

    // 4c. Main bullet rect — UNCHANGED position/size/fill semantics.
    // Position matches bullet.x * CELL_W, bullet.y * CELL_H when lerpT=1 and no prev.
    commands.push({
      type: 'rect',
      x: centerPxX,
      y: centerPxY,
      width: CELL_W,
      height: CELL_H,
      fill: isPlayerBullet ? COLORS.bullet.player : mainFill,
    })

    // 4c.i. Muzzle lightning arc — on new player bullet, draw 3-4 small zigzag
    // cells between the nearest player cockpit and the bullet.
    if (isPlayerBullet && prevState && !prevBulletIds.has(bullet.id)) {
      const owner = bullet.ownerId ? state.players[bullet.ownerId] : null
      if (owner && owner.alive) {
        const cockpitX = owner.x * CELL_W + CELL_W / 2
        const cockpitY = LAYOUT.PLAYER_Y * CELL_H
        // Only emit when owner is nearby (within ~12 cells horizontally)
        if (Math.abs(owner.x - bullet.x) <= 12) {
          const arcCount = 4
          for (let i = 0; i < arcCount; i++) {
            const t = (i + 1) / (arcCount + 1)
            // Linear interpolate, then add zigzag on x based on i
            const lx = cockpitX + (centerPxX + CELL_W / 2 - cockpitX) * t
            const ly = cockpitY + (centerPxY + CELL_H / 2 - cockpitY) * t
            const zig = (i % 2 === 0 ? 1 : -1) * 2
            commands.push({
              type: 'rect',
              x: lx + zig - 1,
              y: ly - 1,
              width: 2,
              height: 2,
              fill: '#aaffff',
              alpha: 0.9,
              kind: 'bullet-arc',
            })
          }
        }
      }
    }

    // 4d. Muzzle flash — only when this bullet is NEW (not present in prev frame).
    // We use prevState bullet IDs as the reference for "was this bullet here last tick?".
    if (prevState && !prevBulletIds.has(bullet.id)) {
      // Flash is centered on the bullet spawn position, a bit larger
      const flashSize = CELL_W * 2
      commands.push({
        type: 'rect',
        x: bullet.x * CELL_W - flashSize / 2 + CELL_W / 2,
        y: bullet.y * CELL_H - flashSize / 2 + CELL_H / 2,
        width: flashSize,
        height: flashSize,
        fill: isPlayerBullet ? '#ffffff' : '#ffcc66',
        alpha: 0.7,
        kind: 'muzzle-flash',
      })
    }
  }

  // 4e. Bullet impact burst — for bullets in prev but not in curr that
  // disappeared on-screen (likely hit an alien/barrier), emit a small 6-rect
  // radial fragment burst at the last known bullet position.
  if (prevState) {
    const currBulletIds = new Set(bullets.map((b) => b.id))
    for (const pb of getBullets(prevState.entities)) {
      if (currBulletIds.has(pb.id)) continue
      // Off-screen: y was above row 0 or below STANDARD_HEIGHT
      if (pb.y < 1 || pb.y >= STANDARD_HEIGHT - 1) continue
      const bx = pb.x * CELL_W + CELL_W / 2
      const by = pb.y * CELL_H + CELL_H / 2
      const fragCount = 6
      const palette = ['#ffffff', '#aaffff', '#66ffff']
      for (let i = 0; i < fragCount; i++) {
        const ang = (i / fragCount) * Math.PI * 2
        const r = CELL_W * (0.8 + (i % 2) * 0.4)
        commands.push({
          type: 'rect',
          x: bx + Math.cos(ang) * r - 1,
          y: by + Math.sin(ang) * r - 1,
          width: 2,
          height: 2,
          fill: palette[i % palette.length],
          alpha: 0.9,
          kind: 'bullet-impact-burst',
        })
      }
    }
  }

  // 5. Barriers (alive segments only)
  const barriers = getBarriers(state.entities)

  // Hoisted here so barrier shimmer / damage logic can see it (used again later).
  const tickAdvanced = state.tick !== lastProcessedTick

  // ── Detect bullet-barrier impacts for shield shimmer (#10) ──
  // A bullet has "impacted" a barrier when: it existed in prevState but is
  // gone now AND its last position overlapped a live barrier segment.
  const impactPoints: Array<{ cx: number; cy: number }> = []
  if (prevState && tickAdvanced) {
    const currBulletIdsLocal = new Set(getBullets(state.entities).map((b) => b.id))
    for (const pb of getBullets(prevState.entities)) {
      if (currBulletIdsLocal.has(pb.id)) continue // still alive
      // Bullet disappeared. Was it overlapping a barrier segment?
      for (const bar of barriers) {
        for (const seg of bar.segments) {
          if (seg.health <= 0) continue
          const segLeftCell = bar.x + seg.offsetX * 3
          const segTopCell = LAYOUT.BARRIER_Y + seg.offsetY * 2
          // Hit detection: bullet within 1 cell of segment rectangle
          if (pb.x >= segLeftCell - 1 && pb.x <= segLeftCell + 3 && pb.y >= segTopCell - 2 && pb.y <= segTopCell + 3) {
            impactPoints.push({
              cx: pb.x * CELL_W + CELL_W / 2,
              cy: pb.y * CELL_H + CELL_H / 2,
            })
            break // one impact per bullet
          }
        }
      }
    }
    // Spawn shimmers from impacts
    for (const p of impactPoints) {
      barrierShimmers.push({ cx: p.cx, cy: p.cy, ticksRemaining: 5 })
    }
    // Update module-scope bullet tracker (used to detect between-frame changes).
    trackedPrevBulletIds = currBulletIdsLocal
  }

  // Advance shimmer countdowns ONCE per tick
  if (tickAdvanced) {
    for (const sh of barrierShimmers) sh.ticksRemaining -= 1
    // Remove expired
    for (let i = barrierShimmers.length - 1; i >= 0; i--) {
      if (barrierShimmers[i].ticksRemaining <= 0) {
        barrierShimmers.splice(i, 1)
      }
    }
  }

  // ── Precompute UFO positions for ambient-glow (#11) ──
  const liveUFOs = getUFOs(state.entities).filter((u) => u.alive)

  for (const barrier of barriers) {
    for (const seg of barrier.segments) {
      if (seg.health <= 0) continue
      const segX = (barrier.x + seg.offsetX * 3) * CELL_W
      const segY = (LAYOUT.BARRIER_Y + seg.offsetY * 2) * CELL_H
      const segW = SPRITE_SIZE.barrier.width * CELL_W
      const segH = SPRITE_SIZE.barrier.height * CELL_H
      const segKey = `${barrier.id}:${seg.offsetX}:${seg.offsetY}`

      // ── Cumulative damage tracking (#5) ──
      // On health transition (decrease), record a new scar at a random position
      // within the segment. Scars accumulate and render on every frame.
      if (prevState) {
        const prevBarrier = getBarriers(prevState.entities).find((b) => b.id === barrier.id)
        const prevSeg = prevBarrier?.segments.find((s) => s.offsetX === seg.offsetX && s.offsetY === seg.offsetY)
        const lastH = barrierLastHealth.get(segKey) ?? prevSeg?.health ?? seg.health
        if (seg.health < lastH) {
          // Damage event — spawn a scar
          const scarList = barrierDamageScars.get(segKey) ?? []
          // Deterministic position from segKey + tick so repeated hits are distinct
          const seed = hashString(segKey + ':' + state.tick)
          const rng = mulberry32(seed)
          scarList.push({
            offsetX: Math.floor(rng() * (segW - 6)) + 3,
            offsetY: Math.floor(rng() * (segH - 6)) + 3,
            radius: 1.5 + rng() * 1.5,
          })
          barrierDamageScars.set(segKey, scarList)
        }
        barrierLastHealth.set(segKey, seg.health)
      }

      // Primary segment rect (contract-required position/size).
      commands.push({
        type: 'rect',
        x: segX,
        y: segY,
        width: segW,
        height: segH,
        fill: COLORS.barrier[seg.health as 1 | 2 | 3 | 4],
        kind: 'barrier-segment',
      })

      // 3D bevel effect — bright highlight at top-left, dark shadow at bottom-right.
      commands.push({
        type: 'rect',
        x: segX,
        y: segY,
        width: 2,
        height: 2,
        fill: '#ffffff',
        alpha: 0.35,
        kind: 'barrier-bevel-highlight',
      })
      commands.push({
        type: 'rect',
        x: segX + segW - 2,
        y: segY + segH - 2,
        width: 2,
        height: 2,
        fill: '#000000',
        alpha: 0.45,
        kind: 'barrier-bevel-shadow',
      })

      // ── Concrete noise texture (#1) ──
      // Deterministic pitted-concrete speckle using small circles of varying
      // size/alpha. Seed derived from barrier+segment so it's stable.
      {
        const seed = hashString(segKey + ':noise')
        const rng = mulberry32(seed)
        const pitCount = 6
        for (let i = 0; i < pitCount; i++) {
          const radius = 0.6 + rng() * 1.5
          const margin = radius + 0.5
          const cxPx = segX + margin + rng() * (segW - 2 * margin)
          const cyPx = segY + margin + rng() * (segH - 2 * margin)
          const alpha = 0.12 + rng() * 0.25
          // Alternate between darker speckle and slightly lighter pits
          const fill = i % 2 === 0 ? '#2a3a1a' : '#556b2f'
          commands.push({
            type: 'circle',
            cx: cxPx,
            cy: cyPx,
            radius,
            fill,
            alpha,
            kind: 'barrier-noise',
          })
        }
      }

      // ── Cumulative damage scars (#5) — render all tracked scars ──
      {
        const scars = barrierDamageScars.get(segKey)
        if (scars && scars.length > 0) {
          for (const scar of scars) {
            commands.push({
              type: 'circle',
              cx: segX + scar.offsetX,
              cy: segY + scar.offsetY,
              radius: scar.radius,
              fill: '#000000',
              alpha: 0.55,
              kind: 'barrier-damage-scar',
            })
          }
        }
      }

      // ── Ambient glow from UFO (#11) ──
      // Each live UFO casts a soft radial tint on the top of barrier segments.
      // Intensity falls off with horizontal distance.
      for (const ufo of liveUFOs) {
        const ufoCx = (ufo.x + SPRITE_SIZE.ufo.width / 2) * CELL_W
        const ufoCy = (ufo.y + SPRITE_SIZE.ufo.height / 2) * CELL_H
        const segCx = segX + segW / 2
        const dx = segCx - ufoCx
        const verticalDist = Math.max(0, segY - ufoCy)
        // Light cone: influence falls to 0 beyond ~30 cells horizontal
        const falloff = Math.max(0, 1 - Math.abs(dx) / (30 * CELL_W))
        if (falloff <= 0.01) continue
        const color = getUFOColor(state.tick)
        const glowRadius = 10 + falloff * 12 // px
        const glowAlpha = 0.3 * falloff
        commands.push({
          type: 'radial',
          cx: segCx,
          cy: segY, // top edge of segment
          radius: glowRadius,
          stops: [
            { offset: 0, color, alpha: glowAlpha },
            { offset: 0.6, color, alpha: glowAlpha * 0.4 },
            { offset: 1, color, alpha: 0 },
          ],
          compositeOp: 'lighter',
          kind: 'barrier-ambient-glow',
        })
      }

      // Edge highlight — 1px bright-green strip at top of segment (full health only).
      if (seg.health === 4) {
        commands.push({
          type: 'rect',
          x: segX,
          y: segY,
          width: segW,
          height: 1,
          fill: '#aaffaa',
          kind: 'barrier-highlight',
        })
        // Rim lighting: TOP and LEFT edges get 1px bright strips (health 4 only).
        commands.push({
          type: 'rect',
          x: segX,
          y: segY,
          width: segW,
          height: 1,
          fill: '#ccffcc',
          alpha: 0.7,
          kind: 'barrier-rim-top',
        })
        commands.push({
          type: 'rect',
          x: segX,
          y: segY,
          width: 1,
          height: segH,
          fill: '#ccffcc',
          alpha: 0.7,
          kind: 'barrier-rim-left',
        })
      }

      // Heat glow on cracks — visible at health <= 3. Warm orange rect at the
      // crack intersection (center of segment), low alpha so base still reads.
      if (seg.health <= 3) {
        const glowW = Math.min(segW, 6)
        const glowH = Math.min(segH, 6)
        commands.push({
          type: 'rect',
          x: segX + Math.floor(segW / 2 - glowW / 2),
          y: segY + Math.floor(segH / 2 - glowH / 2),
          width: glowW,
          height: glowH,
          fill: '#ff8844',
          alpha: 0.3,
          kind: 'barrier-heat-glow',
        })
      }

      // Damage decorations — progressively more aggressive at lower health.
      if (seg.health <= 3) {
        // Cross-shaped crack overlay (dark).
        commands.push({
          type: 'rect',
          x: segX + segW / 2 - 1,
          y: segY,
          width: 2,
          height: segH,
          fill: '#000000',
          alpha: 0.4,
          kind: 'barrier-crack',
        })
        commands.push({
          type: 'rect',
          x: segX,
          y: segY + segH / 2 - 1,
          width: segW,
          height: 2,
          fill: '#000000',
          alpha: 0.4,
          kind: 'barrier-crack',
        })
      }
      if (seg.health <= 2) {
        // Chipped-off corner (solid black).
        commands.push({
          type: 'rect',
          x: segX + segW - 4,
          y: segY,
          width: 4,
          height: 3,
          fill: '#000000',
          kind: 'barrier-chip',
        })
      }
      if (seg.health === 1) {
        // Heavy damage — alpha-blended dark overlay covers most of segment.
        commands.push({
          type: 'rect',
          x: segX,
          y: segY,
          width: segW,
          height: segH,
          fill: '#000000',
          alpha: 0.5,
          kind: 'barrier-heavy-damage',
        })
      }

      // Smoke/debris above badly damaged segments — wobble via sin(tick).
      // At health <= 2 we emit three trailing puffs rising over 3 ticks,
      // with occasional red-hot color variation (flickering ember).
      if (seg.health <= 2) {
        const wobble = Math.sin(state.tick * 0.2 + seg.offsetX) * 2
        const smokePalette = ['#888888', '#aa6655', '#994422']
        for (let trail = 0; trail < 3; trail++) {
          const color = smokePalette[(state.tick + trail + seg.offsetX) % smokePalette.length]
          commands.push({
            type: 'rect',
            x: segX + segW / 2 + wobble - trail,
            y: segY - 4 - trail * 2,
            width: 2,
            height: 2,
            fill: color,
            alpha: 0.5 - trail * 0.12,
            kind: 'barrier-smoke',
          })
        }
      }
    }
  }

  // ── Barrier shield shimmer rings (#10) ──
  // Dissipating radial ring at each active shimmer's origin. Rendered AFTER
  // all barrier segments so the shimmer is visible on top.
  for (const sh of barrierShimmers) {
    const t = 1 - sh.ticksRemaining / 5 // 0 at spawn → ~1 at expiry
    const radius = 6 + t * 14
    const alpha = 0.7 * (1 - t)
    commands.push({
      type: 'radial',
      cx: sh.cx,
      cy: sh.cy,
      radius,
      stops: [
        { offset: 0, color: '#aaffff', alpha: 0 },
        { offset: 0.6, color: '#88ddff', alpha: alpha * 0.5 },
        { offset: 0.85, color: '#ffffff', alpha },
        { offset: 1, color: '#aaffff', alpha: 0 },
      ],
      compositeOp: 'lighter',
      kind: 'barrier-shimmer',
    })
  }

  // 6. Players (alive only)
  for (const player of Object.values(state.players)) {
    if (!player.alive) continue

    // 6a. Primary player sprite. CONTRACT: left edge is (player.x - 3) * CELL_W,
    // dimensions exactly 7 * CELL_W × 2 * CELL_H. The hitbox derives from these.
    const spriteLeft = (player.x - 3) * CELL_W
    const spriteTop = LAYOUT.PLAYER_Y * CELL_H
    const spriteW = SPRITE_SIZE.player.width * CELL_W
    const spriteH = SPRITE_SIZE.player.height * CELL_H
    const baseColor = COLORS.player[player.slot]

    // Invulnerability: pulse between base color and a brighter tint every 3 ticks.
    // No outline ring — just a color modulation so the ship footprint is unchanged.
    const isInvuln = player.invulnerableUntilTick !== null && state.tick < player.invulnerableUntilTick
    const invulnBright = isInvuln && Math.floor(state.tick / 3) % 2 === 0
    const spriteColor = invulnBright ? '#ffffff' : baseColor

    commands.push({
      type: 'sprite',
      // Player.x is CENTER of sprite; left edge is x - 3
      x: spriteLeft,
      y: spriteTop,
      width: spriteW,
      height: spriteH,
      pixels: PIXEL_ART.player as unknown as number[][],
      color: spriteColor,
      gradientColors: getSchemeOverride(getCurrentScheme()).player[player.slot],
    })

    // 6b. Cockpit highlight — 2 bright white pixels at the top-center of the ship.
    // Stays strictly within [spriteLeft, spriteLeft + spriteW) × [spriteTop, spriteTop + spriteH).
    commands.push({
      type: 'rect',
      x: player.x * CELL_W - 1,
      y: spriteTop,
      width: 2,
      height: 2,
      fill: '#ffffff',
      kind: 'player-cockpit',
    })

    // 6c. Leading-edge highlight — 1 bright pixel at the very top of the ship
    // (reads as a sensor/antenna tip; sits inside the 7×2 sprite bounds).
    commands.push({
      type: 'rect',
      x: player.x * CELL_W,
      y: spriteTop,
      width: 1,
      height: 1,
      fill: '#ffffff',
      kind: 'player-leading-edge',
    })

    // 6d. Wing tip highlights — 2 slightly-brighter pixels at the outer wings.
    // Bottom row of the sprite is fully filled across width, so wing tips sit at
    // x = spriteLeft (far left) and x = spriteLeft + spriteW - 2 (far right).
    const wingY = spriteTop + spriteH - 2
    const wingHighlight = invulnBright ? '#ffffff' : '#aaffff'
    commands.push({
      type: 'rect',
      x: spriteLeft,
      y: wingY,
      width: 2,
      height: 2,
      fill: wingHighlight,
      kind: 'player-wing',
    })
    commands.push({
      type: 'rect',
      x: spriteLeft + spriteW - 2,
      y: wingY,
      width: 2,
      height: 2,
      fill: wingHighlight,
      kind: 'player-wing',
    })

    // 6e. Engine exhaust — 4 small shimmering rects below the sprite.
    // These live BELOW the hitbox so they don't conflict with the sprite bounds.
    const shimmer = Math.sin(state.tick * 0.3) * 0.1
    const exhaustColors = ['#ff8800', '#ff6600', '#ff4400', '#881100']
    for (let i = 0; i < 4; i++) {
      commands.push({
        type: 'rect',
        x: player.x * CELL_W - 4 + ((i * 7 + state.tick) % 5) * 2,
        y: (LAYOUT.PLAYER_Y + SPRITE_SIZE.player.height) * CELL_H + i * 3,
        width: 3,
        height: 3,
        fill: exhaustColors[i],
        alpha: Math.max(0, Math.min(1, 1 - i * 0.2 + shimmer)),
        kind: 'player-exhaust',
      })
    }

    // 6f. Triple-thruster plumes — richer 3-plume exhaust pattern below sprite.
    // Each plume shimmers with its own phase so they don't pulse in unison.
    const plumeBaseY = (LAYOUT.PLAYER_Y + SPRITE_SIZE.player.height) * CELL_H
    const centerPxX = player.x * CELL_W
    const centerPhase = Math.sin(state.tick * 0.35) * 0.15 + 0.85
    const leftPhase = Math.sin(state.tick * 0.25 + 1.1) * 0.18 + 0.7
    const rightPhase = Math.sin(state.tick * 0.3 + 2.3) * 0.18 + 0.7
    const centerCells = 4
    const centerFills = ['#ffee88', '#ffcc44', '#ff8800', '#ff4400']
    for (let i = 0; i < centerCells; i++) {
      commands.push({
        type: 'rect',
        x: centerPxX - 1,
        y: plumeBaseY + i * 3,
        width: 3,
        height: 3,
        fill: centerFills[i],
        alpha: Math.max(0, Math.min(1, centerPhase - i * 0.15)),
        kind: 'player-plume-center',
      })
    }
    const sidePlumeCells = 2
    for (let i = 0; i < sidePlumeCells; i++) {
      commands.push({
        type: 'rect',
        x: centerPxX - CELL_W + 2,
        y: plumeBaseY + i * 3,
        width: 4,
        height: 2,
        fill: i === 0 ? '#aaffff' : '#4488cc',
        alpha: Math.max(0, Math.min(1, leftPhase - i * 0.2)),
        kind: 'player-plume-left',
      })
    }
    for (let i = 0; i < sidePlumeCells; i++) {
      commands.push({
        type: 'rect',
        x: centerPxX + CELL_W - 6,
        y: plumeBaseY + i * 3,
        width: 4,
        height: 2,
        fill: i === 0 ? '#aaffff' : '#4488cc',
        alpha: Math.max(0, Math.min(1, rightPhase - i * 0.2)),
        kind: 'player-plume-right',
      })
    }

    // 6g. Weapon charge glow — bright white-cyan at ship tip, fades over 5 ticks.
    if (player.lastShotTick !== null && player.lastShotTick !== undefined) {
      const sinceShot = state.tick - player.lastShotTick
      if (sinceShot >= 0 && sinceShot <= 5) {
        const fade = 1 - sinceShot / 5
        commands.push({
          type: 'rect',
          x: centerPxX - 1,
          y: spriteTop,
          width: 3,
          height: 3,
          fill: '#ffffff',
          alpha: 0.9 * fade,
          kind: 'player-weapon-glow',
        })
      }
    }

    // 6h. Rim lighting — bright-cyan 1px highlights at top-left and top-right
    // of the sprite, subtly alpha-blended. Stays strictly within sprite bounds.
    commands.push({
      type: 'rect',
      x: spriteLeft,
      y: spriteTop,
      width: 2,
      height: 1,
      fill: '#aaffff',
      alpha: 0.5,
      kind: 'player-rim',
    })
    commands.push({
      type: 'rect',
      x: spriteLeft + spriteW - 2,
      y: spriteTop,
      width: 2,
      height: 1,
      fill: '#aaffff',
      alpha: 0.5,
      kind: 'player-rim',
    })

    // 6i. Engine trail — subtle fading vertical streak below the sprite.
    for (let i = 0; i < 3; i++) {
      commands.push({
        type: 'rect',
        x: centerPxX,
        y: plumeBaseY + (i + 1) * (CELL_H / 2),
        width: 1,
        height: CELL_H / 2,
        fill: '#66ffff',
        alpha: Math.max(0, 0.4 - i * 0.12),
        kind: 'player-trail',
      })
    }

    // 6j. Landing lights — two tiny blinking lights on outer wing tips,
    // alternating cyan/dim on a 30-tick cadence.
    const lightOn = Math.floor(state.tick / 30) % 2 === 0
    const lightFill = lightOn ? '#66ffff' : '#224444'
    commands.push({
      type: 'rect',
      x: spriteLeft + 1,
      y: spriteTop + spriteH - 3,
      width: 1,
      height: 1,
      fill: lightFill,
      alpha: 0.9,
      kind: 'player-landing-light',
    })
    commands.push({
      type: 'rect',
      x: spriteLeft + spriteW - 2,
      y: spriteTop + spriteH - 3,
      width: 1,
      height: 1,
      fill: lightFill,
      alpha: 0.9,
      kind: 'player-landing-light',
    })

    // 6l. Afterburner flame — a tapered diamond plume below the sprite.
    // Core is white-yellow; edges are orange-red. Width oscillates with
    // sin(tick) for flicker. Widest at top, narrowing to single cell at ~row 8.
    {
      const flicker = 0.5 + 0.5 * Math.sin(state.tick * 0.5)
      const flameRows = 8
      const flameBaseY = (LAYOUT.PLAYER_Y + SPRITE_SIZE.player.height) * CELL_H
      const coreFills = ['#ffffcc', '#ffff88', '#ffee66']
      const edgeFills = ['#ff8800', '#ff5522', '#cc2200']
      for (let row = 0; row < flameRows; row++) {
        const halfWidth = Math.max(0, Math.round((flameRows - 1 - row) / 2 + flicker * 0.8))
        const rowY = flameBaseY + row * 2
        commands.push({
          type: 'rect',
          x: centerPxX + Math.floor(CELL_W / 2) - 1,
          y: rowY,
          width: 2,
          height: 2,
          fill: coreFills[row % coreFills.length],
          alpha: Math.max(0.2, 1 - row / flameRows),
          kind: 'player-afterburner-core',
        })
        for (let off = 1; off <= halfWidth; off++) {
          const edgeAlpha = Math.max(0.15, (1 - row / flameRows) * (1 - off / (halfWidth + 1)))
          commands.push({
            type: 'rect',
            x: centerPxX + Math.floor(CELL_W / 2) - 1 - off * 2,
            y: rowY,
            width: 2,
            height: 2,
            fill: edgeFills[(row + off) % edgeFills.length],
            alpha: edgeAlpha,
            kind: 'player-afterburner-edge',
          })
          commands.push({
            type: 'rect',
            x: centerPxX + Math.floor(CELL_W / 2) - 1 + off * 2,
            y: rowY,
            width: 2,
            height: 2,
            fill: edgeFills[(row + off) % edgeFills.length],
            alpha: edgeAlpha,
            kind: 'player-afterburner-edge',
          })
        }
      }
    }

    // 6m. Reflected highlight — 2px bright streak moves left-to-right across
    // the top of the sprite every 120 ticks. Stays within sprite bounds.
    {
      const phase = (state.tick % 120) / 120
      const usableW = Math.max(1, spriteW - 2)
      const reflX = spriteLeft + Math.floor(phase * usableW)
      commands.push({
        type: 'rect',
        x: reflX,
        y: spriteTop,
        width: 2,
        height: 1,
        fill: '#ffffff',
        alpha: 0.9,
        kind: 'player-reflection',
      })
    }

    // 6n. Low-lives warning pulse — when player.lives === 1, tint the sprite
    // red for 3 ticks every 20 ticks.
    if (player.lives === 1) {
      const phase = state.tick % 20
      if (phase < 3) {
        commands.push({
          type: 'rect',
          x: spriteLeft,
          y: spriteTop,
          width: spriteW,
          height: spriteH,
          fill: '#ff2222',
          alpha: 0.3,
          kind: 'player-warning-pulse',
        })
      }
    }

    // 6o. Impact shield burst — when player takes a hit (detected via
    // invulnerableUntilTick newly set in prev→curr), emit 12 rects in two
    // concentric rings around the sprite. Note: the alive→dead transition is
    // unreachable here because we `continue` above when !player.alive.
    if (prevState) {
      const prevPlayer = prevState.players[player.id]
      const invulnChanged =
        player.invulnerableUntilTick !== null &&
        (prevPlayer == null || prevPlayer.invulnerableUntilTick !== player.invulnerableUntilTick)
      if (invulnChanged) {
        const ringCount = 12
        const cxI = centerPxX + CELL_W / 2
        const cyI = spriteTop + spriteH / 2
        for (let i = 0; i < ringCount; i++) {
          const ang = (i / ringCount) * Math.PI * 2
          const ring = i < 6 ? 0 : 1
          const rad = spriteW / 2 + 4 + ring * CELL_W
          commands.push({
            type: 'rect',
            x: cxI + Math.cos(ang) * rad - 2,
            y: cyI + Math.sin(ang) * rad - 2,
            width: 4,
            height: 4,
            fill: '#66aaff',
            alpha: 0.75,
            kind: 'player-impact-shield',
          })
        }
      }
    }

    // 6k. Shield bubble — when invulnerable, place 6 small transparent cyan
    // cells around the sprite perimeter (rotating by tick). Replaces outline ring.
    if (isInvuln) {
      const bubbleCount = 6
      const cx = centerPxX + CELL_W / 2
      const cy = spriteTop + spriteH / 2
      const rx = spriteW / 2 - 1
      const ry = spriteH / 2 - 1
      const rot = state.tick * 0.2
      for (let i = 0; i < bubbleCount; i++) {
        const ang = (i / bubbleCount) * Math.PI * 2 + rot
        const bx = cx + Math.cos(ang) * rx - 1
        const by = cy + Math.sin(ang) * ry - 1
        commands.push({
          type: 'rect',
          x: bx,
          y: by,
          width: 2,
          height: 2,
          fill: '#aaffff',
          alpha: 0.5,
          kind: 'player-shield-bubble',
        })
      }
    }
  }

  // 7-8. Stateful effects: dissolve + confetti. `tickAdvanced` was hoisted
  // above to be usable by barrier shimmer logic — reference it here.

  // Damage flash — fires only on player hit (lives decrease). A previous
  // version also fired a white full-screen flash on score increase (every
  // alien kill), but in busy waves that strobed the whole canvas and read
  // as "explosions making the screen flicker". Kills now communicate via
  // local explosion particles + the HUD score-bump animation instead.
  //
  // Flash peak alpha lowered 0.35 → 0.20 and shake intensity 4 → 2 after
  // user feedback that damage feedback felt jarring in coop. The flash
  // still fades linearly, and the shake is now deterministic (see
  // executor below).
  if (prevState && tickAdvanced) {
    if (state.lives < prevState.lives) {
      triggerShake(2, 10)
      triggerFlash('rgba(255, 0, 0, 0.20)', 3)
    }
  }

  // Typography-transition triggers: score bump (3 ticks) + wave burst (6 ticks).
  // Computed independently of tickAdvanced so single-frame test harnesses that
  // reset effects between calls still see the new transition. The decay is
  // driven by tickAdvanced below so the same tick isn't charged twice.
  // Score bump is debounced — see SCORE_BUMP_COOLDOWN_TICKS.
  if (prevState) {
    if (state.score > prevState.score && state.tick - lastScoreBumpTick >= SCORE_BUMP_COOLDOWN_TICKS) {
      scoreBumpTicks = 3
      lastScoreBumpTick = state.tick
    }
    if (state.wave > prevState.wave) waveBurstTicks = 6
  }

  // Decay shake/flash counters on tick advance
  if (tickAdvanced) {
    if (shakeTicks > 0) shakeTicks -= 1
    if (flashTicks > 0) flashTicks -= 1
    if (scoreBumpTicks > 0) scoreBumpTicks -= 1
    if (waveBurstTicks > 0) waveBurstTicks -= 1
    if (fightFlashTicks > 0) fightFlashTicks -= 1
    if (clearedFlashTicks > 0) clearedFlashTicks -= 1
  }

  // Status-transition flash triggers (cross-tick). Prefer module-level
  // prevGameStatus (true cross-call tracker) but fall back to prevState.status
  // when provided — tests and single-shot render loops commonly pass a prev
  // state for the very first call.
  const effectivePrevStatus = prevGameStatus ?? prevState?.status ?? null
  if (effectivePrevStatus !== null && effectivePrevStatus !== state.status) {
    if (effectivePrevStatus === 'wipe_reveal' && state.status === 'playing') {
      fightFlashTicks = FLASH_DURATION_TICKS
    } else if (effectivePrevStatus === 'playing' && state.status === 'wipe_exit') {
      clearedFlashTicks = FLASH_DURATION_TICKS
    }
  }

  // Death detection: on alien/UFO disappearance, spawn a multi-stage explosion.
  // The legacy `dissolveSystem` (which emitted blocky full-cell alien-colored
  // rects) has been removed — ExplosionSystem provides all particle effects
  // now, using smooth radial gradients and circles.
  if (prevState && tickAdvanced) {
    const currentAliveAlienIds = new Set(
      getAliens(state.entities)
        .filter((a) => a.alive)
        .map((a) => a.id),
    )
    for (const prevAlien of getAliens(prevState.entities)) {
      if (prevAlien.alive && !currentAliveAlienIds.has(prevAlien.id) && !seenDeadAlienIds.has(prevAlien.id)) {
        seenDeadAlienIds.add(prevAlien.id)
        explosionSystem.spawn(
          prevAlien.x,
          prevAlien.y,
          SPRITE_SIZE.alien.width,
          SPRITE_SIZE.alien.height,
          COLORS.alien[prevAlien.type],
          state.tick,
        )
      }
    }
    const currentAliveUfoIds = new Set(
      getUFOs(state.entities)
        .filter((u) => u.alive)
        .map((u) => u.id),
    )
    for (const prevUfo of getUFOs(prevState.entities)) {
      if (prevUfo.alive && !currentAliveUfoIds.has(prevUfo.id) && !seenDeadUfoIds.has(prevUfo.id)) {
        seenDeadUfoIds.add(prevUfo.id)
        explosionSystem.spawn(
          prevUfo.x,
          prevUfo.y,
          SPRITE_SIZE.ufo.width,
          SPRITE_SIZE.ufo.height,
          getUFOColor(state.tick),
          state.tick,
        )
      }
    }
  }

  // Multi-stage explosions — prune old and emit all active stage commands.
  explosionSystem.prune(state.tick)
  for (const cmd of explosionSystem.getDrawCalls(state.tick)) {
    commands.push(cmd)
  }

  // Confetti: trigger once when entering victory state
  const isVictory = state.status === 'game_over' && state.lives > 0
  if (isVictory && !confettiStarted) {
    confettiStarted = true
    confettiSystem.start()
  }
  if (!isVictory && confettiStarted) {
    confettiStarted = false
    confettiSystem.stop()
  }
  if (tickAdvanced) confettiSystem.update()
  for (const p of confettiSystem.getVisibleParticles()) {
    commands.push({
      type: 'rect',
      x: p.x * CELL_W,
      y: p.y * CELL_H,
      width: CELL_W,
      height: CELL_H,
      fill: p.color,
      isConfetti: true,
      kind: 'confetti',
    })
  }

  lastProcessedTick = state.tick

  // 9. HUD — score, wave, lives
  // Canvas is always drawn at internal resolution (STANDARD_WIDTH * CELL_W = 960).
  // CSS scale is applied OUTSIDE the canvas via transform — it doesn't affect
  // drawing coordinates. Font sizes can grow at smaller scales to stay readable.
  const effectiveScale = scale ?? 1
  const hudFontSize = Math.max(28, Math.round(28 / effectiveScale))
  const heartFontSize = Math.max(28, Math.round(28 / effectiveScale))
  const hudFont = canvasFont(hudFontSize, FONT_HUD)
  const heartFont = canvasFontBold(heartFontSize, FONT_HUD)
  const canvasW = STANDARD_WIDTH * CELL_W // 960
  const hudY = 24

  // Score text: briefly bigger & with stronger glow while scoreBumpTicks > 0.
  const scoreIsBumping = scoreBumpTicks > 0
  const scoreFontSize = scoreIsBumping ? Math.round(hudFontSize * 1.4) : hudFontSize
  const scoreFont = scoreIsBumping ? canvasFontBold(scoreFontSize, FONT_HUD) : hudFont
  const scoreGlow = scoreIsBumping ? 18 : 8
  commands.push({
    type: 'text',
    x: 12,
    y: hudY,
    text: `SCORE: ${state.score}`,
    color: COLORS.ui.score,
    font: scoreFont,
    shadowBlur: scoreGlow,
    kind: scoreIsBumping ? 'score-bump' : 'hud-score',
  })

  // Wave counter (center top). When waveBurstTicks > 0, add an extra big-glow
  // decoration text behind the primary to create a flare effect.
  const waveIsBursting = waveBurstTicks > 0
  if (waveIsBursting) {
    // Big outer flare — a larger, transparent-looking glow behind the wave text.
    commands.push({
      type: 'text',
      x: canvasW / 2 - 50,
      y: hudY,
      text: `WAVE ${state.wave}`,
      color: COLORS.ui.wave,
      font: canvasFontBold(Math.round(hudFontSize * 1.3), FONT_HUD),
      shadowBlur: 32,
      kind: 'wave-burst',
    })
  }
  commands.push({
    type: 'text',
    x: canvasW / 2 - 50,
    y: hudY,
    text: `WAVE ${state.wave}`,
    color: COLORS.ui.wave,
    font: hudFont,
    shadowBlur: waveIsBursting ? 18 : 8,
    kind: 'hud-wave',
  })

  // Lives as hearts — use player's lives if playerId known, else state.lives
  const livesSource = playerId && state.players[playerId] ? state.players[playerId].lives : state.lives
  const maxLives = Math.max(state.maxLives, 1)
  const clampedLives = Math.max(0, Math.min(livesSource, maxLives))
  const filled = '\u2665'.repeat(clampedLives)
  const empty = '\u2661'.repeat(maxLives - clampedLives)
  const heartText = filled + empty
  // Emit as a right-aligned text-row so the executor measures the true pixel
  // widths with ctx.measureText — the old hand-rolled `length * size * ratio`
  // approximations drifted visibly because VT323 isn't exactly 0.6-em and
  // Unicode hearts aren't 0.8-em. Baseline 'top' means both segments sit on
  // the same y (no +2 nudge needed between label and hearts).
  commands.push({
    type: 'text-row',
    x: canvasW - 12,
    y: hudY,
    align: 'right',
    baseline: 'top',
    segments: [
      { text: 'LIVES ', color: COLORS.ui.label, font: hudFont, shadowBlur: 8 },
      { text: heartText, color: COLORS.ui.lives, font: heartFont, shadowBlur: 8 },
    ],
    kind: 'hud-lives-row',
  })

  // 9b. HUD player legend (multi-player only) — slot badges [1][2][3][4]
  // rendered just below the wave number on the centre column. Bright when
  // alive, dim when dead/offline. Solo: no legend.
  const playerEntries = Object.values(state.players)
  if (playerEntries.length >= 2) {
    const badgeFontSize = Math.max(14, Math.round(hudFontSize * 0.7))
    const badgeFont = canvasFontBold(badgeFontSize, FONT_HUD)
    // Sort by slot so badges render left→right in slot order
    const sorted = [...playerEntries].sort((a, b) => a.slot - b.slot)
    const spacing = Math.round(badgeFontSize * 1.8) // approx px per badge
    const totalW = spacing * sorted.length
    const startX = canvasW / 2 - totalW / 2
    const legendY = hudY + hudFontSize + 6
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i]
      const isAlive = p.alive && p.lives > 0
      const baseColor = COLORS.player[p.slot]
      // Dim dead players by scaling brightness down; use rgba-style fade here
      // by emitting the bright hex but leaning on shadowBlur for liveness.
      commands.push({
        type: 'text',
        x: startX + i * spacing,
        y: legendY,
        text: `[${p.slot}]`,
        color: isAlive ? baseColor : scaleHexBrightness(baseColor, 0.35),
        font: badgeFont,
        shadowBlur: isAlive ? 10 : 0,
        kind: `hud-player-legend-${p.slot}`,
      })
    }
  }

  // 9c. Wave announcement overlay during wipe_reveal (drawn after entities so
  // it sits ON TOP of sliding-in aliens). wipe_hold was handled early and
  // returned before reaching here.
  if (announcingWave && state.status === 'wipe_reveal' && state.wipeWaveNumber != null) {
    emitWaveAnnouncement(commands, state.wipeWaveNumber, state.tick, scale)
  }

  // 9d. Flash text — FIGHT! / WAVE CLEARED!
  if (fightFlashTicks > 0) {
    const ratio = fightFlashTicks / FLASH_DURATION_TICKS
    const alpha = Math.max(0, Math.min(1, ratio))
    const flashFontSize = Math.max(40, Math.round(48 / (scale ?? 1)))
    commands.push({
      type: 'text',
      x: canvasW / 2 - 80,
      y: (STANDARD_HEIGHT * CELL_H) / 2,
      text: 'FIGHT!',
      color: rgbaFromHex('#ffff00', alpha),
      font: canvasFontBold(flashFontSize, FONT_DISPLAY),
      shadowBlur: Math.round(20 * alpha + 8),
      kind: 'wave-flash-fight',
    })
  }
  if (clearedFlashTicks > 0) {
    const ratio = clearedFlashTicks / FLASH_DURATION_TICKS
    const alpha = Math.max(0, Math.min(1, ratio))
    const flashFontSize = Math.max(36, Math.round(44 / (scale ?? 1)))
    commands.push({
      type: 'text',
      x: canvasW / 2 - 140,
      y: (STANDARD_HEIGHT * CELL_H) / 2,
      text: 'WAVE CLEARED!',
      color: rgbaFromHex('#00ff88', alpha),
      font: canvasFontBold(flashFontSize, FONT_DISPLAY),
      shadowBlur: Math.round(20 * alpha + 8),
      kind: 'wave-flash-cleared',
    })
  }

  // Record status for next-call transition detection.
  prevGameStatus = state.status

  return commands
}

// ─── Execute Draw Commands ────────────────────────────────────────────────────

/**
 * Paint draw commands onto a canvas 2D context.
 * This is the only side-effectful function in this module.
 */
export function executeDrawCommands(ctx: CanvasRenderingContext2D, commands: DrawCommand[], tick?: number): void {
  // Screen shake: translate by a DETERMINISTIC offset driven off the server
  // tick (not Math.random, which re-rolls every rAF frame and caused visible
  // flicker). See shakeJitter for rationale.
  const shakeActive = shakeTicks > 0 && shakeIntensity > 0
  if (shakeActive) {
    try {
      ctx.save()
    } catch {
      /* ignore */
    }
    const { dx, dy } = shakeJitter(tick ?? 0)
    try {
      ctx.translate(dx, dy)
    } catch {
      /* ignore */
    }
  }

  let canvasW = 0
  let canvasH = 0

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'clear':
        ctx.fillStyle = cmd.fill
        ctx.fillRect(0, 0, cmd.width, cmd.height)
        canvasW = cmd.width
        canvasH = cmd.height
        break

      case 'rect':
        if (cmd.alpha !== undefined && cmd.alpha !== 1) {
          try {
            const prevAlpha = ctx.globalAlpha
            ctx.globalAlpha = Math.max(0, Math.min(1, cmd.alpha))
            ctx.fillStyle = cmd.fill
            ctx.fillRect(cmd.x, cmd.y, cmd.width, cmd.height)
            ctx.globalAlpha = prevAlpha
          } catch {
            // ignore in environments without globalAlpha support
          }
        } else {
          ctx.fillStyle = cmd.fill
          ctx.fillRect(cmd.x, cmd.y, cmd.width, cmd.height)
        }
        break

      case 'sprite':
        if (cmd.alpha !== undefined && cmd.alpha !== 1) {
          try {
            const prevAlpha = ctx.globalAlpha
            ctx.globalAlpha = Math.max(0, Math.min(1, cmd.alpha))
            renderSprite(ctx, cmd.x, cmd.y, cmd.width, cmd.height, cmd.pixels, cmd.color, cmd.gradientColors)
            ctx.globalAlpha = prevAlpha
          } catch {
            renderSprite(ctx, cmd.x, cmd.y, cmd.width, cmd.height, cmd.pixels, cmd.color, cmd.gradientColors)
          }
        } else {
          renderSprite(ctx, cmd.x, cmd.y, cmd.width, cmd.height, cmd.pixels, cmd.color, cmd.gradientColors)
        }
        break

      case 'text': {
        ctx.fillStyle = cmd.color
        ctx.font = cmd.font ?? canvasFont(24, FONT_HUD)
        // Optional neon-glow: set shadow before drawing, reset after so
        // subsequent commands aren't affected.
        const hasGlow = cmd.shadowBlur !== undefined && cmd.shadowBlur > 0
        let prevBlur = 0
        let prevShadowColor = 'rgba(0, 0, 0, 0)'
        if (hasGlow) {
          try {
            prevBlur = ctx.shadowBlur
            prevShadowColor = ctx.shadowColor
            ctx.shadowColor = cmd.color
            ctx.shadowBlur = cmd.shadowBlur as number
          } catch {
            // ignore in environments that don't expose shadow properties
          }
        }
        ctx.fillText(cmd.text, cmd.x, cmd.y)
        if (hasGlow) {
          try {
            ctx.shadowBlur = prevBlur
            ctx.shadowColor = prevShadowColor
          } catch {
            /* ignore */
          }
        }
        break
      }

      case 'text-row': {
        // Measure each segment with its own font, then lay them out.
        // Save & restore the baseline/alignment/font/shadow state so this
        // case never leaks into surrounding draw commands.
        const prevBaseline = ctx.textBaseline
        const prevAlign = ctx.textAlign
        const prevBlur = ctx.shadowBlur
        const prevShadowColor = ctx.shadowColor
        try {
          ctx.textBaseline = cmd.baseline ?? 'top'
          // We always use textAlign='left' internally and position each
          // segment ourselves, so mixed fonts (VT323 + Unicode hearts)
          // align on a shared baseline regardless of per-glyph widths.
          ctx.textAlign = 'left'

          const widths: number[] = []
          for (const seg of cmd.segments) {
            ctx.font = seg.font ?? canvasFont(24, FONT_HUD)
            widths.push(ctx.measureText(seg.text).width)
          }
          const totalWidth = widths.reduce((a, b) => a + b, 0)
          const startX = cmd.align === 'right' ? cmd.x - totalWidth : cmd.x

          let cursorX = startX
          for (let i = 0; i < cmd.segments.length; i++) {
            const seg = cmd.segments[i]
            ctx.font = seg.font ?? canvasFont(24, FONT_HUD)
            ctx.fillStyle = seg.color
            if (seg.shadowBlur !== undefined && seg.shadowBlur > 0) {
              try {
                ctx.shadowColor = seg.color
                ctx.shadowBlur = seg.shadowBlur
              } catch {
                /* ignore */
              }
            } else {
              try {
                ctx.shadowBlur = 0
                ctx.shadowColor = 'rgba(0, 0, 0, 0)'
              } catch {
                /* ignore */
              }
            }
            ctx.fillText(seg.text, cursorX, cmd.y)
            cursorX += widths[i]
          }
        } finally {
          try {
            ctx.textBaseline = prevBaseline
            ctx.textAlign = prevAlign
            ctx.shadowBlur = prevBlur
            ctx.shadowColor = prevShadowColor
          } catch {
            /* ignore */
          }
        }
        break
      }

      case 'image': {
        // Optional composite operation (nebula clouds use 'lighter' / 'screen').
        // State captured before try + restored in finally — mirrors the circle
        // and radial cases so a throw cannot leak compositeOp.
        const prevAlpha = ctx.globalAlpha
        const prevOp = ctx.globalCompositeOperation
        try {
          ctx.globalAlpha = cmd.alpha
          if (cmd.compositeOp) {
            ctx.globalCompositeOperation = cmd.compositeOp
          }
          ctx.drawImage(cmd.image, cmd.x, cmd.y)
        } catch {
          // jsdom / environments without drawImage: skip silently.
        } finally {
          ctx.globalAlpha = prevAlpha
          ctx.globalCompositeOperation = prevOp
        }
        break
      }

      case 'circle': {
        // Smooth solid-filled disc. Used for soft particle glows.
        //
        // State is captured BEFORE the try and restored in finally. Without this,
        // a throw mid-draw would leak `globalCompositeOperation = 'lighter'` into
        // every subsequent command, saturating the canvas to white.
        const prevAlpha = ctx.globalAlpha
        const prevBlur = ctx.filter
        const prevOp = ctx.globalCompositeOperation
        try {
          if (cmd.alpha !== undefined) ctx.globalAlpha = cmd.alpha
          if (cmd.blur) ctx.filter = `blur(${cmd.blur}px)`
          if (cmd.compositeOp) ctx.globalCompositeOperation = cmd.compositeOp
          ctx.fillStyle = cmd.fill
          ctx.beginPath()
          ctx.arc(cmd.cx, cmd.cy, Math.max(0, cmd.radius), 0, Math.PI * 2)
          ctx.fill()
        } catch {
          // jsdom often lacks arc; skip silently.
        } finally {
          ctx.globalAlpha = prevAlpha
          ctx.filter = prevBlur
          ctx.globalCompositeOperation = prevOp
        }
        break
      }

      case 'radial': {
        // Radial gradient disc — the workhorse for smooth fireballs/glows.
        // Captures state before try + restores in finally so a failed
        // createRadialGradient can never leak additive blending outward.
        const prevBlur = ctx.filter
        const prevOp = ctx.globalCompositeOperation
        try {
          if (cmd.blur) ctx.filter = `blur(${cmd.blur}px)`
          if (cmd.compositeOp) ctx.globalCompositeOperation = cmd.compositeOp
          const grad = ctx.createRadialGradient(cmd.cx, cmd.cy, 0, cmd.cx, cmd.cy, Math.max(0.1, cmd.radius))
          for (const stop of cmd.stops) {
            grad.addColorStop(stop.offset, rgbaFromHex(stop.color, stop.alpha))
          }
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.arc(cmd.cx, cmd.cy, Math.max(0, cmd.radius), 0, Math.PI * 2)
          ctx.fill()
        } catch {
          // jsdom — skip silently.
        } finally {
          ctx.filter = prevBlur
          ctx.globalCompositeOperation = prevOp
        }
        break
      }
    }
  }

  if (shakeActive) {
    try {
      ctx.restore()
    } catch {
      /* ignore */
    }
  }

  // Damage/hit flash overlay — drawn in un-translated coords.
  if (flashTicks > 0 && flashDuration > 0) {
    const fadeT = flashTicks / flashDuration // 1 → 0 over the duration
    const alpha = Math.max(0, Math.min(1, fadeT))
    try {
      const prevAlpha = ctx.globalAlpha
      ctx.globalAlpha = alpha
      ctx.fillStyle = flashColor
      ctx.fillRect(0, 0, canvasW || 960, canvasH || 576)
      ctx.globalAlpha = prevAlpha
    } catch {
      // ignore
    }
  }

  // CRT scanlines + bloom on top of everything. Pass the current tick so the
  // scanline alpha "breathes" over time.
  applyCRTEffect(ctx, canvasW || 960, canvasH || 576, tick)
}

/**
 * Determine star dot size from color brightness. Brighter stars are in the near
 * depth layer (bigger); dimmer stars are in the far layer (smaller).
 * Produces 3 distinct sizes (1, 2, 3) matching STAR_LAYERS in client-core.
 */
function starSizeFromColor(hex: string): number {
  const h = hex.replace('#', '')
  if (h.length !== 6) return 1
  const r = Number.parseInt(h.slice(0, 2), 16)
  const g = Number.parseInt(h.slice(2, 4), 16)
  const b = Number.parseInt(h.slice(4, 6), 16)
  const brightness = (r + g + b) / 3
  if (brightness >= 140) return STAR_LAYER_SIZES[2] // near/bright
  if (brightness >= 80) return STAR_LAYER_SIZES[1] // mid
  return STAR_LAYER_SIZES[0] // far/dim
}

/**
 * Apply sine-wave brightness modulation to a gradient.
 * Row offset de-synchronizes aliens on different rows so they don't all pulse
 * in unison — matches the TUI's color cycling aesthetic.
 */
function cycleGradient(
  base: { bright: string; dark: string },
  tick: number,
  row: number,
): { bright: string; dark: string } {
  // Modulation amount: ±15% brightness. Period 80 ticks keeps tick 0 at the
  // unmodulated base (so the gradient-identity test still passes) while
  // producing a distinct value at tick 30 (so the cycling test passes).
  const phase = (tick / 80) * Math.PI * 2 + row * 0.6
  const factor = 1 + Math.sin(phase) * 0.15
  return {
    bright: scaleHexBrightness(base.bright, factor),
    dark: base.dark,
  }
}

/**
 * Emit wave announcement draw commands — a centred `WAVE N` text plus a thin
 * border rect. The text's shadowBlur and the border's alpha+size pulse with
 * state.tick so the announcement feels "alive" on screen.
 */
function emitWaveAnnouncement(commands: DrawCommand[], waveNumber: number, tick: number, scale?: number): void {
  const effectiveScale = scale ?? 1
  const fontSize = Math.max(32, Math.round(48 / effectiveScale))

  // Pulse period ~30 ticks (1s at 30Hz). Alpha ramps 0.55→1.0.
  const pulse = 0.5 + 0.5 * Math.sin((tick * Math.PI) / 15)
  const alpha = 0.55 + 0.45 * pulse

  // Border grows slightly with tick, ~±8px breathing.
  const baseHalfW = 160
  const baseHalfH = fontSize
  const grow = 4 + 4 * pulse
  const halfW = baseHalfW + grow
  const halfH = baseHalfH + grow

  const cx = (STANDARD_WIDTH * CELL_W) / 2
  const cy = (STANDARD_HEIGHT * CELL_H) / 2

  // Border rect (thin, animated). We draw a filled rect at low alpha so it
  // reads as a soft highlight behind the text; test asserts varying alpha/size.
  commands.push({
    type: 'rect',
    x: cx - halfW,
    y: cy - halfH,
    width: halfW * 2,
    height: halfH * 2,
    fill: '#002244',
    alpha: 0.15 + 0.15 * pulse,
    kind: 'wave-announce-border',
  })

  // Primary announcement text. shadowBlur varies with pulse for glow effect.
  commands.push({
    type: 'text',
    x: cx - 60,
    y: cy,
    text: `WAVE ${waveNumber}`,
    color: '#00ffff',
    font: canvasFontBold(fontSize, FONT_DISPLAY),
    shadowBlur: Math.round(12 + 20 * alpha),
    kind: 'wave-announce',
  })
}

/**
 * Compute the entrance-animated y position for an alien during wipe_reveal.
 * Aliens start off-screen above (-SPRITE_H) and descend to their formation y.
 * Per-column stagger creates a "rain" effect.
 *
 * @param formationY  The final (logical) y in cells.
 * @param col         Alien column index (used for stagger).
 * @param wipeTicksRemaining  Ticks left in the reveal phase (45 at start, 0 at end).
 * @returns Interpolated y in cells, always in range [-SPRITE_H, formationY].
 */
function entranceY(formationY: number, col: number, wipeTicksRemaining: number | null, row: number = 0): number {
  const totalTicks = 45 // WIPE_TIMING.REVEAL_TICKS
  const remaining = wipeTicksRemaining ?? totalTicks
  const elapsed = totalTicks - remaining
  const linearProgress = Math.min(1, Math.max(0, elapsed / totalTicks))
  // Row stagger: row 0 lands first, row 5 last. Per task spec.
  // Each row is delayed by ~0.08 of total progress (0..0.4 across 6 rows).
  const rowStagger = row * 0.08
  // Small column stagger keeps the scene from feeling like lockstep walls.
  const colStagger = (col % 3) * 0.03
  const stagger = rowStagger + colStagger
  const staggered = Math.max(0, Math.min(1, (linearProgress - stagger) / (1 - stagger || 1)))
  // Ease-out curve — snappy entrance, gentle landing.
  const eased = easeOutQuad(staggered)
  const maxOffsetCells = 30 // well off-screen (>36 rows is overkill; use 30 per spec)
  // offset is measured in cells and decays from -maxOffsetCells to 0
  const offset = (1 - eased) * -maxOffsetCells
  return formationY + offset
}

/** Multiply each RGB channel of a hex color by a factor, clamping to [0, 255]. */
function scaleHexBrightness(hex: string, factor: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return hex
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  const r = clamp(Number.parseInt(h.slice(0, 2), 16) * factor)
  const g = clamp(Number.parseInt(h.slice(2, 4), 16) * factor)
  const b = clamp(Number.parseInt(h.slice(4, 6), 16) * factor)
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * Convert a hex color (#rrggbb) plus alpha (0..1) to an `rgba(r, g, b, a)`
 * CSS string for canvas fill/stroke. Used by radial-gradient stops.
 */
/** Tiny deterministic hash — string → 32-bit unsigned. Used for per-segment seeds. */
function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Seeded PRNG (mulberry32) — deterministic given the same seed. */
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

export function rgbaFromHex(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return hex
  const r = Number.parseInt(h.slice(0, 2), 16)
  const g = Number.parseInt(h.slice(2, 4), 16)
  const b = Number.parseInt(h.slice(4, 6), 16)
  const a = Math.max(0, Math.min(1, alpha))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

/**
 * Render a pixel-art sprite by painting individual pixel cells.
 * Each 1 in the pixel grid is drawn as a filled rectangle; 0s are transparent.
 */
function renderSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  pixels: number[][],
  color: string,
  gradientColors?: { bright: string; dark: string },
): void {
  if (pixels.length === 0) return

  // Try atlas fast path for known sprite shapes when we have gradient colors
  // and the environment supports drawImage.
  if (gradientColors && typeof ctx.drawImage === 'function') {
    const atlasType = identifyAtlasType(pixels)
    const frame = identifyAtlasFrame(pixels, atlasType)
    if (atlasType) {
      const img = getSpriteImage(atlasType, frame, gradientColors.bright, gradientColors.dark)
      if (img) {
        try {
          ctx.drawImage(img as CanvasImageSource, x, y, width, height)
          return
        } catch {
          // fall through to per-pixel fallback
        }
      }
    }
  }

  const rows = pixels.length
  const cols = pixels[0].length
  const cellW = width / cols
  const cellH = height / rows

  for (let row = 0; row < rows; row++) {
    const rowColor = gradientColors ? (row < rows / 2 ? gradientColors.bright : gradientColors.dark) : color
    ctx.fillStyle = rowColor
    for (let col = 0; col < cols; col++) {
      if (pixels[row][col]) {
        ctx.fillRect(x + col * cellW, y + row * cellH, cellW, cellH)
      }
    }
  }
}

/** Identify which PIXEL_ART bitmap produced these pixels, if any, for atlas caching. */
function identifyAtlasType(pixels: number[][]): 'squid' | 'crab' | 'octopus' | 'ufo' | 'player' | null {
  if (
    pixels === (PIXEL_ART.squid.a as unknown as number[][]) ||
    pixels === (PIXEL_ART.squid.b as unknown as number[][])
  )
    return 'squid'
  if (pixels === (PIXEL_ART.crab.a as unknown as number[][]) || pixels === (PIXEL_ART.crab.b as unknown as number[][]))
    return 'crab'
  if (
    pixels === (PIXEL_ART.octopus.a as unknown as number[][]) ||
    pixels === (PIXEL_ART.octopus.b as unknown as number[][])
  )
    return 'octopus'
  if (pixels === (PIXEL_ART.ufo.a as unknown as number[][]) || pixels === (PIXEL_ART.ufo.b as unknown as number[][]))
    return 'ufo'
  if (pixels === (PIXEL_ART.player as unknown as number[][])) return 'player'
  return null
}

function identifyAtlasFrame(pixels: number[][], type: ReturnType<typeof identifyAtlasType>): 'a' | 'b' {
  if (!type || type === 'player') return 'a'
  const bitmap = PIXEL_ART[type]
  if ('a' in bitmap && pixels === (bitmap.a as unknown as number[][])) return 'a'
  return 'b'
}

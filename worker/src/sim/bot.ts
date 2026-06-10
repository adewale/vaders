// worker/src/sim/bot.ts
// Bot policies for the simulation harness (specs/difficulty-tuning-spec.md §3.3).
//
// Each policy is a PURE function of (GameState, slot, gameSeed) → BotIntent.
// Bots act through the same input surface real clients use: the runner turns
// BotIntent into PLAYER_INPUT (held keys) and PLAYER_SHOOT reducer actions —
// exactly what GameRoom queues when it receives `input` / `shoot` WS messages.
//
// Determinism: bot randomness comes from a pure hash of
// (gameSeed, slot, tick, salt) — never Math.random, never state.rngSeed
// (which the reducer mutates). Same seed → identical game.

import type { GameState, Player, AlienEntity, BulletEntity, BarrierEntity, InputState } from '../../../shared/types'
import { LAYOUT, HITBOX, getAliens, getBullets, getBarriers } from '../../../shared/types'

// ─── Intent ───────────────────────────────────────────────────────────────────

export interface BotIntent {
  input: InputState // held movement keys (PLAYER_INPUT)
  shoot: boolean // discrete shoot intent (PLAYER_SHOOT)
}

export type BotPolicyName = 'random' | 'novice' | 'competent'

export type BotPolicy = (state: GameState, slot: number, gameSeed: number) => BotIntent

const IDLE: BotIntent = { input: { left: false, right: false }, shoot: false }

// ─── Deterministic bot RNG ───────────────────────────────────────────────────

/**
 * Pure hash → [0, 1). Mulberry32-style finalizer over a mix of
 * (gameSeed, slot, tick, salt). No internal state, no Math.random.
 */
export function botRand(gameSeed: number, slot: number, tick: number, salt: number): number {
  let h = (gameSeed | 0) ^ Math.imul(slot + 1, 0x85ebca6b) ^ Math.imul(tick + 1, 0xc2b2ae35) ^ Math.imul(salt + 1, 0x27d4eb2f)
  h = Math.imul(h ^ (h >>> 15), h | 1)
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61)
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296
}

// ─── Shared perception helpers ───────────────────────────────────────────────

function findPlayer(state: GameState, slot: number): Player | undefined {
  for (const p of Object.values(state.players)) {
    if (p.slot === slot) return p
  }
  return undefined
}

function liveAliens(state: GameState): AlienEntity[] {
  return getAliens(state.entities).filter((a) => a.alive)
}

/** Alien bullets (dy === 1) currently in flight. */
function alienBullets(state: GameState): BulletEntity[] {
  return getBullets(state.entities).filter((b) => b.dy === 1)
}

function cooldownReady(state: GameState, player: Player): boolean {
  return state.tick - player.lastShotTick >= state.config.playerCooldownTicks
}

function alienCenterX(a: AlienEntity): number {
  return a.x + Math.floor(LAYOUT.ALIEN_WIDTH / 2)
}

/**
 * Is some live alien "aligned" with x? A player bullet at x hits an alien when
 * x ∈ [alien.x, alien.x + ALIEN_WIDTH); `slack` widens that band to tolerate
 * formation drift during bullet flight.
 */
function alignedWithAlien(aliens: AlienEntity[], x: number, slack: number): boolean {
  for (const a of aliens) {
    if (x >= a.x - slack && x < a.x + HITBOX.ALIEN_WIDTH + slack) return true
  }
  return false
}

/**
 * Would a bullet fired from x be absorbed by one of our own barriers?
 * A barrier segment spans [segX, segX + 3) horizontally; intact segments
 * (health > 0) at any row block the shot before it reaches the aliens.
 */
function blockedByBarrier(barriers: BarrierEntity[], x: number): boolean {
  for (const barrier of barriers) {
    for (const seg of barrier.segments) {
      if (seg.health <= 0) continue
      const segX = barrier.x + seg.offsetX * HITBOX.BARRIER_SEGMENT_WIDTH
      if (x >= segX && x < segX + HITBOX.BARRIER_SEGMENT_WIDTH) return true
    }
  }
  return false
}

/**
 * Nearest incoming alien bullet within `hWindow` cells horizontally of px and
 * at/below minY (i.e. close enough to matter). Returns the lowest (closest) one.
 */
function nearestThreat(bullets: BulletEntity[], px: number, hWindow: number, minY: number): BulletEntity | null {
  let best: BulletEntity | null = null
  for (const b of bullets) {
    if (Math.abs(b.x - px) > hWindow) continue
    if (b.y < minY || b.y > LAYOUT.PLAYER_Y) continue
    if (!best || b.y > best.y) best = b
  }
  return best
}

function moveToward(px: number, targetX: number, deadZone: number): InputState {
  if (targetX < px - deadZone) return { left: true, right: false }
  if (targetX > px + deadZone) return { left: false, right: true }
  return { left: false, right: false }
}

function dodgeAway(px: number, bulletX: number): InputState {
  // Move away from the bullet; ties break toward the side with more room.
  if (bulletX > px) return { left: true, right: false }
  if (bulletX < px) return { left: false, right: true }
  return px > (LAYOUT.PLAYER_MIN_X + LAYOUT.PLAYER_MAX_X) / 2
    ? { left: true, right: false }
    : { left: false, right: true }
}

// ─── Policy: random ──────────────────────────────────────────────────────────
// Floor — worst realistic player. Random direction changes, random shooting.

const randomPolicy: BotPolicy = (state, slot, gameSeed) => {
  const me = findPlayer(state, slot)
  if (!me?.alive) return IDLE

  // Re-roll held direction every ~20 ticks (random direction changes).
  const epoch = Math.floor(state.tick / 20)
  const r = botRand(gameSeed, slot, epoch, 1)
  const input: InputState =
    r < 1 / 3 ? { left: true, right: false } : r < 2 / 3 ? { left: false, right: true } : { left: false, right: false }

  // Random shooting, unrelated to aim.
  const shoot = cooldownReady(state, me) && botRand(gameSeed, slot, state.tick, 2) < 0.3

  return { input, shoot }
}

// ─── Policy: novice ──────────────────────────────────────────────────────────
// Approximates a casual player: dodges the nearest alien bullet if within
// 3 cells horizontally, else drifts toward the nearest alien column. Shoots
// when any alien is within ±2 columns, but only acts on ~50% of cooldown
// opportunities (one decision per cooldown window, not per tick).

const novicePolicy: BotPolicy = (state, slot, gameSeed) => {
  const me = findPlayer(state, slot)
  if (!me?.alive) return IDLE

  const aliens = liveAliens(state)
  let input: InputState = { left: false, right: false }

  // Dodge the nearest alien bullet within 3 cells horizontally — but only
  // once it is visibly approaching (lower half of the screen), like a casual
  // player reacting rather than tracking every spawn.
  const threat = nearestThreat(alienBullets(state), me.x, 3, 10)
  if (threat) {
    input = dodgeAway(me.x, threat.x)
  } else if (aliens.length > 0) {
    // Drift toward the nearest alien column, hovering near it rather than
    // parking exactly in its firing lane.
    let nearest = aliens[0]
    let bestDx = Math.abs(alienCenterX(nearest) - me.x)
    for (const a of aliens) {
      const dx = Math.abs(alienCenterX(a) - me.x)
      if (dx < bestDx) {
        bestDx = dx
        nearest = a
      }
    }
    input = moveToward(me.x, alienCenterX(nearest), 4)
  }

  // Shoot when any alien is within ±2 cells of the hit band — but only take
  // ~50% of cooldown opportunities. The roll is per cooldown window so a
  // failed roll skips the whole window instead of re-rolling next tick.
  let shoot = false
  if (cooldownReady(state, me) && alignedWithAlien(aliens, me.x, 2)) {
    const window = Math.floor(state.tick / state.config.playerCooldownTicks)
    shoot = botRand(gameSeed, slot, window, 3) < 0.5
  }

  return { input, shoot }
}

// ─── Policy: competent ───────────────────────────────────────────────────────
// Approximates a player who has played a few games: predicts bullet impacts
// and dodges, camps under the alien formation edge (dodging OUTWARD past the
// edge where no alien can shoot), retreats behind the nearest barrier when
// several bullets are close, and shoots every cooldown when roughly aligned —
// never wasting shots into its own barriers.

/** Alien bullets move 1 cell/tick but skip every 5th tick → 0.8 cells/tick. */
const ALIEN_BULLET_SPEED = 0.8

function ticksToImpact(bulletY: number): number {
  return (LAYOUT.PLAYER_Y - bulletY) / ALIEN_BULLET_SPEED
}

const competentPolicy: BotPolicy = (state, slot, _gameSeed) => {
  const me = findPlayer(state, slot)
  if (!me?.alive) return IDLE

  const aliens = liveAliens(state)
  const bullets = alienBullets(state)
  const barriers = getBarriers(state.entities)

  let input: InputState = { left: false, right: false }

  // Threat model: a bullet is dangerous if it lands soon and within the
  // player kill zone (±3) plus a safety margin of 1.
  let threat: BulletEntity | null = null
  let pressure = 0
  for (const b of bullets) {
    const dt = ticksToImpact(b.y)
    if (dt > 22) continue
    if (Math.abs(b.x - me.x) <= 4 && (!threat || b.y > threat.y)) threat = b
    if (Math.abs(b.x - me.x) <= 9) pressure++
  }

  // Where is the formation edge we want to camp under? Clamp the camping
  // spot away from the screen walls so we never get pinned in a corner when
  // the formation hugs a wall.
  const campMin = LAYOUT.PLAYER_MIN_X + 9
  const campMax = LAYOUT.PLAYER_MAX_X - 9
  let leftmost: AlienEntity | null = null
  let rightmost: AlienEntity | null = null
  for (const a of aliens) {
    if (!leftmost || a.x < leftmost.x) leftmost = a
    if (!rightmost || a.x > rightmost.x) rightmost = a
  }
  const edge =
    leftmost && rightmost
      ? Math.abs(alienCenterX(leftmost) - me.x) <= Math.abs(alienCenterX(rightmost) - me.x)
        ? { x: Math.max(campMin, alienCenterX(leftmost)), outwardDir: -1 }
        : { x: Math.min(campMax, alienCenterX(rightmost)), outwardDir: 1 }
      : null

  if (threat) {
    let handled = false
    if (pressure >= 3) {
      // Several bullets incoming: retreat behind the nearest barrier with
      // intact segments (barriers absorb alien bullets).
      let bestX: number | null = null
      let bestDx = Infinity
      for (const barrier of barriers) {
        if (!barrier.segments.some((s) => s.health > 0)) continue
        const center = barrier.x + Math.floor((HITBOX.BARRIER_SEGMENT_WIDTH * BARRIER_COLS) / 2)
        const dx = Math.abs(center - me.x)
        if (dx < bestDx) {
          bestDx = dx
          bestX = center
        }
      }
      if (bestX !== null && bestDx <= 14) {
        input = moveToward(me.x, bestX, 1)
        handled = true
      }
    }
    if (!handled) {
      // Dodge outward past the formation edge when camping there — no alien
      // is beyond the edge, so that lane is bullet-free. Only when outward
      // means crossing the bullet's lane or running out of screen, step away
      // from the predicted impact point instead. Never dodge into a wall.
      let dir: -1 | 1
      const outwardRoom = edge && edge.outwardDir === -1 ? me.x - LAYOUT.PLAYER_MIN_X : LAYOUT.PLAYER_MAX_X - me.x
      const outwardSafe = edge !== null && (threat.x - me.x) * edge.outwardDir <= 0 && outwardRoom >= 8
      if (outwardSafe && edge) {
        dir = edge.outwardDir as -1 | 1
      } else {
        dir = threat.x >= me.x ? -1 : 1
      }
      if (dir === -1 && me.x <= LAYOUT.PLAYER_MIN_X + 3) dir = 1
      if (dir === 1 && me.x >= LAYOUT.PLAYER_MAX_X - 3) dir = -1
      input = dir === -1 ? { left: true, right: false } : { left: false, right: true }
    }
  } else if (edge) {
    // Camp under the formation edge, nudged off any spot where our own
    // barrier would eat the shot.
    let targetX = edge.x
    if (blockedByBarrier(barriers, targetX)) {
      for (let d = 1; d <= 10; d++) {
        if (!blockedByBarrier(barriers, targetX - d)) {
          targetX -= d
          break
        }
        if (!blockedByBarrier(barriers, targetX + d)) {
          targetX += d
          break
        }
      }
    }
    input = moveToward(me.x, targetX, 0)
  }

  // Shoot every cooldown when roughly aligned and not firing into a barrier.
  const shoot = cooldownReady(state, me) && alignedWithAlien(aliens, me.x, 1) && !blockedByBarrier(barriers, me.x)

  return { input, shoot }
}

/** Columns per barrier (BARRIER_SHAPE is 5 segments wide). */
const BARRIER_COLS = 5

// ─── Registry ─────────────────────────────────────────────────────────────────

export const BOT_POLICIES: Record<BotPolicyName, BotPolicy> = {
  random: randomPolicy,
  novice: novicePolicy,
  competent: competentPolicy,
}

export const BOT_POLICY_NAMES: BotPolicyName[] = ['random', 'novice', 'competent']

export function isBotPolicyName(value: string): value is BotPolicyName {
  return (BOT_POLICY_NAMES as string[]).includes(value)
}

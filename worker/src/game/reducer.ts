// worker/src/game/reducer.ts
// Pure game reducer - all game logic flows through here

import type {
  GameState,
  GameStatus,
  Player,
  AlienEntity,
  BulletEntity,
  UFOEntity,
  ServerEvent,
  InputState,
} from '../../../shared/types'
import {
  LAYOUT,
  HITBOX,
  WIPE_TIMING,
  getAliens,
  getBullets,
  getBarriers,
  getUFOs,
  seededRandom,
  constrainPlayerX,
  applyPlayerInput,
  checkPlayerHit,
  checkAlienHit,
  checkUfoHit,
  checkBarrierSegmentHit,
} from '../../../shared/types'
import { getScaledConfig } from './scaling'

// ─── Game Actions ─────────────────────────────────────────────────────────────

export type GameAction =
  | { type: 'TICK' }  // Fixed cadence, no deltaTime needed
  | { type: 'PLAYER_JOIN'; player: Player }
  | { type: 'PLAYER_LEAVE'; playerId: string }
  | { type: 'PLAYER_INPUT'; playerId: string; input: InputState }
  | { type: 'PLAYER_MOVE'; playerId: string; direction: 'left' | 'right' }  // Discrete movement (one step)
  | { type: 'PLAYER_SHOOT'; playerId: string }
  | { type: 'PLAYER_READY'; playerId: string }
  | { type: 'PLAYER_UNREADY'; playerId: string }
  | { type: 'START_SOLO' }
  | { type: 'START_COUNTDOWN' }
  | { type: 'COUNTDOWN_TICK' }
  | { type: 'COUNTDOWN_CANCEL'; reason: string }

// ─── Reducer Result ───────────────────────────────────────────────────────────

export interface ReducerResult {
  state: GameState
  events: ServerEvent[]      // Events to broadcast to clients
  persist: boolean           // Whether to persist state
  scheduleAlarm?: number     // Schedule DO alarm (ms from now)
}

// ─── State Machine ────────────────────────────────────────────────────────────

const TRANSITIONS: Record<GameStatus, Partial<Record<GameAction['type'], GameStatus>>> = {
  waiting: {
    PLAYER_JOIN: 'waiting',
    PLAYER_READY: 'waiting',
    PLAYER_UNREADY: 'waiting',
    PLAYER_INPUT: 'waiting',
    START_SOLO: 'wipe_hold',
    START_COUNTDOWN: 'countdown',
    PLAYER_LEAVE: 'waiting',
  },
  countdown: {
    COUNTDOWN_TICK: 'countdown',
    COUNTDOWN_CANCEL: 'waiting',
    PLAYER_LEAVE: 'waiting',
    PLAYER_INPUT: 'countdown',
    PLAYER_MOVE: 'countdown',
  },
  wipe_exit: {
    TICK: 'wipe_exit',
    PLAYER_INPUT: 'wipe_exit',
    PLAYER_LEAVE: 'wipe_exit',
  },
  wipe_hold: {
    TICK: 'wipe_hold',
    PLAYER_INPUT: 'wipe_hold',
    PLAYER_LEAVE: 'wipe_hold',
  },
  wipe_reveal: {
    TICK: 'wipe_reveal',
    PLAYER_INPUT: 'wipe_reveal',
    PLAYER_LEAVE: 'wipe_reveal',
  },
  playing: {
    TICK: 'playing',
    PLAYER_INPUT: 'playing',
    PLAYER_MOVE: 'playing',
    PLAYER_SHOOT: 'playing',
    PLAYER_LEAVE: 'playing',
  },
  game_over: {
    // Terminal state - no transitions out
  },
}

export function canTransition(currentStatus: GameStatus, actionType: GameAction['type']): boolean {
  const allowed = TRANSITIONS[currentStatus]
  return actionType in allowed
}

// ─── Main Reducer ─────────────────────────────────────────────────────────────

export function gameReducer(state: GameState, action: GameAction): ReducerResult {
  // Guard transitions with state machine
  if (!canTransition(state.status, action.type)) {
    return { state, events: [], persist: false }
  }

  switch (action.type) {
    case 'TICK':
      // Handle wipe phase ticks separately
      if (state.status === 'wipe_exit' || state.status === 'wipe_hold' || state.status === 'wipe_reveal') {
        return wipeTickReducer(state)
      }
      return tickReducer(state)
    case 'PLAYER_JOIN':
      return playerJoinReducer(state, action.player)
    case 'PLAYER_LEAVE':
      return playerLeaveReducer(state, action.playerId)
    case 'PLAYER_INPUT':
      return inputReducer(state, action.playerId, action.input)
    case 'PLAYER_MOVE':
      return moveReducer(state, action.playerId, action.direction)
    case 'PLAYER_SHOOT':
      return shootReducer(state, action.playerId)
    case 'PLAYER_READY':
      return readyReducer(state, action.playerId)
    case 'PLAYER_UNREADY':
      return unreadyReducer(state, action.playerId)
    case 'START_SOLO':
      return startSoloReducer(state)
    case 'START_COUNTDOWN':
      return startCountdownReducer(state)
    case 'COUNTDOWN_TICK':
      return countdownTickReducer(state)
    case 'COUNTDOWN_CANCEL':
      return countdownCancelReducer(state, action.reason)
    default:
      return { state, events: [], persist: false }
  }
}

// ─── Action Reducers ──────────────────────────────────────────────────────────

function playerJoinReducer(state: GameState, player: Player): ReducerResult {
  const next = structuredClone(state)
  next.players[player.id] = player
  next.mode = Object.keys(next.players).length === 1 ? 'solo' : 'coop'

  return {
    state: next,
    events: [{ type: 'event', name: 'player_joined', data: { player } }],
    persist: true,
  }
}

function playerLeaveReducer(state: GameState, playerId: string): ReducerResult {
  const next = structuredClone(state)
  delete next.players[playerId]
  next.readyPlayerIds = next.readyPlayerIds.filter(id => id !== playerId)

  const playerCount = Object.keys(next.players).length
  if (playerCount === 1) {
    next.mode = 'solo'
  }

  return {
    state: next,
    events: [{ type: 'event', name: 'player_left', data: { playerId } }],
    persist: true,
  }
}

function inputReducer(state: GameState, playerId: string, input: InputState): ReducerResult {
  const player = state.players[playerId]
  if (!player) return { state, events: [], persist: false }

  // Ignore input while dead or respawning
  if (!player.alive) return { state, events: [], persist: false }

  const next = structuredClone(state)
  const nextPlayer = next.players[playerId]

  // Store input state - movement is applied in tickReducer
  // Space Invaders style: instant response, no inertia
  nextPlayer.inputState = input

  return { state: next, events: [], persist: false }
}

/**
 * Discrete movement reducer - moves player immediately.
 * Used by terminals without Kitty keyboard protocol (no key release events).
 * Each key press/repeat moves, eliminating "skating" on release.
 *
 * Moves 2 cells per press to compensate for key repeat rate (~30ms)
 * being slower than continuous movement (1 cell per 33ms tick).
 */
const DISCRETE_MOVE_SPEED = 2

function moveReducer(state: GameState, playerId: string, direction: 'left' | 'right'): ReducerResult {
  const player = state.players[playerId]
  if (!player) return { state, events: [], persist: false }

  // Ignore input while dead or respawning
  if (!player.alive) return { state, events: [], persist: false }

  const next = structuredClone(state)
  const nextPlayer = next.players[playerId]

  // Move immediately (2 cells per press for snappy feel)
  nextPlayer.x = constrainPlayerX(nextPlayer.x, direction, DISCRETE_MOVE_SPEED)

  return { state: next, events: [], persist: false }
}

function shootReducer(state: GameState, playerId: string): ReducerResult {
  const player = state.players[playerId]
  if (!player || !player.alive) return { state, events: [], persist: false }

  // Check cooldown
  if (state.tick - player.lastShotTick < state.config.playerCooldownTicks) {
    return { state, events: [], persist: false }
  }

  const next = structuredClone(state)
  next.players[playerId].lastShotTick = next.tick

  // Create bullet - ID will be assigned by shell
  // NOTE: player.x is the CENTER of the sprite (not left edge)
  // The client renders sprites with: leftEdge = player.x - SPRITE_WIDTH/2
  // So bullet.x = player.x places the bullet at the visual center
  const bullet: BulletEntity = {
    kind: 'bullet',
    id: `b_${next.tick}_${playerId}`,  // Unique bullet ID
    x: player.x,  // player.x IS the center, no offset needed
    y: LAYOUT.PLAYER_Y - LAYOUT.BULLET_SPAWN_OFFSET,
    ownerId: playerId,
    dy: -1,  // Moving up
  }

  next.entities.push(bullet)

  return { state: next, events: [], persist: false }
}

function readyReducer(state: GameState, playerId: string): ReducerResult {
  const player = state.players[playerId]
  if (!player) return { state, events: [], persist: false }
  if (state.readyPlayerIds.includes(playerId)) return { state, events: [], persist: false }

  const next = structuredClone(state)
  next.readyPlayerIds.push(playerId)

  return {
    state: next,
    events: [{ type: 'event', name: 'player_ready', data: { playerId } }],
    persist: true,
  }
}

function unreadyReducer(state: GameState, playerId: string): ReducerResult {
  const player = state.players[playerId]
  if (!player) return { state, events: [], persist: false }
  if (!state.readyPlayerIds.includes(playerId)) return { state, events: [], persist: false }

  const next = structuredClone(state)
  next.readyPlayerIds = next.readyPlayerIds.filter(id => id !== playerId)

  return {
    state: next,
    events: [{ type: 'event', name: 'player_unready', data: { playerId } }],
    persist: true,
  }
}

function startSoloReducer(state: GameState): ReducerResult {
  if (Object.keys(state.players).length !== 1) {
    return { state, events: [], persist: false }
  }

  const next = structuredClone(state)
  next.status = 'wipe_hold'  // Skip exit, go straight to hold for game start
  next.mode = 'solo'
  next.lives = 3
  // Patch all players' lives to match solo config
  for (const player of Object.values(next.players)) {
    player.lives = next.lives
  }
  next.tick = 0
  next.wipeTicksRemaining = WIPE_TIMING.HOLD_TICKS
  next.wipeWaveNumber = 1

  return {
    state: next,
    events: [{ type: 'event', name: 'game_start', data: undefined }],
    persist: true,
  }
}

function startCountdownReducer(state: GameState): ReducerResult {
  const playerCount = Object.keys(state.players).length
  if (playerCount < 2 || state.readyPlayerIds.length !== playerCount) {
    return { state, events: [], persist: false }
  }

  const next = structuredClone(state)
  next.status = 'countdown'
  next.countdownRemaining = 3

  return {
    state: next,
    events: [{ type: 'event', name: 'countdown_tick', data: { count: 3 } }],
    persist: true,
  }
}

function countdownTickReducer(state: GameState): ReducerResult {
  if (state.countdownRemaining === null) return { state, events: [], persist: false }

  const next = structuredClone(state)
  next.countdownRemaining = state.countdownRemaining - 1

  if (next.countdownRemaining <= 0) {
    // Transition to wipe_hold (skip exit for game start)
    next.status = 'wipe_hold'
    next.countdownRemaining = null
    next.wipeTicksRemaining = WIPE_TIMING.HOLD_TICKS
    next.wipeWaveNumber = 1
    return {
      state: next,
      events: [{ type: 'event', name: 'game_start', data: undefined }],
      persist: true,
    }
  }

  return {
    state: next,
    events: [{ type: 'event', name: 'countdown_tick', data: { count: next.countdownRemaining } }],
    persist: false,
  }
}

function countdownCancelReducer(state: GameState, reason: string): ReducerResult {
  const next = structuredClone(state)
  next.status = 'waiting'
  next.countdownRemaining = null

  return {
    state: next,
    events: [{ type: 'event', name: 'countdown_cancelled', data: { reason } }],
    persist: true,
  }
}

// ─── Wipe Tick Reducer ─────────────────────────────────────────────────────────

function wipeTickReducer(state: GameState): ReducerResult {
  const next = structuredClone(state)
  next.tick++

  const events: ServerEvent[] = []
  let persist = false

  // Decrement wipe countdown
  if (next.wipeTicksRemaining !== null) {
    next.wipeTicksRemaining--

    if (next.wipeTicksRemaining <= 0) {
      // Transition to next wipe phase - persist on status changes
      persist = true
      switch (next.status) {
        case 'wipe_exit':
          // Exit complete → hold with wave title
          next.status = 'wipe_hold'
          next.wipeTicksRemaining = WIPE_TIMING.HOLD_TICKS
          break

        case 'wipe_hold':
          // Hold complete → reveal (create aliens with entering=true)
          next.status = 'wipe_reveal'
          next.wipeTicksRemaining = WIPE_TIMING.REVEAL_TICKS
          // Aliens are created by GameRoom when entering wipe_reveal
          // Mark all aliens as entering
          for (const entity of next.entities) {
            if (entity.kind === 'alien') {
              entity.entering = true
            }
          }
          break

        case 'wipe_reveal':
          // Reveal complete → playing (set entering=false)
          next.status = 'playing'
          next.wipeTicksRemaining = null
          next.wipeWaveNumber = null
          // Clear entering flag on all aliens
          for (const entity of next.entities) {
            if (entity.kind === 'alien') {
              entity.entering = false
            }
          }
          break
      }
    }
  }

  return {
    state: next,
    events,
    persist,
  }
}

// ─── Tick Reducer (Main Game Loop) ────────────────────────────────────────────

function tickReducer(state: GameState): ReducerResult {
  if (state.status !== 'playing') {
    return { state, events: [], persist: false }
  }

  const next = structuredClone(state)
  next.tick++

  const events: ServerEvent[] = []
  const playerCount = Object.keys(next.players).length
  const scaled = getScaledConfig(playerCount, next.config)

  // 1. Apply player movement from held input
  for (const player of Object.values(next.players)) {
    if (!player.alive) {
      // Check respawn - player respawns at center of screen
      if (player.respawnAtTick !== null && next.tick >= player.respawnAtTick) {
        player.alive = true
        player.respawnAtTick = null
        player.x = Math.floor(next.config.width / 2)  // Reset to center of screen
        player.invulnerableUntilTick = next.tick + next.config.invulnerabilityTicks
        // Clear input state on respawn - player must press keys again to move
        player.inputState = { left: false, right: false }
        events.push({ type: 'event', name: 'player_respawned', data: { playerId: player.id } })
      }
      continue
    }

    // Space Invaders style movement: instant response, no inertia
    // Ship moves while key is held, stops immediately when released
    player.x = applyPlayerInput(player.x, player.inputState, next.config.playerMoveSpeed)
  }

  // 2. Move bullets
  const bullets = getBullets(next.entities)
  for (const bullet of bullets) {
    // Player bullets (dy=-1) move every tick
    // Alien bullets (dy=1) move 4 out of 5 ticks (20% slower)
    if (bullet.dy === -1 || next.tick % 5 !== 0) {
      bullet.y += bullet.dy * next.config.baseBulletSpeed
    }
  }

  // 3. Check collisions
  const aliens = getAliens(next.entities)
  const barriers = getBarriers(next.entities)

  // Track consumed bullets to avoid double-counting across collision phases
  const consumedBullets = new Set<string>()

  // Bullet-alien collisions
  for (const bullet of bullets) {
    if (bullet.dy !== -1) continue  // Only player bullets hit aliens

    for (const alien of aliens) {
      if (!alien.alive) continue

      if (checkAlienHit(bullet.x, bullet.y, alien.x, alien.y)) {
        alien.alive = false
        bullet.y = -100  // Mark for removal
        consumedBullets.add(bullet.id)

        // Award points and track kill
        next.score += alien.points
        if (bullet.ownerId && next.players[bullet.ownerId]) {
          next.players[bullet.ownerId].kills++
        }

        events.push({
          type: 'event',
          name: 'alien_killed',
          data: { alienId: alien.id, playerId: bullet.ownerId },
        })
        events.push({
          type: 'event',
          name: 'score_awarded',
          data: { playerId: bullet.ownerId, points: alien.points, source: 'alien' },
        })
        break
      }
    }
  }

  // Bullet-UFO collisions
  const currentUfos = getUFOs(next.entities)
  for (const bullet of bullets) {
    if (bullet.dy !== -1) continue  // Only player bullets hit UFOs
    if (consumedBullets.has(bullet.id)) continue

    for (const ufo of currentUfos) {
      if (!ufo.alive) continue

      if (checkUfoHit(bullet.x, bullet.y, ufo.x, ufo.y)) {
        ufo.alive = false
        bullet.y = -100  // Mark for removal
        consumedBullets.add(bullet.id)

        // Award mystery points
        next.score += ufo.points
        if (bullet.ownerId && next.players[bullet.ownerId]) {
          next.players[bullet.ownerId].kills++
        }

        events.push({
          type: 'event',
          name: 'score_awarded',
          data: { playerId: bullet.ownerId, points: ufo.points, source: 'ufo' },
        })
        break
      }
    }
  }

  // Bullet-player collisions (alien bullets)
  for (const bullet of bullets) {
    if (bullet.dy !== 1) continue  // Only alien bullets hit players
    if (consumedBullets.has(bullet.id)) continue

    for (const player of Object.values(next.players)) {
      if (!player.alive) continue
      if (player.invulnerableUntilTick !== null && next.tick < player.invulnerableUntilTick) continue

      if (checkPlayerHit(bullet.x, bullet.y, player.x, LAYOUT.PLAYER_Y)) {
        bullet.y = 100  // Mark for removal
        consumedBullets.add(bullet.id)
        player.alive = false
        player.lives--

        // Stop movement immediately on death
        player.inputState = { left: false, right: false }

        // Set respawn if player has lives remaining (respawn at death position)
        if (player.lives > 0) {
          player.respawnAtTick = next.tick + next.config.respawnDelayTicks
        }

        events.push({ type: 'event', name: 'player_died', data: { playerId: player.id } })
        break
      }
    }
  }

  // Bullet-barrier collisions
  // Segments are rendered at 2x spacing to match visual position
  for (const bullet of bullets) {
    if (consumedBullets.has(bullet.id)) continue

    for (const barrier of barriers) {
      if (consumedBullets.has(bullet.id)) break

      for (const seg of barrier.segments) {
        if (seg.health <= 0) continue

        // Match visual rendering: offset * segment_size
        const segX = barrier.x + seg.offsetX * HITBOX.BARRIER_SEGMENT_WIDTH
        const segY = LAYOUT.BARRIER_Y + seg.offsetY * HITBOX.BARRIER_SEGMENT_HEIGHT

        if (checkBarrierSegmentHit(bullet.x, bullet.y, segX, segY)) {
          seg.health = Math.max(0, seg.health - 1) as 0 | 1 | 2 | 3 | 4
          bullet.y = bullet.dy === -1 ? -100 : 100  // Mark for removal
          consumedBullets.add(bullet.id)
          break
        }
      }
    }
  }

  // Remove off-screen and destroyed bullets
  next.entities = next.entities.filter(e =>
    e.kind !== 'bullet' || (e.y > 0 && e.y < next.config.height)
  )

  // 4. Move aliens
  if (next.tick % scaled.alienMoveIntervalTicks === 0) {
    const liveAliens = aliens.filter(a => a.alive)

    // Check if we need to change direction
    let hitWall = false
    for (const alien of liveAliens) {
      const nextX = alien.x + next.alienDirection * 2
      if (nextX <= LAYOUT.ALIEN_MIN_X || nextX >= LAYOUT.ALIEN_MAX_X) {
        hitWall = true
        break
      }
    }

    if (hitWall) {
      next.alienDirection = (next.alienDirection * -1) as 1 | -1
      for (const alien of liveAliens) {
        alien.y += 1
      }
    } else {
      for (const alien of liveAliens) {
        alien.x += next.alienDirection * 2
      }
    }

    // Alien-barrier collision: aliens destroy barrier segments on contact
    // Segments are 2x2 cells (matching visual), aliens are ALIEN_WIDTH x ALIEN_HEIGHT
    for (const alien of liveAliens) {
      for (const barrier of barriers) {
        for (const seg of barrier.segments) {
          if (seg.health <= 0) continue

          // Segment position (matching visual rendering with 2x multiplier)
          const segX = barrier.x + seg.offsetX * HITBOX.BARRIER_SEGMENT_WIDTH
          const segY = LAYOUT.BARRIER_Y + seg.offsetY * HITBOX.BARRIER_SEGMENT_HEIGHT

          // Check if alien sprite overlaps segment
          // Alien occupies [alien.x, alien.x + width) × [alien.y, alien.y + height)
          // Segment occupies [segX, segX + width) × [segY, segY + height)
          const alienRight = alien.x + HITBOX.ALIEN_WIDTH
          const alienBottom = alien.y + LAYOUT.ALIEN_HEIGHT
          const segRight = segX + HITBOX.BARRIER_SEGMENT_WIDTH
          const segBottom = segY + HITBOX.BARRIER_SEGMENT_HEIGHT

          // AABB overlap check
          if (alien.x < segRight && alienRight > segX &&
              alien.y < segBottom && alienBottom > segY) {
            // Alien destroys the barrier segment completely
            seg.health = 0
          }
        }
      }
    }

    // Game over if aliens reach player level (invasion)
    for (const alien of liveAliens) {
      if (alien.y + LAYOUT.ALIEN_HEIGHT >= LAYOUT.PLAYER_Y) {
        // Invasion! Game over regardless of lives
        next.status = 'game_over'
        next.lives = 0
        events.push({ type: 'event', name: 'invasion', data: undefined })
        return { state: next, events, persist: true }
      }
    }
  }

  // 5. Alien shooting (seeded RNG) - skip if aliens are entering, disabled, or all players dead
  const liveAliens = aliens.filter(a => a.alive)
  const aliensEntering = liveAliens.some(a => a.entering)
  const allPlayersDead = Object.values(next.players).every(p => !p.alive)

  if (!aliensEntering && !next.alienShootingDisabled && !allPlayersDead) {
    // Find bottom-row aliens (can shoot)
    const bottomAliens: AlienEntity[] = []
    const colToBottomAlien = new Map<number, AlienEntity>()
    for (const alien of liveAliens) {
      const existing = colToBottomAlien.get(alien.col)
      if (!existing || alien.row > existing.row) {
        colToBottomAlien.set(alien.col, alien)
      }
    }
    for (const alien of colToBottomAlien.values()) {
      bottomAliens.push(alien)
    }

    // Each bottom alien has a chance to shoot
    // NOTE: Unlike players, alien.x IS the left edge (aliens use left-edge coordinates)
    // So we DO need to add ALIEN_WIDTH/2 to get the center for bullet spawning
    for (const alien of bottomAliens) {
      if (seededRandom(next) < scaled.alienShootProbability) {
        const bullet: BulletEntity = {
          kind: 'bullet',
          id: `ab_${next.tick}_${alien.id}`,
          x: alien.x + Math.floor(LAYOUT.ALIEN_WIDTH / 2),  // Left edge + offset = center
          y: alien.y + LAYOUT.ALIEN_HEIGHT,  // Below alien sprite
          ownerId: null,  // Alien bullet
          dy: 1,  // Moving down
        }
        next.entities.push(bullet)
      }
    }
  }

  // 6. UFO spawning and movement
  const ufos = getUFOs(next.entities)
  const activeUfo = ufos.find(u => u.alive)

  // Move existing UFO
  if (activeUfo) {
    activeUfo.x += activeUfo.direction * 1  // UFO moves 1 cell per tick
    // Remove if off-screen
    if (activeUfo.x < -3 || activeUfo.x > next.config.width + 3) {
      activeUfo.alive = false
    }
  }

  // Spawn new UFO (only if none active, ~0.5% chance per tick = roughly every 6-7 seconds)
  if (!activeUfo && seededRandom(next) < 0.005) {
    const direction = seededRandom(next) < 0.5 ? 1 : -1 as 1 | -1
    const startX = direction === 1 ? -3 : next.config.width + 3
    const mysteryPoints = [50, 100, 150, 200, 300][Math.floor(seededRandom(next) * 5)]

    const ufo: UFOEntity = {
      kind: 'ufo',
      id: `ufo_${next.tick}`,
      x: startX,
      y: 1,
      direction,
      alive: true,
      points: mysteryPoints,
    }
    next.entities.push(ufo)
    events.push({ type: 'event', name: 'ufo_spawn', data: { x: startX } })
  }

  // Remove dead UFOs
  next.entities = next.entities.filter(e => e.kind !== 'ufo' || e.alive)

  // Remove dead aliens (cleanup to prevent memory leak)
  next.entities = next.entities.filter(e => e.kind !== 'alien' || e.alive)

  // 7. Check end conditions
  const allLiveAliens = getAliens(next.entities).filter(a => a.alive)
  const allAliensKilled = allLiveAliens.length === 0

  // Check if any enemy reached bottom
  const aliensReachedBottom = allLiveAliens.some(a => a.y >= LAYOUT.GAME_OVER_Y)
  // Game over when all players are dead AND have no lives remaining
  const allPlayersOutOfLives = Object.values(next.players).every(p => !p.alive && p.lives <= 0)

  if (allAliensKilled) {
    events.push({ type: 'event', name: 'wave_complete', data: { wave: next.wave } })
    // Wave transition handled by shell
  } else if (aliensReachedBottom || allPlayersOutOfLives) {
    next.status = 'game_over'
    events.push({ type: 'event', name: 'game_over', data: { result: 'defeat' } })
  }

  return {
    state: next,
    events,
    persist: false,  // Only persist on key transitions
  }
}

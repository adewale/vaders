// worker/src/game/reducer.ts
// Pure game reducer - all game logic flows through here

import type {
  GameState,
  GameStatus,
  Player,
  Entity,
  AlienEntity,
  BulletEntity,
  BarrierEntity,
  UFOEntity,
  ServerEvent,
  InputState,
} from '../../../shared/types'
import {
  LAYOUT,
  getAliens,
  getBullets,
  getBarriers,
  getUFOs,
  seededRandom,
} from '../../../shared/types'
import { getScaledConfig } from './scaling'

// ─── Game Actions ─────────────────────────────────────────────────────────────

export type GameAction =
  | { type: 'TICK' }  // Fixed cadence, no deltaTime needed
  | { type: 'PLAYER_JOIN'; player: Player }
  | { type: 'PLAYER_LEAVE'; playerId: string }
  | { type: 'PLAYER_INPUT'; playerId: string; input: InputState }
  | { type: 'PLAYER_SHOOT'; playerId: string }
  | { type: 'PLAYER_READY'; playerId: string }
  | { type: 'PLAYER_UNREADY'; playerId: string }
  | { type: 'START_SOLO'; enhancedMode: boolean }
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
    START_SOLO: 'playing',
    START_COUNTDOWN: 'countdown',
    PLAYER_LEAVE: 'waiting',
  },
  countdown: {
    COUNTDOWN_TICK: 'countdown',
    COUNTDOWN_CANCEL: 'waiting',
    PLAYER_LEAVE: 'waiting',
    PLAYER_INPUT: 'countdown',
  },
  playing: {
    TICK: 'playing',
    PLAYER_INPUT: 'playing',
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
      return tickReducer(state)
    case 'PLAYER_JOIN':
      return playerJoinReducer(state, action.player)
    case 'PLAYER_LEAVE':
      return playerLeaveReducer(state, action.playerId)
    case 'PLAYER_INPUT':
      return inputReducer(state, action.playerId, action.input)
    case 'PLAYER_SHOOT':
      return shootReducer(state, action.playerId)
    case 'PLAYER_READY':
      return readyReducer(state, action.playerId)
    case 'PLAYER_UNREADY':
      return unreadyReducer(state, action.playerId)
    case 'START_SOLO':
      return startSoloReducer(state, action.enhancedMode)
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

  const next = structuredClone(state)
  next.players[playerId].inputState = input

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
  const bullet: BulletEntity = {
    kind: 'bullet',
    id: `b_${next.tick}_${playerId}`,  // Unique bullet ID
    x: player.x + Math.floor(LAYOUT.PLAYER_WIDTH / 2),  // Center of player sprite
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

function startSoloReducer(state: GameState, enhancedMode: boolean): ReducerResult {
  if (Object.keys(state.players).length !== 1) {
    return { state, events: [], persist: false }
  }

  const next = structuredClone(state)
  next.status = 'playing'
  next.mode = 'solo'
  next.enhancedMode = enhancedMode
  next.lives = 3
  next.tick = 0

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
    // Transition to playing handled by shell
    next.status = 'playing'
    next.countdownRemaining = null
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
      // Check respawn
      if (player.respawnAtTick !== null && next.tick >= player.respawnAtTick) {
        player.alive = true
        player.respawnAtTick = null
        player.x = Math.floor(next.config.width / 2)  // Center respawn
        events.push({ type: 'event', name: 'player_respawned', data: { playerId: player.id } })
      }
      continue
    }

    if (player.inputState.left) {
      player.x = Math.max(LAYOUT.PLAYER_MIN_X, player.x - next.config.playerMoveSpeed)
    }
    if (player.inputState.right) {
      player.x = Math.min(LAYOUT.PLAYER_MAX_X, player.x + next.config.playerMoveSpeed)
    }
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

  // Bullet-alien collisions
  for (const bullet of bullets) {
    if (bullet.dy !== -1) continue  // Only player bullets hit aliens

    for (const alien of aliens) {
      if (!alien.alive) continue

      // Simple AABB collision
      if (
        Math.abs(bullet.x - alien.x - 1) < LAYOUT.COLLISION_H &&
        Math.abs(bullet.y - alien.y) < LAYOUT.COLLISION_V
      ) {
        alien.alive = false
        bullet.y = -100  // Mark for removal

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

    for (const ufo of currentUfos) {
      if (!ufo.alive) continue

      // UFO is 3 chars wide
      if (
        Math.abs(bullet.x - ufo.x - 1) < LAYOUT.COLLISION_H &&
        Math.abs(bullet.y - ufo.y) < LAYOUT.COLLISION_V
      ) {
        ufo.alive = false
        bullet.y = -100  // Mark for removal

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

    for (const player of Object.values(next.players)) {
      if (!player.alive) continue

      if (
        Math.abs(bullet.x - player.x - 1) < LAYOUT.COLLISION_H &&
        Math.abs(bullet.y - LAYOUT.PLAYER_Y) < LAYOUT.COLLISION_V
      ) {
        bullet.y = 100  // Mark for removal
        player.alive = false
        player.lives--

        // Set respawn if player has lives remaining
        if (player.lives > 0) {
          player.respawnAtTick = next.tick + next.config.respawnDelayTicks
        }

        events.push({ type: 'event', name: 'player_died', data: { playerId: player.id } })
        break
      }
    }
  }

  // Bullet-barrier collisions
  for (const bullet of bullets) {
    for (const barrier of barriers) {
      for (const seg of barrier.segments) {
        if (seg.health <= 0) continue

        const segX = barrier.x + seg.offsetX
        const segY = LAYOUT.BARRIER_Y + seg.offsetY

        if (Math.abs(bullet.x - segX) < 1 && Math.abs(bullet.y - segY) < 1) {
          seg.health = Math.max(0, seg.health - 1) as 0 | 1 | 2 | 3 | 4
          bullet.y = bullet.dy === -1 ? -100 : 100  // Mark for removal
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
  }

  // 5. Alien shooting (seeded RNG)
  const liveAliens = aliens.filter(a => a.alive)

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
  for (const alien of bottomAliens) {
    if (seededRandom(next) < scaled.alienShootProbability) {
      const bullet: BulletEntity = {
        kind: 'bullet',
        id: `ab_${next.tick}_${alien.id}`,
        x: alien.x + Math.floor(LAYOUT.ALIEN_WIDTH / 2),  // Center of alien sprite
        y: alien.y + LAYOUT.ALIEN_HEIGHT,  // Below alien sprite
        ownerId: null,  // Alien bullet
        dy: 1,  // Moving down
      }
      next.entities.push(bullet)
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

  // 7. Check end conditions
  const allAliensKilled = liveAliens.length === 0
  const aliensReachedBottom = liveAliens.some(a => a.y >= LAYOUT.GAME_OVER_Y)
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

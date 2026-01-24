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
  CommanderEntity,
  DiveBomberEntity,
  TransformEntity,
  TransformType,
  ServerEvent,
  InputState,
} from '../../../shared/types'
import {
  LAYOUT,
  getAliens,
  getBullets,
  getBarriers,
  getUFOs,
  getCommanders,
  getDiveBombers,
  getTransforms,
  seededRandom,
} from '../../../shared/types'
import { getScaledConfig } from './scaling'
import { getEnhancedWaveParams, isChallengingStage, enhancedMode } from './modes'

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

  // Ignore input while dead or respawning
  if (!player.alive) return { state, events: [], persist: false }

  const next = structuredClone(state)
  const nextPlayer = next.players[playerId]

  // Store input state - movement is applied in tickReducer
  // Space Invaders style: instant response, no inertia
  nextPlayer.inputState = input

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
      // Check respawn - player respawns at death position
      if (player.respawnAtTick !== null && next.tick >= player.respawnAtTick) {
        player.alive = true
        player.respawnAtTick = null
        // Clear input state on respawn - player must press keys again to move
        player.inputState = { left: false, right: false }
        events.push({ type: 'event', name: 'player_respawned', data: { playerId: player.id } })
      }
      continue
    }

    // Space Invaders style movement: instant response, no inertia
    // Ship moves while key is held, stops immediately when released
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
  // NOTE: In Challenging Stages (Enhanced Mode bonus rounds), aliens do NOT shoot
  const isChallenging = next.enhancedMode && isChallengingStage(next.wave)

  if (!isChallenging) {
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

  // ─── Enhanced Mode Systems ─────────────────────────────────────────────────
  if (next.enhancedMode) {
    // Process Commanders
    processCommanders(next, events)

    // Process Dive Bombers
    processDiveBombers(next, events)

    // Process Transform enemies
    processTransforms(next, events)

    // Enhanced mode collisions (Commanders, Dive Bombers)
    processEnhancedCollisions(next, events, getBullets(next.entities))
  }

  // 7. Check end conditions
  // For enhanced mode, also check commanders and dive bombers
  const allLiveAliens = getAliens(next.entities).filter(a => a.alive)
  const liveCommanders = getCommanders(next.entities).filter(c => c.alive)
  const liveDiveBombers = getDiveBombers(next.entities).filter(d => d.alive)
  const liveTransforms = getTransforms(next.entities)

  const allAliensKilled = allLiveAliens.length === 0 &&
    liveCommanders.length === 0 &&
    liveDiveBombers.length === 0 &&
    liveTransforms.length === 0

  // Check if any enemy reached bottom
  const aliensReachedBottom = allLiveAliens.some(a => a.y >= LAYOUT.GAME_OVER_Y) ||
    liveCommanders.some(c => c.y >= LAYOUT.GAME_OVER_Y) ||
    liveDiveBombers.some(d => d.y >= LAYOUT.GAME_OVER_Y)
  // Game over when all players are dead AND have no lives remaining
  const allPlayersOutOfLives = Object.values(next.players).every(p => !p.alive && p.lives <= 0)

  if (allAliensKilled) {
    // Challenging Stage bonus: 10,000 points for completing all 40 enemies
    if (next.enhancedMode && isChallengingStage(next.wave)) {
      next.score += 10000
      events.push({
        type: 'event',
        name: 'score_awarded',
        data: { playerId: null, points: 10000, source: 'wave_bonus' },
      })
    }
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

// ─── Enhanced Mode: Commander Processing ────────────────────────────────────────

function processCommanders(state: GameState, events: ServerEvent[]) {
  const commanders = getCommanders(state.entities)
  const waveParams = getEnhancedWaveParams(state.wave)

  for (const commander of commanders) {
    if (!commander.alive) continue

    // Commanders move with the alien formation when in formation
    // Move at the same rate as regular aliens
    const playerCount = Object.keys(state.players).length
    const scaled = getScaledConfig(playerCount, state.config)

    if (state.tick % scaled.alienMoveIntervalTicks === 0) {
      // Check if formation would hit wall
      const aliens = getAliens(state.entities).filter(a => a.alive)
      const allEntities = [...aliens, ...commanders.filter(c => c.alive)]

      let hitWall = false
      for (const entity of allEntities) {
        const nextX = entity.x + state.alienDirection * 2
        if (nextX <= LAYOUT.ALIEN_MIN_X || nextX >= LAYOUT.ALIEN_MAX_X) {
          hitWall = true
          break
        }
      }

      if (!hitWall) {
        commander.x += state.alienDirection * 2
      } else {
        commander.y += 1
      }
    }

    // Tractor beam behavior (wave 7+)
    if (waveParams.canTractorBeam && !commander.capturedPlayerId) {
      processTractorBeam(state, commander, events)
    }

    // Dive behavior - commanders can dive occasionally
    if (seededRandom(state) < 0.0005 && !commander.tractorBeamActive) {
      commanderDive(state, commander, events)
    }
  }
}

function processTractorBeam(state: GameState, commander: CommanderEntity, events: ServerEvent[]) {
  // Cooldown check
  if (commander.tractorBeamCooldown > 0) {
    commander.tractorBeamCooldown--
    return
  }

  // Random chance to activate tractor beam
  if (seededRandom(state) < 0.001) {
    commander.tractorBeamActive = true
    commander.tractorBeamCooldown = 300  // 10 seconds at 30Hz

    // Check for players in capture zone (3 chars wide below commander)
    const beamX = commander.x + 2  // Center of commander
    const beamY = commander.y + 2

    for (const player of Object.values(state.players)) {
      if (!player.alive) continue

      // Player is captured if within beam range
      if (Math.abs(player.x - beamX) < 3 && LAYOUT.PLAYER_Y > beamY) {
        commander.capturedPlayerId = player.id
        player.alive = false  // Captured player is temporarily disabled
        player.respawnAtTick = state.tick + 150  // 5 seconds capture time
        events.push({ type: 'event', name: 'player_died', data: { playerId: player.id } })
        break
      }
    }
  }

  // Deactivate beam after brief period if no capture
  if (commander.tractorBeamActive && !commander.capturedPlayerId) {
    if (seededRandom(state) < 0.05) {
      commander.tractorBeamActive = false
    }
  }
}

function commanderDive(state: GameState, commander: CommanderEntity, events: ServerEvent[]) {
  // Commanders dive straight down toward players
  // This is a simplified dive - the full Galaga dive is more complex
  commander.y += 2
}

// ─── Enhanced Mode: Dive Bomber Processing ──────────────────────────────────────

function processDiveBombers(state: GameState, events: ServerEvent[]) {
  const diveBombers = getDiveBombers(state.entities)
  const playerCount = Object.keys(state.players).length
  const scaled = getScaledConfig(playerCount, state.config)

  for (const bomber of diveBombers) {
    if (!bomber.alive) continue

    switch (bomber.diveState) {
      case 'formation':
        // Move with alien formation
        if (state.tick % scaled.alienMoveIntervalTicks === 0) {
          bomber.x += state.alienDirection * 2

          // Check wall collision
          if (bomber.x <= LAYOUT.ALIEN_MIN_X || bomber.x >= LAYOUT.ALIEN_MAX_X) {
            bomber.y += 1
          }
        }

        // Random chance to start diving
        if (seededRandom(state) < 0.002) {
          bomber.diveState = 'diving'
          bomber.divePathProgress = 0
          bomber.diveDirection = seededRandom(state) < 0.5 ? 1 : -1
        }
        break

      case 'diving':
        // Dive pattern: move down and sideways in a wide arc
        bomber.divePathProgress++

        // Galaxian-style dive: sweep across, then reverse at midpoint
        const divePhase = bomber.divePathProgress / 100  // 0 to 1+ over dive

        if (divePhase < 0.5) {
          // First half: sweep to one side
          bomber.x += bomber.diveDirection * 2
          bomber.y += 1
        } else if (divePhase < 0.6) {
          // Midpoint: reverse direction (signature Galaxian move)
          bomber.diveDirection = (bomber.diveDirection * -1) as 1 | -1
          bomber.y += 1
        } else {
          // Second half: sweep to other side while diving
          bomber.x += bomber.diveDirection * 2
          bomber.y += 1
        }

        // Fire shots during dive (4 total: 2 before turn, 2 after)
        if (bomber.divePathProgress === 20 || bomber.divePathProgress === 40 ||
            bomber.divePathProgress === 70 || bomber.divePathProgress === 90) {
          const bullet: BulletEntity = {
            kind: 'bullet',
            id: `db_${state.tick}_${bomber.id}`,
            x: bomber.x + 1,
            y: bomber.y + 2,
            ownerId: null,
            dy: 1,
          }
          state.entities.push(bullet)
        }

        // If reached bottom, start returning
        if (bomber.y >= state.config.height - 2) {
          bomber.diveState = 'returning'
        }
        break

      case 'returning':
        // Return to formation from bottom (fly back up off-screen then reappear at top)
        bomber.y -= 2
        bomber.x += (bomber.col * LAYOUT.ALIEN_COL_SPACING - bomber.x) * 0.1  // Drift toward formation position

        if (bomber.y <= LAYOUT.ALIEN_START_Y + bomber.row * LAYOUT.ALIEN_ROW_SPACING) {
          bomber.diveState = 'formation'
          bomber.divePathProgress = 0
        }
        break
    }
  }
}

// ─── Enhanced Mode: Transform Processing ────────────────────────────────────────

function processTransforms(state: GameState, events: ServerEvent[]) {
  const transforms = getTransforms(state.entities)

  for (const transform of transforms) {
    // Transform enemies dive rapidly and exit
    transform.x += transform.velocity.x
    transform.y += transform.velocity.y
    transform.lifetime--

    // Remove if off-screen or lifetime expired
    if (transform.y > state.config.height || transform.y < 0 ||
        transform.x < 0 || transform.x > state.config.width ||
        transform.lifetime <= 0) {
      // Mark for removal by setting to invalid position
      transform.y = -1000
    }
  }

  // Remove expired transforms
  state.entities = state.entities.filter(e =>
    e.kind !== 'transform' || e.y > -100
  )
}

// ─── Enhanced Mode: Collision Processing ────────────────────────────────────────

function processEnhancedCollisions(state: GameState, events: ServerEvent[], bullets: BulletEntity[]) {
  const waveParams = getEnhancedWaveParams(state.wave)

  // Player bullets vs Commanders
  const commanders = getCommanders(state.entities)
  for (const bullet of bullets) {
    if (bullet.dy !== -1) continue  // Only player bullets

    for (const commander of commanders) {
      if (!commander.alive) continue

      // Commander is wider than regular aliens (6 chars)
      if (
        Math.abs(bullet.x - commander.x - 3) < 4 &&
        Math.abs(bullet.y - commander.y) < LAYOUT.COLLISION_V
      ) {
        bullet.y = -100  // Mark for removal

        // Commander takes 2 hits
        commander.health = (commander.health - 1) as 1 | 2
        if (commander.health <= 0) {
          commander.alive = false

          // Calculate points (150 formation, 400 solo dive, 800 with escort, 1600 with 2)
          const isDiving = commander.y > LAYOUT.ALIEN_START_Y + 6
          const escortCount = commander.escorts.length
          let points = 150
          if (isDiving) {
            points = escortCount >= 2 ? 1600 : escortCount >= 1 ? 800 : 400
          }

          // Free captured player bonus
          if (commander.capturedPlayerId) {
            const captured = state.players[commander.capturedPlayerId]
            if (captured) {
              captured.alive = true
              captured.respawnAtTick = null
              points += 500  // Bonus for freeing player
            }
            commander.capturedPlayerId = null
          }

          state.score += points
          if (bullet.ownerId && state.players[bullet.ownerId]) {
            state.players[bullet.ownerId].kills++
          }

          events.push({
            type: 'event',
            name: 'alien_killed',
            data: { alienId: commander.id, playerId: bullet.ownerId },
          })
          events.push({
            type: 'event',
            name: 'score_awarded',
            data: { playerId: bullet.ownerId, points, source: 'commander' },
          })
        }
        break
      }
    }
  }

  // Player bullets vs Dive Bombers
  const diveBombers = getDiveBombers(state.entities)
  for (const bullet of bullets) {
    if (bullet.dy !== -1) continue

    for (const bomber of diveBombers) {
      if (!bomber.alive) continue

      if (
        Math.abs(bullet.x - bomber.x - 1) < LAYOUT.COLLISION_H &&
        Math.abs(bullet.y - bomber.y) < LAYOUT.COLLISION_V
      ) {
        bomber.alive = false
        bullet.y = -100

        // Points: 80 formation, 160 diving
        const isDiving = bomber.diveState === 'diving'
        const points = isDiving ? 160 : 80

        state.score += points
        if (bullet.ownerId && state.players[bullet.ownerId]) {
          state.players[bullet.ownerId].kills++
        }

        events.push({
          type: 'event',
          name: 'alien_killed',
          data: { alienId: bomber.id, playerId: bullet.ownerId },
        })
        events.push({
          type: 'event',
          name: 'score_awarded',
          data: { playerId: bullet.ownerId, points, source: 'alien' },
        })

        // Transform on death (wave 4+, 20% chance)
        if (waveParams.canTransform && seededRandom(state) < 0.2) {
          spawnTransforms(state, bomber, events)
        }
        break
      }
    }
  }

  // Player bullets vs Transforms
  const transforms = getTransforms(state.entities)
  for (const bullet of bullets) {
    if (bullet.dy !== -1) continue

    for (const transform of transforms) {
      if (
        Math.abs(bullet.x - transform.x) < 2 &&
        Math.abs(bullet.y - transform.y) < 2
      ) {
        transform.y = -1000  // Mark for removal
        bullet.y = -100

        // Transform points based on wave
        let points = 333  // 1000 / 3 for scorpion
        if (state.wave >= 7) points = 666  // 2000 / 3 for stingray
        if (state.wave >= 10) points = 1000  // 3000 / 3 for mini commander

        state.score += points
        if (bullet.ownerId && state.players[bullet.ownerId]) {
          state.players[bullet.ownerId].kills++
        }

        events.push({
          type: 'event',
          name: 'score_awarded',
          data: { playerId: bullet.ownerId, points, source: 'alien' },
        })
        break
      }
    }
  }
}

function spawnTransforms(state: GameState, source: DiveBomberEntity, events: ServerEvent[]) {
  // Determine transform type based on wave
  let transformType: TransformType = 'scorpion'
  if (state.wave >= 10) transformType = 'mini_commander'
  else if (state.wave >= 7) transformType = 'stingray'

  // Spawn 3 transforms in different directions
  const directions = [
    { x: -2, y: 1 },
    { x: 0, y: 2 },
    { x: 2, y: 1 },
  ]

  for (let i = 0; i < 3; i++) {
    const transform: TransformEntity = {
      kind: 'transform',
      id: `tr_${state.tick}_${i}`,
      x: source.x,
      y: source.y,
      type: transformType,
      velocity: directions[i],
      lifetime: 150,  // 5 seconds at 30Hz
    }
    state.entities.push(transform)
  }
}

// shared/types.ts
// All game types, interfaces, and constants for Vaders

// ─── Coordinate System ────────────────────────────────────────────────────────
// All entity positions are TOP-LEFT origin:
// - x: 0 = left edge, increases rightward
// - y: 0 = top edge, increases downward
// - Entity sprites render from their (x, y) position rightward/downward
// Screen is 120×36 cells (columns × rows)

export interface Position {
  x: number  // Top-left x coordinate
  y: number  // Top-left y coordinate
}

export interface GameEntity extends Position {
  id: string  // Monotonic string ID: "e_1", "e_2", etc.
}

// ─── Layout Constants ─────────────────────────────────────────────────────────

/** Standard game dimensions - fixed size for all players */
export const STANDARD_WIDTH = 120
export const STANDARD_HEIGHT = 36

/** Layout constants for the 120×36 game grid */
export const LAYOUT = {
  PLAYER_Y: 31,              // Y position for player ships (5 rows from bottom)
  PLAYER_MIN_X: 2,           // Left boundary for player movement
  PLAYER_MAX_X: 114,         // Right boundary for player movement (120 - 5 - 1)
  PLAYER_WIDTH: 5,           // Width of player sprite (2-line sprite)
  PLAYER_HEIGHT: 2,          // Height of player sprite
  BULLET_SPAWN_OFFSET: 2,    // Bullet spawns this far above player
  BARRIER_Y: 25,             // Y position for barrier row
  ALIEN_START_Y: 3,          // Initial Y position for top alien row
  ALIEN_COL_SPACING: 7,      // Horizontal spacing between alien columns (wider for 5-char sprites)
  ALIEN_ROW_SPACING: 3,      // Vertical spacing between alien rows (for 2-line sprites)
  ALIEN_MIN_X: 2,            // Left boundary for alien movement
  ALIEN_MAX_X: 114,          // Right boundary for alien movement
  ALIEN_WIDTH: 5,            // Width of alien sprite
  ALIEN_HEIGHT: 2,           // Height of alien sprite
  GAME_OVER_Y: 28,           // If aliens reach this Y, game over
  COLLISION_H: 3,            // Horizontal collision threshold (for 5-wide sprites)
  COLLISION_V: 2,            // Vertical collision threshold (for 2-tall sprites)
} as const

// ─── Hitbox Constants ────────────────────────────────────────────────────────
// These match the visual sprite sizes for accurate collision detection

export const HITBOX = {
  PLAYER_HALF_WIDTH: 2,      // Player.x is center, sprite width 5, so half is 2
  ALIEN_WIDTH: 5,            // Left-edge based, full sprite width
  ALIEN_HEIGHT: 2,           // Full sprite height
  UFO_WIDTH: 5,              // Left-edge based, full sprite width
  UFO_HEIGHT: 2,             // Full sprite height
  BARRIER_SEGMENT_WIDTH: 2,  // Each segment is 2 chars wide
  BARRIER_SEGMENT_HEIGHT: 2, // Each segment is 2 rows tall
} as const

// ─── Player ───────────────────────────────────────────────────────────────────

export type PlayerSlot = 1 | 2 | 3 | 4
export type PlayerColor = 'green' | 'cyan' | 'yellow' | 'magenta'

export const PLAYER_COLORS: Record<PlayerSlot, PlayerColor> = {
  1: 'green',
  2: 'cyan',
  3: 'yellow',
  4: 'magenta',
}

export interface Player {
  id: string
  name: string
  x: number                         // Horizontal position CENTER of sprite (y is always LAYOUT.PLAYER_Y)
  slot: PlayerSlot
  color: PlayerColor
  lastShotTick: number              // Tick of last shot (for cooldown)
  alive: boolean
  lives: number                     // Individual lives (starts at 3)
  respawnAtTick: number | null      // Tick to respawn after death
  kills: number

  // Input state (server-authoritative, updated from client input messages)
  inputState: {
    left: boolean
    right: boolean
  }
}

// ─── Enemies ──────────────────────────────────────────────────────────────────

export type ClassicAlienType = 'squid' | 'crab' | 'octopus'

// ─── Alien Registry ──────────────────────────────────────────────────────────

export const ALIEN_REGISTRY = {
  squid:   { points: 30, sprite: '╔═╗', color: 'magenta' },
  crab:    { points: 20, sprite: '/°\\', color: 'cyan' },
  octopus: { points: 10, sprite: '{ö}', color: 'green' },
} as const

export const FORMATION_ROWS: ClassicAlienType[] = ['squid', 'crab', 'crab', 'octopus', 'octopus']

// ─── Unified Entity Types (discriminated union on 'kind') ─────────────────────

export interface AlienEntity {
  kind: 'alien'
  id: string
  x: number  // LEFT EDGE of sprite (unlike Player which uses CENTER)
  y: number
  type: ClassicAlienType
  alive: boolean
  row: number
  col: number
  points: number
  entering: boolean  // True during wipe_reveal phase, prevents shooting
}

export interface BulletEntity {
  kind: 'bullet'
  id: string
  x: number  // CENTER of bullet (spawns from center of player/alien)
  y: number
  ownerId: string | null  // null = alien bullet
  dy: -1 | 1              // -1 = up (player), 1 = down (alien)
}

export interface BarrierSegment {
  offsetX: number
  offsetY: number
  health: 0 | 1 | 2 | 3 | 4  // 4=full → 3 → 2 → 1 → 0=destroyed
                              // Visual: █(4) → ▓(3) → ▒(2) → ░(1) → gone(0)
}

export interface BarrierEntity {
  kind: 'barrier'
  id: string
  x: number  // LEFT EDGE of barrier (unlike Player which uses CENTER)
  segments: BarrierSegment[]
}

export interface UFOEntity {
  kind: 'ufo'
  id: string
  x: number  // LEFT EDGE of sprite (unlike Player which uses CENTER)
  y: number  // Always 1 (top row)
  direction: 1 | -1  // 1 = right, -1 = left
  alive: boolean
  points: number     // 50-300 (mystery score)
}

// Unified entity type for all game objects
export type Entity =
  | AlienEntity
  | BulletEntity
  | BarrierEntity
  | UFOEntity

// ─── Entity Filter Helpers ────────────────────────────────────────────────────

export function getAliens(entities: Entity[]): AlienEntity[] {
  return entities.filter((e): e is AlienEntity => e.kind === 'alien')
}

export function getBullets(entities: Entity[]): BulletEntity[] {
  return entities.filter((e): e is BulletEntity => e.kind === 'bullet')
}

export function getBarriers(entities: Entity[]): BarrierEntity[] {
  return entities.filter((e): e is BarrierEntity => e.kind === 'barrier')
}

export function getUFOs(entities: Entity[]): UFOEntity[] {
  return entities.filter((e): e is UFOEntity => e.kind === 'ufo')
}

// ─── Movement Utilities ──────────────────────────────────────────────────────

/**
 * Constrain a player's X position within movement boundaries.
 * Centralizes boundary checking that was previously duplicated across files.
 *
 * @param currentX - Current X position
 * @param direction - Movement direction ('left' or 'right')
 * @param speed - Movement speed in cells
 * @returns New X position constrained to [PLAYER_MIN_X, PLAYER_MAX_X]
 */
export function constrainPlayerX(
  currentX: number,
  direction: 'left' | 'right',
  speed: number
): number {
  if (direction === 'left') {
    return Math.max(LAYOUT.PLAYER_MIN_X, currentX - speed)
  }
  return Math.min(LAYOUT.PLAYER_MAX_X, currentX + speed)
}

/**
 * Apply held input to player position (for continuous movement).
 * Player moves while keys are held, stops immediately when released.
 *
 * @param currentX - Current X position
 * @param input - Input state with left/right booleans
 * @param speed - Movement speed in cells
 * @returns New X position
 */
export function applyPlayerInput(
  currentX: number,
  input: { left: boolean; right: boolean },
  speed: number
): number {
  let x = currentX
  if (input.left) {
    x = Math.max(LAYOUT.PLAYER_MIN_X, x - speed)
  }
  if (input.right) {
    x = Math.min(LAYOUT.PLAYER_MAX_X, x + speed)
  }
  return x
}

// ─── Collision Utilities ─────────────────────────────────────────────────────
// These functions fix X bounds to match visual rendering while preserving
// Y tolerance for bullet movement (bullets move before collision detection)

/**
 * Check if a bullet hits a player.
 * Player.x is CENTER of sprite (width 5), so visual span is [x-2, x+3).
 * Y uses tolerance (COLLISION_V=2) to account for bullet movement.
 */
export function checkPlayerHit(bX: number, bY: number, pX: number, pY: number): boolean {
  return bX >= pX - HITBOX.PLAYER_HALF_WIDTH &&
         bX < pX + HITBOX.PLAYER_HALF_WIDTH + 1 &&
         Math.abs(bY - pY) < LAYOUT.COLLISION_V  // Keep Y tolerance for bullet movement
}

/**
 * Check if a bullet hits an alien.
 * Alien.x is LEFT EDGE of sprite (width 5), so visual span is [x, x+5).
 * Y uses tolerance (COLLISION_V=2) to account for bullet movement.
 */
export function checkAlienHit(bX: number, bY: number, aX: number, aY: number): boolean {
  return bX >= aX && bX < aX + HITBOX.ALIEN_WIDTH &&
         Math.abs(bY - aY) < LAYOUT.COLLISION_V  // Keep Y tolerance for bullet movement
}

/**
 * Check if a bullet hits a UFO.
 * UFO.x is LEFT EDGE of sprite (width 5), so visual span is [x, x+5).
 * Y uses tolerance (COLLISION_V=2) to account for bullet movement.
 */
export function checkUfoHit(bX: number, bY: number, uX: number, uY: number): boolean {
  return bX >= uX && bX < uX + HITBOX.UFO_WIDTH &&
         Math.abs(bY - uY) < LAYOUT.COLLISION_V  // Keep Y tolerance for bullet movement
}

/**
 * Check if a bullet hits a barrier segment.
 * Segment position already includes the 2x multiplier for visual position.
 * Uses point collision (< 1 tolerance) for precise barrier hits.
 */
export function checkBarrierSegmentHit(bX: number, bY: number, segX: number, segY: number): boolean {
  return bX >= segX && bX < segX + HITBOX.BARRIER_SEGMENT_WIDTH &&
         bY >= segY && bY < segY + HITBOX.BARRIER_SEGMENT_HEIGHT
}

// ─── Game Config ──────────────────────────────────────────────────────────────

export interface GameConfig {
  width: number                        // Default: 120
  height: number                       // Default: 36
  maxPlayers: number                   // Default: 4
  tickIntervalMs: number               // Default: 33 (~30Hz tick rate)

  // Tick-based timing (game loop)
  baseAlienMoveIntervalTicks: number   // Ticks between alien moves
  baseBulletSpeed: number              // Cells per tick
  baseAlienShootRate: number           // Probability per tick (use getScaledConfig)
  playerCooldownTicks: number          // Ticks between shots
  playerMoveSpeed: number              // Cells per tick when holding move key
  respawnDelayTicks: number            // Ticks until respawn (90 = 3s at 30Hz)
}

export const DEFAULT_CONFIG: GameConfig = {
  width: STANDARD_WIDTH,               // 120 (standard size)
  height: STANDARD_HEIGHT,             // 36 (standard size)
  maxPlayers: 4,
  tickIntervalMs: 33,                  // ~30Hz server tick

  // Tick-based timing
  baseAlienMoveIntervalTicks: 18,      // Move every 18 ticks (20% slower than 15)
  baseBulletSpeed: 1,                  // 1 cell per tick (player bullets)
  baseAlienShootRate: 0.016,           // 20% slower shooting (was 0.02)
  playerCooldownTicks: 6,              // ~200ms between shots
  playerMoveSpeed: 1,                  // 1 cell per tick when holding key (Space Invaders style)
  respawnDelayTicks: 90,               // 3 seconds at 30Hz
}

/** Return type of getScaledConfig() - player-count-scaled game parameters */
export interface ScaledConfig {
  alienMoveIntervalTicks: number    // Ticks between alien moves (scaled from base)
  alienShootProbability: number     // Probability per tick (~0.017 to 0.042)
  alienCols: number                 // Grid columns (11-15 based on player count)
  alienRows: number                 // Grid rows (5-6 based on player count)
  lives: number                     // Shared lives (3 solo, 5 coop)
}

/** Wave configuration for progression */
export interface WaveConfig {
  alienCols: number
  alienRows: number
  speedMult: number
}

/** Event names that can be emitted during gameplay (matches ServerEvent.name) */
export type GameEvent =
  | 'player_joined'
  | 'player_left'
  | 'player_ready'
  | 'player_unready'
  | 'player_died'
  | 'player_respawned'
  | 'countdown_tick'
  | 'countdown_cancelled'
  | 'game_start'
  | 'alien_killed'
  | 'score_awarded'
  | 'wave_complete'
  | 'game_over'
  | 'invasion'
  | 'ufo_spawn'

// ─── Game State ───────────────────────────────────────────────────────────────

export type GameStatus = 'waiting' | 'countdown' | 'wipe_exit' | 'wipe_hold' | 'wipe_reveal' | 'playing' | 'game_over'

export interface GameState {
  roomId: string                    // 6-char base36 (0-9, A-Z)
  mode: 'solo' | 'coop'
  status: GameStatus
  tick: number
  rngSeed: number                   // Seeded RNG state for determinism

  // Countdown state (only valid when status === 'countdown')
  countdownRemaining: number | null  // 3, 2, 1, or null

  players: Record<string, Player>
  readyPlayerIds: string[]          // Array for JSON serialization

  // All game entities in a single array with discriminated union
  entities: Entity[]

  wave: number
  lives: number                     // 3 solo, 5 co-op
  score: number
  alienDirection: 1 | -1

  // Wipe state: server-controlled transition timing
  wipeTicksRemaining: number | null  // Countdown for current wipe phase
  wipeWaveNumber: number | null      // Wave number to display during wipe

  // Debug flag: completely disable alien shooting
  alienShootingDisabled: boolean

  config: GameConfig
}

// ─── Wipe Timing Constants ────────────────────────────────────────────────────
// Server-side wipe phase durations at 30Hz tick rate
// These are the canonical values - client should derive from these

export const WIPE_TIMING = {
  /** Ticks for iris closing (1 second at 30Hz) */
  EXIT_TICKS: 30,
  /** Ticks for black screen with wave title (1 second at 30Hz) */
  HOLD_TICKS: 30,
  /** Ticks for iris opening + aliens entering (2 seconds at 30Hz) */
  REVEAL_TICKS: 60,
} as const

// ─── Barrier Factory ──────────────────────────────────────────────────────────

/** Canonical barrier shape - arch with gap in center bottom */
export const BARRIER_SHAPE = [
  [1, 1, 1, 1, 1],  // Top row: solid
  [1, 1, 0, 1, 1],  // Bottom row: gap in center (arch)
] as const

/**
 * Create barrier segments from the canonical shape.
 * Each segment starts with health=4.
 */
export function createBarrierSegments(): BarrierSegment[] {
  const segments: BarrierSegment[] = []
  for (let row = 0; row < BARRIER_SHAPE.length; row++) {
    for (let col = 0; col < BARRIER_SHAPE[row].length; col++) {
      if (BARRIER_SHAPE[row][col]) {
        segments.push({ offsetX: col, offsetY: row, health: 4 })
      }
    }
  }
  return segments
}

// ─── Alien Formation Factory ──────────────────────────────────────────────────

/**
 * Create an alien formation grid.
 * This is the canonical formation creation logic - use this everywhere.
 *
 * @param cols - Number of columns
 * @param rows - Number of rows
 * @param screenWidth - Screen width for centering (default: STANDARD_WIDTH)
 * @param idGenerator - Function to generate unique IDs (default: counter-based)
 * @returns Array of AlienEntity objects
 */
export function createAlienFormation(
  cols: number,
  rows: number,
  screenWidth: number = STANDARD_WIDTH,
  idGenerator?: () => string
): AlienEntity[] {
  const aliens: AlienEntity[] = []
  // Calculate grid width using sprite width
  const gridWidth = (cols - 1) * LAYOUT.ALIEN_COL_SPACING + LAYOUT.ALIEN_WIDTH
  const startX = Math.floor((screenWidth - gridWidth) / 2)

  let idCounter = 0
  const generateId = idGenerator || (() => `alien-${idCounter++}`)

  for (let row = 0; row < rows; row++) {
    const type = FORMATION_ROWS[row] || 'octopus'
    for (let col = 0; col < cols; col++) {
      aliens.push({
        kind: 'alien',
        id: generateId(),
        type,
        row,
        col,
        x: startX + col * LAYOUT.ALIEN_COL_SPACING,
        y: LAYOUT.ALIEN_START_Y + row * LAYOUT.ALIEN_ROW_SPACING,
        alive: true,
        points: ALIEN_REGISTRY[type].points,
        entering: false,
      })
    }
  }
  return aliens
}

// ─── Seeded RNG ───────────────────────────────────────────────────────────────

/**
 * Seeded random number generator (mulberry32)
 * Mutates state.rngSeed and returns value in [0, 1)
 */
export function seededRandom(state: GameState): number {
  let t = (state.rngSeed += 0x6d2b79f5)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  state.rngSeed = t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// Re-export protocol types for convenience (single import source)
export * from './protocol'

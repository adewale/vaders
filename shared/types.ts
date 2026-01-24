// shared/types.ts
// All game types, interfaces, and constants for Vaders

// ─── Coordinate System ────────────────────────────────────────────────────────
// All entity positions are TOP-LEFT origin:
// - x: 0 = left edge, increases rightward
// - y: 0 = top edge, increases downward
// - Entity sprites render from their (x, y) position rightward/downward
// Screen is 80×24 cells (columns × rows)

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
  x: number                         // Horizontal position (y is always LAYOUT.PLAYER_Y)
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
  x: number
  y: number
  type: ClassicAlienType
  alive: boolean
  row: number
  col: number
  points: number
}

export interface CommanderEntity {
  kind: 'commander'
  id: string
  x: number
  y: number
  alive: boolean
  health: 1 | 2
  tractorBeamActive: boolean
  tractorBeamCooldown: number
  capturedPlayerId: string | null
  escorts: string[]  // IDs of escorting aliens
}

export interface DiveBomberEntity {
  kind: 'dive_bomber'
  id: string
  x: number
  y: number
  alive: boolean
  diveState: 'formation' | 'diving' | 'returning'
  divePathProgress: number
  diveDirection: 1 | -1
  row: number
  col: number
}

export interface BulletEntity {
  kind: 'bullet'
  id: string
  x: number
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
  x: number               // Left edge (y is always LAYOUT.BARRIER_Y)
  segments: BarrierSegment[]
}

export interface UFOEntity {
  kind: 'ufo'
  id: string
  x: number
  y: number          // Always 1 (top row)
  direction: 1 | -1  // 1 = right, -1 = left
  alive: boolean
  points: number     // 50-300 (mystery score)
}

export type TransformType = 'scorpion' | 'stingray' | 'mini_commander'

export interface TransformEntity {
  kind: 'transform'
  id: string
  x: number
  y: number
  type: TransformType
  velocity: Position
  lifetime: number
}

// Unified entity type for all game objects
export type Entity =
  | AlienEntity
  | CommanderEntity
  | DiveBomberEntity
  | BulletEntity
  | BarrierEntity
  | TransformEntity
  | UFOEntity

// ─── Entity Filter Helpers ────────────────────────────────────────────────────

export function getAliens(entities: Entity[]): AlienEntity[] {
  return entities.filter((e): e is AlienEntity => e.kind === 'alien')
}

export function getCommanders(entities: Entity[]): CommanderEntity[] {
  return entities.filter((e): e is CommanderEntity => e.kind === 'commander')
}

export function getDiveBombers(entities: Entity[]): DiveBomberEntity[] {
  return entities.filter((e): e is DiveBomberEntity => e.kind === 'dive_bomber')
}

export function getBullets(entities: Entity[]): BulletEntity[] {
  return entities.filter((e): e is BulletEntity => e.kind === 'bullet')
}

export function getBarriers(entities: Entity[]): BarrierEntity[] {
  return entities.filter((e): e is BarrierEntity => e.kind === 'barrier')
}

export function getTransforms(entities: Entity[]): TransformEntity[] {
  return entities.filter((e): e is TransformEntity => e.kind === 'transform')
}

export function getUFOs(entities: Entity[]): UFOEntity[] {
  return entities.filter((e): e is UFOEntity => e.kind === 'ufo')
}

// ─── Game Config ──────────────────────────────────────────────────────────────

export interface GameConfig {
  width: number                        // Default: 80
  height: number                       // Default: 24
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
  playerMoveSpeed: 1,                  // 1 cell per tick when holding key
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

/** Wave configuration for Enhanced mode progression */
export interface WaveConfig {
  alienCols: number
  alienRows: number
  speedMult: number
  hasCommanders: boolean
  hasDiveBombers: boolean
  hasTransforms: boolean
  isChallenging: boolean            // Bonus wave with no shooting
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
  | 'ufo_spawn'

// ─── Game State ───────────────────────────────────────────────────────────────

export type GameStatus = 'waiting' | 'countdown' | 'playing' | 'game_over'

export interface GameState {
  roomId: string                    // 6-char base36 (0-9, A-Z)
  mode: 'solo' | 'coop'
  status: GameStatus
  tick: number
  enhancedMode: boolean             // TODO: Enhanced mode (Galaga-style) planned for future release
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

  config: GameConfig
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

// worker/src/game/scaling.ts
// Player count scaling logic

import type { DifficultyConfig, GameConfig, ScaledConfig, GameState } from '../../../shared/types'
import {
  LAYOUT,
  ALIEN_MOVE_STEP,
  ALIEN_DROP_STEP,
  getBullets,
  getAliens,
  applyPlayerInput,
} from '../../../shared/types'

/**
 * Resolve the effective game parameters for a player count and wave from a
 * DifficultyConfig document (see specs/difficulty-tuning-spec.md §2.3).
 *
 * Wave ramp (no-op with DEFAULT_DIFFICULTY's all-zero waveRamp):
 *   speedMult(wave) = speedMult * (1 + speedPctPerWave * (min(wave, maxWaveForRamp) - 1))
 *   shootMult(wave) = shootMult * (1 + shootPctPerWave * (min(wave, maxWaveForRamp) - 1))
 */
export function getScaledConfig(playerCount: number, wave: number, difficulty: DifficultyConfig): ScaledConfig {
  // Out-of-range player counts (0, 5, …) fall back to the 1-player entry,
  // matching the old hardcoded table's `?? scaleTable[1]` behavior.
  const entry = difficulty.perPlayerCount[playerCount as 1 | 2 | 3 | 4] ?? difficulty.perPlayerCount[1]

  const { speedPctPerWave, shootPctPerWave, maxWaveForRamp } = difficulty.waveRamp
  const rampWaves = Math.min(wave, maxWaveForRamp) - 1
  const speedMult = entry.speedMult * (1 + speedPctPerWave * rampWaves)
  const shootMult = entry.shootMult * (1 + shootPctPerWave * rampWaves)

  // The game's lives mechanics are a shared pool; 'per-player' mode just
  // sizes the pool proportionally to player count.
  const lives = difficulty.livesMode === 'per-player' ? entry.lives * playerCount : entry.lives

  return {
    alienMoveIntervalTicks: Math.max(1, Math.floor(difficulty.base.alienMoveIntervalTicks / speedMult)),
    alienShootProbability: difficulty.base.alienShootRate * shootMult, // ~0.016 to 0.040 per tick (default)
    alienCols: entry.cols,
    alienRows: entry.rows,
    lives,
    barriers: entry.barriers,
  }
}

export function getPlayerSpawnX(slot: number, playerCount: number, screenWidth: number): number {
  const positions: Record<number, number[]> = {
    1: [Math.floor(screenWidth / 2)],
    2: [Math.floor(screenWidth / 3), Math.floor((2 * screenWidth) / 3)],
    3: [Math.floor(screenWidth / 4), Math.floor(screenWidth / 2), Math.floor((3 * screenWidth) / 4)],
    4: [
      Math.floor(screenWidth / 5),
      Math.floor((2 * screenWidth) / 5),
      Math.floor((3 * screenWidth) / 5),
      Math.floor((4 * screenWidth) / 5),
    ],
  }
  return positions[playerCount]?.[slot - 1] ?? Math.floor(screenWidth / 2)
}

// Pure movement-only tick for testing (no collisions, shooting, waves, etc.)
// Does NOT validate full game loop - only tests basic movement physics
export function tickMovementOnly(state: GameState, config: GameConfig): GameState {
  const playerCount = Object.keys(state.players).length
  const scaled = getScaledConfig(playerCount, state.wave, state.difficulty)

  // Clone state to avoid mutation
  const next = structuredClone(state)
  next.tick++

  // Process player input using shared utility
  for (const player of Object.values(next.players)) {
    if (!player.alive) continue
    player.x = applyPlayerInput(player.x, player.inputState, config.playerMoveSpeed)
  }

  // Move bullets using shared filter helper
  const bullets = getBullets(next.entities)
  for (const bullet of bullets) {
    bullet.y += bullet.dy * config.baseBulletSpeed
  }

  // Remove off-screen bullets (y <= 0 is top, y >= height is bottom)
  next.entities = next.entities.filter((e) => e.kind !== 'bullet' || (e.y > 0 && e.y < config.height))

  // Move aliens (if on move interval) using shared filter helper
  if (next.tick % scaled.alienMoveIntervalTicks === 0) {
    const aliens = getAliens(next.entities).filter((a) => a.alive)
    for (const alien of aliens) {
      alien.x += next.alienDirection * ALIEN_MOVE_STEP
    }
    // Check for wall collision and reverse
    const hitWall = aliens.some((a) => a.x <= LAYOUT.ALIEN_MIN_X || a.x >= LAYOUT.ALIEN_MAX_X)
    if (hitWall) {
      next.alienDirection = (next.alienDirection * -1) as 1 | -1
      for (const alien of aliens) {
        alien.y += ALIEN_DROP_STEP
      }
    }
  }

  return next
}

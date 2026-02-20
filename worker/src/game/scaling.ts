// worker/src/game/scaling.ts
// Player count scaling logic

import type { GameConfig, ScaledConfig, GameState } from '../../../shared/types'
import { LAYOUT, ALIEN_MOVE_STEP, ALIEN_DROP_STEP, getBullets, getAliens, applyPlayerInput } from '../../../shared/types'

export function getScaledConfig(playerCount: number, baseConfig: GameConfig): ScaledConfig {
  // Scaling table per player count. shootMult is applied to baseAlienShootRate
  // from GameConfig so the base probability is configurable rather than hardcoded.
  const scaleTable = {
    1: { speedMult: 1.0,  shootMult: 1.0,   cols: 11, rows: 5 }, // base rate
    2: { speedMult: 1.25, shootMult: 1.5,   cols: 11, rows: 5 }, // 50% more shooting
    3: { speedMult: 1.5,  shootMult: 2.0,   cols: 13, rows: 5 }, // 2x shooting
    4: { speedMult: 1.75, shootMult: 2.5,   cols: 13, rows: 6 }, // 2.5x shooting
  }
  const scale = scaleTable[playerCount as keyof typeof scaleTable] ?? scaleTable[1]

  // Use baseAlienShootRate from config as the base, scaled by player count
  const shootProbability = baseConfig.baseAlienShootRate * scale.shootMult

  return {
    alienMoveIntervalTicks: Math.floor(baseConfig.baseAlienMoveIntervalTicks / scale.speedMult),
    alienShootProbability: shootProbability,  // ~0.016 to 0.040 per tick
    alienCols: scale.cols,
    alienRows: scale.rows,
    lives: playerCount === 1 ? 3 : 5,
  }
}

export function getPlayerSpawnX(slot: number, playerCount: number, screenWidth: number): number {
  const positions: Record<number, number[]> = {
    1: [Math.floor(screenWidth / 2)],
    2: [Math.floor(screenWidth / 3), Math.floor(2 * screenWidth / 3)],
    3: [Math.floor(screenWidth / 4), Math.floor(screenWidth / 2), Math.floor(3 * screenWidth / 4)],
    4: [Math.floor(screenWidth / 5), Math.floor(2 * screenWidth / 5), Math.floor(3 * screenWidth / 5), Math.floor(4 * screenWidth / 5)],
  }
  return positions[playerCount]?.[slot - 1] ?? Math.floor(screenWidth / 2)
}

// Pure movement-only tick for testing (no collisions, shooting, waves, etc.)
// Does NOT validate full game loop - only tests basic movement physics
export function tickMovementOnly(state: GameState, config: GameConfig): GameState {
  const playerCount = Object.keys(state.players).length
  const scaled = getScaledConfig(playerCount, config)

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
  next.entities = next.entities.filter(e =>
    e.kind !== 'bullet' || (e.y > 0 && e.y < config.height)
  )

  // Move aliens (if on move interval) using shared filter helper
  if (next.tick % scaled.alienMoveIntervalTicks === 0) {
    const aliens = getAliens(next.entities).filter(a => a.alive)
    for (const alien of aliens) {
      alien.x += next.alienDirection * ALIEN_MOVE_STEP
    }
    // Check for wall collision and reverse
    const hitWall = aliens.some(a => a.x <= LAYOUT.ALIEN_MIN_X || a.x >= LAYOUT.ALIEN_MAX_X)
    if (hitWall) {
      next.alienDirection = (next.alienDirection * -1) as 1 | -1
      for (const alien of aliens) {
        alien.y += ALIEN_DROP_STEP
      }
    }
  }

  return next
}

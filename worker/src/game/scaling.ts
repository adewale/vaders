// worker/src/game/scaling.ts
// Player count scaling logic

import type { GameConfig, ScaledConfig, GameState } from '../../../shared/types'
import { LAYOUT, getBullets, getAliens, applyPlayerInput } from '../../../shared/types'

export function getScaledConfig(playerCount: number, baseConfig: GameConfig): ScaledConfig {
  // shootsPerSecond: average shots aliens fire per second (from bottom row)
  // At 30Hz tick rate, probability per tick = shootsPerSecond / 30
  // Monotonically increases with player count for increased difficulty
  const scaleTable = {
    1: { speedMult: 1.0,  shootsPerSecond: 0.5,  cols: 11, rows: 5 }, // 0.5/s = 1 shot every 2s
    2: { speedMult: 1.25, shootsPerSecond: 0.75, cols: 11, rows: 5 }, // 0.75/s = 1 shot every 1.3s
    3: { speedMult: 1.5,  shootsPerSecond: 1.0,  cols: 13, rows: 5 }, // 1.0/s = 1 shot per second
    4: { speedMult: 1.75, shootsPerSecond: 1.25, cols: 15, rows: 6 }, // 1.25/s = 1 shot every 0.8s
  }
  const scale = scaleTable[playerCount as keyof typeof scaleTable] ?? scaleTable[1]

  // Convert shots/second to probability per tick
  // P(shoot per tick) = shootsPerSecond / tickRate
  const tickRate = 1000 / baseConfig.tickIntervalMs  // e.g., 1000/33 ≈ 30Hz
  const shootProbability = scale.shootsPerSecond / tickRate

  return {
    alienMoveIntervalTicks: Math.floor(baseConfig.baseAlienMoveIntervalTicks / scale.speedMult),
    alienShootProbability: shootProbability,  // ~0.017 to 0.042 per tick
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
      alien.x += next.alienDirection * 2
    }
    // Check for wall collision and reverse
    const hitWall = aliens.some(a => a.x <= LAYOUT.ALIEN_MIN_X || a.x >= LAYOUT.ALIEN_MAX_X)
    if (hitWall) {
      next.alienDirection = (next.alienDirection * -1) as 1 | -1
      for (const alien of aliens) {
        alien.y += 1
      }
    }
  }

  return next
}

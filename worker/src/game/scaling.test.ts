// worker/src/game/scaling.test.ts
// Unit tests for scaling logic

import { describe, it, expect } from 'vitest'
import { getScaledConfig, getPlayerSpawnX } from './scaling'
import { DEFAULT_CONFIG, STANDARD_WIDTH } from '../../../shared/types'

// ============================================================================
// getScaledConfig Tests
// ============================================================================

describe('getScaledConfig', () => {
  describe('1 player (solo) configuration', () => {
    it('returns lives = 3', () => {
      const scaled = getScaledConfig(1, DEFAULT_CONFIG)
      expect(scaled.lives).toBe(3)
    })

    it('returns speedMult = 1.0 (base alien move interval)', () => {
      const scaled = getScaledConfig(1, DEFAULT_CONFIG)
      // alienMoveIntervalTicks = floor(baseAlienMoveIntervalTicks / 1.0)
      expect(scaled.alienMoveIntervalTicks).toBe(DEFAULT_CONFIG.baseAlienMoveIntervalTicks)
    })

    it('returns alienCols = 11', () => {
      const scaled = getScaledConfig(1, DEFAULT_CONFIG)
      expect(scaled.alienCols).toBe(11)
    })

    it('returns alienRows = 5', () => {
      const scaled = getScaledConfig(1, DEFAULT_CONFIG)
      expect(scaled.alienRows).toBe(5)
    })

    it('calculates alienShootProbability based on shootsPerSecond = 0.5', () => {
      const scaled = getScaledConfig(1, DEFAULT_CONFIG)
      const tickRate = 1000 / DEFAULT_CONFIG.tickIntervalMs // ~30Hz
      const expectedProbability = 0.5 / tickRate
      expect(scaled.alienShootProbability).toBeCloseTo(expectedProbability, 5)
    })
  })

  describe('2 player configuration', () => {
    it('returns lives = 5 (shared)', () => {
      const scaled = getScaledConfig(2, DEFAULT_CONFIG)
      expect(scaled.lives).toBe(5)
    })

    it('returns speedMult = 1.25 (faster alien move interval)', () => {
      const scaled = getScaledConfig(2, DEFAULT_CONFIG)
      // alienMoveIntervalTicks = floor(18 / 1.25) = floor(14.4) = 14
      const expectedInterval = Math.floor(DEFAULT_CONFIG.baseAlienMoveIntervalTicks / 1.25)
      expect(scaled.alienMoveIntervalTicks).toBe(expectedInterval)
    })

    it('returns alienCols = 11', () => {
      const scaled = getScaledConfig(2, DEFAULT_CONFIG)
      expect(scaled.alienCols).toBe(11)
    })

    it('returns alienRows = 5', () => {
      const scaled = getScaledConfig(2, DEFAULT_CONFIG)
      expect(scaled.alienRows).toBe(5)
    })

    it('calculates alienShootProbability based on shootsPerSecond = 0.75', () => {
      const scaled = getScaledConfig(2, DEFAULT_CONFIG)
      const tickRate = 1000 / DEFAULT_CONFIG.tickIntervalMs
      const expectedProbability = 0.75 / tickRate
      expect(scaled.alienShootProbability).toBeCloseTo(expectedProbability, 5)
    })
  })

  describe('3 player configuration', () => {
    it('returns lives = 5 (shared)', () => {
      const scaled = getScaledConfig(3, DEFAULT_CONFIG)
      expect(scaled.lives).toBe(5)
    })

    it('returns speedMult = 1.5 (faster alien move interval)', () => {
      const scaled = getScaledConfig(3, DEFAULT_CONFIG)
      // alienMoveIntervalTicks = floor(18 / 1.5) = floor(12) = 12
      const expectedInterval = Math.floor(DEFAULT_CONFIG.baseAlienMoveIntervalTicks / 1.5)
      expect(scaled.alienMoveIntervalTicks).toBe(expectedInterval)
    })

    it('returns alienCols = 13', () => {
      const scaled = getScaledConfig(3, DEFAULT_CONFIG)
      expect(scaled.alienCols).toBe(13)
    })

    it('returns alienRows = 5', () => {
      const scaled = getScaledConfig(3, DEFAULT_CONFIG)
      expect(scaled.alienRows).toBe(5)
    })

    it('calculates alienShootProbability based on shootsPerSecond = 1.0', () => {
      const scaled = getScaledConfig(3, DEFAULT_CONFIG)
      const tickRate = 1000 / DEFAULT_CONFIG.tickIntervalMs
      const expectedProbability = 1.0 / tickRate
      expect(scaled.alienShootProbability).toBeCloseTo(expectedProbability, 5)
    })
  })

  describe('4 player configuration', () => {
    it('returns lives = 5 (shared)', () => {
      const scaled = getScaledConfig(4, DEFAULT_CONFIG)
      expect(scaled.lives).toBe(5)
    })

    it('returns speedMult = 1.75 (fastest alien move interval)', () => {
      const scaled = getScaledConfig(4, DEFAULT_CONFIG)
      // alienMoveIntervalTicks = floor(18 / 1.75) = floor(10.28) = 10
      const expectedInterval = Math.floor(DEFAULT_CONFIG.baseAlienMoveIntervalTicks / 1.75)
      expect(scaled.alienMoveIntervalTicks).toBe(expectedInterval)
    })

    it('returns alienCols = 13', () => {
      const scaled = getScaledConfig(4, DEFAULT_CONFIG)
      expect(scaled.alienCols).toBe(13)
    })

    it('returns alienRows = 6', () => {
      const scaled = getScaledConfig(4, DEFAULT_CONFIG)
      expect(scaled.alienRows).toBe(6)
    })

    it('calculates alienShootProbability based on shootsPerSecond = 1.25', () => {
      const scaled = getScaledConfig(4, DEFAULT_CONFIG)
      const tickRate = 1000 / DEFAULT_CONFIG.tickIntervalMs
      const expectedProbability = 1.25 / tickRate
      expect(scaled.alienShootProbability).toBeCloseTo(expectedProbability, 5)
    })
  })

  describe('edge cases', () => {
    it('defaults to 1 player scale config for 0 players', () => {
      const scaled = getScaledConfig(0, DEFAULT_CONFIG)
      // Uses scaleTable[1] for cols/rows, but lives formula uses actual playerCount
      // lives = playerCount === 1 ? 3 : 5 -> 0 !== 1 -> 5
      expect(scaled.lives).toBe(5)
      expect(scaled.alienCols).toBe(11)
      expect(scaled.alienRows).toBe(5)
    })

    it('defaults to 1 player scale config for invalid player count', () => {
      const scaled = getScaledConfig(5, DEFAULT_CONFIG)
      // Uses scaleTable[1] for cols/rows, but lives formula uses actual playerCount
      expect(scaled.lives).toBe(5)
      expect(scaled.alienCols).toBe(11)
      expect(scaled.alienRows).toBe(5)
    })

    it('defaults to 1 player scale config for negative player count', () => {
      const scaled = getScaledConfig(-1, DEFAULT_CONFIG)
      // Uses scaleTable[1] for cols/rows, but lives formula uses actual playerCount
      expect(scaled.lives).toBe(5)
      expect(scaled.alienCols).toBe(11)
      expect(scaled.alienRows).toBe(5)
    })
  })

  describe('alienMoveIntervalTicks calculation', () => {
    it('correctly floors the result of division', () => {
      // With baseAlienMoveIntervalTicks = 18:
      // 1 player: 18 / 1.0 = 18
      // 2 players: 18 / 1.25 = 14.4 -> 14
      // 3 players: 18 / 1.5 = 12
      // 4 players: 18 / 1.75 = 10.28 -> 10

      expect(getScaledConfig(1, DEFAULT_CONFIG).alienMoveIntervalTicks).toBe(18)
      expect(getScaledConfig(2, DEFAULT_CONFIG).alienMoveIntervalTicks).toBe(14)
      expect(getScaledConfig(3, DEFAULT_CONFIG).alienMoveIntervalTicks).toBe(12)
      expect(getScaledConfig(4, DEFAULT_CONFIG).alienMoveIntervalTicks).toBe(10)
    })
  })

  describe('alienShootProbability scaling', () => {
    it('increases monotonically with player count', () => {
      const prob1 = getScaledConfig(1, DEFAULT_CONFIG).alienShootProbability
      const prob2 = getScaledConfig(2, DEFAULT_CONFIG).alienShootProbability
      const prob3 = getScaledConfig(3, DEFAULT_CONFIG).alienShootProbability
      const prob4 = getScaledConfig(4, DEFAULT_CONFIG).alienShootProbability

      expect(prob2).toBeGreaterThan(prob1)
      expect(prob3).toBeGreaterThan(prob2)
      expect(prob4).toBeGreaterThan(prob3)
    })

    it('stays within reasonable bounds (< 0.05 per tick)', () => {
      for (let i = 1; i <= 4; i++) {
        const scaled = getScaledConfig(i, DEFAULT_CONFIG)
        expect(scaled.alienShootProbability).toBeLessThan(0.05)
        expect(scaled.alienShootProbability).toBeGreaterThan(0)
      }
    })
  })
})

// ============================================================================
// getPlayerSpawnX Tests
// ============================================================================

describe('getPlayerSpawnX', () => {
  const screenWidth = STANDARD_WIDTH // 120

  describe('1 player', () => {
    it('returns center (width/2)', () => {
      const x = getPlayerSpawnX(1, 1, screenWidth)
      expect(x).toBe(Math.floor(screenWidth / 2)) // 60
    })
  })

  describe('2 players', () => {
    it('slot 1 = width/3', () => {
      const x = getPlayerSpawnX(1, 2, screenWidth)
      expect(x).toBe(Math.floor(screenWidth / 3)) // 40
    })

    it('slot 2 = 2*width/3', () => {
      const x = getPlayerSpawnX(2, 2, screenWidth)
      expect(x).toBe(Math.floor((2 * screenWidth) / 3)) // 80
    })
  })

  describe('3 players', () => {
    it('slot 1 = width/4', () => {
      const x = getPlayerSpawnX(1, 3, screenWidth)
      expect(x).toBe(Math.floor(screenWidth / 4)) // 30
    })

    it('slot 2 = width/2', () => {
      const x = getPlayerSpawnX(2, 3, screenWidth)
      expect(x).toBe(Math.floor(screenWidth / 2)) // 60
    })

    it('slot 3 = 3*width/4', () => {
      const x = getPlayerSpawnX(3, 3, screenWidth)
      expect(x).toBe(Math.floor((3 * screenWidth) / 4)) // 90
    })
  })

  describe('4 players', () => {
    it('slot 1 = width/5', () => {
      const x = getPlayerSpawnX(1, 4, screenWidth)
      expect(x).toBe(Math.floor(screenWidth / 5)) // 24
    })

    it('slot 2 = 2*width/5', () => {
      const x = getPlayerSpawnX(2, 4, screenWidth)
      expect(x).toBe(Math.floor((2 * screenWidth) / 5)) // 48
    })

    it('slot 3 = 3*width/5', () => {
      const x = getPlayerSpawnX(3, 4, screenWidth)
      expect(x).toBe(Math.floor((3 * screenWidth) / 5)) // 72
    })

    it('slot 4 = 4*width/5', () => {
      const x = getPlayerSpawnX(4, 4, screenWidth)
      expect(x).toBe(Math.floor((4 * screenWidth) / 5)) // 96
    })
  })

  describe('edge cases', () => {
    it('returns center for invalid slot', () => {
      const x = getPlayerSpawnX(5, 4, screenWidth)
      expect(x).toBe(Math.floor(screenWidth / 2))
    })

    it('returns center for invalid playerCount', () => {
      const x = getPlayerSpawnX(1, 5, screenWidth)
      expect(x).toBe(Math.floor(screenWidth / 2))
    })

    it('returns center for slot 0', () => {
      const x = getPlayerSpawnX(0, 1, screenWidth)
      expect(x).toBe(Math.floor(screenWidth / 2))
    })
  })

  describe('symmetry', () => {
    it('2 players are symmetric around center', () => {
      const center = screenWidth / 2
      const x1 = getPlayerSpawnX(1, 2, screenWidth)
      const x2 = getPlayerSpawnX(2, 2, screenWidth)

      // x1 should be as far left of center as x2 is right
      const distFromCenter1 = center - x1
      const distFromCenter2 = x2 - center

      expect(Math.abs(distFromCenter1 - distFromCenter2)).toBeLessThanOrEqual(1)
    })

    it('4 players are evenly distributed', () => {
      const positions = [
        getPlayerSpawnX(1, 4, screenWidth),
        getPlayerSpawnX(2, 4, screenWidth),
        getPlayerSpawnX(3, 4, screenWidth),
        getPlayerSpawnX(4, 4, screenWidth),
      ]

      // Check roughly equal spacing
      const gap1 = positions[1] - positions[0]
      const gap2 = positions[2] - positions[1]
      const gap3 = positions[3] - positions[2]

      expect(Math.abs(gap1 - gap2)).toBeLessThanOrEqual(1)
      expect(Math.abs(gap2 - gap3)).toBeLessThanOrEqual(1)
    })
  })

  describe('different screen widths', () => {
    it('scales correctly with smaller screen', () => {
      const smallWidth = 80
      const x1 = getPlayerSpawnX(1, 2, smallWidth)
      const x2 = getPlayerSpawnX(2, 2, smallWidth)

      expect(x1).toBe(Math.floor(smallWidth / 3)) // ~26
      expect(x2).toBe(Math.floor((2 * smallWidth) / 3)) // ~53
    })

    it('scales correctly with larger screen', () => {
      const largeWidth = 200
      const x1 = getPlayerSpawnX(1, 2, largeWidth)
      const x2 = getPlayerSpawnX(2, 2, largeWidth)

      expect(x1).toBe(Math.floor(largeWidth / 3)) // ~66
      expect(x2).toBe(Math.floor((2 * largeWidth) / 3)) // ~133
    })
  })
})

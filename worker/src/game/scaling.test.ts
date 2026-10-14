// worker/src/game/scaling.test.ts
// Unit tests for scaling logic

import { describe, it, expect } from 'vitest'
import { getScaledConfig, getPlayerSpawnX } from './scaling'
import { DEFAULT_CONFIG, DEFAULT_DIFFICULTY, STANDARD_WIDTH, type DifficultyConfig } from '../../../shared/types'

// ============================================================================
// getScaledConfig Tests
// ============================================================================

describe('getScaledConfig', () => {
  // GOLDEN TESTS (spec §2.4 / Gate 1): DEFAULT_DIFFICULTY must reproduce the
  // pre-extraction hardcoded values bit-for-bit. Any drift here means the
  // config refactor changed shipped behavior — that is a failure, not a tune.
  describe('DEFAULT_DIFFICULTY reproduces shipped values (golden)', () => {
    const golden = {
      1: { alienMoveIntervalTicks: 18, shootMult: 1.0, alienCols: 11, alienRows: 5, lives: 3, barriers: 3 },
      2: { alienMoveIntervalTicks: 14, shootMult: 1.5, alienCols: 11, alienRows: 5, lives: 5, barriers: 4 },
      3: { alienMoveIntervalTicks: 12, shootMult: 2.0, alienCols: 13, alienRows: 5, lives: 5, barriers: 4 },
      4: { alienMoveIntervalTicks: 10, shootMult: 2.5, alienCols: 13, alienRows: 6, lives: 5, barriers: 4 },
    } as const

    for (const playerCount of [1, 2, 3, 4] as const) {
      it(`${playerCount} player(s): exact pre-refactor values`, () => {
        const expected = golden[playerCount]
        const scaled = getScaledConfig(playerCount, 1, DEFAULT_DIFFICULTY)

        expect(scaled.alienMoveIntervalTicks).toBe(expected.alienMoveIntervalTicks)
        // Exact equality: same floats, same multiplication as the old code
        // (0.016 * shootMult), so this must be bit-identical — not toBeCloseTo.
        expect(scaled.alienShootProbability).toBe(DEFAULT_CONFIG.baseAlienShootRate * expected.shootMult)
        expect(scaled.alienCols).toBe(expected.alienCols)
        expect(scaled.alienRows).toBe(expected.alienRows)
        expect(scaled.lives).toBe(expected.lives)
        expect(scaled.barriers).toBe(expected.barriers)
      })
    }

    it('shoot probabilities are the documented 0.016 / 0.024 / 0.032 / 0.040 per tick', () => {
      expect(getScaledConfig(1, 1, DEFAULT_DIFFICULTY).alienShootProbability).toBeCloseTo(0.016, 10)
      expect(getScaledConfig(2, 1, DEFAULT_DIFFICULTY).alienShootProbability).toBeCloseTo(0.024, 10)
      expect(getScaledConfig(3, 1, DEFAULT_DIFFICULTY).alienShootProbability).toBeCloseTo(0.032, 10)
      expect(getScaledConfig(4, 1, DEFAULT_DIFFICULTY).alienShootProbability).toBeCloseTo(0.04, 10)
    })

    it('DEFAULT_DIFFICULTY base rates match DEFAULT_CONFIG base rates', () => {
      expect(DEFAULT_DIFFICULTY.base.alienShootRate).toBe(DEFAULT_CONFIG.baseAlienShootRate)
      expect(DEFAULT_DIFFICULTY.base.alienMoveIntervalTicks).toBe(DEFAULT_CONFIG.baseAlienMoveIntervalTicks)
    })

    it('is named ship-v1 with shared lives and a zero wave ramp', () => {
      expect(DEFAULT_DIFFICULTY.name).toBe('ship-v1')
      expect(DEFAULT_DIFFICULTY.livesMode).toBe('shared')
      expect(DEFAULT_DIFFICULTY.waveRamp).toEqual({ speedPctPerWave: 0, shootPctPerWave: 0, maxWaveForRamp: 8 })
    })
  })

  describe('edge cases', () => {
    it('falls back to the 1-player entry for 0 players', () => {
      const scaled = getScaledConfig(0, 1, DEFAULT_DIFFICULTY)
      // Out-of-range counts use perPlayerCount[1] wholesale (the old code's
      // `?? scaleTable[1]` fallback, now including lives from that entry).
      expect(scaled.lives).toBe(3)
      expect(scaled.alienCols).toBe(11)
      expect(scaled.alienRows).toBe(5)
      expect(scaled.alienMoveIntervalTicks).toBe(18)
    })

    it('falls back to the 1-player entry for invalid player count', () => {
      const scaled = getScaledConfig(5, 1, DEFAULT_DIFFICULTY)
      expect(scaled.lives).toBe(3)
      expect(scaled.alienCols).toBe(11)
      expect(scaled.alienRows).toBe(5)
    })

    it('falls back to the 1-player entry for negative player count', () => {
      const scaled = getScaledConfig(-1, 1, DEFAULT_DIFFICULTY)
      expect(scaled.lives).toBe(3)
      expect(scaled.alienCols).toBe(11)
      expect(scaled.alienRows).toBe(5)
    })
  })

  describe('alienShootProbability scaling', () => {
    it('increases monotonically with player count', () => {
      const prob1 = getScaledConfig(1, 1, DEFAULT_DIFFICULTY).alienShootProbability
      const prob2 = getScaledConfig(2, 1, DEFAULT_DIFFICULTY).alienShootProbability
      const prob3 = getScaledConfig(3, 1, DEFAULT_DIFFICULTY).alienShootProbability
      const prob4 = getScaledConfig(4, 1, DEFAULT_DIFFICULTY).alienShootProbability

      expect(prob2).toBeGreaterThan(prob1)
      expect(prob3).toBeGreaterThan(prob2)
      expect(prob4).toBeGreaterThan(prob3)
    })

    it('stays within reasonable bounds (< 0.05 per tick)', () => {
      for (let i = 1; i <= 4; i++) {
        const scaled = getScaledConfig(i, 1, DEFAULT_DIFFICULTY)
        expect(scaled.alienShootProbability).toBeLessThan(0.05)
        expect(scaled.alienShootProbability).toBeGreaterThan(0)
      }
    })
  })

  describe('wave ramp', () => {
    /** A copy of DEFAULT_DIFFICULTY with a non-zero ramp for the math tests. */
    function rampedConfig(speedPctPerWave: number, shootPctPerWave: number, maxWaveForRamp: number): DifficultyConfig {
      const config = structuredClone(DEFAULT_DIFFICULTY)
      config.name = 'ramp-test'
      config.waveRamp = { speedPctPerWave, shootPctPerWave, maxWaveForRamp }
      return config
    }

    it('zero ramp (DEFAULT_DIFFICULTY): wave 5 is identical to wave 1', () => {
      for (const playerCount of [1, 2, 3, 4]) {
        expect(getScaledConfig(playerCount, 5, DEFAULT_DIFFICULTY)).toEqual(
          getScaledConfig(playerCount, 1, DEFAULT_DIFFICULTY),
        )
      }
    })

    it('non-zero ramp: wave 1 applies no ramp (min(wave, cap) - 1 = 0)', () => {
      const config = rampedConfig(0.1, 0.2, 8)
      const scaled = getScaledConfig(1, 1, config)
      expect(scaled.alienMoveIntervalTicks).toBe(18)
      expect(scaled.alienShootProbability).toBeCloseTo(0.016, 10)
    })

    it('non-zero ramp: applies the documented formulas at wave 3', () => {
      const config = rampedConfig(0.1, 0.2, 8)
      const scaled = getScaledConfig(1, 3, config)
      // speedMult(3) = 1.0 * (1 + 0.1 * 2) = 1.2 → floor(18 / 1.2) = 15
      expect(scaled.alienMoveIntervalTicks).toBe(15)
      // shootMult(3) = 1.0 * (1 + 0.2 * 2) = 1.4 → 0.016 * 1.4 = 0.0224
      expect(scaled.alienShootProbability).toBeCloseTo(0.0224, 10)
    })

    it('non-zero ramp: compounds with the player-count multiplier', () => {
      const config = rampedConfig(0.1, 0.2, 8)
      const scaled = getScaledConfig(2, 3, config)
      // speedMult(3) = 1.25 * 1.2 = 1.5 → floor(18 / 1.5) = 12
      expect(scaled.alienMoveIntervalTicks).toBe(12)
      // shootMult(3) = 1.5 * 1.4 = 2.1 → 0.016 * 2.1 = 0.0336
      expect(scaled.alienShootProbability).toBeCloseTo(0.0336, 10)
    })

    it('ramp caps at maxWaveForRamp', () => {
      const config = rampedConfig(0.1, 0.2, 4)
      const atCap = getScaledConfig(1, 4, config)
      expect(getScaledConfig(1, 5, config)).toEqual(atCap)
      expect(getScaledConfig(1, 50, config)).toEqual(atCap)
      // And the cap is genuinely harder than wave 1
      expect(atCap.alienMoveIntervalTicks).toBeLessThan(getScaledConfig(1, 1, config).alienMoveIntervalTicks)
      expect(atCap.alienShootProbability).toBeGreaterThan(getScaledConfig(1, 1, config).alienShootProbability)
    })

    it('alienMoveIntervalTicks never drops below 1, even with an extreme ramp', () => {
      const config = rampedConfig(10, 0, 8)
      const scaled = getScaledConfig(4, 8, config)
      expect(scaled.alienMoveIntervalTicks).toBe(1)
    })
  })

  describe('livesMode', () => {
    it("'shared' uses the configured pool as-is", () => {
      expect(getScaledConfig(1, 1, DEFAULT_DIFFICULTY).lives).toBe(3)
      expect(getScaledConfig(2, 1, DEFAULT_DIFFICULTY).lives).toBe(5)
      expect(getScaledConfig(3, 1, DEFAULT_DIFFICULTY).lives).toBe(5)
      expect(getScaledConfig(4, 1, DEFAULT_DIFFICULTY).lives).toBe(5)
    })

    it("'per-player' sizes the pool as lives × playerCount", () => {
      const config = structuredClone(DEFAULT_DIFFICULTY)
      config.livesMode = 'per-player'
      expect(getScaledConfig(1, 1, config).lives).toBe(3) // 3 × 1
      expect(getScaledConfig(2, 1, config).lives).toBe(10) // 5 × 2
      expect(getScaledConfig(3, 1, config).lives).toBe(15) // 5 × 3
      expect(getScaledConfig(4, 1, config).lives).toBe(20) // 5 × 4
    })
  })

  describe('JSON round-trip', () => {
    it('serialize → parse drives identical output (config is one JSON document)', () => {
      const roundTripped = JSON.parse(JSON.stringify(DEFAULT_DIFFICULTY)) as DifficultyConfig
      for (const playerCount of [1, 2, 3, 4]) {
        for (const wave of [1, 2, 5, 10]) {
          expect(getScaledConfig(playerCount, wave, roundTripped)).toEqual(
            getScaledConfig(playerCount, wave, DEFAULT_DIFFICULTY),
          )
        }
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

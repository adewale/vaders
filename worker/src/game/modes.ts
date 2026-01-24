// worker/src/game/modes.ts
// Strategy pattern for Classic vs Enhanced game modes

import type {
  GameState,
  Entity,
  AlienEntity,
  CommanderEntity,
  DiveBomberEntity,
  WaveConfig,
} from '../../../shared/types'
import { LAYOUT, seededRandom } from '../../../shared/types'

// ─── Mode Strategy Interface ────────────────────────────────────────────────────

export interface GameMode {
  name: 'classic' | 'enhanced'

  /** Get wave configuration for a given wave number */
  getWaveConfig(wave: number, playerCount: number): WaveConfig

  /** Get points for destroying an entity */
  getPoints(entityKind: string, context?: PointsContext): number
}

export interface PointsContext {
  diving?: boolean          // Entity was diving (not in formation)
  escortCount?: number      // For commanders: how many escorts
  freeCapturedPlayer?: boolean  // Freed a captured player
}

// ─── Challenging Stage Detection ────────────────────────────────────────────────

/**
 * Check if a wave is a Challenging Stage (bonus round)
 * Challenging Stages occur at waves 3, 7, 11, 15... (every 4th wave starting from 3)
 */
export function isChallengingStage(wave: number): boolean {
  return wave >= 3 && (wave - 3) % 4 === 0
}

// ─── Classic Mode ───────────────────────────────────────────────────────────────

export const classicMode: GameMode = {
  name: 'classic',

  getWaveConfig(wave: number, playerCount: number): WaveConfig {
    // Classic mode: standard formation, speed increases with wave
    const baseCols = playerCount === 1 ? 11 : playerCount === 2 ? 11 : playerCount === 3 ? 13 : 15
    const baseRows = playerCount === 4 ? 6 : 5

    return {
      alienCols: baseCols,
      alienRows: baseRows,
      speedMult: 1 + (wave - 1) * 0.1,  // 10% faster each wave
      hasCommanders: false,
      hasDiveBombers: false,
      hasTransforms: false,
      isChallenging: false,
    }
  },

  getPoints(entityKind: string, context?: PointsContext): number {
    const basePoints: Record<string, number> = {
      squid: 30,
      crab: 20,
      octopus: 10,
      ufo: 300,  // Default UFO points (actual is random 50-300)
    }
    return basePoints[entityKind] ?? 0
  },
}

// ─── Enhanced Mode ──────────────────────────────────────────────────────────────

export const enhancedMode: GameMode = {
  name: 'enhanced',

  getWaveConfig(wave: number, playerCount: number): WaveConfig {
    // Challenging stages at waves 3, 7, 11, 15...
    if (isChallengingStage(wave)) {
      return {
        alienCols: 10,
        alienRows: 4,  // Will be replaced with 40 fly-through enemies
        speedMult: 1.5,
        hasCommanders: false,
        hasDiveBombers: false,
        hasTransforms: false,
        isChallenging: true,
      }
    }

    // Enhanced mode wave progression from spec
    // Wave 1-3: 1 commander, 4 dive bombers, 4 classic rows
    // Wave 4-6: 2 commanders, 6 dive bombers, 5 classic rows, transforms on death
    // Wave 7-9: 2 commanders, 6 dive bombers, 5 classic rows, tractor beam
    // Wave 10+: 2 commanders, 8 dive bombers, 6 classic rows, all abilities

    let commanderCount: number
    let diveBomberCount: number
    let classicRows: number
    let hasTransforms: boolean

    if (wave <= 3) {
      commanderCount = 1
      diveBomberCount = 4
      classicRows = 4
      hasTransforms = false
    } else if (wave <= 6) {
      commanderCount = 2
      diveBomberCount = 6
      classicRows = 5
      hasTransforms = true
    } else if (wave <= 9) {
      commanderCount = 2
      diveBomberCount = 6
      classicRows = 5
      hasTransforms = true
    } else {
      commanderCount = 2
      diveBomberCount = 8
      classicRows = 6
      hasTransforms = true
    }

    // Base cols scale with player count
    const baseCols = playerCount === 1 ? 11 : playerCount === 2 ? 11 : playerCount === 3 ? 13 : 15

    return {
      alienCols: baseCols,
      alienRows: classicRows,
      speedMult: 1 + (wave - 1) * 0.15,  // 15% faster each wave (faster than classic)
      hasCommanders: commanderCount > 0,
      hasDiveBombers: diveBomberCount > 0,
      hasTransforms,
      isChallenging: false,
    }
  },

  getPoints(entityKind: string, context?: PointsContext): number {
    // Enhanced mode scoring from spec
    const basePoints: Record<string, number> = {
      squid: 30,
      crab: 20,
      octopus: 10,
      ufo: 300,
    }

    // Commander scoring
    if (entityKind === 'commander') {
      if (context?.freeCapturedPlayer) {
        return 500  // Bonus for freeing captured player
      }
      if (context?.diving) {
        const escorts = context.escortCount ?? 0
        if (escorts >= 2) return 1600
        if (escorts >= 1) return 800
        return 400  // Solo dive
      }
      return 150  // In formation
    }

    // Dive bomber scoring
    if (entityKind === 'dive_bomber') {
      return context?.diving ? 160 : 80
    }

    // Transform scoring (all 3 give the same score)
    if (entityKind === 'transform') {
      // Transform points depend on type, handled separately
      return 0
    }

    return basePoints[entityKind] ?? 0
  },
}

// ─── Mode Factory ───────────────────────────────────────────────────────────────

export function getGameMode(enhanced: boolean): GameMode {
  return enhanced ? enhancedMode : classicMode
}

// ─── Enhanced Wave Config Helper ────────────────────────────────────────────────

export interface EnhancedWaveParams {
  commanderCount: number
  diveBomberCount: number
  classicRows: number
  canTractorBeam: boolean
  canTransform: boolean
}

export function getEnhancedWaveParams(wave: number): EnhancedWaveParams {
  if (wave <= 3) {
    return {
      commanderCount: 1,
      diveBomberCount: 4,
      classicRows: 4,
      canTractorBeam: false,
      canTransform: false,
    }
  } else if (wave <= 6) {
    return {
      commanderCount: 2,
      diveBomberCount: 6,
      classicRows: 5,
      canTractorBeam: false,
      canTransform: true,
    }
  } else if (wave <= 9) {
    return {
      commanderCount: 2,
      diveBomberCount: 6,
      classicRows: 5,
      canTractorBeam: true,
      canTransform: true,
    }
  } else {
    return {
      commanderCount: 2,
      diveBomberCount: 8,
      classicRows: 6,
      canTractorBeam: true,
      canTransform: true,
    }
  }
}

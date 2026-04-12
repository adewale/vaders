import { describe, it, expect, beforeEach } from 'vitest'
import { getSchemeOverride, setCurrentScheme, getCurrentScheme, type ColorScheme } from './colorSchemes'
import { GRADIENT_COLORS } from '../../../client-core/src/sprites/colors'
import { buildDrawCommands, resetEffects, type DrawCommand } from './canvasRenderer'
import { createDefaultGameState } from '../../../shared/state-defaults'
import type { AlienEntity, GameState } from '../../../shared/types'

const HEX = /^#[0-9a-fA-F]{6}$/

const ALL_SCHEMES: ColorScheme[] = ['default', 'neon', 'retro', 'phosphor']

function makeAlien(overrides: Partial<AlienEntity> = {}): AlienEntity {
  return {
    kind: 'alien',
    id: 'a1',
    x: 10,
    y: 5,
    type: 'squid',
    alive: true,
    row: 0,
    col: 0,
    points: 30,
    entering: false,
    ...overrides,
  }
}

function stateWithAlien(): GameState {
  const s = createDefaultGameState('TEST')
  s.status = 'playing'
  s.entities = [makeAlien()]
  return s
}

describe('color schemes', () => {
  beforeEach(() => {
    setCurrentScheme('default')
    resetEffects()
  })

  it('default scheme matches the original GRADIENT_COLORS', () => {
    const d = getSchemeOverride('default')
    expect(d.aliens.squid).toEqual(GRADIENT_COLORS.alien.squid)
    expect(d.aliens.crab).toEqual(GRADIENT_COLORS.alien.crab)
    expect(d.aliens.octopus).toEqual(GRADIENT_COLORS.alien.octopus)
    expect(d.player[1]).toEqual(GRADIENT_COLORS.player[1])
    expect(d.player[2]).toEqual(GRADIENT_COLORS.player[2])
    expect(d.player[3]).toEqual(GRADIENT_COLORS.player[3])
    expect(d.player[4]).toEqual(GRADIENT_COLORS.player[4])
  })

  it('every scheme returns valid 6-digit hex colors for all types', () => {
    for (const scheme of ALL_SCHEMES) {
      const s = getSchemeOverride(scheme)
      for (const type of ['squid', 'crab', 'octopus'] as const) {
        expect(s.aliens[type].bright).toMatch(HEX)
        expect(s.aliens[type].dark).toMatch(HEX)
      }
      for (const slot of [1, 2, 3, 4] as const) {
        expect(s.player[slot].bright).toMatch(HEX)
        expect(s.player[slot].dark).toMatch(HEX)
      }
    }
  })

  it('switching schemes changes the gradient used in sprite commands', () => {
    setCurrentScheme('default')
    const defaultCmds = buildDrawCommands(stateWithAlien(), null)
    const defaultSquidCmd = defaultCmds.find(
      (c): c is Extract<DrawCommand, { type: 'sprite' }> => c.type === 'sprite' && c.gradientColors != null,
    )

    resetEffects()
    setCurrentScheme('phosphor')
    const phosphorCmds = buildDrawCommands(stateWithAlien(), null)
    const phosphorSquidCmd = phosphorCmds.find(
      (c): c is Extract<DrawCommand, { type: 'sprite' }> => c.type === 'sprite' && c.gradientColors != null,
    )

    expect(defaultSquidCmd?.gradientColors).not.toEqual(phosphorSquidCmd?.gradientColors)
    setCurrentScheme('default') // reset
  })

  it('getCurrentScheme reflects setCurrentScheme', () => {
    setCurrentScheme('neon')
    expect(getCurrentScheme()).toBe('neon')
    setCurrentScheme('default')
    expect(getCurrentScheme()).toBe('default')
  })
})

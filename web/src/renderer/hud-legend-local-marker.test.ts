// Tests for bug #4: local player's HUD legend badge should have a visual
// marker distinguishing it from teammates'. Before the fix, the legend
// showed [1][2][3][4] in slot colour but gave no indication of which one
// was YOU — in 3+ player coop this made it impossible to match your
// on-screen avatar to your badge.
//
// Fix: add a new rect draw command (kind: 'hud-player-legend-local-marker')
// below the local player's badge — a small underline bar. Non-local badges
// are unchanged.

import { describe, it, expect, beforeEach } from 'vitest'
import { buildDrawCommands, resetEffects, type DrawCommand } from './canvasRenderer'
import { createDefaultGameState } from '../../../shared/state-defaults'
import type { GameState, Player, PlayerSlot } from '../../../shared/types'
import { COLORS } from '../../../client-core/src/sprites/colors'

beforeEach(() => {
  resetEffects()
})

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    name: 'P',
    x: 60,
    slot: 1,
    color: 'cyan',
    lastShotTick: 0,
    alive: true,
    lives: 3,
    respawnAtTick: null,
    invulnerableUntilTick: null,
    kills: 0,
    inputState: { left: false, right: false },
    ...overrides,
  }
}

function stateWith(players: Record<string, Player>, overrides: Partial<GameState> = {}): GameState {
  const state = createDefaultGameState('TEST01')
  state.players = players
  state.entities = []
  state.status = 'playing'
  return { ...state, ...overrides, players, entities: [] }
}

function findMarkers(cmds: DrawCommand[]): Array<DrawCommand & { kind: string }> {
  return cmds.filter(
    (c): c is DrawCommand & { kind: string } =>
      'kind' in c && (c as { kind?: string }).kind === 'hud-player-legend-local-marker',
  )
}

describe('bug #4: local player legend marker', () => {
  it('two-player game with local = slot 2: emits ONE marker for slot 2 only', () => {
    const p1 = makePlayer({ id: 'p1', slot: 1, x: 40 })
    const p2 = makePlayer({ id: 'p2', slot: 2, x: 80 })
    const state = stateWith({ p1, p2 }, { tick: 10 })
    const cmds = buildDrawCommands(state, 'p2')
    const markers = findMarkers(cmds)

    expect(markers.length).toBe(1)
    // Marker colour matches slot 2 so it reads as "this colour is you"
    const m = markers[0] as DrawCommand & { fill?: string }
    expect(m.fill).toBe(COLORS.player[2])
  })

  it('two-player game with local = slot 1: emits ONE marker for slot 1 only', () => {
    const p1 = makePlayer({ id: 'p1', slot: 1, x: 40 })
    const p2 = makePlayer({ id: 'p2', slot: 2, x: 80 })
    const state = stateWith({ p1, p2 }, { tick: 10 })
    const cmds = buildDrawCommands(state, 'p1')
    const markers = findMarkers(cmds)
    expect(markers.length).toBe(1)
    const m = markers[0] as DrawCommand & { fill?: string }
    expect(m.fill).toBe(COLORS.player[1])
  })

  it('three-player game with local = slot 3: exactly ONE marker, for slot 3', () => {
    const p1 = makePlayer({ id: 'p1', slot: 1, x: 30 })
    const p2 = makePlayer({ id: 'p2', slot: 2, x: 60 })
    const p3 = makePlayer({ id: 'p3', slot: 3, x: 90 })
    const state = stateWith({ p1, p2, p3 }, { tick: 10 })
    const cmds = buildDrawCommands(state, 'p3')
    const markers = findMarkers(cmds)
    expect(markers.length).toBe(1)
    const m = markers[0] as DrawCommand & { fill?: string }
    expect(m.fill).toBe(COLORS.player[3])
  })

  it('spectator (playerId = null): NO marker is rendered', () => {
    const p1 = makePlayer({ id: 'p1', slot: 1, x: 40 })
    const p2 = makePlayer({ id: 'p2', slot: 2, x: 80 })
    const state = stateWith({ p1, p2 }, { tick: 10 })
    const cmds = buildDrawCommands(state, null)
    const markers = findMarkers(cmds)
    expect(markers.length).toBe(0)
  })

  it('solo game (1 player) with local identity: no legend and no marker', () => {
    // Legend already suppresses when playerEntries.length < 2, so marker must not emit.
    const p1 = makePlayer({ id: 'p1', slot: 1, x: 60 })
    const state = stateWith({ p1 }, { tick: 10 })
    const cmds = buildDrawCommands(state, 'p1')
    const markers = findMarkers(cmds)
    expect(markers.length).toBe(0)
  })

  it('marker is positioned near the local badge (aligned with legend X range)', () => {
    // The legend spans a known center X range. Marker X should fall within
    // the sorted-by-slot position of the local player.
    const slots: PlayerSlot[] = [1, 2, 3, 4]
    const players = Object.fromEntries(
      slots.map((s) => [`p${s}`, makePlayer({ id: `p${s}`, slot: s, x: 20 + s * 15 })]),
    )
    const state = stateWith(players, { tick: 10 })

    // Find all legend badges then the marker — assert marker X is close to
    // the slot-3 badge X (within reasonable spacing bounds).
    const cmds = buildDrawCommands(state, 'p3')
    const badges = cmds.filter(
      (c): c is DrawCommand & { kind: string; x: number } =>
        'kind' in c &&
        typeof (c as { kind?: string }).kind === 'string' &&
        (c as { kind: string }).kind === 'hud-player-legend-3',
    )
    expect(badges.length).toBe(1)
    const markers = findMarkers(cmds)
    expect(markers.length).toBe(1)
    const markerX = (markers[0] as { x: number }).x
    const badgeX = badges[0].x
    // Marker sits horizontally near the slot-3 badge (within 2× the badge spacing)
    expect(Math.abs(markerX - badgeX)).toBeLessThan(60)
  })

  it('non-local badge kinds stay unchanged when a marker is added', () => {
    const p1 = makePlayer({ id: 'p1', slot: 1, x: 40 })
    const p2 = makePlayer({ id: 'p2', slot: 2, x: 80 })
    const state = stateWith({ p1, p2 }, { tick: 10 })
    const cmds = buildDrawCommands(state, 'p2')

    // Both badges exist; only slot-2 gets the marker (asserted above).
    // Critically, slot-1 badge kind is still 'hud-player-legend-1' — no
    // stripped/replaced contract.
    const badge1 = cmds.find((c) => 'kind' in c && (c as { kind?: string }).kind === 'hud-player-legend-1')
    const badge2 = cmds.find((c) => 'kind' in c && (c as { kind?: string }).kind === 'hud-player-legend-2')
    expect(badge1).toBeDefined()
    expect(badge2).toBeDefined()
  })
})

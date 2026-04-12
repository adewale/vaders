// Tests for bug #1: player bullet layers must be tinted by the shooter's slot.
//
// Before the fix, every player's bullet rendered with the same cyan palette
// across 11 visual layers (glow halo, inner core, chromatic ghosts, fizzle
// sparks, trail, beam taper outer/mid/core, muzzle arc, muzzle flash, impact
// burst). Two players firing simultaneously produced visually identical
// bullets, making it impossible to tell whose shot was whose in coop.
//
// Fix: thread state.players[bullet.ownerId]?.slot → COLORS.player[slot] through
// every player-bullet rendering layer. Alien bullets (ownerId === null) keep
// the red palette; bullets whose owner is missing fall back to slot 1 (cyan)
// so existing single-player tests that use an orphan ownerId keep passing.

import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { buildDrawCommands, resetEffects, CELL_W, CELL_H, type DrawCommand } from './canvasRenderer'
import { createDefaultGameState } from '../../../shared/state-defaults'
import type { BulletEntity, GameState, Player, PlayerSlot } from '../../../shared/types'
import { COLORS } from '../../../client-core/src/sprites/colors'

beforeEach(() => {
  resetEffects()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBullet(overrides: Partial<BulletEntity> = {}): BulletEntity {
  return {
    kind: 'bullet',
    id: 'b-0',
    x: 50,
    y: 20,
    ownerId: 'p1',
    dy: -1,
    ...overrides,
  }
}

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    name: 'Test',
    x: 50,
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

function stateWith(
  entities: GameState['entities'] = [],
  players: Record<string, Player> = {},
  overrides: Partial<GameState> = {},
): GameState {
  const state = createDefaultGameState('TEST01')
  state.entities = entities
  state.players = players
  state.status = 'playing'
  return { ...state, ...overrides, entities, players }
}

type RectCmd = DrawCommand & { type: 'rect' }
const isRect = (cmd: DrawCommand): cmd is RectCmd => cmd.type === 'rect'

function filterKind(cmds: DrawCommand[], kind: string): RectCmd[] {
  return cmds.filter(
    (c): c is RectCmd => isRect(c) && (c as { kind?: string }).kind === kind,
  )
}

/** Hex → [r, g, b] triple; handles #rrggbb. Returns null on malformed input. */
function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '')
  if (h.length !== 6) return null
  const r = Number.parseInt(h.slice(0, 2), 16)
  const g = Number.parseInt(h.slice(2, 4), 16)
  const b = Number.parseInt(h.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
  return [r, g, b]
}

/** Build a bullet+player pair with a known slot and render one tick. */
function renderBulletForSlot(slot: PlayerSlot, tick: number = 50): DrawCommand[] {
  const bullet = makeBullet({ id: `b-s${slot}`, x: 50, y: 20, ownerId: `p${slot}`, dy: -1 })
  const player = makePlayer({ id: `p${slot}`, slot, x: 50 })
  const state = stateWith([bullet], { [`p${slot}`]: player }, { tick })
  return buildDrawCommands(state, null, state, 1, 1)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('bullet #1: slot-coloured bullets', () => {
  // Layers that MUST be slot-tinted. Each appears in draw commands with this kind.
  const SLOT_TINTED_LAYERS = [
    'bullet-glow',
    'bullet-core',
    'bullet-chromatic',
    'bullet-fizzle',
    'bullet-trail',
    'bullet-taper-outer',
    'bullet-taper-mid',
    'bullet-taper-core',
    'bullet-arc',
    'muzzle-flash',
    'bullet-impact-burst',
  ] as const

  it('two players with different slots produce bullets with DIFFERENT glow halo colours', () => {
    const s1Cmds = renderBulletForSlot(1)
    const s2Cmds = renderBulletForSlot(2)

    const glow1 = filterKind(s1Cmds, 'bullet-glow')[0]
    const glow2 = filterKind(s2Cmds, 'bullet-glow')[0]
    expect(glow1).toBeDefined()
    expect(glow2).toBeDefined()
    expect(glow1.fill.toLowerCase()).not.toBe(glow2.fill.toLowerCase())
    // Slot 2 is orange family — blue channel should be lower than slot 1 (cyan has high blue).
    const rgb2 = hexToRgb(glow2.fill)!
    expect(rgb2[0]).toBeGreaterThanOrEqual(rgb2[2]) // red >= blue for orange
  })

  it('two players with different slots produce bullets with DIFFERENT trail colours', () => {
    const s1 = renderBulletForSlot(1)
    const s3 = renderBulletForSlot(3)

    const trails1 = filterKind(s1, 'bullet-trail')
    const trails3 = filterKind(s3, 'bullet-trail')
    expect(trails1.length).toBeGreaterThan(0)
    expect(trails3.length).toBeGreaterThan(0)
    expect(trails1[0].fill.toLowerCase()).not.toBe(trails3[0].fill.toLowerCase())

    // Slot 3 (magenta) has strong red and blue, weaker green vs slot 1 (cyan).
    const rgb3 = hexToRgb(trails3[0].fill)!
    expect(rgb3[0]).toBeGreaterThan(rgb3[1])
  })

  it('for every slot, every tinted bullet layer has a non-cyan-only fill when slot != 1', () => {
    // PBT: for slots 2-4 (non-cyan), every tinted layer's fill must differ
    // from the slot-1 rendering of the same layer. Enforces the
    // "colours-disjoint-across-slots" invariant layer-by-layer.
    fc.assert(
      fc.property(
        fc.constantFrom<PlayerSlot>(2, 3, 4),
        fc.integer({ min: 0, max: 200 }),
        (slot, tick) => {
          const slotCmds = renderBulletForSlot(slot, tick)
          const s1Cmds = renderBulletForSlot(1, tick)

          for (const layer of SLOT_TINTED_LAYERS) {
            const slotFills = new Set(filterKind(slotCmds, layer).map((c) => c.fill.toLowerCase()))
            const s1Fills = new Set(filterKind(s1Cmds, layer).map((c) => c.fill.toLowerCase()))
            // At least one slot fill should differ from the slot-1 fill for this layer.
            // (If either set is empty for a tick where the layer doesn't emit,
            // e.g. muzzle-flash requires a NEW bullet, skip the disjointness check.)
            if (slotFills.size === 0 || s1Fills.size === 0) continue
            // Difference: any slot-N fill not present in slot-1's fills for this layer.
            const anyDifferent = [...slotFills].some((f) => !s1Fills.has(f))
            if (!anyDifferent) return false
          }
          return true
        },
      ),
      { numRuns: 30 },
    )
  })

  it('alien bullets (ownerId === null) keep the red palette, NOT slot colours', () => {
    const alienBullet = makeBullet({ id: 'a1', x: 50, y: 20, ownerId: null, dy: 1 })
    const state = stateWith([alienBullet], {}, { tick: 50 })
    const cmds = buildDrawCommands(state, null, state, 1, 1)

    const alienGlow = filterKind(cmds, 'bullet-glow')[0]
    expect(alienGlow).toBeDefined()
    // Alien bullet glow is red-ish (#ff6666 by current impl) — R > G, R > B.
    const rgb = hexToRgb(alienGlow.fill)!
    expect(rgb[0]).toBeGreaterThan(rgb[1])
    expect(rgb[0]).toBeGreaterThan(rgb[2])

    // Alien ember trail stays in the red/orange/yellow palette
    const embers = filterKind(cmds, 'bullet-ember')
    expect(embers.length).toBeGreaterThanOrEqual(4)
    for (const e of embers) {
      const [r, , b] = hexToRgb(e.fill)!
      expect(r).toBeGreaterThan(b) // more red than blue
    }
  })

  it('player bullet with known slot uses that slot colour; unknown/dead owner falls back sensibly', () => {
    // Known slot 4 (lime)
    const cmdsKnown = renderBulletForSlot(4)
    const glowKnown = filterKind(cmdsKnown, 'bullet-glow')[0]
    expect(glowKnown).toBeDefined()
    // Lime has R+G dominant, B low
    const [, gK, bK] = hexToRgb(glowKnown.fill)!
    expect(gK).toBeGreaterThan(bK)

    // Unknown owner (bullet references a player id not in state.players)
    const orphan = makeBullet({ id: 'orphan', x: 50, y: 20, ownerId: 'missing-player', dy: -1 })
    const stateOrphan = stateWith([orphan], {}, { tick: 50 })
    const cmdsOrphan = buildDrawCommands(stateOrphan, null, stateOrphan, 1, 1)
    const glowOrphan = filterKind(cmdsOrphan, 'bullet-glow')[0]
    expect(glowOrphan).toBeDefined()
    // Should still produce SOME slot-tinted glow (not crash or produce red/alien colour).
    // Fallback is slot 1 (cyan) — blue dominates.
    const [rO, , bO] = hexToRgb(glowOrphan.fill)!
    expect(bO).toBeGreaterThanOrEqual(rO) // cyan has blue >= red
  })

  it('main bullet rect fill stays COLORS.bullet.player (near-white) for player bullets', () => {
    // The main bullet rect is the contract-anchor: it MUST be COLORS.bullet.player
    // across all slots so existing hitbox/position tests keep finding it.
    const s2 = renderBulletForSlot(2)
    const mainRects = s2.filter(
      (c): c is RectCmd =>
        isRect(c) &&
        c.fill === COLORS.bullet.player &&
        c.width === CELL_W &&
        c.height === CELL_H,
    )
    expect(mainRects.length).toBeGreaterThanOrEqual(1)
  })

  it('chromatic aberration emits TWO distinct colours split around the slot hue (not always cyan/magenta)', () => {
    // Slot 2 (orange #ff8800). Split should produce two different ghosts, and
    // at least one must differ from pure #00ffff and #ff00ff.
    const cmds = renderBulletForSlot(2)
    const chromatic = filterKind(cmds, 'bullet-chromatic')
    expect(chromatic.length).toBeGreaterThanOrEqual(2)
    const fills = new Set(chromatic.map((c) => c.fill.toLowerCase()))
    expect(fills.size).toBeGreaterThanOrEqual(2)
    // Must NOT be exactly the historical cyan/magenta pair for a non-cyan slot.
    const old = new Set(['#00ffff', '#ff00ff'])
    const hadOnlyOldPair = [...fills].every((f) => old.has(f))
    expect(hadOnlyOldPair).toBe(false)
  })

  it('impact burst palette is slot-tinted when the just-disappeared bullet was a player bullet', () => {
    // Build a prev state with a mid-screen player bullet, then a curr state
    // where that bullet is gone → impact burst should fire with slot colours.
    const bullet = makeBullet({ id: 'b-imp', x: 50, y: 15, ownerId: 'p2', dy: -1 })
    const player = makePlayer({ id: 'p2', slot: 2, x: 50 })
    const prev = stateWith([bullet], { p2: player }, { tick: 100 })
    const curr = stateWith([], { p2: player }, { tick: 101 })
    const cmds = buildDrawCommands(curr, null, prev, 1, 1)
    const bursts = filterKind(cmds, 'bullet-impact-burst')
    expect(bursts.length).toBeGreaterThanOrEqual(3)
    // At least one burst fragment must be slot-2-tinted (orange family: R > B).
    const hasSlotTinted = bursts.some((b) => {
      const rgb = hexToRgb(b.fill)
      return rgb !== null && rgb[0] > rgb[2]
    })
    expect(hasSlotTinted).toBe(true)
  })

  it('muzzle flash on NEW player bullet is slot-tinted (not always pure white)', () => {
    // New bullet detection requires prev without, curr with.
    const bullet = makeBullet({ id: 'b-muzzle', x: 50, y: 20, ownerId: 'p3', dy: -1 })
    const player = makePlayer({ id: 'p3', slot: 3, x: 50 })
    const prev = stateWith([], { p3: player }, { tick: 99 })
    const curr = stateWith([bullet], { p3: player }, { tick: 100 })
    const cmds = buildDrawCommands(curr, null, prev, 1, 1)
    const flashes = filterKind(cmds, 'muzzle-flash')
    expect(flashes.length).toBeGreaterThanOrEqual(1)
    // Slot 3 (magenta) — fill must NOT be pure white #ffffff for a magenta shooter.
    for (const f of flashes) {
      expect(f.fill.toLowerCase()).not.toBe('#ffffff')
      // And must lean magenta (R high, G low-ish, B high).
      const [r, g, b] = hexToRgb(f.fill)!
      expect(r).toBeGreaterThan(g) // more red than green
      expect(b).toBeGreaterThan(g) // more blue than green
    }
  })
})

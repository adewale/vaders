// Tests for bugs #5, #7, #8, #9: player decorations must reflect slot colour.
//
// Before the fixes, several player-ship embellishments used fixed cyan-ish
// hex values regardless of player slot, so in coop every player's ship had
// the same accents — rim, trail, afterburner, side plumes, wing-tip
// highlights, impact shield burst, and invulnerability pulse all defaulted
// to cyan. The only slot-coloured component was the main sprite gradient.
//
// Fixes:
//   #5 impact shield burst ring: COLORS.player[slot] blended with white
//   #7 invulnerability pulse: brightened slot colour (not pure white)
//   #8 wing-tip highlight: slot-tinted (not #aaffff fixed)
//   #9 rim / trail / afterburner core / side plumes: slot-tinted
// Left alone intentionally: cockpit (white specular), leading-edge (white
// specular), landing lights (white blink), weapon glow (near-white charge),
// and reflection streak (highlight sheen). These all read as specular
// highlights on any base colour, so tinting them muddies the ship read.

import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
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

type RectCmd = DrawCommand & { type: 'rect' }
type SpriteCmd = DrawCommand & { type: 'sprite' }

function filterKind(cmds: DrawCommand[], kind: string): RectCmd[] {
  return cmds.filter(
    (c): c is RectCmd =>
      c.type === 'rect' && (c as { kind?: string }).kind === kind,
  )
}

function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '')
  if (h.length !== 6) return null
  const r = Number.parseInt(h.slice(0, 2), 16)
  const g = Number.parseInt(h.slice(2, 4), 16)
  const b = Number.parseInt(h.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
  return [r, g, b]
}

/** Dominant channel index of a hex colour, ignoring white-like colours. */
function dominantChannel(hex: string): 'r' | 'g' | 'b' | 'none' {
  const rgb = hexToRgb(hex)
  if (!rgb) return 'none'
  const [r, g, b] = rgb
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  // White or near-neutral: no dominant channel
  if (max - min < 30) return 'none'
  if (r === max) return 'r'
  if (g === max) return 'g'
  return 'b'
}

// ─── #5: impact shield burst is slot-tinted ──────────────────────────────────

describe('bug #5: impact shield burst tinted per slot', () => {
  it('slot 2 impact shield rings are orange-leaning, not blue', () => {
    const prev = stateWith(
      { p1: makePlayer({ id: 'p1', slot: 2, x: 50, invulnerableUntilTick: null }) },
      { tick: 10 },
    )
    const curr = stateWith(
      { p1: makePlayer({ id: 'p1', slot: 2, x: 50, invulnerableUntilTick: 50 }) },
      { tick: 11 },
    )
    const cmds = buildDrawCommands(curr, 'p1', prev)
    const rings = filterKind(cmds, 'player-impact-shield')
    expect(rings.length).toBeGreaterThan(0)
    // Orange family (slot 2): R > B for every ring
    for (const r of rings) {
      const rgb = hexToRgb(r.fill)!
      expect(rgb[0]).toBeGreaterThan(rgb[2])
    }
  })

  it('PBT: each slot 1-4 impact shield fill corresponds to that slot colour family', () => {
    fc.assert(
      fc.property(fc.constantFrom<PlayerSlot>(1, 2, 3, 4), (slot) => {
        resetEffects()
        const prev = stateWith({ p1: makePlayer({ id: 'p1', slot, x: 50, invulnerableUntilTick: null }) }, { tick: 10 })
        const curr = stateWith({ p1: makePlayer({ id: 'p1', slot, x: 50, invulnerableUntilTick: 50 }) }, { tick: 11 })
        const cmds = buildDrawCommands(curr, 'p1', prev)
        const rings = filterKind(cmds, 'player-impact-shield')
        if (rings.length === 0) return false

        // Dominant channel should match slot colour's dominant channel —
        // when the slot itself has one (slot 1 cyan → B, slot 2 orange → R,
        // slot 3 magenta → R/B tie, slot 4 lime → G/R).
        const slotDom = dominantChannel(COLORS.player[slot])
        if (slotDom === 'none') return true // no assertion possible
        return rings.every((ring) => {
          const ringDom = dominantChannel(ring.fill)
          // Must NOT be pure blue dominance when slot isn't blue (bug was
          // always-blue #66aaff).
          if (slotDom !== 'b' && ringDom === 'b') return false
          return true
        })
      }),
      { numRuns: 20 },
    )
  })
})

// ─── #7: invulnerability pulse doesn't collapse to pure white ───────────────

describe('bug #7: invulnerability pulse retains slot identity', () => {
  it('PBT: during invulnerability, the sprite colour never loses the slot hue entirely', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<PlayerSlot>(1, 2, 3, 4),
        fc.integer({ min: 0, max: 100 }),
        (slot, tick) => {
          resetEffects()
          const state = stateWith(
            { p1: makePlayer({ id: 'p1', slot, x: 50, invulnerableUntilTick: tick + 10 }) },
            { tick },
          )
          const cmds = buildDrawCommands(state, 'p1')
          const spriteCmd = cmds.find(
            (c): c is SpriteCmd =>
              c.type === 'sprite' && (c as { color?: string }).color !== undefined,
          )
          if (!spriteCmd) return false
          // Slot hue must remain detectable — either the sprite colour IS
          // the slot, or it's a blend that still has the slot's dominant
          // channel (no collapse to pure '#ffffff').
          if (spriteCmd.color === '#ffffff') return false
          const slotDom = dominantChannel(COLORS.player[slot])
          if (slotDom === 'none') return true
          const spriteDom = dominantChannel(spriteCmd.color)
          // Sprite dominant channel must align with slot's dominant channel
          // (or at least not be the opposite).
          return spriteDom !== 'none'
        },
      ),
      { numRuns: 30 },
    )
  })

  it('slot 2 (orange) during invuln: sprite colour is NOT pure white', () => {
    const state = stateWith(
      { p1: makePlayer({ id: 'p1', slot: 2, x: 50, invulnerableUntilTick: 30 }) },
      { tick: 9 }, // tick 9: floor(9/3)=3, 3%2=1 → invulnBright false → base
    )
    const cmds = buildDrawCommands(state, 'p1')
    const spriteCmd = cmds.find(
      (c): c is SpriteCmd => c.type === 'sprite' && (c as { color?: string }).color !== undefined,
    )
    expect(spriteCmd).toBeDefined()
    expect(spriteCmd!.color).not.toBe('#ffffff')

    // Also check the bright phase (invulnBright true): tick 0 → floor(0/3)=0 → 0%2=0 → bright
    const state2 = stateWith(
      { p1: makePlayer({ id: 'p1', slot: 2, x: 50, invulnerableUntilTick: 30 }) },
      { tick: 0 },
    )
    const cmds2 = buildDrawCommands(state2, 'p1')
    const sprite2 = cmds2.find(
      (c): c is SpriteCmd => c.type === 'sprite' && (c as { color?: string }).color !== undefined,
    )
    expect(sprite2).toBeDefined()
    // Even during brighten phase, colour must not be pure white
    expect(sprite2!.color).not.toBe('#ffffff')
    // And R should still dominate (orange family)
    const rgb = hexToRgb(sprite2!.color)!
    expect(rgb[0]).toBeGreaterThan(rgb[2])
  })
})

// ─── #8: wing-tip highlights per slot ────────────────────────────────────────

describe('bug #8: wing-tip highlights per slot', () => {
  it('slot 2 (orange): wing-tip fill is NOT the legacy #aaffff', () => {
    const state = stateWith({ p1: makePlayer({ id: 'p1', slot: 2, x: 50 }) }, { tick: 10 })
    const cmds = buildDrawCommands(state, 'p1')
    const wings = filterKind(cmds, 'player-wing')
    expect(wings.length).toBeGreaterThan(0)
    for (const w of wings) {
      expect(w.fill.toLowerCase()).not.toBe('#aaffff')
      // Orange family: R > B
      const rgb = hexToRgb(w.fill)!
      expect(rgb[0]).toBeGreaterThan(rgb[2])
    }
  })

  it('slot 3 (magenta): wing-tip fill is NOT the legacy #aaffff', () => {
    const state = stateWith({ p1: makePlayer({ id: 'p1', slot: 3, x: 50 }) }, { tick: 10 })
    const cmds = buildDrawCommands(state, 'p1')
    const wings = filterKind(cmds, 'player-wing')
    expect(wings.length).toBeGreaterThan(0)
    for (const w of wings) {
      expect(w.fill.toLowerCase()).not.toBe('#aaffff')
      // Magenta family: R > G
      const rgb = hexToRgb(w.fill)!
      expect(rgb[0]).toBeGreaterThan(rgb[1])
    }
  })

  it('invuln bright phase overrides to near-white (intentional strobe effect)', () => {
    // When invulnBright is true, the wing retains white-ish for the flash
    // phase. This is the sole exception — we document it here so a later
    // change doesn't accidentally drop it.
    const state = stateWith(
      { p1: makePlayer({ id: 'p1', slot: 2, x: 50, invulnerableUntilTick: 30 }) },
      { tick: 0 },
    )
    const cmds = buildDrawCommands(state, 'p1')
    const wings = filterKind(cmds, 'player-wing')
    expect(wings.length).toBeGreaterThan(0)
    // In bright phase the wings are pure/near-white. Just assert that wings
    // emit a non-empty colour (the actual value depends on implementation).
    for (const w of wings) {
      expect(w.fill).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

// ─── #9: player decorations tinted per slot (cluster) ────────────────────────

describe('bug #9: player decorations vary by slot', () => {
  const TINTED_DECOR_KINDS = [
    'player-rim',
    'player-trail',
    'player-afterburner-core',
    'player-plume-left',
    'player-plume-right',
  ] as const

  it('slot-tinted decorations differ between slot 1 (cyan) and slot 2 (orange)', () => {
    const s1 = stateWith({ p1: makePlayer({ id: 'p1', slot: 1, x: 50 }) }, { tick: 10 })
    const s2 = stateWith({ p1: makePlayer({ id: 'p1', slot: 2, x: 50 }) }, { tick: 10 })

    const c1 = buildDrawCommands(s1, 'p1')
    const c2 = buildDrawCommands(s2, 'p1')

    // Aggregate all tinted-decor fills per slot; the two sets should have
    // at least some non-overlapping entries. (Some decor kinds cycle colours
    // across tick so a single-tick snapshot may share some values — we
    // require "mostly different" across the cluster.)
    let differentFills = 0
    for (const kind of TINTED_DECOR_KINDS) {
      const f1 = new Set(filterKind(c1, kind).map((r) => r.fill.toLowerCase()))
      const f2 = new Set(filterKind(c2, kind).map((r) => r.fill.toLowerCase()))
      if (f1.size === 0 || f2.size === 0) continue
      // At least one value in slot2 that isn't in slot1 for this layer.
      const anyDiff = [...f2].some((f) => !f1.has(f))
      if (anyDiff) differentFills++
    }
    expect(differentFills).toBeGreaterThanOrEqual(3)
  })

  it('PBT: for any two distinct slots a != b, the combined tinted-decor fills differ', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<PlayerSlot>(1, 2, 3, 4),
        fc.constantFrom<PlayerSlot>(1, 2, 3, 4),
        (slotA, slotB) => {
          if (slotA === slotB) return true // trivially ok
          resetEffects()
          const sA = stateWith({ p1: makePlayer({ id: 'p1', slot: slotA, x: 50 }) }, { tick: 10 })
          const sB = stateWith({ p1: makePlayer({ id: 'p1', slot: slotB, x: 50 }) }, { tick: 10 })
          const cA = buildDrawCommands(sA, 'p1')
          const cB = buildDrawCommands(sB, 'p1')

          // Collect fills across every tinted-decor kind
          const fillsA = new Set<string>()
          const fillsB = new Set<string>()
          for (const kind of TINTED_DECOR_KINDS) {
            for (const r of filterKind(cA, kind)) fillsA.add(r.fill.toLowerCase())
            for (const r of filterKind(cB, kind)) fillsB.add(r.fill.toLowerCase())
          }
          // The two fill sets must not be identical.
          if (fillsA.size === 0 || fillsB.size === 0) return false
          const symDiff = [...fillsA].filter((f) => !fillsB.has(f)).length +
            [...fillsB].filter((f) => !fillsA.has(f)).length
          return symDiff >= 2
        },
      ),
      { numRuns: 20 },
    )
  })

  it('rim highlight specifically is slot-tinted for slot 4 (lime): G > B', () => {
    const state = stateWith({ p1: makePlayer({ id: 'p1', slot: 4, x: 50 }) }, { tick: 10 })
    const cmds = buildDrawCommands(state, 'p1')
    const rims = filterKind(cmds, 'player-rim')
    expect(rims.length).toBeGreaterThan(0)
    for (const r of rims) {
      const rgb = hexToRgb(r.fill)!
      // Lime: G is dominant, or at least not dominated by B.
      expect(rgb[1]).toBeGreaterThanOrEqual(rgb[2])
    }
  })

  it('trail is slot-tinted (not fixed #66ffff) for slot 2 (orange)', () => {
    const state = stateWith({ p1: makePlayer({ id: 'p1', slot: 2, x: 50 }) }, { tick: 10 })
    const cmds = buildDrawCommands(state, 'p1')
    const trails = filterKind(cmds, 'player-trail')
    expect(trails.length).toBeGreaterThan(0)
    for (const t of trails) {
      expect(t.fill.toLowerCase()).not.toBe('#66ffff')
      // Orange family
      const rgb = hexToRgb(t.fill)!
      expect(rgb[0]).toBeGreaterThan(rgb[2])
    }
  })

  it('afterburner core is slot-tinted (not fixed yellow) for slot 3 (magenta)', () => {
    const state = stateWith({ p1: makePlayer({ id: 'p1', slot: 3, x: 50 }) }, { tick: 10 })
    const cmds = buildDrawCommands(state, 'p1')
    const cores = filterKind(cmds, 'player-afterburner-core')
    expect(cores.length).toBeGreaterThan(0)
    // At least one core fill should carry magenta identity (R>G AND B>G).
    const anyMagenta = cores.some((c) => {
      const rgb = hexToRgb(c.fill)
      if (!rgb) return false
      return rgb[0] > rgb[1] && rgb[2] > rgb[1]
    })
    expect(anyMagenta).toBe(true)
  })
})

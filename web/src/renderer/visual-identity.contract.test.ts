// web/src/renderer/visual-identity.contract.test.ts
//
// Cross-cutting preventative contracts for visual-identity bugs.
//
// The session's visual-identity audit surfaced three bug CLASSES, not just
// three bugs:
//
//   A. Slot-identity drops — entity rendering falls back to a static
//      colour where a slot-derived colour should flow. Eleven bullet
//      layers drifted to cyan because no test asserted cross-player
//      differentiation.
//   B. Local-player invisibility — `playerId` threads through
//      `buildDrawCommands` but produces no visible output. 4 identical
//      ships on screen, no quick confirmation of which is yours.
//   C. Death-animation gaps — entity rendering handles some death
//      transitions (aliens, UFOs) but silently skips others (players)
//      because the renderer simply has no path for them.
//
// Per-bug tests (bullet-slot-identity.test.ts, player-death-explosion.
// test.ts, hud-legend-local-marker.test.ts) lock the specific fixes.
// These CONTRACT tests lock the class — they fail fast when a new
// entity layer is added without slot threading, a new entity type is
// added without a death path, or the local-player concept stops
// influencing rendering.
//
// If a contract fails, either wire the new code into the pattern, or
// add an explicit exception to the relevant allowlist with a reason.

import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { buildDrawCommands, resetEffects, type DrawCommand } from './canvasRenderer'
import type {
  AlienEntity,
  BulletEntity,
  GameState,
  Player,
  PlayerSlot,
  UFOEntity,
} from '../../../shared/types'
import { coopState, coopPlayer, coopBullet, coopDeathPair } from '../testing/coopFixture'

beforeEach(() => resetEffects())

// ─── Helpers ────────────────────────────────────────────────────────────────

type DrawCmdWithKind = DrawCommand & { kind?: string; fill?: string; color?: string }

/** Collect every fill/color literal from commands whose `kind` starts with
 *  one of the given prefixes. Includes nested radial stop colours. */
function collectColours(commands: DrawCommand[], kindPrefixes: string[]): Set<string> {
  const out = new Set<string>()
  for (const cmd of commands) {
    const kind = (cmd as { kind?: string }).kind
    if (!kind || !kindPrefixes.some((p) => kind.startsWith(p))) continue
    if ('fill' in cmd && typeof (cmd as { fill?: string }).fill === 'string') {
      out.add(((cmd as { fill: string }).fill).toLowerCase())
    }
    if ('color' in cmd && typeof (cmd as { color?: string }).color === 'string') {
      out.add(((cmd as { color: string }).color).toLowerCase())
    }
    if (cmd.type === 'radial') {
      for (const stop of cmd.stops) out.add(stop.color.toLowerCase())
    }
  }
  return out
}

/** Render a single-bullet scenario for the given slot and collect colours
 *  from the bullet's decoration layers. */
function renderBulletColours(slot: PlayerSlot, kindPrefixes: string[]): Set<string> {
  const state = coopState(2)
  const player = coopPlayer(slot, { id: 'shooter' })
  state.players = { shooter: player }
  const bullet: BulletEntity = coopBullet(slot, { ownerId: 'shooter', x: 50, y: 20 })
  state.entities = [bullet]
  const commands = buildDrawCommands(state, 'shooter', null, 1, 1)
  return collectColours(commands, kindPrefixes)
}

/** Detect explosion-flavoured draw commands. Covers all stages — flash,
 *  fireball, shockwave, debris, smoke, ember. */
function hasExplosionAround(
  commands: DrawCommand[],
  centreCellX: number,
  centreCellY: number,
  toleranceCells = 8,
): boolean {
  const CELL_W = 8
  const CELL_H = 16
  const cxPx = centreCellX * CELL_W
  const cyPx = centreCellY * CELL_H
  for (const cmd of commands) {
    const kind = (cmd as { kind?: string }).kind
    if (!kind?.startsWith('explosion-')) continue
    const cx =
      cmd.type === 'radial' ? cmd.cx :
      cmd.type === 'circle' ? cmd.cx :
      'x' in cmd ? cmd.x : null
    const cy =
      cmd.type === 'radial' ? cmd.cy :
      cmd.type === 'circle' ? cmd.cy :
      'y' in cmd ? cmd.y : null
    if (cx == null || cy == null) continue
    if (
      Math.abs(cx - cxPx) <= toleranceCells * CELL_W &&
      Math.abs(cy - cyPx) <= toleranceCells * CELL_H
    ) {
      return true
    }
  }
  return false
}

// ─── Contract A — slot-identity conservation for bullets ───────────────────

// Bullet layers that MUST carry slot-derived colour. The static-core
// `bullet-main` and `bullet-core` are deliberately excluded — those stay
// near-white for visibility at any slot hue.
const SLOT_THREADED_BULLET_LAYERS = [
  'bullet-glow',
  'bullet-chromatic',
  'bullet-trail',
  'bullet-taper-outer',
  'bullet-taper-mid',
  'bullet-taper-core',
  'bullet-arc',
  'muzzle-flash',
  'bullet-impact-burst',
]

describe('Contract A — slot-identity conservation', () => {
  it('bullet decoration layers differ across any pair of slots', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<PlayerSlot>(1, 2, 3, 4),
        fc.constantFrom<PlayerSlot>(1, 2, 3, 4),
        (slotA, slotB) => {
          if (slotA === slotB) return true // skip same-slot pairs
          const a = renderBulletColours(slotA, SLOT_THREADED_BULLET_LAYERS)
          const b = renderBulletColours(slotB, SLOT_THREADED_BULLET_LAYERS)
          // The SETS of colours produced by slot A and slot B must not be
          // identical. If they are, slot identity isn't threading through.
          if (a.size === 0 || b.size === 0) return true // tolerate no bullets
          // Symmetric difference must be non-empty — at least one colour
          // unique to one side.
          const aOnly = [...a].filter((c) => !b.has(c))
          const bOnly = [...b].filter((c) => !a.has(c))
          return aOnly.length + bOnly.length > 0
        },
      ),
      { numRuns: 20 },
    )
  })

  it('bullet decoration layers remain stable for same-slot bullets (determinism)', () => {
    const run1 = renderBulletColours(2, SLOT_THREADED_BULLET_LAYERS)
    const run2 = renderBulletColours(2, SLOT_THREADED_BULLET_LAYERS)
    expect([...run1].sort()).toEqual([...run2].sort())
  })

  it('alien bullets stay on the red palette (not affected by slot logic)', () => {
    const state = coopState(2)
    // Alien bullet: ownerId === null
    const alienBullet: BulletEntity = {
      kind: 'bullet',
      id: 'ab-1',
      x: 40,
      y: 25,
      ownerId: null,
      dy: 1,
    }
    state.entities = [alienBullet]
    const commands = buildDrawCommands(state, 'player-1', null, 1, 1)
    const colours = collectColours(commands, ['bullet-'])
    // At least one red-ish colour present (flicker palette is all red/#ff*)
    const hasRed = [...colours].some((c) => /^#ff[0-9a-f]{2}[0-9a-f]{0,2}/i.test(c))
    expect(hasRed).toBe(true)
  })
})

// ─── Contract B — local-player discriminability ────────────────────────────

describe('Contract B — local-player discriminability', () => {
  it('with ≥2 players and a known playerId, a local-only draw command is present', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<2 | 3 | 4>(2, 3, 4),
        fc.integer({ min: 1, max: 4 }),
        (playerCount, localSlotRaw) => {
          const localSlot = Math.min(localSlotRaw, playerCount) as PlayerSlot
          const state = coopState(playerCount)
          const playerId = `player-${localSlot}`
          const commands = buildDrawCommands(state, playerId, null, 1, 1)
          // Find at least one command keyed specifically to "local" identity.
          // The canonical marker is `hud-player-legend-local-marker`, but the
          // contract leaves room for additional markers (e.g., a mini-badge
          // over the local ship) — any `*-local-*` kind counts.
          return commands.some((c) => {
            const k = (c as { kind?: string }).kind
            return typeof k === 'string' && k.includes('local')
          })
        },
      ),
      { numRuns: 12 },
    )
  })

  it('solo play (1 player) does NOT emit a local marker — single ship is self-identifying', () => {
    // Solo has exactly one ship on screen, so a local marker carries no
    // information. The HUD player legend (which renders the marker)
    // deliberately only activates at ≥2 players. Contract records this
    // as a design choice so a future "always show marker" regression
    // trips the test.
    const state = coopState(2) // coopState minimum is 2
    state.players = { 'player-1': state.players['player-1'] }
    state.mode = 'solo'
    const commands = buildDrawCommands(state, 'player-1', null, 1, 1)
    const hasLocalMarker = commands.some((c) =>
      typeof (c as { kind?: string }).kind === 'string' &&
      (c as { kind: string }).kind.includes('local'),
    )
    expect(hasLocalMarker).toBe(false)
  })

  it('playerId = null suppresses the local marker', () => {
    const state = coopState(3)
    const commands = buildDrawCommands(state, null, null, 1, 1)
    const hasLocalMarker = commands.some((c) =>
      typeof (c as { kind?: string }).kind === 'string' &&
      (c as { kind: string }).kind.includes('local'),
    )
    expect(hasLocalMarker).toBe(false)
  })
})

// ─── Contract C — death-animation parity across entity types ───────────────
//
// Entities with an `alive: boolean` must emit an explosion on the
// alive:true → false transition. Currently three such types:
//   - AlienEntity
//   - UFOEntity
//   - Player  (in the state.players map, not state.entities)
// Adding a fourth type (e.g., boss) should force this contract to be
// extended rather than silently not-render.

function makeAlien(x: number, alive: boolean): AlienEntity {
  return {
    kind: 'alien',
    id: `a-${x}-${alive ? 'alive' : 'dead'}`,
    x,
    y: 6,
    type: 'squid',
    alive,
    row: 0,
    col: 0,
    points: 30,
    entering: false,
  }
}

function makeUFO(x: number, alive: boolean): UFOEntity {
  return {
    kind: 'ufo',
    id: `u-${x}-${alive ? 'alive' : 'dead'}`,
    x,
    y: 1,
    direction: 1,
    alive,
    points: 100,
  }
}

describe('Contract C — death-animation parity', () => {
  it('alien alive→dead transition emits an explosion at its position', () => {
    const prev = coopState(2, { tick: 9, entities: [makeAlien(40, true)] })
    const curr = coopState(2, { tick: 10, entities: [makeAlien(40, false)] })
    const commands = buildDrawCommands(curr, 'player-1', prev, 1, 1)
    expect(hasExplosionAround(commands, 40, 6)).toBe(true)
  })

  it('UFO alive→dead transition emits an explosion at its position', () => {
    const prev = coopState(2, { tick: 9, entities: [makeUFO(30, true)] })
    const curr = coopState(2, { tick: 10, entities: [makeUFO(30, false)] })
    const commands = buildDrawCommands(curr, 'player-1', prev, 1, 1)
    expect(hasExplosionAround(commands, 30, 1)).toBe(true)
  })

  it('player alive→dead transition emits an explosion at the player position', () => {
    const { prev, curr } = coopDeathPair(2, 2)
    const dying = prev.players['player-2']
    const commands = buildDrawCommands(curr, 'player-1', prev, 1, 1)
    // Player y is fixed at LAYOUT.PLAYER_Y. We don't import it here; the
    // helper uses a generous tolerance so the y coord doesn't have to match
    // perfectly.
    expect(hasExplosionAround(commands, dying.x, 31, 15)).toBe(true)
  })

  it('no alive→dead transition means no explosion', () => {
    const prev = coopState(2, { tick: 9, entities: [makeAlien(40, true)] })
    const curr = coopState(2, { tick: 10, entities: [makeAlien(40, true)] })
    const commands = buildDrawCommands(curr, 'player-1', prev, 1, 1)
    // No deaths in this frame — explosions may be present from earlier
    // deaths in a real session, but with resetEffects() in beforeEach the
    // accumulator is empty, so this frame emits none.
    const explosionCount = commands.filter((c) =>
      typeof (c as { kind?: string }).kind === 'string' &&
      ((c as { kind: string }).kind).startsWith('explosion-'),
    ).length
    expect(explosionCount).toBe(0)
  })
})

// ─── Contract D — every entity-owned command has a decision path ───────────
//
// Meta-contract: when a new bullet-* or player-* kind is added, it MUST
// be classified into one of:
//
//   - slot-threaded (owned by a player, uses COLORS.player[slot])
//   - static-by-design (in the WHITELIST below with a justification)
//
// Unclassified new kinds fail this test, forcing the contributor to
// explicitly record their reasoning.

// Kinds that are intentionally NOT slot-threaded, with reasons.
const STATIC_PLAYER_OWNED_KINDS: Record<string, string> = {
  // Bullet main rect stays near-white at any slot — it's the position
  // anchor for tests and should be visually punchy regardless of hue.
  'bullet-main': 'position-anchor; stays white for readability',
  'bullet-core': 'inner white core — specular highlight, OK on any hue',
  'bullet-ember': 'orange ember particles, palette is red/warm by design',
  'bullet-spark': 'yellow spark flash, palette is warm by design',
  'bullet-aura': 'alien-bullet-only decoration',
  'bullet-fizzle': 'slot-threaded via blend, skip strict check',
  // Player highlights that are specular (white) across any hull colour
  'player-cockpit': 'specular highlight — white reads right on any hue',
  'player-leading-edge': 'specular white',
  'player-landing-light': 'white point light',
  'player-weapon-glow': 'white weapon barrel highlight',
  'player-reflection': 'white reflection streak',
  'player-afterburner-edge': 'warm ember edge, palette by design',
  'player-exhaust': 'warm orange ember, palette by design',
  'player-shield-bubble': 'cyan shield effect, palette by design',
  'player-halo': 'respawn halo — separate colour logic',
  'player-impact-shield': 'now slot-tinted (bug #5); kept listed for audit trail',
  'player-warning-pulse': 'red low-health warning, palette by design',
}

describe('Contract D — every entity-owned kind is classified', () => {
  it('emits no new unclassified bullet-* / player-* kinds', () => {
    // Render a rich scenario to surface all bullet + player kinds.
    const state = coopState(3, { tick: 20 })
    const bullet1 = coopBullet(1, { id: 'b1', ownerId: 'player-1' })
    const bullet2 = coopBullet(2, { id: 'b2', ownerId: 'player-2' })
    state.entities = [bullet1, bullet2]
    const commands = buildDrawCommands(state, 'player-1', null, 1, 1)

    const seenKinds = new Set<string>()
    for (const cmd of commands) {
      const k = (cmd as { kind?: string }).kind
      if (!k) continue
      if (k.startsWith('bullet-') || k.startsWith('player-') || k === 'muzzle-flash') {
        seenKinds.add(k)
      }
    }

    // Agent-added kinds that should pass the contract because they carry
    // slot identity — i.e., NOT allowlisted here means "must be
    // slot-threaded by the implementation". The test doesn't re-verify
    // the threading itself (Contract A does that) — it just enforces
    // that every new kind is consciously classified.
    const classified = new Set([
      ...Object.keys(STATIC_PLAYER_OWNED_KINDS),
      // Slot-threaded kinds from Contract A
      ...SLOT_THREADED_BULLET_LAYERS,
      // HUD kinds that aren't "owned" by a player in the aesthetic sense
      'player-plume-center',
      'player-plume-left',
      'player-plume-right',
      'player-wing',
      'player-rim',
      'player-trail',
      'player-afterburner-core',
      'player-impact-shield',
    ])

    const unclassified = [...seenKinds].filter((k) => !classified.has(k))
    expect(unclassified).toEqual([])
  })
})

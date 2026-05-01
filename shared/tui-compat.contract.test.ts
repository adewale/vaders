// shared/tui-compat.contract.test.ts
//
// ─── TUI / Web Frontend Compatibility Contract ───────────────────────────────
//
// WHY THIS FILE EXISTS
// --------------------
// Vaders has two frontends (TUI via OpenTUI, web via React DOM + Canvas) that
// render the same game state and must stay in visual + behavioural lockstep.
// Both frontends consume the same pixel art, sprite dimensions, hitboxes,
// colour palette, and WebSocket protocol from:
//   - shared/types.ts
//   - shared/protocol.ts
//   - client-core/src/sprites/bitmaps.ts
//   - client-core/src/sprites/colors.ts
//
// This file encodes a cross-frontend invariant contract. The tests pin down
// the shapes, sizes, counts, and values that BOTH frontends depend on. They
// are placed in shared/ deliberately so that a change in either frontend or
// in client-core cannot silently break the other.
//
// WHAT BREAKS IF THESE FAIL
// -------------------------
// - TUI rendering: braille sprite encoding assumes 14 cols × 8 rows per sprite
//   (7 braille chars × 2 px, 2 braille rows × 4 px). Changing sprite size
//   silently corrupts the TUI render loop.
// - Hitboxes: collision math in shared/types.ts reads HITBOX constants. Any
//   drift between HITBOX and SPRITE_SIZE produces invisible hits / visible
//   misses, breaking multiplayer fairness.
// - Multiplayer state sync: if ClientMessage / ServerMessage / GameEvent /
//   ErrorCode shapes drift, server and client disagree on the wire and
//   desync mid-game.
// - Colour contract: slot colours (cyan/orange/magenta/lime) and alien
//   threat-tier colours are a user-visible brand contract. Changing them
//   without both frontends agreeing produces mismatched UI across platforms.
//
// POLICY
// ------
// Nobody relaxes these constraints without a deliberate, cross-frontend
// design decision. A PR that needs to change one of these values MUST:
//   1. Update the constant in its source of truth.
//   2. Update this contract file.
//   3. Confirm both frontends render correctly after the change.
//
// If any test here fails in CI, that is a flag — not a nuisance.

import { describe, test, expect } from 'bun:test'
import fc from 'fast-check'

import {
  LAYOUT,
  HITBOX,
  STANDARD_WIDTH,
  STANDARD_HEIGHT,
  PLAYER_COLORS,
  ALIEN_REGISTRY,
  type PlayerSlot,
  type GameEvent,
} from './types'

import type { ClientMessage, ServerMessage, ServerEvent, ErrorCode, InputState } from './protocol'

import { PIXEL_ART, SPRITE_SIZE } from '../client-core/src/sprites/bitmaps'

import { COLORS, GRADIENT_COLORS, getPlayerColor } from '../client-core/src/sprites/colors'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/
const SNAKE_CASE_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/

/** Flatten a PIXEL_ART entry (sprite or animation frame) into 2D bitmap rows. */
function bitmapsForEntry(entry: unknown): number[][][] {
  // entry is either a 2D number[][] (player) or { a: 2D, b: 2D }
  if (Array.isArray(entry)) {
    return [entry as number[][]]
  }
  const anim = entry as { a: number[][]; b: number[][] }
  return [anim.a, anim.b]
}

function allSpriteBitmaps(): { name: string; bitmap: number[][] }[] {
  const out: { name: string; bitmap: number[][] }[] = []
  for (const [name, entry] of Object.entries(PIXEL_ART)) {
    const bitmaps = bitmapsForEntry(entry)
    bitmaps.forEach((bm, i) => {
      out.push({ name: bitmaps.length === 1 ? name : `${name}.${i === 0 ? 'a' : 'b'}`, bitmap: bm })
    })
  }
  return out
}

// ═════════════════════════════════════════════════════════════════════════════
// GROUP 1 · SPRITE DIMENSIONS FROZEN
// ═════════════════════════════════════════════════════════════════════════════

describe('Contract · sprite dimensions are frozen', () => {
  test('PIXEL_ART.squid frames are 8 rows × 14 columns', () => {
    expect(PIXEL_ART.squid.a.length).toBe(8)
    expect(PIXEL_ART.squid.b.length).toBe(8)
    expect(PIXEL_ART.squid.a[0].length).toBe(14)
    expect(PIXEL_ART.squid.b[0].length).toBe(14)
  })

  test('PIXEL_ART.crab frames are 8 rows × 14 columns', () => {
    expect(PIXEL_ART.crab.a.length).toBe(8)
    expect(PIXEL_ART.crab.b.length).toBe(8)
    expect(PIXEL_ART.crab.a[0].length).toBe(14)
    expect(PIXEL_ART.crab.b[0].length).toBe(14)
  })

  test('PIXEL_ART.octopus frames are 8 rows × 14 columns', () => {
    expect(PIXEL_ART.octopus.a.length).toBe(8)
    expect(PIXEL_ART.octopus.b.length).toBe(8)
    expect(PIXEL_ART.octopus.a[0].length).toBe(14)
    expect(PIXEL_ART.octopus.b[0].length).toBe(14)
  })

  test('PIXEL_ART.ufo frames are 8 rows × 14 columns', () => {
    expect(PIXEL_ART.ufo.a.length).toBe(8)
    expect(PIXEL_ART.ufo.b.length).toBe(8)
    expect(PIXEL_ART.ufo.a[0].length).toBe(14)
    expect(PIXEL_ART.ufo.b[0].length).toBe(14)
  })

  test('PIXEL_ART.player is a single 8 rows × 14 columns bitmap', () => {
    expect(Array.isArray(PIXEL_ART.player)).toBe(true)
    expect(PIXEL_ART.player.length).toBe(8)
    expect(PIXEL_ART.player[0].length).toBe(14)
  })

  test('SPRITE_SIZE matches canonical widths and heights for every entity', () => {
    expect(SPRITE_SIZE.alien).toEqual({ width: 7, height: 2 })
    expect(SPRITE_SIZE.player).toEqual({ width: 7, height: 2 })
    expect(SPRITE_SIZE.ufo).toEqual({ width: 7, height: 2 })
    expect(SPRITE_SIZE.bullet).toEqual({ width: 1, height: 1 })
    expect(SPRITE_SIZE.barrier).toEqual({ width: 3, height: 2 })
  })

  test('animation frames A and B are distinct for every animated sprite', () => {
    for (const name of ['squid', 'crab', 'octopus', 'ufo'] as const) {
      const sprite = PIXEL_ART[name]
      expect(sprite.a).not.toEqual(sprite.b)
      expect(JSON.stringify(sprite.a)).not.toBe(JSON.stringify(sprite.b))
      // Also: frame A is not empty and frame B is not empty
      expect(sprite.a.length).toBeGreaterThan(0)
      expect(sprite.b.length).toBeGreaterThan(0)
    }
  })

  test('every "on" pixel value is exactly 1, every "off" is exactly 0 — PBT', () => {
    const sprites = allSpriteBitmaps()
    fc.assert(
      fc.property(fc.constantFrom(...sprites.map((_, i) => i)), (idx) => {
        const { bitmap } = sprites[idx]
        for (const row of bitmap) {
          for (const px of row) {
            // Must be strictly 0 or 1 — not truthy-but-not-1, not 0.5, not null
            if (px !== 0 && px !== 1) return false
          }
        }
        return true
      }),
      { numRuns: 100 },
    )
    // Also assert explicitly for the fixed sprite set
    for (const { bitmap } of sprites) {
      for (const row of bitmap) {
        for (const px of row) {
          expect([0, 1]).toContain(px)
        }
      }
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// GROUP 2 · HITBOX INVARIANTS
// ═════════════════════════════════════════════════════════════════════════════

describe('Contract · hitbox invariants', () => {
  test('player half-width is 3 (7-wide sprite centred on x)', () => {
    expect(HITBOX.PLAYER_HALF_WIDTH).toBe(3)
    // The derived visual span is 7 cells wide: [x-3, x+4)
    const span = HITBOX.PLAYER_HALF_WIDTH * 2 + 1
    expect(span).toBe(SPRITE_SIZE.player.width)
    expect(span).toBe(7)
  })

  test('alien and UFO hitbox widths are equal (both 7, canonical Space Invaders)', () => {
    expect(HITBOX.ALIEN_WIDTH).toBe(7)
    expect(HITBOX.UFO_WIDTH).toBe(7)
    expect(HITBOX.ALIEN_WIDTH).toBe(HITBOX.UFO_WIDTH)
  })

  test('barrier segment hitbox is 3 wide × 2 tall', () => {
    expect(HITBOX.BARRIER_SEGMENT_WIDTH).toBe(3)
    expect(HITBOX.BARRIER_SEGMENT_HEIGHT).toBe(2)
    expect(HITBOX.BARRIER_SEGMENT_WIDTH).toBe(SPRITE_SIZE.barrier.width)
    expect(HITBOX.BARRIER_SEGMENT_HEIGHT).toBe(SPRITE_SIZE.barrier.height)
  })

  test('HITBOX values align with SPRITE_SIZE values', () => {
    expect(HITBOX.ALIEN_WIDTH).toBe(SPRITE_SIZE.alien.width)
    expect(HITBOX.ALIEN_HEIGHT).toBe(SPRITE_SIZE.alien.height)
    expect(HITBOX.UFO_WIDTH).toBe(SPRITE_SIZE.ufo.width)
    expect(HITBOX.BARRIER_SEGMENT_WIDTH).toBe(SPRITE_SIZE.barrier.width)
    expect(HITBOX.BARRIER_SEGMENT_HEIGHT).toBe(SPRITE_SIZE.barrier.height)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// GROUP 3 · LAYOUT BOUNDARIES
// ═════════════════════════════════════════════════════════════════════════════

describe('Contract · layout boundaries', () => {
  test('player movement range is valid and spans ≥ 100 cells', () => {
    expect(LAYOUT.PLAYER_MIN_X).toBeLessThanOrEqual(LAYOUT.PLAYER_MAX_X)
    const range = LAYOUT.PLAYER_MAX_X - LAYOUT.PLAYER_MIN_X
    expect(range).toBeGreaterThanOrEqual(100)
    // Range must also leave room for the sprite — left + width <= screen
    expect(LAYOUT.PLAYER_MAX_X + LAYOUT.PLAYER_WIDTH).toBeLessThanOrEqual(STANDARD_WIDTH)
  })

  test('LAYOUT player dimensions mirror SPRITE_SIZE.player', () => {
    expect(LAYOUT.PLAYER_WIDTH).toBe(7)
    expect(LAYOUT.PLAYER_HEIGHT).toBe(2)
    expect(LAYOUT.PLAYER_WIDTH).toBe(SPRITE_SIZE.player.width)
    expect(LAYOUT.PLAYER_HEIGHT).toBe(SPRITE_SIZE.player.height)
  })

  test('LAYOUT alien dimensions mirror SPRITE_SIZE.alien', () => {
    expect(LAYOUT.ALIEN_WIDTH).toBe(7)
    expect(LAYOUT.ALIEN_HEIGHT).toBe(2)
    expect(LAYOUT.ALIEN_WIDTH).toBe(SPRITE_SIZE.alien.width)
    expect(LAYOUT.ALIEN_HEIGHT).toBe(SPRITE_SIZE.alien.height)
  })

  test('standard screen dimensions are the canonical 120×36 TUI grid', () => {
    expect(STANDARD_WIDTH).toBe(120)
    expect(STANDARD_HEIGHT).toBe(36)
    // Player Y must be on-screen
    expect(LAYOUT.PLAYER_Y).toBeLessThan(STANDARD_HEIGHT)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// GROUP 4 · COLOUR CONTRACTS
// ═════════════════════════════════════════════════════════════════════════════

describe('Contract · colour palette', () => {
  test('COLORS.player has all four slots as valid 6-char hex', () => {
    const slots: PlayerSlot[] = [1, 2, 3, 4]
    for (const slot of slots) {
      const c = COLORS.player[slot]
      expect(typeof c).toBe('string')
      expect(c).toMatch(HEX_COLOR_RE)
      expect(c.length).toBe(7)
    }
  })

  test('COLORS.alien has squid, crab, octopus as valid hex', () => {
    for (const type of ['squid', 'crab', 'octopus'] as const) {
      const c = COLORS.alien[type]
      expect(typeof c).toBe('string')
      expect(c).toMatch(HEX_COLOR_RE)
      // Must also be listed in ALIEN_REGISTRY so the two stay in sync
      expect(ALIEN_REGISTRY[type]).toBeDefined()
    }
  })

  test('COLORS.barrier has keys for health levels 1..4 as valid hex', () => {
    for (const level of [1, 2, 3, 4] as const) {
      const c = COLORS.barrier[level]
      expect(typeof c).toBe('string')
      expect(c).toMatch(HEX_COLOR_RE)
      expect(c.length).toBe(7)
    }
  })

  test('GRADIENT_COLORS.alien has bright AND dark hex for each alien type', () => {
    for (const type of ['squid', 'crab', 'octopus'] as const) {
      const grad = GRADIENT_COLORS.alien[type]
      expect(grad).toBeDefined()
      expect(grad.bright).toMatch(HEX_COLOR_RE)
      expect(grad.dark).toMatch(HEX_COLOR_RE)
      // Bright should not equal dark — a gradient by definition
      expect(grad.bright).not.toBe(grad.dark)
    }
  })

  test('getPlayerColor(slot) returns the matching COLORS.player[slot] for slots 1..4', () => {
    const slots: PlayerSlot[] = [1, 2, 3, 4]
    for (const slot of slots) {
      expect(getPlayerColor(slot)).toBe(COLORS.player[slot])
    }
    // Also cross-check with the PLAYER_COLORS mapping (cyan/orange/magenta/lime)
    expect(PLAYER_COLORS[1]).toBe('cyan')
    expect(PLAYER_COLORS[2]).toBe('orange')
    expect(PLAYER_COLORS[3]).toBe('magenta')
    expect(PLAYER_COLORS[4]).toBe('lime')
  })

  test('getPlayerColor with an invalid slot falls back to a non-empty string', () => {
    const invalid = getPlayerColor(99 as unknown as PlayerSlot)
    expect(typeof invalid).toBe('string')
    expect(invalid.length).toBeGreaterThan(0)
    // Explicit fallback should also work
    const withFallback = getPlayerColor(99 as unknown as PlayerSlot, '#123456')
    expect(withFallback).toBe('#123456')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// GROUP 5 · PROTOCOL CONTRACT
// ═════════════════════════════════════════════════════════════════════════════

describe('Contract · WebSocket protocol shapes', () => {
  test('every ClientMessage variant can be constructed with a string type field', () => {
    const inputState: InputState = { left: true, right: false }
    const msgs: ClientMessage[] = [
      { type: 'join', name: 'Alice' },
      { type: 'ready' },
      { type: 'unready' },
      { type: 'start_solo' },
      { type: 'forfeit' },
      { type: 'input', held: inputState },
      { type: 'move', direction: 'left' },
      { type: 'move', direction: 'right' },
      { type: 'shoot' },
      { type: 'ping' },
    ]
    expect(msgs.length).toBeGreaterThanOrEqual(9)
    for (const m of msgs) {
      expect(typeof m.type).toBe('string')
      expect(m.type.length).toBeGreaterThan(0)
    }
    // Collect the unique types — should cover every ClientMessage variant
    const uniqueTypes = new Set(msgs.map((m) => m.type))
    expect(uniqueTypes).toEqual(
      new Set(['join', 'ready', 'unready', 'start_solo', 'forfeit', 'input', 'move', 'shoot', 'ping']),
    )
  })

  test('every ServerMessage variant constructs cleanly and JSON-roundtrips', () => {
    const serverMsgs: ServerMessage[] = [
      { type: 'pong', serverTime: 1234 },
      { type: 'error', code: 'room_full', message: 'nope' },
      { type: 'event', name: 'game_start' },
      { type: 'event', name: 'invasion' },
      { type: 'event', name: 'countdown_tick', data: { count: 3 } },
      { type: 'event', name: 'ufo_spawn', data: { x: 10 } },
      { type: 'event', name: 'wave_complete', data: { wave: 2 } },
      { type: 'event', name: 'game_over', data: { result: 'victory' } },
    ]
    for (const m of serverMsgs) {
      const json = JSON.stringify(m)
      expect(typeof json).toBe('string')
      const parsed = JSON.parse(json)
      expect(parsed).toEqual(m)
      expect(typeof parsed.type).toBe('string')
    }
  })

  test('all 15 GameEvent names are snake_case and non-empty', () => {
    const allEvents: GameEvent[] = [
      'player_joined',
      'player_left',
      'player_ready',
      'player_unready',
      'player_died',
      'player_respawned',
      'countdown_tick',
      'countdown_cancelled',
      'game_start',
      'alien_killed',
      'score_awarded',
      'wave_complete',
      'game_over',
      'invasion',
      'ufo_spawn',
    ]
    expect(allEvents.length).toBe(15)
    // All unique
    expect(new Set(allEvents).size).toBe(15)
    for (const name of allEvents) {
      expect(name.length).toBeGreaterThan(0)
      expect(name).toMatch(SNAKE_CASE_RE)
    }
  })

  test('all 7 ErrorCode values are snake_case and non-empty', () => {
    const allCodes: ErrorCode[] = [
      'room_full',
      'game_in_progress',
      'invalid_room',
      'invalid_message',
      'already_joined',
      'rate_limited',
      'countdown_in_progress',
    ]
    expect(allCodes.length).toBe(7)
    expect(new Set(allCodes).size).toBe(7)
    for (const code of allCodes) {
      expect(code.length).toBeGreaterThan(0)
      expect(code).toMatch(SNAKE_CASE_RE)
    }
  })

  test('ServerEvent discriminants align with the GameEvent union', () => {
    // Spot-check: every event we construct has a name that's in the GameEvent list
    const sample: ServerEvent = {
      type: 'event',
      name: 'player_joined',
      data: {
        player: {
          id: 'p1',
          name: 'Alice',
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
        },
      },
    }
    expect(sample.type).toBe('event')
    expect(sample.name).toBe('player_joined')
    expect(typeof sample.data).toBe('object')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// GROUP 6 · PIXEL_ART DIFFERENTIAL / BRAILLE ENCODING
// ═════════════════════════════════════════════════════════════════════════════

describe('Contract · pixel art encoding invariants', () => {
  test('every sprite bitmap is non-blank (≥ 20% pixels "on") — PBT', () => {
    const sprites = allSpriteBitmaps()
    fc.assert(
      fc.property(fc.constantFrom(...sprites.map((_, i) => i)), (idx) => {
        const { bitmap } = sprites[idx]
        const total = bitmap.length * bitmap[0].length
        let on = 0
        for (const row of bitmap) for (const px of row) if (px === 1) on++
        return on / total >= 0.2
      }),
      { numRuns: 50 },
    )
    // Also do an explicit pass so we get a human-readable failure message
    for (const { name, bitmap } of sprites) {
      const total = bitmap.length * bitmap[0].length
      let on = 0
      for (const row of bitmap) for (const px of row) if (px === 1) on++
      const ratio = on / total
      expect(ratio).toBeGreaterThanOrEqual(0.2)
      expect(on).toBeGreaterThan(0)
      // sanity: not completely filled either — would imply a missing sprite
      expect(ratio).toBeLessThan(1.0)
      // guard against empty rows
      expect(bitmap[0].length).toBeGreaterThan(0)
      // name is preserved (useful in failure output)
      expect(typeof name).toBe('string')
    }
  })

  test('every sprite bitmap is rectangular (all rows same column count) — PBT', () => {
    const sprites = allSpriteBitmaps()
    fc.assert(
      fc.property(fc.constantFrom(...sprites.map((_, i) => i)), (idx) => {
        const { bitmap } = sprites[idx]
        const cols = bitmap[0].length
        return bitmap.every((row) => row.length === cols)
      }),
      { numRuns: 50 },
    )
    for (const { bitmap } of sprites) {
      const cols = bitmap[0].length
      for (const row of bitmap) {
        expect(row.length).toBe(cols)
      }
      expect(cols).toBeGreaterThan(0)
    }
  })

  test('every sprite has 14-column width = SPRITE_SIZE.alien.width × 2 (2 px per braille col × 7 chars)', () => {
    const sprites = allSpriteBitmaps()
    const expectedCols = SPRITE_SIZE.alien.width * 2
    expect(expectedCols).toBe(14)
    for (const { name, bitmap } of sprites) {
      expect(bitmap[0].length).toBe(expectedCols)
      // Defensive: also each row
      for (const row of bitmap) {
        expect(row.length).toBe(expectedCols)
      }
      expect(typeof name).toBe('string')
    }
  })

  test('every sprite has 8-row height = SPRITE_SIZE.alien.height × 4 (4 px per braille row × 2 rows)', () => {
    const sprites = allSpriteBitmaps()
    const expectedRows = SPRITE_SIZE.alien.height * 4
    expect(expectedRows).toBe(8)
    for (const { name, bitmap } of sprites) {
      expect(bitmap.length).toBe(expectedRows)
      // Also: number of rows must be divisible by 4 for braille encoding to work
      expect(bitmap.length % 4).toBe(0)
      expect(typeof name).toBe('string')
    }
  })
})

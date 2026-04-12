// Tests for wave transition polish features:
//   #7  Full-screen wave announcement (kind: 'wave-announce' / 'wave-announce-border')
//   #8  Alien entrance slide-in during wipe_reveal (staggered by row)
//   #11 HUD colour legend for multi-player games (kind: 'hud-player-legend')
//   #12 Wave-transition flash text FIGHT! / WAVE CLEARED! (kind: 'wave-flash-*')
//
// The renderer file owns module-level state for the flash counters + previous-status
// tracker, so these tests call resetEffects() before each test to ensure isolation.

import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { buildDrawCommands, resetEffects, type DrawCommand } from './canvasRenderer'
import { createDefaultGameState } from '../../../shared/state-defaults'
import type { AlienEntity, GameState, Player, PlayerSlot } from '../../../shared/types'
import { COLORS } from '../../../client-core/src/sprites/colors'

beforeEach(() => {
  resetEffects()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAlien(overrides: Partial<AlienEntity> = {}): AlienEntity {
  return {
    kind: 'alien',
    id: 'alien-0',
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

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-1',
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

function textCmds(commands: DrawCommand[]): Array<DrawCommand & { type: 'text' }> {
  return commands.filter((c) => c.type === 'text') as Array<DrawCommand & { type: 'text' }>
}

function findKind(commands: DrawCommand[], kind: string): DrawCommand | undefined {
  return commands.find((c) => 'kind' in c && (c as { kind?: string }).kind === kind)
}

function findAllKind(commands: DrawCommand[], kind: string): DrawCommand[] {
  return commands.filter((c) => 'kind' in c && (c as { kind?: string }).kind === kind)
}

// ─── #7 Full-screen wave announcement ─────────────────────────────────────────

describe('#7 Full-screen wave announcement', () => {
  it('wipe_hold emits a text command tagged kind: wave-announce with WAVE N text', () => {
    const state = stateWith(
      [],
      {},
      {
        status: 'wipe_hold',
        wipeWaveNumber: 4,
        wipeTicksRemaining: 30,
        tick: 50,
      },
    )

    const commands = buildDrawCommands(state, null)
    const announce = findKind(commands, 'wave-announce')

    expect(announce).toBeDefined()
    expect(announce!.type).toBe('text')
    const t = announce as DrawCommand & { type: 'text' }
    expect(t.text).toMatch(/WAVE\s+4/i)
  })

  it('wipe_hold emits a decorative border rect tagged kind: wave-announce-border', () => {
    const state = stateWith(
      [],
      {},
      {
        status: 'wipe_hold',
        wipeWaveNumber: 2,
        wipeTicksRemaining: 30,
        tick: 50,
      },
    )

    const commands = buildDrawCommands(state, null)
    const border = findKind(commands, 'wave-announce-border')
    expect(border).toBeDefined()
    expect(border!.type).toBe('rect')
  })

  it('wipe_reveal also emits wave-announce (continues through reveal)', () => {
    const state = stateWith(
      [],
      {},
      {
        status: 'wipe_reveal',
        wipeWaveNumber: 2,
        wipeTicksRemaining: 20,
        tick: 60,
      },
    )
    const commands = buildDrawCommands(state, null)
    expect(findKind(commands, 'wave-announce')).toBeDefined()
  })

  it('playing does NOT emit wave-announce', () => {
    const state = stateWith(
      [],
      {},
      {
        status: 'playing',
        wipeWaveNumber: null,
        tick: 100,
      },
    )
    const commands = buildDrawCommands(state, null)
    expect(findKind(commands, 'wave-announce')).toBeUndefined()
    expect(findKind(commands, 'wave-announce-border')).toBeUndefined()
  })

  it('wave-announce text pulses (alpha reflected in shadowBlur or dedicated fields over ticks)', () => {
    // This test asserts that the rendering varies with state.tick so the
    // announcement "pulses". We accept either shadowBlur variance or alpha
    // variance via a second 'text' command — here we simply check that two
    // different ticks produce different announcement commands (border width
    // varies due to alpha ramp on tick).
    const s1 = stateWith(
      [],
      {},
      {
        status: 'wipe_hold',
        wipeWaveNumber: 1,
        wipeTicksRemaining: 40,
        tick: 0,
      },
    )
    const s2 = stateWith(
      [],
      {},
      {
        status: 'wipe_hold',
        wipeWaveNumber: 1,
        wipeTicksRemaining: 40,
        tick: 15,
      },
    )

    const c1 = findKind(buildDrawCommands(s1, null), 'wave-announce-border') as DrawCommand & { type: 'rect' }
    const c2 = findKind(buildDrawCommands(s2, null), 'wave-announce-border') as DrawCommand & { type: 'rect' }
    expect(c1).toBeDefined()
    expect(c2).toBeDefined()
    // The border animates (alpha OR size changes with tick) — values must differ
    const differ = (c1.alpha ?? 1) !== (c2.alpha ?? 1) || c1.width !== c2.width || c1.height !== c2.height
    expect(differ).toBe(true)
  })
})

// ─── #8 Alien entrance slide-in during wipe_reveal ───────────────────────────

describe('#8 Alien entrance slide-in during wipe_reveal', () => {
  const REVEAL_TICKS = 45

  it('during wipe_reveal, alien y is GREATER than formation y for earlier ticks (sliding down from above)', () => {
    // At start of reveal, alien should be off-screen above (negative y offset vs formation).
    const alien = makeAlien({ id: 'a1', y: 5, row: 0, col: 0 })
    const start = stateWith(
      [alien],
      {},
      {
        status: 'wipe_reveal',
        wipeTicksRemaining: REVEAL_TICKS,
        wipeWaveNumber: 1,
        tick: 0,
      },
    )
    const end = stateWith(
      [alien],
      {},
      {
        status: 'wipe_reveal',
        wipeTicksRemaining: 0,
        wipeWaveNumber: 1,
        tick: 45,
      },
    )

    const cmdsStart = buildDrawCommands(start, null)
    const cmdsEnd = buildDrawCommands(end, null)

    // Find alien sprite (first large sprite with alien width)
    const aStart = cmdsStart.find((c) => c.type === 'sprite') as (DrawCommand & { type: 'sprite' }) | undefined
    const aEnd = cmdsEnd.find((c) => c.type === 'sprite') as (DrawCommand & { type: 'sprite' }) | undefined
    expect(aStart).toBeDefined()
    expect(aEnd).toBeDefined()

    // Start: y offset is negative (above screen); end: y equals formation
    expect(aStart!.y).toBeLessThan(aEnd!.y)
  })

  it('playing status: alien y equals formation y exactly (contract preserved)', () => {
    const alien = makeAlien({ id: 'a1', y: 8, row: 2, col: 3 })
    const state = stateWith(
      [alien],
      {},
      {
        status: 'playing',
        tick: 100,
      },
    )
    const sprite = buildDrawCommands(state, null).find((c) => c.type === 'sprite') as DrawCommand & { type: 'sprite' }
    expect(sprite).toBeDefined()
    expect(sprite.y).toBe(8 * 16) // CELL_H = 16
  })

  it('row 0 lands before row 5 (staggered descent)', () => {
    // At the same ticksRemaining partway through reveal, row 0 should be closer
    // to formation (higher y offset i.e. larger y) than row 5 (still above, smaller y).
    const row0 = makeAlien({ id: 'r0', y: 5, row: 0, col: 0 })
    const row5 = makeAlien({ id: 'r5', y: 5, row: 5, col: 0 })

    const state = stateWith(
      [row0, row5],
      {},
      {
        status: 'wipe_reveal',
        wipeTicksRemaining: Math.floor(REVEAL_TICKS / 2), // mid-reveal
        wipeWaveNumber: 1,
        tick: 10,
      },
    )
    const cmds = buildDrawCommands(state, null)
    const sprites = cmds.filter((c) => c.type === 'sprite') as Array<DrawCommand & { type: 'sprite' }>
    const r0Cmd = sprites.find((s) => s.x === 10 * 8 && s !== undefined) // both at x=10
    // Distinguish by sprite order in entities list: first emitted = row0
    expect(sprites.length).toBeGreaterThanOrEqual(2)
    // row0 should be at a y value >= row5 (row0 has descended more / finished)
    const [first, second] = sprites
    // First entity in list is row0 (emitted first), second is row5
    expect(first.y).toBeGreaterThanOrEqual(second.y)
    void r0Cmd
  })

  it('PBT: offset monotonically decreases (y increases toward formation) as reveal progresses', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 }), // row
        fc.integer({ min: 3, max: 20 }), // formationY
        fc.integer({ min: 2, max: REVEAL_TICKS }), // ticksRemainingHigh
        (row, formationY, ticksHigh) => {
          const ticksLow = Math.max(0, ticksHigh - 10)
          const alien = makeAlien({ id: 'a', y: formationY, row, col: 0 })
          const sHigh = stateWith(
            [alien],
            {},
            {
              status: 'wipe_reveal',
              wipeTicksRemaining: ticksHigh, // earlier in reveal
              wipeWaveNumber: 1,
              tick: 0,
            },
          )
          const sLow = stateWith(
            [alien],
            {},
            {
              status: 'wipe_reveal',
              wipeTicksRemaining: ticksLow, // later in reveal (closer to end)
              wipeWaveNumber: 1,
              tick: 0,
            },
          )
          const spriteHigh = buildDrawCommands(sHigh, null).find((c) => c.type === 'sprite') as DrawCommand & {
            type: 'sprite'
          }
          const spriteLow = buildDrawCommands(sLow, null).find((c) => c.type === 'sprite') as DrawCommand & {
            type: 'sprite'
          }
          if (!spriteHigh || !spriteLow) return true
          // Later in reveal (lower ticksRemaining) => alien closer to or at formation (larger y)
          return spriteLow.y >= spriteHigh.y - 0.001
        },
      ),
      { numRuns: 50 },
    )
  })

  it('PBT: at ticksRemaining=0, y equals formation y * CELL_H', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 3, max: 20 }), (row, formationY) => {
        const alien = makeAlien({ id: 'a', y: formationY, row, col: 0 })
        const s = stateWith(
          [alien],
          {},
          {
            status: 'wipe_reveal',
            wipeTicksRemaining: 0,
            wipeWaveNumber: 1,
            tick: 0,
          },
        )
        const sprite = buildDrawCommands(s, null).find((c) => c.type === 'sprite') as DrawCommand & { type: 'sprite' }
        if (!sprite) return true
        return Math.abs(sprite.y - formationY * 16) < 0.001
      }),
      { numRuns: 30 },
    )
  })
})

// ─── #11 HUD colour legend for multi-player games ────────────────────────────

describe('#11 HUD player legend', () => {
  function playerMap(slots: PlayerSlot[], alive: boolean[] = []): Record<string, Player> {
    const players: Record<string, Player> = {}
    slots.forEach((slot, i) => {
      players[`p${slot}`] = makePlayer({
        id: `p${slot}`,
        slot,
        alive: alive[i] ?? true,
        lives: alive[i] === false ? 0 : 3,
      })
    })
    return players
  }

  it('solo (1 player): NO legend rendered', () => {
    const state = stateWith([], playerMap([1]), { status: 'playing', tick: 10 })
    const commands = buildDrawCommands(state, null)
    const badges = commands.filter(
      (c) =>
        'kind' in c &&
        typeof (c as { kind?: string }).kind === 'string' &&
        (c as { kind: string }).kind.startsWith('hud-player-legend'),
    )
    expect(badges).toHaveLength(0)
  })

  it('2 players: legend with exactly 2 badges, coloured per slot', () => {
    const state = stateWith([], playerMap([1, 2]), { status: 'playing', tick: 10 })
    const commands = buildDrawCommands(state, null)
    const badges = commands.filter(
      (c) =>
        'kind' in c &&
        typeof (c as { kind?: string }).kind === 'string' &&
        (c as { kind: string }).kind.startsWith('hud-player-legend'),
    )
    expect(badges.length).toBe(2)

    // Each badge should have a color matching COLORS.player[slot]
    const colors = badges.map((b) => (b as { color?: string }).color)
    expect(colors).toContain(COLORS.player[1])
    expect(colors).toContain(COLORS.player[2])
  })

  it('3 players: 3 badges with correct slot colours', () => {
    const state = stateWith([], playerMap([1, 2, 3]), { status: 'playing', tick: 10 })
    const commands = buildDrawCommands(state, null)
    const badges = commands.filter(
      (c) =>
        'kind' in c &&
        typeof (c as { kind?: string }).kind === 'string' &&
        (c as { kind: string }).kind.startsWith('hud-player-legend'),
    )
    expect(badges.length).toBe(3)
    const colors = new Set(badges.map((b) => (b as { color?: string }).color))
    expect(colors.has(COLORS.player[1])).toBe(true)
    expect(colors.has(COLORS.player[2])).toBe(true)
    expect(colors.has(COLORS.player[3])).toBe(true)
  })

  it('PBT: badge count === 0 for 1 player, N for N>=2 players', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), (n) => {
        const slots = [1, 2, 3, 4].slice(0, n) as PlayerSlot[]
        const state = stateWith([], playerMap(slots), { status: 'playing', tick: 10 })
        const commands = buildDrawCommands(state, null)
        const badges = commands.filter(
          (c) =>
            'kind' in c &&
            typeof (c as { kind?: string }).kind === 'string' &&
            (c as { kind: string }).kind.startsWith('hud-player-legend'),
        )
        const expected = n === 1 ? 0 : n
        return badges.length === expected
      }),
      { numRuns: 30 },
    )
  })
})

// ─── #12 Wave-transition flash text ──────────────────────────────────────────

describe('#12 Wave-transition flash text', () => {
  it('wipe_reveal -> playing transition emits wave-flash-fight', () => {
    const prev = stateWith(
      [],
      {},
      {
        status: 'wipe_reveal',
        wipeTicksRemaining: 0,
        wipeWaveNumber: 1,
        tick: 99,
      },
    )
    const curr = stateWith(
      [],
      {},
      {
        status: 'playing',
        wipeTicksRemaining: null,
        wipeWaveNumber: null,
        tick: 100,
      },
    )

    const cmds = buildDrawCommands(curr, null, prev)
    const flash = findKind(cmds, 'wave-flash-fight')
    expect(flash).toBeDefined()
    expect(flash!.type).toBe('text')
    expect((flash as DrawCommand & { type: 'text' }).text).toMatch(/fight/i)
  })

  it('flash-fight persists several ticks after transition, then disappears', () => {
    const prev = stateWith(
      [],
      {},
      {
        status: 'wipe_reveal',
        wipeTicksRemaining: 0,
        wipeWaveNumber: 1,
        tick: 99,
      },
    )
    const curr = stateWith(
      [],
      {},
      {
        status: 'playing',
        tick: 100,
      },
    )
    // First call: transition detected, flash starts
    let cmds = buildDrawCommands(curr, null, prev)
    expect(findKind(cmds, 'wave-flash-fight')).toBeDefined()

    // Progress through several playing ticks — still visible for ~15 ticks
    let lastState = curr
    for (let t = 101; t <= 105; t++) {
      const next = stateWith([], {}, { status: 'playing', tick: t })
      cmds = buildDrawCommands(next, null, lastState)
      lastState = next
      expect(findKind(cmds, 'wave-flash-fight')).toBeDefined()
    }

    // After expiration window (tick 100 + 15 = 115)
    for (let t = 106; t <= 125; t++) {
      const next = stateWith([], {}, { status: 'playing', tick: t })
      cmds = buildDrawCommands(next, null, lastState)
      lastState = next
    }
    expect(findKind(cmds, 'wave-flash-fight')).toBeUndefined()
  })

  it('playing -> wipe_exit transition emits wave-flash-cleared', () => {
    const prev = stateWith(
      [],
      {},
      {
        status: 'playing',
        tick: 200,
      },
    )
    const curr = stateWith(
      [],
      {},
      {
        status: 'wipe_exit',
        wipeTicksRemaining: 45,
        wipeWaveNumber: 2,
        tick: 201,
      },
    )

    const cmds = buildDrawCommands(curr, null, prev)
    const flash = findKind(cmds, 'wave-flash-cleared')
    expect(flash).toBeDefined()
    expect(flash!.type).toBe('text')
    expect((flash as DrawCommand & { type: 'text' }).text).toMatch(/clear/i)
  })

  it('no flash during steady playing (no transition detected)', () => {
    const prev = stateWith([], {}, { status: 'playing', tick: 500 })
    const curr = stateWith([], {}, { status: 'playing', tick: 501 })
    const cmds = buildDrawCommands(curr, null, prev)
    expect(findKind(cmds, 'wave-flash-fight')).toBeUndefined()
    expect(findKind(cmds, 'wave-flash-cleared')).toBeUndefined()
  })

  it('no fight-flash when building without prevState transition', () => {
    // First frame of a fresh render with no prev — should NOT emit flash.
    const curr = stateWith([], {}, { status: 'playing', tick: 0 })
    const cmds = buildDrawCommands(curr, null)
    expect(findKind(cmds, 'wave-flash-fight')).toBeUndefined()
  })
})

// Silence unused-var lint
void textCmds
void findAllKind

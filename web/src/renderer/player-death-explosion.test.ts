// Tests for bug #2: player death must spawn a slot-coloured explosion.
//
// Before the fix, canvasRenderer.ts detected alien and UFO deaths and spawned
// explosions for them, but silently dropped player deaths. A player being
// shot by an alien just vanished mid-screen — no smoke, no flash, no warning
// that you'd lost a life. Coop players had no feedback when their teammate
// died.
//
// Fix: track `seenDeadPlayerIds` module-side, detect `prev.players[id].alive &&
// !curr.players[id].alive` transitions, and spawn an ExplosionSystem event at
// the player's last position with COLORS.player[slot] tint. Reset path mirrors
// the alien/UFO logic so tick-rewind clears it.

import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { buildDrawCommands, resetEffects, type DrawCommand } from './canvasRenderer'
import { createDefaultGameState } from '../../../shared/state-defaults'
import type { GameState, Player, PlayerSlot } from '../../../shared/types'
import { COLORS } from '../../../client-core/src/sprites/colors'

beforeEach(() => {
  resetEffects()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function stateWith(players: Record<string, Player> = {}, overrides: Partial<GameState> = {}): GameState {
  const state = createDefaultGameState('TEST01')
  state.entities = []
  state.players = players
  state.status = 'playing'
  return { ...state, ...overrides, players, entities: [] }
}

function findExplosionCmds(cmds: DrawCommand[]): DrawCommand[] {
  const explosionKinds = new Set([
    'explosion-flash',
    'explosion-fireball',
    'explosion-shockwave',
    'explosion-debris',
    'explosion-ember',
    'explosion-smoke',
  ])
  return cmds.filter((c) => 'kind' in c && explosionKinds.has((c as { kind?: string }).kind ?? ''))
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('bug #2: player death spawns an explosion at the player position', () => {
  it('alive → dead transition emits at least one explosion command', () => {
    // Phase: player alive at tick T, dead at tick T+1.
    const aliveP = makePlayer({ id: 'p1', slot: 1, x: 50, alive: true })
    const deadP = makePlayer({ id: 'p1', slot: 1, x: 50, alive: false })
    const prev = stateWith({ p1: aliveP }, { tick: 10 })
    const curr = stateWith({ p1: deadP }, { tick: 11 })

    // Prime lastProcessedTick so tickAdvanced is true on the death tick.
    buildDrawCommands(prev, null, null)
    const cmds = buildDrawCommands(curr, null, prev)
    const explosions = findExplosionCmds(cmds)
    // Explosion system emits multiple stages (flash + fireball + shockwave + debris)
    expect(explosions.length).toBeGreaterThan(0)
  })

  it('explosion is tinted with the dying player slot colour', () => {
    // Drive several ticks of explosion to collect the coloured fragments.
    // Slot 2 (orange). Explosion debris/fireball should carry slot hue.
    const aliveP = makePlayer({ id: 'p2', slot: 2, x: 40, alive: true })
    const deadP = makePlayer({ id: 'p2', slot: 2, x: 40, alive: false })
    const prev = stateWith({ p2: aliveP }, { tick: 10 })
    const curr = stateWith({ p2: deadP }, { tick: 11 })
    buildDrawCommands(prev, null, null)
    const cmds = buildDrawCommands(curr, null, prev)

    const explosions = findExplosionCmds(cmds)
    expect(explosions.length).toBeGreaterThan(0)

    // Gather all hex fills from the explosion's rect/radial/circle commands.
    // Look for a fill that matches slot-2 (orange — R > G, G > B).
    const fills: string[] = []
    for (const c of explosions) {
      if (c.type === 'rect') fills.push(c.fill.toLowerCase())
      if (c.type === 'circle') fills.push(c.fill.toLowerCase())
      if (c.type === 'radial') {
        for (const stop of c.stops) fills.push(stop.color.toLowerCase())
      }
    }
    expect(fills.length).toBeGreaterThan(0)
    // Orange: at least one fill has red > blue by a substantial margin
    const orangeFound = fills.some((f) => {
      const h = f.replace('#', '')
      if (h.length !== 6) return false
      const r = Number.parseInt(h.slice(0, 2), 16)
      const b = Number.parseInt(h.slice(4, 6), 16)
      return r > b + 50
    })
    expect(orangeFound).toBe(true)
  })

  it('still-alive player does NOT emit any death explosion', () => {
    const aliveP = makePlayer({ id: 'p1', slot: 1, x: 50, alive: true })
    const prev = stateWith({ p1: aliveP }, { tick: 10 })
    const curr = stateWith({ p1: aliveP }, { tick: 11 })
    buildDrawCommands(prev, null, null)
    const cmds = buildDrawCommands(curr, null, prev)

    // The alive player renders normally — but NO dissolution/explosion fires.
    // Filter to only explosion kinds (not bullet-impact-burst etc).
    const explosions = findExplosionCmds(cmds)
    expect(explosions.length).toBe(0)
  })

  it('PBT: each slot 1-4 produces an explosion whose fills include the slot colour palette', () => {
    fc.assert(
      fc.property(fc.constantFrom<PlayerSlot>(1, 2, 3, 4), (slot) => {
        resetEffects()
        const alive = makePlayer({ id: 'p', slot, x: 40, alive: true })
        const dead = makePlayer({ id: 'p', slot, x: 40, alive: false })
        const prev = stateWith({ p: alive }, { tick: 20 })
        const curr = stateWith({ p: dead }, { tick: 21 })
        buildDrawCommands(prev, null, null)
        const cmds = buildDrawCommands(curr, null, prev)
        const explosions = findExplosionCmds(cmds)
        if (explosions.length === 0) return false

        // Pull slot channel dominance from COLORS.player[slot] and verify
        // at least one explosion fill leans that direction.
        const slotHex = COLORS.player[slot].replace('#', '')
        const sR = Number.parseInt(slotHex.slice(0, 2), 16)
        const sG = Number.parseInt(slotHex.slice(2, 4), 16)
        const sB = Number.parseInt(slotHex.slice(4, 6), 16)

        // Determine dominant channel: which is highest for this slot
        const maxSlot = Math.max(sR, sG, sB)
        const dominantChannel = sR === maxSlot ? 'r' : sG === maxSlot ? 'g' : 'b'

        const fills: string[] = []
        for (const c of explosions) {
          if (c.type === 'rect') fills.push(c.fill)
          if (c.type === 'circle') fills.push(c.fill)
          if (c.type === 'radial') for (const stop of c.stops) fills.push(stop.color)
        }
        // At least one fill should have the dominant channel relatively high.
        const matches = fills.some((f) => {
          const h = f.replace('#', '')
          if (h.length !== 6) return false
          const r = Number.parseInt(h.slice(0, 2), 16)
          const g = Number.parseInt(h.slice(2, 4), 16)
          const b = Number.parseInt(h.slice(4, 6), 16)
          const dom = dominantChannel === 'r' ? r : dominantChannel === 'g' ? g : b
          // Dom channel is among the top two
          const sorted = [r, g, b].sort((a, z) => z - a)
          return dom >= sorted[1]
        })
        return matches
      }),
      { numRuns: 20 },
    )
  })

  it('on tick-rewind (replay), seenDeadPlayerIds clears so a re-death fires a new explosion', () => {
    // Game 1: player dies on tick 20.
    const alive1 = makePlayer({ id: 'p1', slot: 1, x: 50, alive: true })
    const dead1 = makePlayer({ id: 'p1', slot: 1, x: 50, alive: false })
    buildDrawCommands(stateWith({ p1: alive1 }, { tick: 19 }), null, null)
    buildDrawCommands(stateWith({ p1: dead1 }, { tick: 20 }), null, stateWith({ p1: alive1 }, { tick: 19 }))

    // Game 2 starts in-place: tick rewinds to 0 → renderer internally calls resetEffects.
    // Player alive, then dies at tick 1.
    const alive2 = makePlayer({ id: 'p1', slot: 1, x: 50, alive: true })
    const dead2 = makePlayer({ id: 'p1', slot: 1, x: 50, alive: false })
    buildDrawCommands(stateWith({ p1: alive2 }, { tick: 0 }), null, stateWith({ p1: dead1 }, { tick: 20 }))
    const cmds = buildDrawCommands(stateWith({ p1: dead2 }, { tick: 1 }), null, stateWith({ p1: alive2 }, { tick: 0 }))
    const explosions = findExplosionCmds(cmds)
    // If seenDeadPlayerIds didn't clear, the same id 'p1' would be in the set
    // and no explosion would fire. That would be the bug. Assert > 0.
    expect(explosions.length).toBeGreaterThan(0)
  })

  it('dead player that was already dead on the prev tick does NOT double-emit', () => {
    // Player dies on tick 10, stays dead on tick 11. The explosion fires once
    // (at the 10→11 dead-transition observation) — we verify it doesn't refire
    // on 11→12.
    const alive = makePlayer({ id: 'p1', slot: 1, x: 50, alive: true })
    const dead = makePlayer({ id: 'p1', slot: 1, x: 50, alive: false })
    const s9 = stateWith({ p1: alive }, { tick: 9 })
    const s10 = stateWith({ p1: dead }, { tick: 10 })
    const s11 = stateWith({ p1: dead }, { tick: 11 })

    buildDrawCommands(s9, null, null)
    const cmdsDeath = buildDrawCommands(s10, null, s9)
    const explosionsAtDeath = findExplosionCmds(cmdsDeath)
    expect(explosionsAtDeath.length).toBeGreaterThan(0)

    // Next tick, player is still dead. Should not RE-fire the explosion spawn,
    // though the explosion stages from the first spawn may still be visible.
    // The key: the count of NEW explosion spawns should not increase — but
    // we can't easily observe spawn events directly. The simplest invariant:
    // the player's 'p1' id is latched in the seen-set, so firing twice on
    // 10→11 and 11→12 would pile extra stages/cells. Rough assertion: at
    // tick 11, we'd have MORE than double the stages if double-emitting.
    // Use a fresh prev=s10 to make sure the detection re-runs.
    const cmdsStay = buildDrawCommands(s11, null, s10)
    const explosionsStay = findExplosionCmds(cmdsStay)
    // Allow SOME staggered stages, but the count must not be wildly higher
    // than at the death frame (which would indicate re-spawning).
    expect(explosionsStay.length).toBeLessThanOrEqual(explosionsAtDeath.length + 3)
  })
})

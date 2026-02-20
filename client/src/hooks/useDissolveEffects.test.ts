// client/src/hooks/useDissolveEffects.test.ts
// Tests for dissolve effect detection logic.
//
// The hook wraps DissolveSystem (already tested in animation/dissolve.test.ts)
// with event-based and state-diff-based death detection. We test the detection
// logic directly since React hooks can't be unit tested without a renderer.

import { describe, test, expect } from 'bun:test'
import type { GameState, AlienEntity, BarrierEntity, BarrierSegment, Player, Entity, UFOEntity } from '../../../shared/types'
import { LAYOUT, getAliens, getBarriers, getUFOs } from '../../../shared/types'
import type { ServerEvent } from '../../../shared/protocol'
import { DissolveSystem } from '../animation/dissolve'
import { COLORS, SPRITE_SIZE, getPlayerColor } from '../sprites'

// ─── Test Helpers ────────────────────────────────────────────────────────────

function seededRandom(seed = 42): () => number {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function makeAlien(overrides: Partial<AlienEntity> = {}): AlienEntity {
  return {
    kind: 'alien',
    id: 'alien-1',
    x: 30,
    y: 10,
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
    name: 'Test',
    x: 60,
    slot: 1,
    color: 'cyan',
    lastShotTick: 0,
    alive: true,
    lives: 3,
    respawnAtTick: null,
    kills: 0,
    inputState: { left: false, right: false },
    ...overrides,
  }
}

function makeBarrierSegment(overrides: Partial<BarrierSegment> = {}): BarrierSegment {
  return {
    offsetX: 0,
    offsetY: 0,
    health: 4 as 0 | 1 | 2 | 3 | 4,
    ...overrides,
  }
}

function makeBarrier(overrides: Partial<BarrierEntity> = {}): BarrierEntity {
  return {
    kind: 'barrier',
    id: 'barrier-1',
    x: 20,
    segments: [
      makeBarrierSegment({ offsetX: 0, offsetY: 0, health: 4 }),
      makeBarrierSegment({ offsetX: 1, offsetY: 0, health: 4 }),
      makeBarrierSegment({ offsetX: 0, offsetY: 1, health: 4 }),
      makeBarrierSegment({ offsetX: 1, offsetY: 1, health: 4 }),
    ],
    ...overrides,
  }
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    status: 'playing',
    tick: 100,
    mode: 'solo',
    wave: 1,
    score: 0,
    lives: 3,
    entities: [],
    players: {},
    readyPlayerIds: [],
    countdownRemaining: null,
    wipeWaveNumber: null,
    ...overrides,
  } as GameState
}

// ─── Detection Logic ─────────────────────────────────────────────────────────
// These functions mirror the hook's detection logic for testability

function makeUFO(overrides: Partial<UFOEntity> = {}): UFOEntity {
  return {
    kind: 'ufo',
    id: 'ufo-1',
    x: 50,
    y: 1,
    direction: 1,
    alive: true,
    points: 100,
    ...overrides,
  }
}

function detectAlienKill(
  event: ServerEvent,
  prevState: GameState,
  system: DissolveSystem,
): boolean {
  if (event.name !== 'alien_killed') return false
  const data = event.data as { alienId: string; playerId: string | null }
  const aliens = getAliens(prevState.entities)
  const alien = aliens.find(a => a.id === data.alienId)
  // Only dissolve top-row aliens (squid type)
  if (!alien || alien.type !== 'squid') return false
  const color = COLORS.alien[alien.type] ?? '#ffffff'
  return system.spawn(
    alien.x,
    alien.y,
    SPRITE_SIZE.alien.width,
    SPRITE_SIZE.alien.height,
    color,
    'dissolve',
  )
}

function detectUFODeath(
  currentState: GameState,
  prevState: GameState,
  system: DissolveSystem,
): number {
  const prevUfos = getUFOs(prevState.entities)
  const currentUfos = getUFOs(currentState.entities)
  let spawned = 0

  for (const prevUfo of prevUfos) {
    if (!prevUfo.alive) continue
    const currentUfo = currentUfos.find(u => u.id === prevUfo.id)
    if (!currentUfo || !currentUfo.alive) {
      if (system.spawn(
        prevUfo.x,
        prevUfo.y,
        SPRITE_SIZE.ufo.width,
        SPRITE_SIZE.ufo.height,
        '#ff00ff',
        'dissolve',
      )) {
        spawned++
      }
    }
  }

  return spawned
}

function detectPlayerDeath(
  event: ServerEvent,
  prevState: GameState,
  system: DissolveSystem,
): boolean {
  if (event.name !== 'player_died') return false
  const data = event.data as { playerId: string }
  const player = prevState.players[data.playerId]
  if (!player) return false
  const color = getPlayerColor(player.slot)
  const spriteX = player.x - Math.floor(SPRITE_SIZE.player.width / 2)
  return system.spawn(
    spriteX,
    LAYOUT.PLAYER_Y,
    SPRITE_SIZE.player.width,
    SPRITE_SIZE.player.height,
    color,
    'dissolve',
  )
}

function detectBarrierDamage(
  currentState: GameState,
  prevState: GameState,
  system: DissolveSystem,
): number {
  const currentBarriers = getBarriers(currentState.entities)
  const prevBarriers = getBarriers(prevState.entities)
  let spawned = 0

  for (const barrier of currentBarriers) {
    const prevBarrier = prevBarriers.find(b => b.id === barrier.id)
    if (!prevBarrier) continue

    for (let i = 0; i < barrier.segments.length; i++) {
      const curr = barrier.segments[i]
      const prev = prevBarrier.segments[i]
      if (prev && prev.health > curr.health) {
        const segX = barrier.x + curr.offsetX * SPRITE_SIZE.barrier.width
        const segY = LAYOUT.BARRIER_Y + curr.offsetY * SPRITE_SIZE.barrier.height
        const color = COLORS.barrier[prev.health as 1 | 2 | 3 | 4] ?? '#ffff00'
        if (system.spawn(segX, segY, SPRITE_SIZE.barrier.width, SPRITE_SIZE.barrier.height, color, 'shimmer')) {
          spawned++
        }
      }
    }
  }

  return spawned
}

// ─── Alien Kill Detection ────────────────────────────────────────────────────

describe('alien kill detection', () => {
  test('spawns dissolve for squid (top-row) alien kills', () => {
    const system = new DissolveSystem({}, seededRandom())
    const alien = makeAlien({ id: 'a1', x: 30, y: 10, type: 'squid' })
    const prevState = makeGameState({
      entities: [alien] as Entity[],
    })
    const event: ServerEvent = {
      type: 'event',
      name: 'alien_killed',
      data: { alienId: 'a1', playerId: 'p1' },
    }

    const result = detectAlienKill(event, prevState, system)
    expect(result).toBe(true)
    expect(system.getActiveCount()).toBe(1)

    system.update()
    const cells = system.getCells()
    expect(cells.length).toBeGreaterThan(0)
    for (const cell of cells) {
      expect(cell.x).toBeGreaterThanOrEqual(25)
      expect(cell.x).toBeLessThanOrEqual(40)
      expect(cell.color).toBe(COLORS.alien.squid)
    }
  })

  test('ignores crab (middle-row) alien kills', () => {
    const system = new DissolveSystem({}, seededRandom())
    const alien = makeAlien({ id: 'a1', type: 'crab', row: 1 })
    const prevState = makeGameState({ entities: [alien] as Entity[] })
    const event: ServerEvent = {
      type: 'event',
      name: 'alien_killed',
      data: { alienId: 'a1', playerId: 'p1' },
    }

    const result = detectAlienKill(event, prevState, system)
    expect(result).toBe(false)
    expect(system.getActiveCount()).toBe(0)
  })

  test('ignores octopus (bottom-row) alien kills', () => {
    const system = new DissolveSystem({}, seededRandom())
    const alien = makeAlien({ id: 'a1', type: 'octopus', row: 3 })
    const prevState = makeGameState({ entities: [alien] as Entity[] })
    const event: ServerEvent = {
      type: 'event',
      name: 'alien_killed',
      data: { alienId: 'a1', playerId: 'p1' },
    }

    const result = detectAlienKill(event, prevState, system)
    expect(result).toBe(false)
    expect(system.getActiveCount()).toBe(0)
  })

  test('ignores event when alien not found in prevState', () => {
    const system = new DissolveSystem({}, seededRandom())
    const prevState = makeGameState({ entities: [] })
    const event: ServerEvent = {
      type: 'event',
      name: 'alien_killed',
      data: { alienId: 'nonexistent', playerId: 'p1' },
    }

    const result = detectAlienKill(event, prevState, system)
    expect(result).toBe(false)
    expect(system.getActiveCount()).toBe(0)
  })

  test('ignores non-alien_killed events', () => {
    const system = new DissolveSystem({}, seededRandom())
    const prevState = makeGameState()
    const event: ServerEvent = {
      type: 'event',
      name: 'game_start',
      data: undefined,
    }

    const result = detectAlienKill(event, prevState, system)
    expect(result).toBe(false)
  })
})

// ─── UFO Death Detection ─────────────────────────────────────────────────────

describe('UFO death detection', () => {
  test('spawns dissolve when UFO disappears from state', () => {
    const system = new DissolveSystem({}, seededRandom())
    const ufo = makeUFO({ id: 'u1', x: 50, y: 1, alive: true })
    const prevState = makeGameState({ entities: [ufo] as Entity[] })
    const currState = makeGameState({ entities: [] }) // UFO gone

    const spawned = detectUFODeath(currState, prevState, system)
    expect(spawned).toBe(1)
    expect(system.getActiveCount()).toBe(1)

    system.update()
    const cells = system.getCells()
    expect(cells.length).toBeGreaterThan(0)
    for (const cell of cells) {
      expect(cell.color).toBe('#ff00ff')
    }
  })

  test('spawns dissolve when UFO becomes not alive', () => {
    const system = new DissolveSystem({}, seededRandom())
    const prevUfo = makeUFO({ id: 'u1', alive: true })
    const currUfo = makeUFO({ id: 'u1', alive: false })
    const prevState = makeGameState({ entities: [prevUfo] as Entity[] })
    const currState = makeGameState({ entities: [currUfo] as Entity[] })

    const spawned = detectUFODeath(currState, prevState, system)
    expect(spawned).toBe(1)
  })

  test('does not spawn when UFO stays alive', () => {
    const system = new DissolveSystem({}, seededRandom())
    const ufo = makeUFO({ id: 'u1', alive: true })
    const prevState = makeGameState({ entities: [ufo] as Entity[] })
    const currState = makeGameState({ entities: [ufo] as Entity[] })

    const spawned = detectUFODeath(currState, prevState, system)
    expect(spawned).toBe(0)
  })

  test('ignores already-dead UFOs in prevState', () => {
    const system = new DissolveSystem({}, seededRandom())
    const ufo = makeUFO({ id: 'u1', alive: false })
    const prevState = makeGameState({ entities: [ufo] as Entity[] })
    const currState = makeGameState({ entities: [] })

    const spawned = detectUFODeath(currState, prevState, system)
    expect(spawned).toBe(0)
  })

  test('spawns at UFO last known position', () => {
    const system = new DissolveSystem({}, seededRandom())
    const ufo = makeUFO({ id: 'u1', x: 80, y: 1, alive: true })
    const prevState = makeGameState({ entities: [ufo] as Entity[] })
    const currState = makeGameState({ entities: [] })

    detectUFODeath(currState, prevState, system)
    system.update()
    const cells = system.getCells()
    for (const cell of cells) {
      expect(cell.x).toBeGreaterThanOrEqual(75)
      expect(cell.x).toBeLessThanOrEqual(90)
    }
  })
})

// ─── Player Death Detection ──────────────────────────────────────────────────

describe('player death detection', () => {
  test('spawns dissolve at player position on player_died event', () => {
    const system = new DissolveSystem({}, seededRandom())
    const player = makePlayer({ id: 'p1', x: 60, slot: 1 })
    const prevState = makeGameState({
      players: { p1: player },
    })
    const event: ServerEvent = {
      type: 'event',
      name: 'player_died',
      data: { playerId: 'p1' },
    }

    const result = detectPlayerDeath(event, prevState, system)
    expect(result).toBe(true)
    expect(system.getActiveCount()).toBe(1)

    system.update()
    const cells = system.getCells()
    expect(cells.length).toBeGreaterThan(0)
    // Player x=60, sprite left edge = 60 - 2 = 58
    for (const cell of cells) {
      expect(cell.color).toBe(getPlayerColor(1))
    }
  })

  test('uses correct player slot color', () => {
    const system = new DissolveSystem({}, seededRandom())
    const player = makePlayer({ id: 'p2', slot: 3 })
    const prevState = makeGameState({
      players: { p2: player },
    })
    const event: ServerEvent = {
      type: 'event',
      name: 'player_died',
      data: { playerId: 'p2' },
    }

    detectPlayerDeath(event, prevState, system)
    system.update()
    const cells = system.getCells()
    for (const cell of cells) {
      expect(cell.color).toBe(getPlayerColor(3))
    }
  })

  test('spawns at PLAYER_Y position', () => {
    const system = new DissolveSystem({}, seededRandom())
    const player = makePlayer({ id: 'p1', x: 60 })
    const prevState = makeGameState({
      players: { p1: player },
    })
    const event: ServerEvent = {
      type: 'event',
      name: 'player_died',
      data: { playerId: 'p1' },
    }

    detectPlayerDeath(event, prevState, system)
    system.update()
    const cells = system.getCells()
    // Cells should be near PLAYER_Y (31)
    for (const cell of cells) {
      expect(cell.y).toBeGreaterThanOrEqual(LAYOUT.PLAYER_Y - 3)
      expect(cell.y).toBeLessThanOrEqual(LAYOUT.PLAYER_Y + 3)
    }
  })

  test('ignores event when player not found in prevState', () => {
    const system = new DissolveSystem({}, seededRandom())
    const prevState = makeGameState({ players: {} })
    const event: ServerEvent = {
      type: 'event',
      name: 'player_died',
      data: { playerId: 'nonexistent' },
    }

    const result = detectPlayerDeath(event, prevState, system)
    expect(result).toBe(false)
    expect(system.getActiveCount()).toBe(0)
  })
})

// ─── Barrier Damage Detection ────────────────────────────────────────────────

describe('barrier damage detection', () => {
  test('spawns shimmer when segment health decreases', () => {
    const system = new DissolveSystem({}, seededRandom())
    const prevBarrier = makeBarrier({
      segments: [
        makeBarrierSegment({ offsetX: 0, offsetY: 0, health: 4 }),
        makeBarrierSegment({ offsetX: 1, offsetY: 0, health: 4 }),
      ],
    })
    const currBarrier = makeBarrier({
      segments: [
        makeBarrierSegment({ offsetX: 0, offsetY: 0, health: 3 }),  // Damaged!
        makeBarrierSegment({ offsetX: 1, offsetY: 0, health: 4 }),
      ],
    })

    const prevState = makeGameState({ entities: [prevBarrier] as Entity[] })
    const currState = makeGameState({ entities: [currBarrier] as Entity[] })

    const spawned = detectBarrierDamage(currState, prevState, system)
    expect(spawned).toBe(1)
    expect(system.getActiveCount()).toBe(1)
  })

  test('spawns shimmer at correct segment position', () => {
    const system = new DissolveSystem({}, seededRandom())
    const prevBarrier = makeBarrier({
      x: 40,
      segments: [
        makeBarrierSegment({ offsetX: 1, offsetY: 1, health: 4 }),
      ],
    })
    const currBarrier = makeBarrier({
      x: 40,
      segments: [
        makeBarrierSegment({ offsetX: 1, offsetY: 1, health: 2 }),
      ],
    })

    const prevState = makeGameState({ entities: [prevBarrier] as Entity[] })
    const currState = makeGameState({ entities: [currBarrier] as Entity[] })

    detectBarrierDamage(currState, prevState, system)
    system.update()
    const cells = system.getCells()
    // Segment at offsetX=1, offsetY=1, barrier.x=40
    // Expected: x = 40 + 1*2 = 42, y = BARRIER_Y + 1*2
    expect(cells.length).toBeGreaterThan(0)
    for (const cell of cells) {
      expect(cell.x).toBeGreaterThanOrEqual(40)
      expect(cell.x).toBeLessThanOrEqual(46)
    }
  })

  test('detects health decrease from 4 to 2 (multi-point damage)', () => {
    const system = new DissolveSystem({}, seededRandom())
    const prevBarrier = makeBarrier({
      segments: [makeBarrierSegment({ health: 4 })],
    })
    const currBarrier = makeBarrier({
      segments: [makeBarrierSegment({ health: 2 })],
    })

    const prevState = makeGameState({ entities: [prevBarrier] as Entity[] })
    const currState = makeGameState({ entities: [currBarrier] as Entity[] })

    const spawned = detectBarrierDamage(currState, prevState, system)
    expect(spawned).toBe(1)
  })

  test('detects health decrease to 0 (destruction)', () => {
    const system = new DissolveSystem({}, seededRandom())
    const prevBarrier = makeBarrier({
      segments: [makeBarrierSegment({ health: 1 })],
    })
    const currBarrier = makeBarrier({
      segments: [makeBarrierSegment({ health: 0 })],
    })

    const prevState = makeGameState({ entities: [prevBarrier] as Entity[] })
    const currState = makeGameState({ entities: [currBarrier] as Entity[] })

    const spawned = detectBarrierDamage(currState, prevState, system)
    expect(spawned).toBe(1)
  })

  test('uses color of previous health level', () => {
    const system = new DissolveSystem({}, seededRandom())
    const prevBarrier = makeBarrier({
      segments: [makeBarrierSegment({ health: 3 })],
    })
    const currBarrier = makeBarrier({
      segments: [makeBarrierSegment({ health: 2 })],
    })

    const prevState = makeGameState({ entities: [prevBarrier] as Entity[] })
    const currState = makeGameState({ entities: [currBarrier] as Entity[] })

    detectBarrierDamage(currState, prevState, system)
    system.update()
    const cells = system.getCells()
    for (const cell of cells) {
      expect(cell.color).toBe(COLORS.barrier[3])
    }
  })

  test('does not spawn when health stays the same', () => {
    const system = new DissolveSystem({}, seededRandom())
    const barrier = makeBarrier({
      segments: [makeBarrierSegment({ health: 4 })],
    })

    const prevState = makeGameState({ entities: [barrier] as Entity[] })
    const currState = makeGameState({ entities: [barrier] as Entity[] })

    const spawned = detectBarrierDamage(currState, prevState, system)
    expect(spawned).toBe(0)
    expect(system.getActiveCount()).toBe(0)
  })

  test('handles multiple segments damaged simultaneously', () => {
    const system = new DissolveSystem({}, seededRandom())
    const prevBarrier = makeBarrier({
      segments: [
        makeBarrierSegment({ offsetX: 0, offsetY: 0, health: 4 }),
        makeBarrierSegment({ offsetX: 1, offsetY: 0, health: 4 }),
        makeBarrierSegment({ offsetX: 0, offsetY: 1, health: 3 }),
      ],
    })
    const currBarrier = makeBarrier({
      segments: [
        makeBarrierSegment({ offsetX: 0, offsetY: 0, health: 3 }),
        makeBarrierSegment({ offsetX: 1, offsetY: 0, health: 2 }),
        makeBarrierSegment({ offsetX: 0, offsetY: 1, health: 3 }),  // Unchanged
      ],
    })

    const prevState = makeGameState({ entities: [prevBarrier] as Entity[] })
    const currState = makeGameState({ entities: [currBarrier] as Entity[] })

    const spawned = detectBarrierDamage(currState, prevState, system)
    expect(spawned).toBe(2) // Two segments damaged
    expect(system.getActiveCount()).toBe(2)
  })

  test('handles barrier not found in prevState', () => {
    const system = new DissolveSystem({}, seededRandom())
    const currBarrier = makeBarrier({ id: 'new-barrier' })

    const prevState = makeGameState({ entities: [] })
    const currState = makeGameState({ entities: [currBarrier] as Entity[] })

    const spawned = detectBarrierDamage(currState, prevState, system)
    expect(spawned).toBe(0)
  })
})

// ─── Combined Scenarios ──────────────────────────────────────────────────────

describe('combined scenarios', () => {
  test('multiple deaths produce multiple effects', () => {
    const system = new DissolveSystem({}, seededRandom())

    // Alien kill
    const alien = makeAlien({ id: 'a1', x: 30, y: 10 })
    const prevState = makeGameState({
      entities: [alien] as Entity[],
      players: { p1: makePlayer({ id: 'p1' }) },
    })

    const alienEvent: ServerEvent = {
      type: 'event',
      name: 'alien_killed',
      data: { alienId: 'a1', playerId: 'p1' },
    }
    detectAlienKill(alienEvent, prevState, system)

    // Player death
    const playerEvent: ServerEvent = {
      type: 'event',
      name: 'player_died',
      data: { playerId: 'p1' },
    }
    detectPlayerDeath(playerEvent, prevState, system)

    expect(system.getActiveCount()).toBe(2)
  })

  test('empty prevState produces no effects', () => {
    const system = new DissolveSystem({}, seededRandom())
    const emptyState = makeGameState()

    const event: ServerEvent = {
      type: 'event',
      name: 'alien_killed',
      data: { alienId: 'a1', playerId: 'p1' },
    }

    const result = detectAlienKill(event, emptyState, system)
    expect(result).toBe(false)
    expect(system.getActiveCount()).toBe(0)
  })
})

// ─── Animation Loop Optimization ────────────────────────────────────────────
// These tests verify the optimization conditions used by useDissolveEffects:
// - ISSUE 1: Skip setCells when both old and new cells are empty arrays
// - ISSUE 2: Early-out when no active effects and cells already empty

describe('animation loop optimization', () => {
  test('getCells returns same reference when no effects active (skip setCells)', () => {
    // This validates ISSUE 1: the hook should compare old and new cells
    // and skip setCells when both are the shared empty array
    const system = new DissolveSystem({}, seededRandom())

    const cells1 = system.getCells()
    system.update()
    const cells2 = system.getCells()

    // Both should be the same shared EMPTY_CELLS constant
    expect(cells1).toBe(cells2)
    expect(cells1).toHaveLength(0)
  })

  test('getActiveCount is zero when idle — can skip update cycle entirely', () => {
    // This validates ISSUE 2: the hook should check getActiveCount()
    // before calling getCells() to avoid unnecessary work
    const system = new DissolveSystem({}, seededRandom())

    // No effects spawned — should be zero
    expect(system.getActiveCount()).toBe(0)

    // After update with no effects, still zero
    system.update()
    expect(system.getActiveCount()).toBe(0)
    expect(system.getCells()).toHaveLength(0)
  })

  test('transitions from active to idle return shared empty array', () => {
    const system = new DissolveSystem({ dissolveLifetime: 2 }, seededRandom())

    // Spawn and get cells while active
    system.spawn(50, 20, 5, 2, '#ff0000', 'dissolve')
    system.update()
    const activeCells = system.getCells()
    expect(activeCells.length).toBeGreaterThan(0)

    // Expire
    system.update()
    expect(system.getActiveCount()).toBe(0)

    // Now getCells should return the shared empty constant
    const idleCells = system.getCells()
    expect(idleCells).toHaveLength(0)

    // And it should be stable across calls
    const idleCells2 = system.getCells()
    expect(idleCells).toBe(idleCells2)
  })
})

// shared/types.test.ts
// Unit tests for shared utility functions

import { describe, test, expect } from 'bun:test'
import fc from 'fast-check'
import {
  LAYOUT,
  STANDARD_WIDTH,
  ALIEN_REGISTRY,
  constrainPlayerX,
  applyPlayerInput,
  getAliens,
  getBullets,
  getBarriers,
  getUFOs,
  seededRandom,
  createBarrierSegments,
  createAlienFormation,
  type Entity,
  type AlienEntity,
  type BulletEntity,
  type BarrierEntity,
  type UFOEntity,
} from './types'
import { createDefaultGameState } from './state-defaults'

// ─── constrainPlayerX Tests ──────────────────────────────────────────────────

describe('constrainPlayerX', () => {
  test('moves left by speed amount', () => {
    const result = constrainPlayerX(50, 'left', 2)
    expect(result).toBe(48)
  })

  test('moves right by speed amount', () => {
    const result = constrainPlayerX(50, 'right', 2)
    expect(result).toBe(52)
  })

  test('constrains to minimum X when moving left', () => {
    const result = constrainPlayerX(LAYOUT.PLAYER_MIN_X + 1, 'left', 5)
    expect(result).toBe(LAYOUT.PLAYER_MIN_X)
  })

  test('constrains to maximum X when moving right', () => {
    const result = constrainPlayerX(LAYOUT.PLAYER_MAX_X - 1, 'right', 5)
    expect(result).toBe(LAYOUT.PLAYER_MAX_X)
  })

  test('does not go below minimum', () => {
    const result = constrainPlayerX(LAYOUT.PLAYER_MIN_X, 'left', 10)
    expect(result).toBe(LAYOUT.PLAYER_MIN_X)
  })

  test('does not go above maximum', () => {
    const result = constrainPlayerX(LAYOUT.PLAYER_MAX_X, 'right', 10)
    expect(result).toBe(LAYOUT.PLAYER_MAX_X)
  })

  test('handles zero speed', () => {
    const result = constrainPlayerX(50, 'left', 0)
    expect(result).toBe(50)
  })

  test('handles fractional positions', () => {
    const result = constrainPlayerX(50.5, 'left', 1)
    expect(result).toBe(49.5)
  })
})

// ─── applyPlayerInput Tests ──────────────────────────────────────────────────

describe('applyPlayerInput', () => {
  test('moves left when left is held', () => {
    const result = applyPlayerInput(50, { left: true, right: false }, 1)
    expect(result).toBe(49)
  })

  test('moves right when right is held', () => {
    const result = applyPlayerInput(50, { left: false, right: true }, 1)
    expect(result).toBe(51)
  })

  test('does not move when no keys held', () => {
    const result = applyPlayerInput(50, { left: false, right: false }, 1)
    expect(result).toBe(50)
  })

  test('moves left when both keys held (left takes priority in order)', () => {
    // When both are held, left is applied first, then right
    // So 50 - 1 = 49, then 49 + 1 = 50 (net zero movement)
    const result = applyPlayerInput(50, { left: true, right: true }, 1)
    expect(result).toBe(50)
  })

  test('constrains to boundaries when moving left', () => {
    const result = applyPlayerInput(LAYOUT.PLAYER_MIN_X, { left: true, right: false }, 5)
    expect(result).toBe(LAYOUT.PLAYER_MIN_X)
  })

  test('constrains to boundaries when moving right', () => {
    const result = applyPlayerInput(LAYOUT.PLAYER_MAX_X, { left: false, right: true }, 5)
    expect(result).toBe(LAYOUT.PLAYER_MAX_X)
  })

  test('uses correct speed', () => {
    const result = applyPlayerInput(50, { left: true, right: false }, 3)
    expect(result).toBe(47)
  })
})

// ─── Entity Filter Helpers Tests ─────────────────────────────────────────────

describe('Entity Filter Helpers', () => {
  const createAlien = (id: string): AlienEntity => ({
    kind: 'alien',
    id,
    x: 0,
    y: 0,
    type: 'squid',
    alive: true,
    row: 0,
    col: 0,
    points: 30,
    entering: false,
  })

  const createBullet = (id: string): BulletEntity => ({
    kind: 'bullet',
    id,
    x: 0,
    y: 0,
    ownerId: 'player1',
    dy: -1,
  })

  const createBarrier = (id: string): BarrierEntity => ({
    kind: 'barrier',
    id,
    x: 0,
    segments: [],
  })

  const createUFO = (id: string): UFOEntity => ({
    kind: 'ufo',
    id,
    x: 0,
    y: 1,
    direction: 1,
    alive: true,
    points: 100,
  })

  describe('getAliens', () => {
    test('returns only alien entities', () => {
      const entities: Entity[] = [
        createAlien('a1'),
        createBullet('b1'),
        createAlien('a2'),
        createBarrier('bar1'),
      ]
      const aliens = getAliens(entities)
      expect(aliens.length).toBe(2)
      expect(aliens[0].id).toBe('a1')
      expect(aliens[1].id).toBe('a2')
    })

    test('returns empty array when no aliens', () => {
      const entities: Entity[] = [createBullet('b1'), createBarrier('bar1')]
      const aliens = getAliens(entities)
      expect(aliens.length).toBe(0)
    })
  })

  describe('getBullets', () => {
    test('returns only bullet entities', () => {
      const entities: Entity[] = [
        createAlien('a1'),
        createBullet('b1'),
        createBullet('b2'),
      ]
      const bullets = getBullets(entities)
      expect(bullets.length).toBe(2)
      expect(bullets[0].id).toBe('b1')
      expect(bullets[1].id).toBe('b2')
    })

    test('returns empty array when no bullets', () => {
      const entities: Entity[] = [createAlien('a1')]
      const bullets = getBullets(entities)
      expect(bullets.length).toBe(0)
    })
  })

  describe('getBarriers', () => {
    test('returns only barrier entities', () => {
      const entities: Entity[] = [
        createBarrier('bar1'),
        createAlien('a1'),
        createBarrier('bar2'),
      ]
      const barriers = getBarriers(entities)
      expect(barriers.length).toBe(2)
      expect(barriers[0].id).toBe('bar1')
      expect(barriers[1].id).toBe('bar2')
    })

    test('returns empty array when no barriers', () => {
      const entities: Entity[] = [createAlien('a1')]
      const barriers = getBarriers(entities)
      expect(barriers.length).toBe(0)
    })
  })

  describe('getUFOs', () => {
    test('returns only UFO entities', () => {
      const entities: Entity[] = [
        createUFO('u1'),
        createAlien('a1'),
        createUFO('u2'),
      ]
      const ufos = getUFOs(entities)
      expect(ufos.length).toBe(2)
      expect(ufos[0].id).toBe('u1')
      expect(ufos[1].id).toBe('u2')
    })

    test('returns empty array when no UFOs', () => {
      const entities: Entity[] = [createAlien('a1')]
      const ufos = getUFOs(entities)
      expect(ufos.length).toBe(0)
    })
  })
})

// ─── LAYOUT Constants Validation ─────────────────────────────────────────────

describe('LAYOUT Constants', () => {
  test('PLAYER_MIN_X is less than PLAYER_MAX_X', () => {
    expect(LAYOUT.PLAYER_MIN_X).toBeLessThan(LAYOUT.PLAYER_MAX_X)
  })

  test('COLLISION_H is positive', () => {
    expect(LAYOUT.COLLISION_H).toBeGreaterThan(0)
  })

  test('COLLISION_V is positive', () => {
    expect(LAYOUT.COLLISION_V).toBeGreaterThan(0)
  })

  test('player movement range is reasonable', () => {
    const range = LAYOUT.PLAYER_MAX_X - LAYOUT.PLAYER_MIN_X
    expect(range).toBeGreaterThan(50) // Should have decent movement range
  })
})

// ─── seededRandom Property-Based Tests ──────────────────────────────────────

describe('seededRandom', () => {
  test('always returns a value in [0, 1) for any seed', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const state = createDefaultGameState('test')
        state.rngSeed = seed

        const value = seededRandom(state)

        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThan(1)
        expect(typeof value).toBe('number')
      })
    )
  })

  test('same seed always produces the same sequence of N values', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 50 }), (seed, n) => {
        const state1 = createDefaultGameState('test1')
        const state2 = createDefaultGameState('test2')
        state1.rngSeed = seed
        state2.rngSeed = seed

        const seq1: number[] = []
        const seq2: number[] = []
        for (let i = 0; i < n; i++) {
          seq1.push(seededRandom(state1))
          seq2.push(seededRandom(state2))
        }

        expect(seq1).toEqual(seq2)
        expect(seq1.length).toBe(n)
        expect(state1.rngSeed).toBe(state2.rngSeed)
      })
    )
  })

  test('mutates state.rngSeed after each call', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const state = createDefaultGameState('test')
        state.rngSeed = seed

        const seedBefore = state.rngSeed
        seededRandom(state)
        const seedAfterFirst = state.rngSeed

        expect(seedAfterFirst).not.toBe(seedBefore)

        seededRandom(state)
        const seedAfterSecond = state.rngSeed

        expect(seedAfterSecond).not.toBe(seedAfterFirst)
        expect(seedAfterSecond).not.toBe(seedBefore)
      })
    )
  })

  test('calling N times produces at least 2 distinct values', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const state = createDefaultGameState('test')
        state.rngSeed = seed

        const values: number[] = []
        for (let i = 0; i < 10; i++) {
          values.push(seededRandom(state))
        }

        const distinct = new Set(values)
        expect(distinct.size).toBeGreaterThanOrEqual(2)
        expect(values.length).toBe(10)
        // All values should still be in range
        for (const v of values) {
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThan(1)
        }
      })
    )
  })

  test('distribution is roughly fair across [0, 0.5) and [0.5, 1) over 1000 calls', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const state = createDefaultGameState('test')
        state.rngSeed = seed

        let below = 0
        let above = 0
        const n = 1000

        for (let i = 0; i < n; i++) {
          const value = seededRandom(state)
          if (value < 0.5) {
            below++
          } else {
            above++
          }
        }

        // Expect at least 30% in each half (very generous bounds)
        expect(below).toBeGreaterThan(n * 0.3)
        expect(above).toBeGreaterThan(n * 0.3)
        expect(below + above).toBe(n)
      })
    )
  })
})

// ─── createBarrierSegments Tests ────────────────────────────────────────────

describe('createBarrierSegments', () => {
  test('returns exactly 9 segments (5 top + 4 bottom, gap at center)', () => {
    const segments = createBarrierSegments()
    expect(segments.length).toBe(9)
    const topRow = segments.filter(s => s.offsetY === 0)
    const bottomRow = segments.filter(s => s.offsetY === 1)
    expect(topRow.length).toBe(5)
    expect(bottomRow.length).toBe(4)
  })

  test('all segments start with health = 4', () => {
    const segments = createBarrierSegments()
    expect(segments.length).toBeGreaterThan(0)
    for (const seg of segments) {
      expect(seg.health).toBe(4)
    }
    expect(segments.every(s => s.health === 4)).toBe(true)
  })

  test('no segment has the center-bottom position (offsetX=2, offsetY=1)', () => {
    const segments = createBarrierSegments()
    const centerBottom = segments.filter(s => s.offsetX === 2 && s.offsetY === 1)
    expect(centerBottom.length).toBe(0)
    // Verify center-top IS present (positive check)
    const centerTop = segments.filter(s => s.offsetX === 2 && s.offsetY === 0)
    expect(centerTop.length).toBe(1)
    expect(centerTop[0].health).toBe(4)
  })

  test('segments cover expected positions (check offsetX/offsetY values)', () => {
    const segments = createBarrierSegments()
    const positions = segments.map(s => `${s.offsetX},${s.offsetY}`)
    // Top row: all 5 columns
    expect(positions).toContain('0,0')
    expect(positions).toContain('1,0')
    expect(positions).toContain('2,0')
    expect(positions).toContain('3,0')
    expect(positions).toContain('4,0')
    // Bottom row: columns 0,1,3,4 (not 2)
    expect(positions).toContain('0,1')
    expect(positions).toContain('1,1')
    expect(positions).toContain('3,1')
    expect(positions).toContain('4,1')
    // Gap
    expect(positions).not.toContain('2,1')
  })

  test('calling twice returns independent arrays (no shared references)', () => {
    const a = createBarrierSegments()
    const b = createBarrierSegments()
    expect(a.length).toBe(b.length)
    // Mutate first array and verify second is unaffected
    a[0].health = 0 as any
    expect(b[0].health).toBe(4)
    // Also verify they are different array references
    expect(a).not.toBe(b)
  })
})

// ─── createAlienFormation Tests ─────────────────────────────────────────────

describe('createAlienFormation', () => {
  test('returns cols * rows aliens for standard configs', () => {
    const f11x5 = createAlienFormation(11, 5)
    expect(f11x5.length).toBe(55)

    const f13x5 = createAlienFormation(13, 5)
    expect(f13x5.length).toBe(65)

    const f13x6 = createAlienFormation(13, 6)
    expect(f13x6.length).toBe(78)
  })

  test('all aliens are alive and not entering', () => {
    const aliens = createAlienFormation(11, 5)
    expect(aliens.length).toBeGreaterThan(0)
    for (const alien of aliens) {
      expect(alien.alive).toBe(true)
      expect(alien.entering).toBe(false)
    }
    expect(aliens.every(a => a.alive && !a.entering)).toBe(true)
  })

  test('alien types follow FORMATION_ROWS pattern (row 0=squid, 1-2=crab, 3-4=octopus, beyond=octopus)', () => {
    const aliens = createAlienFormation(11, 6)
    const row0 = aliens.filter(a => a.row === 0)
    const row1 = aliens.filter(a => a.row === 1)
    const row2 = aliens.filter(a => a.row === 2)
    const row3 = aliens.filter(a => a.row === 3)
    const row4 = aliens.filter(a => a.row === 4)
    const row5 = aliens.filter(a => a.row === 5)

    expect(row0.every(a => a.type === 'squid')).toBe(true)
    expect(row1.every(a => a.type === 'crab')).toBe(true)
    expect(row2.every(a => a.type === 'crab')).toBe(true)
    expect(row3.every(a => a.type === 'octopus')).toBe(true)
    expect(row4.every(a => a.type === 'octopus')).toBe(true)
    // Row beyond FORMATION_ROWS defaults to octopus
    expect(row5.every(a => a.type === 'octopus')).toBe(true)
    expect(row5.length).toBe(11)
  })

  test('points match ALIEN_REGISTRY for each type', () => {
    const aliens = createAlienFormation(11, 5)
    const squids = aliens.filter(a => a.type === 'squid')
    const crabs = aliens.filter(a => a.type === 'crab')
    const octopi = aliens.filter(a => a.type === 'octopus')

    expect(squids.every(a => a.points === ALIEN_REGISTRY.squid.points)).toBe(true)
    expect(crabs.every(a => a.points === ALIEN_REGISTRY.crab.points)).toBe(true)
    expect(octopi.every(a => a.points === ALIEN_REGISTRY.octopus.points)).toBe(true)
    // Verify exact values too
    expect(squids[0].points).toBe(30)
    expect(crabs[0].points).toBe(20)
    expect(octopi[0].points).toBe(10)
  })

  test('formation is horizontally centered on screen (symmetric around screenWidth/2)', () => {
    const aliens = createAlienFormation(11, 5, STANDARD_WIDTH)
    const xs = aliens.map(a => a.x)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    // The rightmost alien's right edge
    const rightEdge = maxX + LAYOUT.ALIEN_WIDTH
    const leftGap = minX
    const rightGap = STANDARD_WIDTH - rightEdge
    // Centering uses Math.floor, so left gap and right gap differ by at most 1
    expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(1)
    // Formation should be roughly in the middle
    expect(leftGap).toBeGreaterThan(0)
    expect(rightGap).toBeGreaterThan(0)
  })

  test('all IDs are unique', () => {
    const aliens = createAlienFormation(11, 5)
    const ids = aliens.map(a => a.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
    expect(uniqueIds.size).toBe(55)
    // Verify default ID format
    expect(ids[0]).toBe('alien-0')
  })

  test('custom idGenerator works', () => {
    let counter = 100
    const aliens = createAlienFormation(3, 2, STANDARD_WIDTH, () => `custom-${counter++}`)
    expect(aliens.length).toBe(6)
    expect(aliens[0].id).toBe('custom-100')
    expect(aliens[5].id).toBe('custom-105')
    // Verify all IDs use the custom prefix
    expect(aliens.every(a => a.id.startsWith('custom-'))).toBe(true)
  })

  test('property: for any valid cols/rows, all aliens have x >= 0 and fit within screen width', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 15 }),
        fc.integer({ min: 1, max: 10 }),
        (cols, rows) => {
          // Screen must be wide enough to contain the grid:
          // gridWidth = (cols - 1) * 9 + 7
          const gridWidth = (cols - 1) * LAYOUT.ALIEN_COL_SPACING + LAYOUT.ALIEN_WIDTH
          const screenWidth = gridWidth + 20 // 10px margin each side
          const aliens = createAlienFormation(cols, rows, screenWidth)
          expect(aliens.length).toBe(cols * rows)
          for (const alien of aliens) {
            expect(alien.x).toBeGreaterThanOrEqual(0)
            expect(alien.x + LAYOUT.ALIEN_WIDTH).toBeLessThanOrEqual(screenWidth)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── constrainPlayerX Property-Based Tests ──────────────────────────────────

describe('constrainPlayerX properties', () => {
  const posArb = fc.integer({ min: -10, max: 130 })
  const speedArb = fc.integer({ min: 0, max: 20 })
  const dirArb = fc.constantFrom('left' as const, 'right' as const)

  test('bounded output: result is always in [PLAYER_MIN_X, PLAYER_MAX_X] for any input position and speed >= 0', () => {
    fc.assert(
      fc.property(posArb, dirArb, speedArb, (x, dir, speed) => {
        const result = constrainPlayerX(x, dir, speed)
        // Moving left clamps to PLAYER_MIN_X; moving right clamps to PLAYER_MAX_X
        if (dir === 'left') {
          expect(result).toBeGreaterThanOrEqual(LAYOUT.PLAYER_MIN_X)
          expect(result).toBeLessThanOrEqual(Math.max(x, LAYOUT.PLAYER_MIN_X))
          expect(typeof result).toBe('number')
        } else {
          expect(result).toBeLessThanOrEqual(LAYOUT.PLAYER_MAX_X)
          expect(result).toBeGreaterThanOrEqual(Math.min(x, LAYOUT.PLAYER_MAX_X))
          expect(typeof result).toBe('number')
        }
      })
    )
  })

  test('idempotent at boundary: moving left at min or right at max does not change position', () => {
    fc.assert(
      fc.property(speedArb, (speed) => {
        const atMin = constrainPlayerX(LAYOUT.PLAYER_MIN_X, 'left', speed)
        expect(atMin).toBe(LAYOUT.PLAYER_MIN_X)

        const atMax = constrainPlayerX(LAYOUT.PLAYER_MAX_X, 'right', speed)
        expect(atMax).toBe(LAYOUT.PLAYER_MAX_X)

        // Both results remain within valid bounds
        expect(atMin).toBeGreaterThanOrEqual(LAYOUT.PLAYER_MIN_X)
      })
    )
  })

  test('monotonic movement: for in-bounds positions, right >= currentX and left <= currentX', () => {
    const inBoundsArb = fc.integer({ min: LAYOUT.PLAYER_MIN_X, max: LAYOUT.PLAYER_MAX_X })
    fc.assert(
      fc.property(inBoundsArb, speedArb, (x, speed) => {
        const movedRight = constrainPlayerX(x, 'right', speed)
        expect(movedRight).toBeGreaterThanOrEqual(x)
        expect(movedRight).toBeLessThanOrEqual(LAYOUT.PLAYER_MAX_X)

        const movedLeft = constrainPlayerX(x, 'left', speed)
        expect(movedLeft).toBeLessThanOrEqual(x)
        expect(movedLeft).toBeGreaterThanOrEqual(LAYOUT.PLAYER_MIN_X)
      })
    )
  })

  test('direction independence with zero speed: left and right both return x when in bounds', () => {
    const inBoundsArb = fc.integer({ min: LAYOUT.PLAYER_MIN_X, max: LAYOUT.PLAYER_MAX_X })
    fc.assert(
      fc.property(inBoundsArb, (x) => {
        const left = constrainPlayerX(x, 'left', 0)
        const right = constrainPlayerX(x, 'right', 0)
        expect(left).toBe(x)
        expect(right).toBe(x)
        expect(left).toBe(right)
      })
    )
  })
})

// ─── applyPlayerInput Property-Based Tests ──────────────────────────────────

describe('applyPlayerInput properties', () => {
  const posArb = fc.integer({ min: -10, max: 130 })
  const speedArb = fc.integer({ min: 0, max: 20 })
  const inBoundsArb = fc.integer({ min: LAYOUT.PLAYER_MIN_X, max: LAYOUT.PLAYER_MAX_X })

  test('bounded output: result is always in [PLAYER_MIN_X, PLAYER_MAX_X] for in-bounds start positions', () => {
    const inputArb = fc.record({ left: fc.boolean(), right: fc.boolean() })
    fc.assert(
      fc.property(inBoundsArb, inputArb, speedArb, (x, input, speed) => {
        const result = applyPlayerInput(x, input, speed)
        expect(result).toBeGreaterThanOrEqual(LAYOUT.PLAYER_MIN_X)
        expect(result).toBeLessThanOrEqual(LAYOUT.PLAYER_MAX_X)
        expect(typeof result).toBe('number')
      })
    )
  })

  test('no-op when idle: {left: false, right: false} returns unchanged position if in bounds', () => {
    fc.assert(
      fc.property(inBoundsArb, speedArb, (x, speed) => {
        const result = applyPlayerInput(x, { left: false, right: false }, speed)
        expect(result).toBe(x)
        expect(result).toBeGreaterThanOrEqual(LAYOUT.PLAYER_MIN_X)
        expect(result).toBeLessThanOrEqual(LAYOUT.PLAYER_MAX_X)
      })
    )
  })

  test('opposing inputs cancel: {left: true, right: true} returns original when in safe interior', () => {
    // Use positions far enough from edges that clamping will not interfere
    const safeArb = fc.integer({ min: LAYOUT.PLAYER_MIN_X + 20, max: LAYOUT.PLAYER_MAX_X - 20 })
    const safeSpeedArb = fc.integer({ min: 0, max: 20 })
    fc.assert(
      fc.property(safeArb, safeSpeedArb, (x, speed) => {
        const result = applyPlayerInput(x, { left: true, right: true }, speed)
        expect(result).toBe(x)
        expect(result).toBeGreaterThanOrEqual(LAYOUT.PLAYER_MIN_X)
        expect(result).toBeLessThanOrEqual(LAYOUT.PLAYER_MAX_X)
      })
    )
  })

  test('exhaustive: all 4 boolean combinations of {left, right} produce bounded results for in-bounds positions', () => {
    const combos: Array<{ left: boolean; right: boolean }> = [
      { left: false, right: false },
      { left: true, right: false },
      { left: false, right: true },
      { left: true, right: true },
    ]
    fc.assert(
      fc.property(inBoundsArb, speedArb, (x, speed) => {
        for (const input of combos) {
          const result = applyPlayerInput(x, input, speed)
          expect(result).toBeGreaterThanOrEqual(LAYOUT.PLAYER_MIN_X)
          expect(result).toBeLessThanOrEqual(LAYOUT.PLAYER_MAX_X)
          expect(typeof result).toBe('number')
        }
      })
    )
  })
})

// shared/collision.test.ts
// Unit + property-based tests for collision detection functions

import { describe, test, expect } from 'bun:test'
import * as fc from 'fast-check'
import { checkPlayerHit, checkAlienHit, checkUfoHit, checkBarrierSegmentHit, HITBOX, LAYOUT } from './types'

// ─── Test Data Builders ─────────────────────────────────────────────────────

/** Build a bullet position */
function bullet(x: number, y: number) {
  return { x, y }
}

/** Build a player position (x is CENTER of sprite) */
function player(x: number, y: number = LAYOUT.PLAYER_Y) {
  return { x, y }
}

/** Build an entity position at left edge (alien, ufo) */
function _entity(x: number, y: number) {
  return { x, y }
}

/** Build a barrier segment position */
function _segment(x: number, y: number) {
  return { x, y }
}

// ─── checkPlayerHit ─────────────────────────────────────────────────────────
// Player.x is CENTER of sprite (width 7, half-width 3).
// Hit X range: [pX - 3, pX + 3 + 1) = [pX - 3, pX + 4)
// Hit Y range: Math.abs(bY - pY) < 2, so bY in (pY - 2, pY + 2) exclusive

describe('checkPlayerHit', () => {
  const pX = 60
  const pY = 31

  test('bullet at exact center of player hits', () => {
    const b = bullet(pX, pY)
    const p = player(pX, pY)
    expect(checkPlayerHit(b.x, b.y, p.x, p.y)).toBe(true)
  })

  test('bullet within player hitbox hits', () => {
    // Left of center
    expect(checkPlayerHit(pX - 2, pY, pX, pY)).toBe(true)
    // Right of center
    expect(checkPlayerHit(pX + 2, pY, pX, pY)).toBe(true)
    // Slightly above
    expect(checkPlayerHit(pX, pY - 1, pX, pY)).toBe(true)
  })

  describe('X boundary values', () => {
    test('left edge of hitbox (pX - 3) is a hit', () => {
      const leftEdge = pX - HITBOX.PLAYER_HALF_WIDTH // pX - 3
      expect(checkPlayerHit(leftEdge, pY, pX, pY)).toBe(true)
      expect(checkPlayerHit(leftEdge + 1, pY, pX, pY)).toBe(true)
      // One pixel left of left edge is a miss
      expect(checkPlayerHit(leftEdge - 1, pY, pX, pY)).toBe(false)
    })

    test('right edge of hitbox (pX + 3) is a hit, pX + 4 is a miss', () => {
      const rightInclusive = pX + HITBOX.PLAYER_HALF_WIDTH // pX + 3
      const rightExclusive = pX + HITBOX.PLAYER_HALF_WIDTH + 1 // pX + 4
      expect(checkPlayerHit(rightInclusive, pY, pX, pY)).toBe(true)
      // bX < pX + 4, so bX=pX+4 is a miss
      expect(checkPlayerHit(rightExclusive, pY, pX, pY)).toBe(false)
      // Verify the width: exactly 7 cells [pX-3, pX+4)
      expect(rightExclusive - (pX - HITBOX.PLAYER_HALF_WIDTH)).toBe(7)
    })
  })

  describe('Y boundary values', () => {
    test('bY = pY - 1 hits (within tolerance)', () => {
      expect(checkPlayerHit(pX, pY - 1, pX, pY)).toBe(true)
      expect(Math.abs(pY - 1 - pY)).toBeLessThan(LAYOUT.COLLISION_V)
    })

    test('bY = pY + 1 hits (within tolerance)', () => {
      expect(checkPlayerHit(pX, pY + 1, pX, pY)).toBe(true)
      expect(Math.abs(pY + 1 - pY)).toBeLessThan(LAYOUT.COLLISION_V)
    })

    test('bY = pY - 2 misses (at boundary, not strictly less than)', () => {
      expect(checkPlayerHit(pX, pY - 2, pX, pY)).toBe(false)
      expect(Math.abs(pY - 2 - pY)).not.toBeLessThan(LAYOUT.COLLISION_V)
    })

    test('bY = pY + 2 misses (at boundary, not strictly less than)', () => {
      expect(checkPlayerHit(pX, pY + 2, pX, pY)).toBe(false)
      expect(Math.abs(pY + 2 - pY)).not.toBeLessThan(LAYOUT.COLLISION_V)
    })
  })

  test('bullet clearly outside player misses', () => {
    // Far left
    expect(checkPlayerHit(pX - 10, pY, pX, pY)).toBe(false)
    // Far right
    expect(checkPlayerHit(pX + 10, pY, pX, pY)).toBe(false)
    // Far above
    expect(checkPlayerHit(pX, pY - 5, pX, pY)).toBe(false)
  })
})

// ─── checkAlienHit ──────────────────────────────────────────────────────────
// Alien.x is LEFT EDGE of sprite.
// Hit X range: [aX, aX + 7)
// Hit Y range: Math.abs(bY - aY) < 2

describe('checkAlienHit', () => {
  const aX = 40
  const aY = 10

  test('bullet at left edge of alien hits', () => {
    expect(checkAlienHit(aX, aY, aX, aY)).toBe(true)
  })

  test('bullet in middle of alien hits', () => {
    const midX = aX + Math.floor(HITBOX.ALIEN_WIDTH / 2)
    expect(checkAlienHit(midX, aY, aX, aY)).toBe(true)
    expect(checkAlienHit(midX, aY - 1, aX, aY)).toBe(true)
    expect(checkAlienHit(midX, aY + 1, aX, aY)).toBe(true)
  })

  describe('X boundary values', () => {
    test('left edge (aX) hits, one left (aX - 1) misses', () => {
      expect(checkAlienHit(aX, aY, aX, aY)).toBe(true)
      expect(checkAlienHit(aX - 1, aY, aX, aY)).toBe(false)
      // Also verify aX + 1 hits
      expect(checkAlienHit(aX + 1, aY, aX, aY)).toBe(true)
    })

    test('right edge (aX + 6) hits, one right (aX + 7) misses', () => {
      const lastHit = aX + HITBOX.ALIEN_WIDTH - 1 // aX + 6
      const firstMiss = aX + HITBOX.ALIEN_WIDTH // aX + 7
      expect(checkAlienHit(lastHit, aY, aX, aY)).toBe(true)
      expect(checkAlienHit(firstMiss, aY, aX, aY)).toBe(false)
      // Width should be exactly ALIEN_WIDTH
      expect(firstMiss - aX).toBe(HITBOX.ALIEN_WIDTH)
    })
  })

  describe('Y boundary values', () => {
    test('bY = aY +/- 1 hits, bY = aY +/- 2 misses', () => {
      expect(checkAlienHit(aX, aY - 1, aX, aY)).toBe(true)
      expect(checkAlienHit(aX, aY + 1, aX, aY)).toBe(true)
      expect(checkAlienHit(aX, aY - 2, aX, aY)).toBe(false)
      expect(checkAlienHit(aX, aY + 2, aX, aY)).toBe(false)
    })
  })

  test('bullet clearly outside alien misses', () => {
    expect(checkAlienHit(aX - 5, aY, aX, aY)).toBe(false)
    expect(checkAlienHit(aX + 20, aY, aX, aY)).toBe(false)
    expect(checkAlienHit(aX, aY + 10, aX, aY)).toBe(false)
  })
})

// ─── checkUfoHit ────────────────────────────────────────────────────────────
// UFO.x is LEFT EDGE of sprite.
// Hit X range: [uX, uX + 7)
// Hit Y range: Math.abs(bY - uY) < 2

describe('checkUfoHit', () => {
  const uX = 50
  const uY = 1

  test('bullet at left edge of UFO hits', () => {
    expect(checkUfoHit(uX, uY, uX, uY)).toBe(true)
  })

  test('bullet in middle of UFO hits', () => {
    const midX = uX + Math.floor(HITBOX.UFO_WIDTH / 2)
    expect(checkUfoHit(midX, uY, uX, uY)).toBe(true)
    expect(checkUfoHit(midX, uY - 1, uX, uY)).toBe(true)
    expect(checkUfoHit(midX, uY + 1, uX, uY)).toBe(true)
  })

  describe('X boundary values', () => {
    test('left edge (uX) hits, one left (uX - 1) misses', () => {
      expect(checkUfoHit(uX, uY, uX, uY)).toBe(true)
      expect(checkUfoHit(uX - 1, uY, uX, uY)).toBe(false)
      expect(checkUfoHit(uX + 1, uY, uX, uY)).toBe(true)
    })

    test('right edge (uX + 6) hits, one right (uX + 7) misses', () => {
      const lastHit = uX + HITBOX.UFO_WIDTH - 1
      const firstMiss = uX + HITBOX.UFO_WIDTH
      expect(checkUfoHit(lastHit, uY, uX, uY)).toBe(true)
      expect(checkUfoHit(firstMiss, uY, uX, uY)).toBe(false)
      expect(firstMiss - uX).toBe(HITBOX.UFO_WIDTH)
    })
  })

  describe('Y boundary values', () => {
    test('bY = uY +/- 1 hits, bY = uY +/- 2 misses', () => {
      expect(checkUfoHit(uX, uY - 1, uX, uY)).toBe(true)
      expect(checkUfoHit(uX, uY + 1, uX, uY)).toBe(true)
      expect(checkUfoHit(uX, uY - 2, uX, uY)).toBe(false)
      expect(checkUfoHit(uX, uY + 2, uX, uY)).toBe(false)
    })
  })

  test('bullet clearly outside UFO misses', () => {
    expect(checkUfoHit(uX - 5, uY, uX, uY)).toBe(false)
    expect(checkUfoHit(uX + 20, uY, uX, uY)).toBe(false)
    expect(checkUfoHit(uX, uY + 10, uX, uY)).toBe(false)
  })
})

// ─── checkBarrierSegmentHit ─────────────────────────────────────────────────
// Exact box collision: bX in [segX, segX + 3), bY in [segY, segY + 2)
// No Y tolerance -- strict bounds

describe('checkBarrierSegmentHit', () => {
  const sX = 30
  const sY = 25

  test('bullet at top-left corner of segment hits', () => {
    expect(checkBarrierSegmentHit(sX, sY, sX, sY)).toBe(true)
  })

  test('bullet inside segment hits', () => {
    expect(checkBarrierSegmentHit(sX + 1, sY, sX, sY)).toBe(true)
    expect(checkBarrierSegmentHit(sX, sY + 1, sX, sY)).toBe(true)
    expect(checkBarrierSegmentHit(sX + 1, sY + 1, sX, sY)).toBe(true)
  })

  describe('X boundary values', () => {
    test('left edge (sX) hits, one left (sX - 1) misses', () => {
      expect(checkBarrierSegmentHit(sX, sY, sX, sY)).toBe(true)
      expect(checkBarrierSegmentHit(sX - 1, sY, sX, sY)).toBe(false)
      expect(checkBarrierSegmentHit(sX + 1, sY, sX, sY)).toBe(true)
    })

    test('right edge (sX + 2) hits, one right (sX + 3) misses', () => {
      const lastHit = sX + HITBOX.BARRIER_SEGMENT_WIDTH - 1 // sX + 2
      const firstMiss = sX + HITBOX.BARRIER_SEGMENT_WIDTH // sX + 3
      expect(checkBarrierSegmentHit(lastHit, sY, sX, sY)).toBe(true)
      expect(checkBarrierSegmentHit(firstMiss, sY, sX, sY)).toBe(false)
      expect(firstMiss - sX).toBe(HITBOX.BARRIER_SEGMENT_WIDTH)
    })
  })

  describe('Y boundary values', () => {
    test('top edge (sY) hits, one above (sY - 1) misses', () => {
      expect(checkBarrierSegmentHit(sX, sY, sX, sY)).toBe(true)
      expect(checkBarrierSegmentHit(sX, sY - 1, sX, sY)).toBe(false)
      expect(checkBarrierSegmentHit(sX, sY + 1, sX, sY)).toBe(true)
    })

    test('bottom edge (sY + 1) hits, one below (sY + 2) misses', () => {
      const lastHit = sY + HITBOX.BARRIER_SEGMENT_HEIGHT - 1 // sY + 1
      const firstMiss = sY + HITBOX.BARRIER_SEGMENT_HEIGHT // sY + 2
      expect(checkBarrierSegmentHit(sX, lastHit, sX, sY)).toBe(true)
      expect(checkBarrierSegmentHit(sX, firstMiss, sX, sY)).toBe(false)
      expect(firstMiss - sY).toBe(HITBOX.BARRIER_SEGMENT_HEIGHT)
    })
  })

  test('barrier uses strict bounds (no Y tolerance like player/alien)', () => {
    // bY exactly at sY - 1 should miss (unlike player/alien which use tolerance)
    expect(checkBarrierSegmentHit(sX, sY - 1, sX, sY)).toBe(false)
    // bY exactly at sY + 2 should miss
    expect(checkBarrierSegmentHit(sX, sY + 2, sX, sY)).toBe(false)
    // bY at sY and sY+1 should hit
    expect(checkBarrierSegmentHit(sX, sY, sX, sY)).toBe(true)
    expect(checkBarrierSegmentHit(sX, sY + 1, sX, sY)).toBe(true)
  })

  test('bullet clearly outside segment misses', () => {
    expect(checkBarrierSegmentHit(sX - 5, sY, sX, sY)).toBe(false)
    expect(checkBarrierSegmentHit(sX + 10, sY, sX, sY)).toBe(false)
    expect(checkBarrierSegmentHit(sX, sY - 5, sX, sY)).toBe(false)
    expect(checkBarrierSegmentHit(sX, sY + 10, sX, sY)).toBe(false)
  })
})

// ─── Sad Path: Negative and Large Coordinates ───────────────────────────────

describe('edge-case coordinates', () => {
  test('negative coordinates work correctly for player hit', () => {
    // Player at negative X: center = -10
    // Hit range: [-13, -6)
    expect(checkPlayerHit(-10, 0, -10, 0)).toBe(true)
    expect(checkPlayerHit(-13, 0, -10, 0)).toBe(true)
    expect(checkPlayerHit(-14, 0, -10, 0)).toBe(false)
  })

  test('negative coordinates work correctly for alien hit', () => {
    // Alien at left edge = -5, range [-5, 2)
    expect(checkAlienHit(-5, 0, -5, 0)).toBe(true)
    expect(checkAlienHit(1, 0, -5, 0)).toBe(true)
    expect(checkAlienHit(2, 0, -5, 0)).toBe(false)
  })

  test('negative coordinates work correctly for barrier segment hit', () => {
    // Segment at (-3, -2), X range [-3, 0), Y range [-2, 0)
    expect(checkBarrierSegmentHit(-3, -2, -3, -2)).toBe(true)
    expect(checkBarrierSegmentHit(-1, -1, -3, -2)).toBe(true)
    expect(checkBarrierSegmentHit(0, -2, -3, -2)).toBe(false)
    expect(checkBarrierSegmentHit(-3, 0, -3, -2)).toBe(false)
  })

  test('very large coordinates work correctly for player hit', () => {
    const bigX = 100_000
    const bigY = 100_000
    expect(checkPlayerHit(bigX, bigY, bigX, bigY)).toBe(true)
    expect(checkPlayerHit(bigX - 3, bigY, bigX, bigY)).toBe(true)
    expect(checkPlayerHit(bigX - 4, bigY, bigX, bigY)).toBe(false)
  })

  test('very large coordinates work correctly for alien hit', () => {
    const bigX = 999_999
    const bigY = 999_999
    expect(checkAlienHit(bigX, bigY, bigX, bigY)).toBe(true)
    expect(checkAlienHit(bigX + 6, bigY, bigX, bigY)).toBe(true)
    expect(checkAlienHit(bigX + 7, bigY, bigX, bigY)).toBe(false)
  })

  test('zero coordinates work for all collision functions', () => {
    expect(checkPlayerHit(0, 0, 0, 0)).toBe(true)
    expect(checkAlienHit(0, 0, 0, 0)).toBe(true)
    expect(checkUfoHit(0, 0, 0, 0)).toBe(true)
    expect(checkBarrierSegmentHit(0, 0, 0, 0)).toBe(true)
  })
})

// ─── Property-Based Tests ───────────────────────────────────────────────────

describe('property-based collision tests', () => {
  // Arbitrary for reasonable game coordinates
  const coordArb = fc.integer({ min: -1000, max: 1000 })

  describe('bullet at entity center always hits', () => {
    test('player: bullet at (pX, pY) always hits', () => {
      fc.assert(
        fc.property(coordArb, coordArb, (pX, pY) => {
          expect(checkPlayerHit(pX, pY, pX, pY)).toBe(true)
        }),
        { numRuns: 200 },
      )
    })

    test('alien: bullet at center of alien always hits', () => {
      fc.assert(
        fc.property(coordArb, coordArb, (aX, aY) => {
          const centerX = aX + Math.floor(HITBOX.ALIEN_WIDTH / 2) // aX + 3
          expect(checkAlienHit(centerX, aY, aX, aY)).toBe(true)
        }),
        { numRuns: 200 },
      )
    })

    test('ufo: bullet at center of UFO always hits', () => {
      fc.assert(
        fc.property(coordArb, coordArb, (uX, uY) => {
          const centerX = uX + Math.floor(HITBOX.UFO_WIDTH / 2) // uX + 3
          expect(checkUfoHit(centerX, uY, uX, uY)).toBe(true)
        }),
        { numRuns: 200 },
      )
    })

    test('barrier segment: bullet at center of segment always hits', () => {
      fc.assert(
        fc.property(coordArb, coordArb, (sX, sY) => {
          const centerX = sX + Math.floor(HITBOX.BARRIER_SEGMENT_WIDTH / 2) // sX + 1
          const centerY = sY + Math.floor(HITBOX.BARRIER_SEGMENT_HEIGHT / 2) // sY + 1
          expect(checkBarrierSegmentHit(centerX, centerY, sX, sY)).toBe(true)
        }),
        { numRuns: 200 },
      )
    })
  })

  describe('bullet far away never hits', () => {
    // Offset large enough that no hitbox can reach
    const farOffset = fc.integer({ min: 50, max: 500 })

    test('player: bullet 50+ cells away never hits', () => {
      fc.assert(
        fc.property(
          coordArb,
          coordArb,
          farOffset,
          fc.constantFrom(-1, 1) as fc.Arbitrary<-1 | 1>,
          (pX, pY, offset, sign) => {
            const bX = pX + offset * sign
            expect(checkPlayerHit(bX, pY, pX, pY)).toBe(false)
          },
        ),
        { numRuns: 200 },
      )
    })

    test('alien: bullet 50+ cells away (X or Y) never hits', () => {
      fc.assert(
        fc.property(
          coordArb,
          coordArb,
          farOffset,
          fc.constantFrom(-1, 1) as fc.Arbitrary<-1 | 1>,
          fc.boolean(),
          (aX, aY, offset, sign, useX) => {
            const bX = useX ? aX + offset * sign : aX
            const bY = useX ? aY : aY + offset * sign
            expect(checkAlienHit(bX, bY, aX, aY)).toBe(false)
          },
        ),
        { numRuns: 200 },
      )
    })

    test('ufo: bullet 50+ cells away never hits', () => {
      fc.assert(
        fc.property(
          coordArb,
          coordArb,
          farOffset,
          fc.constantFrom(-1, 1) as fc.Arbitrary<-1 | 1>,
          fc.boolean(),
          (uX, uY, offset, sign, useX) => {
            const bX = useX ? uX + offset * sign : uX
            const bY = useX ? uY : uY + offset * sign
            expect(checkUfoHit(bX, bY, uX, uY)).toBe(false)
          },
        ),
        { numRuns: 200 },
      )
    })

    test('barrier segment: bullet 50+ cells away never hits', () => {
      fc.assert(
        fc.property(
          coordArb,
          coordArb,
          farOffset,
          fc.constantFrom(-1, 1) as fc.Arbitrary<-1 | 1>,
          fc.boolean(),
          (sX, sY, offset, sign, useX) => {
            const bX = useX ? sX + offset * sign : sX
            const bY = useX ? sY : sY + offset * sign
            expect(checkBarrierSegmentHit(bX, bY, sX, sY)).toBe(false)
          },
        ),
        { numRuns: 200 },
      )
    })
  })

  describe('conservation: alien and UFO hitboxes agree', () => {
    test('checkAlienHit and checkUfoHit produce identical results for same inputs', () => {
      fc.assert(
        fc.property(coordArb, coordArb, coordArb, coordArb, (bX, bY, eX, eY) => {
          const alienResult = checkAlienHit(bX, bY, eX, eY)
          const ufoResult = checkUfoHit(bX, bY, eX, eY)
          expect(alienResult).toBe(ufoResult)
        }),
        { numRuns: 500 },
      )
    })

    test('ALIEN_WIDTH equals UFO_WIDTH (same dimensions)', () => {
      expect(HITBOX.ALIEN_WIDTH).toBe(HITBOX.UFO_WIDTH)
    })
  })

  describe('hitbox containment: inside always hits, outside always misses', () => {
    test('player: any bullet in [pX-3, pX+3] x [pY-1, pY+1] hits', () => {
      fc.assert(
        fc.property(
          coordArb,
          coordArb,
          fc.integer({ min: -HITBOX.PLAYER_HALF_WIDTH, max: HITBOX.PLAYER_HALF_WIDTH }),
          fc.integer({ min: -(LAYOUT.COLLISION_V - 1), max: LAYOUT.COLLISION_V - 1 }),
          (pX, pY, dx, dy) => {
            expect(checkPlayerHit(pX + dx, pY + dy, pX, pY)).toBe(true)
          },
        ),
        { numRuns: 200 },
      )
    })

    test('alien: any bullet in [aX, aX+6] x [aY-1, aY+1] hits', () => {
      fc.assert(
        fc.property(
          coordArb,
          coordArb,
          fc.integer({ min: 0, max: HITBOX.ALIEN_WIDTH - 1 }),
          fc.integer({ min: -(LAYOUT.COLLISION_V - 1), max: LAYOUT.COLLISION_V - 1 }),
          (aX, aY, dx, dy) => {
            expect(checkAlienHit(aX + dx, aY + dy, aX, aY)).toBe(true)
          },
        ),
        { numRuns: 200 },
      )
    })

    test('barrier segment: any bullet in [sX, sX+2] x [sY, sY+1] hits', () => {
      fc.assert(
        fc.property(
          coordArb,
          coordArb,
          fc.integer({ min: 0, max: HITBOX.BARRIER_SEGMENT_WIDTH - 1 }),
          fc.integer({ min: 0, max: HITBOX.BARRIER_SEGMENT_HEIGHT - 1 }),
          (sX, sY, dx, dy) => {
            expect(checkBarrierSegmentHit(sX + dx, sY + dy, sX, sY)).toBe(true)
          },
        ),
        { numRuns: 200 },
      )
    })
  })

  describe('player center-based vs alien left-edge-based symmetry', () => {
    test('player hitbox width matches alien/ufo hitbox width', () => {
      // Player: [pX - 3, pX + 4) = 7 wide
      // Alien:  [aX, aX + 7) = 7 wide
      const playerWidth = HITBOX.PLAYER_HALF_WIDTH * 2 + 1
      expect(playerWidth).toBe(HITBOX.ALIEN_WIDTH)
      expect(playerWidth).toBe(HITBOX.UFO_WIDTH)
    })

    test('player hit at center is equivalent to alien hit at left-edge + half-width', () => {
      fc.assert(
        fc.property(coordArb, coordArb, coordArb, coordArb, (bX, bY, baseX, baseY) => {
          // If player is centered at baseX, its left edge is baseX - 3
          // An alien at left edge (baseX - 3) should have the same hitbox
          const playerHit = checkPlayerHit(bX, bY, baseX, baseY)
          const alienHit = checkAlienHit(bX, bY, baseX - HITBOX.PLAYER_HALF_WIDTH, baseY)
          expect(playerHit).toBe(alienHit)
        }),
        { numRuns: 300 },
      )
    })
  })
})

// shared/types.test.ts
// Unit tests for shared utility functions

import { describe, test, expect } from 'bun:test'
import {
  LAYOUT,
  constrainPlayerX,
  applyPlayerInput,
  checkBulletCollision,
  getAliens,
  getBullets,
  getBarriers,
  getUFOs,
  type Entity,
  type AlienEntity,
  type BulletEntity,
  type BarrierEntity,
  type UFOEntity,
} from './types'

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

// ─── checkBulletCollision Tests ──────────────────────────────────────────────

describe('checkBulletCollision', () => {
  test('detects collision when bullet is at target center', () => {
    const result = checkBulletCollision(50, 20, 49, 20)
    expect(result).toBe(true)
  })

  test('detects collision within horizontal threshold', () => {
    // COLLISION_H is 3, so within 3 cells horizontally should collide
    const result = checkBulletCollision(50, 20, 48, 20)
    expect(result).toBe(true)
  })

  test('detects collision within vertical threshold', () => {
    // COLLISION_V is 2, so within 2 cells vertically should collide
    const result = checkBulletCollision(50, 20, 49, 21)
    expect(result).toBe(true)
  })

  test('no collision when bullet is far away horizontally', () => {
    const result = checkBulletCollision(50, 20, 40, 20)
    expect(result).toBe(false)
  })

  test('no collision when bullet is far away vertically', () => {
    const result = checkBulletCollision(50, 20, 49, 30)
    expect(result).toBe(false)
  })

  test('handles custom offset', () => {
    const result = checkBulletCollision(50, 20, 47, 20, 2)
    expect(result).toBe(true)
  })

  test('edge case: exactly at threshold boundary', () => {
    // Formula: Math.abs(bulletX - targetX - offsetX) < COLLISION_H
    // With bulletX=50, targetX=46, offsetX=1: |50 - 46 - 1| = 3, and 3 < 3 is false
    const result = checkBulletCollision(50, 20, 46, 20)
    expect(result).toBe(false)
  })

  test('edge case: just inside threshold', () => {
    // With bulletX=50, targetX=47, offsetX=1: |50 - 47 - 1| = 2, and 2 < 3 is true
    const result = checkBulletCollision(50, 20, 47, 20)
    expect(result).toBe(true)
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

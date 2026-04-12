import { describe, it, expect, beforeEach } from 'vitest'
import { getSpriteImage, _clearAtlasCacheForTests, _getAtlasCacheSizeForTests } from './spriteAtlas'
import { PIXEL_ART, SPRITE_SIZE } from '../../../client-core/src/sprites/bitmaps'
import { CELL_W, CELL_H } from './canvasRenderer'

describe('sprite atlas', () => {
  beforeEach(() => {
    _clearAtlasCacheForTests()
  })

  it('returns a canvas-like image with dimensions matching sprite * cell', () => {
    const img = getSpriteImage('squid', 'a', '#ff8888', '#aa1111')
    expect(img).not.toBeNull()
    if (!img) return
    const expectedW = SPRITE_SIZE.alien.width * CELL_W
    const expectedH = SPRITE_SIZE.alien.height * CELL_H
    expect(img.width).toBe(expectedW)
    expect(img.height).toBe(expectedH)
  })

  it('produces cached identical output for same inputs', () => {
    const a = getSpriteImage('squid', 'a', '#ff8888', '#aa1111')
    const b = getSpriteImage('squid', 'a', '#ff8888', '#aa1111')
    // Same object reference indicates caching
    expect(a).toBe(b)
  })

  it('different inputs produce different cached entries', () => {
    const a = getSpriteImage('squid', 'a', '#ff8888', '#aa1111')
    const b = getSpriteImage('squid', 'b', '#ff8888', '#aa1111')
    expect(a).not.toBe(b)
  })

  it('evicts LRU entries when cache exceeds 24', () => {
    // Fill past capacity with distinct keys
    const colors: string[] = []
    for (let i = 0; i < 30; i++) {
      const hex = `#${i.toString(16).padStart(2, '0')}0000`
      colors.push(hex)
      getSpriteImage('squid', 'a', hex, '#000000')
    }
    // Cache should cap at 24
    expect(_getAtlasCacheSizeForTests()).toBeLessThanOrEqual(24)
  })

  it('uses different cache entries for different types', () => {
    const squid = getSpriteImage('squid', 'a', '#ff8888', '#aa1111')
    const crab = getSpriteImage('crab', 'a', '#ff8888', '#aa1111')
    expect(squid).not.toBe(crab)
  })
})

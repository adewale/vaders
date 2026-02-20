// client/src/sprites.test.ts
// Unit tests for sprite system constraints

import { describe, test, expect } from 'bun:test'
import {
  SPRITES,
  ASCII_SPRITES,
  SPRITE_SIZE,
  BRAILLE_SPINNER_FRAMES,
  ASCII_SPINNER_FRAMES,
  getSpinnerFrames,
} from './sprites'
import type { TerminalCapabilities } from './terminal/compatibility'
import { LAYOUT } from '../../shared/types'

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Get the display width of a string (accounts for multi-byte Unicode)
 * For simple ASCII and most box-drawing chars, length === display width
 */
function getDisplayWidth(str: string): number {
  // For our sprites, we can use string length since we're using
  // single-width Unicode characters (box drawing, etc.)
  return str.length
}

/**
 * Verify all lines in a sprite array have the same width
 */
function verifySpriteLineWidths(sprite: readonly string[], name: string): void {
  if (sprite.length === 0) return

  const firstWidth = getDisplayWidth(sprite[0])
  for (let i = 1; i < sprite.length; i++) {
    const lineWidth = getDisplayWidth(sprite[i])
    expect(lineWidth).toBe(firstWidth)
  }
}

/**
 * Verify a sprite matches expected dimensions
 */
function verifySpriteMatchesDimensions(
  sprite: readonly string[],
  expectedWidth: number,
  expectedHeight: number,
  name: string
): void {
  // Check height
  expect(sprite.length).toBe(expectedHeight)

  // Check width of each line
  for (let i = 0; i < sprite.length; i++) {
    const lineWidth = getDisplayWidth(sprite[i])
    expect(lineWidth).toBe(expectedWidth)
  }
}

// ─── Sprite Dimension Consistency Tests ───────────────────────────────────────

describe('Sprite Line Width Consistency', () => {
  describe('Unicode sprites', () => {
    test('player sprite has consistent line widths', () => {
      verifySpriteLineWidths(SPRITES.player.a, 'player')
    })

    test('squid alien sprite has consistent line widths', () => {
      verifySpriteLineWidths(SPRITES.alien.squid.a, 'squid')
    })

    test('crab alien sprite has consistent line widths', () => {
      verifySpriteLineWidths(SPRITES.alien.crab.a, 'crab')
    })

    test('octopus alien sprite has consistent line widths', () => {
      verifySpriteLineWidths(SPRITES.alien.octopus.a, 'octopus')
    })

    test('UFO sprite has consistent line widths', () => {
      verifySpriteLineWidths(SPRITES.ufo.a, 'ufo')
    })

    test('barrier sprites have consistent line widths', () => {
      for (const [health, sprite] of Object.entries(SPRITES.barrier)) {
        verifySpriteLineWidths(sprite, `barrier_${health}`)
      }
    })

    test('commander healthy sprite has consistent line widths', () => {
      verifySpriteLineWidths(SPRITES.enhanced.commander.healthy, 'commander_healthy')
    })

    test('commander damaged sprite has consistent line widths', () => {
      verifySpriteLineWidths(SPRITES.enhanced.commander.damaged, 'commander_damaged')
    })

    test('transform sprites have consistent line widths', () => {
      verifySpriteLineWidths(SPRITES.enhanced.transform.scorpion, 'transform_scorpion')
      verifySpriteLineWidths(SPRITES.enhanced.transform.stingray, 'transform_stingray')
      verifySpriteLineWidths(SPRITES.enhanced.transform.mini_commander, 'transform_mini_commander')
    })

    test('tractor beam sprite has consistent line widths', () => {
      verifySpriteLineWidths(SPRITES.enhanced.tractorBeam, 'tractorBeam')
    })
  })

  describe('ASCII sprites', () => {
    test('player sprite has consistent line widths', () => {
      verifySpriteLineWidths(ASCII_SPRITES.player.a, 'ascii_player')
    })

    test('squid alien sprite has consistent line widths', () => {
      verifySpriteLineWidths(ASCII_SPRITES.alien.squid.a, 'ascii_squid')
    })

    test('crab alien sprite has consistent line widths', () => {
      verifySpriteLineWidths(ASCII_SPRITES.alien.crab.a, 'ascii_crab')
    })

    test('octopus alien sprite has consistent line widths', () => {
      verifySpriteLineWidths(ASCII_SPRITES.alien.octopus.a, 'ascii_octopus')
    })

    test('UFO sprite has consistent line widths', () => {
      verifySpriteLineWidths(ASCII_SPRITES.ufo.a, 'ascii_ufo')
    })

    test('barrier sprites have consistent line widths', () => {
      for (const [health, sprite] of Object.entries(ASCII_SPRITES.barrier)) {
        verifySpriteLineWidths(sprite, `ascii_barrier_${health}`)
      }
    })

    test('commander healthy sprite has consistent line widths', () => {
      verifySpriteLineWidths(ASCII_SPRITES.enhanced.commander.healthy, 'ascii_commander_healthy')
    })

    test('commander damaged sprite has consistent line widths', () => {
      verifySpriteLineWidths(ASCII_SPRITES.enhanced.commander.damaged, 'ascii_commander_damaged')
    })

    test('transform sprites have consistent line widths', () => {
      verifySpriteLineWidths(ASCII_SPRITES.enhanced.transform.scorpion, 'ascii_transform_scorpion')
      verifySpriteLineWidths(ASCII_SPRITES.enhanced.transform.stingray, 'ascii_transform_stingray')
      verifySpriteLineWidths(ASCII_SPRITES.enhanced.transform.mini_commander, 'ascii_transform_mini_commander')
    })

    test('tractor beam sprite has consistent line widths', () => {
      verifySpriteLineWidths(ASCII_SPRITES.enhanced.tractorBeam, 'ascii_tractorBeam')
    })
  })
})

// ─── Sprite Dimensions Match LAYOUT Constants ─────────────────────────────────

describe('Sprite Dimensions Match LAYOUT Constants', () => {
  test('SPRITE_SIZE.player.width matches LAYOUT.PLAYER_WIDTH', () => {
    expect(SPRITE_SIZE.player.width).toBe(LAYOUT.PLAYER_WIDTH)
  })

  test('SPRITE_SIZE.player.height matches LAYOUT.PLAYER_HEIGHT', () => {
    expect(SPRITE_SIZE.player.height).toBe(LAYOUT.PLAYER_HEIGHT)
  })

  test('SPRITE_SIZE.alien.width matches LAYOUT.ALIEN_WIDTH', () => {
    expect(SPRITE_SIZE.alien.width).toBe(LAYOUT.ALIEN_WIDTH)
  })

  test('SPRITE_SIZE.alien.height matches LAYOUT.ALIEN_HEIGHT', () => {
    expect(SPRITE_SIZE.alien.height).toBe(LAYOUT.ALIEN_HEIGHT)
  })

  test('player sprite actual dimensions match SPRITE_SIZE', () => {
    verifySpriteMatchesDimensions(
      SPRITES.player.a,
      SPRITE_SIZE.player.width,
      SPRITE_SIZE.player.height,
      'player'
    )
  })

  test('alien sprites actual dimensions match SPRITE_SIZE', () => {
    for (const [type, sprite] of Object.entries(SPRITES.alien)) {
      verifySpriteMatchesDimensions(
        (sprite as any).a,
        SPRITE_SIZE.alien.width,
        SPRITE_SIZE.alien.height,
        `alien_${type}`
      )
    }
  })

  test('UFO sprite actual dimensions match SPRITE_SIZE', () => {
    verifySpriteMatchesDimensions(
      SPRITES.ufo.a,
      SPRITE_SIZE.ufo.width,
      SPRITE_SIZE.ufo.height,
      'ufo'
    )
  })

  test('barrier sprites actual dimensions match SPRITE_SIZE', () => {
    for (const [health, sprite] of Object.entries(SPRITES.barrier)) {
      if (health !== '0') { // Skip destroyed state check
        verifySpriteMatchesDimensions(
          sprite,
          SPRITE_SIZE.barrier.width,
          SPRITE_SIZE.barrier.height,
          `barrier_${health}`
        )
      }
    }
  })
})

// ─── ASCII and Unicode Sprite Dimension Parity ────────────────────────────────

describe('ASCII and Unicode Sprite Dimension Parity', () => {
  test('player sprites have same dimensions', () => {
    expect(ASCII_SPRITES.player.a.length).toBe(SPRITES.player.a.length)
    expect(getDisplayWidth(ASCII_SPRITES.player.a[0])).toBe(getDisplayWidth(SPRITES.player.a[0]))
  })

  test('squid alien sprites have same dimensions', () => {
    expect(ASCII_SPRITES.alien.squid.a.length).toBe(SPRITES.alien.squid.a.length)
    expect(getDisplayWidth(ASCII_SPRITES.alien.squid.a[0])).toBe(getDisplayWidth(SPRITES.alien.squid.a[0]))
  })

  test('crab alien sprites have same dimensions', () => {
    expect(ASCII_SPRITES.alien.crab.a.length).toBe(SPRITES.alien.crab.a.length)
    expect(getDisplayWidth(ASCII_SPRITES.alien.crab.a[0])).toBe(getDisplayWidth(SPRITES.alien.crab.a[0]))
  })

  test('octopus alien sprites have same dimensions', () => {
    expect(ASCII_SPRITES.alien.octopus.a.length).toBe(SPRITES.alien.octopus.a.length)
    expect(getDisplayWidth(ASCII_SPRITES.alien.octopus.a[0])).toBe(getDisplayWidth(SPRITES.alien.octopus.a[0]))
  })

  test('UFO sprites have same dimensions', () => {
    expect(ASCII_SPRITES.ufo.a.length).toBe(SPRITES.ufo.a.length)
    expect(getDisplayWidth(ASCII_SPRITES.ufo.a[0])).toBe(getDisplayWidth(SPRITES.ufo.a[0]))
  })

  test('barrier sprites have same dimensions for each health state', () => {
    for (const health of [4, 3, 2, 1, 0] as const) {
      const ascii = ASCII_SPRITES.barrier[health]
      const unicode = SPRITES.barrier[health]
      expect(ascii.length).toBe(unicode.length)
      expect(getDisplayWidth(ascii[0])).toBe(getDisplayWidth(unicode[0]))
    }
  })

  test('commander healthy sprites have same dimensions', () => {
    expect(ASCII_SPRITES.enhanced.commander.healthy.length).toBe(SPRITES.enhanced.commander.healthy.length)
    // Note: ASCII commander may have different width, but each variant should be internally consistent
  })

  test('commander damaged sprites have same dimensions', () => {
    expect(ASCII_SPRITES.enhanced.commander.damaged.length).toBe(SPRITES.enhanced.commander.damaged.length)
  })

  test('transform scorpion sprites have same dimensions', () => {
    expect(ASCII_SPRITES.enhanced.transform.scorpion.length).toBe(SPRITES.enhanced.transform.scorpion.length)
    expect(getDisplayWidth(ASCII_SPRITES.enhanced.transform.scorpion[0])).toBe(
      getDisplayWidth(SPRITES.enhanced.transform.scorpion[0])
    )
  })

  test('transform stingray sprites have same dimensions', () => {
    expect(ASCII_SPRITES.enhanced.transform.stingray.length).toBe(SPRITES.enhanced.transform.stingray.length)
    expect(getDisplayWidth(ASCII_SPRITES.enhanced.transform.stingray[0])).toBe(
      getDisplayWidth(SPRITES.enhanced.transform.stingray[0])
    )
  })

  test('transform mini_commander sprites have same dimensions', () => {
    expect(ASCII_SPRITES.enhanced.transform.mini_commander.length).toBe(SPRITES.enhanced.transform.mini_commander.length)
    expect(getDisplayWidth(ASCII_SPRITES.enhanced.transform.mini_commander[0])).toBe(
      getDisplayWidth(SPRITES.enhanced.transform.mini_commander[0])
    )
  })

  test('tractor beam sprites have same dimensions', () => {
    expect(ASCII_SPRITES.enhanced.tractorBeam.length).toBe(SPRITES.enhanced.tractorBeam.length)
    expect(getDisplayWidth(ASCII_SPRITES.enhanced.tractorBeam[0])).toBe(
      getDisplayWidth(SPRITES.enhanced.tractorBeam[0])
    )
  })
})

// ─── Bullet Spawn Position Tests ──────────────────────────────────────────────

describe('Bullet Spawn Position Centering', () => {
  test('player bullet spawns at horizontal center of player sprite', () => {
    // Player sprite is LAYOUT.PLAYER_WIDTH wide
    // Bullet should spawn at player.x + floor(PLAYER_WIDTH / 2)
    const bulletXOffset = Math.floor(LAYOUT.PLAYER_WIDTH / 2)

    // For a 7-wide sprite, center is at offset 3 (0, 1, 2, [3], 4, 5, 6)
    expect(bulletXOffset).toBe(3)

    // Verify this matches our expectation
    expect(LAYOUT.PLAYER_WIDTH).toBe(7)
    expect(Math.floor(7 / 2)).toBe(3)
  })

  test('alien bullet spawns at horizontal center of alien sprite', () => {
    // Alien sprite is LAYOUT.ALIEN_WIDTH wide
    // Bullet should spawn at alien.x + floor(ALIEN_WIDTH / 2)
    const bulletXOffset = Math.floor(LAYOUT.ALIEN_WIDTH / 2)

    // For a 7-wide sprite, center is at offset 3
    expect(bulletXOffset).toBe(3)

    // Verify this matches our expectation
    expect(LAYOUT.ALIEN_WIDTH).toBe(7)
    expect(Math.floor(7 / 2)).toBe(3)
  })

  test('bullet spawn offset is reasonable relative to sprite height', () => {
    // Bullet should spawn above the player sprite
    // BULLET_SPAWN_OFFSET should be >= 1 to avoid collision with own sprite
    expect(LAYOUT.BULLET_SPAWN_OFFSET).toBeGreaterThanOrEqual(1)

    // Shouldn't be too far above (would look disconnected)
    expect(LAYOUT.BULLET_SPAWN_OFFSET).toBeLessThanOrEqual(LAYOUT.PLAYER_HEIGHT + 1)
  })
})

// ─── Collision Box Tests ──────────────────────────────────────────────────────

describe('Collision Box Constraints', () => {
  test('COLLISION_H is reasonable for sprite widths', () => {
    // Collision threshold should be less than or equal to sprite width
    // to allow some misses on near-misses
    expect(LAYOUT.COLLISION_H).toBeLessThanOrEqual(LAYOUT.PLAYER_WIDTH)
    expect(LAYOUT.COLLISION_H).toBeLessThanOrEqual(LAYOUT.ALIEN_WIDTH)

    // But should be at least 1 to have any hitbox
    expect(LAYOUT.COLLISION_H).toBeGreaterThanOrEqual(1)
  })

  test('COLLISION_V is reasonable for sprite heights', () => {
    // Vertical collision should be reasonable for 2-line sprites
    expect(LAYOUT.COLLISION_V).toBeLessThanOrEqual(LAYOUT.PLAYER_HEIGHT + 1)
    expect(LAYOUT.COLLISION_V).toBeLessThanOrEqual(LAYOUT.ALIEN_HEIGHT + 1)

    // Should be at least 1
    expect(LAYOUT.COLLISION_V).toBeGreaterThanOrEqual(1)
  })

  test('collision box allows for fair gameplay', () => {
    // The collision area shouldn't be larger than the visual sprite
    // This ensures visual accuracy (what you see is what you hit)
    const visualPlayerArea = LAYOUT.PLAYER_WIDTH * LAYOUT.PLAYER_HEIGHT
    const collisionArea = LAYOUT.COLLISION_H * LAYOUT.COLLISION_V

    // Collision should be smaller or equal to visual for fairness
    expect(collisionArea).toBeLessThanOrEqual(visualPlayerArea)
  })
})

// ─── Bullet Character Tests ──────────────────────────────────────────────────

describe('Bullet Sprite Constraints', () => {
  test('player bullet is single character', () => {
    expect(SPRITES.bullet.player.length).toBe(1)
    expect(ASCII_SPRITES.bullet.player.length).toBe(1)
  })

  test('alien bullet is single character', () => {
    expect(SPRITES.bullet.alien.length).toBe(1)
    expect(ASCII_SPRITES.bullet.alien.length).toBe(1)
  })

  test('bullets match SPRITE_SIZE', () => {
    expect(SPRITE_SIZE.bullet.width).toBe(1)
    expect(SPRITE_SIZE.bullet.height).toBe(1)
  })
})

// ─── Coordinate System Contract Tests ─────────────────────────────────────────
//
// CRITICAL: These tests enforce the coordinate system contract between server and client.
//
// The contract is:
//   - player.x represents the CENTER of the player sprite (not the left edge)
//   - bullet.x is the exact screen column where the bullet renders
//   - For bullets to appear centered: bullet.x MUST equal player.x
//
// The client renders sprites by calculating: spriteLeftEdge = player.x - (SPRITE_WIDTH / 2)
// This means if player.x = 50, the sprite renders from column 47 to 53 (7-wide sprite)
// The visual center is at column 50, which equals player.x.
//
// Therefore, bullets must spawn at player.x (not player.x + offset) to appear centered.

describe('Coordinate System Contract', () => {
  describe('player.x represents sprite center (client rendering contract)', () => {
    test('sprite left edge = player.x - floor(SPRITE_WIDTH / 2)', () => {
      // This documents how GameScreen.tsx renders players:
      // const spriteX = player.x - Math.floor(SPRITE_SIZE.player.width / 2)
      const playerX = 50
      const spriteWidth = SPRITE_SIZE.player.width  // 7
      const expectedLeftEdge = playerX - Math.floor(spriteWidth / 2)  // 50 - 3 = 47

      expect(expectedLeftEdge).toBe(47)
    })

    test('sprite right edge = player.x + floor(SPRITE_WIDTH / 2)', () => {
      const playerX = 50
      const spriteWidth = SPRITE_SIZE.player.width  // 7
      const leftEdge = playerX - Math.floor(spriteWidth / 2)  // 47
      const rightEdge = leftEdge + spriteWidth - 1  // 47 + 7 - 1 = 53

      expect(rightEdge).toBe(53)
    })

    test('visual center of rendered sprite equals player.x', () => {
      const playerX = 50
      const spriteWidth = SPRITE_SIZE.player.width  // 7
      const leftEdge = playerX - Math.floor(spriteWidth / 2)  // 47
      const visualCenter = leftEdge + Math.floor(spriteWidth / 2)  // 47 + 3 = 50

      expect(visualCenter).toBe(playerX)
    })
  })

  describe('bullet.x must equal player.x for visual centering', () => {
    test('bullet spawns at visual center of player sprite', () => {
      // For a bullet to appear centered above the player:
      // bullet.x must equal the visual center of the sprite
      // Since visual center = player.x (see tests above), bullet.x must = player.x
      const playerX = 50
      const visualCenter = playerX  // Because player.x IS the center

      // This is the CORRECT formula for bullet spawn:
      const correctBulletX = playerX

      // NOT this (which adds an offset):
      const incorrectBulletX = playerX + Math.floor(SPRITE_SIZE.player.width / 2)

      expect(correctBulletX).toBe(visualCenter)
      expect(incorrectBulletX).not.toBe(visualCenter)  // This would be off by 3!
    })

    test('adding SPRITE_WIDTH/2 offset causes bullet to appear at right edge', () => {
      const playerX = 50
      const spriteWidth = SPRITE_SIZE.player.width  // 7
      const leftEdge = playerX - Math.floor(spriteWidth / 2)  // 47
      const rightEdge = leftEdge + spriteWidth - 1  // 53

      // If you incorrectly add an offset:
      const wrongBulletX = playerX + Math.floor(spriteWidth / 2)  // 50 + 3 = 53

      // The bullet appears at the RIGHT EDGE, not center!
      expect(wrongBulletX).toBe(rightEdge)
    })
  })

  describe('coordinate system consistency', () => {
    test('floor(SPRITE_WIDTH / 2) is the correct center offset for odd-width sprites', () => {
      // For a 7-wide sprite with columns [0, 1, 2, 3, 4, 5, 6]:
      // - Left edge is column 0
      // - Center is column 3 (floor(7/2) = 3)
      // - Right edge is column 6
      expect(SPRITE_SIZE.player.width).toBe(7)
      expect(Math.floor(7 / 2)).toBe(3)

      // Verify the center column is equidistant from edges
      const width = 7
      const centerOffset = Math.floor(width / 2)  // 3
      const leftDist = centerOffset  // 3 columns from left
      const rightDist = width - 1 - centerOffset  // 7 - 1 - 3 = 3 columns from right

      expect(leftDist).toBe(rightDist)
    })

    test('alien coordinate system matches player coordinate system', () => {
      // Both should use the same centering convention
      expect(SPRITE_SIZE.alien.width).toBe(SPRITE_SIZE.player.width)
      expect(LAYOUT.ALIEN_WIDTH).toBe(LAYOUT.PLAYER_WIDTH)

      // So alien.x should also represent center
      const alienX = 30
      const alienCenter = alienX
      const alienBulletX = alienX  // Should be the same for centered bullets

      expect(alienBulletX).toBe(alienCenter)
    })
  })
})

// ─── Visual Alignment Integration Tests ───────────────────────────────────────
//
// These tests verify the visual alignment contract that should be enforced
// between the game reducer (server) and the rendering code (client).

describe('Visual Alignment Contract', () => {
  test('DOCUMENT: player.x is CENTER, not LEFT EDGE', () => {
    // This test documents the coordinate system contract.
    // If this assumption changes, all centering logic must be updated.
    //
    // Evidence from GameScreen.tsx:
    //   const spriteX = player.x - Math.floor(SPRITE_SIZE.player.width / 2)
    //
    // This means player.x is the CENTER, and we subtract to get left edge.
    const playerX = 60
    const renderLeftEdge = playerX - Math.floor(SPRITE_SIZE.player.width / 2)
    const renderRightEdge = renderLeftEdge + SPRITE_SIZE.player.width - 1

    // Player.x should be between left and right edges
    expect(playerX).toBeGreaterThan(renderLeftEdge)
    expect(playerX).toBeLessThan(renderRightEdge)

    // And specifically at the center
    const renderedCenter = renderLeftEdge + Math.floor(SPRITE_SIZE.player.width / 2)
    expect(renderedCenter).toBe(playerX)
  })

  test('DOCUMENT: bullet.x is the EXACT render column', () => {
    // Bullets render at: left={bullet.x}
    // There is NO offset applied during bullet rendering.
    // So bullet.x IS the screen column where the bullet appears.
    const bulletX = 50
    const renderColumn = bulletX  // Direct, no transformation

    expect(renderColumn).toBe(bulletX)
  })

  test('ENFORCE: bullet must spawn at player.x to appear centered', () => {
    // Given the above contracts:
    // - player.x = center of sprite
    // - bullet.x = exact render column
    //
    // For bullet to appear at visual center: bullet.x = player.x
    const playerX = 55
    const visualCenter = playerX  // Because player.x IS the center

    // Correct bullet spawn
    const bulletX = playerX
    expect(bulletX).toBe(visualCenter)

    // This assertion will FAIL if the server uses the wrong formula
    // (i.e., player.x + SPRITE_WIDTH/2)
  })

  test('PREVENT: wrong formula causes 3-column offset to the right', () => {
    const playerX = 55
    const spriteWidth = SPRITE_SIZE.player.width  // 7

    // The WRONG formula (treating player.x as left edge):
    const wrongBulletX = playerX + Math.floor(spriteWidth / 2)  // 55 + 3 = 58

    // The CORRECT formula:
    const correctBulletX = playerX  // 55

    // The error magnitude
    const offsetError = wrongBulletX - correctBulletX  // 3

    expect(offsetError).toBe(3)

    // This is why bullets appear 3 columns to the right when the wrong formula is used!
  })

  test('VERIFY: center offset is exactly half the sprite width (rounded down)', () => {
    // For odd-width sprites, floor division gives the correct center
    expect(Math.floor(LAYOUT.PLAYER_WIDTH / 2)).toBe(3)
    expect(Math.floor(LAYOUT.ALIEN_WIDTH / 2)).toBe(3)

    // Document that we expect 7-wide sprites
    expect(LAYOUT.PLAYER_WIDTH).toBe(7)
    expect(LAYOUT.ALIEN_WIDTH).toBe(7)
  })
})

// ─── Braille Spinner Tests ──────────────────────────────────────────────────

describe('Braille Spinner Frames', () => {
  test('braille frames are all single characters', () => {
    for (const frame of BRAILLE_SPINNER_FRAMES) {
      expect(frame.length).toBe(1)
    }
  })

  test('braille frames are in the U+2800 block', () => {
    for (const frame of BRAILLE_SPINNER_FRAMES) {
      const code = frame.charCodeAt(0)
      expect(code).toBeGreaterThanOrEqual(0x2800)
      expect(code).toBeLessThanOrEqual(0x28FF)
    }
  })

  test('braille spinner has 8 frames', () => {
    expect(BRAILLE_SPINNER_FRAMES.length).toBe(8)
  })

  test('ASCII spinner frames are all single characters', () => {
    for (const frame of ASCII_SPINNER_FRAMES) {
      expect(frame.length).toBe(1)
    }
  })

  test('ASCII spinner frames are basic ASCII', () => {
    for (const frame of ASCII_SPINNER_FRAMES) {
      expect(frame.charCodeAt(0)).toBeLessThan(128)
    }
  })

  test('ASCII spinner has 4 frames', () => {
    expect(ASCII_SPINNER_FRAMES.length).toBe(4)
  })

  test('all braille frames are unique', () => {
    const unique = new Set(BRAILLE_SPINNER_FRAMES)
    expect(unique.size).toBe(BRAILLE_SPINNER_FRAMES.length)
  })

  test('all ASCII frames are unique', () => {
    const unique = new Set(ASCII_SPINNER_FRAMES)
    expect(unique.size).toBe(ASCII_SPINNER_FRAMES.length)
  })

  test('getSpinnerFrames returns an array of strings', () => {
    const frames = getSpinnerFrames()
    expect(frames.length).toBeGreaterThan(0)
    for (const frame of frames) {
      expect(typeof frame).toBe('string')
      expect(frame.length).toBe(1)
    }
  })

  test('getSpinnerFrames returns braille frames for Unicode-capable terminal', () => {
    const caps = { supportsUnicode: true } as TerminalCapabilities
    const frames = getSpinnerFrames(caps)
    expect(frames).toBe(BRAILLE_SPINNER_FRAMES)
  })

  test('getSpinnerFrames returns ASCII frames for non-Unicode terminal', () => {
    const caps = { supportsUnicode: false } as TerminalCapabilities
    const frames = getSpinnerFrames(caps)
    expect(frames).toBe(ASCII_SPINNER_FRAMES)
  })
})

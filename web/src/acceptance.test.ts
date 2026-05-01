// Acceptance tests: verify web frontend feature parity with the TUI client.
// These tests define what "parity" means and should FAIL initially — they test
// features that don't exist yet in the web renderer.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'
import { buildDrawCommands, resetEffects, CELL_W, CELL_H, type DrawCommand } from './renderer/canvasRenderer'

// Reset module-level effect systems before each test to avoid cross-test pollution
beforeEach(() => {
  resetEffects()
})
import { createDefaultGameState } from '../../shared/state-defaults'
import type {
  AlienEntity,
  BulletEntity,
  UFOEntity,
  GameState,
  Player,
  PlayerSlot,
  ClassicAlienType,
} from '../../shared/types'
import { LAYOUT } from '../../shared/types'
import { GRADIENT_COLORS, COLORS } from '../../client-core/src/sprites/colors'
import { PIXEL_ART, getAnimationFrame } from '../../client-core/src/sprites/bitmaps'
import { getUFOColor } from '../../client-core/src/effects/colorCycling'

// ─── Test Helpers ────────────────────────────────────────────────────────────

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

function makeUFO(overrides: Partial<UFOEntity> = {}): UFOEntity {
  return {
    kind: 'ufo',
    id: 'ufo-0',
    x: 30,
    y: 1,
    direction: 1,
    alive: true,
    points: 100,
    ...overrides,
  }
}

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-1',
    name: 'TestPlayer',
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

function makeBullet(overrides: Partial<BulletEntity> = {}): BulletEntity {
  return {
    kind: 'bullet',
    id: 'b-0',
    x: 50,
    y: 20,
    ownerId: 'player-1', // null = alien bullet
    dy: -1,
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

/** Type guard for sprite commands that may have gradient colors */
type SpriteCommand = DrawCommand & { type: 'sprite' }
type GradientSpriteCommand = SpriteCommand & { gradientColors: { bright: string; dark: string } }

function isSpriteCommand(cmd: DrawCommand): cmd is SpriteCommand {
  return cmd.type === 'sprite'
}

function hasGradientColors(cmd: DrawCommand): cmd is GradientSpriteCommand {
  return cmd.type === 'sprite' && 'gradientColors' in cmd
}

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/

// ─── 1. Renderer: gradient sprite coloring ──────────────────────────────────
// ACCEPTANCE: gradient sprite coloring — parity with TUI

describe('Renderer: gradient sprite coloring', () => {
  it('alien sprite commands include gradientColors field with bright and dark values', () => {
    const alienTypes: ClassicAlienType[] = ['squid', 'crab', 'octopus']
    for (const type of alienTypes) {
      const alien = makeAlien({ type, id: `alien-${type}` })
      const state = stateWith([alien])
      const commands = buildDrawCommands(state, null)
      const sprites = commands.filter(isSpriteCommand)

      expect(sprites.length).toBeGreaterThanOrEqual(1)
      const alienSprite = sprites[0]

      // Must have gradientColors in addition to flat color
      expect(hasGradientColors(alienSprite)).toBe(true)
      const gradientCmd = alienSprite as GradientSpriteCommand
      expect(gradientCmd.gradientColors.bright).toMatch(HEX_COLOR_REGEX)
      expect(gradientCmd.gradientColors.dark).toMatch(HEX_COLOR_REGEX)
    }
  })

  it('each alien type has distinct gradient colors matching GRADIENT_COLORS', () => {
    const alienTypes: ClassicAlienType[] = ['squid', 'crab', 'octopus']
    const gradientsByType: Record<string, { bright: string; dark: string }> = {}

    for (const type of alienTypes) {
      const alien = makeAlien({ type, id: `alien-${type}` })
      const state = stateWith([alien])
      const commands = buildDrawCommands(state, null)
      const sprites = commands.filter(hasGradientColors)

      expect(sprites.length).toBe(1)
      gradientsByType[type] = sprites[0].gradientColors
    }

    // Each type should have the correct gradient from GRADIENT_COLORS
    expect(gradientsByType.squid.bright).toBe(GRADIENT_COLORS.alien.squid.bright)
    expect(gradientsByType.squid.dark).toBe(GRADIENT_COLORS.alien.squid.dark)
    expect(gradientsByType.crab.bright).toBe(GRADIENT_COLORS.alien.crab.bright)
    expect(gradientsByType.crab.dark).toBe(GRADIENT_COLORS.alien.crab.dark)
    expect(gradientsByType.octopus.bright).toBe(GRADIENT_COLORS.alien.octopus.bright)
    expect(gradientsByType.octopus.dark).toBe(GRADIENT_COLORS.alien.octopus.dark)
  })

  it('player sprite commands include slot-specific gradient colors', () => {
    const slots: PlayerSlot[] = [1, 2, 3, 4]
    for (const slot of slots) {
      const player = makePlayer({ slot, id: `player-${slot}`, x: 20 + slot * 20 })
      const state = stateWith([], { [`player-${slot}`]: player })
      const commands = buildDrawCommands(state, null)
      const sprites = commands.filter(hasGradientColors)

      expect(sprites.length).toBeGreaterThanOrEqual(1)
      const playerSprite = sprites[0]
      expect(playerSprite.gradientColors.bright).toBe(GRADIENT_COLORS.player[slot].bright)
      expect(playerSprite.gradientColors.dark).toBe(GRADIENT_COLORS.player[slot].dark)
    }
  })
})

// ─── 2. Renderer: alien animation frame alternation ─────────────────────────
// ACCEPTANCE: alien animation frame alternation — parity with TUI

describe('Renderer: alien animation frame alternation', () => {
  it('even tick groups use frame A, odd tick groups use frame B', () => {
    const alien = makeAlien({ type: 'squid' })

    // Tick 0 -> floor(0/15)=0, 0%2=0 -> frame A
    const stateA = stateWith([alien], {}, { tick: 0 })
    const commandsA = buildDrawCommands(stateA, null)
    const spriteA = commandsA.filter(isSpriteCommand)[0]

    // Tick 15 -> floor(15/15)=1, 1%2=1 -> frame B
    const stateB = stateWith([alien], {}, { tick: 15 })
    const commandsB = buildDrawCommands(stateB, null)
    const spriteB = commandsB.filter(isSpriteCommand)[0]

    // The pixel data for frames A and B must differ
    expect(spriteA.pixels).not.toEqual(spriteB.pixels)
  })

  it('frame A and frame B pixel data are actually different for all alien types', () => {
    const alienTypes: ClassicAlienType[] = ['squid', 'crab', 'octopus']
    for (const type of alienTypes) {
      const spriteData = PIXEL_ART[type]
      // Raw pixel grids are 8 rows of 14 columns each
      expect(spriteData.a).toHaveLength(8)
      expect(spriteData.b).toHaveLength(8)
      // Frames must be different pixel data
      expect(spriteData.a).not.toEqual(spriteData.b)

      // getAnimationFrame returns the braille-encoded 2-line sprite
      const frameA = getAnimationFrame(spriteData, 0)
      const frameB = getAnimationFrame(spriteData, 15)
      expect(frameA).not.toEqual(frameB)
    }
  })

  it('PBT: for any tick, frame selection is deterministic', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10000 }), (tick) => {
        const alien = makeAlien({ type: 'crab' })
        const state1 = stateWith([alien], {}, { tick })
        const state2 = stateWith([alien], {}, { tick })

        const cmds1 = buildDrawCommands(state1, null)
        const cmds2 = buildDrawCommands(state2, null)

        const sprite1 = cmds1.filter(isSpriteCommand)[0]
        const sprite2 = cmds2.filter(isSpriteCommand)[0]

        // Same tick must produce identical pixels
        expect(sprite1.pixels).toEqual(sprite2.pixels)
      }),
    )
  })
})

// ─── 3. Renderer: UFO color cycling ─────────────────────────────────────────
// ACCEPTANCE: UFO color cycling — parity with TUI

describe('Renderer: UFO color cycling', () => {
  it('UFO sprite command uses getUFOColor(tick) not hardcoded magenta', () => {
    const ufo = makeUFO()

    // Test at tick 0
    const state0 = stateWith([ufo], {}, { tick: 0 })
    const cmds0 = buildDrawCommands(state0, null)
    const ufoSprite0 = cmds0.filter(isSpriteCommand)[0]
    expect(ufoSprite0.color).toBe(getUFOColor(0))

    // Test at tick 25 — should cycle to a different color
    const state25 = stateWith([ufo], {}, { tick: 25 })
    const cmds25 = buildDrawCommands(state25, null)
    const ufoSprite25 = cmds25.filter(isSpriteCommand)[0]
    expect(ufoSprite25.color).toBe(getUFOColor(25))

    // Verify it is NOT the hardcoded magenta (#ff55ff) for all ticks
    // At tick 0, getUFOColor returns '#ff0000', not '#ff55ff'
    expect(ufoSprite0.color).not.toBe('#ff55ff')
  })

  it('getUFOColor cycles through multiple colors across ticks', () => {
    const colors = new Set<string>()
    for (let tick = 0; tick < 60; tick += 5) {
      colors.add(getUFOColor(tick))
    }
    // Should cycle through at least 3 distinct colors
    expect(colors.size).toBeGreaterThanOrEqual(3)
  })

  it('PBT: getUFOColor returns valid hex color for any tick', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100000 }), (tick) => {
        const color = getUFOColor(tick)
        expect(color).toMatch(HEX_COLOR_REGEX)
      }),
    )
  })
})

// ─── 4. Renderer: starfield background ──────────────────────────────────────
// ACCEPTANCE: starfield background — parity with TUI

describe('Renderer: starfield background', () => {
  it('buildDrawCommands includes starfield dot commands when starfield is active', () => {
    const state = stateWith([], {}, { tick: 10 })
    // Pass a starfield config or expect buildDrawCommands to include stars by default
    const commands = buildDrawCommands(state, null)

    // There should be starfield-related commands (rect or sprite with star data)
    // between the clear command and entity commands.
    // Look for small dot/star draw commands
    const starCommands = commands.filter(
      (cmd) =>
        (cmd.type === 'rect' && 'isStar' in cmd) ||
        (cmd.type === 'text' && 'isStar' in cmd) ||
        ('kind' in cmd && (cmd as unknown as { kind: string }).kind === 'star'),
    )

    expect(starCommands.length).toBeGreaterThan(0)
  })

  it('starfield commands appear before entity commands in draw order', () => {
    const alien = makeAlien()
    const state = stateWith([alien], {}, { tick: 5 })
    const commands = buildDrawCommands(state, null)

    // Find the first entity command (sprite for the alien)
    const firstEntityIdx = commands.findIndex((cmd) => cmd.type === 'sprite')
    expect(firstEntityIdx).toBeGreaterThan(0)

    // All starfield commands should come before the first entity command
    const starCommands = commands.filter(
      (cmd, idx) =>
        idx < firstEntityIdx &&
        idx > 0 && // after clear
        (cmd.type === 'rect' || cmd.type === 'text'),
    )
    // There should be star commands between clear and entities
    expect(starCommands.length).toBeGreaterThan(0)
  })

  it('star count is consistent with density configuration', () => {
    const state = stateWith([], {}, { tick: 0 })
    const commands1 = buildDrawCommands(state, null)
    const commands2 = buildDrawCommands(state, null)

    // Same state should produce same number of star commands
    const countStars = (cmds: DrawCommand[]) =>
      cmds.filter(
        (cmd) =>
          (cmd.type === 'rect' && 'isStar' in cmd) ||
          (cmd.type === 'text' && 'isStar' in cmd) ||
          ('kind' in cmd && (cmd as unknown as { kind: string }).kind === 'star'),
      ).length
    expect(countStars(commands1)).toBe(countStars(commands2))
    expect(countStars(commands1)).toBeGreaterThan(0)
  })
})

// ─── 5. Effects: dissolve particles on entity death ─────────────────────────
// ACCEPTANCE: dissolve particles on entity death — parity with TUI

describe('Effects: dissolve particles on entity death', () => {
  it('alien death produces death effect commands (explosion-*)', () => {
    // The legacy dissolve system was replaced by the smooth ExplosionSystem.
    // Any explosion-* kind counts as a death-effect particle.
    const alien = makeAlien({ id: 'alien-0', alive: true })
    const prevState = stateWith([alien], {}, { tick: 100 })

    const deadAlien = makeAlien({ id: 'alien-0', alive: false })
    const currentState = stateWith([deadAlien], {}, { tick: 101 })

    const commands = buildDrawCommands(currentState, null, prevState)

    const deathCommands = commands.filter(
      (cmd) =>
        'kind' in cmd &&
        typeof (cmd as { kind?: string }).kind === 'string' &&
        (cmd as { kind: string }).kind.startsWith('explosion-'),
    )
    expect(deathCommands.length).toBeGreaterThan(0)
  })

  it('death-effect debris carries the dying entity color', () => {
    const alien = makeAlien({ type: 'squid', alive: true })
    const prevState = stateWith([alien], {}, { tick: 100 })

    const deadAlien = makeAlien({ type: 'squid', alive: false })
    const currentState = stateWith([deadAlien], {}, { tick: 101 })

    const commands = buildDrawCommands(currentState, null, prevState)
    const debris = commands.filter((cmd) => 'kind' in cmd && (cmd as { kind?: string }).kind === 'explosion-debris')

    expect(debris.length).toBeGreaterThan(0)
    const expectedColor = COLORS.alien.squid
    for (const cmd of debris) {
      const fill = (cmd as any).fill
      expect(fill).toBe(expectedColor)
    }
  })

  it('no dissolve particles when no entities died', () => {
    const alien = makeAlien({ alive: true })
    const prevState = stateWith([alien], {}, { tick: 100 })
    const currentState = stateWith([alien], {}, { tick: 101 })

    const commands = buildDrawCommands(currentState, null, prevState)

    const particleCommands = commands.filter(
      (cmd) => ('kind' in cmd && (cmd as unknown as { kind: string }).kind === 'dissolve') || 'isParticle' in cmd,
    )
    expect(particleCommands).toHaveLength(0)
  })
})

// ─── 6. Effects: confetti on victory ────────────────────────────────────────
// ACCEPTANCE: confetti on victory — parity with TUI

describe('Effects: confetti on victory', () => {
  it('victory state (game_over + lives > 0) produces confetti commands', () => {
    const player = makePlayer({ lives: 2, alive: true })
    const state = stateWith(
      [],
      { 'player-1': player },
      {
        status: 'game_over',
        lives: 2,
        tick: 50,
      },
    )

    const commands = buildDrawCommands(state, 'player-1')

    const confettiCommands = commands.filter(
      (cmd) =>
        ('kind' in cmd && (cmd as unknown as { kind: string }).kind === 'confetti') ||
        ('isConfetti' in cmd && (cmd as unknown as { isConfetti: boolean }).isConfetti),
    )
    expect(confettiCommands.length).toBeGreaterThan(0)
  })

  it('defeat state (game_over + lives === 0) does NOT produce confetti', () => {
    const player = makePlayer({ lives: 0, alive: false })
    const state = stateWith(
      [],
      { 'player-1': player },
      {
        status: 'game_over',
        lives: 0,
        tick: 50,
      },
    )

    const commands = buildDrawCommands(state, 'player-1')

    const confettiCommands = commands.filter(
      (cmd) =>
        ('kind' in cmd && (cmd as unknown as { kind: string }).kind === 'confetti') ||
        ('isConfetti' in cmd && (cmd as unknown as { isConfetti: boolean }).isConfetti),
    )
    expect(confettiCommands).toHaveLength(0)
  })

  it('confetti particles use multiple colors', () => {
    const player = makePlayer({ lives: 3, alive: true })
    const state = stateWith(
      [],
      { 'player-1': player },
      {
        status: 'game_over',
        lives: 3,
        tick: 100, // later tick for more confetti variety
      },
    )

    const commands = buildDrawCommands(state, 'player-1')

    const confettiColors = new Set<string>()
    for (const cmd of commands) {
      if (('kind' in cmd && (cmd as unknown as { kind: string }).kind === 'confetti') || 'isConfetti' in cmd) {
        const color = 'color' in cmd ? (cmd as { color: string }).color : null
        const fill = 'fill' in cmd ? (cmd as { fill: string }).fill : null
        if (color) confettiColors.add(color)
        if (fill) confettiColors.add(fill)
      }
    }

    // Confetti should have at least 3 distinct colors
    expect(confettiColors.size).toBeGreaterThanOrEqual(3)
  })
})

// ─── 7. HUD: lives displayed as hearts ──────────────────────────────────────
// ACCEPTANCE: lives displayed as hearts — parity with TUI

describe('HUD: lives displayed as hearts', () => {
  // Hearts can live in a standalone text command OR as a segment of a
  // right-aligned text-row (used now for the lives HUD so label + hearts
  // share a baseline). Collect heart-bearing text from both.
  function collectHeartText(commands: DrawCommand[]): string {
    const parts: string[] = []
    for (const cmd of commands) {
      if (cmd.type === 'text' && /[♥♡❤]/.test((cmd as { text: string }).text)) {
        parts.push((cmd as { text: string }).text)
      }
      if (cmd.type === 'text-row') {
        for (const seg of (cmd as { segments: { text: string }[] }).segments) {
          if (/[♥♡❤]/.test(seg.text)) parts.push(seg.text)
        }
      }
    }
    return parts.join('')
  }

  it('3 lives with maxLives 3 renders 3 filled hearts and 0 empty', () => {
    const player = makePlayer({ lives: 3 })
    const state = stateWith([], { 'player-1': player }, { maxLives: 3, lives: 3 })
    const text = collectHeartText(buildDrawCommands(state, 'player-1'))
    expect(text.length).toBeGreaterThan(0)
    expect((text.match(/[♥❤]/g) || []).length).toBe(3)
    expect((text.match(/[♡]/g) || []).length).toBe(0)
  })

  it('1 life with maxLives 3 renders 1 filled heart and 2 empty', () => {
    const player = makePlayer({ lives: 1 })
    const state = stateWith([], { 'player-1': player }, { maxLives: 3, lives: 1 })
    const text = collectHeartText(buildDrawCommands(state, 'player-1'))
    expect(text.length).toBeGreaterThan(0)
    expect((text.match(/[♥❤]/g) || []).length).toBe(1)
    expect((text.match(/[♡]/g) || []).length).toBe(2)
  })

  it('0 lives with maxLives 3 renders 0 filled hearts and 3 empty', () => {
    const player = makePlayer({ lives: 0, alive: false })
    const state = stateWith([], { 'player-1': player }, { maxLives: 3, lives: 0 })
    const text = collectHeartText(buildDrawCommands(state, 'player-1'))
    expect(text.length).toBeGreaterThan(0)
    expect((text.match(/[♥❤]/g) || []).length).toBe(0)
    expect((text.match(/[♡]/g) || []).length).toBe(3)
  })

  it('PBT: filled + empty hearts always equals maxLives', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 1, max: 5 }), (lives, maxLives) => {
        const clampedLives = Math.min(lives, maxLives)
        const player = makePlayer({ lives: clampedLives, alive: clampedLives > 0 })
        const state = stateWith([], { 'player-1': player }, { maxLives, lives: clampedLives })
        const text = collectHeartText(buildDrawCommands(state, 'player-1'))
        if (text.length > 0) {
          const filledCount = (text.match(/[♥❤]/g) || []).length
          const emptyCount = (text.match(/[♡]/g) || []).length
          expect(filledCount + emptyCount).toBe(maxLives)
        }
      }),
    )
  })
})

// ─── 8. Audio: sounds actually play ─────────────────────────────────────────
// ACCEPTANCE: audio sounds actually play — parity with TUI

describe('Audio: sounds actually play', () => {
  function createMockAudioContext() {
    const ctx = {
      state: 'running' as AudioContextState,
      currentTime: 0,
      sampleRate: 44100,
      createOscillator: vi.fn(() => ({
        type: 'sine',
        frequency: {
          value: 440,
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
      createGain: vi.fn(() => ({
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      createBufferSource: vi.fn(() => ({
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
      createBuffer: vi.fn((c: number, l: number, sr: number) => ({
        numberOfChannels: c,
        length: l,
        sampleRate: sr,
        getChannelData: vi.fn(() => new Float32Array(l)),
      })),
      destination: {},
      suspend: vi.fn(() => Promise.resolve()),
      resume: vi.fn(() => Promise.resolve()),
    }
    return { ctx }
  }

  it('after initialize(), play("shoot") creates an oscillator and starts it', async () => {
    const { WebAudioAdapter } = await import('./adapters/WebAudioAdapter')
    const { ctx } = createMockAudioContext()
    const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

    adapter.play('shoot')

    expect(ctx.createOscillator).toHaveBeenCalled()
    const osc = ctx.createOscillator.mock.results[0].value
    expect(osc.start).toHaveBeenCalled()
    expect(osc.stop).toHaveBeenCalled()
  })

  it('before initialize(), play() is silent (no crash)', async () => {
    const { WebAudioAdapter } = await import('./adapters/WebAudioAdapter')
    const adapter = new WebAudioAdapter()

    expect(() => adapter.play('shoot')).not.toThrow()
    expect(() => adapter.play('alien_killed')).not.toThrow()
    expect(() => adapter.play('player_died')).not.toThrow()
  })

  it('setMuted(true) prevents playback', async () => {
    const { WebAudioAdapter } = await import('./adapters/WebAudioAdapter')
    const { ctx } = createMockAudioContext()
    const adapter = new WebAudioAdapter(ctx as unknown as AudioContext)

    adapter.setMuted(true)
    const countBefore = ctx.createOscillator.mock.calls.length
    adapter.play('shoot')

    expect(ctx.createOscillator.mock.calls.length).toBe(countBefore)
  })
})

// ─── 9. Scaling: HUD readable at different scales ──────────────────────────
// ACCEPTANCE: HUD readable at different scales — parity with TUI

describe('Scaling: HUD readable at different scales', () => {
  it('at scale 0.5, HUD text commands have at least 10px effective font size', () => {
    const player = makePlayer()
    const state = stateWith([], { 'player-1': player })

    // buildDrawCommands should accept a scale parameter
    const commands = buildDrawCommands(state, 'player-1', undefined, 0.5)

    const textCommands = commands.filter((cmd) => cmd.type === 'text') as (DrawCommand & {
      type: 'text'
    })[]

    expect(textCommands.length).toBeGreaterThan(0)
    for (const cmd of textCommands) {
      // Parse font size from the font string (e.g., "16px monospace")
      const fontMatch = (cmd.font ?? '16px monospace').match(/(\d+)px/)
      expect(fontMatch).toBeTruthy()
      const fontSize = Number.parseInt(fontMatch![1], 10)
      // Effective size at 0.5 scale should still be readable (>= 10px)
      const effectiveSize = fontSize * 0.5
      expect(effectiveSize).toBeGreaterThanOrEqual(10)
    }
  })

  it('at scale 2.0, HUD text does not overflow internal canvas width', () => {
    const player = makePlayer()
    const state = stateWith([], { 'player-1': player })

    // HUD is drawn at internal canvas resolution (960×576). CSS scale happens
    // outside the canvas, so HUD draw coords must stay within internal bounds.
    const internalCanvasWidth = 120 * CELL_W // 960
    const commands = buildDrawCommands(state, 'player-1', undefined, 2.0)

    const textCommands = commands.filter((cmd) => cmd.type === 'text') as (DrawCommand & {
      type: 'text'
    })[]

    for (const cmd of textCommands) {
      expect(cmd.x).toBeLessThan(internalCanvasWidth)
      expect(cmd.x).toBeGreaterThanOrEqual(0)
    }
  })

  it('PBT: for any positive scale, HUD text commands remain within internal canvas bounds', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.25, max: 4.0, noNaN: true }), (scale) => {
        const player = makePlayer()
        const state = stateWith([], { 'player-1': player })

        // Internal canvas dimensions are fixed at 960×576 regardless of scale
        const internalW = 120 * CELL_W
        const internalH = 36 * CELL_H
        const commands = buildDrawCommands(state, 'player-1', undefined, scale)

        const textCommands = commands.filter((cmd) => cmd.type === 'text') as (DrawCommand & {
          type: 'text'
        })[]

        for (const cmd of textCommands) {
          expect(cmd.x).toBeGreaterThanOrEqual(0)
          expect(cmd.x).toBeLessThan(internalW)
          expect(cmd.y).toBeGreaterThanOrEqual(0)
          expect(cmd.y).toBeLessThan(internalH)
        }
      }),
    )
  })
})

// ─── 11. HUD hearts: larger size for visibility ────────────────────────────
// ACCEPTANCE: hearts are visibly large — not tiny corner dots

describe('HUD: hearts are visibly large', () => {
  it('heart font size is at least 24px', () => {
    const player = makePlayer({ lives: 3 })
    const state = stateWith([], { 'player-1': player }, { maxLives: 3, lives: 3 })

    const commands = buildDrawCommands(state, 'player-1')
    // Hearts live as a segment inside the right-aligned text-row, or as a
    // standalone text command (legacy fallback).
    const fonts: string[] = []
    for (const cmd of commands) {
      if (cmd.type === 'text' && /[♥♡]/.test((cmd as { text: string }).text)) {
        fonts.push((cmd as { font?: string }).font ?? '')
      }
      if (cmd.type === 'text-row') {
        for (const seg of (cmd as { segments: { text: string; font?: string }[] }).segments) {
          if (/[♥♡]/.test(seg.text)) fonts.push(seg.font ?? '')
        }
      }
    }
    expect(fonts.length).toBeGreaterThan(0)
    for (const f of fonts) {
      const fontMatch = f.match(/(\d+)px/)
      expect(fontMatch).toBeTruthy()
      const size = Number.parseInt(fontMatch![1], 10)
      expect(size).toBeGreaterThanOrEqual(24)
    }
  })

  it('HUD includes a "LIVES" label for accessibility', () => {
    const player = makePlayer({ lives: 3 })
    const state = stateWith([], { 'player-1': player }, { maxLives: 3, lives: 3 })

    const commands = buildDrawCommands(state, 'player-1')
    // "LIVES" may live in a standalone text command OR as a segment inside a
    // right-aligned text-row (compound HUD row used for the lives block).
    const inText = commands.some((cmd) => cmd.type === 'text' && /LIVES/i.test((cmd as { text: string }).text))
    const inRow = commands.some(
      (cmd) =>
        cmd.type === 'text-row' &&
        (cmd as { segments: { text: string }[] }).segments.some((s) => /LIVES/i.test(s.text)),
    )
    expect(inText || inRow).toBe(true)
  })
})

// ─── HUD lives row: right-aligned, shared baseline, no y-nudge ─────────────
// ACCEPTANCE: label and hearts share a single y and baseline, layout
// driven by canvas measureText (not hand-rolled fontSize * ratio guesses).

describe('HUD: lives row alignment', () => {
  it('emits a right-aligned text-row carrying LIVES label + hearts as segments', () => {
    const player = makePlayer({ lives: 2 })
    const state = stateWith([], { 'player-1': player }, { maxLives: 3, lives: 2 })
    const commands = buildDrawCommands(state, 'player-1')
    const row = commands.find((c) => c.type === 'text-row' && (c as { kind?: string }).kind === 'hud-lives-row') as
      | (DrawCommand & { type: 'text-row' })
      | undefined
    expect(row).toBeDefined()
    expect(row!.align).toBe('right')
    expect(row!.baseline).toBe('top')
    expect(row!.segments.length).toBe(2)
    // First segment is the label; second is the hearts.
    expect(row!.segments[0].text).toMatch(/LIVES/i)
    expect(row!.segments[1].text).toMatch(/[♥♡]/)
    // Heart segment reflects clamped lives
    expect([...row!.segments[1].text].filter((c) => c === '\u2665')).toHaveLength(2)
    expect([...row!.segments[1].text].filter((c) => c === '\u2661')).toHaveLength(1)
  })

  it('lives row right edge is anchored to the right side of the canvas', () => {
    const player = makePlayer({ lives: 3 })
    const state = stateWith([], { 'player-1': player }, { maxLives: 3, lives: 3 })
    const commands = buildDrawCommands(state, 'player-1')
    const row = commands.find((c) => c.type === 'text-row' && (c as { kind?: string }).kind === 'hud-lives-row') as
      | (DrawCommand & { type: 'text-row' })
      | undefined
    expect(row).toBeDefined()
    // Right edge lives within the last ~24px of the canvas
    const canvasRight = 120 * 8 // STANDARD_WIDTH * CELL_W
    expect(row!.x).toBeLessThanOrEqual(canvasRight)
    expect(row!.x).toBeGreaterThan(canvasRight - 40)
  })

  it('both segments are on the SAME y (no +2 nudge between label and hearts)', () => {
    const player = makePlayer({ lives: 1 })
    const state = stateWith([], { 'player-1': player }, { maxLives: 3, lives: 1 })
    const commands = buildDrawCommands(state, 'player-1')
    const row = commands.find((c) => c.type === 'text-row' && (c as { kind?: string }).kind === 'hud-lives-row') as
      | (DrawCommand & { type: 'text-row' })
      | undefined
    expect(row).toBeDefined()
    // A single y is carried by the row — both segments render from it
    expect(typeof row!.y).toBe('number')
    // textBaseline 'top' means the y IS the top edge; no per-segment offsets
    expect(row!.baseline).toBe('top')
  })

  it('hearts segment preserves large font size (>= 24px)', () => {
    const player = makePlayer({ lives: 2 })
    const state = stateWith([], { 'player-1': player }, { maxLives: 3, lives: 2 })
    const commands = buildDrawCommands(state, 'player-1')
    const row = commands.find((c) => c.type === 'text-row' && (c as { kind?: string }).kind === 'hud-lives-row') as
      | (DrawCommand & { type: 'text-row' })
      | undefined
    expect(row).toBeDefined()
    const heartsFont = row!.segments[1].font ?? ''
    const sizeMatch = heartsFont.match(/(\d+)px/)
    expect(sizeMatch).toBeTruthy()
    expect(Number.parseInt(sizeMatch![1], 10)).toBeGreaterThanOrEqual(24)
  })

  it('row carries shadowBlur on both segments (HUD glow contract)', () => {
    const player = makePlayer({ lives: 2 })
    const state = stateWith([], { 'player-1': player }, { maxLives: 3, lives: 2 })
    const commands = buildDrawCommands(state, 'player-1')
    const row = commands.find((c) => c.type === 'text-row' && (c as { kind?: string }).kind === 'hud-lives-row') as
      | (DrawCommand & { type: 'text-row' })
      | undefined
    expect(row).toBeDefined()
    for (const seg of row!.segments) {
      expect(typeof seg.shadowBlur).toBe('number')
      expect(seg.shadowBlur as number).toBeGreaterThan(0)
    }
  })
})

// ─── 12. Starfield: parallax depth ──────────────────────────────────────────
// ACCEPTANCE: stars have multiple sizes based on depth layer

describe('Starfield: parallax depth', () => {
  it('stars have multiple distinct sizes reflecting depth layers', () => {
    const state = stateWith([], {}, { tick: 0 })
    const commands = buildDrawCommands(state, null)

    const starCommands = commands.filter(
      (cmd) => cmd.type === 'rect' && (cmd as DrawCommand & { isStar?: boolean }).isStar,
    ) as (DrawCommand & { type: 'rect' })[]

    expect(starCommands.length).toBeGreaterThan(0)

    // At least 2 distinct sizes should be present (parallax depth)
    const sizes = new Set(starCommands.map((c) => `${c.width}x${c.height}`))
    expect(sizes.size).toBeGreaterThanOrEqual(2)
  })
})

// ─── 13. Bullet interpolation ──────────────────────────────────────────────
// ACCEPTANCE: bullets interpolate between ticks (use prevState)

describe('Bullets: interpolation between ticks', () => {
  it('bullet position interpolates when prevState is provided and position changed', () => {
    const bulletA = { kind: 'bullet' as const, id: 'b1', x: 50, y: 20, ownerId: 'p1', dy: -1 as -1 | 1 }
    const bulletB = { kind: 'bullet' as const, id: 'b1', x: 50, y: 18, ownerId: 'p1', dy: -1 as -1 | 1 }

    const prev = stateWith([bulletA], {}, { tick: 100 })
    const curr = stateWith([bulletB], {}, { tick: 101 })

    const cmds = buildDrawCommands(curr, null, prev)
    const bulletCmds = cmds.filter(
      (cmd) => cmd.type === 'rect' && !(cmd as any).isStar && !(cmd as any).isParticle && !(cmd as any).isConfetti,
    ) as (DrawCommand & { type: 'rect' })[]

    // Filter out barriers by checking y range (bullets are in the middle of the screen)
    const bulletRect = bulletCmds.find((c) => c.y >= 18 * CELL_H && c.y <= 22 * CELL_H)
    expect(bulletRect).toBeDefined()
  })
})

// ─── 13b. Bullet frame interpolation (lerpT) ──────────────────────────────
// ACCEPTANCE: buildDrawCommands accepts a lerpT param for smooth per-frame
// interpolation between server ticks.

describe('Bullet frame interpolation', () => {
  // Helper: extract the bullet rect (filter out stars/particles/confetti/barriers)
  // by matching on bullet fill colors.
  function findBulletRect(cmds: DrawCommand[]): (DrawCommand & { type: 'rect' }) | undefined {
    const bulletFills = new Set<string>([COLORS.bullet.player, COLORS.bullet.alien])
    return cmds.find(
      (cmd): cmd is DrawCommand & { type: 'rect' } =>
        cmd.type === 'rect' &&
        !(cmd as any).isStar &&
        !(cmd as any).isParticle &&
        !(cmd as any).isConfetti &&
        bulletFills.has(cmd.fill),
    )
  }

  it('bullet renders at prev position when lerpT=0', () => {
    const bulletA = { kind: 'bullet' as const, id: 'b1', x: 50, y: 20, ownerId: 'p1', dy: -1 as -1 | 1 }
    const bulletB = { kind: 'bullet' as const, id: 'b1', x: 50, y: 18, ownerId: 'p1', dy: -1 as -1 | 1 }
    const prev = stateWith([bulletA], {}, { tick: 100 })
    const curr = stateWith([bulletB], {}, { tick: 101 })

    const cmds = buildDrawCommands(curr, null, prev, 1, 0)
    const bulletRect = findBulletRect(cmds)
    expect(bulletRect).toBeDefined()
    expect(bulletRect!.y).toBeCloseTo(20 * CELL_H, 5)
    expect(bulletRect!.x).toBeCloseTo(50 * CELL_W, 5)
  })

  it('bullet renders at current position when lerpT=1', () => {
    const bulletA = { kind: 'bullet' as const, id: 'b1', x: 50, y: 20, ownerId: 'p1', dy: -1 as -1 | 1 }
    const bulletB = { kind: 'bullet' as const, id: 'b1', x: 50, y: 18, ownerId: 'p1', dy: -1 as -1 | 1 }
    const prev = stateWith([bulletA], {}, { tick: 100 })
    const curr = stateWith([bulletB], {}, { tick: 101 })

    const cmds = buildDrawCommands(curr, null, prev, 1, 1)
    const bulletRect = findBulletRect(cmds)
    expect(bulletRect).toBeDefined()
    expect(bulletRect!.y).toBeCloseTo(18 * CELL_H, 5)
    expect(bulletRect!.x).toBeCloseTo(50 * CELL_W, 5)
  })

  it('bullet renders at quarter position when lerpT=0.25', () => {
    const bulletA = { kind: 'bullet' as const, id: 'b1', x: 50, y: 20, ownerId: 'p1', dy: -1 as -1 | 1 }
    const bulletB = { kind: 'bullet' as const, id: 'b1', x: 50, y: 16, ownerId: 'p1', dy: -1 as -1 | 1 }
    const prev = stateWith([bulletA], {}, { tick: 100 })
    const curr = stateWith([bulletB], {}, { tick: 101 })

    // Linear: 20 + (16 - 20) * 0.25 = 19
    const cmds = buildDrawCommands(curr, null, prev, 1, 0.25)
    const bulletRect = findBulletRect(cmds)
    expect(bulletRect).toBeDefined()
    expect(bulletRect!.y).toBeCloseTo(19 * CELL_H, 5)
  })

  it('PBT: for any lerpT in [0,1], bullet y is between prev.y and state.y', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 2, max: 30 }),
        fc.integer({ min: 2, max: 30 }),
        (lerpT, prevY, currY) => {
          const bulletA = { kind: 'bullet' as const, id: 'b1', x: 50, y: prevY, ownerId: 'p1', dy: -1 as -1 | 1 }
          const bulletB = { kind: 'bullet' as const, id: 'b1', x: 50, y: currY, ownerId: 'p1', dy: -1 as -1 | 1 }
          const prev = stateWith([bulletA], {}, { tick: 100 })
          const curr = stateWith([bulletB], {}, { tick: 101 })

          const cmds = buildDrawCommands(curr, null, prev, 1, lerpT)
          const bulletRect = findBulletRect(cmds)
          if (!bulletRect) return false

          const lo = Math.min(prevY, currY) * CELL_H
          const hi = Math.max(prevY, currY) * CELL_H
          // Use small epsilon for floating point tolerance
          return bulletRect.y >= lo - 1e-6 && bulletRect.y <= hi + 1e-6
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ─── 14. Alien color cycling ────────────────────────────────────────────────
// ACCEPTANCE: alien gradient brightness modulates over time

describe('Alien color cycling', () => {
  it('alien bright color differs between tick 0 and tick 30', () => {
    const alien = makeAlien({ type: 'squid' })
    const s0 = stateWith([alien], {}, { tick: 0 })
    const s30 = stateWith([alien], {}, { tick: 30 })

    const cmds0 = buildDrawCommands(s0, null)
    const cmds30 = buildDrawCommands(s30, null)

    const sprite0 = cmds0.filter(isSpriteCommand)[0] as GradientSpriteCommand
    const sprite30 = cmds30.filter(isSpriteCommand)[0] as GradientSpriteCommand

    expect(hasGradientColors(sprite0)).toBe(true)
    expect(hasGradientColors(sprite30)).toBe(true)
    // Color cycling means bright color changes over time
    expect(sprite0.gradientColors.bright).not.toBe(sprite30.gradientColors.bright)
  })
})

// ─── 10. Renderer: wave transition screen ───────────────────────────────────
// ACCEPTANCE: wave transition screen — parity with TUI

describe('Renderer: wave transition screen', () => {
  it('status wipe_hold produces wave announcement text command', () => {
    const state = stateWith(
      [],
      {},
      {
        status: 'wipe_hold',
        wipeWaveNumber: 3,
        tick: 50,
      },
    )

    const commands = buildDrawCommands(state, null)

    // Should include a text command with "WAVE" or wave number
    const waveTextCommands = commands.filter(
      (cmd) => cmd.type === 'text' && /wave/i.test((cmd as DrawCommand & { type: 'text' }).text),
    )
    expect(waveTextCommands.length).toBeGreaterThan(0)

    // The wave number should appear in the text
    const waveText = (waveTextCommands[0] as DrawCommand & { type: 'text' }).text
    expect(waveText).toMatch(/3/)
  })

  it('status playing does NOT produce big wave announcement', () => {
    const state = stateWith(
      [],
      {},
      {
        status: 'playing',
        wipeWaveNumber: null,
        tick: 50,
      },
    )

    const commands = buildDrawCommands(state, null)

    // The big wave announcement uses 32px font; the HUD wave counter uses smaller font
    const bigWaveCommands = commands.filter(
      (cmd) =>
        cmd.type === 'text' &&
        /wave\s+\d/i.test((cmd as DrawCommand & { type: 'text' }).text) &&
        /32px/.test((cmd as DrawCommand & { type: 'text' }).font ?? ''),
    )
    expect(bigWaveCommands).toHaveLength(0)
  })

  it('wave number in announcement matches state.wipeWaveNumber', () => {
    for (const waveNum of [1, 2, 5, 10]) {
      const state = stateWith(
        [],
        {},
        {
          status: 'wipe_hold',
          wipeWaveNumber: waveNum,
          tick: 50,
        },
      )

      const commands = buildDrawCommands(state, null)

      const waveTextCommands = commands.filter(
        (cmd) => cmd.type === 'text' && /wave/i.test((cmd as DrawCommand & { type: 'text' }).text),
      )
      expect(waveTextCommands.length).toBeGreaterThan(0)

      const waveText = (waveTextCommands[0] as DrawCommand & { type: 'text' }).text
      expect(waveText).toContain(String(waveNum))
    }
  })
})

// ─── 11. Entrance animation ─────────────────────────────────────────────────
// ACCEPTANCE: aliens animate into formation during wipe_reveal

describe('Entrance animation', () => {
  const FORMATION_Y = 5
  const _SPRITE_H = 2 // SPRITE_SIZE.alien.height

  it('during wipe_reveal, alien sprites are rendered at entrance-animated positions', () => {
    const alien = makeAlien({ id: 'a-0', y: FORMATION_Y, row: 0, col: 0 })
    // At start of reveal (ticksRemaining = REVEAL_TICKS = 45), alien should be above formation
    const earlyState = stateWith(
      [alien],
      {},
      {
        status: 'wipe_reveal',
        wipeTicksRemaining: 45,
        wipeWaveNumber: 2,
        tick: 0,
      },
    )
    // Midway through reveal
    const midState = stateWith(
      [alien],
      {},
      {
        status: 'wipe_reveal',
        wipeTicksRemaining: 40,
        wipeWaveNumber: 2,
        tick: 5,
      },
    )

    const earlyCmds = buildDrawCommands(earlyState, null)
    const midCmds = buildDrawCommands(midState, null)

    const earlySprite = earlyCmds.filter(isSpriteCommand).find((c) => c.width === 7 * CELL_W)
    const midSprite = midCmds.filter(isSpriteCommand).find((c) => c.width === 7 * CELL_W)

    expect(earlySprite).toBeDefined()
    expect(midSprite).toBeDefined()

    // Early in animation, alien should be above (negative or smaller y) relative to mid
    // At the very least, y must NOT be equal to formation y during animation
    const formationPixelY = FORMATION_Y * CELL_H
    expect(earlySprite!.y).not.toBe(formationPixelY)
    // Progress moves alien toward formation y: mid y should be >= early y
    expect(midSprite!.y).toBeGreaterThan(earlySprite!.y)
  })

  it('after wipe_reveal ends (playing), aliens are at formation y', () => {
    const alien = makeAlien({ id: 'a-0', y: FORMATION_Y, row: 0, col: 0 })
    const state = stateWith(
      [alien],
      {},
      {
        status: 'playing',
        wipeTicksRemaining: null,
        wipeWaveNumber: null,
        tick: 100,
      },
    )

    const commands = buildDrawCommands(state, null)
    const sprite = commands.filter(isSpriteCommand).find((c) => c.width === 7 * CELL_W)
    expect(sprite).toBeDefined()
    expect(sprite!.y).toBe(FORMATION_Y * CELL_H)
  })

  it('PBT: entrance y is always within [-MAX_OFFSET, formation_y] pixels during wipe_reveal', () => {
    // Per polish task #8, aliens start at y offset = -CELL_H * 30 (deep
    // off-screen) so the slide-in feels dramatic. The previous bound of
    // -SPRITE_H was too tight for the new entrance curve.
    const MAX_ENTRANCE_OFFSET_CELLS = 30
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 45 }),
        fc.integer({ min: 3, max: 20 }),
        fc.integer({ min: 0, max: 14 }),
        (ticksRemaining, formationY, col) => {
          const alien = makeAlien({ id: 'a-0', y: formationY, row: 0, col })
          const state = stateWith(
            [alien],
            {},
            {
              status: 'wipe_reveal',
              wipeTicksRemaining: ticksRemaining,
              wipeWaveNumber: 1,
              tick: 0,
            },
          )
          const commands = buildDrawCommands(state, null)
          const sprite = commands.filter(isSpriteCommand).find((c) => c.width === 7 * CELL_W)
          if (!sprite) return true // alien not rendered is acceptable (e.g. filtered)
          const minPx = (formationY - MAX_ENTRANCE_OFFSET_CELLS) * CELL_H
          const maxPx = formationY * CELL_H
          return sprite.y >= minPx - 0.001 && sprite.y <= maxPx + 0.001
        },
      ),
      { numRuns: 50 },
    )
  })

  it('PBT: entrance y never exceeds formation y (monotonic approach from above)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 45 }),
        fc.integer({ min: 3, max: 20 }),
        fc.integer({ min: 0, max: 14 }),
        (ticksRemaining, formationY, col) => {
          const alien = makeAlien({ id: 'a-0', y: formationY, row: 0, col })
          const state = stateWith(
            [alien],
            {},
            {
              status: 'wipe_reveal',
              wipeTicksRemaining: ticksRemaining,
              wipeWaveNumber: 1,
              tick: 0,
            },
          )
          const commands = buildDrawCommands(state, null)
          const sprite = commands.filter(isSpriteCommand).find((c) => c.width === 7 * CELL_W)
          if (!sprite) return true
          return sprite.y <= formationY * CELL_H + 0.001
        },
      ),
      { numRuns: 50 },
    )
  })
})

// ─── Effect state cleanup ────────────────────────────────────────────────────
// Module-level effect state in canvasRenderer (seenDeadAlienIds, etc.) must be
// reset when a new game begins, otherwise dead-alien IDs from the previous game
// suppress the dissolve effect when the same IDs reappear.

describe('Effect state cleanup', () => {
  it('seenDeadAlienIds are reset between games (via resetEffects)', () => {
    const isExplosion = (cmd: DrawCommand) =>
      'kind' in cmd &&
      typeof (cmd as { kind?: string }).kind === 'string' &&
      (cmd as { kind: string }).kind.startsWith('explosion-')

    // Game 1: alien 'a1' dies — should produce explosion effect commands.
    const aliveAlien1 = makeAlien({ id: 'a1', alive: true })
    const prev1 = stateWith([aliveAlien1], {}, { tick: 100 })
    const deadAlien1 = makeAlien({ id: 'a1', alive: false })
    const curr1 = stateWith([deadAlien1], {}, { tick: 101 })

    const firstCommands = buildDrawCommands(curr1, null, prev1)
    expect(firstCommands.filter(isExplosion).length).toBeGreaterThan(0)

    // Drain — advance past the explosion lifetime (28 ticks).
    for (let t = 200; t < 260; t++) {
      const idle = stateWith([], {}, { tick: t })
      buildDrawCommands(idle, null, idle)
    }
    const drainedCommands = buildDrawCommands(stateWith([], {}, { tick: 260 }), null, stateWith([], {}, { tick: 259 }))
    expect(drainedCommands.filter(isExplosion)).toHaveLength(0)

    // Simulate quit → new game: reset module-level effect state.
    resetEffects()

    // Game 2: same ID 'a1' — without reset, seenDeadAlienIds would suppress
    // the explosion because 'a1' is already in the set.
    const aliveAlien2 = makeAlien({ id: 'a1', alive: true })
    const prev2 = stateWith([aliveAlien2], {}, { tick: 100 })
    const deadAlien2 = makeAlien({ id: 'a1', alive: false })
    const curr2 = stateWith([deadAlien2], {}, { tick: 101 })

    const secondCommands = buildDrawCommands(curr2, null, prev2)
    expect(secondCommands.filter(isExplosion).length).toBeGreaterThan(0)
  })
})

// ─── Feature 12: Screen shake + damage flash ─────────────────────────────────

describe('screen shake and damage flash', () => {
  // Import lazily so the shared beforeEach resets effects (including shake/flash).
  it('life loss triggers shake', async () => {
    const { _getShakeStateForTests } = await import('./renderer/canvasRenderer')
    const prev = stateWith([], {}, { tick: 10, lives: 3 })
    const curr = stateWith([], {}, { tick: 11, lives: 2 })
    buildDrawCommands(curr, null, prev)
    const shake = _getShakeStateForTests()
    expect(shake.ticks).toBeGreaterThan(0)
    expect(shake.intensity).toBeGreaterThan(0)
  })

  it('score increase does NOT trigger a full-screen white flash (user rejected — strobing)', async () => {
    // Regression guard: previously, every score increase (i.e. every alien
    // kill) triggered a full-screen white overlay for 2 ticks. In a wave
    // where aliens die rapidly this strobed the entire canvas and read as
    // "explosions making the whole screen flicker". The per-kill flash has
    // been removed; kills are now communicated purely by local explosion
    // particles + the score-bump HUD animation. Player-death still flashes
    // red (rare event, semantically valid) — see test below.
    const { _getFlashStateForTests } = await import('./renderer/canvasRenderer')
    const prev = stateWith([], {}, { tick: 10, score: 0 })
    const curr = stateWith([], {}, { tick: 11, score: 10 })
    buildDrawCommands(curr, null, prev)
    const flash = _getFlashStateForTests()
    expect(flash.ticks).toBe(0)
  })

  it('player hit (lives decrease) still triggers a red flash', async () => {
    // Positive guard: the red full-screen flash on player damage stays —
    // it's rare and communicates "you just lost a life". But the peak
    // alpha is capped at 0.25 (down from the original 0.35) so it reads
    // as a damage hint instead of a jarring strobe in frequent-hit coop
    // play.
    const { _getFlashStateForTests, resetEffects } = await import('./renderer/canvasRenderer')
    resetEffects()
    const prev = stateWith([], {}, { tick: 10, lives: 3 })
    const curr = stateWith([], {}, { tick: 11, lives: 2 })
    buildDrawCommands(curr, null, prev)
    const flash = _getFlashStateForTests()
    expect(flash.ticks).toBeGreaterThan(0)
    // Red-ish color
    expect(flash.color).toMatch(/255,\s*0,\s*0/)
    // Peak alpha capped at 0.25 (was 0.35 — too aggressive)
    const alphaMatch = flash.color.match(/0?\.\d+\s*\)/)
    expect(alphaMatch).not.toBeNull()
    const alpha = Number.parseFloat(alphaMatch![0])
    expect(alpha).toBeLessThanOrEqual(0.25)
  })

  it('shake decays over time across subsequent tick advances', async () => {
    const { _getShakeStateForTests } = await import('./renderer/canvasRenderer')
    const prev = stateWith([], {}, { tick: 10, lives: 3 })
    const hit = stateWith([], {}, { tick: 11, lives: 2 })
    buildDrawCommands(hit, null, prev)
    const before = _getShakeStateForTests().ticks
    // Advance ticks without further damage
    let curr = hit
    for (let i = 12; i < 20; i++) {
      const next = stateWith([], {}, { tick: i, lives: 2 })
      buildDrawCommands(next, null, curr)
      curr = next
    }
    const after = _getShakeStateForTests().ticks
    expect(after).toBeLessThan(before)
  })

  it('flash fades out as ticks advance', async () => {
    // Driven by player damage (red flash) now that the per-score white
    // flash has been removed.
    const { _getFlashStateForTests, resetEffects } = await import('./renderer/canvasRenderer')
    resetEffects()
    const prev = stateWith([], {}, { tick: 10, lives: 3 })
    const hit = stateWith([], {}, { tick: 11, lives: 2 })
    buildDrawCommands(hit, null, prev)
    const initial = _getFlashStateForTests().ticks
    expect(initial).toBeGreaterThan(0)

    // Advance one tick without further damage
    const later = stateWith([], {}, { tick: 12, lives: 2 })
    buildDrawCommands(later, null, hit)
    const afterOne = _getFlashStateForTests().ticks
    expect(afterOne).toBeLessThan(initial)
  })
})

// ─── Barrier visual polish ───────────────────────────────────────────────────

describe('Barrier visual polish', () => {
  type RectCmd = Extract<DrawCommand, { type: 'rect' }>
  const isRect = (c: DrawCommand): c is RectCmd => c.type === 'rect'

  function makeBarrier(health: 0 | 1 | 2 | 3 | 4, x = 20): import('../../shared/types').BarrierEntity {
    return {
      kind: 'barrier',
      id: `barrier-${health}`,
      x,
      segments: [{ offsetX: 0, offsetY: 0, health }],
    }
  }

  /** Get rect commands whose x/y fall inside the given segment's pixel bounds. */
  function getSegmentRects(commands: DrawCommand[], barrierX: number): RectCmd[] {
    const segX = (barrierX + 0 * 3) * CELL_W
    const segY = (LAYOUT.BARRIER_Y + 0 * 2) * CELL_H
    const segW = 3 * CELL_W
    const segH = 2 * CELL_H
    return commands.filter((c): c is RectCmd => {
      if (!isRect(c)) return false
      // Contained (or touching) the segment bounds
      return c.x >= segX - 8 && c.x <= segX + segW + 8 && c.y >= segY - 8 && c.y <= segY + segH + 8
    })
  }

  function getPrimaryRect(commands: DrawCommand[], barrierX: number): RectCmd | undefined {
    const segX = (barrierX + 0 * 3) * CELL_W
    const segY = (LAYOUT.BARRIER_Y + 0 * 2) * CELL_H
    const segW = 3 * CELL_W
    const segH = 2 * CELL_H
    return commands.find(
      (c): c is RectCmd => isRect(c) && c.x === segX && c.y === segY && c.width === segW && c.height === segH,
    )
  }

  it('barrier at health 4 has no damage decorations (only primary + texture + highlight)', () => {
    const b = makeBarrier(4, 20)
    const state = stateWith([b], {})
    const commands = buildDrawCommands(state, null)
    const primary = getPrimaryRect(commands, 20)
    expect(primary).toBeDefined()
    expect(primary!.fill).toBe(COLORS.barrier[4])
    // No damage decorations — no cracks/chips/heavy-damage/smoke.
    const damageKinds = new Set(['barrier-crack', 'barrier-chip', 'barrier-heavy-damage', 'barrier-smoke'])
    const damageRects = commands.filter((c): c is RectCmd => isRect(c) && damageKinds.has((c as any).kind))
    expect(damageRects.length).toBe(0)
  })

  it('barrier at health 4 produces noise texture (replaced rivet rects)', () => {
    // The old rivet-rect pattern was replaced with circle-based concrete noise
    // for a smoother, more organic look. Contract: some kind of texture exists.
    const b = makeBarrier(4, 20)
    const state = stateWith([b], {})
    const commands = buildDrawCommands(state, null)
    const noise = commands.filter((c) => c.type === 'circle' && (c as any).kind === 'barrier-noise')
    expect(noise.length).toBeGreaterThanOrEqual(3)
    for (const n of noise) {
      if (n.type === 'circle') {
        expect(n.alpha).toBeDefined()
        expect(n.alpha!).toBeGreaterThan(0)
        expect(n.alpha!).toBeLessThanOrEqual(0.6)
      }
    }
  })

  it('barrier at health 4 has edge highlight', () => {
    const b = makeBarrier(4, 20)
    const state = stateWith([b], {})
    const commands = buildDrawCommands(state, null)
    const highlights = commands.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'barrier-highlight')
    expect(highlights.length).toBe(1)
  })

  it('barrier at health 3 or below has no edge highlight', () => {
    for (const h of [1, 2, 3] as const) {
      const b = makeBarrier(h, 20)
      const state = stateWith([b], {})
      const commands = buildDrawCommands(state, null)
      const highlights = commands.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'barrier-highlight')
      expect(highlights.length).toBe(0)
    }
  })

  it.skip('texture rects are within segment bounds (superseded by circle noise)', () => {
    // Superseded: old rect-texture replaced by barrier-noise circles.
    // The new circle-bounds test in 'Barrier concrete noise' covers this.
    const b = makeBarrier(4, 20)
    const state = stateWith([b], {})
    const commands = buildDrawCommands(state, null)
    const segX = (20 + 0 * 3) * CELL_W
    const segY = (LAYOUT.BARRIER_Y + 0 * 2) * CELL_H
    const segW = 3 * CELL_W
    const segH = 2 * CELL_H
    const textures = commands.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'barrier-texture')
    expect(textures.length).toBeGreaterThan(0)
    for (const t of textures) {
      expect(t.x).toBeGreaterThanOrEqual(segX)
      expect(t.y).toBeGreaterThanOrEqual(segY)
      expect(t.x + t.width).toBeLessThanOrEqual(segX + segW)
      expect(t.y + t.height).toBeLessThanOrEqual(segY + segH)
    }
  })

  it('highlight is at top of segment, 1px tall', () => {
    const b = makeBarrier(4, 20)
    const state = stateWith([b], {})
    const commands = buildDrawCommands(state, null)
    const segX = (20 + 0 * 3) * CELL_W
    const segY = (LAYOUT.BARRIER_Y + 0 * 2) * CELL_H
    const segW = 3 * CELL_W
    const highlight = commands.find((c): c is RectCmd => isRect(c) && (c as any).kind === 'barrier-highlight')
    expect(highlight).toBeDefined()
    expect(highlight!.y).toBe(segY)
    expect(highlight!.height).toBe(1)
    expect(highlight!.x).toBe(segX)
    expect(highlight!.width).toBe(segW)
  })

  it('PBT: for any barrier.x/offsets/health 1..4, all texture/highlight rects are within segment bounds', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 4 }),
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 1, max: 4 }),
        (bx, ox, oy, h) => {
          const barrier: import('../../shared/types').BarrierEntity = {
            kind: 'barrier',
            id: `pbt-decor-${bx}-${ox}-${oy}-${h}`,
            x: bx,
            segments: [{ offsetX: ox, offsetY: oy, health: h as 1 | 2 | 3 | 4 }],
          }
          const state = stateWith([barrier], {})
          const commands = buildDrawCommands(state, null)
          const segX = (bx + ox * 3) * CELL_W
          const segY = (LAYOUT.BARRIER_Y + oy * 2) * CELL_H
          const segW = 3 * CELL_W
          const segH = 2 * CELL_H
          const decorations = commands.filter(
            (c): c is RectCmd =>
              isRect(c) && ((c as any).kind === 'barrier-texture' || (c as any).kind === 'barrier-highlight'),
          )
          for (const d of decorations) {
            if (d.x < segX) return false
            if (d.y < segY) return false
            if (d.x + d.width > segX + segW) return false
            if (d.y + d.height > segY + segH) return false
          }
          return true
        },
      ),
      { numRuns: 50 },
    )
  })

  it('barrier at health 3 has crack overlay commands', () => {
    const b = makeBarrier(3, 20)
    const state = stateWith([b], {})
    const commands = buildDrawCommands(state, null)
    const segRects = getSegmentRects(commands, 20)
    // Primary + 2 crack rects (horizontal + vertical) at minimum.
    expect(segRects.length).toBeGreaterThanOrEqual(3)
    // Dark overlays must exist (black fill).
    const darkOverlays = segRects.filter((r) => r.fill === '#000000')
    expect(darkOverlays.length).toBeGreaterThanOrEqual(2)
    // Primary is present with contract-correct geometry.
    expect(getPrimaryRect(commands, 20)).toBeDefined()
  })

  it('barrier at health 2 has more damage decorations + smoke particle', () => {
    const b = makeBarrier(2, 20)
    const state = stateWith([b], {}, { tick: 5 })
    const commands = buildDrawCommands(state, null)
    const segRects = getSegmentRects(commands, 20)
    // Primary + crack cross (2) + chipped corner (1) + smoke (1 above) = 5+
    expect(segRects.length).toBeGreaterThanOrEqual(4)
    // Chipped corner + cracks → several black rects.
    const blacks = segRects.filter((r) => r.fill === '#000000')
    expect(blacks.length).toBeGreaterThanOrEqual(3)
    // Smoke rect is gray and above the segment top.
    const segY = (LAYOUT.BARRIER_Y + 0 * 2) * CELL_H
    const smoke = segRects.find((r) => r.fill === '#888888' && r.y < segY)
    expect(smoke).toBeDefined()
  })

  it('barrier at health 1 has heavy damage (dark alpha overlay)', () => {
    const b = makeBarrier(1, 20)
    const state = stateWith([b], {})
    const commands = buildDrawCommands(state, null)
    const segRects = getSegmentRects(commands, 20)
    // Heavy-damage state has an alpha-blended black overlay.
    const heavyOverlay = segRects.find(
      (r) =>
        r.fill === '#000000' &&
        (r as unknown as { alpha?: number }).alpha !== undefined &&
        (r as unknown as { alpha?: number }).alpha! >= 0.4,
    )
    expect(heavyOverlay).toBeDefined()
    // Primary rect still present with contract geometry.
    expect(getPrimaryRect(commands, 20)).toBeDefined()
  })

  it('primary segment rect at all health levels matches exact contract position and size', () => {
    for (const health of [1, 2, 3, 4] as const) {
      const b = makeBarrier(health, 20)
      const state = stateWith([b], {})
      const commands = buildDrawCommands(state, null)
      const primary = getPrimaryRect(commands, 20)
      expect(primary).toBeDefined()
      expect(primary!.x).toBe((20 + 0 * 3) * CELL_W)
      expect(primary!.y).toBe((LAYOUT.BARRIER_Y + 0 * 2) * CELL_H)
      expect(primary!.width).toBe(3 * CELL_W)
      expect(primary!.height).toBe(2 * CELL_H)
      expect(primary!.fill).toBe(COLORS.barrier[health])
    }
  })

  it('health 0 segment produces no commands (destroyed)', () => {
    const b: import('../../shared/types').BarrierEntity = {
      kind: 'barrier',
      id: 'destroyed',
      x: 20,
      segments: [{ offsetX: 0, offsetY: 0, health: 0 }],
    }
    const state = stateWith([b], {})
    const commands = buildDrawCommands(state, null)
    const segRects = getSegmentRects(commands, 20)
    // No segment rect (primary) should exist for a destroyed segment.
    const primary = getPrimaryRect(commands, 20)
    expect(primary).toBeUndefined()
    // And no decorations either.
    const blacks = segRects.filter((r) => r.fill === '#000000')
    expect(blacks.length).toBe(0)
  })

  it('PBT: for any barrier x/offsets/health 1..4, primary rect is contract-correct', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }), // barrier.x
        fc.integer({ min: 0, max: 4 }), // offsetX
        fc.integer({ min: 0, max: 3 }), // offsetY
        fc.integer({ min: 1, max: 4 }), // health
        (bx, ox, oy, h) => {
          const barrier: import('../../shared/types').BarrierEntity = {
            kind: 'barrier',
            id: `pbt-${bx}-${ox}-${oy}-${h}`,
            x: bx,
            segments: [{ offsetX: ox, offsetY: oy, health: h as 1 | 2 | 3 | 4 }],
          }
          const state = stateWith([barrier], {})
          const commands = buildDrawCommands(state, null)
          const expectedX = (bx + ox * 3) * CELL_W
          const expectedY = (LAYOUT.BARRIER_Y + oy * 2) * CELL_H
          const expectedW = 3 * CELL_W
          const expectedH = 2 * CELL_H
          const primary = commands.find(
            (c): c is Extract<DrawCommand, { type: 'rect' }> =>
              c.type === 'rect' &&
              c.x === expectedX &&
              c.y === expectedY &&
              c.width === expectedW &&
              c.height === expectedH &&
              c.fill === COLORS.barrier[h as 1 | 2 | 3 | 4],
          )
          return primary !== undefined
        },
      ),
      { numRuns: 50 },
    )
  })
})

// ─── Bullet visual polish ────────────────────────────────────────────────────

describe('Bullet visual polish', () => {
  type RectCmd = DrawCommand & { type: 'rect' }
  const isRect = (cmd: DrawCommand): cmd is RectCmd => cmd.type === 'rect'

  function findMainBulletRect(cmds: DrawCommand[], fill: string): RectCmd | undefined {
    return cmds.find(
      (c): c is RectCmd =>
        c.type === 'rect' &&
        c.fill === fill &&
        c.width === CELL_W &&
        c.height === CELL_H &&
        (c as any).kind !== 'bullet-glow' &&
        (c as any).kind !== 'bullet-trail' &&
        (c as any).kind !== 'muzzle-flash',
    )
  }

  it('player bullet produces a glow halo command', () => {
    const bullet = makeBullet({ id: 'b1', x: 50, y: 20, ownerId: 'p1', dy: -1 })
    const state = stateWith([bullet], {}, { tick: 50 })
    const cmds = buildDrawCommands(state, null, state, 1, 1)
    const glows = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'bullet-glow')
    expect(glows.length).toBeGreaterThan(0)
    const glow = glows[0]
    // Larger than the core cell
    expect(glow.width).toBeGreaterThan(CELL_W)
    expect(glow.height).toBeGreaterThan(CELL_H)
    // Has alpha < 1 (transparent)
    expect((glow as any).alpha).toBeDefined()
    expect((glow as any).alpha).toBeLessThan(1)
    expect((glow as any).alpha).toBeGreaterThan(0)
  })

  it('player bullet produces trail commands', () => {
    const bullet = makeBullet({ id: 'b1', x: 50, y: 20, ownerId: 'p1', dy: -1 })
    const state = stateWith([bullet], {}, { tick: 50 })
    const cmds = buildDrawCommands(state, null, state, 1, 1)
    const trails = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'bullet-trail')
    expect(trails.length).toBeGreaterThanOrEqual(2)
    // Player bullet goes up (dy=-1), so trail positions must be BELOW bullet (higher y)
    const bulletPxY = 20 * CELL_H
    for (const t of trails) {
      expect(t.y).toBeGreaterThan(bulletPxY - 0.001)
    }
  })

  it('alien bullet produces trail commands', () => {
    const bullet = makeBullet({ id: 'b2', x: 50, y: 15, ownerId: null, dy: 1 })
    const state = stateWith([bullet], {}, { tick: 50 })
    const cmds = buildDrawCommands(state, null, state, 1, 1)
    const trails = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'bullet-trail')
    expect(trails.length).toBeGreaterThanOrEqual(2)
    // Alien bullet goes down (dy=1), so trail positions must be ABOVE bullet (lower y)
    const bulletPxY = 15 * CELL_H
    for (const t of trails) {
      expect(t.y).toBeLessThan(bulletPxY + 0.001)
      // Red-ish fill
      expect(t.fill.toLowerCase()).toMatch(/ff|f[0-9a-f]|red|rgba\(2[45]/)
    }
  })

  it('muzzle flash on new bullet', () => {
    const prev = stateWith([], {}, { tick: 99 })
    const bullet = makeBullet({ id: 'brand-new', x: 50, y: 20, ownerId: 'p1', dy: -1 })
    const curr = stateWith([bullet], {}, { tick: 100 })
    const cmds = buildDrawCommands(curr, null, prev, 1, 1)
    const flashes = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'muzzle-flash')
    expect(flashes.length).toBeGreaterThan(0)
    // Positioned at/near spawn position
    const flash = flashes[0]
    expect(flash.x).toBeGreaterThan(50 * CELL_W - CELL_W * 3)
    expect(flash.x).toBeLessThan(50 * CELL_W + CELL_W * 3)
  })

  it('no muzzle flash for bullets present in prev state', () => {
    const bullet = makeBullet({ id: 'existing', x: 50, y: 20, ownerId: 'p1', dy: -1 })
    const prev = stateWith([bullet], {}, { tick: 99 })
    const curr = stateWith([bullet], {}, { tick: 100 })
    const cmds = buildDrawCommands(curr, null, prev, 1, 1)
    const flashes = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'muzzle-flash')
    expect(flashes).toHaveLength(0)
  })

  it('PBT: bullet main rect is always at exact bullet.x, bullet.y regardless of embellishments', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 100 }),
        fc.integer({ min: 2, max: 30 }),
        fc.boolean(),
        fc.integer({ min: 0, max: 200 }),
        (x, y, isPlayer, tick) => {
          const bullet = makeBullet({
            id: 'pbt-b',
            x,
            y,
            ownerId: isPlayer ? 'p1' : null,
            dy: isPlayer ? -1 : 1,
          })
          const state = stateWith([bullet], {}, { tick })
          const cmds = buildDrawCommands(state, null, state, 1, 1)
          const fill = isPlayer ? COLORS.bullet.player : COLORS.bullet.alien
          const main = findMainBulletRect(cmds, fill)
          if (!main) {
            // Alien bullet flicker varies the fill — fall back to matching size/pos
            const anyMain = cmds.find(
              (c): c is RectCmd =>
                isRect(c) &&
                c.width === CELL_W &&
                c.height === CELL_H &&
                (c as any).kind !== 'bullet-glow' &&
                (c as any).kind !== 'bullet-trail' &&
                (c as any).kind !== 'muzzle-flash' &&
                (c as any).kind !== 'star' &&
                !(c as any).isStar &&
                !(c as any).isParticle &&
                !(c as any).isConfetti &&
                c.x === x * CELL_W &&
                c.y === y * CELL_H,
            )
            return anyMain !== undefined
          }
          return main.x === x * CELL_W && main.y === y * CELL_H
        },
      ),
      { numRuns: 50 },
    )
  })

  it('trail alpha decreases from nearest to furthest from bullet', () => {
    const bullet = makeBullet({ id: 'b1', x: 50, y: 20, ownerId: 'p1', dy: -1 })
    const state = stateWith([bullet], {}, { tick: 50 })
    const cmds = buildDrawCommands(state, null, state, 1, 1)
    const trails = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'bullet-trail')
    expect(trails.length).toBeGreaterThanOrEqual(2)
    const bulletPxY = 20 * CELL_H
    // Sort by distance from bullet (player bullet dy=-1, so trails have y > bulletPxY)
    const sorted = [...trails].sort((a, b) => Math.abs(a.y - bulletPxY) - Math.abs(b.y - bulletPxY))
    // Alphas should be non-increasing (nearer = brighter/more opaque)
    for (let i = 1; i < sorted.length; i++) {
      const prev = (sorted[i - 1] as any).alpha ?? 1
      const cur = (sorted[i] as any).alpha ?? 1
      expect(cur).toBeLessThanOrEqual(prev + 1e-9)
    }
  })
})

// ─── Player ship visual polish ───────────────────────────────────────────────

describe('Player ship visual polish', () => {
  const PLAYER_SPRITE_BOTTOM_PX = (LAYOUT.PLAYER_Y + 2) * CELL_H

  function exhaustRects(cmds: DrawCommand[]): Array<DrawCommand & { type: 'rect' }> {
    return cmds.filter(
      (c): c is DrawCommand & { type: 'rect' } => c.type === 'rect' && 'kind' in c && c.kind === 'player-exhaust',
    )
  }

  it('player produces engine exhaust commands below sprite', () => {
    const player = makePlayer({ x: 60 })
    const state = stateWith([], { [player.id]: player }, { tick: 0 })
    const commands = buildDrawCommands(state, null)
    const exhaust = exhaustRects(commands)
    expect(exhaust.length).toBeGreaterThanOrEqual(3)
    for (const r of exhaust) {
      expect(r.y).toBeGreaterThanOrEqual(PLAYER_SPRITE_BOTTOM_PX)
    }
  })

  it('exhaust colors are orange/yellow family', () => {
    const player = makePlayer({ x: 60 })
    const state = stateWith([], { [player.id]: player }, { tick: 0 })
    const commands = buildDrawCommands(state, null)
    const exhaust = exhaustRects(commands)
    expect(exhaust.length).toBeGreaterThan(0)
    for (const r of exhaust) {
      expect(r.fill.toLowerCase()).toMatch(/^#(ff|88)/)
    }
  })

  it('no player-halo command exists (halo removed, no ugly square behind ship)', () => {
    const player = makePlayer({ x: 60 })
    const state = stateWith([], { [player.id]: player }, { tick: 0 })
    const commands = buildDrawCommands(state, null)
    const halos = commands.filter((c) => c.type === 'rect' && 'kind' in c && c.kind === 'player-halo')
    expect(halos.length).toBe(0)
  })

  it('no invulnerability ring command is ever emitted (invuln uses sprite color tint, not outline)', () => {
    for (const invulnUntil of [null, 5, 100]) {
      for (let tick = 0; tick < 8; tick++) {
        resetEffects()
        const player = makePlayer({
          x: 60,
          invulnerableUntilTick: invulnUntil as number | null,
        })
        const state = stateWith([], { [player.id]: player }, { tick })
        const commands = buildDrawCommands(state, null)
        const rings = commands.filter((c) => c.type === 'rect' && 'kind' in c && c.kind === 'invuln-ring')
        expect(rings.length).toBe(0)
      }
    }
  })

  it('invulnerability modulates sprite color, not an outline ring', () => {
    const player = makePlayer({ x: 60, slot: 1, invulnerableUntilTick: 100 })
    const colorsSeen = new Set<string>()
    for (let tick = 0; tick < 12; tick++) {
      resetEffects()
      const state = stateWith([], { [player.id]: player }, { tick })
      const commands = buildDrawCommands(state, null)
      const sprite = commands.find(
        (c): c is DrawCommand & { type: 'sprite' } =>
          c.type === 'sprite' && c.pixels === (PIXEL_ART.player as unknown as number[][]),
      )
      expect(sprite).toBeDefined()
      if (sprite) colorsSeen.add(sprite.color)
    }
    expect(colorsSeen.size).toBeGreaterThanOrEqual(2)
  })

  it('non-invulnerable player uses base slot color (no tint)', () => {
    const player = makePlayer({ x: 60, slot: 1, invulnerableUntilTick: null })
    const state = stateWith([], { [player.id]: player }, { tick: 10 })
    const commands = buildDrawCommands(state, null)
    const sprite = commands.find(
      (c): c is DrawCommand & { type: 'sprite' } =>
        c.type === 'sprite' && c.pixels === (PIXEL_ART.player as unknown as number[][]),
    )
    expect(sprite).toBeDefined()
    expect(sprite!.color).toBe(COLORS.player[1])
  })

  it('cockpit highlight rect is within player sprite bounds', () => {
    const player = makePlayer({ x: 60 })
    const state = stateWith([], { [player.id]: player }, { tick: 0 })
    const commands = buildDrawCommands(state, null)
    const left = (60 - 3) * CELL_W
    const right = (60 + 4) * CELL_W
    const top = LAYOUT.PLAYER_Y * CELL_H
    const bottom = (LAYOUT.PLAYER_Y + 2) * CELL_H
    const cockpits = commands.filter(
      (c): c is DrawCommand & { type: 'rect' } => c.type === 'rect' && 'kind' in c && c.kind === 'player-cockpit',
    )
    expect(cockpits.length).toBeGreaterThan(0)
    for (const r of cockpits) {
      expect(r.x).toBeGreaterThanOrEqual(left)
      expect(r.x + r.width).toBeLessThanOrEqual(right)
      expect(r.y).toBeGreaterThanOrEqual(top)
      expect(r.y + r.height).toBeLessThanOrEqual(bottom)
    }
  })

  it('wing tip highlights are within sprite bounds', () => {
    const player = makePlayer({ x: 60 })
    const state = stateWith([], { [player.id]: player }, { tick: 0 })
    const commands = buildDrawCommands(state, null)
    const left = (60 - 3) * CELL_W
    const right = (60 + 4) * CELL_W
    const top = LAYOUT.PLAYER_Y * CELL_H
    const bottom = (LAYOUT.PLAYER_Y + 2) * CELL_H
    const wings = commands.filter(
      (c): c is DrawCommand & { type: 'rect' } => c.type === 'rect' && 'kind' in c && c.kind === 'player-wing',
    )
    expect(wings.length).toBeGreaterThanOrEqual(2)
    for (const r of wings) {
      expect(r.x).toBeGreaterThanOrEqual(left)
      expect(r.x + r.width).toBeLessThanOrEqual(right)
      expect(r.y).toBeGreaterThanOrEqual(top)
      expect(r.y + r.height).toBeLessThanOrEqual(bottom)
    }
  })

  it('leading-edge highlight is within sprite bounds', () => {
    const player = makePlayer({ x: 60 })
    const state = stateWith([], { [player.id]: player }, { tick: 0 })
    const commands = buildDrawCommands(state, null)
    const left = (60 - 3) * CELL_W
    const right = (60 + 4) * CELL_W
    const top = LAYOUT.PLAYER_Y * CELL_H
    const bottom = (LAYOUT.PLAYER_Y + 2) * CELL_H
    const edges = commands.filter(
      (c): c is DrawCommand & { type: 'rect' } => c.type === 'rect' && 'kind' in c && c.kind === 'player-leading-edge',
    )
    expect(edges.length).toBeGreaterThanOrEqual(1)
    for (const r of edges) {
      expect(r.x).toBeGreaterThanOrEqual(left)
      expect(r.x + r.width).toBeLessThanOrEqual(right)
      expect(r.y).toBeGreaterThanOrEqual(top)
      expect(r.y + r.height).toBeLessThanOrEqual(bottom)
    }
  })

  it('PBT: all non-exhaust player embellishments stay within horizontal sprite bounds', () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 115 }), (px) => {
        resetEffects()
        const player = makePlayer({ x: px, invulnerableUntilTick: 100 })
        const state = stateWith([], { [player.id]: player }, { tick: 0 })
        const commands = buildDrawCommands(state, null)
        const left = (px - 3) * CELL_W
        const right = (px + 4) * CELL_W
        const embellishmentKinds = new Set(['player-cockpit', 'player-wing', 'player-leading-edge'])
        for (const c of commands) {
          if (c.type !== 'rect') continue
          if (!('kind' in c) || c.kind === undefined) continue
          if (!embellishmentKinds.has(c.kind)) continue
          if (c.x < left) return false
          if (c.x + c.width > right) return false
        }
        return true
      }),
      { numRuns: 40 },
    )
  })

  it('primary player sprite unchanged: x at (player.x - 3) * CELL_W, correct dims', () => {
    const player = makePlayer({ x: 60, slot: 1 })
    const state = stateWith([], { [player.id]: player })
    const commands = buildDrawCommands(state, null)
    const playerSprite = commands.find(
      (c): c is DrawCommand & { type: 'sprite' } =>
        c.type === 'sprite' && c.pixels === (PIXEL_ART.player as unknown as number[][]),
    )
    expect(playerSprite).toBeDefined()
    if (!playerSprite) return
    expect(playerSprite.x).toBe((60 - 3) * CELL_W)
    expect(playerSprite.y).toBe(LAYOUT.PLAYER_Y * CELL_H)
    expect(playerSprite.width).toBe(7 * CELL_W)
    expect(playerSprite.height).toBe(2 * CELL_H)
  })

  it('PBT: for any player.x in valid range, exhaust follows player horizontally', () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 115 }), (px) => {
        resetEffects()
        const player = makePlayer({ x: px })
        const state = stateWith([], { [player.id]: player }, { tick: 0 })
        const commands = buildDrawCommands(state, null)
        const exhaust = exhaustRects(commands)
        if (exhaust.length === 0) return false
        const centers = exhaust.map((r) => r.x + r.width / 2)
        const mean = centers.reduce((a, b) => a + b, 0) / centers.length
        const playerCenterPx = px * CELL_W
        return Math.abs(mean - playerCenterPx) < 3 * CELL_W
      }),
      { numRuns: 40 },
    )
  })
})

// ─── Player polish upgrades (crank to 11) ───────────────────────────────────

describe('Player polish upgrades', () => {
  type RectCmd = DrawCommand & { type: 'rect' }
  const isRect = (c: DrawCommand): c is RectCmd => c.type === 'rect'

  function plumes(cmds: DrawCommand[]): Record<'center' | 'left' | 'right', RectCmd[]> {
    return {
      center: cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'player-plume-center'),
      left: cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'player-plume-left'),
      right: cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'player-plume-right'),
    }
  }

  it('triple-thruster plumes present below player', () => {
    const player = makePlayer({ x: 60 })
    const state = stateWith([], { [player.id]: player }, { tick: 0 })
    const cmds = buildDrawCommands(state, null)
    const p = plumes(cmds)
    expect(p.center.length).toBeGreaterThan(0)
    expect(p.left.length).toBeGreaterThan(0)
    expect(p.right.length).toBeGreaterThan(0)
    // Left-of-center / right-of-center geometry
    const centerX = p.center[0].x + p.center[0].width / 2
    const leftX = p.left[0].x + p.left[0].width / 2
    const rightX = p.right[0].x + p.right[0].width / 2
    expect(leftX).toBeLessThan(centerX)
    expect(rightX).toBeGreaterThan(centerX)
    // All plumes are below sprite bottom
    const spriteBottom = (LAYOUT.PLAYER_Y + 2) * CELL_H
    for (const r of [...p.center, ...p.left, ...p.right]) {
      expect(r.y).toBeGreaterThanOrEqual(spriteBottom)
    }
  })

  it('center plume is brightest/tallest', () => {
    const player = makePlayer({ x: 60 })
    const state = stateWith([], { [player.id]: player }, { tick: 0 })
    const cmds = buildDrawCommands(state, null)
    const p = plumes(cmds)
    const centerMaxH = Math.max(...p.center.map((r) => r.height))
    const sideMaxH = Math.max(...p.left.map((r) => r.height), ...p.right.map((r) => r.height))
    expect(centerMaxH).toBeGreaterThanOrEqual(sideMaxH)
    // Center fill must be orange-yellow (ff family)
    for (const r of p.center) {
      expect(r.fill.toLowerCase()).toMatch(/^#ff/)
    }
  })

  it('weapon charge glow appears after recent shot', () => {
    const player = makePlayer({ x: 60, lastShotTick: 98 })
    const state = stateWith([], { [player.id]: player }, { tick: 100 })
    const cmds = buildDrawCommands(state, null)
    const glows = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'player-weapon-glow')
    expect(glows.length).toBeGreaterThan(0)
    // Glow is near the sprite top-center
    const spriteTop = LAYOUT.PLAYER_Y * CELL_H
    for (const g of glows) {
      expect(g.y).toBeLessThanOrEqual(spriteTop + CELL_H)
      expect(g.y + g.height).toBeGreaterThanOrEqual(spriteTop)
    }
  })

  it('no weapon glow after 10 ticks since shot', () => {
    const player = makePlayer({ x: 60, lastShotTick: 90 })
    const state = stateWith([], { [player.id]: player }, { tick: 100 })
    const cmds = buildDrawCommands(state, null)
    const glows = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'player-weapon-glow')
    expect(glows.length).toBe(0)
  })

  it('rim lighting present on top edges of sprite', () => {
    const player = makePlayer({ x: 60 })
    const state = stateWith([], { [player.id]: player }, { tick: 0 })
    const cmds = buildDrawCommands(state, null)
    const rims = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'player-rim')
    expect(rims.length).toBeGreaterThanOrEqual(2)
    const spriteLeft = (60 - 3) * CELL_W
    const spriteRight = (60 + 4) * CELL_W
    const spriteTop = LAYOUT.PLAYER_Y * CELL_H
    // At least one rim at top-left half and one at top-right half
    const hasLeft = rims.some((r) => r.x < spriteLeft + (spriteRight - spriteLeft) / 2)
    const hasRight = rims.some((r) => r.x + r.width > spriteLeft + (spriteRight - spriteLeft) / 2)
    expect(hasLeft).toBe(true)
    expect(hasRight).toBe(true)
    // All within sprite bounds horizontally, and near top
    for (const r of rims) {
      expect(r.x).toBeGreaterThanOrEqual(spriteLeft)
      expect(r.x + r.width).toBeLessThanOrEqual(spriteRight)
      expect(r.y).toBeGreaterThanOrEqual(spriteTop)
      expect(r.y).toBeLessThan(spriteTop + CELL_H)
    }
  })

  it('invulnerability renders shield bubble cells (not outline ring)', () => {
    const player = makePlayer({ x: 60, invulnerableUntilTick: 100 })
    const state = stateWith([], { [player.id]: player }, { tick: 10 })
    const cmds = buildDrawCommands(state, null)
    const bubbles = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'player-shield-bubble')
    expect(bubbles.length).toBeGreaterThanOrEqual(4)
    expect(bubbles.length).toBeLessThanOrEqual(8)
    // Each bubble is transparent and cyan-ish
    for (const b of bubbles) {
      expect(b.alpha).toBeDefined()
      expect(b.alpha!).toBeLessThan(1)
    }
    // No invuln-ring kind exists
    const rings = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'invuln-ring')
    expect(rings.length).toBe(0)
  })

  it('non-invulnerable player has no shield bubble', () => {
    const player = makePlayer({ x: 60, invulnerableUntilTick: null })
    const state = stateWith([], { [player.id]: player }, { tick: 10 })
    const cmds = buildDrawCommands(state, null)
    const bubbles = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'player-shield-bubble')
    expect(bubbles.length).toBe(0)
  })

  it('PBT: all player embellishments stay within or below sprite bounds', () => {
    const emKinds = new Set([
      'player-plume-center',
      'player-plume-left',
      'player-plume-right',
      'player-weapon-glow',
      'player-rim',
      'player-trail',
      'player-landing-light',
      'player-shield-bubble',
    ])
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 115 }), fc.integer({ min: 0, max: 200 }), (px, tick) => {
        resetEffects()
        const player = makePlayer({
          x: px,
          lastShotTick: tick - 2,
          invulnerableUntilTick: tick + 50,
        })
        const state = stateWith([], { [player.id]: player }, { tick })
        const cmds = buildDrawCommands(state, null)
        const spriteLeft = (px - 3) * CELL_W
        const spriteRight = (px + 4) * CELL_W
        const spriteTop = LAYOUT.PLAYER_Y * CELL_H
        // "Directly below" — allow a generous margin of several rows below
        // the sprite for the trail/plume to extend.
        const maxBottom = (LAYOUT.PLAYER_Y + 2 + 8) * CELL_H
        for (const c of cmds) {
          if (c.type !== 'rect') continue
          const k = (c as any).kind
          if (!emKinds.has(k)) continue
          // shield bubbles can extend 1 cell outside sprite at edge per spec
          const slack = k === 'player-shield-bubble' ? CELL_W : 0
          if (c.x < spriteLeft - slack) return false
          if (c.x + c.width > spriteRight + slack) return false
          if (c.y < spriteTop - slack) return false
          if (c.y + c.height > maxBottom) return false
        }
        return true
      }),
      { numRuns: 40 },
    )
  })
})

// ─── Barrier polish upgrades (crank to 11) ──────────────────────────────────

describe('Barrier polish upgrades', () => {
  type RectCmd = DrawCommand & { type: 'rect' }
  const isRect = (c: DrawCommand): c is RectCmd => c.type === 'rect'

  function makeBarrier(health: 1 | 2 | 3 | 4, x = 20): import('../../shared/types').BarrierEntity {
    return {
      kind: 'barrier',
      id: `barrier-${health}`,
      x,
      segments: [{ offsetX: 0, offsetY: 0, health }],
    }
  }

  const segX = (bx: number) => (bx + 0 * 3) * CELL_W
  const segY = () => (LAYOUT.BARRIER_Y + 0 * 2) * CELL_H
  const segW = 3 * CELL_W
  const segH = 2 * CELL_H

  it('segment has 3D bevel highlight at top-left and shadow at bottom-right', () => {
    const b = makeBarrier(4, 20)
    const state = stateWith([b], {})
    const cmds = buildDrawCommands(state, null)
    const bevHi = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'barrier-bevel-highlight')
    const bevSh = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'barrier-bevel-shadow')
    expect(bevHi.length).toBeGreaterThan(0)
    expect(bevSh.length).toBeGreaterThan(0)
    const sx = segX(20),
      sy = segY()
    // Highlight near top-left corner
    for (const h of bevHi) {
      expect(h.x).toBeLessThan(sx + segW / 2)
      expect(h.y).toBeLessThan(sy + segH / 2)
    }
    // Shadow near bottom-right corner
    for (const s of bevSh) {
      expect(s.x + s.width).toBeGreaterThan(sx + segW / 2)
      expect(s.y + s.height).toBeGreaterThan(sy + segH / 2)
    }
  })

  it('heat glow rect present when segment damaged (health 3)', () => {
    const b = makeBarrier(3, 20)
    const state = stateWith([b], {})
    const cmds = buildDrawCommands(state, null)
    const heat = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'barrier-heat-glow')
    expect(heat.length).toBeGreaterThan(0)
    // Orange-ish fill and transparent
    for (const h of heat) {
      expect(h.fill.toLowerCase()).toMatch(/^#(ff|f[0-9a-f])/)
      expect(h.alpha).toBeDefined()
      expect(h.alpha!).toBeLessThan(1)
    }
  })

  it('no heat glow at full health', () => {
    const b = makeBarrier(4, 20)
    const state = stateWith([b], {})
    const cmds = buildDrawCommands(state, null)
    const heat = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'barrier-heat-glow')
    expect(heat.length).toBe(0)
  })

  it('rim lighting on TOP and LEFT edges at health 4', () => {
    const b = makeBarrier(4, 20)
    const state = stateWith([b], {})
    const cmds = buildDrawCommands(state, null)
    const rimTop = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'barrier-rim-top')
    const rimLeft = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'barrier-rim-left')
    expect(rimTop.length).toBeGreaterThan(0)
    expect(rimLeft.length).toBeGreaterThan(0)
    const sx = segX(20),
      sy = segY()
    for (const r of rimTop) {
      expect(r.y).toBe(sy)
    }
    for (const r of rimLeft) {
      expect(r.x).toBe(sx)
    }
  })

  it('no TOP/LEFT rim lighting at health 3', () => {
    const b = makeBarrier(3, 20)
    const state = stateWith([b], {})
    const cmds = buildDrawCommands(state, null)
    const rimTop = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'barrier-rim-top')
    const rimLeft = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'barrier-rim-left')
    expect(rimTop.length).toBe(0)
    expect(rimLeft.length).toBe(0)
  })

  it('segment has surface texture detail (noise speckle replaces rivet rects)', () => {
    // Rivet rects + their specular highlights were replaced with smooth
    // circle-based concrete noise for a less-blocky surface.
    const b = makeBarrier(4, 20)
    const state = stateWith([b], {})
    const cmds = buildDrawCommands(state, null)
    const noise = cmds.filter((c) => c.type === 'circle' && (c as any).kind === 'barrier-noise')
    expect(noise.length).toBeGreaterThanOrEqual(3)
    // Noise colours vary for a pitted look
    const fills = new Set(noise.map((n) => (n as any).fill))
    expect(fills.size).toBeGreaterThanOrEqual(2)
  })

  it('PBT: all barrier decorations stay within segment bounds for any health and position', () => {
    const decorKinds = new Set([
      'barrier-texture',
      'barrier-highlight',
      'barrier-bevel-highlight',
      'barrier-bevel-shadow',
      'barrier-heat-glow',
      'barrier-rivet-spec',
      'barrier-rim-top',
      'barrier-rim-left',
    ])
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 4 }),
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 1, max: 4 }),
        (bx, ox, oy, h) => {
          const barrier: import('../../shared/types').BarrierEntity = {
            kind: 'barrier',
            id: `decor-pbt-${bx}-${ox}-${oy}-${h}`,
            x: bx,
            segments: [{ offsetX: ox, offsetY: oy, health: h as 1 | 2 | 3 | 4 }],
          }
          const state = stateWith([barrier], {})
          const cmds = buildDrawCommands(state, null)
          const sx = (bx + ox * 3) * CELL_W
          const sy = (LAYOUT.BARRIER_Y + oy * 2) * CELL_H
          const sw = 3 * CELL_W
          const sh = 2 * CELL_H
          for (const c of cmds) {
            if (c.type !== 'rect') continue
            const k = (c as any).kind
            if (!decorKinds.has(k)) continue
            if (c.x < sx) return false
            if (c.y < sy) return false
            if (c.x + c.width > sx + sw) return false
            if (c.y + c.height > sy + sh) return false
          }
          return true
        },
      ),
      { numRuns: 50 },
    )
  })
})

// ─── UFO visual polish ───────────────────────────────────────────────────────

describe('UFO visual polish', () => {
  type RectCmd = DrawCommand & { type: 'rect' }
  type SpriteCmd = DrawCommand & { type: 'sprite' }
  const isRect = (cmd: DrawCommand): cmd is RectCmd => cmd.type === 'rect'
  const isSprite = (cmd: DrawCommand): cmd is SpriteCmd => cmd.type === 'sprite'

  it('UFO does NOT produce rainbow trail when moving (user rejected — too busy)', () => {
    // Regression guard: the rainbow trail rendered 7 fading coloured cells
    // behind the UFO every time it moved, which the user flagged as
    // distracting. Must stay removed.
    const prevUfo = makeUFO({ id: 'ufo-1', x: 10, y: 1, direction: 1 })
    const currUfo = makeUFO({ id: 'ufo-1', x: 15, y: 1, direction: 1 })
    const prev = stateWith([prevUfo], {}, { tick: 10 })
    const curr = stateWith([currUfo], {}, { tick: 11 })
    const cmds = buildDrawCommands(curr, null, prev, 1, 1)
    const trails = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'ufo-trail')
    expect(trails).toHaveLength(0)
  })

  it('UFO does NOT emit energy pulse glow halo (user rejected)', () => {
    // Regression guard: the cycling radial glow haloed the UFO in a way the
    // user found ugly. Must stay removed.
    const ufo = makeUFO({ id: 'ufo-g', x: 20, y: 1 })
    const state = stateWith([ufo], {}, { tick: 42 })
    const cmds = buildDrawCommands(state, null, state, 1, 1)
    const glows = cmds.filter((c) => 'kind' in c && (c as any).kind === 'ufo-glow')
    expect(glows).toHaveLength(0)
  })

  it('UFO shock wave on spawn', () => {
    const ufo = makeUFO({ id: 'ufo-new', x: 20, y: 1 })
    const prev = stateWith([], {}, { tick: 9 }) // no UFO in prev
    const curr = stateWith([ufo], {}, { tick: 10 })
    const cmds = buildDrawCommands(curr, null, prev, 1, 1)
    const rings = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'ufo-shockwave')
    expect(rings.length).toBeGreaterThanOrEqual(8)
    // All ring rects should be positioned around the UFO center
    const centerX = (20 + 7 / 2) * CELL_W
    const centerY = (1 + 1) * CELL_H
    for (const r of rings) {
      const dx = r.x + r.width / 2 - centerX
      const dy = r.y + r.height / 2 - centerY
      const dist = Math.sqrt(dx * dx + dy * dy)
      expect(dist).toBeLessThan(10 * CELL_W)
    }
  })

  it('UFO shock wave does NOT persist after spawn frame', () => {
    const ufo = makeUFO({ id: 'ufo-new', x: 20, y: 1 })
    const prev = stateWith([ufo], {}, { tick: 10 })
    const curr = stateWith([ufo], {}, { tick: 11 })
    const cmds = buildDrawCommands(curr, null, prev, 1, 1)
    const rings = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'ufo-shockwave')
    expect(rings).toHaveLength(0)
  })

  it('UFO does NOT emit motion blur streaks when moving (user rejected)', () => {
    // Regression guard: the 2 ghost sprites trailing behind the UFO on move
    // looked visually noisy. Must stay removed.
    const prevUfo = makeUFO({ id: 'ufo-1', x: 10, y: 1, direction: 1 })
    const currUfo = makeUFO({ id: 'ufo-1', x: 13, y: 1, direction: 1 })
    const prev = stateWith([prevUfo], {}, { tick: 10 })
    const curr = stateWith([currUfo], {}, { tick: 11 })
    const cmds = buildDrawCommands(curr, null, prev, 1, 1)
    const blurs = cmds.filter(
      (c): c is SpriteCmd => isSprite(c) && 'kind' in c && (c as any).kind === 'ufo-motion-blur',
    )
    expect(blurs).toHaveLength(0)
  })

  it('primary UFO sprite command still at contract position', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 113 }), fc.integer({ min: 0, max: 200 }), (x, tick) => {
        resetEffects()
        const ufo = makeUFO({ id: 'pbt-ufo', x, y: 1 })
        const state = stateWith([ufo], {}, { tick })
        const cmds = buildDrawCommands(state, null, state, 1, 1)
        const primary = cmds.find(
          (c): c is SpriteCmd =>
            c.type === 'sprite' &&
            (!('kind' in c) || (c as any).kind !== 'ufo-motion-blur') &&
            c.x === x * CELL_W &&
            c.y === 1 * CELL_H &&
            c.width === 7 * CELL_W &&
            c.height === 2 * CELL_H,
        )
        return primary !== undefined
      }),
      { numRuns: 30 },
    )
  })

  it('UFO trail is absent when UFO is not moving', () => {
    const ufo = makeUFO({ id: 'ufo-still', x: 20, y: 1 })
    const prev = stateWith([ufo], {}, { tick: 10 })
    const curr = stateWith([ufo], {}, { tick: 11 })
    const cmds = buildDrawCommands(curr, null, prev, 1, 1)
    const trails = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'ufo-trail')
    expect(trails).toHaveLength(0)
  })
})

// ─── UFO elevation pass 2 ────────────────────────────────────────────────────

describe('UFO elevation pass 2', () => {
  type RectCmd = DrawCommand & { type: 'rect' }
  type SpriteCmd = DrawCommand & { type: 'sprite' }
  const isRect = (cmd: DrawCommand): cmd is RectCmd => cmd.type === 'rect'
  const isSprite = (cmd: DrawCommand): cmd is SpriteCmd => cmd.type === 'sprite'

  it('UFO does NOT emit abduction beam (user rejected the effect)', () => {
    // Regression guard: abduction beam was removed at user request. Must not come back.
    const ufo = makeUFO({ id: 'ufo-no-beam', x: 40, y: 1 })
    const state = stateWith([ufo], {}, { tick: 7 })
    const cmds = buildDrawCommands(state, null, state, 1, 1)
    const beam = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'ufo-beam')
    expect(beam).toHaveLength(0)
  })

  it('UFO does NOT emit beam at any tick', () => {
    for (const tick of [0, 12, 50, 100]) {
      const ufo = makeUFO({ id: `ufo-no-beam-t${tick}`, x: 50, y: 1 })
      const state = stateWith([ufo], {}, { tick })
      const cmds = buildDrawCommands(state, null, state, 1, 1)
      const beam = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'ufo-beam')
      expect(beam).toHaveLength(0)
    }
  })

  it('UFO primary sprite has gradient shading (like other aliens)', () => {
    // User complaint: UFO looks flat/ugly vs. regular aliens which have
    // bright-top / dark-bottom gradient shading. The primary sprite must
    // carry a gradientColors field matching GRADIENT_COLORS.ufo.
    const ufo = makeUFO({ id: 'ufo-grad', x: 40, y: 1 })
    const state = stateWith([ufo], {}, { tick: 10 })
    const cmds = buildDrawCommands(state, null, state, 1, 1)
    // The primary UFO sprite is the one WITHOUT a `kind` field
    const primary = cmds.find((c): c is SpriteCmd => isSprite(c) && !('kind' in c && c.kind))
    expect(primary).toBeDefined()
    const grad = (primary as any).gradientColors
    expect(grad).toBeDefined()
    expect(grad.bright).toMatch(/^#[0-9a-f]{6}$/i)
    expect(grad.dark).toMatch(/^#[0-9a-f]{6}$/i)
  })

  // (removed) UFO glow radial gradient — the glow itself was removed at user
  // request. Regression guard lives in "UFO does NOT emit energy pulse glow halo".

  it('UFO does NOT render a warp ghost when stationary', () => {
    // Regression: the warp ghost was always emitted, even when the UFO was
    // not moving, producing a visible stretched duplicate sprite below the
    // UFO on every frame. Now only when the UFO is actively moving.
    const ufo = makeUFO({ id: 'ufo-still', x: 40, y: 1 })
    // Same position in prev AND curr → not moving
    const state = stateWith([ufo], {}, { tick: 10 })
    const cmds = buildDrawCommands(state, null, state, 1, 1)
    const warp = cmds.filter((c) => 'kind' in c && (c as any).kind === 'ufo-warp-ghost')
    expect(warp).toHaveLength(0)
  })

  it('UFO does NOT render a warp ghost even when moving (user rejected)', () => {
    // Regression guard: the warp ghost was a translucent stretched duplicate
    // rendered below the UFO whenever it moved. User flagged it as ugly —
    // must stay removed for moving UFOs too, not just stationary ones.
    const prevUfo = makeUFO({ id: 'ufo-moving', x: 30, y: 1 })
    const currUfo = makeUFO({ id: 'ufo-moving', x: 35, y: 1 })
    const prev = stateWith([prevUfo], {}, { tick: 9 })
    const curr = stateWith([currUfo], {}, { tick: 10 })
    const cmds = buildDrawCommands(curr, null, prev, 1, 1)
    const warp = cmds.filter((c) => 'kind' in c && (c as any).kind === 'ufo-warp-ghost')
    expect(warp).toHaveLength(0)
  })

  it('UFO does NOT render pulsar rings (user rejected — looked like outline)', () => {
    // Regression guard: the pulsar rings rendered as small cells arranged in a
    // circle around the UFO, which read as a weird halo/outline. Removed.
    for (const tick of [0, 5, 20, 50]) {
      const ufo = makeUFO({ id: `ufo-no-pulsar-${tick}`, x: 30, y: 1 })
      const state = stateWith([ufo], {}, { tick })
      const cmds = buildDrawCommands(state, null, state, 1, 1)
      const inner = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'ufo-pulsar-inner')
      const outer = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'ufo-pulsar-outer')
      expect(inner).toHaveLength(0)
      expect(outer).toHaveLength(0)
    }
  })

  it('UFO does NOT emit trail particle stragglers (user rejected)', () => {
    // Regression guard: small rainbow squares drifting down-and-back from
    // the UFO trail. Removed alongside the rainbow trail itself.
    const prevUfo = makeUFO({ id: 'ufo-sp', x: 10, y: 1, direction: 1 })
    const currUfo = makeUFO({ id: 'ufo-sp', x: 15, y: 1, direction: 1 })
    const prev = stateWith([prevUfo], {}, { tick: 10 })
    const curr = stateWith([currUfo], {}, { tick: 11 })
    const cmds = buildDrawCommands(curr, null, prev, 1, 1)
    const particles = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'ufo-trail-particle')
    expect(particles).toHaveLength(0)
  })

  it('primary UFO sprite contract preserved at all positions and ticks', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 113 }), fc.integer({ min: 0, max: 500 }), (x, tick) => {
        resetEffects()
        const ufo = makeUFO({ id: 'pbt-ufo-e2', x, y: 1 })
        const state = stateWith([ufo], {}, { tick })
        const cmds = buildDrawCommands(state, null, state, 1, 1)
        const primary = cmds.find(
          (c): c is SpriteCmd =>
            c.type === 'sprite' &&
            (!('kind' in c) || (c as any).kind === undefined) &&
            c.x === x * CELL_W &&
            c.y === 1 * CELL_H &&
            c.width === 7 * CELL_W &&
            c.height === 2 * CELL_H,
        )
        return primary !== undefined
      }),
      { numRuns: 30 },
    )
  })
})

// ─── Player bullet visual polish (extended) ──────────────────────────────────

describe('Player bullet visual polish (extended)', () => {
  type RectCmd = DrawCommand & { type: 'rect' }
  const isRect = (cmd: DrawCommand): cmd is RectCmd => cmd.type === 'rect'

  it('player bullet has chromatic aberration ghosts — two distinct slot-tinted colours, offset symmetrically', () => {
    // Bullet with a known slot-1 (cyan) player. Chromatic split produces two
    // colours — one cooler, one warmer — both derived from the slot hue so
    // coop players can tell their bullets apart. Before bug #1 fix, these
    // were always pure cyan/magenta regardless of slot.
    const bullet = makeBullet({ id: 'b-ca', x: 50, y: 20, ownerId: 'p1', dy: -1 })
    const player = makePlayer({ id: 'p1', slot: 1, x: 50 })
    const state = stateWith([bullet], { p1: player }, { tick: 50 })
    const cmds = buildDrawCommands(state, null, state, 1, 1)
    const chromatic = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'bullet-chromatic')
    expect(chromatic.length).toBeGreaterThanOrEqual(2)

    // Two distinct colours (not both identical)
    const fills = new Set(chromatic.map((c) => c.fill.toLowerCase()))
    expect(fills.size).toBeGreaterThanOrEqual(2)

    // Both offset from the bullet — one left, one right
    const bulletPxX = 50 * CELL_W
    const offsets = chromatic.map((c) => c.x - bulletPxX)
    const hasPosOffset = offsets.some((o) => o > 0)
    const hasNegOffset = offsets.some((o) => o < 0)
    expect(hasPosOffset).toBe(true)
    expect(hasNegOffset).toBe(true)
    for (const c of chromatic) {
      expect((c as any).alpha).toBeGreaterThan(0)
      expect((c as any).alpha).toBeLessThan(1)
    }
  })

  it('player bullet fizzle particles emit every 3 ticks', () => {
    const bullet = makeBullet({ id: 'b-fz', x: 50, y: 20, ownerId: 'p1', dy: -1 })
    // Count fizzles across a range of ticks — we should see periodic emission
    let ticksWithFizzle = 0
    for (let tick = 0; tick < 15; tick++) {
      const state = stateWith([bullet], {}, { tick })
      const cmds = buildDrawCommands(state, null, state, 1, 1)
      const fizzles = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'bullet-fizzle')
      if (fizzles.length > 0) ticksWithFizzle += 1
    }
    // Over 15 ticks with 1-in-3 emission, should get ~5 active ticks
    expect(ticksWithFizzle).toBeGreaterThanOrEqual(3)
  })

  it('player bullet glow halo is 3× sprite size, plus inner bright core', () => {
    const bullet = makeBullet({ id: 'b-g3', x: 50, y: 20, ownerId: 'p1', dy: -1 })
    const state = stateWith([bullet], {}, { tick: 50 })
    const cmds = buildDrawCommands(state, null, state, 1, 1)
    const glows = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'bullet-glow')
    expect(glows.length).toBeGreaterThan(0)
    const glow = glows[0]
    expect(glow.width).toBeGreaterThanOrEqual(3 * CELL_W)
    expect(glow.height).toBeGreaterThanOrEqual(3 * CELL_H)
    // Inner bright core
    const cores = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'bullet-core')
    expect(cores.length).toBeGreaterThan(0)
    const core = cores[0]
    expect((core as any).alpha).toBeGreaterThanOrEqual(0.5)
  })

  it('primary player bullet rect still at contract position', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 100 }),
        fc.integer({ min: 2, max: 30 }),
        fc.integer({ min: 0, max: 200 }),
        (x, y, tick) => {
          resetEffects()
          const bullet = makeBullet({ id: 'pbt-pb', x, y, ownerId: 'p1', dy: -1 })
          const state = stateWith([bullet], {}, { tick })
          const cmds = buildDrawCommands(state, null, state, 1, 1)
          const primary = cmds.find(
            (c): c is RectCmd =>
              isRect(c) &&
              c.fill === COLORS.bullet.player &&
              c.width === CELL_W &&
              c.height === CELL_H &&
              c.x === x * CELL_W &&
              c.y === y * CELL_H &&
              (!('kind' in c) || (c as any).kind === undefined),
          )
          return primary !== undefined
        },
      ),
      { numRuns: 30 },
    )
  })
})

// ─── Alien bullet visual polish (extended) ───────────────────────────────────

describe('Alien bullet visual polish (extended)', () => {
  type RectCmd = DrawCommand & { type: 'rect' }
  const isRect = (cmd: DrawCommand): cmd is RectCmd => cmd.type === 'rect'

  it('alien bullet has ember trail (multi-color yellow/orange/red)', () => {
    const bullet = makeBullet({ id: 'b-em', x: 50, y: 15, ownerId: null, dy: 1 })
    const state = stateWith([bullet], {}, { tick: 50 })
    const cmds = buildDrawCommands(state, null, state, 1, 1)
    const embers = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'bullet-ember')
    expect(embers.length).toBeGreaterThanOrEqual(4)
    // Collect fill colors — should include yellow-ish, orange-ish, red-ish
    const fills = embers.map((e) => e.fill.toLowerCase())
    const distinct = new Set(fills)
    expect(distinct.size).toBeGreaterThanOrEqual(3)
    // Alien bullet goes down; embers should be above (lower y) than bullet
    const bulletPxY = 15 * CELL_H
    for (const e of embers) {
      expect(e.y).toBeLessThan(bulletPxY + CELL_H)
    }
  })

  it('alien bullet has red pulsing aura', () => {
    const bullet = makeBullet({ id: 'b-au', x: 50, y: 15, ownerId: null, dy: 1 })
    const s1 = stateWith([bullet], {}, { tick: 0 })
    const s2 = stateWith([bullet], {}, { tick: 7 })
    const c1 = buildDrawCommands(s1, null, s1, 1, 1)
    const c2 = buildDrawCommands(s2, null, s2, 1, 1)
    const a1 = c1.find((c): c is RectCmd => isRect(c) && (c as any).kind === 'bullet-aura')
    const a2 = c2.find((c): c is RectCmd => isRect(c) && (c as any).kind === 'bullet-aura')
    expect(a1).toBeDefined()
    expect(a2).toBeDefined()
    // Red-ish (more red than green/blue)
    const hex = a1!.fill.replace('#', '')
    const r = Number.parseInt(hex.slice(0, 2), 16)
    const g = Number.parseInt(hex.slice(2, 4), 16)
    const b = Number.parseInt(hex.slice(4, 6), 16)
    expect(r).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(b)
    // Pulsing — alpha differs across ticks
    expect((a1 as any).alpha).not.toBe((a2 as any).alpha)
  })

  it('alien bullet occasionally emits spark flash', () => {
    const bullet = makeBullet({ id: 'b-sp', x: 50, y: 15, ownerId: null, dy: 1 })
    let ticksWithSpark = 0
    for (let tick = 0; tick < 40; tick++) {
      const state = stateWith([bullet], {}, { tick })
      const cmds = buildDrawCommands(state, null, state, 1, 1)
      const sparks = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'bullet-spark')
      if (sparks.length > 0) {
        ticksWithSpark += 1
        // Sparks should be white/bright
        for (const s of sparks) {
          expect(s.fill.toLowerCase()).toMatch(/#f{2}f{2}f{2}|#fff/)
        }
      }
    }
    // Every 10 ticks — so in 40 ticks should see at least 3
    expect(ticksWithSpark).toBeGreaterThanOrEqual(3)
  })

  it('primary alien bullet rect still at contract position', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 100 }),
        fc.integer({ min: 2, max: 30 }),
        fc.integer({ min: 0, max: 200 }),
        (x, y, tick) => {
          resetEffects()
          const bullet = makeBullet({ id: 'pbt-ab', x, y, ownerId: null, dy: 1 })
          const state = stateWith([bullet], {}, { tick })
          const cmds = buildDrawCommands(state, null, state, 1, 1)
          const primary = cmds.find(
            (c): c is RectCmd =>
              isRect(c) &&
              c.width === CELL_W &&
              c.height === CELL_H &&
              c.x === x * CELL_W &&
              c.y === y * CELL_H &&
              (!('kind' in c) || (c as any).kind === undefined),
          )
          return primary !== undefined
        },
      ),
      { numRuns: 30 },
    )
  })
})

// ─── Typography upgrades (crank to 11) ──────────────────────────────────────

describe('Typography: HUD glow and transitions', () => {
  it('HUD text commands have shadowBlur metadata or glow wrapper', () => {
    const state = stateWith([], {}, { tick: 0, score: 100, wave: 1 })
    const commands = buildDrawCommands(state, null)
    const hudKinds = new Set([
      'hud-score',
      'score-bump',
      'hud-wave',
      'wave-burst',
      'hud-lives',
      'hud-lives-label',
      'hud-lives-row',
    ])
    // Collect blur values from both single text commands and compound text-row
    // segments tagged with a HUD kind.
    const blurs: number[] = []
    for (const c of commands) {
      if (!('kind' in c) || !hudKinds.has((c as any).kind)) continue
      if (c.type === 'text') blurs.push((c as any).shadowBlur)
      if (c.type === 'text-row') {
        for (const seg of (c as any).segments) blurs.push(seg.shadowBlur)
      }
    }
    expect(blurs.length).toBeGreaterThan(0)
    for (const b of blurs) {
      expect(typeof b).toBe('number')
      expect(b).toBeGreaterThan(0)
    }
  })

  it('score bump increases font size briefly after score increase', () => {
    const prev = stateWith([], {}, { tick: 100, score: 0, wave: 1 })
    const curr = stateWith([], {}, { tick: 101, score: 100, wave: 1 })
    const cmds = buildDrawCommands(curr, null, prev)
    const scoreText = cmds.find(
      (c): c is DrawCommand & { type: 'text' } => c.type === 'text' && c.text.startsWith('SCORE'),
    )
    expect(scoreText).toBeDefined()
    expect(scoreText!.font).toBeDefined()
    const match = scoreText!.font!.match(/(\d+)px/)
    expect(match).not.toBeNull()
    const fontSize = Number.parseInt(match![1], 10)
    expect(fontSize).toBeGreaterThan(28)
  })

  it('score does not bump when score is unchanged', () => {
    const prev = stateWith([], {}, { tick: 100, score: 50, wave: 1 })
    const curr = stateWith([], {}, { tick: 101, score: 50, wave: 1 })
    const cmds = buildDrawCommands(curr, null, prev)
    const scoreText = cmds.find(
      (c): c is DrawCommand & { type: 'text' } => c.type === 'text' && c.text.startsWith('SCORE'),
    )
    expect(scoreText).toBeDefined()
    const match = scoreText!.font!.match(/(\d+)px/)
    const fontSize = Number.parseInt(match![1], 10)
    expect(fontSize).toBe(28)
  })

  it('rapid consecutive kills do NOT retrigger the score bump mid-decay (debounced)', async () => {
    // Regression guard: previously, every `score > prevScore` comparison
    // set scoreBumpTicks = 3, so a chain of kills in consecutive ticks
    // kept the HUD SCORE text popped-large continuously (visible as an
    // HUD flicker during busy waves). Now the bump debounces — a second
    // score increase within the decay window must NOT extend the bump.
    const { resetEffects } = await import('./renderer/canvasRenderer')
    resetEffects()
    // First kill — sets the bump.
    const s0 = stateWith([], {}, { tick: 100, score: 0, wave: 1 })
    const s1 = stateWith([], {}, { tick: 101, score: 10, wave: 1 })
    buildDrawCommands(s1, null, s0)
    // Second kill on the very next tick — must NOT re-bump.
    const s2 = stateWith([], {}, { tick: 102, score: 20, wave: 1 })
    buildDrawCommands(s2, null, s1)
    // Third kill one tick later — still in the debounce window.
    const s3 = stateWith([], {}, { tick: 103, score: 30, wave: 1 })
    const cmds = buildDrawCommands(s3, null, s2)
    // By tick 103, the bump started at tick 101 has decayed:
    //   tick 101 → set 3, decay on 102 → 2, decay on 103 → 1
    // With debounce, bumpTicks must NOT be refreshed to 3 — SCORE font
    // must still be at normal size (decayed past its 3-tick window in
    // principle) OR it may still be in residual decay but the peak was
    // NOT refreshed. The strongest, simplest assertion: font size does
    // NOT stay at the bumped size (>35px) across >2 consecutive kills.
    const scoreText = cmds.find(
      (c): c is DrawCommand & { type: 'text' } => c.type === 'text' && c.text.startsWith('SCORE'),
    )
    expect(scoreText).toBeDefined()
    const match = scoreText!.font!.match(/(\d+)px/)
    const fontSize = Number.parseInt(match![1], 10)
    // Without debounce, fontSize would still be ~39 (bumped) — prove it's back down.
    expect(fontSize).toBeLessThanOrEqual(30)
  })

  it('score bump cooldown boundary: 9 ticks after arm does NOT re-arm; 10 does', async () => {
    // Direct test of the debounce mechanism (lastScoreBumpTick) rather
    // than just observing the downstream font size. Exercises the
    // cooldown boundary to catch off-by-one regressions in the gate.
    const { resetEffects, _getScoreBumpStateForTests } = await import('./renderer/canvasRenderer')
    resetEffects()

    // First kill at tick 100 — arms the bump.
    const s0 = stateWith([], {}, { tick: 99, score: 0 })
    const s1 = stateWith([], {}, { tick: 100, score: 10 })
    buildDrawCommands(s1, null, s0)
    expect(_getScoreBumpStateForTests().lastArmedTick).toBe(100)

    // Second kill at tick 109 (9 ticks later — still inside the cooldown).
    const s9 = stateWith([], {}, { tick: 109, score: 20 })
    buildDrawCommands(s9, null, s1)
    expect(_getScoreBumpStateForTests().lastArmedTick).toBe(100) // NOT re-armed

    // Third kill at tick 110 (exactly the cooldown boundary). Per the
    // implementation `>= SCORE_BUMP_COOLDOWN_TICKS`, this CAN re-arm.
    const s10 = stateWith([], {}, { tick: 110, score: 30 })
    buildDrawCommands(s10, null, s9)
    expect(_getScoreBumpStateForTests().lastArmedTick).toBe(110)
  })

  it('wave change produces a glow burst decoration', () => {
    const prev = stateWith([], {}, { tick: 100, score: 0, wave: 1 })
    const curr = stateWith([], {}, { tick: 101, score: 0, wave: 2 })
    const cmds = buildDrawCommands(curr, null, prev)
    const burst = cmds.find(
      (c): c is DrawCommand & { type: 'text' } => c.type === 'text' && 'kind' in c && (c as any).kind === 'wave-burst',
    )
    expect(burst).toBeDefined()
    expect((burst as any).shadowBlur).toBeGreaterThanOrEqual(24)
  })
})

// ─── Background upgrades (crank to 11) ─────────────────────────────────────

describe('Background: nebula, shooting stars, distant planet, CRT', () => {
  it('nebula produces 6 clouds', async () => {
    const { NebulaSystem } = await import('./renderer/nebula')
    const n = new NebulaSystem({ width: 960, height: 576 })
    expect(n.getDrawCalls(0).length).toBe(6)
  })

  it('shooting star appears approximately every 150 ticks', async () => {
    const { ShootingStarSystem, SPAWN_INTERVAL } = await import('./renderer/shootingStars')
    const s = new ShootingStarSystem({ width: 960, height: 576 })
    let spawns = 0
    let prevActive = 0
    for (let tick = 0; tick < SPAWN_INTERVAL * 6; tick++) {
      s.update(tick)
      const active = s.activeCount()
      if (active > prevActive) spawns++
      prevActive = active
    }
    expect(spawns).toBeGreaterThanOrEqual(5)
    expect(spawns).toBeLessThanOrEqual(7)
  })

  it('shooting star produces head + trail commands when active', async () => {
    const { ShootingStarSystem } = await import('./renderer/shootingStars')
    const s = new ShootingStarSystem({ width: 960, height: 576 })
    s.update(0)
    const calls = s.getDrawCalls()
    const head = calls.filter((c: any) => c.kind === 'shooting-star')
    const trail = calls.filter((c: any) => c.kind === 'shooting-star-trail')
    expect(head.length).toBeGreaterThan(0)
    expect(trail.length).toBeGreaterThanOrEqual(5)
  })

  it('distant planet is rendered once per frame', () => {
    const state = stateWith([], {}, { tick: 0 })
    const cmds = buildDrawCommands(state, null)
    const planet = cmds.filter((c) => c.type === 'image' && 'kind' in c && (c as any).kind === 'distant-planet')
    expect(planet.length).toBe(1)
    expect((planet[0] as any).alpha).toBeCloseTo(0.2, 1)
  })

  it('scanline alpha varies over time', async () => {
    const { getScanlineAlpha } = await import('./renderer/crtEffect')
    const samples: number[] = []
    for (let t = 0; t < 1000; t += 50) {
      samples.push(getScanlineAlpha(t))
    }
    const min = Math.min(...samples)
    const max = Math.max(...samples)
    expect(max - min).toBeGreaterThan(0.02)
  })
})

// ─── Player elevation pass 2 ────────────────────────────────────────────────

describe('Player elevation pass 2', () => {
  type RectCmd = DrawCommand & { type: 'rect' }
  const isRect = (c: DrawCommand): c is RectCmd => c.type === 'rect'

  it('afterburner flame core is bright and slot-tinted', () => {
    // After bug #9 fix, the core palette is no longer hard-coded white-yellow.
    // It blends slot colour with white at decreasing strengths (70% / 45% / 25%
    // white mix) so the flame carries this player's hue. Slot 1 (cyan) cores
    // are white-cyan; slot 2 (orange) cores are white-orange; etc.
    // Invariants: (a) at least one channel is bright (>200), and (b) the
    // brightest core has some channel >= 180 (no dim fills).
    const player = makePlayer({ x: 60 })
    const state = stateWith([], { [player.id]: player }, { tick: 0 })
    const cmds = buildDrawCommands(state, null)
    const cores = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'player-afterburner-core')
    expect(cores.length).toBeGreaterThan(0)
    for (const c of cores) {
      const hex = c.fill.replace('#', '')
      const r = Number.parseInt(hex.slice(0, 2), 16)
      const g = Number.parseInt(hex.slice(2, 4), 16)
      const b = Number.parseInt(hex.slice(4, 6), 16)
      // At least ONE channel is very bright — core must not read "dim".
      expect(Math.max(r, g, b)).toBeGreaterThanOrEqual(200)
    }
    // The brightest of the three core rows blends 70% white + 30% slot, so
    // sum of channels should exceed a bright-leaning threshold (roughly
    // 0.7 * 3 * 255 = ~535 minimum before slot contribution).
    const brightest = cores.reduce((acc, c) => {
      const hex = c.fill.replace('#', '')
      const sum =
        Number.parseInt(hex.slice(0, 2), 16) +
        Number.parseInt(hex.slice(2, 4), 16) +
        Number.parseInt(hex.slice(4, 6), 16)
      return sum > acc ? sum : acc
    }, 0)
    expect(brightest).toBeGreaterThanOrEqual(500)
  })

  it('afterburner flame edges are orange-red', () => {
    const player = makePlayer({ x: 60 })
    const state = stateWith([], { [player.id]: player }, { tick: 0 })
    const cmds = buildDrawCommands(state, null)
    const edges = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'player-afterburner-edge')
    expect(edges.length).toBeGreaterThan(0)
    // Orange-red: red > green, green > blue, red dominant
    for (const e of edges) {
      const hex = e.fill.replace('#', '')
      const r = Number.parseInt(hex.slice(0, 2), 16)
      const g = Number.parseInt(hex.slice(2, 4), 16)
      const b = Number.parseInt(hex.slice(4, 6), 16)
      expect(r).toBeGreaterThan(g)
      expect(r).toBeGreaterThan(b)
    }
  })

  it('afterburner flickers over time', () => {
    const player = makePlayer({ x: 60 })
    const s0 = stateWith([], { [player.id]: player }, { tick: 0 })
    const s1 = stateWith([], { [player.id]: player }, { tick: 5 })
    const c0 = buildDrawCommands(s0, null)
    const c1 = buildDrawCommands(s1, null)
    const flame0 = c0.filter(
      (c): c is RectCmd =>
        isRect(c) && ((c as any).kind === 'player-afterburner-core' || (c as any).kind === 'player-afterburner-edge'),
    )
    const flame1 = c1.filter(
      (c): c is RectCmd =>
        isRect(c) && ((c as any).kind === 'player-afterburner-core' || (c as any).kind === 'player-afterburner-edge'),
    )
    expect(flame0.length).toBeGreaterThan(0)
    expect(flame1.length).toBeGreaterThan(0)
    // Width or alpha should differ across ticks (flicker via sin(tick))
    const sig0 = flame0.map((r) => `${r.x},${r.y},${r.width},${r.alpha ?? 1}`).join('|')
    const sig1 = flame1.map((r) => `${r.x},${r.y},${r.width},${r.alpha ?? 1}`).join('|')
    expect(sig0).not.toBe(sig1)
  })

  it('reflection highlight moves across sprite over time', () => {
    const player = makePlayer({ x: 60 })
    const s0 = stateWith([], { [player.id]: player }, { tick: 0 })
    const s60 = stateWith([], { [player.id]: player }, { tick: 60 })
    const c0 = buildDrawCommands(s0, null)
    const c60 = buildDrawCommands(s60, null)
    const r0 = c0.find((c): c is RectCmd => isRect(c) && (c as any).kind === 'player-reflection')
    const r60 = c60.find((c): c is RectCmd => isRect(c) && (c as any).kind === 'player-reflection')
    expect(r0).toBeDefined()
    expect(r60).toBeDefined()
    expect(r0!.x).not.toBe(r60!.x)
    // Stays within sprite bounds
    const spriteLeft = (60 - 3) * CELL_W
    const spriteRight = (60 + 4) * CELL_W
    const spriteTop = LAYOUT.PLAYER_Y * CELL_H
    const spriteBottom = spriteTop + 2 * CELL_H
    for (const r of [r0!, r60!]) {
      expect(r.x).toBeGreaterThanOrEqual(spriteLeft)
      expect(r.x + r.width).toBeLessThanOrEqual(spriteRight)
      expect(r.y).toBeGreaterThanOrEqual(spriteTop)
      expect(r.y + r.height).toBeLessThanOrEqual(spriteBottom)
    }
  })

  it('warning pulse appears only at 1 life', () => {
    // 3 lives → no pulse
    const player3 = makePlayer({ x: 60, lives: 3 })
    const state3 = stateWith([], { [player3.id]: player3 }, { tick: 0 })
    const cmds3 = buildDrawCommands(state3, null)
    const pulse3 = cmds3.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'player-warning-pulse')
    expect(pulse3.length).toBe(0)

    // 1 life → pulse exists at some tick in [0..20)
    const player1 = makePlayer({ x: 60, lives: 1 })
    let found = 0
    for (let tick = 0; tick < 20; tick++) {
      const state1 = stateWith([], { [player1.id]: player1 }, { tick })
      const cmds1 = buildDrawCommands(state1, null)
      const pulse1 = cmds1.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'player-warning-pulse')
      if (pulse1.length > 0) {
        found += 1
        // Red-ish fill
        for (const p of pulse1) {
          const hex = p.fill.replace('#', '')
          const r = Number.parseInt(hex.slice(0, 2), 16)
          const g = Number.parseInt(hex.slice(2, 4), 16)
          const b = Number.parseInt(hex.slice(4, 6), 16)
          expect(r).toBeGreaterThan(g)
          expect(r).toBeGreaterThan(b)
        }
      }
    }
    expect(found).toBeGreaterThanOrEqual(1)
  })

  it('impact shield burst on hit', () => {
    const alivePlayer = makePlayer({ x: 60, alive: true, invulnerableUntilTick: null })
    const _deadPlayer = makePlayer({ x: 60, alive: false, invulnerableUntilTick: null })
    const prev = stateWith([], { [alivePlayer.id]: alivePlayer }, { tick: 10 })
    // Respawn with invuln set (we still render when alive=true)
    const respawnedPlayer = makePlayer({
      x: 60,
      alive: true,
      invulnerableUntilTick: 60,
    })
    const curr = stateWith([], { [respawnedPlayer.id]: respawnedPlayer }, { tick: 11 })
    const cmds = buildDrawCommands(curr, null, prev, 1, 1)
    const burst = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'player-impact-shield')
    expect(burst.length).toBeGreaterThanOrEqual(8)
  })

  it('PBT: afterburner, reflection, warning stay within or below sprite bounds', () => {
    const emKinds = new Set([
      'player-afterburner-core',
      'player-afterburner-edge',
      'player-reflection',
      'player-warning-pulse',
    ])
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 115 }),
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: 1, max: 3 }),
        (px, tick, lives) => {
          resetEffects()
          const player = makePlayer({ x: px, lives })
          const state = stateWith([], { [player.id]: player }, { tick })
          const cmds = buildDrawCommands(state, null)
          const spriteLeft = (px - 3) * CELL_W
          const spriteRight = (px + 4) * CELL_W
          const spriteTop = LAYOUT.PLAYER_Y * CELL_H
          const spriteBottom = spriteTop + 2 * CELL_H
          // afterburner extends below, up to 10 cells
          const afterburnerMaxY = spriteBottom + 12 * CELL_H
          for (const c of cmds) {
            if (c.type !== 'rect') continue
            const k = (c as any).kind
            if (!emKinds.has(k)) continue
            if (k === 'player-reflection' || k === 'player-warning-pulse') {
              // Must stay within sprite bounds
              if (c.x < spriteLeft) return false
              if (c.x + c.width > spriteRight) return false
              if (c.y < spriteTop) return false
              if (c.y + c.height > spriteBottom) return false
            } else {
              // Afterburner: below the sprite, within horizontal range
              if (c.x < spriteLeft - CELL_W) return false
              if (c.x + c.width > spriteRight + CELL_W) return false
              if (c.y < spriteBottom - CELL_H) return false
              if (c.y + c.height > afterburnerMaxY) return false
            }
          }
          return true
        },
      ),
      { numRuns: 40 },
    )
  })
})

// ─── Player bullet elevation pass 2 ─────────────────────────────────────────

describe('Player bullet elevation pass 2', () => {
  type RectCmd = DrawCommand & { type: 'rect' }
  const isRect = (c: DrawCommand): c is RectCmd => c.type === 'rect'

  it('bullet has tapered beam (core + mid + outer)', () => {
    const bullet = makeBullet({ id: 'b-tap', x: 50, y: 20, ownerId: 'p1', dy: -1 })
    const state = stateWith([bullet], {}, { tick: 20 })
    const cmds = buildDrawCommands(state, null, state, 1, 1)
    const core = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'bullet-taper-core')
    const mid = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'bullet-taper-mid')
    const outer = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'bullet-taper-outer')
    expect(core.length).toBeGreaterThan(0)
    expect(mid.length).toBeGreaterThan(0)
    expect(outer.length).toBeGreaterThan(0)
  })

  it('beam outer is wider than primary cell', () => {
    const bullet = makeBullet({ id: 'b-tp2', x: 50, y: 20, ownerId: 'p1', dy: -1 })
    const state = stateWith([bullet], {}, { tick: 20 })
    const cmds = buildDrawCommands(state, null, state, 1, 1)
    const outer = cmds.find((c): c is RectCmd => isRect(c) && (c as any).kind === 'bullet-taper-outer')
    expect(outer).toBeDefined()
    expect(outer!.width).toBeGreaterThan(CELL_W)
    // Stays within 3×3 area around the main bullet cell
    const bulletPxX = 50 * CELL_W
    const bulletPxY = 20 * CELL_H
    expect(outer!.x).toBeGreaterThanOrEqual(bulletPxX - CELL_W)
    expect(outer!.x + outer!.width).toBeLessThanOrEqual(bulletPxX + 2 * CELL_W)
    expect(outer!.y).toBeGreaterThanOrEqual(bulletPxY - CELL_H)
    expect(outer!.y + outer!.height).toBeLessThanOrEqual(bulletPxY + 2 * CELL_H)
  })

  it('muzzle lightning arc emitted on new bullet', () => {
    const bullet = makeBullet({ id: 'b-arc', x: 60, y: 28, ownerId: 'player-1', dy: -1 })
    const player = makePlayer({ x: 60 })
    const prev = stateWith([], { [player.id]: player }, { tick: 10 })
    const curr = stateWith([bullet], { [player.id]: player }, { tick: 11 })
    const cmds = buildDrawCommands(curr, null, prev, 1, 1)
    const arc = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'bullet-arc')
    expect(arc.length).toBeGreaterThanOrEqual(3)
    expect(arc.length).toBeLessThanOrEqual(6)
  })

  it('impact burst on bullet disappearance', () => {
    // Bullet in prev, not in curr, not off-screen → burst at last position
    const bullet = makeBullet({ id: 'b-imp', x: 50, y: 10, ownerId: 'player-1', dy: -1 })
    const prev = stateWith([bullet], {}, { tick: 10 })
    const curr = stateWith([], {}, { tick: 11 })
    const cmds = buildDrawCommands(curr, null, prev, 1, 1)
    const burst = cmds.filter((c): c is RectCmd => isRect(c) && (c as any).kind === 'bullet-impact-burst')
    expect(burst.length).toBeGreaterThanOrEqual(6)
    // Cells clustered near the bullet's last position
    const bulletPxX = 50 * CELL_W
    const bulletPxY = 10 * CELL_H
    for (const b of burst) {
      expect(Math.abs(b.x - bulletPxX)).toBeLessThan(4 * CELL_W)
      expect(Math.abs(b.y - bulletPxY)).toBeLessThan(4 * CELL_H)
    }
  })

  it('PBT: primary bullet rect at exact contract position', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 100 }),
        fc.integer({ min: 2, max: 30 }),
        fc.integer({ min: 0, max: 200 }),
        (x, y, tick) => {
          resetEffects()
          const bullet = makeBullet({ id: 'pbt-tap', x, y, ownerId: 'p1', dy: -1 })
          const state = stateWith([bullet], {}, { tick })
          const cmds = buildDrawCommands(state, null, state, 1, 1)
          const primary = cmds.find(
            (c): c is RectCmd =>
              isRect(c) &&
              c.fill === COLORS.bullet.player &&
              c.width === CELL_W &&
              c.height === CELL_H &&
              c.x === x * CELL_W &&
              c.y === y * CELL_H &&
              (!('kind' in c) || (c as any).kind === undefined),
          )
          return primary !== undefined
        },
      ),
      { numRuns: 30 },
    )
  })
})

// ─── Explosion elevation ─────────────────────────────────────────────────────

describe('Explosion elevation', () => {
  function explosionCmds(commands: DrawCommand[], kind: string): DrawCommand[] {
    return commands.filter((c) => 'kind' in c && (c as { kind?: string }).kind === kind)
  }

  it('alien death spawns an explosion', () => {
    const alien = makeAlien({ id: 'alien-xx', alive: true })
    const prevState = stateWith([alien], {}, { tick: 100 })
    const deadAlien = makeAlien({ id: 'alien-xx', alive: false })
    const currentState = stateWith([deadAlien], {}, { tick: 101 })

    const commands = buildDrawCommands(currentState, null, prevState)

    const explosionCommands = commands.filter(
      (c) =>
        'kind' in c &&
        typeof (c as { kind?: string }).kind === 'string' &&
        (c as { kind: string }).kind.startsWith('explosion-'),
    )
    expect(explosionCommands.length).toBeGreaterThan(0)
  })

  it('explosion flash alpha stays in soft-highlight range (not painfully bright)', () => {
    // Regression guard: user complained the flash was painfully bright. The
    // radial gradient's peak interior stop must stay below a hard ceiling.
    const alien = makeAlien({ id: 'alien-xx', alive: true })
    const prevState = stateWith([alien], {}, { tick: 100 })
    const deadAlien = makeAlien({ id: 'alien-xx', alive: false })
    const currentState = stateWith([deadAlien], {}, { tick: 101 })

    const commands = buildDrawCommands(currentState, null, prevState)
    const flashes = explosionCmds(commands, 'explosion-flash')
    const fireballs = explosionCmds(commands, 'explosion-fireball')
    expect(flashes.length + fireballs.length).toBeGreaterThan(0)

    // Inspect radial command stops
    for (const c of [...flashes, ...fireballs]) {
      if (c.type === 'radial') {
        const maxStop = Math.max(...c.stops.map((s) => s.alpha))
        expect(maxStop).toBeLessThanOrEqual(0.95)
      }
    }
  })

  it('explosion uses smooth canvas primitives (not pixellated rects only)', () => {
    // Regression guard: previous implementation used only type:'rect' which
    // looked blocky. At least one explosion command must be radial or circle.
    const alien = makeAlien({ id: 'alien-smooth', alive: true, x: 50, y: 10 })
    const prevState = stateWith([alien], {}, { tick: 100 })
    const deadAlien = makeAlien({ id: 'alien-smooth', alive: false, x: 50, y: 10 })
    const currentState = stateWith([deadAlien], {}, { tick: 101 })

    const commands = buildDrawCommands(currentState, null, prevState)
    const explosionTypes = new Set(
      commands
        .filter(
          (c) =>
            'kind' in c &&
            typeof (c as { kind?: string }).kind === 'string' &&
            (c as { kind: string }).kind.startsWith('explosion-'),
        )
        .map((c) => c.type),
    )
    const hasSmoothPrimitive = explosionTypes.has('radial') || explosionTypes.has('circle')
    expect(hasSmoothPrimitive).toBe(true)
  })

  it('explosion fireball radius fits within ~3× entity width (localised)', () => {
    // Regression guard: explosions must not span the screen.
    const alien = makeAlien({ id: 'alien-local', alive: true, x: 50, y: 10 })
    const prevState = stateWith([alien], {}, { tick: 100 })
    const deadAlien = makeAlien({ id: 'alien-local', alive: false, x: 50, y: 10 })
    const currentState = stateWith([deadAlien], {}, { tick: 101 })

    const commands = buildDrawCommands(currentState, null, prevState)
    const fireballs = explosionCmds(commands, 'explosion-fireball')
    expect(fireballs.length).toBeGreaterThan(0)

    const alienWidthCells = 7
    const maxAllowedPx = alienWidthCells * 3 * CELL_W
    for (const f of fireballs) {
      if (f.type === 'radial' || f.type === 'circle') {
        expect(f.radius).toBeLessThanOrEqual(maxAllowedPx)
      }
    }
  })

  it('explosion debris stays close to origin (localised, not screen-wide)', () => {
    const alien = makeAlien({ id: 'alien-debris', alive: true, x: 50, y: 10 })
    const prevState = stateWith([alien], {}, { tick: 100 })
    const deadAlien = makeAlien({ id: 'alien-debris', alive: false, x: 50, y: 10 })
    const currentState = stateWith([deadAlien], {}, { tick: 101 })
    buildDrawCommands(currentState, null, prevState)
    const later = stateWith([deadAlien], {}, { tick: 108 })
    const commands = buildDrawCommands(later, null, currentState)
    const debris = explosionCmds(commands, 'explosion-debris')
    expect(debris.length).toBeGreaterThan(0)
    const cx = (50 + 7 / 2) * CELL_W
    const cy = (10 + 2 / 2) * CELL_H
    const maxRadiusPx = 8 * CELL_W
    for (const d of debris) {
      // Debris may be rect (old) or circle (new); handle both for resilience
      const dx = ('cx' in d ? d.cx : (d as any).x) - cx
      const dy = ('cy' in d ? d.cy : (d as any).y) - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      expect(dist).toBeLessThan(maxRadiusPx * 1.5)
    }
  })

  it('explosion has shockwave (expanding radial ring)', () => {
    const alien = makeAlien({ id: 'alien-yy', alive: true, x: 50, y: 10 })
    const prevState = stateWith([alien], {}, { tick: 100 })
    const deadAlien = makeAlien({ id: 'alien-yy', alive: false, x: 50, y: 10 })
    const currentState = stateWith([deadAlien], {}, { tick: 101 })

    buildDrawCommands(currentState, null, prevState)
    const laterState = stateWith([deadAlien], {}, { tick: 106 })
    const commands = buildDrawCommands(laterState, null, currentState)
    const shockwave = explosionCmds(commands, 'explosion-shockwave')
    expect(shockwave.length).toBeGreaterThan(0)
    // Shockwave is now a radial gradient; its radius should be > 0 as it expands
    for (const s of shockwave) {
      if (s.type === 'radial' || s.type === 'circle') {
        expect(s.radius).toBeGreaterThan(0)
      }
    }
  })

  it('explosion has coloured debris particles', () => {
    const alien = makeAlien({ id: 'alien-zz', type: 'squid', alive: true })
    const prevState = stateWith([alien], {}, { tick: 100 })
    const deadAlien = makeAlien({ id: 'alien-zz', type: 'squid', alive: false })
    const currentState = stateWith([deadAlien], {}, { tick: 101 })

    buildDrawCommands(currentState, null, prevState)
    const later = stateWith([deadAlien], {}, { tick: 104 })
    const commands = buildDrawCommands(later, null, currentState)
    const debris = explosionCmds(commands, 'explosion-debris')
    expect(debris.length).toBeGreaterThan(0)
    const expectedColor = COLORS.alien.squid
    // Debris should carry the alien's colour
    for (const d of debris) {
      if (d.type === 'circle') expect(d.fill).toBe(expectedColor)
      else if (d.type === 'rect') expect(d.fill).toBe(expectedColor)
    }
    // Distinct positions — radial scatter
    const xs = new Set(debris.map((d) => Math.round('cx' in d ? d.cx : (d as any).x)))
    expect(xs.size).toBeGreaterThan(2)
  })

  it('after 10+ ticks, embers appear', () => {
    const alien = makeAlien({ id: 'alien-aa', alive: true })
    const prevState = stateWith([alien], {}, { tick: 100 })
    const deadAlien = makeAlien({ id: 'alien-aa', alive: false })
    const currentState = stateWith([deadAlien], {}, { tick: 101 })
    buildDrawCommands(currentState, null, prevState)
    const laterState = stateWith([deadAlien], {}, { tick: 112 })
    const commands = buildDrawCommands(laterState, null, currentState)
    const embers = explosionCmds(commands, 'explosion-ember')
    expect(embers.length).toBeGreaterThan(0)
  })

  it('no explosion when no death occurred', () => {
    const alien = makeAlien({ id: 'alien-bb', alive: true })
    const prevState = stateWith([alien], {}, { tick: 100 })
    const currentState = stateWith([alien], {}, { tick: 101 })

    const commands = buildDrawCommands(currentState, null, prevState)
    const explosionCommands = commands.filter(
      (c) =>
        'kind' in c &&
        typeof (c as { kind?: string }).kind === 'string' &&
        (c as { kind: string }).kind.startsWith('explosion-'),
    )
    expect(explosionCommands).toHaveLength(0)
  })
})

// ─── Legacy dissolve removal ─────────────────────────────────────────────────

describe('Legacy dissolve removed (no blocky alien-colored squares)', () => {
  it('alien death does not emit any kind="dissolve" commands', async () => {
    const { resetEffects } = await import('./renderer/canvasRenderer')
    resetEffects()
    const alien = makeAlien({ id: 'dis-1', alive: true, x: 40, y: 10, type: 'squid' })
    const prevState = stateWith([alien], {}, { tick: 100 })
    const deadAlien = makeAlien({ id: 'dis-1', alive: false, x: 40, y: 10, type: 'squid' })
    const currentState = stateWith([deadAlien], {}, { tick: 101 })
    const cmds = buildDrawCommands(currentState, null, prevState)
    const dissolveCmds = cmds.filter((c) => 'kind' in c && (c as { kind?: string }).kind === 'dissolve')
    expect(dissolveCmds).toHaveLength(0)
  })

  it('NO full-cell alien-colored rect particles after death (was the blocky-square bug)', async () => {
    const { resetEffects } = await import('./renderer/canvasRenderer')
    resetEffects()
    const alien = makeAlien({ id: 'dis-2', alive: true, x: 30, y: 8, type: 'squid' })
    const prevState = stateWith([alien], {}, { tick: 50 })
    const deadAlien = makeAlien({ id: 'dis-2', alive: false, x: 30, y: 8, type: 'squid' })
    const currentState = stateWith([deadAlien], {}, { tick: 51 })
    // Also sample a mid-age frame
    buildDrawCommands(currentState, null, prevState)
    const later = stateWith([deadAlien], {}, { tick: 55 })
    const cmds = buildDrawCommands(later, null, currentState)

    const squidColor = COLORS.alien.squid
    // Blocky-square signature: type=rect, fill === alien color, dimensions >= full cell
    const blockyAlienRects = cmds.filter(
      (c) =>
        c.type === 'rect' &&
        (c as any).fill === squidColor &&
        (c as any).width >= CELL_W &&
        (c as any).height >= CELL_H,
    )
    expect(blockyAlienRects).toHaveLength(0)
  })
})

// ─── Barrier elevation #1: concrete noise texture ─────────────────────────────

describe('Barrier concrete noise', () => {
  type CircleCmd = DrawCommand & { type: 'circle' }
  const isCircle = (c: DrawCommand): c is CircleCmd => c.type === 'circle'

  it('segments emit concrete noise as smooth circles (not rivet rects)', () => {
    const barrier: import('../../shared/types').BarrierEntity = {
      kind: 'barrier',
      id: 'bn-1',
      x: 10,
      segments: [{ offsetX: 0, offsetY: 0, health: 4 }],
    }
    const state = stateWith([barrier], {})
    const commands = buildDrawCommands(state, null)

    const noise = commands.filter((c): c is CircleCmd => isCircle(c) && (c as any).kind === 'barrier-noise')
    expect(noise.length).toBeGreaterThanOrEqual(4) // several pits per segment
  })

  it('noise circles stay within segment bounds', () => {
    const barrier: import('../../shared/types').BarrierEntity = {
      kind: 'barrier',
      id: 'bn-2',
      x: 20,
      segments: [{ offsetX: 2, offsetY: 1, health: 4 }],
    }
    const state = stateWith([barrier], {})
    const commands = buildDrawCommands(state, null)

    const noise = commands.filter((c): c is CircleCmd => isCircle(c) && (c as any).kind === 'barrier-noise')
    const segLeft = (20 + 2 * 3) * CELL_W
    const segTop = (LAYOUT.BARRIER_Y + 1 * 2) * CELL_H
    const segW = 3 * CELL_W
    const segH = 2 * CELL_H
    for (const c of noise) {
      expect(c.cx - c.radius).toBeGreaterThanOrEqual(segLeft - 1)
      expect(c.cx + c.radius).toBeLessThanOrEqual(segLeft + segW + 1)
      expect(c.cy - c.radius).toBeGreaterThanOrEqual(segTop - 1)
      expect(c.cy + c.radius).toBeLessThanOrEqual(segTop + segH + 1)
    }
  })

  it('noise is deterministic per segment position', () => {
    const barrier: import('../../shared/types').BarrierEntity = {
      kind: 'barrier',
      id: 'bn-3',
      x: 30,
      segments: [{ offsetX: 1, offsetY: 0, health: 4 }],
    }
    const state1 = stateWith([barrier], {}, { tick: 0 })
    const state2 = stateWith([barrier], {}, { tick: 100 })

    const n1 = buildDrawCommands(state1, null).filter(
      (c) => c.type === 'circle' && (c as any).kind === 'barrier-noise',
    ) as CircleCmd[]
    const n2 = buildDrawCommands(state2, null).filter(
      (c) => c.type === 'circle' && (c as any).kind === 'barrier-noise',
    ) as CircleCmd[]
    expect(n1.length).toBe(n2.length)
    for (let i = 0; i < n1.length; i++) {
      expect(n1[i].cx).toBe(n2[i].cx)
      expect(n1[i].cy).toBe(n2[i].cy)
      expect(n1[i].radius).toBe(n2[i].radius)
    }
  })

  it('noise circles have varying radii (pitted look, not uniform dots)', () => {
    const barrier: import('../../shared/types').BarrierEntity = {
      kind: 'barrier',
      id: 'bn-4',
      x: 40,
      segments: [{ offsetX: 0, offsetY: 0, health: 4 }],
    }
    const state = stateWith([barrier], {})
    const commands = buildDrawCommands(state, null)
    const noise = commands.filter((c) => c.type === 'circle' && (c as any).kind === 'barrier-noise') as CircleCmd[]
    const radii = new Set(noise.map((c) => c.radius))
    expect(radii.size).toBeGreaterThan(1)
  })
})

// ─── Barrier elevation #5: cumulative damage scars ────────────────────────────

describe('Barrier cumulative damage', () => {
  // Import resetEffects so each test starts fresh
  const barrierAt = (x: number, offsetX: number, health: 1 | 2 | 3 | 4) => ({
    kind: 'barrier' as const,
    id: `cd-${x}-${offsetX}`,
    x,
    segments: [{ offsetX, offsetY: 0, health }],
  })

  it('no scars when no health transitions have occurred', async () => {
    const { resetEffects } = await import('./renderer/canvasRenderer')
    resetEffects()
    const barrier = barrierAt(10, 0, 4)
    const state = stateWith([barrier], {}, { tick: 0 })
    const commands = buildDrawCommands(state, null, state)
    const scars = commands.filter((c) => 'kind' in c && (c as any).kind === 'barrier-damage-scar')
    expect(scars).toHaveLength(0)
  })

  it('records scar when segment health drops', async () => {
    const { resetEffects } = await import('./renderer/canvasRenderer')
    resetEffects()
    const before = barrierAt(15, 0, 4)
    const after = barrierAt(15, 0, 3)
    const prev = stateWith([before], {}, { tick: 100 })
    const curr = stateWith([after], {}, { tick: 101 })
    const commands = buildDrawCommands(curr, null, prev)
    const scars = commands.filter((c) => 'kind' in c && (c as any).kind === 'barrier-damage-scar')
    expect(scars.length).toBeGreaterThan(0)
  })

  it('scars accumulate across multiple hits', async () => {
    const { resetEffects } = await import('./renderer/canvasRenderer')
    resetEffects()
    // Hit 1: health 4 → 3
    buildDrawCommands(
      stateWith([barrierAt(20, 0, 3)], {}, { tick: 1 }),
      null,
      stateWith([barrierAt(20, 0, 4)], {}, { tick: 0 }),
    )
    // Hit 2: health 3 → 2
    buildDrawCommands(
      stateWith([barrierAt(20, 0, 2)], {}, { tick: 2 }),
      null,
      stateWith([barrierAt(20, 0, 3)], {}, { tick: 1 }),
    )
    // Render current frame: both scars should appear
    const commands = buildDrawCommands(
      stateWith([barrierAt(20, 0, 2)], {}, { tick: 3 }),
      null,
      stateWith([barrierAt(20, 0, 2)], {}, { tick: 2 }),
    )
    const scars = commands.filter((c) => 'kind' in c && (c as any).kind === 'barrier-damage-scar')
    expect(scars.length).toBeGreaterThanOrEqual(2)
  })
})

// ─── Barrier elevation #10: shield shimmer on impact ──────────────────────────

describe('Barrier shield shimmer', () => {
  it('shimmer appears when bullet disappears near a segment (within impact range)', async () => {
    const { resetEffects } = await import('./renderer/canvasRenderer')
    resetEffects()
    const barrier: import('../../shared/types').BarrierEntity = {
      kind: 'barrier',
      id: 'sh-1',
      x: 30,
      segments: [{ offsetX: 0, offsetY: 0, health: 4 }],
    }
    const bullet: import('../../shared/types').BulletEntity = {
      kind: 'bullet',
      id: 'b-impact',
      x: 31, // within barrier segment (30..33)
      y: LAYOUT.BARRIER_Y, // at the barrier y
      ownerId: 'p1',
      dy: -1,
    }
    const prev = stateWith([barrier, bullet], {}, { tick: 100 })
    // Bullet disappears (hit the barrier)
    const curr = stateWith([barrier], {}, { tick: 101 })
    const commands = buildDrawCommands(curr, null, prev)
    const shimmer = commands.filter((c) => 'kind' in c && (c as any).kind === 'barrier-shimmer')
    expect(shimmer.length).toBeGreaterThan(0)
  })

  it('no shimmer when bullet goes off-screen (not a barrier hit)', async () => {
    const { resetEffects } = await import('./renderer/canvasRenderer')
    resetEffects()
    const barrier: import('../../shared/types').BarrierEntity = {
      kind: 'barrier',
      id: 'sh-2',
      x: 5,
      segments: [{ offsetX: 0, offsetY: 0, health: 4 }],
    }
    const bullet: import('../../shared/types').BulletEntity = {
      kind: 'bullet',
      id: 'b-offscreen',
      x: 60, // far from barrier
      y: 0, // off top
      ownerId: 'p1',
      dy: -1,
    }
    const prev = stateWith([barrier, bullet], {}, { tick: 100 })
    const curr = stateWith([barrier], {}, { tick: 101 })
    const commands = buildDrawCommands(curr, null, prev)
    const shimmer = commands.filter((c) => 'kind' in c && (c as any).kind === 'barrier-shimmer')
    expect(shimmer).toHaveLength(0)
  })

  it('shimmer uses radial gradient (smooth ring, not rects)', async () => {
    const { resetEffects } = await import('./renderer/canvasRenderer')
    resetEffects()
    const barrier: import('../../shared/types').BarrierEntity = {
      kind: 'barrier',
      id: 'sh-3',
      x: 40,
      segments: [{ offsetX: 0, offsetY: 0, health: 4 }],
    }
    const bullet: import('../../shared/types').BulletEntity = {
      kind: 'bullet',
      id: 'b-smooth',
      x: 41,
      y: LAYOUT.BARRIER_Y,
      ownerId: 'p1',
      dy: -1,
    }
    const prev = stateWith([barrier, bullet], {}, { tick: 100 })
    const curr = stateWith([barrier], {}, { tick: 101 })
    const commands = buildDrawCommands(curr, null, prev)
    const shimmer = commands.filter((c) => 'kind' in c && (c as any).kind === 'barrier-shimmer')
    // Must include at least one radial/circle (smooth), not only rects
    const hasSmooth = shimmer.some((c) => c.type === 'radial' || c.type === 'circle')
    expect(hasSmooth).toBe(true)
  })
})

// ─── Barrier elevation #11: ambient glow from UFO ─────────────────────────────

describe('Barrier ambient glow from UFO', () => {
  const makeUFOLocal = (x: number) => ({
    kind: 'ufo' as const,
    id: `ufo-glow-${x}`,
    x,
    y: 1,
    direction: 1 as 1 | -1,
    alive: true,
    points: 100,
  })
  const makeBarrierLocal = (x: number) => ({
    kind: 'barrier' as const,
    id: `bg-${x}`,
    x,
    segments: [{ offsetX: 0, offsetY: 0, health: 4 as 1 | 2 | 3 | 4 }],
  })

  it('barrier emits ambient glow when UFO is present', () => {
    const ufo = makeUFOLocal(30)
    const barrier = makeBarrierLocal(30)
    const state = stateWith([ufo, barrier], {}, { tick: 5 })
    const commands = buildDrawCommands(state, null)
    const glow = commands.filter((c) => 'kind' in c && (c as any).kind === 'barrier-ambient-glow')
    expect(glow.length).toBeGreaterThan(0)
  })

  it('no ambient glow when no UFO is present', () => {
    const barrier = makeBarrierLocal(30)
    const state = stateWith([barrier], {}, { tick: 5 })
    const commands = buildDrawCommands(state, null)
    const glow = commands.filter((c) => 'kind' in c && (c as any).kind === 'barrier-ambient-glow')
    expect(glow).toHaveLength(0)
  })

  it('glow intensity falls off with horizontal distance from UFO', () => {
    const ufo = makeUFOLocal(20)
    const nearBarrier = makeBarrierLocal(20) // directly below
    const farBarrier = { ...makeBarrierLocal(100), id: 'far' } // far right
    const state = stateWith([ufo, nearBarrier, farBarrier], {}, { tick: 5 })
    const commands = buildDrawCommands(state, null)

    // Glow commands are radial; inspect radius/alpha
    const glow = commands.filter((c) => 'kind' in c && (c as any).kind === 'barrier-ambient-glow')
    expect(glow.length).toBeGreaterThan(0)

    // Find commands near barrier x=20 vs near barrier x=100
    const nearGlows = glow.filter((g) => {
      const gx = 'cx' in g ? g.cx : (g as any).x
      return Math.abs(gx - 20 * CELL_W) < 30
    })
    const farGlows = glow.filter((g) => {
      const gx = 'cx' in g ? g.cx : (g as any).x
      return Math.abs(gx - 100 * CELL_W) < 30
    })

    // Near barrier should have stronger glow (higher alpha or exists when far doesn't)
    if (nearGlows.length > 0 && farGlows.length > 0) {
      const nearAlphaMax = Math.max(
        ...nearGlows.map((g) => {
          if (g.type === 'radial') return g.stops[0]?.alpha ?? 0
          if (g.type === 'circle') return g.alpha ?? 0
          return 0
        }),
      )
      const farAlphaMax = Math.max(
        ...farGlows.map((g) => {
          if (g.type === 'radial') return g.stops[0]?.alpha ?? 0
          if (g.type === 'circle') return g.alpha ?? 0
          return 0
        }),
      )
      expect(nearAlphaMax).toBeGreaterThanOrEqual(farAlphaMax)
    } else {
      // Acceptable: far barriers get no glow at all
      expect(nearGlows.length).toBeGreaterThan(0)
    }
  })
})

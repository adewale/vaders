import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { buildDrawCommands, CELL_W, CELL_H, type DrawCommand } from './canvasRenderer'
import { createDefaultGameState } from '../../../shared/state-defaults'
import type { AlienEntity, BulletEntity, BarrierEntity, UFOEntity, GameState, Player } from '../../../shared/types'
import { LAYOUT } from '../../../shared/types'
import { COLORS } from '../../../client-core/src/sprites/colors'

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

function makeBullet(overrides: Partial<BulletEntity> = {}): BulletEntity {
  return {
    kind: 'bullet',
    id: 'bullet-0',
    x: 50,
    y: 20,
    ownerId: 'player-1',
    dy: -1,
    ...overrides,
  }
}

function makeBarrier(overrides: Partial<BarrierEntity> = {}): BarrierEntity {
  return {
    kind: 'barrier',
    id: 'barrier-0',
    x: 20,
    segments: [
      { offsetX: 0, offsetY: 0, health: 4 },
      { offsetX: 1, offsetY: 0, health: 3 },
      { offsetX: 2, offsetY: 0, health: 0 }, // destroyed
      { offsetX: 0, offsetY: 1, health: 2 },
      { offsetX: 1, offsetY: 1, health: 1 },
    ],
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

function stateWith(entities: GameState['entities'] = [], players: Record<string, Player> = {}): GameState {
  const state = createDefaultGameState('TEST01')
  state.entities = entities
  state.players = players
  state.status = 'playing'
  return state
}

// ─── Helpers for filtering draw commands ─────────────────────────────────────

/** Filter out starfield, HUD, and bullet-embellishment commands (glow/trail/muzzle)
 *  returning only primary entity/clear commands. */
function entityCommands(commands: DrawCommand[]): DrawCommand[] {
  const embellishmentKinds = new Set([
    'bullet-glow',
    'bullet-trail',
    'muzzle-flash',
    'bullet-chromatic',
    'bullet-fizzle',
    'bullet-core',
    'bullet-ember',
    'bullet-aura',
    'bullet-spark',
    'ufo-trail',
    'ufo-glow',
    'ufo-shockwave',
    'ufo-motion-blur',
    'ufo-beam',
    'ufo-pulsar-inner',
    'ufo-pulsar-outer',
    'ufo-trail-particle',
    'ufo-warp-ghost',
    'barrier-crack',
    'barrier-chip',
    'barrier-heavy-damage',
    'barrier-smoke',
    'barrier-texture',
    'barrier-highlight',
    'player-halo',
    'player-cockpit',
    'player-exhaust',
    'player-wing',
    'player-leading-edge',
    'player-plume-center',
    'player-plume-left',
    'player-plume-right',
    'player-weapon-glow',
    'player-rim',
    'player-trail',
    'player-landing-light',
    'player-shield-bubble',
    'barrier-bevel-highlight',
    'barrier-bevel-shadow',
    'barrier-heat-glow',
    'barrier-rivet-spec',
    'barrier-rim-top',
    'barrier-rim-left',
    'player-afterburner-core',
    'player-afterburner-edge',
    'player-reflection',
    'player-warning-pulse',
    'player-impact-shield',
    'bullet-taper-core',
    'bullet-taper-mid',
    'bullet-taper-outer',
    'bullet-arc',
    'bullet-impact-burst',
    'invuln-ring',
    'shooting-star',
    'shooting-star-trail',
    'distant-planet',
    'score-bump',
    'wave-burst',
    'explosion-flash',
    'explosion-fireball',
    'explosion-shockwave',
    'explosion-debris',
    'explosion-ember',
    'explosion-smoke',
    'barrier-noise',
    'barrier-damage-scar',
    'barrier-shimmer',
    'barrier-ambient-glow',
    'wave-announce',
    'wave-announce-border',
    'wave-flash-fight',
    'wave-flash-cleared',
    'hud-player-legend-1',
    'hud-player-legend-2',
    'hud-player-legend-3',
    'hud-player-legend-4',
    'hud-player-legend-local-marker',
  ])
  return commands.filter((cmd) => {
    if (cmd.type === 'text') return false
    if (cmd.type === 'text-row') return false
    if (cmd.type === 'image') return false
    // Smooth primitives (radial/circle) are decorations, never primary entities.
    if (cmd.type === 'radial') return false
    if (cmd.type === 'circle') return false
    if (cmd.type === 'rect' && 'isStar' in cmd) return false
    if (cmd.type === 'rect' && 'kind' in cmd && embellishmentKinds.has((cmd as { kind?: string }).kind ?? ''))
      return false
    if (cmd.type === 'sprite' && 'kind' in cmd && embellishmentKinds.has((cmd as { kind?: string }).kind ?? ''))
      return false
    return true
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildDrawCommands', () => {
  // 1. Empty state produces only clear command (plus starfield/HUD)
  it('empty state produces only clear command', () => {
    const state = stateWith()
    const commands = buildDrawCommands(state, null)
    const filtered = entityCommands(commands)

    expect(filtered).toHaveLength(1)
    expect(filtered[0].type).toBe('clear')

    const clear = filtered[0] as DrawCommand & { type: 'clear' }
    expect(clear.width).toBe(120 * CELL_W)
    expect(clear.height).toBe(36 * CELL_H)
    expect(clear.fill).toBe('#000000')
  })

  // 2. One alien produces clear + sprite command
  it('one alien produces clear + sprite command', () => {
    const alien = makeAlien({ x: 10, y: 5, type: 'crab' })
    const state = stateWith([alien])
    const commands = buildDrawCommands(state, null)
    const filtered = entityCommands(commands)

    expect(filtered).toHaveLength(2)
    expect(filtered[0].type).toBe('clear')
    expect(filtered[1].type).toBe('sprite')

    const sprite = filtered[1] as DrawCommand & { type: 'sprite' }
    expect(sprite.x).toBe(10 * CELL_W)
    expect(sprite.y).toBe(5 * CELL_H)
    expect(sprite.color).toBe(COLORS.alien.crab)
  })

  // 3. Player command uses center-adjusted x
  it('player command uses center-adjusted x', () => {
    const player = makePlayer({ x: 60, slot: 2, color: 'orange' })
    const state = stateWith([], { 'player-1': player })
    const commands = buildDrawCommands(state, null)

    expect(commands.length).toBeGreaterThanOrEqual(2) // clear + player
    const playerCmd = commands.find(
      (c) => c.type === 'sprite' && 'color' in c && c.color === COLORS.player[2],
    ) as DrawCommand & { type: 'sprite' }

    expect(playerCmd).toBeDefined()
    // Player.x is CENTER of sprite; the draw position should be (x - 3) * CELL_W
    // since the sprite is 7 chars wide, centered means left edge is x-3
    expect(playerCmd.x).toBe((60 - 3) * CELL_W)
    expect(playerCmd.y).toBe(LAYOUT.PLAYER_Y * CELL_H)
  })

  // 4. Bullet command is a rect
  it('bullet command is a rect with correct color', () => {
    const playerBullet = makeBullet({ id: 'b1', ownerId: 'player-1', dy: -1 })
    const alienBullet = makeBullet({ id: 'b2', ownerId: null, dy: 1, x: 40, y: 25 })
    const state = stateWith([playerBullet, alienBullet])
    const commands = buildDrawCommands(state, null)

    const rects = entityCommands(commands).filter((c) => c.type === 'rect') as (DrawCommand & { type: 'rect' })[]
    expect(rects).toHaveLength(2)

    // Player bullet should be white
    const pBullet = rects.find((r) => r.x === playerBullet.x * CELL_W)
    expect(pBullet).toBeDefined()
    expect(pBullet!.fill).toBe(COLORS.bullet.player)

    // Alien bullet should be red
    const aBullet = rects.find((r) => r.x === alienBullet.x * CELL_W)
    expect(aBullet).toBeDefined()
    expect(aBullet!.fill).toBe(COLORS.bullet.alien)
  })

  // 5. Barrier segments produce rect commands for segments with health > 0
  it('barrier segments produce rect commands', () => {
    const barrier = makeBarrier()
    const state = stateWith([barrier])
    const commands = buildDrawCommands(state, null)

    // The barrier has 5 segments, but one has health=0 → 4 rects
    const rects = entityCommands(commands).filter((c) => c.type === 'rect') as (DrawCommand & { type: 'rect' })[]
    expect(rects).toHaveLength(4)

    // Each rect should be positioned relative to barrier.x + segment offset
    const firstRect = rects[0]
    expect(firstRect.x).toBe((barrier.x + barrier.segments[0].offsetX * 3) * CELL_W)
    expect(firstRect.y).toBe((LAYOUT.BARRIER_Y + barrier.segments[0].offsetY * 2) * CELL_H)

    // Verify colors match health levels
    const fills = rects.map((r) => r.fill)
    expect(fills).toContain(COLORS.barrier[4])
    expect(fills).toContain(COLORS.barrier[3])
  })

  // 6. Dead aliens are excluded
  it('dead aliens are excluded', () => {
    const deadAlien = makeAlien({ alive: false })
    const liveAlien = makeAlien({ id: 'alien-1', alive: true, x: 20, y: 6 })
    const state = stateWith([deadAlien, liveAlien])
    const commands = buildDrawCommands(state, null)

    const sprites = commands.filter((c) => c.type === 'sprite')
    // Only 1 sprite (the alive alien), not 2
    expect(sprites).toHaveLength(1)

    const sprite = sprites[0] as DrawCommand & { type: 'sprite' }
    expect(sprite.x).toBe(20 * CELL_W)
    expect(sprite.y).toBe(6 * CELL_H)
  })

  // 7. UFO produces sprite command
  it('UFO produces sprite command', () => {
    const ufo = makeUFO({ x: 30, y: 1 })
    const state = stateWith([ufo])
    const commands = buildDrawCommands(state, null)
    const filtered = entityCommands(commands)

    expect(filtered).toHaveLength(2)
    const sprite = filtered[1] as DrawCommand & { type: 'sprite' }
    expect(sprite.type).toBe('sprite')
    expect(sprite.x).toBe(30 * CELL_W)
    expect(sprite.y).toBe(1 * CELL_H)
    // UFO pixels should be present
    expect(sprite.pixels.length).toBeGreaterThan(0)
  })

  // 8. Dead UFOs are excluded
  it('dead UFOs are excluded', () => {
    const deadUfo = makeUFO({ alive: false })
    const state = stateWith([deadUfo])
    const commands = buildDrawCommands(state, null)
    const filtered = entityCommands(commands)

    const sprites = filtered.filter((c) => c.type === 'sprite')
    expect(sprites).toHaveLength(0)
    expect(filtered).toHaveLength(1) // clear only
    expect(filtered[0].type).toBe('clear')
  })

  // 9. Property: command count equals 1 (clear) + alive entities
  it('property: command count equals 1 (clear) + alive entities', () => {
    fc.assert(
      fc.property(
        fc.record({
          alienCount: fc.integer({ min: 0, max: 10 }),
          deadAlienCount: fc.integer({ min: 0, max: 5 }),
          bulletCount: fc.integer({ min: 0, max: 8 }),
          barrierCount: fc.integer({ min: 0, max: 4 }),
          ufoCount: fc.integer({ min: 0, max: 2 }),
          deadUfoCount: fc.integer({ min: 0, max: 2 }),
          playerCount: fc.integer({ min: 0, max: 4 }),
        }),
        (counts) => {
          const entities: GameState['entities'] = []
          const players: Record<string, Player> = {}

          // Add alive aliens
          for (let i = 0; i < counts.alienCount; i++) {
            entities.push(makeAlien({ id: `alien-${i}`, x: 5 + i * 9, y: 3, alive: true }))
          }
          // Add dead aliens
          for (let i = 0; i < counts.deadAlienCount; i++) {
            entities.push(makeAlien({ id: `dead-alien-${i}`, x: 5 + i * 9, y: 3, alive: false }))
          }
          // Add bullets
          for (let i = 0; i < counts.bulletCount; i++) {
            entities.push(makeBullet({ id: `bullet-${i}`, x: 10 + i * 5, y: 15 + i }))
          }
          // Add barriers - each barrier produces rects for alive segments
          // We give each barrier all-alive segments (8 per barrier: arch shape = 5+3=8...
          // Actually our makeBarrier has 4 alive segments and 1 dead)
          for (let i = 0; i < counts.barrierCount; i++) {
            entities.push(makeBarrier({ id: `barrier-${i}`, x: 10 + i * 25 }))
          }
          // Add alive UFOs
          for (let i = 0; i < counts.ufoCount; i++) {
            entities.push(makeUFO({ id: `ufo-${i}`, x: 10 + i * 20, alive: true }))
          }
          // Add dead UFOs
          for (let i = 0; i < counts.deadUfoCount; i++) {
            entities.push(makeUFO({ id: `dead-ufo-${i}`, x: 10 + i * 20, alive: false }))
          }
          // Add players
          for (let i = 0; i < counts.playerCount; i++) {
            const slot = (i + 1) as 1 | 2 | 3 | 4
            players[`player-${i}`] = makePlayer({
              id: `player-${i}`,
              x: 20 + i * 20,
              slot,
              alive: true,
            })
          }

          const state = stateWith(entities, players)
          const commands = buildDrawCommands(state, null)
          const filtered = entityCommands(commands)

          // Expected: 1 (clear)
          //   + alive aliens (sprite each)
          //   + bullets (rect each)
          //   + barrier alive segments (rect each, 4 per barrier with our helper)
          //   + alive UFOs (sprite each)
          //   + alive players (sprite each)
          const aliveSegmentsPerBarrier = 4 // from makeBarrier helper
          const expected =
            1 +
            counts.alienCount +
            counts.bulletCount +
            counts.barrierCount * aliveSegmentsPerBarrier +
            counts.ufoCount +
            counts.playerCount

          expect(filtered).toHaveLength(expected)
          expect(filtered[0].type).toBe('clear')
        },
      ),
    )
  })
})

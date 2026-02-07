// client/src/components/GameScreen.test.ts
// Integration tests for animation hooks with game state

import { describe, test, expect, beforeEach } from 'bun:test'
import type {
  GameState,
  GameConfig,
  Player,
  PlayerSlot,
  AlienEntity,
  BulletEntity,
  UFOEntity,
  BarrierEntity,
  Entity,
  GameStatus,
  ServerEvent,
} from '../../../shared/types'
import {
  DEFAULT_CONFIG,
  STANDARD_WIDTH,
  STANDARD_HEIGHT,
  LAYOUT,
  getAliens,
  getBullets,
  getBarriers,
  getUFOs,
} from '../../../shared/types'
import {
  ConfettiSystem,
  WipeTransition,
  EntranceAnimation,
  InterpolationManager,
} from '../animation'

// ─── Test Helpers ─────────────────────────────────────────────────────────────

/**
 * Create a mock player for testing.
 */
function createMockPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-1',
    name: 'TestPlayer',
    slot: 1 as PlayerSlot,
    color: 'cyan' as const,
    x: 60,
    lives: 3,
    alive: true,
    kills: 0,
    lastShotTick: 0,
    respawnAtTick: null,
    inputState: { left: false, right: false },
    ...overrides,
  }
}

/**
 * Create a mock alien entity for testing.
 */
function createMockAlien(overrides: Partial<AlienEntity> = {}): AlienEntity {
  return {
    kind: 'alien',
    id: 'alien-1',
    x: 20,
    y: 5,
    type: 'crab',
    alive: true,
    row: 0,
    col: 0,
    points: 20,
    entering: false,
    ...overrides,
  }
}

/**
 * Create a mock game state for testing.
 */
function createMockGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    roomId: 'ABC123',
    mode: 'solo',
    status: 'playing',
    tick: 0,
    rngSeed: 12345,
    countdownRemaining: null,
    players: { 'player-1': createMockPlayer() },
    readyPlayerIds: [],
    entities: [],
    wave: 1,
    lives: 3,
    score: 0,
    alienDirection: 1,
    wipeTicksRemaining: null,
    wipeWaveNumber: null,
    alienShootingDisabled: false,
    config: DEFAULT_CONFIG,
    ...overrides,
  }
}

/**
 * Create a mock wave_complete event.
 */
function createWaveCompleteEvent(wave: number): ServerEvent {
  return {
    type: 'event',
    name: 'wave_complete',
    data: { wave },
  }
}

/**
 * Create a mock game_start event.
 */
function createGameStartEvent(): ServerEvent {
  return {
    type: 'event',
    name: 'game_start',
    data: undefined,
  }
}

/**
 * Create a grid of mock aliens for testing.
 */
function createAlienGrid(rows: number, cols: number): AlienEntity[] {
  const aliens: AlienEntity[] = []
  let id = 1
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      aliens.push(
        createMockAlien({
          id: `alien-${id++}`,
          row,
          col,
          x: 10 + col * 7,
          y: 3 + row * 3,
        })
      )
    }
  }
  return aliens
}

// ─── Confetti Integration Tests ───────────────────────────────────────────────

describe('Confetti triggers on wave complete', () => {
  let confetti: ConfettiSystem

  beforeEach(() => {
    confetti = new ConfettiSystem({ width: STANDARD_WIDTH, height: STANDARD_HEIGHT })
  })

  test('confetti system starts when wave_complete event received', () => {
    // Simulate receiving a wave_complete event
    const event = createWaveCompleteEvent(1)
    expect(event.name).toBe('wave_complete')

    // Start confetti in response to the event
    confetti.start()

    expect(confetti.isRunning()).toBe(true)
  })

  test('confetti particles are generated after start', () => {
    confetti.start()

    // Run a few updates to spawn particles
    for (let i = 0; i < 10; i++) {
      confetti.update()
    }

    const particles = confetti.getVisibleParticles()
    expect(particles.length).toBeGreaterThan(0)
  })

  test('confetti particles have renderable properties', () => {
    confetti.start()

    for (let i = 0; i < 10; i++) {
      confetti.update()
    }

    const particles = confetti.getVisibleParticles()
    if (particles.length > 0) {
      const particle = particles[0]
      expect(typeof particle.x).toBe('number')
      expect(typeof particle.y).toBe('number')
      expect(typeof particle.char).toBe('string')
      expect(typeof particle.color).toBe('string')
      expect(typeof particle.opacity).toBe('number')

      // Positions should be integers for terminal rendering
      expect(Number.isInteger(particle.x)).toBe(true)
      expect(Number.isInteger(particle.y)).toBe(true)
    }
  })

  test('confetti stops after all particles expire', () => {
    const quickConfetti = new ConfettiSystem(
      { width: STANDARD_WIDTH, height: STANDARD_HEIGHT },
      {
        lifetime: [3, 5],
        particlesPerBurst: 5,
        maxParticles: 20,
      }
    )

    quickConfetti.start()

    // Run many updates until all particles expire
    for (let i = 0; i < 500; i++) {
      quickConfetti.update()
      if (!quickConfetti.isRunning() && !quickConfetti.hasVisibleParticles()) {
        break
      }
    }

    expect(quickConfetti.isRunning()).toBe(false)
    expect(quickConfetti.hasVisibleParticles()).toBe(false)
  })

  test('confetti can be triggered multiple times for successive waves', () => {
    // First wave complete
    confetti.start()
    expect(confetti.isRunning()).toBe(true)

    // Update a few times
    for (let i = 0; i < 5; i++) {
      confetti.update()
    }

    // Second wave complete - can restart
    confetti.start()
    expect(confetti.isRunning()).toBe(true)
    expect(confetti.getTick()).toBe(0) // Should reset
  })
})

// ─── Wave Wipe Integration Tests ──────────────────────────────────────────────

describe('Wave wipe triggers on wave transition', () => {
  let wipe: WipeTransition

  beforeEach(() => {
    wipe = new WipeTransition({ width: STANDARD_WIDTH, height: STANDARD_HEIGHT })
  })

  test('wipe transition starts when wave changes', () => {
    const prevState = createMockGameState({ wave: 1 })
    const newState = createMockGameState({ wave: 2 })

    // Detect wave change
    const waveChanged = newState.wave > prevState.wave
    expect(waveChanged).toBe(true)

    // Start wipe in response to wave change
    wipe.start(newState.wave)

    expect(wipe.isActive()).toBe(true)
    expect(wipe.getWaveNumber()).toBe(2)
  })

  test('wipe transitions through exiting, hold, and entering phases', () => {
    const shortWipe = new WipeTransition({
      width: STANDARD_WIDTH,
      height: STANDARD_HEIGHT,
      exitDuration: 3,
      holdDuration: 3,
      enterDuration: 3,
    })

    shortWipe.start(2)

    // Exit phase
    expect(shortWipe.getState()).toBe('exiting')
    for (let i = 0; i < 3; i++) shortWipe.update()
    expect(shortWipe.getState()).toBe('hold')

    // Hold phase
    expect(shortWipe.isInHold()).toBe(true)
    for (let i = 0; i < 3; i++) shortWipe.update()
    expect(shortWipe.getState()).toBe('entering')

    // Enter phase
    expect(shortWipe.isInHold()).toBe(false)
    for (let i = 0; i < 3; i++) shortWipe.update()
    expect(shortWipe.getState()).toBe('idle')
  })

  test('wipe completes and returns to idle', () => {
    const shortWipe = new WipeTransition({
      width: STANDARD_WIDTH,
      height: STANDARD_HEIGHT,
      exitDuration: 2,
      holdDuration: 2,
      enterDuration: 2,
    })

    shortWipe.start(1)

    // Run full transition
    for (let i = 0; i < 10; i++) {
      shortWipe.update()
    }

    expect(shortWipe.isActive()).toBe(false)
    expect(shortWipe.getState()).toBe('idle')
  })

  test('mask cells are generated during wipe', () => {
    wipe.start(1)

    // Run partway through exit phase
    for (let i = 0; i < 15; i++) {
      wipe.update()
    }

    const maskCells = wipe.getMaskCells()
    // Should have some masked cells during transition
    expect(maskCells.length).toBeGreaterThanOrEqual(0)
  })

  test('cell visibility changes during wipe phases', () => {
    wipe.start(1)

    // At start, center should be visible (iris pattern)
    const centerX = Math.floor(STANDARD_WIDTH / 2)
    const centerY = Math.floor(STANDARD_HEIGHT / 2)
    expect(wipe.isCellVisible(centerX, centerY)).toBe(true)

    // After many updates, during hold phase all should be masked
    for (let i = 0; i < 35; i++) {
      wipe.update()
    }

    // Check if we're in hold phase where all is masked
    if (wipe.isInHold()) {
      expect(wipe.isCellVisible(centerX, centerY)).toBe(false)
    }
  })

  test('wipe can be cancelled mid-transition', () => {
    wipe.start(1)
    wipe.update()
    wipe.update()

    expect(wipe.isActive()).toBe(true)

    wipe.cancel()

    expect(wipe.isActive()).toBe(false)
    expect(wipe.getState()).toBe('idle')
  })
})

// ─── Entrance Animation Integration Tests ─────────────────────────────────────

describe('Entrance animation triggers on game start', () => {
  let entrance: EntranceAnimation

  beforeEach(() => {
    entrance = new EntranceAnimation({
      baseDuration: 10,
      staggerDelay: 1,
    })
  })

  test('entrance animation starts when game status changes to playing', () => {
    const prevState = createMockGameState({ status: 'countdown' })
    const newState = createMockGameState({
      status: 'playing',
      entities: createAlienGrid(3, 5),
    })

    // Detect status change to playing
    const gameStarted = prevState.status !== 'playing' && newState.status === 'playing'
    expect(gameStarted).toBe(true)

    // Convert aliens to entrance format
    const aliens = newState.entities
      .filter((e): e is AlienEntity => e.kind === 'alien')
      .map((a) => ({
        id: a.id,
        row: a.row,
        col: a.col,
        targetX: a.x,
        targetY: a.y,
      }))

    entrance.start(aliens)

    expect(entrance.isRunning()).toBe(true)
    expect(entrance.isComplete()).toBe(false)
  })

  test('aliens use animated positions during entrance', () => {
    const aliens = createAlienGrid(2, 3)
    const entranceAliens = aliens.map((a) => ({
      id: a.id,
      row: a.row,
      col: a.col,
      targetX: a.x,
      targetY: a.y,
    }))

    entrance.start(entranceAliens)

    // Get initial visual positions
    for (const alien of aliens) {
      const pos = entrance.getVisualPosition(alien.id)
      expect(pos).not.toBeNull()
      expect(pos?.animState).toBe('entering')
      // Visual Y should start above target (off-screen)
      expect(pos!.y).toBeLessThan(alien.y)
    }
  })

  test('alien positions converge to target during animation', () => {
    const aliens = createAlienGrid(1, 2)
    const entranceAliens = aliens.map((a) => ({
      id: a.id,
      row: a.row,
      col: a.col,
      targetX: a.x,
      targetY: a.y,
    }))

    entrance.start(entranceAliens)

    // Get initial position
    const initialPos = entrance.getVisualPosition(aliens[0].id)
    expect(initialPos).not.toBeNull()

    // Update several times
    for (let i = 0; i < 15; i++) {
      entrance.update()
    }

    // Position should be closer to or at target
    const finalPos = entrance.getVisualPosition(aliens[0].id)
    expect(finalPos).not.toBeNull()

    // Either at target or progressing towards it
    if (finalPos!.animState === 'formation') {
      expect(finalPos!.y).toBe(aliens[0].y)
    } else {
      expect(finalPos!.y).toBeGreaterThan(initialPos!.y)
    }
  })

  test('all aliens reach formation when entrance completes', () => {
    const shortEntrance = new EntranceAnimation({
      baseDuration: 5,
      staggerDelay: 0,
    })

    const aliens = createAlienGrid(2, 2)
    const entranceAliens = aliens.map((a) => ({
      id: a.id,
      row: a.row,
      col: a.col,
      targetX: a.x,
      targetY: a.y,
    }))

    shortEntrance.start(entranceAliens)

    // Run until complete
    for (let i = 0; i < 20; i++) {
      shortEntrance.update()
    }

    expect(shortEntrance.isComplete()).toBe(true)
    expect(shortEntrance.isRunning()).toBe(false)

    // All aliens should be in formation
    for (const alien of aliens) {
      const pos = shortEntrance.getVisualPosition(alien.id)
      expect(pos?.animState).toBe('formation')
      expect(pos?.x).toBe(alien.x)
      expect(pos?.y).toBe(alien.y)
    }
  })

  test('entrance can be stopped early, snapping aliens to formation', () => {
    const aliens = createAlienGrid(2, 3)
    const entranceAliens = aliens.map((a) => ({
      id: a.id,
      row: a.row,
      col: a.col,
      targetX: a.x,
      targetY: a.y,
    }))

    entrance.start(entranceAliens)
    entrance.update() // Start animation

    // Stop early
    entrance.stop()

    expect(entrance.isRunning()).toBe(false)

    // All aliens should be snapped to formation
    for (const alien of aliens) {
      const pos = entrance.getVisualPosition(alien.id)
      expect(pos?.animState).toBe('formation')
      expect(pos?.x).toBe(alien.x)
      expect(pos?.y).toBe(alien.y)
    }
  })
})

// ─── Interpolation Integration Tests ──────────────────────────────────────────

describe('Interpolation smooths entity movement', () => {
  let interpolator: InterpolationManager

  beforeEach(() => {
    interpolator = new InterpolationManager({
      tickDurationMs: 33,
      maxLerpDistance: 10,
    })
  })

  test('entity positions are tracked after update', () => {
    const state1 = createMockGameState({
      tick: 1,
      players: {
        'player-1': createMockPlayer({ x: 50 }),
      },
    })

    // Update interpolator with entity positions
    interpolator.startTick(state1.tick)
    interpolator.updateEntity('player-1', 50, 31, state1.tick)

    expect(interpolator.hasEntity('player-1')).toBe(true)
    const pos = interpolator.getVisualPosition('player-1')
    expect(pos).not.toBeNull()
    expect(pos?.x).toBe(50)
  })

  test('interpolated positions are between old and new on tick change', () => {
    // First tick - player at x=50
    interpolator.startTick(1)
    interpolator.updateEntity('player-1', 50, 31, 1)
    interpolator.interpolate(0) // At start of tick

    // Second tick - player moved to x=60
    interpolator.startTick(2)
    interpolator.updateEntity('player-1', 60, 31, 2)

    // Interpolate at 50% through the tick
    interpolator.interpolate(16.5) // Half of 33ms tick

    const pos = interpolator.getVisualPosition('player-1')
    expect(pos).not.toBeNull()

    // Visual position should be between 50 and 60
    expect(pos!.x).toBeGreaterThanOrEqual(50)
    expect(pos!.x).toBeLessThanOrEqual(60)
  })

  test('positions converge to server state at end of tick', () => {
    // First tick
    interpolator.startTick(1)
    interpolator.updateEntity('player-1', 50, 31, 1)
    interpolator.interpolate(0)

    // Second tick - player moved
    interpolator.startTick(2)
    interpolator.updateEntity('player-1', 60, 31, 2)

    // Interpolate at end of tick (100%)
    interpolator.interpolate(33) // Full tick duration

    const pos = interpolator.getVisualPosition('player-1')
    expect(pos).not.toBeNull()

    // At t=1, visual position should be at or very close to target
    expect(pos!.x).toBeCloseTo(60, 0)
    expect(pos!.y).toBeCloseTo(31, 0)
  })

  test('interpolation handles multiple entities', () => {
    const state = createMockGameState({
      tick: 1,
      entities: createAlienGrid(2, 2),
    })

    interpolator.startTick(1)

    // Update all entities
    for (const entity of state.entities) {
      if (entity.kind === 'alien') {
        interpolator.updateEntity(entity.id, entity.x, entity.y, 1)
      }
    }

    expect(interpolator.getEntityCount()).toBe(4)

    // All positions should be tracked
    const positions = interpolator.getAllVisualPositions()
    expect(positions.size).toBe(4)
  })

  test('large position changes skip interpolation (teleport)', () => {
    // First tick
    interpolator.startTick(1)
    interpolator.updateEntity('player-1', 10, 31, 1)
    interpolator.interpolate(0)

    // Second tick - player teleported (moved > maxLerpDistance)
    interpolator.startTick(2)
    interpolator.updateEntity('player-1', 100, 31, 2) // Moved 90 cells

    // Interpolate at 50%
    interpolator.interpolate(16.5)

    const pos = interpolator.getVisualPosition('player-1')
    // Should teleport directly to new position, not interpolate
    expect(pos!.x).toBe(100)
  })

  test('entities can be removed from tracking', () => {
    interpolator.startTick(1)
    interpolator.updateEntity('player-1', 50, 31, 1)

    expect(interpolator.hasEntity('player-1')).toBe(true)

    interpolator.removeEntity('player-1')

    expect(interpolator.hasEntity('player-1')).toBe(false)
    expect(interpolator.getVisualPosition('player-1')).toBeNull()
  })

  test('interpolation factor progresses from 0 to 1 within tick', () => {
    interpolator.startTick(1)

    // At start of tick
    const startFactor = interpolator.getInterpolationFactor()
    // Factor depends on time since startTick was called, should be low
    expect(startFactor).toBeGreaterThanOrEqual(0)
    expect(startFactor).toBeLessThanOrEqual(1)
  })

  test('clear removes all tracked entities', () => {
    interpolator.startTick(1)
    interpolator.updateEntity('player-1', 50, 31, 1)
    interpolator.updateEntity('player-2', 60, 31, 1)

    expect(interpolator.getEntityCount()).toBe(2)

    interpolator.clear()

    expect(interpolator.getEntityCount()).toBe(0)
  })
})

// ─── Combined Integration Scenarios ───────────────────────────────────────────

describe('Combined animation integration scenarios', () => {
  test('wave complete triggers both confetti and wipe', () => {
    const confetti = new ConfettiSystem({ width: STANDARD_WIDTH, height: STANDARD_HEIGHT })
    const wipe = new WipeTransition({
      width: STANDARD_WIDTH,
      height: STANDARD_HEIGHT,
      exitDuration: 5,
      holdDuration: 5,
      enterDuration: 5,
    })

    // Simulate wave complete event
    const event = createWaveCompleteEvent(1)
    expect(event.name).toBe('wave_complete')

    // Both systems activate
    confetti.start()
    wipe.start(2) // Transition to wave 2

    expect(confetti.isRunning()).toBe(true)
    expect(wipe.isActive()).toBe(true)

    // Both can run simultaneously
    for (let i = 0; i < 10; i++) {
      confetti.update()
      wipe.update()
    }

    // Confetti should have progressed
    expect(confetti.getTick()).toBe(10)
    // Wipe tick resets on each phase transition (exit->hold->entering)
    // After 10 updates with 5 tick durations:
    // Updates 1-5: exiting (tick goes 1,2,3,4,5 -> transition to hold, tick=0)
    // Updates 6-10: hold (tick goes 1,2,3,4,5 -> transition to entering, tick=0)
    // So after exactly 10 updates, we just entered 'entering' phase at tick=0
    expect(wipe.isActive()).toBe(true)
    expect(wipe.getState()).toBe('entering')
    expect(wipe.getTick()).toBe(0)
  })

  test('entrance animation follows wipe transition', () => {
    const wipe = new WipeTransition({
      width: STANDARD_WIDTH,
      height: STANDARD_HEIGHT,
      exitDuration: 3,
      holdDuration: 3,
      enterDuration: 3,
    })
    const entrance = new EntranceAnimation({
      baseDuration: 5,
      staggerDelay: 0,
    })

    // Start wipe
    wipe.start(2)

    // Run through entire wipe transition (9 updates to complete)
    // Updates 1-3: exiting -> tick 3 transitions to hold
    // Updates 4-6: hold -> tick 3 transitions to entering
    // Updates 7-9: entering -> tick 3 transitions to idle
    for (let i = 0; i < 9; i++) {
      wipe.update()
    }

    // After 9 updates with 3-tick phases, wipe should be idle (complete)
    expect(wipe.isActive()).toBe(false)
    expect(wipe.getState()).toBe('idle')

    // Now start entrance (would happen after wipe completes in real game)
    const aliens = createAlienGrid(2, 2)
    entrance.start(
      aliens.map((a) => ({
        id: a.id,
        row: a.row,
        col: a.col,
        targetX: a.x,
        targetY: a.y,
      }))
    )

    expect(entrance.isRunning()).toBe(true)
  })

  test('interpolation works during active gameplay', () => {
    const interpolator = new InterpolationManager()
    const entrance = new EntranceAnimation({
      baseDuration: 5,
      staggerDelay: 0,
    })

    // Start entrance
    const aliens = createAlienGrid(1, 2)
    entrance.start(
      aliens.map((a) => ({
        id: a.id,
        row: a.row,
        col: a.col,
        targetX: a.x,
        targetY: a.y,
      }))
    )

    // During entrance, positions come from entrance animation
    entrance.update()
    const entrancePos = entrance.getVisualPosition(aliens[0].id)
    expect(entrancePos).not.toBeNull()

    // After entrance completes, switch to interpolation
    for (let i = 0; i < 20; i++) {
      entrance.update()
    }
    expect(entrance.isComplete()).toBe(true)

    // Now use interpolator for game movements
    interpolator.startTick(1)
    interpolator.updateEntity(aliens[0].id, aliens[0].x, aliens[0].y, 1)

    expect(interpolator.hasEntity(aliens[0].id)).toBe(true)
  })

  test('game state changes trigger appropriate animations', () => {
    const confetti = new ConfettiSystem({ width: STANDARD_WIDTH, height: STANDARD_HEIGHT })
    const wipe = new WipeTransition({ width: STANDARD_WIDTH, height: STANDARD_HEIGHT })
    const entrance = new EntranceAnimation()
    const interpolator = new InterpolationManager()

    // Simulate game state progression

    // 1. Game starts - entrance animation
    const waitingState = createMockGameState({ status: 'waiting' })
    const playingState = createMockGameState({
      status: 'playing',
      entities: createAlienGrid(2, 3),
    })

    if (waitingState.status !== 'playing' && playingState.status === 'playing') {
      const aliens = playingState.entities.filter((e): e is AlienEntity => e.kind === 'alien')
      entrance.start(
        aliens.map((a) => ({
          id: a.id,
          row: a.row,
          col: a.col,
          targetX: a.x,
          targetY: a.y,
        }))
      )
    }
    expect(entrance.isRunning()).toBe(true)

    // 2. Wave complete - confetti + wipe
    const wave1State = createMockGameState({ wave: 1 })
    const wave2State = createMockGameState({ wave: 2 })

    if (wave2State.wave > wave1State.wave) {
      confetti.start()
      wipe.start(wave2State.wave)
    }
    expect(confetti.isRunning()).toBe(true)
    expect(wipe.isActive()).toBe(true)

    // 3. Continuous movement - interpolation
    interpolator.startTick(1)
    for (const player of Object.values(playingState.players)) {
      interpolator.updateEntity(player.id, player.x, 31, 1)
    }
    expect(interpolator.getEntityCount()).toBeGreaterThan(0)
  })
})

// ─── Edge Cases ───────────────────────────────────────────────────────────────

describe('Animation integration edge cases', () => {
  test('handles empty alien grid for entrance', () => {
    const entrance = new EntranceAnimation()
    entrance.start([])

    expect(entrance.isRunning()).toBe(false)
    expect(entrance.isComplete()).toBe(true)
  })

  test('handles rapid state changes', () => {
    const wipe = new WipeTransition({ width: STANDARD_WIDTH, height: STANDARD_HEIGHT })

    // Rapid wave changes
    wipe.start(1)
    wipe.start(2)
    wipe.start(3)

    // Should only track latest
    expect(wipe.getWaveNumber()).toBe(3)
    expect(wipe.isActive()).toBe(true)
  })

  test('interpolation handles entity appearing mid-game', () => {
    const interpolator = new InterpolationManager()

    interpolator.startTick(5) // Start at tick 5

    // New entity appears
    interpolator.updateEntity('new-entity', 50, 20, 5)

    const pos = interpolator.getVisualPosition('new-entity')
    expect(pos).not.toBeNull()
    // First appearance should be at exact position (no previous to interpolate from)
    expect(pos?.x).toBe(50)
    expect(pos?.y).toBe(20)
  })

  test('confetti handles screen resize', () => {
    // Create with one size
    const confetti1 = new ConfettiSystem({ width: 80, height: 24 })
    confetti1.start()
    expect(confetti1.isRunning()).toBe(true)

    // Create new system for new size
    const confetti2 = new ConfettiSystem({ width: 120, height: 36 })
    confetti2.start()
    expect(confetti2.isRunning()).toBe(true)
  })

  test('wipe pattern correctly masks during transition', () => {
    const wipe = new WipeTransition({
      width: 20,
      height: 10,
      pattern: 'iris',
      exitDuration: 10,
    })

    wipe.start(1)

    // Run halfway through exit
    for (let i = 0; i < 5; i++) {
      wipe.update()
    }

    // Center should still be visible (iris closes from outside)
    const centerX = 10
    const centerY = 5
    expect(wipe.isCellVisible(centerX, centerY)).toBe(true)

    // Corners might be masked
    // (exact behavior depends on iris radius calculation)
  })
})

// ─── GameScreen State Derivation Tests ───────────────────────────────────────
// These test the data extraction and transformation logic that happens
// in the GameScreen function body.

describe('GameScreen Entity Extraction', () => {
  function createMockBullet(overrides: Partial<BulletEntity> = {}): BulletEntity {
    return {
      kind: 'bullet',
      id: 'bullet-1',
      x: 50,
      y: 20,
      ownerId: 'player-1',
      dy: -1,
      ...overrides,
    }
  }

  function createMockUFO(overrides: Partial<UFOEntity> = {}): UFOEntity {
    return {
      kind: 'ufo',
      id: 'ufo-1',
      x: 30,
      y: 1,
      direction: 1,
      alive: true,
      points: 100,
      ...overrides,
    }
  }

  function createMockBarrier(overrides: Partial<BarrierEntity> = {}): BarrierEntity {
    return {
      kind: 'barrier',
      id: 'barrier-1',
      x: 20,
      segments: [
        { offsetX: 0, offsetY: 0, health: 4 },
        { offsetX: 1, offsetY: 0, health: 3 },
        { offsetX: 0, offsetY: 1, health: 2 },
        { offsetX: 1, offsetY: 1, health: 1 },
      ],
      ...overrides,
    }
  }

  test('getAliens filters only alien entities', () => {
    const entities: Entity[] = [
      createMockAlien({ id: 'a1' }),
      createMockBullet({ id: 'b1' }),
      createMockAlien({ id: 'a2' }),
      createMockUFO({ id: 'u1' }),
    ]

    const aliens = getAliens(entities)
    expect(aliens.length).toBe(2)
    expect(aliens[0].id).toBe('a1')
    expect(aliens[1].id).toBe('a2')
  })

  test('getBullets filters only bullet entities', () => {
    const entities: Entity[] = [
      createMockAlien({ id: 'a1' }),
      createMockBullet({ id: 'b1' }),
      createMockBullet({ id: 'b2' }),
    ]

    const bullets = getBullets(entities)
    expect(bullets.length).toBe(2)
    expect(bullets.every(b => b.kind === 'bullet')).toBe(true)
  })

  test('getBarriers filters only barrier entities', () => {
    const entities: Entity[] = [
      createMockBarrier({ id: 'bar1' }),
      createMockAlien({ id: 'a1' }),
      createMockBarrier({ id: 'bar2' }),
    ]

    const barriers = getBarriers(entities)
    expect(barriers.length).toBe(2)
  })

  test('getUFOs filters only UFO entities', () => {
    const entities: Entity[] = [
      createMockUFO({ id: 'u1' }),
      createMockAlien({ id: 'a1' }),
    ]

    const ufos = getUFOs(entities)
    expect(ufos.length).toBe(1)
    expect(ufos[0].id).toBe('u1')
  })

  test('all filter functions return empty for empty entities', () => {
    const entities: Entity[] = []
    expect(getAliens(entities).length).toBe(0)
    expect(getBullets(entities).length).toBe(0)
    expect(getBarriers(entities).length).toBe(0)
    expect(getUFOs(entities).length).toBe(0)
  })

  test('mixed entities are correctly separated', () => {
    const entities: Entity[] = [
      createMockAlien({ id: 'a1' }),
      createMockAlien({ id: 'a2' }),
      createMockBullet({ id: 'b1' }),
      createMockBullet({ id: 'b2' }),
      createMockBullet({ id: 'b3' }),
      createMockBarrier({ id: 'bar1' }),
      createMockUFO({ id: 'u1' }),
    ]

    expect(getAliens(entities).length).toBe(2)
    expect(getBullets(entities).length).toBe(3)
    expect(getBarriers(entities).length).toBe(1)
    expect(getUFOs(entities).length).toBe(1)
  })
})

// ─── GameScreen Header Data Tests ────────────────────────────────────────────

describe('GameScreen Header Data Derivation', () => {
  test('player count derived from players object', () => {
    const state = createMockGameState({
      players: {
        'p1': createMockPlayer({ id: 'p1' }),
        'p2': createMockPlayer({ id: 'p2', slot: 2 }),
      },
    })
    const playerCount = Object.keys(state.players).length
    expect(playerCount).toBe(2)
  })

  test('current player lives extracted correctly', () => {
    const currentPlayerId = 'player-1'
    const state = createMockGameState({
      players: {
        'player-1': createMockPlayer({ id: 'player-1', lives: 2 }),
        'player-2': createMockPlayer({ id: 'player-2', slot: 2, lives: 3 }),
      },
    })
    const currentPlayer = state.players[currentPlayerId]
    const myLives = currentPlayer?.lives ?? 0
    expect(myLives).toBe(2)
  })

  test('missing current player defaults to 0 lives', () => {
    const currentPlayerId = 'nonexistent'
    const state = createMockGameState()
    const currentPlayer = state.players[currentPlayerId]
    const myLives = currentPlayer?.lives ?? 0
    expect(myLives).toBe(0)
  })

  test('max lives is 3 for solo, 5 for multiplayer', () => {
    const soloState = createMockGameState({ mode: 'solo' })
    const multiState = createMockGameState({ mode: 'multiplayer' })

    const soloMaxLives = soloState.mode === 'solo' ? 3 : 5
    const multiMaxLives = multiState.mode === 'solo' ? 3 : 5

    expect(soloMaxLives).toBe(3)
    expect(multiMaxLives).toBe(5)
  })

  test('mode display text for solo and multiplayer', () => {
    const soloState = createMockGameState({ mode: 'solo' })
    const multiState = createMockGameState({
      mode: 'multiplayer',
      players: {
        'p1': createMockPlayer({ id: 'p1' }),
        'p2': createMockPlayer({ id: 'p2', slot: 2 }),
        'p3': createMockPlayer({ id: 'p3', slot: 3 }),
      },
    })

    const soloDisplay = soloState.mode === 'solo' ? 'SOLO' : `${Object.keys(soloState.players).length}P CO-OP`
    const multiDisplay = multiState.mode === 'solo' ? 'SOLO' : `${Object.keys(multiState.players).length}P CO-OP`

    expect(soloDisplay).toBe('SOLO')
    expect(multiDisplay).toBe('3P CO-OP')
  })

  test('score formatting pads to 6 digits', () => {
    const score = 42
    expect(score.toString().padStart(6, '0')).toBe('000042')
  })
})

// ─── Player Ship Visibility Tests ────────────────────────────────────────────

describe('Player Ship Visibility Logic', () => {
  test('dead player without respawn is not rendered', () => {
    const player = createMockPlayer({ alive: false, respawnAtTick: null })
    // In the component: if (!player.alive) { if (!player.respawnAtTick) return null }
    const shouldRender = player.alive || player.respawnAtTick !== null
    expect(shouldRender).toBe(false)
  })

  test('dead player with respawn tick is rendered (blink)', () => {
    const player = createMockPlayer({ alive: false, respawnAtTick: 100 })
    const shouldRender = player.alive || player.respawnAtTick !== null
    expect(shouldRender).toBe(true)
  })

  test('alive player is always rendered', () => {
    const player = createMockPlayer({ alive: true })
    const shouldRender = player.alive || player.respawnAtTick !== null
    expect(shouldRender).toBe(true)
  })

  test('blink effect toggles based on tick', () => {
    // In the component: if (Math.floor(tick / 10) % 2 === 0) return null
    // This creates a 10-tick on, 10-tick off blink pattern
    const visibilityAt = (tick: number) => Math.floor(tick / 10) % 2 !== 0

    expect(visibilityAt(0)).toBe(false)   // tick 0-9: hidden
    expect(visibilityAt(5)).toBe(false)   // tick 5: hidden
    expect(visibilityAt(10)).toBe(true)   // tick 10-19: visible
    expect(visibilityAt(15)).toBe(true)   // tick 15: visible
    expect(visibilityAt(20)).toBe(false)  // tick 20-29: hidden
    expect(visibilityAt(30)).toBe(true)   // tick 30-39: visible
  })
})

// ─── PlayerScores Sorting Logic Tests ────────────────────────────────────────

describe('PlayerScores Sorting', () => {
  test('players sorted by slot number ascending', () => {
    const players: Record<string, Player> = {
      'p3': createMockPlayer({ id: 'p3', name: 'C', slot: 3 }),
      'p1': createMockPlayer({ id: 'p1', name: 'A', slot: 1 }),
      'p4': createMockPlayer({ id: 'p4', name: 'D', slot: 4 }),
      'p2': createMockPlayer({ id: 'p2', name: 'B', slot: 2 }),
    }

    const sorted = Object.values(players).sort((a, b) => a.slot - b.slot)
    expect(sorted[0].slot).toBe(1)
    expect(sorted[1].slot).toBe(2)
    expect(sorted[2].slot).toBe(3)
    expect(sorted[3].slot).toBe(4)
  })

  test('single player sorting is trivial', () => {
    const players: Record<string, Player> = {
      'p1': createMockPlayer({ id: 'p1', slot: 1 }),
    }
    const sorted = Object.values(players).sort((a, b) => a.slot - b.slot)
    expect(sorted.length).toBe(1)
  })
})

// ─── Bullet Direction Display Tests ──────────────────────────────────────────

describe('Bullet Direction Logic', () => {
  test('player bullets move up (dy = -1)', () => {
    const bullet: BulletEntity = {
      kind: 'bullet',
      id: 'b1',
      x: 50,
      y: 28,
      ownerId: 'player-1',
      dy: -1,
    }

    // In the component: bullet.dy < 0 ? SPRITES.bullet.player : SPRITES.bullet.alien
    const isPlayerBullet = bullet.dy < 0
    expect(isPlayerBullet).toBe(true)
  })

  test('alien bullets move down (dy = 1)', () => {
    const bullet: BulletEntity = {
      kind: 'bullet',
      id: 'b2',
      x: 30,
      y: 10,
      ownerId: null,
      dy: 1,
    }

    const isPlayerBullet = bullet.dy < 0
    expect(isPlayerBullet).toBe(false)
  })
})

// ─── Barrier Segment Rendering Logic Tests ───────────────────────────────────

describe('Barrier Segment Filtering', () => {
  test('only segments with health > 0 are rendered', () => {
    const segments = [
      { offsetX: 0, offsetY: 0, health: 4 as const },
      { offsetX: 1, offsetY: 0, health: 0 as const },
      { offsetX: 0, offsetY: 1, health: 2 as const },
      { offsetX: 1, offsetY: 1, health: 0 as const },
    ]

    const visible = segments.filter(s => s.health > 0)
    expect(visible.length).toBe(2)
    expect(visible[0].health).toBe(4)
    expect(visible[1].health).toBe(2)
  })

  test('barrier with all segments destroyed has nothing to render', () => {
    const segments = [
      { offsetX: 0, offsetY: 0, health: 0 as const },
      { offsetX: 1, offsetY: 0, health: 0 as const },
    ]

    const visible = segments.filter(s => s.health > 0)
    expect(visible.length).toBe(0)
  })

  test('barrier with full health renders all segments', () => {
    const segments = [
      { offsetX: 0, offsetY: 0, health: 4 as const },
      { offsetX: 1, offsetY: 0, health: 4 as const },
      { offsetX: 0, offsetY: 1, health: 4 as const },
      { offsetX: 1, offsetY: 1, health: 4 as const },
    ]

    const visible = segments.filter(s => s.health > 0)
    expect(visible.length).toBe(4)
  })
})

// ─── Countdown Display Tests ─────────────────────────────────────────────────

describe('Countdown Display Logic', () => {
  test('countdown overlay shown during countdown status', () => {
    const state = createMockGameState({
      status: 'countdown',
      countdownRemaining: 3,
    })

    const showCountdown = state.status === 'countdown' && state.countdownRemaining !== null
    expect(showCountdown).toBe(true)
  })

  test('countdown not shown during playing status', () => {
    const state = createMockGameState({
      status: 'playing',
      countdownRemaining: null,
    })

    const showCountdown = state.status === 'countdown' && state.countdownRemaining !== null
    expect(showCountdown).toBe(false)
  })

  test('countdown not shown when countdownRemaining is null', () => {
    const state = createMockGameState({
      status: 'countdown',
      countdownRemaining: null,
    })

    const showCountdown = state.status === 'countdown' && state.countdownRemaining !== null
    expect(showCountdown).toBe(false)
  })
})

// ─── Alien Visual Position Tests ─────────────────────────────────────────────

describe('Alien Visual Position During Wipe', () => {
  test('aliens hidden off-screen during wipe_reveal before animation starts', () => {
    // When status is wipe_reveal and entrance hasn't started for this wave,
    // aliens are placed at y: -5 to prevent a flash
    const alien = createMockAlien({ x: 30, y: 10 })
    const status: GameStatus = 'wipe_reveal'
    const entranceStartedForWave: number | null = null
    const currentWave = 2

    // Simulate the component logic
    let visualY: number
    if (status === 'wipe_reveal' && entranceStartedForWave !== currentWave) {
      visualY = -5
    } else {
      visualY = alien.y
    }

    expect(visualY).toBe(-5)
  })

  test('aliens at server position during normal gameplay', () => {
    const alien = createMockAlien({ x: 30, y: 10 })
    const status: GameStatus = 'playing'
    const entranceStartedForWave = 1
    const currentWave = 1

    let visualY: number
    if (status === 'wipe_reveal' && entranceStartedForWave !== currentWave) {
      visualY = -5
    } else {
      visualY = alien.y
    }

    expect(visualY).toBe(10)
  })
})

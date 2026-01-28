import { describe, test, expect } from 'bun:test'
import { gameReducer } from './reducer'
import { createDefaultGameState } from '../../../shared/state-defaults'
import { getAliens, getBullets, type AlienEntity, LAYOUT } from '../../../shared/types'
import { getScaledConfig } from './scaling'

// Simulate GameRoom's createAlienFormation
function createAlienFormation(cols: number, rows: number): AlienEntity[] {
  const ALIEN_TYPES = ['squid', 'crab', 'octopus'] as const
  const ALIEN_REGISTRY = {
    squid: { points: 30 },
    crab: { points: 20 },
    octopus: { points: 10 },
  }

  const aliens: AlienEntity[] = []
  const totalWidth = cols * LAYOUT.ALIEN_COL_SPACING
  const startX = Math.floor((120 - totalWidth) / 2)

  let idCounter = 0
  for (let row = 0; row < rows; row++) {
    const type = ALIEN_TYPES[Math.min(row, ALIEN_TYPES.length - 1)]
    for (let col = 0; col < cols; col++) {
      aliens.push({
        kind: 'alien',
        id: `alien-${idCounter++}`,
        type,
        row,
        col,
        x: startX + col * LAYOUT.ALIEN_COL_SPACING,
        y: LAYOUT.ALIEN_START_Y + row * LAYOUT.ALIEN_ROW_SPACING,
        alive: true,
        points: ALIEN_REGISTRY[type].points,
        entering: false,
      })
    }
  }
  return aliens
}

describe('PROOF: Alien shooting works end-to-end', () => {
  test('Full game flow: wipe_hold → wipe_reveal → playing → aliens shoot', () => {
    // 1. Create initial state
    let state = createDefaultGameState('test-room')

    // Verify alienShootingDisabled is false
    console.log('1. Initial alienShootingDisabled:', state.alienShootingDisabled)
    expect(state.alienShootingDisabled).toBe(false)

    // 2. Add a player
    const { state: s1 } = gameReducer(state, {
      type: 'PLAYER_JOIN',
      player: {
        id: 'p1',
        name: 'Test',
        slot: 1,
        x: 60,
        lives: 3,
        kills: 0,
        alive: true,
        inputState: { left: false, right: false },
        respawnAtTick: null
      }
    })
    state = s1

    // 3. Start solo game
    const { state: s2 } = gameReducer(state, { type: 'START_SOLO' })
    state = s2
    console.log('2. After START_SOLO - status:', state.status, 'wipeTicksRemaining:', state.wipeTicksRemaining)
    expect(state.status).toBe('wipe_hold')
    expect(state.wipeTicksRemaining).toBe(30)

    // 4. Tick through wipe_hold until we transition to wipe_reveal
    let tickCount = 0
    while (state.status === 'wipe_hold' && tickCount < 50) {
      const { state: next } = gameReducer(state, { type: 'TICK' })
      state = next
      tickCount++
    }
    console.log('3. After', tickCount, 'ticks - status:', state.status, 'wipeTicksRemaining:', state.wipeTicksRemaining)
    expect(state.status).toBe('wipe_reveal')

    // 5. SIMULATE GameRoom: Create aliens when entering wipe_reveal
    const playerCount = Object.keys(state.players).length
    const scaled = getScaledConfig(playerCount, state.config)
    const aliens = createAlienFormation(scaled.alienCols, scaled.alienRows)

    // Mark all aliens as entering (like GameRoom does)
    for (const alien of aliens) {
      alien.entering = true
    }
    state.entities.push(...aliens)

    console.log('4. Created', aliens.length, 'aliens with entering=true')
    expect(getAliens(state.entities).length).toBeGreaterThan(0)
    expect(getAliens(state.entities).every(a => a.entering)).toBe(true)

    // 6. Tick through wipe_reveal until we transition to playing
    tickCount = 0
    while (state.status === 'wipe_reveal' && tickCount < 100) {
      const { state: next } = gameReducer(state, { type: 'TICK' })
      state = next
      tickCount++
    }
    console.log('5. After', tickCount, 'ticks - status:', state.status)
    expect(state.status).toBe('playing')

    // 7. Verify aliens now have entering=false
    const aliensAfterReveal = getAliens(state.entities)
    console.log('6. Aliens entering flags:', aliensAfterReveal.map(a => a.entering))
    expect(aliensAfterReveal.every(a => a.entering === false)).toBe(true)

    // 8. Run many ticks and count alien bullets
    let alienBulletCount = 0
    const bulletIds = new Set<string>()

    for (let i = 0; i < 500; i++) {
      const { state: next } = gameReducer(state, { type: 'TICK' })

      // Count new alien bullets (dy === 1)
      const alienBullets = getBullets(next.entities).filter(b => b.dy === 1)
      for (const bullet of alienBullets) {
        if (!bulletIds.has(bullet.id)) {
          bulletIds.add(bullet.id)
          alienBulletCount++
        }
      }

      state = next
    }

    console.log('7. Alien bullets fired in 500 ticks:', alienBulletCount)
    console.log('8. alienShootingDisabled:', state.alienShootingDisabled)
    console.log('9. Live aliens:', getAliens(state.entities).filter(a => a.alive).length)
    console.log('10. Any aliens entering?:', getAliens(state.entities).some(a => a.entering))

    // PROOF: Aliens must have fired at least some bullets
    expect(alienBulletCount).toBeGreaterThan(0)
  })

  test('Alien shoot probability is non-zero', () => {
    const scaled = getScaledConfig(1, {
      width: 120,
      height: 36,
      tickIntervalMs: 33,
      respawnDelayTicks: 90,
      baseBulletSpeed: 1,
      playerMoveSpeed: 2,
    })

    console.log('alienShootProbability:', scaled.alienShootProbability)
    expect(scaled.alienShootProbability).toBeGreaterThan(0)
    expect(scaled.alienShootProbability).toBeLessThan(1)
  })
})

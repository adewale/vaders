import { describe, test, expect } from 'vitest'
import { gameReducer } from './reducer'
import { createDefaultGameState } from '../../../shared/state-defaults'
import { DEFAULT_CONFIG, WIPE_TIMING, getAliens, getBullets, createAlienFormation } from '../../../shared/types'
import { getScaledConfig } from './scaling'

describe('PROOF: Alien shooting works end-to-end', () => {
  test('Full game flow: wipe_hold → wipe_reveal → playing → aliens shoot', () => {
    // 1. Create initial state
    let state = createDefaultGameState('test-room')

    // Verify alienShootingDisabled is false
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
        color: 'cyan',
        lastShotTick: 0,
        inputState: { left: false, right: false },
        respawnAtTick: null
      }
    })
    state = s1

    // 3. Start solo game
    const { state: s2 } = gameReducer(state, { type: 'START_SOLO' })
    state = s2
    expect(state.status).toBe('wipe_hold')
    expect(state.wipeTicksRemaining).toBe(WIPE_TIMING.HOLD_TICKS)

    // 4. Tick through wipe_hold until we transition to wipe_reveal
    let tickCount = 0
    while (state.status === 'wipe_hold' && tickCount < 100) {
      const { state: next } = gameReducer(state, { type: 'TICK' })
      state = next
      tickCount++
    }
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

    expect(getAliens(state.entities).length).toBeGreaterThan(0)
    expect(getAliens(state.entities).every(a => a.entering)).toBe(true)

    // 6. Tick through wipe_reveal until we transition to playing
    tickCount = 0
    while (state.status === 'wipe_reveal' && tickCount < 200) {
      const { state: next } = gameReducer(state, { type: 'TICK' })
      state = next
      tickCount++
    }
    expect(state.status).toBe('playing')

    // 7. Verify aliens now have entering=false
    const aliensAfterReveal = getAliens(state.entities)
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

    // PROOF: Aliens must have fired at least some bullets
    expect(alienBulletCount).toBeGreaterThan(0)
  })

  test('Alien shoot probability is non-zero', () => {
    const scaled = getScaledConfig(1, DEFAULT_CONFIG)

    expect(scaled.alienShootProbability).toBeGreaterThan(0)
    expect(scaled.alienShootProbability).toBeLessThan(1)
  })
})

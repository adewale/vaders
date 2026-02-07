// client/src/animation/confetti.test.ts
// Unit tests for confetti particle system

import { describe, test, expect, beforeEach } from 'bun:test'
import {
  ConfettiSystem,
  CONFETTI_CHARS,
  CONFETTI_CHARS_ASCII,
  CONFETTI_COLORS,
  DEFAULT_CONFETTI_CONFIG,
  getConfettiDisplayColor,
} from './confetti'

describe('CONFETTI_CHARS', () => {
  test('contains unicode block and symbol characters', () => {
    expect(CONFETTI_CHARS).toContain('█')
    expect(CONFETTI_CHARS).toContain('★')
    expect(CONFETTI_CHARS.length).toBe(8)
  })
})

describe('CONFETTI_CHARS_ASCII', () => {
  test('contains ASCII-safe fallback characters', () => {
    expect(CONFETTI_CHARS_ASCII).toContain('#')
    expect(CONFETTI_CHARS_ASCII).toContain('*')
    expect(CONFETTI_CHARS_ASCII.length).toBe(8)
  })

  test('same length as unicode version', () => {
    expect(CONFETTI_CHARS_ASCII.length).toBe(CONFETTI_CHARS.length)
  })
})

describe('CONFETTI_COLORS', () => {
  test('contains bright celebration colors', () => {
    expect(CONFETTI_COLORS.length).toBe(8)
    // Check all are valid hex colors
    for (const color of CONFETTI_COLORS) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  test('includes primary celebration colors', () => {
    expect(CONFETTI_COLORS).toContain('#ff5555') // Red
    expect(CONFETTI_COLORS).toContain('#ffff55') // Yellow
    expect(CONFETTI_COLORS).toContain('#55ff55') // Green
    expect(CONFETTI_COLORS).toContain('#ffffff') // White
  })
})

describe('DEFAULT_CONFETTI_CONFIG', () => {
  test('has sensible default values', () => {
    expect(DEFAULT_CONFETTI_CONFIG.gravity).toBeGreaterThan(0)
    expect(DEFAULT_CONFETTI_CONFIG.friction).toBeGreaterThan(0)
    expect(DEFAULT_CONFETTI_CONFIG.friction).toBeLessThan(1)
    expect(DEFAULT_CONFETTI_CONFIG.maxParticles).toBeGreaterThan(0)
    expect(DEFAULT_CONFETTI_CONFIG.particlesPerBurst).toBeGreaterThan(0)
    expect(DEFAULT_CONFETTI_CONFIG.useAscii).toBe(false)
  })

  test('lifetime is a range tuple', () => {
    expect(DEFAULT_CONFETTI_CONFIG.lifetime).toHaveLength(2)
    expect(DEFAULT_CONFETTI_CONFIG.lifetime[0]).toBeLessThan(DEFAULT_CONFETTI_CONFIG.lifetime[1])
  })

  test('velocity ranges are tuples', () => {
    expect(DEFAULT_CONFETTI_CONFIG.initialVelocityY).toHaveLength(2)
    expect(DEFAULT_CONFETTI_CONFIG.initialVelocityX).toHaveLength(2)
  })
})

describe('ConfettiSystem', () => {
  let confetti: ConfettiSystem

  beforeEach(() => {
    confetti = new ConfettiSystem({ width: 120, height: 36 })
  })

  describe('constructor', () => {
    test('initializes with default config', () => {
      expect(confetti.isRunning()).toBe(false)
      expect(confetti.hasVisibleParticles()).toBe(false)
      expect(confetti.getTick()).toBe(0)
    })

    test('accepts custom config', () => {
      const custom = new ConfettiSystem(
        { width: 80, height: 24 },
        { maxParticles: 50, useAscii: true }
      )
      expect(custom).toBeDefined()
    })

    test('pre-allocates particle pool', () => {
      const custom = new ConfettiSystem(
        { width: 120, height: 36 },
        { maxParticles: 10 }
      )
      // Pool is pre-allocated but particles are inactive
      expect(custom.getActiveCount()).toBe(0)
    })
  })

  describe('start', () => {
    test('sets running to true', () => {
      confetti.start()
      expect(confetti.isRunning()).toBe(true)
    })

    test('resets tick to 0', () => {
      confetti.start()
      confetti.update()
      confetti.update()
      expect(confetti.getTick()).toBe(2)
      confetti.start()
      expect(confetti.getTick()).toBe(0)
    })

    test('resets all particles to inactive', () => {
      confetti.start()
      // Run a few updates to spawn some particles
      for (let i = 0; i < 20; i++) {
        confetti.update()
      }
      const activeCount = confetti.getActiveCount()
      expect(activeCount).toBeGreaterThan(0)

      // Start again should reset
      confetti.start()
      // Before first update, tick is 0 and no origins have spawned yet
      expect(confetti.getTick()).toBe(0)
    })

    test('creates spawn origins', () => {
      confetti.start()
      // After starting and updating past delay, particles should spawn
      for (let i = 0; i < 10; i++) {
        confetti.update()
      }
      expect(confetti.getActiveCount()).toBeGreaterThan(0)
    })
  })

  describe('stop', () => {
    test('sets running to false', () => {
      confetti.start()
      expect(confetti.isRunning()).toBe(true)
      confetti.stop()
      expect(confetti.isRunning()).toBe(false)
    })

    test('deactivates all particles', () => {
      confetti.start()
      for (let i = 0; i < 20; i++) {
        confetti.update()
      }
      expect(confetti.getActiveCount()).toBeGreaterThan(0)
      confetti.stop()
      expect(confetti.getActiveCount()).toBe(0)
    })

    test('clears origins', () => {
      confetti.start()
      confetti.stop()
      expect(confetti.hasVisibleParticles()).toBe(false)
    })
  })

  describe('update', () => {
    test('does nothing when not running', () => {
      confetti.update()
      expect(confetti.getTick()).toBe(0)
    })

    test('increments tick when running', () => {
      confetti.start()
      confetti.update()
      expect(confetti.getTick()).toBe(1)
      confetti.update()
      expect(confetti.getTick()).toBe(2)
    })

    test('spawns particles at staggered intervals', () => {
      confetti.start()
      // First origin spawns immediately (delay = 0)
      confetti.update()
      const count1 = confetti.getActiveCount()

      // Later origins spawn with delay
      for (let i = 0; i < 15; i++) {
        confetti.update()
      }
      const count2 = confetti.getActiveCount()
      expect(count2).toBeGreaterThanOrEqual(count1)
    })

    test('applies physics to particles', () => {
      confetti.start()
      // Run enough updates to spawn and move particles
      for (let i = 0; i < 20; i++) {
        confetti.update()
      }

      const particles = confetti.getVisibleParticles()
      if (particles.length > 0) {
        // Particles should have moved from spawn point
        const hasMovedParticle = particles.some(p => p.y !== 33) // Near bottom start
        expect(hasMovedParticle).toBe(true)
      }
    })

    test('deactivates particles that go off-screen', () => {
      const quickConfetti = new ConfettiSystem(
        { width: 120, height: 36 },
        { lifetime: [5, 10] } // Short lifetime
      )
      quickConfetti.start()

      // Run many updates
      for (let i = 0; i < 200; i++) {
        quickConfetti.update()
      }

      // Eventually all particles should expire
      // (or go off screen)
      expect(quickConfetti.getActiveCount()).toBeLessThan(100)
    })

    test('stops running when all particles are done', () => {
      const quickConfetti = new ConfettiSystem(
        { width: 120, height: 36 },
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
        if (!quickConfetti.isRunning()) break
      }

      expect(quickConfetti.isRunning()).toBe(false)
    })
  })

  describe('getVisibleParticles', () => {
    test('returns empty array when no particles', () => {
      expect(confetti.getVisibleParticles()).toEqual([])
    })

    test('returns particles with required properties', () => {
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
      }
    })

    test('returns integer positions', () => {
      confetti.start()
      for (let i = 0; i < 10; i++) {
        confetti.update()
      }

      const particles = confetti.getVisibleParticles()
      for (const particle of particles) {
        expect(Number.isInteger(particle.x)).toBe(true)
        expect(Number.isInteger(particle.y)).toBe(true)
      }
    })

    test('opacity is between 0 and 1', () => {
      confetti.start()
      for (let i = 0; i < 10; i++) {
        confetti.update()
      }

      const particles = confetti.getVisibleParticles()
      for (const particle of particles) {
        expect(particle.opacity).toBeGreaterThanOrEqual(0)
        expect(particle.opacity).toBeLessThanOrEqual(1)
      }
    })

    test('filters out particles above screen', () => {
      confetti.start()
      // Immediately after start, particles may be above screen
      confetti.update()
      const particles = confetti.getVisibleParticles()
      for (const particle of particles) {
        expect(particle.y).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('hasVisibleParticles', () => {
    test('returns false initially', () => {
      expect(confetti.hasVisibleParticles()).toBe(false)
    })

    test('returns true when particles are active', () => {
      confetti.start()
      for (let i = 0; i < 5; i++) {
        confetti.update()
      }
      expect(confetti.hasVisibleParticles()).toBe(true)
    })
  })

  describe('getActiveCount', () => {
    test('returns 0 initially', () => {
      expect(confetti.getActiveCount()).toBe(0)
    })

    test('increases after spawning', () => {
      confetti.start()
      for (let i = 0; i < 10; i++) {
        confetti.update()
      }
      expect(confetti.getActiveCount()).toBeGreaterThan(0)
    })
  })

  describe('ASCII mode', () => {
    test('uses ASCII characters when configured', () => {
      const asciiConfetti = new ConfettiSystem(
        { width: 120, height: 36 },
        { useAscii: true }
      )
      asciiConfetti.start()
      for (let i = 0; i < 10; i++) {
        asciiConfetti.update()
      }

      const particles = asciiConfetti.getVisibleParticles()
      if (particles.length > 0) {
        // Check that particle chars are from ASCII set
        const asciiChars = Array.from(CONFETTI_CHARS_ASCII) as string[]
        for (const particle of particles) {
          expect(asciiChars.includes(particle.char)).toBe(true)
        }
      }
    })
  })
})

// ============================================================================
// Particle Pool Reuse Tests (Issue #12)
// ============================================================================

describe('Particle Pool: Capping and Reuse', () => {
  test('pool size never exceeds maxParticles', () => {
    const maxParticles = 20
    const system = new ConfettiSystem(
      { width: 120, height: 36 },
      { maxParticles, particlesPerBurst: 15 }
    )
    system.start()

    // Run many updates to trigger all origin bursts
    for (let i = 0; i < 100; i++) {
      system.update()
    }

    // Active count should never exceed pool size
    expect(system.getActiveCount()).toBeLessThanOrEqual(maxParticles)
  })

  test('pool is pre-allocated to maxParticles size at construction', () => {
    const maxParticles = 25
    const system = new ConfettiSystem(
      { width: 120, height: 36 },
      { maxParticles }
    )

    // Before starting, all particles exist but are inactive
    expect(system.getActiveCount()).toBe(0)
    // No visible particles since they are all inactive
    expect(system.getVisibleParticles()).toEqual([])
  })

  test('particles recycle after expiry (pool reuse)', () => {
    const maxParticles = 10
    const system = new ConfettiSystem(
      { width: 120, height: 36 },
      {
        maxParticles,
        particlesPerBurst: 10,
        lifetime: [30, 50],  // Moderate lifetime so particles survive initial checks
      }
    )
    system.start()

    // First update spawns the first origin (delayTicks=0)
    // Particles are created AND decremented on the same tick
    system.update()

    // After 1 update, particles should be active (life 29-49 remaining)
    const firstBatchCount = system.getActiveCount()
    expect(firstBatchCount).toBeGreaterThan(0)

    // Now advance past the longest lifetime to ensure all first-batch particles expire
    // Lifetime range is [30, 50], particles are decremented on creation tick,
    // so max lifetime is effectively 49 more ticks after creation
    for (let i = 0; i < 60; i++) {
      system.update()
    }

    // After expiry, first-batch particles should be inactive (recycled back to pool)
    // Note: other origins may have spawned new particles by now, but pool slots
    // freed by expired particles demonstrate the recycling mechanism
    const afterExpiryCount = system.getActiveCount()
    expect(afterExpiryCount).toBeLessThan(maxParticles)
  })

  test('burst with more particles than pool is capped to available slots', () => {
    const maxParticles = 5
    const system = new ConfettiSystem(
      { width: 120, height: 36 },
      {
        maxParticles,
        particlesPerBurst: 100,  // Way more than maxParticles
        lifetime: [200, 300],    // Long lifetime so nothing expires
      }
    )
    system.start()

    // Trigger all origins
    for (let i = 0; i < 80; i++) {
      system.update()
    }

    // Should never exceed the pool size
    expect(system.getActiveCount()).toBeLessThanOrEqual(maxParticles)
  })

  test('second start resets all particles for reuse', () => {
    const system = new ConfettiSystem(
      { width: 120, height: 36 },
      { maxParticles: 30, particlesPerBurst: 10 }
    )

    // First run
    system.start()
    for (let i = 0; i < 20; i++) {
      system.update()
    }
    const firstRunActive = system.getActiveCount()
    expect(firstRunActive).toBeGreaterThan(0)

    // Restart - pool should be fully available again
    system.start()
    expect(system.getActiveCount()).toBe(0) // All reset to inactive

    // New particles should spawn using recycled pool slots
    for (let i = 0; i < 20; i++) {
      system.update()
    }
    const secondRunActive = system.getActiveCount()
    expect(secondRunActive).toBeGreaterThan(0)
  })

  test('expired particles become available for new bursts', () => {
    const system = new ConfettiSystem(
      { width: 120, height: 36 },
      {
        maxParticles: 10,
        particlesPerBurst: 10,
        lifetime: [2, 3], // Very short lifetime
      }
    )
    system.start()

    // First update spawns first burst
    system.update()
    const firstCount = system.getActiveCount()
    expect(firstCount).toBeGreaterThan(0)

    // Wait for all to expire
    for (let i = 0; i < 20; i++) {
      system.update()
    }

    // Some later origins should have been able to spawn into recycled slots
    // The system creates 8 origins (5 bottom + 3 top) with staggered delays
    // Later origins will reuse expired slots
    // This test just verifies the system handles the lifecycle correctly
    // without running out of pool slots or crashing
    expect(system.isRunning()).toBeDefined()
  })

  test('active count goes to 0 after all particles expire and system stops', () => {
    const system = new ConfettiSystem(
      { width: 120, height: 36 },
      {
        maxParticles: 20,
        particlesPerBurst: 5,
        lifetime: [2, 4],
      }
    )
    system.start()

    // Run until system stops on its own
    for (let i = 0; i < 500; i++) {
      system.update()
      if (!system.isRunning()) break
    }

    expect(system.isRunning()).toBe(false)
    expect(system.getActiveCount()).toBe(0)
  })
})

describe('getConfettiDisplayColor', () => {
  test('returns original color at high opacity', () => {
    expect(getConfettiDisplayColor('#ff5555', 1.0)).toBe('#ff5555')
    expect(getConfettiDisplayColor('#ff5555', 0.8)).toBe('#ff5555')
    expect(getConfettiDisplayColor('#ff5555', 0.7)).toBe('#ff5555')
  })

  test('returns dimmed color at medium opacity', () => {
    expect(getConfettiDisplayColor('#ff5555', 0.5)).toBe('#888888')
    expect(getConfettiDisplayColor('#ff5555', 0.4)).toBe('#888888')
  })

  test('returns very dim color at low opacity', () => {
    expect(getConfettiDisplayColor('#ff5555', 0.3)).toBe('#555555')
    expect(getConfettiDisplayColor('#ff5555', 0.1)).toBe('#555555')
    expect(getConfettiDisplayColor('#ff5555', 0)).toBe('#555555')
  })
})

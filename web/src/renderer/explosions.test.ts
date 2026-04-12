import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { ExplosionSystem } from './explosions'
import type { DrawCommand } from './canvasRenderer'

/** Returns true if all draw commands have finite coordinates, whichever naming they use. */
function allHaveFiniteCoords(cmds: DrawCommand[]): boolean {
  for (const cmd of cmds) {
    const c = cmd as any
    const x = c.x ?? c.cx
    const y = c.y ?? c.cy
    if (typeof x !== 'number' || !Number.isFinite(x)) return false
    if (typeof y !== 'number' || !Number.isFinite(y)) return false
  }
  return true
}

function kindsIn(cmds: DrawCommand[]): Set<string | undefined> {
  return new Set(cmds.map((c) => ('kind' in c ? c.kind : undefined)))
}

describe('ExplosionSystem', () => {
  let sys: ExplosionSystem

  beforeEach(() => {
    sys = new ExplosionSystem()
  })

  it('spawn adds an explosion to the system', () => {
    expect(sys.getDrawCalls(0)).toEqual([])
    sys.spawn(10, 5, 5, 2, '#ff0000', 0)
    expect(sys.getDrawCalls(0).length).toBeGreaterThan(0)
  })

  it('getDrawCalls at age 0 emits flash, fireball, shockwave, and debris', () => {
    sys.spawn(10, 5, 5, 2, '#ff0000', 0)
    const kinds = kindsIn(sys.getDrawCalls(0))
    expect(kinds.has('explosion-flash')).toBe(true) // soft glow halo
    expect(kinds.has('explosion-fireball')).toBe(true) // new: radial gradient fireball
    expect(kinds.has('explosion-shockwave')).toBe(true)
    expect(kinds.has('explosion-debris')).toBe(true)
    // No embers or smoke yet
    expect(kinds.has('explosion-ember')).toBe(false)
  })

  it('mid-life: emits embers, smoke, and fading debris (no fireball)', () => {
    sys.spawn(10, 5, 5, 2, '#ff0000', 0)
    const kinds = kindsIn(sys.getDrawCalls(14))
    expect(kinds.has('explosion-fireball')).toBe(false) // fireball ends at age 8
    expect(kinds.has('explosion-shockwave')).toBe(false) // shockwave ends at 10
    expect(kinds.has('explosion-debris')).toBe(true)
    expect(kinds.has('explosion-ember')).toBe(true)
    expect(kinds.has('explosion-smoke')).toBe(true)
  })

  it('emits smoke cloud that lingers', () => {
    sys.spawn(10, 5, 5, 2, '#aa0000', 0)
    // At age 6 smoke is present
    expect(kindsIn(sys.getDrawCalls(6)).has('explosion-smoke')).toBe(true)
    // At age 20 smoke should still be present
    expect(kindsIn(sys.getDrawCalls(20)).has('explosion-smoke')).toBe(true)
    // Past lifetime, nothing
    sys.prune(40)
    expect(sys.getDrawCalls(40)).toEqual([])
  })

  it('getDrawCalls past total lifetime returns empty after prune', () => {
    sys.spawn(10, 5, 5, 2, '#ff0000', 0)
    sys.prune(30)
    expect(sys.getDrawCalls(30)).toEqual([])
  })

  it('prune removes old explosions', () => {
    sys.spawn(10, 5, 5, 2, '#ff0000', 0)
    sys.spawn(20, 10, 5, 2, '#00ff00', 20)
    sys.prune(40)
    const kinds = kindsIn(sys.getDrawCalls(40))
    // First explosion (age 40, past lifetime) gone — no fireball at tick 40
    expect(kinds.has('explosion-fireball')).toBe(false)
  })

  it('reset clears all', () => {
    sys.spawn(10, 5, 5, 2, '#ff0000', 0)
    sys.spawn(20, 10, 5, 2, '#00ff00', 5)
    sys.reset()
    expect(sys.getDrawCalls(0)).toEqual([])
    expect(sys.getDrawCalls(10)).toEqual([])
  })

  it('uses smooth canvas primitives (radial / circle), not just rects', () => {
    // Regression guard: the previous implementation emitted only `type: 'rect'`
    // which looked pixellated. Verify at least one radial or circle command.
    sys.spawn(10, 5, 5, 2, '#ff0000', 0)
    const cmds = sys.getDrawCalls(0)
    const types = new Set(cmds.map((c) => c.type))
    const hasSmoothPrimitive = types.has('radial') || types.has('circle')
    expect(hasSmoothPrimitive).toBe(true)
  })

  it('fireball has a radial gradient with multiple stops (smooth falloff)', () => {
    sys.spawn(10, 5, 5, 2, '#ff0000', 0)
    const cmds = sys.getDrawCalls(0)
    const fireball = cmds.find((c) => 'kind' in c && c.kind === 'explosion-fireball')
    expect(fireball).toBeDefined()
    expect(fireball!.type).toBe('radial')
    const radial = fireball as Extract<DrawCommand, { type: 'radial' }>
    expect(radial.stops.length).toBeGreaterThanOrEqual(4) // hot → cool falloff
    // Alpha in the first stop is bright but never 1.0 (not retina-burn white)
    expect(radial.stops[0].alpha).toBeLessThanOrEqual(0.95)
    // Outer edge fades to 0
    expect(radial.stops[radial.stops.length - 1].alpha).toBe(0)
  })

  it('PBT: for any spawn position, all draw calls have finite coords', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 119 }),
        fc.integer({ min: 0, max: 35 }),
        fc.integer({ min: 0, max: 25 }),
        (x, y, age) => {
          const s = new ExplosionSystem()
          s.spawn(x, y, 5, 2, '#ff00ff', 0)
          const cmds = s.getDrawCalls(age)
          expect(allHaveFiniteCoords(cmds)).toBe(true)
        },
      ),
    )
  })
})

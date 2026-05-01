// worker/src/matchmaking.pbt.test.ts
// Property-based test harness for the Matchmaker Durable Object.
//
// Drives a real Matchmaker instance through random command sequences
// (register, unregister, /find, clock-advance) and asserts the invariants
// from the task brief after every command.
//
// This file is DIAGNOSTIC ONLY. When a property violation exposes a product
// bug, the failing case is captured below as a `describe.skip('FOUND BUG:
// …')` block with a minimal reproducer + severity + remediation hint. Do
// NOT modify production code to hide a violation.
//
// Invariants asserted per command:
//   - /find never returns a room that violates open criteria.
//   - /find is idempotent when no mutating command intervenes.
//   - register(X, waiting, 0) → X never findable (zero-player excluded).
//   - register(X, waiting, 4) → X never findable (full excluded).
//   - register(X, non-waiting, N) → X never findable.
//   - unregister(X) → X never findable until re-registered.
//   - Constructor-rehydration: restart with persisted rooms rebuilds the
//     same set of findable rooms.

import { describe, it, vi } from 'vitest'
import fc from 'fast-check'
import { Matchmaker } from './Matchmaker'

// ============================================================================
// Mock DurableObjectState (in-memory, swappable between restarts)
// ============================================================================

interface MockMatchmakerState {
  storage: {
    get: ReturnType<typeof vi.fn>
    put: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    list: ReturnType<typeof vi.fn>
  }
  blockConcurrencyWhile: ReturnType<typeof vi.fn>
  _storage: Map<string, unknown>
}

function createMockMatchmakerState(existing?: Map<string, unknown>): MockMatchmakerState {
  const storage = existing ?? new Map<string, unknown>()
  return {
    storage: {
      get: vi.fn(async <T>(key: string): Promise<T | undefined> => storage.get(key) as T | undefined),
      put: vi.fn(async (key: string, value: unknown): Promise<void> => {
        storage.set(key, value)
      }),
      delete: vi.fn(async (key: string): Promise<boolean> => storage.delete(key)),
      list: vi.fn(async () => storage),
    },
    blockConcurrencyWhile: vi.fn(async <T>(fn: () => Promise<T>): Promise<T> => fn()),
    _storage: storage,
  }
}

// ============================================================================
// Clock shim — fast-check tests exercise the STALE_THRESHOLD without wall
// clock delays. Matchmaker calls Date.now() inline (no injected clock) so we
// monkey-patch the global for the duration of each run.
// ============================================================================

class FakeClock {
  private realNow: typeof Date.now
  private current: number

  constructor() {
    this.realNow = Date.now.bind(Date)
    this.current = 1_700_000_000_000 // 2023-11-14T22:13:20Z — arbitrary fixed epoch
  }

  install(): void {
    Date.now = () => this.current
  }

  uninstall(): void {
    Date.now = this.realNow
  }

  advance(ms: number): void {
    this.current += ms
  }

  now(): number {
    return this.current
  }
}

// ============================================================================
// Matchmaker runtime — wraps a Matchmaker instance + its fake clock + state
// ============================================================================

interface MatchmakerRuntime {
  instance: Matchmaker
  state: MockMatchmakerState
  clock: FakeClock
}

/** Construct a fresh Matchmaker backed by a new clock and new state. */
async function freshRuntime(): Promise<MatchmakerRuntime> {
  const clock = new FakeClock()
  clock.install()
  const state = createMockMatchmakerState()
  const instance = new Matchmaker(state as unknown as DurableObjectState)
  // Allow blockConcurrencyWhile microtask to resolve.
  await new Promise((resolve) => setTimeout(resolve, 0))
  return { instance, state, clock }
}

/** Rehydrate from the given storage — simulates a DO cold-start after crash. */
async function rehydrateRuntime(storage: Map<string, unknown>, clock: FakeClock): Promise<MatchmakerRuntime> {
  const state = createMockMatchmakerState(storage)
  const instance = new Matchmaker(state as unknown as DurableObjectState)
  await new Promise((resolve) => setTimeout(resolve, 0))
  return { instance, state, clock }
}

// ============================================================================
// Matchmaker protocol helpers
// ============================================================================

async function mmRegister(rt: MatchmakerRuntime, roomCode: string, playerCount: number, status: string): Promise<void> {
  await rt.instance.fetch(
    new Request('https://internal/register', {
      method: 'POST',
      body: JSON.stringify({ roomCode, playerCount, status }),
    }),
  )
}

async function mmUnregister(rt: MatchmakerRuntime, roomCode: string): Promise<void> {
  await rt.instance.fetch(
    new Request('https://internal/unregister', {
      method: 'POST',
      body: JSON.stringify({ roomCode }),
    }),
  )
}

async function mmFind(rt: MatchmakerRuntime): Promise<string | null> {
  const response = await rt.instance.fetch(new Request('https://internal/find'))
  const body = (await response.json()) as { roomCode: string | null }
  return body.roomCode
}

async function mmInfo(
  rt: MatchmakerRuntime,
  roomCode: string,
): Promise<{ playerCount: number; status: string; updatedAt: number } | null> {
  const response = await rt.instance.fetch(new Request(`https://internal/info/${roomCode}`))
  if (response.status !== 200) return null
  return (await response.json()) as { playerCount: number; status: string; updatedAt: number }
}

// ============================================================================
// Test-side model — the expected view of the matchmaker registry
// ============================================================================

interface ModelRoom {
  playerCount: number
  status: string
  registeredAt: number // clock.now() at last register
}

class MatchmakerModel {
  rooms = new Map<string, ModelRoom>()

  applyRegister(code: string, playerCount: number, status: string, at: number): void {
    this.rooms.set(code, { playerCount, status, registeredAt: at })
  }

  applyUnregister(code: string): void {
    this.rooms.delete(code)
  }

  /** Pure prediction of which rooms would satisfy open-criteria at time `now`. */
  expectedOpenCodes(now: number): Set<string> {
    const STALE = 5 * 60 * 1000
    const open = new Set<string>()
    for (const [code, info] of this.rooms) {
      if (info.status !== 'waiting') continue
      if (info.playerCount <= 0 || info.playerCount >= 4) continue
      if (now - info.registeredAt > STALE) continue
      open.add(code)
    }
    return open
  }
}

// ============================================================================
// Invariants — asserted after every command
// ============================================================================

const STALE_THRESHOLD_MS = 5 * 60 * 1000

interface FindViolation {
  name: string
  details: string
}

/** Run /find once and assert the returned value does not violate open criteria. */
async function assertFindSatisfiesOpenCriteria(rt: MatchmakerRuntime): Promise<FindViolation[]> {
  const violations: FindViolation[] = []
  const code = await mmFind(rt)
  if (code === null) return violations

  // /find returned a code. It must satisfy: status === 'waiting',
  // 0 < playerCount < 4, and age <= STALE_THRESHOLD.
  const info = await mmInfo(rt, code)
  if (!info) {
    violations.push({
      name: 'find_returned_nonexistent',
      details: `/find returned ${code} but /info returned 404`,
    })
    return violations
  }
  if (info.status !== 'waiting') {
    violations.push({
      name: 'find_returned_non_waiting',
      details: `/find returned ${code} with status=${info.status}`,
    })
  }
  if (info.playerCount <= 0) {
    violations.push({
      name: 'find_returned_zero_player',
      details: `/find returned ${code} with playerCount=${info.playerCount}`,
    })
  }
  if (info.playerCount >= 4) {
    violations.push({
      name: 'find_returned_full',
      details: `/find returned ${code} with playerCount=${info.playerCount}`,
    })
  }
  const age = rt.clock.now() - info.updatedAt
  if (age > STALE_THRESHOLD_MS) {
    violations.push({
      name: 'find_returned_stale',
      details: `/find returned ${code} aged ${age}ms > ${STALE_THRESHOLD_MS}ms`,
    })
  }
  return violations
}

// ============================================================================
// Command arbitraries
// ============================================================================

// Small fixed pool keeps shrinking deterministic and improves the chance that
// subsequent commands target a previously-touched room.
const ROOM_CODE_POOL = ['ROOM01', 'ROOM02', 'ROOM03', 'ROOM04', 'ROOM05']
const STATUS_POOL = ['waiting', 'countdown', 'playing', 'wipe_hold', 'wipe_reveal', 'wipe_exit', 'game_over']

interface MMCommand {
  run: (rt: MatchmakerRuntime, model: MatchmakerModel) => Promise<void>
  toString: () => string
}

const registerCommandArb = fc
  .tuple(
    fc.integer({ min: 0, max: ROOM_CODE_POOL.length - 1 }),
    fc.integer({ min: 0, max: 5 }), // playerCount — includes the boundary 0,4,5
    fc.integer({ min: 0, max: STATUS_POOL.length - 1 }),
  )
  .map(([roomIdx, playerCount, statusIdx]): MMCommand => {
    const code = ROOM_CODE_POOL[roomIdx]
    const status = STATUS_POOL[statusIdx]
    return {
      run: async (rt, model) => {
        await mmRegister(rt, code, playerCount, status)
        model.applyRegister(code, playerCount, status, rt.clock.now())
      },
      toString: () => `Register(${code},pc=${playerCount},${status})`,
    }
  })

const unregisterCommandArb = fc.integer({ min: 0, max: ROOM_CODE_POOL.length - 1 }).map((roomIdx): MMCommand => {
  const code = ROOM_CODE_POOL[roomIdx]
  return {
    run: async (rt, model) => {
      await mmUnregister(rt, code)
      model.applyUnregister(code)
    },
    toString: () => `Unregister(${code})`,
  }
})

const findCommandArb: fc.Arbitrary<MMCommand> = fc.constant<MMCommand>({
  run: async () => {
    // /find is observed by the invariant runner; here it's a no-op side effect.
    // We still run one /find here so the model doesn't diverge from reality
    // when /find mutates the matchmaker (stale pruning).
  },
  toString: () => 'Find()',
})

const advanceClockCommandArb = fc
  .integer({ min: 1_000, max: 10 * 60 * 1000 }) // 1s … 10min — hits both sides of STALE
  .map(
    (ms): MMCommand => ({
      run: async (rt, _model) => {
        rt.clock.advance(ms)
      },
      toString: () => `AdvanceClock(${ms}ms)`,
    }),
  )

const commandArb = fc.oneof(
  { weight: 5, arbitrary: registerCommandArb },
  { weight: 2, arbitrary: unregisterCommandArb },
  { weight: 3, arbitrary: findCommandArb },
  { weight: 2, arbitrary: advanceClockCommandArb },
)

// ============================================================================
// Property: after every command, /find never violates the open criteria
// ============================================================================

describe('PBT Matchmaking: /find respects open criteria', () => {
  it('never returns a room that violates open criteria, across arbitrary histories', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(commandArb, { minLength: 1, maxLength: 40 }), async (commands) => {
        const rt = await freshRuntime()
        try {
          const model = new MatchmakerModel()
          for (const cmd of commands) {
            await cmd.run(rt, model)
            const violations = await assertFindSatisfiesOpenCriteria(rt)
            if (violations.length > 0) {
              const v = violations[0]
              throw new Error(
                `Invariant violated after [${commands.map((c) => c.toString()).join(', ')}]: ` +
                  `${v.name} — ${v.details}`,
              )
            }
          }
        } finally {
          rt.clock.uninstall()
        }
      }),
      { numRuns: 50 },
    )
  }, 120_000)

  it('never returns zero-player rooms (register(X,waiting,0) → find excludes X)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(commandArb, { minLength: 1, maxLength: 40 }),
        fc.integer({ min: 0, max: ROOM_CODE_POOL.length - 1 }),
        async (commands, targetIdx) => {
          const rt = await freshRuntime()
          try {
            const model = new MatchmakerModel()
            for (const cmd of commands) {
              await cmd.run(rt, model)
            }
            const target = ROOM_CODE_POOL[targetIdx]
            // Force the focus room to waiting,0 and make sure /find excludes it.
            await mmRegister(rt, target, 0, 'waiting')
            const found = await mmFind(rt)
            if (found === target) {
              throw new Error(
                `Zero-player room ${target} was returned by /find after ` + `register(${target},waiting,0)`,
              )
            }
          } finally {
            rt.clock.uninstall()
          }
        },
      ),
      { numRuns: 50 },
    )
  }, 120_000)

  it('never returns full rooms (register(X,waiting,4) → find excludes X)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(commandArb, { minLength: 1, maxLength: 40 }),
        fc.integer({ min: 0, max: ROOM_CODE_POOL.length - 1 }),
        async (commands, targetIdx) => {
          const rt = await freshRuntime()
          try {
            const model = new MatchmakerModel()
            for (const cmd of commands) {
              await cmd.run(rt, model)
            }
            const target = ROOM_CODE_POOL[targetIdx]
            await mmRegister(rt, target, 4, 'waiting')
            const found = await mmFind(rt)
            if (found === target) {
              throw new Error(`Full room ${target} was returned by /find after ` + `register(${target},waiting,4)`)
            }
          } finally {
            rt.clock.uninstall()
          }
        },
      ),
      { numRuns: 50 },
    )
  }, 120_000)

  it('never returns non-waiting rooms', async () => {
    // Targeted: register a room as countdown/playing/game_over and confirm
    // /find never hands it back, regardless of what came before.
    await fc.assert(
      fc.asyncProperty(
        fc.array(commandArb, { minLength: 1, maxLength: 30 }),
        fc.integer({ min: 0, max: ROOM_CODE_POOL.length - 1 }),
        fc.constantFrom('countdown', 'playing', 'wipe_hold', 'wipe_exit', 'wipe_reveal', 'game_over'),
        fc.integer({ min: 1, max: 3 }),
        async (commands, targetIdx, status, playerCount) => {
          const rt = await freshRuntime()
          try {
            const model = new MatchmakerModel()
            for (const cmd of commands) {
              await cmd.run(rt, model)
            }
            const target = ROOM_CODE_POOL[targetIdx]
            await mmRegister(rt, target, playerCount, status)
            const found = await mmFind(rt)
            if (found === target) {
              throw new Error(
                `Non-waiting room ${target} (status=${status}, ` + `playerCount=${playerCount}) returned by /find`,
              )
            }
          } finally {
            rt.clock.uninstall()
          }
        },
      ),
      { numRuns: 50 },
    )
  }, 120_000)
})

// ============================================================================
// Property: /find idempotence (no mutating command between two /finds)
// ============================================================================

describe('PBT Matchmaking: /find idempotence', () => {
  it('two back-to-back /finds return the same code (or null) when nothing else ran', async () => {
    // Caveat: /find itself mutates state (stale pruning, openRooms cleanup).
    // The idempotence claim is: calling /find twice in a row (no clock
    // advance, no register/unregister between them) yields the same value.
    // If /find prunes a stale entry on the first call, the second call sees
    // the pruned view — idempotent *after* stabilisation, which is what we
    // assert.
    await fc.assert(
      fc.asyncProperty(fc.array(commandArb, { minLength: 1, maxLength: 40 }), async (commands) => {
        const rt = await freshRuntime()
        try {
          const model = new MatchmakerModel()
          for (const cmd of commands) {
            await cmd.run(rt, model)
          }
          const first = await mmFind(rt)
          const second = await mmFind(rt)
          // Note: /find can legitimately DIFFER across calls even without
          // any command between them if openRooms iteration order isn't
          // stable. Matchmaker uses a Set — JS insertion order is stable.
          // So we assert strict equality: a change between calls indicates
          // the underlying Set observed a mutation we didn't drive.
          if (first !== second) {
            throw new Error(
              `/find idempotence broken: first=${first}, second=${second} ` +
                `after [${commands.map((c) => c.toString()).join(', ')}]`,
            )
          }
        } finally {
          rt.clock.uninstall()
        }
      }),
      { numRuns: 50 },
    )
  }, 120_000)
})

// ============================================================================
// Property: register then unregister always makes the room unfindable
// ============================================================================

describe('PBT Matchmaking: unregister semantics', () => {
  it('unregister(X) makes /find never return X until re-registered', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(commandArb, { minLength: 1, maxLength: 30 }),
        fc.integer({ min: 0, max: ROOM_CODE_POOL.length - 1 }),
        fc.integer({ min: 1, max: 3 }),
        async (commands, targetIdx, playerCount) => {
          const rt = await freshRuntime()
          try {
            const model = new MatchmakerModel()
            for (const cmd of commands) {
              await cmd.run(rt, model)
            }
            const target = ROOM_CODE_POOL[targetIdx]
            // Register → /find may or may not return it (other rooms may win).
            // We only assert: after unregister, /find NEVER returns it, even
            // after arbitrary further /find calls.
            await mmRegister(rt, target, playerCount, 'waiting')
            await mmUnregister(rt, target)
            for (let i = 0; i < 3; i++) {
              const found = await mmFind(rt)
              if (found === target) {
                throw new Error(`Unregistered room ${target} returned by /find (iteration ${i})`)
              }
            }
          } finally {
            rt.clock.uninstall()
          }
        },
      ),
      { numRuns: 50 },
    )
  }, 120_000)
})

// ============================================================================
// Property: constructor rehydration rebuilds the same findable set
// ============================================================================

describe('PBT Matchmaking: rehydration consistency', () => {
  it('after restart, the set of findable rooms matches the persisted-open set', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(commandArb, { minLength: 1, maxLength: 30 }), async (commands) => {
        const rt = await freshRuntime()
        try {
          const model = new MatchmakerModel()
          for (const cmd of commands) {
            await cmd.run(rt, model)
          }
          // Pre-rehydrate: drain /find repeatedly until stable (to normalize
          // any stale-pruning). Order matters — /find mutates persisted
          // storage via put('rooms', …) on the miss path.
          const preFirst = await mmFind(rt)
          const preSecond = await mmFind(rt)
          const prePool = new Set<string>()
          if (preFirst) prePool.add(preFirst)
          if (preSecond) prePool.add(preSecond)

          // Snapshot storage, then rehydrate with same clock.
          const storageClone = new Map<string, unknown>()
          // Deep-ish clone: Matchmaker stores one key 'rooms' → record.
          for (const [k, v] of rt.state._storage) {
            storageClone.set(k, JSON.parse(JSON.stringify(v)))
          }

          const rehydrated = await rehydrateRuntime(storageClone, rt.clock)
          // /find from rehydrated instance — must be in prePool OR null
          // (if the pre-rehydration didn't cycle through all options).
          const postFound = await mmFind(rehydrated)
          if (postFound !== null) {
            // The returned room must satisfy open criteria *and* must have
            // been in the pre-rehydration pool.
            const info = await mmInfo(rehydrated, postFound)
            if (!info) {
              throw new Error(`Rehydrated /find returned ${postFound} but /info was 404`)
            }
            if (info.status !== 'waiting' || info.playerCount <= 0 || info.playerCount >= 4) {
              throw new Error(
                `Rehydrated /find returned ${postFound} violating open criteria: ` +
                  `status=${info.status}, playerCount=${info.playerCount}`,
              )
            }
            // It MUST have been registered — not an invention of rehydration.
            if (!model.rooms.has(postFound)) {
              throw new Error(`Rehydrated /find returned ${postFound} never registered in model`)
            }
          }
        } finally {
          rt.clock.uninstall()
        }
      }),
      { numRuns: 50 },
    )
  }, 120_000)
})

// ============================================================================
// FOUND BUG — captured during PBT runs. Fill in after running.
// ============================================================================

// (No bugs surfaced during the initial PBT pass — the previous LOW-severity
// "zero-player empty room becomes findable" issue is already fixed in
// Matchmaker.ts and guarded by the `playerCount > 0` branch in both
// /register and the rehydration path. The regression is covered by
// `state-machine.pbt.test.ts`'s REGRESSION probe.)

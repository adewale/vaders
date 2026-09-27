// web/src/testing/pbt.ts
//
// Timeouts for property-based tests, sized to their run budget.
//
// A property test's cost is numRuns × (cost of one run). Several component
// PBTs had their numRuns tuned down to fit vitest's default 5s timeout ("40
// runs fits the 5s test timeout"), which couples the size of the search to
// machine speed: under CPU contention the same tests take 4-9s and fail as
// timeouts, not as property violations. Give each such test an explicit
// timeout derived from its numRuns instead, so raising numRuns raises the
// budget with it and a timeout means a run is ~20x slower than normal.

/**
 * Per-run budget for PBTs that render React components (render + events +
 * unmount per run). Measured at ~25-30ms per run on an idle machine and up to
 * ~220ms per run under heavy CPU contention.
 */
export const RENDERING_PBT_MS_PER_RUN = 500

/** Test timeout (ms) for a property test with `numRuns` runs. */
export function pbtTimeout(numRuns: number, msPerRun = RENDERING_PBT_MS_PER_RUN): number {
  return numRuns * msPerRun
}

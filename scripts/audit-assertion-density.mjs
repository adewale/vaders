#!/usr/bin/env node
// scripts/audit-assertion-density.mjs
//
// Report tests with fewer than 3 meaningful `expect(…)` calls.
//
// **Why this exists**: the testing-best-practices skill calls for ≥3
// assertions per test. Reviewing the visual-identity audit turned up the
// root cause of several missed bugs — tests that assert *existence* but
// not *identity*. A one-assertion test like
//
//   it('renders a glow', () => {
//     expect(cmds.find(c => c.kind === 'bullet-glow')).toBeDefined()
//   })
//
// passes for any colour, any shape, any glow. It's a smoke test. Raising
// assertion density forces tests to describe what SHOULD be present AND
// what SHOULDN'T — both-directions, positive + negative — which is the
// test shape that caught nothing when the bullet palette drifted to
// single-colour across eleven rendering layers.
//
// This script is **non-blocking by default**. It prints a report of the
// lowest-density test files so they can be upgraded over time. Pass
// `--fail-under=N` to make it exit non-zero if any test has < N asserts
// (CI gate).

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const FAIL_UNDER_FLAG = process.argv.find((a) => a.startsWith('--fail-under='))
const FAIL_UNDER = FAIL_UNDER_FLAG ? Number.parseInt(FAIL_UNDER_FLAG.split('=')[1], 10) : 0
const TARGET_DENSITY = 3

// Roots we audit. Intentionally excludes `client/` (TUI) and `worker/` for
// this initial pass — once the skill's bar is met in web/client-core/shared
// we'll expand.
const SCAN_ROOTS = ['web/src', 'client-core/src', 'shared', 'scripts']

// File patterns considered test files.
const TEST_FILE = /\.(test|spec)\.(ts|tsx|mjs)$/

// Directories to skip entirely (build output, dependencies, reports).
const SKIP_DIRS = new Set(['node_modules', 'dist', '.wrangler', 'test-results', 'playwright-report', 'coverage'])

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) out.push(...walk(full))
    else if (TEST_FILE.test(entry)) out.push(full)
  }
  return out
}

/**
 * Split a test file into (test name, body) pairs. Uses a conservative
 * regex: finds `it('…', …)` / `test('…', …)` / `it.each(…)('…', …)` and
 * grabs the text between the opening paren and the matching closing paren.
 * Good enough to count `expect(` occurrences inside each test body.
 */
function extractTests(source) {
  const tests = []
  // Match `it(` / `test(` / `it.each(…)(` / `test.each(…)(`.
  // Capture position after the opening (. Then walk braces to find the end.
  const re = /\b(?:it|test)(?:\.each\([^)]*\))?\s*\(\s*['"`]([^'"`]+)['"`]\s*,/g
  let match
  while ((match = re.exec(source)) !== null) {
    const name = match[1]
    // Walk forward from match end, counting parens, until balanced.
    let depth = 1
    let i = match.index + match[0].length
    while (i < source.length && depth > 0) {
      const ch = source[i]
      if (ch === '(') depth++
      else if (ch === ')') depth--
      i++
      if (depth === 0) break
    }
    const body = source.slice(match.index + match[0].length, i)
    // Count `expect(` calls + property-based entry points. A PBT's
    // boolean return from `fc.property` IS its assertion, so `fc.assert(`
    // counts as 3 effective assertions (typically a PBT exercises many
    // inputs and verifies multiple conditions per run). This matches the
    // density policy described in the skill's PBT guidance.
    const expectCount = (body.match(/\bexpect\s*\(/g) ?? []).length
    const pbtCount = (body.match(/\bfc\.assert\s*\(/g) ?? []).length
    const bareAssert = (body.match(/\b(?:assert|expect\.soft)\s*\(/g) ?? []).length
    const asserts = expectCount + pbtCount * 3 + bareAssert
    tests.push({ name, asserts })
  }
  return tests
}

const findings = []
for (const rel of SCAN_ROOTS) {
  const abs = join(root, rel)
  try {
    statSync(abs)
  } catch {
    continue
  }
  for (const file of walk(abs)) {
    const source = readFileSync(file, 'utf8')
    const tests = extractTests(source)
    for (const t of tests) {
      if (t.asserts < TARGET_DENSITY) {
        findings.push({ file: relative(root, file), name: t.name, asserts: t.asserts })
      }
    }
  }
}

findings.sort((a, b) => a.asserts - b.asserts || a.file.localeCompare(b.file))

const total = findings.length
const distribution = [0, 0, 0]
for (const f of findings) distribution[Math.min(2, f.asserts)]++

console.log(`assertion density audit — target ≥ ${TARGET_DENSITY} expect() per test`)
console.log(`scope: ${SCAN_ROOTS.join(', ')}`)
console.log(`low-density tests found: ${total}`)
console.log(`  0 assertions : ${distribution[0]}`)
console.log(`  1 assertion  : ${distribution[1]}`)
console.log(`  2 assertions : ${distribution[2]}`)
console.log()

const HEAD = 30
if (findings.length > 0) {
  console.log(`top ${Math.min(HEAD, total)} by lowest density:`)
  for (const f of findings.slice(0, HEAD)) {
    console.log(`  ${f.asserts}x  ${f.file}  >  ${f.name}`)
  }
  if (findings.length > HEAD) {
    console.log(`  … and ${findings.length - HEAD} more`)
  }
}

// Non-blocking by default. Opt in via --fail-under=N.
let failed = 0
if (FAIL_UNDER > 0) {
  failed = findings.filter((f) => f.asserts < FAIL_UNDER).length
  if (failed > 0) {
    console.error(`\nFAIL: ${failed} tests below --fail-under=${FAIL_UNDER}`)
    process.exit(1)
  }
}

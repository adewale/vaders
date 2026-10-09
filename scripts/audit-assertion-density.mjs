#!/usr/bin/env node
// Descriptive assertion-count inventory, not a semantic quality check.
// One precise assertion can be sufficient; several weak assertions can still
// prove nothing. Retained as the existing informational report, with no gate,
// baseline, extra dependency, runtime lane or assertion-count requirement.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const REPORT_COUNT_LIMIT = 3

// Roots we audit. Intentionally excludes `client/` (TUI) and `worker/` for
// this report. Its scope remains unchanged; it is not a quality bar.
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
    // Raw syntactic counts are descriptive only. A property assertion is
    // counted once, not given an arbitrary quality weight.
    const expectCount = (body.match(/\bexpect\s*\(/g) ?? []).length
    const pbtCount = (body.match(/\bfc\.assert\s*\(/g) ?? []).length
    const bareAssert = (body.match(/\b(?:assert|expect\.soft)\s*\(/g) ?? []).length
    const asserts = expectCount + pbtCount + bareAssert
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
      if (t.asserts < REPORT_COUNT_LIMIT) {
        findings.push({ file: relative(root, file), name: t.name, asserts: t.asserts })
      }
    }
  }
}

findings.sort((a, b) => a.asserts - b.asserts || a.file.localeCompare(b.file))

const total = findings.length
const distribution = [0, 0, 0]
for (const f of findings) distribution[Math.min(2, f.asserts)]++

console.log(`assertion-count inventory (informational only; counts do not establish test quality)`)
console.log(`scope: ${SCAN_ROOTS.join(', ')}`)
console.log(`tests with fewer than ${REPORT_COUNT_LIMIT} syntactic assertions: ${total}`)
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

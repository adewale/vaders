#!/usr/bin/env node
// scripts/check-weak-sole-assertions.mjs
//
// Blocking CI check: fail on any test whose ONLY assertion is
// `expect(x).toBeDefined()` or `expect(x).toBeTruthy()`.
//
// Such a test asserts existence, not identity. The visual-identity audit
// found drift bugs that survived because their tests looked like
//
//   it('renders a glow', () => {
//     expect(cmds.find(c => c.kind === 'bullet-glow')).toBeDefined()
//   })
//
// which passes for any colour, any shape, any glow. This replaces the old
// assertion-density audit (scripts/audit-assertion-density.mjs), which counted
// `expect(` calls against a "3+ assertions per test" rule. The
// testing-best-practices skill has since retracted that rule: a single precise
// assertion (`toEqual`, `toBe`, a property test) is fine; a single existence
// check is not.
//
// Counted as assertions: `expect(`, `expect.soft(`, `assert(`, `fc.assert(`,
// and helper calls named `expectSomething(` / `assertSomething(`.
//
// Existing offenders are frozen in scripts/weak-sole-assertions.baseline.json
// (a shrink-only ratchet): a NEW weak-sole test fails the check, and so does a
// baseline entry that no longer occurs, so the baseline can only shrink.
// Strengthen a listed test, then delete its baseline entry.
//
// Usage:
//   node scripts/check-weak-sole-assertions.mjs                   (exit 1 on drift)
//   node scripts/check-weak-sole-assertions.mjs --write-baseline  (regenerate)

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const SCAN_ROOTS = ['web/src', 'web/e2e', 'client-core/src', 'client/src', 'worker/src', 'worker/runtime-test', 'shared']
const TEST_FILE = /\.(test|spec)\.(ts|tsx|mjs)$/
const SKIP_DIRS = new Set(['node_modules', 'dist', '.wrangler', 'test-results', 'playwright-report', 'coverage'])

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (TEST_FILE.test(entry)) out.push(full)
  }
  return out
}

/**
 * Split a test file into { name, body } for each `it(…)` / `test(…)` /
 * `it.each(…)(…)` call, by walking parentheses from the call's opening paren.
 * Exported for the self-test in check-weak-sole-assertions.test.mjs.
 */
export function extractTests(source) {
  const tests = []
  const re = /\b(?:it|test)(?:\.each\([^)]*\))?\s*\(\s*(['"`])((?:(?!\1).)+)\1\s*,/g
  let match
  while ((match = re.exec(source)) !== null) {
    let depth = 1
    let i = match.index + match[0].length
    while (i < source.length && depth > 0) {
      const ch = source[i]
      if (ch === '(') depth++
      else if (ch === ')') depth--
      i++
    }
    tests.push({ name: match[2], body: source.slice(match.index + match[0].length, i) })
  }
  return tests
}

const ASSERTION = /\b(?:expect(?:\.soft)?|assert|fc\.assert|expect[A-Z]\w*|assert[A-Z]\w*)\s*\(/g
const WEAK_MATCHER = /(?<!\.not)\.(toBeDefined|toBeTruthy)\(\s*\)/

/** True when the test body's only assertion is a bare toBeDefined()/toBeTruthy(). */
export function isWeakSoleAssertion(body) {
  const assertions = body.match(ASSERTION) ?? []
  return assertions.length === 1 && /^expect\s*\($/.test(assertions[0]) && WEAK_MATCHER.test(body)
}

export function findWeakSoleAssertions(files) {
  const findings = []
  for (const file of files) {
    for (const t of extractTests(readFileSync(file, 'utf8'))) {
      if (isWeakSoleAssertion(t.body)) findings.push({ file: relative(root, file), name: t.name })
    }
  }
  return findings
}

/** Count findings per "file > test name" key. */
export function countByKey(findings) {
  const counts = {}
  for (const f of findings) {
    const key = `${f.file} > ${f.name}`
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

/**
 * Compare current findings with the baseline. Returns the keys that are new
 * (more occurrences than the baseline allows) and the keys that are stale
 * (fewer occurrences than recorded: the baseline must shrink).
 */
export function compareWithBaseline(current, baseline) {
  const added = []
  const stale = []
  for (const [key, count] of Object.entries(current)) {
    if (count > (baseline[key] ?? 0)) added.push(key)
  }
  for (const [key, count] of Object.entries(baseline)) {
    if ((current[key] ?? 0) < count) stale.push(key)
  }
  return { added: added.sort(), stale: stale.sort() }
}

const BASELINE = join(root, 'scripts', 'weak-sole-assertions.baseline.json')

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = []
  for (const rel of SCAN_ROOTS) {
    const abs = join(root, rel)
    try {
      statSync(abs)
    } catch {
      continue
    }
    files.push(...walk(abs))
  }
  const current = countByKey(findWeakSoleAssertions(files))

  if (process.argv.includes('--write-baseline')) {
    const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)))
    writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 2)}\n`)
    console.log(`wrote ${Object.keys(sorted).length} baseline entries to ${relative(root, BASELINE)}`)
    process.exit(0)
  }

  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
  const { added, stale } = compareWithBaseline(current, baseline)
  const frozen = Object.values(baseline).reduce((a, b) => a + b, 0)
  console.log(`weak-sole-assertion check: ${files.length} test files scanned, ${frozen} baseline offenders frozen`)
  if (added.length > 0) {
    console.error(`\nFAIL: new test(s) whose only assertion is toBeDefined()/toBeTruthy():`)
    for (const key of added) console.error(`  ${key}`)
    console.error('\nAssert what the value is (toEqual/toBe/toMatchObject), not just that it exists.')
  }
  if (stale.length > 0) {
    console.error(`\nFAIL: baseline entries that no longer occur (delete them from ${relative(root, BASELINE)}):`)
    for (const key of stale) console.error(`  ${key}`)
  }
  if (added.length > 0 || stale.length > 0) process.exit(1)
  console.log('OK: no new weak-sole-assertion tests; baseline is current')
}

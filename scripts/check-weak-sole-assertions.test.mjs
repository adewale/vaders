// Self-test for scripts/check-weak-sole-assertions.mjs (node --test).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareWithBaseline, extractTests, isWeakSoleAssertion } from './check-weak-sole-assertions.mjs'

const weak = (src) => extractTests(src).map((t) => isWeakSoleAssertion(t.body))

test('flags a test whose only assertion is toBeDefined() or toBeTruthy()', () => {
  assert.deepEqual(weak(`it('a', () => { expect(find()).toBeDefined() })`), [true])
  assert.deepEqual(weak(`test("b", () => { expect(ok).toBeTruthy() })`), [true])
  assert.deepEqual(weak('it.each([1])(`c`, (n) => { expect(n).toBeTruthy() })'), [true])
})

test('does not flag precise, negated, multiple or helper assertions', () => {
  assert.deepEqual(weak(`it('a', () => { expect(x).toEqual({ a: 1 }) })`), [false])
  assert.deepEqual(weak(`it('b', () => { expect(x).not.toBeDefined() })`), [false])
  assert.deepEqual(weak(`it('c', () => { expect(x).toBeDefined(); expect(x.kind).toBe('glow') })`), [false])
  assert.deepEqual(weak(`it('d', () => { expect(x).toBeDefined(); expectGlowColour(x, 'red') })`), [false])
  assert.deepEqual(weak(`it('e', () => { fc.assert(fc.property(fc.nat(), (n) => n >= 0)) })`), [false])
})

test('splits each test body separately', () => {
  const src = `
    it('weak', () => { expect(a).toBeTruthy() })
    it('strong', () => { expect(fn(1, (x) => x)).toBe(2) })
  `
  assert.deepEqual(weak(src), [true, false])
})

test('baseline comparison is a shrink-only ratchet', () => {
  assert.deepEqual(compareWithBaseline({ 'f > a': 1 }, { 'f > a': 1 }), { added: [], stale: [] })
  // A new offender fails...
  assert.deepEqual(compareWithBaseline({ 'f > a': 1, 'f > b': 1 }, { 'f > a': 1 }), { added: ['f > b'], stale: [] })
  // ...and so does a fixed one that is still listed, so the baseline shrinks.
  assert.deepEqual(compareWithBaseline({}, { 'f > a': 1 }), { added: [], stale: ['f > a'] })
  // Duplicate test names are counted.
  assert.deepEqual(compareWithBaseline({ 'f > a': 2 }, { 'f > a': 1 }), { added: ['f > a'], stale: [] })
})

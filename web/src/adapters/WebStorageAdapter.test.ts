import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WebStorageAdapter } from './WebStorageAdapter'

/**
 * A simple Map-based fake storage that implements the Storage interface
 * methods we need, without relying on jsdom's localStorage.
 */
function createFakeStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem(key: string): string | null {
      return store.get(key) ?? null
    },
    setItem(key: string, value: string): void {
      store.set(key, value)
    },
    removeItem(key: string): void {
      store.delete(key)
    },
    clear(): void {
      store.clear()
    },
    key(index: number): string | null {
      const keys = Array.from(store.keys())
      return keys[index] ?? null
    },
    get length(): number {
      return store.size
    },
  }
}

describe('WebStorageAdapter', () => {
  let storage: Storage
  let adapter: WebStorageAdapter

  beforeEach(() => {
    storage = createFakeStorage()
    adapter = new WebStorageAdapter(storage)
  })

  it('get() returns null for missing keys', () => {
    expect(adapter.get('nonexistent')).toBeNull()
    expect(adapter.get('')).toBeNull()
    expect(adapter.get('also-missing')).toBeNull()
  })

  it('set() then get() round-trips correctly', () => {
    adapter.set('player-name', 'Alice')
    adapter.set('high-score', '9999')
    adapter.set('settings', '{"muted":true}')

    expect(adapter.get('player-name')).toBe('Alice')
    expect(adapter.get('high-score')).toBe('9999')
    expect(adapter.get('settings')).toBe('{"muted":true}')
  })

  it('set() overwrites previous values', () => {
    adapter.set('name', 'Alice')
    expect(adapter.get('name')).toBe('Alice')

    adapter.set('name', 'Bob')
    expect(adapter.get('name')).toBe('Bob')

    adapter.set('name', 'Charlie')
    expect(adapter.get('name')).toBe('Charlie')
  })

  it('uses the provided storage backend', () => {
    const spy = vi.spyOn(storage, 'getItem')
    adapter.get('test-key')

    expect(spy).toHaveBeenCalledWith('test-key')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveReturnedWith(null)
  })

  it('handles empty string values correctly', () => {
    adapter.set('empty', '')

    expect(adapter.get('empty')).toBe('')
    expect(adapter.get('empty')).not.toBeNull()
    expect(adapter.get('empty')).toHaveLength(0)
  })
})

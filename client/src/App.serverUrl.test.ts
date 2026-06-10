// client/src/App.serverUrl.test.ts
// Tests for server URL resolution.
//
// Bug context: App.tsx defaulted SERVER_URL to 'http://localhost:8787', but the
// launcher bin/vaders.ts defaults to the production URL. Running the client
// directly (not via the launcher) silently targeted a dead localhost. The fix
// makes the in-app default coherent with the launcher's production default,
// while keeping the VADERS_SERVER override intact. Resolution is extracted into
// a pure helper so it can be tested in isolation (correctness by construction).
//
// The helper lives in its own module (./serverUrl) rather than App.tsx because
// App.tsx imports @opentui/react, which is not importable in the test runtime.

import { describe, test, expect } from 'bun:test'
import { resolveServerUrl, PRODUCTION_SERVER_URL } from './serverUrl'

describe('resolveServerUrl', () => {
  test('PRODUCTION_SERVER_URL matches the launcher default (bin/vaders.ts)', () => {
    expect(PRODUCTION_SERVER_URL).toBe('https://vaders.adewale-883.workers.dev')
  })

  test('falls back to the production URL when VADERS_SERVER is unset', () => {
    expect(resolveServerUrl(undefined)).toBe(PRODUCTION_SERVER_URL)
  })

  test('falls back to the production URL when VADERS_SERVER is empty string', () => {
    // An empty env var is effectively "unset" and must not become the URL.
    expect(resolveServerUrl('')).toBe(PRODUCTION_SERVER_URL)
  })

  test('does NOT silently default to localhost', () => {
    expect(resolveServerUrl(undefined)).not.toContain('localhost')
  })

  test('VADERS_SERVER override wins when set', () => {
    expect(resolveServerUrl('http://localhost:8787')).toBe('http://localhost:8787')
    expect(resolveServerUrl('https://example.com')).toBe('https://example.com')
  })
})

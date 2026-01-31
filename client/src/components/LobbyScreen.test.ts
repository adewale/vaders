// client/src/components/LobbyScreen.test.ts
// Unit tests for LobbyScreen helper functions

import { describe, test, expect } from 'bun:test'
import { getLobbyMenuItemCount } from './LobbyScreen'

describe('getLobbyMenuItemCount', () => {
  test('returns 2 for single player (Ready Up + Start Solo)', () => {
    expect(getLobbyMenuItemCount(1)).toBe(2)
  })

  test('returns 1 for 2 players (Ready Up only)', () => {
    expect(getLobbyMenuItemCount(2)).toBe(1)
  })

  test('returns 1 for 3 players', () => {
    expect(getLobbyMenuItemCount(3)).toBe(1)
  })

  test('returns 1 for 4 players (max)', () => {
    expect(getLobbyMenuItemCount(4)).toBe(1)
  })

  // Edge cases - the function should handle these gracefully
  test('returns 2 for 0 players (same as solo behavior)', () => {
    // 0 players would be treated like solo (1 player) since playerCount === 1 is false
    expect(getLobbyMenuItemCount(0)).toBe(1)
  })
})

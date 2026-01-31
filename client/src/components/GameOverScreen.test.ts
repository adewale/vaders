// client/src/components/GameOverScreen.test.ts
// Unit tests for GameOverScreen helper functions

import { describe, test, expect } from 'bun:test'
import { getGameOverMenuItemCount } from './GameOverScreen'

describe('getGameOverMenuItemCount', () => {
  test('returns 3 when both Play Again and Main Menu are available', () => {
    // Play Again + Main Menu + Quit = 3
    expect(getGameOverMenuItemCount(true, true)).toBe(3)
  })

  test('returns 2 when only Play Again is available', () => {
    // Play Again + Quit = 2
    expect(getGameOverMenuItemCount(true, false)).toBe(2)
  })

  test('returns 2 when only Main Menu is available', () => {
    // Main Menu + Quit = 2
    expect(getGameOverMenuItemCount(false, true)).toBe(2)
  })

  test('returns 1 when only Quit is available', () => {
    // Quit only = 1
    expect(getGameOverMenuItemCount(false, false)).toBe(1)
  })
})

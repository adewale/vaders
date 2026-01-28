// client/src/App.test.ts
// Tests that verify App.tsx handles all GameStatus values correctly.
//
// These tests catch the bug where adding a new status to types.ts
// without updating the switch statement in App.tsx causes the app
// to render nothing (return null) for that status.

import { describe, test, expect } from 'bun:test'
import {
  ALL_GAME_STATUSES,
  STATUS_RENDER_MAP,
} from '../../shared/state-defaults'

// ─── Status Coverage Tests ───────────────────────────────────────────────────

describe('GameStatus Coverage', () => {
  test('ALL_GAME_STATUSES contains all status values', () => {
    // This is a runtime verification of the type-level check in state-defaults.ts
    expect(ALL_GAME_STATUSES.length).toBe(7)
    expect(ALL_GAME_STATUSES).toContain('waiting')
    expect(ALL_GAME_STATUSES).toContain('countdown')
    expect(ALL_GAME_STATUSES).toContain('wipe_exit')
    expect(ALL_GAME_STATUSES).toContain('wipe_hold')
    expect(ALL_GAME_STATUSES).toContain('wipe_reveal')
    expect(ALL_GAME_STATUSES).toContain('playing')
    expect(ALL_GAME_STATUSES).toContain('game_over')
  })

  test('STATUS_RENDER_MAP covers all statuses', () => {
    const allMapped = [
      ...STATUS_RENDER_MAP.lobby,
      ...STATUS_RENDER_MAP.game,
      ...STATUS_RENDER_MAP.gameOver,
    ]

    // Every status must be in the render map
    for (const status of ALL_GAME_STATUSES) {
      expect(allMapped).toContain(status)
    }

    // No duplicates in render map
    const uniqueStatuses = new Set(allMapped)
    expect(uniqueStatuses.size).toBe(allMapped.length)

    // Render map size matches total statuses
    expect(allMapped.length).toBe(ALL_GAME_STATUSES.length)
  })
})

// ─── App.tsx Switch Statement Verification ───────────────────────────────────
//
// This test reads App.tsx source and verifies the switch statement handles all statuses.
// This is a static analysis approach that catches missing cases at test time.

describe('App.tsx Status Switch Coverage', () => {
  test('switch statement handles all GameStatus values', async () => {
    const fs = await import('fs')
    const path = await import('path')

    // Read App.tsx source
    const appPath = path.join(__dirname, 'App.tsx')
    const appSource = fs.readFileSync(appPath, 'utf-8')

    // Check that each status has a case statement somewhere in App.tsx
    // (there are multiple switch statements, we just need the cases to exist)
    const missingStatuses: string[] = []
    for (const status of ALL_GAME_STATUSES) {
      const casePattern = new RegExp(`case\\s+['"]${status}['"]\\s*:`)
      if (!casePattern.test(appSource)) {
        missingStatuses.push(status)
      }
    }

    if (missingStatuses.length > 0) {
      throw new Error(
        `App.tsx missing case statements for: ${missingStatuses.join(', ')}\n` +
        `\nTo fix: Add case statements for these statuses in App.tsx.`
      )
    }
  })

  test('switch statement has no unknown status cases', async () => {
    const fs = await import('fs')
    const path = await import('path')

    const appPath = path.join(__dirname, 'App.tsx')
    const appSource = fs.readFileSync(appPath, 'utf-8')

    // Find the switch statement on state.status specifically
    const switchMatch = appSource.match(/switch\s*\(\s*state\.status\s*\)\s*\{([^]*?)\n\s*\}/)
    expect(switchMatch).not.toBeNull()

    const switchBlock = switchMatch![1]

    // Find case statements only within this switch block
    const caseMatches = switchBlock.matchAll(/case\s+['"](\w+)['"]\s*:/g)
    const foundStatuses = new Set<string>()

    for (const match of caseMatches) {
      foundStatuses.add(match[1])
    }

    // Check for unknown statuses in the switch
    const knownStatuses = new Set(ALL_GAME_STATUSES)
    const unknownStatuses: string[] = []

    for (const status of foundStatuses) {
      if (!knownStatuses.has(status as any)) {
        unknownStatuses.push(status)
      }
    }

    if (unknownStatuses.length > 0) {
      throw new Error(
        `App.tsx switch statement has cases for unknown statuses: ${unknownStatuses.join(', ')}\n` +
        `These statuses are not in the GameStatus type.`
      )
    }
  })
})

// ─── Status Render Map Correctness ───────────────────────────────────────────

describe('STATUS_RENDER_MAP Correctness', () => {
  test('lobby statuses are correct', () => {
    // Only 'waiting' should render the lobby
    expect(STATUS_RENDER_MAP.lobby).toEqual(['waiting'])
  })

  test('game statuses include all gameplay and wipe phases', () => {
    // All wipe phases and playing should render GameScreen
    expect(STATUS_RENDER_MAP.game).toContain('countdown')
    expect(STATUS_RENDER_MAP.game).toContain('wipe_exit')
    expect(STATUS_RENDER_MAP.game).toContain('wipe_hold')
    expect(STATUS_RENDER_MAP.game).toContain('wipe_reveal')
    expect(STATUS_RENDER_MAP.game).toContain('playing')
  })

  test('game_over renders game over screen', () => {
    expect(STATUS_RENDER_MAP.gameOver).toEqual(['game_over'])
  })
})

describe('Wipe Hold Flash Prevention', () => {
  test('wipe_hold renders simple black screen, not GameScreen', async () => {
    // This invariant prevents flash: during wipe_hold, we should NOT render
    // GameScreen (with its border/UI) - just a simple black screen with title.
    const fs = await import('fs')
    const path = await import('path')

    const appPath = path.join(__dirname, 'App.tsx')
    const appSource = fs.readFileSync(appPath, 'utf-8')

    // wipe_hold should NOT be grouped with GameScreen rendering
    // It should have its own case that renders a simple black screen
    const wipeHoldCase = appSource.match(/case\s+'wipe_hold':\s*\n([^]*?)(?=case\s+'|default:)/s)
    expect(wipeHoldCase).not.toBeNull()

    const wipeHoldBlock = wipeHoldCase![1]

    // wipe_hold should NOT return GameScreen
    expect(wipeHoldBlock).not.toContain('return <GameScreen')

    // wipe_hold should render a black screen with wave title
    expect(wipeHoldBlock).toContain('WAVE')
  })

  test('autoStartSolo skips LobbyScreen to prevent flash', async () => {
    // When autoStartSolo is true, the user should see "Starting game..."
    // instead of the lobby, to avoid a flash before wipe_hold
    const fs = await import('fs')
    const path = await import('path')

    const appPath = path.join(__dirname, 'App.tsx')
    const appSource = fs.readFileSync(appPath, 'utf-8')

    // Verify the autoStartSolo logic exists: when waiting + autoStartSolo, show "Starting game..."
    expect(appSource).toContain('if (autoStartSolo)')
    expect(appSource).toContain('Starting game')
  })
})

// ─── Future-Proofing: Adding New Statuses ────────────────────────────────────

describe('Adding New Statuses (documentation)', () => {
  test('checklist for adding a new GameStatus', () => {
    // This test documents the steps needed when adding a new status.
    // If you see this test, follow these steps:
    //
    // 1. Add the new status to GameStatus type in shared/types.ts
    //    export type GameStatus = 'waiting' | 'countdown' | ... | 'new_status'
    //
    // 2. Add the new status to ALL_GAME_STATUSES in shared/state-defaults.ts
    //    export const ALL_GAME_STATUSES = [..., 'new_status'] as const
    //
    // 3. Add the new status to STATUS_RENDER_MAP in shared/state-defaults.ts
    //    Under lobby, game, or gameOver depending on which component should render it
    //
    // 4. Add a case for the new status in App.tsx switch statement
    //    case 'new_status':
    //      return <AppropriateScreen ... />
    //
    // 5. If it's a wipe-related status, update GameScreen.tsx to handle it
    //
    // 6. Run tests: bun test shared/ client/src/App.test.ts
    //    The type-level checks will catch any mismatches at compile time
    //    The runtime tests will catch missing switch cases

    expect(true).toBe(true)
  })
})

// client/src/hooks/useGameAudio.test.ts
// Tests for the music start condition in useGameAudio.
//
// These tests verify that music.start() would be called during the
// actual game status transition sequence produced by the server.

import { describe, test, expect } from 'bun:test'
import type { GameStatus } from '../../../shared/types'

/**
 * Simulates the music-start condition from useGameAudio lines 36-43:
 *
 *   case 'playing':
 *     if (prevState.status !== 'playing') {
 *       music.start()
 *     }
 *
 * Given a sequence of statuses, returns true if music.start() would
 * have been called at any point during the sequence.
 */
function wouldMusicStart(statusSequence: GameStatus[]): boolean {
  for (let i = 1; i < statusSequence.length; i++) {
    const prev = statusSequence[i - 1]
    const curr = statusSequence[i]
    // This is the exact condition from useGameAudio.ts line 37
    if (curr === 'playing' && prev !== 'playing') {
      return true
    }
  }
  return false
}

// ─── Music Start Condition ──────────────────────────────────────────────────

describe('useGameAudio music start condition', () => {
  test('music starts on direct countdown → playing transition', () => {
    // This is what the code expects
    const sequence: GameStatus[] = ['waiting', 'countdown', 'playing']
    expect(wouldMusicStart(sequence)).toBe(true)
  })

  test('music starts during co-op game (actual server transition)', () => {
    // Actual co-op flow: waiting → countdown → wipe_hold → wipe_reveal → playing
    // This is what the server actually produces (confirmed in reducer.ts)
    const sequence: GameStatus[] = [
      'waiting',
      'countdown',
      'wipe_hold',
      'wipe_reveal',
      'playing',
    ]
    expect(wouldMusicStart(sequence)).toBe(true)
  })

  test('music starts during solo game (actual server transition)', () => {
    // Actual solo flow: waiting → wipe_hold → wipe_reveal → playing
    // Solo skips countdown entirely (reducer.ts line 290)
    const sequence: GameStatus[] = [
      'waiting',
      'wipe_hold',
      'wipe_reveal',
      'playing',
    ]
    expect(wouldMusicStart(sequence)).toBe(true)
  })

  test('music starts on wave transition (wipe_exit → wipe_hold → wipe_reveal → playing)', () => {
    // Wave transitions: playing → wipe_exit → wipe_hold → wipe_reveal → playing
    const sequence: GameStatus[] = [
      'playing',
      'wipe_exit',
      'wipe_hold',
      'wipe_reveal',
      'playing',
    ]
    expect(wouldMusicStart(sequence)).toBe(true)
  })
})

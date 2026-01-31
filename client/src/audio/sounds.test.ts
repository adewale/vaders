// client/src/audio/sounds.test.ts
// Unit tests for sound definitions - ensures all sounds have consistent configuration

import { describe, test, expect } from 'bun:test'
import { SOUND_FILES, BELL_PATTERNS, type SoundName } from './sounds'

// All valid sound names (extracted from the type)
const ALL_SOUNDS: SoundName[] = [
  'shoot',
  'alien_killed',
  'player_died',
  'wave_complete',
  'game_over',
  'menu_select',
  'menu_navigate',
  'countdown_tick',
  'game_start',
  'ufo',
]

describe('Sound Definitions', () => {
  describe('SOUND_FILES', () => {
    test('every sound name has a file path defined', () => {
      for (const sound of ALL_SOUNDS) {
        expect(SOUND_FILES[sound]).toBeDefined()
        expect(typeof SOUND_FILES[sound]).toBe('string')
      }
    })

    test('all file paths are absolute (start with /)', () => {
      for (const sound of ALL_SOUNDS) {
        expect(SOUND_FILES[sound].startsWith('/')).toBe(true)
      }
    })

    test('all file paths have audio extension (.wav or .mp3)', () => {
      for (const sound of ALL_SOUNDS) {
        const path = SOUND_FILES[sound]
        const hasAudioExtension = path.endsWith('.wav') || path.endsWith('.mp3')
        expect(hasAudioExtension).toBe(true)
      }
    })
  })

  describe('BELL_PATTERNS', () => {
    test('every sound name has a bell pattern defined', () => {
      for (const sound of ALL_SOUNDS) {
        expect(BELL_PATTERNS[sound]).toBeDefined()
        expect(typeof BELL_PATTERNS[sound]).toBe('number')
      }
    })

    test('all bell patterns are positive integers', () => {
      for (const sound of ALL_SOUNDS) {
        expect(BELL_PATTERNS[sound]).toBeGreaterThan(0)
        expect(Number.isInteger(BELL_PATTERNS[sound])).toBe(true)
      }
    })

    test('important sounds have more bell repetitions', () => {
      // player_died and game_over should have more bells to be more noticeable
      expect(BELL_PATTERNS['player_died']).toBeGreaterThan(BELL_PATTERNS['shoot'])
      expect(BELL_PATTERNS['game_over']).toBeGreaterThan(BELL_PATTERNS['shoot'])
    })
  })

  describe('Consistency', () => {
    test('SOUND_FILES and BELL_PATTERNS have the same keys', () => {
      const soundFileKeys = Object.keys(SOUND_FILES).sort()
      const bellPatternKeys = Object.keys(BELL_PATTERNS).sort()
      expect(soundFileKeys).toEqual(bellPatternKeys)
    })
  })
})

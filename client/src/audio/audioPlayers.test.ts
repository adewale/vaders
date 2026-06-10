// client/src/audio/audioPlayers.test.ts
// Tests for the single source of truth that resolves the platform audio player(s)
// actually available at runtime. This module is shared by BOTH the startup probe
// and MusicManager so they can never disagree about which binary plays music.
//
// Bug context: startup probed `aplay` (via getAudioPlayer) but MusicManager
// hardcoded `mpv`. On a Linux box with aplay-but-not-mpv, startup passed yet
// music silently failed. The fix funnels both through resolveMusicPlayer().

import { describe, test, expect } from 'bun:test'
import {
  isPlayerAvailable,
  resolveMusicPlayer,
  MUSIC_PLAYER_CANDIDATES,
  type ResolvedPlayer,
} from './audioPlayers'

// ─── isPlayerAvailable (shared `which` check) ────────────────────────────────

describe('isPlayerAvailable', () => {
  test('returns true for a known binary (echo)', () => {
    expect(isPlayerAvailable('echo')).toBe(true)
  })

  test('returns false for a nonexistent binary', () => {
    expect(isPlayerAvailable('__nonexistent_player_xyz_9999__')).toBe(false)
  })

  test('returns false for empty string', () => {
    expect(isPlayerAvailable('')).toBe(false)
  })
})

// ─── Candidate table ─────────────────────────────────────────────────────────

describe('MUSIC_PLAYER_CANDIDATES', () => {
  test('provides a non-empty candidate list for darwin and linux', () => {
    expect(MUSIC_PLAYER_CANDIDATES.darwin.length).toBeGreaterThan(0)
    expect(MUSIC_PLAYER_CANDIDATES.linux.length).toBeGreaterThan(0)
  })

  test('macOS candidates start with afplay', () => {
    expect(MUSIC_PLAYER_CANDIDATES.darwin[0].player).toBe('afplay')
  })

  test('every candidate carries the args used to play an mp3', () => {
    for (const list of Object.values(MUSIC_PLAYER_CANDIDATES)) {
      for (const c of list) {
        expect(typeof c.player).toBe('string')
        expect(c.player.length).toBeGreaterThan(0)
        expect(Array.isArray(c.args)).toBe(true)
      }
    }
  })
})

// ─── resolveMusicPlayer: present → used ──────────────────────────────────────

describe('resolveMusicPlayer (present → used)', () => {
  test('returns the first candidate whose binary is present in PATH', () => {
    // Inject a candidate list whose first entry is missing and second is present.
    const candidates: ResolvedPlayer[] = [
      { player: '__nope_aaa__', args: ['x'] },
      { player: 'echo', args: ['--played'] },
    ]
    const resolved = resolveMusicPlayer(candidates)
    expect(resolved).not.toBeNull()
    expect(resolved!.player).toBe('echo')
    expect(resolved!.args).toEqual(['--played'])
  })

  test('prefers the earliest available candidate (ordering is honored)', () => {
    const candidates: ResolvedPlayer[] = [
      { player: 'echo', args: ['first'] },
      { player: 'echo', args: ['second'] },
    ]
    const resolved = resolveMusicPlayer(candidates)
    expect(resolved!.args).toEqual(['first'])
  })
})

// ─── resolveMusicPlayer: absent → fallback / degrade ─────────────────────────

describe('resolveMusicPlayer (absent → fallback / degrade)', () => {
  test('falls back past a missing preferred binary to an available one', () => {
    // Models the real bug: preferred player (mpv) missing, fallback present.
    const candidates: ResolvedPlayer[] = [
      { player: '__missing_mpv__', args: ['--no-video'] },
      { player: '__missing_ffplay__', args: ['-nodisp'] },
      { player: 'echo', args: ['fallback'] },
    ]
    const resolved = resolveMusicPlayer(candidates)
    expect(resolved!.player).toBe('echo')
  })

  test('returns null when NONE of the candidates exist (graceful no-op)', () => {
    const candidates: ResolvedPlayer[] = [
      { player: '__missing_a__', args: [] },
      { player: '__missing_b__', args: [] },
    ]
    expect(resolveMusicPlayer(candidates)).toBeNull()
  })

  test('default (no arg) resolution returns null or a present binary, never a phantom', () => {
    // Whatever it resolves to on THIS machine must actually be present.
    const resolved = resolveMusicPlayer()
    if (resolved !== null) {
      expect(isPlayerAvailable(resolved.player)).toBe(true)
    } else {
      // Null is acceptable (no player installed); that's the graceful path.
      expect(resolved).toBeNull()
    }
  })
})

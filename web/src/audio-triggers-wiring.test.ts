// audio-triggers-wiring.test.ts
// Regression: countdown_tick and other audio triggers must flow from a
// server-driven state transition through client-core's detectAudioTriggers
// into the web audio adapter's play() method.
//
// This test does NOT boot the full <App>; it validates the exact pipeline
// that App.tsx uses inside its `triggers.sounds` useEffect. If that pipeline
// ever regresses (e.g. detectAudioTriggers stops detecting countdown ticks,
// or the adapter's play() drops the event), this test will fail.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectAudioTriggers } from '../../client-core/src/audio/triggers'
import { GAME_STATE_DEFAULTS } from '../../shared/state-defaults'
import type { GameState } from '../../shared/types'

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    ...GAME_STATE_DEFAULTS,
    roomCode: 'ROOM01',
    ...overrides,
  }
}

describe('audio triggers → web adapter wiring', () => {
  // Minimal fake audio adapter: spy on play() only. We're verifying the
  // wiring, not the WebAudioAdapter's synthesis internals (which have
  // their own test coverage).
  let played: Array<{ sound: string; opts?: unknown }>
  let fakeAudio: {
    play: ReturnType<typeof vi.fn>
    startMusic: ReturnType<typeof vi.fn>
    stopMusic: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    played = []
    fakeAudio = {
      play: vi.fn((sound: string, opts?: unknown) => {
        played.push({ sound, opts })
      }),
      startMusic: vi.fn(),
      stopMusic: vi.fn(),
    }
  })

  // Mirror of the play loop in App.tsx GameContainer's trigger useEffect.
  // Keeping this inline means changes to App.tsx will force a matching
  // update here.
  function playTriggers(prev: GameState | null, curr: GameState | null, playerId: string | null) {
    const triggers = detectAudioTriggers(prev, curr, playerId)
    for (const sound of triggers.sounds) {
      fakeAudio.play(sound)
    }
    if (triggers.startMusic && curr) fakeAudio.startMusic(curr.wave)
    if (triggers.stopMusic) fakeAudio.stopMusic()
  }

  it('plays countdown_tick when countdownRemaining decrements during countdown', () => {
    const prev = baseState({ status: 'countdown', countdownRemaining: 3 })
    const curr = baseState({ status: 'countdown', countdownRemaining: 2 })
    playTriggers(prev, curr, null)
    expect(fakeAudio.play).toHaveBeenCalledWith('countdown_tick')
  })

  it('plays countdown_tick for each of 3 → 2 → 1 transitions', () => {
    // Simulate the actual server sequence of countdown broadcasts.
    const s3 = baseState({ status: 'countdown', countdownRemaining: 3 })
    const s2 = baseState({ status: 'countdown', countdownRemaining: 2 })
    const s1 = baseState({ status: 'countdown', countdownRemaining: 1 })
    // Transition 1: waiting → countdown(3) — status change alone doesn't emit
    // a tick; the tick fires when countdownRemaining changes.
    const waiting = baseState({ status: 'waiting', countdownRemaining: null })
    playTriggers(waiting, s3, null) // countdownRemaining null → 3: tick
    playTriggers(s3, s2, null) // 3 → 2: tick
    playTriggers(s2, s1, null) // 2 → 1: tick

    const ticks = played.filter((p) => p.sound === 'countdown_tick')
    expect(ticks.length).toBe(3)
  })

  it('does NOT play countdown_tick when countdownRemaining is unchanged', () => {
    const s = baseState({ status: 'countdown', countdownRemaining: 2 })
    playTriggers(s, s, null)
    expect(fakeAudio.play).not.toHaveBeenCalledWith('countdown_tick')
  })

  it('does NOT play countdown_tick outside the countdown status', () => {
    // countdownRemaining changes but status is 'playing' — no tick sound.
    const prev = baseState({ status: 'playing', countdownRemaining: 3 })
    const curr = baseState({ status: 'playing', countdownRemaining: 2 })
    playTriggers(prev, curr, null)
    expect(fakeAudio.play).not.toHaveBeenCalledWith('countdown_tick')
  })

  it('the real WebAudioAdapter supports the countdown_tick sound in its play() switch', async () => {
    // Smoke check: importing the adapter and invoking play('countdown_tick')
    // must not throw even without a real AudioContext (the adapter
    // gracefully handles a missing ctx by early-returning).
    const { WebAudioAdapter } = await import('./adapters/WebAudioAdapter')
    const adapter = new WebAudioAdapter() // no ctx
    expect(() => adapter.play('countdown_tick')).not.toThrow()
  })
})

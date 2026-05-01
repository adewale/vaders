// client/src/hooks/useGameAudio.ts
// Hook to detect game state changes and trigger appropriate sounds

import { useRef, useEffect } from 'react'
import { AudioManager } from '../audio/AudioManager'
import { MusicManager } from '../audio/MusicManager'
import { detectAudioTriggers } from '../../../client-core/src/audio/triggers'
import type { GameState } from '../../../shared/types'

/**
 * Hook that monitors game state changes and triggers audio effects
 *
 * @param currentState - Current game state
 * @param playerId - Current player's ID (for player-specific sounds)
 */
export function useGameAudio(currentState: GameState | null, playerId: string | null): void {
  const prevStateRef = useRef<GameState | null>(null)
  const audio = AudioManager.getInstance()
  const music = MusicManager.getInstance()

  useEffect(() => {
    const prevState = prevStateRef.current
    prevStateRef.current = currentState

    const { sounds, startMusic, stopMusic } = detectAudioTriggers(prevState, currentState, playerId)

    // Play all triggered sounds
    for (const sound of sounds) {
      audio.play(sound)
    }

    // Control music playback
    // music.start() is idempotent - calling it when already playing is a no-op
    if (startMusic) {
      music.start()
    }
    if (stopMusic) {
      music.stop()
    }
  }, [currentState, playerId, audio, music])

  // Cleanup: stop music when component unmounts
  useEffect(() => {
    return () => {
      music.stop()
    }
  }, [music])
}

/**
 * Play a shoot sound (call from input handler)
 */
export function playShootSound(): void {
  AudioManager.getInstance().play('shoot')
}

/**
 * Play menu navigation sound
 */
export function playMenuNavigateSound(): void {
  AudioManager.getInstance().play('menu_navigate')
}

/**
 * Play menu select sound
 */
export function playMenuSelectSound(): void {
  AudioManager.getInstance().play('menu_select')
}

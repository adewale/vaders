// client/src/hooks/useGameAudio.ts
// Hook to detect game state changes and trigger appropriate sounds

import { useRef, useEffect } from 'react'
import { AudioManager } from '../audio/AudioManager'
import { MusicManager } from '../audio/MusicManager'
import type { GameState } from '../../../shared/types'

/**
 * Hook that monitors game state changes and triggers audio effects
 *
 * @param currentState - Current game state
 * @param playerId - Current player's ID (for player-specific sounds)
 */
export function useGameAudio(
  currentState: GameState | null,
  playerId: string | null
): void {
  const prevStateRef = useRef<GameState | null>(null)
  const audio = AudioManager.getInstance()
  const music = MusicManager.getInstance()

  useEffect(() => {
    const prevState = prevStateRef.current
    prevStateRef.current = currentState

    if (!currentState) return
    if (!prevState) return  // Skip first render

    // Status transitions
    if (prevState.status !== currentState.status) {
      switch (currentState.status) {
        case 'countdown':
          // Countdown start - tick sound handled by countdown_tick event
          break
        case 'playing':
          if (prevState.status !== 'playing') {
            // Start background music on any transition into playing
            // (wipe_reveal → playing for both game start and wave transitions)
            music.start()
            if (currentState.wave === 1) {
              audio.play('game_start')
            }
          }
          break
        case 'game_over':
          audio.play('game_over')
          // Stop background music on game over
          music.stop()
          break
      }
    }

    // Countdown tick (3, 2, 1)
    if (
      currentState.status === 'countdown' &&
      currentState.countdownRemaining !== null &&
      prevState.countdownRemaining !== currentState.countdownRemaining
    ) {
      audio.play('countdown_tick')
    }

    // Score increase (implies alien kill)
    if (currentState.score > prevState.score) {
      audio.play('alien_killed')
    }

    // Wave change
    if (currentState.wave > prevState.wave && prevState.wave > 0) {
      audio.play('wave_complete')
    }

    // Player death detection
    if (playerId) {
      const prevPlayer = prevState.players[playerId]
      const currentPlayer = currentState.players[playerId]
      if (prevPlayer?.alive && !currentPlayer?.alive) {
        audio.play('player_died')
      }
    }

    // UFO spawn detection
    const prevUFOs = prevState.entities.filter(e => e.kind === 'ufo')
    const currentUFOs = currentState.entities.filter(e => e.kind === 'ufo')
    if (currentUFOs.length > prevUFOs.length) {
      audio.play('ufo')
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

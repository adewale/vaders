// client-core/src/audio/triggers.ts
// Platform-agnostic audio trigger detection
// Determines which sounds to play based on game state transitions

import type { GameState } from '../../../shared/types'

export type SoundEvent =
  | 'shoot'
  | 'alien_killed'
  | 'player_died'
  | 'wave_complete'
  | 'game_over'
  | 'game_start'
  | 'countdown_tick'
  | 'ufo'
  | 'menu_navigate'
  | 'menu_select'

export interface AudioTriggerResult {
  sounds: SoundEvent[]
  startMusic: boolean
  stopMusic: boolean
}

/**
 * Detect which audio events should fire based on a game state transition.
 *
 * Pure function: no side effects, no singletons. The caller is responsible
 * for actually playing the sounds and controlling music playback.
 *
 * @param prevState - Previous game state (null on first render)
 * @param currentState - Current game state (null if disconnected)
 * @param playerId - Current player's ID (for player-specific sounds like death)
 * @returns List of sounds to play, plus music start/stop flags
 */
export function detectAudioTriggers(
  prevState: GameState | null,
  currentState: GameState | null,
  playerId: string | null,
): AudioTriggerResult {
  const result: AudioTriggerResult = {
    sounds: [],
    startMusic: false,
    stopMusic: false,
  }

  if (!currentState) return result
  if (!prevState) return result // Skip first render

  // Status transitions
  if (prevState.status !== currentState.status) {
    switch (currentState.status) {
      case 'countdown':
        // Countdown start - tick sound handled by countdown_tick below
        break
      case 'playing':
        if (prevState.status !== 'playing') {
          // Start background music on any transition into playing
          // (wipe_reveal -> playing for both game start and wave transitions).
          result.startMusic = true
          if (currentState.wave === 1) {
            result.sounds.push('game_start')
          }
        }
        break
      case 'game_over':
        result.sounds.push('game_over')
        // Stop background music on game over
        result.stopMusic = true
        break
    }
  }

  // Countdown tick (3, 2, 1)
  if (
    currentState.status === 'countdown' &&
    currentState.countdownRemaining !== null &&
    prevState.countdownRemaining !== currentState.countdownRemaining
  ) {
    result.sounds.push('countdown_tick')
  }

  // Score increase (implies alien kill)
  if (currentState.score > prevState.score) {
    result.sounds.push('alien_killed')
  }

  // Wave change
  if (currentState.wave > prevState.wave && prevState.wave > 0) {
    result.sounds.push('wave_complete')
  }

  // Player death detection
  if (playerId) {
    const prevPlayer = prevState.players[playerId]
    const currentPlayer = currentState.players[playerId]
    if (prevPlayer?.alive && !currentPlayer?.alive) {
      result.sounds.push('player_died')
    }
  }

  // UFO spawn detection
  const prevUFOs = prevState.entities.filter((e) => e.kind === 'ufo')
  const currentUFOs = currentState.entities.filter((e) => e.kind === 'ufo')
  if (currentUFOs.length > prevUFOs.length) {
    result.sounds.push('ufo')
  }

  return result
}

// client-core/src/adapters.ts
// Platform adapter interfaces that each frontend (TUI, web) must implement

import type { PlayerSlot } from '../../shared/types'

/** Normalized key names used throughout the game */
export type VadersKey =
  | 'left'
  | 'right'
  | 'shoot'
  | 'enter'
  | 'escape'
  | 'quit'
  | 'mute'
  | 'solo'
  | 'ready'
  | 'forfeit'
  | '1'
  | '2'
  | '3'
  | '4'

/** Subscribe to normalized key events */
export interface InputAdapter {
  onKey(callback: (key: VadersKey, type: 'down' | 'up') => void): () => void
  /** Whether the platform supports held-key detection natively */
  supportsKeyRelease: boolean
}

/** Platform audio playback */
export interface AudioAdapter {
  play(sound: SoundEvent): void
  startMusic(): void
  stopMusic(): void
  setMuted(muted: boolean): void
}

/** Sound events that can be triggered by game state changes */
export type SoundEvent =
  | 'shoot'
  | 'alien_killed'
  | 'player_died'
  | 'wave_complete'
  | 'game_over_victory'
  | 'game_over_defeat'
  | 'ufo_spawn'
  | 'countdown_tick'

/** Key-value storage (localStorage in web, file-based in TUI) */
export interface StorageAdapter {
  get(key: string): string | null
  set(key: string, value: string): void
}

/** Frame scheduling for render loops */
export interface FrameScheduler {
  /** Schedule a callback for the next render frame. Returns a cancel handle. */
  requestFrame(callback: () => void): number
  cancelFrame(handle: number): void
}

/** Platform-specific visual configuration */
export interface VisualConfig {
  /** Whether the platform supports braille Unicode characters */
  supportsBraille: boolean
  /** Get the display color for a player slot */
  getPlayerColor(slot: PlayerSlot): string
  /** Get sprite visual data for a given entity type */
  getSpriteData(entityType: string): unknown
}

// client/src/audio/AudioManager.ts
// Singleton audio controller using afplay (macOS) for sound effects

import { spawn } from 'bun'
import { existsSync } from 'fs'
import { getUserConfig, setUserConfig } from '../config/userConfig'
import { type SoundName, SOUND_FILES, BELL_PATTERNS } from './sounds'

// Debounce cooldown per sound type (ms)
const DEBOUNCE_MS = 50

/**
 * AudioManager - Singleton audio controller
 * Plays WAV/MP3 files via afplay (macOS) or aplay (Linux)
 * Falls back to terminal bell if sound files don't exist
 */
class AudioManager {
  private static instance: AudioManager
  private muted: boolean
  private lastPlayTime: Map<SoundName, number> = new Map()
  private player: string

  private constructor() {
    // Load mute state from config
    this.muted = getUserConfig().audioMuted

    // Detect platform audio player
    this.player = process.platform === 'darwin' ? 'afplay' : 'aplay'
  }

  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager()
    }
    return AudioManager.instance
  }

  /**
   * Play a sound effect
   */
  play(sound: SoundName): void {
    if (this.muted) return

    // Debounce: prevent sound spam
    const now = Date.now()
    const lastTime = this.lastPlayTime.get(sound) ?? 0
    if (now - lastTime < DEBOUNCE_MS) return
    this.lastPlayTime.set(sound, now)

    const soundPath = SOUND_FILES[sound]

    // Try to play sound file if it exists
    if (existsSync(soundPath)) {
      this.playFile(soundPath)
    } else {
      // Fall back to terminal bell
      this.playBell(sound)
    }
  }

  /**
   * Play a sound file using system audio player
   */
  private playFile(path: string): void {
    try {
      // Spawn afplay/aplay in background (fire and forget)
      spawn({
        cmd: [this.player, path],
        stdout: 'ignore',
        stderr: 'ignore',
      })
    } catch {
      // Silently fail - audio is not critical
    }
  }

  /**
   * Play terminal bell pattern (fallback)
   */
  private playBell(sound: SoundName): void {
    const count = BELL_PATTERNS[sound]
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        process.stdout.write('\x07')
      }, i * 100)
    }
  }

  /**
   * Toggle mute state and persist to config
   * Note: Music is controlled separately via MusicManager
   * @returns New mute state
   */
  toggleMute(): boolean {
    this.muted = !this.muted
    setUserConfig({ audioMuted: this.muted })
    return this.muted
  }

  /**
   * Get current mute state
   */
  isMuted(): boolean {
    return this.muted
  }

  /**
   * Set mute state directly
   */
  setMuted(muted: boolean): void {
    this.muted = muted
    setUserConfig({ audioMuted: this.muted })
  }
}

export { AudioManager }
export type { SoundName }

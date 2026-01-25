// client/src/audio/MusicManager.ts
// Background music manager with looping support

import { spawn, type Subprocess } from 'bun'
import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { getUserConfig, setUserConfig } from '../config/userConfig'

// Get the directory of this file (works in both Bun and Node ESM)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const MUSIC_PATH = join(__dirname, '../../sounds/background-music.mp3')

/**
 * MusicManager - Handles background music playback with looping
 * Uses system audio player (afplay on macOS, mpv/aplay on Linux)
 */
class MusicManager {
  private static instance: MusicManager
  private process: Subprocess | null = null
  private muted: boolean
  private isPlaying = false
  private shouldLoop = true

  private constructor() {
    this.muted = getUserConfig().musicMuted

    // Ensure music stops when process exits
    process.on('exit', () => this.stop())
    process.on('SIGINT', () => this.stop())
    process.on('SIGTERM', () => this.stop())
    process.on('beforeExit', () => this.stop())
  }

  static getInstance(): MusicManager {
    if (!MusicManager.instance) {
      MusicManager.instance = new MusicManager()
    }
    return MusicManager.instance
  }

  /**
   * Start playing background music (loops continuously)
   */
  async start(): Promise<void> {
    if (this.isPlaying || this.muted) return
    if (!existsSync(MUSIC_PATH)) {
      console.error('Music file not found:', MUSIC_PATH)
      return
    }

    this.isPlaying = true
    this.shouldLoop = true
    this.playLoop()
  }

  private async playLoop(): Promise<void> {
    while (this.shouldLoop && this.isPlaying && !this.muted) {
      try {
        // Use afplay on macOS, mpv or aplay on Linux
        const player = process.platform === 'darwin' ? 'afplay' : 'mpv'
        const args = process.platform === 'darwin'
          ? [MUSIC_PATH]
          : ['--no-video', '--really-quiet', MUSIC_PATH]

        this.process = spawn({
          cmd: [player, ...args],
          stdout: 'ignore',
          stderr: 'ignore',
        })

        // Wait for playback to complete
        await this.process.exited

        // Small delay before looping
        if (this.shouldLoop && this.isPlaying) {
          await new Promise(r => setTimeout(r, 100))
        }
      } catch (err) {
        // Player not available or error, stop trying
        console.error('Music playback error:', err)
        break
      }
    }
    this.isPlaying = false
  }

  /**
   * Stop background music
   */
  stop(): void {
    this.shouldLoop = false
    this.isPlaying = false
    if (this.process) {
      try {
        this.process.kill()
      } catch {
        // Process may have already exited
      }
      this.process = null
    }
  }

  /**
   * Set mute state and persist to config
   */
  setMuted(muted: boolean): void {
    this.muted = muted
    setUserConfig({ musicMuted: muted })
    if (muted) {
      this.stop()
    }
  }

  /**
   * Toggle mute state and persist to config
   * @returns New mute state
   */
  toggleMute(): boolean {
    this.muted = !this.muted
    setUserConfig({ musicMuted: this.muted })
    if (this.muted) {
      this.stop()
    }
    return this.muted
  }

  /**
   * Get current mute state
   */
  isMuted(): boolean {
    return this.muted
  }

  /**
   * Check if music is currently playing
   */
  isCurrentlyPlaying(): boolean {
    return this.isPlaying && !this.muted
  }
}

export { MusicManager }

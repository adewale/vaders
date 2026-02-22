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
  private stopping = false
  private lastError_: string | null = null

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
      this.lastError_ = 'Music file not found'
      return
    }

    // Pre-flight: verify audio player binary exists
    const player = process.platform === 'darwin' ? 'afplay' : 'mpv'
    if (!MusicManager.isPlayerAvailable(player)) {
      this.lastError_ = `Audio player not found: ${player}`
      return
    }

    this.lastError_ = null
    this.stopping = false
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
          stderr: 'pipe',
        })

        // Wait for playback to complete
        const exitCode = await this.process.exited

        // Non-zero exit code means playback failed (unless we intentionally stopped)
        if (exitCode !== 0 && !this.stopping) {
          this.lastError_ = `${player} exited with code ${exitCode}`
          break
        }

        // Small delay before looping
        if (this.shouldLoop && this.isPlaying) {
          await new Promise(r => setTimeout(r, 100))
        }
      } catch (err) {
        this.lastError_ = `Music playback failed: ${err instanceof Error ? err.message : String(err)}`
        break
      }
    }
    this.isPlaying = false
  }

  /**
   * Stop background music
   */
  stop(): void {
    this.stopping = true
    this.shouldLoop = false
    this.isPlaying = false
    this.lastError_ = null
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

  /**
   * Get the last error that occurred during playback, or null if none.
   */
  getLastError(): string | null {
    return this.lastError_
  }

  /**
   * Check if an error has occurred.
   */
  hasError(): boolean {
    return this.lastError_ !== null
  }

  /**
   * Check whether an audio player binary is available on the system.
   * Uses `which` to verify the binary exists in PATH.
   * @param player - Binary name to check, defaults to platform default (afplay/mpv)
   */
  static isPlayerAvailable(player?: string): boolean {
    const cmd = player ?? (process.platform === 'darwin' ? 'afplay' : 'mpv')
    try {
      const result = Bun.spawnSync({ cmd: ['which', cmd] })
      return result.exitCode === 0
    } catch {
      return false
    }
  }
}

export { MusicManager }

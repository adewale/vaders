// client/src/audio/MusicManager.ts
// Background music manager with looping support

import { spawn, type Subprocess } from 'bun'
import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { getUserConfig, setUserConfig } from '../config/userConfig'
import { resolveMusicPlayer, isPlayerAvailable } from './audioPlayers'

// Get the directory of this file (works in both Bun and Node ESM)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const MUSIC_PATH = join(__dirname, '../../sounds/background-music.mp3')

/**
 * MusicManager - Handles background music playback with looping
 * Resolves the platform audio player via resolveMusicPlayer() (the same source
 * of truth the startup check uses), so detection and playback never disagree.
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

    // Pre-flight: resolve an audio player that is ACTUALLY present on this
    // system (same resolver the startup check uses). If none exist, degrade
    // gracefully — set an error and no-op, exactly as SFX fall back to the bell.
    const resolved = resolveMusicPlayer()
    if (!resolved) {
      this.lastError_ = 'Audio player not found for background music (tried mpv/ffplay/...)'
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
        // Resolve the player+args from the shared source of truth every loop
        // (cheap, and tolerant of a player being installed/removed mid-session).
        const resolved = resolveMusicPlayer()
        if (!resolved) {
          this.lastError_ = 'Audio player not found for background music (tried mpv/ffplay/...)'
          break
        }
        const { player, args } = resolved

        this.process = spawn({
          cmd: [player, ...args, MUSIC_PATH],
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
          await new Promise((r) => setTimeout(r, 100))
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
   * Delegates to the shared isPlayerAvailable so detection logic lives in one
   * place. When no binary is given, reports whether ANY music player resolves.
   * @param player - Binary name to check; defaults to "any resolvable player".
   */
  static isPlayerAvailable(player?: string): boolean {
    if (player !== undefined) {
      return isPlayerAvailable(player)
    }
    return resolveMusicPlayer() !== null
  }
}

export { MusicManager }

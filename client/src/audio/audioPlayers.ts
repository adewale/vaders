// client/src/audio/audioPlayers.ts
// Single source of truth for resolving the platform audio player used to play
// BACKGROUND MUSIC (mp3). Both the startup probe (startup.ts) and the runtime
// player (MusicManager.ts) resolve through here so they can never disagree
// about which binary will actually play music.
//
// Why this exists: previously startup probed the SFX player (`aplay` on Linux,
// from terminal/getAudioPlayer) while MusicManager hardcoded `mpv`. On a Linux
// box that had `aplay` but not `mpv`, startup reported "music available" yet
// playback silently failed. Funnelling both paths through one resolver makes
// that class of mismatch structurally impossible.

import { spawnSync } from 'bun'

/** A music player binary plus the args needed to play an mp3 file with it. */
export interface ResolvedPlayer {
  player: string
  args: string[]
}

/**
 * Check whether a binary is available on PATH.
 * Shared by both the startup probe and MusicManager so they use one impl.
 */
export function isPlayerAvailable(player: string): boolean {
  if (!player) return false
  try {
    const result = spawnSync({ cmd: ['which', player], stdout: 'ignore', stderr: 'ignore' })
    return result.exitCode === 0
  } catch {
    return false
  }
}

/**
 * Candidate music players per platform, in preference order.
 *
 * Ordering rationale (Linux): list mp3-capable players first. `aplay` is kept
 * last as a best-effort entry — it only decodes WAV, but if it is the only
 * thing installed we still resolve to *something present* rather than a phantom
 * binary, and MusicManager surfaces any playback error via getLastError().
 *
 * The args are tuned to keep playback quiet/headless (no video window, no
 * verbose logging) where the player supports it.
 */
export const MUSIC_PLAYER_CANDIDATES: Record<'darwin' | 'linux', ResolvedPlayer[]> = {
  darwin: [{ player: 'afplay', args: [] }],
  linux: [
    { player: 'mpv', args: ['--no-video', '--really-quiet'] },
    { player: 'ffplay', args: ['-nodisp', '-autoexit', '-loglevel', 'quiet'] },
    { player: 'mpg123', args: ['-q'] },
    { player: 'cvlc', args: ['--play-and-exit', '--quiet'] },
    { player: 'paplay', args: [] },
    { player: 'aplay', args: ['-q'] },
  ],
}

/**
 * Get the ordered candidate list for the current platform.
 * Returns an empty list on unsupported platforms (e.g. Windows).
 */
export function getMusicPlayerCandidates(): ResolvedPlayer[] {
  if (process.platform === 'darwin') return MUSIC_PLAYER_CANDIDATES.darwin
  if (process.platform === 'linux') return MUSIC_PLAYER_CANDIDATES.linux
  return []
}

/**
 * Resolve the music player to actually use: the first candidate whose binary is
 * present on PATH. Returns null when none are installed (graceful no-op / the
 * "degrade" path, mirroring how SFX fall back to the terminal bell).
 *
 * @param candidates - candidate list to resolve against. Defaults to the
 *   current platform's list; injectable for testing.
 */
export function resolveMusicPlayer(
  candidates: ResolvedPlayer[] = getMusicPlayerCandidates(),
): ResolvedPlayer | null {
  for (const candidate of candidates) {
    if (isPlayerAvailable(candidate.player)) {
      return candidate
    }
  }
  return null
}

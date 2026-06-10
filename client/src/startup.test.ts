// client/src/startup.test.ts
// Verifies the startup audio probe and the music subsystem agree on which
// binary plays background music — a single source of truth.
//
// Bug context: startup probed the SFX player (`aplay` on Linux via
// getAudioPlayer) while MusicManager hardcoded `mpv`. Startup could report
// "music available" while the binary music actually uses (mpv) was absent.
// The fix routes both through resolveMusicPlayer().

import { describe, test, expect } from 'bun:test'
import { resolveMusicPlayer, isPlayerAvailable } from './audio/audioPlayers'
import { runStartupChecks } from './startup'

describe('startup music check uses the shared music-player resolver', () => {
  test('reports musicAvailable=true only if the resolved music player is actually present', async () => {
    const report = await runStartupChecks()
    const resolved = resolveMusicPlayer()

    // The contract: startup must not claim music is available unless the
    // binary music will actually use is present on this machine.
    if (report.musicAvailable) {
      expect(resolved).not.toBeNull()
      expect(isPlayerAvailable(resolved!.player)).toBe(true)
    }
  })

  test('musicAvailable is false when no music player binary exists', async () => {
    const report = await runStartupChecks()
    const resolved = resolveMusicPlayer()
    if (resolved === null) {
      // No usable player → must not advertise music as available.
      expect(report.musicAvailable).toBe(false)
    }
  })

  test('report includes a dedicated Music Player check naming the resolved binary (or "none")', async () => {
    const report = await runStartupChecks()
    const musicPlayerCheck = report.checks.find((c) => c.name === 'Music Player')
    expect(musicPlayerCheck).toBeDefined()

    const resolved = resolveMusicPlayer()
    // passed reflects presence; message names the binary so the two can't drift.
    expect(musicPlayerCheck!.passed).toBe(resolved !== null)
    if (resolved !== null) {
      expect(musicPlayerCheck!.message).toContain(resolved.player)
    }
  })
})

// client/src/startup.ts
// Startup verification for audio, terminal, and system capabilities

import { spawn } from 'bun'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  getTerminalCapabilities,
  getTerminalDisplayNameCached,
  getColorDepth,
  getTerminalQuirks,
  getAudioPlayer,
  getTerminalRecommendation,
  shouldShowTerminalRecommendation,
} from './terminal'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

interface StartupCheckResult {
  name: string
  passed: boolean
  message: string
}

interface StartupReport {
  checks: StartupCheckResult[]
  allPassed: boolean
  audioAvailable: boolean
  musicAvailable: boolean
}

/**
 * Run all startup verification checks
 */
export async function runStartupChecks(): Promise<StartupReport> {
  const checks: StartupCheckResult[] = []
  const termCaps = getTerminalCapabilities()

  // Check 1: Terminal detection
  const terminalName = getTerminalDisplayNameCached()
  const colorDepth = getColorDepth(termCaps)
  checks.push({
    name: 'Terminal',
    passed: true, // Informational
    message: `${terminalName} (${colorDepth} color)`,
  })

  // Check 2: Terminal size
  const cols = process.stdout.columns || 80
  const rows = process.stdout.rows || 24
  checks.push({
    name: 'Terminal Size',
    passed: cols >= 120 && rows >= 36,
    message: cols >= 120 && rows >= 36
      ? `${cols}x${rows} (OK)`
      : `${cols}x${rows} (need 120x36)`,
  })

  // Check 3: Unicode support
  checks.push({
    name: 'Unicode',
    passed: termCaps.supportsUnicode,
    message: termCaps.supportsUnicode ? 'Enabled' : 'ASCII mode (set LANG=en_US.UTF-8)',
  })

  // Check 4: Keyboard protocol
  checks.push({
    name: 'Keyboard',
    passed: termCaps.supportsKittyKeyboard,
    message: termCaps.supportsKittyKeyboard
      ? 'Kitty protocol (key release events)'
      : 'Standard (timeout-based release)',
  })

  // Check 4b: True color support
  checks.push({
    name: 'Colors',
    passed: termCaps.supportsTrueColor,
    message: termCaps.supportsTrueColor
      ? '24-bit true color'
      : '256-color mode (colors may look different)',
  })

  // Check 5: Audio player available
  const audioPlayer = getAudioPlayer()
  let audioPlayerAvailable = false
  try {
    const which = spawn({ cmd: ['which', audioPlayer], stdout: 'pipe', stderr: 'pipe' })
    await which.exited
    audioPlayerAvailable = which.exitCode === 0
  } catch {
    audioPlayerAvailable = false
  }
  checks.push({
    name: 'Audio Player',
    passed: audioPlayerAvailable,
    message: audioPlayerAvailable ? `${audioPlayer} found` : `${audioPlayer} not found`,
  })

  // Check 6: Sound effects files exist
  const soundsDir = join(__dirname, '../sounds')
  const requiredSounds = ['shoot.wav', 'alien_killed.wav', 'game_start.wav', 'game_over.wav']
  const missingSounds = requiredSounds.filter(s => !existsSync(join(soundsDir, s)))
  checks.push({
    name: 'Sound Effects',
    passed: missingSounds.length === 0,
    message: missingSounds.length === 0
      ? `${requiredSounds.length} files found`
      : `Missing: ${missingSounds.join(', ')}`,
  })

  // Check 7: Background music file exists
  const musicPath = join(soundsDir, 'background-music.mp3')
  const musicExists = existsSync(musicPath)
  checks.push({
    name: 'Background Music',
    passed: musicExists,
    message: musicExists ? 'background-music.mp3 found' : 'background-music.mp3 missing',
  })

  // Check 8: Audio playback test (actually play a short sound)
  let audioPlaybackWorks = false
  if (audioPlayerAvailable) {
    const testSound = join(soundsDir, 'menu_select.wav')
    if (existsSync(testSound)) {
      try {
        const proc = spawn({
          cmd: [audioPlayer, testSound],
          stdout: 'ignore',
          stderr: 'ignore',
        })
        const exitCode = await proc.exited
        audioPlaybackWorks = exitCode === 0
      } catch {
        audioPlaybackWorks = false
      }
    }
  }
  checks.push({
    name: 'Audio Playback',
    passed: audioPlaybackWorks,
    message: audioPlaybackWorks ? 'Test sound played' : 'Playback failed (check volume)',
  })

  // Check 9: SFX mute status (informational)
  const { getUserConfig } = await import('./config/userConfig')
  const config = getUserConfig()
  checks.push({
    name: 'Sound Effects',
    passed: !config.audioMuted,
    message: config.audioMuted ? 'MUTED - press M to unmute' : 'Enabled',
  })

  // Check 10: Music mute status (informational)
  checks.push({
    name: 'Music',
    passed: !config.musicMuted,
    message: config.musicMuted ? 'MUTED - press N to unmute' : 'Enabled',
  })

  const allPassed = checks.every(c => c.passed)
  const audioAvailable = audioPlayerAvailable && audioPlaybackWorks && missingSounds.length === 0
  const musicAvailable = musicExists && audioPlayerAvailable

  return {
    checks,
    allPassed,
    audioAvailable,
    musicAvailable,
  }
}

/**
 * Print startup report to console
 */
export function printStartupReport(report: StartupReport): void {
  const green = '\x1b[32m'
  const red = '\x1b[31m'
  const yellow = '\x1b[33m'
  const cyan = '\x1b[36m'
  const dim = '\x1b[90m'
  const reset = '\x1b[0m'

  console.log(`\n${cyan}═══ VADERS STARTUP CHECK ═══${reset}\n`)

  for (const check of report.checks) {
    const status = check.passed ? `${green}✓${reset}` : `${red}✗${reset}`
    console.log(`  ${status} ${check.name}: ${check.message}`)
  }

  // Show terminal quirks if any
  const termCaps = getTerminalCapabilities()
  const quirks = getTerminalQuirks(termCaps)
  if (quirks.length > 0) {
    console.log(`\n  ${dim}Terminal notes:${reset}`)
    for (const quirk of quirks) {
      console.log(`  ${dim}  - ${quirk}${reset}`)
    }
  }

  console.log('')
  if (report.allPassed) {
    console.log(`  ${green}All systems ready!${reset}`)
  } else if (report.audioAvailable) {
    console.log(`  ${yellow}Some checks failed, but audio works${reset}`)
  } else {
    console.log(`  ${yellow}Audio unavailable - check volume/drivers${reset}`)
  }

  // Show terminal recommendation for limited terminals
  if (shouldShowTerminalRecommendation(termCaps)) {
    const recommendation = getTerminalRecommendation(termCaps)!
    console.log('')
    console.log(`  ${yellow}╭─────────────────────────────────────────────────╮${reset}`)
    console.log(`  ${yellow}│${reset} ${cyan}TIP:${reset} For the best Vaders experience, try:      ${yellow}│${reset}`)
    console.log(`  ${yellow}│${reset}   • ${green}${recommendation.name}${reset} - ${recommendation.url.padEnd(27)}${yellow}│${reset}`)
    console.log(`  ${yellow}│${reset}                                                 ${yellow}│${reset}`)
    console.log(`  ${yellow}│${reset} ${dim}${recommendation.reason.padEnd(40)}${reset}        ${yellow}│${reset}`)
    console.log(`  ${yellow}╰─────────────────────────────────────────────────╯${reset}`)
  }
  console.log('')
}

/**
 * Play startup chime if audio is available
 */
export async function playStartupSound(): Promise<void> {
  const audioPlayer = getAudioPlayer()
  const soundPath = join(__dirname, '../sounds/game_start.wav')

  if (existsSync(soundPath)) {
    try {
      const proc = spawn({
        cmd: [audioPlayer, soundPath],
        stdout: 'ignore',
        stderr: 'ignore',
      })
      // Wait for the sound to finish playing
      await proc.exited
    } catch {
      // Ignore errors
    }
  }
}

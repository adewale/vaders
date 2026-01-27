#!/usr/bin/env bun
// client/src/index.tsx
// Entry point with CLI argument parsing and OpenTUI initialization

import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'
import { App } from './App'
import { TerminalSizeProvider } from './hooks/useTerminalSize'
import { runStartupChecks, printStartupReport, playStartupSound } from './startup'
import { MusicManager } from './audio'
import { shouldEnableKittyKeyboard } from './terminal'

// Parse CLI flags: --room ABC123 --name Alice --matchmake --solo --check --no-audio-check
function parseArgs(): {
  room?: string
  name: string
  matchmake: boolean
  solo: boolean
  check: boolean
  skipAudioCheck: boolean
} {
  const args = process.argv.slice(2)
  const flags: Record<string, string | boolean> = {}

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--room' && args[i + 1]) {
      flags.room = args[++i]
    } else if (args[i] === '--name' && args[i + 1]) {
      flags.name = args[++i]
    } else if (args[i] === '--matchmake') {
      flags.matchmake = true
    } else if (args[i] === '--solo') {
      flags.solo = true
    } else if (args[i] === '--check') {
      flags.check = true
    } else if (args[i] === '--no-audio-check') {
      flags.skipAudioCheck = true
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Vaders - Multiplayer TUI Space Invaders

Usage:
  vaders                     Show launch menu (default)
  vaders --room ABC123       Join specific room
  vaders --matchmake         Auto-join open game
  vaders --name "Alice"      Set player name
  vaders --solo              Start solo game immediately
  vaders --check             Run system diagnostics only
  vaders --no-audio-check    Skip startup audio verification

Controls:
  Arrow keys         Move left/right
  SPACE              Shoot
  M                  Toggle mute
  ENTER              Ready up / Select
  S                  Start solo (when alone)
  Q                  Quit
`)
      process.exit(0)
    }
  }

  return {
    room: flags.room as string | undefined,
    name: (flags.name as string) || `Player${Math.floor(Math.random() * 1000)}`,
    matchmake: !!flags.matchmake,
    solo: !!flags.solo,
    check: !!flags.check,
    skipAudioCheck: !!flags.skipAudioCheck,
  }
}

async function main() {
  const { room, name, matchmake, solo, check, skipAudioCheck } = parseArgs()

  // Run startup checks
  if (!skipAudioCheck || check) {
    const report = await runStartupChecks()

    if (check) {
      // Just print diagnostics and exit
      printStartupReport(report)
      process.exit(report.allPassed ? 0 : 1)
    }

    // Play startup sound to verify audio works
    if (report.audioAvailable) {
      await playStartupSound()
    }

    // Warn if audio isn't available (but continue anyway)
    if (!report.audioAvailable) {
      console.log('\x1b[33m⚠ Audio unavailable - game will run without sound\x1b[0m')
      console.log('  Run "vaders --check" for diagnostics\n')
      await new Promise(r => setTimeout(r, 1500))
    }
  }

  // Initialize OpenTUI renderer with Kitty keyboard protocol for key release events
  // This enables proper detection of when keys are released (required for smooth movement)
  // shouldEnableKittyKeyboard() is determined by terminal compatibility layer
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    useKittyKeyboard: shouldEnableKittyKeyboard() ? { events: true } : false,
  })
  const root = createRoot(renderer)

  // Render the app with terminal size provider
  root.render(
    <TerminalSizeProvider>
      <App
        roomCode={room}
        playerName={name}
        matchmake={matchmake}
        solo={solo}
      />
    </TerminalSizeProvider>
  )

  // Handle graceful shutdown
  const shutdown = () => {
    MusicManager.getInstance().stop()
    root.unmount()
    renderer.destroy()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('Failed to start Vaders:', err)
  process.exit(1)
})

#!/usr/bin/env bun
// client/src/index.tsx
// Entry point with CLI argument parsing and OpenTUI initialization

import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'
import { App } from './App'
import { TerminalSizeProvider } from './hooks/useTerminalSize'

// Parse CLI flags: --room ABC123 --name Alice --matchmake --enhanced --solo
function parseArgs(): { room?: string; name: string; matchmake: boolean; enhanced: boolean; solo: boolean } {
  const args = process.argv.slice(2)
  const flags: Record<string, string | boolean> = {}

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--room' && args[i + 1]) {
      flags.room = args[++i]
    } else if (args[i] === '--name' && args[i + 1]) {
      flags.name = args[++i]
    } else if (args[i] === '--matchmake') {
      flags.matchmake = true
    } else if (args[i] === '--enhanced') {
      flags.enhanced = true
    } else if (args[i] === '--solo') {
      flags.solo = true
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Vaders - Multiplayer TUI Space Invaders

Usage:
  vaders                     Start solo game (default)
  vaders --room ABC123       Join specific room
  vaders --matchmake         Auto-join open game
  vaders --name "Alice"      Set player name
  vaders --enhanced          Enable enhanced mode

Controls:
  Arrow keys or A/D   Move left/right
  SPACE              Shoot
  ENTER              Ready up (lobby)
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
    enhanced: !!flags.enhanced,
    solo: !!flags.solo,
  }
}

async function main() {
  const { room, name, matchmake, enhanced, solo } = parseArgs()

  // Initialize OpenTUI renderer with Kitty keyboard protocol for key release events
  // This enables proper detection of when keys are released (required for smooth movement)
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    useKittyKeyboard: { events: true },
  })
  const root = createRoot(renderer)

  // Render the app with terminal size provider
  root.render(
    <TerminalSizeProvider>
      <App
        roomCode={room}
        playerName={name}
        matchmake={matchmake}
        enhanced={enhanced}
        solo={solo}
      />
    </TerminalSizeProvider>
  )

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    root.unmount()
    renderer.destroy()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    root.unmount()
    renderer.destroy()
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('Failed to start Vaders:', err)
  process.exit(1)
})

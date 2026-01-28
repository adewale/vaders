#!/usr/bin/env bun
// client/src/render-log-analyzer.ts
// Analyzes render logs to detect flash issues
//
// Usage:
//   1. Run the game with logging enabled
//   2. Pipe the output to this analyzer:
//      bun run vaders 2>&1 | bun run src/render-log-analyzer.ts
//
// Or save logs and analyze:
//   bun run vaders 2>&1 > game.log
//   bun run src/render-log-analyzer.ts < game.log

interface RenderLogEntry {
  timestamp: string
  type: 'APP_RENDER' | 'WIPE_HOLD' | 'GAME_SCREEN' | 'LOBBY' | 'OTHER'
  status?: string
  data?: Record<string, unknown>
}

function parseLogLine(line: string): RenderLogEntry | null {
  // Match [APP RENDER] logs
  const appRenderMatch = line.match(/\[APP RENDER\]\s*(\{.*\})/)
  if (appRenderMatch) {
    try {
      const data = JSON.parse(appRenderMatch[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"'))
      return {
        timestamp: new Date().toISOString(),
        type: 'APP_RENDER',
        status: data.status,
        data,
      }
    } catch {
      return {
        timestamp: new Date().toISOString(),
        type: 'APP_RENDER',
        data: { raw: appRenderMatch[1] },
      }
    }
  }

  // Match [WIPE_HOLD] logs
  if (line.includes('[WIPE_HOLD]')) {
    return {
      timestamp: new Date().toISOString(),
      type: 'WIPE_HOLD',
      data: { raw: line },
    }
  }

  // Match [GAME_SCREEN] logs (if we add them)
  if (line.includes('[GAME_SCREEN]')) {
    return {
      timestamp: new Date().toISOString(),
      type: 'GAME_SCREEN',
      data: { raw: line },
    }
  }

  return null
}

interface FlashAnalysis {
  totalRenders: number
  statusSequence: string[]
  violations: string[]
  summary: string
}

function analyzeForFlash(entries: RenderLogEntry[]): FlashAnalysis {
  const violations: string[] = []
  const statusSequence: string[] = []

  let prevStatus: string | undefined
  let prevType: string | undefined

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]

    if (entry.status) {
      statusSequence.push(entry.status)
    }

    // Check for flash: GameScreen rendering during wipe_hold
    if (entry.type === 'GAME_SCREEN' && entry.status === 'wipe_hold') {
      violations.push(
        `Flash detected: GameScreen rendered during wipe_hold at entry ${i}`
      )
    }

    // Check for unexpected transition
    if (prevStatus === 'waiting' && entry.status === 'wipe_hold') {
      // This is the critical transition - should render wipe_hold_screen, not game
      if (entry.type === 'GAME_SCREEN') {
        violations.push(
          `Flash detected: GameScreen rendered immediately after waiting->wipe_hold`
        )
      }
    }

    // Check for missing wipe_hold screen
    if (entry.status === 'wipe_hold' && entry.type !== 'WIPE_HOLD' && entry.type !== 'APP_RENDER') {
      violations.push(
        `Warning: wipe_hold status but unexpected render type: ${entry.type}`
      )
    }

    prevStatus = entry.status
    prevType = entry.type
  }

  return {
    totalRenders: entries.length,
    statusSequence: [...new Set(statusSequence)], // Unique statuses
    violations,
    summary: violations.length === 0
      ? '✓ No flash violations detected'
      : `✗ Found ${violations.length} potential flash issue(s)`,
  }
}

async function main() {
  const entries: RenderLogEntry[] = []

  console.log('Render Log Analyzer')
  console.log('Reading from stdin... (Ctrl+C to stop)\n')

  const decoder = new TextDecoder()
  const reader = Bun.stdin.stream().getReader()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value)
      const lines = text.split('\n')

      for (const line of lines) {
        const entry = parseLogLine(line)
        if (entry) {
          entries.push(entry)
          console.log(`Captured: ${entry.type} ${entry.status ?? ''} ${JSON.stringify(entry.data)}`)
        }
      }
    }
  } catch (err) {
    // Stream closed
  }

  console.log('\n--- Analysis Results ---\n')
  const analysis = analyzeForFlash(entries)

  console.log(`Total renders captured: ${analysis.totalRenders}`)
  console.log(`Status sequence: ${analysis.statusSequence.join(' → ')}`)
  console.log()

  if (analysis.violations.length > 0) {
    console.log('Violations:')
    for (const v of analysis.violations) {
      console.log(`  ✗ ${v}`)
    }
  }

  console.log()
  console.log(analysis.summary)
}

main().catch(console.error)

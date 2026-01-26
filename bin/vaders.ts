#!/usr/bin/env bun
// bin/vaders.ts
// Unified entry point - starts worker and client automatically

import { spawn, type Subprocess } from 'bun'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createWriteStream, type WriteStream } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const WORKER_LOG_PATH = '/tmp/vaders.log'

const BASE_PORT = 8787
const MAX_PORT_ATTEMPTS = 10
const WORKER_READY_TIMEOUT = 30000 // 30 seconds

// Parse arguments - pass through to client except our own flags
const args = process.argv.slice(2)
const localMode = !args.includes('--remote')
const helpMode = args.includes('--help') || args.includes('-h')

// Remove our own flags from client args
const clientArgs = args.filter(arg => arg !== '--remote')

if (helpMode) {
  console.log(`
Vaders - Multiplayer TUI Space Invaders

Usage:
  vaders                     Start game (shows menu)
  vaders --room ABC123       Join specific room directly
  vaders --matchmake         Auto-join open game
  vaders --name "Alice"      Set player name
  vaders --remote            Connect to deployed server (default: local)

Controls:
  Arrow keys or A/D   Move left/right
  SPACE              Shoot
  ENTER              Ready up / Select
  Q                  Quit
`)
  process.exit(0)
}

async function isPortAvailable(port: number): Promise<boolean> {
  try {
    const server = Bun.listen({
      hostname: '127.0.0.1',
      port,
      socket: {
        data() {},
      },
    })
    server.stop()
    return true
  } catch {
    return false
  }
}

async function findAvailablePort(startPort: number, maxAttempts: number): Promise<number | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i
    if (await isPortAvailable(port)) {
      return port
    }
  }
  return null
}

async function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url + '/health', { signal: AbortSignal.timeout(1000) })
      if (res.ok) {
        const data = await res.json() as { game?: string }
        if (data.game === 'vaders') return true
      }
    } catch {
      // Server not ready yet
    }
    await Bun.sleep(200)
  }
  return false
}

async function findExistingServer(startPort: number, maxAttempts: number): Promise<string | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i
    const url = `http://localhost:${port}`
    try {
      const res = await fetch(url + '/health', { signal: AbortSignal.timeout(500) })
      if (res.ok) {
        // Verify it's actually a Vaders server
        const data = await res.json() as { game?: string }
        if (data.game === 'vaders') {
          return url
        }
      }
    } catch {
      // No server on this port or not a Vaders server
    }
  }
  return null
}

async function main() {
  let workerProcess: Subprocess | null = null
  let workerUrl = ''
  let isServerOwner = false  // Did we start the server?

  // Start the worker if in local mode
  if (localMode) {
    // First, check if a server is already running
    const existingServer = await findExistingServer(BASE_PORT, MAX_PORT_ATTEMPTS)
    if (existingServer) {
      workerUrl = existingServer
      console.log(`Found existing server at ${existingServer}`)
      console.log(`Server logs: ${WORKER_LOG_PATH}`)
    } else {
      // No existing server - start our own
      isServerOwner = true

      // Find an available port
      const port = await findAvailablePort(BASE_PORT, MAX_PORT_ATTEMPTS)
      if (!port) {
        console.error(`No available ports found (tried ${BASE_PORT}-${BASE_PORT + MAX_PORT_ATTEMPTS - 1})`)
        process.exit(1)
      }

      workerUrl = `http://localhost:${port}`
      console.log(`Starting local server on port ${port}...`)
      console.log(`Server logs: ${WORKER_LOG_PATH}`)

      // Create log file stream (append if exists, so multiple sessions share log)
      const logStream = createWriteStream(WORKER_LOG_PATH, { flags: 'a' })
      logStream.write(`\n=== Vaders Worker Log - Started ${new Date().toISOString()} ===\n`)
      logStream.write(`Port: ${port}\n\n`)

      workerProcess = spawn({
        cmd: ['bunx', 'wrangler', 'dev', '--port', String(port)],
        cwd: join(projectRoot, 'worker'),
        stdout: 'pipe',
        stderr: 'pipe',
      })

      // Pipe worker output to log file
      if (workerProcess.stdout) {
        const reader = workerProcess.stdout.getReader()
        ;(async () => {
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              logStream.write(value)
            }
          } catch {}
        })()
      }
      if (workerProcess.stderr) {
        const reader = workerProcess.stderr.getReader()
        ;(async () => {
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              logStream.write(value)
            }
          } catch {}
        })()
      }

      // Wait for worker to be ready
      const ready = await waitForServer(workerUrl, WORKER_READY_TIMEOUT)
      if (!ready) {
        console.error('Failed to start local server. Is wrangler installed?')
        logStream.end()
        workerProcess.kill()
        process.exit(1)
      }

      console.log('Server ready!')
    }
  }

  // Build client args
  const finalClientArgs = [...clientArgs]

  // Run the client
  const serverUrl = localMode ? workerUrl : (process.env.VADERS_SERVER ?? 'https://vaders.adewale-883.workers.dev')
  const clientProcess = spawn({
    cmd: ['bun', 'run', 'src/index.tsx', ...finalClientArgs],
    cwd: join(projectRoot, 'client'),
    env: {
      ...process.env,
      VADERS_SERVER: serverUrl,
      VADERS_LOG_PATH: localMode ? WORKER_LOG_PATH : '',
    },
    stdio: ['inherit', 'inherit', 'inherit'],
  })

  // Handle cleanup - only kill server if we started it
  const cleanup = () => {
    if (isServerOwner && workerProcess) {
      workerProcess.kill()
    }
    process.exit(0)
  }

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  // Wait for client to exit
  await clientProcess.exited

  if (isServerOwner && workerProcess) {
    workerProcess.kill()
  }
}

main().catch(err => {
  console.error('Failed to start Vaders:', err)
  process.exit(1)
})

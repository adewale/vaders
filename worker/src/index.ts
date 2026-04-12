// worker/src/index.ts
// Worker entry point and HTTP routing

export { GameRoom } from './GameRoom'
export { Matchmaker } from './Matchmaker'
export type { Env } from './env'

import type { Env } from './env'
import { BUILD_INFO } from './buildInfo'
import { logEvent } from './logger'

// Log build identity once per isolate so the deploy can be cross-referenced
// against /health and client footers in aggregated logs. Keeping this at
// module-load time (not per-request) makes it a cheap one-liner. We keep
// this raw JSON (not via logEvent) because module-load is before any
// request.cf context exists and we want a minimal, stable envelope here.
console.log(JSON.stringify({
  event: 'worker_boot',
  version: BUILD_INFO.version,
  commitHash: BUILD_INFO.commitHash,
  buildTime: BUILD_INFO.buildTime,
}))

/** Header used to propagate the per-request ID from the Worker entry into
 *  the Durable Object so every log line from the DO can be correlated with
 *  the originating HTTP request. Matches the wide-events pattern from
 *  logging-best-practices: one requestId threads through every service hop. */
const REQUEST_ID_HEADER = 'x-vaders-request-id'

/** Clone a Request with the requestId header added, so DO-side logs can
 *  include it. Preserves body, method, and existing headers. */
function withRequestId(request: Request, requestId: string): Request {
  const headers = new Headers(request.headers)
  headers.set(REQUEST_ID_HEADER, requestId)
  return new Request(request, { headers })
}

const ROOM_CODE_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const ROOM_CODE_LENGTH = 6
const MAX_ROOM_GENERATION_ATTEMPTS = 10

function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
  }
  return code
}

/**
 * Generate a unique room code that doesn't already exist.
 * Returns null if unable to generate a unique code after max attempts.
 */
async function generateUniqueRoomCode(matchmaker: DurableObjectStub): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_ROOM_GENERATION_ATTEMPTS; attempt++) {
    const roomCode = generateRoomCode()
    const check = await matchmaker.fetch(new Request(`https://internal/info/${roomCode}`))
    if (check.status === 404) {
      return roomCode
    }
  }
  return null
}

/**
 * Create and initialize a new game room.
 * Returns the room code or null on failure.
 */
async function createRoom(env: Env, matchmaker: DurableObjectStub, roomCode: string): Promise<void> {
  const id = env.GAME_ROOM.idFromName(roomCode)
  const stub = env.GAME_ROOM.get(id)

  await stub.fetch(new Request('https://internal/init', {
    method: 'POST',
    body: JSON.stringify({ roomCode })
  }))

  await matchmaker.fetch(new Request('https://internal/register', {
    method: 'POST',
    body: JSON.stringify({ roomCode, playerCount: 0, status: 'waiting' })
  }))
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Generate a per-request ID. crypto.randomUUID is available in the
    // Workers runtime. This is the correlation key that lets us stitch the
    // Worker entry log to the matching DO-side logs.
    const requestId = crypto.randomUUID()

    // Capture the Cloudflare colo (region) from request.cf if present so
    // subsequent logEvent() calls within this request can include it.
    // request.cf is undefined in tests/Node; we guard for that.
    const colo = (request as Request & { cf?: { colo?: string } }).cf?.colo
    if (colo) {
      ;(globalThis as { CF_REGION?: string }).CF_REGION = colo
    }

    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    // Wide event: one log line per incoming HTTP/WS request at entry. Not
    // per-WebSocket-message (that would flood Logpush); those go through
    // GameRoom's DEBUG_TRACE breadcrumb path when enabled.
    logEvent('request_received', {
      method: request.method,
      path: url.pathname,
      requestId,
    })

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    // POST /room - Create new room
    if (url.pathname === '/room' && request.method === 'POST') {
      const matchmaker = env.MATCHMAKER.get(env.MATCHMAKER.idFromName('global'))
      const roomCode = await generateUniqueRoomCode(matchmaker)

      if (!roomCode) {
        return new Response(JSON.stringify({
          code: 'room_generation_failed',
          message: 'Could not generate unique room code'
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        })
      }

      await createRoom(env, matchmaker, roomCode)

      return new Response(JSON.stringify({ roomCode }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      })
    }

    // GET /room/:code/ws - WebSocket connection
    const wsMatch = url.pathname.match(/^\/room\/([A-Z0-9]{6})\/ws$/)
    if (wsMatch) {
      const roomCode = wsMatch[1]
      const id = env.GAME_ROOM.idFromName(roomCode)
      const stub = env.GAME_ROOM.get(id)
      // Thread requestId to the DO so its logs correlate with this request.
      return stub.fetch(withRequestId(request, requestId))
    }

    // GET /matchmake - Find or create open room
    if (url.pathname === '/matchmake') {
      const matchmaker = env.MATCHMAKER.get(env.MATCHMAKER.idFromName('global'))
      const result = await matchmaker.fetch(new Request('https://internal/find'))
      const { roomCode: existingRoom } = await result.json() as { roomCode: string | null }

      if (existingRoom) {
        return new Response(JSON.stringify({ roomCode: existingRoom }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        })
      }

      // No open rooms - create one
      const newRoomCode = await generateUniqueRoomCode(matchmaker)

      if (!newRoomCode) {
        return new Response(JSON.stringify({
          code: 'room_generation_failed',
          message: 'Could not generate unique room code'
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        })
      }

      await createRoom(env, matchmaker, newRoomCode)

      return new Response(JSON.stringify({ roomCode: newRoomCode }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      })
    }

    // GET /room/:code - Room info
    const infoMatch = url.pathname.match(/^\/room\/([A-Z0-9]{6})$/)
    if (infoMatch) {
      const roomCode = infoMatch[1]
      const matchmaker = env.MATCHMAKER.get(env.MATCHMAKER.idFromName('global'))
      const result = await matchmaker.fetch(new Request(`https://internal/info/${roomCode}`))

      if (result.status === 404) {
        return new Response(JSON.stringify({ error: 'Room not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        })
      }

      const data = await result.json()
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      })
    }

    // Health check with game identifier + deploy metadata. The commitHash
    // and buildTime are regenerated into ./buildInfo.ts on every deploy so
    // each running instance self-identifies which build it's serving.
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        game: 'vaders',
        version: BUILD_INFO.version,
        commitHash: BUILD_INFO.commitHash,
        buildTime: BUILD_INFO.buildTime,
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      })
    }

    // Fall through to static assets (SPA frontend).
    // Routes matched above are API/WS endpoints; everything else serves the web UI.
    if (env.ASSETS) {
      return env.ASSETS.fetch(request)
    }

    return new Response('Not Found', {
      status: 404,
      headers: corsHeaders
    })
  }
}

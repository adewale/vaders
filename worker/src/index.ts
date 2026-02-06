// worker/src/index.ts
// Worker entry point and HTTP routing

export { GameRoom } from './GameRoom'
export { Matchmaker } from './Matchmaker'
export type { Env } from './env'

import type { Env } from './env'

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

    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

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
      return stub.fetch(request)
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

    // Health check with game identifier
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', game: 'vaders', version: '1.0.0' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      })
    }

    return new Response('Not Found', {
      status: 404,
      headers: corsHeaders
    })
  }
}

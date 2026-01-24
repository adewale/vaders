// worker/src/Matchmaker.ts
// Matchmaker Durable Object - in-memory room registry

import type { DurableObjectState } from '@cloudflare/workers-types'

type RoomInfo = { playerCount: number; status: string; updatedAt: number }

export class Matchmaker {
  private rooms: Record<string, RoomInfo> = {}
  private openRooms: Set<string> = new Set()

  constructor(private state: DurableObjectState) {
    // Restore from storage on cold start
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<Record<string, RoomInfo>>('rooms')
      if (stored) {
        this.rooms = stored
        // Rebuild openRooms set
        for (const [roomCode, info] of Object.entries(stored)) {
          if (info.status === 'waiting' && info.playerCount < 4) {
            this.openRooms.add(roomCode)
          }
        }
      }
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // POST /register - Room registers/updates itself
    if (url.pathname === '/register' && request.method === 'POST') {
      const { roomCode, playerCount, status } = await request.json() as {
        roomCode: string; playerCount: number; status: string
      }
      this.rooms[roomCode] = { playerCount, status, updatedAt: Date.now() }

      // Update openRooms set
      if (status === 'waiting' && playerCount < 4) {
        this.openRooms.add(roomCode)
      } else {
        this.openRooms.delete(roomCode)
      }

      await this.state.storage.put('rooms', this.rooms)
      return new Response('OK')
    }

    // POST /unregister - Room removes itself
    if (url.pathname === '/unregister' && request.method === 'POST') {
      const { roomCode } = await request.json() as { roomCode: string }
      delete this.rooms[roomCode]
      this.openRooms.delete(roomCode)
      await this.state.storage.put('rooms', this.rooms)
      return new Response('OK')
    }

    // GET /find - Find an open room
    if (url.pathname === '/find') {
      const STALE_THRESHOLD = 5 * 60 * 1000  // 5 minutes
      const now = Date.now()

      for (const roomCode of this.openRooms) {
        const info = this.rooms[roomCode]
        if (!info) {
          this.openRooms.delete(roomCode)
          continue
        }
        if (now - info.updatedAt > STALE_THRESHOLD) {
          delete this.rooms[roomCode]
          this.openRooms.delete(roomCode)
          continue
        }
        return new Response(JSON.stringify({ roomCode }), {
          headers: { 'Content-Type': 'application/json' }
        })
      }

      await this.state.storage.put('rooms', this.rooms)

      return new Response(JSON.stringify({ roomCode: null }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // GET /info/:roomCode - Get room info
    const infoMatch = url.pathname.match(/^\/info\/([A-Z0-9]{6})$/)
    if (infoMatch) {
      const roomCode = infoMatch[1]
      const info = this.rooms[roomCode]
      if (!info) {
        return new Response('Not found', { status: 404 })
      }
      return new Response(JSON.stringify({ roomCode, ...info }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response('Not found', { status: 404 })
  }
}

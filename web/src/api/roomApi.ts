// When VITE_SERVER_URL is unset, default to same-origin — the Worker serves
// both the static assets and the API, so the frontend just uses its own origin.
const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8787')

export interface RoomInfo {
  roomId: string
  wsUrl: string
}

export async function createRoom(): Promise<RoomInfo> {
  const res = await fetch(`${SERVER_URL}/room`, { method: 'POST' })
  if (!res.ok) throw new Error(`Failed to create room: ${res.status}`)
  const data = await res.json()
  const roomId = data.roomCode ?? data.roomId
  return { roomId, wsUrl: buildWsUrl(roomId) }
}

export async function matchmake(): Promise<RoomInfo> {
  const res = await fetch(`${SERVER_URL}/matchmake`)
  if (!res.ok) throw new Error(`Failed to matchmake: ${res.status}`)
  const data = await res.json()
  const roomId = data.roomCode ?? data.roomId
  return { roomId, wsUrl: buildWsUrl(roomId) }
}

export async function getRoomInfo(code: string): Promise<{ status: string; playerCount: number } | null> {
  const res = await fetch(`${SERVER_URL}/room/${code}`)
  if (!res.ok) return null
  return res.json()
}

export function buildWsUrl(roomId: string): string {
  const base = SERVER_URL.replace('https://', 'wss://').replace('http://', 'ws://')
  return `${base}/room/${roomId}/ws`
}

/**
 * Create a fresh room intended for solo play. The server endpoint is the
 * same as `createRoom` — "solo-ness" lives entirely in the caller, which
 * sends `{ type: 'start_solo' }` after the WebSocket connects (see
 * `App.tsx`). Exists as a separate export so call sites can declare intent
 * at a glance and so future server-side solo specialisation can be added
 * without churning callers.
 */
export async function createSoloRoom(): Promise<RoomInfo> {
  return createRoom()
}

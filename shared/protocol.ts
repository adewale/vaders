// shared/protocol.ts
// WebSocket message types for client-server communication

import type { Player, GameState, GameConfig } from './types'

// ─── Input State ──────────────────────────────────────────────────────────────

/** Which movement keys are currently held */
export interface InputState {
  left: boolean
  right: boolean
}

// ─── Client → Server Messages ─────────────────────────────────────────────────

export type ClientMessage =
  | { type: 'join'; name: string }
  | { type: 'ready' }
  | { type: 'unready' }
  | { type: 'start_solo' }
  | { type: 'forfeit' }                                // End game early (go to game_over)
  | { type: 'input'; held: InputState }               // Held-state networking (no seq needed)
  | { type: 'move'; direction: 'left' | 'right' }     // Discrete movement (one step per message)
  | { type: 'shoot' }                                  // Discrete action (rate-limited server-side)
  | { type: 'ping' }

// ─── Server → Client Messages ─────────────────────────────────────────────────

export type ServerEvent =
  | { type: 'event'; name: 'player_joined'; data: { player: Player } }
  | { type: 'event'; name: 'player_left'; data: { playerId: string; reason?: string } }
  | { type: 'event'; name: 'player_ready'; data: { playerId: string } }
  | { type: 'event'; name: 'player_unready'; data: { playerId: string } }
  | { type: 'event'; name: 'player_died'; data: { playerId: string } }
  | { type: 'event'; name: 'player_respawned'; data: { playerId: string } }
  | { type: 'event'; name: 'countdown_tick'; data: { count: number } }
  | { type: 'event'; name: 'countdown_cancelled'; data: { reason: string } }
  | { type: 'event'; name: 'game_start'; data?: undefined }
  | { type: 'event'; name: 'alien_killed'; data: { alienId: string; playerId: string | null } }
  | { type: 'event'; name: 'score_awarded'; data: { playerId: string | null; points: number; source: 'alien' | 'ufo' | 'commander' | 'wave_bonus' } }
  | { type: 'event'; name: 'wave_complete'; data: { wave: number } }
  | { type: 'event'; name: 'game_over'; data: { result: 'victory' | 'defeat' } }
  | { type: 'event'; name: 'invasion'; data?: undefined }
  | { type: 'event'; name: 'ufo_spawn'; data: { x: number } }

export type ServerMessage =
  | { type: 'sync'; state: GameState; playerId?: string; config?: GameConfig }
  | ServerEvent
  | { type: 'pong'; serverTime: number }
  | { type: 'error'; code: ErrorCode; message: string }

// Sync optimization:
// - playerId: sent ONCE on initial join sync, omitted thereafter (client caches it)
// - config: sent ONCE on initial join sync, omitted thereafter (config is static)
// - state: sent at 30Hz but omits config field (client uses cached config)
// This reduces per-sync payload from ~4KB to ~2KB.

// ─── Error Codes ──────────────────────────────────────────────────────────────

export type ErrorCode =
  | 'room_full'              // 4 players already in room
  | 'game_in_progress'       // Can't join mid-game
  | 'invalid_room'           // Room code doesn't exist
  | 'invalid_action'         // Action not allowed in current state
  | 'invalid_message'        // Malformed WebSocket message
  | 'name_taken'             // Player name already in use in room
  | 'not_in_room'            // Action requires being in room first
  | 'rate_limited'           // Too many requests
  | 'countdown_in_progress'  // Can't join during countdown

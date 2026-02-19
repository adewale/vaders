// client/src/hooks/useGameConnection.ts
// WebSocket connection hook with prediction and interpolation

import { useState, useEffect, useRef, useCallback } from 'react'
import type { GameState, GameConfig, ClientMessage, ServerMessage, ServerEvent, InputState } from '../../../shared/types'
import { applyPlayerInput } from '../../../shared/types'

const PING_INTERVAL = 30000
const PONG_TIMEOUT = 5000
const SYNC_INTERVAL_MS = 33  // Expected sync rate for lerp calculation

// Reconnection constants
const RECONNECT_BASE_DELAY = 1000   // Start at 1 second
const RECONNECT_MAX_DELAY = 10000   // Cap at 10 seconds
const RECONNECT_MAX_ATTEMPTS = 5

// Event data types for type-safe access
export type GameEventName = ServerEvent['name']
export type GameEventData<T extends GameEventName> = Extract<ServerEvent, { name: T }>['data']

interface ConnectionState {
  serverState: GameState | null
  prevState: GameState | null
  lastSyncTime: number
  playerId: string | null
  config: GameConfig | null
  connected: boolean
  reconnecting: boolean
  error: string | null
  // Event handling
  lastEvent: ServerEvent | null
  gameResult: 'victory' | 'defeat' | null
}

export function useGameConnection(
  roomUrl: string,
  playerName: string
) {
  const [state, setState] = useState<ConnectionState>({
    serverState: null,
    prevState: null,
    lastSyncTime: 0,
    playerId: null,
    config: null,
    connected: false,
    reconnecting: false,
    error: null,
    lastEvent: null,
    gameResult: null,
  })

  const wsRef = useRef<WebSocket | null>(null)
  const lastPongRef = useRef<number>(Date.now())
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const localInputRef = useRef<InputState>({ left: false, right: false })

  // Reconnection refs
  const intentionalCloseRef = useRef(false)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gameStatusRef = useRef<string | null>(null)

  // Connect to WebSocket
  useEffect(() => {
    // Reset reconnection state on fresh mount / roomUrl change
    intentionalCloseRef.current = false
    reconnectAttemptRef.current = 0

    const connect = () => {
      try {
        const ws = new WebSocket(roomUrl)
        wsRef.current = ws

        ws.onopen = () => {
          // Successful connection (or reconnection) - reset attempt counter
          reconnectAttemptRef.current = 0
          setState(s => ({ ...s, connected: true, reconnecting: false, error: null }))

          // Send join message (both on initial connect and reconnect)
          ws.send(JSON.stringify({
            type: 'join',
            name: playerName,
          } satisfies ClientMessage))

          // Start ping interval
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current)
          }
          pingIntervalRef.current = setInterval(() => {
            if (Date.now() - lastPongRef.current > PING_INTERVAL + PONG_TIMEOUT) {
              ws.close()
              return
            }
            ws.send(JSON.stringify({ type: 'ping' } satisfies ClientMessage))
          }, PING_INTERVAL)
        }

        ws.onmessage = (event) => {
          try {
            const msg: ServerMessage = JSON.parse(event.data)

            if (msg.type === 'pong') {
              lastPongRef.current = Date.now()
              return
            }

            if (msg.type === 'sync') {
              // Track game status for reconnection decisions
              gameStatusRef.current = msg.state.status
              setState(s => ({
                ...s,
                prevState: s.serverState,
                serverState: msg.state,
                lastSyncTime: Date.now(),
                playerId: msg.playerId ?? s.playerId,
                config: msg.config ?? s.config,
              }))
              return
            }

            if (msg.type === 'error') {
              setState(s => ({ ...s, error: `${msg.code}: ${msg.message}` }))
              return
            }

            // Handle game events
            if (msg.type === 'event') {
              setState(s => {
                const updates: Partial<ConnectionState> = { lastEvent: msg }

                // Extract game result from game_over event
                if (msg.name === 'game_over') {
                  updates.gameResult = (msg.data as { result: 'victory' | 'defeat' }).result
                  gameStatusRef.current = 'game_over'
                }

                return { ...s, ...updates }
              })
              return
            }
          } catch {
            // Invalid JSON
          }
        }

        ws.onclose = () => {
          setState(s => ({ ...s, connected: false }))
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current)
            pingIntervalRef.current = null
          }

          // Attempt reconnection if the close was not intentional
          // and the game is not over
          if (!intentionalCloseRef.current && gameStatusRef.current !== 'game_over') {
            scheduleReconnect()
          }
        }

        ws.onerror = () => {
          // Only set error if we're not going to retry
          // (onclose fires after onerror, which will trigger reconnection)
          if (intentionalCloseRef.current || gameStatusRef.current === 'game_over') {
            setState(s => ({ ...s, error: 'Connection error' }))
          }
        }
      } catch (err) {
        setState(s => ({ ...s, error: 'Failed to connect', reconnecting: false }))
      }
    }

    const scheduleReconnect = () => {
      if (reconnectAttemptRef.current >= RECONNECT_MAX_ATTEMPTS) {
        setState(s => ({
          ...s,
          reconnecting: false,
          error: 'Connection lost. Could not reconnect after multiple attempts.',
        }))
        return
      }

      reconnectAttemptRef.current += 1
      const attempt = reconnectAttemptRef.current
      const delay = Math.min(
        RECONNECT_BASE_DELAY * Math.pow(2, attempt - 1),
        RECONNECT_MAX_DELAY
      )

      setState(s => ({ ...s, reconnecting: true }))

      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null
        connect()
      }, delay)
    }

    connect()

    return () => {
      // Mark as intentional so the close handler doesn't trigger reconnection
      intentionalCloseRef.current = true
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
        pingIntervalRef.current = null
      }
    }
  }, [roomUrl, playerName])

  // Send a message
  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  // Update input state
  // IMPORTANT: We copy the input state to avoid reference issues
  const updateInput = useCallback((held: InputState) => {
    // Copy to avoid reference mutation issues
    localInputRef.current = { left: held.left, right: held.right }
    send({ type: 'input', held: { left: held.left, right: held.right } })
  }, [send])

  // Shoot
  const shoot = useCallback(() => {
    send({ type: 'shoot' })
  }, [send])

  // Discrete move (one step per call) - for terminals without key release events
  const move = useCallback((direction: 'left' | 'right') => {
    send({ type: 'move', direction })
  }, [send])

  // Get interpolated render state with local prediction
  const getRenderState = useCallback((): GameState | null => {
    const { serverState, prevState, lastSyncTime, playerId } = state

    if (!serverState) return null

    // Clone state for modification
    const renderState = structuredClone(serverState)

    // Calculate interpolation factor
    const elapsed = Date.now() - lastSyncTime
    const lerpT = Math.min(1, elapsed / SYNC_INTERVAL_MS)

    // Interpolate other players' positions
    if (prevState) {
      for (const [id, player] of Object.entries(renderState.players)) {
        if (id === playerId) continue  // Local player uses prediction, not interpolation

        const prevPlayer = prevState.players[id]
        if (prevPlayer) {
          player.x = prevPlayer.x + (player.x - prevPlayer.x) * lerpT
        }
      }

      // Interpolate alien positions
      for (const entity of renderState.entities) {
        if (entity.kind !== 'alien') continue

        const prevEntity = prevState.entities.find(e => e.id === entity.id)
        if (prevEntity && prevEntity.kind === 'alien') {
          entity.x = prevEntity.x + (entity.x - prevEntity.x) * lerpT
          entity.y = prevEntity.y + (entity.y - prevEntity.y) * lerpT
        }
      }
    }

    // Local player prediction: apply held input immediately
    if (playerId && renderState.players[playerId]) {
      const localPlayer = renderState.players[playerId]
      const held = localInputRef.current

      if (localPlayer.alive) {
        localPlayer.x = applyPlayerInput(localPlayer.x, held, 1)
      }
    }

    return renderState
  }, [state])

  return {
    serverState: state.serverState,
    prevState: state.prevState,
    getRenderState,
    playerId: state.playerId,
    connected: state.connected,
    reconnecting: state.reconnecting,
    error: state.error,
    lastEvent: state.lastEvent,
    gameResult: state.gameResult,
    send,
    updateInput,
    move,
    shoot,
  }
}

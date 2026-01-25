// client/src/hooks/useGameConnection.ts
// WebSocket connection hook with prediction and interpolation

import { useState, useEffect, useRef, useCallback } from 'react'
import type { GameState, GameConfig, ClientMessage, ServerMessage, InputState } from '../../../shared/types'
import { LAYOUT } from '../../../shared/types'

const PING_INTERVAL = 30000
const PONG_TIMEOUT = 5000
const SYNC_INTERVAL_MS = 33  // Expected sync rate for lerp calculation

interface ConnectionState {
  serverState: GameState | null
  prevState: GameState | null
  lastSyncTime: number
  playerId: string | null
  config: GameConfig | null
  connected: boolean
  error: string | null
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
    error: null,
  })

  const wsRef = useRef<WebSocket | null>(null)
  const lastPongRef = useRef<number>(Date.now())
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const localInputRef = useRef<InputState>({ left: false, right: false })

  // Connect to WebSocket
  useEffect(() => {
    const connect = () => {
      try {
        const ws = new WebSocket(roomUrl)
        wsRef.current = ws

        ws.onopen = () => {
          setState(s => ({ ...s, connected: true, error: null }))

          // Send join message
          ws.send(JSON.stringify({
            type: 'join',
            name: playerName,
          } satisfies ClientMessage))

          // Start ping interval
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

            // Game events are handled in sync messages
          } catch {
            // Invalid JSON
          }
        }

        ws.onclose = () => {
          setState(s => ({ ...s, connected: false }))
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current)
          }
        }

        ws.onerror = () => {
          setState(s => ({ ...s, error: 'Connection error' }))
        }
      } catch (err) {
        setState(s => ({ ...s, error: 'Failed to connect' }))
      }
    }

    connect()

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
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
        if (held.left) {
          localPlayer.x = Math.max(LAYOUT.PLAYER_MIN_X, localPlayer.x - 1)
        }
        if (held.right) {
          localPlayer.x = Math.min(LAYOUT.PLAYER_MAX_X, localPlayer.x + 1)
        }
      }
    }

    return renderState
  }, [state])

  return {
    serverState: state.serverState,
    getRenderState,
    playerId: state.playerId,
    connected: state.connected,
    error: state.error,
    send,
    updateInput,
    shoot,
  }
}

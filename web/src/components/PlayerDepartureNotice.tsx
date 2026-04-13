import { useEffect, useState } from 'react'
import type { GameState } from '../../../shared/types'
import { COLORS } from '../../../client-core/src/sprites/colors'

const AUTO_DISMISS_MS = 3000

interface PlayerDepartureNoticeProps {
  /**
   * Previous game state snapshot from `useGameConnection().prevState`. When
   * `null` (no prior sync), the notice never fires — we can't compare
   * against nothing.
   */
  prevState: GameState | null
  /** Current authoritative game state from `useGameConnection().serverState`. */
  state: GameState
}

interface Departure {
  id: string
  name: string
  slot: number | null
}

/**
 * Toast-style banner that surfaces mid-game player disconnects.
 *
 * When the server removes a player from `state.players` (WebSocket closed),
 * the HUD would otherwise silently lose their ship. This component watches
 * `prevState.players` vs `state.players` and renders a short-lived toast
 * listing the departing player(s).
 *
 * Toast vs HUD-dim tradeoff: chose toast because (a) it works for every
 * screen without touching the renderer and (b) the test surface is much
 * narrower — assertions are on DOM text rather than canvas pixels.
 *
 * See `ErrorToast` for the server-error counterpart; same visual family,
 * different colour (warning yellow) to distinguish "connectivity event"
 * from "server error".
 */
export function PlayerDepartureNotice({ prevState, state }: PlayerDepartureNoticeProps) {
  const [departures, setDepartures] = useState<Departure[]>([])
  // Serial bumps each time a new batch of departures arrives so the dismiss
  // effect re-runs even if the departure list is structurally similar.
  const [epoch, setEpoch] = useState(0)

  useEffect(() => {
    if (!prevState) return
    const lost: Departure[] = []
    for (const [id, player] of Object.entries(prevState.players)) {
      if (!state.players[id]) {
        lost.push({
          id,
          name: player.name ?? `Player ${player.slot ?? '?'}`,
          slot: player.slot ?? null,
        })
      }
    }
    if (lost.length > 0) {
      setDepartures(lost)
      setEpoch((e) => e + 1)
    }
    // NOTE: effect runs on every state change (including tick updates) but the
    // structural comparison is cheap (`Object.entries` on the small players
    // map) and only triggers a setState when an actual departure is detected.
  }, [prevState, state])

  useEffect(() => {
    if (departures.length === 0) return
    const timer = setTimeout(() => setDepartures([]), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [epoch, departures.length])

  if (departures.length === 0) return null

  const message =
    departures.length === 1
      ? `${describeDeparture(departures[0])} left the game`
      : `${departures.map(describeDeparture).join(', ')} left the game`

  return (
    <div
      data-testid="player-departure-notice"
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 64,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9998,
        minWidth: 280,
        maxWidth: 640,
        padding: '8px 14px',
        background: 'rgba(60, 40, 0, 0.92)',
        border: `1px solid ${COLORS.ui.warning}`,
        borderRadius: 4,
        color: '#fff4cc',
        fontFamily: 'var(--font-body)',
        fontSize: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        boxShadow: '0 2px 10px rgba(255, 200, 0, 0.35)',
      }}
    >
      <span aria-hidden="true" style={{ color: COLORS.ui.warning, fontSize: 16 }}>
        ⚡
      </span>
      <span style={{ flexGrow: 1 }}>{message}</span>
    </div>
  )
}

function describeDeparture(d: Departure): string {
  if (d.name && d.name.trim() !== '') return d.name
  if (d.slot != null) return `P${d.slot}`
  return `Player ${d.id}`
}

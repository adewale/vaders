import { useEffect, useRef, useState, useCallback } from 'react'
import QRCode from 'qrcode'
import type { GameState, Player, PlayerSlot } from '../../../shared/types'
import { COLORS } from '../../../client-core/src/sprites/colors'
import { MenuBackground } from './MenuBackground'
import { PlayerShipIcon } from './PlayerShipIcon'
import { HintsBar } from './HintsBar'

interface LobbyScreenProps {
  state: GameState
  playerId: string | null
  onReady: () => void
  onUnready: () => void
  onStartSolo: () => void
}

/**
 * Derive the max-player count for a lobby. Prefer the authoritative server
 * value (state.config.maxPlayers); otherwise fall back to the client rule:
 * solo = 1 seat, coop = 4 seats. See shared/types.ts GameState.config.
 */
function deriveMaxPlayers(state: GameState): number {
  const fromConfig = (state as any)?.config?.maxPlayers
  if (typeof fromConfig === 'number' && fromConfig > 0) return fromConfig
  return state.mode === 'solo' ? 1 : 4
}

/**
 * Build the ordered list of seat slots (1..maxPlayers clamped to [1,4]).
 * Returns slots as PlayerSlot values; slots above 4 are truncated because
 * PLAYER_COLORS only defines 1..4.
 */
function seatSlots(maxPlayers: number): PlayerSlot[] {
  const clamped = Math.max(1, Math.min(4, maxPlayers))
  return Array.from({ length: clamped }, (_, i) => (i + 1) as PlayerSlot)
}

export function LobbyScreen({ state, playerId, onReady, onUnready, onStartSolo }: LobbyScreenProps) {
  const players = Object.values(state.players) as Player[]
  const isReady = playerId ? state.readyPlayerIds.includes(playerId) : false

  const maxPlayers = deriveMaxPlayers(state)
  const slots = seatSlots(maxPlayers)

  // Build a map of slot → player (for robust ordering by slot number).
  const bySlot = new Map<PlayerSlot, Player>()
  for (const p of players) {
    // Player.slot is the canonical position. Fall back to color-derived slot
    // if slot is missing (older test fixtures).
    const slot = ((p as any).slot ?? slotFromColor((p as any).color)) as PlayerSlot | undefined
    if (slot && !bySlot.has(slot)) bySlot.set(slot, p)
  }

  const occupied = Array.from(bySlot.entries()).sort((a, b) => a[0] - b[0])
  const occupiedSlotSet = new Set(occupied.map(([s]) => s))
  const emptySlots = slots.filter((s) => !occupiedSlotSet.has(s))

  const readyCount = state.readyPlayerIds.length
  // Current player count — NOT the room cap. Server starts the game at
  // ≥2 players all-ready; `maxPlayers` is just the seat capacity. Using
  // maxPlayers as the ticker denominator made alone-in-coop look like
  // "need 4 players to play", which it isn't.
  const playerCount = occupied.length
  const isAlone = playerCount === 1

  const [copied, setCopied] = useState(false)
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = qrCanvasRef.current
    if (!canvas) return
    const url = typeof window !== 'undefined' ? window.location.href : ''
    if (!url) return
    QRCode.toCanvas(canvas, url, { width: 96, margin: 1 }, () => {
      // Ignore errors — QR is decorative; jsdom may not support canvas.
    })
  }, [state.roomCode])

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard may be unavailable; fail silently.
    }
  }, [])

  // Ticker text by situation:
  //   countdown  → "Starting in 3…"
  //   alone      → "Waiting for another player…"  (no "1/1 ready" — that's misleading)
  //   ≥2 players → "N/playerCount ready — starting when all ready"
  const tickerText =
    state.status === 'countdown' && state.countdownRemaining != null
      ? `Starting in ${state.countdownRemaining}…`
      : isAlone
        ? 'Waiting for another player…'
        : `${readyCount}/${playerCount} ready — starting when all ready`

  const tickerColor = state.status === 'countdown' ? COLORS.ui.warning : COLORS.ui.label

  return (
    <MenuBackground>
      <div
        className="vaders-screen"
        style={{
          width: '100%',
          height: '100%',
          padding: 40,
          fontFamily: 'var(--font-body)',
          fontSize: 18,
          boxSizing: 'border-box',
        }}
      >
        <h2 style={{ color: COLORS.ui.title, textAlign: 'center', fontSize: 28 }}>LOBBY</h2>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <p style={{ color: COLORS.ui.wave, fontSize: 24, margin: 0 }}>Room: {state.roomCode}</p>
          <button
            type="button"
            onClick={handleCopyLink}
            className="vaders-menu-item"
            style={{
              padding: '4px 12px',
              fontSize: 16,
              cursor: 'pointer',
              width: 'auto',
              display: 'inline-block',
              color: COLORS.ui.selectedText,
              background: 'rgba(0, 0, 0, 0.55)',
              margin: 0,
            }}
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
          <canvas
            ref={qrCanvasRef}
            data-testid="room-qr"
            width={96}
            height={96}
            style={{ background: '#fff', borderRadius: 4, imageRendering: 'pixelated' }}
          />
        </div>

        <div
          style={{
            marginTop: 24,
            border: `1px solid ${COLORS.ui.border}`,
            padding: 16,
            background: 'rgba(0, 0, 0, 0.45)',
            borderRadius: 4,
          }}
        >
          <p style={{ color: COLORS.ui.label, margin: '0 0 8px 0' }}>
            Players ({occupied.length}/{maxPlayers}):
          </p>

          {occupied.map(([slot, p]) => {
            const slotColor = COLORS.player[slot] ?? COLORS.ui.selectedText
            const ready = state.readyPlayerIds.includes(p.id)
            const isYou = p.id === playerId
            return (
              <div
                key={p.id}
                data-testid="lobby-player-row"
                data-slot={slot}
                style={{
                  color: slotColor,
                  padding: '4px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <PlayerShipIcon slot={slot} />
                <span style={{ color: slotColor, fontWeight: 700 }}>[{slot}]</span>
                <span style={{ color: slotColor }}>
                  {p.name}
                  {isYou ? ' (you)' : ''}
                </span>
                <span style={{ marginLeft: 'auto' }}>
                  {ready ? (
                    <span style={{ color: COLORS.ui.success }}>✓ Ready</span>
                  ) : (
                    <span style={{ color: COLORS.ui.warning, opacity: 0.7 }}>WAITING</span>
                  )}
                </span>
              </div>
            )
          })}

          {emptySlots.map((slot) => (
            <div
              key={`empty-${slot}`}
              data-testid="lobby-empty-seat"
              data-slot={slot}
              style={{
                color: COLORS.ui.dim,
                padding: '4px 0',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                opacity: 0.6,
              }}
            >
              <span>[—]</span>
              <span>─────</span>
              <span>(open seat)</span>
              <span style={{ marginLeft: 'auto' }}>[ ]</span>
            </div>
          ))}
        </div>

        {state.status === 'countdown' && state.countdownRemaining != null && (
          <p style={{ color: COLORS.ui.warning, textAlign: 'center', fontSize: 40, marginTop: 24 }}>
            {state.countdownRemaining}
          </p>
        )}

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <p data-testid="lobby-ready-ticker" style={{ color: tickerColor, margin: '0 0 12px 0', fontSize: 16 }}>
            {tickerText}
          </p>
          <button
            onClick={isReady ? onUnready : onReady}
            className="vaders-menu-item"
            style={{
              padding: '8px 24px',
              cursor: 'pointer',
              fontSize: 18,
              width: 'auto',
              display: 'inline-block',
              color: COLORS.ui.selectedText,
              background: 'rgba(0, 0, 0, 0.55)',
            }}
          >
            {isReady ? 'Unready' : 'Ready'}
            {isAlone && !isReady && (
              <span style={{ fontSize: 13, color: COLORS.ui.label, marginLeft: 8 }}>
                (wait for others)
              </span>
            )}
          </button>
          {/* Start Solo button: shown when playerCount === 1 regardless of
              state.mode. In pure solo flow (mode === 'solo') it's the
              primary path; after matchmaking alone (mode === 'coop' with
              only the local player) it's an escape hatch so the user
              isn't stuck waiting indefinitely for nobody. */}
          {isAlone && (
            <button
              onClick={onStartSolo}
              className="vaders-menu-item"
              style={{
                padding: '8px 24px',
                cursor: 'pointer',
                fontSize: 14,
                marginLeft: 16,
                width: 'auto',
                display: 'inline-block',
                color: COLORS.ui.selectedText,
                background: 'rgba(0, 0, 0, 0.55)',
              }}
            >
              Start Solo
            </button>
          )}
        </div>

        <HintsBar
          role="lobby"
          hints={[
            ['ENTER', isReady ? 'Unready' : 'Ready'],
            // `[S] Start Solo` hint is the keyboard mirror of the button.
            // Visible whenever the button is (playerCount === 1) —
            // regardless of state.mode, so matchmaked-alone players also
            // see the shortcut.
            ...(isAlone ? ([['S', 'Start Solo']] as Array<[string, string]>) : []),
            ['ESC', 'Leave'],
            ['M', 'Mute SFX'],
            ['N', 'Mute Music'],
            ['?', 'Help'],
          ]}
        />
      </div>
    </MenuBackground>
  )
}

/** Map legacy Player.color strings to PlayerSlot for older fixtures. */
function slotFromColor(color: string | undefined): PlayerSlot | undefined {
  switch (color) {
    case 'cyan':
      return 1
    case 'orange':
      return 2
    case 'magenta':
      return 3
    case 'lime':
      return 4
    default:
      return undefined
  }
}

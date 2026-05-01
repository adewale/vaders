import type React from 'react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { COLORS } from '../../../client-core/src/sprites/colors'
import { MenuBackground } from './MenuBackground'
import { AlienParade } from './AlienParade'
import { BUILD_INFO } from '../buildInfo'

interface LaunchScreenProps {
  onStartSolo: () => void
  onCreateRoom: () => void
  onJoinRoom: (code: string) => void
  onMatchmake: () => void
  /** Toggle SFX mute. Bound to M on the main menu to mirror the TUI. */
  onToggleMute?: () => void
  /** Toggle music mute. Bound to N on the main menu to mirror the TUI. */
  onToggleMusicMute?: () => void
  /**
   * Called when the user performs a menu navigation or selection action.
   * Platform-agnostic: LaunchScreen reports the semantic intent
   * ('navigate' for ArrowUp/Down, 'select' for Enter and 1–4 hotkeys) and
   * the host decides how to realise it (e.g. playing an audio cue).
   * Not invoked for typing in the room-code input, auto-repeat events, or
   * unrelated keys (M/N/?/Escape/etc.).
   */
  onMenuSound?: (kind: 'navigate' | 'select') => void
  error?: string | null
}

export const PLAYER_NAME_STORAGE_KEY = 'vaders.playerName'

/**
 * Extracts a 6-character alphanumeric room code from arbitrary pasted text.
 *
 * Handles bare codes ("ABC123"), URLs ("http://.../room/ABC123"), and
 * arbitrary surrounding text ("please join XYZ789 now"). Returns null if
 * no 6-char run of alphanumerics is found.
 */
export function extractRoomCode(input: string): string | null {
  if (!input) return null
  // Prefer a /room/CODE path segment if present — that's unambiguous.
  const pathMatch = input.match(/\/room\/([a-zA-Z0-9]{6})/)
  if (pathMatch) return pathMatch[1].toUpperCase()
  // Otherwise find a 6-char alphanumeric run. To reject plain words like
  // "please", require at least one digit when the input has surrounding
  // context; a bare 6-letter string is allowed only if the entire trimmed
  // input IS the code.
  const trimmed = input.trim()
  if (/^[a-zA-Z0-9]{6}$/.test(trimmed)) return trimmed.toUpperCase()
  // Find all 6-char alphanumeric runs and return the first one that
  // contains a digit.
  const matches = input.match(/[a-zA-Z0-9]{6}/g)
  if (!matches) return null
  const withDigit = matches.find((m) => /\d/.test(m))
  return withDigit ? withDigit.toUpperCase() : null
}

function loadPlayerName(): string {
  try {
    return localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || 'Player'
  } catch {
    return 'Player'
  }
}

// Inlined hover / focus rules. Required both for the visual polish and to
// satisfy tests that assert these selectors are present.
const STYLESHEET = `
.vaders-menu-item {
  display: flex;
  gap: 8px;
  padding: 6px 10px;
  margin: 2px 0;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  width: 100%;
  transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease, background 120ms ease;
}
.vaders-menu-item:hover {
  transform: scale(1.04);
  border-color: ${COLORS.ui.borderHighlight};
  box-shadow: 0 0 22px rgba(0, 255, 255, 0.7), 0 0 44px rgba(0, 255, 255, 0.25);
  background: rgba(0, 255, 255, 0.08);
}
.vaders-menu-item:focus {
  outline: none;
  transform: scale(1.04);
  border-color: ${COLORS.ui.selected};
  box-shadow: 0 0 22px rgba(255, 255, 0, 0.75), 0 0 44px rgba(255, 255, 0, 0.3);
}
`

const MENU_ITEM_COUNT = 4

export function LaunchScreen({
  onStartSolo,
  onCreateRoom,
  onJoinRoom,
  onMatchmake,
  onToggleMute,
  onToggleMusicMute,
  onMenuSound,
  error,
}: LaunchScreenProps) {
  const [joinMode, setJoinMode] = useState(false)
  const [roomCode, setRoomCode] = useState('')
  const [playerName, setPlayerName] = useState<string>(() => loadPlayerName())
  const [selectedIndex, setSelectedIndex] = useState(0)
  const roomInputRef = useRef<HTMLInputElement | null>(null)

  const enterJoinMode = useCallback(() => {
    setJoinMode(true)
    // Focus the paste-friendly input next tick.
    setTimeout(() => roomInputRef.current?.focus(), 0)
  }, [])

  const activateIndex = useCallback(
    (idx: number) => {
      switch (idx) {
        case 0:
          onStartSolo()
          break
        case 1:
          onCreateRoom()
          break
        case 2:
          enterJoinMode()
          break
        case 3:
          onMatchmake()
          break
      }
    },
    [onStartSolo, onCreateRoom, onMatchmake, enterJoinMode],
  )

  useEffect(() => {
    try {
      localStorage.setItem(PLAYER_NAME_STORAGE_KEY, playerName)
    } catch {
      // localStorage may be disabled; that's fine.
    }
  }, [playerName])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.repeat) return

      // If the user is typing in a text input, don't hijack their input.
      // Exception: when the room-code input is focused we still honour
      // Escape / Enter as navigation actions.
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) {
        if (joinMode && t === roomInputRef.current) {
          if (e.key === 'Escape') {
            setJoinMode(false)
            setRoomCode('')
            return
          }
          if (e.key === 'Enter' && roomCode.length === 6) {
            onJoinRoom(roomCode)
          }
        }
        return
      }

      if (joinMode) {
        if (e.key === 'Escape') {
          setJoinMode(false)
          setRoomCode('')
          return
        }
        if (e.key === 'Enter' && roomCode.length === 6) {
          onJoinRoom(roomCode)
          return
        }
        if (e.key === 'Backspace') {
          setRoomCode((prev) => prev.slice(0, -1))
          return
        }
        if (/^[a-zA-Z0-9]$/.test(e.key) && roomCode.length < 6) {
          setRoomCode((prev) => prev + e.key.toUpperCase())
        }
        return
      }

      // Audio toggles (available from the main menu, mirroring the TUI).
      // Checked on lowercased key so both 'm' and 'M' (shift) work.
      const lowered = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (lowered === 'm') {
        onToggleMute?.()
        return
      }
      if (lowered === 'n') {
        onToggleMusicMute?.()
        return
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          onMenuSound?.('navigate')
          setSelectedIndex((prev) => (prev + 1) % MENU_ITEM_COUNT)
          return
        case 'ArrowUp':
          e.preventDefault()
          onMenuSound?.('navigate')
          setSelectedIndex((prev) => (prev - 1 + MENU_ITEM_COUNT) % MENU_ITEM_COUNT)
          return
        case 'Enter':
          e.preventDefault()
          onMenuSound?.('select')
          activateIndex(selectedIndex)
          return
        case '1':
          e.preventDefault()
          onMenuSound?.('select')
          setSelectedIndex(0)
          onStartSolo()
          break
        case '2':
          e.preventDefault()
          onMenuSound?.('select')
          setSelectedIndex(1)
          onCreateRoom()
          break
        case '3':
          e.preventDefault()
          onMenuSound?.('select')
          setSelectedIndex(2)
          enterJoinMode()
          break
        case '4':
          e.preventDefault()
          onMenuSound?.('select')
          setSelectedIndex(3)
          onMatchmake()
          break
      }
    },
    [
      joinMode,
      roomCode,
      onStartSolo,
      onCreateRoom,
      onJoinRoom,
      onMatchmake,
      onToggleMute,
      onToggleMusicMute,
      onMenuSound,
      enterJoinMode,
      activateIndex,
      selectedIndex,
    ],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const handleRoomPaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData?.getData('text') ?? ''
    e.preventDefault()
    const code = extractRoomCode(text)
    if (code) setRoomCode(code)
  }, [])

  const handleRoomChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 6)
      .toUpperCase()
    setRoomCode(cleaned)
  }, [])

  return (
    <MenuBackground>
      <style>{STYLESHEET}</style>
      <div
        className="vaders-screen"
        style={{
          width: '100%',
          height: '100%',
          padding: 40,
          fontFamily: 'var(--font-body)',
          fontSize: 18,
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        <h1
          data-testid="vaders-logo"
          className="vaders-logo"
          style={{
            background: 'linear-gradient(90deg, #00ffff 0%, #ff55ff 50%, #ffff00 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            textAlign: 'center',
            fontFamily: 'var(--font-display)',
            fontSize: 56,
            margin: 0,
            letterSpacing: '0.2em',
          }}
        >
          V A D E R S
        </h1>

        <div style={{ marginTop: 16 }}>
          <AlienParade />
        </div>

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
          <label htmlFor="player-name" style={{ color: COLORS.ui.label, fontSize: 16 }}>
            Name:
          </label>
          <input
            id="player-name"
            aria-label="Name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value.slice(0, 24))}
            style={{
              background: 'rgba(0, 0, 0, 0.45)',
              color: COLORS.ui.success,
              border: `1px solid ${COLORS.ui.border}`,
              padding: '4px 8px',
              fontFamily: 'var(--font-body)',
              fontSize: 16,
              width: 160,
            }}
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
          <MenuItem
            hotkey="1"
            label="SOLO GAME"
            desc="Start immediately, 3 lives"
            onClick={() => {
              setSelectedIndex(0)
              onStartSolo()
            }}
            selected={selectedIndex === 0}
          />
          <MenuItem
            hotkey="2"
            label="CREATE ROOM"
            desc="Get room code to share with friends"
            onClick={() => {
              setSelectedIndex(1)
              onCreateRoom()
            }}
            selected={selectedIndex === 1}
          />
          {joinMode ? (
            <div
              className="vaders-menu-item"
              data-testid="menu-item"
              data-selected={selectedIndex === 2 ? 'true' : 'false'}
              style={{
                cursor: 'default',
                alignItems: 'center',
                ...(selectedIndex === 2 ? SELECTED_STYLE : {}),
              }}
            >
              <span style={{ color: COLORS.ui.hotkey, width: 16, display: 'inline-block' }}>
                {selectedIndex === 2 ? '\u25B6' : ' '}
              </span>
              <span style={{ color: COLORS.ui.hotkey }}>[3]</span>
              <span style={{ color: COLORS.ui.selectedText, width: 144 }}>JOIN ROOM</span>
              <label htmlFor="room-code-input" style={{ color: COLORS.ui.label }}>
                Code:
              </label>
              <input
                id="room-code-input"
                aria-label="Room code"
                ref={roomInputRef}
                value={roomCode}
                onChange={handleRoomChange}
                onPaste={handleRoomPaste}
                maxLength={6}
                style={{
                  background: 'rgba(0, 0, 0, 0.65)',
                  color: COLORS.ui.success,
                  border: `1px solid ${COLORS.ui.border}`,
                  padding: '4px 8px',
                  fontFamily: 'var(--font-body)',
                  fontSize: 18,
                  width: 110,
                  textTransform: 'uppercase',
                  letterSpacing: 2,
                }}
              />
            </div>
          ) : (
            <MenuItem
              hotkey="3"
              label="JOIN ROOM"
              desc="Enter a room code"
              onClick={() => {
                setSelectedIndex(2)
                enterJoinMode()
              }}
              selected={selectedIndex === 2}
            />
          )}
          <MenuItem
            hotkey="4"
            label="MATCHMAKING"
            desc="Auto-join an open game"
            onClick={() => {
              setSelectedIndex(3)
              onMatchmake()
            }}
            selected={selectedIndex === 3}
          />
        </div>

        {error && <p style={{ color: COLORS.ui.error, textAlign: 'center', marginTop: 16, fontSize: 16 }}>{error}</p>}

        <p style={{ color: COLORS.ui.label, textAlign: 'center', marginTop: 24, fontSize: 16 }}>
          MENU &nbsp; ↑/↓ Navigate &nbsp; ENTER Select &nbsp; 1-4 Quick select
        </p>
        <p style={{ color: COLORS.ui.label, textAlign: 'center', marginTop: 4, fontSize: 16 }}>
          AUDIO &nbsp; M Mute SFX &nbsp; N Mute Music &nbsp; ? Help
        </p>

        <div
          style={{
            position: 'absolute',
            bottom: 40,
            left: 40,
            right: 40,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ color: COLORS.ui.dim, fontSize: 14 }} title={`Built ${BUILD_INFO.buildTime}`}>
            v{BUILD_INFO.version} · {BUILD_INFO.commitHash}
          </span>
          <span style={{ color: COLORS.ui.dim, fontSize: 14 }}>1-4 Players</span>
        </div>

        {/*
          Homepage-only footer: source-code + platform credit. Rendered
          only on LaunchScreen by explicit design — lobby, game, and
          game-over screens keep their UI uncluttered. Small font
          (`fontSize: 11`) + modern sans-serif via system-ui to match
          the convention of minimal platform credits (the Cloudflare
          link style follows the same convention their free-tier
          subdomain banner uses). pointerEvents scoped via standard
          anchor behaviour; target=_blank opens externally; rel
          noopener prevents the new tab from controlling this tab.
        */}
        <div
          data-testid="homepage-footer"
          style={{
            position: 'absolute',
            bottom: 8,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 11,
            color: 'rgba(255, 255, 255, 0.45)',
            letterSpacing: 0,
          }}
        >
          <a
            href="https://github.com/adewale/vaders"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}
          >
            github.com/adewale/vaders
          </a>
          <a
            href="https://developers.cloudflare.com/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}
          >
            Built on the Cloudflare Developer Platform
          </a>
        </div>
      </div>
    </MenuBackground>
  )
}

const SELECTED_STYLE: React.CSSProperties = {
  transform: 'scale(1.02)',
  borderColor: COLORS.ui.selected,
  boxShadow: '0 0 14px rgba(255, 255, 0, 0.55)',
  background: 'rgba(255, 255, 0, 0.08)',
}

function MenuItem({
  hotkey,
  label,
  desc,
  onClick,
  selected = false,
}: {
  hotkey: string
  label: string
  desc: string
  onClick?: () => void
  selected?: boolean
}) {
  return (
    <button
      type="button"
      className="vaders-menu-item"
      data-testid="menu-item"
      data-selected={selected ? 'true' : 'false'}
      onClick={onClick}
      style={selected ? SELECTED_STYLE : undefined}
    >
      <span aria-hidden="true" style={{ color: COLORS.ui.selected, width: 16, display: 'inline-block' }}>
        {selected ? '\u25B6' : ' '}
      </span>
      <span style={{ color: COLORS.ui.hotkey }}>[{hotkey}]</span>
      <span style={{ color: COLORS.ui.selectedText, width: 144, display: 'inline-block' }}>{label}</span>
      <span style={{ color: COLORS.ui.label }}>{desc}</span>
    </button>
  )
}

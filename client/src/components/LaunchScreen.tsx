// client/src/components/LaunchScreen.tsx
// Launch screen with mode selection

import { useKeyboard, useRenderer } from '@opentui/react'
import { useState, useCallback } from 'react'
import { Logo } from './Logo'
import { normalizeKey } from '../input'
import { COLORS } from '../sprites'
import { useTerminalSize } from '../hooks/useTerminalSize'

interface LaunchScreenProps {
  onStartSolo: (enhanced: boolean) => void
  onCreateRoom: (enhanced: boolean) => void
  onJoinRoom: (code: string, enhanced: boolean) => void
  onMatchmake: (enhanced: boolean) => void
  version: string
}

const MENU_ITEMS = ['solo', 'create', 'join', 'matchmake', 'enhanced'] as const
type MenuItem = typeof MENU_ITEMS[number]

export function LaunchScreen({
  onStartSolo,
  onCreateRoom,
  onJoinRoom,
  onMatchmake,
  version
}: LaunchScreenProps) {
  const renderer = useRenderer()
  const [enhanced, setEnhanced] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [joinMode, setJoinMode] = useState(false)
  const [roomCode, setRoomCode] = useState('')

  const handleSelect = useCallback(() => {
    const item = MENU_ITEMS[selectedIndex]
    switch (item) {
      case 'solo':
        onStartSolo(enhanced)
        break
      case 'create':
        onCreateRoom(enhanced)
        break
      case 'join':
        setJoinMode(true)
        break
      case 'matchmake':
        onMatchmake(enhanced)
        break
      case 'enhanced':
        setEnhanced(e => !e)
        break
    }
  }, [selectedIndex, enhanced, onStartSolo, onCreateRoom, onMatchmake])

  const handleKeyInput = useCallback((event: Parameters<Parameters<typeof useKeyboard>[0]>[0]) => {
    // Only process key press events, not releases or repeats
    if (event.eventType !== 'press' || event.repeated) return

    const key = normalizeKey(event)
    if (!key) return

    // Join mode: typing room code
    if (joinMode) {
      if (key.type === 'key' && key.key === 'escape') {
        setJoinMode(false)
        setRoomCode('')
        return
      }
      if (key.type === 'key' && key.key === 'enter' && roomCode.length === 6) {
        onJoinRoom(roomCode, enhanced)
        return
      }
      if (event.name === 'backspace') {
        setRoomCode(prev => prev.slice(0, -1))
        return
      }
      if (key.type === 'char' && /^[a-zA-Z0-9]$/.test(key.char) && roomCode.length < 6) {
        setRoomCode(prev => prev + key.char.toUpperCase())
      }
      return
    }

    // Arrow key navigation
    if (key.type === 'key') {
      switch (key.key) {
        case 'up':
          setSelectedIndex(i => (i - 1 + MENU_ITEMS.length) % MENU_ITEMS.length)
          return
        case 'down':
          setSelectedIndex(i => (i + 1) % MENU_ITEMS.length)
          return
        case 'enter':
        case 'space':
          handleSelect()
          return
        case 'q':
          renderer.destroy()
          process.exit(0)
      }
    }

    // Hotkey shortcuts
    if (key.type === 'char') {
      switch (key.char) {
        case '1':
          onStartSolo(enhanced)
          break
        case '2':
          onCreateRoom(enhanced)
          break
        case '3':
          setJoinMode(true)
          break
        case '4':
          onMatchmake(enhanced)
          break
        case 'e':
        case 'E':
          setEnhanced(e => !e)
          break
        case 'q':
        case 'Q':
          renderer.destroy()
          process.exit(0)
          break
      }
    }
  }, [joinMode, roomCode, enhanced, onStartSolo, onCreateRoom, onJoinRoom, onMatchmake, renderer, handleSelect])

  useKeyboard(handleKeyInput)

  const { terminalWidth, terminalHeight, gameWidth, gameHeight } = useTerminalSize()

  return (
    // Outer box fills terminal, inner box is centered game area
    <box width={terminalWidth} height={terminalHeight} justifyContent="center" alignItems="center">
      <box flexDirection="column" width={gameWidth} height={gameHeight} paddingLeft={1} paddingRight={1}>
      <box height={1} />
      <Logo />
      <box height={1} />

      <box flexDirection="column" borderStyle="single" borderColor={COLORS.ui.border} paddingLeft={1} paddingRight={1}>
        <MenuItemRow
          hotkey="1"
          label="SOLO GAME"
          desc="Start immediately, 3 lives"
          selected={selectedIndex === 0}
        />
        <MenuItemRow
          hotkey="2"
          label="CREATE ROOM"
          desc="Get room code to share with friends"
          selected={selectedIndex === 1}
        />
        {joinMode ? (
          <box>
            <text fg={COLORS.ui.selected}>▶ </text>
            <text fg={COLORS.ui.hotkey}>[3]</text>
            <box width={1} />
            <text fg={COLORS.ui.selectedText}>JOIN ROOM  </text>
            <text fg={COLORS.ui.unselected}>Enter code: [</text>
            <text fg={COLORS.ui.success}>{roomCode.padEnd(6, '_')}</text>
            <text fg={COLORS.ui.unselected}>] (ESC to cancel)</text>
          </box>
        ) : (
          <MenuItemRow
            hotkey="3"
            label="JOIN ROOM"
            desc="Enter a room code"
            selected={selectedIndex === 2}
          />
        )}
        <MenuItemRow
          hotkey="4"
          label="MATCHMAKING"
          desc="Auto-join an open game"
          selected={selectedIndex === 3}
        />
        <box height={1} />
        <box>
          <text fg={selectedIndex === 4 ? COLORS.ui.selected : COLORS.ui.unselected}>{selectedIndex === 4 ? '▶ ' : '  '}</text>
          <text fg={COLORS.ui.hotkey}>[E]</text>
          <text fg={COLORS.ui.selectedText}> ENHANCED MODE  </text>
          <text fg={enhanced ? COLORS.ui.success : COLORS.ui.dim}>{enhanced ? 'ON ' : 'OFF'}</text>
          <text fg={COLORS.ui.dim}>  Galaga/Galaxian enemies</text>
        </box>
      </box>

      <box height={1} />
      <text fg={COLORS.ui.unselected}>
        {'  '}↑/↓ Navigate   ENTER Select   Q Quit
      </text>
      <box flexGrow={1} />
      <box>
        <text fg={COLORS.ui.dim}>v{version}</text>
        <box flexGrow={1} />
        <text fg={COLORS.ui.dim}>1-4 Players  OpenTUI + Bun</text>
      </box>
      </box>
    </box>
  )
}

function MenuItemRow({
  hotkey,
  label,
  desc,
  selected
}: {
  hotkey: string
  label: string
  desc: string
  selected: boolean
}) {
  return (
    <box>
      <text fg={selected ? COLORS.ui.selected : COLORS.ui.unselected}>{selected ? '▶ ' : '  '}</text>
      <text fg={COLORS.ui.hotkey}>[{hotkey}]</text>
      <box width={1} />
      <text fg={selected ? COLORS.ui.selectedText : COLORS.ui.label} width={16}>{label}</text>
      <text fg={COLORS.ui.unselected}>{desc}</text>
    </box>
  )
}

// client/src/components/LobbyScreen.tsx
// Lobby screen with player list and ready state

import type { GameState } from '../../../shared/types'
import { COLORS, getPlayerColor } from '../sprites'
import { useTerminalSize } from '../hooks/useTerminalSize'

interface LobbyScreenProps {
  state: GameState
  currentPlayerId: string
  selectedIndex: number
  onReady: () => void
  onUnready: () => void
  onStartSolo: () => void
}

export function LobbyScreen({
  state,
  currentPlayerId,
  selectedIndex,
  onReady,
  onUnready,
  onStartSolo
}: LobbyScreenProps) {
  const players = Object.values(state.players)
  const isReady = state.readyPlayerIds.includes(currentPlayerId)
  const playerCount = players.length
  const readyCount = state.readyPlayerIds.length

  const { terminalWidth, terminalHeight, gameWidth, gameHeight } = useTerminalSize()

  // Menu items depend on player count
  const menuItems = playerCount === 1
    ? [
        { label: isReady ? 'Cancel Ready' : 'Ready Up', desc: '(wait for others)' },
        { label: 'Start Solo', desc: '' },
      ]
    : [
        { label: isReady ? 'Cancel Ready' : 'Ready Up', desc: '' },
      ]

  // Center the lobby box in the game area
  const boxWidth = Math.min(80, gameWidth - 4)
  const boxHeight = Math.min(28, gameHeight - 4)

  return (
    // Outer box fills terminal, inner centering for game area
    <box width={terminalWidth} height={terminalHeight} justifyContent="center" alignItems="center">
      <box
        flexDirection="column"
        width={boxWidth}
        height={boxHeight}
        borderStyle="double"
        borderColor={COLORS.ui.borderHighlight}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
    >
      <text fg={COLORS.ui.title}><b>VADERS</b></text>
      <box height={1} />
      <text fg={COLORS.ui.selectedText}>Room: <span fg={COLORS.ui.score}>{state.roomId}</span></text>
      <box height={1} />
      <text fg={COLORS.ui.score}>Players ({playerCount}/4):</text>
      <box height={1} />

      {players.map((player) => {
        const playerReady = state.readyPlayerIds.includes(player.id)
        const playerColor = getPlayerColor(player.slot)
        return (
          <box key={player.id}>
            <text fg={playerColor}>
              {player.id === currentPlayerId ? '> ' : '  '}P{player.slot} {player.name}
            </text>
            <box flexGrow={1} />
            <text fg={playerReady ? COLORS.ui.success : COLORS.ui.unselected}>
              {playerReady ? 'READY' : 'waiting'}
            </text>
          </box>
        )
      })}

      {Array.from({ length: 4 - playerCount }).map((_, i) => (
        <text key={`empty-${i}`} fg={COLORS.ui.dim}>  P{playerCount + i + 1} (empty)</text>
      ))}

      <box flexGrow={1} />
      <box borderStyle="single" borderColor={COLORS.ui.border} paddingLeft={1} paddingRight={1} flexDirection="column">
        {menuItems.map((item, i) => (
          <box key={i}>
            <text fg={selectedIndex === i ? COLORS.ui.selected : COLORS.ui.unselected}>
              {selectedIndex === i ? '▶ ' : '  '}
            </text>
            <text fg={selectedIndex === i ? COLORS.ui.selectedText : COLORS.ui.label}>
              {item.label}
            </text>
            {item.desc && (
              <text fg={COLORS.ui.unselected}> {item.desc}</text>
            )}
          </box>
        ))}
        {playerCount > 1 && (
          <text fg={readyCount === playerCount ? COLORS.ui.success : COLORS.ui.unselected}>
            {readyCount}/{playerCount} ready{readyCount === playerCount ? ' - Starting...' : ''}
          </text>
        )}
      </box>
      <box height={1} />
      <text fg={COLORS.ui.unselected}>↑/↓ Navigate   ENTER Select   Q Quit</text>
      </box>
    </box>
  )
}

// Helper to get menu item count for this screen
export function getLobbyMenuItemCount(playerCount: number): number {
  return playerCount === 1 ? 2 : 1
}

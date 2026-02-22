// client/src/components/LobbyScreen.tsx
// Lobby screen with player list and ready state

import type { GameState } from '../../../shared/types'
import { COLORS } from '../sprites'
import { useTerminalSize } from '../hooks/useTerminalSize'
import { PlayerList } from './PlayerList'
import { GradientText } from './GradientText'
import { GRADIENT_PRESETS, interpolateGradient } from '../gradient'
import { supportsRichColor } from '../terminal'

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
  const richColor = supportsRichColor()

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
      {richColor
        ? <GradientText text="VADERS" colors={GRADIENT_PRESETS.ocean} fallbackColor={COLORS.ui.title} richColor={richColor} />
        : <text fg={COLORS.ui.title}><b>VADERS</b></text>
      }
      <box height={1} />
      <text fg={COLORS.ui.selectedText}>Room: {richColor
        ? (() => {
            const colors = interpolateGradient(GRADIENT_PRESETS.victory, state.roomId.length)
            return state.roomId.split('').map((ch, i) => <span key={i} fg={colors[i]}>{ch}</span>)
          })()
        : <span fg={COLORS.ui.score}>{state.roomId}</span>
      }</text>
      <box height={1} />
      {richColor
        ? <GradientText text={`Players (${playerCount}/4):`} colors={GRADIENT_PRESETS.ocean} fallbackColor={COLORS.ui.score} richColor={richColor} />
        : <text fg={COLORS.ui.score}>Players ({playerCount}/4):</text>
      }
      <box height={1} />

      {/* Player list with ship sprites and colored ready indicators */}
      <PlayerList
        players={players}
        readyPlayerIds={state.readyPlayerIds}
        currentPlayerId={currentPlayerId}
        maxPlayers={4}
      />

      <box flexGrow={1} />
      <box borderStyle="single" borderColor={COLORS.ui.border} paddingLeft={1} paddingRight={1} flexDirection="column">
        {menuItems.map((item, i) => {
          const selected = selectedIndex === i
          const labelColors = selected && richColor ? interpolateGradient(GRADIENT_PRESETS.vaders, item.label.length) : null
          return (
            <box key={i}>
              <text fg={selected ? COLORS.ui.selected : COLORS.ui.unselected}>
                {selected ? '▶' : '  '}
              </text>
              <text fg={selected ? COLORS.ui.selectedText : COLORS.ui.label}>
                {labelColors
                  ? item.label.split('').map((ch, ci) => <span key={ci} fg={labelColors[ci]}>{ch}</span>)
                  : item.label
                }
              </text>
              {item.desc && (
                <text fg={COLORS.ui.unselected}> {item.desc}</text>
              )}
            </box>
          )
        })}
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

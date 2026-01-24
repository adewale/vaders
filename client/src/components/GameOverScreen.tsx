// client/src/components/GameOverScreen.tsx
// Game over screen with final stats

import type { GameState } from '../../../shared/types'
import { getAliens } from '../../../shared/types'
import { SYMBOLS as SYM } from '../capabilities'
import { COLORS, getPlayerColor } from '../sprites'
import { useTerminalSize } from '../hooks/useTerminalSize'

interface GameOverScreenProps {
  state: GameState
  currentPlayerId: string
  selectedIndex: number
  onPlayAgain?: () => void
  onMainMenu?: () => void
}

export function GameOverScreen({ state, currentPlayerId, selectedIndex, onPlayAgain, onMainMenu }: GameOverScreenProps) {
  const { terminalWidth, terminalHeight, gameWidth, gameHeight } = useTerminalSize()
  const players = Object.values(state.players).sort((a, b) => b.kills - a.kills)
  const aliens = getAliens(state.entities)
  const victory = aliens.every(a => !a.alive)

  const menuItems = [
    ...(onPlayAgain ? [{ label: 'Play Again', key: 'R' }] : []),
    ...(onMainMenu ? [{ label: 'Main Menu', key: 'M' }] : []),
    { label: 'Quit', key: 'Q' },
  ]

  const boxWidth = Math.min(70, gameWidth - 4)

  return (
    // Outer box fills terminal, inner centering for game area
    <box width={terminalWidth} height={terminalHeight} justifyContent="center" alignItems="center">
      <box
        flexDirection="column"
        width={boxWidth}
        borderStyle="double"
        borderColor={victory ? COLORS.ui.success : COLORS.ui.error}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
      >
      <text fg={victory ? COLORS.ui.success : COLORS.ui.error}>
        <b>{victory ? `${SYM.star} VICTORY ${SYM.star}` : `${SYM.cross} GAME OVER ${SYM.cross}`}</b>
      </text>
      <box height={1} />
      <text fg={COLORS.ui.score}>Final Score: {state.score}</text>
      <text fg={COLORS.ui.wave}>Wave Reached: {state.wave}</text>
      <box height={1} />
      <text fg={COLORS.ui.selectedText}><b>Player Stats:</b></text>
      {players.map((p, i) => {
        const playerColor = getPlayerColor(p.slot)
        return (
          <box key={p.id}>
            <text fg={i === 0 ? COLORS.ui.score : playerColor}>
              {i === 0 ? SYM.trophy : ` ${i + 1}`} {p.name}
            </text>
            <box flexGrow={1} />
            <text fg={COLORS.ui.selectedText}>{p.kills} kills</text>
          </box>
        )
      })}
      <box height={1} />
      <box flexDirection="column">
        {menuItems.map((item, i) => (
          <box key={i}>
            <text fg={selectedIndex === i ? COLORS.ui.selected : COLORS.ui.unselected}>
              {selectedIndex === i ? '▶ ' : '  '}
            </text>
            <text fg={selectedIndex === i ? COLORS.ui.selectedText : COLORS.ui.label}>
              <span fg={COLORS.ui.hotkey}>[{item.key}]</span> {item.label}
            </text>
          </box>
        ))}
      </box>
      <box height={1} />
      <text fg={COLORS.ui.unselected}>↑/↓ Navigate   ENTER Select</text>
      </box>
    </box>
  )
}

// Helper to get menu item count for this screen
export function getGameOverMenuItemCount(hasPlayAgain: boolean, hasMainMenu: boolean): number {
  return (hasPlayAgain ? 1 : 0) + (hasMainMenu ? 1 : 0) + 1  // +1 for Quit
}

// client/src/components/PlayerList.tsx
// Player list component showing ship sprites, names, and ready status

import type { Player, PlayerSlot } from '../../../shared/types'
import { getSprites, getTerminalPlayerColor, getColors } from '../sprites'

interface PlayerListProps {
  players: Player[]
  readyPlayerIds: string[]
  currentPlayerId: string
  maxPlayers?: number
}

interface PlayerRowProps {
  player: Player
  isReady: boolean
  isCurrentPlayer: boolean
}

interface EmptySlotProps {
  slot: PlayerSlot
}

/**
 * Renders a single player row with ship sprite, name, and ready status.
 * All elements are colored in the player's assigned color.
 */
function PlayerRow({ player, isReady, isCurrentPlayer }: PlayerRowProps) {
  const sprites = getSprites()
  const colors = getColors()
  const playerColor = getTerminalPlayerColor(player.slot)

  // Use first line of ship sprite for compact display
  const shipSprite = sprites.player[0]

  // Format name with (you) indicator
  const displayName = isCurrentPlayer
    ? `${player.name} (you)`
    : player.name

  // Ready indicator: filled box when ready, empty when waiting
  const readyIndicator = isReady ? '[■]' : '[ ]'
  const readyText = isReady ? 'READY' : 'waiting'

  return (
    <box>
      {/* Ship sprite in player color */}
      <text fg={playerColor}>{shipSprite}</text>
      <box width={2} />
      {/* Player name in player color */}
      <text fg={playerColor} width={24}>{displayName}</text>
      <box flexGrow={1} />
      {/* Ready indicator in player color */}
      <text fg={playerColor}>{readyIndicator}</text>
      <box width={1} />
      <text fg={playerColor}>{readyText}</text>
    </box>
  )
}

/**
 * Renders an empty player slot placeholder.
 */
function EmptySlot({ slot }: EmptySlotProps) {
  const sprites = getSprites()
  const colors = getColors()

  // Use dashes to indicate empty ship slot
  const emptyShip = '─────'

  return (
    <box>
      <text fg={colors.ui.dim}>{emptyShip}</text>
      <box width={2} />
      <text fg={colors.ui.dim} width={24}>(open)</text>
      <box flexGrow={1} />
      <text fg={colors.ui.dim}>[ ]</text>
      <box width={1} />
      <text fg={colors.ui.dim}>      </text>
    </box>
  )
}

/**
 * Player list component for the lobby screen.
 * Shows all players with their ship sprites and ready status,
 * plus empty slots for remaining player positions.
 */
export function PlayerList({
  players,
  readyPlayerIds,
  currentPlayerId,
  maxPlayers = 4
}: PlayerListProps) {
  // Sort players by slot to ensure consistent ordering
  const sortedPlayers = [...players].sort((a, b) => a.slot - b.slot)

  // Calculate which slots are taken
  const takenSlots = new Set(players.map(p => p.slot))

  // Generate empty slots for positions not taken
  const emptySlots: PlayerSlot[] = []
  for (let i = 1; i <= maxPlayers; i++) {
    if (!takenSlots.has(i as PlayerSlot)) {
      emptySlots.push(i as PlayerSlot)
    }
  }

  return (
    <box flexDirection="column">
      {/* Render joined players */}
      {sortedPlayers.map(player => (
        <PlayerRow
          key={player.id}
          player={player}
          isReady={readyPlayerIds.includes(player.id)}
          isCurrentPlayer={player.id === currentPlayerId}
        />
      ))}

      {/* Render empty slots */}
      {emptySlots.map(slot => (
        <EmptySlot key={`empty-${slot}`} slot={slot} />
      ))}
    </box>
  )
}

// Export sub-components for testing
export { PlayerRow, EmptySlot }

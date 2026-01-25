// client/src/components/GameScreen.tsx
// Main game screen rendering with 2-line sprites and color cycling effects

import type {
  GameState,
  Player,
  BarrierEntity,
  ClassicAlienType,
  UFOEntity,
} from '../../../shared/types'
import {
  LAYOUT,
  getAliens,
  getBullets,
  getBarriers,
  getUFOs,
} from '../../../shared/types'
import { SPRITES, SPRITE_SIZE, COLORS, getPlayerColor } from '../sprites'
import { SYMBOLS as SYM } from '../capabilities'
import { useTerminalSize } from '../hooks/useTerminalSize'

// Terminal-compatible color cycling effects
import {
  getUFOColor,
} from '../effects'

interface GameScreenProps {
  state: GameState
  currentPlayerId: string
  isMuted?: boolean
  isMusicMuted?: boolean
}

export function GameScreen({ state, currentPlayerId, isMuted = false, isMusicMuted = false }: GameScreenProps) {
  const { terminalWidth, terminalHeight, gameWidth, gameHeight, offsetX, offsetY, isTooSmall } = useTerminalSize()

  const { entities, players, score, wave, mode, status } = state
  const aliens = getAliens(entities)
  const bullets = getBullets(entities)
  const barriers = getBarriers(entities)
  const ufos = getUFOs(entities)
  const playerCount = Object.keys(players).length
  const currentPlayer = players[currentPlayerId]
  const myLives = currentPlayer?.lives ?? 0
  const maxLives = mode === 'solo' ? 3 : 5

  // If terminal too small, show warning
  if (isTooSmall) {
    return (
      <box width={terminalWidth} height={terminalHeight} justifyContent="center" alignItems="center" flexDirection="column">
        <text fg={COLORS.ui.error}><b>Terminal Too Small</b></text>
        <box height={1} />
        <text fg={COLORS.ui.selectedText}>Required: {gameWidth}x{gameHeight}</text>
        <text fg={COLORS.ui.dim}>Current: {terminalWidth}x{terminalHeight}</text>
        <box height={1} />
        <text fg={COLORS.ui.unselected}>Please resize your terminal.</text>
      </box>
    )
  }

  return (
    // Outer box fills terminal, inner box is centered game
    <box width={terminalWidth} height={terminalHeight} justifyContent="center" alignItems="center">
      <box flexDirection="column" width={gameWidth} height={gameHeight}>
        {/* Header */}
        <box height={1} paddingLeft={1} paddingRight={1}>
          <text fg={COLORS.ui.title}><b>VADERS</b></text>
          <box flexGrow={1} />
          <text fg={COLORS.ui.unselected}>{mode === 'solo' ? 'SOLO' : `${playerCount}P CO-OP`}</text>
          <box width={2} />
          <text fg={COLORS.ui.score}>SCORE:{score.toString().padStart(6, '0')}</text>
          <box width={2} />
          <text fg={COLORS.ui.wave}>WAVE:{wave}</text>
          <box width={2} />
          <text fg={COLORS.ui.lives}>
            {SYM.heart.repeat(myLives)}
            <span fg={COLORS.ui.livesEmpty}>{SYM.heartEmpty.repeat(Math.max(0, maxLives - myLives))}</span>
          </text>
        </box>

        {/* Countdown overlay */}
        {status === 'countdown' && state.countdownRemaining !== null && (
          <box position="absolute" width={gameWidth} height={gameHeight} justifyContent="center" alignItems="center">
            <box flexDirection="column" alignItems="center">
              <text fg={COLORS.ui.warning}><b>GET READY!</b></text>
              <box height={1} />
              <text fg={COLORS.ui.selectedText}><b>{state.countdownRemaining}</b></text>
            </box>
          </box>
        )}

        {/* Game Area */}
        <box flexGrow={1} position="relative" borderStyle="single" borderColor={COLORS.ui.border}>
          {/* UFOs - top of screen */}
          {ufos.filter(u => u.alive).map(ufo => (
            <UFOSprite key={`ufo-${ufo.id}`} ufo={ufo} tick={state.tick} />
          ))}

          {/* Aliens - 2 line sprites */}
          {aliens.filter(a => a.alive).map(alien => (
            <AlienSprite key={`alien-${alien.id}`} x={alien.x} y={alien.y} type={alien.type} />
          ))}

          {/* Bullets */}
          {bullets.map(bullet => (
            <text
              key={`bullet-${bullet.id}`}
              position="absolute"
              top={bullet.y}
              left={bullet.x}
              fg={bullet.dy < 0 ? COLORS.bullet.player : COLORS.bullet.alien}
            >
              {bullet.dy < 0 ? SPRITES.bullet.player : SPRITES.bullet.alien}
            </text>
          ))}

          {/* Barriers - 2 line sprites */}
          {barriers.map(barrier => (
            <Barrier key={barrier.id} barrier={barrier} />
          ))}

          {/* Players - 2 line sprites */}
          {Object.values(players).map(player => (
            <PlayerShip
              key={player.id}
              player={player}
              isCurrentPlayer={player.id === currentPlayerId}
              tick={state.tick}
            />
          ))}
        </box>

        {/* Status Bar */}
        <box height={1} paddingLeft={1} paddingRight={1}>
          <text fg={COLORS.ui.unselected}>Arrows Move  SPACE Shoot  M Mute  N Music  Q Quit</text>
          <box flexGrow={1} />
          {isMuted && <text fg={COLORS.ui.dim}>[SFX OFF] </text>}
          {isMusicMuted && <text fg={COLORS.ui.dim}>[MUSIC OFF] </text>}
          <PlayerScores players={players} currentPlayerId={currentPlayerId} />
        </box>
      </box>
    </box>
  )
}

// ─── Game Sprites ──────────────────────────────────────────────────────────────

// 2-line alien sprite
function AlienSprite({ x, y, type }: { x: number; y: number; type: ClassicAlienType }) {
  const sprite = SPRITES.alien[type]
  const color = COLORS.alien[type]
  return (
    <box position="absolute" top={y} left={x} flexDirection="column">
      <text fg={color}>{sprite[0]}</text>
      <text fg={color}>{sprite[1]}</text>
    </box>
  )
}

// 2-line player sprite
function PlayerShip({
  player,
  isCurrentPlayer,
  tick,
}: {
  player: Player
  isCurrentPlayer: boolean
  tick: number
}) {
  // Don't render dead players unless respawning
  if (!player.alive) {
    if (!player.respawnAtTick) return null
    // Blink effect while waiting to respawn
    if (Math.floor(tick / 10) % 2 === 0) return null
  }

  const playerColor = getPlayerColor(player.slot)

  // Center the 5-wide sprite on player.x
  const spriteX = player.x - Math.floor(SPRITE_SIZE.player.width / 2)

  return (
    <box position="absolute" top={LAYOUT.PLAYER_Y} left={spriteX} flexDirection="column">
      <text fg={player.alive ? playerColor : COLORS.ui.dim}>{SPRITES.player[0]}</text>
      <text fg={player.alive ? playerColor : COLORS.ui.dim}>{SPRITES.player[1]}</text>
      {/* Player indicator below ship */}
      <text fg={playerColor}>
        {'  '}{isCurrentPlayer ? 'v' : `P${player.slot}`}
      </text>
    </box>
  )
}

function PlayerScores({
  players,
  currentPlayerId
}: {
  players: Record<string, Player>
  currentPlayerId: string
}) {
  const sorted = Object.values(players).sort((a, b) => a.slot - b.slot)
  return (
    <box>
      {sorted.map((p, i) => {
        const playerColor = getPlayerColor(p.slot)
        return (
          <text key={p.id} fg={playerColor}>
            {i > 0 ? ' ' : ''}
            {p.id === currentPlayerId ? SYM.pointer : ' '}
            {p.name}:{p.kills}
            <span fg={COLORS.ui.lives}>{SYM.heart.repeat(p.lives)}</span>
            {!p.alive && p.respawnAtTick ? SYM.skull : ''}
          </text>
        )
      })}
    </box>
  )
}

// 2-line barrier segments
function Barrier({ barrier }: { barrier: BarrierEntity }) {
  return (
    <>
      {barrier.segments.filter(s => s.health > 0).map((seg, i) => {
        const sprite = SPRITES.barrier[seg.health as 1 | 2 | 3 | 4]
        const color = COLORS.barrier[seg.health as 1 | 2 | 3 | 4] || COLORS.ui.dim
        return (
          <box
            key={i}
            position="absolute"
            top={LAYOUT.BARRIER_Y + seg.offsetY * SPRITE_SIZE.barrier.height}
            left={barrier.x + seg.offsetX * SPRITE_SIZE.barrier.width}
            flexDirection="column"
          >
            <text fg={color}>{sprite[0]}</text>
            <text fg={color}>{sprite[1]}</text>
          </box>
        )
      })}
    </>
  )
}

// UFO sprite - mystery ship at top of screen with color cycling
function UFOSprite({ ufo, tick }: { ufo: UFOEntity; tick: number }) {
  const color = getUFOColor(tick)

  return (
    <box position="absolute" top={ufo.y} left={ufo.x} flexDirection="column">
      <text fg={color}>{SPRITES.ufo[0]}</text>
      <text fg={color}>{SPRITES.ufo[1]}</text>
    </box>
  )
}

// client/src/components/GameOverScreen.tsx
// Game over screen with final stats

import { useState, useEffect } from 'react'
import type { GameState } from '../../../shared/types'
import { getAliens } from '../../../shared/types'
import { SYMBOLS as SYM } from '../capabilities'
import { COLORS, getPlayerColor } from '../sprites'
import { useTerminalSize } from '../hooks/useTerminalSize'
import { GradientText } from './GradientText'
import { GRADIENT_PRESETS, interpolateGradient } from '../gradient'
import { supportsRichColor, getTerminalCapabilities, convertColorForTerminal } from '../terminal'
import { ConfettiSystem, getConfettiDisplayColor } from '../animation/confetti'

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
  const richColor = supportsRichColor()
  const caps = getTerminalCapabilities()

  const menuItems = [
    ...(onPlayAgain ? [{ label: 'Play Again', key: 'R' }] : []),
    ...(onMainMenu ? [{ label: 'Main Menu', key: 'M' }] : []),
    { label: 'Quit', key: 'Q' },
  ]

  const boxWidth = Math.min(70, gameWidth - 4)

  // Victory confetti
  const [confettiParticles, setConfettiParticles] = useState<Array<{ x: number; y: number; char: string; color: string }>>([])

  useEffect(() => {
    if (!victory) return

    const system = new ConfettiSystem(
      { width: terminalWidth, height: terminalHeight },
      { maxParticles: 100, particlesPerBurst: 20 },
    )
    system.start()

    const id = setInterval(() => {
      system.update()
      if (!system.isRunning() && !system.hasVisibleParticles()) {
        clearInterval(id)
        setConfettiParticles([])
        return
      }
      setConfettiParticles(
        system.getVisibleParticles().map(p => ({
          x: Math.round(p.x),
          y: Math.round(p.y),
          char: p.char,
          color: getConfettiDisplayColor(p.color, p.opacity),
        })),
      )
    }, 50)

    return () => clearInterval(id)
  }, [victory, terminalWidth, terminalHeight])

  // Header text
  const headerText = victory ? `${SYM.star} VICTORY ${SYM.star}` : `${SYM.cross} GAME OVER ${SYM.cross}`
  const headerPreset = victory ? GRADIENT_PRESETS.victory : GRADIENT_PRESETS.danger
  const headerFallback = victory ? COLORS.ui.success : COLORS.ui.error

  return (
    <box width={terminalWidth} height={terminalHeight} justifyContent="center" alignItems="center">
      {/* Confetti behind dialog */}
      {confettiParticles.map((p, i) => (
        <text
          key={`c-${i}`}
          position="absolute"
          top={p.y}
          left={p.x}
          fg={convertColorForTerminal(p.color, caps)}
        >
          {p.char}
        </text>
      ))}

      <box
        flexDirection="column"
        width={boxWidth}
        borderStyle="double"
        borderColor={headerFallback}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
      >
      {richColor
        ? <GradientText text={headerText} colors={headerPreset} fallbackColor={headerFallback} richColor={richColor} />
        : <text fg={headerFallback}><b>{headerText}</b></text>
      }
      <box height={1} />
      {richColor
        ? <GradientText text={`Final Score: ${state.score}`} colors={GRADIENT_PRESETS.victory} fallbackColor={COLORS.ui.score} richColor={richColor} />
        : <text fg={COLORS.ui.score}>Final Score: {state.score}</text>
      }
      {richColor
        ? <GradientText text={`Wave Reached: ${state.wave}`} colors={GRADIENT_PRESETS.ocean} fallbackColor={COLORS.ui.wave} richColor={richColor} />
        : <text fg={COLORS.ui.wave}>Wave Reached: {state.wave}</text>
      }
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
        {menuItems.map((item, i) => {
          const selected = selectedIndex === i
          const labelColors = selected && richColor ? interpolateGradient(GRADIENT_PRESETS.vaders, item.label.length) : null
          return (
            <box key={i}>
              <text fg={selected ? COLORS.ui.selected : COLORS.ui.unselected}>
                {selected ? '▶ ' : '  '}
              </text>
              <text fg={selected ? COLORS.ui.selectedText : COLORS.ui.label}>
                <span fg={COLORS.ui.hotkey}>[{item.key}]</span>{' '}
                {labelColors
                  ? item.label.split('').map((ch, ci) => <span key={ci} fg={labelColors[ci]}>{ch}</span>)
                  : item.label
                }
              </text>
            </box>
          )
        })}
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

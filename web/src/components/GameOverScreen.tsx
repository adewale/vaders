import { useCallback, useEffect, useMemo } from 'react'
import type { GameState, Player, PlayerSlot } from '../../../shared/types'
import { COLORS } from '../../../client-core/src/sprites/colors'
import { MenuBackground } from './MenuBackground'
import { HintsBar } from './HintsBar'

interface LeaderboardEntry {
  player: Player
  rank: number // Dense ranking (1, 2, 2, 4)
  isTopScorer: boolean
}

/**
 * Rank players by kills descending and compute dense rankings.
 * All players tied for first receive a trophy (isTopScorer = true).
 * Ties below first share a rank (dense ranking: 1, 2, 2, 4).
 */
function rankPlayers(players: Record<string, Player>): LeaderboardEntry[] {
  const sorted = Object.values(players)
    .slice()
    .sort((a, b) => b.kills - a.kills)
  if (sorted.length === 0) return []
  const topKills = sorted[0].kills
  const result: LeaderboardEntry[] = []
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]
    // Dense ranking: rank = 1 + number of players strictly ahead on kills
    const rank = 1 + sorted.filter((q) => q.kills > p.kills).length
    result.push({
      player: p,
      rank,
      isTopScorer: p.kills === topKills,
    })
  }
  return result
}

interface GameOverScreenProps {
  state: GameState
  playerId: string | null
  onReplay: () => void
  onQuit: () => void
}

export function GameOverScreen({ state, playerId, onReplay, onQuit }: GameOverScreenProps) {
  const isVictory = state.lives > 0
  const player = playerId ? state.players[playerId] : null
  const leaderboard = useMemo(() => rankPlayers(state.players), [state.players])

  const handleShare = useCallback(() => {
    const origin = typeof window !== 'undefined' ? window.location.href : ''
    const text = `I scored ${state.score} on wave ${state.wave} in Vaders! Play at ${origin}`
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
  }, [state.score, state.wave])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R' || e.key === 'Enter') {
        onReplay()
      } else if (e.key === 'q' || e.key === 'Q' || e.key === 'Escape') {
        onQuit()
      } else if (e.key === 'x' || e.key === 'X') {
        handleShare()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onReplay, onQuit, handleShare])

  return (
    <MenuBackground>
      <div
        className="vaders-screen"
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-body)',
          fontSize: 18,
          boxSizing: 'border-box',
        }}
      >
        <h1
          data-testid="game-over-headline"
          className={`vaders-headline ${isVictory ? 'vaders-headline--victory' : 'vaders-headline--defeat'}`}
          style={{
            color: isVictory ? COLORS.ui.success : COLORS.ui.error,
            fontFamily: 'var(--font-display)',
            fontSize: 64,
            letterSpacing: '0.18em',
            fontWeight: 'bold',
            textShadow: isVictory
              ? '0 0 28px rgba(0, 255, 0, 0.7), 0 0 56px rgba(0, 255, 0, 0.35)'
              : '0 0 28px rgba(255, 0, 0, 0.7), 0 0 56px rgba(255, 0, 0, 0.35)',
            margin: 0,
          }}
        >
          {isVictory ? 'VICTORY' : 'GAME OVER'}
        </h1>

        <div
          style={{
            marginTop: 24,
            color: COLORS.ui.selectedText,
            textAlign: 'center',
            border: `1px solid ${COLORS.ui.border}`,
            padding: '16px 32px',
            background: 'rgba(0, 0, 0, 0.45)',
            borderRadius: 4,
          }}
        >
          <p style={{ color: COLORS.ui.score, fontSize: 24, margin: 0 }}>Score: {state.score}</p>
          <p style={{ color: COLORS.ui.label, marginTop: 8, marginBottom: 0 }}>Wave reached: {state.wave}</p>
          {player && (
            <p style={{ color: COLORS.ui.label, marginTop: 4, marginBottom: 0 }}>
              Aliens destroyed this run: {player.kills}
            </p>
          )}
        </div>

        {leaderboard.length > 0 && (
          <div
            data-testid="leaderboard"
            style={{
              marginTop: 16,
              minWidth: 360,
              border: `1px solid ${COLORS.ui.border}`,
              padding: '12px 20px',
              background: 'rgba(0, 0, 0, 0.45)',
              borderRadius: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div
              style={{
                color: COLORS.ui.selectedText,
                fontWeight: 'bold',
                marginBottom: 4,
                textAlign: 'center',
                letterSpacing: '0.08em',
              }}
            >
              MATCH SCOREBOARD
            </div>
            {leaderboard.map(({ player: p, rank, isTopScorer }) => {
              const slotColor = COLORS.player[p.slot as PlayerSlot]
              const isYou = p.id === playerId
              const rankGlyph = isTopScorer ? '🏆' : `${rank}.`
              return (
                <div
                  key={p.id}
                  data-testid="leaderboard-row"
                  data-slot={p.slot}
                  data-rank={rank}
                  data-is-you={isYou ? 'true' : 'false'}
                  data-kills={p.kills}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  <span
                    style={{
                      minWidth: 32,
                      textAlign: 'center',
                      color: isTopScorer ? COLORS.ui.score : COLORS.ui.label,
                    }}
                  >
                    {rankGlyph}
                  </span>
                  <span data-testid="slot-badge" style={{ color: slotColor, fontWeight: 'bold' }}>
                    [{p.slot}]
                  </span>
                  <span style={{ color: slotColor, flexGrow: 1 }}>
                    {p.name}
                    {isYou ? ' (you)' : ''}
                  </span>
                  <span
                    style={{
                      color: COLORS.ui.selectedText,
                      textAlign: 'right',
                      minWidth: 48,
                    }}
                  >
                    {p.kills}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ marginTop: 32, display: 'flex', gap: 16 }}>
          <button
            type="button"
            onClick={onReplay}
            data-testid="replay-button"
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
            Play Again
          </button>
          <button
            type="button"
            onClick={onQuit}
            data-testid="quit-button"
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
            Quit
          </button>
          <button
            type="button"
            onClick={handleShare}
            data-testid="share-button"
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
            Share Score
          </button>
        </div>

        <HintsBar
          screen="game-over"
          hints={[
            ['R / ENTER', 'Play Again'],
            ['X', 'Share Score'],
            ['Q / ESC', 'Quit'],
            ['?', 'Help'],
          ]}
        />
      </div>
    </MenuBackground>
  )
}

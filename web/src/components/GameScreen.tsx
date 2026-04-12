import { useRef, useEffect } from 'react'
import type { GameState } from '../../../shared/types'
import { buildDrawCommands, executeDrawCommands, resetEffects } from '../renderer/canvasRenderer'
import { useCanvasScale } from '../hooks/useCanvasScale'
import { waitForFonts } from '../typography'
import { HintsBar } from './HintsBar'

// In-game keyboard hints — kept next to the component so the set is reviewable
// at the call site rather than scattered through the codebase. Mirrors the
// TUI's bottom-row shortcut legend so new players don't have to hit ? to
// discover forfeit / mute.
const GAME_HINTS: Array<[string, string]> = [
  ['← →', 'Move'],
  ['SPACE', 'Shoot'],
  ['X', 'Forfeit'],
  ['M', 'Mute SFX'],
  ['N', 'Mute Music'],
  ['?', 'Help'],
]

/** Pixels per game cell */
export const CELL_W = 8
export const CELL_H = 16
export const CANVAS_WIDTH = 120 * CELL_W // 960
export const CANVAS_HEIGHT = 36 * CELL_H // 576

interface GameScreenProps {
  state: GameState
  playerId: string | null
  prevState?: GameState | null
}

export function GameScreen({ state, playerId, prevState = null }: GameScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { scale, offsetX, offsetY } = useCanvasScale(CANVAS_WIDTH, CANVAS_HEIGHT)

  // Timestamp of the most recent server state update — used to compute lerpT
  // for per-frame interpolation on the rAF render loop below.
  const lastStateTimeRef = useRef(performance.now())
  useEffect(() => {
    lastStateTimeRef.current = performance.now()
  }, [state])

  // Reset module-level effect state when this screen unmounts so a new game
  // starts with clean effect state (no leftover dead-alien IDs, confetti, etc.).
  // Limitation: this covers the quit→launch→new-game path because GameScreen
  // fully unmounts. It does NOT cover staying mounted across wave transitions
  // or room changes without unmount; those paths would need an in-place reset
  // keyed on roomCode/tick drop. Deferred for now.
  useEffect(() => {
    return () => resetEffects()
  }, [])

  useEffect(() => {
    let raf = 0
    let active = true
    const render = () => {
      if (!active) return
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          // 33ms ≈ one server tick at 30Hz. Clamp so we don't overshoot if
          // the next sync is late (bullets park at the current position).
          const elapsed = performance.now() - lastStateTimeRef.current
          const lerpT = Math.min(1, elapsed / 33)
          const commands = buildDrawCommands(state, playerId, prevState, scale, lerpT)
          // Thread state.tick through so tick-deterministic effects (shake
          // jitter, CRT scanline breathing) don't re-roll per rAF frame.
          executeDrawCommands(ctx, commands, state.tick)
        }
      }
      raf = requestAnimationFrame(render)
    }
    // Canvas text doesn't re-paint if a web font arrives after fillText, so
    // gate the initial render loop on document.fonts.ready. This is a no-op in
    // jsdom / environments lacking the Fonts API.
    waitForFonts().then(() => {
      if (!active) return
      raf = requestAnimationFrame(render)
    })
    return () => {
      active = false
      if (raf) cancelAnimationFrame(raf)
    }
  }, [state, playerId, prevState, scale])

  // Set CSS width/height directly on the canvas (not a CSS transform) so that
  // the element's layout box matches its visible size. Using `transform: scale`
  // on top of flex-centering overflows the viewport because flex positions the
  // pre-transform box and the scaled content extends past it.
  const displayWidth = CANVAS_WIDTH * scale
  const displayHeight = CANVAS_HEIGHT * scale

  return (
    <div style={{ position: 'relative', width: displayWidth, height: displayHeight }}>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        data-testid="game-canvas"
        style={{
          display: 'block',
          width: displayWidth,
          height: displayHeight,
          imageRendering: 'pixelated',
        }}
      />
      {/* HUD is rendered on canvas via buildDrawCommands */}
      {/* Keep a hidden score element for E2E test selectors */}
      <span data-testid="score" style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}>
        SCORE: {state.score}
      </span>
      <HintsBar role="game" hints={GAME_HINTS} />
    </div>
  )
}

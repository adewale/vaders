// client/src/hooks/useDissolveEffects.ts
// React hook that detects entity deaths and barrier damage,
// drives a DissolveSystem, and returns cells for rendering.

import { useState, useEffect, useRef } from 'react'
import type { GameState } from '../../../shared/types'
import { getAliens, getBarriers, getUFOs, LAYOUT } from '../../../shared/types'
import type { ServerEvent } from '../../../shared/protocol'
import { DissolveSystem, type DissolveCellOutput } from '../animation/dissolve'
import { COLORS, SPRITE_SIZE, getPlayerColor } from '../sprites'
import { supportsBraille, getTerminalCapabilities } from '../terminal'

const ANIMATION_INTERVAL_MS = 70

export interface UseDissolveEffectsReturn {
  cells: DissolveCellOutput[]
}

/**
 * Detects entity deaths (via events) and barrier damage (via state diffing),
 * spawns braille dissolve/shimmer effects, and returns renderable cells.
 */
export function useDissolveEffects(
  state: GameState,
  prevState: GameState | null,
  lastEvent: ServerEvent | null,
): UseDissolveEffectsReturn {
  const caps = getTerminalCapabilities()
  const braille = supportsBraille(caps)

  const systemRef = useRef<DissolveSystem | null>(null)
  if (!systemRef.current) {
    systemRef.current = new DissolveSystem({
      useAscii: !braille,
    })
  }

  const [cells, setCells] = useState<DissolveCellOutput[]>([])

  // Track last processed event to avoid re-processing
  const lastProcessedEventRef = useRef<ServerEvent | null>(null)

  // Handle events: alien_killed (squid only), player_died
  useEffect(() => {
    if (!lastEvent || lastEvent === lastProcessedEventRef.current) return
    if (!prevState) return
    lastProcessedEventRef.current = lastEvent

    const system = systemRef.current!

    if (lastEvent.name === 'alien_killed') {
      const data = lastEvent.data as { alienId: string; playerId: string | null }
      const aliens = getAliens(prevState.entities)
      const alien = aliens.find(a => a.id === data.alienId)
      // Only dissolve top-row aliens (squid type)
      if (alien && alien.type === 'squid') {
        const color = COLORS.alien[alien.type] ?? '#ffffff'
        system.spawn(
          alien.x,
          alien.y,
          SPRITE_SIZE.alien.width,
          SPRITE_SIZE.alien.height,
          color,
          'dissolve',
        )
      }
    }

    if (lastEvent.name === 'player_died') {
      const data = lastEvent.data as { playerId: string }
      const player = prevState.players[data.playerId]
      if (player) {
        const color = getPlayerColor(player.slot)
        // Player.x is CENTER, sprite is 5 wide, so left edge = x - 2
        const spriteX = player.x - Math.floor(SPRITE_SIZE.player.width / 2)
        system.spawn(
          spriteX,
          LAYOUT.PLAYER_Y,
          SPRITE_SIZE.player.width,
          SPRITE_SIZE.player.height,
          color,
          'dissolve',
        )
      }
    }
  }, [lastEvent, prevState])

  // Handle barrier damage via state diffing
  const prevBarriersRef = useRef<string | null>(null)

  useEffect(() => {
    if (!prevState) return
    const system = systemRef.current!

    const currentBarriers = getBarriers(state.entities)
    const prevBarriers = getBarriers(prevState.entities)

    // Quick check: serialize barrier health to avoid unnecessary diffing
    const currentKey = currentBarriers.map(b =>
      b.segments.map(s => s.health).join(',')
    ).join(';')

    if (currentKey === prevBarriersRef.current) return
    prevBarriersRef.current = currentKey

    for (const barrier of currentBarriers) {
      const prevBarrier = prevBarriers.find(b => b.id === barrier.id)
      if (!prevBarrier) continue

      for (let i = 0; i < barrier.segments.length; i++) {
        const curr = barrier.segments[i]
        const prev = prevBarrier.segments[i]
        if (prev && prev.health > curr.health) {
          const segX = barrier.x + curr.offsetX * SPRITE_SIZE.barrier.width
          const segY = LAYOUT.BARRIER_Y + curr.offsetY * SPRITE_SIZE.barrier.height
          const color = COLORS.barrier[prev.health as 1 | 2 | 3 | 4] ?? '#ffff00'
          system.spawn(segX, segY, SPRITE_SIZE.barrier.width, SPRITE_SIZE.barrier.height, color, 'shimmer')
        }
      }
    }
  }, [state.entities, prevState])

  // Handle UFO death via state diffing (no server event for UFO kills)
  useEffect(() => {
    if (!prevState) return
    const system = systemRef.current!

    const prevUfos = getUFOs(prevState.entities)
    const currentUfos = getUFOs(state.entities)

    for (const prevUfo of prevUfos) {
      if (!prevUfo.alive) continue
      const currentUfo = currentUfos.find(u => u.id === prevUfo.id)
      // UFO was alive in prevState but gone or dead in current state
      if (!currentUfo || !currentUfo.alive) {
        system.spawn(
          prevUfo.x,
          prevUfo.y,
          SPRITE_SIZE.ufo.width,
          SPRITE_SIZE.ufo.height,
          '#ff00ff', // Magenta — matches UFO's cycling color palette
          'dissolve',
        )
      }
    }
  }, [state.entities, prevState])

  // Animation loop
  // Track previous cells reference to avoid unnecessary re-renders (ISSUE 1)
  const prevCellsRef = useRef<DissolveCellOutput[]>([])

  useEffect(() => {
    const system = systemRef.current!
    const id = setInterval(() => {
      system.update()

      // ISSUE 2: Early-out when no active effects and cells already empty
      const prev = prevCellsRef.current
      if (system.getActiveCount() === 0 && prev.length === 0) return

      const newCells = system.getCells()

      // ISSUE 1: Skip setCells when both old and new are empty arrays
      if (newCells.length === 0 && prev.length === 0) return

      prevCellsRef.current = newCells
      setCells(newCells)
    }, ANIMATION_INTERVAL_MS)

    return () => clearInterval(id)
  }, [])

  return { cells }
}

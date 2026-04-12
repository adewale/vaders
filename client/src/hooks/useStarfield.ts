// client/src/hooks/useStarfield.ts
// React hook wrapping StarfieldSystem for use in game components

import { useRef } from 'react'
import { StarfieldSystem, type StarCell, type StarfieldConfig } from '../animation/starfield'
import { ENABLE_STARFIELD } from '../config/featureFlags'

const EMPTY: StarCell[] = []

export function useStarfield(config?: Partial<StarfieldConfig>, options?: { enabled?: boolean }): (tick: number) => StarCell[] {
  const enabled = options?.enabled ?? ENABLE_STARFIELD
  const systemRef = useRef<StarfieldSystem | null>(null)

  if (!enabled) {
    return () => EMPTY
  }

  if (!systemRef.current) {
    systemRef.current = new StarfieldSystem(config)
  }

  return (tick: number) => systemRef.current!.getCells(tick)
}

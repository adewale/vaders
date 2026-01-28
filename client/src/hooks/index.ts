// client/src/hooks/index.ts
// React hooks for Vaders game

// Game connection and state
export { useGameConnection } from './useGameConnection'
export { useGameAudio, playShootSound, playMenuNavigateSound, playMenuSelectSound } from './useGameAudio'
export { useTerminalSize, STANDARD_WIDTH, STANDARD_HEIGHT } from './useTerminalSize'

// Visual enhancements
export {
  useEntranceAnimation,
  type UseEntranceAnimationOptions,
  type UseEntranceAnimationReturn,
  type EntranceAlien,
  type AlienVisualPosition,
} from './useEntranceAnimation'
export {
  useInterpolation,
  type UseInterpolationOptions,
  type UseInterpolationReturn,
  type EntityUpdate,
} from './useInterpolation'

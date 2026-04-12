// client-core/src/index.ts
// Platform-agnostic client library for Vaders
// Shared between TUI (OpenTUI) and web (React DOM + Canvas) frontends

// ─── Adapters (interfaces for platform-specific implementations) ─────────────
export type {
  InputAdapter,
  AudioAdapter,
  StorageAdapter,
  FrameScheduler,
  VisualConfig,
  VadersKey,
  SoundEvent,
} from './adapters'

// ─── Animation ──────────────────────────────────────────────────────────────
export {
  // Easing
  easeOutQuad,
  easeOutBounce,
  easeOutElastic,
  lerp,
  clamp,
  type EasingFunction,
} from './animation/easing'

export {
  // Interpolation
  InterpolationManager,
  HALF_BLOCKS,
  HALF_BLOCKS_ASCII,
  DEFAULT_INTERPOLATION_CONFIG,
  toRenderPosition,
  batchUpdateEntities,
  createFrameTiming,
  updateFrameTiming,
  markTick,
  lerpPosition,
  type InterpolatedPosition,
  type InterpolationConfig,
  type RenderPosition,
  type FrameTiming,
} from './animation/interpolation'

export {
  // Entrance animation
  EntranceAnimation,
  RAIN_ENTRANCE,
  WAVE_ENTRANCE,
  SCATTER_ENTRANCE,
  SLIDE_ENTRANCE,
  DEFAULT_ENTRANCE_CONFIG,
  createRainEntrance,
  type AlienAnimState,
  type AnimatedAlien,
  type EntrancePattern,
  type EntranceConfig,
} from './animation/entrance'

export {
  // Confetti
  ConfettiSystem,
  CONFETTI_CHARS,
  CONFETTI_CHARS_ASCII,
  CONFETTI_COLORS,
  DEFAULT_CONFETTI_CONFIG,
  getConfettiDisplayColor,
  type ConfettiParticle,
  type ConfettiOrigin,
  type ConfettiConfig,
  type ConfettiParticleRenderProps,
} from './animation/confetti'

export {
  // Starfield
  StarfieldSystem,
  STAR_LAYERS,
  DEFAULT_STARFIELD_CONFIG,
  type StarfieldConfig,
  type StarCell,
  type StarLayer,
} from './animation/starfield'

export {
  // Wave border
  WaveBorderAnimation,
  BRAILLE_DENSITY,
  MAX_DENSITY,
  ASPECT_RATIO,
  WAVE_COLORS,
  type WaveBorderConfig,
  type BorderCell,
} from './animation/waveBorder'

export {
  // Dissolve
  DissolveSystem,
  DISSOLVE_ASCII_CHARS,
  DISSOLVE_BRAILLE,
  DIRECTIONAL_DOTS,
  DEBRIS_MEDIUM,
  DEBRIS_HEAVY,
  TUMBLE_PATTERNS,
  DEFAULT_DISSOLVE_CONFIG,
  type DissolveConfig,
  type DissolveVariant,
  type DissolveEffect,
  type DissolveCellOutput,
} from './animation/dissolve'

export {
  // Gradient
  interpolateGradient,
  gradientMultiline,
  getWaveGradient,
  GRADIENT_PRESETS,
  type ColoredChar,
} from './animation/gradient'

// ─── Effects ────────────────────────────────────────────────────────────────
export { getUFOColor } from './effects/colorCycling'

// ─── Sprites (data only — no rendering) ─────────────────────────────────────
export {
  PIXEL_ART,
  SPRITE_SIZE,
  getAnimationFrame,
  type AnimatedSprite,
} from './sprites/bitmaps'

export {
  COLORS,
  GRADIENT_COLORS,
  getPlayerColor,
} from './sprites/colors'

// ─── Input ──────────────────────────────────────────────────────────────────
export type { VadersKey as VadersKeyType } from './input/types'
export { createHeldKeysTracker, type HeldKeys } from './input/heldKeys'

// ─── Audio ──────────────────────────────────────────────────────────────────
export {
  detectAudioTriggers,
  type AudioTriggerResult,
  type SoundEvent as SoundEventType,
} from './audio/triggers'

// ─── Connection ─────────────────────────────────────────────────────────────
export { useGameConnection } from './connection/useGameConnection'

// ─── Config ─────────────────────────────────────────────────────────────────
export { ENABLE_STARFIELD } from './config/featureFlags'

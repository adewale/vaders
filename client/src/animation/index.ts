// client/src/animation/index.ts
// Animation system for Vaders TUI game
//
// This module provides visual enhancements for the game including:
// - Easing functions for smooth animations
// - Confetti particle system for victory celebrations
// - Wave transition wipes (iris effect)
// - Alien entrance animations
// - Box-drawing border system
// - Smooth movement interpolation

// ─── Easing Functions ────────────────────────────────────────────────────────

export {
  // Basic easing
  linear,
  easeInQuad,
  easeOutQuad,
  easeInOutQuad,
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
  easeInSine,
  easeOutSine,
  // Special easing
  easeOutBounce,
  easeInBounce,
  easeOutElastic,
  easeOutBack,
  // Utilities
  lerp,
  clamp,
  inverseLerp,
  remap,
  // Types
  type EasingFunction,
  EASING_FUNCTIONS,
} from './easing'

// ─── Confetti Particle System ────────────────────────────────────────────────

export {
  // Main class
  ConfettiSystem,
  // Constants
  CONFETTI_CHARS,
  CONFETTI_CHARS_ASCII,
  CONFETTI_COLORS,
  // Configuration
  DEFAULT_CONFETTI_CONFIG,
  // Helpers
  getConfettiDisplayColor,
  // Types
  type ConfettiParticle,
  type ConfettiOrigin,
  type ConfettiConfig,
  type ConfettiParticleRenderProps,
} from './confetti'

// ─── Wave Transition Wipes ───────────────────────────────────────────────────

export {
  // Main class
  WipeTransition,
  // Block characters
  WIPE_BLOCKS,
  WIPE_BLOCKS_ASCII,
  // Mask functions
  createIrisMask,
  createIrisOpenMask,
  createHorizontalMask,
  createVerticalMask,
  createDiagonalMask,
  createDissolveMask,
  // Configuration
  DEFAULT_WIPE_CONFIG,
  // Factory functions
  createWaveWipe,
  // Types
  type WipeState,
  type WipePattern,
  type MaskFunction,
  type WipeConfig,
  type WipeCell,
} from './wipe'

// ─── Alien Entrance Animations ───────────────────────────────────────────────

export {
  // Main class
  EntranceAnimation,
  // Preset configurations
  RAIN_ENTRANCE,
  WAVE_ENTRANCE,
  SCATTER_ENTRANCE,
  SLIDE_ENTRANCE,
  // Configuration
  DEFAULT_ENTRANCE_CONFIG,
  // Factory functions
  createRainEntrance,
  // Types
  type AlienAnimState,
  type AnimatedAlien,
  type EntrancePattern,
  type EntranceConfig,
} from './entrance'

// ─── Smooth Movement Interpolation ───────────────────────────────────────────

export {
  // Main class
  InterpolationManager,
  // Half-block characters
  HALF_BLOCKS,
  HALF_BLOCKS_ASCII,
  // Configuration
  DEFAULT_INTERPOLATION_CONFIG,
  // Utility functions
  toRenderPosition,
  batchUpdateEntities,
  createFrameTiming,
  updateFrameTiming,
  markTick,
  lerpPosition,
  // Types
  type InterpolatedPosition,
  type InterpolationConfig,
  type RenderPosition,
  type FrameTiming,
} from './interpolation'

// client/src/animation/index.ts
// Animation system for Vaders TUI game
//
// This module provides visual enhancements for the game including:
// - Easing functions for smooth animations
// - Confetti particle system for victory celebrations
// - Alien entrance animations
// - Box-drawing border system
// - Smooth movement interpolation

// ─── Easing Functions ────────────────────────────────────────────────────────

export {
  // Basic easing
  easeOutQuad,
  // Special easing
  easeOutBounce,
  easeOutElastic,
  // Utilities
  lerp,
  clamp,
  // Types
  type EasingFunction,
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

// ─── Wave Announce Border Animation ─────────────────────────────────────────

export {
  // Main class
  WaveBorderAnimation,
  // Constants
  BRAILLE_DENSITY,
  MAX_DENSITY,
  ASPECT_RATIO,
  // Types
  type WaveBorderConfig,
  type BorderCell,
} from './waveBorder'

// ─── Dissolve Effects ──────────────────────────────────────────────────────

export {
  // Main class
  DissolveSystem,
  // Constants
  DISSOLVE_ASCII_CHARS,
  // Configuration
  DEFAULT_DISSOLVE_CONFIG,
  // Types
  type DissolveConfig,
  type DissolveVariant,
  type DissolveEffect,
  type DissolveCellOutput,
} from './dissolve'

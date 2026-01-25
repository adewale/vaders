// client/src/audio/sounds.ts
// Sound effect definitions and terminal bell fallback patterns

import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// Get the directory of this file (works in both Bun and Node ESM)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export type SoundName =
  | 'shoot'
  | 'alien_killed'
  | 'player_died'
  | 'wave_complete'
  | 'game_over'
  | 'menu_select'
  | 'menu_navigate'
  | 'countdown_tick'
  | 'game_start'
  | 'ufo'

// Sound file paths relative to client/sounds/
export const SOUND_FILES: Record<SoundName, string> = {
  shoot: join(__dirname, '../../sounds/shoot.wav'),
  alien_killed: join(__dirname, '../../sounds/alien_killed.wav'),
  player_died: join(__dirname, '../../sounds/player_died.wav'),
  wave_complete: join(__dirname, '../../sounds/wave_complete.wav'),
  game_over: join(__dirname, '../../sounds/game_over.wav'),
  menu_select: join(__dirname, '../../sounds/menu_select.wav'),
  menu_navigate: join(__dirname, '../../sounds/menu_navigate.wav'),
  countdown_tick: join(__dirname, '../../sounds/countdown_tick.wav'),
  game_start: join(__dirname, '../../sounds/game_start.wav'),
  ufo: join(__dirname, '../../sounds/ufo.wav'),
}

// Terminal bell patterns (number of beeps as fallback)
export const BELL_PATTERNS: Record<SoundName, number> = {
  shoot: 1,
  alien_killed: 1,
  player_died: 3,
  wave_complete: 2,
  game_over: 4,
  menu_select: 1,
  menu_navigate: 1,
  countdown_tick: 1,
  game_start: 2,
  ufo: 1,
}

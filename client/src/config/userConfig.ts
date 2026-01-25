// client/src/config/userConfig.ts
// User configuration persistence for mute state and other settings

import { homedir } from 'os'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

const CONFIG_DIR = join(homedir(), '.config', 'vaders')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

export interface UserConfig {
  audioMuted: boolean    // Sound effects muted
  musicMuted: boolean    // Background music muted
}

const DEFAULT_CONFIG: UserConfig = {
  audioMuted: false,
  musicMuted: false,
}

/**
 * Get user configuration, creating defaults if file doesn't exist
 */
export function getUserConfig(): UserConfig {
  try {
    if (!existsSync(CONFIG_PATH)) {
      return { ...DEFAULT_CONFIG }
    }
    const data = readFileSync(CONFIG_PATH, 'utf-8')
    const parsed = JSON.parse(data)
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

/**
 * Save user configuration (merges with existing config)
 */
export function setUserConfig(config: Partial<UserConfig>): void {
  try {
    // Ensure config directory exists
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true })
    }

    const existing = getUserConfig()
    const merged = { ...existing, ...config }
    writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8')
  } catch {
    // Silently fail - audio config is not critical
  }
}

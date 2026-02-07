// client/src/config/userConfig.test.ts
// Tests for user configuration persistence

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// We need to mock the config path since we don't want tests writing to the real user config.
// The approach: create a temporary directory and override the module's behavior by
// testing the actual functions with a temp config file.

// Since userConfig.ts uses hardcoded paths based on homedir(), we test the logic
// by directly testing the read/write/merge behavior with the fs operations it uses.

const TEST_DIR = join(tmpdir(), `vaders-test-config-${process.pid}`)
const TEST_CONFIG_PATH = join(TEST_DIR, 'config.json')

interface UserConfig {
  audioMuted: boolean
  musicMuted: boolean
}

const DEFAULT_CONFIG: UserConfig = {
  audioMuted: false,
  musicMuted: false,
}

// Replicate the getUserConfig logic for testability with custom path
function getUserConfigFromPath(configPath: string): UserConfig {
  try {
    if (!existsSync(configPath)) {
      return { ...DEFAULT_CONFIG }
    }
    const data = readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(data)
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

// Replicate the setUserConfig logic for testability with custom path
function setUserConfigAtPath(configDir: string, configPath: string, config: Partial<UserConfig>): void {
  try {
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }
    const existing = getUserConfigFromPath(configPath)
    const merged = { ...existing, ...config }
    writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8')
  } catch {
    // Silently fail - audio config is not critical
  }
}

describe('userConfig', () => {
  beforeEach(() => {
    // Clean up test directory before each test
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  afterEach(() => {
    // Clean up after tests
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  describe('getUserConfig (default values)', () => {
    test('returns default config when no config file exists', () => {
      const config = getUserConfigFromPath(TEST_CONFIG_PATH)
      expect(config.audioMuted).toBe(false)
      expect(config.musicMuted).toBe(false)
    })

    test('returned default config has all expected fields', () => {
      const config = getUserConfigFromPath(TEST_CONFIG_PATH)
      expect('audioMuted' in config).toBe(true)
      expect('musicMuted' in config).toBe(true)
    })

    test('returns a copy, not the same reference', () => {
      const config1 = getUserConfigFromPath(TEST_CONFIG_PATH)
      const config2 = getUserConfigFromPath(TEST_CONFIG_PATH)
      expect(config1).not.toBe(config2)
      expect(config1).toEqual(config2)
    })
  })

  describe('setUserConfig (writing)', () => {
    test('creates config directory if it does not exist', () => {
      expect(existsSync(TEST_DIR)).toBe(false)
      setUserConfigAtPath(TEST_DIR, TEST_CONFIG_PATH, { audioMuted: true })
      expect(existsSync(TEST_DIR)).toBe(true)
    })

    test('creates config file with correct content', () => {
      setUserConfigAtPath(TEST_DIR, TEST_CONFIG_PATH, { audioMuted: true })
      expect(existsSync(TEST_CONFIG_PATH)).toBe(true)

      const data = JSON.parse(readFileSync(TEST_CONFIG_PATH, 'utf-8'))
      expect(data.audioMuted).toBe(true)
      expect(data.musicMuted).toBe(false) // Default value preserved
    })

    test('writes valid JSON', () => {
      setUserConfigAtPath(TEST_DIR, TEST_CONFIG_PATH, { musicMuted: true })

      const rawData = readFileSync(TEST_CONFIG_PATH, 'utf-8')
      expect(() => JSON.parse(rawData)).not.toThrow()
    })

    test('writes formatted JSON (pretty-printed)', () => {
      setUserConfigAtPath(TEST_DIR, TEST_CONFIG_PATH, { audioMuted: true })

      const rawData = readFileSync(TEST_CONFIG_PATH, 'utf-8')
      // Pretty-printed JSON has newlines
      expect(rawData).toContain('\n')
    })
  })

  describe('config persistence (round-trip)', () => {
    test('written config can be read back', () => {
      setUserConfigAtPath(TEST_DIR, TEST_CONFIG_PATH, { audioMuted: true, musicMuted: true })

      const config = getUserConfigFromPath(TEST_CONFIG_PATH)
      expect(config.audioMuted).toBe(true)
      expect(config.musicMuted).toBe(true)
    })

    test('partial updates merge with existing values', () => {
      // Write initial config
      setUserConfigAtPath(TEST_DIR, TEST_CONFIG_PATH, { audioMuted: true })

      // Verify first write
      let config = getUserConfigFromPath(TEST_CONFIG_PATH)
      expect(config.audioMuted).toBe(true)
      expect(config.musicMuted).toBe(false)

      // Update only musicMuted
      setUserConfigAtPath(TEST_DIR, TEST_CONFIG_PATH, { musicMuted: true })

      // Verify both values are correct (audioMuted preserved from first write)
      config = getUserConfigFromPath(TEST_CONFIG_PATH)
      expect(config.audioMuted).toBe(true)
      expect(config.musicMuted).toBe(true)
    })

    test('overwriting a value preserves other values', () => {
      // Set both to true
      setUserConfigAtPath(TEST_DIR, TEST_CONFIG_PATH, { audioMuted: true, musicMuted: true })

      // Override only audioMuted to false
      setUserConfigAtPath(TEST_DIR, TEST_CONFIG_PATH, { audioMuted: false })

      const config = getUserConfigFromPath(TEST_CONFIG_PATH)
      expect(config.audioMuted).toBe(false) // Updated
      expect(config.musicMuted).toBe(true)  // Preserved
    })

    test('multiple sequential writes are all persisted', () => {
      setUserConfigAtPath(TEST_DIR, TEST_CONFIG_PATH, { audioMuted: true })
      setUserConfigAtPath(TEST_DIR, TEST_CONFIG_PATH, { musicMuted: true })
      setUserConfigAtPath(TEST_DIR, TEST_CONFIG_PATH, { audioMuted: false })

      const config = getUserConfigFromPath(TEST_CONFIG_PATH)
      expect(config.audioMuted).toBe(false)
      expect(config.musicMuted).toBe(true)
    })
  })

  describe('error handling', () => {
    test('handles corrupted JSON gracefully', () => {
      mkdirSync(TEST_DIR, { recursive: true })
      writeFileSync(TEST_CONFIG_PATH, '{ invalid json !!!', 'utf-8')

      const config = getUserConfigFromPath(TEST_CONFIG_PATH)
      // Should return defaults when JSON is corrupted
      expect(config.audioMuted).toBe(false)
      expect(config.musicMuted).toBe(false)
    })

    test('handles empty file gracefully', () => {
      mkdirSync(TEST_DIR, { recursive: true })
      writeFileSync(TEST_CONFIG_PATH, '', 'utf-8')

      const config = getUserConfigFromPath(TEST_CONFIG_PATH)
      expect(config.audioMuted).toBe(false)
      expect(config.musicMuted).toBe(false)
    })

    test('fills in missing fields with defaults', () => {
      mkdirSync(TEST_DIR, { recursive: true })
      // Write a config with only one field
      writeFileSync(TEST_CONFIG_PATH, JSON.stringify({ audioMuted: true }), 'utf-8')

      const config = getUserConfigFromPath(TEST_CONFIG_PATH)
      expect(config.audioMuted).toBe(true)
      expect(config.musicMuted).toBe(false) // Filled from default
    })

    test('ignores extra fields in config file', () => {
      mkdirSync(TEST_DIR, { recursive: true })
      writeFileSync(TEST_CONFIG_PATH, JSON.stringify({
        audioMuted: true,
        musicMuted: false,
        extraField: 'should be ignored in logic but present in object',
      }), 'utf-8')

      const config = getUserConfigFromPath(TEST_CONFIG_PATH)
      expect(config.audioMuted).toBe(true)
      expect(config.musicMuted).toBe(false)
      // Extra fields are spread into the object (behavior of ...DEFAULT, ...parsed)
    })
  })
})

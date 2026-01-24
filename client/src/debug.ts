// client/src/debug.ts
// Debug logging for keyboard troubleshooting

import { appendFileSync } from 'fs'

const LOG_FILE = '/tmp/vaders-debug.log'
// Enable debug logging by default for troubleshooting
const DEBUG_ENABLED = process.env.VADERS_DEBUG !== '0'

export function debugLog(category: string, message: string, data?: Record<string, unknown>) {
  if (!DEBUG_ENABLED) return

  const timestamp = new Date().toISOString()
  const entry = {
    timestamp,
    category,
    message,
    ...data,
  }

  try {
    appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n')
  } catch {
    // Ignore write errors
  }
}

export function clearDebugLog() {
  if (!DEBUG_ENABLED) return

  try {
    require('fs').writeFileSync(LOG_FILE, '')
  } catch {
    // Ignore errors
  }
}

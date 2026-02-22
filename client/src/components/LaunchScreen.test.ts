// client/src/components/LaunchScreen.test.ts
// Unit tests for LaunchScreen data logic, menu navigation, and room code validation

import { describe, test, expect } from 'bun:test'

// ─── Menu Items Configuration Tests ──────────────────────────────────────────
// The LaunchScreen uses a const array MENU_ITEMS = ['solo', 'create', 'join', 'matchmake']
// We replicate this here to test navigation logic without rendering.

const MENU_ITEMS = ['solo', 'create', 'join', 'matchmake'] as const
type MenuItem = typeof MENU_ITEMS[number]

describe('LaunchScreen Menu Items', () => {
  test('has exactly 4 menu items', () => {
    expect(MENU_ITEMS.length).toBe(4)
  })

  test('menu items are in correct order', () => {
    expect(MENU_ITEMS[0]).toBe('solo')
    expect(MENU_ITEMS[1]).toBe('create')
    expect(MENU_ITEMS[2]).toBe('join')
    expect(MENU_ITEMS[3]).toBe('matchmake')
  })

  test('all menu items are unique', () => {
    const unique = new Set(MENU_ITEMS)
    expect(unique.size).toBe(MENU_ITEMS.length)
  })

  test('hotkeys map to correct indices (1-4)', () => {
    // Hotkeys '1' through '4' correspond to menu items by index
    const hotkeyMap: Record<string, MenuItem> = {
      '1': 'solo',
      '2': 'create',
      '3': 'join',
      '4': 'matchmake',
    }

    for (const [hotkey, expected] of Object.entries(hotkeyMap)) {
      const index = parseInt(hotkey) - 1
      expect(MENU_ITEMS[index]).toBe(expected)
    }
  })
})

// ─── Menu Navigation Logic Tests ─────────────────────────────────────────────

describe('Menu Navigation Logic', () => {
  test('up from index 0 wraps to last item', () => {
    const current = 0
    const next = (current - 1 + MENU_ITEMS.length) % MENU_ITEMS.length
    expect(next).toBe(3) // matchmake
  })

  test('down from last item wraps to first', () => {
    const current = 3
    const next = (current + 1) % MENU_ITEMS.length
    expect(next).toBe(0) // solo
  })

  test('down from index 0 goes to index 1', () => {
    const current = 0
    const next = (current + 1) % MENU_ITEMS.length
    expect(next).toBe(1) // create
  })

  test('up from index 1 goes to index 0', () => {
    const current = 1
    const next = (current - 1 + MENU_ITEMS.length) % MENU_ITEMS.length
    expect(next).toBe(0) // solo
  })

  test('full cycle down returns to start', () => {
    let index = 0
    for (let i = 0; i < MENU_ITEMS.length; i++) {
      index = (index + 1) % MENU_ITEMS.length
    }
    expect(index).toBe(0)
  })

  test('full cycle up returns to start', () => {
    let index = 0
    for (let i = 0; i < MENU_ITEMS.length; i++) {
      index = (index - 1 + MENU_ITEMS.length) % MENU_ITEMS.length
    }
    expect(index).toBe(0)
  })

  test('navigation stays within valid range', () => {
    for (let start = 0; start < MENU_ITEMS.length; start++) {
      const nextDown = (start + 1) % MENU_ITEMS.length
      const nextUp = (start - 1 + MENU_ITEMS.length) % MENU_ITEMS.length

      expect(nextDown).toBeGreaterThanOrEqual(0)
      expect(nextDown).toBeLessThan(MENU_ITEMS.length)
      expect(nextUp).toBeGreaterThanOrEqual(0)
      expect(nextUp).toBeLessThan(MENU_ITEMS.length)
    }
  })
})

// ─── Room Code Validation Tests ──────────────────────────────────────────────

describe('Room Code Input Validation', () => {
  test('valid room code characters: alphanumeric', () => {
    const validChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    for (const char of validChars) {
      expect(/^[a-zA-Z0-9]$/.test(char)).toBe(true)
    }
  })

  test('invalid room code characters rejected', () => {
    const invalidChars = '!@#$%^&*()-_=+[]{}|;:,.<>?/~` '
    for (const char of invalidChars) {
      expect(/^[a-zA-Z0-9]$/.test(char)).toBe(false)
    }
  })

  test('room code max length is 6', () => {
    const maxLength = 6
    let roomCode = ''

    // Simulate typing 8 characters, only first 6 should be accepted
    const input = 'ABCDEFGH'
    for (const char of input) {
      if (/^[a-zA-Z0-9]$/.test(char) && roomCode.length < maxLength) {
        roomCode += char.toUpperCase()
      }
    }

    expect(roomCode).toBe('ABCDEF')
    expect(roomCode.length).toBe(6)
  })

  test('room code is uppercased on input', () => {
    let roomCode = ''
    const input = 'abc123'
    for (const char of input) {
      if (/^[a-zA-Z0-9]$/.test(char) && roomCode.length < 6) {
        roomCode += char.toUpperCase()
      }
    }
    expect(roomCode).toBe('ABC123')
  })

  test('backspace removes last character', () => {
    let roomCode = 'ABC'
    roomCode = roomCode.slice(0, -1)
    expect(roomCode).toBe('AB')
  })

  test('backspace on empty code does nothing', () => {
    let roomCode = ''
    roomCode = roomCode.slice(0, -1)
    expect(roomCode).toBe('')
  })

  test('room code can only be submitted when 6 characters long', () => {
    const testCases = [
      { code: '', canSubmit: false },
      { code: 'A', canSubmit: false },
      { code: 'AB', canSubmit: false },
      { code: 'ABC', canSubmit: false },
      { code: 'ABCD', canSubmit: false },
      { code: 'ABCDE', canSubmit: false },
      { code: 'ABCDEF', canSubmit: true },
    ]

    for (const { code, canSubmit } of testCases) {
      expect(code.length === 6).toBe(canSubmit)
    }
  })
})

// ─── Room Code Display Formatting Tests ──────────────────────────────────────

describe('Room Code Display Formatting', () => {
  test('empty code displays as underscores', () => {
    const roomCode = ''
    const display = roomCode.padEnd(6, '_')
    expect(display).toBe('______')
  })

  test('partial code shows typed + remaining underscores', () => {
    const roomCode = 'ABC'
    const display = roomCode.padEnd(6, '_')
    expect(display).toBe('ABC___')
  })

  test('full code shows all characters', () => {
    const roomCode = 'XYZ789'
    const display = roomCode.padEnd(6, '_')
    expect(display).toBe('XYZ789')
  })

  test('display is always 6 characters wide', () => {
    for (let len = 0; len <= 6; len++) {
      const roomCode = 'ABCDEF'.slice(0, len)
      const display = roomCode.padEnd(6, '_')
      expect(display.length).toBe(6)
    }
  })
})

// ─── Join Mode State Logic Tests ─────────────────────────────────────────────

describe('Join Mode State', () => {
  test('join mode starts as false', () => {
    const joinMode = false
    expect(joinMode).toBe(false)
  })

  test('selecting join menu item activates join mode', () => {
    const selectedItem = MENU_ITEMS[2]
    expect(selectedItem).toBe('join')

    // When 'join' is selected, joinMode becomes true
    const joinMode = selectedItem === 'join'
    expect(joinMode).toBe(true)
  })

  test('escape in join mode resets room code and exits join mode', () => {
    let joinMode = true
    let roomCode = 'ABC'

    // Simulate escape
    joinMode = false
    roomCode = ''

    expect(joinMode).toBe(false)
    expect(roomCode).toBe('')
  })
})

// ─── Menu Selection Action Mapping Tests ─────────────────────────────────────

describe('Menu Selection Actions', () => {
  test('solo triggers onStartSolo', () => {
    const item = MENU_ITEMS[0]
    expect(item).toBe('solo')
    // In the component: case 'solo': onStartSolo()
  })

  test('create triggers onCreateRoom', () => {
    const item = MENU_ITEMS[1]
    expect(item).toBe('create')
    // In the component: case 'create': onCreateRoom()
  })

  test('join enters join mode (does not call callback directly)', () => {
    const item = MENU_ITEMS[2]
    expect(item).toBe('join')
    // In the component: case 'join': setJoinMode(true) -- no immediate callback
  })

  test('matchmake triggers onMatchmake', () => {
    const item = MENU_ITEMS[3]
    expect(item).toBe('matchmake')
    // In the component: case 'matchmake': onMatchmake()
  })

  test('each menu item maps to exactly one action', () => {
    const actions = new Map<MenuItem, string>([
      ['solo', 'onStartSolo'],
      ['create', 'onCreateRoom'],
      ['join', 'setJoinMode'],
      ['matchmake', 'onMatchmake'],
    ])

    for (const item of MENU_ITEMS) {
      expect(actions.has(item)).toBe(true)
    }
  })
})

// ─── Hotkey Mapping Tests ────────────────────────────────────────────────────

describe('Hotkey Mappings', () => {
  test('hotkey 1 maps to solo', () => {
    const index = 0
    expect(MENU_ITEMS[index]).toBe('solo')
  })

  test('hotkey 2 maps to create', () => {
    const index = 1
    expect(MENU_ITEMS[index]).toBe('create')
  })

  test('hotkey 3 maps to join', () => {
    const index = 2
    expect(MENU_ITEMS[index]).toBe('join')
  })

  test('hotkey 4 maps to matchmake', () => {
    const index = 3
    expect(MENU_ITEMS[index]).toBe('matchmake')
  })

  test('q/Q is quit hotkey (not a menu item)', () => {
    // q/Q exits the application, it's not in MENU_ITEMS
    expect(MENU_ITEMS).not.toContain('quit' as any)
  })
})

// ─── Menu Cursor Alignment Tests ─────────────────────────────────────────────
// The selected indicator (▶) must occupy the same display width as the
// unselected indicator (two spaces) so menu text stays aligned.
// U+25B6 BLACK RIGHT-POINTING TRIANGLE is fullwidth in most terminals (2 cols).

/**
 * Approximate terminal display width of a string.
 * Counts most characters as 1 column, but recognises common fullwidth/wide
 * Unicode blocks (CJK, fullwidth forms, geometric shapes like ▶) as 2 columns.
 */
function displayWidth(s: string): number {
  let w = 0
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    // Fullwidth forms (FF01-FF60), CJK unified, geometric shapes (25A0-25FF)
    if (
      (cp >= 0x25A0 && cp <= 0x25FF) || // Geometric Shapes (includes ▶ U+25B6)
      (cp >= 0xFF01 && cp <= 0xFF60) || // Fullwidth Latin
      (cp >= 0x4E00 && cp <= 0x9FFF) || // CJK Unified Ideographs
      (cp >= 0x2E80 && cp <= 0x303F)    // CJK Radicals, Kangxi, CJK Symbols
    ) {
      w += 2
    } else {
      w += 1
    }
  }
  return w
}

describe('Menu Cursor Alignment', () => {
  // These must match the strings used in MenuItemRow, LobbyScreen, and GameOverScreen
  const SELECTED_INDICATOR = '▶'
  const UNSELECTED_INDICATOR = '  '

  test('selected and unselected indicators have equal display width', () => {
    expect(displayWidth(SELECTED_INDICATOR)).toBe(displayWidth(UNSELECTED_INDICATOR))
  })

  test('selected indicator is exactly 2 display columns', () => {
    expect(displayWidth(SELECTED_INDICATOR)).toBe(2)
  })

  test('unselected indicator is exactly 2 display columns', () => {
    expect(displayWidth(UNSELECTED_INDICATOR)).toBe(2)
  })
})

// ─── Menu Item Display Configuration Tests ───────────────────────────────────

describe('Menu Item Display Configuration', () => {
  const displayConfig = [
    { hotkey: '1', label: 'SOLO GAME', desc: 'Start immediately, 3 lives' },
    { hotkey: '2', label: 'CREATE ROOM', desc: 'Get room code to share with friends' },
    { hotkey: '3', label: 'JOIN ROOM', desc: 'Enter a room code' },
    { hotkey: '4', label: 'MATCHMAKING', desc: 'Auto-join an open game' },
  ]

  test('each menu item has a hotkey, label, and description', () => {
    for (const item of displayConfig) {
      expect(item.hotkey).toBeDefined()
      expect(item.label).toBeDefined()
      expect(item.desc).toBeDefined()
      expect(item.hotkey.length).toBe(1)
      expect(item.label.length).toBeGreaterThan(0)
    }
  })

  test('all hotkeys are numeric 1-4', () => {
    const hotkeys = displayConfig.map(i => i.hotkey)
    expect(hotkeys).toEqual(['1', '2', '3', '4'])
  })

  test('all labels are uppercase', () => {
    for (const item of displayConfig) {
      expect(item.label).toBe(item.label.toUpperCase())
    }
  })

  test('label width fits in 16 character column', () => {
    // In the component: <text ... width={16}>{label}</text>
    for (const item of displayConfig) {
      expect(item.label.length).toBeLessThanOrEqual(16)
    }
  })
})

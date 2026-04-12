import type { InputAdapter, VadersKey } from '../../../client-core/src/adapters'

const KEY_MAP: Record<string, VadersKey> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'left', // alternative
  ArrowDown: 'right', // alternative
  ' ': 'shoot',
  Enter: 'enter',
  Escape: 'escape',
  q: 'quit',
  m: 'mute',
  s: 'solo',
  r: 'ready',
  x: 'forfeit',
  '1': '1',
  '2': '2',
  '3': '3',
  '4': '4',
}

/** Keys whose default browser action should be suppressed */
const PREVENT_DEFAULT_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '])

export class WebInputAdapter implements InputAdapter {
  supportsKeyRelease = true

  private target: EventTarget

  constructor(target: EventTarget = window) {
    this.target = target
  }

  onKey(callback: (key: VadersKey, type: 'down' | 'up') => void): () => void {
    const handleKeyDown = (e: Event) => {
      const ke = e as KeyboardEvent
      if (ke.repeat) return

      if (PREVENT_DEFAULT_KEYS.has(ke.key)) {
        ke.preventDefault()
      }

      const mapped = KEY_MAP[ke.key]
      if (mapped) {
        callback(mapped, 'down')
      }
    }

    const handleKeyUp = (e: Event) => {
      const ke = e as KeyboardEvent
      const mapped = KEY_MAP[ke.key]
      if (mapped) {
        callback(mapped, 'up')
      }
    }

    this.target.addEventListener('keydown', handleKeyDown)
    this.target.addEventListener('keyup', handleKeyUp)

    return () => {
      this.target.removeEventListener('keydown', handleKeyDown)
      this.target.removeEventListener('keyup', handleKeyUp)
    }
  }
}

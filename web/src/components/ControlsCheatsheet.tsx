import { useEffect, useState } from 'react'

type ControlSection = { title: string; rows: Array<[string, string]> }

const SECTIONS: ControlSection[] = [
  {
    title: 'MENU',
    rows: [
      ['↑ ↓', 'Navigate'],
      ['ENTER', 'Select'],
      ['1-4', 'Quick select'],
      ['ESC', 'Back / cancel'],
    ],
  },
  {
    title: 'LOBBY',
    rows: [
      ['ENTER', 'Ready / Unready'],
      ['S', 'Start Solo (when alone)'],
      ['ESC', 'Leave to menu'],
    ],
  },
  {
    title: 'GAME',
    rows: [
      ['← →', 'Move'],
      ['SPACE', 'Shoot'],
      ['X', 'Forfeit'],
      ['ESC / Q', 'Quit to menu'],
    ],
  },
  {
    title: 'GAME OVER',
    rows: [
      ['R / ENTER', 'Play again'],
      ['X', 'Share score'],
      ['Q / ESC', 'Quit to menu'],
    ],
  },
  {
    title: 'AUDIO',
    rows: [
      ['M', 'Mute SFX'],
      ['N', 'Mute music'],
    ],
  },
  {
    title: 'HELP',
    rows: [['?', 'Toggle help']],
  },
]

/**
 * Modal cheatsheet of keyboard controls. Toggled with `?`, dismissed with
 * `?` or Escape.
 */
export function ControlsCheatsheet() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?') {
        setOpen((prev) => !prev)
        return
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  if (!open) return null

  return (
    <div
      data-testid="controls-cheatsheet"
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10001,
        fontFamily: 'var(--font-body)',
        fontSize: 18,
        color: '#fff',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#111',
          border: '1px solid #0ff',
          padding: 24,
          minWidth: 320,
        }}
      >
        <h2 style={{ margin: 0, color: '#0ff', fontSize: 24 }}>CONTROLS</h2>
        {SECTIONS.map((section) => (
          <div key={section.title} style={{ marginTop: 16 }}>
            <h3 style={{ margin: 0, color: '#0ff', fontSize: 14, letterSpacing: '0.15em' }}>{section.title}</h3>
            <table style={{ marginTop: 4, borderCollapse: 'collapse' }}>
              <tbody>
                {section.rows.map(([key, desc]) => (
                  <tr key={key}>
                    <td style={{ color: '#ff0', padding: '2px 16px 2px 0', fontWeight: 'bold', minWidth: 72 }}>
                      {key}
                    </td>
                    <td style={{ color: '#fff' }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <p style={{ marginTop: 16, fontSize: 14, color: '#888' }}>Press ? or ESC to close</p>
      </div>
    </div>
  )
}

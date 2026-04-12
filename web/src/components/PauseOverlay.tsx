import { useEffect, useState } from 'react'

/**
 * Visual-only "paused" overlay that appears when the tab is hidden.
 *
 * The server is authoritative, so we do not actually pause gameplay — this
 * is purely user feedback that their input is not being sent while the tab
 * is in the background. Dismisses on visibilitychange back to visible or on
 * click.
 */
export function PauseOverlay() {
  const [visible, setVisible] = useState<boolean>(typeof document !== 'undefined' ? document.hidden : false)

  useEffect(() => {
    const handler = () => {
      if (document.hidden) {
        setVisible(true)
      } else {
        setVisible(false)
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  if (!visible) return null

  return (
    <div
      data-testid="pause-overlay"
      onClick={() => setVisible(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        cursor: 'pointer',
        fontFamily: 'var(--font-body)',
        color: '#fff',
        fontSize: 24,
      }}
    >
      <p>Paused — click to resume</p>
    </div>
  )
}

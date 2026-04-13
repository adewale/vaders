import { useEffect, useState } from 'react'
import { COLORS } from '../../../client-core/src/sprites/colors'

const AUTO_DISMISS_MS = 4000

interface ErrorToastProps {
  /**
   * Error message to display. The `useGameConnection` hook encodes server
   * errors as `${code}: ${message}` (e.g. `rate_limited: Too many messages`),
   * which this component parses for a human-friendly title. Non-coded
   * messages (connection errors, generic strings) render verbatim.
   *
   * `null` or empty string → toast hidden.
   */
  message: string | null
  /**
   * Bump this when the parent wants to force the toast to re-show even if
   * the `message` string did not change (e.g. the same error code fired
   * twice in a row after a prior dismissal). Think of it like a React key
   * for "re-trigger" semantics.
   */
  messageKey?: number
}

/**
 * Dismissable toast banner for in-game server errors.
 *
 * Behaviour:
 * - Fixed-position banner pinned to the top of the viewport
 * - Auto-dismisses after 4 seconds
 * - Replace semantics: a new message (or bumped `messageKey`) resets the
 *   auto-dismiss timer and replaces the existing toast. Chose replace over
 *   queue because game errors are transient — the newest one is almost always
 *   the most relevant, and queueing would let a burst of errors dominate the
 *   screen for tens of seconds.
 * - Red/warning palette (COLORS.ui.error) and z-index: 9999 so the toast
 *   stacks above the PauseOverlay (10000) but above everything else; the
 *   pause overlay taking priority is intentional — if the tab is hidden the
 *   user can't see the toast anyway.
 * - Click the × button to dismiss manually.
 *
 * See `web/src/App.tsx` for wiring into Lobby / Game / GameOver screens.
 */
export function ErrorToast({ message, messageKey }: ErrorToastProps) {
  // `visible` is the internal "is the toast currently showing" flag. We
  // intentionally key the dismiss timer off both `message` AND `messageKey`
  // so the parent can re-trigger the same message after a prior dismissal.
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!message) {
      setVisible(false)
      return
    }
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [message, messageKey])

  if (!visible || !message) return null

  const { title, detail } = parseErrorMessage(message)

  return (
    <div
      data-testid="in-game-error-toast"
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        minWidth: 320,
        maxWidth: 640,
        padding: '10px 14px',
        background: 'rgba(60, 0, 0, 0.92)',
        borderColor: COLORS.ui.error,
        borderStyle: 'solid',
        borderWidth: 1,
        borderRadius: 4,
        color: '#ffdddd',
        fontFamily: 'var(--font-body)',
        fontSize: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 2px 12px rgba(255, 0, 0, 0.4)',
      }}
    >
      <span aria-hidden="true" style={{ color: COLORS.ui.error, fontSize: 18 }}>
        ⚠
      </span>
      <div style={{ flexGrow: 1, minWidth: 0 }}>
        <div
          data-testid="in-game-error-toast-title"
          style={{ color: COLORS.ui.error, fontWeight: 'bold', letterSpacing: '0.04em' }}
        >
          {title}
        </div>
        {detail && (
          <div
            data-testid="in-game-error-toast-detail"
            style={{ color: '#ffdddd', marginTop: 2, wordBreak: 'break-word' }}
          >
            {detail}
          </div>
        )}
      </div>
      <button
        type="button"
        data-testid="in-game-error-toast-close"
        aria-label="Dismiss error"
        onClick={() => setVisible(false)}
        style={{
          background: 'transparent',
          border: `1px solid ${COLORS.ui.error}`,
          color: '#ffdddd',
          cursor: 'pointer',
          padding: '2px 8px',
          fontSize: 12,
          fontFamily: 'inherit',
        }}
      >
        ×
      </button>
    </div>
  )
}

/**
 * Split `${code}: ${message}` from useGameConnection into a human title and
 * detail. Falls back to showing the whole string as detail when no code
 * prefix is present (connection errors, generic strings).
 */
function parseErrorMessage(raw: string): { title: string; detail: string | null } {
  const idx = raw.indexOf(':')
  if (idx < 0) {
    return { title: 'Error', detail: raw }
  }
  const code = raw.slice(0, idx).trim()
  const detail = raw.slice(idx + 1).trim()
  // Only treat the prefix as an ErrorCode if it looks like a snake_case token:
  // letters/digits/underscores only. Otherwise render the whole string as detail
  // (defends against strings like "https://…" that have colons but no code).
  if (!/^[a-z0-9_]+$/i.test(code)) {
    return { title: 'Error', detail: raw }
  }
  return { title: humaniseCode(code), detail: detail || null }
}

function humaniseCode(code: string): string {
  return code
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

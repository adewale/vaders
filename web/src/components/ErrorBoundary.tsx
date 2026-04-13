import { Component, type ErrorInfo, type ReactNode } from 'react'
import { COLORS } from '../../../client-core/src/sprites/colors'
import { BUILD_INFO } from '../buildInfo'

export interface ErrorBoundaryProps {
  /**
   * Human-readable identifier for this boundary. Shown in the fallback UI and
   * surfaced via `data-boundary-name` for tests. Pick names like "App",
   * "Launch", "Lobby", "Game", "GameOver" so the fallback pinpoints *where*
   * the crash happened, not just *that* it happened.
   */
  name: string
  /** Rendered as the normal tree when nothing throws. */
  children: ReactNode
  /**
   * Optional hook invoked with the caught error. Use for analytics / log
   * forwarding. Not used for rendering — the fallback UI is built in.
   */
  onError?: (error: Error, info: ErrorInfo) => void
  /**
   * Optional replacement fallback. If provided, receives the caught error and
   * a reset callback; otherwise the built-in fallback renders.
   */
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * React error boundary — catches render-time errors in the child tree and
 * renders a fallback UI with a Reload button and the commit hash for bug
 * reports.
 *
 * **Limitations (React error boundaries cannot catch these):**
 * - Errors thrown from event handlers — those propagate to `window.onerror`.
 * - Errors thrown from async code (setTimeout, promise chains) — same reason.
 * - Errors thrown in the error boundary component itself during render.
 *
 * For those cases use a top-level `window.addEventListener('error', …)` or
 * `window.addEventListener('unhandledrejection', …)` instead.
 *
 * Class component is required by React — there is no hook-based equivalent.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info)
  }

  private handleReload = (): void => {
    // Full reload re-fetches BUILD_INFO and starts with a clean slate.
    // Prefer this over a soft reset because whatever caused the crash may be
    // in module-level state we don't own.
    window.location.reload()
  }

  private handleReset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    const { children, name, fallback } = this.props

    if (!error) return children

    if (fallback) return fallback(error, this.handleReset)

    return (
      <div
        data-testid="error-boundary-fallback"
        data-boundary-name={name}
        role="alert"
        style={{
          minWidth: 320,
          maxWidth: 720,
          margin: '40px auto',
          padding: 24,
          fontFamily: 'var(--font-body)',
          fontSize: 16,
          color: '#ffdddd',
          background: 'rgba(40, 0, 0, 0.92)',
          border: `1px solid ${COLORS.ui.error}`,
          borderRadius: 6,
          boxShadow: '0 4px 24px rgba(255, 0, 0, 0.3)',
        }}
      >
        <h2
          style={{
            color: COLORS.ui.error,
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            letterSpacing: '0.08em',
          }}
        >
          Something went wrong
        </h2>
        <p style={{ marginTop: 12 }}>
          The {name} screen crashed. This is a bug — please reload the page.
        </p>
        <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            type="button"
            data-testid="error-boundary-reload"
            onClick={this.handleReload}
            style={{
              padding: '6px 16px',
              background: COLORS.ui.error,
              color: '#fff',
              border: 'none',
              borderRadius: 3,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 14,
            }}
          >
            Reload
          </button>
          <span data-testid="error-boundary-commit" style={{ color: '#ffaaaa', fontSize: 12 }}>
            build {BUILD_INFO.commitHash}
          </span>
        </div>
        <details
          data-testid="error-boundary-details"
          style={{ marginTop: 16, fontSize: 13, color: '#ffbbbb' }}
        >
          <summary style={{ cursor: 'pointer' }}>Error details</summary>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              marginTop: 8,
              padding: 8,
              background: 'rgba(0, 0, 0, 0.5)',
              borderRadius: 3,
              maxHeight: 240,
              overflow: 'auto',
            }}
          >
            {error.message}
            {error.stack ? `\n\n${error.stack}` : ''}
          </pre>
        </details>
      </div>
    )
  }
}

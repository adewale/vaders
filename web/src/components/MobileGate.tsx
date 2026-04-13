import { useState, useEffect, type ReactNode } from 'react'

const MOBILE_BREAKPOINT = 600

/**
 * Gate component shown on viewports under 600px OR when the runtime
 * is primarily touch-driven.
 *
 * **Vaders does not support mobile or touch input, and there are no plans
 * to add it.** The entire game uses keyboard shortcuts (see `?` for the
 * controls cheatsheet). This component exists only to make the
 * unsupported state obvious — a touch-only user shouldn't be left
 * wondering why nothing happens when they tap. If mobile support is
 * ever revisited, changing the decision means removing this component
 * AND adding real touch handlers everywhere keyboard handlers are wired;
 * it is NOT a one-line toggle.
 *
 * Two detection paths:
 *   1. **Narrow viewport (<600px)** — a classic "phones" gate, shown on
 *      mount and re-evaluated on resize.
 *   2. **Touch primary input** — detected via `matchMedia('(pointer: coarse)')`
 *      AND `matchMedia('(hover: none)')`, which together identify a device
 *      whose primary pointer is a finger (phones, tablets, touch
 *      Chromebooks). A large touch Chromebook would pass the viewport
 *      gate but still isn't supported; this catches that case.
 *
 * Either signal flips to the unsupported screen, which says so in plain
 * language and points at "use a keyboard on a desktop/laptop".
 */
export function MobileGate({ children }: { children: ReactNode }) {
  const [blocked, setBlocked] = useState(() => isBlockedNow())

  useEffect(() => {
    const handler = () => setBlocked(isBlockedNow())
    window.addEventListener('resize', handler)

    // Match-media listeners re-fire the handler if the user switches
    // between primary pointer types (rare but possible on hybrid devices).
    const coarseMq =
      typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)') : null
    coarseMq?.addEventListener?.('change', handler)

    return () => {
      window.removeEventListener('resize', handler)
      coarseMq?.removeEventListener?.('change', handler)
    }
  }, [])

  if (blocked) {
    return (
      <div
        data-testid="mobile-gate"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#000',
          color: '#0f0',
          fontFamily: 'var(--font-body)',
          fontSize: 18,
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>VADERS</h1>
        <p>Vaders is a keyboard-only game and doesn't support mobile or touch input.</p>
        <p style={{ marginTop: '0.5rem' }}>Please play on a desktop or laptop with a physical keyboard.</p>
        <p style={{ marginTop: '1rem', fontSize: 14, opacity: 0.6 }}>
          Mobile support is not on the roadmap.
        </p>
      </div>
    )
  }

  return <>{children}</>
}

/**
 * Single-source-of-truth detector. Returns `true` if the runtime should
 * be blocked from the game. Covers both the small-viewport gate and
 * the touch-primary-input gate; either trips it.
 */
function isBlockedNow(): boolean {
  if (typeof window === 'undefined') return false
  if (window.innerWidth < MOBILE_BREAKPOINT) return true
  if (typeof window.matchMedia !== 'function') return false
  // Primary pointer is coarse (finger) AND there's no hover capability.
  // Both conditions together distinguish a touch-only device from a
  // laptop with a touchscreen (which typically still has hover).
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const noHover = window.matchMedia('(hover: none)').matches
  return coarse && noHover
}

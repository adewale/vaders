import type React from 'react'
import { COLORS } from '../../../client-core/src/sprites/colors'

export type HintsBarRole = 'lobby' | 'game-over' | 'launch' | string

export interface HintsBarProps {
  /** Ordered list of [key, description] tuples. Empty array → renders nothing. */
  hints: Array<[key: string, desc: string]>
  /** Semantic role of the bar, exposed as data-role for tests / styling hooks. */
  role: HintsBarRole
}

/**
 * Reusable footer hint strip rendering a single dim line of shortcut hints.
 *
 * Visual style mirrors LaunchScreen's "AUDIO  M Mute SFX  N Mute Music  ? Help"
 * footer so every screen feels uniform. This is a pure presentation component —
 * it does not attach keyboard listeners. Actual key handling lives in the
 * owning screen or App.tsx.
 */
export function HintsBar({ hints, role }: HintsBarProps): React.ReactElement | null {
  if (hints.length === 0) return null

  return (
    <div
      data-testid="hints-bar"
      data-role={role}
      role="contentinfo"
      aria-label="Keyboard shortcuts"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: '8px 16px',
        color: COLORS.ui.dim,
        fontSize: 14,
        fontFamily: 'var(--font-body)',
        textAlign: 'center',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        pointerEvents: 'none',
      }}
    >
      {hints.map(([key, desc], i) => (
        <span key={`${i}-${key}`} data-testid="hint-item" style={{ marginRight: i === hints.length - 1 ? 0 : 18 }}>
          <span style={{ color: COLORS.ui.hotkey }}>[{key}]</span>
          <span>&nbsp;{desc}</span>
        </span>
      ))}
    </div>
  )
}

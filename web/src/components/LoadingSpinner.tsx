interface LoadingSpinnerProps {
  label: string
  attempt?: number
}

/**
 * Animated pulse/dot spinner shown during connection / reconnection.
 *
 * The CSS keyframes are inlined via a <style> tag so the component is
 * self-contained and does not require adding a stylesheet import.
 */
export function LoadingSpinner({ label, attempt }: LoadingSpinnerProps) {
  return (
    <div
      data-testid="loading-spinner"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        fontFamily: 'var(--font-body)',
        fontSize: 18,
        color: '#fff',
      }}
    >
      <style>{`
        @keyframes vaders-spinner-pulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        .vaders-spinner-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #0ff;
          animation: vaders-spinner-pulse 1.2s infinite ease-in-out both;
        }
        .vaders-spinner-dot:nth-child(2) { animation-delay: 0.15s; }
        .vaders-spinner-dot:nth-child(3) { animation-delay: 0.3s; }
      `}</style>
      <div style={{ display: 'flex', gap: 6 }}>
        <span className="vaders-spinner-dot" />
        <span className="vaders-spinner-dot" />
        <span className="vaders-spinner-dot" />
      </div>
      <p style={{ margin: 0 }}>{label}</p>
      {attempt !== undefined && attempt > 0 && (
        <p style={{ margin: 0, fontSize: 16, color: '#aaa' }}>attempt {attempt}</p>
      )}
    </div>
  )
}

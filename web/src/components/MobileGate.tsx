import { useState, useEffect, type ReactNode } from 'react'

const MOBILE_BREAKPOINT = 600

export function MobileGate({ children }: { children: ReactNode }) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  if (isMobile) {
    return (
      <div
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
        <p>This game requires a larger screen.</p>
        <p style={{ marginTop: '0.5rem' }}>Please play on a desktop or tablet.</p>
      </div>
    )
  }

  return <>{children}</>
}

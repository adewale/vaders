import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'
import { BUILD_INFO } from '../buildInfo'

// Helper component that throws during render. The throw means the function
// never returns; annotating `: never` lets TS treat it as valid JSX (the
// `never` is assignable to `ReactNode`).
function Boom({ message = 'kaboom' }: { message?: string }): never {
  throw new Error(message)
}

// Helper for the async-error negative test. We record whether the throw
// "escaped" the boundary via a shared flag; we do NOT actually re-throw to
// globals because vitest's unhandled-exception reporter would fail the run.
function AsyncBoom({
  onScheduled,
  didThrow,
}: {
  onScheduled: () => void
  didThrow: { value: boolean }
}) {
  setTimeout(() => {
    try {
      didThrow.value = true
      // Would normally throw here — the point is that even IF it threw, the
      // boundary wouldn't catch it. Simulating "the throw happened and the
      // boundary's state didn't change" is sufficient to demonstrate the
      // limitation without generating an unhandled-exception report.
      throw new Error('async-boom')
    } catch {
      // Swallow: the test assertion is that the boundary did NOT transition
      // to its fallback state. Whether the async error was caught elsewhere
      // (window.onerror, etc.) is outside the boundary's remit.
    }
    onScheduled()
  }, 0)
  return <div data-testid="async-ok">rendered ok</div>
}

describe('ErrorBoundary', () => {
  // Suppress React's noisy "uncaught exception" console output that fires even
  // when a boundary successfully catches the error.
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    cleanup()
    consoleErrorSpy.mockRestore()
  })

  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary name="test">
        <div data-testid="child">child content</div>
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('child').textContent).toBe('child content')
    expect(screen.queryByTestId('error-boundary-fallback')).toBeNull()
  })

  it('catches a render-time error and shows the fallback UI', () => {
    render(
      <ErrorBoundary name="test">
        <Boom />
      </ErrorBoundary>,
    )
    const fallback = screen.getByTestId('error-boundary-fallback')
    expect(fallback).not.toBeNull()
    expect(fallback.textContent).toMatch(/went wrong|something|error/i)
  })

  it('fallback UI exposes a Reload button that calls window.location.reload', () => {
    // JSDOM's window.location.reload throws by default. Stub it with a spy.
    const reloadSpy = vi.fn()
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    })
    try {
      render(
        <ErrorBoundary name="test">
          <Boom />
        </ErrorBoundary>,
      )
      const btn = screen.getByTestId('error-boundary-reload')
      fireEvent.click(btn)
      expect(reloadSpy).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      })
    }
  })

  it('fallback includes the commit hash from BUILD_INFO', () => {
    render(
      <ErrorBoundary name="test">
        <Boom />
      </ErrorBoundary>,
    )
    const fallback = screen.getByTestId('error-boundary-fallback')
    expect(fallback.textContent).toContain(BUILD_INFO.commitHash)
  })

  it('fallback surfaces the error message inside a details block', () => {
    render(
      <ErrorBoundary name="test">
        <Boom message="very specific error" />
      </ErrorBoundary>,
    )
    const details = screen.getByTestId('error-boundary-details')
    expect(details).not.toBeNull()
    // The details block should contain the thrown message somewhere in its subtree
    expect(details.textContent).toContain('very specific error')
  })

  it('fallback includes the boundary `name` so scoped boundaries are identifiable', () => {
    render(
      <ErrorBoundary name="Launch">
        <Boom />
      </ErrorBoundary>,
    )
    const fallback = screen.getByTestId('error-boundary-fallback')
    expect(fallback.getAttribute('data-boundary-name')).toBe('Launch')
  })

  it('does NOT catch errors thrown asynchronously (documented limitation)', async () => {
    // Async throws are not caught by React error boundaries — the async
    // callback runs outside React's render phase. We assert the children
    // render normally and the boundary stays in its happy path.
    const didThrow = { value: false }
    const scheduled = new Promise<void>((resolve) => {
      render(
        <ErrorBoundary name="test">
          <AsyncBoom onScheduled={resolve} didThrow={didThrow} />
        </ErrorBoundary>,
      )
    })
    expect(screen.getByTestId('async-ok')).not.toBeNull()
    expect(screen.queryByTestId('error-boundary-fallback')).toBeNull()
    await scheduled
    // The async error fired — but the boundary did not transition to fallback.
    expect(didThrow.value).toBe(true)
    expect(screen.queryByTestId('error-boundary-fallback')).toBeNull()
  })

  it('does NOT catch errors thrown from event handlers (documented limitation)', () => {
    // Use a handler that calls a function that throws, wrapped in try/catch
    // inside the handler itself. The production concern is: if an app-code
    // handler throws WITHOUT its own try/catch, the boundary cannot save it.
    // We simulate that the throw occurred but the boundary stayed in its
    // happy path, which is the documented limitation we're pinning.
    let handlerFired = false
    let handlerThrew = false
    function ClickBoom() {
      return (
        <button
          data-testid="click-bomb"
          onClick={() => {
            handlerFired = true
            try {
              throw new Error('handler-boom')
            } catch {
              handlerThrew = true
              // Swallowed here so vitest's reporter doesn't flag it.
              // The boundary state would be equally unaffected if we
              // had let it propagate (React reports to window.onerror,
              // not the boundary).
            }
          }}
        >
          click me
        </button>
      )
    }
    render(
      <ErrorBoundary name="test">
        <ClickBoom />
      </ErrorBoundary>,
    )
    fireEvent.click(screen.getByTestId('click-bomb'))
    expect(handlerFired).toBe(true)
    expect(handlerThrew).toBe(true)
    expect(screen.queryByTestId('error-boundary-fallback')).toBeNull()
  })

  it('invokes the optional onError hook with the caught error', () => {
    const onError = vi.fn()
    render(
      <ErrorBoundary name="test" onError={onError}>
        <Boom message="hooked" />
      </ErrorBoundary>,
    )
    expect(onError).toHaveBeenCalledTimes(1)
    const [err] = onError.mock.calls[0]
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('hooked')
  })
})

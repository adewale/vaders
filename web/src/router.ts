export type Route = { type: 'launch' } | { type: 'room'; code: string } | { type: 'solo' } | { type: 'matchmake' }

export function parseRoute(pathname: string, search: string): Route {
  if (pathname === '/solo') return { type: 'solo' }
  const roomMatch = pathname.match(/^\/room\/([A-Z0-9]{6})$/i)
  if (roomMatch) return { type: 'room', code: roomMatch[1].toUpperCase() }
  if (search.includes('matchmake=true')) return { type: 'matchmake' }
  return { type: 'launch' }
}

/**
 * Programmatically navigate to a new path.
 *
 * By default uses `history.pushState` so the new entry is added to the
 * back-stack. Pass `{ replace: true }` to use `history.replaceState` instead
 * — this avoids accumulating duplicate back-stack entries when re-navigating
 * during error recovery or idempotent re-routes.
 *
 * **Auto-replace**: when the target `path` matches the current URL
 * (`location.pathname + location.search`), this function defaults to
 * `replaceState` regardless of the `replace` option. This prevents the
 * back-stack from bloating when App re-routes to the same URL (e.g. during
 * error-recovery loops, or clicking Join for a room the user is already in).
 *
 * Always dispatches a synthetic `popstate` event so `useRoute()` subscribers
 * update — both `pushState` and `replaceState` are silent in the browser,
 * and `useRoute` only listens for `popstate`. We dispatch on replace too so
 * the rendered route stays in sync whenever the URL changes, not just on
 * push.
 */
export function navigateTo(path: string, options?: { replace?: boolean }): void {
  const currentUrl = window.location.pathname + window.location.search
  const shouldReplace = options?.replace === true || currentUrl === path
  if (shouldReplace) {
    window.history.replaceState(null, '', path)
  } else {
    window.history.pushState(null, '', path)
  }
  window.dispatchEvent(new PopStateEvent('popstate'))
}

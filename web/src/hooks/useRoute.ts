import { useState, useEffect } from 'react'
import { parseRoute, type Route } from '../router'

/**
 * Subscribes to URL changes and re-parses the current route.
 *
 * **Coupling note**: this hook only listens for `popstate` — it does NOT
 * hook `history.pushState` / `replaceState`. Programmatic navigations must
 * therefore go through `router.navigateTo()`, which manually dispatches a
 * `PopStateEvent` after calling `pushState`. If any other code path ever
 * calls `pushState` / `replaceState` directly, the rendered route will
 * silently diverge from the URL until the user navigates back/forward.
 * Always use `navigateTo()` for in-app navigation.
 */
export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.pathname, location.search))
  useEffect(() => {
    const handler = () => setRoute(parseRoute(location.pathname, location.search))
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])
  return route
}

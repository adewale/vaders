import { useState, useEffect } from 'react'
import { parseRoute, type Route } from '../router'

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.pathname, location.search))
  useEffect(() => {
    const handler = () => setRoute(parseRoute(location.pathname, location.search))
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])
  return route
}

export type Route = { type: 'launch' } | { type: 'room'; code: string } | { type: 'solo' } | { type: 'matchmake' }

export function parseRoute(pathname: string, search: string): Route {
  if (pathname === '/solo') return { type: 'solo' }
  const roomMatch = pathname.match(/^\/room\/([A-Z0-9]{6})$/i)
  if (roomMatch) return { type: 'room', code: roomMatch[1].toUpperCase() }
  if (search.includes('matchmake=true')) return { type: 'matchmake' }
  return { type: 'launch' }
}

export function navigateTo(path: string): void {
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

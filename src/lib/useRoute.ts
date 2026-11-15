import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { parseHash, type Route } from './route'

const OVERVIEW: Route = { view: 'overview', params: {} }

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

const getHash = () => window.location.hash
const getServerHash = () => ''

/**
 * The current route, read from the URL hash. Back and forward work because the hash
 * lives in the browser's history. An unknown hash shows the Overview and rewrites the
 * address to "#/" (replacing that history entry, so Back doesn't land on the bad one).
 */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash, getServerHash)
  const parsed = useMemo(() => parseHash(hash), [hash])

  useEffect(() => {
    if (parsed === null) window.location.replace('#/')
  }, [parsed])

  return parsed ?? OVERVIEW
}

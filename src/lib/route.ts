// Hash routes: #/ (Overview), #/summarize, #/rank, #/interpret, each with optional
// query parameters such as #/interpret?preset=m5 or #/summarize?test=P22b.
// Pure functions only, so they are easy to test. The React hook is in useRoute.ts.

export const VIEWS = ['overview', 'summarize', 'rank', 'interpret'] as const

export type ViewId = (typeof VIEWS)[number]

export type RouteParams = Record<string, string>

export type Route = { view: ViewId; params: RouteParams }

/** The props every view receives. Nothing reads the params yet; later milestones will. */
export type ViewProps = { params: RouteParams }

const PATH_TO_VIEW: Record<string, ViewId> = {
  '': 'overview',
  summarize: 'summarize',
  rank: 'rank',
  interpret: 'interpret',
}

/**
 * Reads a location hash such as "#/rank" or "#/interpret?preset=m5".
 * An empty hash ("", "#", "#/") is the Overview.
 * Returns null when the path is not one of the four views.
 */
export function parseHash(hash: string): Route | null {
  const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash
  const queryStart = withoutHash.indexOf('?')
  const rawPath = queryStart === -1 ? withoutHash : withoutHash.slice(0, queryStart)
  const rawQuery = queryStart === -1 ? '' : withoutHash.slice(queryStart + 1)

  // Allow one leading slash and one trailing slash: "/rank/" is "rank".
  const path = rawPath.replace(/^\//, '').replace(/\/$/, '')
  if (!Object.hasOwn(PATH_TO_VIEW, path)) return null

  return {
    view: PATH_TO_VIEW[path],
    params: Object.fromEntries(new URLSearchParams(rawQuery)),
  }
}

/** Builds the hash for a view, e.g. formatHash('interpret', { preset: 'm5' }) is "#/interpret?preset=m5". */
export function formatHash(view: ViewId, params: RouteParams = {}): string {
  const path = view === 'overview' ? '/' : `/${view}`
  const query = new URLSearchParams(params).toString()
  return query ? `#${path}?${query}` : `#${path}`
}

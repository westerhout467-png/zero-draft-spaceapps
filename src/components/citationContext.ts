import { createContext, useContext } from 'react'
import type { Claim } from '../lib/claims'

export type CitationApi = {
  /**
   * Opens the citation drawer on a claim id from src/data/claims.json, or on a claim built on the
   * spot: Lab Partner's quotes, checked against the source passage they came from.
   */
  openCitation: (claim: string | Claim) => void
}

export const CitationContext = createContext<CitationApi | null>(null)

/** Use inside <CitationProvider>. */
export function useCitation(): CitationApi {
  const api = useContext(CitationContext)
  if (!api) throw new Error('useCitation must be used inside <CitationProvider>')
  return api
}

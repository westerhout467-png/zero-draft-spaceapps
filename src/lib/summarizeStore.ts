// SUMMARIZE's state: filters, the quarantine toggle, which record is open and which forensic line
// is expanded. It lives outside the view, so the audit bar (and, in M6, Lab Partner's filter_tests
// tool) can set it from anywhere, and it survives switching views.
import { useSyncExternalStore } from 'react'
import { NO_FILTERS, type SummarizeLink, type TestFilters } from './testWall'

export interface SummarizeState {
  filters: TestFilters
  quarantine: boolean
  /** The test whose record drawer is open. */
  recordId: string | null
  /** The quarantined test whose "Show the math" is expanded (one at a time). */
  mathId: string | null
}

let state: SummarizeState = { filters: NO_FILTERS, quarantine: false, recordId: null, mathId: null }
const listeners = new Set<() => void>()

function commit(next: Partial<SummarizeState>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

export const summarizeStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  setFilters: (filters: Partial<TestFilters>) => commit({ filters: { ...state.filters, ...filters } }),
  clearFilters: () => commit({ filters: NO_FILTERS }),
  setQuarantine: (quarantine: boolean) => commit({ quarantine, mathId: quarantine ? state.mathId : null }),
  openRecord: (recordId: string) => commit({ recordId }),
  closeRecord: () => commit({ recordId: null }),
  /** Puts back a state read earlier with get(): Lab Partner's Undo. */
  restore: (snapshot: SummarizeState) => commit(snapshot),
  toggleMath: (testId: string) => commit({ mathId: state.mathId === testId ? null : testId }),
  openMath: (testId: string) => commit({ mathId: testId }),
  /**
   * Applies a deep link. `isQuarantined` says where a linked test goes: the bay, with its math
   * open, or the record drawer.
   */
  applyLink(link: SummarizeLink, isQuarantined: (testId: string) => boolean | undefined) {
    const next: Partial<SummarizeState> = {}
    if (link.filters) next.filters = { ...NO_FILTERS, ...link.filters }
    if (link.quarantine !== undefined) next.quarantine = link.quarantine
    if (link.test) {
      const quarantined = isQuarantined(link.test)
      if (quarantined === true) {
        next.quarantine = true
        next.mathId = link.test
        next.recordId = null
      } else if (quarantined === false) {
        next.recordId = link.test
      }
    }
    commit(next)
  },
}

/** Reads one value from the store; the component re-renders only when it changes. */
export function useSummarize<T>(selector: (state: SummarizeState) => T): T {
  return useSyncExternalStore(summarizeStore.subscribe, () => selector(state))
}

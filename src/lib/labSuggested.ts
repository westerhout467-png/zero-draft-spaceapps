// Lab Partner's suggested questions (SPEC F5). Their answers are generated once by
// `npm run lab:cache` with the real Gemini call, checked like any other answer, and saved in
// src/data/labPartnerCache.json, so they answer instantly and work with the network off.
import type { ToolName } from './labProtocol'

export interface Suggested {
  id: string
  question: string
  /** What SPEC F5 says it should do on screen; lab:cache refuses an answer whose tools don't. */
  expects: { name: ToolName; args: Record<string, unknown> } | null
  /** The fewest checked sentences lab:cache accepts: 2, or 1 where one sentence is the whole answer. */
  minSentences?: number
}

export const SUGGESTED: readonly Suggested[] = [
  {
    id: 'breezes',
    question: 'Why are gentle cabin breezes dangerous?',
    expects: { name: 'set_burn_twin', args: { flowCmS: 2, action: 'drain' } },
  },
  { id: 'm5', question: 'What happened in Test M5?', expects: { name: 'run_cabin_preset', args: { preset: 'm5' } } },
  {
    id: 'small-cabin',
    question: 'Would a Test M5 fire be dangerous in a small cabin?',
    expects: { name: 'run_cabin_preset', args: { preset: 'small-cabin' } },
  },
  {
    id: 'suppression',
    question: 'How long should suppression continue after a fire goes out?',
    expects: null,
    minSentences: 1,
  },
  {
    id: 'lunar',
    question: 'Does NASA have fire data for a 34% oxygen lunar habitat?',
    expects: { name: 'run_cabin_preset', args: { preset: 'lunar' } },
  },
  {
    id: 'readings-39',
    question: 'Why did some oxygen readings say 39%?',
    expects: { name: 'navigate', args: { view: 'summarize', params: { test: 'P22b' } } },
  },
]

/** Whether a tool's arguments include everything expected (extra arguments are fine). */
export function argsInclude(actual: unknown, expected: unknown): boolean {
  if (typeof expected !== 'object' || expected === null) return actual === expected
  if (typeof actual !== 'object' || actual === null) return false
  return Object.entries(expected).every(([key, value]) => argsInclude((actual as Record<string, unknown>)[key], value))
}

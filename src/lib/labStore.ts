// The Lab Partner dock's state (SPEC F5): the transcript, whether a question is running, and the
// actions to ask (live, streamed from /api/lab-partner), replay a cached answer, and undo a tool.
// Tool results are applied to the screen the moment they arrive (labActions.ts).
import { useSyncExternalStore } from 'react'
import cacheFile from '../data/labPartnerCache.json'
import { applyTool, currentContext, restore, snapshot, type ApplyDeps, type Snapshot } from './labActions'
import {
  MAX_QUESTION_CHARS,
  type DropReason,
  type LabEvent,
  type LabStage,
  type Sentence,
  type ToolResult,
} from './labProtocol'
import { SUGGESTED } from './labSuggested'
import { parseHash } from './route'

export interface ToolLine {
  result: ToolResult
  /** Every store and the address just before this tool ran: Undo restores it. */
  before: Snapshot
  /** Milliseconds since the session's first question. */
  atMs: number
  undone: boolean
}

export interface Turn {
  id: number
  question: string
  atMs: number
  source: 'live' | 'cached'
  status: 'running' | 'done' | 'error'
  stage: LabStage | null
  tools: ToolLine[]
  sentences: Sentence[]
  dropped: { count: number; reasons: DropReason[] } | null
  refused: boolean
  error: string | null
  model: string | null
}

export interface LabState {
  turns: Turn[]
  busy: boolean
}

interface CachedAnswer {
  id: string
  question: string
  events: LabEvent[]
}
interface CacheFile {
  generatedAt: string | null
  model: string | null
  promptVersion: string | null
  answers: CachedAnswer[]
}
const CACHE = cacheFile as unknown as CacheFile

export const CACHE_INFO = { generatedAt: CACHE.generatedAt, model: CACHE.model, promptVersion: CACHE.promptVersion }

export function cachedAnswer(id: string): CachedAnswer | undefined {
  return CACHE.answers.find((answer) => answer.id === id)
}

/**
 * Splits streamed text into whole lines of JSON. `carry` is the unfinished last line from the
 * previous chunk; it comes back with whatever is unfinished now.
 */
export function readLines(carry: string, chunk: string): { events: LabEvent[]; carry: string } {
  const lines = (carry + chunk).split('\n')
  const rest = lines.pop() ?? ''
  const events = lines.flatMap((line) => {
    if (!line.trim()) return []
    try {
      return [JSON.parse(line) as LabEvent]
    } catch {
      return []
    }
  })
  return { events, carry: rest }
}

let state: LabState = { turns: [], busy: false }
const listeners = new Set<() => void>()
let sessionStart: number | null = null
let nextId = 1
let deps: ApplyDeps = { openCitation: () => {}, reduceMotion: false }

function commit(next: Partial<LabState>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

const sinceStart = () => (sessionStart === null ? 0 : Date.now() - sessionStart)

function updateTurn(id: number, change: (turn: Turn) => Partial<Turn>) {
  commit({ turns: state.turns.map((turn) => (turn.id === id ? { ...turn, ...change(turn) } : turn)) })
}

function startTurn(question: string, source: Turn['source']): number {
  sessionStart ??= Date.now()
  const turn: Turn = {
    id: nextId++,
    question,
    atMs: sinceStart(),
    source,
    status: 'running',
    stage: null,
    tools: [],
    sentences: [],
    dropped: null,
    refused: false,
    error: null,
    model: null,
  }
  commit({ turns: [...state.turns, turn], busy: true })
  return turn.id
}

/** One event into the transcript. Tool results change the screen as they arrive. */
function receive(id: number, event: LabEvent) {
  switch (event.type) {
    case 'status':
      updateTurn(id, () => ({ stage: event.stage }))
      break
    case 'tool': {
      // Whether it opens a view depends on what is showing now (a cached answer was made elsewhere).
      const showing = parseHash(window.location.hash)?.view ?? 'overview'
      const result = { ...event.result, opensView: event.result.view !== null && event.result.view !== showing }
      const before = snapshot()
      applyTool(result, deps)
      updateTurn(id, (turn) => ({ tools: [...turn.tools, { result, before, atMs: sinceStart(), undone: false }] }))
      break
    }
    case 'sentence':
      updateTurn(id, (turn) => ({ sentences: [...turn.sentences, event.sentence] }))
      break
    case 'dropped':
      updateTurn(id, () => ({ dropped: { count: event.count, reasons: event.reasons } }))
      break
    case 'done':
      updateTurn(id, () => ({ status: 'done', stage: null, refused: event.refused, model: event.model }))
      break
    case 'error':
      updateTurn(id, () => ({ status: 'error', stage: null, error: event.message }))
      break
  }
}

function finish(id: number, error?: string) {
  updateTurn(id, (turn) =>
    turn.status === 'running'
      ? { status: error ? 'error' : 'done', stage: null, error: error ?? turn.error }
      : {},
  )
  commit({ busy: false })
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const labStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  /** The dock passes in what applying a tool needs from React: the citation drawer and motion setting. */
  connect(next: ApplyDeps) {
    deps = next
  },

  /** Asks the server. One question at a time (CLAUDE.md interaction 13). */
  async ask(raw: string) {
    const question = raw.trim().slice(0, MAX_QUESTION_CHARS)
    if (!question || state.busy) return
    const id = startTurn(question, 'live')
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      finish(id, 'You’re offline. The suggested questions still work: their answers are cached.')
      return
    }
    try {
      const response = await fetch('/api/lab-partner', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question, context: currentContext() }),
      })
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        finish(
          id,
          body?.error ??
            (response.status === 404
              ? 'Lab Partner’s server isn’t running here. The suggested questions still work: their answers are cached.'
              : `Lab Partner isn’t available right now (${response.status}).`),
        )
        return
      }
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
      let carry = ''
      for (;;) {
        const { done, value } = await reader.read()
        const read = readLines(carry, done ? '\n' : value)
        carry = read.carry
        for (const event of read.events) receive(id, event)
        if (done) break
      }
      finish(id)
    } catch {
      finish(id, 'Lab Partner isn’t reachable. The suggested questions still work: their answers are cached.')
    }
  },

  /** A suggested question: its cached answer, replayed, or a live ask if there is none. */
  async askSuggested(suggestedId: string) {
    const cached = cachedAnswer(suggestedId)
    const suggested = SUGGESTED.find((s) => s.id === suggestedId)
    if (!cached) {
      if (suggested) await labStore.ask(suggested.question)
      return
    }
    if (state.busy) return
    const id = startTurn(cached.question, 'cached')
    for (const event of cached.events) {
      if (event.type === 'status') continue
      // Sentences arrive one after another, as a live answer would; nothing waits under reduced motion.
      if (!deps.reduceMotion) await wait(event.type === 'sentence' ? 180 : 60)
      receive(id, event)
    }
    finish(id)
  },

  /** Undoes a tool line and every tool line after it, newest first, by restoring its snapshot. */
  undo(turnId: number, index: number) {
    const turn = state.turns.find((t) => t.id === turnId)
    const line = turn?.tools[index]
    if (!line || line.undone) return
    restore(line.before)
    let after = false
    commit({
      turns: state.turns.map((t) => ({
        ...t,
        tools: t.tools.map((l, i) => {
          if (t.id === turnId && i === index) after = true
          return after ? { ...l, undone: true } : l
        }),
      })),
    })
  },
}

export function useLab<T>(selector: (state: LabState) => T): T {
  return useSyncExternalStore(labStore.subscribe, () => selector(state))
}

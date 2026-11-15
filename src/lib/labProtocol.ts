// What Lab Partner's server and the dock say to each other (SPEC F5, §7.1). The server answers a
// question with a stream of these events, one JSON object per line; cached answers are the same
// events, saved. Types only, plus the few constants both sides need.
import type { CabinInputs } from './cabin'
import type { PresetId } from './interpret'
import type { RodMm } from './physics'
import type { Weights } from './risk'
import type { RouteParams, ViewId } from './route'

/** The exact reply when the sources can't answer (SPEC F5). */
export const REFUSAL = 'The indexed sources don’t answer this.'

export const MAX_QUESTION_CHARS = 500

export const TOOL_NAMES = [
  'set_burn_twin',
  'run_cabin_preset',
  'set_cabin',
  'navigate',
  'filter_tests',
  'highlight_risk_entity',
  'open_citation',
] as const
export type ToolName = (typeof TOOL_NAMES)[number]

/** What the dock tells the server about the screen, so tools start from what is showing. */
export interface LabContext {
  view: ViewId
  params: RouteParams
  burn: { o2Pct: number; flowCmS: number; rodMm: RodMm }
  interpret: { presetId: PresetId; inputs: CabinInputs }
  weights: Weights
}

/** One value a tool worked out, with the claim behind it when there is one. */
export interface ToolField {
  /** "coPeakPpm": the answer cites it as "tool#1.coPeakPpm". */
  key: string
  /** What it is, in words, with its unit: "Highest CO, ppm (model)". */
  label: string
  value: number | string | boolean
  claimId?: string
}

/** A tool the server ran, and what the dock should do with it. */
export interface ToolResult {
  /** "tool#1", "tool#2"… in the order they ran. */
  id: string
  name: ToolName
  /** The arguments after checking: only these reach the dock. */
  args: Record<string, unknown>
  /** The view the tool's module lives on; null for tools that work anywhere. */
  view: ViewId | null
  /** True when that view wasn't showing, so the server opened it first (SPEC F5). */
  opensView: boolean
  /** The transcript line after "Lab Partner → View: ", e.g. "ran Replay Test M5". */
  summary: string
  fields: ToolField[]
  /** The claims behind the result as a whole: a citation chip opens the first. */
  claimIds: string[]
  /** Set when the call was refused (bad arguments): nothing on screen changes. */
  error?: string
}

/** Where a sentence's support is, ready for a citation chip. */
export type Support =
  | {
      kind: 'quote'
      chunkId: string
      quote: string
      sourceId: string
      /** "BASS-II report, p. 52" */
      place: string
      pdfPage?: number
      reportPage?: number | null
      file?: string
      line?: number
    }
  | {
      kind: 'tool'
      /** "tool#1" or "tool#1.coPeakPpm" */
      ref: string
      /** "Highest CO, ppm (model)", or the tool's summary for a whole result. */
      label: string
      /** The claim a click opens; null when the value is the model's alone. */
      claimId: string | null
    }

export interface Sentence {
  text: string
  supports: Support[]
}

/** Why the server removed a sentence before anyone saw it. */
export type DropReason =
  | 'no-support'
  | 'unknown-chunk'
  | 'short-quote'
  | 'quote-not-found'
  | 'unknown-tool-result'
  | 'untraceable-number'
  | 'order'
  | 'misattributed'
  | 'malformed'

export const DROP_REASON_TEXT: Record<DropReason, string> = {
  'no-support': 'it cited nothing',
  'unknown-chunk': 'it cited a passage that wasn’t retrieved',
  'short-quote': 'its quote was too short to check',
  'quote-not-found': 'its quote isn’t in the source',
  'unknown-tool-result': 'it cited a result that doesn’t exist',
  'untraceable-number': 'it had a number that isn’t in its sources',
  order: 'it told the crew what to do',
  misattributed: 'it credited a source it didn’t cite',
  malformed: 'its text was garbled',
}

export type LabStage = 'searching' | 'choosing-tools' | 'running-tools' | 'writing' | 'checking'

export type LabEvent =
  | { type: 'status'; stage: LabStage }
  | { type: 'tool'; result: ToolResult }
  | { type: 'sentence'; sentence: Sentence }
  | { type: 'dropped'; count: number; reasons: DropReason[] }
  | { type: 'done'; refused: boolean; model: string | null; promptVersion: string }
  | { type: 'error'; message: string }

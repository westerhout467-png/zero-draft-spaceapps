// The server's check on every sentence Lab Partner writes (SPEC F5 "Answer rules", §7.1 step 5;
// CLAUDE.md rule 10). Pure: the model's raw JSON, the chunks it was given and the tool results in;
// the sentences that may be shown out, plus why the others were dropped.
//
// A sentence is dropped if:
// - it cites nothing;
// - it quotes a passage that wasn't retrieved, quotes fewer than 3 words, or its quote isn't in
//   that passage after normalize();
// - it cites a tool result that doesn't exist;
// - it has a number that isn't in what it cites (a quote's text or the tool values it names);
// - it tells the crew what to do ("you should…");
// - it credits "the report" or "BASS-II" without citing them (a Zayac or FLEX quote isn't BASS-II);
// - its text is garbled (JSON braces in it).
// If nothing is left, the answer is the refusal.
import { getClaim, SOURCES } from './claims'
import { normalize } from './normalize'
import type { DropReason, Sentence, Support, ToolResult } from './labProtocol'
import { chunkPlace, quoteLine, type Chunk } from './retrieve'

/** The model's answer, as its JSON schema allows (pipeline/prompts/lab-partner-answer.md). */
export interface RawSupport {
  chunkId?: string
  quote?: string
  /** "tool#1" for a whole result, or "tool#1.coPeakPpm" for one value. */
  tool?: string
}
export interface RawSentence {
  text?: string
  support?: RawSupport[]
}
export interface RawAnswer {
  refusal?: boolean
  sentences?: RawSentence[]
}

export const MIN_QUOTE_WORDS = 3
export const MAX_SENTENCES = 6

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Tokens with digits that aren't quantities: source names with a year ("Zayac 2024"), test ids
// (O4, P22b), chemical formulas, references to equations, figures, tables, pages and documents,
// unit exponents (m3, s-1) and "1g".
const NOT_QUANTITIES: RegExp[] = [
  ...SOURCES.flatMap((source) => (source.short && /\d/.test(source.short) ? [new RegExp(escape(source.short), 'g')] : [])),
  /\b[BFMOPT]\d{1,2}[ab]?\b/g,
  /\b(?:C5H8O2|H2O|SF6|XO2|CO2|N2|O2)\b/g,
  /\b(?:Eqs?|Equations?|Figs?|Figures?|Tables?|Refs?|Sections?|Appendix|Chapter)\.?\s*(?:[A-Z]\.)?\d+(?:\.\d+)*[a-z]?/gi,
  /\bpp?\.\s*\d+(?:\s*-\s*\d+)?/g,
  /\bNASA[-/ ](?:STD|TM)-[\w-]+/g,
  /\bPSI-\d+/g,
  /\bTest\s+1\b/g,
  /\b(?:cm|mm|m)[23]\b/g,
  /\bs\s*-\s*1\b/g,
  /\b[01]\s?-?g\b/g,
]

/** The quantities written in a text, as plain numerals ("1,029" is "1029"), in order. */
export function numbersIn(text: string): string[] {
  let masked = normalize(text)
  for (const pattern of NOT_QUANTITIES) masked = masked.replace(pattern, ' ')
  return (masked.match(/\d+(?:,\d{3})*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ''))
}

const decimals = (numeral: string) => (numeral.includes('.') ? numeral.length - numeral.indexOf('.') - 1 : 0)

/**
 * Whether a number written in a sentence is one of the source values, as written or rounded to
 * the sentence's decimals: 986.7 supports "986.7" and "987", not "990" or "1000".
 */
export function isTraceable(numeral: string, values: readonly number[]): boolean {
  const n = Number(numeral)
  const places = decimals(numeral)
  return values.some((v) => Math.abs(v - n) < 1e-9 || Math.abs(Number(v.toFixed(places)) - n) < 1e-9)
}

/** The numbers a support stands for: those in a quote, or a tool's values (numbers in strings too). */
function supportValues(values: readonly (number | string | boolean)[]): number[] {
  return values.flatMap((value) =>
    typeof value === 'number' ? [value] : typeof value === 'string' ? numbersIn(value).map(Number) : [],
  )
}

// Orders to a crew: "you should", "astronauts must"… The report's own advice is reported, not given.
const ORDER = /\b(?:you|crews?|astronauts?|operators?)\s+(?:should|must|need to|have to|ought to)\b/i
const IMPERATIVE = /^(?:always|never|make sure|ensure|do not|don't|keep|stop)\b/i

/**
 * A parenthesis holding nothing but citation objects, which some models copy into the sentence
 * itself: ({"tool": "tool#1.x"}, {"chunkId": "c1", "quote": "…"}). The sentence's support list
 * already carries them, so they are removed before the checks; any other braces still fail.
 */
const INLINE_CITATIONS = /\s*\((?:\s*\{[^{}()]*\}\s*,?)+\s*\)/g

export function stripInlineCitations(text: string): string {
  return text.replace(INLINE_CITATIONS, '')
}

/** The BASS-II report, and the BASS-II dataset its numbers come from. */
const REPORT = 'nasa-tm-20210011385'
const BASS2_SOURCES = new Set([REPORT, 'psi-25'])
const MENTIONS_REPORT = /\b(?:the|NASA's|NASA’s) report\b|\bBASS-II report\b/i
const MENTIONS_BASS2 = /\bBASS-II\b/

export interface Checked {
  sentences: Sentence[]
  dropped: { text: string; reason: DropReason }[]
  refused: boolean
}

export interface CheckInput {
  answer: RawAnswer
  chunks: readonly Chunk[]
  tools: readonly ToolResult[]
  /** "BASS-II report" for a source id, for the chips. */
  shortName: (sourceId: string) => string
}

export function checkAnswer({ answer, chunks, tools, shortName }: CheckInput): Checked {
  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]))
  const toolById = new Map(tools.filter((tool) => !tool.error).map((tool) => [tool.id, tool]))
  const sentences: Sentence[] = []
  const dropped: Checked['dropped'] = []

  const raw = answer.refusal ? [] : (answer.sentences ?? []).slice(0, MAX_SENTENCES)
  for (const item of raw) {
    const text = normalize(stripInlineCitations(item.text ?? ''))
    if (!text) continue
    const result = checkSentence(text, item.support ?? [], chunkById, toolById, shortName)
    if ('reason' in result) dropped.push({ text, reason: result.reason })
    else sentences.push(result)
  }
  return { sentences, dropped, refused: sentences.length === 0 }
}

function checkSentence(
  text: string,
  raw: readonly RawSupport[],
  chunkById: ReadonlyMap<string, Chunk>,
  toolById: ReadonlyMap<string, ToolResult>,
  shortName: (sourceId: string) => string,
): Sentence | { reason: DropReason } {
  if (raw.length === 0) return { reason: 'no-support' }
  const supports: Support[] = []
  const values: number[] = []
  /** Where the support comes from: a quote's source, or the source of a tool value's claim. */
  const sources = new Set<string>()
  let usesTool = false

  for (const support of raw) {
    if (support.tool) {
      const [toolId, key] = support.tool.split('.', 2) as [string, string | undefined]
      const tool = toolById.get(toolId)
      const fields = tool ? (key ? tool.fields.filter((field) => field.key === key) : tool.fields) : []
      if (!tool || fields.length === 0) return { reason: 'unknown-tool-result' }
      values.push(...supportValues(fields.map((field) => field.value)))
      usesTool = true
      for (const f of fields) {
        const sourceId = f.claimId ? getClaim(f.claimId)?.sourceId : undefined
        if (sourceId) sources.add(sourceId)
      }
      const one = key ? fields[0] : undefined
      supports.push({
        kind: 'tool',
        ref: support.tool,
        label: one ? one.label : tool.summary,
        claimId: one?.claimId ?? tool.claimIds[0] ?? null,
      })
      continue
    }
    const chunk = support.chunkId ? chunkById.get(support.chunkId) : undefined
    if (!chunk) return { reason: 'unknown-chunk' }
    const quote = normalize(support.quote ?? '')
    if (quote.split(' ').filter(Boolean).length < MIN_QUOTE_WORDS) return { reason: 'short-quote' }
    if (!normalize(chunk.text).includes(quote)) return { reason: 'quote-not-found' }
    values.push(...numbersIn(quote).map(Number))
    sources.add(chunk.sourceId)
    const line = quoteLine(chunk, quote)
    supports.push({
      kind: 'quote',
      chunkId: chunk.id,
      quote,
      sourceId: chunk.sourceId,
      place: chunkPlace(chunk, shortName(chunk.sourceId), line),
      ...(chunk.pdfPage !== undefined && { pdfPage: chunk.pdfPage, reportPage: chunk.reportPage ?? null }),
      ...(chunk.file !== undefined && { file: chunk.file, line }),
    })
  }

  if (/[{}]/.test(text)) return { reason: 'malformed' }
  if (ORDER.test(text) || IMPERATIVE.test(text)) return { reason: 'order' }
  // Every tool runs on BASS-II's data or models, so a tool value can back "BASS-II".
  if (MENTIONS_REPORT.test(text) && !sources.has(REPORT)) return { reason: 'misattributed' }
  if (MENTIONS_BASS2.test(text) && !usesTool && ![...sources].some((s) => BASS2_SOURCES.has(s))) {
    return { reason: 'misattributed' }
  }
  if (!numbersIn(text).every((numeral) => isTraceable(numeral, values))) return { reason: 'untraceable-number' }
  return { text, supports }
}

// Lab Partner's retrieval (SPEC §7.1 step 1): the source text cut into ~800-character chunks with
// 150 characters of overlap (pipeline/scripts/chunks.ts writes them to api/_data/chunks.json),
// and a MiniSearch index over them. Pure: the same chunks and question give the same top 6.
import MiniSearch from 'minisearch'
import { normalize } from './normalize'

export const CHUNK_CHARS = 800
export const CHUNK_OVERLAP = 150
export const TOP_K = 6
/** At most this many of the top chunks from one source, so one poster can't crowd out the report. */
export const MAX_PER_SOURCE = 3

/** One piece of a source's text, and where it came from. */
export interface Chunk {
  /** Short and stable within one chunks.json, e.g. "c0412". */
  id: string
  sourceId: string
  /** PDF sources: the 1-based PDF page, and the report's own page number when it prints one. */
  pdfPage?: number
  reportPage?: number | null
  /** PSI metadata files: the file inside pipeline/sources/<SOURCE-ID>/ and its 1-based lines. */
  file?: string
  line?: number
  lineEnd?: number
  /** PSI chunks that join several lines: [line, offset in `text` where it starts]. */
  lines?: [number, number][]
  /** normalize()d text. */
  text: string
}

export interface ChunksFile {
  generatedBy: string
  generatedAt: string
  model: null
  promptVersion: null
  chunks: Chunk[]
}

/**
 * Cuts text into windows of at most `size` characters that overlap by about `overlap`, breaking
 * at a space so no word is cut. Text shorter than `size` is one window.
 */
export function splitText(text: string, size = CHUNK_CHARS, overlap = CHUNK_OVERLAP): string[] {
  const clean = normalize(text)
  if (clean.length <= size) return clean ? [clean] : []
  const pieces: string[] = []
  let start = 0
  while (start < clean.length) {
    let end = Math.min(clean.length, start + size)
    if (end < clean.length) {
      // Prefer the end of a sentence in the last third of the window, else the last space.
      const window = clean.slice(start, end)
      const sentence = window.lastIndexOf('. ')
      const space = window.lastIndexOf(' ')
      const cut = sentence > size * 0.66 ? sentence + 1 : space > 0 ? space : window.length
      end = start + cut
    }
    pieces.push(clean.slice(start, end).trim())
    if (end >= clean.length) break
    // Step back by the overlap, then forward to the start of a word.
    let next = Math.max(end - overlap, start + 1)
    const space = clean.indexOf(' ', next)
    next = space === -1 || space >= end ? next : space + 1
    start = next
  }
  return pieces.filter((piece) => piece.length > 0)
}

// Words that carry no meaning for search, including the question words people ask with.
const STOP_WORDS = new Set(
  (
    'a an and are as at be been but by can could did do does for from had has have how i if in into is it its ' +
    'me my no not of on or our so than that the their them then there these they this those to was we were ' +
    'what when where which who why will with would you your about any some there here should much many very ' +
    'tell show explain happened happen'
  ).split(' '),
)

// A few everyday words people ask with, and the words NASA's text uses for them.
const SYNONYMS: Record<string, string[]> = {
  breeze: ['flow', 'ventilation'],
  breezes: ['flow', 'ventilation'],
  airflow: ['flow'],
  dangerous: ['flammability', 'hazard'],
  danger: ['flammability', 'hazard'],
  cabin: ['spacecraft', 'volume'],
  suppression: ['suppression', 'extinguish'],
  toxic: ['co', 'smac'],
  toxicity: ['co', 'smac'],
  lunar: ['moon', 'lunar'],
  moon: ['lunar'],
  oxygen: ['o2'],
}

function processTerm(term: string): string | string[] | null {
  const lower = term.toLowerCase()
  if (lower.length < 2 && !/\d/.test(lower)) return null
  if (STOP_WORDS.has(lower)) return null
  const extra = SYNONYMS[lower]
  return extra ? [lower, ...extra] : lower
}

export type ChunkIndex = { search: (question: string, k?: number) => Chunk[] }

/** Builds the search index once (at a function's cold start); `search` returns the top chunks. */
export function buildIndex(chunks: readonly Chunk[]): ChunkIndex {
  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]))
  const mini = new MiniSearch<Chunk>({
    fields: ['text'],
    idField: 'id',
    processTerm,
    searchOptions: { prefix: (term) => term.length > 3, fuzzy: (term) => (term.length > 5 ? 0.2 : false) },
  })
  mini.addAll(chunks as Chunk[])
  return {
    search(question: string, k = TOP_K) {
      const picked: Chunk[] = []
      const perSource = new Map<string, number>()
      for (const hit of mini.search(normalize(question))) {
        const chunk = byId.get(hit.id as string)
        if (!chunk) continue
        const count = perSource.get(chunk.sourceId) ?? 0
        if (count >= MAX_PER_SOURCE) continue
        perSource.set(chunk.sourceId, count + 1)
        picked.push(chunk)
        if (picked.length === k) break
      }
      return picked
    },
  }
}

/** The 1-based file line a quote starts on, for PSI chunks; undefined for PDF chunks. */
export function quoteLine(chunk: Chunk, quote: string): number | undefined {
  if (typeof chunk.line !== 'number') return undefined
  const at = chunk.text.indexOf(normalize(quote))
  if (at === -1 || !chunk.lines) return chunk.line
  let line = chunk.line
  for (const [number, offset] of chunk.lines) if (offset <= at) line = number
  return line
}

/** Where a chunk is, for a citation chip: "BASS-II report, p. 52", "PSI-26, line 40". */
export function chunkPlace(chunk: Chunk, shortName: string, line = chunk.line): string {
  if (typeof chunk.reportPage === 'number') return `${shortName}, p. ${chunk.reportPage}`
  if (typeof chunk.pdfPage === 'number') return `${shortName}, PDF p. ${chunk.pdfPage}`
  if (typeof line === 'number') return `${shortName}, line ${line}`
  return shortName
}

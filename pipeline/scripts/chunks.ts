// npm run pipeline:chunks
//
// Cuts every indexed source into ~800-character chunks with 150 characters of overlap (SPEC §7.1)
// and writes api/_data/chunks.json, which Lab Partner searches. No LLM is involved, so model and
// promptVersion are null (CLAUDE.md rule 11).
//
// - The BASS-II report PDF: one page at a time, labelled with the report's own page number from
//   its header ("NASA/TM-20210011385 52"). Front matter (cover, contents, lists) has no arabic page
//   number and is left out: its dot leaders only add noise to search.
// - The Zayac 2024 poster: its one page.
// - The PSI metadata files (i_Investigation.txt): each "Key<TAB>value" line becomes "Key: value",
//   keeping its line number. Contact details are left out.
// Only sources in src/data/sources.json are indexed, so every chunk can be cited.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractText, getDocumentProxy } from 'unpdf'
import sources from '../../src/data/sources.json'
import { normalize } from '../../src/lib/normalize'
import { CHUNK_CHARS, splitText, type Chunk, type ChunksFile } from '../../src/lib/retrieve'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SOURCES_DIR = join(ROOT, 'pipeline', 'sources')
const OUT = join(ROOT, 'api', '_data', 'chunks.json')

const PDFS: { sourceId: string; path: string; header: RegExp | null }[] = [
  {
    sourceId: 'nasa-tm-20210011385',
    path: join(SOURCES_DIR, 'PSI-25', 'BASS-II Summary Report.pdf'),
    header: /^NASA\/TM-20210011385 (\S+) /,
  },
  { sourceId: 'zayac-2024', path: join(SOURCES_DIR, 'zayac-2024', 'Glenn_2024_ZayacPoster.pdf'), header: null },
]

const PSI_IDS = ['psi-26', 'psi-62', 'psi-69', 'psi-98', 'psi-99', 'psi-100', 'psi-102']

/** Lines of a PSI file that are contact details or empty structure, not science. */
const SKIP_KEY = /(Email|Phone|Fax|Address|Mid Initials|Term Accession Number|Term Source)/

type Piece = Omit<Chunk, 'id'>

async function pdfPieces(sourceId: string, path: string, header: RegExp | null): Promise<Piece[]> {
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(path)), { verbosity: 0 })
  const { text } = await extractText(pdf, { mergePages: false })
  const pieces: Piece[] = []
  text.forEach((raw, i) => {
    let page = normalize(raw)
    let reportPage: number | null = null
    if (header) {
      const match = header.exec(page)
      // Only pages with an arabic report page number: the body, its appendices and references.
      if (!match || !/^\d+$/.test(match[1])) return
      reportPage = Number(match[1])
      page = page.slice(match[0].length)
    }
    for (const piece of splitText(page)) pieces.push({ sourceId, pdfPage: i + 1, reportPage, text: piece })
  })
  return pieces
}

/** "Comment[Research Impacts]" reads as "Research Impacts". */
function keyName(key: string): string {
  const comment = /^Comment\[(.+)\]$/.exec(key)
  return comment ? comment[1] : key
}

function psiPieces(sourceId: string): Piece[] {
  const file = 'i_Investigation.txt'
  const lines = readFileSync(join(SOURCES_DIR, sourceId.toUpperCase(), file), 'utf8').split(/\r?\n/)
  const entries: { line: number; text: string }[] = []
  lines.forEach((raw, i) => {
    if (!raw.includes('\t')) {
      // A quoted value can run over several lines ("1. Select the test pressure…"): keep each
      // continuation line as it is. Section headers ("STUDY CONTACTS") carry nothing to search.
      const text = raw.trim().replace(/^"|"$/g, '').trim()
      if (text && !/^[A-Z ]+$/.test(text)) entries.push({ line: i + 1, text: normalize(text) })
      return
    }
    const [key, ...values] = raw.split('\t')
    const value = values
      .map((cell) => cell.trim().replace(/^"(.*)"$/s, '$1').trim())
      .filter(Boolean)
      .join('; ')
    if (!key || !value || SKIP_KEY.test(key)) return
    entries.push({ line: i + 1, text: normalize(`${keyName(key.trim())}: ${value}`) })
  })

  // Short lines are grouped up to the chunk size; a long line is cut into its own windows.
  const pieces: Piece[] = []
  let group: { line: number; text: string }[] = []
  const flush = () => {
    if (group.length === 0) return
    const text = group.map((entry) => entry.text).join(' ')
    const lines: [number, number][] = []
    let offset = 0
    for (const entry of group) {
      lines.push([entry.line, offset])
      offset += entry.text.length + 1
    }
    const piece: Piece = { sourceId, file, line: group[0].line, lineEnd: group[group.length - 1].line, text }
    if (group.length > 1) piece.lines = lines
    pieces.push(piece)
    group = []
  }
  for (const entry of entries) {
    if (entry.text.length > CHUNK_CHARS) {
      flush()
      for (const text of splitText(entry.text)) pieces.push({ sourceId, file, line: entry.line, lineEnd: entry.line, text })
      continue
    }
    const length = group.reduce((sum, e) => sum + e.text.length + 1, 0)
    if (length + entry.text.length > CHUNK_CHARS) flush()
    group.push(entry)
  }
  flush()
  return pieces
}

const known = new Set(sources.map((source) => source.id))
const pieces: Piece[] = []
for (const { sourceId, path, header } of PDFS) {
  if (!known.has(sourceId)) throw new Error(`${sourceId} is not in src/data/sources.json`)
  pieces.push(...(await pdfPieces(sourceId, path, header)))
}
for (const sourceId of PSI_IDS) {
  if (!known.has(sourceId)) throw new Error(`${sourceId} is not in src/data/sources.json`)
  pieces.push(...psiPieces(sourceId))
}

const chunks: Chunk[] = pieces.map((piece, i) => ({ id: `c${String(i).padStart(4, '0')}`, ...piece }))
const file: ChunksFile = {
  generatedBy: 'pipeline/scripts/chunks.ts',
  generatedAt: new Date().toISOString(),
  model: null,
  promptVersion: null,
  chunks,
}
writeFileSync(OUT, `${JSON.stringify(file, null, 1)}\n`)

const bySource = new Map<string, number>()
for (const chunk of chunks) bySource.set(chunk.sourceId, (bySource.get(chunk.sourceId) ?? 0) + 1)
console.log(`Wrote ${chunks.length} chunks to api/_data/chunks.json`)
for (const [sourceId, count] of bySource) console.log(`  ${sourceId}: ${count}`)

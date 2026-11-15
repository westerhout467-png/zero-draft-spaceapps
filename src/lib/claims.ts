// Read access to src/data/claims.json and src/data/sources.json, with the shapes from SPEC §6.
// Locator also carries `file` and `line` for claims quoted from PSI metadata files.
// Source.short names a source in a footnote preview; Claim.emphasis is the phrase the drawer
// underlines.
import claimsData from '../data/claims.json'
import sourcesData from '../data/sources.json'

export interface Source {
  id: string
  title: string
  /** A short name for footnote previews: "BASS-II report", "PSI-26". */
  short?: string
  publisher: string
  year: number | null
  doi: string | null
  url: string | null
  kind: 'report' | 'dataset' | 'paper' | 'poster' | 'web'
  credit?: string
}

export interface Locator {
  pdfPage?: number
  reportPage?: number | null
  spansNextPage?: boolean
  table?: string
  row?: string
  /** File inside pipeline/sources/<SOURCE-ID>/, for PSI metadata quotes. */
  file?: string
  /** 1-based line number in `file`. */
  line?: number
}

export interface Claim {
  id: string
  topic: string
  text: string
  value?: number
  unit?: string
  kind: 'quoted' | 'computed'
  sourceId?: string
  locator?: Locator | null
  quote?: string
  /** A phrase inside `quote` (an exact substring). The drawer underlines only this phrase. */
  emphasis?: string
  formula?: string
  inputs?: string[]
  verified: boolean
}

export const CLAIMS = claimsData as unknown as readonly Claim[]
export const SOURCES = sourcesData as unknown as readonly Source[]

const claimsById = new Map(CLAIMS.map((claim) => [claim.id, claim]))
const sourcesById = new Map(SOURCES.map((source) => [source.id, source]))

export function getClaim(id: string): Claim | undefined {
  return claimsById.get(id)
}

export function getSource(id: string | undefined): Source | undefined {
  return id === undefined ? undefined : sourcesById.get(id)
}

/** Unverified claims never appear outside the citation drawer (CLAUDE.md rule 3). */
export function isVerified(id: string): boolean {
  return getClaim(id)?.verified === true
}

/** The folder under pipeline/sources/ that holds a source's files: "psi-98" → "PSI-98". */
export function sourceFolder(sourceId: string): string {
  return sourceId.toUpperCase()
}

/**
 * The one-line footnote preview: the source's short name plus where in it the quote is.
 * "BASS-II report, p. 76", "BASS-II report, PDF p. 4", "PSI-69, line 42", "PSI-25, row 129".
 */
export function citePreview(claim: Claim, source: Source | undefined = getSource(claim.sourceId)): string {
  if (claim.kind === 'computed') return 'Calculated from cited inputs'
  const name = source?.short ?? source?.title ?? 'Source'
  const locator = claim.locator
  if (locator?.row) return `${name}, row ${locator.row}`
  if (typeof locator?.reportPage === 'number') return `${name}, p. ${locator.reportPage}`
  if (typeof locator?.pdfPage === 'number') return `${name}, PDF p. ${locator.pdfPage}`
  if (typeof locator?.line === 'number') return `${name}, line ${locator.line}`
  return name
}

/** A quote cut around its emphasis phrase. `emphasis` is '' when there is none or it isn't in the quote. */
export function splitEmphasis(
  quote: string,
  emphasis: string | undefined,
): { before: string; emphasis: string; after: string } {
  const at = emphasis ? quote.indexOf(emphasis) : -1
  if (!emphasis || at === -1) return { before: quote, emphasis: '', after: '' }
  return {
    before: quote.slice(0, at),
    emphasis,
    after: quote.slice(at + emphasis.length),
  }
}

/**
 * The verified claims quoting NASA's Appendix A note for one test: "bass2.note.o12", and
 * "bass2.note.m5-los" for M5 (the part after the test id names the note).
 */
export function testNoteClaimIds(testId: string): string[] {
  const prefix = `bass2.note.${testId.toLowerCase()}`
  return CLAIMS.filter((claim) => claim.verified && (claim.id === prefix || claim.id.startsWith(`${prefix}-`))).map(
    (claim) => claim.id,
  )
}

/** A link for a source: its URL, else its DOI. */
export function sourceLink(source: Source): string | null {
  if (source.url) return source.url
  if (source.doi) return `https://doi.org/${source.doi}`
  return null
}

/**
 * A PSI record field's value as its claim quotes it: the text after the field name's tab, e.g.
 * "Comment[Investigation Start Date]\t03-02-2001" gives "03-02-2001". Empty if there is none.
 */
export function quotedField(id: string): string {
  const quote = getClaim(id)?.quote ?? ''
  return quote.includes('\t') ? (quote.split('\t').at(-1)?.trim() ?? '') : ''
}

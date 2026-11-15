// npm run check:claims
//
// 1. Every claim with locator.pdfPage: its quote must be on that PDF page (or across that page and
//    the next when spansNextPage is true), after normalize() on both sides. PDF text comes from
//    unpdf, one string per page.
// 2. Every claim with locator.file: its quote must be on that line of the file under
//    pipeline/sources/<SOURCE-ID>/ (sourceId "psi-98" is folder "PSI-98").
// 3. Every <Cite id="..."> in src/ must name a claim in src/data/claims.json.
// 4. Every figure in src/lib/figures.ts: its image exists under public/, its check text is on its
//    PDF page, and every claim it is shown with exists.
// Exits with code 1 if anything fails.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractText, getDocumentProxy } from 'unpdf'
import type { Claim } from '../../src/lib/claims'
import { CLAIM_FIGURES, FIGURES, pageHasFigure } from '../../src/lib/figures'
import { normalize } from '../../src/lib/normalize'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SOURCES_DIR = join(ROOT, 'pipeline', 'sources')

/** Report PDFs live in the folder of the dataset they came with; a poster has its own folder. */
const PDF_FOLDER_FOR_SOURCE: Record<string, string> = {
  'nasa-tm-20210011385': 'PSI-25',
  'zayac-2024': 'zayac-2024',
}

// An optional argument checks another claims file (used to test that the checker fails).
const claimsPath = process.argv[2] ?? join(ROOT, 'src', 'data', 'claims.json')
const claims: Claim[] = JSON.parse(readFileSync(claimsPath, 'utf8'))
const failures: string[] = []
const warnings: string[] = []

/** Loads a source's PDF as normalized text, one entry per page. */
const pdfCache = new Map<string, string[]>()
async function pdfPages(sourceId: string): Promise<string[]> {
  const cached = pdfCache.get(sourceId)
  if (cached) return cached
  const folder = PDF_FOLDER_FOR_SOURCE[sourceId]
  if (!folder) throw new Error(`No PDF folder known for source "${sourceId}"`)
  const pdfs = readdirSync(join(SOURCES_DIR, folder)).filter((name) => name.endsWith('.pdf'))
  if (pdfs.length !== 1) throw new Error(`Expected one PDF in ${folder}/, found ${pdfs.length}`)
  const data = new Uint8Array(readFileSync(join(SOURCES_DIR, folder, pdfs[0])))
  const pdf = await getDocumentProxy(data, { verbosity: 0 })
  const { text } = await extractText(pdf, { mergePages: false })
  const pages = text.map(normalize)
  pdfCache.set(sourceId, pages)
  return pages
}

async function checkPdfQuote(claim: Claim): Promise<boolean> {
  const { pdfPage, spansNextPage } = claim.locator!
  const pages = await pdfPages(claim.sourceId!)
  const quote = normalize(claim.quote ?? '')
  const index = pdfPage! - 1
  const onPage = spansNextPage ? `${pages[index]} ${pages[index + 1] ?? ''}` : pages[index]
  if (onPage?.includes(quote)) return true
  const elsewhere = pages.findIndex((page) => page.includes(quote))
  failures.push(
    `${claim.id}: quote not on PDF page ${pdfPage}` +
      (elsewhere >= 0 ? ` (it is on PDF page ${elsewhere + 1})` : ' (not found on any page)'),
  )
  return false
}

function checkFileQuote(claim: Claim): boolean {
  const { file, line } = claim.locator!
  const folder = claim.sourceId!.toUpperCase()
  const lines = readFileSync(join(SOURCES_DIR, folder, file!), 'utf8').split(/\r?\n/)
  const quote = normalize(claim.quote ?? '')
  if (normalize(lines[line! - 1] ?? '').includes(quote)) return true
  const elsewhere = lines.findIndex((text) => normalize(text).includes(quote))
  failures.push(
    `${claim.id}: quote not on line ${line} of ${folder}/${file}` +
      (elsewhere >= 0 ? ` (it is on line ${elsewhere + 1})` : ' (not found in the file)'),
  )
  return false
}

// 1 and 2: quotes.
let checked = 0
let passed = 0
for (const claim of claims) {
  if (claim.kind !== 'quoted') continue
  checked++
  let ok = false
  if (typeof claim.locator?.pdfPage === 'number') ok = await checkPdfQuote(claim)
  else if (typeof claim.locator?.file === 'string') ok = checkFileQuote(claim)
  else failures.push(`${claim.id}: no pdfPage or file to check the quote against`)
  if (ok) passed++
  if (ok && !claim.verified) warnings.push(`${claim.id}: quote checks out but the claim is marked unverified`)
}

// Computed claims: every input must be a claim.
const ids = new Set(claims.map((claim) => claim.id))
for (const claim of claims) {
  if (claim.kind !== 'computed') continue
  for (const input of claim.inputs ?? []) {
    if (!ids.has(input)) failures.push(`${claim.id}: input "${input}" is not a claim`)
  }
}

// 3: Cite ids used in src/.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}
const CITE = /<Cite\b[^>]*?\bid=(?:"([^"]+)"|'([^']+)'|\{\s*(?:"([^"]+)"|'([^']+)')\s*\}|(\{[^}]*\}))/g
const citeIds = new Set<string>()
const dynamicCites: string[] = []
for (const path of sourceFiles(join(ROOT, 'src'))) {
  const text = readFileSync(path, 'utf8')
  for (const match of text.matchAll(CITE)) {
    const where = relative(ROOT, path)
    if (match[5]) {
      // e.g. the drawer's <Cite id={input}>, fed by computed claims' inputs (checked above).
      dynamicCites.push(`${where} id=${match[5]}`)
      continue
    }
    const id = match[1] ?? match[2] ?? match[3] ?? match[4]
    citeIds.add(id)
    const claim = claims.find((c) => c.id === id)
    if (!claim) failures.push(`${where}: <Cite id="${id}"> names no claim in claims.json`)
    else if (!claim.verified) warnings.push(`${where}: <Cite id="${id}"> is unverified, so it renders nothing`)
  }
}
const missingCites = [...citeIds].filter((id) => !ids.has(id)).length

// 4: figures.
let figuresPassed = 0
for (const figure of Object.values(FIGURES)) {
  let ok = true
  if (!existsSync(join(ROOT, 'public', figure.src))) {
    failures.push(`figure ${figure.id}: public/${figure.src} is missing`)
    ok = false
  }
  const pages = await pdfPages(figure.sourceId)
  if (!pageHasFigure(pages[figure.pdfPage - 1] ?? '', figure)) {
    failures.push(`figure ${figure.id}: "${figure.pageText}" is not on PDF page ${figure.pdfPage}`)
    ok = false
  }
  if (ok) figuresPassed++
}
for (const [claimId, figureIds] of Object.entries(CLAIM_FIGURES)) {
  if (!ids.has(claimId)) failures.push(`figures: claim "${claimId}" doesn't exist`)
  for (const id of figureIds) if (!FIGURES[id]) failures.push(`figures: "${claimId}" names no figure "${id}"`)
}

console.log(`Quotes checked: ${passed}/${checked}`)
console.log(`Figures checked against their page: ${figuresPassed}/${Object.keys(FIGURES).length}`)
console.log(`Cite ids used in src/: ${citeIds.size}, missing: ${missingCites}`)
if (dynamicCites.length > 0) {
  console.log(`Cites with an id from a variable (not checkable here): ${dynamicCites.join('; ')}`)
}
for (const warning of warnings) console.log(`Warning: ${warning}`)
for (const failure of failures) console.log(`FAIL: ${failure}`)
if (failures.length > 0) {
  console.log(`check:claims failed with ${failures.length} problem(s).`)
  process.exitCode = 1
} else {
  console.log('check:claims passed.')
}

// npm run data:bass2
//
// Rebuilds public/data/bass2.json and public/data/audit.json from NASA's raw PSI-25 CSV.
// Replaces the old compile_bass2.py, without its bugs (SPEC §9 M3):
// - the CSV is read as UTF-8 with its byte-order mark stripped, CRLF line ends and quoted cells
//   ("1/4"" clear rod") handled, header names trimmed and every raw cell kept exactly
//   (an empty cell stays "", never "nan")
// - every rule matches whole cells (lib/audit.ts), and flow direction comes per test from
//   Appendix A (docs/fixtures/flow-by-test.json), never per PI
// - no heat is computed here: the CSV has no burn times, and 45 tests are inside sensor resolution
//
// It also looks for each Appendix A flow quote on its stated PDF page, so the record drawer shows
// only quotes that check out.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractText, getDocumentProxy } from 'unpdf'
import {
  auditGroups,
  compileBass2,
  lowestFinalO2,
  summarizeAudit,
  type AuditFile,
  type Bass2File,
  type CheckedFlowEvidence,
  type FlowByTest,
} from '../../src/lib/audit'
import { normalize } from '../../src/lib/normalize'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SOURCE_DIR = join(ROOT, 'pipeline', 'sources', 'PSI-25')
const CSV_PATH = join(SOURCE_DIR, 'PSI-25_Experimental table_BASS-II.csv')
const FLOW_PATH = join(ROOT, 'docs', 'fixtures', 'flow-by-test.json')
const OUT_DIR = join(ROOT, 'public', 'data')
const GENERATED_BY = 'pipeline/scripts/compile-bass2.ts'

const csvText = readFileSync(CSV_PATH, 'utf8')
const flowByTest: FlowByTest = JSON.parse(readFileSync(FLOW_PATH, 'utf8'))
const rows = compileBass2(csvText, flowByTest)

// The report PDF, one normalized string per page.
const pdfName = readdirSync(SOURCE_DIR).find((name) => name.endsWith('.pdf'))
if (!pdfName) throw new Error('No report PDF in pipeline/sources/PSI-25/')
const pdf = await getDocumentProxy(new Uint8Array(readFileSync(join(SOURCE_DIR, pdfName))), { verbosity: 0 })
const pages = (await extractText(pdf, { mergePages: false })).text.map(normalize)

const flowEvidence: Record<string, CheckedFlowEvidence> = {}
const unchecked: string[] = []
for (const row of rows) {
  const evidence = flowByTest[row.testId]
  const page = evidence.pdfPage === null ? undefined : pages[evidence.pdfPage - 1]
  const quoteChecked = evidence.quote !== null && page !== undefined && page.includes(normalize(evidence.quote))
  if (evidence.quote !== null && !quoteChecked) unchecked.push(row.testId)
  flowEvidence[row.testId] = { ...evidence, quoteChecked }
}

const generatedAt = new Date().toISOString()
const source = relative(ROOT, CSV_PATH).replaceAll('\\', '/')
const meta = { generatedBy: GENERATED_BY, generatedAt, model: null, promptVersion: null, source }

const bass2: Bass2File = { ...meta, rows, flowEvidence }
const summary = summarizeAudit(rows, { generatedBy: GENERATED_BY, generatedAt })
const lowestBurningO2 = lowestFinalO2(rows.filter((row) => row.burnConfirmed))
const audit: AuditFile = { ...summary, model: null, promptVersion: null, source, lowestBurningO2 }

writeFileSync(join(OUT_DIR, 'bass2.json'), `${JSON.stringify(bass2, null, 1)}\n`)
writeFileSync(join(OUT_DIR, 'audit.json'), `${JSON.stringify(audit, null, 1)}\n`)

const groups = auditGroups(summary.testIds)
const quotes = rows.filter((row) => flowByTest[row.testId].quote !== null).length
console.log(`Rows: ${rows.length}`)
console.log(`O2 usable: ${summary.counts.o2Usable}, burn confirmed: ${summary.counts.burnConfirmed}`)
console.log(
  `Quarantined: ${groups.quarantined.join(' ')} | CO over range: ${groups['co-over-range'].join(' ')} | ` +
    `date errors: ${groups['date-error'].join(' ')}`,
)
console.log(`Appendix A flow quotes found on their page: ${quotes - unchecked.length}/${quotes}`)
if (unchecked.length > 0) console.log(`Not found (hidden in the UI): ${unchecked.join(' ')}`)
console.log('Wrote public/data/bass2.json and public/data/audit.json')

// npm run pipeline:outcomes            (asks only for batches with no kept reply)
// npm run pipeline:outcomes -- --fresh (asks again for every batch)
//
// The test-outcome reader (SPEC F2b, §7.2). It splits each Appendix A page of the BASS-II report
// (PDF pp. 111 to 121) into one row per test, then asks the LLM what each row's notes say the
// flame did: three calls, the tests grouped by principal investigator (a free tier allows few
// requests a day). An answer is kept only if its quote is in that test's own row
// (src/lib/outcomes.ts). Rows whose answer fails the check are asked once more, together, in
// one call. Writes public/data/test-outcomes.json (SPEC §6) and keeps every raw reply in
// pipeline/out/raw/outcomes-batch-<n>.json (and outcomes-reask.json).
import flowByTest from '../../docs/fixtures/flow-by-test.json'
import { compileBass2, type FlowByTest } from '../../src/lib/audit'
import type { TestOutcome, TestOutcomesFile } from '../../src/lib/generatedData'
import { assembleOutcomes, checkPage, notesOf, splitRows, type AppendixRow, type PageCheck, type RawOutcome } from '../../src/lib/outcomes'
import { ask, callsMade, loadPages, loadPrompt, parseReply, read, writeJson } from './pipelineIo'

const GENERATED_BY = 'pipeline/scripts/outcomes.ts'
/** Appendix A: the test matrices (SPEC §7.2). */
const FIRST_PAGE = 111
const LAST_PAGE = 121

/** One call per group of principal investigators: 46, 51 and 29 tests. */
const BATCHES: readonly (readonly string[])[] = [['Bhattacharjee', 'Ferkul', 'Miller'], ['Fernandez-Pello', 'Olson'], ["T'ien"]]
/** Room for every entry (about 50 tokens each) and the model's thinking, which Gemini counts in the cap. */
const BATCH_MAX_TOKENS = 12_000

const SCHEMA = {
  type: 'object',
  properties: {
    outcomes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          testId: { type: 'string' },
          outcome: { type: 'string', enum: ['sustained', 'brief', 'no-ignition', 'not-stated'] },
          quote: { type: 'string' },
        },
        required: ['testId', 'outcome', 'quote'],
        additionalProperties: false,
      },
    },
  },
  required: ['outcomes'],
  additionalProperties: false,
}

/** What the model reads: each test's notes under its id (the settings and readings are left out). */
const asNotes = (rows: readonly AppendixRow[]) => rows.map((row) => `### ${row.testId}\n${notesOf(row)}`).join('\n\n')

async function main() {
  const fresh = process.argv.includes('--fresh')
  const prompt = loadPrompt('read-outcomes.md')
  const csv = read('pipeline', 'sources', 'PSI-25', 'PSI-25_Experimental table_BASS-II.csv')
  const tests = compileBass2(csv, flowByTest as FlowByTest)
  const testIds = tests.map((row) => row.testId)
  const piOf = new Map(tests.map((row) => [row.testId, row.pi]))
  const pages = loadPages('PSI-25').pages.filter((page) => page.page >= FIRST_PAGE && page.page <= LAST_PAGE)
  // Every test's row, in page order, with the page it is on.
  const rows = pages.flatMap((page) => splitRows(page.text, testIds).map((row) => ({ ...row, pdfPage: page.page })))
  const grouped = BATCHES.map((pis) => rows.filter((row) => pis.includes(piOf.get(row.testId) ?? '')))
  const left = rows.filter((row) => !grouped.flat().includes(row))
  if (left.length) throw new Error(`No batch takes: ${left.map((row) => row.testId).join(', ')}`)

  let checked: TestOutcome[] = []
  let failures: PageCheck['failures'] = []
  let model = ''
  for (const [i, batch] of grouped.entries()) {
    const raw = await ask({
      name: `outcomes-batch-${i + 1}`,
      generatedBy: GENERATED_BY,
      subject: `PSI-25 Appendix A, tests of ${BATCHES[i].join(', ')}`,
      prompt,
      user: asNotes(batch),
      jsonSchema: SCHEMA,
      maxOutputTokens: BATCH_MAX_TOKENS,
      fresh,
    })
    if (model && raw.model !== model) throw new Error(`Batch ${i + 1} was read by ${raw.model}, the others by ${model}: one model per file`)
    model = raw.model
    const reply = parseReply<{ outcomes?: RawOutcome[] }>(raw)?.outcomes
    const result = checkPage(batch, Array.isArray(reply) ? reply : [])
    checked.push(...result.outcomes)
    failures.push(...result.failures)
    const kept = result.outcomes.filter((o) => o.outcome !== 'not-stated').length
    console.log(`batch ${i + 1} (${BATCHES[i].join(', ')}): ${batch.length} rows, ${kept} outcomes kept, ${result.failures.length} failed the check (${raw.finishReason ?? 'no finish reason'})`)
  }

  // Rows whose answer failed the check are asked once more, all in one call. The second answer
  // goes through the same check; nothing is kept on the model's word alone.
  if (failures.length > 0) {
    const again = rows.filter((row) => failures.some((f) => f.testId === row.testId))
    const raw = await ask({
      name: 'outcomes-reask',
      generatedBy: GENERATED_BY,
      subject: `PSI-25 Appendix A, rows that failed the check: ${again.map((row) => row.testId).join(' ')}`,
      prompt,
      user:
        'The quotes given before for these tests were not found word for word in their notes, or broke a rule. ' +
        'Copy consecutive words exactly, 15 at most; a shorter quote is safer.\n\n' +
        asNotes(again),
      jsonSchema: SCHEMA,
      maxOutputTokens: 6_000,
      fresh,
    })
    if (raw.model !== model) throw new Error(`The re-ask was read by ${raw.model}, the batches by ${model}: one model per file`)
    const second = checkPage(again, parseReply<{ outcomes?: RawOutcome[] }>(raw)?.outcomes ?? [])
    const passed = second.outcomes.filter((o) => !second.failures.some((f) => f.testId === o.testId))
    checked = checked.map((o) => passed.find((p) => p.testId === o.testId) ?? o)
    console.log(`re-ask: ${again.length} rows, ${passed.length} passed the check this time`)
    failures = second.failures
  }

  const outcomes = assembleOutcomes(testIds, checked)
  const file: TestOutcomesFile = {
    generatedBy: GENERATED_BY,
    generatedAt: new Date().toISOString(),
    model,
    promptVersion: prompt.version,
    outcomes,
  }
  writeJson(file, 'public', 'data', 'test-outcomes.json')

  const count = (outcome: TestOutcome['outcome']) => outcomes.filter((o) => o.outcome === outcome).length
  const notStated = count('not-stated')
  console.log(
    `\n${outcomes.length} tests: ${count('sustained')} sustained, ${count('brief')} brief, ${count('no-ignition')} no ignition, ` +
      `${notStated} not stated (${((100 * notStated) / outcomes.length).toFixed(1)}%). Model: ${model}, ${prompt.version}. LLM calls made: ${callsMade}.`,
  )
  const noRow = outcomes.filter((o) => !rows.some((row) => row.testId === o.testId)).map((o) => o.testId)
  if (noRow.length) console.log(`No row in Appendix A: ${noRow.join(', ')}`)
  for (const f of failures) console.log(`Still failed the check: ${f.testId} ${f.failure}: ${JSON.stringify(f.raw)}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

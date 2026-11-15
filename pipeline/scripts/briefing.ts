// npm run pipeline:briefing            (asks only if there is no kept reply for these stats)
// npm run pipeline:briefing -- --fresh (asks again)
//
// The AI dataset briefing (SPEC F2, §7.2): 4 to 6 sentences written from the audit's statistics
// only (public/data/audit.json and stats computed from public/data/bass2.json: src/lib/briefing.ts).
// The number check then keeps a sentence only if every number in it is in those statistics; with
// fewer than 4 sentences left the script fails and writes nothing. The raw reply is kept in
// pipeline/out/raw/briefing.json. `npm test` runs the same check on public/data/briefing.json.
import type { AuditFile, Bass2File } from '../../src/lib/audit'
import { briefingStats, checkBriefing, MAX_SENTENCES, MIN_SENTENCES } from '../../src/lib/briefing'
import type { BriefingFile } from '../../src/lib/generatedData'
import { ask, loadPrompt, parseReply, readJson, writeJson } from './pipelineIo'

const GENERATED_BY = 'pipeline/scripts/briefing.ts'

const SCHEMA = {
  type: 'object',
  properties: { sentences: { type: 'array', items: { type: 'string' }, minItems: MIN_SENTENCES, maxItems: MAX_SENTENCES } },
  required: ['sentences'],
  additionalProperties: false,
}

async function main() {
  const prompt = loadPrompt('briefing.md')
  const audit = readJson<AuditFile>('public', 'data', 'audit.json')
  const rows = readJson<Bass2File>('public', 'data', 'bass2.json').rows
  const stats = briefingStats(rows, audit)
  const raw = await ask({
    name: 'briefing',
    generatedBy: GENERATED_BY,
    subject: 'briefing',
    prompt,
    user: JSON.stringify(stats, null, 1),
    jsonSchema: SCHEMA,
    // Six sentences are about 250 tokens; the rest is room for the model's thinking, which
    // Gemini counts in the cap.
    maxOutputTokens: 4_000,
    fresh: process.argv.includes('--fresh'),
  })
  const reply = parseReply<{ sentences?: unknown }>(raw)?.sentences
  const check = checkBriefing(Array.isArray(reply) ? reply : [], stats)
  for (const sentence of check.sentences) console.log(`kept:    ${sentence}`)
  for (const { sentence, problem } of check.dropped) console.log(`dropped: ${sentence}\n         it ${problem}`)
  if (!check.ok) {
    console.error(`\nOnly ${check.sentences.length} sentences passed the number check; a briefing needs ${MIN_SENTENCES}. Nothing was written.`)
    process.exitCode = 1
    return
  }
  const file: BriefingFile = {
    generatedBy: GENERATED_BY,
    generatedAt: new Date().toISOString(),
    model: raw.model,
    promptVersion: prompt.version,
    sentences: check.sentences,
  }
  writeJson(file, 'public', 'data', 'briefing.json')
  console.log(`\n${check.sentences.length} sentences written to public/data/briefing.json, ${check.dropped.length} dropped.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

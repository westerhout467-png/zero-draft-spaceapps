// npm run lab:cache            (all six suggested questions)
// npm run lab:cache -- m5      (just the ones named)
//
// Asks Lab Partner each suggested question (src/lib/labSuggested.ts) with the real Gemini call and
// saves the checked answers to src/data/labPartnerCache.json, so they answer instantly and work
// with the network off (SPEC F5). The same checks as any live answer apply. On top, an answer is
// only kept if it has no error, isn't a refusal, has at least 2 checked sentences, and does on
// screen what SPEC F5 says it should; otherwise the question is asked again, up to 3 times.
// Questions are spaced out so a free-tier key isn't rate limited.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LabEvent } from '../../src/lib/labProtocol'
import { answerQuestion, promptVersion } from '../../src/lib/labPartner'
import { DEFAULT_CONTEXT } from '../../src/lib/labTools'
import { argsInclude, SUGGESTED, type Suggested } from '../../src/lib/labSuggested'
import { scriptDeps } from './labDeps'

const OUT = join(fileURLToPath(new URL('../../', import.meta.url)), 'src', 'data', 'labPartnerCache.json')
const ATTEMPTS = 3
/** Pause between questions. A token-per-minute limit (Groq's free tier) needs about 65 s. */
const SPACING_MS = Number(process.env.LAB_CACHE_SPACING_MS) || 15_000

interface Answer {
  id: string
  question: string
  events: LabEvent[]
}
interface CacheFile {
  generatedBy: string
  generatedAt: string | null
  model: string | null
  promptVersion: string | null
  answers: Answer[]
}

const deps = scriptDeps()
const wanted = process.argv.slice(2)
const todo = wanted.length ? SUGGESTED.filter((s) => wanted.includes(s.id)) : SUGGESTED
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Why an answer can't be cached, or null if it can. */
function problem(item: Suggested, events: LabEvent[]): string | null {
  const error = events.find((e) => e.type === 'error')
  if (error?.type === 'error') return `error: ${error.message}`
  const done = events.find((e) => e.type === 'done')
  if (!done || done.type !== 'done') return 'no answer'
  if (done.refused) return 'refused'
  const sentences = events.filter((e) => e.type === 'sentence').length
  if (sentences < (item.minSentences ?? 2)) return `only ${sentences} checked sentence`
  const tools = events.flatMap((e) => (e.type === 'tool' ? [e.result] : []))
  if (tools.some((t) => t.error)) return `a tool call was refused: ${tools.find((t) => t.error)?.error}`
  if (item.expects && !tools.some((t) => t.name === item.expects!.name && argsInclude(t.args, item.expects!.args))) {
    return `expected ${item.expects.name}(${JSON.stringify(item.expects.args)}), got ${tools.map((t) => `${t.name}(${JSON.stringify(t.args)})`).join(', ') || 'no tools'}`
  }
  return null
}

const file = JSON.parse(readFileSync(OUT, 'utf8')) as CacheFile
let model: string | null = null
let failed = 0

for (const [n, item] of todo.entries()) {
  if (n > 0) await sleep(SPACING_MS)
  let kept: LabEvent[] | null = null
  for (let attempt = 1; attempt <= ATTEMPTS && !kept; attempt++) {
    if (attempt > 1) await sleep(SPACING_MS)
    const events: LabEvent[] = []
    for await (const event of answerQuestion(item.question, DEFAULT_CONTEXT, deps)) events.push(event)
    const why = problem(item, events)
    const sentences = events.filter((e) => e.type === 'sentence').length
    const dropped = events.find((e) => e.type === 'dropped')
    console.log(
      `${item.id} (try ${attempt}): ${why ?? `ok, ${sentences} sentences`}` +
        (dropped?.type === 'dropped' ? `, ${dropped.count} dropped (${dropped.reasons.join(', ')})` : ''),
    )
    if (why === null) {
      kept = events.filter((e) => e.type !== 'status')
      const done = events.find((e) => e.type === 'done')
      if (done?.type === 'done') model = done.model
    } else if (why.startsWith('error') && /usage limit/.test(why)) {
      break
    }
  }
  if (!kept) {
    failed++
    continue
  }
  const answer: Answer = { id: item.id, question: item.question, events: kept }
  file.answers = [...file.answers.filter((a) => a.id !== item.id), answer].sort(
    (a, b) => SUGGESTED.findIndex((s) => s.id === a.id) - SUGGESTED.findIndex((s) => s.id === b.id),
  )
  // Saved after each one, so a quota stop keeps what was done.
  file.generatedAt = new Date().toISOString()
  file.model = model ?? file.model
  file.promptVersion = promptVersion(deps)
  writeFileSync(OUT, `${JSON.stringify(file, null, 1)}\n`)
}

console.log(`\nCached ${file.answers.length} of ${SUGGESTED.length} suggested questions in src/data/labPartnerCache.json.`)
if (failed > 0) {
  console.log(`${failed} couldn't be cached this time; run again later with their ids.`)
  process.exitCode = 1
}

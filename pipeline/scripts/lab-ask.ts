// npm run lab:ask -- "Why are gentle cabin breezes dangerous?"
// Asks Lab Partner one question from the command line, with the real Gemini call, and prints every
// event: the tools it ran, each checked sentence with its citations, and anything it dropped.
import { DROP_REASON_TEXT, REFUSAL } from '../../src/lib/labProtocol'
import { answerQuestion } from '../../src/lib/labPartner'
import { DEFAULT_CONTEXT } from '../../src/lib/labTools'
import { scriptDeps } from './labDeps'

const question = process.argv.slice(2).join(' ').trim()
if (!question) {
  console.log('Usage: npm run lab:ask -- "your question"')
  process.exit(1)
}

const started = Date.now()
const verbose = process.env.LAB_VERBOSE === '1'
const deps = {
  ...scriptDeps(),
  onReply: (step: string, reply: { text: string; finishReason?: string; usage?: { input?: number; output: number; thinking: number } }) => {
    const tokens = reply.usage ? `${reply.usage.input ?? '?'} in, ${reply.usage.output} out, ${reply.usage.thinking} thinking` : 'no usage'
    console.log(`        [${step}: ${reply.finishReason ?? '?'}, ${tokens}]`)
    if (verbose && reply.text) console.log(reply.text)
  },
}
for await (const event of answerQuestion(question, DEFAULT_CONTEXT, deps)) {
  const at = `${((Date.now() - started) / 1000).toFixed(1)}s`.padStart(6)
  switch (event.type) {
    case 'status':
      console.log(`${at}  … ${event.stage}`)
      break
    case 'tool': {
      const r = event.result
      console.log(`${at}  → ${r.id} ${r.name}(${JSON.stringify(r.args)}): ${r.error ? `REFUSED ${r.error}` : r.summary}`)
      break
    }
    case 'sentence':
      console.log(`${at}  ✓ ${event.sentence.text}`)
      for (const s of event.sentence.supports) {
        console.log(`          ${s.kind === 'quote' ? `“${s.quote}” (${s.place})` : `${s.ref}: ${s.label}`}`)
      }
      break
    case 'dropped':
      console.log(`${at}  ✗ dropped ${event.count}: ${event.reasons.map((r) => DROP_REASON_TEXT[r]).join('; ')}`)
      break
    case 'done':
      if (event.refused) console.log(`${at}  ${REFUSAL}`)
      console.log(`${at}  done (${event.model}, ${event.promptVersion})`)
      break
    case 'error':
      console.log(`${at}  ERROR ${event.message}`)
      process.exitCode = 1
  }
}

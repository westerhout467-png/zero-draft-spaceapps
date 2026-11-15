// Lab Partner's dependencies for scripts run with tsx (lab-ask.ts, lab-cache.ts): the real
// Gemini call, the chunks, the BASS-II rows and the prompts, read from disk. The server builds the
// same things in api/_src/lab-partner.ts, bundled by Vite.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import flowByTest from '../../docs/fixtures/flow-by-test.json'
import { compileBass2, type FlowByTest } from '../../src/lib/audit'
import { parsePrompt, type LabDeps } from '../../src/lib/labPartner'
import { buildIndex, type ChunksFile } from '../../src/lib/retrieve'
import { complete, loadLocalEnv } from './llm'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const read = (...path: string[]) => readFileSync(join(ROOT, ...path), 'utf8')

export function scriptDeps(): LabDeps {
  loadLocalEnv(join(ROOT, '.env.local'))
  const chunks = (JSON.parse(read('api', '_data', 'chunks.json')) as ChunksFile).chunks
  const csv = read('pipeline', 'sources', 'PSI-25', 'PSI-25_Experimental table_BASS-II.csv')
  return {
    complete,
    index: buildIndex(chunks),
    rows: compileBass2(csv, flowByTest as FlowByTest),
    prompts: {
      tools: parsePrompt(read('pipeline', 'prompts', 'lab-partner-tools.md')),
      answer: parsePrompt(read('pipeline', 'prompts', 'lab-partner-answer.md')),
    },
  }
}

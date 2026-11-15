// POST /api/lab-partner: Lab Partner's endpoint (SPEC F5, §7.1).
//
// Request: { "question": "…", "context": LabContext }.
// Response: one JSON LabEvent per line (application/x-ndjson), streamed as the answer is built.
//
// This is the source. `npm run build:api` bundles it, with everything it imports from src/lib and
// the chunks, into the single file api/lab-partner.js that Vercel runs: Node's ES modules can't
// load src/lib's extensionless imports on their own. In `npm run dev` and `npm run preview`,
// vite.config.ts serves the same handler.
import type { IncomingMessage, ServerResponse } from 'node:http'
import answerPrompt from '../../pipeline/prompts/lab-partner-answer.md?raw'
import toolsPrompt from '../../pipeline/prompts/lab-partner-tools.md?raw'
import csvText from '../../pipeline/sources/PSI-25/PSI-25_Experimental table_BASS-II.csv?raw'
import flowByTest from '../../docs/fixtures/flow-by-test.json'
import { complete } from '../../pipeline/scripts/llm'
import { compileBass2, type FlowByTest } from '../../src/lib/audit'
import { answerQuestion, parsePrompt, type LabDeps } from '../../src/lib/labPartner'
import { MAX_QUESTION_CHARS } from '../../src/lib/labProtocol'
import { sanitizeContext } from '../../src/lib/labTools'
import { createRateLimiter } from '../../src/lib/rateLimit'
import { buildIndex, type ChunksFile } from '../../src/lib/retrieve'
import chunksFile from '../_data/chunks.json'

const MAX_BODY_BYTES = 20_000

let deps: LabDeps | undefined
/** Built once per server instance, on its first question. */
export function labDeps(): LabDeps {
  deps ??= {
    complete,
    index: buildIndex((chunksFile as ChunksFile).chunks),
    rows: compileBass2(csvText, flowByTest as FlowByTest),
    prompts: { tools: parsePrompt(toolsPrompt), answer: parsePrompt(answerPrompt) },
  }
  return deps
}

const limiter = createRateLimiter()

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

/** The handler itself, on web Requests and Responses. `ip` is the asker's address, for the rate limit. */
export async function handle(request: Request, ip: string, depsFor: () => LabDeps = labDeps): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Ask with POST.' }, { allow: 'POST' })
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return json(413, { error: 'That request is too large.' })
  let body: { question?: unknown; context?: unknown }
  try {
    body = JSON.parse(text)
  } catch {
    return json(400, { error: 'The request isn’t JSON.' })
  }
  const question = typeof body.question === 'string' ? body.question.trim() : ''
  if (!question) return json(400, { error: 'Ask a question.' })
  if (question.length > MAX_QUESTION_CHARS) {
    return json(400, { error: `Keep questions under ${MAX_QUESTION_CHARS} characters.` })
  }
  const verdict = limiter.check(ip, Date.now())
  if (!verdict.ok) {
    return json(
      429,
      { error: `That’s ten questions in a minute. Ask again in ${verdict.retryAfterSec} s.` },
      { 'retry-after': String(verdict.retryAfterSec) },
    )
  }

  const context = sanitizeContext(body.context)
  const encoder = new TextEncoder()
  const events = answerQuestion(question, context, depsFor())
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await events.next()
      if (next.done) controller.close()
      else controller.enqueue(encoder.encode(`${JSON.stringify(next.value)}\n`))
    },
    async cancel() {
      await events.return(undefined)
    },
  })
  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    },
  })
}

/** The asker's address: the first hop the platform reports, else the socket's. */
function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for']
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
  return first || (req.headers['x-real-ip'] as string | undefined) || req.socket.remoteAddress || 'unknown'
}

/** The body as text. Vercel may have parsed it already (req.body); otherwise read the stream. */
async function bodyText(req: IncomingMessage & { body?: unknown }): Promise<string> {
  if (typeof req.body === 'string') return req.body
  if (req.body instanceof Uint8Array) return new TextDecoder().decode(req.body)
  if (req.body !== undefined && req.body !== null) return JSON.stringify(req.body)
  const parts: Uint8Array[] = []
  let size = 0
  for await (const part of req) {
    size += (part as Uint8Array).length
    if (size > MAX_BODY_BYTES + 1) break
    parts.push(part as Uint8Array)
  }
  return Buffer.concat(parts).toString('utf8')
}

/** Node's (req, res) signature, which Vercel's Node runtime and Vite's dev server both call. */
export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse): Promise<void> {
  const method = req.method ?? 'GET'
  const request = new Request('http://lab-partner.local/api/lab-partner', {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'POST' ? await bodyText(req) : undefined,
  })
  const response = await handle(request, clientIp(req))
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  if (!response.body) {
    res.end()
    return
  }
  const reader = response.body.getReader()
  res.on('close', () => void reader.cancel().catch(() => {}))
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    res.write(value)
  }
  res.end()
}

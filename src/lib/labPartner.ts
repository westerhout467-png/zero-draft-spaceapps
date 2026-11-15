// Lab Partner's answer to one question (SPEC §7.1), as a stream of events:
//   1. retrieve the top chunks;
//   2. first LLM call: which tools to run (function calling);
//   3. run them on the server with the views' own functions;
//   4. second LLM call: the answer, as JSON sentences that cite chunks or tool values;
//   5. check every sentence (answerCheck.ts) and send only those that pass, or the refusal.
// The LLM is passed in, so tests run the whole flow with a mock and no network.
import type { Bass2Row } from './audit'
import { checkAnswer, type RawAnswer } from './answerCheck'
import { getSource } from './claims'
import { VIEW_LABELS, TOOL_DECLARATIONS } from './labTools'
import { runTools, type RawCall } from './labToolRun'
import type { LabContext, LabEvent, ToolResult } from './labProtocol'
import { chunkPlace, type Chunk, type ChunkIndex } from './retrieve'
import { PRESETS } from './interpret'

/** The slice of pipeline/scripts/llm.ts that Lab Partner uses, so a test can stand in for it. */
export interface LlmRequest {
  system: string
  user: string
  tools?: { name: string; description: string; parametersJsonSchema: Record<string, unknown> }[]
  json?: boolean
  jsonSchema?: Record<string, unknown>
  maxOutputTokens?: number
  thinkingLevel?: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH'
  temperature?: number
  timeoutMs?: number
}
export interface LlmReply {
  text: string
  functionCalls: RawCall[]
  model: string
  finishReason?: string
  usage?: { input?: number; output: number; thinking: number }
}
export type Complete = (request: LlmRequest) => Promise<LlmReply>

/** A prompt file: its first line is "promptVersion: name@n" (pipeline/prompts/). */
export interface Prompt {
  version: string
  body: string
}

export function parsePrompt(text: string): Prompt {
  const match = /^promptVersion:\s*(\S+)\s*\n/.exec(text)
  if (!match) throw new Error('A prompt must start with a "promptVersion:" line')
  return { version: match[1], body: text.slice(match[0].length).trim() }
}

export interface LabDeps {
  complete: Complete
  index: ChunkIndex
  rows: readonly Bass2Row[]
  prompts: { tools: Prompt; answer: Prompt }
  /** Sees each raw LLM reply: for lab-ask's diagnostics, never shown to users. */
  onReply?: (step: 'tools' | 'answer', reply: LlmReply) => void
}

/** Lab Partner's answers stay short (SPEC F5). */
export const ANSWER_MAX_TOKENS = 400

export const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    refusal: { type: 'boolean' },
    sentences: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          support: {
            type: 'array',
            items: {
              type: 'object',
              properties: { chunkId: { type: 'string' }, quote: { type: 'string' }, tool: { type: 'string' } },
            },
          },
        },
        required: ['text', 'support'],
      },
    },
  },
  required: ['sentences'],
}

export function promptVersion(deps: Pick<LabDeps, 'prompts'>): string {
  return `${deps.prompts.tools.version}+${deps.prompts.answer.version}`
}

const shortName = (sourceId: string) => getSource(sourceId)?.short ?? sourceId

function excerpts(chunks: readonly Chunk[]): string {
  if (chunks.length === 0) return '(none)'
  return chunks.map((chunk) => `[${chunk.id}] ${chunkPlace(chunk, shortName(chunk.sourceId))}\n${chunk.text}`).join('\n\n')
}

/** What is on screen, in a few lines, so the tool step starts from it. */
function screen(context: LabContext): string {
  const { burn, interpret } = context
  return [
    `View: ${VIEW_LABELS[context.view]}.`,
    `Burn Twin: O2 ${burn.o2Pct}%, airflow ${burn.flowCmS} cm/s, ${burn.rodMm} mm rod.`,
    `Cabin simulator: ${PRESETS[interpret.presetId].label}.`,
  ].join('\n')
}

/** Tool results as the answer step sees them: one line per value, each with the id to cite. */
export function describeTools(results: readonly ToolResult[]): string {
  const done = results.filter((result) => !result.error)
  if (done.length === 0) return '(none)'
  return done
    .map((result) => {
      const where = result.view ? ` on ${VIEW_LABELS[result.view]}` : ''
      const lines = result.fields.map((field) => `${result.id}.${field.key} = ${String(field.value)}   (${field.label})`)
      return [`${result.id}: ${result.name}${where}, ${result.summary}`, ...lines].join('\n')
    })
    .join('\n\n')
}

/** The answer JSON, or as many whole sentences as survive if it was cut off. */
export function parseAnswer(text: string): RawAnswer {
  // From the first brace: a model sometimes writes "Here is the JSON" or a code fence first.
  const start = text.indexOf('{')
  const clean = start === -1 ? '' : text.slice(start).trim().replace(/\s*```\s*$/, '')
  try {
    const parsed = JSON.parse(clean)
    return typeof parsed === 'object' && parsed !== null ? (parsed as RawAnswer) : {}
  } catch {
    // Cut off mid-answer: keep the sentences before the last complete one's closing brace.
    for (let end = clean.lastIndexOf('}'); end > 0; end = clean.lastIndexOf('}', end - 1)) {
      try {
        const parsed = JSON.parse(`${clean.slice(0, end + 1)}]}`)
        if (Array.isArray(parsed?.sentences)) return parsed as RawAnswer
      } catch {
        // Not a sentence boundary; try the previous brace.
      }
    }
    return {}
  }
}

export async function* answerQuestion(
  question: string,
  context: LabContext,
  deps: LabDeps,
): AsyncGenerator<LabEvent> {
  const version = promptVersion(deps)
  try {
    yield { type: 'status', stage: 'searching' }
    const chunks = deps.index.search(question)

    yield { type: 'status', stage: 'choosing-tools' }
    const choice = await deps.complete({
      system: `${deps.prompts.tools.body}\n\n# The screen now\n\n${screen(context)}`,
      // No excerpts here: choosing tools needs only the question, and it saves ~1,500 tokens a
      // question against a free tier's tokens-per-minute limit. The answer step gets them all.
      user: `Question: ${question}`,
      tools: TOOL_DECLARATIONS,
      thinkingLevel: 'MINIMAL',
      timeoutMs: 30_000,
    })
    deps.onReply?.('tools', choice)
    const results = runTools(choice.functionCalls, context, deps.rows)
    if (results.length > 0) {
      yield { type: 'status', stage: 'running-tools' }
      for (const result of results) yield { type: 'tool', result }
    }

    yield { type: 'status', stage: 'writing' }
    const reply = await deps.complete({
      system: deps.prompts.answer.body,
      user: `Question: ${question}\n\nExcerpts:\n\n${excerpts(chunks)}\n\nTool results:\n\n${describeTools(results)}`,
      json: true,
      jsonSchema: ANSWER_SCHEMA,
      maxOutputTokens: ANSWER_MAX_TOKENS,
      // Gemini counts thinking against the cap: at 'LOW' it can spend all 400 tokens thinking.
      thinkingLevel: 'MINIMAL',
      timeoutMs: 30_000,
    })

    deps.onReply?.('answer', reply)
    yield { type: 'status', stage: 'checking' }
    const checked = checkAnswer({ answer: parseAnswer(reply.text), chunks, tools: results, shortName })
    for (const sentence of checked.sentences) yield { type: 'sentence', sentence }
    if (checked.dropped.length > 0) {
      yield { type: 'dropped', count: checked.dropped.length, reasons: checked.dropped.map((d) => d.reason) }
    }
    yield { type: 'done', refused: checked.refused, model: reply.model, promptVersion: version }
  } catch (error) {
    yield { type: 'error', message: llmErrorMessage(error) }
  }
}

/** What went wrong with the LLM, in words a person can act on. Never the raw error. */
export function llmErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  if (/\b413\b|per minute|\bTPM\b|\bRPM\b/i.test(text)) {
    return 'Lab Partner’s language model is at its limit for this minute. Ask again in a minute; the suggested questions still work.'
  }
  if (/\b429\b|RESOURCE_EXHAUSTED|quota/i.test(text)) {
    return 'The language model’s usage limit for this key is used up for now. The suggested questions still work: their answers are cached.'
  }
  if (/\b503\b|UNAVAILABLE|high demand|overloaded/i.test(text)) {
    return 'The language model is overloaded right now. Try again in a moment; the suggested questions still work.'
  }
  if (/timed? ?out|abort/i.test(text)) return 'The language model took too long to answer. Try again in a moment.'
  if (/(GEMINI|GROQ)_(API_KEY|MODEL)|API key/i.test(text)) return 'Lab Partner has no language model key or model set on this server.'
  return 'Lab Partner couldn’t get an answer from its language model. Try again in a moment.'
}

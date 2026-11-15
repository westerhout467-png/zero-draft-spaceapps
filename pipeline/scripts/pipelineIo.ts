// What the M7 pipeline scripts share (outcomes.ts, extract.ts, verify.ts, briefing.ts): where
// files live, reading a prompt with its version line, one LLM call that waits out rate limits,
// and keeping every raw reply in pipeline/out/raw/ (CLAUDE.md: "they're our evidence").
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePrompt, type Prompt } from '../../src/lib/labPartner'
import type { PagesFile } from '../../src/lib/pages'
import { complete, loadLocalEnv, type CompleteRequest, type CompleteResult } from './llm'

export const ROOT = fileURLToPath(new URL('../../', import.meta.url))
export const RAW_DIR = join(ROOT, 'pipeline', 'out', 'raw')

export const read = (...path: string[]) => readFileSync(join(ROOT, ...path), 'utf8')
export const readJson = <T>(...path: string[]) => JSON.parse(read(...path)) as T

export function writeJson(value: unknown, ...path: string[]): void {
  const file = join(ROOT, ...path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(value, null, 1) + '\n')
}

export const loadPrompt = (name: string): Prompt => parsePrompt(read('pipeline', 'prompts', name))

/** An investigation's text, from `npm run pipeline:text`. */
export function loadPages(id: string): PagesFile {
  const path = ['pipeline', 'text', `${id}.pages.json`]
  if (!existsSync(join(ROOT, ...path))) throw new Error(`${path.join('/')} is missing. Run: npm run pipeline:text`)
  return readJson<PagesFile>(...path)
}

/** A raw LLM reply as kept on disk: the reply's text exactly as it came, and how it was asked. */
export interface RawReply {
  generatedBy: string
  generatedAt: string
  model: string
  promptVersion: string
  /** What the reply is about: "PSI-25 p.111", "PSI-98", "briefing". */
  subject: string
  finishReason: string | null
  usage: CompleteResult['usage'] | null
  /** The user message it answered, so the reply can be re-checked without asking again. */
  input: string
  /** Untouched. */
  text: string
}

const rawPath = (name: string) => join(RAW_DIR, `${name}.json`)

/** A kept reply for this prompt version and input, or null: the same question isn't asked twice. */
export function keptReply(name: string, promptVersion: string, input: string): RawReply | null {
  if (!existsSync(rawPath(name))) return null
  const kept = JSON.parse(readFileSync(rawPath(name), 'utf8')) as RawReply
  return kept.promptVersion === promptVersion && kept.input === input ? kept : null
}

export interface AskOptions {
  /** The raw file's name, without ".json". */
  name: string
  generatedBy: string
  subject: string
  prompt: Prompt
  user: string
  /** The reply's JSON Schema; without one the reply only has to be JSON (it is checked afterwards). */
  jsonSchema?: Record<string, unknown>
  /**
   * The cap on the reply. Gemini counts its thinking against it, so give it room for the JSON
   * and the thinking both; for Groq's reasoning models llm.ts adds its own allowance on top.
   */
  maxOutputTokens: number
  /** Ask again even if a reply is kept (`--fresh`). */
  fresh?: boolean
}

/**
 * The least time between two calls: a free tier allows only a few requests a minute. Set
 * PIPELINE_SPACING_MS to change it.
 */
const SPACING_MS = Number(process.env.PIPELINE_SPACING_MS ?? 20_000)
let lastCallAt = 0
/** How many times this run really asked the LLM (kept replies don't count). */
export let callsMade = 0

/**
 * Asks the LLM for JSON at temperature 0 and keeps the raw reply. Calls are spaced out, and a
 * per-minute rate limit is waited out (up to a minute, twice): the pipeline is in no hurry,
 * unlike Lab Partner's endpoint. A spent daily allowance stops the script at once.
 */
export async function ask(options: AskOptions): Promise<RawReply> {
  if (!options.fresh) {
    const kept = keptReply(options.name, options.prompt.version, options.user)
    if (kept) return kept
  }
  loadLocalEnv(join(ROOT, '.env.local'))
  const wait = lastCallAt + SPACING_MS - Date.now()
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  lastCallAt = Date.now()
  callsMade++
  const request: CompleteRequest = {
    system: options.prompt.body,
    user: options.user,
    json: true,
    ...(options.jsonSchema ? { jsonSchema: options.jsonSchema } : {}),
    maxOutputTokens: options.maxOutputTokens,
    thinkingLevel: 'LOW',
    temperature: 0,
    timeoutMs: 240_000,
    rateLimitRetries: 2,
  }
  const result = await complete(request)
  const raw: RawReply = {
    generatedBy: options.generatedBy,
    generatedAt: new Date().toISOString(),
    model: result.model,
    promptVersion: options.prompt.version,
    subject: options.subject,
    finishReason: result.finishReason ?? null,
    usage: result.usage ?? null,
    input: options.user,
    text: result.text,
  }
  mkdirSync(RAW_DIR, { recursive: true })
  writeFileSync(rawPath(options.name), JSON.stringify(raw, null, 1) + '\n')
  return raw
}

/** The reply's JSON, or null if it isn't JSON (a cut-off reply, usually). */
export function parseReply<T>(raw: RawReply): T | null {
  try {
    return JSON.parse(raw.text) as T
  } catch {
    return null
  }
}

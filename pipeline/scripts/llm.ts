// The one module that talks to an LLM (SPEC §7.3). The pipeline scripts and api/ call complete()
// from here; nothing else knows which provider answers.
//
// - Groq, when GROQ_API_KEY is set: GROQ_API_KEY and GROQ_MODEL (e.g. openai/gpt-oss-120b), through
//   Groq's OpenAI-style HTTP API with plain fetch.
// - Otherwise Gemini: GEMINI_API_KEY and GEMINI_MODEL, through @google/genai (only imported here).
// Keys and models come from .env.local on this machine (scripts call loadLocalEnv()) and Vercel's
// environment variables when deployed. No model name is hardcoded.
import { existsSync } from 'node:fs'
import { GoogleGenAI, type FunctionDeclaration, type ThinkingLevel } from '@google/genai'

export type CompleteRequest = {
  system: string
  user: string
  /** Function declarations for Gemini's function calling (Lab Partner's tools). */
  tools?: FunctionDeclaration[]
  /** Ask for JSON output (the pipeline). */
  json?: boolean
  /** With json: the JSON Schema the reply must follow. */
  jsonSchema?: Record<string, unknown>
  /** Cap on the reply's length, in tokens (Lab Partner's answers: 400, SPEC F5). */
  maxOutputTokens?: number
  /** How much the model thinks before answering; lower is faster. Left to the model when unset. */
  thinkingLevel?: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH'
  /** Defaults to 0, as the pipeline needs. */
  temperature?: number
  /** Give up after this long, in ms. Defaults to 60 s. */
  timeoutMs?: number
  /**
   * Pipeline scripts only. On a rate limit (429), wait as long as the provider asks (60 s at
   * most) and ask again, up to this many times; each try gets the full time limit. Unset, as the
   * Lab Partner endpoint leaves it, a 429 gets only the two short retries: a visitor never waits
   * a minute for an answer.
   */
  rateLimitRetries?: number
}

export type CompleteResult = {
  text: string
  functionCalls: Array<{ name: string; args: Record<string, unknown> }>
  /** The model that answered, to record next to every output. */
  model: string
  /** Why it stopped: "STOP", or "MAX_TOKENS" when the reply was cut off. */
  finishReason?: string
  /** Tokens it read, tokens it wrote, and how many of those were thinking. */
  usage?: { input: number; output: number; thinking: number }
}

/** Loads .env.local into process.env when it exists (scripts only; Vercel sets env vars itself). */
export function loadLocalEnv(path = '.env.local'): void {
  if (existsSync(path)) process.loadEnvFile(path)
}

type EnvName = 'GEMINI_API_KEY' | 'GEMINI_MODEL' | 'GROQ_API_KEY' | 'GROQ_MODEL'

function requireEnv(name: EnvName): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is not set. Put it in .env.local, or in Vercel's environment variables.`)
  }
  return value
}

let client: GoogleGenAI | undefined

/**
 * Answers worth trying again shortly: "busy" (429, 503) from Gemini or Groq, and Groq's refusals
 * of a malformed reply (bad JSON or a bad tool call), which a second try usually fixes.
 */
function isBusy(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error)
  return /\b(429|503)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|json_validate_failed|tool_use_failed/i.test(text)
}

const RETRY_DELAYS_MS = [800, 2000]

const isRateLimit = (error: unknown) =>
  /\b429\b|RESOURCE_EXHAUSTED|rate limit/i.test(error instanceof Error ? error.message : String(error))

/**
 * A whole day's allowance is spent (Gemini's free tier counts requests per day): waiting a minute
 * won't help, so a pipeline script stops instead of spending its retries.
 */
export const isDailyLimit = (message: string) => /PerDay|requests per day|quota.*\bday\b/i.test(message) && !/tokens per day \(TPD\)/.test(message)

/** The longest a pipeline script waits out one rate limit. */
export const RATE_LIMIT_MAX_WAIT_MS = 60_000

/**
 * How long a rate-limit reply asks us to wait, from its own words ("Please try again in 7.66s",
 * "in 1m26.4s", "in 350ms", "retry in 34s"), plus a second's margin; 30 s when it doesn't say.
 * Never under 1 s or over 60 s.
 */
export function rateLimitWaitMs(message: string): number {
  const match = /(?:try again|retry) in\s+(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:(\d+(?:\.\d+)?)ms)?/i.exec(message)
  const [h, m, sec, ms] = (match?.slice(1) ?? []).map((part) => (part === undefined ? 0 : Number(part)))
  const asked = match && h + m + sec + ms > 0 ? h * 3_600_000 + m * 60_000 + sec * 1_000 + ms : 29_000
  return Math.min(RATE_LIMIT_MAX_WAIT_MS, Math.max(1_000, Math.ceil(asked) + 1_000))
}

/** Which provider answers: Groq whenever its key is set. */
export function provider(): 'groq' | 'gemini' {
  return process.env.GROQ_API_KEY?.trim() ? 'groq' : 'gemini'
}

/**
 * One call to the LLM. A busy reply (503, 429) is retried twice, after 0.8 s and 2 s, as long as
 * the call's time limit allows; any other error is thrown at once. A pipeline script can also
 * ask to wait out rate limits (rateLimitRetries).
 */
export async function complete(request: CompleteRequest): Promise<CompleteResult> {
  for (let waited = 0; ; waited++) {
    try {
      return await completeWithin(request)
    } catch (error) {
      if (waited >= (request.rateLimitRetries ?? 0) || !isRateLimit(error)) throw error
      const message = error instanceof Error ? error.message : String(error)
      if (isDailyLimit(message)) throw error
      const wait = rateLimitWaitMs(message)
      console.error(`  rate limited: waiting ${Math.round(wait / 1000)} s (try ${waited + 1} of ${request.rateLimitRetries})`)
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
}

/** One call with its short retries, inside one time limit. */
async function completeWithin(request: CompleteRequest): Promise<CompleteResult> {
  const deadline = Date.now() + (request.timeoutMs ?? 60_000)
  for (let attempt = 0; ; attempt++) {
    try {
      return await completeOnce({ ...request, timeoutMs: Math.max(1_000, deadline - Date.now()) })
    } catch (error) {
      const wait = RETRY_DELAYS_MS[attempt]
      if (wait === undefined || !isBusy(error) || Date.now() + wait > deadline - 1_000) throw error
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
}

function completeOnce(request: CompleteRequest): Promise<CompleteResult> {
  return provider() === 'groq' ? completeGroq(request) : completeGemini(request)
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

/** Tokens a Groq reasoning model may think for, on top of the answer's own cap. */
const REASONING_ROOM = 1_024
const isGroqReasoning = (model: string) => /gpt-oss|qwen3/.test(model)

/** How hard a Groq reasoning model thinks: gpt-oss takes low…high, Qwen 3 can switch it off. */
function groqReasoning(model: string, level: CompleteRequest['thinkingLevel']): Record<string, unknown> {
  if (!level) return {}
  if (/gpt-oss/.test(model)) {
    return { reasoning_effort: level === 'HIGH' ? 'high' : level === 'MEDIUM' ? 'medium' : 'low', include_reasoning: false }
  }
  if (/qwen3/.test(model)) return { reasoning_effort: level === 'MINIMAL' || level === 'LOW' ? 'none' : 'default' }
  return {}
}

interface GroqReply {
  model?: string
  choices?: Array<{
    finish_reason?: string
    message?: { content?: string | null; tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> }
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } }
}

function parseArgs(text: string | undefined): Record<string, unknown> {
  try {
    const value = JSON.parse(text ?? '{}')
    return typeof value === 'object' && value !== null ? value : {}
  } catch {
    return {}
  }
}

async function completeGroq(request: CompleteRequest): Promise<CompleteResult> {
  const key = requireEnv('GROQ_API_KEY')
  const model = requireEnv('GROQ_MODEL')
  const body = {
    model,
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content: request.user },
    ],
    temperature: request.temperature ?? 0,
    // A reasoning model's thinking counts against the cap, so it gets room on top of the answer's.
    ...(request.maxOutputTokens
      ? { max_completion_tokens: request.maxOutputTokens + (isGroqReasoning(model) ? REASONING_ROOM : 0) }
      : {}),
    ...groqReasoning(model, request.thinkingLevel),
    ...(request.tools?.length
      ? {
          tools: request.tools.map((tool) => ({
            type: 'function',
            function: { name: tool.name, description: tool.description, parameters: tool.parametersJsonSchema ?? tool.parameters },
          })),
          tool_choice: 'auto',
        }
      : {}),
    ...(request.json
      ? {
          response_format: request.jsonSchema
            ? { type: 'json_schema', json_schema: { name: 'answer', schema: request.jsonSchema } }
            : { type: 'json_object' },
        }
      : {}),
  }
  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(request.timeoutMs ?? 60_000),
  })
  // The status leads the message, so a 429 or 503 is retried and explained like Gemini's.
  if (!response.ok) throw new Error(`${response.status} from Groq: ${(await response.text()).slice(0, 300)}`)
  const data = (await response.json()) as GroqReply
  const choice = data.choices?.[0]
  const message = choice?.message ?? {}
  return {
    text: typeof message.content === 'string' ? message.content : '',
    functionCalls: (message.tool_calls ?? []).map((call) => ({
      name: call.function?.name ?? '',
      args: parseArgs(call.function?.arguments),
    })),
    model: data.model ?? model,
    finishReason: choice?.finish_reason === 'length' ? 'MAX_TOKENS' : (choice?.finish_reason ?? '').toUpperCase(),
    usage: {
      input: data.usage?.prompt_tokens ?? 0,
      output: data.usage?.completion_tokens ?? 0,
      thinking: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    },
  }
}

async function completeGemini(request: CompleteRequest): Promise<CompleteResult> {
  client ??= new GoogleGenAI({ apiKey: requireEnv('GEMINI_API_KEY') })
  const model = requireEnv('GEMINI_MODEL')
  const response = await client.models.generateContent({
    model,
    contents: request.user,
    config: {
      systemInstruction: request.system,
      temperature: request.temperature ?? 0,
      abortSignal: AbortSignal.timeout(request.timeoutMs ?? 60_000),
      ...(request.json ? { responseMimeType: 'application/json' } : {}),
      ...(request.json && request.jsonSchema ? { responseJsonSchema: request.jsonSchema } : {}),
      ...(request.maxOutputTokens ? { maxOutputTokens: request.maxOutputTokens } : {}),
      ...(request.thinkingLevel ? { thinkingConfig: { thinkingLevel: request.thinkingLevel as ThinkingLevel } } : {}),
      ...(request.tools?.length ? { tools: [{ functionDeclarations: request.tools }] } : {}),
    },
  })
  // Only the text parts: reading response.text on a function-call reply makes the SDK warn.
  const parts = response.candidates?.[0]?.content?.parts ?? []
  return {
    text: parts.flatMap((part) => (typeof part.text === 'string' && !part.thought ? [part.text] : [])).join(''),
    functionCalls: (response.functionCalls ?? []).map((call) => ({
      name: call.name ?? '',
      args: call.args ?? {},
    })),
    model,
    finishReason: response.candidates?.[0]?.finishReason,
    usage: {
      input: response.usageMetadata?.promptTokenCount ?? 0,
      output: response.usageMetadata?.candidatesTokenCount ?? 0,
      thinking: response.usageMetadata?.thoughtsTokenCount ?? 0,
    },
  }
}

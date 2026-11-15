// The one module that talks to an LLM (SPEC §7.3). The pipeline scripts and api/ call complete()
// from here; nothing else knows which provider answers.
//
// Three providers, tried in this order. A provider counts as configured when its key is set:
// 1. OrcaRouter: ORCA_API_KEY and ORCA_MODEL (a specific model, never an auto-router), through its
//    OpenAI-style HTTP API with plain fetch.
// 2. Groq: GROQ_API_KEY and GROQ_MODEL (e.g. openai/gpt-oss-120b), the same way.
// 3. Gemini: GEMINI_API_KEY and GEMINI_MODEL, through @google/genai (only imported here).
// If a provider fails (no credits, rate limit, outage, bad model, empty answer), the next configured
// one is asked; the result's `model` names whichever answered. Only when every one fails does
// complete() throw, with the last provider's error.
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

type EnvName = 'GEMINI_API_KEY' | 'GEMINI_MODEL' | 'GROQ_API_KEY' | 'GROQ_MODEL' | 'ORCA_API_KEY' | 'ORCA_MODEL'

function requireEnv(name: EnvName): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is not set. Put it in .env.local, or in Vercel's environment variables.`)
  }
  return value
}

let client: GoogleGenAI | undefined

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** "Busy" answers (429, 503): worth another try shortly, but only from the last provider left. */
const isBusy = (error: unknown) => /\b(429|503)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand/i.test(errorText(error))

/** Groq's refusals of a malformed reply (bad JSON or a bad tool call), which a second try usually fixes. */
const isMalformed = (error: unknown) => /json_validate_failed|tool_use_failed/i.test(errorText(error))

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

export type ProviderName = 'orca' | 'groq' | 'gemini'

const KEY_VAR: Record<ProviderName, EnvName> = { orca: 'ORCA_API_KEY', groq: 'GROQ_API_KEY', gemini: 'GEMINI_API_KEY' }
const LABEL: Record<ProviderName, string> = { orca: 'OrcaRouter', groq: 'Groq', gemini: 'Gemini' }

/** The providers to try, in order: every one whose key is set. */
export function providers(): ProviderName[] {
  return (['orca', 'groq', 'gemini'] as const).filter((name) => process.env[KEY_VAR[name]]?.trim())
}

/**
 * One call to the LLM, trying each configured provider in turn until one answers. A provider that
 * isn't the last one left gets half of the time that remains, so a slow one can't use up the
 * whole limit; it is not retried when busy, since the next provider is ready. The last provider
 * retries a busy reply (503, 429) twice, after 0.8 s and 2 s, as long as the time limit allows. A
 * pipeline script can also ask to wait out rate limits (rateLimitRetries).
 */
export async function complete(request: CompleteRequest): Promise<CompleteResult> {
  for (let waited = 0; ; waited++) {
    try {
      return await completeInOrder(request)
    } catch (error) {
      if (waited >= (request.rateLimitRetries ?? 0) || !isRateLimit(error)) throw error
      const message = errorText(error)
      if (isDailyLimit(message)) throw error
      const wait = rateLimitWaitMs(message)
      console.error(`  rate limited: waiting ${Math.round(wait / 1000)} s (try ${waited + 1} of ${request.rateLimitRetries})`)
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
}

async function completeInOrder(request: CompleteRequest): Promise<CompleteResult> {
  const order = providers()
  if (order.length === 0) {
    throw new Error('No LLM is configured. Set ORCA_API_KEY and ORCA_MODEL, GROQ_API_KEY and GROQ_MODEL, or GEMINI_API_KEY and GEMINI_MODEL in .env.local, or in Vercel’s environment variables.')
  }
  const deadline = Date.now() + (request.timeoutMs ?? 60_000)
  let failure: unknown
  for (const [index, name] of order.entries()) {
    const next = order[index + 1]
    const left = Math.max(1_000, deadline - Date.now())
    try {
      return await completeWithin(request, name, next ? Math.floor(left / 2) : left, !next)
    } catch (error) {
      failure = error
      if (!next) break
      console.error(`  ${LABEL[name]} failed, trying ${LABEL[next]}: ${errorText(error).replace(/\s+/g, ' ').slice(0, 160)}`)
    }
  }
  throw failure
}

/** One provider's call with its short retries, inside its time limit. */
async function completeWithin(request: CompleteRequest, name: ProviderName, limitMs: number, patient: boolean): Promise<CompleteResult> {
  const deadline = Date.now() + limitMs
  for (let attempt = 0; ; attempt++) {
    try {
      return await completeOnce({ ...request, timeoutMs: Math.max(1_000, deadline - Date.now()) }, name)
    } catch (error) {
      const wait = RETRY_DELAYS_MS[attempt]
      const worthRetrying = isMalformed(error) || (patient && isBusy(error))
      if (wait === undefined || !worthRetrying || Date.now() + wait > deadline - 1_000) throw error
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
}

function completeOnce(request: CompleteRequest, name: ProviderName): Promise<CompleteResult> {
  if (name === 'gemini') return completeGemini(request)
  if (name === 'groq') {
    const model = requireEnv('GROQ_MODEL')
    return completeChat(
      {
        label: 'Groq',
        url: GROQ_URL,
        key: requireEnv('GROQ_API_KEY'),
        model,
        reasoning: groqReasoning(model, request.thinkingLevel),
        reasoningRoom: isGroqReasoning(model),
      },
      request,
    )
  }
  return completeChat(
    {
      label: 'OrcaRouter',
      url: ORCA_URL,
      key: requireEnv('ORCA_API_KEY'),
      model: requireEnv('ORCA_MODEL'),
      reasoning: orcaReasoning(request.thinkingLevel),
      // With thinking on, its tokens count against the cap: without room, a model that thinks
      // past the cap answers with nothing (the bug Lab Partner hit before thinking was turned off).
      reasoningRoom: request.thinkingLevel !== 'MINIMAL',
    },
    request,
  )
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const ORCA_URL = 'https://api.orcarouter.ai/v1/chat/completions'

/** Tokens a reasoning model may think for, on top of the answer's own cap. */
const REASONING_ROOM = 1_024
const isGroqReasoning = (model: string) => /gpt-oss|qwen3/.test(model)

/**
 * OrcaRouter: switch thinking off when the caller wants it minimal (Lab Partner does), else leave
 * it to the model. Checked live against deepseek-v4.1-flash-free: `reasoning_effort: "none"` gives
 * 0 thinking tokens, while `reasoning: { enabled: false }` only shaves them.
 */
function orcaReasoning(level: CompleteRequest['thinkingLevel']): Record<string, unknown> {
  return level === 'MINIMAL' ? { reasoning_effort: 'none' } : {}
}

/** How hard a Groq reasoning model thinks: gpt-oss takes low…high, Qwen 3 can switch it off. */
function groqReasoning(model: string, level: CompleteRequest['thinkingLevel']): Record<string, unknown> {
  if (!level) return {}
  if (/gpt-oss/.test(model)) {
    return { reasoning_effort: level === 'HIGH' ? 'high' : level === 'MEDIUM' ? 'medium' : 'low', include_reasoning: false }
  }
  if (/qwen3/.test(model)) return { reasoning_effort: level === 'MINIMAL' || level === 'LOW' ? 'none' : 'default' }
  return {}
}

interface ChatReply {
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

/** An OpenAI-style chat completions provider (Groq, OrcaRouter). */
interface ChatProvider {
  label: string
  url: string
  key: string
  model: string
  /** Extra body fields that set how hard the model thinks. */
  reasoning: Record<string, unknown>
  /** Whether the model's thinking counts against the cap, so the cap gets room for it. */
  reasoningRoom: boolean
}

async function completeChat(provider: ChatProvider, request: CompleteRequest): Promise<CompleteResult> {
  const { label, url, key, model } = provider
  const body = {
    model,
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content: request.user },
    ],
    temperature: request.temperature ?? 0,
    // A reasoning model's thinking counts against the cap, so it gets room on top of the answer's.
    ...(request.maxOutputTokens
      ? { max_completion_tokens: request.maxOutputTokens + (provider.reasoningRoom ? REASONING_ROOM : 0) }
      : {}),
    ...provider.reasoning,
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
  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(request.timeoutMs ?? 60_000),
  })
  // The status leads the message, so a 429 or 503 is retried and explained like Gemini's.
  if (!response.ok) throw new Error(`${response.status} from ${label}: ${(await response.text()).slice(0, 300)}`)
  const data = (await response.json()) as ChatReply
  const choice = data.choices?.[0]
  const message = choice?.message ?? {}
  const text = typeof message.content === 'string' ? message.content : ''
  const functionCalls = (message.tool_calls ?? []).map((call) => ({
    name: call.function?.name ?? '',
    args: parseArgs(call.function?.arguments),
  }))
  // A JSON answer with nothing in it (the model spent its whole cap thinking) is a failure the
  // next provider can fix. Without json, an empty reply is legitimate: "no tools needed".
  if (request.json && !text.trim() && functionCalls.length === 0) {
    throw new Error(`${label} returned an empty reply (finish reason: ${choice?.finish_reason ?? 'none'})`)
  }
  return {
    text,
    functionCalls,
    // The model that answered, as the provider names it; ours if it doesn't say.
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

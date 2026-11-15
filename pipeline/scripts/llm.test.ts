import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { complete, isDailyLimit, providers, RATE_LIMIT_MAX_WAIT_MS, rateLimitWaitMs } from './llm'

describe('rateLimitWaitMs (pipeline scripts only)', () => {
  it('waits what the provider asks, plus a second', () => {
    expect(rateLimitWaitMs('429 from Groq: Rate limit reached. Please try again in 7.66s.')).toBe(8_660)
    expect(rateLimitWaitMs('429 … Please try again in 350ms.')).toBe(1_350)
    expect(rateLimitWaitMs('RESOURCE_EXHAUSTED: Please retry in 34s')).toBe(35_000)
  })

  it('never waits more than a minute, even when asked to', () => {
    expect(rateLimitWaitMs('Please try again in 1m26.4s.')).toBe(RATE_LIMIT_MAX_WAIT_MS)
    expect(rateLimitWaitMs('Please try again in 2h3m.')).toBe(RATE_LIMIT_MAX_WAIT_MS)
  })

  it('waits 30 s when the reply does not say how long', () => {
    expect(rateLimitWaitMs('429 Too Many Requests')).toBe(30_000)
  })
})

describe('isDailyLimit (pipeline scripts only)', () => {
  it('knows a spent daily request allowance from a per-minute limit', () => {
    expect(isDailyLimit('429 RESOURCE_EXHAUSTED quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier, limit: 20')).toBe(true)
    expect(isDailyLimit('429 RESOURCE_EXHAUSTED quotaId: GenerateRequestsPerMinutePerProjectPerModel-FreeTier. Please retry in 34s')).toBe(false)
  })

  it('still waits on Groq’s tokens-per-day bucket, which refills by the minute', () => {
    expect(isDailyLimit('429 from Groq: Rate limit reached on tokens per day (TPD): Limit 200000. Please try again in 10m52s.')).toBe(false)
  })
})

// --- Provider order and fallback. The network is a stub: no real calls, no real keys. ---

const KEYS = ['ORCA_API_KEY', 'ORCA_MODEL', 'GROQ_API_KEY', 'GROQ_MODEL', 'GEMINI_API_KEY', 'GEMINI_MODEL'] as const

type Behavior = number | 'ok' | 'empty' | 'hang'
type Call = { host: 'orca' | 'groq' | 'gemini'; body: Record<string, unknown> }

let calls: Call[]
let behavior: Record<Call['host'], Behavior>

const chatReply = (model: string, content: string) =>
  new Response(JSON.stringify({ model, choices: [{ finish_reason: 'stop', message: { content } }] }), { status: 200 })

beforeEach(() => {
  calls = []
  behavior = { orca: 'ok', groq: 'ok', gemini: 'ok' }
  for (const key of KEYS) delete process.env[key]
  Object.assign(process.env, {
    ORCA_API_KEY: 'k-orca', ORCA_MODEL: 'deepseek/test-model',
    GROQ_API_KEY: 'k-groq', GROQ_MODEL: 'openai/gpt-oss-120b',
    GEMINI_API_KEY: 'k-gemini', GEMINI_MODEL: 'gemini-test',
  })
  vi.stubGlobal('fetch', async (input: unknown, init?: { body?: string; signal?: AbortSignal }) => {
    const url = typeof input === 'string' ? input : (input as Request).url
    const host = url.includes('orcarouter') ? 'orca' : url.includes('groq') ? 'groq' : 'gemini'
    calls.push({ host, body: init?.body ? JSON.parse(init.body) : {} })
    const how = behavior[host]
    if (how === 'hang') return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
    if (typeof how === 'number') return new Response(`${how} stub failure`, { status: how })
    if (host === 'gemini') {
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'from gemini' }] }, finishReason: 'STOP' }] }), { status: 200 })
    }
    return chatReply(host === 'orca' ? 'deepseek/test-model' : 'openai/gpt-oss-120b', how === 'empty' ? '' : `from ${host}`)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const ask = (extra: Partial<Parameters<typeof complete>[0]> = {}) => complete({ system: 's', user: 'u', timeoutMs: 6_000, ...extra })

describe('provider order', () => {
  it('lists OrcaRouter, Groq, Gemini, and only those with a key', () => {
    expect(providers()).toEqual(['orca', 'groq', 'gemini'])
    delete process.env.ORCA_API_KEY
    expect(providers()).toEqual(['groq', 'gemini'])
    process.env.ORCA_API_KEY = '   '
    expect(providers()).toEqual(['groq', 'gemini'])
  })

  it('asks OrcaRouter first and stops when it answers', async () => {
    const result = await ask()
    expect(result.text).toBe('from orca')
    expect(result.model).toBe('deepseek/test-model')
    expect(calls.map((c) => c.host)).toEqual(['orca'])
  })

  it('says so when no provider is configured', async () => {
    for (const key of KEYS) delete process.env[key]
    await expect(ask()).rejects.toThrow(/No LLM is configured/)
    expect(calls).toHaveLength(0)
  })
})

describe('fallback', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))

  it.each([
    ['rate limit (429)', 429],
    ['outage (503)', 503],
    ['no credits (402)', 402],
    ['bad key (401)', 401],
    ['unknown model (404)', 404],
    ['server error (500)', 500],
  ])('OrcaRouter %s: Groq answers, and OrcaRouter is not retried', async (_name, status) => {
    behavior.orca = status
    const result = await ask()
    expect(result.text).toBe('from groq')
    expect(result.model).toBe('openai/gpt-oss-120b')
    expect(calls.map((c) => c.host)).toEqual(['orca', 'groq'])
  })

  it('OrcaRouter and Groq both fail: Gemini answers, and the model is Gemini’s', async () => {
    behavior.orca = 503
    behavior.groq = 429
    const result = await ask()
    expect(result.text).toBe('from gemini')
    expect(result.model).toBe('gemini-test')
    expect(calls.map((c) => c.host)).toEqual(['orca', 'groq', 'gemini'])
  })

  it('an empty JSON answer from OrcaRouter (it thought past the cap) falls through to Groq', async () => {
    behavior.orca = 'empty'
    const result = await ask({ json: true })
    expect(result.text).toBe('from groq')
  })

  it('an empty reply without json is not a failure (Lab Partner: no tools needed)', async () => {
    behavior.orca = 'empty'
    const result = await ask()
    expect(result.text).toBe('')
    expect(calls.map((c) => c.host)).toEqual(['orca'])
  })

  it('a provider with a key but no model counts as failed, not as a crash', async () => {
    delete process.env.ORCA_MODEL
    const result = await ask()
    expect(result.text).toBe('from groq')
    expect(calls.map((c) => c.host)).toEqual(['groq'])
  })

  it('a provider that hangs gets only half the time, so the next one still answers', async () => {
    behavior.orca = 'hang'
    const started = Date.now()
    const result = await ask({ timeoutMs: 4_000 })
    expect(result.text).toBe('from groq')
    expect(Date.now() - started).toBeLessThan(3_500)
  })

  it('every provider failing throws the last one’s error', async () => {
    behavior = { orca: 401, groq: 401, gemini: 500 }
    const error = await ask().catch((e: Error) => e)
    expect(error).toBeInstanceOf(Error)
    expect(calls.map((c) => c.host)).toContain('gemini')
  })

  it('only the last provider waits out a busy reply', async () => {
    delete process.env.GEMINI_API_KEY
    behavior = { orca: 429, groq: 429, gemini: 'ok' }
    await expect(ask()).rejects.toThrow(/429 from Groq/)
    expect(calls.filter((c) => c.host === 'orca')).toHaveLength(1)
    expect(calls.filter((c) => c.host === 'groq')).toHaveLength(3)
  })
})

describe('what OrcaRouter is sent', () => {
  it('turns thinking off (reasoning_effort none) when Lab Partner asks for MINIMAL, and adds no room', async () => {
    await ask({ thinkingLevel: 'MINIMAL', maxOutputTokens: 400 })
    expect(calls[0].body).toMatchObject({ model: 'deepseek/test-model', reasoning_effort: 'none', max_completion_tokens: 400 })
  })

  it('leaves thinking on, and gives the cap room for it, otherwise', async () => {
    await ask({ thinkingLevel: 'LOW', maxOutputTokens: 400 })
    expect(calls[0].body).not.toHaveProperty('reasoning_effort')
    expect(calls[0].body.max_completion_tokens).toBe(400 + 1_024)
  })

  it('names the model it was told to use, never an auto-router', async () => {
    await ask()
    expect(calls[0].body.model).toBe('deepseek/test-model')
  })
})

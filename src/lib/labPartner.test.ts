// The whole Lab Partner flow with a stand-in for Gemini (SPEC F5 acceptance: "Mocked-LLM unit
// tests strip a fake quote and an untraceable number"; "An out-of-scope question gets the refusal").
import { describe, expect, it } from 'vitest'
import flowByTestJson from '../../docs/fixtures/flow-by-test.json'
import answerPrompt from '../../pipeline/prompts/lab-partner-answer.md?raw'
import toolsPrompt from '../../pipeline/prompts/lab-partner-tools.md?raw'
import csvText from '../../pipeline/sources/PSI-25/PSI-25_Experimental table_BASS-II.csv?raw'
import chunksFile from '../../api/_data/chunks.json'
import { compileBass2, type FlowByTest } from './audit'
import {
  ANSWER_MAX_TOKENS,
  answerQuestion,
  llmErrorMessage,
  parseAnswer,
  parsePrompt,
  type Complete,
  type LabDeps,
  type LlmRequest,
} from './labPartner'
import type { LabEvent } from './labProtocol'
import { DEFAULT_CONTEXT } from './labTools'
import { buildIndex, type Chunk } from './retrieve'

const chunks = (chunksFile as { chunks: Chunk[] }).chunks
const index = buildIndex(chunks)
const rows = compileBass2(csvText, flowByTestJson as FlowByTest)
const prompts = { tools: parsePrompt(toolsPrompt), answer: parsePrompt(answerPrompt) }

const SUPPRESS_QUESTION = 'How long should suppression continue after a fire goes out?'
const suppressChunk = index.search(SUPPRESS_QUESTION).find((c) => c.text.includes('should be maintained until'))!

/** A Gemini stand-in: the first call returns `calls`, the second returns `answer` as JSON. */
function mock(calls: { name: string; args: unknown }[], answer: unknown): { complete: Complete; requests: LlmRequest[] } {
  const requests: LlmRequest[] = []
  const complete: Complete = async (request) => {
    requests.push(request)
    return request.tools
      ? { text: '', functionCalls: calls, model: 'mock-model' }
      : { text: typeof answer === 'string' ? answer : JSON.stringify(answer), functionCalls: [], model: 'mock-model' }
  }
  return { complete, requests }
}

async function ask(question: string, complete: Complete, extra: Partial<LabDeps> = {}): Promise<LabEvent[]> {
  const events: LabEvent[] = []
  for await (const event of answerQuestion(question, DEFAULT_CONTEXT, { complete, index, rows, prompts, ...extra })) {
    events.push(event)
  }
  return events
}
const sentences = (events: LabEvent[]) => events.flatMap((e) => (e.type === 'sentence' ? [e.sentence.text] : []))
const done = (events: LabEvent[]) => events.find((e) => e.type === 'done')

describe('answerQuestion with a mocked LLM', () => {
  it('strips a fake quote and an untraceable number, and keeps the sentences that check out', async () => {
    const { complete } = mock([{ name: 'run_cabin_preset', args: { preset: 'small-cabin' } }], {
      sentences: [
        {
          text: 'The report suggests suppression efforts should be maintained until the burning material has cooled.',
          support: [{ chunkId: suppressChunk.id, quote: 'suppression efforts should be maintained until the burning material has cooled' }],
        },
        {
          text: 'The report says suppression must continue for 30 minutes.',
          support: [{ chunkId: suppressChunk.id, quote: 'suppression must continue for 30 minutes' }],
        },
        { text: 'In the model, CO peaks at 82.2 ppm.', support: [{ tool: 'tool#1.coPeakPpm' }] },
        { text: 'In the model, CO peaks at 120 ppm.', support: [{ tool: 'tool#1.coPeakPpm' }] },
      ],
    })
    const events = await ask(SUPPRESS_QUESTION, complete)
    expect(sentences(events)).toEqual([
      'The report suggests suppression efforts should be maintained until the burning material has cooled.',
      'In the model, CO peaks at 82.2 ppm.',
    ])
    expect(events.find((e) => e.type === 'dropped')).toEqual({
      type: 'dropped',
      count: 2,
      reasons: ['quote-not-found', 'untraceable-number'],
    })
    expect(done(events)).toEqual({
      type: 'done',
      refused: false,
      model: 'mock-model',
      promptVersion: 'lab-partner-tools@1+lab-partner-answer@4',
    })
  })

  it('refuses an out-of-scope question', async () => {
    const { complete } = mock([], { refusal: true, sentences: [] })
    const events = await ask('What is the best pizza topping?', complete)
    expect(sentences(events)).toEqual([])
    expect(events.some((e) => e.type === 'tool')).toBe(false)
    expect(done(events)).toMatchObject({ refused: true })
  })

  it('refuses when every sentence fails its check, even if the model didn’t', async () => {
    const { complete } = mock([], { sentences: [{ text: 'Pepperoni is the best, at 99%.', support: [] }] })
    const events = await ask('What is the best pizza topping?', complete)
    expect(done(events)).toMatchObject({ refused: true })
    expect(events.find((e) => e.type === 'dropped')).toMatchObject({ count: 1, reasons: ['no-support'] })
  })

  it('streams the stages and the tool results before the sentences', async () => {
    const { complete } = mock([{ name: 'set_burn_twin', args: { flowCmS: 2, action: 'drain' } }], {
      sentences: [{ text: 'In the model, the orbit flame burns to 13.61%.', support: [{ tool: 'tool#1.orbitLimitPct' }] }],
    })
    const events = await ask('Why are gentle cabin breezes dangerous?', complete)
    expect(events.map((e) => (e.type === 'status' ? e.stage : e.type))).toEqual([
      'searching',
      'choosing-tools',
      'running-tools',
      'tool',
      'writing',
      'checking',
      'sentence',
      'done',
    ])
  })

  it('asks for tools first, then for a short JSON answer that sees the chunks and every tool value', async () => {
    const { complete, requests } = mock([{ name: 'run_cabin_preset', args: { preset: 'm5' } }], { sentences: [] })
    await ask('What happened in Test M5?', complete)
    expect(requests).toHaveLength(2)
    expect(requests[0].tools?.length).toBe(7)
    expect(requests[0].system).toContain('# The screen now')
    expect(requests[1]).toMatchObject({ json: true, maxOutputTokens: ANSWER_MAX_TOKENS })
    expect(requests[1].tools).toBeUndefined()
    expect(requests[1].user).toContain('tool#1.coPeakPpm = 995.7')
    expect(requests[1].user).toMatch(/\[c\d{4}\] BASS-II report, p\. \d+/)
    // The tool step sees the question, not the excerpts: they only matter for the answer.
    expect(requests[0].user).toBe('Question: What happened in Test M5?')
  })

  it('never runs more than 3 tools, and never a tool that doesn’t exist', async () => {
    const calls = [
      { name: 'rm_rf', args: {} },
      ...Array.from({ length: 5 }, () => ({ name: 'navigate', args: { view: 'rank' } })),
    ]
    const events = await ask('Show me everything', mock(calls, { sentences: [] }).complete)
    expect(events.filter((e) => e.type === 'tool')).toHaveLength(3)
  })

  it('turns an LLM failure into a plain message, not a crash', async () => {
    const failing: Complete = async () => {
      throw new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}')
    }
    const events = await ask('What happened in Test M5?', failing)
    expect(events.at(-1)).toEqual({ type: 'error', message: llmErrorMessage(new Error('429')) })
    expect(llmErrorMessage(new Error('429'))).toContain('usage limit')
    expect(llmErrorMessage(new Error('503 UNAVAILABLE'))).toContain('overloaded')
    expect(llmErrorMessage(new Error('429 from Groq: Rate limit reached on tokens per minute (TPM)'))).toContain('this minute')
  })

  it('tells the diagnostics hook about each raw reply', async () => {
    const seen: string[] = []
    await ask('What happened in Test M5?', mock([], { sentences: [] }).complete, { onReply: (step) => seen.push(step) })
    expect(seen).toEqual(['tools', 'answer'])
  })
})

describe('parseAnswer', () => {
  it('reads JSON, also after a preamble or inside a code fence', () => {
    expect(parseAnswer('{"sentences":[]}')).toEqual({ sentences: [] })
    expect(parseAnswer('Here is the JSON:\n```json\n{"refusal":true}\n```')).toEqual({ refusal: true })
  })

  it('keeps the whole sentences of an answer that was cut off', () => {
    const cut = '{"sentences":[{"text":"One.","support":[{"tool":"tool#1"}]},{"text":"Two, cut of'
    expect(parseAnswer(cut)).toEqual({ sentences: [{ text: 'One.', support: [{ tool: 'tool#1' }] }] })
  })

  it('gives nothing for text that isn’t JSON', () => {
    expect(parseAnswer('I cannot help with that.')).toEqual({})
  })
})

describe('parsePrompt', () => {
  it('reads the version line of both prompts', () => {
    expect(prompts.tools.version).toBe('lab-partner-tools@1')
    expect(prompts.answer.version).toBe('lab-partner-answer@4')
    expect(prompts.answer.body.startsWith('# Your job')).toBe(true)
  })

  it('refuses a prompt without one', () => {
    expect(() => parsePrompt('# no version')).toThrow(/promptVersion/)
  })
})

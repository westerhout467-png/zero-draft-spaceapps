import { describe, expect, it } from 'vitest'
import chunksFile from '../../api/_data/chunks.json'
import { buildIndex, chunkPlace, CHUNK_CHARS, MAX_PER_SOURCE, splitText, TOP_K, type Chunk } from './retrieve'

const chunks = (chunksFile as { chunks: Chunk[] }).chunks
const index = buildIndex(chunks)
const top = (question: string) => index.search(question).map((chunk) => chunk.text).join(' || ')

describe('splitText', () => {
  it('keeps short text whole, and drops empty text', () => {
    expect(splitText('A short line.')).toEqual(['A short line.'])
    expect(splitText('   ')).toEqual([])
  })

  it('cuts long text into windows of at most 800 characters that overlap and never cut a word', () => {
    const words = Array.from({ length: 600 }, (_, i) => `word${i}`).join(' ')
    const pieces = splitText(words)
    expect(pieces.length).toBeGreaterThan(5)
    for (const piece of pieces) {
      expect(piece.length).toBeLessThanOrEqual(CHUNK_CHARS)
      expect(piece).toMatch(/^word\d+( word\d+)*$/)
    }
    // Neighbours share words: the overlap.
    const last = pieces[0].split(' ').at(-1)!
    expect(pieces[1].split(' ')).toContain(last)
    // Nothing is lost: every word is in some piece.
    const seen = new Set(pieces.flatMap((piece) => piece.split(' ')))
    expect(seen.size).toBe(600)
  })
})

describe('chunks.json', () => {
  it('records where every chunk came from', () => {
    expect(chunks.length).toBeGreaterThan(600)
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeGreaterThan(0)
      expect(chunk.text.length).toBeLessThanOrEqual(CHUNK_CHARS)
      expect(typeof chunk.pdfPage === 'number' || typeof chunk.line === 'number', chunk.id).toBe(true)
    }
    expect(new Set(chunks.map((chunk) => chunk.id)).size).toBe(chunks.length)
  })

  it('labels report chunks with the report page, as the claims do (p. 52 is PDF p. 60)', () => {
    const p52 = chunks.find((chunk) => chunk.text.includes('should be maintained until the burning material has cooled'))
    expect([p52?.pdfPage, p52?.reportPage]).toEqual([60, 52])
    expect(chunkPlace(p52!, 'BASS-II report')).toBe('BASS-II report, p. 52')
  })

  it('keeps PSI lines that continue a quoted value (FLEX, line 42)', () => {
    const flex = chunks.find((chunk) => chunk.sourceId === 'psi-69' && chunk.text.includes('0.5 - 1.5 atm'))
    expect(flex?.line).toBeLessThanOrEqual(42)
    expect(flex?.lineEnd).toBeGreaterThanOrEqual(42)
  })

  it('leaves out contact details', () => {
    expect(chunks.some((chunk) => /@[a-z]+\.(gov|edu|com)/i.test(chunk.text))).toBe(false)
  })
})

describe('search', () => {
  it(`returns at most ${TOP_K} chunks, at most ${MAX_PER_SOURCE} from one source`, () => {
    const hits = index.search('Does NASA have fire data for a 34% oxygen lunar habitat?')
    expect(hits.length).toBeLessThanOrEqual(TOP_K)
    const counts = new Map<string, number>()
    for (const hit of hits) counts.set(hit.sourceId, (counts.get(hit.sourceId) ?? 0) + 1)
    for (const count of counts.values()) expect(count).toBeLessThanOrEqual(MAX_PER_SOURCE)
  })

  it('finds the passages the suggested questions are about', () => {
    expect(top('Why are gentle cabin breezes dangerous?')).toContain('Goldilocks')
    expect(top('What happened in Test M5?')).toContain('loss of signal')
    expect(top('Would a Test M5 fire be dangerous in a small cabin?')).toContain('would quickly be diluted')
    expect(top('How long should suppression continue after a fire goes out?')).toContain(
      'should be maintained until the burning material has cooled',
    )
    expect(top('Does NASA have fire data for a 34% oxygen lunar habitat?')).toContain('34%')
  })

  it('gives the same answer every time', () => {
    const question = 'What happened in Test M5?'
    expect(index.search(question).map((c) => c.id)).toEqual(index.search(question).map((c) => c.id))
  })
})

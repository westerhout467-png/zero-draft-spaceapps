import { describe, expect, it } from 'vitest'
import { formatHash, parseHash } from './route'

describe('parseHash', () => {
  it('treats an empty hash as the Overview', () => {
    for (const hash of ['', '#', '#/']) {
      expect(parseHash(hash)).toEqual({ view: 'overview', params: {} })
    }
  })

  it('finds each of the three module views', () => {
    expect(parseHash('#/summarize')?.view).toBe('summarize')
    expect(parseHash('#/rank')?.view).toBe('rank')
    expect(parseHash('#/interpret')?.view).toBe('interpret')
  })

  it('allows a trailing slash', () => {
    expect(parseHash('#/rank/')?.view).toBe('rank')
  })

  it('returns null for an unknown path', () => {
    expect(parseHash('#/nope')).toBeNull()
    expect(parseHash('#/summarize/extra')).toBeNull()
    expect(parseHash('#/Summarize')).toBeNull()
    expect(parseHash('#/toString')).toBeNull()
  })

  it('reads query parameters for deep links', () => {
    expect(parseHash('#/interpret?preset=m5')).toEqual({
      view: 'interpret',
      params: { preset: 'm5' },
    })
    expect(parseHash('#/summarize?test=P22b&quarantine=1')).toEqual({
      view: 'summarize',
      params: { test: 'P22b', quarantine: '1' },
    })
  })

  it('decodes encoded values and allows params on the Overview', () => {
    expect(parseHash('#/summarize?test=P22%20b')?.params).toEqual({ test: 'P22 b' })
    expect(parseHash('#/?x=1')).toEqual({ view: 'overview', params: { x: '1' } })
  })

  it('gives empty params for a bare question mark', () => {
    expect(parseHash('#/rank?')).toEqual({ view: 'rank', params: {} })
  })
})

describe('formatHash', () => {
  it('builds the hash for each view', () => {
    expect(formatHash('overview')).toBe('#/')
    expect(formatHash('summarize')).toBe('#/summarize')
    expect(formatHash('interpret', { preset: 'm5' })).toBe('#/interpret?preset=m5')
  })

  it('round-trips through parseHash', () => {
    const route = { view: 'summarize', params: { test: 'P22b' } } as const
    expect(parseHash(formatHash(route.view, route.params))).toEqual(route)
  })
})

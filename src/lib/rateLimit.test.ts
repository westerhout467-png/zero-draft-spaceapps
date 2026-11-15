import { describe, expect, it } from 'vitest'
import { createRateLimiter, LIMIT_PER_MINUTE } from './rateLimit'

describe('createRateLimiter', () => {
  it(`allows ${LIMIT_PER_MINUTE} questions a minute from one address, then says when to come back`, () => {
    const limiter = createRateLimiter()
    for (let i = 0; i < LIMIT_PER_MINUTE; i++) expect(limiter.check('1.2.3.4', 1_000 + i * 1_000)).toEqual({ ok: true })
    // The first was at 1 s; at 20 s it frees up at 61 s, 41 s from now.
    expect(limiter.check('1.2.3.4', 20_000)).toEqual({ ok: false, retryAfterSec: 41 })
  })

  it('counts each address on its own', () => {
    const limiter = createRateLimiter(1)
    expect(limiter.check('a', 0).ok).toBe(true)
    expect(limiter.check('b', 0).ok).toBe(true)
    expect(limiter.check('a', 0).ok).toBe(false)
  })

  it('lets questions through again once the minute has passed', () => {
    const limiter = createRateLimiter(2)
    limiter.check('a', 0)
    limiter.check('a', 10_000)
    expect(limiter.check('a', 30_000).ok).toBe(false)
    expect(limiter.check('a', 60_001).ok).toBe(true)
  })

  it('doesn’t count refused questions against the window', () => {
    const limiter = createRateLimiter(1)
    limiter.check('a', 0)
    for (let t = 1_000; t < 60_000; t += 1_000) limiter.check('a', t)
    expect(limiter.check('a', 60_001).ok).toBe(true)
  })
})

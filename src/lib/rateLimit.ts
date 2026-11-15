// Lab Partner's limit: 10 questions a minute from one address (SPEC F5). A sliding window kept in
// memory, so it holds per server instance: enough to stop one visitor from draining the Gemini
// quota, not a security boundary. Pure apart from the clock, which is passed in.

export const LIMIT_PER_MINUTE = 10
const WINDOW_MS = 60_000
/** Forget the oldest addresses past this many, so memory stays bounded. */
const MAX_KEYS = 5_000

export type Verdict = { ok: true } | { ok: false; retryAfterSec: number }

export function createRateLimiter(limit = LIMIT_PER_MINUTE, windowMs = WINDOW_MS) {
  const hits = new Map<string, number[]>()
  return {
    /** Counts one request from `key` at `now` (ms), unless it would go over the limit. */
    check(key: string, now: number): Verdict {
      const recent = (hits.get(key) ?? []).filter((t) => t > now - windowMs)
      if (recent.length >= limit) {
        hits.set(key, recent)
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) }
      }
      recent.push(now)
      hits.delete(key)
      hits.set(key, recent)
      if (hits.size > MAX_KEYS) hits.delete(hits.keys().next().value as string)
      return { ok: true }
    },
  }
}

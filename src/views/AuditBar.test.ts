import { describe, expect, it } from 'vitest'
import counterSource from '../components/audit/AuditCounter.tsx?raw'
import segmentsSource from '../components/audit/AuditSegments.tsx?raw'
import auditBarSource from './AuditBar.tsx?raw'

/**
 * F0 acceptance: "There is no number literal in the component." Every count, duration and index
 * comes from lib/auditBar.ts. This strips comments and string literals (class names such as
 * "h-10" are strings) and fails on any digit that starts a token.
 */
function numberLiterals(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '""')
  return code.match(/(?<![\w$.])\d[\d_.]*/g) ?? []
}

describe('the audit bar holds no number literals', () => {
  it.each([
    ['views/AuditBar.tsx', auditBarSource],
    ['components/audit/AuditCounter.tsx', counterSource],
    ['components/audit/AuditSegments.tsx', segmentsSource],
  ])('%s', (_name, source) => {
    expect(numberLiterals(source)).toEqual([])
  })

  it('the check itself finds a literal', () => {
    expect(numberLiterals('const n = 129; const s = "h-10"')).toEqual(['129'])
  })
})

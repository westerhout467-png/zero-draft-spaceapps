import { describe, expect, it } from 'vitest'
import { normalize } from './normalize'

describe('normalize', () => {
  it('applies Unicode NFKC', () => {
    expect(normalize('ﬁre')).toBe('fire') // the "fi" ligature
    expect(normalize('ＣＯ２')).toBe('CO2') // full-width letters and digits
  })

  it('straightens curly quotes', () => {
    expect(normalize('NASA’s ‘Goldilocks’')).toBe("NASA's 'Goldilocks'")
    expect(normalize('“Goldilocks” zone')).toBe('"Goldilocks" zone')
  })

  it('turns every dash and the minus sign into a hyphen', () => {
    const dashes = ['‐', '‑', '‒', '–', '—', '―', '−']
    for (const dash of dashes) expect(normalize(`a${dash}b`)).toBe('a-b')
    expect(normalize('s–1')).toBe('s-1')
    expect(normalize('0.5 − 1.5 atm')).toBe('0.5 - 1.5 atm')
  })

  it('collapses whitespace runs and trims the ends', () => {
    expect(normalize('  a \t b\r\n\n c  ')).toBe('a b c')
    expect(normalize('Calibrated  initial O2')).toBe('Calibrated initial O2')
  })

  it('leaves other characters alone', () => {
    expect(normalize('1.2×10–3 cm2/s')).toBe('1.2×10-3 cm2/s')
    expect(normalize('C5H8O2 + 6 O2 > 5 CO2')).toBe('C5H8O2 + 6 O2 > 5 CO2')
  })
})

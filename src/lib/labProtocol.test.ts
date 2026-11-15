import { describe, expect, it } from 'vitest'
import { showsRefusal } from './labProtocol'

describe('showsRefusal', () => {
  it('never shows it for an answer that was not refused', () => {
    expect(showsRefusal(false, [])).toBe(false)
    expect(showsRefusal(false, ['set_burn_twin'])).toBe(false)
  })

  it('shows it for a question the sources cannot answer, with no tool run', () => {
    expect(showsRefusal(true, [])).toBe(true)
  })

  it('hides it under a pure command: "Take me to the ranking page" is done once Rank opens', () => {
    expect(showsRefusal(true, ['navigate'])).toBe(false)
    expect(showsRefusal(true, ['filter_tests'])).toBe(false)
    expect(showsRefusal(true, ['open_citation'])).toBe(false)
    expect(showsRefusal(true, ['navigate', 'filter_tests'])).toBe(false)
  })

  it('shows it when a tool that works something out ran and still nothing could be said', () => {
    expect(showsRefusal(true, ['set_burn_twin'])).toBe(true)
    expect(showsRefusal(true, ['run_cabin_preset'])).toBe(true)
    expect(showsRefusal(true, ['set_cabin'])).toBe(true)
  })

  it('shows it when a stray highlight came with the navigation (seen live on an unanswerable question)', () => {
    expect(showsRefusal(true, ['navigate', 'highlight_risk_entity'])).toBe(true)
    expect(showsRefusal(true, ['highlight_risk_entity'])).toBe(true)
  })
})

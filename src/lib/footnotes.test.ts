import { describe, expect, it } from 'vitest'
import { numberFootnotes, placePreview, PREVIEW_GAP_PX, sameNumbers } from './footnotes'

describe('numberFootnotes', () => {
  it('numbers claims 1, 2, 3 in the order they appear', () => {
    const numbers = numberFootnotes(['psi26.impacts', 'bass2.flam.min-o2', 'bass2.flam.vs-1g'])
    expect([...numbers]).toEqual([
      ['psi26.impacts', 1],
      ['bass2.flam.min-o2', 2],
      ['bass2.flam.vs-1g', 3],
    ])
  })

  it('gives a claim cited again the number it had the first time', () => {
    const numbers = numberFootnotes(['a', 'b', 'a', 'c'])
    expect(numbers.get('a')).toBe(1)
    expect(numbers.get('b')).toBe(2)
    expect(numbers.get('c')).toBe(3)
    expect(numbers.size).toBe(3)
  })

  it('is empty when nothing is cited', () => {
    expect(numberFootnotes([]).size).toBe(0)
  })
})

describe('sameNumbers', () => {
  it('compares ids and numbers, not map identity', () => {
    expect(sameNumbers(numberFootnotes(['a', 'b']), numberFootnotes(['a', 'b']))).toBe(true)
    expect(sameNumbers(numberFootnotes(['a', 'b']), numberFootnotes(['b', 'a']))).toBe(false)
    expect(sameNumbers(numberFootnotes(['a']), numberFootnotes(['a', 'b']))).toBe(false)
  })
})

describe('placePreview', () => {
  const box = { width: 160, height: 26 }

  it('centres the preview above the footnote when there is room', () => {
    const anchor = { top: 400, bottom: 412, left: 600, width: 8 }
    expect(placePreview(anchor, box, 1440)).toEqual({
      top: 400 - PREVIEW_GAP_PX - 26,
      left: 604 - 80,
    })
  })

  it('goes below the footnote when there is no room above it', () => {
    const anchor = { top: 20, bottom: 32, left: 600, width: 8 }
    expect(placePreview(anchor, box, 1440).top).toBe(32 + PREVIEW_GAP_PX)
  })

  it('stays inside the left and right edges of the window', () => {
    expect(placePreview({ top: 400, bottom: 412, left: 2, width: 8 }, box, 1440).left).toBe(
      PREVIEW_GAP_PX,
    )
    expect(placePreview({ top: 400, bottom: 412, left: 1436, width: 8 }, box, 1440).left).toBe(
      1440 - PREVIEW_GAP_PX - 160,
    )
  })
})

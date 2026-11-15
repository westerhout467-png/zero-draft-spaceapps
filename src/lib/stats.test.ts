import { describe, expect, it } from 'vitest'
import { histogram, median } from './stats'

describe('median', () => {
  it('takes the middle value, or the mean of the two middle values', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(median([])).toBeNull()
  })
})

describe('histogram', () => {
  it('counts values into equal bins, with edges that do not drift', () => {
    const bins = histogram([13.6, 13.9, 14.0, 22.2], 13.5, 0.5)
    expect(bins[0]).toEqual({ x0: 13.5, x1: 14, count: 2 })
    expect(bins[1]).toEqual({ x0: 14, x1: 14.5, count: 1 })
    expect(bins.at(-1)).toEqual({ x0: 22, x1: 22.5, count: 1 })
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(4)
  })

  it('puts values below the start in the first bin, and returns nothing for no values', () => {
    expect(histogram([-0.1, 0.05], 0, 0.1)[0].count).toBe(2)
    expect(histogram([], 0, 1)).toEqual([])
  })
})

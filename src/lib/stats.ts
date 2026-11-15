// Small statistics helpers. Pure.

/** The middle value (the mean of the two middle values for an even count), or null if empty. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export interface Bin {
  /** Inclusive lower edge. */
  x0: number
  /** Exclusive upper edge (inclusive for the last bin). */
  x1: number
  count: number
}

/**
 * Counts values into equal bins from `start`, `step` wide, enough bins to hold the largest value.
 * Values below `start` go in the first bin. Edges are rounded so 0.1-wide bins don't drift.
 */
export function histogram(values: readonly number[], start: number, step: number): Bin[] {
  if (values.length === 0) return []
  const edge = (i: number) => Math.round((start + i * step) * 1e6) / 1e6
  const top = Math.max(...values)
  const count = Math.max(1, Math.floor((top - start) / step + 1e-9) + 1)
  const bins: Bin[] = Array.from({ length: count }, (_, i) => ({ x0: edge(i), x1: edge(i + 1), count: 0 }))
  for (const value of values) {
    const index = Math.min(count - 1, Math.max(0, Math.floor((value - start) / step + 1e-9)))
    bins[index].count++
  }
  return bins
}

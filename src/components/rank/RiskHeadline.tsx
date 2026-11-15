import type { ReactNode } from 'react'
import { leaderHeadline, type Headline, type IndexKey, type Leaderboard, type Measured, type Weights } from '../../lib/risk'
import { Cite } from '../Cite'

/** The biggest factor in words, with its measured value and footnotes. */
function factorPhrase(factor: IndexKey, measured: Measured): ReactNode {
  if (factor === 'lowO2') {
    return (
      <>
        it burned down to {measured.value.toFixed(1)}% oxygen (<span className="test-id">{measured.testId}</span>)
        <Cite id="rank.low-o2" />
      </>
    )
  }
  return (
    <>
      it made a median {measured.value.toFixed(1)} ppm CO per 1% CO2 <Cite id="rank.co-yield" />
    </>
  )
}

/** Who leads, and by how much, so a lead of 0.2 points never reads as a finding. */
function leadPhrase({ entity, runnerUp, margin }: Headline): ReactNode {
  if (!runnerUp || margin === null) return <>{entity.label} tops the index at these weights.</>
  if (margin === 0) return <>{entity.label} and {runnerUp.label} share the top of the index at these weights.</>
  return (
    <>
      {entity.label} tops the index at these weights, {margin.toFixed(1)} points ahead of {runnerUp.label}.
    </>
  )
}

/**
 * The headline above the leaderboard, worked out by risk.leaderHeadline from the current weights:
 * who tops the index, by how much, and the component that adds the most to its index. It changes
 * with the sliders, in place.
 */
export function RiskHeadline({ board, weights }: { board: Leaderboard; weights: Weights }) {
  const headline = leaderHeadline(board, weights)
  if (!headline) return null
  return (
    <p className="text-xl leading-7 tabular-nums">
      {leadPhrase(headline)} Its biggest factor:{' '}
      {factorPhrase(headline.factor, headline.measured)}.
    </p>
  )
}

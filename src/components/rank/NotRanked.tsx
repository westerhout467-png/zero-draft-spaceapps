import { Fragment, type ReactNode } from 'react'
import { BURN_CO2_RISE_PCT } from '../../lib/audit'
import { getClaim } from '../../lib/claims'
import {
  COMPONENT_LABELS,
  INDEX_KEYS,
  MIN_BURN_CONFIRMED,
  MIN_COMPONENTS,
  type Leaderboard,
  type UnrankedGroup,
} from '../../lib/risk'
import { Cite } from '../Cite'

/** "Low-O2 burning" → "low-O2 burning", but "CO yield" stays as it is. */
const lowerFirst = (text: string) => (/^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text)

/** "three" for 3; digits past ten. */
const countWord = (n: number) =>
  ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n)

/** A percentage with no trailing zeros: 0.07%, 0.1%, 0.2%. */
const pct = (value: number) => `${Number(value.toFixed(2))}%`

/** "F1, F2 and F3" */
function TestIds({ ids }: { ids: string[] }) {
  return (
    <>
      {ids.map((id, i) => (
        <Fragment key={id}>
          {i > 0 && (i === ids.length - 1 ? ' and ' : ', ')}
          <span className="test-id">{id}</span>
        </Fragment>
      ))}
    </>
  )
}

function reasonText(group: UnrankedGroup): ReactNode {
  const { reason } = group
  if (reason.kind === 'too-small') {
    return (
      <>
        Fire too small for the sensors: its largest CO2 rise was{' '}
        {reason.largestCo2RisePct === null ? 'not stated' : pct(reason.largestCo2RisePct)}, under the{' '}
        {pct(BURN_CO2_RISE_PCT)} a burn needs <Cite id="bass2.sensor.co2-res" />
      </>
    )
  }
  if (reason.kind === 'few-burns') {
    return (
      <>
        Only {reason.burnConfirmed} burn-confirmed {reason.burnConfirmed === 1 ? 'test' : 'tests'}; a sample type
        needs {MIN_BURN_CONFIRMED}
      </>
    )
  }
  if (reason.kind === 'few-components') {
    return (
      <>
        Only {reason.components} component measured; a sample type needs {MIN_COMPONENTS}
      </>
    )
  }
  return null
}

/** NASA's words for a finding, verbatim, in the serif voice. Unverified quotes don't show. */
function Finding({ claimId }: { claimId: string }) {
  const claim = getClaim(claimId)
  if (!claim?.verified || !claim.quote) return null
  return (
    <blockquote className="font-serif text-base leading-6">
      “{claim.quote}”
      <Cite id={claimId} />
    </blockquote>
  )
}

/** Why a finding card's sample type isn't on the leaderboard, from the data. */
function findingNote(group: UnrankedGroup): ReactNode {
  if (group.family === 'nomex') {
    // Each clause has its own source: NASA's summary of all three, then its Appendix A note on F3.
    return (
      <>
        Not ranked: none of the {countWord(group.tests)} sustained a flame
        <Cite id="bass2.nomex" />; <span className="test-id">F3</span> had only a brief ignition flash
        <Cite id="bass2.note.f3" />.
      </>
    )
  }
  if (group.tests < MIN_BURN_CONFIRMED && group.largestCo2RisePct !== null) {
    return (
      <>
        Not ranked: {group.tests === 1 ? 'one test' : `${group.tests} tests`}, and its CO2 rose only{' '}
        {pct(group.largestCo2RisePct)}, under the {pct(BURN_CO2_RISE_PCT)} the sensors need to confirm a burn.
      </>
    )
  }
  return <>Not ranked.</>
}

/**
 * Everything that isn't on the leaderboard, with the reason on screen: ranked types the current
 * weights leave unscored, then the groups with too little data, then the two finding cards
 * (Nomex, the wax candle) in NASA's own words. Text sections on the black stage: no boxes.
 */
export function NotRanked({ groups, unscored }: { groups: UnrankedGroup[]; unscored: Leaderboard['unscored'] }) {
  const reasons = groups.filter((group) => group.reason.kind !== 'finding')
  const findings = groups.filter((group) => group.reason.kind === 'finding')
  return (
    <section aria-labelledby="not-ranked-heading" className="flex min-w-0 flex-col gap-5">
      <h2 id="not-ranked-heading" className="text-base leading-6 font-semibold">
        Not ranked
      </h2>

      <ul className="flex flex-col gap-3 text-sm leading-5">
        {unscored.map(({ entity }) => {
          const own = INDEX_KEYS.filter((key) => entity.components[key]).map((key) =>
            lowerFirst(COMPONENT_LABELS[key]),
          )
          return (
            <li key={entity.id}>
              <p>{entity.label}</p>
              <p className="text-muted">
                Not scored at these weights: its components ({own.join(', ')}) all have weight 0
              </p>
            </li>
          )
        })}
        {reasons.map((group) => (
          <li key={group.family} data-lab-target={`rank.unranked.${group.family}`}>
            <p className="tabular-nums">
              {group.label}, {group.tests} tests
            </p>
            <p className="text-muted tabular-nums">{reasonText(group)}</p>
          </li>
        ))}
      </ul>

      {findings.map((group) => (
        <article key={group.family} data-lab-target={`rank.unranked.${group.family}`} className="flex flex-col gap-1.5">
          <h3 className="text-sm leading-5 font-semibold">{group.label}</h3>
          <p className="text-xs leading-4 text-muted tabular-nums">
            {group.tests} {group.tests === 1 ? 'test' : 'tests'}: <TestIds ids={group.testIds} />.{' '}
            {findingNote(group)}
          </p>
          {group.reason.kind === 'finding' && group.reason.claimIds.map((id) => <Finding key={id} claimId={id} />)}
        </article>
      ))}
    </section>
  )
}

import { useMemo, useState } from 'react'
import type { Bass2Row } from '../../lib/audit'
import { investigations, testedO2Range } from '../../lib/investigations'
import { LUNAR_TARGETS, rankInvestigations, RELEVANCE_WEIGHTS, relevanceHeadline, type RelevanceHeadline, type Scored, type Target } from '../../lib/relevance'
import { Cite } from '../Cite'
import { Segmented } from '../Segmented'
import { RelevanceTable } from './RelevanceTable'

const atmosphereLabel = (t: Target) => `${t.o2Pct}% O2 at ${t.psia} psia`
const names = (list: Scored[]) => {
  const all = list.map((s) => s.investigation.name)
  return all.length < 3 ? all.join(' and ') : `${all.slice(0, -1).join(', ')} and ${all.at(-1)}`
}

/** What the closest investigation covers: "its pressure, not its O2". */
function partialCover(s: Scored): string {
  if (s.o2) return 'its O2, not its pressure'
  return 'its pressure, not its O2'
}

/** The first sentence: whether anything indexed tested this atmosphere, then who ranks first. */
function Headline({ h, target }: { h: RelevanceHeadline; target: Target }) {
  const top = h.top.investigation
  if (h.fullMatch) {
    return (
      <p className="text-xl leading-7">
        {names(h.closest)} tested both the O2 and the pressure of {atmosphereLabel(target)}; {top.name} ranks first.
      </p>
    )
  }
  const closest = h.closest[0]
  return (
    <p className="text-xl leading-7">
      No indexed investigation tested {atmosphereLabel(target)}.{' '}
      {closest
        ? `The closest, ${closest.investigation.name}, covers ${partialCover(closest)}, and what it burned was ${closest.investigation.burned.value.toLowerCase()}. `
        : 'None covers its O2 or its pressure. '}
      {top.name} ranks first on what it did study.
    </p>
  )
}

/**
 * F3d: which challenge-named NASA fire investigations can say most about a lunar lander and
 * rover atmosphere (zayac.atmospheres). A judgment call shown as one: its weights are on screen,
 * and every cell of the table is a quote or "Not stated".
 */
export function InvestigationRelevance({ rows }: { rows: Bass2Row[] }) {
  const [targetId, setTargetId] = useState<Target['id']>('normoxic')
  const target = LUNAR_TARGETS.find((t) => t.id === targetId) ?? LUNAR_TARGETS[0]
  const list = useMemo(() => investigations(testedO2Range(rows)), [rows])
  const ranked = useMemo(() => rankInvestigations(list, target), [list, target])
  const headline = relevanceHeadline(ranked)
  const w = RELEVANCE_WEIGHTS

  return (
    <section aria-labelledby="relevance-heading" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex max-w-[60rem] min-w-0 flex-col gap-1">
          <h2 id="relevance-heading" className="text-base leading-6 font-semibold">
            Which NASA fire investigations speak to a lunar habitat
          </h2>
          <p className="text-sm leading-5 text-muted">
            NASA Glenn names two atmospheres of interest for the lunar lander and rover
            <Cite id="zayac.atmospheres" />. None of the indexed investigations ran in lunar gravity: Flammability of
            Materials on the Moon is to fly on a lander
            <Cite id="zayac.fm2-flight" />. SAME-R, which the challenge also names, has no record in our sources.
          </p>
        </div>
        <Segmented
          label="Atmosphere"
          value={targetId}
          options={LUNAR_TARGETS.map((t) => ({ value: t.id, label: atmosphereLabel(t) }))}
          onChange={setTargetId}
        />
      </div>

      {headline && <Headline h={headline} target={target} />}

      <p className="text-sm leading-5 text-muted">
        Relevance = 100 × (<span className="tabular-nums">{w.atmosphere}</span> atmosphere +{' '}
        <span className="tabular-nums">{w.gravity}</span> gravity + <span className="tabular-nums">{w.phenomena}</span>{' '}
        phenomena + <span className="tabular-nums">{w.materials}</span> spacecraft materials +{' '}
        <span className="tabular-nums">{w.data}</span> test table)
        <Cite id="rank.relevance" />. ZERO-DRAFT’s judgment call, not a NASA rating. Anything a record doesn’t state
        scores 0.
      </p>

      <RelevanceTable ranked={ranked} target={target} />
    </section>
  )
}

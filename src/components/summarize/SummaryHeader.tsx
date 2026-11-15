import { CircleCheck, X } from 'lucide-react'
import { useId, useState } from 'react'
import { auditHeadline, type AuditFile } from '../../lib/audit'
import { getClaim } from '../../lib/claims'
import { useBriefing } from '../../lib/generatedData'
import type { OutcomeFindings } from '../../lib/outcomes'
import { summarizeStore } from '../../lib/summarizeStore'
import { AUDIT_FILTER_LABELS, hasFilters, type TestFilters } from '../../lib/testWall'
import { AnimatedNumber } from '../AnimatedNumber'
import { Cite } from '../Cite'
import { BriefingText, BriefingToggle } from './BriefingBox'

/** The quoted 1g limit: 15.4% O2 for PMMA rods with 4 cm/s forced flow (Olson & Ferkul 2017, report p. 76). */
const EARTH_LIMIT_CLAIM = 'bass2.flam.vs-1g'

type SummaryHeaderProps = {
  audit: AuditFile
  filters: TestFilters
  shown: number
  shownBurning: number
  /** What the outcome reader found; undefined until its file exists and has loaded. */
  findings?: OutcomeFindings
}

/**
 * The top of SUMMARIZE, on the page background: a plain-words headline built from audit.json
 * alone (it stands even if the AI briefing never ships), then what the filters show. The AI
 * briefing's toggle appears only once the pipeline has written it.
 */
export function SummaryHeader({ audit, filters, shown, shownBurning, findings }: SummaryHeaderProps) {
  const headline = auditHeadline(audit)
  const [briefingOpen, setBriefingOpen] = useState(false)
  const briefingId = useId()
  const briefing = useBriefing()
  const lowest = headline.lowestBurning
  // 15.4 comes only from its quoted claim, and shows only while that claim is verified.
  const limitClaim = getClaim(EARTH_LIMIT_CLAIM)
  const earthLimit = limitClaim?.verified ? limitClaim.value : undefined

  return (
    <div className="flex shrink-0 flex-col gap-2 px-6 pt-3 pb-2">
      <p className="max-w-[80rem] text-xl leading-7 text-ink">
        <span className="tabular-nums">{headline.setAside}</span> of <span className="tabular-nums">{headline.total}</span>{' '}
        rows are set aside: <span className="tabular-nums">{headline.o2Impossible}</span> report impossible oxygen and{' '}
        <span className="tabular-nums">{headline.o2Missing}</span> report none.
        {lowest && (
          <>
            {' '}
            In the rest, a confirmed flame burned down to <span className="tabular-nums">{lowest.value.toFixed(1)}%</span>{' '}
            oxygen (<span className="test-id">{lowest.testId}</span>)
            {earthLimit ? (
              <>
                , below <span className="tabular-nums">{earthLimit}%</span>, the normal-gravity limit for PMMA rods in a 4
                cm/s flow
                <Cite id="bass2.flam.vs-1g" />.
              </>
            ) : (
              '.'
            )}
          </>
        )}
      </p>
      {findings && (
        <p className="max-w-[80rem] text-sm leading-6 text-ink">
          Sensors confirm <span className="tabular-nums">{findings.burnConfirmed}</span> burns. NASA’s notes, read by AI
          with every quote checked, describe a sustained flame in <span className="tabular-nums">{findings.sustained}</span>{' '}
          tests, including <span className="tabular-nums">{findings.tooSmallSustained}</span> of the{' '}
          <span className="tabular-nums">{findings.tooSmall}</span> SIBAL tests too small for the sensors.{' '}
          <span className="ml-1 inline-flex items-center gap-1 align-baseline text-xs text-emerald">
            <CircleCheck aria-hidden="true" className="size-3.5" />
            AI-read from NASA’s notes, quote checked
          </span>
        </p>
      )}
      <div className="flex h-6 items-center gap-4 text-sm whitespace-nowrap">
        <p className="text-muted">
          Showing <AnimatedNumber value={shown} className="text-ink" /> of{' '}
          <span className="text-ink tabular-nums">{headline.total}</span> tests,{' '}
          <AnimatedNumber value={shownBurning} className="text-ink" /> burn confirmed by sensors
        </p>
        {filters.audit && (
          <button
            type="button"
            onClick={() => summarizeStore.setFilters({ audit: null })}
            aria-label={`Remove the filter: only ${AUDIT_FILTER_LABELS[filters.audit]}`}
            className="flex items-center gap-1.5 rounded-sm border border-cyan px-2 py-0.5 text-xs text-ink hover:bg-cyan/10"
          >
            Only: {AUDIT_FILTER_LABELS[filters.audit]}
            <X aria-hidden="true" className="size-3" />
          </button>
        )}
        {hasFilters(filters) && (
          <button type="button" onClick={summarizeStore.clearFilters} className="text-xs text-cyan hover:underline">
            Clear filters
          </button>
        )}
        {briefing && (
          <span className="ml-auto">
            <BriefingToggle open={briefingOpen} onToggle={() => setBriefingOpen((open) => !open)} controls={briefingId} />
          </span>
        )}
      </div>
      {briefing && briefingOpen && <BriefingText id={briefingId} briefing={briefing} />}
    </div>
  )
}

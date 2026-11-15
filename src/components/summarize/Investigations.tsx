import { CircleCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { getSource } from '../../lib/claims'
import { useInvestigationSummaries } from '../../lib/generatedData'
import { evidenceClaim, platformConflict, rangeText } from '../../lib/investigationSummaries'
import type { Checked, Evidence, InvestigationSummary } from '../../lib/investigationVerify'
import { Cite } from '../Cite'

/** One footnote per quote behind a value or a sentence, a comma between neighbours so ¹ ² never reads as ¹². */
function Quotes({ id, evidence, what }: { id: string; evidence: readonly Evidence[]; what: string }) {
  return (
    <>
      {evidence.map((e, i) => {
        const claim = evidenceClaim(id, e, what)
        return (
          <span key={claim.id}>
            {i > 0 && (
              <span aria-hidden="true" className="relative -top-[0.6em] text-[0.75em] leading-none text-cyan">
                ,
              </span>
            )}
            <Cite id={claim.id} claim={claim} />
          </span>
        )
      })}
    </>
  )
}

/** A stated fact with its quotes, or "Not stated" (CLAUDE.md rule 4). */
function Fact<T>({
  id,
  label,
  field,
  note,
  children,
}: {
  id: string
  label: string
  field: Checked<T>
  /** Shown under the value: what a reader should know before trusting it. */
  note?: ReactNode
  children: (value: T) => ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-xs leading-5 text-muted">{label}</dt>
      <dd className="text-sm leading-5">
        {field.value === null ? (
          <span className="text-muted">Not stated</span>
        ) : (
          <>
            <span className="tabular-nums">{children(field.value)}</span>
            <Quotes id={id} evidence={field.evidence} what={label} />
          </>
        )}
        {field.value !== null && note && <span className="block text-xs leading-5 text-muted">{note}</span>}
      </dd>
    </div>
  )
}

function Investigation({ inv }: { inv: InvestigationSummary }) {
  const source = getSource(inv.id.toLowerCase())
  const conflict = platformConflict(inv.id, inv.platform.evidence)
  return (
    <article aria-label={inv.acronym.value ?? inv.id} className="flex min-w-0 flex-col gap-3">
      <h3 className="text-sm leading-5">
        <span className="font-semibold">{inv.acronym.value ?? source?.short ?? inv.id}</span>
        {/* A record with no acronym is headed by its PSI id alone, not by the id twice. */}
        {inv.acronym.value && (
          <>
            <Quotes id={inv.id} evidence={inv.acronym.evidence} what="Acronym" /> <span className="text-muted">{source?.short ?? inv.id}</span>
          </>
        )}
        {inv.title.value && (
          <span className="block text-muted">
            {inv.title.value}
            <Quotes id={inv.id} evidence={inv.title.evidence} what="Title" />
          </span>
        )}
      </h3>
      <dl className="grid grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] gap-x-4">
        <Fact
          id={inv.id}
          label="Platform"
          field={inv.platform}
          note={
            conflict && (
              <>
                This is the record’s Flight Platform field. Its own description says it ran on a Cygnus after leaving
                the ISS
                <Cite id={conflict} />: see the record inconsistencies below.
              </>
            )
          }
        >
          {(value) => value}
        </Fact>
        <Fact id={inv.id} label="Tested O2" field={inv.o2Pct}>
          {(value) => rangeText(value, '%')}
        </Fact>
        <Fact id={inv.id} label="Pressure" field={inv.pressure}>
          {(value) => rangeText(value, value.unit)}
        </Fact>
        <Fact id={inv.id} label="Flow" field={inv.flow}>
          {(value) => rangeText(value, value.unit)}
        </Fact>
      </dl>
      {inv.summary.length > 0 ? (
        <p className="text-sm leading-6">
          {inv.summary.map((sentence, i) => (
            <span key={i}>
              {sentence.text}
              <Quotes id={inv.id} evidence={sentence.evidence} what="Summary sentence" />{' '}
            </span>
          ))}
        </p>
      ) : (
        <p className="text-sm leading-6 text-muted">No summary sentence passed the quote check.</p>
      )}
    </article>
  )
}

/**
 * F7: the challenge-named investigations in our sources, each summarized by the AI pipeline from
 * its own PSI record (BASS-II from the report's summary page). Every value and every sentence
 * carries the quote verify.ts found for it; whatever failed that check isn't here. Renders
 * nothing until public/data/investigations.json exists. A text section: no frame.
 */
export function Investigations() {
  const file = useInvestigationSummaries()
  if (!file) return null
  return (
    <section aria-labelledby="investigations-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 id="investigations-heading" className="text-base leading-6 font-semibold">
            Investigations
          </h2>
          <p className="flex items-center gap-1.5 text-xs leading-5 text-muted">
            <CircleCheck aria-hidden="true" className="size-3.5 text-emerald" />
            AI-written, checked
          </p>
        </div>
        <p className="max-w-[60rem] text-sm leading-6 text-muted">
          The fire investigations the challenge names, each summarized by an AI from NASA’s own record of it. A script
          found every quote in the record before anything was shown; a value the record doesn’t give reads “Not stated”.
          Their relevance to a lunar habitat is ranked on Rank.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-x-12 gap-y-8">
        {file.investigations.map((inv) => (
          <Investigation key={inv.id} inv={inv} />
        ))}
      </div>
    </section>
  )
}

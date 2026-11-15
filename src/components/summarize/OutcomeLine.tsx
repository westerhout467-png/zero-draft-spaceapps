import { CircleCheck } from 'lucide-react'
import { OUTCOME_LABELS } from '../../lib/generatedData'
import type { OutcomeView } from '../../lib/outcomes'
import { OutcomeGlyph } from './glyphs'

/**
 * What NASA's notes say the flame did (F2b), apart from the sensors' verdict above it: a test can
 * be "Fire too small for the sensors" and still have burned. The quote is NASA's, checked in the
 * test's own row of Appendix A; the reading of it is the AI's, and says so.
 */
export function OutcomeLine({ outcome }: { outcome: OutcomeView }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="flex flex-wrap items-center gap-x-2 text-sm leading-6">
        <OutcomeGlyph outcome={outcome.outcome} className="text-ink/80" />
        <span>Outcome: {OUTCOME_LABELS[outcome.outcome]}</span>
        {outcome.reason ? (
          <span className="text-muted">{outcome.reason}</span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-emerald">
            <CircleCheck aria-hidden="true" className="size-3.5" />
            AI-read from NASA’s notes, quote checked
          </span>
        )}
      </p>
      {outcome.quote && (
        <figure className="flex flex-col gap-1">
          <blockquote className="border-l-2 border-line pl-3 font-serif text-base leading-6 text-ink">“{outcome.quote}”</blockquote>
          {outcome.place && (
            <figcaption className="pl-3.5 text-xs text-muted">
              NASA’s test observations, Appendix A, report p.{' '}
              <span className="tabular-nums">{outcome.place.reportPage}</span>, PDF p.{' '}
              <span className="tabular-nums">{outcome.place.pdfPage}</span>
            </figcaption>
          )}
        </figure>
      )}
    </div>
  )
}

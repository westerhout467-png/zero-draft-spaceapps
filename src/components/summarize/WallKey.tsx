import type { ReactNode } from 'react'
import {
  BURN_STATUS_LABELS,
  burnStatus,
  COLUMNS,
  FLAG_LABELS,
  isMissingCell,
  SAMPLE_TYPE_LABELS,
  severityOf,
  type Bass2Row,
  type FlowConfig,
  type Severity,
} from '../../lib/audit'
import { citePreview, getClaim, testNoteClaimIds } from '../../lib/claims'
import { OUTCOME_LABELS, useTestOutcomes, type Outcome } from '../../lib/generatedData'
import { useOutcome } from '../../lib/useOutcome'
import { o2FillColor } from '../../lib/testWall'
import { useCitation } from '../citationContext'
import { FlowGlyph, OutcomeGlyph, StatusGlyph } from './glyphs'
import { useWallHover } from './wallHover'

const SWATCHES = 5
const FLOWS: (FlowConfig | null)[] = ['Opposed', 'Concurrent', 'Stagnation', null]
const OUTCOME_ORDER: Outcome[] = ['sustained', 'brief', 'no-ignition', 'not-stated']
const STATUSES: { severity: Severity; label: string }[] = [
  { severity: 'quarantined', label: 'Quarantined' },
  { severity: 'co-over-range', label: 'CO over range' },
  { severity: 'warning', label: 'Other flag' },
]

/** The key under the wall: the initial-O2 scale in steps (the same colors as the tiles), then the corner marks. */
export function WallLegend({ domain }: { domain: { min: number; max: number } }) {
  const outcomes = useTestOutcomes()
  const steps = Array.from({ length: SWATCHES }, (_, i) => domain.min + ((domain.max - domain.min) * i) / (SWATCHES - 1))
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs leading-4 text-muted">
      <span className="flex items-center gap-2">
        Initial O2
        <span className="num text-ink">{domain.min.toFixed(1)}%</span>
        <span aria-hidden="true" className="flex gap-px">
          {steps.map((o2) => (
            <span key={o2} className="h-3 w-4" style={{ backgroundColor: o2FillColor(o2, domain) }} />
          ))}
        </span>
        <span className="num text-ink">{domain.max.toFixed(1)}%</span>
      </span>
      <span className="flex items-center gap-3">
        {FLOWS.map((flow) => (
          <span key={flow ?? 'none'} className="flex items-center gap-1.5">
            <FlowGlyph flow={flow} className="text-ink/70" />
            {flow ?? 'Not stated'}
          </span>
        ))}
      </span>
      <span className="flex items-center gap-3">
        {STATUSES.map(({ severity, label }) => (
          <span key={severity} className="flex items-center gap-1.5">
            <StatusGlyph severity={severity} />
            {label}
          </span>
        ))}
      </span>
      {outcomes && (
        <span className="flex items-center gap-3">
          {OUTCOME_ORDER.map((outcome) => (
            <span key={outcome} className="flex items-center gap-1.5">
              <OutcomeGlyph outcome={outcome} className="text-ink/80" />
              {OUTCOME_LABELS[outcome]}
            </span>
          ))}
          <span>(AI-read from NASA’s notes, quote checked)</span>
        </span>
      )}
    </div>
  )
}

/** A label and its value: words in Archivo, the value a mono readout. */
function Reading({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-muted">{label}</span>
      {children}
    </span>
  )
}

const value = (text: string | number | null, missing = 'Not recorded') =>
  text === null || text === '' ? (
    <span className="text-muted">{missing}</span>
  ) : (
    <span className="num text-ink">{text}</span>
  )

type TestBriefProps = {
  byId: ReadonlyMap<string, Bass2Row>
  /** Shown when no tile is under the pointer or focus (the lowest O2 with confirmed burning). */
  defaultId: string | null
  defaultCaption: string
}

/**
 * A mini-record of the tile under the pointer or keyboard focus, in the space under the wall:
 * O2 from initial to final, the CO2 rise, CO, flow, sample, flags, and NASA's own note if there is
 * one. With nothing hovered it shows the default test. Fixed height, so hovering never moves the
 * wall. Only this component re-renders on hover.
 */
export function TestBrief({ byId, defaultId, defaultCaption }: TestBriefProps) {
  const hovered = useWallHover()
  const { openCitation } = useCitation()
  const row = (hovered ? byId.get(hovered) : undefined) ?? (defaultId ? byId.get(defaultId) : undefined)
  const outcome = useOutcome(row?.testId ?? '')
  if (!row) return <div className="h-[8.25rem]" />

  const isDefault = !hovered || !byId.has(hovered)
  const flags = row.flags.filter((flag) => !flag.startsWith('note-'))
  const noteId = testNoteClaimIds(row.testId)[0]
  const note = noteId ? getClaim(noteId) : undefined
  const year = row.date.slice(0, 4)
  // A raw CO cell as written ("290", "OR", ">500"); an empty or "none" cell is not recorded.
  const coCell = (column: string) => (isMissingCell(row.raw[column]) ? null : row.raw[column].trim())

  return (
    <section aria-label={`Test ${row.testId} in brief`} className="flex h-[8.25rem] flex-col gap-1 overflow-hidden text-xs leading-5">
      <p className="flex min-w-0 items-baseline gap-2 whitespace-nowrap">
        <span className="test-id text-sm text-ink">{row.testId}</span>
        <span className="truncate text-muted">
          {row.pi}, <span className="tabular-nums">{row.raw[COLUMNS.date]}</span>, {SAMPLE_TYPE_LABELS[row.sampleType]}
        </span>
        {isDefault && <span className="ml-auto shrink-0 text-muted">{defaultCaption}</span>}
      </p>
      <p className="flex items-baseline gap-4">
        <Reading label="O2">
          {value(row.o2InitPct)}
          <span className="text-muted">→</span>
          {value(row.o2FinalPct)}
        </Reading>
        <Reading label="CO2 rise">{value(row.dCo2Pct === null ? null : row.dCo2Pct.toFixed(2))}</Reading>
        <Reading label="CO">
          {value(coCell(COLUMNS.coInit))}
          <span className="text-muted">→</span>
          {value(coCell(COLUMNS.coFinal))}
        </Reading>
      </p>
      <p className="flex items-center gap-4 whitespace-nowrap">
        <span className="flex items-center gap-1.5">
          <FlowGlyph flow={row.flowConfig} className="text-ink/70" />
          {row.flowConfig ?? 'Flow not stated'}
        </span>
        <span className="truncate text-muted">{BURN_STATUS_LABELS[burnStatus(row)]}</span>
      </p>
      <p className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
        {/* The notes' outcome leads this line; the sensors' verdict stays on the line above. A
            test with no outcome shows the reason after the "not stated" mark: the strip is narrow. */}
        {outcome && (
          <span className="mr-2.5 flex shrink-0 items-center gap-1.5">
            <OutcomeGlyph outcome={outcome.outcome} className="shrink-0 text-ink/80" />
            {outcome.reason ? (
              <span className="text-muted">
                <span className="sr-only">Outcome not stated: </span>
                {outcome.reason}
              </span>
            ) : (
              <span>Outcome: {OUTCOME_LABELS[outcome.outcome]}</span>
            )}
          </span>
        )}
        {flags.length === 0 ? (
          <span className="text-muted">No flags</span>
        ) : (
          <>
            <StatusGlyph severity={severityOf(row.flags)} className="shrink-0" />
            <span className="min-w-16 truncate">{FLAG_LABELS[flags[0]]}</span>
            {flags.length > 1 && (
              <span className="shrink-0 text-muted">
                and <span className="tabular-nums">{flags.length - 1}</span> more
              </span>
            )}
          </>
        )}
      </p>
      {row.flags.includes('date-year-2018') ? (
        <p className="text-muted">
          Sorts last in its column because its Date cell says <span className="tabular-nums">{year}</span>.
        </p>
      ) : (
        note?.quote && (
          <p className="line-clamp-2">
            <span className="font-serif text-sm leading-5 text-ink">“{note.quote}”</span>{' '}
            <button
              type="button"
              onClick={() => openCitation(note.id)}
              className="whitespace-nowrap text-cyan hover:underline"
            >
              {citePreview(note)}
            </button>
          </p>
        )
      )}
    </section>
  )
}

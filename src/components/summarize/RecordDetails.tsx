import { CircleCheck, ExternalLink, Play } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  BURN_CO2_RISE_PCT,
  BURN_STATUS_LABELS,
  burnStatus,
  COLUMNS,
  FLAG_LABELS,
  GROUP_FLAGS,
  quarantineReason,
  SEVERITY_LABELS,
  severityOf,
  type Bass2Row,
  type CheckedFlowEvidence,
  type Flag,
  type O2Forensic,
  type Severity,
} from '../../lib/audit'
import { getClaim, getSource, sourceLink, testNoteClaimIds } from '../../lib/claims'
import { useOutcome } from '../../lib/useOutcome'
import { replayPresetFor } from '../../lib/interpret'
import { formatHash } from '../../lib/route'
import { Cite } from '../Cite'
import { StatusGlyph } from './glyphs'
import { OutcomeLine } from './OutcomeLine'
import { RawFields } from './RawFields'
import { ShowTheMath } from './ShowTheMath'

/** Appendix A tables quoted in claims.json, by PI. */
const APPENDIX_TABLE: Record<string, { claimId: string; name: string }> = {
  Miller: { claimId: 'bass2.table.a4', name: 'Table A.4' },
  Olson: { claimId: 'bass2.table.a5', name: 'Table A.5' },
}

/** Which CO cell stopped CO per 1% CO2 being worked out, as written: "the final CO cell reads “>500”". */
function coCellProblem(row: Bass2Row): string {
  const [which, column] = row.coFinalPpm === null ? ['final', COLUMNS.coFinal] : ['initial', COLUMNS.coInit]
  const raw = (row.raw[column] ?? '').trim()
  return raw === '' ? `the ${which} CO cell is empty` : `the ${which} CO cell reads “${raw}”, not a number`
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm leading-5 font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function groupSeverity(flag: Flag): Severity | null {
  if (GROUP_FLAGS.quarantined.includes(flag)) return 'quarantined'
  if (GROUP_FLAGS['co-over-range'].includes(flag)) return 'co-over-range'
  if (flag.startsWith('note-')) return null
  return 'warning'
}

function flowReason(row: Bass2Row, flow: CheckedFlowEvidence | undefined): string {
  if (!flow?.quote) return `Not in Appendix A: this test ran in ${row.date.slice(0, 4)}.`
  if (/\s\?\s/.test(` ${flow.quote} `)) return 'NASA’s table shows “?” for its flow direction.'
  return 'Its Appendix A table has no flow column.'
}

/** The body of a test's record drawer. */
export function RecordDetails({ row, flow, forensic }: { row: Bass2Row; flow?: CheckedFlowEvidence; forensic?: O2Forensic }) {
  const severity = severityOf(row.flags)
  const burn = burnStatus(row)
  const notes = testNoteClaimIds(row.testId)
  const dataset = getSource('psi-25')
  const datasetLink = dataset ? sourceLink(dataset) : null
  const table = APPENDIX_TABLE[row.pi]
  const outcome = useOutcome(row.testId)
  const replay = replayPresetFor(row.testId)

  return (
    <div className="flex flex-col gap-6">
      <p className="flex items-center gap-2 text-sm">
        {severity === 'clean' ? (
          <CircleCheck aria-hidden="true" className="size-4 text-emerald" />
        ) : (
          <StatusGlyph severity={severity} className="size-2.5" />
        )}
        {SEVERITY_LABELS[severity]}
        {severity === 'quarantined' && <span className="text-muted">{quarantineReason(row)}</span>}
      </p>

      {replay && (
        <a
          href={formatHash('interpret', { preset: replay })}
          className="flex w-fit items-center gap-2 text-sm text-cyan hover:underline"
        >
          <Play aria-hidden="true" className="size-4" />
          Replay this test
        </a>
      )}

      {forensic && (
        <Section title="Show the math">
          <ShowTheMath forensic={forensic} />
        </Section>
      )}

      <Section title="Burn check">
        <p className="text-sm leading-6">
          {BURN_STATUS_LABELS[burn]}
          {row.dCo2Pct !== null && burn !== 'not-checked' && (
            <span className="text-muted">
              : CO2 rose <span className="tabular-nums text-ink">{row.dCo2Pct.toFixed(2)}</span> points;{' '}
              {burn === 'confirmed' ? 'at least' : 'under'} <span className="tabular-nums text-ink">{BURN_CO2_RISE_PCT.toFixed(1)}</span>,
              twice the CO2 sensor’s resolution
              <Cite id="bass2.sensor.co2-res" />
            </span>
          )}
        </p>
        {burn === 'confirmed' && (
          <p className="text-sm leading-6 text-muted">
            CO per 1% CO2:{' '}
            {row.coPerCo2 === null ? (
              `not worked out, because ${coCellProblem(row)}`
            ) : (
              <>
                <span className="tabular-nums text-ink">{Math.round(row.coPerCo2)}</span> ppm
              </>
            )}
          </p>
        )}
      </Section>

      {/* Its own section: quarantined tests have notes too, and the sensors' verdict stays apart. */}
      {outcome && (
        <Section title="What NASA’s notes say">
          <OutcomeLine outcome={outcome} />
        </Section>
      )}

      <Section title="Flow direction">
        <p className="text-sm leading-6">{row.flowConfig ?? 'Not stated'}</p>
        {row.flowConfig === null && <p className="text-sm text-muted">{flowReason(row, flow)}</p>}
        {flow?.quote && flow.quoteChecked && (
          <figure className="flex flex-col gap-1">
            <blockquote className="border-l-2 border-cyan pl-3 font-serif text-base leading-6 text-ink">
              {flow.quote.trim()}
            </blockquote>
            <figcaption className="flex items-center gap-2 pl-3.5 text-xs text-muted">
              <span>
                Appendix A, report p. <span className="tabular-nums">{flow.reportPage}</span>, PDF p.{' '}
                <span className="tabular-nums">{flow.pdfPage}</span>
              </span>
              <span className="flex items-center gap-1 text-emerald">
                <CircleCheck aria-hidden="true" className="size-3.5" />
                Quote checked
              </span>
            </figcaption>
          </figure>
        )}
      </Section>

      {notes.length > 0 && (
        <Section title="NASA’s note">
          {notes.map((id) => (
            <p key={id} className="font-serif text-base leading-6">
              {getClaim(id)?.quote}
              <Cite id={id} />
            </p>
          ))}
        </Section>
      )}

      <Section title="Flags">
        {row.flags.length === 0 ? (
          <p className="text-sm text-muted">None</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm leading-6">
            {row.flags.map((flag) => {
              const glyph = groupSeverity(flag)
              return (
                <li key={flag} className="flex items-center gap-2">
                  {glyph ? <StatusGlyph severity={glyph} /> : <span className="size-[7px]" />}
                  {FLAG_LABELS[flag]}
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <Section title="Every field">
        <RawFields row={row} />
      </Section>

      <Section title="Sources">
        <p className="text-sm leading-6">
          {dataset?.title}, {dataset?.publisher}, row <span className="tabular-nums">{row.rowIndex}</span>
        </p>
        <p className="text-sm leading-6">
          BASS-II report, Appendix A, which lists calibrated and uncalibrated O2 and observations for every test
          <Cite id="bass2.table.o2-columns" />
          {table && (
            <>
              ; this test’s row is in {table.name}
              <Cite id={table.claimId} />
            </>
          )}
        </p>
        {datasetLink && (
          <a
            href={datasetLink}
            target="_blank"
            rel="noreferrer"
            className="flex w-fit items-center gap-2 text-sm text-cyan hover:underline"
          >
            Open the PSI-25 dataset
            <ExternalLink aria-hidden="true" className="size-4" />
          </a>
        )}
      </Section>
    </div>
  )
}

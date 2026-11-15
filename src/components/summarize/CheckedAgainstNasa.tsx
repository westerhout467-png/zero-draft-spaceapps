import { CircleCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { nasaChecks, type Bass2Row, type CoYieldStat } from '../../lib/audit'
import { getClaim } from '../../lib/claims'
import type { OutcomeFindings } from '../../lib/outcomes'
import { formatHash } from '../../lib/route'
import { Cite } from '../Cite'

function Quote({ id }: { id: string }) {
  const claim = getClaim(id)
  if (!claim?.verified || !claim.quote) return null
  return (
    <span className="font-serif text-base leading-6">
      “{claim.quote}”
      <Cite id={id} />
    </span>
  )
}

/** "NASA's note on O4:" then the note, in NASA's words. */
function TestNote({ testId, id }: { testId: string; id: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-xs text-muted">
        NASA’s note on <span className="test-id">{testId}</span>:
      </span>
      <Quote id={id} />
    </span>
  )
}

const fmt = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined ? 'Not stated' : value.toFixed(digits)

const Num = ({ children }: { children: ReactNode }) => <span className="tabular-nums">{children}</span>

/** "median 366.7, mean 398.4 ppm CO per 1% CO2 (18 tests)" */
function MedianMean({ stat, unit }: { stat: CoYieldStat; unit?: string }) {
  return (
    <>
      median <Num>{fmt(stat.median)}</Num>, mean <Num>{fmt(stat.mean)}</Num>
      {unit && ` ${unit}`} (<Num>{stat.n}</Num> tests)
    </>
  )
}

/**
 * "Checked against NASA" (F2): our numbers recomputed from the raw CSV, beside the report's own
 * words. NASA says "on average" without listing which tests it averaged, so CO rows show the
 * median and the mean. Computed over every test, whatever the filters, by lib/audit.ts.
 */
/** Test ids as links to their records, or "none" when a direction is empty: the row never hides. */
function TestIds({ ids }: { ids: readonly string[] }) {
  if (ids.length === 0) return <span className="text-muted">none</span>
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5">
      {ids.map((id) => (
        <a key={id} href={formatHash('summarize', { test: id })} className="test-id text-cyan hover:underline">
          {id}
        </a>
      ))}
    </span>
  )
}

/** Where the sensors and NASA's notes (as the AI read them) say different things, both ways. */
function Disagreements({ findings }: { findings: OutcomeFindings }) {
  const total = findings.sensorsYesNotesNo.length + findings.notesYesSensorsNo.length
  return (
    <span className="flex flex-col gap-2">
      <span>
        Sensors and NASA’s notes disagree in <Num>{total}</Num> tests.
      </span>
      <span className="flex flex-col gap-0.5">
        <span>
          Burn confirmed by sensors, but the notes say brief or no ignition: <Num>{findings.sensorsYesNotesNo.length}</Num>
        </span>
        <TestIds ids={findings.sensorsYesNotesNo} />
      </span>
      <span className="flex flex-col gap-0.5">
        <span>
          Notes say a sustained flame, but the sensors didn’t confirm a burn: <Num>{findings.notesYesSensorsNo.length}</Num>
        </span>
        <TestIds ids={findings.notesYesSensorsNo} />
      </span>
    </span>
  )
}

export function CheckedAgainstNasa({ rows, findings }: { rows: Bass2Row[]; findings?: OutcomeFindings }) {
  const checks = nasaChecks(rows)
  const lines: { ours: ReactNode; nasa: ReactNode }[] = [
    {
      ours: (
        <>
          Opposed slabs: <MedianMean stat={checks.opposedSlabs} unit="ppm CO per 1% CO2" />
        </>
      ),
      nasa: <Quote id="bass2.co.370" />,
    },
    {
      ours: (
        <>
          Concurrent and stagnation rods together: <MedianMean stat={checks.concurrentAndStagnationRods} />
        </>
      ),
      nasa: (
        <span className="flex flex-col gap-1">
          <Quote id="bass2.co.550" />
          <span className="text-xs text-muted">
            The report doesn’t say how it grouped stagnation tests, so the next row splits them.
          </span>
        </span>
      ),
    },
    {
      ours: (
        <span className="flex flex-col">
          <span>
            Concurrent rods alone: <MedianMean stat={checks.concurrentRods} />
          </span>
          <span>
            Stagnation rods alone: <MedianMean stat={checks.stagnationRods} />
          </span>
        </span>
      ),
      nasa: <span className="text-sm text-muted">The report gives no separate figure for either.</span>,
    },
    {
      ours: (
        <>
          Opposed rods: <MedianMean stat={checks.opposedRods} />, ranging <Num>{fmt(checks.opposedRods.min)}</Num> to{' '}
          <Num>{fmt(checks.opposedRods.max)}</Num>
        </>
      ),
      nasa: <Quote id="bass2.co.opposed-rods" />,
    },
    {
      ours: (
        <>
          Lowest final O2 with confirmed burning: <Num>{fmt(checks.lowestBurning?.value)}%</Num> (
          <span className="test-id">{checks.lowestBurning?.testId}</span>)
        </>
      ),
      nasa: (
        <span className="flex flex-col gap-2">
          <Quote id="bass2.ign.survive-13.6" />
          {checks.lowestBurning && <TestNote testId={checks.lowestBurning.testId} id="bass2.note.o4" />}
        </span>
      ),
    },
    {
      ours: (
        <>
          Lowest usable final O2: <Num>{fmt(checks.lowestUsable?.value)}%</Num> (
          <span className="test-id">{checks.lowestUsable?.testId}</span>), a test with no sustained flame
        </>
      ),
      nasa: checks.lowestUsable && <TestNote testId={checks.lowestUsable.testId} id="bass2.note.o12" />,
    },
  ]

  // Only once the outcome reader's file exists (it renders nothing without it).
  if (findings) {
    lines.push({
      ours: <Disagreements findings={findings} />,
      nasa: (
        <span className="flex flex-col gap-2">
          <span>
            The notes are NASA’s “Test observations and anomalies” for each test in Appendix A of the BASS-II report
            <Cite id="bass2.table.observations" />. They can tell of a flame the cabin sensors couldn’t measure, and the
            sensors can confirm a burn the notes call brief.
          </span>
          <span className="flex items-center gap-1 text-xs text-emerald">
            <CircleCheck aria-hidden="true" className="size-3.5" />
            AI-read from NASA’s notes, quote checked. Open a test to read its quote.
          </span>
        </span>
      ),
    })
  }

  return (
    <section aria-labelledby="checked-against-nasa" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="checked-against-nasa" className="text-base leading-6 font-semibold">
          Checked against NASA
        </h2>
        <p className="text-xs text-muted">
          Recomputed from all <Num>{rows.length}</Num> rows of the raw CSV, whatever the filters
        </p>
      </div>
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="w-1/2 pr-6 pb-2 font-normal">Recomputed from the CSV</th>
            <th className="pb-2 font-normal">NASA’s report</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={index} className="border-t border-line align-top">
              <td className="py-3 pr-6 leading-6">{line.ours}</td>
              <td className="py-3">{line.nasa}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted">NASA doesn’t list which tests it averaged, so we show both.</p>
    </section>
  )
}

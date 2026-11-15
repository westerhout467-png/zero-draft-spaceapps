import { CircleCheck } from 'lucide-react'
import type { O2Forensic } from '../../lib/audit'
import { getClaim } from '../../lib/claims'
import { Cite } from '../Cite'

const fmt = (value: number) => value.toFixed(1)

/** The red underline that ties the blank cell in NASA's row to the term it produced in the sum. */
const BLANK_MARK = 'underline decoration-red decoration-2 underline-offset-[6px]'

/** Appendix A's four O2 columns, in its order (bass2.table.o2-columns). */
const CELL_LABELS = ['Calibrated initial', 'Calibrated final', 'Uncalibrated initial', 'Uncalibrated final'] as const
/** Which printed cell is blank, by index into CELL_LABELS. */
const BLANK_CELL = { 'uncalibrated-initial': 2, 'uncalibrated-final': 3 } as const

type ShowTheMathProps = {
  forensic: O2Forensic
  id?: string
}

/**
 * The forensic line behind an impossible O2 value (docs/fixtures/o2-forensics.json): the sum
 * large in mono, e.g. "19.1 + 20.0 = 39.1", then NASA's Appendix A row as four labelled cells in
 * Source Serif, exactly as printed. The blank cell and the term it produced share a red underline,
 * and their labels say "blank" too, so it never rests on color alone. Every number is worked out in
 * lib/audit.ts from the CSV and the quoted row; nothing is typed in.
 */
export function ShowTheMath({ forensic, id }: ShowTheMathProps) {
  const claim = getClaim(forensic.claimId)
  const blankInitial = forensic.blank === 'uncalibrated-initial'
  const blankFinal = forensic.blank === 'uncalibrated-final'
  const blankCell = forensic.blank === 'none' ? -1 : BLANK_CELL[forensic.blank]
  const term = 'num text-[1.75rem] leading-8'
  return (
    <div id={id} className="flex flex-col gap-4 py-4">
      <div
        role="math"
        aria-label={`${fmt(forensic.uncalibratedFinal ?? 0)} plus ${fmt(forensic.offset)} equals ${fmt(forensic.reproduced)}`}
        className="grid w-fit grid-cols-[repeat(5,auto)] items-baseline gap-x-2 gap-y-1"
      >
        <span className={`${term} text-ink ${blankFinal ? BLANK_MARK : ''}`}>{fmt(forensic.uncalibratedFinal ?? 0)}</span>
        <span className={`${term} text-muted`}>+</span>
        <span className={`${term} text-ink ${blankInitial ? BLANK_MARK : ''}`}>{fmt(forensic.offset)}</span>
        <span className={`${term} text-muted`}>=</span>
        <span className={`${term} text-red`}>{fmt(forensic.reproduced)}</span>
        <span className="max-w-20 text-xs leading-4 text-muted">
          Uncalibrated final{blankFinal && ', blank, read as 0'}
        </span>
        <span />
        <span className="max-w-20 text-xs leading-4 text-muted">
          That day’s offset{blankInitial && ', made from the blank'}
        </span>
        <span />
        <span className="max-w-20 text-xs leading-4 text-muted">Calibrated final in the CSV</span>
      </div>

      <p className="text-xs leading-5 text-muted">
        Offset = calibrated initial <span className="text-ink tabular-nums">{fmt(forensic.calibratedInitial)}</span> −
        uncalibrated initial <span className="text-ink tabular-nums">{fmt(forensic.uncalibratedInitial ?? 0)}</span>
        {blankInitial && ', blank, read as 0'}. NASA calibrated each reading by that day’s offset
        <Cite id="bass2.sensor.mca-offset" />
      </p>

      {claim?.verified && (
        <figure className="flex flex-col gap-2">
          <dl className="grid w-fit grid-cols-[repeat(4,auto)] gap-x-5 gap-y-1">
            {CELL_LABELS.map((label, index) => (
              // Values sit on one line, under labels of one or two lines.
              <div key={label} className="flex flex-col justify-end gap-1">
                <dt className="max-w-20 text-xs leading-4 text-muted">
                  {label}
                  {index === blankCell && ', blank'}
                </dt>
                <dd className={`w-fit font-serif text-lg leading-7 text-ink ${index === blankCell ? BLANK_MARK : ''}`}>
                  {forensic.printed[index]}
                </dd>
              </div>
            ))}
          </dl>
          <figcaption className="text-xs leading-5 text-muted">
            NASA’s Appendix A row for <span className="test-id">{forensic.testId}</span>, as printed. Dashes are a
            blank reading.
            <Cite id={forensic.claimId} />
          </figcaption>
        </figure>
      )}

      {forensic.matches && forensic.appendixMatchesCsv && (
        <p className="flex items-center gap-2 text-xs text-emerald">
          <CircleCheck aria-hidden="true" className="size-3.5" />
          Reproduces the CSV’s value exactly
        </p>
      )}
    </div>
  )
}

import type { ReactNode } from 'react'
import { COLUMNS, SAMPLE_TYPE_LABELS, type Bass2Row } from '../../lib/audit'

type Field = { label: string; column: string; read?: (row: Bass2Row) => ReactNode }

const num = (value: number | null, missing = 'Not a number') =>
  value === null ? <span className="text-muted">{missing}</span> : <span className="num">{value}</span>

const FIELDS: Field[] = [
  { label: 'PI', column: COLUMNS.pi },
  { label: 'Test', column: COLUMNS.test },
  { label: 'Date', column: COLUMNS.date, read: (row) => <span className="num">{row.date}</span> },
  { label: 'GMT day of year', column: COLUMNS.gmt, read: (row) => num(row.gmtDay) },
  { label: 'Sample', column: COLUMNS.sample },
  { label: 'Material', column: COLUMNS.material, read: (row) => SAMPLE_TYPE_LABELS[row.sampleType] },
  { label: 'Flow restrictor', column: COLUMNS.restrictor },
  { label: 'Fan display', column: COLUMNS.fan },
  { label: 'Air display', column: COLUMNS.air },
  { label: 'Radiometer gain', column: COLUMNS.radiometer },
  { label: 'Frames shot', column: COLUMNS.frames },
  { label: 'Initial O2, %', column: COLUMNS.o2Init, read: (row) => num(row.o2InitPct, 'Not recorded') },
  { label: 'Final O2, %', column: COLUMNS.o2Final, read: (row) => num(row.o2FinalPct, 'Not recorded') },
  { label: 'Initial CO2, %', column: COLUMNS.co2Init, read: (row) => num(row.co2InitPct, 'Not recorded') },
  { label: 'Final CO2, %', column: COLUMNS.co2Final, read: (row) => num(row.co2FinalPct, 'Not recorded') },
  { label: 'Initial CO, ppm', column: COLUMNS.coInit, read: (row) => num(row.coInitPpm) },
  { label: 'Final CO, ppm', column: COLUMNS.coFinal, read: (row) => num(row.coFinalPpm) },
]

/** A cell that is only a number or a date ("22.2", ">500", "2/19/2014") reads in mono. */
const NUMERIC_CELL = /^[<>~]?\s*[\d.,/:-]+$/

/** A raw CSV cell as written: the test id in the test-id face, numbers in mono, words in Archivo. */
function RawCell({ column, raw }: { column: string; raw: string }) {
  if (raw.trim() === '') return <span className="text-muted">Empty</span>
  if (column === COLUMNS.test) return <span className="test-id">{raw}</span>
  return <span className={NUMERIC_CELL.test(raw.trim()) ? 'num' : undefined}>{raw}</span>
}

/** Every CSV field of a test, as written and as the audit reads it. */
export function RawFields({ row }: { row: Bass2Row }) {
  return (
    <table className="w-full table-fixed text-sm">
      <thead>
        <tr className="text-left text-xs text-muted">
          <th className="w-32 pb-2 font-normal">Field</th>
          <th className="pb-2 font-normal">Raw CSV cell</th>
          <th className="w-36 pb-2 font-normal">Read as</th>
        </tr>
      </thead>
      <tbody>
        {FIELDS.map((field) => (
          <tr key={field.column} className="border-t border-line align-top">
            <td className="py-1.5 pr-3 text-muted">{field.label}</td>
            <td className="py-1.5 pr-3 break-words whitespace-pre-wrap">
              <RawCell column={field.column} raw={row.raw[field.column] ?? ''} />
            </td>
            <td className="py-1.5">{field.read ? field.read(row) : <span className="text-muted">–</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

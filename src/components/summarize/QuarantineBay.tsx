import { motion, useReducedMotion } from 'motion/react'
import { useId } from 'react'
import { COLUMNS, type Bass2Row, type O2Forensic } from '../../lib/audit'
import { o2FillColor, tileLabel, type BayGroup } from '../../lib/testWall'
import { Switch } from '../Switch'
import { flyIn, landedAt } from './flight'
import { StatusGlyph } from './glyphs'
import { ShowTheMath } from './ShowTheMath'
import { TestTile } from './TestTile'
import { wallHover } from './wallHover'

type QuarantineBayProps = {
  /** Quarantined tests grouped by cause (lib/testWall.ts bayGroups). */
  groups: BayGroup[]
  /** Each test's place in the flight, for the stagger. */
  order: ReadonlyMap<string, number>
  /** What the bay shows: tiles in it, or empty slots. */
  quarantine: boolean
  /** The switch's state. It can lead `quarantine` by a moment while the tiles wait to fly in. */
  switchOn: boolean
  onQuarantine: (on: boolean) => void
  matched: ReadonlySet<string>
  domain: { min: number; max: number }
  forensics: ReadonlyMap<string, O2Forensic>
  mathId: string | null
  onToggleMath: (testId: string) => void
  onOpen: (testId: string) => void
}

/** Why a tile is here, in words, with the number in mono. */
function ReasonChip({ row }: { row: Bass2Row }) {
  const impossible = row.flags.includes('o2-impossible')
  return (
    <span className="flex items-center gap-2 text-xs leading-4 whitespace-nowrap text-ink">
      <StatusGlyph severity="quarantined" />
      {impossible ? (
        <span>
          Final O2 <span className="tabular-nums">{row.raw[COLUMNS.o2Final].trim()}%</span>: impossible
        </span>
      ) : (
        'Final O2 not recorded'
      )}
    </span>
  )
}

type BaySlotProps = Omit<QuarantineBayProps, 'groups' | 'order' | 'switchOn' | 'onQuarantine'> & {
  row: Bass2Row
  flightOrder: number
  mathRegion: string
  reduceMotion: boolean
}

/** One quarantined test's slot: its tile (or an empty slot), reason chip, and "Show the math". */
function BaySlot({ row, flightOrder, mathRegion, reduceMotion, quarantine, matched, domain, forensics, mathId, onToggleMath, onOpen }: BaySlotProps) {
  const forensic = forensics.get(row.testId)
  const mathOpen = quarantine && mathId === row.testId
  return (
    <li className="flex flex-col">
      <div className="flex min-h-10 items-center gap-3">
        {quarantine ? (
          <TestTile
            row={row}
            fill={o2FillColor(row.o2InitPct, domain)}
            dimmed={!matched.has(row.testId)}
            flight={flyIn(flightOrder)}
            layoutKey={quarantine}
            label={tileLabel(row)}
            onClick={() => onOpen(row.testId)}
            onFocus={() => wallHover.set(row.testId)}
            onPointerEnter={() => wallHover.set(row.testId)}
          />
        ) : (
          <div aria-hidden="true" className="size-9 shrink-0 border border-dashed border-line @min-[1300px]/stage:size-10" />
        )}
        <motion.div
          className="flex flex-wrap items-center gap-x-3 gap-y-1"
          initial={false}
          animate={{ opacity: quarantine ? 1 : 0 }}
          transition={{
            duration: reduceMotion ? 0 : 0.2,
            delay: quarantine && !reduceMotion ? landedAt(flightOrder) : 0,
          }}
          aria-hidden={!quarantine}
        >
          <ReasonChip row={row} />
          {forensic && quarantine && (
            <button
              type="button"
              aria-expanded={mathOpen}
              aria-controls={mathRegion}
              onClick={() => onToggleMath(row.testId)}
              className="text-xs whitespace-nowrap text-cyan hover:underline"
            >
              {mathOpen ? 'Hide the math' : 'Show the math'}
            </button>
          )}
        </motion.div>
      </div>
      {mathOpen && forensic && (
        <div className="@min-[1300px]/stage:pl-[3.25rem]">
          <ShowTheMath forensic={forensic} id={mathRegion} />
        </div>
      )}
    </li>
  )
}

/**
 * The quarantine bay (F2): its toggle, and the quarantined tests grouped by cause, each group under
 * a short heading. Turned on, the tiles fly in from the wall one after another, each landing with
 * its reason chip; impossible values get "Show the math". Turned off, they fly back and the slots
 * wait empty.
 */
export function QuarantineBay({ groups, order, switchOn, onQuarantine, ...slot }: QuarantineBayProps) {
  const reduceMotion = useReducedMotion() ?? false
  const headingId = useId()
  const mathIdPrefix = useId()
  const count = groups.reduce((sum, group) => sum + group.rows.length, 0)

  return (
    <section aria-labelledby={headingId} data-lab-target="summarize.bay" className="flex min-h-0 flex-col gap-3">
      <div data-lab-target="summarize.quarantine" className="flex items-center justify-between gap-4">
        <h2 id={headingId} className="text-sm leading-5 font-semibold">
          Quarantine bay
        </h2>
        <Switch label="Quarantine" checked={switchOn} onChange={onQuarantine} />
      </div>
      <p className="max-w-md text-xs leading-5 text-muted">
        Spreadsheet anomalies we flagged: <span className="text-ink tabular-nums">{count}</span> tests whose final O2
        is missing or physically impossible. Every statistic leaves them out, with the toggle on or off.
      </p>

      <div className="-mx-2 flex min-h-0 flex-col gap-3 overflow-y-auto px-2 py-1">
        {groups.map((group) => (
          <section key={group.cause} aria-label={group.label} className="flex flex-col gap-1.5">
            <h3 className="text-xs leading-4 text-muted">{group.label}</h3>
            <ol className="flex flex-col gap-2">
              {group.rows.map((row) => (
                <BaySlot
                  key={row.testId}
                  row={row}
                  flightOrder={order.get(row.testId) ?? 0}
                  mathRegion={`${mathIdPrefix}-${row.testId}`}
                  reduceMotion={reduceMotion}
                  {...slot}
                />
              ))}
            </ol>
          </section>
        ))}
      </div>
    </section>
  )
}

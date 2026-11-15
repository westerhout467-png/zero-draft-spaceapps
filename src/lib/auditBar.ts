// What the F0 audit bar shows: its counters, their definitions, one segment per test, and the
// timing of its one-time intro. Everything is worked out here from audit.json and bass2.json, so
// the components hold no number literals (F0 acceptance). Pure, so it is tested.
import {
  auditGroups,
  CAMPAIGN_YEARS,
  COLUMNS,
  FLAG_LABELS,
  primaryGroup,
  quarantineReason,
  SEVERITY_LABELS,
  severityOf,
  type AuditGroup,
  type AuditSummary,
  type Bass2Row,
  type Severity,
} from './audit'
import { AUDIT_FILTER_LABELS, type SummarizeLink } from './testWall'

export type CounterTone = 'ink' | 'red' | 'amber' | 'dim-amber'

export interface AuditCounter {
  id: 'tests' | 'o2-usable' | AuditGroup
  label: string
  value: number
  /** One line for the hover preview. */
  definition: string
  tone: CounterTone
  link: SummarizeLink
}

const listWords = (items: readonly string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`

/** The six counters, in order. Each opens SUMMARIZE with its filter on and the bay open. */
export function auditCounters(audit: Pick<AuditSummary, 'counts' | 'testIds'>, rows: readonly Bass2Row[]): AuditCounter[] {
  const groups = auditGroups(audit.testIds)
  const byId = new Map(rows.map((row) => [row.testId, row]))
  const impossibleHigh = (audit.testIds['o2-impossible'] ?? [])
    .map((id) => byId.get(id))
    .find((row) => row && row.o2FinalPct !== null && row.o2InitPct !== null && row.o2FinalPct > row.o2InitPct)
  const overRangeCells = [
    ...new Set(groups['co-over-range'].map((id) => byId.get(id)?.raw[COLUMNS.coFinal].trim() ?? '')),
  ].filter(Boolean)
  const years = CAMPAIGN_YEARS.map(String)

  return [
    {
      id: 'tests',
      label: 'Tests',
      value: audit.counts.total,
      definition: 'Rows in NASA’s raw PSI-25 table, one per test',
      tone: 'ink',
      link: { filters: {}, quarantine: true },
    },
    {
      id: 'o2-usable',
      label: 'O2 usable',
      value: audit.counts.o2Usable,
      definition: 'Initial and final O2 both recorded and physically possible',
      tone: 'ink',
      link: { filters: { audit: 'o2-usable' }, quarantine: true },
    },
    {
      id: 'quarantined',
      label: 'Quarantined',
      value: groups.quarantined.length,
      definition: impossibleHigh
        ? `Final O2 missing, or physically impossible such as ${impossibleHigh.raw[COLUMNS.o2Final].trim()}%`
        : 'Final O2 missing, or physically impossible',
      tone: 'red',
      link: { filters: { audit: 'quarantined' }, quarantine: true },
    },
    {
      id: 'co-over-range',
      label: 'CO over range',
      value: groups['co-over-range'].length,
      definition: `Final CO above the sensor’s range: the cell says ${listWords(overRangeCells)}`,
      tone: 'amber',
      link: { filters: { audit: 'co-over-range' }, quarantine: true },
    },
    {
      id: 'sensor-warning',
      label: 'Sensor warnings',
      value: groups['sensor-warning'].length,
      definition: 'Kept, but a reading is inside sensor resolution, below zero, or not recorded',
      tone: 'dim-amber',
      link: { filters: { audit: 'sensor-warning' }, quarantine: true },
    },
    {
      id: 'date-error',
      label: 'Date errors',
      value: groups['date-error'].length,
      definition: `GMT day doesn’t match the date, or a year other than ${listWords(years)}`,
      tone: 'dim-amber',
      link: { filters: { audit: 'date-error' }, quarantine: true },
    },
  ]
}

export interface AuditSegment {
  testId: string
  severity: Severity
  /** "P22b: quarantined, final O2 39.1%: impossible" */
  label: string
  link: SummarizeLink
}

/** One segment per test, in the CSV's row order, colored by its most serious flag. */
export function auditSegments(rows: readonly Bass2Row[]): AuditSegment[] {
  return rows.map((row) => {
    const severity = severityOf(row.flags)
    const group = primaryGroup(row)
    const detail =
      severity === 'quarantined'
        ? quarantineReason(row)
        : severity === 'clean'
          ? null
          : FLAG_LABELS[row.flags.find((flag) => !flag.startsWith('note-')) ?? row.flags[0]]
    const name = group === 'clean' ? SEVERITY_LABELS.clean : AUDIT_FILTER_LABELS[group]
    return {
      testId: row.testId,
      severity,
      label: `${row.testId}: ${name}${detail ? `, ${detail.charAt(0).toLowerCase()}${detail.slice(1)}` : ''}`,
      link: { filters: { audit: group }, quarantine: true, test: row.testId },
    }
  })
}

/** The audit bar's opening words. Kept here so the component holds no digits at all. */
export const AUDIT_BAR_TITLE = 'PSI-25 raw CSV audited'

/** The intro: counters tick from 0 and segments fill left to right, once per session. */
export const AUDIT_INTRO = {
  durationS: 0.9,
  /** A strong ease-out. */
  ease: [0.23, 1, 0.32, 1] as [number, number, number, number],
  sessionKey: 'zero-draft.audit-intro-played',
  from: 0,
}

/** Roving tab stops: the focused segment is in the tab order, the others are not. */
export const ROVING_TAB_INDEX = { active: 0, inactive: -1 }

/** A counter's shown value at intro progress p (0 to 1). */
export function introCount(value: number, progress: number): string {
  return String(Math.round(value * Math.min(1, Math.max(0, progress))))
}

/** The segment bar's clip at intro progress p: hidden from the right, revealed left to right. */
export function introClip(progress: number): string {
  const hidden = (1 - Math.min(1, Math.max(0, progress))) * 100
  return `inset(0 ${hidden}% 0 0)`
}

/** The intro's progress when it doesn't play (reduced motion, or already played this session). */
export const INTRO_DONE = 1

/** The segment index an arrow key moves to, or null. */
export function stepSegment(index: number, key: string, count: number): number | null {
  if (key === 'ArrowRight') return index < count - 1 ? index + 1 : null
  if (key === 'ArrowLeft') return index > 0 ? index - 1 : null
  if (key === 'Home') return count > 0 ? 0 : null
  if (key === 'End') return count > 0 ? count - 1 : null
  return null
}

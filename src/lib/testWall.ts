// The SUMMARIZE test wall (F2): how tiles are ordered, filtered, colored and stepped through by
// keyboard, and how a deep link's parameters map to filters. Pure, so it is tested.
import {
  BURN_STATUS_LABELS,
  burnStatus,
  FLOW_CONFIGS,
  isQuarantined,
  primaryGroup,
  QUARANTINE_CAUSE_LABELS,
  QUARANTINE_CAUSES,
  quarantineCause,
  rowInGroup,
  sampleFamily,
  SAMPLE_FAMILY_LABELS,
  SAMPLE_TYPE_LABELS,
  SEVERITY_LABELS,
  severityOf,
  type AuditGroup,
  type Bass2Row,
  type FlowConfig,
  type O2Forensic,
  type QuarantineCause,
  type SampleFamily,
  type SampleType,
} from './audit'
import type { Outcome } from './generatedData'
import type { RouteParams } from './route'

/** Tiles across in each PI's block of the wall. */
export const TILES_PER_ROW = 3

export interface WallColumn {
  pi: string
  rows: Bass2Row[]
}

/**
 * Groups tests into one column per PI, in the CSV's PI order, each ordered by its Date cell as
 * written (then by CSV row). The 2018 date errors therefore sort last: shown, never fixed.
 */
export function wallColumns(rows: readonly Bass2Row[]): WallColumn[] {
  const byPi = new Map<string, Bass2Row[]>()
  for (const row of rows) {
    const list = byPi.get(row.pi)
    if (list) list.push(row)
    else byPi.set(row.pi, [row])
  }
  return [...byPi].map(([pi, list]) => ({
    pi,
    rows: [...list].sort((a, b) => a.date.localeCompare(b.date) || a.rowIndex - b.rowIndex),
  }))
}

// ---------------------------------------------------------------------------------------------
// Filters

export type AuditFilter = AuditGroup | 'o2-usable' | 'clean'
export type FlowFilter = FlowConfig | 'not-stated'
export type BurnFilter = 'confirmed' | 'not-confirmed'
/** What NASA's notes say the flame did, as the AI read them (SPEC F2b). */
export type OutcomeFilter = Outcome
export const OUTCOME_FILTERS: readonly OutcomeFilter[] = ['sustained', 'brief', 'no-ignition', 'not-stated']
export type SampleFilter = SampleType | `family:${SampleFamily}`

export interface TestFilters {
  pi: string | null
  sample: SampleFilter | null
  flow: FlowFilter | null
  /** Initial O2 range, % (inclusive). */
  o2: { min: number; max: number } | null
  burn: BurnFilter | null
  /** Needs the AI-read outcomes; ignored while they aren't loaded. */
  outcome: OutcomeFilter | null
  /** Set from the audit bar. */
  audit: AuditFilter | null
}

export const NO_FILTERS: TestFilters = { pi: null, sample: null, flow: null, o2: null, burn: null, outcome: null, audit: null }

export const AUDIT_FILTER_LABELS: Record<AuditFilter, string> = {
  quarantined: 'Quarantined',
  'co-over-range': 'CO over range',
  'sensor-warning': 'Sensor warnings',
  'date-error': 'Date errors',
  'o2-usable': 'O2 usable',
  clean: 'No flags',
}

export const FLOW_FILTER_LABELS: Record<FlowFilter, string> = {
  Opposed: 'Opposed',
  Concurrent: 'Concurrent',
  Stagnation: 'Stagnation',
  'not-stated': 'Not stated',
}

export function sampleFilterLabel(filter: SampleFilter): string {
  return filter.startsWith('family:')
    ? `All ${SAMPLE_FAMILY_LABELS[filter.slice('family:'.length) as SampleFamily]}`
    : SAMPLE_TYPE_LABELS[filter as SampleType]
}

export function matchesAudit(row: Bass2Row, audit: AuditFilter): boolean {
  if (audit === 'o2-usable') return row.o2Usable
  if (audit === 'clean') return primaryGroup(row) === 'clean'
  return rowInGroup(row, audit)
}

/**
 * Whether a test passes the filters. `outcomes` is each test's AI-read outcome; without it (the
 * file isn't generated, or hasn't loaded) the outcome filter is left out, not failed.
 */
export function matchesFilters(row: Bass2Row, filters: TestFilters, outcomes?: ReadonlyMap<string, Outcome>): boolean {
  if (filters.pi !== null && row.pi !== filters.pi) return false
  if (filters.sample !== null) {
    const ok = filters.sample.startsWith('family:')
      ? `family:${sampleFamily(row.sampleType)}` === filters.sample
      : row.sampleType === filters.sample
    if (!ok) return false
  }
  if (filters.flow !== null) {
    const flow = row.flowConfig ?? 'not-stated'
    if (flow !== filters.flow) return false
  }
  if (filters.o2 !== null) {
    if (row.o2InitPct === null || row.o2InitPct < filters.o2.min || row.o2InitPct > filters.o2.max) return false
  }
  if (filters.burn === 'confirmed' && !row.burnConfirmed) return false
  if (filters.burn === 'not-confirmed' && row.burnConfirmed) return false
  if (filters.outcome !== null && outcomes && (outcomes.get(row.testId) ?? 'not-stated') !== filters.outcome) return false
  if (filters.audit !== null && !matchesAudit(row, filters.audit)) return false
  return true
}

export function hasFilters(filters: TestFilters): boolean {
  return Object.values(filters).some((value) => value !== null)
}

// ---------------------------------------------------------------------------------------------
// Tile fill: initial O2 on a sequential cyan scale

/** The lowest and highest initial O2 in the data, %. */
export function o2Domain(rows: readonly Bass2Row[]): { min: number; max: number } {
  const values = rows.flatMap((row) => (row.o2InitPct === null ? [] : [row.o2InitPct]))
  return { min: Math.min(...values), max: Math.max(...values) }
}

/**
 * How much cyan is mixed into black (in OKLab) for a tile: from 40% at the lowest initial O2, so
 * the 13.6% tiles stay clearly visible on the black stage, to 66% at the highest. Above 66% the
 * ink-colored test id would drop under 4.5:1 contrast.
 */
export const FILL_MIX_PCT = { min: 40, max: 66 }

export function o2FillMixPct(o2: number | null, domain: { min: number; max: number }): number | null {
  if (o2 === null) return null
  const span = domain.max - domain.min
  const t = span > 0 ? Math.min(1, Math.max(0, (o2 - domain.min) / span)) : 1
  return Math.round(FILL_MIX_PCT.min + t * (FILL_MIX_PCT.max - FILL_MIX_PCT.min))
}

export function o2FillColor(o2: number | null, domain: { min: number; max: number }): string {
  const mix = o2FillMixPct(o2, domain)
  return mix === null ? 'var(--color-line)' : `color-mix(in oklab, var(--color-cyan) ${mix}%, var(--color-window))`
}

// ---------------------------------------------------------------------------------------------
// Keyboard: arrow keys step through the wall's tiles

/**
 * The next tile for an arrow key. `columns` lists each PI block's tile ids in wall order, with
 * null for an empty slot (a quarantined tile that flew to the bay). Left and right step through
 * the whole wall in reading order; up and down move a row within the block; Home and End jump to
 * the ends. Empty slots are skipped. Returns null for other keys or when there is nowhere to go.
 */
export function moveInWall(columns: readonly (readonly (string | null)[])[], current: string, key: string): string | null {
  const flat = columns.flat().filter((id): id is string => id !== null)
  if (key === 'Home') return flat[0] ?? null
  if (key === 'End') return flat.at(-1) ?? null
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const index = flat.indexOf(current)
    const next = flat[index + (key === 'ArrowRight' ? 1 : -1)]
    return index === -1 || next === undefined ? null : next
  }
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const step = key === 'ArrowDown' ? TILES_PER_ROW : -TILES_PER_ROW
    for (const column of columns) {
      let index = column.indexOf(current)
      if (index === -1) continue
      for (index += step; index >= 0 && index < column.length; index += step) {
        const id = column[index]
        if (id !== null) return id
      }
      return null
    }
  }
  return null
}

// ---------------------------------------------------------------------------------------------
// Deep links: #/summarize?audit=quarantined&quarantine=on&test=P22b

export interface SummarizeLink {
  /** Replace all filters with these (unset ones cleared). Undefined leaves the filters alone. */
  filters?: Partial<TestFilters>
  quarantine?: boolean
  /** Show this test: in the bay with its math open if quarantined, else in the record drawer. */
  test?: string
}

const AUDIT_FILTERS = Object.keys(AUDIT_FILTER_LABELS) as AuditFilter[]
const FLOW_FILTERS = [...FLOW_CONFIGS, 'not-stated'] as FlowFilter[]

export function linkFromParams(params: RouteParams): SummarizeLink {
  const link: SummarizeLink = {}
  const filters: Partial<TestFilters> = {}
  if (params.audit && (AUDIT_FILTERS as string[]).includes(params.audit)) filters.audit = params.audit as AuditFilter
  if (params.pi) filters.pi = params.pi
  if (params.flow && (FLOW_FILTERS as string[]).includes(params.flow)) filters.flow = params.flow as FlowFilter
  if (params.sample) {
    const family = params.sample.startsWith('family:') && params.sample.slice('family:'.length) in SAMPLE_FAMILY_LABELS
    if (family || params.sample in SAMPLE_TYPE_LABELS) filters.sample = params.sample as SampleFilter
  }
  if (params.burn === 'confirmed' || params.burn === 'not-confirmed') filters.burn = params.burn
  if (params.outcome && (OUTCOME_FILTERS as readonly string[]).includes(params.outcome)) filters.outcome = params.outcome as OutcomeFilter
  if (Object.keys(filters).length > 0) link.filters = filters
  if (params.quarantine === 'on') link.quarantine = true
  if (params.quarantine === 'off') link.quarantine = false
  if (params.test) link.test = params.test
  return link
}

export function paramsFromLink(link: SummarizeLink): RouteParams {
  const params: RouteParams = {}
  const f = link.filters ?? {}
  if (f.audit) params.audit = f.audit
  if (f.pi) params.pi = f.pi
  if (f.flow) params.flow = f.flow
  if (f.sample) params.sample = f.sample
  if (f.burn) params.burn = f.burn
  if (f.outcome) params.outcome = f.outcome
  if (link.quarantine !== undefined) params.quarantine = link.quarantine ? 'on' : 'off'
  if (link.test) params.test = link.test
  return params
}

/** What a screen reader says for a tile: everything its fill and corner marks show. */
export function tileLabel(row: Bass2Row): string {
  const o2 = row.o2InitPct === null ? 'initial O2 not recorded' : `initial O2 ${row.o2InitPct}%`
  const flow = row.flowConfig ? `${row.flowConfig.toLowerCase()} flow` : 'flow not stated'
  return [
    `Test ${row.testId}`,
    row.pi,
    SAMPLE_TYPE_LABELS[row.sampleType],
    o2,
    flow,
    SEVERITY_LABELS[severityOf(row.flags)].toLowerCase(),
    BURN_STATUS_LABELS[burnStatus(row)].toLowerCase(),
  ].join(', ')
}

/** The quarantined tests in the wall's reading order. */
export function bayRows(columns: readonly WallColumn[]): Bass2Row[] {
  return columns.flatMap((column) => column.rows).filter((row) => isQuarantined(row))
}

export interface BayGroup {
  cause: QuarantineCause
  label: string
  rows: Bass2Row[]
}

/**
 * The quarantine bay, grouped by cause (lib/audit.ts quarantineCause), in QUARANTINE_CAUSES order;
 * within a group, the wall's reading order. Empty groups are left out.
 */
export function bayGroups(
  columns: readonly WallColumn[],
  forensicOf: (testId: string) => O2Forensic | undefined,
): BayGroup[] {
  const rows = bayRows(columns)
  return QUARANTINE_CAUSES.map((cause) => ({
    cause,
    label: QUARANTINE_CAUSE_LABELS[cause],
    rows: rows.filter((row) => quarantineCause(row, forensicOf(row.testId)) === cause),
  })).filter((group) => group.rows.length > 0)
}

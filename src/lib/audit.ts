// BASS-II spreadsheet checks (SPEC F0, F2 and §6). Pure functions over NASA's raw PSI-25 CSV:
// parse each row, keep every raw cell, flag what doesn't add up, and summarize.
// The rules are written out in docs/fixtures/audit-expected.json; audit.test.ts reproduces it.
// pipeline/scripts/compile-bass2.ts runs this and writes public/data/bass2.json and audit.json.
import { readCsvTable } from './csv'
import { median } from './stats'

// ---------------------------------------------------------------------------------------------
// Data shapes (SPEC §6)

export type Flag =
  | 'o2-missing'
  | 'o2-impossible'
  | 'o2-rise-within-resolution'
  | 'co-over-range'
  | 'co-initial-over-range'
  | 'co-missing'
  | 'co-negative'
  | 'co2-missing'
  | 'co2-initial-zero'
  | 'date-gmt-mismatch'
  | 'date-year-2018'
  | 'note-no-ignition'
  | 'note-would-not-stay-lit'

/** Every flag, in the order a row lists them. */
export const FLAGS: readonly Flag[] = [
  'o2-missing',
  'o2-impossible',
  'o2-rise-within-resolution',
  'co-over-range',
  'co-initial-over-range',
  'co-missing',
  'co-negative',
  'co2-missing',
  'co2-initial-zero',
  'date-gmt-mismatch',
  'date-year-2018',
  'note-no-ignition',
  'note-would-not-stay-lit',
]

export type SampleType =
  | 'pmma-rod-6.35'
  | 'pmma-rod-9.525'
  | 'pmma-rod-12.7'
  | 'pmma-slab-1'
  | 'pmma-slab-2'
  | 'pmma-slab-3'
  | 'pmma-slab-4'
  | 'pmma-slab-5'
  | 'pmma-film-0.1'
  | 'pmma-film-0.2'
  | 'pmma-film-0.3'
  | 'pmma-film-0.4'
  | 'pmma-sphere'
  | 'sibal-1cm'
  | 'sibal-2cm'
  | 'nomex'
  | 'wax-candle'

/** Plain-words names, the same as docs/fixtures/risk-components.json uses. */
export const SAMPLE_TYPE_LABELS: Record<SampleType, string> = {
  'pmma-rod-6.35': 'PMMA rod, 6.35 mm',
  'pmma-rod-9.525': 'PMMA rod, 9.525 mm',
  'pmma-rod-12.7': 'PMMA rod, 12.7 mm',
  'pmma-slab-1': 'PMMA slab, 1 mm',
  'pmma-slab-2': 'PMMA slab, 2 mm',
  'pmma-slab-3': 'PMMA slab, 3 mm',
  'pmma-slab-4': 'PMMA slab, 4 mm',
  'pmma-slab-5': 'PMMA slab, 5 mm',
  'pmma-film-0.1': 'PMMA thin film, 0.1 mm',
  'pmma-film-0.2': 'PMMA thin film, 0.2 mm',
  'pmma-film-0.3': 'PMMA thin film, 0.3 mm',
  'pmma-film-0.4': 'PMMA thin film, 0.4 mm',
  'pmma-sphere': 'PMMA sphere section, 4 cm',
  'sibal-1cm': 'SIBAL fabric, 1 cm wide',
  'sibal-2cm': 'SIBAL fabric, 2 cm wide',
  nomex: 'Nomex III fabric',
  'wax-candle': 'Japan wax candle',
}

export const SAMPLE_TYPES = Object.keys(SAMPLE_TYPE_LABELS) as SampleType[]

export type SampleFamily = 'rod' | 'slab' | 'film' | 'sphere' | 'sibal' | 'nomex' | 'wax'

export const SAMPLE_FAMILY_LABELS: Record<SampleFamily, string> = {
  rod: 'PMMA rods',
  slab: 'PMMA slabs',
  film: 'PMMA thin films',
  sphere: 'PMMA sphere sections',
  sibal: 'SIBAL fabric',
  nomex: 'Nomex fabric',
  wax: 'Wax candle',
}

export function sampleFamily(type: SampleType): SampleFamily {
  if (type.startsWith('pmma-rod')) return 'rod'
  if (type.startsWith('pmma-slab')) return 'slab'
  if (type.startsWith('pmma-film')) return 'film'
  if (type === 'pmma-sphere') return 'sphere'
  if (type.startsWith('sibal')) return 'sibal'
  if (type === 'nomex') return 'nomex'
  return 'wax'
}

export type FlowConfig = 'Opposed' | 'Concurrent' | 'Stagnation'
export const FLOW_CONFIGS: readonly FlowConfig[] = ['Opposed', 'Concurrent', 'Stagnation']

export interface Bass2Row {
  rowIndex: number
  pi: string
  testId: string
  sampleId: string
  /** The Date cell as written, read as month/day/year and given as YYYY-MM-DD. Never corrected. */
  date: string
  gmtDay: number | null
  /** Verbatim, typos kept ("1/4 blac rod", "2 cm 2ide"). */
  material: string
  sampleType: SampleType
  /** From Appendix A (docs/fixtures/flow-by-test.json), not the CSV. */
  flowConfig: FlowConfig | null
  /** Sequences of settings, never parsed to one number. */
  fanDisplayRaw: string
  airDisplayRaw: string
  o2InitPct: number | null
  o2FinalPct: number | null
  o2Usable: boolean
  co2InitPct: number | null
  co2FinalPct: number | null
  dCo2Pct: number | null
  coInitPpm: number | null
  coFinalPpm: number | null
  /** o2Usable && dCo2Pct >= 0.2 */
  burnConfirmed: boolean
  /** ΔCO ppm / ΔCO2 % when burnConfirmed and both CO cells are numbers. */
  coPerCo2: number | null
  flags: Flag[]
  /** Verbatim CSV cells, keyed by trimmed header. */
  raw: Record<string, string>
}

export interface AuditSummary {
  generatedBy: string
  generatedAt: string
  counts: Record<'total' | 'o2Usable' | 'burnConfirmed' | Flag, number>
  byPi: Record<string, number>
  testIds: Partial<Record<Flag, string[]>>
}

/** One test's flow direction as Appendix A gives it (docs/fixtures/flow-by-test.json). */
export interface FlowEvidence {
  flow: FlowConfig | null
  /** The Appendix A row text, or null when the test isn't in the appendix. */
  quote: string | null
  pdfPage: number | null
  reportPage: number | null
  note?: string
}
export type FlowByTest = Record<string, FlowEvidence>

/** FlowEvidence after compile-bass2 looked for the quote on its PDF page. */
export interface CheckedFlowEvidence extends FlowEvidence {
  /** True when the quote was found on its stated PDF page after normalize(). */
  quoteChecked: boolean
}

/**
 * public/data/bass2.json. The rows are SPEC §6 Bass2Row. Alongside them, each test's Appendix A
 * flow evidence for the record drawer, and the metadata every generated file carries
 * (CLAUDE.md rule 11; no LLM is involved, so model and promptVersion are null).
 */
export interface Bass2File {
  generatedBy: string
  generatedAt: string
  model: null
  promptVersion: null
  source: string
  rows: Bass2Row[]
  flowEvidence: Record<string, CheckedFlowEvidence>
}

/** public/data/audit.json: the SPEC §6 AuditSummary plus the same metadata. */
export interface AuditFile extends AuditSummary {
  model: null
  promptVersion: null
  source: string
  /** The lowest final O2 among burn-confirmed tests, for the SUMMARIZE headline. */
  lowestBurningO2: { value: number; testId: string } | null
}

// ---------------------------------------------------------------------------------------------
// The CSV's columns, after trimming (SPEC §6). "Calibrated  initial O2" has two spaces.

export const COLUMNS = {
  pi: 'PI',
  test: 'Test #',
  date: 'Date',
  gmt: 'GMT',
  sample: 'Sample #',
  material: 'Fuel Sample Material',
  restrictor: 'Flow restrictor',
  fan: 'Fan display',
  air: 'Air display',
  radiometer: 'Radiometer gain   (1000   250   50   10)',
  frames: 'Total Frames Shot',
  o2Init: 'Calibrated  initial O2 % by vol',
  o2Final: 'Calibrated final O2 % by vol',
  co2Init: 'Initial CO2 % by vol',
  co2Final: 'Final CO2 % by vol',
  coInit: 'Initial CO (ppm)',
  coFinal: 'Final CO (ppm)',
} as const

export const COLUMN_ORDER: readonly string[] = Object.values(COLUMNS)

// ---------------------------------------------------------------------------------------------
// Rule thresholds, each tied to a cited sensor resolution (claims.test.ts-style checks in
// audit.test.ts keep them equal to the claims).

/** O2 sensor resolution, ±0.1 % O2 (bass2.sensor.o2-res). */
export const O2_RESOLUTION_PCT = 0.1
/** CO2 sensor resolution, 0.1 % CO2 (bass2.sensor.co2-res). */
export const CO2_RESOLUTION_PCT = 0.1
/** A rise of final over initial O2 up to this much is inside two ±0.1 readings. */
export const O2_RISE_TOLERANCE_PCT = 2 * O2_RESOLUTION_PCT
/** Burn confirmed by sensors: CO2 rose by at least twice the CO2 resolution. */
export const BURN_CO2_RISE_PCT = 2 * CO2_RESOLUTION_PCT
/**
 * A drop larger than this is impossible for these tests. Our audit rule, with room to spare:
 * the largest real drop in BASS-II was 3.2 points (Test M5, bass2.m5.row).
 */
export const IMPOSSIBLE_O2_DROP_PCT = 5
/** BASS-II ran in 2014 and 2016; any other year in the Date column is an error. */
export const CAMPAIGN_YEARS: readonly number[] = [2014, 2016]

// ---------------------------------------------------------------------------------------------
// Cell readers. Whole cells only: "OR" is over range, "FOR" or "OR?" is not.

/** True for an empty cell or one that says "none". */
export function isMissingCell(cell: string): boolean {
  const text = cell.trim().toLowerCase()
  return text === '' || text === 'none'
}

/** True for a CO cell that says the sensor was over its range: "OR", "over", or ">…". */
export function isOverRangeCell(cell: string): boolean {
  const text = cell.trim().toLowerCase()
  return text === 'or' || text === 'over' || text.startsWith('>')
}

const NUMBER_CELL = /^[-+]?(?:\d+\.?\d*|\.\d+)$/

/** A cell that is a plain number, else null ("none", "OR", ">500", "" are all null). */
export function numberCell(cell: string): number | null {
  const text = cell.trim()
  return NUMBER_CELL.test(text) ? Number(text) : null
}

/** Rounds away floating-point noise: differences of 1- or 2-decimal readings. */
export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round((value + Math.sign(value) * Number.EPSILON) * factor) / factor
}

/** "2/19/2014" → { year, month, day }, or null. */
export function parseUsDate(cell: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(cell.trim())
  if (!match) return null
  return { month: Number(match[1]), day: Number(match[2]), year: Number(match[3]) }
}

export function dayOfYear(year: number, month: number, day: number): number {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / msPerDay)
}

const pad = (n: number) => String(n).padStart(2, '0')

// ---------------------------------------------------------------------------------------------
// Sample types

const ROD_DIAMETERS_MM: Record<string, SampleType> = {
  '6.35': 'pmma-rod-6.35',
  '9.525': 'pmma-rod-9.525',
  '12.7': 'pmma-rod-12.7',
}
const MM_PER_INCH = 25.4

/** Reads the CSV's free-text material ("1/4\" clear rod", "2 cm wide   5 mm thick 1 sided PMMA"). */
export function parseSampleType(material: string): SampleType {
  const text = material.toLowerCase()
  if (text.includes('sibal')) {
    const width = /(\d)\s*cm/.exec(text)?.[1]
    if (width === '1') return 'sibal-1cm'
    if (width === '2') return 'sibal-2cm'
  } else if (text.includes('nomex')) {
    return 'nomex'
  } else if (text.includes('wax')) {
    return 'wax-candle'
  } else if (text.includes('spherical')) {
    return 'pmma-sphere'
  } else if (text.includes('rod')) {
    const fraction = /(\d+)\/(\d+)/.exec(text)
    const decimal = /(\d*\.\d+)\s*"/.exec(text)
    const inches = fraction ? Number(fraction[1]) / Number(fraction[2]) : decimal ? Number(decimal[1]) : NaN
    const type = ROD_DIAMETERS_MM[String(roundTo(inches * MM_PER_INCH, 3))]
    if (type) return type
  } else {
    const microns = /(\d+)\s*micron/.exec(text)
    const filmMm = text.includes('film') ? /(\d*\.\d+)\s*mm/.exec(text) : null
    const thicknessMm = microns ? Number(microns[1]) / 1000 : filmMm ? Number(filmMm[1]) : null
    if (thicknessMm !== null) {
      const type = `pmma-film-${thicknessMm}`
      if (type in SAMPLE_TYPE_LABELS) return type as SampleType
    }
    const slabMm = /(\d+)\s*mm/.exec(text)
    if (slabMm && text.includes('pmma')) {
      const type = `pmma-slab-${slabMm[1]}`
      if (type in SAMPLE_TYPE_LABELS) return type as SampleType
    }
  }
  throw new Error(`Can't read a sample type from the material "${material}"`)
}

// ---------------------------------------------------------------------------------------------
// One row

/** Builds a parsed, flagged row from a CSV record. rowIndex is the 1-based data row. */
export function auditRow(record: Record<string, string>, rowIndex: number, flowByTest: FlowByTest): Bass2Row {
  const cell = (column: string) => record[column] ?? ''
  const testId = cell(COLUMNS.test).trim()
  const flow = flowByTest[testId]
  if (!flow) throw new Error(`Test ${testId} has no entry in flow-by-test.json`)

  const o2Init = numberCell(cell(COLUMNS.o2Init))
  const o2Final = numberCell(cell(COLUMNS.o2Final))
  const co2Init = numberCell(cell(COLUMNS.co2Init))
  const co2Final = numberCell(cell(COLUMNS.co2Final))
  const coInit = numberCell(cell(COLUMNS.coInit))
  const coFinal = numberCell(cell(COLUMNS.coFinal))
  const date = parseUsDate(cell(COLUMNS.date))
  const gmtDay = numberCell(cell(COLUMNS.gmt))

  const flags = new Set<Flag>()

  if (isMissingCell(cell(COLUMNS.o2Final))) flags.add('o2-missing')
  const dO2Rise = o2Init !== null && o2Final !== null ? roundTo(o2Final - o2Init, 2) : null
  if (dO2Rise !== null) {
    if (dO2Rise > O2_RISE_TOLERANCE_PCT || -dO2Rise > IMPOSSIBLE_O2_DROP_PCT) flags.add('o2-impossible')
    else if (dO2Rise > 0) flags.add('o2-rise-within-resolution')
  }

  if (isOverRangeCell(cell(COLUMNS.coFinal))) flags.add('co-over-range')
  if (isOverRangeCell(cell(COLUMNS.coInit))) flags.add('co-initial-over-range')
  if (isMissingCell(cell(COLUMNS.coFinal))) flags.add('co-missing')
  if (coInit !== null && coInit < 0) flags.add('co-negative')

  if (isMissingCell(cell(COLUMNS.co2Init)) || isMissingCell(cell(COLUMNS.co2Final))) flags.add('co2-missing')
  if (co2Init === 0) flags.add('co2-initial-zero')

  if (date && gmtDay !== null && dayOfYear(date.year, date.month, date.day) !== gmtDay) {
    flags.add('date-gmt-mismatch')
  }
  if (date && !CAMPAIGN_YEARS.includes(date.year)) flags.add('date-year-2018')

  const notes = `${cell(COLUMNS.fan)} ${cell(COLUMNS.air)}`.toLowerCase()
  if (notes.includes('no ign')) flags.add('note-no-ignition')
  if (notes.includes('would not stay lit')) flags.add('note-would-not-stay-lit')

  const o2Usable =
    o2Init !== null && o2Final !== null && !flags.has('o2-missing') && !flags.has('o2-impossible')
  const dCo2Pct = co2Init !== null && co2Final !== null ? roundTo(co2Final - co2Init, 2) : null
  const burnConfirmed = o2Usable && dCo2Pct !== null && dCo2Pct >= BURN_CO2_RISE_PCT
  const coPerCo2 =
    burnConfirmed && coInit !== null && coFinal !== null && dCo2Pct !== null
      ? (coFinal - coInit) / dCo2Pct
      : null

  return {
    rowIndex,
    pi: cell(COLUMNS.pi).trim(),
    testId,
    sampleId: cell(COLUMNS.sample).trim(),
    date: date ? `${date.year}-${pad(date.month)}-${pad(date.day)}` : cell(COLUMNS.date).trim(),
    gmtDay,
    material: cell(COLUMNS.material),
    sampleType: parseSampleType(cell(COLUMNS.material)),
    flowConfig: flow.flow,
    fanDisplayRaw: cell(COLUMNS.fan),
    airDisplayRaw: cell(COLUMNS.air),
    o2InitPct: o2Init,
    o2FinalPct: o2Final,
    o2Usable,
    co2InitPct: co2Init,
    co2FinalPct: co2Final,
    dCo2Pct,
    coInitPpm: coInit,
    coFinalPpm: coFinal,
    burnConfirmed,
    coPerCo2,
    flags: FLAGS.filter((flag) => flags.has(flag)),
    raw: { ...record },
  }
}

/** Parses the whole CSV text into audited rows. Fails if the columns are not the expected 17. */
export function compileBass2(csvText: string, flowByTest: FlowByTest): Bass2Row[] {
  const { headers, records } = readCsvTable(csvText)
  if (headers.join('|') !== COLUMN_ORDER.join('|')) {
    throw new Error(`Unexpected CSV columns:\n${headers.join(' | ')}`)
  }
  return records.map((record, index) => auditRow(record, index + 1, flowByTest))
}

/** Counts and test ids per flag. Test ids keep the CSV's row order. */
export function summarizeAudit(
  rows: readonly Bass2Row[],
  meta: { generatedBy: string; generatedAt: string },
): AuditSummary {
  const counts = { total: rows.length, o2Usable: 0, burnConfirmed: 0 } as AuditSummary['counts']
  for (const flag of FLAGS) counts[flag] = 0
  const byPi: Record<string, number> = {}
  const testIds: AuditSummary['testIds'] = {}
  for (const row of rows) {
    if (row.o2Usable) counts.o2Usable++
    if (row.burnConfirmed) counts.burnConfirmed++
    byPi[row.pi] = (byPi[row.pi] ?? 0) + 1
    for (const flag of row.flags) {
      counts[flag]++
      ;(testIds[flag] ??= []).push(row.testId)
    }
  }
  return { ...meta, counts, byPi, testIds }
}

// ---------------------------------------------------------------------------------------------
// Groups and severity, for the audit bar (F0) and the test wall (F2)

export type AuditGroup = 'quarantined' | 'co-over-range' | 'sensor-warning' | 'date-error'
export const AUDIT_GROUPS: readonly AuditGroup[] = ['quarantined', 'co-over-range', 'sensor-warning', 'date-error']

/** The flags behind each group. A test belongs to the first group it qualifies for, except dates. */
export const GROUP_FLAGS: Record<AuditGroup, readonly Flag[]> = {
  quarantined: ['o2-missing', 'o2-impossible'],
  'co-over-range': ['co-over-range', 'co-initial-over-range'],
  'sensor-warning': ['o2-rise-within-resolution', 'co-missing', 'co-negative', 'co2-missing', 'co2-initial-zero'],
  'date-error': ['date-gmt-mismatch', 'date-year-2018'],
}

/**
 * The test ids in each group, from the summary's flag lists:
 * - quarantined: final O2 missing or impossible (taken out of every statistic)
 * - co-over-range: CO over the sensor's range, not quarantined
 * - sensor-warning: any other sensor flag, neither quarantined nor CO over range
 * - date-error: a date flag (any test)
 */
export function auditGroups(testIds: AuditSummary['testIds']): Record<AuditGroup, string[]> {
  const union = (flags: readonly Flag[]) => [...new Set(flags.flatMap((flag) => testIds[flag] ?? []))]
  const quarantined = union(GROUP_FLAGS.quarantined)
  const coOverRange = union(GROUP_FLAGS['co-over-range']).filter((id) => !quarantined.includes(id))
  const sensorWarning = union(GROUP_FLAGS['sensor-warning']).filter(
    (id) => !quarantined.includes(id) && !coOverRange.includes(id),
  )
  return {
    quarantined,
    'co-over-range': coOverRange,
    'sensor-warning': sensorWarning,
    'date-error': union(GROUP_FLAGS['date-error']),
  }
}

export type Severity = 'quarantined' | 'co-over-range' | 'warning' | 'clean'

/** A test's most serious flag. NASA's own notes (note-…) are information, not a data problem. */
export function severityOf(flags: readonly Flag[]): Severity {
  const has = (group: AuditGroup) => GROUP_FLAGS[group].some((flag) => flags.includes(flag))
  if (has('quarantined')) return 'quarantined'
  if (has('co-over-range')) return 'co-over-range'
  if (has('sensor-warning') || has('date-error')) return 'warning'
  return 'clean'
}

export const SEVERITY_LABELS: Record<Severity, string> = {
  quarantined: 'Quarantined',
  'co-over-range': 'CO over range',
  warning: 'Sensor warning or date error',
  clean: 'No flags',
}

export type BurnStatus = 'confirmed' | 'too-small' | 'not-confirmed' | 'not-checked'

/**
 * What the sensors say about burning. SIBAL fabric never moved them past their resolution
 * (largest CO2 rise 0.07%), so those tests read "Fire too small for the sensors", never
 * "didn't burn" (SPEC F2).
 */
export function burnStatus(row: Bass2Row): BurnStatus {
  if (!row.o2Usable || row.dCo2Pct === null) return 'not-checked'
  if (row.burnConfirmed) return 'confirmed'
  return sampleFamily(row.sampleType) === 'sibal' ? 'too-small' : 'not-confirmed'
}

export const BURN_STATUS_LABELS: Record<BurnStatus, string> = {
  confirmed: 'Burn confirmed by sensors',
  'too-small': 'Fire too small for the sensors',
  'not-confirmed': 'Burn not confirmed by sensors',
  'not-checked': 'Burn not checked: a reading is unusable',
}

/**
 * The numbers in the SUMMARIZE headline, from audit.json alone: how many rows are set aside and
 * why (impossible O2, or none), and the lowest O2 a confirmed flame burned down to.
 */
export function auditHeadline(audit: Pick<AuditFile, 'counts' | 'lowestBurningO2'>) {
  const o2Impossible = audit.counts['o2-impossible']
  const o2Missing = audit.counts['o2-missing']
  return {
    setAside: o2Impossible + o2Missing,
    o2Impossible,
    o2Missing,
    total: audit.counts.total,
    lowestBurning: audit.lowestBurningO2,
  }
}

export function isQuarantined(row: Pick<Bass2Row, 'flags'>): boolean {
  return severityOf(row.flags) === 'quarantined'
}

/** Whether one row is in a group, by the same rules as auditGroups(). */
export function rowInGroup(row: Pick<Bass2Row, 'flags'>, group: AuditGroup): boolean {
  const has = (g: AuditGroup) => GROUP_FLAGS[g].some((flag) => row.flags.includes(flag))
  if (group === 'quarantined' || group === 'date-error') return has(group)
  if (group === 'co-over-range') return has(group) && !has('quarantined')
  return has('sensor-warning') && !has('quarantined') && !has('co-over-range')
}

/** The group a row's severity points to (a date-only warning is a date error). */
export function primaryGroup(row: Pick<Bass2Row, 'flags'>): AuditGroup | 'clean' {
  for (const group of ['quarantined', 'co-over-range', 'sensor-warning', 'date-error'] as const) {
    if (rowInGroup(row, group)) return group
  }
  return 'clean'
}

/** What each flag means, in plain words. */
export const FLAG_LABELS: Record<Flag, string> = {
  'o2-missing': 'Final O2 not recorded',
  'o2-impossible': 'Final O2 impossible for this test',
  'o2-rise-within-resolution': 'Final O2 above initial, within the sensor’s ±0.1 resolution',
  'co-over-range': 'Final CO above the sensor’s range',
  'co-initial-over-range': 'Initial CO above the sensor’s range',
  'co-missing': 'Final CO not recorded',
  'co-negative': 'Initial CO below zero (sensor zero drift)',
  'co2-missing': 'A CO2 reading not recorded',
  'co2-initial-zero': 'Initial CO2 exactly 0 (cabin air always has CO2)',
  'date-gmt-mismatch': 'GMT day doesn’t match the Date column',
  'date-year-2018': 'Year outside the 2014 and 2016 runs',
  'note-no-ignition': 'NASA’s display notes say no ignition',
  'note-would-not-stay-lit': 'NASA’s display notes say it would not stay lit',
}

/** The reason chip a quarantined tile carries in the bay, or null for a test that isn't quarantined. */
export function quarantineReason(row: Bass2Row): string | null {
  if (row.flags.includes('o2-missing')) return 'Final O2 not recorded'
  if (row.flags.includes('o2-impossible')) return `Final O2 ${row.raw[COLUMNS.o2Final].trim()}%: impossible`
  return null
}

// ---------------------------------------------------------------------------------------------
// O2 forensics (docs/fixtures/o2-forensics.json): calibrated = uncalibrated + that day's offset,
// where offset = calibrated initial − uncalibrated initial (bass2.sensor.mca-offset). Appendix A
// prints both readings (bass2.table.o2-columns); a blank uncalibrated reading, read as 0,
// reproduces each impossible value exactly.

export interface AppendixO2 {
  calibratedInitial: number
  calibratedFinal: number
  /** null where Appendix A prints dashes. */
  uncalibratedInitial: number | null
  uncalibratedFinal: number | null
}

/** Reads an Appendix A O2 quote such as "20.0 39.1 ---- 19.1" (four columns, dashes = blank). */
export function parseAppendixO2(quote: string): AppendixO2 {
  const cells = quote.trim().split(/\s+/)
  if (cells.length !== 4) throw new Error(`Expected four O2 columns in "${quote}"`)
  const read = (text: string) => (/^-+$/.test(text) ? null : numberCell(text))
  const [calibratedInitial, calibratedFinal, uncalibratedInitial, uncalibratedFinal] = cells.map(read)
  if (calibratedInitial === null || calibratedFinal === null) {
    throw new Error(`Calibrated O2 missing in "${quote}"`)
  }
  return { calibratedInitial, calibratedFinal, uncalibratedInitial, uncalibratedFinal }
}

/** The four O2 cells exactly as Appendix A prints them, dashes and all: "20.0 39.1 ---- 19.1". */
export function appendixO2Cells(quote: string): [string, string, string, string] {
  const cells = quote.trim().split(/\s+/)
  if (cells.length !== 4) throw new Error(`Expected four O2 columns in "${quote}"`)
  return [cells[0], cells[1], cells[2], cells[3]]
}

export interface O2Forensic extends AppendixO2 {
  testId: string
  /** The four cells as NASA printed them: calibrated initial, calibrated final, uncalibrated initial, uncalibrated final. */
  printed: [string, string, string, string]
  offset: number
  /** (uncalibrated final, blank read as 0) + offset */
  reproduced: number
  /** reproduced equals the CSV's final O2 */
  matches: boolean
  /** Appendix A's calibrated values equal the CSV's */
  appendixMatchesCsv: boolean
  /** Which reading was blank. */
  blank: 'uncalibrated-initial' | 'uncalibrated-final' | 'none'
  claimId: string
}

/** The claim holding a test's Appendix A O2 row: "bass2.o2forensic.p22b". */
export function forensicClaimId(testId: string): string {
  return `bass2.o2forensic.${testId.toLowerCase()}`
}

export function o2Forensic(row: Bass2Row, appendixQuote: string): O2Forensic {
  const appendix = parseAppendixO2(appendixQuote)
  const offset = roundTo(appendix.calibratedInitial - (appendix.uncalibratedInitial ?? 0), 2)
  const reproduced = roundTo((appendix.uncalibratedFinal ?? 0) + offset, 2)
  const blank =
    appendix.uncalibratedInitial === null
      ? 'uncalibrated-initial'
      : appendix.uncalibratedFinal === null
        ? 'uncalibrated-final'
        : 'none'
  return {
    testId: row.testId,
    ...appendix,
    printed: appendixO2Cells(appendixQuote),
    offset,
    reproduced,
    matches: row.o2FinalPct !== null && reproduced === roundTo(row.o2FinalPct, 2),
    appendixMatchesCsv:
      appendix.calibratedInitial === row.o2InitPct && appendix.calibratedFinal === row.o2FinalPct,
    blank,
    claimId: forensicClaimId(row.testId),
  }
}

/** Why a test is quarantined, worked out from its flags and its O2 forensics. */
export type QuarantineCause = 'blank-uncalibrated-initial' | 'blank-uncalibrated-final' | 'no-final-o2' | 'impossible'

/** The bay's groups, in order. */
export const QUARANTINE_CAUSES: readonly QuarantineCause[] = [
  'blank-uncalibrated-initial',
  'blank-uncalibrated-final',
  'no-final-o2',
  'impossible',
]

export const QUARANTINE_CAUSE_LABELS: Record<QuarantineCause, string> = {
  'blank-uncalibrated-initial': 'Blank uncalibrated initial: the offset became the whole reading',
  'blank-uncalibrated-final': 'Blank uncalibrated final: the reading is just the offset',
  'no-final-o2': 'No final O2 recorded',
  impossible: 'Impossible final O2, not explained by a blank reading',
}

/**
 * The cause of a quarantined test, or null for one that isn't quarantined. A blank-reading cause
 * needs forensics that reproduce the CSV's value; anything else impossible stays "impossible".
 */
export function quarantineCause(row: Bass2Row, forensic: O2Forensic | undefined): QuarantineCause | null {
  if (!isQuarantined(row)) return null
  if (row.flags.includes('o2-missing')) return 'no-final-o2'
  if (forensic?.matches && forensic.blank === 'uncalibrated-initial') return 'blank-uncalibrated-initial'
  if (forensic?.matches && forensic.blank === 'uncalibrated-final') return 'blank-uncalibrated-final'
  return 'impossible'
}

// ---------------------------------------------------------------------------------------------
// "Checked against NASA" (F2): our numbers recomputed from the CSV, beside the report's.

export interface CoYieldStat {
  median: number | null
  /** NASA says "on average" without saying which tests, so both are shown. */
  mean: number | null
  min: number | null
  max: number | null
  n: number
  testIds: string[]
}

/** CO per CO2 over burn-confirmed tests with numeric CO that pass `include`. */
export function coYieldStat(rows: readonly Bass2Row[], include: (row: Bass2Row) => boolean): CoYieldStat {
  const used = rows.filter((row) => row.burnConfirmed && row.coPerCo2 !== null && include(row))
  const values = used.map((row) => row.coPerCo2 as number)
  return {
    median: median(values),
    mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    n: values.length,
    testIds: used.map((row) => row.testId),
  }
}

/** The lowest final O2 among rows, with the test it came from. */
export function lowestFinalO2(rows: readonly Bass2Row[]): { value: number; testId: string } | null {
  let best: { value: number; testId: string } | null = null
  for (const row of rows) {
    if (row.o2FinalPct === null) continue
    if (!best || row.o2FinalPct < best.value) best = { value: row.o2FinalPct, testId: row.testId }
  }
  return best
}

export function nasaChecks(rows: readonly Bass2Row[]) {
  const family = (row: Bass2Row) => sampleFamily(row.sampleType)
  return {
    opposedSlabs: coYieldStat(rows, (row) => family(row) === 'slab' && row.flowConfig === 'Opposed'),
    concurrentAndStagnationRods: coYieldStat(
      rows,
      (row) => family(row) === 'rod' && (row.flowConfig === 'Concurrent' || row.flowConfig === 'Stagnation'),
    ),
    concurrentRods: coYieldStat(rows, (row) => family(row) === 'rod' && row.flowConfig === 'Concurrent'),
    stagnationRods: coYieldStat(rows, (row) => family(row) === 'rod' && row.flowConfig === 'Stagnation'),
    opposedRods: coYieldStat(rows, (row) => family(row) === 'rod' && row.flowConfig === 'Opposed'),
    lowestBurning: lowestFinalO2(rows.filter((row) => row.burnConfirmed)),
    lowestUsable: lowestFinalO2(rows.filter((row) => row.o2Usable)),
  }
}

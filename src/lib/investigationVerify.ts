// verify.ts's checks (SPEC §7.2, F7): what of an LLM's extraction about one investigation may be
// shown. Pure: the investigation's page text and the model's raw JSON in; checked fields, and a
// list of what failed and why, out. A field that fails is null ("Not stated"), never repaired.
//
// 1. Every quote must be in the investigation's text after normalize(); its page (and line, for
//    a PSI file) is recorded from where it was found, not from what the model said.
// 2. A text value must be inside one of its quotes; every number of a range, and every number in
//    a summary sentence, must be in that field's or sentence's quotes.
// 3. Units are converted only after that: atm × 14.696 = psia, kPa ÷ 6.895 = psia, mm/s ÷ 10 = cm/s.
import { isTraceable, numbersIn } from './answerCheck'
import { normalize } from './normalize'
import { flatText, lineOf, type TextPage } from './pages'

/** A quote found in the source: where it is, as checked. */
export interface Evidence {
  file: string
  /** The PDF page, or 1 for a text file. */
  page: number
  /** The report's own page number, for a PDF. */
  reportPage: number | null
  /** The 1-based line, for a PSI text file. */
  line: number | null
  quote: string
}

export interface Checked<T> {
  /** Null when the source doesn't state it, or the model's answer failed a check. */
  value: T | null
  evidence: Evidence[]
}

export interface Range {
  min: number
  max: number
}
/** A range in the source's own unit, and converted (SPEC §7.2). */
export interface PressureRange extends Range {
  unit: 'atm' | 'psia' | 'kPa'
  psia: Range
}
export interface FlowRange extends Range {
  unit: 'cm/s' | 'mm/s'
  cmS: Range
}

export interface InvestigationSummary {
  /** The source folder: "PSI-98". */
  id: string
  acronym: Checked<string>
  title: Checked<string>
  platform: Checked<string>
  /** Tested oxygen, % by volume. */
  o2Pct: Checked<Range>
  pressure: Checked<PressureRange>
  flow: Checked<FlowRange>
  /** The sentences that passed, each with the quotes that back it. */
  summary: { text: string; evidence: Evidence[] }[]
}

export interface FieldFailure {
  id: string
  field: string
  reason: string
  /** What the model returned for it. */
  raw: unknown
}

export const PSIA_PER_ATM = 14.696
export const KPA_PER_PSIA = 6.895
export const MM_S_PER_CM_S = 10
/** A quote behind a number or a sentence is at least this long; a field's own value may be shorter. */
export const MIN_QUOTE_WORDS = 3
export const MAX_SUMMARY_SENTENCES = 3

const words = (text: string) => text.split(' ').filter(Boolean).length
/** Text as shown: as written, with only its spacing tidied. normalize() is for comparing. */
const tidy = (text: string) => text.replace(/\s+/g, ' ').trim()
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** Finds a quote in the investigation's pages: on the page the model named if it's there, else anywhere. */
export function findQuote(pages: readonly TextPage[], quote: string, file?: unknown, page?: unknown): Evidence | null {
  const wanted = normalize(quote)
  if (!wanted) return null
  const named = pages.filter((p) => p.file === file && p.page === page)
  const found = [...named, ...pages].find((p) => flatText(p).includes(wanted))
  if (!found) return null
  return { file: found.file, page: found.page, reportPage: found.reportPage, line: lineOf(found, wanted), quote: wanted }
}

/**
 * The quotes of a raw field that are really in the text, at least `minWords` long. When none is,
 * `why` says so: a quote that is there but too short is a different failure from one that isn't there.
 */
function checkedEvidence(pages: readonly TextPage[], raw: unknown, minWords: number): Evidence[] & { why: string } {
  const out: Evidence[] = []
  let short: string | null = null
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!isRecord(item) || typeof item.quote !== 'string') continue
    if (words(normalize(item.quote)) < minWords) {
      short ??= normalize(item.quote)
      continue
    }
    const evidence = findQuote(pages, item.quote, item.file, item.page)
    if (evidence && !out.some((e) => e.quote === evidence.quote)) out.push(evidence)
  }
  const why =
    short !== null ? `its quote “${short}” is under ${minWords} words, too short to prove a number` : 'no quote was found in the source'
  return Object.assign(out, { why })
}

const NOT_STATED = { value: null, evidence: [] }
type Fail = (reason: string) => { value: null; evidence: [] }

function textField(pages: readonly TextPage[], raw: unknown, fail: Fail): Checked<string> {
  if (!isRecord(raw) || raw.value === null || raw.value === undefined) return NOT_STATED
  if (typeof raw.value !== 'string' || !normalize(raw.value)) return fail('the value is not text')
  const wanted = normalize(raw.value).toLowerCase()
  const evidence = checkedEvidence(pages, raw.evidence, 1)
  if (evidence.length === 0) return fail(evidence.why)
  const backing = evidence.filter((e) => e.quote.toLowerCase().includes(wanted))
  if (backing.length === 0) return fail('the value is not inside any of its quotes')
  return { value: tidy(raw.value), evidence: backing }
}

function rangeField<U extends string>(
  pages: readonly TextPage[],
  raw: unknown,
  units: readonly U[],
  fail: Fail,
): Checked<Range & { unit: U }> {
  if (!isRecord(raw) || raw.value === null || raw.value === undefined) return NOT_STATED
  const v = raw.value
  if (!isRecord(v) || typeof v.min !== 'number' || typeof v.max !== 'number' || !Number.isFinite(v.min) || !Number.isFinite(v.max)) {
    return fail('the value is not a range of numbers')
  }
  if (v.min > v.max) return fail('the range’s minimum is above its maximum')
  const unit = units.find((u) => u === v.unit)
  if (!unit) return fail(`the unit is not one of: ${units.join(', ')}`)
  const evidence = checkedEvidence(pages, raw.evidence, MIN_QUOTE_WORDS)
  if (evidence.length === 0) return fail(evidence.why)
  const quoted = evidence.flatMap((e) => numbersIn(e.quote).map(Number))
  for (const n of [v.min, v.max]) {
    if (!isTraceable(String(n), quoted)) return fail(`${n} is not in any of its quotes`)
  }
  return { value: { min: v.min, max: v.max, unit }, evidence: [...evidence] }
}

const convert = (r: Range, by: (n: number) => number): Range => ({ min: by(r.min), max: by(r.max) })

/**
 * Checks one investigation's extraction. Fields that fail are null and listed; summary sentences
 * that fail are left out and listed.
 */
export function verifyInvestigation(
  id: string,
  pages: readonly TextPage[],
  raw: unknown,
): { summary: InvestigationSummary; failures: FieldFailure[] } {
  const failures: FieldFailure[] = []
  const source = isRecord(raw) ? raw : {}
  const failing =
    (field: string): Fail =>
    (reason) => {
      failures.push({ id, field, reason, raw: source[field] ?? null })
      return { value: null, evidence: [] }
    }
  if (!isRecord(raw)) failures.push({ id, field: '(whole reply)', reason: 'the reply is not a JSON object', raw })

  const o2 = rangeField(pages, source.o2Range, ['% by volume', '%'] as const, failing('o2Range'))
  const pressure = rangeField(pages, source.pressureRange, ['atm', 'psia', 'kPa'] as const, failing('pressureRange'))
  const flow = rangeField(pages, source.flowRange, ['cm/s', 'mm/s'] as const, failing('flowRange'))

  const summary: InvestigationSummary['summary'] = []
  const sentences = Array.isArray(source.summary) ? source.summary.slice(0, MAX_SUMMARY_SENTENCES) : []
  if (!Array.isArray(source.summary)) failures.push({ id, field: 'summary', reason: 'the summary is not a list of sentences', raw: source.summary ?? null })
  sentences.forEach((item, i) => {
    const fail = failing(`summary[${i + 1}]`)
    const record = isRecord(item) ? item : {}
    const reject = (reason: string) => {
      fail(reason)
      failures[failures.length - 1].raw = item
    }
    const text = typeof record.text === 'string' ? tidy(record.text) : ''
    if (!text) return reject('the sentence has no text')
    const evidence = checkedEvidence(pages, record.evidence, MIN_QUOTE_WORDS)
    if (evidence.length === 0) return reject(evidence.why)
    const quoted = evidence.flatMap((e) => numbersIn(e.quote).map(Number))
    const loose = numbersIn(text).find((n) => !isTraceable(n, quoted))
    if (loose !== undefined) return reject(`${loose} is not in any of the sentence’s quotes`)
    summary.push({ text, evidence: [...evidence] })
  })

  return {
    summary: {
      id,
      acronym: textField(pages, source.acronym, failing('acronym')),
      title: textField(pages, source.title, failing('title')),
      platform: textField(pages, source.platform, failing('platform')),
      o2Pct: { value: o2.value && { min: o2.value.min, max: o2.value.max }, evidence: o2.evidence },
      pressure: {
        value: pressure.value && {
          ...pressure.value,
          psia: convert(pressure.value, (n) =>
            pressure.value?.unit === 'atm' ? n * PSIA_PER_ATM : pressure.value?.unit === 'kPa' ? n / KPA_PER_PSIA : n,
          ),
        },
        evidence: pressure.evidence,
      },
      flow: {
        value: flow.value && { ...flow.value, cmS: convert(flow.value, (n) => (flow.value?.unit === 'mm/s' ? n / MM_S_PER_CM_S : n)) },
        evidence: flow.evidence,
      },
      summary,
    },
    failures,
  }
}

/** Lines of a PSI metadata file that carry nothing to extract: people, addresses, ontology links, paper lists. */
const NOT_SCIENCE = /(Email|Phone|Fax|Address|Mid Initials|First Name|Last Name|Affiliation|Person Roles|Term Accession Number|Term Source|Publication|PubMed|Link\]|File Name)/

/** A field's name with nothing after it: capitalized words only, starting "Investigation" or "Study". */
const BARE_KEY = /^(?:Investigation|Study)(?: [A-Z][A-Za-z]*)+$/

/**
 * A PSI metadata page as the model is given it: only lines with a value, without people's
 * details. Half the size of the file. Quotes are still checked against the whole file.
 */
export function metadataForModel(page: TextPage): string {
  const kept: string[] = []
  for (const line of page.lines ?? page.text.split('\n')) {
    const tab = line.indexOf('\t')
    if (tab === -1) {
      // A value that runs over several lines continues without a key. Section headers are all
      // capitals, and a field with no value is only its name ("Study Factor Type"): neither is kept.
      const text = line.replace(/^"|"$/g, '').trim()
      if (text && !/^[A-Z ]+$/.test(text) && !BARE_KEY.test(text)) kept.push(text)
      continue
    }
    const key = line.slice(0, tab)
    const value = line.slice(tab + 1).replace(/\t+/g, ' ').replace(/^"|"$/g, '').trim()
    if (value && !NOT_SCIENCE.test(key)) kept.push(`${key}\t${value}`)
  }
  return kept.join('\n')
}

// The AI dataset briefing (SPEC F2): the statistics the LLM is given, and the check on what it
// writes. The model sees this stats JSON and nothing else; a sentence is kept only if every
// number in it is in that JSON (CLAUDE.md rules 1 and 10). Pure: `npm test` runs the same check
// on public/data/briefing.json.
import { isTraceable, numbersIn } from './answerCheck'
import {
  auditGroups,
  BURN_CO2_RISE_PCT,
  CO2_RESOLUTION_PCT,
  FLOW_CONFIGS,
  nasaChecks,
  SAMPLE_FAMILY_LABELS,
  sampleFamily,
  type AuditSummary,
  type Bass2Row,
  type CoYieldStat,
} from './audit'
import { normalize } from './normalize'

export const MIN_SENTENCES = 4
export const MAX_SENTENCES = 6

const round1 = (value: number | null) => (value === null ? null : Number(value.toFixed(1)))
const yieldStat = (stat: CoYieldStat) => ({
  tests: stat.n,
  median: round1(stat.median),
  mean: round1(stat.mean),
  lowest: round1(stat.min),
  highest: round1(stat.max),
})

/**
 * Everything the briefing may say, as numbers the views already show: the audit's counts
 * (audit.json) and statistics computed from the rows (bass2.json). Values are rounded as on screen.
 */
export function briefingStats(rows: readonly Bass2Row[], audit: Pick<AuditSummary, 'counts' | 'byPi' | 'testIds'>) {
  const groups = auditGroups(audit.testIds)
  const checks = nasaChecks(rows)
  const usable = rows.filter((row) => row.o2Usable && row.o2InitPct !== null).map((row) => row.o2InitPct as number)
  const families: Record<string, number> = {}
  for (const row of rows) {
    const label = SAMPLE_FAMILY_LABELS[sampleFamily(row.sampleType)]
    families[label] = (families[label] ?? 0) + 1
  }
  const flow: Record<string, number> = {}
  for (const config of FLOW_CONFIGS) flow[config.toLowerCase()] = rows.filter((row) => row.flowConfig === config).length
  flow['not stated'] = rows.filter((row) => row.flowConfig === null).length
  return {
    dataset: 'NASA PSI-25: the BASS-II test table, raw CSV',
    tests: audit.counts.total,
    testsByPrincipalInvestigator: audit.byPi,
    testsBySampleFamily: families,
    testsByFlowDirection: flow,
    finalOxygenReadings: {
      usable: audit.counts.o2Usable,
      setAside: groups.quarantined.length,
      physicallyImpossible: audit.counts['o2-impossible'],
      missing: audit.counts['o2-missing'],
    },
    otherFlags: {
      carbonMonoxideAboveSensorRange: groups['co-over-range'].length,
      otherSensorWarnings: groups['sensor-warning'].length,
      dateErrors: groups['date-error'].length,
    },
    burnConfirmedBySensors: {
      tests: audit.counts.burnConfirmed,
      rule: `CO2 rose by at least ${BURN_CO2_RISE_PCT} %, twice the CO2 sensor's ${CO2_RESOLUTION_PCT} % resolution`,
    },
    initialOxygenPercent: usable.length ? { lowest: Math.min(...usable), highest: Math.max(...usable) } : null,
    lowestFinalOxygenWithConfirmedBurn: checks.lowestBurning && { percent: checks.lowestBurning.value, test: checks.lowestBurning.testId },
    lowestUsableFinalOxygen: checks.lowestUsable && { percent: checks.lowestUsable.value, test: checks.lowestUsable.testId },
    carbonMonoxidePerCarbonDioxide: {
      unit: 'ppm of CO per 1 % of CO2, over burn-confirmed tests with numeric CO',
      opposedSlabs: yieldStat(checks.opposedSlabs),
      concurrentAndStagnationRods: yieldStat(checks.concurrentAndStagnationRods),
      opposedRods: yieldStat(checks.opposedRods),
    },
  }
}
export type BriefingStats = ReturnType<typeof briefingStats>

/** Every number in the stats: numeric values, and numbers written inside its text values. */
export function statsNumbers(stats: unknown): number[] {
  if (typeof stats === 'number') return [stats]
  if (typeof stats === 'string') return numbersIn(stats).map(Number)
  if (Array.isArray(stats)) return stats.flatMap(statsNumbers)
  if (typeof stats === 'object' && stats !== null) return Object.values(stats).flatMap(statsNumbers)
  return []
}

// A number in words can't be checked, so the briefing may not use one. ("one" is left alone: it
// is mostly an ordinary word.)
const NUMBER_WORDS =
  /\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozens?|hundreds?|thousands?|half|halves|thirds?|quarters?|twice|double|triple)\b/i
// CLAUDE.md rule 9, and SPEC F2's wording rule.
const BANNED: [RegExp, string][] = [
  [/\bsafe(?:ly|ty)?\b/i, 'says "safe"'],
  [/\bin space\b/i, 'says "in space"'],
  [/\bNASA(?:'|’)s (?:bugs?|errors?|mistakes?)\b/i, 'calls the anomalies NASA’s errors'],
]

/** Why a sentence can't be shown, or null if it can. */
export function sentenceProblem(sentence: string, numbers: readonly number[]): string | null {
  const text = normalize(sentence)
  if (!text) return 'is empty'
  const loose = numbersIn(text).find((n) => !isTraceable(n, numbers))
  if (loose !== undefined) return `has ${loose}, which is not in the stats`
  const word = NUMBER_WORDS.exec(text)
  if (word) return `writes a number in words ("${word[0]}"), which can’t be checked`
  for (const [pattern, why] of BANNED) if (pattern.test(text)) return why
  return null
}

export interface BriefingCheck {
  /** The sentences that passed, in order, at most six. */
  sentences: string[]
  dropped: { sentence: string; problem: string }[]
  /** Whether what passed is a briefing: 4 to 6 sentences. */
  ok: boolean
}

/** The number check (SPEC F2): keeps the sentences whose every number is in the stats JSON. */
export function checkBriefing(sentences: readonly unknown[], stats: unknown): BriefingCheck {
  const numbers = statsNumbers(stats)
  const kept: string[] = []
  const dropped: BriefingCheck['dropped'] = []
  for (const item of sentences) {
    // Shown as written (only the spacing tidied); normalize() is for checking, not for display.
    const sentence = typeof item === 'string' ? item.replace(/\s+/g, ' ').trim() : ''
    const problem = sentenceProblem(sentence, numbers)
    if (problem) dropped.push({ sentence, problem })
    else if (kept.length < MAX_SENTENCES) kept.push(sentence)
  }
  return { sentences: kept, dropped, ok: kept.length >= MIN_SENTENCES }
}

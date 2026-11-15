// The ZERO-DRAFT Orbital Risk Index (SPEC F3a): our composite of measured BASS-II indicators,
// not a NASA rating. Pure functions over the parsed BASS-II rows from lib/audit.ts. risk.test.ts
// rebuilds every measured component from the raw CSV and checks it against
// docs/fixtures/risk-components.json.
//
// Two index components, both measured in BASS-II's orbit tests and both scored 0 to 1 by min–max
// across the ranked types, so every ranked type is indexed over the same two things:
// - lowO2: the lowest final O2 among burn-confirmed tests. Lower scores higher.
// - coYield: the median ppm of CO per 1% CO2 over burn-confirmed tests. Higher scores higher.
// index = 100 × Σ(wᵢ·cᵢ) ÷ Σ(wᵢ).
//
// The ignition gap (rods only, t_s ÷ 25 s) is still measured on each rod, and the ignition race
// shows it, but it is not in the index. t_s = 0.7r²/α_s depends on the rod's diameter alone, with
// no gravity in it: it would be the same number on Earth, so it can't say anything about orbital
// risk. In the index it ranked the thickest rod first purely for being thick.
import {
  burnStatus,
  roundTo,
  sampleFamily,
  SAMPLE_FAMILY_LABELS,
  SAMPLE_TYPE_LABELS,
  SAMPLE_TYPES,
  type Bass2Row,
  type FlowConfig,
  type SampleFamily,
  type SampleType,
} from './audit'
import { solidResponseTimeS, type RodMm } from './physics'
import { median } from './stats'

/** NASA Test 1's fixed ignition time, s. Quoted: bass2.ign.test1-25s (p. 68). */
export const TEST1_IGNITION_S = 25

/** A component needs this many burn-confirmed tests, and a ranked type needs this many index components. */
export const MIN_BURN_CONFIRMED = 3
export const MIN_COMPONENTS = 2

/** CO yield is kept and scored to this many decimals of ppm per 1% CO2. */
export const CO_YIELD_DIGITS = 1

/** What is measured on a sample type (SPEC §6). Only the IndexKeys go into the index. */
export type ComponentKey = 'lowO2' | 'coYield' | 'ignitionGap'

/** The components the index is built from. The ignition gap isn't one: see the top of this file. */
export type IndexKey = Exclude<ComponentKey, 'ignitionGap'>

/** Fingerprint order, left to right, and the slider order. */
export const INDEX_KEYS: readonly IndexKey[] = ['lowO2', 'coYield']

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  lowO2: 'Low-O2 burning',
  coYield: 'CO yield',
  ignitionGap: 'Ignition gap',
}

/** The computed claim in src/data/claims.json that explains each component. */
export const COMPONENT_CLAIMS: Record<ComponentKey, string> = {
  lowO2: 'rank.low-o2',
  coYield: 'rank.co-yield',
  ignitionGap: 'rank.ignition-gap',
}

/** Sample types with a finding card instead of a reason line. */
const FINDING_CLAIMS: Partial<Record<SampleType, string[]>> = {
  nomex: ['bass2.nomex'],
  'wax-candle': ['bass2.wax-droplet'],
}

const ROD_MM: Partial<Record<SampleType, RodMm>> = {
  'pmma-rod-6.35': 6.35,
  'pmma-rod-9.525': 9.525,
  'pmma-rod-12.7': 12.7,
}

/** The rod diameter of a rod sample type, or null for anything else. */
export function rodMmOf(type: SampleType): RodMm | null {
  return ROD_MM[type] ?? null
}

export interface Measured {
  value: number
  unit: string
  /** The tests it was measured over. Null for the ignition gap: it comes from the rod's diameter. */
  n: number | null
  claimIds: string[]
  /** Low-O2 burning only: the test with that final O2. */
  testId?: string
}

export type FlowCounts = Partial<Record<FlowConfig | 'None', number>>

export interface RiskEntity {
  id: SampleType
  label: string
  family: SampleFamily
  tests: number
  burnConfirmed: number
  components: Partial<Record<ComponentKey, Measured>>
  findingClaimIds: string[]
  /** At least 3 burn-confirmed tests and both index components. Doesn't depend on the weights. */
  ranked: boolean
  /** Flow direction of its tests, from Appendix A; 'None' where NASA doesn't state it. */
  flows: FlowCounts
}

function lowestFinal(rows: readonly Bass2Row[]): Bass2Row | null {
  let lowest: Bass2Row | null = null
  for (const row of rows) {
    if (row.o2FinalPct === null) continue
    if (lowest === null || row.o2FinalPct < (lowest.o2FinalPct as number)) lowest = row
  }
  return lowest
}

function measure(type: SampleType, rows: readonly Bass2Row[]): RiskEntity['components'] {
  const components: RiskEntity['components'] = {}
  const burning = rows.filter((row) => row.burnConfirmed)
  if (burning.length >= MIN_BURN_CONFIRMED) {
    const lowest = lowestFinal(burning)
    if (lowest) {
      components.lowO2 = {
        value: lowest.o2FinalPct as number,
        unit: '% O2 (final)',
        n: burning.length,
        claimIds: [COMPONENT_CLAIMS.lowO2],
        testId: lowest.testId,
      }
    }
    const yields = burning.flatMap((row) => (row.coPerCo2 === null ? [] : [row.coPerCo2]))
    const middle = median(yields)
    if (yields.length >= MIN_BURN_CONFIRMED && middle !== null) {
      components.coYield = {
        // To 0.1 ppm per %, as shown and as in the fixture, so the index can be redone from the
        // screen. (The CO sensor reads to 1 ppm and CO2 to 0.1%, so no more digits are real.)
        value: roundTo(middle, CO_YIELD_DIGITS),
        unit: 'ppm CO per 1% CO2 (median)',
        n: yields.length,
        claimIds: [COMPONENT_CLAIMS.coYield],
      }
    }
  }
  const rodMm = rodMmOf(type)
  if (rodMm !== null) {
    components.ignitionGap = {
      value: solidResponseTimeS(rodMm) / TEST1_IGNITION_S,
      unit: 't_s / 25 s',
      n: null,
      claimIds: [COMPONENT_CLAIMS.ignitionGap],
    }
  }
  return components
}

/** One entity per sample type in the CSV, in SAMPLE_TYPES order, with its measured components. */
export function riskEntities(rows: readonly Bass2Row[]): RiskEntity[] {
  return SAMPLE_TYPES.flatMap((type) => {
    const own = rows.filter((row) => row.sampleType === type)
    if (own.length === 0) return []
    const components = measure(type, own)
    const burnConfirmed = own.filter((row) => row.burnConfirmed).length
    const flows: FlowCounts = {}
    for (const row of own) {
      const flow = row.flowConfig ?? 'None'
      flows[flow] = (flows[flow] ?? 0) + 1
    }
    return [
      {
        id: type,
        label: SAMPLE_TYPE_LABELS[type],
        family: sampleFamily(type),
        tests: own.length,
        burnConfirmed,
        components,
        findingClaimIds: FINDING_CLAIMS[type] ?? [],
        ranked:
          burnConfirmed >= MIN_BURN_CONFIRMED && INDEX_KEYS.filter((key) => components[key]).length >= MIN_COMPONENTS,
        flows,
      },
    ]
  })
}

// ---------------------------------------------------------------------------------------------
// Scores

export type Scores = Partial<Record<IndexKey, number>>

/** Min–max to 0…1. With no spread no type is riskier than another, so all score 0 (never NaN). */
function minMax(value: number, min: number, max: number, lowerIsRiskier: boolean): number {
  if (max <= min) return 0
  return lowerIsRiskier ? (max - value) / (max - min) : (value - min) / (max - min)
}

/** Each ranked entity's index component scores, 0 to 1: 1 for the lowest O2 or the highest CO yield. */
export function componentScores(ranked: readonly RiskEntity[]): Map<SampleType, Scores> {
  const range = (key: 'lowO2' | 'coYield') => {
    const values = ranked.flatMap((entity) => (entity.components[key] ? [entity.components[key].value] : []))
    return { min: Math.min(...values), max: Math.max(...values) }
  }
  const lowO2 = range('lowO2')
  const coYield = range('coYield')
  return new Map(
    ranked.map((entity) => {
      const { components } = entity
      const scores: Scores = {}
      if (components.lowO2) scores.lowO2 = minMax(components.lowO2.value, lowO2.min, lowO2.max, true)
      if (components.coYield) scores.coYield = minMax(components.coYield.value, coYield.min, coYield.max, false)
      return [entity.id, scores]
    }),
  )
}

// ---------------------------------------------------------------------------------------------
// Weights

export type Weights = Record<IndexKey, number>

export const EQUAL_WEIGHTS: Weights = { lowO2: 1, coYield: 1 }
export const WEIGHT_MAX = 1
export const WEIGHT_STEP = 0.05

/**
 * Sets one weight, on the slider's 0.05 steps from 0 to 1. At least one weight always stays above
 * 0: taking the last one to 0 leaves it at one step.
 */
export function setWeight(weights: Weights, key: IndexKey, value: number): Weights {
  const stepped = Math.round(Math.min(WEIGHT_MAX, Math.max(0, value)) / WEIGHT_STEP) * WEIGHT_STEP
  let next = Number(stepped.toFixed(2))
  const others = INDEX_KEYS.filter((k) => k !== key).reduce((sum, k) => sum + weights[k], 0)
  if (next <= 0 && others <= 0) next = WEIGHT_STEP
  return next === weights[key] ? weights : { ...weights, [key]: next }
}

export function isEqualWeights(weights: Weights): boolean {
  return INDEX_KEYS.every((key) => weights[key] === weights[INDEX_KEYS[0]])
}

/**
 * 100 × Σ(wᵢ·cᵢ) ÷ Σ(wᵢ) over the components it has, or null when those weights sum to 0
 * ("Not scored at these weights"). Never divides by zero.
 */
export function riskIndex(scores: Scores, weights: Weights): number | null {
  let weighted = 0
  let total = 0
  for (const key of INDEX_KEYS) {
    const score = scores[key]
    if (score === undefined) continue
    const weight = Math.max(0, weights[key])
    weighted += weight * score
    total += weight
  }
  return total > 0 ? (100 * weighted) / total : null
}

// ---------------------------------------------------------------------------------------------
// The leaderboard

export interface LeaderboardRow {
  entity: RiskEntity
  scores: Scores
  index: number
  /** 1 for the highest index. */
  rank: number
}

export interface Leaderboard {
  rows: LeaderboardRow[]
  /** Ranked types whose weights over their own components sum to 0: "Not scored at these weights". */
  unscored: { entity: RiskEntity; scores: Scores }[]
}

/** Two indexes closer than this are a tie (the same sums in a different order). */
const TIE = 1e-9
const byId = (a: RiskEntity, b: RiskEntity) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** The ranked entities, highest index first at these weights. Ties sort by sample type id. */
export function leaderboard(entities: readonly RiskEntity[], weights: Weights): Leaderboard {
  const ranked = entities.filter((entity) => entity.ranked)
  const scores = componentScores(ranked)
  const scored: Omit<LeaderboardRow, 'rank'>[] = []
  const unscored: Leaderboard['unscored'] = []
  for (const entity of ranked) {
    const own = scores.get(entity.id) ?? {}
    const index = riskIndex(own, weights)
    if (index === null) unscored.push({ entity, scores: own })
    else scored.push({ entity, scores: own, index })
  }
  scored.sort((a, b) => (Math.abs(a.index - b.index) > TIE ? b.index - a.index : byId(a.entity, b.entity)))
  unscored.sort((a, b) => byId(a.entity, b.entity))
  return { rows: scored.map((row, i) => ({ ...row, rank: i + 1 })), unscored }
}

/**
 * How many index points each component adds: wᵢcᵢ ÷ Σwᵢ × 100, over the components the type has.
 * They add up to the index exactly; each row's bar is cut into these segments. Components it
 * lacks, or every share when its weights sum to 0, are absent.
 */
export function componentShares(scores: Scores, weights: Weights): Partial<Record<IndexKey, number>> {
  const own = INDEX_KEYS.filter((key) => scores[key] !== undefined)
  const total = own.reduce((sum, key) => sum + Math.max(0, weights[key]), 0)
  if (total <= 0) return {}
  const shares: Partial<Record<IndexKey, number>> = {}
  for (const key of own) shares[key] = (100 * Math.max(0, weights[key]) * (scores[key] as number)) / total
  return shares
}

/** The component with the largest weighted share; on a tie, the first in INDEX_KEYS order. */
export function biggestFactor(scores: Scores, weights: Weights): IndexKey | null {
  const shares = componentShares(scores, weights)
  let best: IndexKey | null = null
  for (const key of INDEX_KEYS) {
    const share = shares[key]
    if (share === undefined) continue
    if (best === null || share > (shares[best] as number) + TIE) best = key
  }
  return best
}

/** An index as the leaderboard shows it, to 0.1. */
const shown = (index: number) => Math.round(index * 10) / 10

export interface Headline {
  entity: RiskEntity
  factor: IndexKey
  measured: Measured
  /** The second row, or null when only one type is scored. */
  runnerUp: RiskEntity | null
  /**
   * How far ahead the leader is, worked out from the two indexes as shown (to 0.1), so the
   * headline matches the screen: 63.5 and 63.3 give 0.2. 0 means they show the same index.
   */
  margin: number | null
}

/** The headline above the leaderboard: who tops the index at these weights, by how much, and why. */
export function leaderHeadline(board: Leaderboard, weights: Weights): Headline | null {
  const [leader, second] = board.rows
  if (!leader) return null
  const factor = biggestFactor(leader.scores, weights)
  const measured = factor ? leader.entity.components[factor] : undefined
  if (!factor || !measured) return null
  const margin = second ? Math.round((shown(leader.index) - shown(second.index)) * 10) / 10 : null
  return { entity: leader.entity, factor, measured, runnerUp: second?.entity ?? null, margin }
}

// ---------------------------------------------------------------------------------------------
// What isn't ranked, and why

export type UnrankedReason =
  /** Nomex and the wax candle: a finding card with NASA's words. */
  | { kind: 'finding'; claimIds: string[] }
  /** SIBAL: no fire moved the sensors past their resolution. */
  | { kind: 'too-small'; largestCo2RisePct: number | null }
  /** Too few burn-confirmed tests for any sample type in the group. */
  | { kind: 'few-burns'; burnConfirmed: number }
  /** Enough burns, too few components. */
  | { kind: 'few-components'; components: number }

export interface UnrankedGroup {
  family: SampleFamily
  label: string
  tests: number
  burnConfirmed: number
  testIds: string[]
  /** The largest CO2 rise of any of its tests, %; a burn needs 0.2 (BURN_CO2_RISE_PCT). */
  largestCo2RisePct: number | null
  reason: UnrankedReason
}

/**
 * The unranked sample types, one group per family (SIBAL fabric, thin films…), each with the
 * reason it isn't ranked. Reason lines first, most tests first; finding cards last.
 */
export function unrankedGroups(entities: readonly RiskEntity[], rows: readonly Bass2Row[]): UnrankedGroup[] {
  const families = new Map<SampleFamily, RiskEntity[]>()
  for (const entity of entities) {
    if (entity.ranked) continue
    families.set(entity.family, [...(families.get(entity.family) ?? []), entity])
  }
  const groups: UnrankedGroup[] = [...families].map(([family, members]) => {
    const own = rows.filter((row) => sampleFamily(row.sampleType) === family)
    const burnConfirmed = members.reduce((sum, entity) => sum + entity.burnConfirmed, 0)
    const findings = members.flatMap((entity) => entity.findingClaimIds)
    const rises = own.flatMap((row) => (row.dCo2Pct === null ? [] : [row.dCo2Pct]))
    const largestCo2RisePct = rises.length ? Math.max(...rises) : null
    let reason: UnrankedReason
    if (findings.length > 0) reason = { kind: 'finding', claimIds: findings }
    else if (burnConfirmed === 0 && own.some((row) => burnStatus(row) === 'too-small')) {
      reason = { kind: 'too-small', largestCo2RisePct }
    } else if (members.every((entity) => entity.burnConfirmed < MIN_BURN_CONFIRMED)) {
      reason = { kind: 'few-burns', burnConfirmed }
    } else {
      const indexed = (e: RiskEntity) => INDEX_KEYS.filter((key) => e.components[key]).length
      reason = { kind: 'few-components', components: Math.max(...members.map(indexed)) }
    }
    return {
      family,
      label: members.length === 1 ? members[0].label : SAMPLE_FAMILY_LABELS[family],
      tests: own.length,
      burnConfirmed,
      testIds: own.map((row) => row.testId),
      largestCo2RisePct,
      reason,
    }
  })
  const isFinding = (group: UnrankedGroup) => group.reason.kind === 'finding'
  return [
    ...groups.filter((g) => !isFinding(g)).sort((a, b) => b.tests - a.tests),
    ...groups.filter(isFinding),
  ]
}

/**
 * The lowest starting O2 of any usable test of a family. Low-O2 burning also reflects this: a
 * type never started low can't have been seen burning low.
 */
export function lowestInitialO2(rows: readonly Bass2Row[], family: SampleFamily): number | null {
  const values = rows
    .filter((row) => row.o2Usable && row.o2InitPct !== null && sampleFamily(row.sampleType) === family)
    .map((row) => row.o2InitPct as number)
  return values.length ? Math.min(...values) : null
}

/**
 * The fewest and most burn-confirmed tests among a family's ranked types. Low-O2 burning is a
 * lowest value, and a lowest value can only drop as tests are added, so this belongs beside it.
 */
export function burnCountRange(entities: readonly RiskEntity[], family: SampleFamily): { min: number; max: number } | null {
  const counts = entities.filter((e) => e.ranked && e.family === family).map((e) => e.burnConfirmed)
  return counts.length ? { min: Math.min(...counts), max: Math.max(...counts) } : null
}

/** The flow directions the ranked types of a family were tested in. */
export function familyFlows(entities: readonly RiskEntity[], family: SampleFamily): FlowConfig[] {
  const flows = new Set<FlowConfig>()
  for (const entity of entities) {
    if (!entity.ranked || entity.family !== family) continue
    for (const flow of Object.keys(entity.flows)) if (flow !== 'None') flows.add(flow as FlowConfig)
  }
  return [...flows].sort()
}

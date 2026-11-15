// Investigation relevance (SPEC F3d): how much each indexed investigation can say about a lunar
// lander and rover atmosphere. ZERO-DRAFT's judgment call, not a NASA rating (rank.relevance).
// Pure: the investigations in, a ranked list out. Anything a record doesn't state scores 0 and is
// flagged, never filled in (CLAUDE.md rule 4).
//
// relevance = 100 × (0.35 atmosphere + 0.25 gravity + 0.20 phenomena + 0.10 spacecraft materials
//                     + 0.10 test table)
import { PHENOMENA, type GravityClass, type Investigation, type Range } from './investigations'

export const RELEVANCE_WEIGHTS = {
  atmosphere: 0.35,
  gravity: 0.25,
  phenomena: 0.2,
  materials: 0.1,
  data: 0.1,
} as const
export type RelevanceKey = keyof typeof RELEVANCE_WEIGHTS
export const RELEVANCE_KEYS = Object.keys(RELEVANCE_WEIGHTS) as RelevanceKey[]

/** A tested O2 range counts if the target is within half a point of it: our judgment call. */
export const O2_TOLERANCE_PTS = 0.5
/** A tested pressure counts if the target is within 0.3 psi of it (1 atm is 14.696 psia). */
export const PRESSURE_TOLERANCE_PSIA = 0.3

/** The atmospheres of interest for the lunar lander and rover. Quoted: zayac.atmospheres. */
export interface Target {
  id: 'normoxic' | 'sea-34'
  o2Pct: number
  psia: number
}
export const LUNAR_TARGETS: readonly Target[] = [
  { id: 'normoxic', o2Pct: 21, psia: 14.7 },
  { id: 'sea-34', o2Pct: 34, psia: 8.2 },
]

/** Lunar gravity is partial: microgravity earns half, a ground study none. */
const GRAVITY_SCORE: Record<GravityClass, number> = { partial: 1, micro: 0.5, mixed: 0.5, normal: 0 }

/** Whether a tested range covers a value: null when the record doesn't state the range. */
export function covers(range: Range | null, value: number, tolerance: number): boolean | null {
  if (!range) return null
  return value >= range.min - tolerance - 1e-9 && value <= range.max + tolerance + 1e-9
}

export interface Scored {
  investigation: Investigation
  /** Each component's score, 0 to 1. */
  components: Record<RelevanceKey, number>
  /** Whether the target's O2 and pressure are in what it tested; null is "Not stated". */
  o2: boolean | null
  pressure: boolean | null
  /** Components that scored 0 because the record doesn't state them. */
  unknown: RelevanceKey[]
  /** 0 to 100. */
  relevance: number
}

export function scoreInvestigation(investigation: Investigation, target: Target): Scored {
  const o2 = covers(investigation.o2Pct?.value ?? null, target.o2Pct, O2_TOLERANCE_PTS)
  const pressure = covers(investigation.pressurePsia?.value ?? null, target.psia, PRESSURE_TOLERANCE_PSIA)
  const named = PHENOMENA.filter((p) => investigation.phenomena[p]).length
  const components: Record<RelevanceKey, number> = {
    atmosphere: (o2 ? 0.5 : 0) + (pressure ? 0.5 : 0),
    gravity: GRAVITY_SCORE[investigation.gravity.value],
    phenomena: named / PHENOMENA.length,
    materials: investigation.spacecraftMaterials ? 1 : 0,
    data: investigation.testTable ? 1 : 0,
  }
  const unknown: RelevanceKey[] = []
  if (o2 === null || pressure === null) unknown.push('atmosphere')
  if (!investigation.spacecraftMaterials) unknown.push('materials')
  if (!investigation.testTable) unknown.push('data')
  const relevance = 100 * RELEVANCE_KEYS.reduce((sum, key) => sum + RELEVANCE_WEIGHTS[key] * components[key], 0)
  return { investigation, components, o2, pressure, unknown, relevance }
}

/** Most relevant first; ties by name, so the order never depends on input order. */
export function rankInvestigations(list: readonly Investigation[], target: Target): Scored[] {
  return list
    .map((investigation) => scoreInvestigation(investigation, target))
    .sort((a, b) => b.relevance - a.relevance || a.investigation.name.localeCompare(b.investigation.name))
}

export interface RelevanceHeadline {
  top: Scored
  /** Whether any investigation tested both the target's O2 and its pressure. */
  fullMatch: boolean
  /** The best atmosphere score (0, 0.5 or 1) and who holds it. */
  bestAtmosphere: number
  closest: Scored[]
}

/** What the section says first: who ranks top, and whether anything tested this atmosphere. */
export function relevanceHeadline(ranked: readonly Scored[]): RelevanceHeadline | null {
  if (ranked.length === 0) return null
  const bestAtmosphere = Math.max(...ranked.map((s) => s.components.atmosphere))
  return {
    top: ranked[0],
    fullMatch: bestAtmosphere === 1,
    bestAtmosphere,
    closest: bestAtmosphere > 0 ? ranked.filter((s) => s.components.atmosphere === bestAtmosphere) : [],
  }
}

// The investigation index (SPEC F7): what each challenge-named NASA fire investigation in our
// sources tested, as facts that each rest on a verified quote (src/data/claims.json). A fact the
// record doesn't state is null and shows "Not stated" (CLAUDE.md rule 4). Pure: no React.
//
// Numbers here are quoted; claims.test.ts checks each one is in its claim's quote. BASS-II's O2
// range comes from the raw CSV instead (testedO2Range).
import type { Bass2Row } from './audit'
import { getClaim } from './claims'
import { PSIA_PER_ATM } from './interpret'

/** SPEC §6. A ground study is 'normal'. */
export type GravityClass = 'micro' | 'partial' | 'normal' | 'mixed'

export const PHENOMENA = ['ignition', 'spread', 'extinction', 'suppression', 'detection'] as const
export type Phenomenon = (typeof PHENOMENA)[number]

export const PHENOMENON_LABELS: Record<Phenomenon, string> = {
  ignition: 'Ignition',
  spread: 'Flame spread',
  extinction: 'Extinction',
  suppression: 'Suppression',
  detection: 'Detection',
}

export interface Range {
  min: number
  max: number
}

/** A value and the claim that states it. */
export interface Fact<T> {
  value: T
  claimId: string
}

export interface Investigation {
  id: string
  name: string
  /** Its PSI record in sources.json. */
  sourceId: string
  /** What it burned or studied, in our words; the claim holds NASA's. */
  burned: Fact<string>
  /** Where it ran, in our words. */
  platform: Fact<string>
  gravity: Fact<GravityClass>
  o2Pct: Fact<Range> | null
  pressurePsia: Fact<Range> | null
  /** The phenomena its record names, each with the claim that names it. */
  phenomena: Partial<Record<Phenomenon, string>>
  /** A claim where NASA calls what it burned spacecraft materials, or null. */
  spacecraftMaterials: string | null
  /** A claim showing a per-test data table in our sources, or null. */
  testTable: string | null
  /** Why a fact the record seems to state isn't counted, shown beside it, with its source. */
  caveat?: Fact<string>
}

const atm = (min: number, max = min): Range => ({ min: min * PSIA_PER_ATM, max: max * PSIA_PER_ATM })

/**
 * The lowest and highest initial O2 BASS-II tests started at, over tests with usable O2
 * (inv.bass2-o2-range). Null before the CSV loads.
 */
export function testedO2Range(rows: readonly Bass2Row[]): Range | null {
  const values = rows.filter((row) => row.o2Usable && row.o2InitPct !== null).map((row) => row.o2InitPct as number)
  return values.length ? { min: Math.min(...values), max: Math.max(...values) } : null
}

/** The eight indexed investigations, with BASS-II's O2 range from the CSV when it has loaded. */
export function investigations(bass2O2: Range | null): Investigation[] {
  return [
    {
      id: 'bass2',
      name: 'BASS-II',
      sourceId: 'psi-25',
      // The sample types are the CSV's (Summarize shows them); the claim says they were small solids.
      burned: { value: 'Small solid samples: PMMA, SIBAL fabric, Nomex, wax', claimId: 'bass2.solid-samples' },
      platform: { value: 'ISS, Microgravity Science Glovebox', claimId: 'bass2.solid-samples' },
      gravity: { value: 'micro', claimId: 'bass2.solid-samples' },
      o2Pct: bass2O2 ? { value: bass2O2, claimId: 'inv.bass2-o2-range' } : null,
      pressurePsia: { value: atm(1), claimId: 'bass2.pressure-1atm' },
      phenomena: {
        ignition: 'bass2.ign.limit-14.5',
        spread: 'bass2.sibal-scope',
        extinction: 'bass2.flam.vs-1g',
        suppression: 'bass2.suppress-until-cool',
      },
      spacecraftMaterials: null,
      testTable: 'bass2.table.o2-columns',
    },
    {
      id: 'bass',
      name: 'BASS',
      sourceId: 'psi-26',
      burned: { value: 'Cotton-fiberglass fabric, Nomex, Ultem', claimId: 'psi26.fuels' },
      platform: { value: 'ISS, Microgravity Science Glovebox', claimId: 'psi26.platform' },
      gravity: { value: 'micro', claimId: 'psi26.project-type' },
      // The BASS-II report's SIBAL chapter covers BASS and BASS-II (bass2.sibal-scope).
      o2Pct: { value: { min: 16, max: 21 }, claimId: 'bass2.sibal-o2' },
      pressurePsia: { value: atm(1), claimId: 'bass2.pressure-1atm' },
      phenomena: { spread: 'bass2.sibal-scope', extinction: 'bass2.sibal-scope', suppression: 'psi26.suppression' },
      spacecraftMaterials: null,
      testTable: null,
    },
    {
      id: 'saffire-1',
      name: 'Saffire-I',
      sourceId: 'psi-98',
      burned: { value: 'One large SIBAL fabric sheet', claimId: 'psi98.size' },
      platform: { value: 'Cygnus cargo ship, after leaving the ISS', claimId: 'psi98.cygnus' },
      gravity: { value: 'micro', claimId: 'psi98.project-type' },
      o2Pct: { value: { min: 21.5, max: 21.7 }, claimId: 'psi98.table-s1' },
      pressurePsia: null,
      phenomena: { spread: 'psi98.objective', extinction: 'psi98.objective' },
      spacecraftMaterials: 'psi98.spacecraft-materials',
      testTable: 'psi98.table-header',
    },
    {
      id: 'flex',
      name: 'FLEX',
      sourceId: 'psi-69',
      burned: { value: 'Liquid fuel droplets', claimId: 'psi69.droplets' },
      platform: { value: 'ISS, Combustion Integrated Rack', claimId: 'psi69.platform' },
      gravity: { value: 'micro', claimId: 'psi69.project-type' },
      o2Pct: null,
      pressurePsia: { value: atm(0.5, 1.5), claimId: 'psi69.pressure' },
      phenomena: { extinction: 'psi69.loi', suppression: 'psi69.suppressants' },
      spacecraftMaterials: null,
      testTable: null,
    },
    {
      id: 'saffire-2',
      name: 'Saffire-II',
      sourceId: 'psi-99',
      burned: { value: 'SIBAL, silicone, PMMA, PMMA with Nomex', claimId: 'psi99.materials' },
      platform: { value: 'Cygnus cargo ship, after leaving the ISS', claimId: 'psi99.cygnus' },
      gravity: { value: 'micro', claimId: 'psi99.project-type' },
      o2Pct: null,
      pressurePsia: null,
      phenomena: { spread: 'psi99.growth', extinction: 'psi99.objective' },
      spacecraftMaterials: 'psi99.spacecraft-materials',
      testTable: null,
    },
    {
      id: 'same',
      name: 'SAME',
      sourceId: 'psi-102',
      burned: { value: 'Overheated spacecraft materials, for their smoke', claimId: 'psi102.smoke' },
      platform: { value: 'ISS', claimId: 'psi102.platform-field' },
      gravity: { value: 'micro', claimId: 'psi102.project-type' },
      o2Pct: null,
      pressurePsia: null,
      phenomena: { detection: 'psi102.detector' },
      spacecraftMaterials: 'psi102.smoke',
      testTable: null,
    },
    {
      id: 'saffire-3',
      name: 'Saffire-III',
      sourceId: 'psi-100',
      burned: { value: 'SIBAL fabric', claimId: 'psi100.sibal' },
      platform: { value: 'Cygnus cargo ship, after leaving the ISS', claimId: 'psi100.cygnus' },
      gravity: { value: 'micro', claimId: 'psi100.project-type' },
      o2Pct: null,
      pressurePsia: null,
      phenomena: { spread: 'psi100.growth', extinction: 'psi100.objective' },
      // Its Research Impacts text names spacecraft materials, but it is Saffire-I's, word for word.
      spacecraftMaterials: null,
      testTable: null,
      caveat: {
        value: 'Its record’s spacecraft-materials sentence is copied from Saffire-I’s, so it isn’t counted',
        claimId: 'psi100.impacts-copied',
      },
    },
    {
      id: 'psi-62',
      name: 'PSI-62 flame spread models',
      sourceId: 'psi-62',
      burned: { value: 'Computer models of BASS flames', claimId: 'psi62.modeling' },
      platform: { value: 'On the ground: computer modeling', claimId: 'psi62.project-type' },
      gravity: { value: 'normal', claimId: 'psi62.project-type' },
      o2Pct: null,
      pressurePsia: null,
      phenomena: { spread: 'psi62.modeling' },
      spacecraftMaterials: null,
      testTable: null,
    },
  ]
}

/**
 * Saffire-I's sample size as its data table row gives it (psi98.table-s1, whose columns are in
 * psi98.table-header: number, material, thickness, length, width, …). Null if the row won't parse.
 */
export function saffire1TableSize(): { lengthCm: string; widthCm: string } | null {
  const cells = (getClaim('psi98.table-s1')?.quote ?? '').split(',')
  return cells.length > 4 ? { lengthCm: cells[3].trim(), widthCm: cells[4].trim() } : null
}

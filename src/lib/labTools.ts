// Lab Partner's tools (SPEC F5): what Gemini is told each one does, and the checks every call's
// arguments pass before anything runs. A call with arguments outside what the app's own controls
// allow is refused, never stretched to fit. Running them is labToolRun.ts.
import { FLOW_RANGE_CM_S, O2_RANGE_PCT, TWIN_DEFAULTS } from './burnTwin'
import { SAMPLE_FAMILY_LABELS, SAMPLE_TYPES, type SampleFamily, type SampleType } from './audit'
import { getClaim } from './claims'
import { isPresetId, mergeInputs, PRESET_IDS, PRESETS, type PresetId } from './interpret'
import type { CabinInputs } from './cabin'
import type { LabContext, ToolName } from './labProtocol'
import { ROD_DIAMETERS_MM, type RodMm } from './physics'
import { EQUAL_WEIGHTS } from './risk'
import { VIEWS, type RouteParams, type ViewId } from './route'
import { linkFromParams, paramsFromLink } from './testWall'

/** The view each tool's module lives on (SPEC F5). navigate goes where it's told; open_citation works anywhere. */
export const TOOL_VIEW: Record<Exclude<ToolName, 'navigate' | 'open_citation'>, ViewId> = {
  set_burn_twin: 'overview',
  run_cabin_preset: 'interpret',
  set_cabin: 'interpret',
  filter_tests: 'summarize',
  highlight_risk_entity: 'rank',
}

export const VIEW_LABELS: Record<ViewId, string> = {
  overview: 'Overview',
  summarize: 'Summarize',
  rank: 'Rank',
  interpret: 'Interpret',
}

/** The six principal investigators in the BASS-II table, as the CSV spells them. */
export const PIS = ['Bhattacharjee', 'Ferkul', 'Miller', 'Olson', 'Fernandez-Pello', "T'ien"] as const

/** At most this many tool calls per question. */
export const MAX_TOOL_CALLS = 3

/** The sources open_citation may open: the headline findings, so the model never guesses an id. */
export const CITABLE = [
  'bass2.flam.vs-1g',
  'bass2.flam.goldilocks',
  'bass2.flam.min-o2',
  'bass2.ign.limit-14.5',
  'bass2.ign.survive-13.6',
  'bass2.ign.test1-25s',
  'bass2.ign.230s',
  'bass2.ign.test1-too-short',
  'bass2.co.smac',
  'bass2.co.370',
  'bass2.co.550',
  'bass2.co.over-range',
  'bass2.suppress-until-cool',
  'bass2.vapor-jet',
  'bass2.nomex',
  'bass2.wax-droplet',
  'psi26.impacts',
] as const

const SUMMARIZE_PARAMS = ['audit', 'pi', 'flow', 'sample', 'burn', 'quarantine', 'test'] as const

const FAMILIES = Object.keys(SAMPLE_FAMILY_LABELS) as SampleFamily[]

// ---------------------------------------------------------------------------------------------
// What Gemini is told (function declarations with JSON Schema parameters).

export interface ToolDeclaration {
  name: ToolName
  description: string
  parametersJsonSchema: Record<string, unknown>
}

const num = (description: string, minimum: number, maximum: number) => ({ type: 'number', description, minimum, maximum })

export const TOOL_DECLARATIONS: ToolDeclaration[] = [
  {
    name: 'set_burn_twin',
    description:
      'Drives the Earth vs Orbit Burn Twin on the Overview: two PMMA rods, one in 1g and one in an ISS glovebox ' +
      'airflow, with NASA Eq. 6.1 giving the orbit flame its oxygen limit. Sets oxygen, the orbit airflow and the ' +
      'rod size, and can ignite both flames, drain the oxygen from 17% to 13% (each flame goes out at its own ' +
      'limit) or reset. Use it to show how airflow and oxygen decide whether a PMMA rod keeps burning, for ' +
      'example why gentle flows are the most dangerous. Returns the orbit limit, the Earth limit and the gap.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        o2Pct: num('Oxygen, percent by volume.', O2_RANGE_PCT.min, O2_RANGE_PCT.max),
        flowCmS: num('Orbit airflow, cm/s. Gentle ventilation is about 2.', FLOW_RANGE_CM_S.min, FLOW_RANGE_CM_S.max),
        rodMm: { type: 'number', description: 'PMMA rod diameter, mm: 6.35, 9.525 or 12.7.' },
        action: { type: 'string', enum: ['ignite', 'drain', 'reset'] },
      },
    },
  },
  {
    name: 'run_cabin_preset',
    description:
      'Runs a preset of the cabin fire simulator on Interpret: what a fire does to O2, CO2 and CO in a sealed, ' +
      'well-mixed volume at 1 atm, with alarms when CO passes the 10 and 55 ppm limits. Presets: "m5" replays ' +
      'Test M5 in the glovebox; "us-lab" moves that fire into the ISS US Lab; "small-cabin" puts it in a small ' +
      'sealed cabin; "n2" dilutes the glovebox with nitrogen around a small rod flame; "lunar" is a 34% oxygen, ' +
      '8.2 psia lunar lander atmosphere, where the model refuses to predict. Returns the model’s results.',
    parametersJsonSchema: {
      type: 'object',
      properties: { preset: { type: 'string', enum: [...PRESET_IDS] } },
      required: ['preset'],
    },
  },
  {
    name: 'set_cabin',
    description:
      'Changes the cabin fire simulator’s inputs on Interpret, starting from what is on screen, and runs it. ' +
      'Use it for what-ifs: a bigger volume, a smaller fire, nitrogen flow. Returns the model’s results.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        volumeM3: num('Sealed volume, m³.', 0.1, 150),
        powerW: num('Fire heat release, W.', 0, 200),
        geometry: { type: 'string', enum: ['opposed-slab', 'concurrent-rod'] },
        rodMm: { type: 'number', description: 'For a rod: diameter, mm: 6.35, 9.525 or 12.7.' },
        flowCmS: num('For a rod: airflow, cm/s.', FLOW_RANGE_CM_S.min, FLOW_RANGE_CM_S.max),
        n2FlowCcMin: num('Nitrogen flow, cm³/min.', 0, 500),
        n2StartMin: num('When the nitrogen starts, minutes.', 0, 120),
        durationMin: num('How long to run, minutes.', 1, 300),
      },
    },
  },
  {
    name: 'navigate',
    description:
      'Opens a view. overview: the Burn Twin. summarize: all 129 BASS-II tests, filters and the quarantine bay; ' +
      'params.test (e.g. "P22b") shows one test, in the quarantine bay with its forensic math if it was ' +
      'quarantined. rank: the Orbital Risk Index leaderboard, flammability map and ignition race. interpret: ' +
      'the cabin fire simulator; params.preset opens a preset without running it.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        view: { type: 'string', enum: [...VIEWS] },
        params: {
          type: 'object',
          properties: { test: { type: 'string' }, preset: { type: 'string', enum: [...PRESET_IDS] } },
        },
      },
      required: ['view'],
    },
  },
  {
    name: 'filter_tests',
    description:
      'Filters the 129 BASS-II tests on Summarize by principal investigator and sample family, and turns the ' +
      'quarantine on or off (quarantine moves tests with impossible or missing final O2 into a bay). Returns how ' +
      'many tests match and how many were burn-confirmed by the sensors.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        pi: { type: 'string', enum: [...PIS] },
        geometry: { type: 'string', enum: FAMILIES, description: 'Sample family.' },
        quarantine: { type: 'boolean' },
      },
    },
  },
  {
    name: 'highlight_risk_entity',
    description:
      'Highlights one BASS-II sample type on the Orbital Risk Index leaderboard (our composite of measured ' +
      'indicators, not a NASA rating) and returns its index, rank and measured components.',
    parametersJsonSchema: {
      type: 'object',
      properties: { id: { type: 'string', enum: [...SAMPLE_TYPES] } },
      required: ['id'],
    },
  },
  {
    name: 'open_citation',
    description:
      'Opens NASA’s own words for a headline finding in the citation drawer. Ids: ' + CITABLE.join(', ') + '.',
    parametersJsonSchema: {
      type: 'object',
      properties: { claimId: { type: 'string', enum: [...CITABLE] } },
      required: ['claimId'],
    },
  },
]

// ---------------------------------------------------------------------------------------------
// Checking a call's arguments.

export type Checked<T> = { ok: true; args: T } | { ok: false; error: string }

export interface BurnArgs {
  o2Pct?: number
  flowCmS?: number
  rodMm?: RodMm
  action?: 'ignite' | 'drain' | 'reset'
}
export interface CabinPatchArgs {
  volumeM3?: number
  powerW?: number
  geometry?: 'opposed-slab' | 'concurrent-rod'
  rodMm?: RodMm
  flowCmS?: number
  n2FlowCcMin?: number
  n2StartMin?: number
  durationMin?: number
}
export interface NavigateArgs {
  view: ViewId
  params: RouteParams
}
export interface FilterArgs {
  pi?: (typeof PIS)[number]
  geometry?: SampleFamily
  quarantine?: boolean
}

type Args = Record<string, unknown>
const isObject = (value: unknown): value is Args => typeof value === 'object' && value !== null && !Array.isArray(value)

/** A number within [min, max], or undefined when absent. Anything else is an error. */
function optionalNumber(args: Args, key: string, min: number, max: number): number | undefined | Error {
  const value = args[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) return new Error(`${key} must be a number`)
  if (value < min || value > max) return new Error(`${key} must be between ${min} and ${max}`)
  return value
}

/** 6.35, 9.525 or 12.7 (a model may write 9.5 or 12.70). */
function optionalRod(args: Args, key: string): RodMm | undefined | Error {
  const value = args[key]
  if (value === undefined || value === null) return undefined
  const rod = typeof value === 'number' ? ROD_DIAMETERS_MM.find((d) => Math.abs(d - value) <= 0.05 * d) : undefined
  return rod ?? new Error(`${key} must be 6.35, 9.525 or 12.7`)
}

function optionalEnum<T extends string>(args: Args, key: string, allowed: readonly T[]): T | undefined | Error {
  const value = args[key]
  if (value === undefined || value === null) return undefined
  return (allowed as readonly unknown[]).includes(value) ? (value as T) : new Error(`${key} must be one of ${allowed.join(', ')}`)
}

/** Collects checked values; the first Error refuses the whole call. */
function collect<T>(entries: [string, unknown][]): Checked<T> {
  const args: Args = {}
  for (const [key, value] of entries) {
    if (value instanceof Error) return { ok: false, error: value.message }
    if (value !== undefined) args[key] = value
  }
  return { ok: true, args: args as T }
}

export function checkArgs(name: ToolName, raw: unknown): Checked<Args> {
  const args = isObject(raw) ? raw : {}
  switch (name) {
    case 'set_burn_twin': {
      const checked = collect<BurnArgs>([
        ['o2Pct', optionalNumber(args, 'o2Pct', O2_RANGE_PCT.min, O2_RANGE_PCT.max)],
        ['flowCmS', optionalNumber(args, 'flowCmS', FLOW_RANGE_CM_S.min, FLOW_RANGE_CM_S.max)],
        ['rodMm', optionalRod(args, 'rodMm')],
        ['action', optionalEnum(args, 'action', ['ignite', 'drain', 'reset'] as const)],
      ])
      if (checked.ok && Object.keys(checked.args).length === 0) return { ok: false, error: 'nothing to set' }
      return checked as Checked<Args>
    }
    case 'run_cabin_preset': {
      const preset = optionalEnum(args, 'preset', PRESET_IDS)
      if (preset === undefined) return { ok: false, error: 'preset is required' }
      return collect([['preset', preset]])
    }
    case 'set_cabin': {
      const checked = collect<CabinPatchArgs>([
        ['volumeM3', optionalNumber(args, 'volumeM3', 0.1, 150)],
        ['powerW', optionalNumber(args, 'powerW', 0, 200)],
        ['geometry', optionalEnum(args, 'geometry', ['opposed-slab', 'concurrent-rod'] as const)],
        ['rodMm', optionalRod(args, 'rodMm')],
        ['flowCmS', optionalNumber(args, 'flowCmS', FLOW_RANGE_CM_S.min, FLOW_RANGE_CM_S.max)],
        ['n2FlowCcMin', optionalNumber(args, 'n2FlowCcMin', 0, 500)],
        ['n2StartMin', optionalNumber(args, 'n2StartMin', 0, 120)],
        ['durationMin', optionalNumber(args, 'durationMin', 1, 300)],
      ])
      if (checked.ok && Object.keys(checked.args).length === 0) return { ok: false, error: 'nothing to set' }
      return checked as Checked<Args>
    }
    case 'navigate': {
      const view = optionalEnum(args, 'view', VIEWS)
      if (!view || view instanceof Error) return { ok: false, error: 'view must be one of ' + VIEWS.join(', ') }
      return { ok: true, args: { view, params: viewParams(view, isObject(args.params) ? args.params : {}) } }
    }
    case 'filter_tests': {
      const checked = collect<FilterArgs>([
        ['pi', optionalEnum(args, 'pi', PIS)],
        ['geometry', optionalEnum(args, 'geometry', FAMILIES)],
        ['quarantine', typeof args.quarantine === 'boolean' ? args.quarantine : undefined],
      ])
      return checked as Checked<Args>
    }
    case 'highlight_risk_entity': {
      const id = optionalEnum<SampleType>(args, 'id', SAMPLE_TYPES)
      if (id === undefined) return { ok: false, error: 'id is required' }
      return collect([['id', id]])
    }
    case 'open_citation': {
      const claimId = optionalEnum(args, 'claimId', CITABLE)
      if (claimId === undefined) return { ok: false, error: 'claimId is required' }
      if (!(claimId instanceof Error) && !getClaim(claimId)?.verified) return { ok: false, error: 'not a verified claim' }
      return collect([['claimId', claimId]])
    }
  }
}

/** Only the query parameters a view reads, with only values it accepts (the same as a deep link). */
export function viewParams(view: ViewId, raw: Args): RouteParams {
  const strings: RouteParams = {}
  for (const [key, value] of Object.entries(raw)) if (typeof value === 'string') strings[key] = value
  if (view === 'summarize') {
    const picked = Object.fromEntries(SUMMARIZE_PARAMS.flatMap((key) => (strings[key] ? [[key, strings[key]]] : [])))
    // A test id looks like O4 or P22b; anything else is dropped.
    const { test, ...link } = linkFromParams(picked)
    return paramsFromLink(test && /^[BFMOPT]\d{1,2}[ab]?$/.test(test) ? { ...link, test } : link)
  }
  if (view === 'interpret' && isPresetId(strings.preset)) return { preset: strings.preset }
  return {}
}

// ---------------------------------------------------------------------------------------------
// The screen the dock reports. Anything missing or out of range falls back to the app's defaults.

export const DEFAULT_CONTEXT: LabContext = {
  view: 'overview',
  params: {},
  burn: { ...TWIN_DEFAULTS },
  interpret: { presetId: 'm5', inputs: PRESETS.m5.inputs },
  weights: EQUAL_WEIGHTS,
}

export function sanitizeContext(raw: unknown): LabContext {
  if (!isObject(raw)) return DEFAULT_CONTEXT
  const view = (VIEWS as readonly unknown[]).includes(raw.view) ? (raw.view as ViewId) : 'overview'
  const burn = isObject(raw.burn) ? raw.burn : {}
  const number = (value: unknown, min: number, max: number, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
  const rod = optionalRod(burn, 'rodMm')
  const interpret = isObject(raw.interpret) ? raw.interpret : {}
  const presetId: PresetId = isPresetId(interpret.presetId) ? interpret.presetId : 'm5'
  const weights = isObject(raw.weights) ? raw.weights : {}
  const lowO2 = number(weights.lowO2, 0, 1, EQUAL_WEIGHTS.lowO2)
  const coYield = number(weights.coYield, 0, 1, EQUAL_WEIGHTS.coYield)
  return {
    view,
    params: viewParams(view, isObject(raw.params) ? raw.params : {}),
    burn: {
      o2Pct: number(burn.o2Pct, O2_RANGE_PCT.min, O2_RANGE_PCT.max, TWIN_DEFAULTS.o2Pct),
      flowCmS: number(burn.flowCmS, FLOW_RANGE_CM_S.min, FLOW_RANGE_CM_S.max, TWIN_DEFAULTS.flowCmS),
      rodMm: rod instanceof Error || rod === undefined ? TWIN_DEFAULTS.rodMm : rod,
    },
    interpret: {
      presetId,
      // mergeInputs keeps only fields and values the model takes.
      inputs: mergeInputs(PRESETS[presetId].inputs, (isObject(interpret.inputs) ? interpret.inputs : {}) as Partial<CabinInputs>),
    },
    weights: lowO2 + coYield > 0 ? { lowO2, coYield } : EQUAL_WEIGHTS,
  }
}


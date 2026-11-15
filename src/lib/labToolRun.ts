// Runs Lab Partner's tools on the server (SPEC §7.1 step 3) with the same pure functions the views
// use, so the numbers in an answer are the numbers on screen. Each result lists its values with the
// claim behind each one; the answer may only use numbers from these values or from quotes
// (CLAUDE.md rule 10). Values are rounded the way the screen shows them.
import {
  forensicClaimId,
  isQuarantined,
  o2Forensic,
  SAMPLE_FAMILY_LABELS,
  type Bass2Row,
} from './audit'
import { DRAIN, IGNITION_LIMIT_O2_PCT, TWIN_DEFAULTS } from './burnTwin'
import { SMAC_1_HOUR_PPM, SMAC_LONG_TERM_PPM, simulateCabin, type CabinInputs } from './cabin'
import { citePreview, getClaim } from './claims'
import {
  firstTime,
  logEntries,
  M5_POWER_W,
  M5_START,
  mergeInputs,
  PRESETS,
  psia,
  simTime,
  stepOptions,
  volumeMarks,
  type LogKind,
  type PresetId,
} from './interpret'
import { TOOL_NAMES, type LabContext, type ToolField, type ToolName, type ToolResult } from './labProtocol'
import {
  checkArgs,
  MAX_TOOL_CALLS,
  TOOL_VIEW,
  VIEW_LABELS,
  type BurnArgs,
  type CabinPatchArgs,
  type FilterArgs,
  type NavigateArgs,
} from './labTools'
import { EARTH_LIMIT_O2_PCT, eq61Branch, o2LimitPct, stretchRate } from './physics'
import { leaderboard, riskEntities, unrankedGroups, type RiskEntity, type Weights } from './risk'
import type { ViewId } from './route'
import { matchesFilters, NO_FILTERS, type TestFilters } from './testWall'

/** A call as Gemini made it, before any checks. */
export interface RawCall {
  name: string
  args: unknown
}

/** What is on screen as the tools run: each tool starts from what the previous one left. */
interface Screen {
  view: ViewId
  burn: LabContext['burn']
  presetId: PresetId
  inputs: CabinInputs
  weights: Weights
}

type Outcome = Pick<ToolResult, 'summary' | 'fields' | 'claimIds'>

const round = (value: number, places: number) => Number(value.toFixed(places))

function field(key: string, label: string, value: ToolField['value'], claimId?: string): ToolField {
  return claimId ? { key, label, value, claimId } : { key, label, value }
}

/** A verified quote as a value, so its numbers can be used and its chip opens it. */
function quote(key: string, claimId: string): ToolField[] {
  const claim = getClaim(claimId)
  return claim?.verified && claim.quote ? [field(key, `NASA’s words, ${citePreview(claim)}`, claim.quote, claimId)] : []
}

const entitiesFor = new WeakMap<readonly Bass2Row[], RiskEntity[]>()
function entities(rows: readonly Bass2Row[]): RiskEntity[] {
  let found = entitiesFor.get(rows)
  if (!found) entitiesFor.set(rows, (found = riskEntities(rows)))
  return found
}

/** Runs up to MAX_TOOL_CALLS calls in order. Unknown tools are skipped; bad arguments give an error result. */
export function runTools(calls: readonly RawCall[], context: LabContext, rows: readonly Bass2Row[]): ToolResult[] {
  const screen: Screen = {
    view: context.view,
    burn: { ...context.burn },
    presetId: context.interpret.presetId,
    inputs: context.interpret.inputs,
    weights: context.weights,
  }
  const results: ToolResult[] = []
  for (const call of calls) {
    if (results.length === MAX_TOOL_CALLS) break
    if (!(TOOL_NAMES as readonly string[]).includes(call.name)) continue
    const name = call.name as ToolName
    const id = `tool#${results.length + 1}`
    const checked = checkArgs(name, call.args)
    if (!checked.ok) {
      results.push({ id, name, args: {}, view: null, opensView: false, summary: `couldn’t run: ${checked.error}`, fields: [], claimIds: [], error: checked.error })
      continue
    }
    const view: ViewId | null =
      name === 'navigate' ? (checked.args as unknown as NavigateArgs).view : name === 'open_citation' ? null : TOOL_VIEW[name]
    const opensView = view !== null && view !== screen.view
    if (view) screen.view = view
    const outcome = run(name, checked.args, screen, rows)
    results.push({ id, name, args: checked.args, view, opensView, ...outcome })
  }
  return results
}

function run(name: ToolName, args: Record<string, unknown>, screen: Screen, rows: readonly Bass2Row[]): Outcome {
  switch (name) {
    case 'set_burn_twin':
      return burnTwin(args as BurnArgs, screen)
    case 'run_cabin_preset': {
      const preset = args.preset as PresetId
      screen.presetId = preset
      screen.inputs = PRESETS[preset].inputs
      return { ...cabin(screen.inputs, preset), summary: `ran ${PRESETS[preset].label}` }
    }
    case 'set_cabin': {
      screen.inputs = mergeInputs(screen.inputs, args as CabinPatchArgs)
      return { ...cabin(screen.inputs, null), summary: `set ${cabinPatchWords(args as CabinPatchArgs)}` }
    }
    case 'navigate':
      return navigate(args as unknown as NavigateArgs, screen, rows)
    case 'filter_tests':
      return filterTests(args as FilterArgs, rows)
    case 'highlight_risk_entity':
      return highlight(args.id as string, screen.weights, rows)
    case 'open_citation': {
      const claim = getClaim(args.claimId as string)!
      return {
        summary: `opened the source: ${citePreview(claim)}`,
        fields: [field('claim', 'What it says', claim.text, claim.id), ...quote('quote', claim.id)],
        claimIds: [claim.id],
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The Burn Twin.

function burnTwin(args: BurnArgs, screen: Screen): Outcome {
  const before = args.action === 'reset' ? TWIN_DEFAULTS : screen.burn
  let { o2Pct, flowCmS, rodMm } = screen.burn
  if (args.action === 'reset') ({ o2Pct, flowCmS, rodMm } = TWIN_DEFAULTS)
  if (args.flowCmS !== undefined) flowCmS = args.flowCmS
  if (args.rodMm !== undefined) rodMm = args.rodMm
  if (args.o2Pct !== undefined) o2Pct = args.o2Pct
  if (args.action === 'drain') o2Pct = DRAIN.toPct
  screen.burn = { o2Pct, flowCmS, rodMm }

  const limit = o2LimitPct(flowCmS, rodMm)
  const gap = EARTH_LIMIT_O2_PCT - limit
  const fields: ToolField[] = [
    field('flowCmS', 'Orbit airflow U, cm/s', round(flowCmS, 2)),
    field('rodMm', 'PMMA rod diameter, mm', rodMm),
    field('stretchRate', 'Stretch rate a, 1/s (model)', round(stretchRate(flowCmS, rodMm), 2), 'twin.stretch-rate'),
    field('orbitLimitPct', 'Orbit limit, % O2 (Eq. 6.1, model)', round(limit, 2), 'twin.orbit-limit'),
    field(
      'branch',
      'Which side of the Eq. 6.1 curve',
      eq61Branch(stretchRate(flowCmS, rodMm)) === 'quenching'
        ? 'quenching branch: at low flow the flame starves'
        : 'blowoff branch: the flow blows the flame off',
      'bass2.flam.eq61-branches',
    ),
    field('earthLimitPct', 'Earth limit, % O2 (1g, PMMA rods, 4 cm/s forced flow)', EARTH_LIMIT_O2_PCT, 'bass2.flam.vs-1g'),
    field(
      'gapPts',
      gap >= 0
        ? 'Points of O2 lower the orbit flame keeps burning than the Earth flame (model)'
        : 'Points of O2 sooner the orbit flame goes out than the Earth flame (model)',
      round(Math.abs(gap), 2),
      'twin.gap',
    ),
    field('ignitionLimitPct', 'BASS-II rods wouldn’t ignite below, % O2', IGNITION_LIMIT_O2_PCT, 'bass2.ign.limit-14.5'),
  ]
  if (args.action === 'drain') {
    fields.push(
      field('drainFromPct', 'The drain starts at, % O2', DRAIN.fromPct),
      field('drainToPct', 'The drain ends at, % O2', DRAIN.toPct),
      field('earthOutAtPct', 'The Earth flame goes out at, % O2', EARTH_LIMIT_O2_PCT, 'bass2.flam.vs-1g'),
      limit >= DRAIN.toPct
        ? field('orbitOutAtPct', 'The orbit flame goes out at, % O2 (model)', round(limit, 2), 'twin.orbit-limit')
        : field('orbitOutAtPct', 'The orbit flame at the end of the drain (model)', `still burning at ${DRAIN.toPct}%`, 'twin.orbit-limit'),
    )
  } else if (args.o2Pct !== undefined || args.action === 'ignite') {
    fields.push(
      field('o2Pct', 'Oxygen, % (set)', round(o2Pct, 2)),
      field('earthFlame', 'Earth flame at this O2 (1g limit)', o2Pct >= EARTH_LIMIT_O2_PCT ? 'burns' : 'goes out', 'bass2.flam.vs-1g'),
      field('orbitFlame', 'Orbit flame at this O2 (model)', o2Pct >= limit ? 'burns' : 'goes out', 'twin.orbit-limit'),
    )
  }
  fields.push(...quote('goldilocks', 'bass2.flam.goldilocks'), ...quote('reportMinimum', 'bass2.flam.min-o2'))
  if (flowCmS < 1) fields.push(...quote('lowFlowUncertain', 'bass2.flam.low-flow-uncertain'))

  // Only what changed: a drain always starts at 17%, so an O2 set alongside it isn't news.
  const words: string[] = []
  if (args.action === 'reset') words.push('reset it')
  if (args.o2Pct !== undefined && args.action !== 'drain' && args.o2Pct !== before.o2Pct) words.push(`set O2 to ${round(o2Pct, 1)}%`)
  if (args.flowCmS !== undefined && args.flowCmS !== before.flowCmS) words.push(`set airflow to ${round(flowCmS, 2)} cm/s`)
  if (args.rodMm !== undefined && args.rodMm !== before.rodMm) words.push(`chose the ${rodMm} mm rod`)
  if (args.action === 'ignite') words.push('lit both flames')
  if (args.action === 'drain') words.push('drained the oxygen')
  if (words.length === 0) words.push('showed the Burn Twin as it is')
  return { summary: words.join(', '), fields, claimIds: ['twin.orbit-limit', 'twin.gap', 'bass2.flam.vs-1g'] }
}

// ---------------------------------------------------------------------------------------------
// The cabin simulator.

const VOLUME_CLAIMS: [number, string][] = [
  [0.25, 'bass2.cstr.volume'],
  [106, 'bass2.us-lab-volume'],
]

const PRESET_QUOTES: Partial<Record<PresetId, [string, string][]>> = {
  m5: [
    ['tableRow', 'bass2.m5.row'],
    ['coOverRange', 'bass2.co.over-range'],
    ['lossOfSignal', 'bass2.note.m5-los'],
    ['window', 'bass2.m5.window'],
    ['leakRepaired', 'bass2.m5.leak-repaired'],
    ['doorRepair', 'bass2.m5.door-repair'],
    ['scatter', 'bass2.co.scatter'],
  ],
  'us-lab': [
    ['reportUsLab', 'bass2.co.smac'],
    ['dilution', 'bass2.cabin-dilution'],
  ],
  'small-cabin': [['smac', 'bass2.co.smac']],
  n2: [
    ['n2Flow', 'bass2.cstr.n2-flow'],
    ['dilutionHours', 'bass2.cstr.hours'],
    ['keepSuppressing', 'bass2.suppress-until-cool'],
    ['vaporJets', 'bass2.vapor-jet'],
  ],
  lunar: [
    ['lunarAtmospheres', 'zayac.atmospheres'],
    ['bass2Pressure', 'bass2.pressure-1atm'],
    ['flexPressure', 'psi69.pressure'],
    ['flexDroplets', 'psi69.droplets'],
    ['zayac1g', 'zayac.burns-34'],
  ],
}

/** The claim behind a run's starting CO2 and CO: Test M5's Table A.4 row, when they are its cells. */
const startClaim = (inputs: CabinInputs) =>
  inputs.co2InitPct === M5_START.co2InitPct && inputs.coInitPpm === M5_START.coInitPpm ? 'bass2.table.a4-m5' : undefined

const ALARM_WORDS: [LogKind, string, string][] = [
  ['smac-10', 'long-term SMAC', `${SMAC_LONG_TERM_PPM} ppm`],
  ['smac-55', '1-hour SMAC', `${SMAC_1_HOUR_PPM} ppm`],
]

function cabin(inputs: CabinInputs, preset: PresetId | null): Omit<Outcome, 'summary'> {
  const run = simulateCabin(inputs, stepOptions(inputs))
  const first = run[0]
  const quotes = (preset ? (PRESET_QUOTES[preset] ?? []) : []).flatMap(([key, id]) => quote(key, id))
  if (!first.valid) {
    const offPressure = inputs.pressureAtm !== 1
    const atm = inputs.pressureAtm
    return {
      fields: [
        field(
          'prediction',
          'What the cabin model does here',
          `no prediction: ${first.invalidReason ?? 'outside the tested range'}. The model only works at 1 atm; ` +
            'its refusal says nothing about whether experiments exist',
          'cabin.model',
        ),
        // The Interpret view's refusal banner, as one finding the answer can cite (SPEC F4, lunar).
        ...(offPressure
          ? [
              field(
                'coverage',
                'ZERO-DRAFT’s audit: what the indexed investigations cover at this pressure (our finding, from the quotes below)',
                'BASS-II’s solid-material tests ran at 1 atm. FLEX’s tests were planned at 0.5 to 1.5 atm' +
                  (atm >= 0.5 && atm <= 1.5 ? `, which includes ${round(psia(atm), 1)} psia (${round(atm, 2)} atm)` : '') +
                  ', but it burned liquid droplets, not solids. ' +
                  (preset === 'lunar'
                    ? 'NASA Glenn’s 1g lab tests (Zayac 2024) do burn solids at 34% oxygen and 8.2 psi. '
                    : '') +
                  'Nothing ZERO-DRAFT indexed covers solids at this pressure in microgravity or lunar gravity, so it ' +
                  'makes no prediction',
                'bass2.pressure-1atm',
              ),
            ]
          : []),
        field('o2StartPct', 'Oxygen, %', inputs.o2InitPct, preset === 'lunar' ? 'zayac.atmospheres' : undefined),
        field('pressurePsia', 'Pressure, psia', round(psia(inputs.pressureAtm), 1), preset === 'lunar' ? 'zayac.atmospheres' : undefined),
        field('modelRange', 'Where the model works', 'a sealed, well-mixed volume at 1 atm', 'cabin.model'),
        ...quotes,
      ],
      claimIds: ['cabin.model'],
    }
  }
  const last = run[run.length - 1]
  const entries = logEntries(run)
  const peak = run.reduce((most, state) => Math.max(most, state.coPpm), 0)
  const volumeClaim = VOLUME_CLAIMS.find(([v]) => Math.abs(v - inputs.volumeM3) < 1e-9)?.[1]
  const volumePlaces = inputs.volumeM3 < 10 ? 2 : inputs.volumeM3 < 100 ? 1 : 0
  const rod = inputs.geometry === 'concurrent-rod'
  const fields: ToolField[] = [
    field('volumeM3', 'Sealed volume, m³', round(inputs.volumeM3, volumePlaces), volumeClaim),
    field('powerW', 'Fire heat release, W (constant)', round(inputs.powerW, 2), Math.abs(inputs.powerW - M5_POWER_W) < 1e-9 ? 'cabin.m5-power' : undefined),
    field('durationMin', 'Burn length set, min', round(inputs.durationMin, 1)),
    field(
      'geometry',
      'Fire',
      rod ? 'concurrent PMMA rod, 550 ppm CO per 1% CO2' : 'opposed PMMA slab, 370 ppm CO per 1% CO2',
      rod ? 'bass2.co.550' : 'bass2.co.370',
    ),
    field('o2StartPct', 'Oxygen at the start, %', round(first.o2Pct, 2)),
    // The replay starts from what the MSG held before Test M5; a clean cabin starts from zero.
    ...(inputs.co2InitPct > 0 || inputs.coInitPpm > 0
      ? [
          field('co2StartPct', 'CO2 at the start, %', round(inputs.co2InitPct, 2), startClaim(inputs)),
          field('coStartPpm', 'CO at the start, ppm', round(inputs.coInitPpm, 1), startClaim(inputs)),
        ]
      : []),
    field('o2EndPct', 'Oxygen at the end, % (model)', round(last.o2Pct, 2), 'cabin.model'),
    field('co2EndPct', 'CO2 at the end, % (model)', round(last.co2Pct, 2), 'cabin.model'),
    field('coPeakPpm', 'Highest CO, ppm (model)', round(peak, 1), 'cabin.model'),
  ]
  for (const [kind, name, limit] of ALARM_WORDS) {
    const t = firstTime(entries, kind)
    fields.push(
      field(
        kind === 'smac-10' ? 'smac10' : 'smac55',
        `The ${name} (${limit}), model`,
        t === null ? `CO stays below the ${name} (${limit})` : `CO passes the ${name} (${limit}) at ${simTime(t)}`,
        'bass2.co.smac',
      ),
    )
  }
  if (stepOptions(inputs).coSensorCeilingPpm) {
    const t = firstTime(entries, 'sensor-1000')
    fields.push(
      field(
        'sensorCeiling',
        'The CSA-CP CO sensor’s 1,000 ppm ceiling, model',
        t === null ? 'CO stays under the CO sensor’s 1,000 ppm ceiling' : `CO reaches the CO sensor’s 1,000 ppm ceiling at ${simTime(t)}`,
        'bass2.co.sensor-range',
      ),
    )
  }
  const out = firstTime(entries, 'extinguished')
  fields.push(
    field(
      'flame',
      'What the flame does (model)',
      out !== null
        ? `goes out at its Eq. 6.1 limit at ${simTime(out)}`
        : rod
          ? 'keeps burning for the whole run'
          : `burns for the ${round(inputs.durationMin, 1)} min set: there is no extinction model for slabs`,
      out !== null ? 'twin.orbit-limit' : 'cabin.model',
    ),
  )
  for (const mark of volumeMarks(inputs, run) ?? []) {
    fields.push(
      field(
        `volumeFor${mark.limitPpm}M3`,
        `Below this volume, this fire passes ${mark.limitPpm} ppm (model), m³`,
        round(mark.volumeM3, 1),
        'cabin.volume-limit',
      ),
    )
  }
  fields.push(
    field('assumptions', 'What the model assumes', 'a sealed, well-mixed volume at 1 atm, no scrubbing; exposure time isn’t modeled', 'cabin.model'),
  )
  if (preset === 'm5') fields.push(field('replay', 'Replay', 'by construction: the O2 drop is Test M5’s own, from Table 5.1', 'bass2.m5.row'))
  return { fields: [...fields, ...quotes], claimIds: ['cabin.model'] }
}

function cabinPatchWords(args: CabinPatchArgs): string {
  const words: string[] = []
  if (args.volumeM3 !== undefined) words.push(`volume to ${args.volumeM3} m³`)
  if (args.powerW !== undefined) words.push(`heat release to ${args.powerW} W`)
  if (args.geometry !== undefined) words.push(args.geometry === 'concurrent-rod' ? 'a concurrent rod' : 'an opposed slab')
  if (args.rodMm !== undefined) words.push(`the ${args.rodMm} mm rod`)
  if (args.flowCmS !== undefined) words.push(`airflow to ${args.flowCmS} cm/s`)
  if (args.n2FlowCcMin !== undefined) words.push(`N2 flow to ${args.n2FlowCcMin} cm³/min`)
  if (args.n2StartMin !== undefined) words.push(`N2 start to ${args.n2StartMin} min`)
  if (args.durationMin !== undefined) words.push(`run length to ${args.durationMin} min`)
  return words.join(', ')
}

// ---------------------------------------------------------------------------------------------
// Navigation, Summarize and Rank.

function navigate({ view, params }: NavigateArgs, screen: Screen, rows: readonly Bass2Row[]): Outcome {
  if (view === 'interpret' && params.preset) {
    const preset = params.preset as PresetId
    screen.presetId = preset
    screen.inputs = PRESETS[preset].inputs
    return { ...cabin(screen.inputs, preset), summary: `opened ${PRESETS[preset].label}` }
  }
  if (view === 'summarize' && params.test) return showTest(params.test, rows)
  return { summary: `opened ${VIEW_LABELS[view]}`, fields: [field('view', 'View', VIEW_LABELS[view])], claimIds: [] }
}

function showTest(testId: string, rows: readonly Bass2Row[]): Outcome {
  const row = rows.find((r) => r.testId === testId)
  if (!row) return { summary: `looked for ${testId}`, fields: [field('test', 'Test', `${testId} is not in the BASS-II table`)], claimIds: [] }
  const quarantined = isQuarantined(row)
  const fields: ToolField[] = [
    field('test', 'Test', row.testId),
    field('pi', 'Principal investigator', row.pi),
    field('material', 'Sample, as the CSV writes it', row.material),
    field('o2InitPct', 'Calibrated initial O2 in the CSV, %', row.o2InitPct ?? 'not recorded'),
    field('o2FinalPct', 'Calibrated final O2 in the CSV, %', row.o2FinalPct ?? 'not recorded'),
    field('quarantined', 'In the quarantine bay', quarantined ? 'yes: its final O2 is missing or physically impossible' : 'no'),
  ]
  const claimIds: string[] = []
  const claim = getClaim(forensicClaimId(row.testId))
  if (row.flags.includes('o2-impossible') && claim?.verified && claim.quote) {
    const math = o2Forensic(row, claim.quote)
    const one = (value: number | null) => (value ?? 0).toFixed(1)
    fields.push(
      field(
        'forensicMath',
        'ZERO-DRAFT’s audit: its arithmetic that reproduces the impossible value from NASA’s row',
        `${one(math.uncalibratedFinal)} + ${one(math.offset)} = ${one(math.reproduced)}`,
        claim.id,
      ),
      field(
        'forensicCause',
        'ZERO-DRAFT’s audit: why the value is impossible (our finding, not the report’s)',
        math.blank === 'uncalibrated-initial'
          ? 'the uncalibrated initial reading was blank, so the day’s offset became the whole initial reading, and was added to the final'
          : math.blank === 'uncalibrated-final'
            ? 'the uncalibrated final reading was blank, so the final “reading” is just the day’s offset'
            : 'calibrated = uncalibrated + that day’s offset',
        claim.id,
      ),
      ...quote('appendixRow', claim.id),
      ...quote('o2Columns', 'bass2.table.o2-columns'),
      ...quote('offsetRule', 'bass2.sensor.mca-offset'),
    )
    claimIds.push(claim.id)
  }
  return { summary: `showed ${row.testId}${quarantined ? ' in the quarantine bay' : ''}`, fields, claimIds }
}

function filterTests(args: FilterArgs, rows: readonly Bass2Row[]): Outcome {
  const filters: TestFilters = { ...NO_FILTERS, pi: args.pi ?? null, sample: args.geometry ? `family:${args.geometry}` : null }
  const matching = rows.filter((row) => matchesFilters(row, filters))
  const quarantined = matching.filter((row) => isQuarantined(row))
  const fields: ToolField[] = [
    field('tests', 'BASS-II tests that match', matching.length),
    field('burnConfirmed', 'Of those, burn-confirmed by the sensors (CO2 rose at least 0.2%)', matching.filter((row) => row.burnConfirmed).length, 'bass2.sensor.co2-res'),
    field('quarantinedTests', 'Of those, quarantined', quarantined.length),
  ]
  if (quarantined.length > 0 && quarantined.length <= 8) {
    fields.push(field('quarantinedIds', 'Quarantined tests', quarantined.map((row) => row.testId).join(', ')))
  }
  if (args.quarantine !== undefined) {
    fields.push(field('quarantine', 'Quarantine', args.quarantine ? 'on: tests with impossible or missing final O2 move to the bay' : 'off'))
  }
  const words: string[] = []
  if (args.pi) words.push(`showed ${args.pi}’s tests`)
  if (args.geometry) words.push(`${args.pi ? '' : 'showed '}${SAMPLE_FAMILY_LABELS[args.geometry].toLowerCase()}`.trim())
  if (!args.pi && !args.geometry) words.push('showed all tests')
  if (args.quarantine !== undefined) words.push(`turned quarantine ${args.quarantine ? 'on' : 'off'}`)
  return { summary: words.join(', '), fields, claimIds: [] }
}

function highlight(id: string, weights: Weights, rows: readonly Bass2Row[]): Outcome {
  const all = entities(rows)
  const entity = all.find((e) => e.id === id)!
  const board = leaderboard(all, weights)
  const row = board.rows.find((r) => r.entity.id === id)
  if (!row) {
    const group = unrankedGroups(all, rows).find((g) => g.family === entity.family)
    const reason = group?.reason
    const why =
      reason?.kind === 'finding'
        ? 'not ranked: NASA’s own finding is shown instead'
        : reason?.kind === 'too-small'
          ? `not ranked: no fire moved the sensors past their resolution (largest CO2 rise ${reason.largestCo2RisePct ?? 'not recorded'}%)`
          : reason?.kind === 'few-burns'
            ? `not ranked: only ${reason.burnConfirmed} burn-confirmed tests, and a type needs 3`
            : 'not ranked at these weights'
    const findings = reason?.kind === 'finding' ? reason.claimIds.flatMap((claimId, i) => quote(`finding${i + 1}`, claimId)) : []
    return {
      summary: `pointed to ${entity.label}`,
      fields: [field('type', 'Sample type', entity.label), field('tests', 'BASS-II tests', entity.tests), field('ranked', 'On the index', why), ...findings],
      claimIds: reason?.kind === 'finding' ? reason.claimIds : ['rank.index'],
    }
  }
  const { lowO2, coYield } = entity.components
  const fields: ToolField[] = [
    field('type', 'Sample type', entity.label),
    field('rank', 'Rank on the index at these weights', row.rank, 'rank.index'),
    field('rankedTypes', 'Sample types ranked', board.rows.length, 'rank.index'),
    field('index', 'Index, 0 to 100', round(row.index, 1), 'rank.index'),
    field('tests', 'BASS-II tests', entity.tests),
    field('burnConfirmed', 'Burn-confirmed tests', entity.burnConfirmed),
    field('what', 'What the index is', 'our composite of measured BASS-II indicators, not a NASA rating', 'rank.index'),
  ]
  if (lowO2) {
    fields.push(field('lowO2Pct', 'Lowest final O2 among its burn-confirmed tests, %', lowO2.value, 'rank.low-o2'))
    if (lowO2.testId) fields.push(field('lowO2Test', 'That test', lowO2.testId, 'rank.low-o2'))
  }
  if (coYield) fields.push(field('coYield', 'Median ppm CO per 1% CO2', coYield.value, 'rank.co-yield'))
  return { summary: `highlighted ${entity.label}`, fields, claimIds: ['rank.index'] }
}

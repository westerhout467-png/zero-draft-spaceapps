// INTERPRET's simulator (SPEC F4): the five presets, and the pure helpers the view and its store
// share: which model state shows at a given time, the alarm log, the chart scales and the volume
// marks. The model itself is cabin.ts; nothing here changes a number it makes.
import {
  averagePowerW,
  CO_SENSOR_CEILING_PPM,
  heatFromO2Drop,
  MSG_N2_FLOW_CC_MIN,
  MSG_VOLUME_M3,
  SMAC_1_HOUR_PPM,
  SMAC_LONG_TERM_PPM,
  US_LAB_VOLUME_M3,
  volumeWhereCoReaches,
  type AlarmKind,
  type CabinInputs,
  type CabinState,
  type StepOptions,
} from './cabin'
import { ROD_DIAMETERS_MM, type RodMm } from './physics'

export const PRESET_IDS = ['m5', 'us-lab', 'small-cabin', 'n2', 'lunar'] as const
export type PresetId = (typeof PRESET_IDS)[number]

export function isPresetId(value: unknown): value is PresetId {
  return typeof value === 'string' && (PRESET_IDS as readonly string[]).includes(value)
}

/** Simulated seconds per second of display time. */
export const SPEEDS = [1, 60, 600] as const
export type Speed = (typeof SPEEDS)[number]

export function isSpeed(value: unknown): value is Speed {
  return (SPEEDS as readonly unknown[]).includes(value)
}

/**
 * Test M5's row in Table 5.1: 10 cm/s, a 27.2 min burn, O2 from 22.2 % to 19 %.
 * Quoted: bass2.m5.row (p. 57). claims.test.ts checks each value is in the quote.
 */
export const M5_TEST = { flowCmS: 10, minutes: 27.2, o2InitPct: 22.2, o2FinalPct: 19 } as const

/**
 * What the MSG held when Test M5 was lit, from its row in Table A.4 (and its CSV cells): 0.44 %
 * CO2 and 9 ppm CO left from earlier tests. The replay starts from them, so its end can be read
 * against the test's own final cells. Quoted: bass2.table.a4-m5 (p. 109).
 */
export const M5_START = { co2InitPct: 0.44, coInitPpm: 9 } as const

/** M5's average heat release rate, 83.48 W: its O2 drop in the MSG through Huggett (cabin.m5-power). */
export const M5_POWER_W = averagePowerW(
  heatFromO2Drop(MSG_VOLUME_M3, M5_TEST.o2InitPct - M5_TEST.o2FinalPct).kJ,
  M5_TEST.minutes,
)

/** 1 atm in psia and kPa, for showing pressure (SPEC §6). Unit conversions, not data. */
export const PSIA_PER_ATM = 14.696
export const KPA_PER_ATM = 101.325

/** The lunar lander and rover atmosphere: 34 % O2 at 8.2 psia. Quoted: zayac.atmospheres. */
export const LUNAR_ATMOSPHERE = { o2Pct: 34, psia: 8.2 } as const

/**
 * The small-cabin preset opens at 3 m³, under the 4.5 m³ where the M5 fire passes 55 ppm, so
 * pressing play crosses the line partway through the burn. A choice for the demo, not NASA data.
 */
export const SMALL_CABIN_M3 = 3

/**
 * The N2 preset (SPEC F4): the 6.35 mm rod at 2 cm/s, a small 5 W fire, room air in the MSG
 * (20.9 %, the CSA-CP's reading at the start of NASA's dilution calibration; quoted:
 * bass2.cstr.c0, p. 116) and the calibration's N2 flow. 4 h is long enough to see the flame go out.
 * The fire size is our choice.
 */
export const N2_PRESET = { o2InitPct: 20.9, powerW: 5, rodMm: 6.35 as RodMm, flowCmS: 2, durationMin: 240 }

export interface Preset {
  id: PresetId
  /** What the preset button says. */
  label: string
  inputs: CabinInputs
  /** Display speed it opens at. */
  speed: Speed
}

/**
 * Test M5's fire in the MSG, in clean air: constant power, no N2. The other fire presets start
 * from it; only the replay adds what the MSG held before M5 (M5_START).
 */
const M5_FIRE: CabinInputs = {
  volumeM3: MSG_VOLUME_M3,
  pressureAtm: 1,
  o2InitPct: M5_TEST.o2InitPct,
  co2InitPct: 0,
  coInitPpm: 0,
  powerW: M5_POWER_W,
  geometry: 'opposed-slab',
  // Slabs don't use these; they are here so switching the shape to a rod has a rod to show.
  rodMm: 6.35,
  flowCmS: M5_TEST.flowCmS,
  n2FlowCcMin: 0,
  n2StartMin: 0,
  durationMin: M5_TEST.minutes,
}

export const PRESETS: Record<PresetId, Preset> = {
  m5: { id: 'm5', label: 'Replay Test M5', inputs: { ...M5_FIRE, ...M5_START }, speed: 60 },
  'us-lab': {
    id: 'us-lab',
    label: 'Move it into the US Lab',
    inputs: { ...M5_FIRE, volumeM3: US_LAB_VOLUME_M3 },
    speed: 60,
  },
  'small-cabin': {
    id: 'small-cabin',
    label: 'Same fire, small sealed cabin',
    inputs: { ...M5_FIRE, volumeM3: SMALL_CABIN_M3 },
    speed: 600,
  },
  n2: {
    id: 'n2',
    label: 'N2 dilution in the glovebox',
    inputs: {
      ...M5_FIRE,
      o2InitPct: N2_PRESET.o2InitPct,
      powerW: N2_PRESET.powerW,
      geometry: 'concurrent-rod',
      rodMm: N2_PRESET.rodMm,
      flowCmS: N2_PRESET.flowCmS,
      n2FlowCcMin: MSG_N2_FLOW_CC_MIN,
      durationMin: N2_PRESET.durationMin,
    },
    speed: 600,
  },
  lunar: {
    id: 'lunar',
    label: 'Lunar lander, 34% O2',
    inputs: {
      ...M5_FIRE,
      o2InitPct: LUNAR_ATMOSPHERE.o2Pct,
      pressureAtm: LUNAR_ATMOSPHERE.psia / PSIA_PER_ATM,
    },
    speed: 60,
  },
}

const NUMERIC_INPUTS = [
  'volumeM3',
  'pressureAtm',
  'o2InitPct',
  'co2InitPct',
  'coInitPpm',
  'powerW',
  'flowCmS',
  'n2FlowCcMin',
  'n2StartMin',
  'durationMin',
] as const

/**
 * Applies a patch to the simulator's inputs, keeping only the fields a caller may set and only
 * values the model can take. The view's controls and Lab Partner's set_cabin both use it.
 */
export function mergeInputs(inputs: CabinInputs, patch: Partial<CabinInputs>): CabinInputs {
  const next: CabinInputs = { ...inputs }
  for (const key of NUMERIC_INPUTS) {
    const value = patch[key]
    if (typeof value === 'number' && Number.isFinite(value)) next[key] = value
  }
  if (patch.geometry === 'opposed-slab' || patch.geometry === 'concurrent-rod') next.geometry = patch.geometry
  if (patch.rodMm !== undefined && (ROD_DIAMETERS_MM as readonly number[]).includes(patch.rodMm)) {
    next.rodMm = patch.rodMm
  }
  // A rod always needs a size and an airflow.
  if (next.geometry === 'concurrent-rod') {
    next.rodMm ??= ROD_DIAMETERS_MM[0]
    next.flowCmS ??= 2
  }
  return next
}

/** The preset a test's record links to ("Replay this test"), if it has one. */
export function replayPresetFor(testId: string): PresetId | null {
  return testId === 'M5' ? 'm5' : null
}

/**
 * The CSA-CP sensor sat in the MSG, so a run in the MSG's volume also logs its 1,000 ppm ceiling
 * (SPEC F4, bass2.co.sensor-range). Anywhere else there is no such sensor to saturate.
 */
export function stepOptions(inputs: CabinInputs): StepOptions {
  return inputs.volumeM3 === MSG_VOLUME_M3 ? { coSensorCeilingPpm: CO_SENSOR_CEILING_PPM } : {}
}

/** The last simulated second. A run that made no prediction ends at 0. */
export function endSec(run: readonly CabinState[]): number {
  return run[run.length - 1].tSec
}

/**
 * The model state showing at `tSec`. Runs step 1 s at a time (simulateCabin's default), so
 * run[i] is at i seconds, except a last, shorter step.
 */
export function stateAt(run: readonly CabinState[], tSec: number): CabinState {
  if (tSec >= endSec(run) - 1e-9) return run[run.length - 1]
  return run[Math.max(0, Math.floor(tSec + 1e-9))]
}

export type LogKind = AlarmKind | 'burn-ended'
export interface LogEntry {
  tSec: number
  kind: LogKind
}

const logCache = new WeakMap<readonly CabinState[], LogEntry[]>()

/**
 * Everything the alarm log can show for a run, in time order: the model's own alarms, plus the
 * moment a slab's burn reached the length that was set. Nothing is added that the model didn't
 * produce (CLAUDE.md rule 5).
 */
export function logEntries(run: readonly CabinState[]): LogEntry[] {
  const cached = logCache.get(run)
  if (cached) return cached
  const entries: LogEntry[] = run[run.length - 1].alarms.map((alarm) => ({ ...alarm }))
  const ended = run.find((state) => state.flame === 'out-duration')
  if (ended) entries.push({ tSec: ended.tSec, kind: 'burn-ended' })
  entries.sort((a, b) => a.tSec - b.tSec)
  logCache.set(run, entries)
  return entries
}

/** How many log entries have happened by `tSec`. */
export function passedCount(entries: readonly LogEntry[], tSec: number): number {
  let count = 0
  while (count < entries.length && entries[count].tSec <= tSec + 1e-9) count++
  return count
}

/** When the run first logged `kind`, or null if it never did. */
export function firstTime(entries: readonly LogEntry[], kind: LogKind): number | null {
  return entries.find((entry) => entry.kind === kind)?.tSec ?? null
}

/** "14:32", minutes and seconds of simulated time. Minutes go past 59 rather than adding hours. */
export function clock(tSec: number): string {
  const whole = Math.max(0, Math.floor(tSec + 1e-6))
  const minutes = Math.floor(whole / 60)
  const seconds = whole % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** "T+14:32" */
export function simTime(tSec: number): string {
  return `T+${clock(tSec)}`
}

export const psia = (atm: number) => atm * PSIA_PER_ATM
export const kPa = (atm: number) => atm * KPA_PER_ATM

/**
 * Where on the volume slider CO would cross each limit for this fire: below that volume, the
 * burn passes the limit (cabin.volume-limit). Exact only for a sealed volume with no N2 and no
 * starting CO, and for a rod only if it burns the whole time; otherwise there are no marks.
 */
export function volumeMarks(
  inputs: CabinInputs,
  run: readonly CabinState[],
): { limitPpm: number; volumeM3: number }[] | null {
  if (!run[0].valid || inputs.powerW <= 0 || inputs.n2FlowCcMin > 0 || inputs.coInitPpm > 0) return null
  if (run.some((state) => state.flame === 'out-limit')) return null
  return [SMAC_1_HOUR_PPM, SMAC_LONG_TERM_PPM].map((limitPpm) => ({
    limitPpm,
    volumeM3: volumeWhereCoReaches(limitPpm, inputs),
  }))
}

/** The volume slider: 1 to 40 m³ for the small cabin (SPEC F4), a log scale wide enough for the US Lab elsewhere. */
export function volumeScale(presetId: PresetId): { min: number; max: number; log: boolean } {
  return presetId === 'small-cabin' ? { min: 1, max: 40, log: false } : { min: 0.1, max: 150, log: true }
}

// Chart scales. Each run's charts are scaled once to the whole run, so nothing rescales while
// the lines draw.

const NICE = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]

/** The smallest round number at or above `value`: 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10^k. */
export function niceCeil(value: number): number {
  if (!(value > 0)) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  const nice = NICE.find((step) => step * power >= value - 1e-12) ?? 10
  return nice * power
}

/** Round tick values from `from` to `to`, at most `maxTicks` of them. */
export function ticks(from: number, to: number, maxTicks = 5): number[] {
  const span = to - from
  if (!(span > 0)) return [from]
  const power = 10 ** Math.floor(Math.log10(span))
  const step =
    [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10].map((s) => s * power).find((s) => span / s <= maxTicks - 1) ??
    span
  const out: number[] = []
  for (let v = Math.ceil(from / step - 1e-9) * step; v <= to + 1e-9; v += step) {
    out.push(Number(v.toPrecision(12)))
  }
  return out
}

export interface Domain {
  min: number
  max: number
}

const peak = (run: readonly CabinState[], pick: (state: CabinState) => number) =>
  run.reduce((most, state) => Math.max(most, pick(state)), -Infinity)
const low = (run: readonly CabinState[], pick: (state: CabinState) => number) =>
  run.reduce((least, state) => Math.min(least, pick(state)), Infinity)

/** O2 in whole points, at least 4 points tall, wide enough for the Eq. 6.1 limit when there is one. */
export function o2Domain(run: readonly CabinState[], limitPct: number | null): Domain {
  const top = Math.ceil(peak(run, (s) => s.o2Pct) + 0.5)
  const bottom = Math.floor(Math.min(low(run, (s) => s.o2Pct), limitPct ?? Infinity) - 0.5)
  return { min: Math.min(bottom, top - 4), max: top }
}

/** CO2 from 0, at least 0.5 % tall. */
export function co2Domain(run: readonly CabinState[]): Domain {
  return { min: 0, max: niceCeil(Math.max(peak(run, (s) => s.co2Pct), 0.5) * 1.1) }
}

/** CO from 0, always tall enough to show the limit lines, so a run that stays far below them says so. */
export function coDomain(run: readonly CabinState[], lines: readonly number[]): Domain {
  return { min: 0, max: niceCeil(Math.max(peak(run, (s) => s.coPpm), ...lines) * 1.1) }
}

/** Minutes between time-axis ticks, so a run shows about 4 to 7 of them. */
export function timeTickMinutes(endMinutes: number): number {
  return [1, 2, 5, 10, 15, 30, 60, 120].find((step) => endMinutes / step <= 6) ?? 120
}

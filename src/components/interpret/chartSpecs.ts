// What each of INTERPRET's three strip charts shows for a run: its scale, its line, and its limit
// lines with the band each fills once the model crosses it. Every limit and crossing time comes
// from cabin.ts, physics.ts and the run's own alarm log (CLAUDE.md rule 5).
import {
  CO_SENSOR_CEILING_PPM,
  SMAC_1_HOUR_PPM,
  SMAC_LONG_TERM_PPM,
  type CabinInputs,
  type CabinState,
} from '../../lib/cabin'
import {
  co2Domain,
  coDomain,
  firstTime,
  logEntries,
  o2Domain,
  stepOptions,
  type Domain,
} from '../../lib/interpret'
import { o2LimitPct } from '../../lib/physics'

export type Tone = 'cyan' | 'amber' | 'red' | 'muted' | 'ink'

export interface ChartLimit {
  value: number
  tone: Tone
  dotted: boolean
  /** Written on the line, e.g. "55 ppm, 1-hour SMAC". */
  label: string
  cite: string
  /** Which end of the line the label sits at, clear of where the data line usually is. */
  labelAt: 'left' | 'right'
  /** The band this limit fills from the moment the model crosses it, or null if it never does. */
  band: { from: number; to: number; crossAt: number } | null
}

export interface ChartSpec {
  id: 'o2' | 'co2' | 'co'
  title: string
  tone: 'cyan' | 'ink'
  pick: (state: CabinState) => number
  domain: Domain
  limits: ChartLimit[]
  formatTick: (value: number) => string
}

const fmtPpm = (value: number) => value.toLocaleString('en-US')

export function chartSpecs(run: readonly CabinState[], inputs: CabinInputs): ChartSpec[] {
  const entries = logEntries(run)
  const rod = inputs.geometry === 'concurrent-rod'
  const limitPct = rod ? o2LimitPct(inputs.flowCmS ?? 2, inputs.rodMm ?? 6.35) : null
  const sensor = stepOptions(inputs).coSensorCeilingPpm ?? null
  const coLines = sensor ? [SMAC_LONG_TERM_PPM, SMAC_1_HOUR_PPM, sensor] : [SMAC_LONG_TERM_PPM, SMAC_1_HOUR_PPM]

  const o2 = o2Domain(run, limitPct)
  const co = coDomain(run, coLines)
  const band = (from: number, to: number, crossAt: number | null) =>
    crossAt === null ? null : { from, to: Math.min(to, co.max), crossAt }
  const extinguished = firstTime(entries, 'extinguished')

  const coLimits: ChartLimit[] = [
    {
      value: SMAC_LONG_TERM_PPM,
      tone: 'amber',
      dotted: false,
      label: `${SMAC_LONG_TERM_PPM} ppm, long-term SMAC`,
      cite: 'bass2.co.smac',
      labelAt: 'right',
      band: band(SMAC_LONG_TERM_PPM, SMAC_1_HOUR_PPM, firstTime(entries, 'smac-10')),
    },
    {
      value: SMAC_1_HOUR_PPM,
      tone: 'red',
      dotted: false,
      label: `${SMAC_1_HOUR_PPM} ppm, 1-hour SMAC`,
      cite: 'bass2.co.smac',
      labelAt: 'right',
      band: band(SMAC_1_HOUR_PPM, sensor ?? co.max, firstTime(entries, 'smac-55')),
    },
  ]
  if (sensor) {
    coLimits.push({
      value: sensor,
      tone: 'muted',
      dotted: true,
      label: `CSA-CP sensor ceiling, ${fmtPpm(CO_SENSOR_CEILING_PPM)} ppm`,
      cite: 'bass2.co.sensor-range',
      labelAt: 'right',
      band: band(sensor, co.max, firstTime(entries, 'sensor-1000')),
    })
  }

  return [
    {
      id: 'o2',
      title: 'Oxygen, %',
      tone: 'cyan',
      pick: (state) => state.o2Pct,
      domain: o2,
      limits:
        limitPct === null
          ? []
          : [
              {
                value: limitPct,
                tone: 'cyan',
                dotted: true,
                label: `Eq. 6.1 limit, ${limitPct.toFixed(2)}% (model)`,
                cite: 'twin.orbit-limit',
                labelAt: 'left',
                band: extinguished === null ? null : { from: o2.min, to: limitPct, crossAt: extinguished },
              },
            ],
      formatTick: (value) => String(value),
    },
    {
      id: 'co2',
      title: 'Carbon dioxide, %',
      tone: 'ink',
      pick: (state) => state.co2Pct,
      domain: co2Domain(run),
      limits: [],
      formatTick: (value) => (Number.isInteger(value) ? String(value) : value.toFixed(value * 10 === Math.round(value * 10) ? 1 : 2)),
    },
    {
      id: 'co',
      title: 'Carbon monoxide, ppm',
      tone: 'ink',
      pick: (state) => state.coPpm,
      domain: co,
      limits: coLimits,
      formatTick: fmtPpm,
    },
  ]
}

/**
 * The run as an SVG path for one chart: at most one point per pixel column, so a 4-hour run
 * costs no more to draw than a short one. Built once per run; playback only moves a clip.
 */
export function linePath(
  run: readonly CabinState[],
  pick: (state: CabinState) => number,
  x: (tSec: number) => number,
  y: (value: number) => number,
  columns: number,
): string {
  const count = Math.max(2, Math.min(run.length, Math.ceil(columns)))
  const stride = (run.length - 1) / (count - 1)
  let d = ''
  for (let i = 0; i < count; i++) {
    const state = run[Math.round(i * stride)]
    d += `${i === 0 ? 'M' : 'L'}${x(state.tSec).toFixed(1)} ${y(pick(state)).toFixed(1)}`
  }
  return d
}

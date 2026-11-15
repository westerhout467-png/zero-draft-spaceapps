import { useMemo } from 'react'
import { Bar, BarChart, ReferenceArea, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import { O2_RESOLUTION_PCT, roundTo, type Bass2Row } from '../../lib/audit'
import { getClaim } from '../../lib/claims'
import { histogram, type Bin } from '../../lib/stats'
import { Cite } from '../Cite'
import { Panel } from '../Panel'

const TICK = { fontSize: 12, fill: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }
const LABEL = { fontSize: 12, fill: 'var(--color-ink)', fontFamily: 'var(--font-sans)' }
const MARGIN = { top: 22, right: 12, bottom: 0, left: 0 }

type Chart = {
  title: string
  unit: string
  bins: (Bin & { mid: number })[]
  n: number
  decimals: number
  /** Axis ticks fall on round multiples of this. */
  tickStep: number
}

/** Round ticks across a chart: multiples of its tickStep inside the first and last bin. */
function ticksFor(chart: Chart): number[] {
  const first = chart.bins[0]?.x0
  const last = chart.bins.at(-1)?.x1
  if (first === undefined || last === undefined) return []
  const ticks: number[] = []
  for (let t = Math.ceil(first / chart.tickStep) * chart.tickStep; t <= last + 1e-9; t += chart.tickStep) {
    ticks.push(roundTo(t, 4))
  }
  return ticks
}

function withMid(bins: Bin[]) {
  return bins.map((bin) => ({ ...bin, mid: roundTo((bin.x0 + bin.x1) / 2, 4) }))
}

/** A bar's hover readout: its range and how many tests. */
function BinTooltip({ active, payload, unit, decimals }: { active?: boolean; payload?: { payload: Bin }[]; unit: string; decimals: number }) {
  const bin = payload?.[0]?.payload
  if (!active || !bin) return null
  return (
    <div className="rounded-sm border border-line bg-panel px-2 py-1 text-xs leading-4 text-ink">
      <span className="tabular-nums">
        {bin.x0.toFixed(decimals)} to {bin.x1.toFixed(decimals)}
      </span>{' '}
      {unit}: <span className="tabular-nums">{bin.count}</span> {bin.count === 1 ? 'test' : 'tests'}
    </div>
  )
}

function Histogram({ chart, children }: { chart: Chart; children?: React.ReactNode }) {
  return (
    <BarChart
      responsive
      data={chart.bins}
      margin={MARGIN}
      barCategoryGap={1}
      style={{ width: '100%', height: '100%' }}
      role="img"
      aria-label={`Bar chart: ${chart.title}, ${chart.n} tests`}
    >
      <XAxis
        dataKey="mid"
        type="number"
        domain={[chart.bins[0]?.x0 ?? 0, chart.bins.at(-1)?.x1 ?? 1]}
        tick={TICK}
        tickSize={4}
        ticks={ticksFor(chart)}
        interval={0}
        stroke="var(--color-line)"
        height={24}
      />
      <YAxis allowDecimals={false} width={32} tick={TICK} tickSize={4} stroke="var(--color-line)" />
      <Tooltip
        cursor={{ fill: 'var(--color-ink)', fillOpacity: 0.06 }}
        isAnimationActive={false}
        content={<BinTooltip unit={chart.unit} decimals={chart.decimals} />}
      />
      {children}
      <Bar dataKey="count" fill="var(--color-cyan)" fillOpacity={0.85} isAnimationActive={false} />
    </BarChart>
  )
}

/**
 * Small multiples of initial O2, O2 drop and CO per CO2 over the tests the filters keep, leaving
 * out quarantined tests (O2 unusable). CO per CO2 is over burn-confirmed tests only.
 */
export function DistributionStrip({ rows }: { rows: Bass2Row[] }) {
  const charts = useMemo(() => {
    const usable = rows.filter((row) => row.o2Usable)
    const init = usable.map((row) => row.o2InitPct as number)
    const drop = usable.map((row) => roundTo((row.o2InitPct as number) - (row.o2FinalPct as number), 2))
    const yields = rows.flatMap((row) => (row.coPerCo2 === null ? [] : [row.coPerCo2]))
    const floorTo = (values: number[], step: number) => Math.floor(Math.min(...values) / step) * step
    return {
      init: { title: 'Initial O2, %', unit: '% O2', n: init.length, decimals: 1, tickStep: 2, bins: withMid(init.length ? histogram(init, floorTo(init, 0.5), 0.5) : []) },
      drop: {
        title: 'O2 drop, initial minus final, points',
        unit: 'points',
        n: drop.length,
        decimals: 2,
        tickStep: 0.5,
        bins: withMid(drop.length ? histogram(drop, roundTo(floorTo(drop, 0.1) - 0.05, 4), 0.1) : []),
      },
      yields: {
        title: 'CO per 1% CO2, ppm (burn confirmed)',
        unit: 'ppm per 1% CO2',
        n: yields.length,
        decimals: 0,
        tickStep: 200,
        bins: withMid(yields.length ? histogram(yields, floorTo(yields, 50), 50) : []),
      },
    } satisfies Record<string, Chart>
  }, [rows])
  // Confirmed burns left out of CO per CO2 because a CO cell reads "OR", ">500" or nothing.
  const burnsWithoutCo = useMemo(() => rows.filter((row) => row.burnConfirmed && row.coPerCo2 === null).length, [rows])

  const slab = getClaim('bass2.co.370')?.value
  const rod = getClaim('bass2.co.550')?.value

  return (
    <div className="grid grid-cols-3 gap-6">
      {[charts.init, charts.drop, charts.yields].map((chart) => (
        <div key={chart.title} className="flex flex-col gap-2">
          <h3 className="flex items-baseline justify-between gap-2 text-sm leading-5 font-semibold">
            {chart.title}
            <span className="text-xs font-normal text-muted">
              <span className="tabular-nums">{chart.n}</span> tests
            </span>
          </h3>
          <Panel label={chart.title} className="h-44">
            {chart.n === 0 ? (
              <p className="p-4 text-sm text-muted">No tests match the filters.</p>
            ) : (
              <Histogram chart={chart}>
                {chart === charts.drop && (
                  <ReferenceArea
                    x1={roundTo(-O2_RESOLUTION_PCT - 0.05, 4)}
                    x2={roundTo(O2_RESOLUTION_PCT + 0.05, 4)}
                    ifOverflow="hidden"
                    fill="var(--color-amber)"
                    fillOpacity={0.12}
                    label={{ value: `Inside ±${O2_RESOLUTION_PCT} resolution`, position: 'insideTopLeft', dy: -18, ...LABEL }}
                  />
                )}
                {chart === charts.yields && slab !== undefined && (
                  <ReferenceLine x={slab} stroke="var(--color-amber)" strokeDasharray="4 3" label={{ value: `${slab}`, position: 'top', ...LABEL }} />
                )}
                {chart === charts.yields && rod !== undefined && (
                  <ReferenceLine x={rod} stroke="var(--color-amber)" strokeDasharray="4 3" label={{ value: `${rod}`, position: 'top', ...LABEL }} />
                )}
              </Histogram>
            )}
          </Panel>
          {chart === charts.drop && (
            <p className="text-xs leading-5 text-muted">
              The amber band is inside the O2 sensor’s ±<span className="tabular-nums">{O2_RESOLUTION_PCT}</span> resolution
              <Cite id="bass2.sensor.o2-res" />
            </p>
          )}
          {chart === charts.yields && (
            <p className="text-xs leading-5 text-muted">
              {burnsWithoutCo > 0 && (
                <>
                  <span className="tabular-nums">{burnsWithoutCo}</span> more confirmed{' '}
                  {burnsWithoutCo === 1 ? 'burn has' : 'burns have'} a CO cell that isn’t a number.{' '}
                </>
              )}
              Dashed lines: NASA’s averages, about <span className="tabular-nums">{slab}</span> for opposed slabs
              <Cite id="bass2.co.370" /> and <span className="tabular-nums">{rod}</span> for concurrent rods
              <Cite id="bass2.co.550" />
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

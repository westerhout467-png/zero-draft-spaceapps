import { useMemo, useRef } from 'react'
import { Area, ComposedChart, Line, ReferenceLine, usePlotArea, XAxis, YAxis } from 'recharts'
import { burnStore, useTwin } from '../../lib/burnStore'
import { FLOW_RANGE_CM_S, O2_RANGE_PCT } from '../../lib/burnTwin'
import { blowoffBranch, EARTH_LIMIT_O2_PCT, o2LimitPct, ROD_DIAMETERS_MM, type RodMm } from '../../lib/physics'
import { flowToX, limitCurve, regionAt, UNCERTAIN_BELOW_CM_S } from '../../lib/rankCharts'
import { setText } from '../twin/twinFrame'
import { Segmented } from '../Segmented'
import { MapOverlay } from './MapOverlay'
import { useBurnState } from './useBurnState'

const FLOW_TICKS = [0.2, 0.5, 1, 2, 5, 10, 20, 40]
const O2_TICKS = [12, 14, 16, 18, 20, 22]
const TICK = { fontSize: 12, fill: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }
const AXIS_TITLE = { fontSize: 12, fill: 'var(--color-muted)', fontFamily: 'var(--font-sans)' }
const ROD_OPTIONS = ROD_DIAMETERS_MM.map((rod) => ({ value: String(rod), label: `${rod} mm` }))

/**
 * F3b: the flammability map (Olson's U-curve). Eq. 6.1 for the selected rod across the whole
 * airflow range, the sustained region above it washed faint red, the 1g and zero-stretch lines,
 * the hatched low-flow band and a rug of BASS-II rod tests on the O2 axis. Its point and its rod
 * size are the Burn Twin's own state, so moving either here moves the Overview, and back.
 * Every line is labelled where it is drawn; there is no legend.
 */
export function FlammabilityMap({ rug }: { rug: { testId: string; o2Pct: number }[] }) {
  const rodMm = useTwin((state) => state.rodMm)
  const data = useMemo(() => limitCurve(rodMm), [rodMm])
  return (
    <section aria-labelledby="map-heading" className="flex min-w-0 flex-col gap-4">
      <div className="flex items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="map-heading" className="text-base leading-6 font-semibold">
            Flammability map, PMMA rods at 1 atm
          </h2>
          <p className="text-sm leading-5 text-muted">
            Drag the point, or focus it and use the arrow keys. It is the Burn Twin’s oxygen and airflow.
          </p>
        </div>
        <Segmented
          label="Rod size"
          value={String(rodMm)}
          options={ROD_OPTIONS}
          onChange={(value) => burnStore.setRod(Number(value) as RodMm)}
        />
      </div>

      <div className="h-[26rem]">
        <ComposedChart
          responsive
          data={data}
          accessibilityLayer={false}
          margin={{ top: 12, right: 16, bottom: 4, left: 4 }}
          style={{ width: '100%', height: '100%' }}
          role="img"
          aria-label={`Chart: the Eq. 6.1 oxygen limit for the ${rodMm} mm rod against airflow, the sustained region above it, the ${EARTH_LIMIT_O2_PCT}% 1g limit, the ${blowoffBranch(0).toFixed(1)}% zero-stretch line, the uncertain flow band below ${UNCERTAIN_BELOW_CM_S} cm/s, and a rug of final O2 from burn-confirmed BASS-II rod tests.`}
        >
          <XAxis
            dataKey="flow"
            type="number"
            scale="log"
            domain={[FLOW_RANGE_CM_S.min, FLOW_RANGE_CM_S.max]}
            ticks={FLOW_TICKS}
            interval={0}
            height={40}
            tick={TICK}
            tickSize={4}
            stroke="var(--color-line)"
            label={{ value: 'Airflow U, cm/s', position: 'insideBottom', offset: 0, ...AXIS_TITLE }}
          />
          <YAxis
            type="number"
            domain={[O2_RANGE_PCT.min, O2_RANGE_PCT.max]}
            ticks={O2_TICKS}
            interval={0}
            width={48}
            tick={TICK}
            tickSize={4}
            stroke="var(--color-line)"
            label={{
              value: 'Oxygen, %',
              angle: -90,
              position: 'insideLeft',
              offset: 12,
              style: { textAnchor: 'middle' },
              ...AXIS_TITLE,
            }}
          />
          <Area
            dataKey="band"
            type="linear"
            stroke="none"
            fill="var(--color-red)"
            fillOpacity={0.09}
            isAnimationActive={false}
            activeDot={false}
          />
          <HatchedBand />
          <ReferenceLine y={EARTH_LIMIT_O2_PCT} stroke="var(--color-amber)" strokeDasharray="6 4" strokeWidth={1.5} />
          <ReferenceLine y={blowoffBranch(0)} stroke="var(--color-cyan)" strokeDasharray="1 4" strokeWidth={1.5} strokeLinecap="round" />
          <Line
            dataKey="limit"
            type="linear"
            stroke="var(--color-cyan)"
            strokeWidth={2}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          <MapOverlay rodMm={rodMm} rug={rug} />
        </ComposedChart>
      </div>

      <MapReadout />
      <p className="text-xs leading-4 text-muted">
        Ticks on the O2 axis: final O2 of burn-confirmed BASS-II rod tests (<span className="tabular-nums">{rug.length}</span>).
        They aren’t placed by airflow: the CSV’s airflow cells are sequences of settings, not one value.
      </p>
    </section>
  )
}

/** The band below 1 cm/s where the report calls flow uncertain, hatched. */
function HatchedBand() {
  const plot = usePlotArea()
  if (!plot) return null
  const width = plot.width * flowToX(UNCERTAIN_BELOW_CM_S)
  return (
    <g pointerEvents="none">
      <defs>
        <pattern id="rank-map-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="7" stroke="var(--color-muted)" strokeOpacity="0.28" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x={plot.x} y={plot.y} width={width} height={plot.height} fill="url(#rank-map-hatch)" />
    </g>
  )
}

/** One line under the map: the point, the limit there and which side of it the point is, all model. */
function MapReadout() {
  const o2Ref = useRef<HTMLSpanElement>(null)
  const flowRef = useRef<HTMLSpanElement>(null)
  const limitRef = useRef<HTMLSpanElement>(null)
  const regionRef = useRef<HTMLSpanElement>(null)
  useBurnState((state) => {
    setText(o2Ref.current, `${state.o2Pct.toFixed(2)}%`)
    setText(flowRef.current, `${state.flowCmS.toPrecision(3)} cm/s`)
    setText(limitRef.current, `${o2LimitPct(state.flowCmS, state.rodMm).toFixed(2)}%`)
    const region = regionAt(state.o2Pct, state.flowCmS, state.rodMm)
    setText(regionRef.current, region === 'sustained' ? 'flame sustained (model)' : 'extinguishes (model)')
  })
  return (
    <p className="text-sm leading-5 tabular-nums" aria-live="off">
      Point: oxygen <span ref={o2Ref} />, airflow <span ref={flowRef} />. Eq. 6.1 limit there <span ref={limitRef} />{' '}
      (model), so <span ref={regionRef} />.
    </p>
  )
}

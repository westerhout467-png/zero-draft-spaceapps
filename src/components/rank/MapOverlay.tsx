import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { DefaultZIndexes, usePlotArea, ZIndexLayer } from 'recharts'
import { burnStore } from '../../lib/burnStore'
import { FLOW_RANGE_CM_S, O2_RANGE_PCT } from '../../lib/burnTwin'
import { blowoffBranch, EARTH_LIMIT_O2_PCT, EQ61_MINIMUM, o2LimitPct, stretchRate, type RodMm } from '../../lib/physics'
import { flowToX, MAP_KEY_STEP, o2ToY, UNCERTAIN_BELOW_CM_S, xToFlow, yToO2 } from '../../lib/rankCharts'
import { Cite } from '../Cite'
import { useBurnState } from './useBurnState'

/** O2 moves in the same steps as the Burn Twin's slider. */
const O2_STEP = 0.05
const roundO2 = (o2: number) => Number((Math.round(o2 / O2_STEP) * O2_STEP).toFixed(2))
const roundFlow = (flow: number) => Number(flow.toPrecision(3))
/** A label written on the plot. Only its footnote takes the pointer, so dragging works under it. */
const LABEL_BASE = 'absolute text-xs leading-4 pointer-events-none [&_button]:pointer-events-auto'
const LABEL = `${LABEL_BASE} whitespace-nowrap`

/** The flow where Eq. 6.1 is lowest for this rod. Stretch rate is proportional to flow, so U = a_min ÷ a(1 cm/s). */
function flowAtMinimum(rodMm: RodMm): number {
  return EQ61_MINIMUM.a / stretchRate(1, rodMm)
}

/** Where the curve's blowoff arm rises through the 1g line, or the right edge if it never does. */
function earthCrossing(rodMm: RodMm): number {
  const steps = 200
  for (let i = 0; i <= steps; i++) {
    const flow = xToFlow(0.5 + (0.5 * i) / steps)
    if (flow > flowAtMinimum(rodMm) && o2LimitPct(flow, rodMm) >= EARTH_LIMIT_O2_PCT) return flow
  }
  return FLOW_RANGE_CM_S.max
}

/**
 * Everything drawn over the map's plot: the rug of BASS-II rod tests on the O2 axis, the labels
 * written on the lines, and the point, which is the Burn Twin's oxygen and airflow. Drag it, click
 * to place it, or focus it and use the arrow keys (Shift for bigger steps). It follows the store
 * through refs, so dragging never re-renders the chart.
 */
export function MapOverlay({ rodMm, rug }: { rodMm: RodMm; rug: { testId: string; o2Pct: number }[] }) {
  const plot = usePlotArea()
  const surfaceRef = useRef<HTMLDivElement>(null)
  const pointRef = useRef<HTMLButtonElement>(null)
  const dragging = useRef(false)
  const width = plot?.width ?? 0
  const height = plot?.height ?? 0

  useBurnState(
    (state) => {
      const point = pointRef.current
      if (!point || width === 0) return
      const x = flowToX(state.flowCmS) * width
      const y = (1 - o2ToY(state.o2Pct)) * height
      point.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
      point.setAttribute('aria-valuenow', state.o2Pct.toFixed(2))
      point.setAttribute('aria-valuetext', `Oxygen ${state.o2Pct.toFixed(2)}%, airflow ${state.flowCmS.toPrecision(3)} cm/s`)
    },
    `${width}x${height}`,
  )

  if (!plot) return null
  const px = (flow: number) => flowToX(flow) * width
  const py = (o2: number) => (1 - o2ToY(o2)) * height

  function placeAt(event: PointerEvent) {
    const box = surfaceRef.current?.getBoundingClientRect()
    if (!box || box.width === 0) return
    const flow = roundFlow(xToFlow((event.clientX - box.left) / box.width))
    const o2 = roundO2(yToO2(1 - (event.clientY - box.top) / box.height))
    burnStore.setFlow(flow)
    burnStore.setO2(o2)
  }

  function onKeyDown(event: KeyboardEvent) {
    const state = burnStore.get()
    const big = event.shiftKey
    const o2Step = big ? MAP_KEY_STEP.o2PctLarge : MAP_KEY_STEP.o2Pct
    const flowFactor = big ? MAP_KEY_STEP.flowFactorLarge : MAP_KEY_STEP.flowFactor
    if (event.key === 'ArrowUp') burnStore.setO2(roundO2(state.o2Pct + o2Step))
    else if (event.key === 'ArrowDown') burnStore.setO2(roundO2(state.o2Pct - o2Step))
    else if (event.key === 'ArrowRight') burnStore.setFlow(roundFlow(state.flowCmS * flowFactor))
    else if (event.key === 'ArrowLeft') burnStore.setFlow(roundFlow(state.flowCmS / flowFactor))
    else return
    event.preventDefault()
  }

  const minimum = { flow: flowAtMinimum(rodMm), o2: o2LimitPct(flowAtMinimum(rodMm), rodMm) }
  const earthEnd = px(earthCrossing(rodMm))
  const blowoffAtZero = blowoffBranch(0)

  // Recharts 3 draws the area and lines in their own z-index layers; this goes in the top one, so
  // the red wash never sits over the point and takes its pointer.
  return (
    <ZIndexLayer zIndex={DefaultZIndexes.label}>
      {/* The rug: one short tick per burn-confirmed rod test, at its final O2. Repeats add up brighter. */}
      <g pointerEvents="none">
        {rug.map((test) => (
          <line
            key={test.testId}
            x1={plot.x + 1}
            x2={plot.x + 11}
            y1={plot.y + py(test.o2Pct)}
            y2={plot.y + py(test.o2Pct)}
            stroke="var(--color-ink)"
            strokeOpacity={0.5}
          />
        ))}
      </g>
      <foreignObject x={plot.x} y={plot.y} width={width} height={height}>
        <div className="relative size-full select-none">
          <div
            ref={surfaceRef}
            aria-hidden="true"
            className="absolute inset-0 cursor-crosshair touch-none"
            onPointerDown={(event) => {
              dragging.current = true
              event.currentTarget.setPointerCapture(event.pointerId)
              placeAt(event)
              pointRef.current?.focus({ preventScroll: true })
            }}
            onPointerMove={(event) => {
              if (dragging.current) placeAt(event)
            }}
            onPointerUp={() => (dragging.current = false)}
            onPointerCancel={() => (dragging.current = false)}
          />

          <p className={`${LABEL} text-muted`} style={{ left: 16, top: 6 }}>
            Flow uncertain below <span className="tabular-nums">{UNCERTAIN_BELOW_CM_S}</span> cm/s{' '}
            <Cite id="bass2.flam.low-flow-uncertain" />
          </p>
          <p className={`${LABEL} text-red`} style={{ left: px(UNCERTAIN_BELOW_CM_S) + 16, top: 30 }}>
            Flame sustained (model)
          </p>
          <p
            className={`${LABEL} text-ink`}
            style={{ left: px(minimum.flow), bottom: height - py(minimum.o2) + 8, transform: 'translateX(-50%)' }}
          >
            Orbit limit, Eq. 6.1, model
            <Cite id="twin.orbit-limit" />
          </p>
          <p
            className={`${LABEL} text-amber`}
            style={{ right: width - earthEnd + 10, bottom: height - py(EARTH_LIMIT_O2_PCT) + 3 }}
          >
            <span className="tabular-nums">{EARTH_LIMIT_O2_PCT}%</span>, 1g limit, PMMA rods, 4 cm/s forced flow{' '}
            <Cite id="bass2.flam.vs-1g" />
          </p>
          <p
            className={`${LABEL_BASE} w-72 text-cyan`}
            style={{ left: 16, top: py(blowoffAtZero) + 4 }}
          >
            <span className="bg-window/80 box-decoration-clone px-0.5">
              <span className="tabular-nums">{blowoffAtZero.toFixed(1)}%</span>, blowoff branch extrapolated to zero
              stretch: the report’s conservative space limit
              <Cite id="bass2.flam.derate" />
            </span>
          </p>
          <p className={`${LABEL} text-muted`} style={{ right: 8, bottom: 6 }}>
            Extinguishes (model)
          </p>

          <button
            ref={pointRef}
            type="button"
            role="slider"
            aria-label="Burn Twin point: up and down change oxygen, left and right change airflow"
            aria-valuemin={O2_RANGE_PCT.min}
            aria-valuemax={O2_RANGE_PCT.max}
            onKeyDown={onKeyDown}
            className="absolute top-0 left-0 -mt-3 -ml-3 flex size-6 cursor-grab items-center justify-center rounded-full focus-visible:outline-offset-0 active:cursor-grabbing"
            style={{ transform: 'translate(-99px, -99px)' }}
            onPointerDown={(event) => {
              dragging.current = true
              surfaceRef.current?.setPointerCapture(event.pointerId)
            }}
          >
            <span aria-hidden="true" className="absolute size-3.5 rounded-full border border-cyan/60" />
            <span aria-hidden="true" className="size-1.5 rounded-full bg-cyan" />
            <span aria-hidden="true" className="absolute left-6 text-xs leading-4 text-ink">
              now
            </span>
          </button>
        </div>
      </foreignObject>
    </ZIndexLayer>
  )
}

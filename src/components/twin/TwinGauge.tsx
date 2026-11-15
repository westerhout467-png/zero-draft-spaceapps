import { useMemo, useRef } from 'react'
import { useTwin } from '../../lib/burnStore'
import { O2_RANGE_PCT, resultPts } from '../../lib/burnTwin'
import { EARTH_LIMIT_O2_PCT } from '../../lib/physics'
import { gaugeTicks, gaugeY, type StageLayout } from '../../lib/twinLayout'
import { Cite } from '../Cite'
import { moveTo, setText, useTwinFrame } from './twinFrame'

const TICK_HALF = { whole: 5, half: 3, tenth: 1.5 }
/** Gap between the gauge and the labels on either side of it, px. */
const LABEL_GAP = 52

/**
 * The oxygen gauge on the seam: the scale from 23 % down to 12 %, the two limit marks, the
 * label that rides the oxygen line, and (once both flames are out) the result in the gap
 * between the marks. The orbit mark and the line label move every frame, through refs.
 */
export function TwinGauge({ layout }: { layout: StageLayout }) {
  const orbitMarkRef = useRef<HTMLDivElement>(null)
  const orbitLimitRef = useRef<HTMLSpanElement>(null)
  const lineRef = useRef<HTMLDivElement>(null)
  const lineValueRef = useRef<HTMLSpanElement>(null)
  const drainShown = useTwin((state) => state.drain.phase !== 'idle')

  useTwinFrame((frame) => {
    moveTo(orbitMarkRef.current, 0, gaugeY(frame.layout, frame.orbit.limitPct))
    setText(orbitLimitRef.current, `${frame.orbit.limitPct.toFixed(2)}%`)
    moveTo(lineRef.current, 0, gaugeY(frame.layout, frame.o2Pct))
    setText(lineValueRef.current, `${frame.o2Pct.toFixed(2)}%`)
  })

  const x = layout.seamX
  const earthY = gaugeY(layout, EARTH_LIMIT_O2_PCT)
  const ticks = useMemo(() => {
    const paths = { whole: '', half: '', tenth: '' }
    for (const tick of gaugeTicks()) {
      const y = Math.round(gaugeY(layout, tick.o2Pct)) + 0.5
      paths[tick.kind] += `M${8.5 - TICK_HALF[tick.kind]} ${y}H${8.5 + TICK_HALF[tick.kind]}`
    }
    return paths
  }, [layout])
  const wholes = useMemo(
    () =>
      Array.from(
        { length: O2_RANGE_PCT.max - O2_RANGE_PCT.min + 1 },
        (_, index) => O2_RANGE_PCT.max - index,
      ),
    [],
  )

  return (
    <>
      <svg
        aria-hidden="true"
        width={16}
        height={layout.height}
        className="absolute top-0"
        style={{ left: x - 8 }}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
      >
        <path d={`M8.5 ${layout.gaugeTop}V${layout.gaugeBottom}`} className="text-muted/50" />
        <path d={ticks.tenth} className="text-muted/45" />
        <path d={ticks.half} className="text-muted/80" />
        <path d={ticks.whole} className="text-ink/80" />
      </svg>
      <p
        className="absolute -translate-x-1/2 text-xs leading-4 whitespace-nowrap text-muted"
        style={{ left: x, top: layout.gaugeTop - 32 }}
      >
        Oxygen, %
      </p>
      {wholes.map((o2) => (
        <span
          key={o2}
          aria-hidden="true"
          // Black behind the numeral, so the oxygen line passes under it rather than through it.
          className="num absolute -translate-y-1/2 bg-window px-0.5 text-xs leading-4 text-muted"
          style={{ right: layout.width - x + 10, top: gaugeY(layout, o2) }}
        >
          {o2}
        </span>
      ))}

      {/* Earth limit: fixed, on the left. Its caption sits above it, leaving the gap below free. */}
      <div className="absolute" style={{ right: layout.width - x, top: earthY }}>
        <span aria-hidden="true" className="absolute top-0 right-0 h-px w-11 bg-amber" />
        <div
          className="absolute bottom-0 w-60 translate-y-2 text-right text-xs leading-4"
          style={{ right: LABEL_GAP }}
        >
          <p className="text-muted">1g limit, PMMA rods, 4 cm/s forced flow</p>
          <p className="text-ink">
            Earth limit <span className="tabular-nums">{EARTH_LIMIT_O2_PCT.toFixed(1)}%</span>{' '}
            <Cite id="bass2.flam.vs-1g" />
          </p>
        </div>
      </div>

      {/* Orbit limit: Eq. 6.1 at the current flow and rod, so it moves with them. */}
      <div ref={orbitMarkRef} className="absolute top-0" style={{ left: x }}>
        <span aria-hidden="true" className="absolute top-0 left-0 h-px w-11 bg-cyan" />
        <div className="absolute top-0 w-64 -translate-y-2 text-xs leading-4" style={{ left: LABEL_GAP }}>
          <p className="text-ink">
            Orbit limit <span ref={orbitLimitRef} className="tabular-nums" />, model
            {/* One footnote for the whole calculation; its drawer lists every source. */}
            <Cite id="twin.orbit-limit" />
          </p>
          <p className="text-muted">Eq. 6.1 for this rod and airflow</p>
        </div>
      </div>

      {/* The current oxygen level rides the line drawn on the canvas. */}
      <div ref={lineRef} className="absolute top-0 left-6">
        <p className="absolute bottom-1.5 left-0 text-xs leading-4 whitespace-nowrap text-ink/70">
          Oxygen <span ref={lineValueRef} className="num text-ink" />
        </p>
        {drainShown && (
          <p className="appear absolute top-2 left-0 w-60 text-xs leading-4 text-ink/70">
            In BASS-II, oxygen fell gradually as the flame burned
            <Cite id="bass2.o2-gradual" />
          </p>
        )}
      </div>

      <TwinResult layout={layout} />
    </>
  )
}

/** "Kept burning 1.79 points of oxygen longer": computed from where each flame went out. */
function TwinResult({ layout }: { layout: StageLayout }) {
  const earthOutAt = useTwin((state) => state.earth.outAtPct)
  const orbitOutAt = useTwin((state) => state.orbit.outAtPct)
  const result = useTwin(resultPts)
  if (result === null || earthOutAt === null || orbitOutAt === null) return null

  const x = layout.seamX
  const earthY = gaugeY(layout, earthOutAt)
  const orbitY = gaugeY(layout, orbitOutAt)
  const longer = result >= 0
  return (
    <>
      <span
        aria-hidden="true"
        className="appear absolute w-[3px] bg-cyan"
        style={{ left: x - 1, top: Math.min(earthY, orbitY), height: Math.abs(orbitY - earthY) }}
      />
      <div
        role="status"
        className="appear absolute w-56 origin-right text-right text-sm leading-5 text-ink"
        style={{ right: layout.width - x + LABEL_GAP, top: earthY + 14 }}
      >
        <p>{longer ? 'Kept burning' : 'Went out'}</p>
        <p>
          <span className="num text-2xl leading-7">{Math.abs(result).toFixed(2)}</span> points
        </p>
        <p>
          of oxygen {longer ? 'longer' : 'sooner'}
          <Cite id="twin.gap" />
        </p>
      </div>
    </>
  )
}

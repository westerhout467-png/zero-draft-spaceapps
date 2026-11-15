import { useRef, type ReactNode } from 'react'
import { useTwin } from '../../lib/burnStore'
import { BUBBLES_REACH_RADII } from '../../draw/rod'
import { IGNITION_LIMIT_O2_PCT, orbitModel, type FlameState } from '../../lib/burnTwin'
import { EARTH_LIMIT_O2_PCT } from '../../lib/physics'
import type { StageLayout } from '../../lib/twinLayout'
import { Cite } from '../Cite'
import { setText, useTwinFrame } from './twinFrame'

/**
 * The fine print around the two flames: the bracket that tracks the orbit flame with its live
 * stretch rate, each flame's live O2 margin, and the stamps that appear when a flame goes out or
 * won't light. Live numbers are written through refs; they all come from physics.ts.
 */
export function TwinAnnotations({ layout }: { layout: StageLayout }) {
  const earth = useTwin((state) => state.earth)
  const orbit = useTwin((state) => state.orbit)
  const branch = useTwin((state) => orbitModel(state.o2Pct, state.flowCmS, state.rodMm).branch)
  const boxRef = useRef<HTMLDivElement>(null)
  const stretchRef = useRef<HTMLSpanElement>(null)
  const earthMarginRef = useRef<HTMLSpanElement>(null)
  const earthSideRef = useRef<HTMLSpanElement>(null)
  const orbitMarginRef = useRef<HTMLSpanElement>(null)
  const orbitSideRef = useRef<HTMLSpanElement>(null)

  useTwinFrame((frame) => {
    setText(stretchRef.current, frame.orbit.a.toFixed(2))
    setText(earthMarginRef.current, Math.abs(frame.earthMarginPts).toFixed(2))
    setText(earthSideRef.current, frame.earthMarginPts >= 0 ? 'above' : 'below')
    setText(orbitMarginRef.current, Math.abs(frame.orbit.marginPts).toFixed(2))
    setText(orbitSideRef.current, frame.orbit.marginPts >= 0 ? 'above' : 'below')
    const box = boxRef.current
    if (box) {
      const { left, top, width, height } = frame.orbitBox
      const transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`
      if (box.style.transform !== transform) box.style.transform = transform
      const w = `${width.toFixed(1)}px`
      const h = `${height.toFixed(1)}px`
      if (box.style.width !== w) box.style.width = w
      if (box.style.height !== h) box.style.height = h
    }
  })

  const { earthTip, orbitTip, rodRadius, unit } = layout
  return (
    <>
      {/* Earth: the margin sits beside the rod, just under the flame, on the side away from the gauge. */}
      <p
        className="absolute text-right text-xs leading-4 whitespace-nowrap text-ink/70"
        style={{ right: layout.width - earthTip.x + rodRadius + 16, top: earthTip.y + 20 }}
      >
        <span ref={earthMarginRef} className="tabular-nums" /> points <span ref={earthSideRef} /> its limit
        <Cite id="bass2.flam.vs-1g" />
      </p>
      <div
        aria-live="polite"
        className="absolute w-48 text-sm leading-5"
        style={{ left: earthTip.x + rodRadius * 1.1 + unit * 2.4, top: earthTip.y - unit * 5 }}
      >
        <EarthStamp flame={earth} />
      </div>

      {/* The bubbles drawn in the hot end of the orbit rod: hovering them shows their source. */}
      <Cite
        id="bass2.vapor-jet"
        area={{
          className: 'absolute rounded-sm',
          style: {
            left: orbitTip.x + rodRadius * 0.5,
            top: orbitTip.y - rodRadius,
            width: rodRadius * (BUBBLES_REACH_RADII - 0.5),
            height: rodRadius * 2,
          },
        }}
      />

      {/* Orbit: a corner-bracket box that tracks the flame drawn on the canvas. */}
      <div ref={boxRef} className="absolute top-0 left-0">
        <div
          aria-hidden="true"
          className={`transition-opacity duration-150 ${orbit.lit ? 'opacity-100' : 'opacity-0'}`}
        >
          <span className="absolute top-0 left-0 size-2.5 border-t border-l border-ink/60" />
          <span className="absolute top-0 right-0 size-2.5 border-t border-r border-ink/60" />
          <span className="absolute bottom-0 left-0 size-2.5 border-b border-l border-ink/60" />
          <span className="absolute right-0 bottom-0 size-2.5 border-r border-b border-ink/60" />
        </div>
        <p className="absolute bottom-full left-0 mb-1.5 text-xs leading-4 whitespace-nowrap text-ink/70">
          Stretch rate <i>a</i> = <span ref={stretchRef} className="tabular-nums" /> s⁻¹{' '}
          <Cite id="twin.stretch-rate" />
        </p>
        <div className="absolute top-full left-1/2 mt-2 -translate-x-1/2 text-center text-xs leading-4 whitespace-nowrap text-ink/70">
          <p>
            <span ref={orbitMarginRef} className="tabular-nums" /> points <span ref={orbitSideRef} /> its limit
            <Cite id="twin.orbit-limit" />
            <span className="ml-2 text-muted">Model</span>
          </p>
          {/* What the drawn shape is based on: the report's own words for each kind of limit. */}
          {branch === 'quenching' ? (
            <p className="text-muted">
              Nears a hemisphere at the quenching limit
              <Cite id="bass2.aspect-0.5" />
            </p>
          ) : (
            <p className="text-muted">
              Shape drawn after NASA’s photos of limit flames
              <Cite id="bass2.fig63" />
            </p>
          )}
        </div>
        <div
          aria-live="polite"
          className="absolute top-1/2 right-full mr-5 w-52 -translate-y-1/2 text-right text-sm leading-5"
        >
          <OrbitStamp flame={orbit} />
        </div>
      </div>
    </>
  )
}

/** A stamp fades in over 200 ms with a slight scale from 0.96 (the `appear` utility). */
function Stamp({ origin, children }: { origin: 'left' | 'right'; children: ReactNode }) {
  return (
    <p className={`appear text-ink ${origin === 'left' ? 'origin-left' : 'origin-right'}`}>{children}</p>
  )
}

function EarthStamp({ flame }: { flame: FlameState }) {
  if (flame.refusal !== null) {
    return (
      <Stamp key="refusal" origin="left">
        Won’t stay lit below <span className="tabular-nums">{EARTH_LIMIT_O2_PCT.toFixed(1)}%</span>{' '}
        <Cite id="bass2.flam.vs-1g" />
      </Stamp>
    )
  }
  if (flame.lit || flame.outAtPct === null) return null
  return (
    <Stamp key="out" origin="left">
      Out at <span className="tabular-nums">{flame.outAtPct.toFixed(1)}%</span>{' '}
      <Cite id="bass2.flam.vs-1g" />
    </Stamp>
  )
}

function OrbitStamp({ flame }: { flame: FlameState }) {
  if (flame.refusal === 'below-ignition') {
    return (
      <Stamp key="ignition" origin="right">
        Won’t ignite below <span className="tabular-nums">~{IGNITION_LIMIT_O2_PCT}%</span> (BASS-II rods){' '}
        <Cite id="bass2.ign.limit-14.5" />
        <span className="block text-xs leading-4 text-ink/70">
          A flame lit higher can keep burning lower
          <Cite id="bass2.ign.survive-13.6" />
        </span>
      </Stamp>
    )
  }
  if (flame.refusal === 'below-limit') {
    return (
      <Stamp key="limit" origin="right">
        Below the Eq. 6.1 limit at this airflow (model) <Cite id="twin.orbit-limit" />
      </Stamp>
    )
  }
  if (flame.lit || flame.outAtPct === null) return null
  return (
    <Stamp key="out" origin="right">
      Out at <span className="tabular-nums">{flame.outAtPct.toFixed(2)}%</span> (model){' '}
      <Cite id="twin.orbit-limit" />
    </Stamp>
  )
}

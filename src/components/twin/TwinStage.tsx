import { useReducedMotion } from 'motion/react'
import { useMemo, useRef, useState } from 'react'
import { useTwin } from '../../lib/burnStore'
import { stageLayout } from '../../lib/twinLayout'
import { TwinAnnotations } from './TwinAnnotations'
import { TwinGauge } from './TwinGauge'
import { moveTo, useFrameBus, useTwinFrame } from './twinFrame'
import { useTwinLoop } from './useTwinLoop'

const LAYER =
  'pointer-events-none absolute inset-0 will-change-transform [&_button]:pointer-events-auto'

/**
 * The Burn Twin stage: one black, frameless canvas with Earth on the left, orbit on the right
 * and the oxygen gauge on the seam. Everything that glows is drawn on the canvas; the words and
 * numbers are HTML laid over it, in two layers that drift by different amounts with the pointer.
 */
export function TwinStage() {
  const stageRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gaugeLayerRef = useRef<HTMLDivElement>(null)
  const flameLayerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const rodMm = useTwin((state) => state.rodMm)
  const bus = useFrameBus()
  const reducedMotion = useReducedMotion() ?? false

  useTwinLoop({ stageRef, canvasRef, bus, reducedMotion, onResize: setSize })

  useTwinFrame((frame) => {
    moveTo(gaugeLayerRef.current, frame.gaugeShift.x, frame.gaugeShift.y)
    moveTo(flameLayerRef.current, frame.flameShift.x, frame.flameShift.y)
  })

  const layout = useMemo(
    () => (size && size.width > 0 ? stageLayout(size.width, size.height, rodMm) : null),
    [size, rodMm],
  )

  return (
    <section
      ref={stageRef}
      aria-label="Earth and orbit burn twin"
      className="relative min-h-[24rem] flex-1 overflow-hidden bg-window"
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Illustration: on the left, a PMMA rod standing upright on Earth with a teardrop flame on its tip. On the right, the same rod in orbit, facing an airflow, with a dome-shaped flame over its tip. A horizontal line across both shows the oxygen level."
        className="absolute inset-0 size-full"
      />
      {layout && (
        <>
          <h2
            className="absolute top-5 -translate-x-1/2 text-sm leading-5 font-semibold"
            style={{ left: layout.width * 0.25 }}
          >
            Earth, 1g
          </h2>
          <h2
            className="absolute top-5 -translate-x-1/2 text-sm leading-5 font-semibold"
            style={{ left: layout.width * 0.75 }}
          >
            Orbit, ISS glovebox
          </h2>
          {/* Each layer covers the whole stage, so only its footnotes take the pointer;
              otherwise the top layer would block the clicks meant for the one under it. */}
          <div ref={gaugeLayerRef} className={LAYER}>
            <TwinGauge layout={layout} />
          </div>
          <div ref={flameLayerRef} className={LAYER}>
            <TwinAnnotations layout={layout} />
          </div>
          <p className="absolute bottom-4 left-6 text-xs leading-4 text-muted">Illustration</p>
          <p className="absolute right-6 bottom-4 text-xs leading-4 text-muted">Illustration</p>
        </>
      )}
    </section>
  )
}

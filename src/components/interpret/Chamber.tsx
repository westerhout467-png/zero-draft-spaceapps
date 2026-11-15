import { useReducedMotion } from 'motion/react'
import { useRef } from 'react'
import { MSG_VOLUME_M3, SMAC_1_HOUR_PPM, US_LAB_VOLUME_M3, type CabinInputs } from '../../lib/cabin'
import { stateAt } from '../../lib/interpret'
import { useSim, type SimState } from '../../lib/interpretStore'
import { o2LimitPct } from '../../lib/physics'
import { Cite } from '../Cite'
import { useSimLoop } from './useSimLoop'

/** "MSG glovebox, 0.25 m³", with the claim that names it, or a plain sealed cabin of the set size. */
function Volume({ volumeM3 }: { volumeM3: number }) {
  if (volumeM3 === MSG_VOLUME_M3) {
    return (
      <>
        MSG glovebox, <span className="tabular-nums">{volumeM3}</span> m³{' '}
        <Cite id="bass2.cstr.volume" />
      </>
    )
  }
  if (volumeM3 === US_LAB_VOLUME_M3) {
    return (
      <>
        US Lab, <span className="tabular-nums">{volumeM3}</span> m³{' '}
        <Cite id="bass2.us-lab-volume" />
      </>
    )
  }
  return (
    <>
      Sealed cabin, <span className="tabular-nums">{volumeM3 < 10 ? volumeM3.toFixed(1) : volumeM3.toFixed(0)}</span> m³
    </>
  )
}

function Sample({ inputs }: { inputs: CabinInputs }) {
  if (inputs.geometry === 'opposed-slab') return <>PMMA slab, opposed flow</>
  return (
    <>
      PMMA rod, <span className="tabular-nums">{inputs.rodMm}</span> mm, in{' '}
      <span className="tabular-nums">{inputs.flowCmS?.toPrecision(2)}</span> cm/s
    </>
  )
}

/** What the model says the flame is doing now, in words. Changes only a few times a run. */
function flameWords(state: SimState): string {
  const now = stateAt(state.run, state.tSec)
  if (!now.valid) return 'No prediction'
  switch (now.flame) {
    case 'burning':
      return 'Burning (model)'
    case 'out-limit':
      return 'Out below the Eq. 6.1 limit (model)'
    case 'out-duration':
      return 'Burn ended at the length you set'
    case 'not-ignited':
      return state.inputs.powerW > 0 ? 'Won’t burn: below the Eq. 6.1 limit at this airflow (model)' : 'No fire'
  }
}

/**
 * The live orbit chamber (SPEC F4, left): the Overview's orbit flame on a rod, or along the edge of
 * a flat slab. The model decides whether it burns; its size follows the O2 margin, it dies the way
 * the Overview's flame does, and a faint haze thickens with CO. The canvas loop also runs the
 * simulation clock (useSimLoop).
 */
export function Chamber() {
  const stageRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reducedMotion = useReducedMotion() ?? false
  const inputs = useSim((state) => state.inputs)
  const words = useSim(flameWords)
  const rod = inputs.geometry === 'concurrent-rod'

  useSimLoop({ stageRef, canvasRef, reducedMotion })

  return (
    <section ref={stageRef} aria-label="Chamber" className="relative min-h-0 overflow-hidden bg-window">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Illustration: a clear PMMA ${rod ? 'rod' : 'slab'} facing an airflow from the left, with a blue flame on its leading edge while the model says it burns. A grey haze thickens as carbon monoxide rises.`}
        className="absolute inset-0 size-full"
      />
      <div className="absolute inset-x-0 top-0 flex flex-col gap-0.5 text-sm leading-5">
        <h2 className="font-semibold">
          <Volume volumeM3={inputs.volumeM3} />
        </h2>
        <p className="text-muted">
          <Sample inputs={inputs} />
        </p>
        {!rod && <p className="text-xs leading-4 text-muted">Burn length set by you: no extinction model for slabs</p>}
      </div>
      <p aria-live="polite" className="absolute inset-x-0 top-[62%] text-center text-sm leading-5">
        {words}
        {words.startsWith('Out below') && (
          <>
            {' '}
            <span className="tabular-nums text-muted">
              ({o2LimitPct(inputs.flowCmS ?? 2, inputs.rodMm ?? 6.35).toFixed(2)}%)
            </span>
            <Cite id="twin.orbit-limit" />
          </>
        )}
      </p>
      <p className="absolute inset-x-0 bottom-0 text-xs leading-4 text-muted">
        Illustration. Haze density is CO ÷ <span className="tabular-nums">{SMAC_1_HOUR_PPM}</span> ppm, capped at 1.
      </p>
    </section>
  )
}

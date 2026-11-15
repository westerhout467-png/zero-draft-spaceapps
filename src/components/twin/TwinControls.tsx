import { ArrowDownToLine, Flame, RotateCcw } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { useId, useRef } from 'react'
import { burnStore, useTwin } from '../../lib/burnStore'
import { FLOW_RANGE_CM_S, flowFromSlider, O2_RANGE_PCT, sliderFromFlow } from '../../lib/burnTwin'
import { ROD_DIAMETERS_MM } from '../../lib/physics'
import { setText, useTwinFrame } from './twinFrame'

/** The O2 slider moves in steps of this many points. */
const O2_STEP = 0.05
/** The flow slider has this many positions along its log scale. */
const FLOW_STEPS = 1000

const BUTTON =
  'flex h-9 items-center gap-2 rounded-sm border px-4 text-sm transition-transform duration-150 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100'

/** The two ends of a slider's range under its track, with a note between them if there is one. */
function SliderEnds({ from, to, note }: { from: string | number; to: string | number; note?: string }) {
  return (
    <div aria-hidden="true" className="flex justify-between text-xs leading-4 text-muted">
      <span className="num">{from}</span>
      {note && <span>{note}</span>}
      <span className="num">{to}</span>
    </div>
  )
}

/**
 * The Burn Twin's controls: oxygen, orbit airflow (log scale), rod size and the three buttons.
 * The sliders are not React-controlled: the drain moves the oxygen slider every frame, so their
 * positions and readouts are written through refs.
 */
export function TwinControls() {
  const o2Id = useId()
  const flowId = useId()
  const rodName = useId()
  const o2Ref = useRef<HTMLInputElement>(null)
  const o2ValueRef = useRef<HTMLOutputElement>(null)
  const flowRef = useRef<HTMLInputElement>(null)
  const flowValueRef = useRef<HTMLOutputElement>(null)
  const rodMm = useTwin((state) => state.rodMm)
  const draining = useTwin((state) => state.drain.phase === 'running')
  const reducedMotion = useReducedMotion() ?? false

  useTwinFrame((frame) => {
    const o2 = o2Ref.current
    if (o2 && Number(o2.value) !== frame.o2Pct) o2.value = String(frame.o2Pct)
    setText(o2ValueRef.current, `${frame.o2Pct.toFixed(2)}%`)

    const flow = flowRef.current
    const flowText = frame.flowCmS.toPrecision(3)
    // Several slider positions can round to the same flow, so only move the thumb when the
    // flow it stands for is not the flow in the store.
    if (flow && flowFromSlider(Number(flow.value) / FLOW_STEPS) !== frame.flowCmS) {
      flow.value = String(Math.round(sliderFromFlow(frame.flowCmS) * FLOW_STEPS))
    }
    if (flow && flow.getAttribute('aria-valuetext') !== `${flowText} cm/s`) {
      flow.setAttribute('aria-valuetext', `${flowText} cm/s`)
    }
    setText(flowValueRef.current, flowText)
  })

  return (
    // A size container: with the Lab Partner dock open the strip is narrower, so rod size takes a
    // row of its own and the readouts may wrap under their labels.
    <div className="@container/controls flex min-w-0 flex-1 flex-col justify-between gap-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 @min-[38rem]/controls:grid-cols-[1fr_1fr_minmax(15.5rem,0.9fr)] @min-[38rem]/controls:gap-6">
        <div data-lab-target="twin.o2" className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm leading-5 whitespace-nowrap">
            <label htmlFor={o2Id} className="text-muted">
              Oxygen
            </label>
            <output ref={o2ValueRef} htmlFor={o2Id} className="num" />
          </div>
          <input
            ref={o2Ref}
            id={o2Id}
            type="range"
            min={O2_RANGE_PCT.min}
            max={O2_RANGE_PCT.max}
            step={O2_STEP}
            defaultValue={burnStore.get().o2Pct}
            onInput={(event) => burnStore.setO2(Number(event.currentTarget.value))}
            className="slider mt-1 block w-full"
          />
          <SliderEnds from={`${O2_RANGE_PCT.min}%`} to={`${O2_RANGE_PCT.max}%`} />
        </div>

        <div data-lab-target="twin.flow" className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm leading-5 whitespace-nowrap">
            <label htmlFor={flowId} className="text-muted">
              Orbit airflow <i>U</i>
            </label>
            <span>
              <output ref={flowValueRef} htmlFor={flowId} className="num" /> cm/s
            </span>
          </div>
          <input
            ref={flowRef}
            id={flowId}
            type="range"
            min={0}
            max={FLOW_STEPS}
            step={1}
            defaultValue={Math.round(sliderFromFlow(burnStore.get().flowCmS) * FLOW_STEPS)}
            onInput={(event) =>
              burnStore.setFlow(flowFromSlider(Number(event.currentTarget.value) / FLOW_STEPS))
            }
            className="slider mt-1 block w-full"
          />
          <SliderEnds from={FLOW_RANGE_CM_S.min} to={FLOW_RANGE_CM_S.max} note="log scale" />
        </div>

        <fieldset data-lab-target="twin.rod" className="col-span-2 min-w-0 @min-[38rem]/controls:col-span-1">
          <legend className="text-sm leading-5 text-muted">Rod size</legend>
          <div className="mt-1 flex">
            {ROD_DIAMETERS_MM.map((rod) => (
              <label
                key={rod}
                className="relative -ml-px flex h-7 flex-1 cursor-pointer items-center justify-center gap-1 border border-line text-sm whitespace-nowrap first:ml-0 first:rounded-l-sm last:rounded-r-sm hover:text-ink has-[:checked]:z-10 has-[:checked]:border-cyan has-[:checked]:text-cyan has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cyan"
              >
                <input
                  type="radio"
                  name={rodName}
                  value={rod}
                  checked={rodMm === rod}
                  onChange={() => burnStore.setRod(rod)}
                  className="sr-only"
                />
                <span className="tabular-nums">{rod}</span> mm
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          data-lab-target="twin.ignite"
          onClick={() => burnStore.ignite()}
          className={`${BUTTON} border-line hover:border-muted`}
        >
          <Flame aria-hidden="true" className="size-4" />
          Ignite
        </button>
        <button
          type="button"
          data-lab-target="twin.drain"
          disabled={draining}
          onClick={() => burnStore.drain(reducedMotion)}
          className={`${BUTTON} border-ink bg-ink font-medium text-graphite`}
        >
          <ArrowDownToLine aria-hidden="true" className="size-4" />
          Drain oxygen
        </button>
        <button
          type="button"
          data-lab-target="twin.reset"
          onClick={() => burnStore.reset()}
          className={`${BUTTON} border-line hover:border-muted`}
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          Reset
        </button>
      </div>
    </div>
  )
}

import type { ReactNode } from 'react'
import { FLOW_RANGE_CM_S } from '../../lib/burnTwin'
import { CO_PPM_PER_PCT_CO2, MSG_N2_MAX_CC_MIN, SMAC_1_HOUR_PPM, SMAC_LONG_TERM_PPM, type Geometry } from '../../lib/cabin'
import { getClaim } from '../../lib/claims'
import { firstTime, kPa, logEntries, psia, simTime, volumeMarks, volumeScale } from '../../lib/interpret'
import { interpretStore, useSim } from '../../lib/interpretStore'
import { ROD_DIAMETERS_MM, type RodMm } from '../../lib/physics'
import { Cite } from '../Cite'
import { Segmented } from '../Segmented'
import { SimSlider } from './SimSlider'

const set = interpretStore.setInput
const fixed = (digits: number) => (value: number) => value.toFixed(digits)
const volumeText = (m3: number) => (m3 < 10 ? m3.toFixed(2) : m3 < 100 ? m3.toFixed(1) : m3.toFixed(0))

const SHAPES: readonly { value: Geometry; label: string }[] = [
  { value: 'opposed-slab', label: 'Opposed slab' },
  { value: 'concurrent-rod', label: 'Concurrent rod' },
]
const RODS = ROD_DIAMETERS_MM.map((rod) => ({ value: String(rod), label: `${rod} mm` }))

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm leading-5 font-semibold">{title}</legend>
      {children}
    </fieldset>
  )
}

/** Under the volume slider: where this fire would cross each limit, and when it does at this volume. */
function VolumeNote() {
  const run = useSim((state) => state.run)
  const inputs = useSim((state) => state.inputs)
  const marks = volumeMarks(inputs, run)
  if (!run[0].valid) return null
  const entries = logEntries(run)
  const at10 = firstTime(entries, 'smac-10')
  const at55 = firstTime(entries, 'smac-55')
  const by = (limit: number) => marks?.find((mark) => mark.limitPpm === limit)?.volumeM3
  return (
    <>
      {marks && (
        <>
          This fire passes <span className="tabular-nums">{SMAC_1_HOUR_PPM}</span> ppm below{' '}
          <span className="whitespace-nowrap tabular-nums">{by(SMAC_1_HOUR_PPM)?.toFixed(1)} m³</span> and{' '}
          <span className="tabular-nums">{SMAC_LONG_TERM_PPM}</span> ppm below{' '}
          <span className="whitespace-nowrap tabular-nums">{by(SMAC_LONG_TERM_PPM)?.toFixed(1)} m³</span>{' '}
          <Cite id="cabin.volume-limit" />.{' '}
        </>
      )}
      {at10 === null ? (
        <>
          Here CO stays under <span className="tabular-nums">{SMAC_LONG_TERM_PPM}</span> ppm.
        </>
      ) : (
        <>
          Here: <span className="tabular-nums">{SMAC_LONG_TERM_PPM}</span> ppm at{' '}
          <span className="tabular-nums">{simTime(at10)}</span>
          {at55 !== null && (
            <>
              , <span className="tabular-nums">{SMAC_1_HOUR_PPM}</span> ppm at{' '}
              <span className="tabular-nums">{simTime(at55)}</span>
            </>
          )}
          .
        </>
      )}
    </>
  )
}

/**
 * The simulator's inputs (SPEC F4): the cabin, the fire and the nitrogen. Each one calls the
 * store's setInput, which reruns the model at once.
 */
export function SimInputs() {
  const inputs = useSim((state) => state.inputs)
  const presetId = useSim((state) => state.presetId)
  const run = useSim((state) => state.run)
  const rod = inputs.geometry === 'concurrent-rod'
  const volume = volumeScale(presetId)
  const marks = (volumeMarks(inputs, run) ?? []).map((mark) => ({
    value: mark.volumeM3,
    label: `${mark.limitPpm} ppm`,
    tone: mark.limitPpm === SMAC_1_HOUR_PPM ? ('red' as const) : ('amber' as const),
  }))

  return (
    <div className="flex flex-col gap-6">
      <Group title="Cabin">
        <SimSlider
          label="Volume"
          value={inputs.volumeM3}
          min={volume.min}
          max={volume.max}
          step={0.1}
          log={volume.log}
          format={volumeText}
          unit="m³"
          onChange={(volumeM3) => set({ volumeM3: Number(volumeText(volumeM3)) })}
          marks={marks}
          note={<VolumeNote />}
        />
        <SimSlider label="Starting O2" value={inputs.o2InitPct} min={10} max={40} step={0.1} format={fixed(1)} unit="%" onChange={(o2InitPct) => set({ o2InitPct })} />
        <SimSlider
          label="Pressure"
          value={inputs.pressureAtm}
          min={0.3}
          max={1}
          step={0.01}
          format={(atm) => psia(atm).toFixed(1)}
          unit={`psia (${kPa(inputs.pressureAtm).toFixed(1)} kPa)`}
          onChange={(pressureAtm) => set({ pressureAtm })}
          note="The model runs only at 1 atm (14.7 psia). Anything else gets no prediction."
        />
        <SimSlider label="Starting CO2" value={inputs.co2InitPct} min={0} max={5} step={0.01} format={fixed(2)} unit="%" onChange={(co2InitPct) => set({ co2InitPct })} />
        <SimSlider label="Starting CO" value={inputs.coInitPpm} min={0} max={100} step={1} format={fixed(0)} unit="ppm" onChange={(coInitPpm) => set({ coInitPpm })} />
      </Group>

      <Group title="Fire">
        <SimSlider label="Heat release" value={inputs.powerW} min={0} max={200} step={0.1} format={(w) => w.toFixed(w < 100 ? 2 : 1)} unit="W" onChange={(powerW) => set({ powerW })} />
        <div className="flex flex-col gap-1">
          <Segmented label="Burn shape" value={inputs.geometry} options={SHAPES} onChange={(geometry) => set({ geometry })} />
          <p className="text-xs leading-4 text-muted">
            <span className="tabular-nums">{CO_PPM_PER_PCT_CO2[inputs.geometry]}</span> ppm CO per 1% CO2
            <Cite id={rod ? 'bass2.co.550' : 'bass2.co.370'} />
          </p>
        </div>
        {rod && (
          <>
            <Segmented
              label="Rod size"
              value={String(inputs.rodMm)}
              options={RODS}
              onChange={(value) => set({ rodMm: Number(value) as RodMm })}
            />
            <SimSlider
              label={
                <>
                  Airflow <i>U</i>
                </>
              }
              value={inputs.flowCmS ?? 2}
              min={FLOW_RANGE_CM_S.min}
              max={FLOW_RANGE_CM_S.max}
              log
              format={(u) => u.toPrecision(2)}
              unit="cm/s"
              onChange={(flowCmS) => set({ flowCmS: Number(flowCmS.toPrecision(3)) })}
            />
          </>
        )}
        <SimSlider
          label={rod ? 'Run length' : 'Burn length'}
          value={inputs.durationMin}
          min={1}
          max={300}
          step={0.1}
          format={fixed(1)}
          unit="min"
          onChange={(durationMin) => set({ durationMin })}
          note={rod ? 'The rod burns until O2 falls below its Eq. 6.1 limit, or the run ends.' : 'Set by you: no extinction model for slabs.'}
        />
      </Group>

      <Group title="Nitrogen">
        <SimSlider
          label="N2 flow"
          value={inputs.n2FlowCcMin}
          min={0}
          max={MSG_N2_MAX_CC_MIN}
          step={1}
          format={fixed(0)}
          unit="cm³/min"
          onChange={(n2FlowCcMin) => set({ n2FlowCcMin })}
          note={
            <>
              Up to the MSG’s maximum,{' '}
              <span className="tabular-nums">{getClaim('bass2.cstr.n2-max')?.value}</span> m³/min{' '}
              <Cite id="bass2.cstr.n2-max" />
            </>
          }
        />
        <SimSlider label="N2 starts at" value={inputs.n2StartMin} min={0} max={120} step={1} format={fixed(0)} unit="min" onChange={(n2StartMin) => set({ n2StartMin })} />
      </Group>
    </div>
  )
}

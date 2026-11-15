import { useReducedMotion } from 'motion/react'
import { useRef, type RefObject } from 'react'
import { logEntries, passedCount, simTime, stateAt, type LogKind } from '../../lib/interpret'
import { useSim, type SimState } from '../../lib/interpretStore'
import { setText } from '../twin/twinFrame'
import { Cite } from '../Cite'
import { CHART_HZ, useSimFrame, token } from './simFrame'

/** Which readout flashes, and in which color, when the model logs each kind of crossing. */
const FLASH: Partial<Record<LogKind, { readout: 'o2' | 'co'; tone: 'cyan' | 'amber' | 'red' | 'ink' }>> = {
  'smac-10': { readout: 'co', tone: 'amber' },
  'smac-55': { readout: 'co', tone: 'red' },
  'sensor-1000': { readout: 'co', tone: 'ink' },
  extinguished: { readout: 'o2', tone: 'cyan' },
}
const FLASH_MS = 900

const fmtCo = (ppm: number) => (ppm < 100 ? ppm.toFixed(1) : Math.round(ppm).toLocaleString('en-US'))

/**
 * Big model readouts (SPEC F4, right): O2, CO2, CO and the simulated time, written through refs
 * at up to 30 Hz. When playback carries the model across a limit, the matching readout flashes
 * once in that limit's color; the chart band and the log entry go with it.
 */
export function Readouts() {
  const reducedMotion = useReducedMotion() ?? false
  const valid = useSim((state) => state.run[0].valid)
  const replay = useSim((state) => state.presetId === 'm5' && !state.edited)
  const o2Ref = useRef<HTMLSpanElement>(null)
  const co2Ref = useRef<HTMLSpanElement>(null)
  const coRef = useRef<HTMLSpanElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)
  const seen = useRef<{ run: SimState['run'] | null; count: number }>({ run: null, count: 0 })

  useSimFrame((state) => {
    const now = stateAt(state.run, state.tSec)
    setText(o2Ref.current, now.valid ? now.o2Pct.toFixed(2) : '–')
    setText(co2Ref.current, now.valid ? now.co2Pct.toFixed(2) : '–')
    setText(coRef.current, now.valid ? fmtCo(now.coPpm) : '–')
    setText(timeRef.current, simTime(state.tSec))

    const entries = logEntries(state.run)
    const count = passedCount(entries, state.tSec)
    const before = seen.current.run === state.run ? seen.current.count : count
    seen.current = { run: state.run, count }
    if (count <= before || state.cause !== 'play' || reducedMotion) return
    for (const entry of entries.slice(before, count)) {
      const flash = FLASH[entry.kind]
      const element = flash && (flash.readout === 'o2' ? o2Ref.current : coRef.current)
      if (!flash || !element) continue
      const color = token(flash.tone)
      element.animate([{ color }, { color, offset: 0.2 }, { color: token('ink') }], {
        duration: FLASH_MS,
        easing: 'ease-out',
      })
    }
  }, CHART_HZ)

  return (
    <section aria-labelledby="readouts-title" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="readouts-title" className="text-sm leading-5 font-semibold">
          Readouts
        </h2>
        <p className="text-xs leading-4 text-muted">
          {replay && 'Replay, '}Model
          <Cite id="cabin.model" />
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        <Readout label="Oxygen" unit="%" valueRef={o2Ref} />
        <Readout label="Carbon dioxide" unit="%" valueRef={co2Ref} />
        <Readout label="Carbon monoxide" unit="ppm" valueRef={coRef} />
        <Readout label="Sim time" valueRef={timeRef} />
      </dl>
      {!valid && <p className="text-sm leading-5 text-muted">Outside tested range: no prediction</p>}
    </section>
  )
}

function Readout({ label, unit, valueRef }: { label: string; unit?: string; valueRef: RefObject<HTMLSpanElement | null> }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-xs leading-4 text-muted">{label}</dt>
      <dd className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span ref={valueRef} className="num text-[1.75rem] leading-9 text-ink" />
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </dd>
    </div>
  )
}

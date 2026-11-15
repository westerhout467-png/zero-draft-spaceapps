import { Pause, Play, RotateCcw } from 'lucide-react'
import { useId, useRef } from 'react'
import { clock, endSec, simTime, SPEEDS } from '../../lib/interpret'
import { interpretStore, useSim } from '../../lib/interpretStore'
import { CHART_HZ, useSimFrame } from './simFrame'

const BUTTON =
  'flex h-9 items-center gap-2 rounded-sm border px-4 text-sm transition-transform duration-150 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100'

/**
 * Play or pause, the speed (1×, 60×, 600× simulated seconds per second) and a scrubber laid
 * exactly under the charts' time axis (SPEC F4, bottom). Two grid cells: the buttons sit under the
 * chamber, the scrubber under the charts.
 */
export function TimeControls({ plotLeft, plotRightPad }: { plotLeft: number; plotRightPad: number }) {
  const scrubId = useId()
  const speedName = useId()
  const scrubRef = useRef<HTMLInputElement>(null)
  const playing = useSim((state) => state.playing)
  const speed = useSim((state) => state.speed)
  const end = useSim((state) => endSec(state.run))
  const valid = useSim((state) => state.run[0].valid && endSec(state.run) > 0)
  const atEnd = useSim((state) => state.tSec >= endSec(state.run) - 1e-9 && endSec(state.run) > 0)

  useSimFrame((state) => {
    const scrub = scrubRef.current
    if (!scrub) return
    const value = String(Math.round(state.tSec))
    if (scrub.value !== value) scrub.value = value
    const text = simTime(state.tSec)
    if (scrub.getAttribute('aria-valuetext') !== text) scrub.setAttribute('aria-valuetext', text)
  }, CHART_HZ)

  return (
    <div className="col-span-2 grid grid-cols-subgrid items-center">
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!valid}
          onClick={() => (playing ? interpretStore.pause() : interpretStore.play())}
          className={`${BUTTON} w-[8.5rem] justify-center border-ink bg-ink font-medium text-graphite`}
        >
          {playing ? (
            <Pause aria-hidden="true" className="size-4" />
          ) : atEnd ? (
            <RotateCcw aria-hidden="true" className="size-4" />
          ) : (
            <Play aria-hidden="true" className="size-4" />
          )}
          {playing ? 'Pause' : atEnd ? 'Play again' : 'Play'}
        </button>
        <fieldset className="flex">
          <legend className="sr-only">Speed, simulated seconds per second</legend>
          {SPEEDS.map((option) => (
            <label
              key={option}
              className="relative -ml-px flex h-9 cursor-pointer items-center border border-line px-2.5 text-sm first:ml-0 first:rounded-l-sm last:rounded-r-sm hover:text-ink has-[:checked]:z-10 has-[:checked]:border-cyan has-[:checked]:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan text-muted"
            >
              <input
                type="radio"
                name={speedName}
                value={option}
                checked={speed === option}
                onChange={() => interpretStore.setSpeed(option)}
                className="sr-only"
              />
              <span className="tabular-nums">{option}×</span>
            </label>
          ))}
        </fieldset>
      </div>
      <div className="flex flex-col" style={{ paddingLeft: plotLeft - 5, paddingRight: plotRightPad - 5 }}>
        <label htmlFor={scrubId} className="sr-only">
          Simulated time
        </label>
        <input
          ref={scrubRef}
          id={scrubId}
          type="range"
          min={0}
          max={Math.max(1, Math.round(end))}
          step={1}
          defaultValue={0}
          disabled={!valid}
          onInput={(event) => interpretStore.seek(Number(event.currentTarget.value))}
          className="slider block w-full disabled:cursor-not-allowed disabled:opacity-40"
        />
        <div aria-hidden="true" className="flex justify-between px-[5px] text-xs leading-4 text-muted">
          <span className="num">00:00</span>
          <span className="num">{clock(end)}</span>
        </div>
      </div>
    </div>
  )
}

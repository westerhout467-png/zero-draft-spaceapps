import { useReducedMotion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import {
  CO_SENSOR_CEILING_PPM,
  SMAC_1_HOUR_PPM,
  SMAC_LONG_TERM_PPM,
} from '../../lib/cabin'
import { logEntries, passedCount, simTime, type LogEntry, type LogKind } from '../../lib/interpret'
import { interpretStore, useSim } from '../../lib/interpretStore'
import { Cite } from '../Cite'
import { EASE_OUT } from './simFrame'

/** The log entry's slide-in, part of the signature motion. */
const SLIDE_MS = 260

type Line = { tone: string; what: string; why: string; cite?: string }

const LINES: Record<LogKind, (rod: boolean) => Line> = {
  'smac-10': () => ({
    tone: 'bg-amber',
    what: `CO passed ${SMAC_LONG_TERM_PPM} ppm`,
    why: `Above the long-term SMAC (${SMAC_LONG_TERM_PPM} ppm)`,
    cite: 'bass2.co.smac',
  }),
  'smac-55': () => ({
    tone: 'bg-red',
    what: `CO passed ${SMAC_1_HOUR_PPM} ppm`,
    why: `Above the 1-hour SMAC (${SMAC_1_HOUR_PPM} ppm)`,
    cite: 'bass2.co.smac',
  }),
  'sensor-1000': () => ({
    tone: 'bg-ink',
    what: `CO reached ${CO_SENSOR_CEILING_PPM.toLocaleString('en-US')} ppm`,
    why: 'At the CSA-CP sensor’s ceiling',
    cite: 'bass2.co.sensor-range',
  }),
  extinguished: () => ({
    tone: 'bg-cyan',
    what: 'Flame out',
    why: 'O2 fell below the Eq. 6.1 limit (model)',
    cite: 'twin.orbit-limit',
  }),
  'burn-ended': (rod) => ({
    tone: 'bg-muted',
    what: rod ? 'Run ended' : 'Burn ended',
    why: rod ? 'At the run length you set' : 'At the burn length you set',
  }),
}

/**
 * The alarm log (SPEC F4): each limit the model crosses, at its simulated time, oldest first.
 * Entries come only from the run's own alarms (lib/interpret logEntries). When playback reaches
 * one, it slides in; a seek or new input shows entries at once.
 */
export function AlarmLog({ onShowSuppression }: { onShowSuppression: () => void }) {
  const reducedMotion = useReducedMotion() ?? false
  const run = useSim((state) => state.run)
  const rod = useSim((state) => state.inputs.geometry === 'concurrent-rod')
  const count = useSim((state) => passedCount(logEntries(state.run), state.tSec))
  const entries = logEntries(run).slice(0, count)

  // Entries mounted after the log itself are ones the clock has just reached.
  const ready = useRef(false)
  useEffect(() => {
    ready.current = true
    return () => {
      ready.current = false
    }
  }, [])

  return (
    <section aria-labelledby="alarm-log-title" className="flex flex-col gap-2">
      <h2 id="alarm-log-title" className="text-sm leading-5 font-semibold">
        Alarm log
      </h2>
      <div className="min-h-[9.5rem]">
        {entries.length === 0 ? (
          <p className="text-sm leading-5 text-muted">Nothing yet. Entries appear only when the model crosses a limit.</p>
        ) : (
          <ol aria-live="polite" className="flex flex-col gap-1.5">
            {entries.map((entry) => (
              <LogLine key={entry.kind} entry={entry} rod={rod} ready={ready} reducedMotion={reducedMotion} onShowSuppression={onShowSuppression} />
            ))}
          </ol>
        )}
      </div>
      <p className="text-xs leading-4 text-muted">Shows concentration crossing a limit value; exposure time isn’t modeled.</p>
    </section>
  )
}

type LogLineProps = {
  entry: LogEntry
  rod: boolean
  ready: RefObject<boolean>
  reducedMotion: boolean
  onShowSuppression: () => void
}

/**
 * One entry: its simulated time in mono, what happened, and why it matters, with its source.
 * It slides in when playback brings it (not when a seek or a new input does).
 */
function LogLine({ entry, rod, ready, reducedMotion, onShowSuppression }: LogLineProps) {
  const ref = useRef<HTMLLIElement>(null)
  const line = LINES[entry.kind](rod)
  // Decided once, when the entry first appears: did playback just bring it?
  const [arrived] = useState(() => ready.current && !reducedMotion && interpretStore.get().cause === 'play')

  useLayoutEffect(() => {
    if (!arrived) return
    ref.current?.animate(
      [
        { opacity: 0, transform: 'translateX(-12px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: SLIDE_MS, easing: EASE_OUT },
    )
    // `arrived` never changes, so this runs once: an entry slides in once.
  }, [arrived])

  return (
    <li ref={ref} className="grid grid-cols-[4.5rem_1fr] gap-x-2">
      <span className="num text-sm leading-5 text-muted">{simTime(entry.tSec)}</span>
      <span className="flex flex-col">
        <span className="flex items-center gap-2 text-sm leading-5">
          <span aria-hidden="true" className={`size-1.5 shrink-0 ${line.tone}`} />
          {line.what}
        </span>
        <span className="text-xs leading-4 text-muted">
          {line.why}
          {line.cite && <Cite id={line.cite} />}
          {entry.kind === 'extinguished' && (
            <>
              {'. '}
              <button type="button" onClick={onShowSuppression} className="text-cyan hover:underline">
                Keep suppressing until it cools
              </button>
            </>
          )}
        </span>
      </span>
    </li>
  )
}

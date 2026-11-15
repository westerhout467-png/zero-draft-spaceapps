import { useId, type ReactNode } from 'react'

/** Log sliders have this many positions. */
const LOG_STEPS = 1000

export type SliderMark = { value: number; label: string; tone: 'amber' | 'red' }

type SimSliderProps = {
  label: ReactNode
  value: number
  min: number
  max: number
  step?: number
  /** A log scale, for ranges that span orders of magnitude (volume, airflow). */
  log?: boolean
  /** The value as shown, in mono: "3.0". */
  format: (value: number) => string
  unit?: ReactNode
  onChange: (value: number) => void
  disabled?: boolean
  /**
   * Values to mark on the track, each with a colored rail from the left end to it: "below this
   * value, CO crosses this limit". Marks outside the range aren't drawn.
   */
  marks?: SliderMark[]
  /** A line under the slider. */
  note?: ReactNode
}

const RAIL: Record<SliderMark['tone'], string> = { amber: 'bg-amber', red: 'bg-red' }
const TEXT: Record<SliderMark['tone'], string> = { amber: 'text-amber', red: 'text-red' }

/** Where `value` sits along the track, 0 to 1. */
function fraction(value: number, min: number, max: number, log: boolean): number {
  return log ? Math.log(value / min) / Math.log(max / min) : (value - min) / (max - min)
}

/** Places something on the track: the thumb is 10px wide, so its centre runs from 5px to 5px short of the end. */
const along = (f: number) => `calc(5px + (100% - 10px) * ${f})`

/**
 * One input: a label, the value in mono, and a hairline slider (CLAUDE.md design rules). The
 * label focuses the slider. Values come from the store, so Lab Partner moving them moves this.
 */
export function SimSlider({ label, value, min, max, step, log = false, format, unit, onChange, disabled, marks, note }: SimSliderProps) {
  const id = useId()
  const position = log ? Math.round(fraction(Math.min(max, Math.max(min, value)), min, max, true) * LOG_STEPS) : value
  const shown = (marks ?? [])
    .map((mark) => ({ ...mark, f: fraction(mark.value, min, max, log) }))
    .filter((mark) => mark.f > 0 && mark.f < 1)
    .sort((a, b) => a.f - b.f)

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-baseline justify-between gap-3 text-sm leading-5">
        <label htmlFor={id} className="text-muted">
          {label}
        </label>
        <span className="whitespace-nowrap">
          <output htmlFor={id} className="num">
            {format(value)}
          </output>
          {unit && <span className="text-muted"> {unit}</span>}
        </span>
      </div>
      <div className="relative">
        <input
          id={id}
          type="range"
          min={log ? 0 : min}
          max={log ? LOG_STEPS : max}
          step={log ? 1 : (step ?? 'any')}
          value={position}
          disabled={disabled}
          aria-valuetext={`${format(value)}${typeof unit === 'string' ? ` ${unit}` : ''}`}
          onChange={(event) => {
            const raw = Number(event.currentTarget.value)
            onChange(log ? min * Math.pow(max / min, raw / LOG_STEPS) : raw)
          }}
          className="slider relative block w-full disabled:cursor-not-allowed disabled:opacity-40"
        />
        {shown.length > 0 && (
          <div aria-hidden="true" className="pointer-events-none">
            {shown.map((mark, i) => (
              <span
                key={mark.label}
                className={`absolute top-[16px] h-0.5 ${RAIL[mark.tone]}`}
                style={{ left: along(i === 0 ? 0 : shown[i - 1].f), width: `calc((100% - 10px) * ${mark.f - (i === 0 ? 0 : shown[i - 1].f)})` }}
              />
            ))}
            <div className="relative h-4">
              {shown.map((mark) => (
                <span
                  key={mark.label}
                  className={`absolute top-0 -translate-x-1/2 text-xs leading-4 whitespace-nowrap ${TEXT[mark.tone]}`}
                  style={{ left: along(mark.f) }}
                >
                  {mark.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      {note && <p className="mt-1 text-xs leading-4 text-muted">{note}</p>}
    </div>
  )
}
